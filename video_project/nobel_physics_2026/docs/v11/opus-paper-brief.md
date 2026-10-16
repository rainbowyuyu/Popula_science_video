# WorldV07 — IceCube / Nobel 2026 visual redraw plan

**Two things up front, plainly:**

1. I can't read your repo from here — no filesystem tools in this session. Everything below is a design specification, not a patch. I don't know what your 17 clips actually are, what your current V10 file is called, or what's inside `research/nobelphysics2026/originals`. Where I write a path, treat it as a **proposed** path.
2. Run these first and paste the output back; then I can pin the plan to your real clip manifest and layout constants instead of a canonical guess.

```bash
cd D:/python_project/manim_extend_rainbow
ls video_project/nobel_physics_2026
ls research/nobelphysics2026/originals
find video_project/nobel_physics_2026 -name "*.tsx" -o -name "*.ts" | head -50
# the 17 clip definitions + timeline/audio:
grep -rn "durationInFrames\|<Sequence\|audioSrc\|clipId" video_project/nobel_physics_2026/src | head -80
grep -rn "V10\|WorldV" video_project/nobel_physics_2026/src | head -40
```

Also confirm what's in `originals` (figures/PDFs) so I can map paper figure → clip without copying pixels.

---

## 1. Architecture: one canvas, one pure render function

Replace the V10 layer stack with a single `<canvas>` host driven by `useCurrentFrame()`. Canvas 2D (not WebGL) is sufficient: your hardest case is ~5160 dots + ~40 cone polylines + text, which is well under budget at 30 fps offline render.

```
video_project/nobel_physics_2026/src/worlds/v07/
  CanvasWorldV07.tsx        host: canvas, DPR=1, renderFrame() on frame change
  core/  frame.ts  camera.ts  projection.ts  rng.ts  palette.ts  math.ts
  geo/   icecube.ts  iceVolume.ts  earth.ts  skymap.ts
  physics/ cherenkov.ts  cascade.ts  interaction.ts  timing.ts
  layers/ iceVolume.ts  depthRuler.ts  stringLattice.ts  cherenkovCone.ts
          domHits.ts  leptonTrack.ts  cascadeGlow.ts  eventDisplay.ts
          earthVeto.ts  evidencePanel.ts  skyMap.ts  annotations.ts
  scenes/ clip01.ts ... clip17.ts     (beat sheet + layer set per clip)
  data/   icecube_strings.json  events_2013.json  events_37.json
          ic170922a.json  ngc1068.json
```

**Host — the only React in the world:**

```tsx
// CanvasWorldV07.tsx
export const CanvasWorldV07: React.FC<{clip: ClipSpec}> = ({clip}) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext('2d', {alpha:false})!;
    ctx.setTransform(1,0,0,1,0,0);            // fixed 1920x1080, no DPR scaling
    ctx.clearRect(0,0,W,H);
    renderFrame(ctx, clip, frame);             // PURE. no closures over time.
  }, [frame, clip]);
  return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute'}} />;
};

export function renderFrame(ctx, clip: ClipSpec, frame: number): void {
  const cam  = evalCamera(clip.beats, frame);
  const view = camToView(cam);
  const d: DrawCtx = {ctx, frame, cam, view, clip,
    project: (p) => project(p, view, cam.fovDeg),
    rng: (salt) => mulberry32(hash(clip.id + salt)),
    palette: PALETTE};
  for (const layer of clip.layers) LAYERS[layer](d);   // fixed order, fixed array
}
```

No `requestAnimationFrame`, no CSS transitions, no `Date.now()`, no `Math.random()`. Every visual is a function of `(clip, frame)`.

---

## 2. Geometry: the detector as real numbers

World frame, metres, right-handed: **X** east, **Y** up (surface at `y = 0`), **Z** north. Depth is `y = -depthM`.

```ts
// geo/icecube.ts
export const ICE = {
  nStrings: 86, domsPerString: 60, nDOMs: 5160,
  topDepthM: 1450, bottomDepthM: 2450, domSpacingM: 17.0,
  stringSpacingM: 125, instrumentedRadiusM: 575,   // ~1 km^3 envelope
  iceTopStations: 81, iceTopTanksPerStation: 2,
  nPhase400nm: 1.3193, nGroup: 1.35,
  cMetresPerNs: 0.299792458,
  absorptionLenM: 120, scatteringLenM: 20,
} as const;

export function buildArray(table: Vec2[] | null): {positions: Vec2[]; doms: DOM[]};
export function loadStringTable(): Vec2[] | null;   // data/icecube_strings.json
export function fallbackHexLayout(): Vec2[];        // 8 hexagonal rings, 125 m pitch
export function assertTopology(doms: DOM[]): void;  // throws unless 86 strings / 5160 DOMs
```

`assertTopology` is a hard gate — if your extracted string table doesn't yield exactly 86 × 60, the build fails loudly rather than shipping a 90-string detector. Put the real DOM coordinates in `data/icecube_strings.json` if the papers give them; otherwise the hex fallback with `instrumentedRadiusM = 575` and 17 m vertical pitch is a defensible schematic. **Label it as schematic in a footnote annotation** when you use the fallback.

Earth (for the veto shot): sphere radius 6371 km, IceCube at 90°S, so the visible chord for a northern-sky neutrino is a full diameter minus ~200 m of ice.

---

## 3. Physics → primitives

```ts
// physics/cherenkov.ts
export function thetaC(n: number, beta = 1): number;           // acos(1/(n*beta))
export const THETA_C_DEG = 40.35;   // n=1.3193 → the number to quote on screen
export function coneRings(vertex: Vec3, dir: Vec3, theta: number,
                          radiiM: number[], segs = 96): Vec3[][];
export function domHitTime(vertex: Vec3, dom: Vec3, t0Ns: number, nGroup: number): number;
export function geometricTime(vertex: Vec3, dom: Vec3, nGroup: number): number;
export function photonAmplitude(rM: number): number;  // exp(-r/120)/(4πr²), normalised at r=10
export function residual(tHit: number, tGeom: number): number;  // ns, for the colour map
export function wavefrontRadius(tNs: number, nGroup: number): number; // (c/n)*t
```

```ts
// physics/cascade.ts
export function cascadeExtent(EeV: number, kind: 'em'|'hadronic') {
  // hadronic: ~ 2-3 interaction lengths, tens of m; EM: Greisen X0 ~ 0.38 m ice
  return {lenM: number, radiusM: number, nPhotons: number, elongation: number};
}
export function cascadeGlyph(vertex: Vec3, dir: Vec3, EeV: number, seed: string): Vec3[];
export function muonRangeM(EeV: number): number;      // ~ km-scale at 100 TeV+
```

```ts
// physics/interaction.ts
export type Vertex = {pos: Vec3; tNs: number; kind: 'cc-mu'|'cc-em'|'cc-tau'|'nc'};
export function sampleVertex(clip: ClipSpec, frame: number): Vertex | null;  // null before interaction
export function leptonTrack(vertex: Vertex, seed: string): Vec3[];          // scattered polyline
```

`sampleVertex` returning `null` is how you get "the neutrino enters **silently**": for frames before `clip.interactFrame`, the entry track draws as a *dashed, low-alpha, physically-nothing* line — no Cherenkov, no DOM response, ice unperturbed. That contrast is the whole point of the shot.

---

## 4. Data → visual mapping (the table to implement literally)

| Data | Channel | Encoding |
|---|---|---|
| DOM charge (PE) | glyph radius | `r = 1.2 + 4.8 * clamp(log10(q+1)/3, 0, 1)` px |
| DOM hit residual time | fill colour | diverging map, −200 ns → `#2B6CFF`, 0 → `#F2F7FB`, +200 ns → `#FF6A2A` |
| DOM unlit | fill colour | `#22313F` at 2.0 px, no stroke |
| DOM behind vertex (fog) | opacity | `α = 0.25 + 0.75*exp(-(z - zNear)/900)` |
| Cherenkov cone | 96-gon rings at r ∈ {20,50,100,200,400} m + radial light sheet | additive, `α ≤ 0.55`, colour `#9FE8FF` |
| Cone apex→axis angle | protractor arc + label | `θ_C = 40.35°` |
| Ice index | inline label on refractive ray | `n = 1.319` |
| Wavefront sweep | ring radius vs frame | `R(frame) = (c/n_group)·(frame - f0)/fps·1e9` m |
| Muon track | 1.6 px polyline | `#C9B3FF`, alpha ∝ energy loss, dots every 50 m |
| Hadronic cascade | pear-shaped glyph | `#FFB769` core → `#FF6A2A` edge, length 10–25 m |
| EM cascade | tighter blob | same ramp, 5–10 m, higher peak brightness |
| Vertex | small crosshair + t₀ readout | `#3DDC97`, 10 px arms |
| 2013 result | panel numbers | `28 events`, `4.1 σ`, 2 in PeV range |
| 37 candidates | staircase count-up over frames | `5.7 σ` |
| Event 32 | rejected styling | `#7A7A8A`, struck-through label `background muon` |
| TXS 0506+056 | sky-map marker + separation arc | `0.06°` (≈3.6′), `3.5 σ` label |
| NGC 1068 | excess + asymmetric error bar | `79 +22 / −20`, `≈4.2 σ` |
| Significance σ | vertical shaded band behind panel bars | 2σ/3σ/5σ guide lines |

**Event-display style, not HUD.** The reconstructed-event look comes from: time-ordered DOM colouring + size-by-charge + a fitted line/cone overlaid + a numeric corner readout. No scroll bars, no fake oscilloscopes, no glowing grids, no corner brackets. If a UI element has no physical or measured quantity behind it, cut it.

---

## 5. Camera

```ts
// core/camera.ts
export type Beat = {frame: number; pos: Vec3; target: Vec3; fovDeg: number; rollDeg?: number};
export function evalCamera(beats: Beat[], frame: number): Cam;   // smoothstep between beats
export function camToView(cam: Cam): Mat4;                        // lookAt, right-handed, -Z forward
export function project(p: Vec3, view: Mat4, fovDeg: number): ScreenPoint | null;
// screen: x = 960 + (X/Z)*f, y = 540 - (Y/Z)*f, f = 540/tan(fov/2)
```

Rules:

- **fovDeg 26–34** for all in-ice shots → near-orthographic, keeps the lattice from splaying.
- **One move per beat.** Either a dolly or a target shift, never both plus a roll.
- Ease with `smoothstep` over the full beat span; no snap cuts except at clip boundaries (which the timeline already owns).
- Screen-space rule enforced in `project`: reject/flip content above `SAFE_TOP = 285`. Content region is `y ∈ [285, 1035]`.
- Evidence panel: `PANEL_X = 1420` for the wide variant, `1100` for the two-column variant. Read this from the current layout rather than hardcoding — add `LAYOUT.safeTop = 285`, `LAYOUT.panelX = 1420`, `LAYOUT.panelRight = 1880` and drive every panel from those.

**Proposed beat sheet** (map 1:1 onto your 17 clips; names are placeholders until you paste the manifest):

| # | Clip | Beat | Camera |
|---|---|---|---|
| 01 | Antarctic | Establishing orbit, limb, South Pole pin | 24° fov, slow 6 s push-in, altitude 400 km → 120 km |
| 02 | Ice volume | Cut to cross-section, ice slab from surface to 2450 m | 30° fov, side-on, horizontal dolly |
| 03 | Array | Pull back to reveal 86 strings / 5160 DOMs | 32° fov, pull to r=2600 m, counters tally |
| 04 | Silent neutrino | Track enters from below horizon, ice undisturbed | 28° fov, slow track-follow, no DOM response |
| 05 | Interaction | Vertex locks, then Cherenkov ignites | 28° fov, micro push-in on vertex at `interactFrame` |
| 06 | Cherenkov geometry | Side-on orthographic, protractor annotation | 26° fov, roll 0, cone axis horizontal on screen |
| 07 | DOM timing | Wavefront sweeps outward, hits light in time order | 28° fov, frame-follow wavefront |
| 08 | Reconstruction | Event-display: fitted vertex + direction cone | 30° fov, near-static, panel `x=1420` |
| 09 | Earth veto | Earth chord, through-going vs downgoing split | 28° fov, Earth limb shot |
| 10 | 2013 | 28 events, 4.1 σ | static, panel `x=1100` |
| 11 | Event 32 | Background muon counter-example | 30° fov, event-display styling in grey |
| 12 | 37 candidates | 5.7 σ staircase | static, panel `x=1100` |
| 13 | TXS 0506+056 | Sky map + 0.06° separation arc | 30° fov, map fills `x ∈ [0,1100]` |
| 14 | NGC 1068 | Excess 79 +22/−20, 4.2 σ | static, excess bar + asymmetric error |
| 15 | Sky summary | Both sources on one map | slow 3% push |
| 16 | Method recap | Detector schematic + veto logic | 32° fov, wide |
| 17 | Close | Return to establishing | mirror of 01 |

---

## 6. Colour and material

```
ICE_DEEP        #07131F      ICE_MID      #0E2A3C      ICE_NEAR    #17475E
ICE_SURFACE     #28607D      ICE_HIGHLIGHT #4E9BB8
CHERENKOV_CORE  #DFF6FF      CHERENKOV_GLOW #9FE8FF
TRACK_MUON      #C9B3FF      VERTEX       #3DDC97
CASCADE_CORE    #FFB769      CASCADE_EDGE #FF6A2A
DOM_UNLIT       #22313F      DOM_LIT_LO   #2B6CFF      DOM_LIT_HI  #FF6A2A
REJECTED        #7A7A8A      TEXT_PRIMARY #E8EEF4      TEXT_SECONDARY #8FA3B5
RULE_LINE       #2A3B4A
```

- No pure black (`#000`) and no pure saturated neon. Everything sits in a desaturated blue-cyan field with warm accents reserved **exclusively** for cascade/hit energy.
- Additive blending (`globalCompositeOperation = 'lighter'`) only for Cherenkov sheet and cascade core. Cap accumulated alpha at 0.85 — above that you get banding on the ice gradient.
- Glow radius is a function of physical distance and energy, never a fixed decorative blur. `glowRadiusR = clamp(1400 / rM, 3, 60)` px or similar; derive and document it.
- Depth cue is **fog + desaturation**, not outlines. Ice geometry has no visible edges.

---

## 7. Anti-roughness rules (the section that fixes V10)

1. **Ban the decorative grid.** Any grid must be a measurement: depth ruler ticks every 100 m at a fixed screen column, string-ID labels every 8th string. If it doesn't carry a number, delete it.
2. **Half-pixel snapping** for all 1–2 px strokes: `Math.round(x) + 0.5`. Kills the shimmer that reads as "rough".
3. **Minimum stroke 1.25 px**, minimum tick label 14 px, body text 20 px, section heads 28 px. Nothing sub-visible.
4. **Motion blur by deterministic sub-frame accumulation**: when camera speed > threshold, draw the frame 3× at `frame + k/3` with `α = 1/3`. No Temporal AA, no randomness.
5. **Fixed screen density.** Camera fov per beat is authored so DOM nearest-neighbour screen spacing stays in 3–9 px. Below 3 px you get moiré; above 9 px the array reads as sparse dots, not a detector.
6. **Cull before draw.** Frustum-test strings and DOMs. 5160 dots is fine, but culled drawing keeps you under 8 ms/frame and lets you sub-sample freely.
7. **One accretion direction.** Ice fills, then lattice, then physics, then data, then text. Never let a later layer visibly overlap an earlier layer's legibility zone (`y ≥ 285`, panel rectangle).
8. **Text is never drawn with a blur or a glow.** If it needs contrast, put an opaque panel behind it at `#0B1620` α 0.82.
9. **No `shadowBlur`.** It's slow, non-deterministic across platforms, and produces the soft mush that reads as "unfinished". Build glow from 3 concentric fills with declining alpha.
10. **Consistent units on screen.** Metres, nanoseconds, PE, σ. Every annotated number gets its unit. No "big number, no context".
11. **Assert, don't eyeball.** `assertTopology()` for 86/5160; `expect(result.nEvents).toBe(28)`; `expect(separationDeg).toBeCloseTo(0.06, 2)`. Wrong physics should crash the render, not ship.

---

## 8. Determinism checklist

- `useCurrentFrame()` is the only time source. `grep -rn "Date.now\|Math.random\|setInterval\|requestAnimationFrame\|<video\|@keyframes\|transition:"` must return nothing in `worlds/v07/`.
- Named PRNG per layer: `mulberry32(hash(clipId + ':' + layerId))`. Re-instantiating per layer means adding a layer doesn't shift existing noise.
- `Remotion spring()` is pure in `(frame, config)` — acceptable if used, but prefer explicit `smoothstep` so behaviour can't change under a library upgrade.
- Value-noise textures (ice sastrugi) from a seeded integer hash of grid coordinates, not from a pre-baked PNG and not from `Math.random()`.
- Render check: two renders of clip 07 must produce byte-identical PNG output (`ffmpeg -i a.mp4 -f framemd5 -`).

---

## 9. Local vs. advised

**You implement locally** (needs repo + render access — I have neither):

- Extracting string/DOM coordinates and the 2013/37-event tables from `originals` into `data/*.json`. Pull numbers and layout coordinates only — never raster-copy a figure or redraw it pixel-for-pixel; the requirement is *composition inspiration*, not reproduction.
- `CanvasWorldV07.tsx`, all of `core/`, `geo/`, `physics/`, `layers/`, `scenes/`.
- Wiring the 17 clips to the beat sheet, preserving the existing audio and `durationInFrames`.
- The `LAYOUT` constants read from the current V10 layout (I guessed 285 / 1100 / 1420 from your message).
- Render + framemd5 determinism test, and a per-clip visual-diff against V10.

**I advise only** (until you paste file listings): the architecture, physics constants and formulas, palette, beat sheet, encoding table, anti-roughness rules, and the mapping from paper figure → clip once I can see which figures you have.

**Not a rewrite.** V10's `Root.tsx`, the composition registry, the audio track, and the timeline stay untouched. The change is: swap the V10 world component for `CanvasWorldV07` inside each of the 17 `<Sequence>` blocks, and delete the V10 layer modules once parity is confirmed.

---

Paste the output of those `ls`/`grep` commands and I'll turn this into a file-by-file list with real paths, real clip names, and the exact `data/*.json` schemas to extract from each paper figure.