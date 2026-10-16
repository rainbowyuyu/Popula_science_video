# Nobel short V5.1 — production notes

## Baseline and delivery

V5 remains the rollback. V5.1 has an independent composition, entry point,
timeline, render script and output directory. Duration remains 8192 frames at
30 fps (273.0667 s), 1920×1080. The public `audio-v5` source remains protected.

Commands, from this project:

```powershell
npm run check
npm run stills:nobel:v51
node scripts/render_nobel2026_v51.mjs beats
npm run render:nobel:v51 -- --concurrency=4
```

## Visual direction

Ivory ground, dark teal type, blue illumination, gold electrical signals and
green algae. Sharp biomedical contours replace oversized blurred points.
The visual language is a stylized educational reconstruction; the original
Nobel illustrations remain separately identifiable documentary sources.

The heading uses a frozen Noto Serif SC 700 subset. Body and captions use a
frozen Noto Sans SC 550 subset. The renderer waits for both fonts, and the
Canvas is not transformed by continuous fractional camera drift. Text is
not reconstructed or moved on each value update.

## Editorial geometry

- Brand: x100, y44. Header rule: y122.
- Heading: x104, y143, 62 px; subtitle: 27 px, y234 approximately.
- Main teaching area: x100–1000, y345–875.
- Documentary evidence: x1110, y380, 720×405.
- Research credit: x1110, y272, width710; two lines, appears for about 6 s.
- Spoken captions: x100–1820, y952–1028; one timed phrase, fixed baseline.
- Hook/context/impact may use the full stage, except that clip001 reserves
  x1190–1820 for the three scientists' names.

Persistent side labels and repeated callout cards were removed. Each object
label belongs to the object coordinate system; all timing comes from the
same measured subtitle cues. Both sides of any shared trajectory use the
same curve evaluator and sampling convention.

## Scientific motion rules

- Blue illumination plus opsin expression produces the response. Light
  does not recognize a cell's genetic tag or automatically avoid other cells.
- ChR2 is a passive cation channel, not a pump. A current transient and
  sustained plateau are distinct from a neuron's action-potential waveform.
- The 2005 cultured-neuron experiment, 2007 motor cortex experiment, 2007
  awakening experiment and 2012 engram experiment use separate attribution.
- Liu et al. 2012 demonstrates that reactivation is sufficient to evoke the
  fear response in that setting. It is not a necessity experiment.
- The clinical eye sequence concerns early partial recovery and the need for
  gene delivery and a dedicated light source; no restoration-to-normal claim.
- Schematic traces contain no fabricated experimental measurements.

## Evidence and continuity

Evidence targets are original image-pixel rectangles linked to actual phrase
onsets. A focus move lasts 0.8 s, followed by a stable hold. Closed and open
membrane panels have separate clipping viewports. The motor-cortex illustration
exits before sleep and memory experiments, where it is not appropriate.

Scene transitions use a 24-frame controlled dissolve with a small outgoing
translation. The shared background and brand remain stable. All animation is
frame-driven; there is no CSS clock, `Date.now()` or unseeded random sampling.

## Collaboration and review

Actual external-model report, final hashes, adoption scope and visual QA are
recorded in the delivery report after the final render. An external response
is not an acceptance result. No Qwen bridge is claimed without a checked local
video asset and its generation record.
