from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (register models before create_all)
from .config import UPLOAD_DIR
from .database import Base, SessionLocal, engine
from .routers import agent, chat, imports, poems, templates
from .seed_data import seed_templates

Base.metadata.create_all(bind=engine)

# Seed preset templates (idempotent — only inserts missing ones)
with SessionLocal() as db:
    seed_templates(db)

app = FastAPI(title="Poem Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tightened during M6 (single-user auth + fixed origin)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(poems.router, prefix="/api/poems", tags=["poems"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(imports.router, prefix="/api/import", tags=["import"])

# Serve uploaded poem images
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")


@app.get("/api/health")
def health():
    return {"status": "ok"}
