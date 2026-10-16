"""Record current measured audio sources; never certify an unrendered MP4."""
from pathlib import Path
import datetime
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

tl=read(ROOT/'public/timeline.json')
assert tl['narrationRevision']=='v8-parts-atlas-opening'
report=read(ROOT/'research/audio-report.json')
valid=read(ROOT/'research/audio-validation.json')
assert valid['passed'] and valid['timelineSHA256']==sha(ROOT/'public/timeline.json')
asr=read(ROOT/'research/audio-voice-qa.json')
assert asr['completed']==48 and not asr['flagged']
audit=read(ROOT/'research/v8-selected-audio-audit.json')
assert audit['allFinite'] and audit['allSourceHashesMatch'] and audit['allUnclipped']
assert not audit['rawEndpointFlags'] and not audit['boundaryMarginFlags']
kept=read(ROOT/'audio/v8-baseline/preserved-s005-s048.json')
for sid,hashes in kept.items():
 for kind,relative in [('voice',f'public/voice/{sid}.wav'),('take',f'audio/takes/{sid}.json'),('asr',f'audio/asr/{sid}.json')]:
  assert sha(ROOT/relative)==hashes[kind],(sid,kind,'changed')
old=read(ROOT/'audio/v8-baseline/public/timeline.json')
oldclips={c['id']:c for c in old['clips']}
delta=tl['clips'][4]['start']-oldclips['s005']['start']
for c in tl['clips'][4:]:
 assert c['start']-oldclips[c['id']]['start']==delta
 assert c['duration']==oldclips[c['id']]['duration']
 assert c['text']==oldclips[c['id']]['text']
save(ROOT/'research/v8-preserved-later-audio.json',dict(passed=True,clips=44,files=132,
 baseline='audio/v8-baseline/preserved-s005-s048.json',allVoiceTakeASRFilesByteIdentical=True,
 allTextsAndDurationsUnchanged=True,uniformFrameShift=delta,uniformSecondsShift=delta/tl['fps']))
beats=read(ROOT/'src/camera-beats.json')
assert beats['timelineFrames']==tl['duration'] and beats['musicSHA256']==sha(ROOT/'public/music.wav')
lock=dict(status='audio_sources_locked_and_technically_validated',revision='v8-parts-atlas-opening',
 createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),frames=tl['duration'],seconds=tl['duration']/tl['fps'],
 voiceClips=48,captions=len(tl['captions']),tailSeconds=tl['outro']['duration']/tl['fps'],
 firstFourVoiceSeconds=sum(c['voiceDurationSeconds'] for c in tl['clips'][:4]),
 laterVoicesPreserved=44,uniformLaterFrameShift=delta,strongCameraBeats=len(beats['beats']),
 musicTitle=report['title'],musicArtist=report['artist'],masterMeasurement=report['masterMeasurement'],
 aacTrialMeasurement=report['aacMeasurement'],activeVoiceOverMusicDB=report['voiceOverMusicActiveDB'],
 subjectiveListeningChecked=False,pronunciationListeningVerified=False,finalVideoAACChecked=False,
 files={str(p):dict(sha256=sha(ROOT/p),bytes=(ROOT/p).stat().st_size) for p in [
 'public/timeline.json','public/narration.wav','public/music.wav','public/master.wav',
 'delivery/ShanghaiTower.srt','src/camera-beats.json','research/v8-narration-cues.json']})
save(ROOT/'research/v8-final-audio-lock.json',lock)

opening_source=ROOT/'research/parts-atlas-v8/opening-script.json'
opening_record=read(opening_source)
opening_record.update(status='selected_voice_technically_checked',durationMeasured=True,
 firstFourVoiceSeconds=lock['firstFourVoiceSeconds'],openingEndFrame=tl['clips'][4]['start'],
 openingEndSeconds=tl['clips'][4]['start']/30,
 timingNote='Selected complete waveforms measured at 48 kHz; clip slots include five-frame inter-take spacing. Timings are now locked to the V8 timeline, not the former script estimate.')
for row,current in zip(opening_record['shots'],tl['clips'][:4]):
 row.update(text=current['text'],startFrame=current['start'],endFrame=current['end'],
  voiceDurationSeconds=current['voiceDurationSeconds'])
opening_record['estimatedChineseCharacterCount']=sum(sum('\u4e00'<=c<='\u9fff' for c in s['text']) for s in opening_record['shots'])
save(opening_source,opening_record)
opening_doc=ROOT/'research/parts-atlas-v8/开场文案.md'
previous_doc=opening_doc.read_text('utf8')
visual_notes=previous_doc.split('## 画面与文字的对应',1)[1].split('## 后续声音执行边界',1)[0]
table='\n'.join(f"| {c['id']} | {c['start']/30:.3f}—{c['end']/30:.3f} 秒 | {c['text']} |" for c in tl['clips'][:4])
opening_doc.write_text('# 上海中心 · 构件图谱开场\n\n四段实声已生成并进行内容、波形、边界与时间检查。下面使用当前选定声音的实际镜头时段；第一句保持“上海中心，六百三十二米”。\n\n| 段落 | 实测镜头时段 | 旁白 |\n| --- | --- | --- |\n'+table+'\n\n## 画面与文字的对应'+visual_notes+'## 当前声音执行状态\n\n仅替换 s001—s004；s005 之后 44 段所选 WAV、take、ASR 文件与基线完全一致。已重排字幕和片内词时、配乐延展与 camera-beats。实测词时见 `research/v8-narration-cues.json`；当前源哈希见 `research/v8-final-audio-lock.json`。主观听审和声调认证未冒称完成，最终 MP4 的 AAC 另行检查。\n',encoding='utf8')

opening='\n'.join(f"- {c['id']}：帧 {c['start']}–{c['end']}（{c['start']/30:.3f}–{c['end']/30:.3f} 秒），实声 {c['voiceDurationSeconds']:.3f} 秒。" for c in tl['clips'][:5])
text=f'''# 上海中心 · V8 声音制作

当前声音源、字幕、音乐和母带已完成技术检查。新版成片尚未完成最终 AAC 核验；旧 Final3 的检验仅属历史记录，不能证明本版视频已正确带入音轨。

实际时长 **{lock['seconds']:.6f} 秒**，{lock['frames']} 帧 / 30 fps，48 段旁白，{lock['captions']} 条短字幕；片尾参考页保留 9 秒。前四段为 987 个语义分组的总览、构件功能和回装开场。987 指模型语义分组，不能当作施工零件总数。后续 s005–s048 的 44 条 WAV、选用元数据和 ASR 文件，共 132 文件与基线逐字节一致；字幕与镜头槽位整体后移 {delta} 帧（{delta/30:.3f} 秒）。

## 实测开场时序

{opening}

具体词时见 `research/v8-narration-cues.json`。`research/v7-narration-cues.json` 是兼容现有编排程序的同内容副本，版本字段明确写 V8。各镜头按完整实声安排，不裁短尾音、不拉伸旁白。

## 讲稿与个人声音

沿用本地 rainbow鱼 参考声音和 Qwen3-TTS-0.6B，仅重新合成开场四段。候选原声、参数、种子、处理后波形和识别差异保留在 `audio/candidates`、`audio/raw`。第一句是“上海中心，六百三十二米”。初轮术语识别存在不稳定处，单独生成对照候选，再按完整性和识别证据选用；记录见 `research/v8-voice-promotion.json`。字幕坚持正确原文，不抄识别出的同音字。

每段只经过一次温和处理，加入 80 ms 前导和 160 ms 尾部保护。48 段波形有限值、哈希、无截幅及处理长度检查通过，原始端点警报与处理后边界警报均为零。ASR 完成 48 段，自动标记零条。保留 `subjectiveListeningChecked=false` 和 `pronunciationListeningVerified=false`：波形、内容识别和字时检查不冒充人工听审或声调认证。

## 配乐与母带

采用用户选定的 **聲無哀樂SWAL — 飞升**，来源 `D:/CloudMusic/聲無哀樂SWAL - 飞升.mp3`。保留原曲推进与收束，以同曲和声、鼓点和电平匹配的乐句延展，少量全曲节奏适配且音高保持零半音变化。句级 ducking 与平滑章节音色电平服务解说，避免逐字抽吸。此录音不标为 CC0 或原创。

母带 **{report['masterMeasurement']['input_i']} LUFS / {report['masterMeasurement']['input_tp']} dBTP**；AAC 试编码 **{report['aacMeasurement']['input_i']} LUFS / {report['aacMeasurement']['input_tp']} dBTP**；活动语音高于音乐 **{report['voiceOverMusicActiveDB']:.2f} dB**。48 kHz，每轨 {report['totalSamples']} 个采样点。`public/narration.wav`、`public/music.wav`、`public/master.wav` 与字幕、节拍文件的当前哈希锁定在 `research/v8-final-audio-lock.json`。

音乐节拍建议来自重编排音频的实际 onset 检查；不是已经听审认证的音乐小节强拍。详情在 `audio/feisheng/current-arrangement.json` 和 `research/feisheng-pulse-verification.json`。开场等响度原声/处理后对照保存在 `audio/AB-raw.wav`、`audio/AB-processed.wav`；含配乐的前 35 秒在 `audio/preview-with-music.wav`。

## 物理与验证边界

后续讲解完全保留：单桩是独立教学算例，结构侧载与 CFD 场独立；当前等效 FE 的伸臂上下弦风致轴力增量为零，定量色彩图显示实际非零的斜腹杆与巨柱响应。风场用于理想化定性平均流展示，不声称网格无关的工程预测、实楼瞬态尾涡或流固耦合。

复现入口：`audio/promote_v8_opening.py` → `scripts/mix.py prepare` → `scripts/qc.py --captions-only` → `audio/v8_narration_cues.py` → `audio/mark_v8_timeline.py` → `scripts/arrange_feisheng.py --apply` → `audio/feisheng/verify_arranged_pulse.py` → 全声源 QA。不能用 `scripts/mix.py mix/all` 覆盖选定配乐。

新版 MP4 完成后，必须用 `scripts/qa_final_audio.py` 对该文件实际 AAC 做时长、母带相关性、片尾音乐与响度核验；此前 `finalVideoAACChecked=false`。
'''
(ROOT/'docs/audio-production.md').write_text(text,encoding='utf8')
(ROOT/'audio/V8-HANDOFF.md').write_text('# V8 音频交接\n\n'+opening+f'\n\n总帧数：{lock["frames"]}；总时长：{lock["seconds"]:.6f} 秒。后续 44 条声源和 ASR 元数据完全保留，统一后移 {delta} 帧。\n\n实测词时：`research/v8-narration-cues.json`；精确哈希：`research/v8-final-audio-lock.json`；音乐片段与节拍：`research/feisheng-motion-beat-cues.json`、`src/camera-beats.json`。\n\n最终 MP4 的 AAC 尚未检查，等完整渲染后调用 `scripts/qa_final_audio.py`。主观听审和声调认证均未冒称已完成。\n',encoding='utf8')
print(json.dumps(dict(status=lock['status'],seconds=lock['seconds'],frames=lock['frames'],laterFrameShift=delta,firstFoundationFrame=tl['clips'][4]['start']),ensure_ascii=False))
