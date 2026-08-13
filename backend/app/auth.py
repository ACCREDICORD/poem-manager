"""单用户鉴权：PBKDF2 密码散列 + 内存会话 token。"""

import hashlib
import hmac
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse

# token -> user_id（单用户；服务重启后需重新登录）
_sessions: dict[str, int] = {}


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
    _sessions[token] = user_id
    return token


def drop_session(token: str) -> None:
    _sessions.pop(token, None)


_PUBLIC_PATHS = {"/api/auth/login", "/api/health"}


async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if (path.startswith("/api") or path.startswith("/media")) and path not in _PUBLIC_PATHS:
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        if token not in _sessions:
            return JSONResponse(status_code=401, content={"detail": "未登录或登录已过期"})
    return await call_next(request)
