# V01 制作记录

状态：完整 1080p 预览已输出，最终视频技术检查通过。时长 297.1667 秒、8915 帧、30 fps。`source-lock-v01.json` 保存渲染源码与资产快照；`delivery/chemistry2026_v01/qa-final/qa-report.json` 绑定最终成片哈希。内容/接缝抽样检查与音频自动筛查分别留档，尚未声称全片人工复听。

## 叙事与画面

视频以一对无法重合的镜像构型引入手性，接着沿 Pasteur 的晶体与偏振光、Kagan 的非线性效应、Soai 的不对称自催化，说明初始微小差异如何被反应放大。研究者采用英文名字，科研结论连接到官方科学背景及原论文入口。

视觉继承前一部诺奖视频的深蓝、象牙白、青色与低饱和金。品牌、标题、字幕与论文窗口拥有独立安全区；分子、路径、比例和曲线从同一帧时钟取值。每段应呈现“输入出现—计算或反应变化—结果稳定—镜头交接”，不可用长时间静止文字代替机制。镜头契约是待审查的目标，不是已完成效果的证明。

## 文件入口

| 用途 | 文件 |
| --- | --- |
| Remotion composition | `src/index-chemistry2026-v01.tsx`，`NobelChemistry2026V01` |
| 合成与文字 | `src/chemistry2026/FilmV01.tsx` |
| 动态机制 | `src/chemistry2026/WorldV01.ts` |
| 研究证据窗口 | `src/chemistry2026/EvidenceFigureV01.tsx` |
| 实测时间线 | `src/chemistry2026/timeline-v01.json`，生成后存在 |
| 旁白与字幕文本 | `docs/v01/narration-v01.json` |
| TTS/处理/混音 | `scripts/build_audio_v01.py` |
| LaTeX | `scripts/compile_formulas_v01.py`；`public/formulas/` |
| 字体子集与缺字检查 | `scripts/prepare_fonts_v01.py`；`public/fonts/fonts-v01.json` |
| 完整/局部渲染 | `scripts/render_chemistry2026_v01.mjs` |
| 技术 QA | `scripts/qa_chemistry2026_v01.py` |
| 来源 | `research/nobelchemistry2026/source-ledger-v01.json` |

当前独立公式资产为 `ee.svg`、`ee-75-25.svg`、`ee-90-10.svg` 与 `ee-examples.svg`。使用本机 MiKTeX `latex` 与 `dvisvgm --no-fonts` 编译为自包含路径 SVG；`.tex`、编译日志、viewBox、源/结果 SHA 与数例计算记录均保留。75%/25% 对应 50% ee，90%/10% 对应 80% ee；数例不能被误写为任何反应条件下都成立的固定放大倍率。

## 渲染与音频

统一目标为 1920×1080、30 fps。最终时长由个人音色旁白实测决定。每个渲染进程独立生成 `tmp/chemistry-v01-bundle-{PID}` 和 `tmp/chemistry-v01-public-{PID}`，只暂存一条正式母带。渲染分镜时关闭声音，全片结束后再用 FFmpeg 合入唯一 AAC 音轨。

```powershell
npm run check
python scripts/compile_formulas_v01.py
node scripts/render_chemistry2026_v01.mjs stills
node scripts/render_chemistry2026_v01.mjs --frames=0-299
node scripts/render_chemistry2026_v01.mjs --output=delivery/chemistry2026_v01/final-1080p.mp4
python scripts/qa_chemistry2026_v01.py --video delivery/chemistry2026_v01/final-1080p.mp4
```

若不指定 `--output`，默认正式预览名为 `delivery/chemistry2026_v01/2026诺贝尔化学奖_让化学选择同一只手_v01_1080p.mp4`。仅当该文件实际存在且 QA 报告绑定其 SHA 后，才能称为已输出。`--frames` 输出无声片段供检查，不能视为完整交付。

## 证据与许可

- 官方 PDF 和插图的原文件/哈希保存在 `research/nobelchemistry2026/`；不更改科学图的轴、结构、数据或署名。
- 台账中只有 DOI、没有 `local` 文件的论文，仍属于全文待取得的来源入口。不得声称已经逐页读完。
- 官方插图保留 **© Johan Jarnestad / The Royal Swedish Academy of Sciences**；台账记录非商业使用范围。公开可下载与获得商业授权是不同状态。
- Opus 或生成视频的实际采用范围由对应调用记录确认；不得把部分组件代码的调用描述成外部模型独立完成或审查整片。
- 音乐需绑定实际源文件哈希及授权记录。参考音色与 API 凭据不进入公开资料。

## 验收边界

| 项目 | 当前记录方式 |
| --- | --- |
| LaTeX 编译与数例 | `latex-validation-v01.json`；仅记录实际执行结果 |
| 源码、科学资产与重渲染依赖 | `source-lock-v01.json`；可用 `--prepare-only` 刷新 |
| 逐句画面目标与时钟 | `shot-contract-v01.json`；有实测时间线后填入帧区间 |
| MP4 规格、解码、单音轨、响度、SHA | 完整 QA 执行后写入交付 `qa-report.json` |
| 内容与接缝样本 | 完整 QA 从最终 MP4 抽取；联系表只能证明已抽样 |
| 逐句复听、发音、动态连续性、遮挡与科学语义 | 必须另行人工审查，不由脚本自动判定通过 |
| 4K | 1080p 预览确认后再输出 |
| 清理 | `cleanup-v01.json` 保留原候选；实际缓存清理见 `cleanup-cache-manifest-v01.json` |

完整 QA 会刷新源码快照并记录实际视频 SHA；若此后继续改源码或音频，应重新渲染并重新绑定 QA。建议先看代表片段，再检查全部接缝，最后连续观看与逐句复听。
