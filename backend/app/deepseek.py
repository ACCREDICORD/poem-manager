"""DeepSeek 客户端（OpenAI 兼容接口，流式）。"""

import json

import httpx

from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, MODELS


async def stream_chat(
    messages: list[dict],
    model: str | None = None,
    reasoning: str | None = None,
):
    """异步生成器：逐段产出 DeepSeek 的回复文本增量。

    reasoning: none | low | high | max（推理强度；none=关闭思考模式）。
    """
    model = model or MODELS["flash"]
    url = f"{DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": True}
    if reasoning == "none":
        payload["thinking"] = {"type": "disabled"}
    elif reasoning in ("low", "high", "max"):
        payload["reasoning_effort"] = reasoning
        payload["thinking"] = {"type": "enabled"}

    timeout = httpx.Timeout(120.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = obj.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta


async def chat_complete(
    messages: list[dict],
    model: str | None = None,
    reasoning: str | None = None,
):
    """非流式调用，返回完整响应 JSON（用于需要结构化输出的评审/裁判）。"""
    model = model or MODELS["flash"]
    url = f"{DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, "messages": messages, "stream": False}
    if reasoning == "none":
        payload["thinking"] = {"type": "disabled"}
    elif reasoning in ("low", "high", "max"):
        payload["reasoning_effort"] = reasoning
        payload["thinking"] = {"type": "enabled"}

    timeout = httpx.Timeout(180.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()
