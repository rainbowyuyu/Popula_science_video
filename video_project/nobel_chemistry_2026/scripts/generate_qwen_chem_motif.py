from __future__ import annotations

"""Generate one hand-drawn chemistry motif with Qwen Image.

Credentials are read only from the process environment.  The attached
portrait is supplied as a style reference; the generated image must contain
no people and no text.
"""

import base64
import json
import os
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "delivery/chemistry2026_cover_v01/assets"
ASSET.mkdir(parents=True, exist_ok=True)
PORTRAIT = Path(r"C:/Users/zju/AppData/Local/Temp/codex-clipboard-354992ba-ce58-4c6d-bc0f-786c089072f5.png")
OUT = ASSET / "qwen-chemistry-motif-v01.png"
REQUEST = ASSET / "qwen-chemistry-motif-v01-request.json"
MODEL = "qwen-image-2.0-pro-2026-06-22"
HOST = os.environ.get("DASHSCOPE_API_HOST", "https://dashscope.aliyuncs.com").rstrip("/")
KEY = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("QWEN_API_KEY")

PROMPT = """Create a single horizontal hand-drawn scientific illustration for a premium Nobel chemistry cover.
Use the supplied line-art portrait ONLY as a style reference: fine graphite-black contour lines, warm restrained ochre brush accents, ivory paper, subtle cyan-blue ink details, elegant editorial science illustration. Do not draw any person, face, hand, laboratory scene, glassware, logo, lettering, words, numbers, labels, formula, watermark or interface.
The subject is asymmetric organic synthesis and autocatalysis, shown accurately but simply: on the left, two small abstract reactant circles connected by a thin bond; in the middle, two clearly mirror-image tetrahedral chiral molecules with a small warm-gold central atom and four cool-cyan substituent circles; on the right, a graceful curved feedback arrow loops from the product back toward the product, with three subtly expanding rings to suggest nonlinear amplification. Keep the left-to-right reaction flow and the mirrored pair readable at thumbnail size.
Use lots of clean ivory negative space, soft watercolor wash only inside the scientific marks, no rectangular panel, no dark background, no hard frame. The final artwork should feel drawn by the same hand as the supplied portrait, with smooth organic strokes, quiet premium composition, and no text. 16:9 horizontal."""


def data_url(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    if not KEY:
        raise SystemExit("DASHSCOPE_API_KEY or QWEN_API_KEY is required")
    payload = {
        "model": MODEL,
        "input": {"messages": [{"role": "user", "content": [{"image": data_url(PORTRAIT)}, {"text": PROMPT}]}]},
        "parameters": {"size": "1664*936", "n": 1, "watermark": False, "prompt_extend": False, "seed": 26071007},
    }
    headers = {"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    session = requests.Session()
    # The desktop environment may expose a stale system proxy. DashScope is
    # reachable directly here, so bypass inherited proxy variables.
    session.trust_env = False
    response = session.post(HOST + "/api/v1/services/aigc/multimodal-generation/generation", headers=headers, json=payload, timeout=240)
    response.raise_for_status()
    result = response.json()
    image_url = result["output"]["choices"][0]["message"]["content"][0]["image"]
    image = session.get(image_url, timeout=180)
    image.raise_for_status(); OUT.write_bytes(image.content)
    safe_payload = {"model": MODEL, "prompt": PROMPT, "reference": str(PORTRAIT), "parameters": payload["parameters"], "provider": "Alibaba Cloud DashScope Qwen Image", "output": str(OUT)}
    REQUEST.write_text(json.dumps(safe_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
