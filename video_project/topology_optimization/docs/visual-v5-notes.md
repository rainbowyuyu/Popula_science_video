# Nobel 2026 V5 visual notes

V5 is a five-minute editorial rebuild of the Nobel medicine short. It keeps the
Fourth Chapter rhythm (one spoken idea, one visible change, then a clean camera
exit) while replacing the small 3-D animal and anatomy models with a deterministic
2-D/2.5-D visual language. The canvas stage is `src/nobel2026/WorldV5.ts`; all
motion is driven by the timeline frame and remains stable in still renders.

## Visual stations

- **hook** — a light beam enters an abstract cortical loop and leaves a readable
  waveform; this is the question before any names or mechanism cards appear.
- **context** — four causal nodes carry one pulse from light to behaviour.
- **algae** — a flat Chlamydomonas silhouette, eye spot and a moving phototaxis
  trajectory introduce the first observation.
- **channel** — two membrane leaflets, a cyan gate and individual ions show the
  blue-light → channel → current sequence.
- **neuron** — a pulse travels down a drawn axon while the action-potential trace
  is revealed on the same clock.
- **brain** — an abstract cortex and optical fibre carry the mechanism; the
  official Nobel figure remains available in `EvidenceFigureV5` for the factual
  experiment view.
- **impact** — a causal circuit closes around a moving gold pulse before the
  paper stack appears.

## Qwen bridge slot

The Qwen video API is intentionally a bridge layer, not the source of scientific
facts. If a generated environment clip is approved, place it under
`public/nobel2026/qwen-v5/bridges/` and add its hash, prompt, model and start/end
frames to the V5 shot contract. Use only the real adjacent frames as the first
and last images; do not generate captions, formulas, logos or evidence data in
the clip. If the bridge is unavailable or a candidate changes identity/exposure,
the deterministic Canvas transition is the fallback.

## Editorial safe zones (V5)

The right 970–1830 px column is reserved for the original Nobel figure. The
mechanism drawing and its explanatory tags stay in the left teaching bay; they
must not extend beneath the evidence card. The lower 930–1035 px band belongs to
the spoken caption, so Canvas labels that repeat the callout are omitted there.
Research-team tags enter at y≈292 and use an opaque paper backing; moving ions,
neuron branches and the brain fibre are kept below or beside that band so the
names remain readable. Any new Qwen bridge should preserve these bounds and
fade out before the evidence card or caption enters.
