import sys

sys.path.insert(0, r"D:\poem-manager\py-deps")
sys.path.insert(0, r"D:\poem-manager\poem-manager-main\backend")

from app.scoring import _judge_prompt  # noqa: E402

prompt = _judge_prompt("形", "测试", "白日依山尽", "五绝", "（参考基准摘要）")
print("提示词含'格律参考':", "格律参考" in prompt)
print("提示词含'平仄校验报告':", "平仄校验报告" in prompt)
print("提示词含'词谱':", "词谱" in prompt)
print("--- 提示词全文 ---")
print(prompt)
