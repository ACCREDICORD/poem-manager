import secrets
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (register models before create_all)
from .auth import auth_middleware, hash_password
from .config import ADMIN_PASSWORD, ADMIN_USERNAME, UPLOAD_DIR
from .database import Base, SessionLocal, engine
from .routers import agent, auth, chat, imports, poems, templates
from .seed_data import seed_templates

Base.metadata.create_all(bind=engine)

# Seed preset templates + ensure a single user exists
with SessionLocal() as db:
    seed_templates(db)
    if db.query(models.User).count() == 0:
        password = ADMIN_PASSWORD or secrets.token_urlsafe(12)
        db.add(models.User(username=ADMIN_USERNAME, password_hash=hash_password(password)))
        db.commit()
        if not ADMIN_PASSWORD:
            print(
                f"[auth] 已创建默认用户「{ADMIN_USERNAME}」，临时密码：{password}\n"
                "       请通过 ADMIN_PASSWORD 环境变量设置正式密码。"
            )

app = FastAPI(title="Poem Manager API")

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

# Serve uploaded poem images (protected by auth middleware)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

# Serve the built frontend in production. (In dev, run `npm run dev` instead.)
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


@app.get("/api/health")
def health():
    return {"status": "ok"}
