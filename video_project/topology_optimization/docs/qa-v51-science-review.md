# Nobel V5.1 科学与成片质检记录

## 最终修正状态（2026-10-06）

- `004-03`、`016-02`、`021-02` 的科学措辞已修正，并重录、混入独立的 `public/nobel2026/audio-v51/master.wav`；Film 已引用此新母带。三句实施细节、哈希和局部试听见本文末尾。旧版本音源保留回退，没有仅改字幕冒充音频修复。
- 当前 `016-02` 为“装上通道，再受到光照，细胞才会响应。”旧句“光只碰到被标记的那一群细胞”不再是当前字幕或母带内容。
- 当前 `FilmV51` 已将 `011–013` 的2005培养神经元研究与 `014` 的2006命名综述分开；015运动、016觉醒、017记忆、019临床分别挂对应团队，来源按短暂展示后退出处理。
- 22段、81句的输入→变化→结果契约见 `docs/qa-v51-motion-contract.md`，按修订后时间线 SHA256 `d99c7c70c70d4880117a7559f0385bb93afd6bb3f35388c0717cd6bb09075961` 重新计算绝对帧。总长仍为8192帧、273.067秒。
- 新World动画仍需成片检查；实际英文读音、句尾、字幕同步与音乐仍需听审。本文不把源码修复、ASR或静帧检查等同于最终主观验收通过。

以下初查段落保留为历史问题和修复依据；其中“当时”描述旧实现，并非报告问题仍然存在。2026-10-06后续补充了研究论文摘要与可访问原论文核验，详见“本轮补充来源核验”。最终报告由 `scripts/qa_nobel2026_v51.py` 生成，状态默认 **未完成主观验收**。

## 历史初查：三个实验不能共用一套团队标签与行为动画

| 片段 | 当前时间段 | 实验和画面应表达的行为 | 团队 / 论文 |
|---|---|---|---|
| `015` / brain line 0 | 174.57–186.60 s | 2007 年运动皮层光刺激，引起胡须运动；光纤、目标脑区、胡须变化同步。 | Aravanis et al., *An optical neural interface: in vivo control of rodent motor cortex with integrated fiberoptic and optogenetic technology*, 2007. DOI `10.1088/1741-2560/4/3/S02` |
| `016` / brain line 1 | 186.60–197.60 s | 2007 年 hypocretin / orexin 神经元的光刺激，提高睡眠到觉醒的转换概率；画面应由睡眠转为清醒。 | Adamantidis et al.; de Lecea, *Neural substrates of awakening probed with optogenetic control of hypocretin neurons*, 2007. DOI `10.1038/nature06310`。初查时缺条目；本轮已实时核验原论文摘要，记录见下。 |
| `017` / brain line 2 | 197.60–210.93 s | 2012 年先标记恐惧训练时活跃的海马细胞；随后光刺激重新激活该细胞群，引发冻结等恐惧回忆反应。 | Liu, Ramirez, Tonegawa et al., *Optogenetic stimulation of a hippocampal engram activates fear memory recall*, 2012. DOI `10.1038/nature11028`。Deisseroth 为论文共作者，不能把全部成果简单归于三位获奖者。 |

本次初查时 `ResearchTeamTag` 按整个 `scene` 取值：brain 始终显示 Aravanis/Deisseroth，而 Liu 标签在后面的 impact 才出现。`WorldV51.brain` 当时把胡须画在 `lineIndex===1`，恰好是睡眠觉醒旁白，存在明显错位。需要按 `015/016/017` 或 scene 内 line 分别匹配；修复后在对应字幕小句的前、中、后正常速度观看。QA 脚本仅用模式检查提示，不能自动确认修复画面正确。

## 历史初查：细胞选择性口播（已更正）

`016-02` 初查时为“重点在于，光只碰到被标记的那一群细胞。”此句把细胞类型选择性误归于光束本身。光会照到其他细胞；被靶向表达光控蛋白的细胞具有相应光响应。此句现已由顶部列出的新版旁白替换。

推荐：“重点在于，装上光控通道的细胞才会响应。”这是本段刺激条件下的教学表达，不暗示其他天然感光组织从不响应光。

- 旧句源：`public/nobel2026/audio-v4/raw/016-02.wav`。
- 时间线片段起点 `5598 / 30 = 186.60 s`；局部音源起点 `6.92 s`；整轨音源范围 `193.520–197.360 s`。
- 声学发声约 `193.810–196.910 s`；字幕约 `193.740–196.930 s`。
- 既有 TTS 入口：`D:/python_project/tts/.venv/Scripts/python.exe scripts/nobel_v4_voice.py --ids 016-02 --force`。
- 此入口会写入 V4 raw，不能直接用于覆盖回退。应将单句逻辑复制到独立 V5.1 任务，使用同一参考音色/参数；按实际新音长更新字幕与母带，不能只改字幕或靠硬切塞入旧时窗。
- 初次只读审查没有合成或修改音源。后续根任务授权了三句的独立 V5.1 修复，执行结果见文末；原 V4/V5 仍保留。

## 2012 年实验的因果边界

仅用刺激重新激活细胞群并诱发冻结，可支持“在该实验条件下足以诱发相应的回忆/恐惧反应”。它不能单独证明这些细胞对记忆具有必要性；必要性需要相应抑制、去除或阻断等干预证据。不要把本地官方科普摘录中概括性的 necessary 直接贴给本片只演示的刺激实验。

现 `017` 旁白“重新激活这群细胞，能唤起相应的恐惧反应”保持了这一边界；画面不得新增“必要”“唯一储存位置”“完整读取记忆”等更强结论。冻结亦非人的主观回忆内容的直接读取。

## 本轮补充来源核验

以下请求于2026-10-06执行。来源的可访问状态与科学结论分开记录；HTTP失败不等于已成功在线核验。

1. **官方奖项科普材料**：本地 `public/nobel2026/popular-medicineprize2026.pdf` 及 `POP_Fig_2/3/4/5` 是已保存的官方科普PDF/插图；实时请求Nobel summary与popular PDF均返回HTTP403。本轮以本地材料核对页内内容，不把403描述为成功下载。这些图为Mattias Karlén绘制的教学插图，并非原始实验数据。
2. **Adamantidis等，2007，觉醒实验**：EuropePMC原论文元数据与摘要接口成功返回HTTP200，PMID `17943086`，DOI `10.1038/nature06310`。作者为Antoine R Adamantidis、Feng Zhang、Alexander M Aravanis、Karl Deisseroth、Luis de Lecea。原摘要明确：ChR2靶向外侧下丘脑hypocretin/orexin神经元，经脑内光纤刺激可提高从慢波睡眠或REM睡眠转为觉醒的概率；5–30Hz脉冲减少觉醒潜伏期，1Hz不具有同样效果。画面应画目标细胞与觉醒概率/状态变化，不能声称任意脉冲必定立即唤醒。全文XML接口 `PMC6744371/fullTextXML` 返回HTTP500，本轮不声称全文已核验。复核入口：`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1038/nature06310&format=json&resultType=core`。
3. **Liu等，2012，记忆重激活**：同一EuropePMC原论文摘要接口成功。摘要原句为“optogenetic reactivation ... is sufficient to induce freezing behaviour”，结尾亦写“sufficient for the recall”。重激活实验支持足够性；摘要背景中的ablation/inactivation必要性叙述不属于本次刺激的结论。DOI `10.1038/nature11028`。
4. **Sahel、Roska等，2021，部分视觉恢复**：EuropePMC摘要及HAL原论文PDF均成功访问。PDF入口 `https://hal.science/hal-03269200/document`，23页，SHA256 `09337936230d5b2e0ca3682cab973dcaf62cbc40fe34aedf346a1bfaffb1cfe4`。第2页明确ChrimsonR-tdTomato峰值敏感度约590nm、眼镜把事件转换为局部595nm光脉冲；第9页方法写LED峰值595nm、半宽15nm。这是琥珀光系统，不能把前面ChR2的蓝光复制到临床场景。靶细胞为视网膜神经节细胞，递送AAV编码ChrimsonR，必须佩戴工程眼镜；结果是部分恢复。峰值敏感度590nm与设备输出595nm是不同参数，不可混写。

上述在线核验为读取与比对，没有改动画文件或重新渲染。

## 其他复核点

- `2003` 是 ChR2 通道结果，`2005` 是培养神经元毫秒级光控，`2006` 是 optogenetics 命名，`2007` 是不同团队的活体行为实验；不能把神经元培养图配到活体结果上。
- ChR2 为光控阳离子通道，不画成主动离子泵，不只画单一 Na+ 并误称专一钠通道。膜面内外、离子流方向、电位变化关系必须一致。
- 衣藻眼点/约 0.5 ms、ChR2 约 0.2 ms 是对应来源中的情境，不能推广成一切神经反应的普遍延迟。
- Nobel Popular Information 图为教学插图，不能称原始电生理数据、显微实拍或原论文图。光纤在 `POP_Fig_5_ENG_01.jpg` 的右部，重新聚焦仍要检查实际位置。
- 临床保持“早期”“部分功能恢复”“基因递送与专用光源”，不能说已治愈失明。
- 三位姓名仍须英文人工复听。ASR 的 Deisseroth/Nagel 近音拼写错误不等同于已证明读错，也绝不能因此宣称读音合格。

## 可复現质检入口

```powershell
# 默认仅生成清单与源代码/文案检查，无解码、无抽帧、无修改音源。
D:/python_project/tts/.venv/Scripts/python.exe scripts/qa_nobel2026_v51.py --mode manifest

# 最终文件落盘后，做全片解码、帧数、AAC 响度、母带比对与画面差分。
D:/python_project/tts/.venv/Scripts/python.exe scripts/qa_nobel2026_v51.py "delivery/nobel2026_v5_1/一束蓝光能叫醒一颗神经元_v5_1_完整预览1080p.mp4" --mode full
```

可选参数：`--timeline`、`--master`、`--output`；`--mode samples` 只读元数据并提取缩略图。找不到成片时只生成 manifest，不报告技术通过。工具使用 PATH 中的 ffmpeg/ffprobe，备用位置 `C:/ffmpeg/bin/`。

输出在 `delivery/nobel2026_v5_1/qa/`：

- `sample-manifest.json`：从字幕实测区间确定每一小句中点。当前应为 81 个小句全部覆盖，加 3 个片尾帧；另有 51 帧总览子集。
- `seams30`：7 个场景接缝，加 `008/016/017` 三个关键片段接缝，每处取前 15 帧、中心、后 15 帧，共 30 帧。所有 clip 接缝另保留正常速度审看范围。
- `all-clauses-*.jpg`、`overview-51-*.jpg`、`seams-30-*.jpg`：从最终 MP4 的准确帧号提取，附帧号、时间和小句标识，不能拿另一版 Remotion stills 冒充最终成片。
- `qa-report.json`：包含时间线哈希、最终 SHA、ffprobe 完整帧数、完整解码、AAC LUFS/真峰值、黑帧候选、相邻帧差异和长时间几乎静止候选。
- 音频检查必须是一个最终音频流，同时对比最终 AAC 与 `audio-v51/master.wav` 的解码波形，允许编码微小损耗和延迟。当前 FilmV51 已收敛为一个 Audio 元素；仅检查流数量仍不足以排除旧音源已混入一个流。

差分阈值、波形相关性和静帧仅用于定位候选，不代表音乐好听、动画自然、科学正确或所有字音无误。`qaComplete`、`subjectiveListeningChecked`、`normalSpeedVisualReviewComplete` 默认保持 false；root 需要实际听完和正常速度回看后记录人工验收，不得让脚本自动改成已通过。

## 三句科学更正已实施

根任务在初审后授权以下三句重录，脚本为 `scripts/fix_nobel2026_v51_voice.py`。新声音使用原 Qwen3-TTS 0.6B 模型和 rainbow鱼 参考音色；没有调用外部 API，没有保存密钥。

| 句源 | 最终口播 | 新原声时长 | 发声结束至旧时窗末的余量 |
|---|---|---:|---:|
| `004-03` | 两根细长鞭毛，立刻改变节奏。 | 2.64 s | 0.72 s |
| `016-02` | 装上通道，再受到光照，细胞才会响应。 | 3.52 s | 0.56 s |
| `021-02` | 有了光，研究者问得更精确： | 2.80 s | 1.01 s |

三句均原速、完整保留，无裁尾。016 首选原句只有 0.20 s 末尾余量，改用自然短句；021 第一候选长 3.76 s 超过原 3.44 s 时窗，重新写短句合成，没有强行加速。全部 `clip` 起止帧、场景起止帧与 8192 总帧保持不变。字幕只改对应句的内容及声学起止，其他小句保持原值。

混音先从 `audio-v4/voice.wav` 的三个原时窗清除旧声音，再放入新句；复用原始独立 `music.wav` 混音。补丁之外的人声样本逐样本一致，最大差值 0。独立产物：`public/nobel2026/audio-v51/voice.wav`、`premaster.wav`、`master.wav`。V4/V5 文件没有修改。

- 新母带 SHA-256：`820f499d2b768049ed0937d3e46df95059546aab46ccfc30f7113df14d21e8e3`。
- WAV 实测：273.0667 s，48 kHz 双声道，约 −15.9 LUFS、−1.2 dBTP，LRA 3.4 LU。最终 AAC 仍须成片后单独复测。
- 句源、种子、参数、实测发声范围及补丁外一致性：`research/nobel2026/v51/voice-patch.json`。
- ASR：`research/nobel2026/v51/patch-asr.json`。三句无漏词，004 的“鞭毛”识别为同音“边毛”；这是听审提示，不能据此自动认定发音正确或错误。
- 局部试听：`delivery/nobel2026_v5_1/audio-check-004-correction.wav`、`audio-check-016-correction.wav`、`audio-check-021-correction.wav`，均带前后文及配乐。
- 同时间线已导出 `delivery/nobel2026_v5_1/中文字幕.srt`（81 小句）和 `旁白.txt`（22 段），含三处更正。
- 本次仅执行 manifest 模式：84 内容帧、51 总览帧、30 接缝帧，静态自动错误 0；没有执行完整成片解码，没有把主观听审标为通过。
