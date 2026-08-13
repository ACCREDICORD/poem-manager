from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register models before create_all)
from .database import Base, engine
from .routers import poems

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Poem Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tightened during M6 (single-user auth + fixed origin)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(poems.router, prefix="/api/poems", tags=["poems"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
