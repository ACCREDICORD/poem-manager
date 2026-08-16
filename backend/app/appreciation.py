"""赏析生成：按鉴赏辞典风格为诗词撰写赏析文章（与评分解耦，独立存储）。"""

from . import models
from .appreciation_seed import APPRECIATION_STYLE
from .config import MODELS
from .deepseek import chat_complete


def _pick_examples(db, kind: str) -> str:
    """选 2 篇同体裁范文注入提示词；不足则任意补足。"""
    refs = db.query(models.AppreciationRef).all()
    if not refs:
        return "（暂无范文）"
    same_kind = [r for r in refs if r.kind == kind]
    picks = (same_kind or refs)[:2]
    return "\n\n".join(
        f"【范文{i + 1}】《{r.title}》（{r.author}）\n{r.content}" for i, r in enumerate(picks)
    )


def build_appreciation_prompt(
    *, title: str, content: str, category: str, kind: str, examples: str
) -> str:
    return (
        f"{APPRECIATION_STYLE}\n\n"
        f"【参考范文】（学习其笔法与气息，不要抄袭内容）\n{examples}\n\n"
        f"【待赏析作品】《{title or '无题'}》（{category or '未分类'}）\n{content}\n\n"
        f"请为上面的作品撰写一篇赏析文章。"
    )


async def generate_appreciation(
    *, title: str, content: str, category: str, kind: str, db, model: str | None = None, reasoning: str | None = None
) -> str:
    """生成赏析文章，返回纯文本。"""
    model = model or MODELS["pro"]
    examples = _pick_examples(db, kind)
    prompt = build_appreciation_prompt(
        title=title, content=content, category=category, kind=kind, examples=examples
    )
    resp = await chat_complete([{"role": "user", "content": prompt}], model=model, reasoning=reasoning)
    return (resp["choices"][0]["message"]["content"] or "").strip()
