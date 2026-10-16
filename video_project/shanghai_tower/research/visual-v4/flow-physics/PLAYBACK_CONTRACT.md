# Computed section flow — integration contract

**Field meaning:** SU2 8.5.0, incompressible Navier–Stokes, laminar 2D, Re = 100,
unit density and inflow speed, viscosity 0.01, reference diameter D0 = 1.
The polygon matches the film's rounded-triangle support function (`a = 0.10`).
This is an educational section computation, not full-scale Shanghai Tower CFD.

Display the short label **二维截面流动教学计算 · Re=100** when showing it.
The full-building Zwind loads must remain separate from this field.

## Ready shape and binary format

`section-smoke/playback/manifest.json` already provides the final schema for
development. Its initial-startup field is only a smoke test, not the final shot.
The eventual source will be `tower-section-re100-mg/playback/manifest.json`.

- CFD body center is `(x,y) = (0.5,0)`. Subtract it before world placement.
- Body coordinates include a 25-degree counterclockwise rotation in CFD x/y.
- Inflow is `(u,v) = (1,0)`, so the wake extends toward positive CFD x.
- Coordinates, velocities, Cp and time are nondimensional.
- Native mesh: 13,336 points / 26,192 triangles, exact no-slip wall.
- Regular playback grid: `nx = 201`, `ny = 121`, x from −2.5 to 7.5,
  y from −3 to 3, both ascending. Change/crop the view without moving the body.
- `fields.f32` is little-endian Float32, C order `[frame,field,y,x]`.
  Fields 0–3 are `u`, `v`, `Cp`, `vorticity`.
- Array index: `(((frame * 4 + field) * ny + iy) * nx + ix)`.
- `valid-mask.u8` is `[ny,nx]`, 0 inside solid/outside CFD mesh and 1 in fluid.
  Padding inside solid is zero; never interpret this as measured flow or
  interpolate across the solid boundary.
- `surface-cp.f32` is `[frame,bodyPoint]` in the same counterclockwise point
  order as `manifest.data.bodyBoundary`.
- Actual frame times are in `manifest.data.times`. Time interpolation is
  linear. A loop/reset must be hidden outside the shot unless phase matching
  is checked. Do not hand-oscillate the wake.

## Exact geometric placement onto the reconstructed tower

At chosen tower height `h` (metres in the existing reconstructed model):

```js
const theta = (120 * h / 632) * Math.PI / 180;
const delta = theta - 25 * Math.PI / 180;
const radius = 49 * Math.sqrt(1 - 0.55 * h / 632);
const scale = 2 * radius;
const qx = cfdX - 0.5;
const qy = cfdY;
const threePoint = [
  scale * (Math.cos(delta) * qx - Math.sin(delta) * qy),
  h,
  -scale * (Math.sin(delta) * qx + Math.cos(delta) * qy),
];
const worldInflow = [Math.cos(delta), 0, -Math.sin(delta)];
```

Equivalently, first map `(qx,qy)` to Three `(qx,0,-qy)`, scale by `2*radius`,
rotate about Three Y by **+delta**, and translate Y to `h`.
At `h = 131.6666667`, delta is zero and the world inflow is +X.

This transform matches geometry for viewing; it does **not** convert the
Re=100 computation into the building's atmospheric Reynolds number. Keep it
on one visible horizontal cut plane. Never extrude its Cp over the tower skin.

## Derived fields and use

Vorticity uses native triangle linear gradients of actual solved velocities,
area-averaged to nodes, then barycentrically sampled. Particle trajectories
must use temporal interpolation of u/v and spatial interpolation in valid
fluid. Use RK4 steps no larger than 0.02 nondimensional time for close shots.
For steady streamlines, hold a single time fixed and identify them as
instantaneous streamlines; those are not unsteady particle trajectories.

All values are from saved solver VTUs. Per-file SHA256, case configuration,
log/history, no-slip checks and finite-field metrics accompany the final data.
