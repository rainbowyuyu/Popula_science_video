"""Activate the natural narration and sparse score for the next Remotion render.

The previous delivery is preserved under ``public/metro/v1``. This script is
intentionally explicit because Film.tsx reads ``public/metro/master.wav`` and
``src/metro/timeline.json``; it is never run as part of importing the project.
"""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "public/metro/v2"
dst = ROOT / "public/metro"
required = [src / "narration.wav", src / "music.wav", src / "master.wav", src / "timeline.json"]
missing = [str(p) for p in required if not p.exists()]
if missing:
    raise SystemExit("Missing v2 assets: " + ", ".join(missing))

# Preserve a restorable copy in the project before switching active references.
backup = dst / "v1"
backup.mkdir(parents=True, exist_ok=True)
for name in ["narration.wav", "music.wav", "master.wav", "timeline.json"]:
    p = dst / name
    if p.exists() and not (backup / name).exists():
        shutil.copy2(p, backup / name)

for name in ["narration.wav", "music.wav", "master.wav", "timeline.json"]:
    shutil.copy2(src / name, dst / name)
shutil.copy2(src / "timeline.json", ROOT / "src/metro/timeline.json")
print("Activated metro v2 assets; prior active files remain in public/metro/v1")
