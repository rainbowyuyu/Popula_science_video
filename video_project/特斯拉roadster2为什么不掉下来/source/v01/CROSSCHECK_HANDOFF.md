# 交叉验证交接 · v03

## 推荐预览与结论边界

`output/v03/roadster-mechanism-crosschecked-v03.mp4`

**当前是24.17秒机制样片，不是用户要求的完整4—5分钟调查视频。**
原片链接/文件未提供，Tesla官方能力证据未取得；本阶段没有新增网页检索，也没有把此前403当成不存在飞行能力的证明。
当前交付用于验证模型、受力、动作、字幕和既有声音之间的契约。全部旧视频和旧数据保留。

## 从实际产物独立发现的问题

依据旧模型JSON、旧数据、源码和本地识别的原始词时间，不复用生成器的自我断言。基线审计：`work/v01/crosscheck/baseline-audit.json`，五项失败：

1. 模型只有两侧喷口，中央喷口不存在，但悬停和固定喷口段使用中央喷口。
2. 悬停推力起点直接使用局部坐标，漏加质心世界位移0.1米。
3. 力偶文字切换阈值0.18/0.82与实际0.20/0.80不一致，6帧文字与喷力开关相反。
4. “推力只剩横向”语句结束前，画面已超过90°到约104°。
5. 无推进段仍保存了一条极短的喷流对象。

补充发现：原喷流测试仅验证单位长度，没有检查反向点积；旧媒体QA一直指向v1物理报告，不能证明v02的新契约正确。旧交接把“抽帧看到字幕”说成“音画一致”证据不足，且“全六轮全帧已查”范围过宽，应按各次工具实际抽帧记录理解。

**科学表述纠正：**将沿原作用线的力滑移到质心作刚体受力简图，在保留力矩关系时不必然错误。上一阶段把所有质心处推力画法一概称为错误不准确。本次把箭头放到模型喷口，是为统一可见喷口/喷流与作用点，不是推翻力的可传性。

## 实际修复，保持已有有效产物

- Blender以`--factory-startup`打开已有`.blend`，仅复制一个原喷口到中央；新模型在`assets/v03/`。原有42个mesh导出内容逐项完全相同，新模型43个mesh。
- 各喷口精确位置从新模型的实际包围盒读取：左右y约±0.8811米，中央y=0。受力起点统一`c + Rx(phi) r`。
- 去掉无推进段伪喷流；每个真实喷流与对应推力同起点，点积归一值为−1。
- 力偶提示根据数据中的`phase`驱动；末帧关喷口，角速度为零，重力保留。
- 固定喷口90°停留覆盖原始识别词时间3.70—4.74秒，随后再转向180°。
- 不重录任何旁白。使用已有本地Whisper-small，CPU int8、离线、无下载；识别文件`work/v01/crosscheck/asr.json`。
- 识别有繁简体、近音字和数字形式差异：如悬停→旋停、质心→致心、抛物线→拋霧限、托→拖；**不能据此认定音频说错或发音已通过**。保留标准字幕，没有把ASR文字替换为文案。
- 根据原始词列表人工核对分句起止，输出`timeline-crosschecked.json`与`subtitles/v03/preview-asr-assisted.srt`。这是机器辅助分句对齐，不是实际听审，也不是逐字人工对齐验收。
- 将相机、投影和标签布局提取为`src/stage-layout.mjs`，渲染与全帧测试共用。命名固定槽位替换会左右跳动的标签避让逻辑；车体标签框使用含轮胎底部的包围盒。
- 场景重置时主体短淡出/淡入，并显示“重设初始条件·独立示意”；不把不同初始状态伪装成同一次飞行。

## 当前真实入口与依赖

Remotion：`source/v01/src/index.ts` → `Preview.tsx` → `VehicleStage.tsx` / `stage-layout.mjs`。

当前数据：
- `source/v01/timeline-crosschecked.json`
- `source/v01/physics/preview-frames-v4.json`
- `source/v01/physics/contract-v4.json`
- `assets/v03/teaching-car.mesh.json` 与 `assets/v03/teaching-car.blend`
- `audio/v01/preview-narration.wav`（生成源，未改）
- 最终声音由 `output/v01/roadster-mechanism-preview-v02a.mp4` 音轨无重编码流复制。

脚本：
- `scripts/audit_contracts.mjs`：旧版独立审计，已运行，无需重跑覆盖证据。
- `blender/add_centre_pod.py`：模型补丁，已运行，目标存在就退出，不重做。
- `scripts/patch_contracts_v03.mjs`：数据补丁，已运行，目标存在即拒绝，不重做。
- `scripts/asr_review.py`：本地识别，已有结果即退出，不重新识别。
- `scripts/apply_view_patch.mjs`：已应用的一次源码补丁，保存备份到`work/v03/prepatch/`；不要重跑。
- `scripts/verify_contracts_v03.mjs`：逐帧契约检查。
- `scripts/render_crosscheck.mjs`：短帧/静音画面渲染。
- `scripts/verify_crosscheck_media.py`：最终媒体验证与旧新音轨哈希比较。

## 实际验收证据

### 源码 / 数据
`npm run check`实际通过，进程日志`process-178ef6bf.log`。
`work/v03/checks/contracts.json`：14项独立检查通过，覆盖全部725帧：
- 原42个网格保持不变；725帧连续。
- 力起点对应真实模型喷口；最大误差0。
- 喷流同起点、反向；无推进时没有喷流。
- 力偶净力矩沿x，符号匹配角加速度。
- 阶段提示对应实际推力开关；90°停留覆盖完整语句；末帧180°。
- 2D/3D同投影；标签矩形不压车体、不互相重叠、不越安全区。
- 字幕在场景内且时序不重叠。
- 独立中心差分计算得到保存的角速度与−g竖直加速度。

**限制：**标签测试为保守矩形/字宽估计，不证明字体逐像素无遮挡；力箭头长度为图示比例，不是实际牛顿值，也未建立整车质量/惯量/储气量/控制器模型。力偶角度与转动时序是明确的主轴教学模型，不是Tesla性能模拟。

### 实际媒体
`work/v03/checks/media-qa.json`：
- 1920×1080、30fps、725帧；画面24.166667秒，音轨24.166秒。
- 完整解码通过；黑帧检测无命中。
- −16.5 LUFS，真峰值约−4.9 dBFS。
- 新旧压缩音轨SHA256完全一致：`dbb68cd15cd84454db0e9742747531e41a135469cee33ec1832449704cacf709`。
- 音频波形0延迟结果来自上一阶段，因本轮音轨数据和时间戳起点沿用，可追溯；没有重新听审。AAC末尾仍可解码出192个填充采样，容器有效时长受编辑列表约束，不应写成“编码中不存在填充”。
- 样片SHA256：`f1ffc320dd6e797003bdea2447fcff90a1f2ab6ed63ccfb6d71be6bff0dea0be`。

### 实际视觉审查范围
本轮查看旧版12.5/17.7秒；新静帧60、380、400、497、672、715；新最终MP4的8.5、12.7、16.7、22.3、24秒。
22.3秒保持90°且字幕为“推力只剩横向”；24秒为180°向下推力；12.7秒有重设条件提示。
这是离散帧审查，不是连续观看。字幕在停顿处允许消失，不按旧草稿强行常亮。

## 逐项核验用户目标

| 用户目标 | 当前状态 |
|---|---|
| 查阅相关资料 | 已有NASA/抛体教材机制资料；本阶段未补齐Tesla一手能力资料 |
| 解释不掉下来 | 已实现理想悬停条件示意；不等于车辆真的能悬停 |
| 解释飞行翻滚 | 已实现平动/转动分离、力偶、固定喷口分量；只是机制样片 |
| A路线的原片调查 | 尚缺用户原片/链接、首发说明及可引用证据 |
| 完整一期 | **未完成，仍只有24.17秒** |
| 自然旁白与字幕 | 既有音色保留；新增ASR辅助分句时间；需实际听审和词级对齐 |
| 可播放、可追溯 | 有独立v03 MP4、模型、源码、数据、日志与哈希 |
| 连续观看/听审 | 未完成，报告字段均为false |

## 可重渲染入口

在 `source/v01`：
```text
npm run check
node scripts/verify_contracts_v03.mjs
node scripts/render_crosscheck.mjs stills
node scripts/render_crosscheck.mjs preview
```
输出存在会跳过或拒绝覆盖。下一版改版本路径，不能删除旧版绕过。

画面成功后在根目录合成（已执行，不要重复）：
```text
ffmpeg -n -i work/v03/picture-only.mp4 -i output/v01/roadster-mechanism-preview-v02a.mp4 -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart output/v03/roadster-mechanism-crosschecked-v03.mp4
python -X utf8 source/v01/scripts/verify_crosscheck_media.py
```

旧`render.mjs`/`verify_preview.py`是旧版本流程，旧QA固定指向v1测试；本版验收必须用crosscheck脚本。`npm run studio`仍能预览当前源码。

## 下一步

先补A路线所需原始片段或可读的一手公开材料，随后扩充调查叙事，不继续无限打磨24秒样片。若原片无法取得，只能按已选方案的自制示意退路，并明确无法判定未知片段真实性。实际听审可先复核悬停、质心、抛物线、托不住等术语；不能因Whisper同音/繁简差异直接重录。
