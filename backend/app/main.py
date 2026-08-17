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
from .appreciation_seed import store_appreciation_refs
from .auth import auth_middleware, hash_password
from .config import ADMIN_PASSWORD, ADMIN_USERNAME, UPLOAD_DIR
from .database import Base, SessionLocal, engine
from .routers import agent, auth, chat, imports, poems, references, rhyme, templates
from .reference_seed import store_reference_poems
from .rhyme_seed import store_famous_tunes, store_rhyme_dict, store_tunes
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
        if "appreciation" not in _cols:
            _conn.execute(text("ALTER TABLE poems ADD COLUMN appreciation TEXT"))
        # 归位历史行的 NULL（SQLite 加列不应用 Python 端 default）
        _conn.execute(text("UPDATE poems SET appreciation = '' WHERE appreciation IS NULL"))

if "templates" in _insp.get_table_names():
    _tcols = {c["name"] for c in _insp.get_columns("templates")}
    with engine.begin() as _conn:
        if "rhyme_flags" not in _tcols:
            _conn.execute(text("ALTER TABLE templates ADD COLUMN rhyme_flags TEXT"))
        _conn.execute(text("UPDATE templates SET rhyme_flags = '[]' WHERE rhyme_flags IS NULL"))

# Seed preset templates + ensure a single user exists
with SessionLocal() as db:
    seed_templates(db)
    store_reference_poems(db)
    store_appreciation_refs(db)
    added_rhyme = store_rhyme_dict(db)
    added_tunes = store_tunes(db)
    synced_famous = store_famous_tunes(db)
    if added_rhyme or added_tunes or synced_famous:
        print(f"[seed] 韵书 {added_rhyme} 条、词谱 {added_tunes} 个、知名词牌同步 {synced_famous} 条已入库")
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


@app.middleware("http")
async def no_cache_entry_files(request, call_next):
    """index.html / sw.js 禁止缓存：避免旧入口引用已删除的哈希资源导致白屏。"""
    response = await call_next(request)
    if request.url.path in ("/", "/sw.js"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(poems.router, prefix="/api/poems", tags=["poems"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(imports.router, prefix="/api/import", tags=["import"])
app.include_router(references.router, prefix="/api/references", tags=["references"])
app.include_router(rhyme.router, prefix="/api/rhyme", tags=["rhyme"])

# Serve uploaded poem images (protected by auth middleware)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

# Serve the built frontend in production. (In dev, run `npm run dev` instead.)
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
