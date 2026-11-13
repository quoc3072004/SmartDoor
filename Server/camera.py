"""
Camera Monitor - Giai đoạn 2: API điều khiển + polling cho ESP32-CAM.

Mô hình hoạt động (lease):
  - App bấm Start  -> server ghi requested_mode = CAMERA_STREAM, cấp "lease" 30 giây.
  - App gửi /camera/heartbeat định kỳ (~10 giây) để gia hạn lease.
  - Lease hết hạn (app đóng đột ngột) hoặc quá MAX_SESSION_SECONDS
    -> server tự đặt requested_mode = QR_SCAN.
  - ESP32-CAM polling /esp32cam/command, nhận "chế độ mong muốn" (không phải lệnh
    dùng một lần) nên mất gói tin cũng không bị lệch trạng thái.
  - ESP32-CAM báo chế độ thực tế qua /esp32cam/ack -> /camera/status trả cả
    requested_mode lẫn actual_mode.

Không import từ main.py (tránh import vòng); các hàm xác thực nhỏ được viết lại ở đây.
"""

import hmac
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import Session

from auth import verify_token
from database import Base, SessionLocal
from models import AccessLog, User

# ======================================================
# CẤU HÌNH
# ======================================================

MODE_QR = "QR_SCAN"
MODE_STREAM = "CAMERA_STREAM"
VALID_MODES = {MODE_QR, MODE_STREAM}

LEASE_SECONDS = 30            # mỗi heartbeat gia hạn thêm tối đa từng này giây
MAX_SESSION_SECONDS = 300     # một phiên giám sát tối đa 5 phút
DEVICE_ONLINE_SECONDS = 20    # quá thời gian này không polling -> coi là offline

router = APIRouter(tags=["camera"])
_bearer = HTTPBearer(auto_error=False)


# ======================================================
# MODEL (bảng mới, create_all trong main.py sẽ tự tạo)
# ======================================================

class CameraSession(Base):
    __tablename__ = "camera_sessions"

    id = Column(Integer, primary_key=True, index=True)

    requested_mode = Column(String(20), nullable=False, default=MODE_QR)
    requested_by_user_id = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    lease_expires_at = Column(DateTime, nullable=True)

    actual_mode = Column(String(20), nullable=False, default="UNKNOWN")
    ack_at = Column(DateTime, nullable=True)
    last_error = Column(String(200), nullable=True)

    last_seen = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.now)


# ======================================================
# DEPENDENCIES
# ======================================================

def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _verify_cam_key(
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
):
    expected = os.getenv("ESP32_CAM_KEY", "")

    if not expected:
        raise HTTPException(500, "Server chưa cấu hình ESP32_CAM_KEY")

    if not x_device_key or not hmac.compare_digest(x_device_key, expected):
        raise HTTPException(401, "ESP32-CAM không hợp lệ")


def _require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(_get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Thiếu token")

    payload = verify_token(credentials.credentials)

    if not payload:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn",
        )

    user = db.query(User).filter(User.id == payload.get("user_id")).first()

    if not user:
        raise HTTPException(401, "Không tìm thấy người dùng")

    if not user.is_active:
        raise HTTPException(403, "Tài khoản đã bị khóa")

    # Muốn cho mọi user xem camera: bỏ kiểm tra role bên dưới.
    if user.role != "admin":
        raise HTTPException(403, "Chỉ quản trị viên được dùng Camera Monitor")

    return user


# ======================================================
# HÀM NỘI BỘ
# ======================================================

def _log(db: Session, result: str, message: str, user_id: int | None = None):
    db.add(
        AccessLog(
            user_id=user_id,
            method="CAMERA",
            action="CAMERA",
            result=result,
            message=message,
        )
    )
    db.commit()


def _get_session(db: Session) -> CameraSession:
    s = db.query(CameraSession).first()

    if not s:
        s = CameraSession()
        db.add(s)
        db.commit()
        db.refresh(s)

    return s


def _expire_if_needed(db: Session, s: CameraSession) -> None:
    """Tự trả về QR_SCAN khi lease hết hạn hoặc phiên quá dài."""
    if s.requested_mode != MODE_STREAM:
        return

    now = datetime.now()
    lease_over = s.lease_expires_at is None or now > s.lease_expires_at
    too_long = (
        s.started_at is not None
        and (now - s.started_at).total_seconds() > MAX_SESSION_SECONDS
    )

    if lease_over or too_long:
        s.requested_mode = MODE_QR
        s.updated_at = now
        db.commit()
        _log(
            db,
            "SUCCESS",
            "Camera tự tắt: "
            + ("quá thời gian tối đa" if too_long else "app không còn gia hạn"),
            s.requested_by_user_id,
        )


def _is_online(s: CameraSession) -> bool:
    return (
        s.last_seen is not None
        and (datetime.now() - s.last_seen).total_seconds() <= DEVICE_ONLINE_SECONDS
    )


def _status_payload(s: CameraSession) -> dict:
    now = datetime.now()
    online = _is_online(s)

    seconds_left = 0
    if s.requested_mode == MODE_STREAM and s.lease_expires_at:
        seconds_left = max(0, int((s.lease_expires_at - now).total_seconds()))

    if not online:
        state = "offline"
    elif s.requested_mode == MODE_STREAM and s.actual_mode == MODE_STREAM:
        state = "streaming"
    elif s.requested_mode == MODE_STREAM:
        state = "starting"
    elif s.actual_mode == MODE_STREAM:
        state = "stopping"
    else:
        state = "idle"

    return {
        "success": True,
        "state": state,
        "requested_mode": s.requested_mode,
        "actual_mode": s.actual_mode,
        "device_online": online,
        "seconds_left": seconds_left,
        "last_error": s.last_error,
    }


# ======================================================
# API CHO APP (admin)
# ======================================================

@router.post("/camera/start")
def camera_start(
    user: User = Depends(_require_admin),
    db: Session = Depends(_get_db),
):
    s = _get_session(db)
    _expire_if_needed(db, s)

    if not _is_online(s):
        raise HTTPException(503, "ESP32-CAM đang offline, chưa thể bật giám sát")

    now = datetime.now()

    if s.requested_mode != MODE_STREAM:
        s.requested_mode = MODE_STREAM
        s.requested_by_user_id = user.id
        s.started_at = now
        s.last_error = None
        _log(db, "SUCCESS", f"{user.username} bật Camera Monitor", user.id)

    s.lease_expires_at = min(
        now + timedelta(seconds=LEASE_SECONDS),
        s.started_at + timedelta(seconds=MAX_SESSION_SECONDS),
    )
    s.updated_at = now
    db.commit()

    return _status_payload(s)


@router.post("/camera/heartbeat")
def camera_heartbeat(
    _: User = Depends(_require_admin),
    db: Session = Depends(_get_db),
):
    """App gọi mỗi ~10 giây khi đang mở màn hình giám sát."""
    s = _get_session(db)
    _expire_if_needed(db, s)

    if s.requested_mode == MODE_STREAM:
        now = datetime.now()
        s.lease_expires_at = min(
            now + timedelta(seconds=LEASE_SECONDS),
            s.started_at + timedelta(seconds=MAX_SESSION_SECONDS),
        )
        s.updated_at = now
        db.commit()

    return _status_payload(s)


@router.post("/camera/stop")
def camera_stop(
    user: User = Depends(_require_admin),
    db: Session = Depends(_get_db),
):
    s = _get_session(db)

    if s.requested_mode == MODE_STREAM:
        s.requested_mode = MODE_QR
        s.updated_at = datetime.now()
        db.commit()
        _log(db, "SUCCESS", f"{user.username} tắt Camera Monitor", user.id)

    return _status_payload(s)


@router.get("/camera/status")
def camera_status(
    _: User = Depends(_require_admin),
    db: Session = Depends(_get_db),
):
    s = _get_session(db)
    _expire_if_needed(db, s)
    return _status_payload(s)


# ======================================================
# API CHO ESP32-CAM (X-Device-Key)
# ======================================================

class CamAckRequest(BaseModel):
    mode: str
    error: str | None = None
    free_heap: int | None = None


@router.get("/esp32cam/command")
def esp32cam_command(
    _: None = Depends(_verify_cam_key),
    db: Session = Depends(_get_db),
):
    """ESP32-CAM polling: trả về chế độ mong muốn hiện tại."""
    s = _get_session(db)
    s.last_seen = datetime.now()
    db.commit()

    _expire_if_needed(db, s)

    seconds_left = 0
    if s.requested_mode == MODE_STREAM and s.lease_expires_at:
        seconds_left = max(
            0, int((s.lease_expires_at - datetime.now()).total_seconds())
        )

    return {
        "success": True,
        "mode": s.requested_mode,
        "lease_seconds_left": seconds_left,
    }


@router.post("/esp32cam/ack")
def esp32cam_ack(
    data: CamAckRequest,
    _: None = Depends(_verify_cam_key),
    db: Session = Depends(_get_db),
):
    """ESP32-CAM báo chế độ thực tế sau khi chuyển (hoặc khi khởi động)."""
    if data.mode not in VALID_MODES:
        raise HTTPException(400, "mode không hợp lệ")

    s = _get_session(db)
    now = datetime.now()

    changed = s.actual_mode != data.mode

    s.actual_mode = data.mode
    s.ack_at = now
    s.last_seen = now

    if data.error:
        s.last_error = data.error[:200]

        # Không bật được camera -> hủy yêu cầu để app biết và không retry mãi.
        if s.requested_mode == MODE_STREAM and data.mode != MODE_STREAM:
            s.requested_mode = MODE_QR
            _log(
                db,
                "FAIL",
                f"ESP32-CAM không bật được camera: {s.last_error}",
                s.requested_by_user_id,
            )
    elif data.mode == MODE_STREAM or changed:
        s.last_error = None

    s.updated_at = now
    db.commit()

    if changed and not data.error:
        _log(db, "SUCCESS", f"ESP32-CAM đã chuyển sang {data.mode}")

    return {"success": True, "actual_mode": s.actual_mode}
