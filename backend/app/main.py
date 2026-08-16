import mimetypes
import secrets
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

# 确保前端资源以正确 MIME 返回（Windows 上 Python 可能把 .js 误判为 text/plain）
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/manifest+json", ".webmanifest")

from . import models  # noqa: F401  (register models before create_all)
from .auth import auth_middleware, hash_password
from .config import ADMIN_PASSWORD, ADMIN_USERNAME, UPLOAD_DIR
from .database import Base, SessionLocal, engine
from .routers import agent, auth, chat, imports, poems, references, templates
from .reference_seed import store_reference_poems
from .seed_data import seed_templates

Base.metadata.create_all(bind=engine)

# 轻量迁移：为已有库补缺失列（保留数据）
_insp = inspect(engine)
if "poems" in _insp.get_table_names():
    _cols = {c["name"] for c in _insp.get_columns("poems")}
    with engine.begin() as _conn:
        if "agent_spirit_score" not in _cols:
            _conn.execute(text("ALTER TABLE poems ADD COLUMN agent_spirit_score FLOAT"))
        if "agent_form_score" not in _cols:
            _conn.execute(text("ALTER TABLE poems ADD COLUMN agent_form_score FLOAT"))

# Seed preset templates + ensure a single user exists
with SessionLocal() as db:
    seed_templates(db)
    store_reference_poems(db)
    user = db.query(models.User).filter(models.User.username == ADMIN_USERNAME).first()
    if user is None:
        password = ADMIN_PASSWORD or secrets.token_urlsafe(12)
        db.add(models.User(username=ADMIN_USERNAME, password_hash=hash_password(password)))
        db.commit()
        if not ADMIN_PASSWORD:
            print(
                f"[auth] 已创建默认用户「{ADMIN_USERNAME}」，临时密码：{password}\n"
                "       请通过 ADMIN_PASSWORD 环境变量设置正式密码。"
            )
    elif ADMIN_PASSWORD:
        # 以 .env 的 ADMIN_PASSWORD 为唯一真相来源，启动时同步密码
        user.password_hash = hash_password(ADMIN_PASSWORD)
        db.commit()

app = FastAPI(title="Poem Manager API")


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # single-user + token auth; tighten later if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(auth_middleware)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(poems.router, prefix="/api/poems", tags=["poems"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(imports.router, prefix="/api/import", tags=["import"])
app.include_router(references.router, prefix="/api/references", tags=["references"])

# Serve uploaded poem images (protected by auth middleware)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

# Serve the built frontend in production. (In dev, run `npm run dev` instead.)
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
