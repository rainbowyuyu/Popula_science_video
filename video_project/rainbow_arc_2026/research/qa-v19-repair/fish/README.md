# Fish V19 repair

Frozen module: `src/FishObserverV19Repair.ts`. Same constructor, attach and update API as V16. Use `public/assets_v19_repair/characters/rainbow_fish_v19_repair.glb`.

The observer looks at the actual WorldV10 optical ray endpoint. Head and torso share upward gaze; scale is fixed per role (0.94 hero, 0.90 companion, 0.68 fountain). Actual eye midpoint remains at parent-local (0, 1.55, 0), even after parent translation, yaw and nonuniform scale. The camera argument is intentionally ignored.

The former camera-facing override, whole-body dark contour shell, black catchlights and accidentally white pearl eyes are removed. New Blender asset refines oval proportions, pearl eyes and muted pastel fins while keeping 20 bones.

`fish-audit.json` verifies all 10,702 frames, real skinned eye centers, actual bone-forward gaze, arbitrary seeks, imported rest-basis handling and source hashes. Ground clearance sampled every 300 frames is at least 0.272 m relative to observer ground. Gaze differs from the correct optical endpoint by at most 0.251 degrees.

Standalone multi-angle render was inspected. Initial integrated frames were inspected; the foreground fish at 10020 was then reduced to 0.68 fixed scale. Root owns final bundled frame review and timeline rendering.
