# V15 电影化重制资产与验证记录

- 主片：16:9，30 fps，10800 帧（约 6 分钟）。
- 精剪：9:16，30 fps，2700 帧（约 90 秒），独立时间线和独立相机注册表。
- 真实结构底座：`public/models/shanghai-tower.glb` 及 manifest。
- 真实通道：`public/physics/response.json`、`environment-response.json`、`computed-wind-paths.json`、`computed-pressure.json`、`computed-flow-slices.json`、`pile-dynamics.json`。
- Blender：`D:/blender/blender.exe`，V15 参考场景位于 `work/v15/blender/`。地下软土/桩基和 WaterPro 风格水面只用于示意与环境转场，元数据中标明示意倍率和不承载 CFD 的边界。
- 相机：`src/v15/CinematicShot.ts`、`v15Shots.ts`、`V15CameraPath.ts`；镜头边界连续，Remotion 由帧号驱动。
- 旁白/字幕：沿用 rainbow 鱼工程音色与已校验句源；`public/v15-master.wav` 为重新节奏处理的主音轨，`public/v15-vertical-master.wav` 为竖版剪辑音轨。
- 云端素材：本版没有提交 Qwen/Lux3D 任务；本地实景、HDRI、真实 GLB 与 Blender 程序化资产已经覆盖环境需求，避免把生成素材误当计算证据。余额/报价查询结果若不可用，记录在 `research/qa/v15/cloud-usage.json`。
- Claude Opus 5.5：已通过 `work/opus-runs/c2c3-camera/` 生成连续无人机镜头曲线草案；Codex 审阅后采用独立 `V15CameraPath` 实现，保留 `response.md`、`report.json` 和提示词。

验收入口：

```powershell
npm run check
python research/qa/v15/check_v15.py
python research/qa/v15/check_v15.py --strict
```
