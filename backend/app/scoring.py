"""agents 评分：神/形双维度（各 2 评委独立评审）+ 1 裁判综合，5 分制，参考基准校准。"""

import asyncio
import json
import re

from . import models
from .deepseek import chat_complete

DIMENSIONS = ["神", "形"]
JUDGES_PER_DIM = 2

SCORE_ANCHOR = (
    "评分采用 5 分制（保留一位小数）。6 档参考：0-1 差，1-2 一般，2-3 尚可，3-4 良好，"
    "4-4.5 优秀，4.5-5 顶尖。"
)

_DIM_DESC = {
    "神": "作者的思想情感、哲理哲思、主题主旨、立意、写作目的等内在精神层面",
    "形": "作品的形态：结构脉络、修辞手法、表现手法、遣词造句等外在形式层面，但不含格律",
}


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


def _reference_summary(references: list) -> str:
    """把参考文章压缩成注入评委提示词用的锚点摘要。"""
    if not references:
        return "（暂无参考基准）"
    lines = []
    for r in references:
        spirit = (r.spirit_analysis or "").replace("\n", " ")[:60]
        form = (r.form_analysis or "").replace("\n", " ")[:60]
        lines.append(f"《{r.title}》（{r.author}）5.0分｜神：{spirit}｜形：{form}")
    return "\n".join(lines)


def _judge_prompt(
    dim: str,
    title: str,
    content: str,
    category: str,
    ref_summary: str,
) -> str:
    # 注意：评审不看格律（部分变格库中可能缺失，注入格律校验会误导打分）；
    # 格律问题由用户主动使用「格律校验」功能单独检查。
    prompt = (
        f"你是一位诗词评审，请只从「{dim}」这一维度（{_DIM_DESC[dim]}）独立、完整地分析并打分。\n"
        f"{SCORE_ANCHOR}\n\n"
        f"【5.0 满分基准（以下为满分作品要点，请以此为准星校准你的打分）】\n{ref_summary}\n\n"
        f"【待评作品】标题：{title or '（无题）'}；类型：{category or '（未分类）'}\n"
        f"{content}\n"
    )
    prompt += '\n请只输出 JSON：{"score": <0-5 一位小数>, "reason": "<200字内理由>"}'
    return prompt


def _report_prompt(
    title: str, content: str, category: str, results: list[dict], ref_summary: str
) -> str:
    shen = [r for r in results if r["dimension"] == "神"]
    xing = [r for r in results if r["dimension"] == "形"]
    shen_lines = "\n".join(
        f"- 神评委{i + 1}：{r['score']} 分。{r['reason']}" for i, r in enumerate(shen)
    )
    xing_lines = "\n".join(
        f"- 形评委{i + 1}：{r['score']} 分。{r['reason']}" for i, r in enumerate(xing)
    )
    return (
        "你是诗词评审委员会主席。2 位「神」评委和 2 位「形」评委已对同一作品独立打分，请综合出最终结果。\n"
        "请校验各评委是否自洽；若同一维度内两位评委分歧过大，请在文中点明。\n\n"
        f"【5.0 满分基准】\n{ref_summary}\n\n"
        f"【待评作品】标题：{title or '（无题）'}；类型：{category or '（未分类）'}\n{content}\n\n"
        f"【神评委】\n{shen_lines}\n\n【形评委】\n{xing_lines}\n\n"
        "请只输出 JSON："
        '{"total": <综合分 0-5 一位小数>, "spirit_score": <神分 0-5 一位小数>, '
        '"form_score": <形分 0-5 一位小数>, "article": "<综合分析文章，覆盖神与形两个维度，500-1000字>"}'
    )


async def score_poem(
    title: str,
    content: str,
    category: str = "",
    template: models.Template | None = None,
    references: list | None = None,
    model: str = "deepseek-v4-pro",
    reasoning: str = "high",
) -> tuple[list[dict], dict]:
    """神/形各 2 评委并行独立评审，1 裁判综合。返回 (4份评委明细, 裁判报告)。

    注：template 参数保留仅为接口兼容，评审提示词不再引用词谱/格律内容。
    """
    references = references or []
    ref_summary = _reference_summary(references)

    async def judge_one(dim: str) -> dict:
        msgs = [
            {
                "role": "user",
                "content": _judge_prompt(dim, title, content, category, ref_summary),
            }
        ]
        resp = await chat_complete(msgs, model=model, reasoning=reasoning)
        raw = resp["choices"][0]["message"]["content"]
        data = extract_json(raw)
        data["dimension"] = dim
        data["score"] = round(float(data["score"]), 1)
        return data

    tasks = [judge_one(dim) for dim in DIMENSIONS for _ in range(JUDGES_PER_DIM)]
    results = await asyncio.gather(*tasks)

    msgs = [{"role": "user", "content": _report_prompt(title, content, category, results, ref_summary)}]
    resp = await chat_complete(msgs, model=model, reasoning=reasoning)
    raw = resp["choices"][0]["message"]["content"]
    report = extract_json(raw)
    report["total"] = round(float(report.get("total", 0)), 1)
    report["spirit_score"] = round(float(report.get("spirit_score", 0)), 1)
    report["form_score"] = round(float(report.get("form_score", 0)), 1)

    return results, report
