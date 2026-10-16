"""Render the metro episode's drag relation from its preserved LaTeX expression."""
from pathlib import Path
import hashlib
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "metro" / "references"
LATEX = r"F_D \approx \frac{1}{2}\,\rho C_D A\,v_{\mathrm{rel}}^{2}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = OUT / "drag-formula.latex"
    target = OUT / "drag-formula.png"
    source.write_text(LATEX + "\n", encoding="utf-8")
    plt.rcParams.update({"mathtext.fontset": "stix", "font.family": "STIXGeneral"})
    fig = plt.figure(figsize=(12, 2.5), dpi=200, facecolor="none")
    fig.text(.5, .47, "$" + LATEX + "$", ha="center", va="center",
             fontsize=66, color="#F5F0E7")
    fig.savefig(target, transparent=True, bbox_inches="tight", pad_inches=.15, dpi=200)
    plt.close(fig)
    rgba = Image.open(target).convert("RGBA")
    alpha = rgba.getchannel("A")
    assert alpha.getextrema() == (0, 255), "Formula must have ink and transparent padding."
    assert alpha.getbbox() is not None, "Empty formula rendering."
    preview = Image.new("RGBA", rgba.size, "#11212E")
    preview.alpha_composite(rgba)
    preview_path = ROOT / "research" / "metro" / "drag-formula-preview.jpg"
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(preview_path, quality=94)
    metadata = {
        "name": "气动阻力近似",
        "latex": LATEX,
        "renderer": "matplotlib.mathtext",
        "matplotlibVersion": matplotlib.__version__,
        "format": "RGBA transparent PNG",
        "dimensions": list(rgba.size),
        "textColor": "#F5F0E7",
        "assumptions": ["人体相对风速", "固定姿态与迎风面积", "阻力系数近似不变"],
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    }
    (OUT / "drag-formula.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
