"""单用户鉴权：PBKDF2 密码散列 + 持久化会话 token（存 SQLite，后端重启后仍有效）。"""

import hashlib
import hmac
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse

from .database import SessionLocal
from .models import AuthSession


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return hmac.compare_digest(dk.hex(), h)


def create_session(user_id: int) -> str:
    token = secrets.token_hex(32)
    db = SessionLocal()
    try:
        db.add(AuthSession(token=token, user_id=user_id))
        db.commit()
    finally:
        db.close()
    return token


def drop_session(token: str) -> None:
    db = SessionLocal()
    try:
        row = db.get(AuthSession, token)
        if row is not None:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def session_valid(token: str) -> bool:
    if not token:
        return False
    db = SessionLocal()
    try:
        return db.get(AuthSession, token) is not None
    finally:
        db.close()


_PUBLIC_PATHS = {"/api/auth/login", "/api/health"}


def _get_token(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:]
    # <img> 等标签无法携带 Authorization 头；/media 允许通过 ?token= 传会话 token，
    # 但仍要求 token 有效，避免把上传图片直接暴露为公开资源。
    if request.url.path.startswith("/media"):
        return request.query_params.get("token", "")
    return ""


async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if (path.startswith("/api") or path.startswith("/media")) and path not in _PUBLIC_PATHS:
        token = _get_token(request)
        if not session_valid(token):
            return JSONResponse(status_code=401, content={"detail": "未登录或登录已过期"})
    return await call_next(request)
