from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register models before create_all)
from .database import Base, SessionLocal, engine
from .routers import poems, templates
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
