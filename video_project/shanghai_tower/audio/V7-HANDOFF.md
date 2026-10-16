# 当前声音任务交接

以最新用户指定的 **聲無哀樂SWAL《飞升》** 为准。The Sixth Axis 已 superseded，旧抖音链接也已 superseded。

## 生产状态

- 当前 canonical timeline **14,909帧、496.966667秒**，`draft=false`、`pendingNarrationClips=[]`；六条最终候选已统一晋升，48条实声、236条短字幕和9秒参考尾页。
- 当前 `public/music.wav` / `public/master.wav` 已是最终时长《飞升》。母带 −15.02 LUFS / −1.79 dBTP，AAC试编码 −15.03 LUFS / −1.71 dBTP；活跃人声高于音乐18.5 dB，中段无配乐静音窗。
- 最新来源、编排与拍点指针：`audio/feisheng/current-arrangement.json`。
- `src/camera-beats.json`、`research/feisheng-camera-beats.json` 和当前混音目录中的 `camera-beats.json` 是同一份**377个**实测稳定强拍，绑定14,909帧和最终music SHA。896拍复核P95误差20.0ms，最终119.041524BPM。
- 完整锁定信息和哈希在 `research/v7-final-audio-lock.json`。当前混音为 `audio/feisheng/mixes/20261009-114816-5793527a`。
- ASR与波形检查不代表人工听审；始终保留 `subjectiveListeningChecked=false`。

## 已检查并晋升的候选

`v7-physics-final`：s019=13.36秒，s020=15.20秒。原始端点、保护后的字头字尾、长度、哈希、截幅和ASR均无警报。候选词时在 `research/v7-final-candidate-cues.json`。s019只说两根斜杆变色；s020先说明橙色受压方向增量、蓝色受拉方向增量，再回到巨柱解释减压仍可能净受压。

`v7-cfd-provisional`：s029=17.52s、s030=27.04s、s031=16.32004s、s032=13.36s，目录保留历史命名，现已核准选用。三份production CFD文件已 `quality.acceptedForFilm=true`，root和独立复核确认宏观平均场可用于有限网格误差下的定性科普。依据 `research/physics-v7/final-educational-cfd-acceptance.json`，不声称工程预测、严格残差收敛、网格无关或CFD—结构耦合。固定100/300/500m横剖与塔轴纵剖，旁白描述平均风压/平均风速，无精确未验收数字或瞬态脱涡说法。

六条候选的实际词时均已导出 `research/v7-final-candidate-cues.json`。s030的300m过渡u=.35398，500m过渡u=.67785；s032“接下来”u=.393–.437，随后“变化的侧向推力”u=.533–.619，因此u=.45结束CFD镜头合理。

已用真正的 `PhysicsPlayback` / `HighResolutionResponse` 逐帧校对s020受力语句，晋升后再次确认 `candidateTimingMatchesCanonical=true`：OX1在“橙色”和“向受压方向变化”期间始终为负；OX2在“蓝色”和“向受拉方向变化”期间始终为正。报告 `research/v7-candidate-voice-force-audit.json` 保存每帧物理时刻与MPa。全s020的461帧两根杆符号均保持一致，没有改变原物理数据或重排时钟。主代理决定保留当前箭头选择窗：蓝杆一直有真实应力着色，箭头可在首字后半秒内自然进入。

## 已完成的晋升顺序（复现用，不需要重复执行）

root已明确授权，三份production gate确认后依次完成：

1. 核对全部候选ASR、波形端点及文本哈希。把 `audio/v7-selected-takes.json` 的s019/s020选为 `v7-physics-final`，s029–032选为已核对CFD候选；其余17条中的未修改条仍是 `v7-flow-a`。
2. 将最终CFD文案、focus和状态同步 `audio/prepare_v7_story.py`，不能重跑旧生成器覆盖已修改候选。
3. `audio/promote_v7_voice.py`
4. `scripts/mix.py prepare`（只 prepare，不能 mix）
5. `scripts/qc.py --captions-only`
6. `audio/v7_narration_cues.py`
7. `audio/mark_v7_timeline.py`（不加 --draft；只有CFD已接受才可）
8. `scripts/arrange_feisheng.py --apply`
9. `audio/feisheng/verify_arranged_pulse.py`（同步输出camera-beats三份副本）
10. `scripts/qc.py`、`scripts/audio_audit.py --output research/v7-selected-audio-audit.json`、`scripts/validate_audio.py`
11. `audio/register_feisheng.py`、`audio/write_v7_audio_notes.py`

所有Python使用 `D:/python_project/tts/.venv/Scripts/python.exe`。配乐制作保留音高，全局时长小幅适配，不能任意变调、遗漏音乐或用旧原创配乐覆盖。

已向主代理报告总帧数、字幕数、timeline/music/master哈希与CFD词时。当前唯一声音待办是最终MP4实际AAC复核；这里的AAC是试编码。

## 成片音频复核

`scripts/qa_final_audio.py --video <最终MP4> --out <独立检查目录>` 已准备：验证锁定时间线、最新飞升来源和master/music哈希，解码成片真实AAC，估计编码对齐，比较四处人声窗口及无旁白参考尾页的音乐波形，实测LUFS与真峰值。必须对最终视频运行成功才可宣称成片声音通过，不能拿这个脚本存在或先前试编码结果当验收。
