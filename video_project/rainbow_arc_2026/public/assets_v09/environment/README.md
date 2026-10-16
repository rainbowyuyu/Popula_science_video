# V09 rain-after terrace

Runtime asset: `rain_after_terrace_v09.glb`. glTF is Y-up and measured in metres.

The authored terrace is 14.4 × 14.6 m, with its optical floor at y = −0.005 m.
The original fountain remains centred at (−3, 0, 3). Both the terrace and the
ground have an actual opening for the basin: ground must not cover its stone
floor. Shallow stone treads and thin bronze drain seams define the terrace edge.
The centre stays clear for the observer, optical cone and teaching geometry.

The meadow has gentle deterministic undulations beyond the optical platform.
It uses the photographed CC0 `grass_ground` maps. Its fresh-green diffuse is an
authored, luminance-preserving colour grade; the original source is retained.
Nearby vegetation consists of genuine `fern_02`, `grass_medium_01` and
`shrub_04` meshes with photographic diffuse, normal and original alpha maps.
There are 105 sparse shared-mesh instances, not procedural tree primitives.

Sources and checksums: `cc0-source-provenance-v09.json` records provider URLs,
MD5 verification, local SHA-256 and alpha-map adaptations. `provenance-v09.json`
records the final GLB, native Blender source and colour-graded texture hashes.
All acquired Poly Haven sources are CC0 1.0; see `LICENSE.txt`. Native source and
Cycles review images are stored on C:; their exact paths are in provenance.

Rebuild with `D:/blender/blender.exe --background --factory-startup --python
scripts/build-environment-v09.py`. The builder only reads V08 originals and
exports new V09 files. It keeps packed maps in the native `.blend`.

The static Cycles review does not include live water, mist, rainbow, characters
or Remotion text; those are verified in actual integrated film frames.
