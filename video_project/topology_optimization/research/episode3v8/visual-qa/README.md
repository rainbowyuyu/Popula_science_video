# v8 独立验收准备

这里的新脚本只读制作源文件、真实音频时间线和模型结果，报告与审查图片写在本目录；不改 World、Film、台词、配音或最终视频。**脚本准备好、语法检查通过，不等于成片通过。** 在收到真实时间线及模型冻结通知前，不运行正式审查，也不拿旧 v7 时间线生成通过报告。

## 实际输入

- 展示源码：`src/episode3v8/World.ts`、`ForceStory.ts`、`StressField.ts`、`Film.tsx`。
- 当前台词和时间：`research/episode3v8/story.json`、`src/episode3v8/timeline.json` 与 `public/episode3v8/timeline.json`。
- 首次术语：`src/episode3v8/annotations.json`，由真实语音对齐生成。
- 几何、装配清单和原生计算结果仍位于 `public/episode3v7/models`、`public/episode3v7/physics`。
- v8 完整音源、母带和成片：`public/episode3v8`、`output/episode3v8/joinery_v8_1080p.mp4`。

## 执行顺序

在项目根目录执行：

```text
node research/episode3v8/visual-qa/audit-camera.mjs
node research/episode3v8/visual-qa/audit-cues.mjs
python research/episode3v8/visual-qa/audit-final.py --plan-only
python research/episode3v8/visual-qa/audit-final.py
```

最后一条需等待完整 MP4；前面三条也必须等真实 47 句时间线。Python 环境需 numpy、scipy、Pillow；ffmpeg/ffprobe 和现有 Node 制作依赖均使用项目现有安装。显式 `--allow-draft`（camera）或 `--allow-draft-plan --plan-only`（media）只为临时诊断，报告会标为 provisional，不允许成为正式验收。

## 各脚本实际检查什么

### audit-camera.mjs

- 对真实时间线的每一帧调用从 Film 导出的实际 `stateAt`，不是另外编一条大致相同的时间线。
- 构件位置来自实际 `World.getPartAssemblyQ`（若有）和 `offset`。角梁独立演示是 **hip line 1**；不会照抄旧版 line 2 的条件。若制作端改了接口且未提供同步方法，审查应停止。
- 从真实 GLB 的 POSITION accessor、层级矩阵计算 117 个部件的边界，并核对 manifest。以实际显示位移的最大可能幅度扩张边界，逐帧检查镜头入体和近裁面风险。
- 汇总每个章节和句子边界的相机、目标、角度、构件位移变化。最大步长不是美学评分，异常必须回看。
- 记录所有相关源码与物理结果哈希，审查过程中有变化就失效。模型全部持久存在的事实不能代替转场、透明度和遮挡视觉检查。

### audit-cues.mjs

- 用真正 WebGL World 和 Film `stateAt`，在每个实际 cue 的入场段、中点、出场段取样。每个 cue 都汇总锚点是否存在、可视、被遮挡、是否落在真实表面和安全画区。
- 保留每次采样的 `rawValid` 和原始 `anchor.occluded`，不把退场中的遮挡删掉。实际标注组件在最后 18 帧已经完全撤回引线/圆点，名称独立滑出，所以 `requiresVisibleAnchor = frame < cue.end-18`；正式引线要求为 `allActiveLeaderSamplesValid`。修订后 frame 3232 的“斗”属于已撤线退场：rawValid=false、occluded=true 仍如实记录，教学保持段没有放宽。
- 对 gravity 的 10 句、wind 的 8 句，以及 hip line 1 额外取实际口播中点。审查有符号 σ、应力幅值、风压 Pa、柱脚反力 N 的区分与该句含义相符。
- gravity line 4 必须是 element 177 **标签实际侧表面**的上缘负、下缘正：Three `[-1.59,4.1395,0.396]` 与 `[-1.59,4.0005,0.396]`，当前约 **−0.097823 / +0.112467 MPa**。这不是截面中线探针，也不是该梁最大值；不能继续拿旧中线 −0.022264 / +0.189540 MPa 作为标签旁数值。wind line 4 是两根斜撑的真实拉压；wind line 6 是非负应力幅值包络，不能误加拉压图例。
- 这里保存的 PNG 只包含实际三维画面，用于检查模型、锚点、力图与路径。完整文字排版必须看最终视频的抽帧，不能把这份报告当作完整 Film 排版通过。

### audit-final.py

- 按本次真实时间线为全部章节转场、47 句开始、首次标签及 gravity/wind 每一步生成取样计划。没有旧绝对帧和旧章节相对帧偏移。
- 每个标签至少采中点，并覆盖出现前、进入完成、保持和退出过程。每次转场保留实时回看的帧范围。角梁 line 1 取五个阶段，检查先抬再移再落。
- 核对全部 47 句原始配音哈希、对应 spoken、完整母带处理记录、音轨容纳时长，以及干净的句子在 narration.wav 中没有缺样或截尾。
- 完整解码成片，检查编码规格、总帧数、黑屏、音量/真峰值；逐句比较最终 AAC 与完整 master.wav 的波形相关性。
- 抽取准确视频帧和联系表；报告明确保留 `human_motion_review_complete=false`、`human_listening_complete=false`，机器相关性不证明嗓音悦耳或多音字正确。

## 回看重点

1. 两端榫和正交榫都按真实自由路径装入，横向木销不穿模；肩面相贴时不能还在继续插入。
2. hip line 1 对应“一根角梁”：只突出实际示范的同一根；其余角梁/HUB 不能跳变或同步乱动。
3. 每次新镜头沿同一亭子移动；旧物不在画内瞬间卸载。局部透视是讲解手段，不能用整组突然透明掩盖穿帮。
4. 初次标签与当句正在解释的构件一致；榫、卯、木销锚点各随自身部件，望板与瓦不能互标。字体统一，避免遮挡 logo、字幕或结构关键位置。
5. 重力逐层传过实际承托面：檩角半搭接 → 承托帽 → 栱 → 斗 → 柱。路径连接必须在几何接触处，没有悬空跨接。
6. 只有实际变形开启时显示“位移 ×N”。风压阶段的 Pa 图例、斜撑有符号 MPa、最终非负 MPa 幅值图例分别核实；它们都不是温度。
7. 末页实际保持 12 秒，论文图片占满卡面，作者年份位于外侧，Zwind 在结构仿真软件行首位。说明不能把二维绕流说成三维大气 CFD，不能把毛截面色图叫卯口接触应力。

准备阶段已检查脚本语法。正式跑后，报告必须与最终源码/时间线哈希对应；任一影响镜头、标签、音频或时间的修改都需要重跑相关检查。
