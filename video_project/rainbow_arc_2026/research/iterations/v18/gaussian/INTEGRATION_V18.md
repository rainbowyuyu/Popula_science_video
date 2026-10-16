# V18 Gaussian scene integration

- Build script: `scripts/build-gaussian-scene-v18.py`
- Source GLB: `public/assets_v18/environment/rain_garden_v18.glb`
- Binary: `public/assets_v18/gaussian/rain-garden-v18.splats.bin`
- Metadata: `public/assets_v18/gaussian/rain-garden-v18.splats.json`
- Validation: `research/iterations/v18/gaussian/gaussian-validation-v18.json`

The V18 point cloud is an authored, artistic covariance-splat conversion of the V18 Blender scene. It is not a trained photographic reconstruction and has no physical authority. Sampling uses a fixed NumPy seed (184207), the same Y-up coordinates and category budgets as V16, with colors sampled from the updated V18 GLB. The source GLB SHA is recorded in metadata and verified against the environment asset.

Validation passed: 419,573 records; 64-byte record size; finite values; positive anisotropic sigmas; quaternion residual 1.79e-7; colors/alpha bounded; complete deterministic depth permutations at frames 0/60/120/180/240; reverse/random seek reproduces frame 60 ordering.

The current V11 composition now points at the V18 Gaussian URLs and `GaussianSceneV16` accepts metadata versions `V16 | V18` while preserving its public class name for compatibility. Runtime audit `node scripts/audit-gaussian-scene-v18.mjs` passed 8 checks and wrote `gaussian-validation-v18-runtime.json`. No optical geometry is changed by this asset.
