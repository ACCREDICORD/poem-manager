"""agents 评分：5 个评委独立打分（不同维度）+ 1 个裁判综合报告。"""

import asyncio
import json
import re

from . import models
from .deepseek import chat_complete

DIMENSIONS = ["意境", "格律音韵", "炼字语言", "情感立意", "章法结构"]

SCORE_ANCHOR = "评分锚点（百分制）：85-100 上乘；70-84 佳作；60-69 尚可；60 以下一般。"


def extract_json(text: str) -> dict:
    """从模型输出中提取 JSON 对象（容忍 markdown 代码块与前后杂文）。"""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _judge_prompt(dim: str, poem: models.Poem, template: models.Template | None) -> str:
    prompt = (
        f"你是一位中国古典诗词评审，请只从「{dim}」这一维度打分。\n"
        f"{SCORE_ANCHOR}\n\n"
        f"【诗词】标题：{poem.title or '（无题）'}；类型：{poem.category or '（未分类）'}\n"
        f"{poem.content}\n"
    )
    if dim == "格律音韵" and template and template.pattern:
        prompt += f"\n【该类型格律参考】平仄：{'、'.join(template.pattern)}\n"
        if template.rhyme:
            prompt += f"押韵：{template.rhyme}\n"
    prompt += '\n请只输出 JSON，格式：{"score": <0-100整数>, "reason": "<一句话理由>"}'
    return prompt


def _report_prompt(poem: models.Poem, results: list[dict]) -> str:
    lines = [f"- {r['dimension']}：{r['score']} 分。{r['reason']}" for r in results]
    return (
        "你是诗词评审委员会主席。5 位评委已从不同维度对同一首诗独立打分，请你综合并输出最终报告。\n"
        "请校验各评委评分与理由是否自洽；若某评委与他人相差超过 20 分，请在报告中点明该分歧。\n\n"
        f"【诗词】标题：{poem.title or '（无题）'}；类型：{poem.category or '（未分类）'}\n"
        f"{poem.content}\n\n"
        "【5 位评委】\n"
        + "\n".join(lines)
        + "\n\n"
        "请只输出 JSON，格式："
        '{"total": <最终总分0-100>, "dimension_scores": {"意境":0,"格律音韵":0,"炼字语言":0,"情感立意":0,"章法结构":0}, '
        '"per_dimension_review": "<逐维度点评>", "strengths": "<优点>", "weaknesses": "<不足/可改>", "summary": "<一句总评>"}'
    )


async def score_poem(
    poem: models.Poem,
    template: models.Template | None = None,
    model: str = "deepseek-v4-pro",
    reasoning: str = "high",
) -> tuple[list[dict], dict]:
    """5 评委并行打分，1 裁判综合。返回 (5份评委明细, 裁判报告)。"""
    async def judge_one(dim: str) -> dict:
        msgs = [{"role": "user", "content": _judge_prompt(dim, poem, template)}]
        resp = await chat_complete(msgs, model=model, reasoning=reasoning)
        content = resp["choices"][0]["message"]["content"]
        data = extract_json(content)
        data["dimension"] = dim
        data["score"] = int(data["score"])
        return data

    results = await asyncio.gather(*(judge_one(d) for d in DIMENSIONS))

    msgs = [{"role": "user", "content": _report_prompt(poem, results)}]
    resp = await chat_complete(msgs, model=model, reasoning=reasoning)
    content = resp["choices"][0]["message"]["content"]
    report = extract_json(content)

    return results, report
