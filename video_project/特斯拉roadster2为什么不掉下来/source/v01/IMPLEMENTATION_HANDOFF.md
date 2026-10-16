# 主导实现交接 · v01

## 当前交付，不是完整一期

推荐预览：`output/v01/roadster-mechanism-preview-v01a.mp4`。
1920×1080，30 fps，725帧，24.166667秒，4句本地用户音色旁白。
上一版 `roadster-mechanism-preview-v01.mp4` 保留，不覆盖、不删除。
实际输出应在工作台当前工程 output/v01 中选择播放；没有对外发布。

用户选择的A路线不变：查片段来源→查一手表述→机制解释→返回证据。
本阶段只完成机制样片与可复用工具链，不能把样片称为完整调查片。
原视频/URL尚未提供，Tesla网页返回403，不据此作“能飞/不能飞”结论。

## 实际文件

- `source/v01/src/index.ts`：Remotion入口，composition `MechanismPreview`。
- `source/v01/src/Preview.tsx`：1080p布局、旁白、字幕、四段机制说明。
- `source/v01/src/VehicleStage.tsx`：ThreeCanvas、同源投影、车体与箭头。
- `source/v01/blender/build_car.py`：原创建模，Blender导出JSON网格，不冒充Tesla CAD。
- `assets/v01/teaching-car.blend` / `teaching-car.mesh.json`：可编辑模型与渲染模型。
- `assets/v01/teaching-car-inspection.png`：Blender真实静帧。
- `assets/v01/brand-original.png`：用户已有logo的项目内副本；原件未改。
- `source/v01/physics/build_preview.mjs`：解析轨迹、主轴力偶、固定喷口方向数据。
- `source/v01/physics/preview-frames.json`：725帧共享数据。
- `source/v01/physics/assumptions.json`：假设及物理时间，非厂商数据。
- `source/v01/narration/preview.json`：显示稿与朗读稿。
- `audio/v01/*-raw.wav` / `*-clean.wav`：4句已成功生成的本地旁白。不要重生成。
- `audio/v01/preview-narration.wav`：完整句源拼接，未变速、未裁字。
- `source/v01/timeline-preview.json`、`shots-preview.json`：真实音长与镜头契约。
- `subtitles/v01/preview-draft.srt`：9条字幕草稿，句内按长度估时，未ASR精确对齐。
- `references/v01/source-ledger.json`：来源状态、证据范围与缺项。
- `work/v01/asset-hashes.json`：10项关键文件SHA256。

## 已执行与检查证据

- 本工程npm安装固定版本依赖，非全局安装；保留package-lock.json。
- Blender 5.1.2、Node 24.15.0、FFmpeg实际运行；Remotion 4.0.526本工程渲染成功。
- Blender第一次启动加载了已有插件并报退出清理警告，但模型、网格、PNG成功生成；未调用插件生成服务。以后重建应加 `--factory-startup` 避免加载用户插件，不改全局设置。
- 本地Qwen3-TTS-0.6B使用现有个人参考，通过私有参考内部接口生成；未复制/打印音色参考数据。SoX/flash-attn警告不阻止本轮生成；不因警告自动安装。
- `npm run check`实际通过。
- `work/v01/checks/physics.json`：67条断言通过，含旋转矩阵、解析抛物线、力偶净推力为零、主轴制动末角速度为零。
- 初版静帧发现车体几乎不可见：R3F把米制正交视锥改成像素范围。已经设置 `camera.manual=true` 修复；保留失败静帧供追溯。
- 标签重叠已局部修复。抽查修正版静帧60/400/640及实际MP4的9秒、13.4秒、21.3秒；不是连续观看。
- `work/v01/checks/v01a/preview-qa.json`：完整解码成功，1080p/30fps/725帧，无阈值内黑帧；音轨24.166秒、画面24.166667秒。
- 最终AAC实测 -16.5 LUFS，真峰值约-4.9 dBFS，未削波。
- `work/v01/checks/v01a/audio-sync.json`：波形互相关延迟0采样（8采样搜索步长），余弦相关0.99385；4句clean音频完整写入旁白，逐样本差0；AAC解码末尾有192个填充采样。
- 检测到约0.59—1.00秒段间停顿及片尾停顿，未自动删减。需实际听审节奏。
- `continuousPlaybackReviewed=false`、`subjectiveListeningChecked=false`、`subtitleWordAlignmentVerified=false`。

## 坐标与科学边界

右手系x前/y左/z上，米；Three与Blender同坐标，不经glTF轴转换。
投影与Three相机均来自makeCamera；切勿取消manual标志或另算力箭头坐标。
模型原点是假设质心。整车形状、喷口、尺寸均为自制教学设计。
无推进段：忽略空气、匀强重力，初始水平/竖直速度是假设，模拟1.2秒后慢放。
力偶段：两股等大反向力净推力为零，仍受重力，绕主惯性轴x；物理时长0.6秒。
固定喷口段：姿态规定、位置锁定，仅用于方向分解，醒目标注不作悬停预测。
无外力矩一般保证角动量守恒，不能泛化为任何刚体角速度都不变。

## 资料核查真实状态

NASA Rocket Thrust Equation通过正常Node HTTPS取得正文，TLS未关闭；支持一般喷流反作用与推力方程，不支持Tesla能力声明。
OpenStax抛体正文已读，支持无空气作用的轨迹；页面许可有限制，不把教材图片/正文当成可随意商用视频素材。
OpenStax陀螺进动只作背景，不混淆绕支点重力矩与自由质心处重力矩。
Tesla官方页403，原片尚缺。未取得推进套件一手原话、真实试验、车重、推力、储气量、悬停时长。
不要重跑fetch脚本覆盖失败记录；新来源单独保存。

## 已验证入口与重渲染命令

在 `source/v01`：

```text
npm run check
npm run studio
npm run stills
npm run preview
```

stills跳过已有同名图片；preview在输出已存在时主动报错以保护旧版。修改后先为脚本指定新的版本输出名称再渲染，不能删除旧输出来绕过保护。

在工程根目录：

```text
node source/v01/physics/build_preview.mjs
python -X utf8 source/v01/scripts/verify_preview.py v01a
```

物理数据现已生成，未改参数不要重复生成。TTS已成功，不需重跑voice_preview.py。若改稿，新建音频版本并保存真实音长。

v01a不是重新渲染画面：从v01流复制视频，用原始拼接WAV重新编码音轨，实际使用：

```text
ffmpeg -n -i output/v01/roadster-mechanism-preview-v01.mp4 -i audio/v01/preview-narration.wav -map 0:v:0 -map 1:a:0 -c:v copy -af "volume=7dB,alimiter=limit=0.794328:attack=5:release=80:level=false:latency=true,apad,atrim=end_sample=1160000" -c:a aac -b:a 192k -ar 48000 -ac 2 -t 24.166666667 -movflags +faststart output/v01/roadster-mechanism-preview-v01a.mp4
```

## 下一阶段优先级

1. 获取用户原始片段或链接；继续取得可读的一手官方/当事人材料，保持A的调查主线。不得猜测出处。
2. 观看/听审24秒样片。字幕须按实际语句重新对齐；可能需优化车体尺寸、镜头间过渡和自由飞行段的标注遮挡。
3. 把力作用点与教学喷口外观进一步统一；可补喷流反向示意，但冷气不能默认画火焰。
4. 样片采用独立回放和锁定受力图，不是连续完整飞行；全片应补同主体的有解释转场，不强行把不同初始条件接成同一次飞行。
5. 取得足够证据后扩展约4—5分钟文案与实际TTS时间线；新增来源调查段和回到证据的结论段。现有有效模型/数据/实现保留复用。
6. 全片音频、连续观看、逐字幕对齐和完整技术验收完成后再称成片。当前没有音乐、封面、发布文案，也未对外发布。
