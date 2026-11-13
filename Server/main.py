from dashboard import router as dashboard_router, log_api
from camera import router as camera_router
from starlette.middleware.base import BaseHTTPMiddleware

from datetime import datetime, timedelta
import os
import sqlite3
import uuid

import qrcode
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import create_token, hash_password, verify_password, verify_token
from database import Base, DATABASE_URL, SessionLocal, engine
from face_service import embedding_to_json, extract_embedding, verify_face_with_embedding
from models import (
    AccessLog,
    DoorCommand,
    DoorStatus,
    FaceProfile,
    QRCode,
    User,
)

import hmac

ESP32_CAM_KEY = os.getenv("ESP32_CAM_KEY", "")
ESP32_DEVKIT_KEY = os.getenv("ESP32_DEVKIT_KEY", "")


def verify_cam_key(
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
):
    if not ESP32_CAM_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server chưa cấu hình ESP32_CAM_KEY",
        )

    if not x_device_key or not hmac.compare_digest(
        x_device_key,
        ESP32_CAM_KEY,
    ):
        raise HTTPException(
            status_code=401,
            detail="ESP32-CAM không hợp lệ",
        )


def verify_devkit_key(
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
):
    if not ESP32_DEVKIT_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server chưa cấu hình ESP32_DEVKIT_KEY",
        )

    if not x_device_key or not hmac.compare_digest(
        x_device_key,
        ESP32_DEVKIT_KEY,
    ):
        raise HTTPException(
            status_code=401,
            detail="ESP32 DevKit không hợp lệ",
        )

Base.metadata.create_all(bind=engine)

def ensure_schema():
    if not DATABASE_URL.startswith("sqlite"):
        return

    db_path = DATABASE_URL.replace("sqlite:///./", "").replace("sqlite:///", "")

    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)

    try:
        user_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }

        if "name" not in user_columns:
            conn.execute(
                "ALTER TABLE users "
                "ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT 'Người dùng'"
            )

        if "role" not in user_columns:
            conn.execute(
                "ALTER TABLE users "
                "ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"
            )

        if "is_active" not in user_columns:
            conn.execute(
                "ALTER TABLE users "
                "ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
            )

        if "created_at" not in user_columns:
            conn.execute(
                "ALTER TABLE users "
                "ADD COLUMN created_at DATETIME"
            )

        qr_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(qr_codes)").fetchall()
        }

        if "guest_name" not in qr_columns:
            conn.execute(
                "ALTER TABLE qr_codes "
                "ADD COLUMN guest_name VARCHAR(100) NOT NULL DEFAULT 'Khách'"
            )

        if "created_by_user_id" not in qr_columns:
            conn.execute(
                "ALTER TABLE qr_codes "
                "ADD COLUMN created_by_user_id INTEGER"
            )

        if "used_at" not in qr_columns:
            conn.execute(
                "ALTER TABLE qr_codes "
                "ADD COLUMN used_at DATETIME"
            )

        if "created_at" not in qr_columns:
            conn.execute(
                "ALTER TABLE qr_codes "
                "ADD COLUMN created_at DATETIME"
            )

        log_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(access_logs)").fetchall()
        }

        if "user_id" not in log_columns:
            conn.execute(
                "ALTER TABLE access_logs "
                "ADD COLUMN user_id INTEGER"
            )

        if "qr_id" not in log_columns:
            conn.execute(
                "ALTER TABLE access_logs "
                "ADD COLUMN qr_id INTEGER"
            )

        if "action" not in log_columns:
            conn.execute(
                "ALTER TABLE access_logs "
                "ADD COLUMN action VARCHAR(30) NOT NULL DEFAULT 'ACCESS'"
            )

        door_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(door_status)").fetchall()
        }

        if "updated_at" not in door_columns:
            conn.execute(
                "ALTER TABLE door_status "
                "ADD COLUMN updated_at DATETIME"
            )

        # Tạo bảng face_profiles nếu database cũ chưa có.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS face_profiles (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                face_image VARCHAR(500),
                face_embedding TEXT NOT NULL,
                created_at DATETIME,
                updated_at DATETIME,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_face_profiles_user_id
            ON face_profiles(user_id)
            """
        )

        # Chuyển embedding cũ trong users sang face_profiles.
        if "face_embedding" in user_columns:
            rows = conn.execute(
                """
                SELECT id, face_image, face_embedding
                FROM users
                WHERE face_embedding IS NOT NULL
                  AND TRIM(face_embedding) != ''
                """
            ).fetchall()

            for user_id, face_image, face_embedding in rows:
                exists = conn.execute(
                    """
                    SELECT id
                    FROM face_profiles
                    WHERE user_id = ?
                    LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()

                if not exists:
                    conn.execute(
                        """
                        INSERT INTO face_profiles (
                            user_id,
                            face_image,
                            face_embedding,
                            created_at,
                            updated_at
                        )
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """,
                        (
                            user_id,
                            face_image,
                            face_embedding,
                        ),
                    )

        # Tài khoản admin cũ phải có đúng role admin.
        conn.execute(
            """
            UPDATE users
            SET
                name = CASE
                    WHEN name IS NULL OR TRIM(name) = ''
                    THEN 'Quản trị viên'
                    ELSE name
                END,
                role = 'admin',
                is_active = 1
            WHERE username = 'admin'
            """
        )

        conn.commit()

    finally:
        conn.close()

ensure_schema()

app = FastAPI(title="Smart Door Server", version="2.0.0 InsightFace")

app.include_router(dashboard_router)
app.include_router(camera_router)

def create_door_command(db: Session, command: str):
    cmd = db.query(DoorCommand).first()

    if not cmd:
        cmd = DoorCommand(command=command, consumed=False)
        db.add(cmd)
    else:
        cmd.command = command
        cmd.consumed = False
        cmd.created_at = datetime.now()

    db.commit()
    db.refresh(cmd)
    return cmd


class APILoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        if not request.url.path.startswith("/dashboard"):
            log_api(
                request.method,
                request.url.path,
                response.status_code
            )

        return response

class ESP32ReportRequest(BaseModel):
    door_status: str
    relay_status: str | None = None
    message: str | None = None


class ESP32HeartbeatRequest(BaseModel):
    device: str
    ip: str | None = None
    rssi: int | None = None
    uptime: int | None = None

app.add_middleware(APILoggerMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)
UPLOAD_DIR = "uploads"
FACE_DIR = "faces"
QR_DIR = "qr_images"
for folder in [UPLOAD_DIR, FACE_DIR, QR_DIR]:
    os.makedirs(folder, exist_ok=True)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreateRequest(BaseModel):
    name: str
    username: str
    password: str


class UserUpdateRequest(BaseModel):
    name: str | None = None
    password: str | None = None
    is_active: bool | None = None


class QRGenerateRequest(BaseModel):
    guest_name: str = "Khách"
    expires_in_minutes: int = 5


class QRVerifyRequest(BaseModel):
    token: str
    device_id: str | None = None

class DoorStatusRequest(BaseModel):
    status: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_or_create_door(db: Session) -> DoorStatus:
    door = db.query(DoorStatus).first()
    if not door:
        door = DoorStatus(status="closed")
        db.add(door)
        db.commit()
        db.refresh(door)
    return door


def add_log(
    db: Session,
    method: str,
    result: str,
    message: str,
    *,
    action: str = "ACCESS",
    user_id: int | None = None,
    qr_id: int | None = None,
):
    log = AccessLog(
        user_id=user_id,
        qr_id=qr_id,
        method=method,
        action=action,
        result=result,
        message=message,
    )

    db.add(log)
    db.commit()
    db.refresh(log)

    return log


def get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu token. Bấm Authorize và nhập: Bearer <token>",
        )

    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
        )

    user_id = payload.get("user_id")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Không tìm thấy người dùng")
    return user


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ quản trị viên được thực hiện chức năng này",
        )

    return current_user


def serialize_user(
    user: User,
    db: Session,
) -> dict:
    has_face = (
        db.query(FaceProfile)
        .filter(FaceProfile.user_id == user.id)
        .first()
        is not None
    )

    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "is_active": user.is_active,
        "has_face": has_face,
        "created_at": (
            user.created_at.isoformat()
            if user.created_at
            else None
        ),
    }

@app.get("/")
def home():
    return {"success": True, "message": "Smart Door Server is running"}


@app.post("/init")
def init_data(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == "admin").first()

    if not user:
        user = User(
            name="Quản trị viên",
            username="admin",
            password=hash_password("123456"),
            role="admin",
            is_active=True,
        )
        db.add(user)
    else:
        user.name = "Quản trị viên"
        user.role = "admin"
        user.is_active = True

        if user.password == "123456":
            user.password = hash_password("123456")

    get_or_create_door(db)
    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": "Khởi tạo dữ liệu thành công",
        "user": {
            "id": user.id,
            "name": user.name,
            "username": user.username,
            "role": user.role,
            "is_active": user.is_active,
        },
    }

@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.username == data.username.strip())
        .first()
    )

    if not user or not verify_password(data.password, user.password):
        add_log(
            db,
            "AUTH",
            "FAIL",
            f"Đăng nhập thất bại: {data.username}",
            action="LOGIN",
        )

        return {
            "success": False,
            "message": "Sai tài khoản hoặc mật khẩu",
        }

    if not user.is_active:
        add_log(
            db,
            "AUTH",
            "FAIL",
            f"Tài khoản bị khóa: {user.username}",
            action="LOGIN",
            user_id=user.id,
        )

        return {
            "success": False,
            "message": "Tài khoản đã bị khóa",
        }

    token = create_token(
        {
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
        }
    )

    has_face = (
        db.query(FaceProfile)
        .filter(FaceProfile.user_id == user.id)
        .first()
        is not None
    )

    add_log(
        db,
        "AUTH",
        "SUCCESS",
        f"{user.username}: Đăng nhập thành công",
        action="LOGIN",
        user_id=user.id,
    )

    return {
        "success": True,
        "message": "Đăng nhập thành công",
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "username": user.username,
            "role": user.role,
            "is_active": user.is_active,
            "has_face": has_face,
        },
    }


@app.get("/me")
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    has_face = (
        db.query(FaceProfile)
        .filter(FaceProfile.user_id == current_user.id)
        .first()
        is not None
    )

    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "username": current_user.username,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "has_face": has_face,
        },
    }


@app.post("/users/{user_id}/face")
async def register_user_face(
    user_id: int,
    image: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy người dùng",
        )

    content = await image.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Ảnh rỗng",
        )

    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Ảnh vượt quá 2 MB",
        )

    if image.content_type not in {
        "image/jpeg",
        "image/jpg",
        "image/png",
    }:
        raise HTTPException(
            status_code=415,
            detail="Chỉ hỗ trợ ảnh JPEG hoặc PNG",
        )

    filename = f"user_{user.id}_{uuid.uuid4()}.jpg"
    image_path = os.path.join(FACE_DIR, filename)

    with open(image_path, "wb") as file:
        file.write(content)

    try:
        embedding = extract_embedding(image_path)
        embedding_json = embedding_to_json(embedding)
    except Exception as exc:
        if os.path.exists(image_path):
            os.remove(image_path)

        add_log(
            db,
            "FACE_REGISTER",
            "FAIL",
            f"{user.username}: {exc}",
            action="REGISTER_FACE",
            user_id=user.id,
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    face_profile = (
        db.query(FaceProfile)
        .filter(FaceProfile.user_id == user.id)
        .first()
    )

    if face_profile:
        old_image = face_profile.face_image

        face_profile.face_image = image_path
        face_profile.face_embedding = embedding_json
        face_profile.updated_at = datetime.now()

        if (
            old_image
            and old_image != image_path
            and os.path.exists(old_image)
        ):
            try:
                os.remove(old_image)
            except OSError:
                pass
    else:
        face_profile = FaceProfile(
            user_id=user.id,
            face_image=image_path,
            face_embedding=embedding_json,
        )
        db.add(face_profile)

    db.commit()

    add_log(
        db,
        "FACE_REGISTER",
        "SUCCESS",
        f"{admin.username}: Đăng ký khuôn mặt cho {user.username}",
        action="REGISTER_FACE",
        user_id=user.id,
    )

    return {
        "success": True,
        "message": f"Đăng ký khuôn mặt cho {user.name} thành công",
        "user": serialize_user(user, db),
    }

@app.delete("/users/{user_id}/face")
def delete_user_face(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(FaceProfile)
        .filter(FaceProfile.user_id == user_id)
        .first()
    )

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Người dùng chưa đăng ký khuôn mặt",
        )

    image_path = profile.face_image

    db.delete(profile)
    db.commit()

    if image_path and os.path.exists(image_path):
        try:
            os.remove(image_path)
        except OSError:
            pass

    add_log(
        db,
        "FACE_REGISTER",
        "SUCCESS",
        f"{admin.username}: Xóa khuôn mặt user ID {user_id}",
        action="DELETE_FACE",
        user_id=user_id,
    )

    return {
        "success": True,
        "message": "Xóa khuôn mặt thành công",
    }

@app.post("/face/open-door")
async def face_open_door(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await image.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Ảnh rỗng",
        )

    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Ảnh vượt quá 2 MB",
        )

    filename = f"verify_{uuid.uuid4()}.jpg"
    image_path = os.path.join(UPLOAD_DIR, filename)

    with open(image_path, "wb") as file:
        file.write(content)

    profiles = (
        db.query(FaceProfile)
        .join(User, FaceProfile.user_id == User.id)
        .filter(User.is_active.is_(True))
        .all()
    )

    if not profiles:
        if os.path.exists(image_path):
            os.remove(image_path)

        return {
            "success": False,
            "message": "Hệ thống chưa có khuôn mặt đăng ký",
            "command": "DENY",
        }

    best_profile = None
    best_distance = None

    try:
        for profile in profiles:
            is_match, distance = verify_face_with_embedding(
                image_path,
                profile.face_embedding,
            )

            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_profile = profile

            if is_match:
                matched_user = profile.user

                create_door_command(db, "OPEN_DOOR")

                add_log(
                    db,
                    "FACE",
                    "SUCCESS",
                    (
                        f"Nhận diện {matched_user.name}, "
                        f"distance={distance:.4f}"
                    ),
                    action="UNLOCK",
                    user_id=matched_user.id,
                )

                return {
                    "success": True,
                    "message": f"Xin chào {matched_user.name}",
                    "distance": distance,
                    "command": "OPEN_DOOR",
                    "user": {
                        "id": matched_user.id,
                        "name": matched_user.name,
                        "username": matched_user.username,
                    },
                }

        add_log(
            db,
            "FACE",
            "FAIL",
            (
                "Không nhận diện được khuôn mặt, "
                f"best_distance={best_distance:.4f}"
                if best_distance is not None
                else "Không nhận diện được khuôn mặt"
            ),
            action="UNLOCK",
            user_id=current_user.id,
        )

        return {
            "success": False,
            "message": "Khuôn mặt không thuộc danh sách người dùng",
            "distance": best_distance,
            "command": "DENY",
        }

    except Exception as exc:
        add_log(
            db,
            "FACE",
            "FAIL",
            str(exc),
            action="UNLOCK",
            user_id=current_user.id,
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    finally:
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except OSError:
                pass


@app.post("/qr/generate")
def generate_qr(
    data: QRGenerateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    guest_name = data.guest_name.strip() or "Khách"

    if data.expires_in_minutes < 1:
        raise HTTPException(
            status_code=400,
            detail="Thời hạn QR phải ít nhất 1 phút",
        )

    if data.expires_in_minutes > 1440:
        raise HTTPException(
            status_code=400,
            detail="Thời hạn QR tối đa là 24 giờ",
        )

    token = str(uuid.uuid4())
    expired_at = datetime.now() + timedelta(
        minutes=data.expires_in_minutes
    )

    qr = QRCode(
        token=token,
        guest_name=guest_name,
        created_by_user_id=current_user.id,
        used=False,
        expired_at=expired_at,
    )

    db.add(qr)
    db.commit()
    db.refresh(qr)

    qr_path = os.path.join(QR_DIR, f"{token}.png")

    qr_img = qrcode.make(token)
    qr_img.save(qr_path)

    add_log(
        db,
        "QR",
        "SUCCESS",
        (
            f"{current_user.username}: Tạo QR cho {guest_name}, "
            f"{data.expires_in_minutes} phút"
        ),
        action="CREATE_QR",
        user_id=current_user.id,
        qr_id=qr.id,
    )

    base_url = get_base_url(request)

    return {
        "success": True,
        "message": "Tạo mã QR thành công",
        "qr": {
            "id": qr.id,
            "token": qr.token,
            "guest_name": qr.guest_name,
            "used": qr.used,
            "qr_image_url": f"{base_url}/qr/image/{token}",
            "expired_at": qr.expired_at.isoformat(),
            "created_at": (
                qr.created_at.isoformat()
                if qr.created_at
                else None
            ),
        },
    }


@app.get("/qr/image/{token}")
def get_qr_image(token: str):
    qr_path = os.path.join(QR_DIR, f"{token}.png")
    if not os.path.exists(qr_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh QR")
    return FileResponse(qr_path, media_type="image/png")


@app.post("/qr/verify")
def verify_qr(
    data: QRVerifyRequest,
    _: None = Depends(verify_cam_key),
    db: Session = Depends(get_db),
):
    token = data.token.strip()

    qr = (
        db.query(QRCode)
        .filter(QRCode.token == token)
        .first()
    )

    if not qr:
        add_log(
            db,
            "QR",
            "FAIL",
            "QR không tồn tại",
            action="UNLOCK",
        )

        return {
            "success": False,
            "message": "QR không hợp lệ",
            "command": "DENY",
        }

    if qr.used:
        add_log(
            db,
            "QR",
            "FAIL",
            f"QR của {qr.guest_name} đã được sử dụng",
            action="UNLOCK",
            qr_id=qr.id,
        )

        return {
            "success": False,
            "message": "QR đã được sử dụng",
            "command": "DENY",
        }

    if datetime.now() > qr.expired_at:
        qr_path = os.path.join(
            QR_DIR,
            f"{qr.token}.png",
        )

        qr_id = qr.id

        db.delete(qr)
        db.commit()

        if os.path.exists(qr_path):
            try:
                os.remove(qr_path)
            except OSError:
                pass

        add_log(
            db,
            "QR",
            "FAIL",
            "QR đã hết hạn và được xóa",
            action="UNLOCK",
            qr_id=None,
        )

        return {
            "success": False,
            "message": "QR đã hết hạn",
            "command": "DENY",
        }

    qr.used = True
    qr.used_at = datetime.now()

    db.commit()

    create_door_command(db, "OPEN_DOOR")

    add_log(
        db,
        "QR",
        "SUCCESS",
        f"Mở cửa cho khách: {qr.guest_name}",
        action="UNLOCK",
        qr_id=qr.id,
    )

    return {
        "success": True,
        "message": f"QR hợp lệ, xin chào {qr.guest_name}",
        "command": "OPEN_DOOR",
        "guest_name": qr.guest_name,
    }

@app.delete("/qr/expired")
def delete_expired_qr_codes(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now()

    expired_qrs = (
        db.query(QRCode)
        .filter(
            QRCode.used.is_(False),
            QRCode.expired_at < now,
        )
        .all()
    )

    deleted_count = 0

    for qr in expired_qrs:
        qr_path = os.path.join(
            QR_DIR,
            f"{qr.token}.png",
        )

        if os.path.exists(qr_path):
            try:
                os.remove(qr_path)
            except OSError:
                pass

        db.delete(qr)
        deleted_count += 1

    db.commit()

    return {
        "success": True,
        "message": "Đã dọn QR hết hạn",
        "deleted_count": deleted_count,
    }


@app.post("/door/status")
def update_door_status(data: DoorStatusRequest, db: Session = Depends(get_db)):
    if data.status not in ["open", "closed"]:
        return {"success": False, "message": "Trạng thái không hợp lệ"}
    door = get_or_create_door(db)
    door.status = data.status
    db.commit()
    return {"success": True, "message": "Cập nhật trạng thái cửa thành công", "status": data.status}


@app.get("/door/status")
def get_door_status(db: Session = Depends(get_db)):
    door = get_or_create_door(db)
    return {"success": True, "status": door.status}


@app.get("/history")
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(AccessLog)
        .order_by(AccessLog.id.desc())
        .limit(100)
        .all()
    )

    return {
        "success": True,
        "data": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "user_name": (
                    log.user.name
                    if log.user
                    else None
                ),
                "qr_id": log.qr_id,
                "method": log.method,
                "action": log.action,
                "result": log.result,
                "message": log.message,
                "created_at": (
                    log.created_at.isoformat()
                    if log.created_at
                    else None
                ),
            }
            for log in logs
        ],
    }


@app.get("/esp32/command")
def esp32_get_command(
    _: None = Depends(verify_devkit_key),
    db: Session = Depends(get_db),
):
    cmd = db.query(DoorCommand).first()

    if not cmd or cmd.consumed or cmd.command == "NONE":
        return {
            "success": True,
            "command": "NONE",
        }

    command = cmd.command

    cmd.command = "NONE"
    cmd.consumed = True

    db.commit()

    return {
        "success": True,
        "command": command,
    }


@app.post("/esp32/close-door")
def esp32_close_door(db: Session = Depends(get_db)):
    door = get_or_create_door(db)
    door.status = "closed"
    db.commit()
    return {"success": True, "message": "ESP32 đã đóng cửa", "status": "closed"}

@app.post("/esp32/report")
def esp32_report(
    data: ESP32ReportRequest,
    _: None = Depends(verify_devkit_key),
    db: Session = Depends(get_db),
):
    if data.door_status not in ["open", "closed"]:
        raise HTTPException(
            status_code=400,
            detail="door_status không hợp lệ",
        )

    door = get_or_create_door(db)
    door.status = data.door_status
    door.updated_at = datetime.now()

    db.commit()

    add_log(
        db,
        "ESP32",
        "SUCCESS",
        (
            f"Door={data.door_status}, "
            f"Relay={data.relay_status}, "
            f"{data.message or ''}"
        ),
        action="DOOR_STATUS",
    )

    return {
        "success": True,
        "message": "Server đã nhận trạng thái ESP32",
        "door_status": data.door_status,
    }

@app.post("/esp32/heartbeat")
def esp32_heartbeat(
    data: ESP32HeartbeatRequest,
    _: None = Depends(verify_devkit_key),
    db: Session = Depends(get_db),
):
    return {
        "success": True,
        "message": "ESP32 online",
        "server_time": datetime.now().isoformat(),
    }

@app.get("/esp32/config")
def esp32_config(
    _: None = Depends(verify_devkit_key),
):
    return {
        "success": True,
        "relay_open_time_ms": 5000,
        "command_poll_ms": 1000,
        "buzzer_error_ms": 3000,
        "heartbeat_interval_ms": 30000,
    }

@app.get("/users")
def get_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .order_by(User.id.asc())
        .all()
    )

    return {
        "success": True,
        "data": [
            serialize_user(user, db)
            for user in users
        ],
    }

@app.post("/users")
def create_user(
    data: UserCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = data.name.strip()
    username = data.username.strip()
    password = data.password.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Tên người dùng không được để trống",
        )

    if not username:
        raise HTTPException(
            status_code=400,
            detail="Tài khoản không được để trống",
        )

    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu phải có ít nhất 6 ký tự",
        )

    existed = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if existed:
        raise HTTPException(
            status_code=409,
            detail="Tài khoản đã tồn tại",
        )

    user = User(
        name=name,
        username=username,
        password=hash_password(password),
        role="user",
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    add_log(
        db,
        "USER",
        "SUCCESS",
        f"{admin.username}: Thêm người dùng {username}",
        action="CREATE_USER",
        user_id=admin.id,
    )

    return {
        "success": True,
        "message": "Thêm người dùng thành công",
        "user": serialize_user(user, db),
    }

@app.patch("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy người dùng",
        )

    if data.name is not None:
        name = data.name.strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail="Tên người dùng không được để trống",
            )

        user.name = name

    if data.password is not None:
        password = data.password.strip()

        if len(password) < 6:
            raise HTTPException(
                status_code=400,
                detail="Mật khẩu phải có ít nhất 6 ký tự",
            )

        user.password = hash_password(password)

    if data.is_active is not None:
        if user.id == admin.id and not data.is_active:
            raise HTTPException(
                status_code=400,
                detail="Không thể tự khóa tài khoản đang đăng nhập",
            )

        user.is_active = data.is_active

    db.commit()
    db.refresh(user)

    add_log(
        db,
        "USER",
        "SUCCESS",
        f"{admin.username}: Cập nhật người dùng {user.username}",
        action="UPDATE_USER",
        user_id=admin.id,
    )

    return {
        "success": True,
        "message": "Cập nhật người dùng thành công",
        "user": serialize_user(user, db),
    }

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Không thể tự xóa tài khoản đang đăng nhập",
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy người dùng",
        )

    username = user.username

    db.delete(user)
    db.commit()

    add_log(
        db,
        "USER",
        "SUCCESS",
        f"{admin.username}: Xóa người dùng {username}",
        action="DELETE_USER",
        user_id=admin.id,
    )

    return {
        "success": True,
        "message": "Xóa người dùng thành công",
    }