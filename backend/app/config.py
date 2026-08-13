import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite database file lives next to the backend package
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'poems.db'}")

# DeepSeek (used from M4 onwards; key never reaches the frontend)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# Static uploads directory (poem images, M3)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
