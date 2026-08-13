import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite database file lives next to the backend package
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'poems.db'}")

# DeepSeek (used from M4 onwards; key never reaches the frontend)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# 模型（两者上下文均为 1M tokens）
DEEPSEEK_MODEL_FLASH = os.getenv("DEEPSEEK_MODEL_FLASH", "deepseek-v4-flash")
DEEPSEEK_MODEL_PRO = os.getenv("DEEPSEEK_MODEL_PRO", "deepseek-v4-pro")

MODELS = {
    "flash": DEEPSEEK_MODEL_FLASH,
    "pro": DEEPSEEK_MODEL_PRO,
}

# Static uploads directory (poem images, M3)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))

# Single-user auth
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
