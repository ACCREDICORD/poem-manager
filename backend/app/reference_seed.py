"""参考基准初始化：对 16 首参考作品跑完整评审，生成参考文章。"""

from sqlalchemy.orm import Session

from . import models
from .reference_data import REFERENCE_POEMS
from .scoring import score_poem


async def build_reference_article(poem_data: dict, model: str, reasoning: str) -> dict:
    """对一首参考作品跑完整评审，返回 reference_articles 的行数据。"""
    results, report = await score_poem(
        title=poem_data["title"],
        content=poem_data["content"],
        category=poem_data["title"],
        template=None,
        references=[],  # 首批无参考（自身即基准）
        model=model,
        reasoning=reasoning,
    )
    spirit = "\n".join(
        f"{r['score']}分：{r['reason']}" for r in results if r["dimension"] == "神"
    )
    form = "\n".join(
        f"{r['score']}分：{r['reason']}" for r in results if r["dimension"] == "形"
    )
    return {
        "title": poem_data["title"],
        "author": poem_data["author"],
        "kind": poem_data["kind"],
        "content": poem_data["content"],
        "spirit_analysis": spirit,
        "form_analysis": form,
        "score": 5.0,
        "article": report.get("article", ""),
    }


async def seed_reference_articles(db: Session, model: str, reasoning: str) -> int:
    """逐首评审参考作品并入库（幂等，跳过已存在的）。返回新增数量。"""
    existing = {r.title for r in db.query(models.ReferenceArticle).all()}
    added = 0
    for pd in REFERENCE_POEMS:
        if pd["title"] in existing:
            continue
        row = await build_reference_article(pd, model, reasoning)
        db.add(models.ReferenceArticle(**row))
        db.commit()
        added += 1
    return added
