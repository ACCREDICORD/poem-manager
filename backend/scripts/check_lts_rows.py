import sys
sys.path.insert(0, r"D:\poem-manager\py-deps")
sys.path.insert(0, r"D:\poem-manager\poem-manager-main\backend")
from app.database import SessionLocal
from app import models

db = SessionLocal()
rows = db.query(models.Template).filter(models.Template.name.like("浪淘沙%")).all()
for r in rows:
    print(f"id={r.id} name={r.name!r} editable={r.editable} 句数={r.line_count} flags={r.rhyme_flags} example={r.example[:30]!r}")
db.close()
