# V10 solver → video interface

All production-ready exports will be written under `research/physics-v10/export/`; the solver never writes `public`.

`response.json` preserves `rainbow.shanghai-physics/1` and adds `modelVersion:10`. `nodes` contains every actual shell/beam/truss/diaphragm node with `id,tag,xyz,level,role`. `members` contains **only the 1,852 beam/truss elements**, preserving old IDs. `walls` contains actual four-node ShellMITC4 elements: `{id,tag,nodeIds:[n1,n2,n3,n4],meshIds,thickness_m,localAxes:[horizontal,vertical,normal],zone}`. All wall nodes and beam endpoints are in `nodes`.

`static.{gravity,windOnly,windPlusGravity,zero}` stores `u[N,3]` metres, `r[N,3]` radians, `axialMPa[M]` signed tension-positive and `extremeMPa[M]` for beam/truss members. `nodeIds` and `memberIds` define exact order. `static.wallStress` contains `wallIds` plus `gravity`, `windOnly`, `windPlusGravity`; each holds `verticalMPa[S]` as mean of four integration-point **vertical membrane stress**. This is a wall stress, not equivalent-column axial stress. Raw section resultants at all four integration points remain in NPZ archives.

`cinematic-response.json` and `.f32` use the existing format and independent fields `u[T,N,3]`, `r[T,N,3]`, `axialMPa[T,M]`. All are **wind increments about converged gravity**. Metadata records byte offsets, Float32 shape, hashes, units, and time grid. `time={start:0,end:60,dt:0.05,count:1201}`. Low frequency `response.dynamic` samples at one second.

`shell-response.json` and `.f32` use `{schema:'rainbow.shell-response/10',binary:'physics/shell-response.f32',time:{start:0,end:60,dt:0.05,count:1201},wallIds,fields:{verticalMPa:{offsetBytes:0,length,shape:[1201,S]}}}`. Dynamic values are signed mean membrane stress **increments**. Add static gravity for total stress. No per-frame color normalization.

`N_CORE_###` IDs are actual rigid-floor master nodes, **not core-beam nodes**. Their solved lateral UX,UZ and torsional RY are valid. UY,RX,RZ are fixed because the master has no physical element in those DOFs; use individual wall nodes for axial shortening and wall rotations. Floors/facade may follow solved lateral master motion. Do not invent an equivalent core member to carry stress. A display-only axis connecting masters may have `transportOnly:true,index:-1`.

Raw solver graph deliberately contains both lines and walls in `members`, but production exports split them as above. Shell stress resultants are ordered `[N11,N22,N12,M11,M22,M12,Q13,Q23]`, four Gauss points. First/second local axes are horizontal/up; membrane forces have N/m, moments N·m/m, transverse shear N/m. Stress uses resultant / thickness / 1e6. `wallVerticalMPa` therefore is N22/t/1e6. Full raw tensors must not be interpreted as stress without the thickness conversion.

The wind load is an explicit illustrative U500=30m/s power-law profile, Cd=1.2; it is independent of qualitative CFD. Geometry/material/loads are documented public-source reconstruction assumptions, not the author's/as-built FE model or capacity verification.
