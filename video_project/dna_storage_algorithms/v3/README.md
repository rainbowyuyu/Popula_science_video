# DNA 存储：连续数据之旅 V3

1920×1080，30 fps，9000帧，300秒。主线为家庭记忆→编码→序列筛选→冗余→分子读写→对齐与共识→模型辅助→文件恢复。V2交付保留为回退。

**V3 母版已完成渲染与编码检查。** `delivery/DNA存储_连续数据之旅_V3_1080p.mp4` 为 1920×1080、30 fps、9000 帧、300 秒；AAC 48 kHz 双声道，音画时长均为 300 秒。最终 SHA256：`133e9b61617770962eaef5647497553fc9bd88f46dcabf2caf127e6d8cb44af8`。522 项时间线检查、9001 帧相机连续性检查、运动状态检查与 14 项教学示例检查通过。已复核代表帧和关键桥接；不将这些检查等同于逐帧主观审片。最终记录见 `research/final-delivery-check.json`。

在DNA项目目录执行（依赖复用父目录现有 `node_modules`）：

```powershell
npm --prefix v3 run check
node v3/scripts/qa_teaching.mjs
node v3/scripts/qa_camera.mjs
node v3/scripts/qa_timeline.mjs
node v3/scripts/render.mjs --stills
node v3/scripts/render.mjs --audio
node v3/scripts/qa_timeline.mjs
```

最终输出默认是 `v3/delivery/DNA存储_连续数据之旅_V3_1080p.mp4`。主片必须带 `--audio`；Remotion默认预览属性关闭音频。局部预览必须提供独立文件名，脚本禁止片段覆盖母版：

```powershell
node v3/scripts/render.mjs --audio --frames=0-1349 --output=v3/delivery/preview-opening.mp4
node v3/scripts/render.mjs --stillframes=180,930,1740 --scale=0.5
```

渲染脚本默认并发2；`--concurrency=1`可降低内存压力。不要运行根项目其他视频的入口或清理其他项目缓存。

## 实际工具与来源

- **Blender 5.1.2**：实际调用 `D:/blender/blender.exe`，程序化建模手机、硬盘、玻璃样品瓶、微流道、测序流道、合成喷嘴与实验桌。可编辑 `.blend`、生成脚本和带单位/尺寸/哈希的GLB清单保留在 `public/3d`、`scripts/assets_blender_v3.py`。本片实际使用的六个GLB由 `research/asset-usage.json` 从当前源码扫描，未用素材不冒称已进入镜头。
- **Lux3D**：已实际生成任务4046716，原始GLB/ZIP保留，Blender检视并规范原点与显示尺度。该试管架用于中景陈列，单个贴图网格不承担瓶内机理演示。用户授权本会话累计100 credits，报价承诺20，余80；这是预算记账，不是最终账单。见 `research/tool-lux-budget.json`。离线模型预览 `delivery/lux3d/preview.html` 已检验加载与拖动旋转。
- **Qwen/Wan**：主凭据原生媒体探针401，备用凭据成功。一个 `wan2.6-i2v` 任务实际生成5秒实验室环境镜头；原视频150帧，30 fps，1080p。`public/bridges/wan-atlas.jpg`将150帧按10列×15行编码为4800×4050图集，每格480×270；Three.js按帧切UV，避免实时视频纹理引入不确定性。原片和来源记录保留。它是氛围素材，不能作为测量/实验数据。
- **Qwen图片**：`family-memory.png`由 `qwen-image-2.0-pro-2026-06-22`实际生成，1536×864。海滩三人家庭是虚构示意，不是用户真实家庭照片，也不是论文实验恢复的真实文件。用作手机内“想留下的记忆”，来源见 `tool-family-memory.json`。
- **Claude Opus 5.5**：按全局独立工具发起了两个有范围的真实调用；相机请求CLI失败，分子隧道请求超时，均未收到可采纳完整代码。已保留提示词、部分响应、报告和失败证据；现有相机与隧道由Codex本地实现，不冒称Claude成品。失败不表示零计费。
- **水面与点云**：液滴采用原创按帧驱动Three.js shader，未复制商业WaterPro源码。分子隧道使用固定种子程序点云与高斯形状点精灵，是艺术化转场，不是实物扫描高斯泼溅或经验证的流体仿真。

## 旁白、音乐与字幕

37句旁白使用官方云端 `qwen-audio-3.0-tts-flash`，以既有rainbow鱼同一段本人参考音频创建专属声线；参考SHA256、请求参数、服务请求ID及原始时长保存在 `research/voice-generation-cloud.json`。本地Qwen尝试受显存/内存争用影响，旧日期VC接口不可用，失败记录保留。

每句按实际清理后WAV长度排期，不变速，不裁掉字音；80毫秒前导、160毫秒尾部保护，滤镜延迟已补偿。字幕使用原文加CPU Whisper词锚点对齐。`qa_timeline.mjs`独立解码清理后WAV，对有声RMS片段计算字幕覆盖率，避免把长静音当作覆盖成功。自动ASR/统计不等于逐句主观听审。

配乐《一滴里的记忆》为本片的新编排，80 BPM、4/4，使用有来源记录的CC0乐器样本。真实响度、峰值、ducking及音频哈希见 `research/audio-mix.json`；原始逐句、处理后逐句、master与字幕SRT均保留。

## 科学边界与论文页

- GC、同聚物筛选、3块字节XOR恢复、Smith–Waterman矩阵与分数8，均有独立计算记录 `research/teaching-verification.json`。这是固定教学例，不是完整DNA Fountain实验、真实设备测试或性能结论。
- k-mer与BPE是可选分词方案，不能误解为必须串联。Nucleotide Transformer论文支持基因组表征/预测介绍，不是DNA存储性能证据。
- 片尾使用实际DNA Fountain预印本首页及Nucleotide Transformer出版物首页；作者/年份放在纸页外。Fountain发表2017，展示的预印本更早；NT标注2024在线发表。Goldman等2013文件作为研究参考保留，是否进入画面由实际源码清单区分。
- 公式保留LaTeX源 `public/formulas/source.tex` 和SVG输出；论文、图片、音频、模型的引用与真实哈希由 `qa_teaching.mjs`刷新到 `research/asset-usage.json`。

## 验收记录

`qa_timeline.mjs`检查9000帧、37句实际音频长度、字幕有声覆盖率≥95%、字幕字数和窗口、对应站点、静态排版宽度估计、禁用实时/无种子动画、TypeScript编译；默认母版存在后再实际运行ffprobe检查视频帧数、声道、采样率与音画时差。该报告明确区分未渲染、编码检查和视觉审核，不以截图或数学通过冒充全片质量认证。

保留 V2 可交付 MP4 及当前源码、锁文件、模型原件、素材台账、音频和重建脚本。V3 内可再生的 `tmp-bundle`（约 760.8 MB）删除操作被自动审批审核拒绝（blocked by policy），因此仍保留。没有清理其他视频项目、共享依赖或回退文件。
