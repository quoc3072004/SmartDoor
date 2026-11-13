import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta
import os

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv(
    "JWT_SECRET",
    "CHANGE_THIS_SECRET_KEY",
)
ACCESS_TOKEN_EXPIRE_DAYS = 7


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = "smartdoor_salt"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def verify_password(plain_password: str, stored_password: str) -> bool:
    # Hỗ trợ database cũ đang lưu password dạng text: 123456
    if stored_password == plain_password:
        return True
    return hmac.compare_digest(hash_password(plain_password), stored_password)


def create_token(data: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = data.copy()
    payload["exp"] = int((datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)).timestamp())

    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def verify_token(token: str):
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_signature = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_signature = _b64url_decode(signature_b64)

        if not hmac.compare_digest(expected_signature, actual_signature):
            return None

        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(datetime.utcnow().timestamp()) > int(payload.get("exp", 0)):
            return None
        return payload
    except Exception:
        return None
