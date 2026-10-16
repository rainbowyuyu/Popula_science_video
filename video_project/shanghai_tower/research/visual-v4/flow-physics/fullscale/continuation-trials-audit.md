# Isolated real SU2 continuation trials

Recorded 2026-10-09. Both executions completed normally with SU2 8.5.0, but
**neither is accepted for CFD-to-structure coupling**. No production/public
inputs or renderer assets were changed. Each run used two CPU threads.

| Case | U reference | Steps | Exit | Last log10 residuals: P / U / V / W / nu | Tail CD mean ± std | Tower y+ p95 |
| --- | --- | --- | --- | --- | --- | --- |
| `candidate-sa-negative-u05-v2` | 5 m/s | 1200 | 0 | 0.700 / 1.347 / 0.746 / 1.356 / -1.064 | 0.653 ± 0.197 | 0.334 |
| `candidate-sa-negative-u01-v1` | 1 m/s | 600 | 0 | 1.492 / 2.131 / 1.401 / 1.963 / -1.827 | -2.053 ± 0.633 | 0.197 |

Both cases use the copied full-scale crown-resolved mesh, SA with
`SA_OPTIONS=(NEGATIVE, WITHFT2)`, no wall functions, a scaled inlet profile,
and fixed CFL (2 and 1 respectively). Their velocity and Reynolds numbers are
explicitly different from the target U500 = 30 m/s case. Steady pseudo-iterations
are not physical time and cannot be used as an animation timeline or interpreted
as a vortex-shedding frequency.

The finite-field and raw pressure/Cp consistency checks pass. All five primary
residuals remain far above the requested -7 threshold; force coefficients remain
unsteady/drifting. Low tower y+ alone cannot make the flow converged. In
particular, the negative tail drag of the 1 m/s candidate is not a validated
physical result.

Each case contains `run-state.json`, `input-manifest.json`, `history.csv`,
`run.log`, `final-assessment.json`, and `acceptance-report.json`, plus the actual
SU2 restart, volume, and surface field outputs. The acceptance reports retain
`acceptedForCoupling=false` and `REJECTED_FOR_COUPLING`.

## Spatial residual evidence

The diagnostics now select only explicitly named `Residual_*` fields. An early
substring selector also matched `Pressure`; those pressure-field values must
not be interpreted as residual concentration. The final reports are corrected.

- At 5 m/s, the region z < 0.01 m and radius > 100 m contains about 23.4% of
  squared pressure residual and 40.7% of squared velocity residual. The near-tower
  region radius < 100 m, z < 640 m contains about 0.172% and 0.106% respectively.
- At 1 m/s, the same remote-ground region contains about 89.3% of squared
  pressure residual and 55.7% of squared velocity residual. The largest pressure
  residuals lie on the very thin remote-ground prism layer.
- The 1 m/s turbulence residual maxima concentrate near the inlet/side-ground
  intersections. The imposed inlet profile remains a clamped power law, not a
  measured or demonstrated equilibrium atmospheric boundary layer.

These observations support investigating the remote-ground cells and inlet/wall
treatment before extending the same low-speed steady sequence. They do not
isolate a single proven root cause.

## Recommended next isolated experiment

1. Prepare a mesh family that resolves the tower wall independently from remote
   ground, avoiding the current 10 micrometre first layer over kilometre-scale
   ground faces. Use documented compatible near-wall treatment and an equilibrium
   inlet/ground boundary layer. Audit positive cells, surface closure, prism
   quality, y+, and global boundary flux before accepting the mesh.
2. Run first-order stabilization followed by second-order continuation only as
   separately recorded numerical stages. An isothermal incompressible setup may
   remove the unnecessary enthalpy equation, but changes must remain isolated
   and must not be presented as a solved thermal model.
3. If steady residuals/forces remain periodic, evaluate URANS with true physical
   time stepping, discard startup, average multiple shedding cycles, and perform
   time-step/mesh sensitivity. Do not relabel steady pseudo-iteration oscillation
   as measured physical dynamics.
4. After the target 30 m/s case passes the full acceptance gates, integrate tower
   pressure and viscous traction with body-outward normals, verify total force
   and moment, then use the six-component conservative structural mapper.

## Structural pipeline verification

The independent mapping suite passes 14 tests. The previously executed local
Zwind/OpenSees synthetic smoke response passes its read-only QA, including all
132 six-component nodal loads, static force and moment balance, finite dynamic
steps, TMD identities, and six-component base wrench. This verifies executable
coupling plumbing, not CFD convergence or as-built structural calibration.
