# Qwen/Wan bridge shots · Nobel Physics 2026 V01

This folder records optional environment bridges for the five-minute cut. The
generated plates carry atmosphere and camera continuity only; detector counts,
energies, significance values, formulae and labels are drawn by the deterministic
Canvas/Remotion layer. The actual request text, model, seed, status and SHA-256
are written to `qwen-bridge-ledger-v01.json` by
`scripts/generate_qwen_bridges_v01.py`.

The script never stores an API key. It reads `DASHSCOPE_API_KEY` (or
`QWEN_API_KEY_PRIMARY`, `QWEN_API_KEY`) from the process environment. Run
`python scripts/generate_qwen_bridges_v01.py --prepare` to create the manifest;
use `--run` only when media generation is intended. If a provider is
unavailable, `--fallback` creates deterministic, silent 1920×1080/30 fps plates
with the same IDs and no scientific labels. A fallback is clearly marked in the
ledger and is not reported as a Qwen result.

## Bridge roles

| ID | Between clips | Visual handoff |
|---|---|---|
| `bridge-01-cosmic-arrival` | `000 → 001` | A cyan neutrino path glides out of deep space into a clean dark frame. |
| `bridge-02-ice-descent` | `004 → 005` | Camera sinks through translucent Antarctic ice toward detector modules. |
| `bridge-03-cherenkov-volume` | `006 → 007` | A blue Cherenkov cone blooms in the ice; the exact cone and formula remain procedural. |
| `bridge-04-source-return` | `011 → 012` | A signal line leaves the detector and resolves into a distant sky field. |
| `bridge-05-night-coda` | `015 → 016` | Slow pullback from blue ice to a quiet South Pole horizon for the ending. |

Each shot is five seconds, silent, 16:9, and contains no text, logos, UI,
numbers, labels or watermarks. Insert with a matched camera/exposure and a
short trim; do not crossfade or stretch a last frame to hide a failed seam.
