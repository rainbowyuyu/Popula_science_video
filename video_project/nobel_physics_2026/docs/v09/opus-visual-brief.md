# V09 Design Brief — "One Cubic Kilometre"
**Target:** `D:/python_project/manim_extend_rainbow/video_project/nobel_physics_2026`, Remotion + `WorldV04.ts`
**Scope:** 5 new clips `017–021` (or patches injected into the existing `000–016` timeline at the marked slots). Spec only — no files written.

---

## 0. Assumptions & fixed layout

| Constraint | Value |
|---|---|
| Canvas | `W=1920, H=1080` |
| Safe area | all new content `y >= 285` (top 285 px reserved for existing title layer) |
| Stage window | `x ∈ [220, 1392]`, `y ∈ [300, 960]` |
| Evidence panel | `x ∈ [1420, 1880]`, `y ∈ [285, 940]`, 24 px inner pad |
| Frame rate | 30 fps, all timing in frames, never ms-of-wallclock |
| World units | metres; depth 0 = surface, 1450 m = top of detector, 2450 m = bottom |
| Detector | 86 strings × 60 DOMs = 5160 modules, ~17 m DOM pitch, ~125 m string pitch, 1 km³ |

The depth section is drawn **twice**: a true-scale ruler (static, honest) and a perspective 3D view (camera-driven). Never claim the 3D view is to scale — the footer says so.

---

## 1. Global deterministic rig

One camera per clip, pure function of `state.frame`. No `useState`, no `Math.random`, no `Date.now`, no CSS keyframes, no module-level mutable caches. Seeded star arrays built **once at module scope from `rnd(seed)`** are allowed (constant across every run and every frame).

```ts
type Cam = { dist:number; pan:number; tilt:number; fov:number };
const lerp = (a,b,t)=>a+(b-a)*t;

// kf: [progress, value] pairs; eases each segment with smooth()
function camAt(p:number, kf:[number,number][]):number { /* piecewise smooth() */ }

const CAM: Record<number, (p:number)=>Cam> = {
  17: p => ({ dist: lerp(2600, 420, smooth(p,.18,.72)),
              tilt: lerp(0.62, 0.12, smooth(p,.20,.80)),
              pan : lerp(-180, 40, smooth(p,.00,.60)),
              fov : lerp(0.90, 0.62, smooth(p,.30,.90)) }),
  18: p => ({ dist: 640, tilt: 0.10, pan: 6*Math.sin(p*Math.PI*2)*0.35, fov: 0.60 }),
  19: p => ({ dist: lerp(640, 520, smooth(p,0,1)), tilt: 0.10, pan: 0, fov: 0.58 }),
  20: p => ({ dist: 520, tilt: 0.10, pan: lerp(0, -90, smooth(p,.10,.90)), fov: 0.58 }),
  21: p => ({ dist: lerp(520, 1500, smooth(p,0,.55)), tilt: lerp(0.10,-0.35,smooth(p,0,.55)), pan:0, fov: 0.70 }),
};
```

Every edge uses `projectDepth(worldPt, cam)` so the cube converges correctly while descending. `project` only for the flat sky patch in clip 021.

**Continuity rule:** every alpha/radius/length curve is piecewise `smooth()` with C1 joins. Max per-frame luminance delta hard-clamped to `0.12` — this is the anti-flash guarantee, enforceable as an assertion in dev.

---

## 2. Patch P1 — `iceColumnDepth(st)` · clip 017, 300 f

**Purpose:** the scale cue. 1450 m of ice above you, 1 km³ of instrumented volume, 5160 modules.

**Geometry**
- Depth ruler, fixed: `x=300..360`, `y = 340 + 600*(d/2450)`. Ticks every 250 m at `alpha 0.16`; emphasised ticks at 1450 m and 2450 m at `alpha 0.42` with 22 px labels.
- Instrumented band rectangle `y(1450)..y(2450)` filled `#0B2A45` at `alpha 0.22` — states where the detector actually lives.
- Cube: 4 bottom-face corners at `(±500, ±500, z)` in world metres, projected. Draw only 3 vertical edges + bottom square + top square at `alpha 0.20`; skip hidden edges (fewer lines, no clutter).
- Strings: all 86 drawn as 1 px vertical polylines at `alpha 0.12`; only the 12 front-most carry 60 DOM dots (`2 px`, `alpha 0.35`). 720 dots total, static per frame.

**Beats**
| p | action |
|---|---|
| 0.00–0.18 | hold above surface, ruler fades in from 0.00→0.20 alpha |
| 0.18–0.72 | descend 1450 m; DOM dots scale up with `projectDepth`, ruler emphasis line at 1450 m passes the camera plane at p≈0.44 |
| 0.72–0.85 | settle inside volume; 1 km scale bar draws under the bottom face (line + two end ticks, no text) |
| 0.85–1.00 | 12 strings' dots brighten to `alpha 0.65` in a left→right sweep (30 f), panel shows `5160` |

---

## 3. Patch P2 — `neutrinoEntry(st)` · clip 018, 240 f

A single straight line, **no cone yet, no flash**. Neutrino drawn as a 1.6 px stroke `#C9B8FF` at `alpha 0.55` with `bloom(r=3)`.

- Entry from outside the cube: from world `(-1400, +180, 1450)` to interaction vertex `V = (-160, 40, 1650)`.
- Travels `p 0.00→0.42` at constant screen speed; parallax: star/ice backdrop scrolls at `0.25×` of the line's motion, which is the entire scale cue here (nothing else moves — camera is nearly static by design).
- `p 0.42`: neutrino alpha `1→0` over 10 f **while** the secondary line alpha `0→1` over 10 f at the same stroke width, colour `#FFD9A0`. Crossfade, not a pop.
- `p 0.42–0.70`: secondary advances toward the cube interior along `d = normalize(0.30, -0.06, 0.95)`.
- `p 0.70–1.00`: hold; panel shows "charged secondary".

Vertex ring: single `glowPath` circle, `r 0 → 26 px` over 14 f, alpha envelope `0 → 0.30 → 0` (cap 0.30). Never brighter.

---

## 4. Patch P3 — `cherenkovCone(st)` · clip 019, 210 f

**Geometry.** Vertex `V`, axis `d`, half-angle `θ = 41°` (in-ice Cherenkov angle, `cosθ = 1/n`, `n ≈ 1.31`). Length `L = 520 m`.

- Edges: two straight `glowPath`s from `V` to `V + L*(cosθ·d ± sinθ·n̂)`, 3.5 px, `#3AA0FF`, `bloom(r=6)`.
- Far cap: 32-segment arc between the edge endpoints, 1.5 px, `alpha 0.45`.
- Body: triangle fill `#1E6FD9` at `alpha 0.10` only. Do not stack additive layers past the bloom threshold — that is where the "WebGL look" turns into a white flash.
- `n̂` chosen once as `normalize(cross(d, up))` so it never swims.

**Beats**
| p | action |
|---|---|
| 0.00–0.12 | edges sweep `0 → L` (24 f), cap follows the leading edge |
| 0.12–0.30 | body fill ramps `0 → 0.10`; camera pushes `dist 640 → 520` |
| 0.30–1.00 | cone rigid and held; slight `fov 0.64→0.58` so the cone breathes, no pan |

Panel adds the row `cone half-angle · ≈41°`.

---

## 5. Patch P4 — `domCascade(st)` · clip 020, 240 f

The core timing sequence. Deterministic hit test and arrival order — this is what makes it read as physics rather than sparkle.

```ts
const C_ICE = 0.21;                     // m/ns
const hits: {i:number; tau:number; t:number}[] = [];
for (let i = 0; i < 86*60; i++) {
  const P = domPos(i);                  // module-scope constant array
  const r = sub(P, V);
  const along = dot(r, d);
  if (along < 0 || along > L) continue;
  if (Math.acos(dot(normalize(r), d)) > 41*Math.PI/180) continue;
  const tau = along / C_ICE;            // ns, 0 .. ~2480
  hits.push({ i, tau, t: tau/2600 + 0.03*rnd(i*13+7) }); // jitter is seeded, fixed forever
}
hits.sort((a,b)=>a.t-b.t);
```

- Time base: light front maps to clip `p 0.15 → 0.80` (≈156 f). Only modules **inside the cone** light — typically 40–70 of 5160. Lighting a large fraction destroys the causal reading and makes it a sparkle field.
- Per-DOM envelope: `r 5→14 px` over 12 f, alpha `0 → 0.85 → 0` with rise 12 f / hold 18 f / decay 26 f. Sharp white core `#EAF4FF`, ring `#4FB0FF`.
- Concurrency cap: 70 active rings, drop oldest deterministically (sorted list, not insertion order).
- Camera trucks `pan 0 → -90` counter to the light front so the cone stays framed; no zoom (avoids vertigo and frame-edge thrash).
- Panel gets a 90-tick arrival strip that fills in the **same sorted order**. One tick in clip 021's candidate list is grey and marked `bg` for event 32.

---

## 6. Patch P5 — `skyFocus(st)` · clip 021, 300 f

Ice fades to `alpha 0.18` while the sky patch fades in (`p 0.00→0.30`). Cross-dissolve only — **no white flash, no starfield pop**.

- Sky = gnomonic patch centred on the reconstructed direction, 20° × 11.25°, `k = 45 px/deg`, fitted to the stage window. Faint RA/Dec grid at `alpha 0.10`. Stars from a seeded module-scope array, drawn with a fixed declination-dependent size — no twinkle, no per-frame jitter.
- Reconstructed direction: adaptive crosshair (`4 px` gaps, 22 px arms).
- **TXS 0506+056:** angular separation 0.06° → 2.7 px at this scale, i.e. deliberately invisible. Add a lens inset circle at `c=(1240, 620)`, `r = 120`, field 0.5° (`480 px/deg`) → separation renders as ~29 px. Leader line from the crosshair to the lens rim. Label only inside the panel, never a floating text card.
- **NGC 1068:** off-source marker at 0.15 → 0.15 crossfade, with a soft annulus whose inner/outer radii encode `+22/-20` as a symmetric band; panel carries `79 +22/-20 (fitted excess), ~4.2σ`.
- Camera rises and tilts up `tilt 0.10 → -0.35`; the ice column shrinks to a faint footprint — the last scale reminder.

Panel rows for this clip: `2013 · 28 events · 4.1σ`, `later · 37 candidates · 5.7σ`, `event 32 · background muon`, and the two source rows.

---

## 7. Evidence panel

Fixed scaffold `x 1420..1880`, transparent-fill column, no border, no shadow. Three slots: title (26 px), value (44 px monospace, tabular figures), caption (24 px, `alpha 0.55`). Slot contents crossfade over 12 f at clip boundaries — never a hard swap, never a blink. Persistent 20 px footer at `alpha 0.45`:

> **ILLUSTRATIVE GRAPHICS — NOT MEASURED DATA**

This footer is the single mechanism that keeps generated geometry from reading as real measurement, and it must be present in all five clips.

---

## 8. Guardrail checklist (acceptance tests)

1. Render frames 0..N twice; byte-identical output. No `Math.random`, `Date.now`, `useState` writes, or CSS animation anywhere in V09.
2. Assert no drawn primitive has `y < 285`; assert panel bounds respected.
3. Assert `|meanLuma(f) − meanLuma(f−1)| < 0.12` for every frame.
4. Assert active DOM rings ≤ 70 and lit DOM count 40–70 per frame.
5. Assert the interaction vertex never sits over the panel or outside the stage window.
6. Assert the footer string is present in clips 017–021.
7. Grep the V09 diff for `real`, `measured`, `observed` applied to drawn geometry — every such string must be accompanied by the fitted/simulated qualifier.

**Beat sheet**

| Clip | Frames | Camera | Primary cue |
|---|---|---|---|
| 017 IceVolume | 0–300 | descend 2600→420 m, tilt 0.62→0.12 | 1450 m, 5160 DOMs, 1 km³ |
| 018 NeutrinoEntry | 0–240 | near-static, 6 px drift | entry → collision (crossfade) |
| 019 CherenkovCone | 0–210 | push 640→520 | 41° blue cone |
| 020 DOMCascade | 0–240 | truck pan 0→−90 | ordered module lighting |
| 021 SkyFocus | 0–300 | rise + tilt up | direction reconstruction, sources |

Spec only; no code written to the project.