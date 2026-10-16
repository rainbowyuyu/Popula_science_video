# Nobel 2026 V2 visual upgrade (2026-10-06)

## Implemented

- Reduced the editorial ivory wash over the Three.js stage from 0.94/0.50 to 0.72/0.24. This keeps the light paper layout while restoring separation between the scientific model and the title layer.
- Added deterministic camera drift (2.8 px horizontal / 1.8 px vertical) and a 1.008–1.012 scale breathing motion to keep the stage alive without making captions move.
- Scene titles now enter from the right edge with a short easing move. Official evidence cards enter from the right and callouts enter from the left; no card uses a hard visible toggle as its first frame.
- Three.js scene groups now leave to the left while the next group enters from the right with a slight z/y rotation and 3.5% scale settle. This preserves the continuous handoff requested for the film.
- Increased tone-mapping exposure to 1.14 and strengthened the brain / ChR2 materials so the explanatory model survives the ivory compositing layer.

## QA evidence

- `npx tsc --noEmit --pretty false` passes.
- `node scripts/render_nobel2026_v2.mjs stills` regenerated hook, context, algae, channel, neuron, brain, impact and references stills.
- `delivery/nobel2026_v2/preview-segment.mp4` (frames 810–860) was rendered and inspected as `tmp/transition-810-860.jpg`; the hook brain exits left while the context brain enters from the right without a direct disappearance.

The short transition re-render after the latest patch was skipped when Remotion bundling hit a transient Windows file lock while copying `public/episode3/master.wav`; this is unrelated to the TypeScript changes.
- Mechanism legend pills now share the same right-side entrance easing as evidence cards.
- In-vivo brain view uses a cyan wireframe cranial shell (rather than a milky filled shell) so the fiber, marked cells and mouse remain legible under the paper layer.
