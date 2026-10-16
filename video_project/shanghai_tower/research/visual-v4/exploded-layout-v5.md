# Opening exploded layout v5

The opening assembly cue now uses the actual exported tower parts and a
deterministic 3-D presentation transform:

- `u = 2.2–4.2`: C2-eased fan-out and return, so no part appears or disappears
  at a cut.
- Core walls stay compact; columns, outriggers/belts, slabs and floor beams
  receive progressively larger radial offsets.
- Every part also receives a small tangent offset and a signed vertical lift.
  The stable FNV-style hash of its exported id fixes the phase, so neighbouring
  members remain spatially separated while the camera orbits.
- The transform is applied to `root.position` only. Rest vertices, solver
  anchors, CFD/Cp fields and force routes are untouched.

Verification:

```text
npm run check                       PASS
node scripts/check_camera.mjs       PASS
```

Fresh bundle stills were rendered with the NVIDIA D3D11 renderer at frames
500, 560, 620, 680 and 740. Frame 560 is the maximum exploded state; frame 620
shows the outer sleeves already travelling out of frame while the structural
members remain legible. Montage: `tmp/stills-hook-explode-v5/montage.jpg`.
