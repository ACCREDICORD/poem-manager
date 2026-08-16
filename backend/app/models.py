from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp — avoids SQLite timezone round-trip issues."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Poem(Base):
    __tablename__ = "poems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(50), default="", index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    created_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    annotations: Mapped[list] = mapped_column(JSON, default=list)

    # Scoring (non-mandatory, 5 分制)
    user_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    agent_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 综合分（神+形）
    agent_spirit_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 神分
    agent_form_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 形分
    comprehensive_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    agent_scores: Mapped[list] = mapped_column(JSON, default=list)
    agent_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    source: Mapped[str] = mapped_column(String(20), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    images: Mapped[list["Image"]] = relationship(
        back_populates="poem", cascade="all, delete-orphan", lazy="selectin"
    )


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="ci")  # ci 词 / shi 诗
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    total_chars: Mapped[int] = mapped_column(Integer, default=0)
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    pattern: Mapped[list] = mapped_column(JSON, default=list)  # 每句「字数+平仄」
    rhyme: Mapped[str] = mapped_column(Text, default="")
    example: Mapped[str] = mapped_column(Text, default="")
    editable: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poem_id: Mapped[int] = mapped_column(ForeignKey("poems.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255), default="")
    stored_path: Mapped[str] = mapped_column(String(500), default="")
    mime: Mapped[str] = mapped_column(String(100), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    poem: Mapped["Poem"] = relationship(back_populates="images")

    @property
    def url(self) -> str:
        return f"/media/{self.stored_path}" if self.stored_path else ""


class ReferenceArticle(Base):
    __tablename__ = "reference_articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    author: Mapped[str] = mapped_column(String(50), default="")
    kind: Mapped[str] = mapped_column(String(10), default="ci")  # ci 词 / shi 诗
    content: Mapped[str] = mapped_column(Text, default="")
    spirit_analysis: Mapped[str] = mapped_column(Text, default="")  # 神维度分析
    form_analysis: Mapped[str] = mapped_column(Text, default="")  # 形维度分析
    score: Mapped[float] = mapped_column(Float, default=5.0)
    article: Mapped[str] = mapped_column(Text, default="")  # 综合分析文章
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(String(20), default="chat")  # chat / agent
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuthSession(Base):
    """持久化登录会话：token 存 SQLite，后端重启后仍有效。"""

    __tablename__ = "auth_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
