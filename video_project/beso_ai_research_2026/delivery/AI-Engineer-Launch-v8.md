# AI Engineer 发布片 v8 交付说明

成片：`output/ai_engineer_launch_v8_1080p60.mp4`

- 105 秒，1920×1080，60 fps，H.264 / yuv420p，AAC 48 kHz 双声道。
- 视频 SHA-256：`a70775b3624a4f1f659ed8313a9fcb8f90a2ee670e09135d7104b4cdd5e6cf56`。
- 字幕：`delivery/AI-Engineer-Launch-v8.zh.srt`。
- 音频母带：`public/audio/launch-v8-master.wav`，SHA-256 `11bea12b958b1df9d8e2b2df0bb7d5d1bb37f4616b5f24cd9bf6c09bbde1e142`；混音约 −16.05 LUFS、−2.32 dBTP。

## 叙事和产品重点

镜头沿同一条工程摄影机走廊推进：工程目标 → 需求清单回写 → 几何/网格/BESO 文件接力 → Zwind 平台运动与系泊张力 → 失败日志和重规划 → 工程师暂停改几何 → 模型、输入、日志、报告一起交付。旁白突出 AI Engineer 的三项价值：把自然语言改动写回同一份任务；调度几何、网格、BESO 和物理工具；读取失败原因并保留可复查证据。

## 网页证据和生成素材

真实网页截图和操作记录位于 `public/beso-research/web-live/v8/`，来源包括 `brief.png`、`checklist.png`、`checklist-edited.png`、`viewer-full.png`、`viewer-model.png` 与 `actual-ui-route-events.jsonl`。产品证据报告为 `research/v8-product-evidence.json`。

Qwen 图片重绘和 3×5 秒 WAN 桥接位于 `public/generated/v8/`，任务台账为 `research/generation/qwen-v8-tasks.json`，桥接时间表为 `research/generation/launch-v8-bridges.json`。桥接使用去除 Qwen 音轨的 `*-muted.mp4`；最终声音只来自 rainbow 鱼 TTS 和本片配乐。Qwen 画面只承担光影、材质和二维到三维的概念转场；真实网页、数值、日志和工程结果由程序或原始截图叠加。遮罩契约见 `research/generation/qwen-v8-overlay-contract.json`。

Qwen 本批 3 张图 + 3 段视频的名义预算约 16.5 元，实际账单未核对；台账记录了模型、请求 ID、SHA-256、来源图和 QA。生成图不被当作求解证据。

本轮按项目约束发起过一次 Claude Opus 5.5 有界代码审阅，运行超时，没有采用其返回代码，也没有让外部模型直接修改最终项目；最终实现由本地源码和 QA 结果完成。

## 计算边界和术语

平台骨架使用 `public/beso-research/physics/native-model.json`。BESO 与 Zwind 画面是已保存算例/响应回放，本轮没有宣称重新完成全耦合求解；风浪画面标为 `保存响应回放 · 视觉波面`。系泊张力绑定到 fairlead/缆绳锚点并以可视化颜色表达，不能解释为本片重新计算的全场结果。

屏显统一写 `Zwind`，旁白使用英文连读；“系泊”字幕保留规范写法，TTS 输入按 `xì bó` 处理。`AI Engineer` 保留英文读法，`图强号`、`兆瓦` 使用完整中文词。

## QA

- `npm run typecheck` 通过。
- `node scripts/qa_launch_v8_camera.mjs` 通过：无非有限相机坐标、无结构边界硬跳；片尾模型投影和相机净空检查通过。
- `python scripts/qa_launch_v8_final_frames.py` 完成 130 帧抽取，3 个桥接接缝和 2 个网页细节页已生成于 `research/qa/launch-v8-final-frames/`。
- `python scripts/verify_launch_v8.py` 通过：6300 帧、105 秒、1920×1080/60 fps、字幕无重叠、48 kHz AAC、无黑帧/解码错误。
- 语音 ASR 主混音匹配率 0.9973；最低独立句段约 0.963。自动检测不能证明主观音色喜好或“系”声调，未伪造真人听审记录。

本说明保留 Qwen 生成记录、原始模型、保存响应、网页来源和旧版本回退文件；只清理可重建缓存，不删除 v7 交付物。
