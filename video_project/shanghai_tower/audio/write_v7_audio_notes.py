"""Write current audio handoff facts from measured reports."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads((ROOT/p).read_text('utf-8-sig'))
tl=read('public/timeline.json');mix=read('research/audio-report.json');qa=read('research/audio-validation.json')
audit=read('research/v7-selected-audio-audit.json');promote=read('research/v7-voice-promotion.json')
draft=bool(tl.get('draft'))
state='镜头检查用临时稿：s029–032 仍暂留前版旁白，待平均风场的数值验收后替换。不能作为本轮最终视频。' if draft else '当前讲稿及选用语音完成技术检查。最终视频编码后的 AAC 仍需单独复核。'
music=('最新指定曲目正在重新编排，当前声音仅保留作临时预览，`musicReplacementPending=true`。' if mix.get('musicReplacementPending') else mix.get('musicSource',''))
if mix.get('requestedMusicSource'):
 source=mix['requestedMusicSource'];slug='feisheng' if source.get('title')=='飞升' else 'sixth-axis'
 source_text=f"当前使用用户明确指定的本地文件 `{source.get('path',source.get('localPath'))}`，内嵌标签为 {source.get('artist')} / {source.get('title')} / {source.get('album')}。最新的《飞升》选择已替代先前的《The Sixth Axis》和抖音链接。来源记录、原文件SHA256、节拍与调性色度分析在 `audio/{slug}/analysis.json`；编排和剪辑证据在 `audio/{slug}/current-arrangement.json` 指向的报告。通过同曲和声与鼓点上下文吻合的8/16小节回接延展，保留原曲收束，仅缩短近静音尾部；使用Rubber Band微调总时长，音高保持0半音变动。章节以持续的电平与高频细节曲线服务旁白，不任意转调。用户提供的录音不标成CC0或原创配乐。"
else:
 source_text='原创采样来自 [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)，固定提交 `440300901dfe9275fd84e0b7763af1f8443ae62e`，许可 CC0-1.0；具体来源与文件哈希在 `audio/music_source/samples/manifest.json`。本集内重新编排不冒充新曲，也不复用其他集的成曲。'
text=f'''# 上海中心 · V7 声音制作

{state}

实际时长 **{tl['duration']/tl['fps']:.6f} 秒**，{tl['duration']} 帧 / {tl['fps']} fps，48 段语义镜头，{len(tl['captions'])} 条短字幕，片尾参考页保持 {tl['outro']['duration']/tl['fps']:g} 秒。按完整实声排镜头，没有变速、拉伸或裁短字音。文件以 `src/timeline.json`、`public/timeline.json` 和 `delivery/ShanghaiTower.srt` 为准。

## 讲稿与个人声音

使用本地 rainbow鱼 参考音色与 Qwen3-TTS-0.6B，私有参考留在 `D:/python_project/tts`，不进入交付包。标准文案与选用音频的实际 TTS 文本一致，字幕不抄 ASR 的错字。s001 直接以“上海中心”开头；桩侧/桩端、独立单桩动态、伸臂上下弦和斜杆、风致增量与重力净压应力依次解释。把“长到”改成“升到”等少歧义说法。

本轮选用 {len(promote['promoted'])} 段更新声音。候选的文本、参数、参考哈希、种子、原声和处理后声音均保存；当原声尾部仍有显著语音能量时重新合成，不能靠加静音掩盖。s018 最终另换了末句识别完整、原始端点检查通过的候选；这不等于已认证主观听感。修改记录在 `audio/v7-rewrite-manifest.json`、选用与ASR编辑在 `research/v7-voice-promotion.json`。旧选用文件保存在 `audio/v7-baseline`，原始句源仍留在 `audio/raw`。

每条原声只做一遍温和处理。明确加入 80 ms 前导、160 ms 尾部保护，计入实声长度；不硬裁辅音、不用多轮强降噪、不改个人音色。48 段所选声音的有限性、哈希、无截幅和处理长度检查通过；当前原声端点警报 {len(audit['rawEndpointFlags'])} 条，处理后边界警报 {len(audit['boundaryMarginFlags'])} 条。ASR 当前48段均完成，无漏头、漏尾或异常语速标记；同音字形差异保留原始识别记录，不因此改写正确术语。

`subjectiveListeningChecked=false`、`pronunciationListeningVerified=false`：这些是内容、波形和时间检查，不冒充人工听审或声调认证。

## 音画和物理边界

实际关键短语的片内秒数、镜头内比例与全片时间保存在 `research/v7-narration-cues.json`。上下弦拆出→斜杆→回装的动作按这些词时对齐。字幕最短 {qa['minimumCaptionFrames']} 帧，无重叠，每条按一个意思拆短；品牌和技术标签由画面统一排版。

桩段使用独立单桩教学算例，不是947根群桩实际反力；结构风荷载也采用独立教学输入。当前等效 FE 的楼面约束使伸臂上下弦风致轴力增量为零，旁白只解释它们的连接关系，定量受力图显示实际非零的斜腹杆和巨柱响应。不把通用桁架理论说成本模型已解出的弦杆内力。

风段使用理想化平均流场，叙述平均表面压力、100/300/500米水平速度切片和穿过塔轴的纵向切片。该场只通过限定用途的定性科普复核，保留有限网格误差；不声称严格收敛、工程预测、实楼瞬态尾涡或CFD—结构荷载耦合。稳态求解得到的平均场与时间平均数据均可使用这套旁白口径，具体实际求解方法以CFD来源报告为准。

## 配乐与混音

{music}

本次按新版实声时长重新编排同片器乐，保留声部、乐句衔接和语音 ducking。每句前约0.1秒压低音乐，整句保持稳定，避免逐字抽吸。声音与音乐独立保存为 `public/narration.wav` 和 `public/music.wav`，母带为 `public/master.wav`。

当前母带 {mix['masterMeasurement']['input_i']} LUFS / {mix['masterMeasurement']['input_tp']} dBTP；AAC 试编码 {mix['aacMeasurement']['input_i']} LUFS / {mix['aacMeasurement']['input_tp']} dBTP；活动语音高于音乐 {mix['voiceOverMusicActiveDB']:.2f} dB。全轨采样率48 kHz、每轨 {qa['checks']['master.wav']['samples']} 个采样点。试编码数值不等于最后 MP4 中的实测结果，成片后需再次测量。

{source_text}

## 复现和检查

本地执行环境为 `D:/python_project/tts/.venv/Scripts/python.exe`。制作入口包括 `scripts/voice.py`、`scripts/qc.py`、`scripts/mix.py`、`scripts/audio_audit.py`、`scripts/validate_audio.py`。V7 晋升、词时和状态入口在 `audio/promote_v7_voice.py`、`audio/v7_narration_cues.py`、`audio/mark_v7_timeline.py`。完整的音频检查见 `research/audio-validation.json` 与 `research/v7-selected-audio-audit.json`。

`audio/AB-raw.wav`、`audio/AB-processed.wav` 为等响度开场对照，`audio/preview-with-music.wav` 是含配乐前35秒预览。保留这些试听文件，不把生成了预览称为已经人工听过。
'''
(ROOT/'docs/audio-production.md').write_text(text,encoding='utf8')
print('Updated current audio documentation; draft',draft)
