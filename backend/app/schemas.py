from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class PoemBase(BaseModel):
    title: str = ""
    content: str = ""
    category: str = ""
    tags: list[str] = []
    created_date: date | None = None
    is_favorite: bool = False
    annotations: list[dict] = []
    user_score: int | None = None
    source: str = "manual"


class PoemCreate(PoemBase):
    pass


class PoemUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    created_date: date | None = None
    is_favorite: bool | None = None
    annotations: list[dict] | None = None
    user_score: int | None = None
    source: str | None = None


class PoemOut(PoemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_score: int | None = None
    comprehensive_score: int | None = None
    agent_scores: list[dict] = []
    agent_report: dict | None = None
    created_at: datetime
    updated_at: datetime
