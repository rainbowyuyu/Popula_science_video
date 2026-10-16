# WorldV06.ts — Patch Brief

Can't open the files from here, so this is written against the stated constraints and the helper signatures you listed. Drop-in, additive, no rewrite of WorldV05.

---

## 1. Determinism contract

- All randomness through `rnd(intSeed)`. No `Math.random`, no `Date.now`, no `performance.now`. Every call site passes a **literal integer**, never a loop variable mixed with frame.
- All per-frame time from `frame` only. DOM grid, hit sets and arrival orders are computed **once at module scope**, not in the render body.
- Bloom alpha per frame capped at `0.42`; max luminance delta between adjacent frames `0.06`. No full-canvas fill above `#0A1826`.

---

## 2. Camera + projection (locked constants)

```ts
export const ICE = {
  n: 1.31, c: 0.2998,                       // m/ns
  vPhoton: 0.2998 / 1.31,                   // ≈ 0.2289 m/ns
  thetaC: Math.acos(1 / 1.31),              // ≈ 0.7026 rad = 40.26°
  tanT: Math.tan(Math.acos(1 / 1.31)),      // ≈ 0.847
  zTop: 1450, zBot: 2450,
};

const CAM = { ox: 660, oy: 340, kx: 1.00, ky: 0.22, kz: 0.62, shear: 0.09 };

export const projectDepth = (x: number, y: number, z: number) => ({
  sx: CAM.ox + x * CAM.kx + y * CAM.ky,
  sy: CAM.oy + (z - ICE.zTop) * CAM.kz - y * CAM.shear,
});
```

**Self-check the bounds, don't eyeball them.** With `x ∈ ±540`, `y ∈ ±437.5`, `z ∈ [1450,2450]`:

- `sx ∈ [10, 1310]` — clear of the evidence panel hard edge at `x = 1440`.
- `sy ∈ [301, 999]` — satisfies `y >= 285` at the top and stays above 1080 with the readout strip below.

`kz = 0.62 px/m` is the number that makes 1450 m and 2450 m legible as different depths rather than a flat wall. Do not raise `ky` past `0.24` or the far row crosses the panel.

---

## 3. Geometry builders (module scope, run once)

```ts
const ROWS = [5, 10, 13, 15, 15, 13, 10, 5];   // sums to 86

// 86 strings x 60 DOMs = 5160
export const STRINGS = (() => {
  const out = [] as { x: number; y: number; doms: DOM[] }[];
  let id = 0;
  ROWS.forEach((count, r) => {
    const ry = -437.5 + r * 125;
    for (let k = 0; k < count; k++) {
      const rx = (k - (count - 1) / 2) * 72 + (r % 2 ? 36 : 0);
      const doms = Array.from({ length: 60 }, (_, i) => {
        const z = ICE.zTop + i * (1000 / 59);
        const p = projectDepth(rx, ry, z);
        return { x: rx, y: ry, z, sx: p.sx, sy: p.sy, key: id++ };
      });
      out.push({ x: rx, y: ry, doms });
    }
  });
  return out;
})();   // assert STRINGS.length === 86 && id === 5160
```

`72 m` lateral spacing × longest row ≈ 1010 m footprint over 1000 m depth — that *is* the cubic kilometre, so the 004 beat doesn't need a separate diagram.

**Depth sort once, not per frame.** Precompute `DRAW_ORDER` ascending by `sy` so near DOMs always paint over the cone and far DOMs always under it. That is the whole occlusion policy.

**Depth strata.** `iceStrata(ctx)` draws 8 static horizontal bands between `sy(1450)` and `sy(2450)` with an alpha ramp from `0.10` down to `0.04`. Plus `depthAxis(ctx)` — three ticks at 1450 / 1850 / 2450 m, mono 11 px, right-aligned at `x = 1340`. These carry the depth story so no caption card is needed.

---

## 4. The neutrino (unlit on purpose)

Draw as `path()` with `setLineDash([6, 9])`, stroke `rgba(150,190,220,0.5)`, `lineWidth 1.4`, **zero `bloom` call**. Animate dash offset with `-frame * 1.2` so it reads as motion without emitting. This is the single biggest fix for "abstract": in V05 the neutrino almost certainly glows, which makes it indistinguishable from the secondary. It must be the dimmest thing on screen.

---

## 5. Collision, secondary, cone

```ts
type Cone = { p: [number,number,number]; u: [number,number,number]; len: number };

const inCone = (d: DOM, c: Cone, shell = 26) => {
  const dx = d.x - c.p[0], dy = d.y - c.p[1], dz = d.z - c.p[2];
  const t = dx*c.u[0] + dy*c.u[1] + dz*c.u[2];
  if (t < 0 || t > c.len) return null;
  const rx = dx - t*c.u[0], ry = dy - t*c.u[1], rz = dz - t*c.u[2];
  const r = Math.hypot(rx, ry, rz);
  if (Math.abs(r - t * ICE.tanT) > shell) return null;
  return { t, r };
};

const tHit = (h: {t:number; r:number}, t0: number) =>
  t0 + h.t / ICE.c + h.r / ICE.vPhoton;     // particle leg + photon leg, ns
```

`shell = 26 m` is the Cherenkov *shell thickness*, not slop — it keeps the lit set continuous along the cone instead of a dotted line.

**Arrival ordering:**
```ts
const HITS = STRINGS.flatMap(s => s.doms)
  .map(d => { const h = inCone(d, CONE); return h ? { d, t: tHit(h, T0) } : null; })
  .filter(Boolean).sort((a, b) => a!.t - b!.t);
const FRAME_ON = (t: number) => HIT_F0 + Math.round(t * NS_TO_FRAMES);
```
`NS_TO_FRAMES ≈ 1.4`. A DOM is lit when `frame >= FRAME_ON(t)`; ramp alpha `0 → 0.85` over the following 12 frames and hold. Colour is constant — Cherenkov is blue-white — the **order** is carried by the wavefront, not by hue.

**Wavefront ring.** At each frame, draw an ellipse on the cone surface at `s = (frame - HIT_F0) / NS_TO_FRAMES * ICE.c` from the apex, radius `s * ICE.tanT`, projected through `projectDepth` as a 24-segment `path()`, alpha `0.22`. DOMs pop in as the ring passes them. This is the beat that makes "arrival order" self-evident without a legend.

**Collision.** Not an explosion. An 8 px `orb` ring at the apex expanding to 22 px over 3 frames, alpha `0.55 → 0.18`, then a static 2 px `#FFFFFF` core. The nucleus is a point; the drama belongs to the cone.

**Cone wedge.** `path()` from apex, two edges at `±ICE.thetaC` around `u`, filled `rgba(120,200,255,0.10)` with a single `glowPath` rim. Draw it *under* the DOM layer, over the strata.

---

## 6. Track vs cascade (the legibility ratio)

| | physical | screen (`kz 0.62`, `kx 1.0`) | render |
|---|---|---|---|
| track | ~10 km in ice | crosses the block and exits | straight `line`, `lineWidth 2`, tapering alpha 0.9 → 0.25, exiting the bottom edge |
| cascade | 10–20 m | 10–12 px | 5 px core + 46 px `bloom` halo |

Put the ratio in the panel as small mono type, `"track ×500:1 cascade"`. One line. Do not centre-caption it.

---

## 7. Earth veto + sky pointing

- **Veto:** ~14 faint `rgba(120,140,160,0.22)` near-vertical tracks entering from the top sky band, descending through the ice and out. Each carries a small `⊘` glyph (16 px circle + 1.5 px slash) at its entry point. One upward-going arc is drawn and then struck through — that is the rejected case. Keep all of it under 0.25 alpha so it never competes with the event.
- **Sky source:** `skyPoint(az, alt)` → a single direction vector; draw `u` into the ice from a fixed sky anchor above `y = 320`, plus a 40 px crosshair at the anchor.
- **0.06° inset:** at any drawable angular scale, 0.06° is sub-pixel. Draw a 120 px circular magnifier in the panel, label `×500`, with the source dot and the event dot separated by ~27 px. Stating the magnification *is* the honesty.

---

## 8. Suggested beat map (re-time to your existing VO cues)

| clip | visual |
|---|---|
| 000 | ice block + depth axis only, everything else hidden |
| 001 | strata fade in 0 → 1 over 36 frames, no camera move |
| 002 | 86 strings draw top→bottom, sequential by row index |
| 003 | 5160 DOMs at `0.18` alpha, no bloom |
| 004 | cube wireframe, one pass, alpha `0.25` |
| 005 | Antarctic sky band; dotted neutrino enters, unlit |
| 006 | nucleus collision — ring 8→22 px, 3 frames |
| 007 | secondary leaves apex; cone wedge fades in |
| 008 | wavefront ring; DOMs light in arrival order |
| 009 | track case — exits the block |
| 010 | cascade case — compact ball, ratio line in panel |
| 011 | earth veto field; downward muons tagged, one upward rejected |
| 012 | 2013 — 28 sky markers, `4.1σ` tick in panel |
| 013 | 37 markers, `5.7σ` |
| 014 | event 32 desaturates to grey = background muon; 36 stay blue |
| 015 | TXS 0506+056 — crosshair + `×500` 0.06° inset |
| 016 | NGC 1068 — 79-marker tally, error bar `+22/-20`, `~4.2σ` |

---

## 9. Guardrails to assert in code

- `STRINGS.length === 86`, `DOM_COUNT === 5160` at module load.
- `Math.min(...DOM_SY) >= 285`, `Math.max(...DOM_SX) <= 1440`.
- No `Math.random` / `Date` in the file (grep before commit).
- `bloom()` call count per frame ≤ 3 (secondary, wavefront, active DOM batch). The veto field gets **none**.
- Lit-DOM cap `180`; if `HITS.length` exceeds it, stride the array — do not raise the cap.

Ship 000–016 with the existing audio untouched; every change above is a draw-order or geometry swap inside the frame callback.