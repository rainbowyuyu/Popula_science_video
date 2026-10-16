"""Render documented LaTeX math source into transparent vector/raster assets."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/beso-research/formulas"
OUT.mkdir(parents=True, exist_ok=True)
FORMULAS = [
    {"id": "equilibrium", "name": "静力平衡", "latex": r"\mathbf{K}(\mathbf{x})\,\mathbf{u}=\mathbf{f}", "note": "Finite-element equilibrium; not a standalone certificate of an entire structure."},
    {"id": "compliance", "name": "刚度目标", "latex": r"\min_{\mathbf{x}}\ C=\mathbf{f}^{\mathsf{T}}\mathbf{u},\quad \sum_e x_e V_e\leq V^*", "note": "Compliance minimization under a material-volume budget; displayed as the methodological objective."},
    {"id": "gate", "name": "内部审查门", "latex": r"S\geq85,\qquad \min_i s_i\geq60", "note": "Project internal reviewer threshold, distinct from external certification."},
]
for item in FORMULAS:
    fig = plt.figure(figsize=(13.5, 1.3), dpi=160)
    fig.text(0.02, 0.5, "$"+item["latex"]+"$", color="#163a55", fontsize=35, va="center")
    fig.savefig(OUT / (item["id"]+".png"), transparent=True, bbox_inches="tight", pad_inches=.03)
    fig.savefig(OUT / (item["id"]+".svg"), transparent=True, bbox_inches="tight", pad_inches=.03)
    plt.close(fig)
(OUT / "latex-sources.json").write_text(json.dumps({"renderer": "Matplotlib mathtext (LaTeX mathematical syntax)", "formulas": FORMULAS}, ensure_ascii=False, indent=2), encoding="utf-8")
print("Rendered", len(FORMULAS), "formula pairs to", OUT)
