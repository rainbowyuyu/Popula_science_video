# Architectural environment and camera references — v3

Accessed and read directly from upstream public source on 2026-10-09. Runtime
Three.js is pinned to 0.180.0, so official examples below use tag `r180`.

## Read sources and license

| Source | Read material and design consequence | License |
|---|---|---|
| [Three.js Sky source](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Sky.js) | Read Rayleigh/Mie optical-depth calculation, sun-position uniforms, far-plane vertex handling and tone mapping. Use the actual imported `Sky`, not a flat invented sky gradient. | Three.js MIT |
| [Official sky example](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shaders_sky.html) / [live example](https://threejs.org/examples/#webgl_shaders_sky) | Read elevation/azimuth conversion and turbidity/Rayleigh/Mie controls. A fixed daytime sun gives one continuous lighting condition; the final elevation is synchronized to the measured photographic HDRI sun. | Three.js MIT |
| [Official ocean/sky example](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shaders_ocean.html) | Read the separate Sky capture scene and `PMREMGenerator.fromScene` → `scene.environment` workflow. This film makes one initialization capture, with no per-frame environment rebake. No ocean code or water asset was copied. | Three.js MIT |
| [PMREM implementation](https://github.com/mrdoob/three.js/blob/r180/src/extras/PMREMGenerator.js) / [API](https://threejs.org/docs/#api/en/extras/PMREMGenerator) | Read `fromScene(scene, sigma, near, far, {size, position})`, default 256 size and roughness filtering. The first implementation used a 256 procedural capture; the final implementation uses a modest 1K real HDRI and `fromEquirectangular`. | Three.js MIT |
| [Physical transmission example](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_materials_physical_transmission.html) | Read the difference between opacity and physical transmission; thickness and environment reflections are separate controls. Environment supplies a useful actual sky reflection. Material changes belong to the main World integration, not this environment module. | Three.js MIT |
| [pmndrs/drei Sky](https://github.com/pmndrs/drei/blob/master/src/core/Sky.tsx) | Read its sun-angle conversion and direct Sky uniform mapping. Confirms that a procedural physical sky works in React/Three without an external raster backdrop. No source was copied. | MIT, copyright 2020 react-spring |
| [pmndrs/drei Stage](https://github.com/pmndrs/drei/blob/master/src/core/Stage.tsx) | Read separation of environment, key/fill lighting and grounded presentation. Apply restraint: one shadow-casting sun, low fill and a quiet background. No source was copied and the component is not a new dependency. | MIT, copyright 2020 react-spring |

The licenses were read at
[Three.js r180 LICENSE](https://github.com/mrdoob/three.js/blob/r180/LICENSE) and
[drei LICENSE](https://github.com/pmndrs/drei/blob/master/LICENSE). Both permit
use/modification/distribution and require retaining the copyright and permission
notice with substantial copied software. The project imports the installed
Three.js Sky module under its existing MIT license; it does not vendor upstream
source into a new file. Three.js copyright is 2010–2025 three.js authors. The
custom cloud field and camera adjustments are original project code. A real CC0
photographic HDRI was subsequently downloaded, verified and used for reflection
lighting; the complete asset and licensing record is below.

## Implemented choices

- `src/CinematicEnvironment.ts`: actual Sky atmosphere, a deterministic four-octave
  thin cloud shell, and a neutral ground below the pile section. The previously
  tested instanced city was **removed** after actual stills showed a false box-like
  horizon. No geographic skyline is implied.
- Actual HDRI `Kloofendal 48d Partly Cloudy (Pure Sky)` supplies PMREM reflections.
  Only the actual Sky/cloud geometry is the visible background; no artificial
  reflection card remains. `ready` waits for the local asset and PMREM creation,
  so rendering cannot catch an intermediate lighting state.
- HDRI brightest pixel at x=609, y=119 in a 1024×512 Radiance map establishes a
  47.99-degree solar elevation. Sky and the shadow-casting directional light use
  the same elevation. The environment uses yaw only to match the existing
  film-light azimuth (-52 degrees in Three spherical coordinates). The yaw is
  derived from equirectangular UV and the actual r180 `environmentRotation`
  lookup convention in `WebGLMaterials.js`, avoiding a competing reflection sun.
- One 2048 PCF sun shadow plus low fill and hemisphere. No screen-space AO/bloom
  or artificial lens-flare pass is introduced. The real HDRI naturally contributes
  indirect cloudy-day variation; the glass material remains root's responsibility.
- Camera and lighting are pure functions of initialization plus film time.
  Sky/clouds recenter as distant layers. The procedural ground fades beyond
  32–67 scene units, avoiding a sharp finite-stage border.
- `src/CameraPath.ts`: lower approach in the opening and return, wider rise over
  the opening facade, measured pitch changes in component close-ups, and a larger
  final orbit. Wind viewpoint elevations are .22/.28/.32 at u29.6/30.4/31.5 to
  show paths wrapping around the tower. Existing focus anchors, nine-cell top-down
  section, fixed lens, displacement multipliers and TMD relative scale remain.
- The exact prior camera source is `CameraPath-v2.ts` beside this file.

## Root integration contract

1. Remove the old `RoomEnvironment` import, old PMREM/light setup and standalone
   160×160 ground plane from `World`.
2. Construct `new CinematicEnvironment(scene, renderer, base)` once and retain it on
   World. The class owns environment texture, atmosphere, fog, ground and lights.
   Keep renderer local clipping enabled in World. Add `environment.ready` to the
   World initialization `Promise.all` so no frame precedes HDRI readiness.
3. After the final camera follow/lookAt in each `World.update`, call
   `cinematicEnvironment.update(state, camera)` before the render. It must not be
   called before camera placement.
4. Call `cinematicEnvironment.dispose()` in World disposal. Do not also dispose
   its PMREM target via the old `environment` field. The film's original site
   plaza/plinth and force/soil objects remain independent.
5. Inspect encoded/still samples of the opening, piles, nine-cell core, garden,
   wind, TMD, construction and return before committing a full render. A passing
   TypeScript check does not confirm lighting, cloud or title readability.

## First-still correction

The first stills at F80, F300, F690 and F2350 were actually opened and inspected.
They exposed a pale reflection fill, the finite ground boundary, and city clusters
that resembled isolated blocks. The next adjustment reduces environment/ambient
fill, gives the physical sky a small cool photographic grade, makes the thin
cloud forms more visible, softly blends the distant ground into the atmosphere,
and moves the contextual city to a continuous low silhouette at 56–64 scene
units. A broad light card appears only in the initial PMREM capture and cannot
enter a film camera view. Wind views now pitch upward in viewpoint elevation to
show the front/back streamlines' spatial separation. These corrections still
require inspection of newly rendered images.

An optional Poly Haven `kloofendal_48d_partly_cloudy_puresky` API/license lookup
was attempted on 2026-10-09, but the server returned HTTP 403 for those requests.
No asset from that service was downloaded or used, and no CC0 claim is made for
an unverified downloaded asset.

## Actual second-still inspection and final environment correction

Opened the actual second-pass F2375 and F10341, rendered at 00:44–00:45 on
2026-10-09. The nine-cell core had more readable lit/shadow faces, and the facade
had clearer blue-gray contrast. The finite floor edge was softened. However,
the distant contextual city still appeared as a ring of white boxes, so all city
geometry and code was removed. These were actual rendered-image findings, not a
TypeScript-based aesthetic claim.

At this inspection stage the real photographic HDRI had **not** yet been rendered.
Its lighting must be checked using fresh F35/F2375/F10341 output. The downloaded
HDR preview was inspected: it contains real blue sky, varied cumulus clouds, an
unclipped sun and an intentionally sky-only lower hemisphere. It has no buildings
or location-specific Shanghai scenery.

## Downloaded HDRI provenance and license

The first anonymous request returned HTTP 403. A later request with a standard
browser User-Agent succeeded with HTTP 200 for asset, metadata and license.
The following were downloaded and read on 2026-10-09:

- Asset page: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Metadata: https://api.polyhaven.com/info/kloofendal_48d_partly_cloudy_puresky
- Original creator: **Greg Zaal**; pure-sky edits: **Jarod Guest**.
- License: **CC0**, explicitly applied to HDRIs, textures and models on
  https://polyhaven.com/license. The saved HTML states: "Our assets are all
  licensed as CC0" and permits commercial work and redistribution. API metadata
  and the license page are research evidence, not embedded visible film content.
- File: `public/environment/kloofendal_48d_partly_cloudy_puresky_1k.hdr`
- Source: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr
- Size: 1,435,119 bytes; format verified as Radiance RGBE, 1024×512.
- SHA256: `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`
- Evidence: `polyhaven-license.html`, `polyhaven-asset-info.json`, and
  `polyhaven-download.json` alongside this note. `hdri-preview.jpg` is a derived
  tone-mapped inspection view, never used as film scenery.

No skyline, model geometry, component identifier or solver response was altered
as part of the environment change.

## First real-HDRI still inspection

Actually inspected new F35, F2375 and F10341 rendered at 00:50–00:51 on
2026-10-09. The box-ring skyline is gone; the warm core wall tops and shaded
interiors are clear, and the tower's curved envelope has continuous reflection
variation. The opening glass is too dark navy, however. Inspection of Three
r180 `WebGLRenderer.js` around line 2501 verifies that a material with no explicit
`envMap` uses `scene.environmentIntensity`, even when its `envMapIntensity` is
set. Therefore the current glass did not use its specified 1.4 multiplier.
The scene HDRI multiplier was raised from .30 to .70 to lift reflection light
while retaining direct-light shadows. Exposure and sun power were not increased.
Fresh F35/F10341 are required to assess this scalar correction.

The scalar yaw was independently checked by applying Three's lookup rotation
to the desired world solar direction. It yields the measured HDRI direction to
3.72e-16 vector error. Environment yaw is -107.72265625 degrees. This verifies
alignment math; it does not substitute for actual reflection/render inspection.

## Final module lock

Verified installed package metadata, not only `package.json` requests:
`three 0.180.0`, `@types/three 0.180.0`, `@react-three/fiber 9.3.0`, and
`remotion 4.0.526`. `RGBELoader` is deprecated **in r180 itself** and is a thin
subclass of `HDRLoader`; the import is changed to the official `HDRLoader` without
changing decode behavior. The warning was not evidence of an unexpectedly newer
Three installation.

Final environment intensity is .70. All other environment/camera settings are
locked pending the parent's final two stills and full render. The environment
agent has inspected the cited individual frames only, and has **not** reviewed
every frame of a final encoded v3 movie. No full-film aesthetic certification is
claimed here.

## Locked .70 verification (individual stills)

Opened actual new F35 (00:55:16), F6439 (00:55:28) and F10341 (00:55:46),
2026-10-09, after the .70 environment change and HDRLoader import. The opening
now retains visible panel/reflection variation rather than an almost-black
facade. The return has a clearer lit blue-gray face and continuous curvature
highlight; background remains quiet, with no city boxes or hard stage edge.
F6439 shows the whole tower and front/back streamline layers without camera
clipping. The sky/cloud layers are subtle and accepted as a quiet background;
they are not claimed as a high-contrast photographic sky. These observations
support locking the environment for the parent render. They cover these stills,
not the final encoded film or every camera transition.
