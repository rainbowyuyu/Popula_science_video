# V08 photographed outdoor environment

The accepted set uses an original Blender terrace and recessed masonry basin, with a real CC0 photographed landscape. The rejected procedural mountains and pine fronds are **not present in the exported GLB**. The Python file keeps these disabled draft sections only for a recoverable edit history.

## Assets and coordinates

- `rain_after_terrace_v08.glb`: a 28 m × 32 m slate platform, actual pool recess and chamfered coping, basin floor, bronze emitter, low side curbs and two restrained benches. Water is supplied by the existing Three.js/WaterPro component, not baked in this asset.
- `observer_v08.glb`: illustrative adult in a fitted raincoat with worn hood, tapered sleeves and trousers, relaxed hands and solid shoe soles. Feet y=0; reference eye y=1.55 m; hood top about 1.747 m; faces +Z. It is an authored silhouette, not a human scan.
- `rain_after_terrace_v08.blend`: native editable source with the observer placed at z=7 for the environment preview. Separate GLB observer keeps its origin at its feet.
- `hilly_terrain_01_2k.hdr`: Poly Haven photographed landscape, CC0. The full metadata, source URL and verified hash are in `landscape-provenance.json`.
- `textures/`: original 2K Poly Haven `slate_floor_02` diffuse, OpenGL normal and ARM; verified against provider MD5. The grayscale diffuse derivative reduces saturation for this episode. An authored deterministic woven-cloth normal map adds restrained garment surface detail.

The slate UVs repeat at 2 m per source tile. The fountain is centred at (-3,0,3), with a 1.48 m inner water radius and top of coping at y=.155 m. The bronze riser extends down to the pool floor and ends at the actual mist emitter height around .90 m. Its support and the basin have real depth and do not float.

## Film integration

Create `EnvironmentV08(renderer, scene)` as in V07. Before `continueRender`:

```ts
const [set, originalHDR] = await Promise.all([
  new GLTFLoader().loadAsync(staticFile('assets_v08/environment/rain_after_terrace_v08.glb')),
  new HDRLoader().loadAsync(staticFile('assets_v08/environment/hilly_terrain_01_2k.hdr')),
]);
world.cinema!.attachAsset(set.scene);
world.cinema!.attachLandscape(originalHDR, -.88);
originalHDR.mapping = T.EquirectangularReflectionMapping;
const pmrem = new T.PMREMGenerator(renderer);
const reflection = pmrem.fromEquirectangular(originalHDR);
world.cinema!.setReflectionEnvironment(reflection.texture);
pmrem.dispose();
```

Keep `originalHDR` alive until film disposal: the sky uses the original panorama; PMREM is only for reflections. The owner disposes both HDR and PMREM target. Remove the older `World.nature` torus coping; it duplicates the grounded basin. The water mesh, bottom and mist animation remain controlled by the optical world. Optional environment rotation must be consistent with the sky panorama after visual review.

The outdoor asset fades its visual contrast into the quiet optical studio through `update(frame,micro)`. This does not change the Snell geometry. The panorama is an artistic photographed backdrop without translational parallax; the terrace and fountain are genuine meshes. Do not describe the panorama as a 3D terrain scan or weather simulation.

## Inspection

Three Cycles stills are included: `set_overview.png`, `fountain_masonry_closeup.png`, `observer_garment_closeup.png`. The isolated set stills intentionally omit the live water, mist, rainbow and optical rays. The first draft was rejected after inspection; the accepted draft fixes the UV scale, removes sharp procedural mountain/tree shapes, connects the shoulders into the sleeves, adds a worn hood, and removes detached garment seams.

Rebuild:

```powershell
python scripts/fetch-environment-v08.py
& 'D:/blender/blender.exe' --background --factory-startup --python scripts/build-environment-v08.py
```

The derived diffuse and authored cloth texture are preserved in this local project. Both need to exist before rebuilding. Source assets remain unchanged.
