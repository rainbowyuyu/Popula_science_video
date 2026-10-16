"""Technical QA for optional Qwen/Wan bridge plates."""
from __future__ import annotations
import hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public" / "bridges-v01"
OUT = ROOT / "research" / "generation" / "qwen-bridge-qa-v01.json"

def sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def main() -> None:
    rows = []
    for p in sorted(MEDIA.glob("bridge-*.mp4")):
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(p)], text=True))
        streams = probe.get("streams", [])
        v = next((s for s in streams if s.get("codec_type") == "video"), None)
        a = [s for s in streams if s.get("codec_type") == "audio"]
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "null", "-"], check=True)
        row = {
            "file": str(p.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha(p),
            "width": int(v["width"]), "height": int(v["height"]),
            "fps": v["r_frame_rate"], "frames": int(v.get("nb_frames", 0)),
            "durationSeconds": float(probe["format"]["duration"]),
            "audioStreams": len(a), "decoded": True,
            "pass": int(v["width"]) == 1920 and int(v["height"]) == 1080 and v["r_frame_rate"] == "30/1" and int(v.get("nb_frames", 0)) == 150 and not a,
        }
        rows.append(row)
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "count": len(rows), "allPass": all(r["pass"] for r in rows), "assets": rows}
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["allPass"] else 1)

if __name__ == "__main__":
    main()
