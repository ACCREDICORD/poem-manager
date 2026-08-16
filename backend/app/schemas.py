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
    user_score: float | None = None
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
    user_score: float | None = None
    source: str | None = None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    url: str
    mime: str = ""
    size: int = 0
    sort_order: int = 0


class PoemOut(PoemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_score: float | None = None
    agent_spirit_score: float | None = None
    agent_form_score: float | None = None
    comprehensive_score: float | None = None
    agent_scores: list[dict] = []
    agent_report: dict | None = None
    images: list[ImageOut] = []
    created_at: datetime
    updated_at: datetime


class ReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: str
    kind: str
    content: str
    spirit_analysis: str
    form_analysis: str
    score: float
    article: str
    created_at: datetime


class TemplateBase(BaseModel):
    name: str
    kind: str = "ci"
    aliases: list[str] = []
    total_chars: int = 0
    line_count: int = 0
    pattern: list[str] = []
    rhyme: str = ""
    example: str = ""
    editable: bool = True


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    aliases: list[str] | None = None
    total_chars: int | None = None
    line_count: int | None = None
    pattern: list[str] | None = None
    rhyme: str | None = None
    example: str | None = None
    editable: bool | None = None


class TemplateOut(TemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
