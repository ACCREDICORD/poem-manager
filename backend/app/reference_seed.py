"""参考基准：先存作品文本，再初始化（逐首评审生成参考文章）。"""

from sqlalchemy.orm import Session

from . import models
from .reference_data import REFERENCE_POEMS
from .scoring import score_poem


def store_reference_poems(db: Session) -> int:
    """仅插入 16 首参考作品（无分析），供用户检查编辑。返回新增数量。"""
    existing = {r.title for r in db.query(models.ReferenceArticle).all()}
    added = 0
    for pd in REFERENCE_POEMS:
        if pd["title"] in existing:
            continue
        db.add(
            models.ReferenceArticle(
                title=pd["title"],
                author=pd["author"],
                kind=pd["kind"],
                content=pd["content"],
                spirit_analysis="",
                form_analysis="",
                score=5.0,
                article="",
            )
        )
        added += 1
    db.commit()
    return added


async def evaluate_reference(r: models.ReferenceArticle, model: str, reasoning: str) -> None:
    results, report = await score_poem(
        title=r.title,
        content=r.content,
        category=r.title,
        template=None,
        references=[],
        model=model,
        reasoning=reasoning,
    )
    r.spirit_analysis = "\n".join(
        f"{x['score']}分：{x['reason']}" for x in results if x["dimension"] == "神"
    )
    r.form_analysis = "\n".join(
        f"{x['score']}分：{x['reason']}" for x in results if x["dimension"] == "形"
    )
    r.article = report.get("article", "")
    r.score = 5.0


async def seed_reference_articles(db: Session, model: str, reasoning: str) -> int:
    """对尚无分析的参考作品逐首评审，填充分析。返回处理数量。"""
    rows = (
        db.query(models.ReferenceArticle)
        .filter(models.ReferenceArticle.article == "")
        .all()
    )
    for r in rows:
        await evaluate_reference(r, model, reasoning)
        db.commit()
    return len(rows)
