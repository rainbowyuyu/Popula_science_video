"""Publish only subtitle/beat metadata and provenance documentation; audio stays frozen."""
import json,shutil
from pathlib import Path
from audio_common import ROOT,OUT,TTS,MUSIC,sha,save

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    arr=json.loads((OUT/'music-arrangement.json').read_text(encoding='utf8'))
    qa=json.loads((OUT/'audio-qa.json').read_text(encoding='utf8'))
    sourceqa=json.loads((OUT/'source-qa.json').read_text(encoding='utf8'))
    delivery=ROOT/'delivery';delivery.mkdir(exist_ok=True);docs=ROOT/'docs';docs.mkdir(exist_ok=True)
    subtitle=delivery/'密码学_让小偷送秘密_字幕.srt';shutil.copy2(OUT/'subtitles.srt',subtitle)
    beats=[float(t) for t in arr['beatTimesSec'] if 0<=t<narr['durationSec']]
    assert all(a<b for a,b in zip(beats,beats[1:]))
    save(ROOT/'src/beats.json',beats)
    save(OUT/'beat-export.json',{'path':'src/beats.json','units':'seconds','format':'numeric array only',
        'count':len(beats),'source':'work/audio/music-arrangement.json','sourceSha256':sha(OUT/'music-arrangement.json'),
        'sha256':sha(ROOT/'src/beats.json'),'note':'Detected beat locations, not guaranteed bar downbeats; choose occasional narrative accents only.'})
    rows=['# 让小偷送秘密 · 声音制作与恢复说明','',
        f"最终音轨：**{narr['durationSec']:.3f} 秒 / {narr['durationFrames']} 帧**，30 fps，48 kHz、立体声、24-bit PCM。",
        f"本片重新合成 **{len(narr['cues'])} 句**，原声合计 **{sum(c['rawDurationSec'] for c in narr['cues']):.6f} 秒**。没有使用旧片旁白，没有变速、变调或硬截句尾。",'',
        '## 文件入口','',
        '- `public/audio/master.wav`：成片使用的冻结母带。',
        '- `work/audio/narration.wav`：独立旁白；`raw/`、`clean/`、`processing/`保存逐句来源及处理报告。',
        '- `src/narration.json`、`src/captions.json`：按实测源长排好的最终时间数据。',
        '- `delivery/密码学_让小偷送秘密_字幕.srt`：可单独导入平台的完整字幕。',
        '- `src/beats.json`：只有数字的数组，单位为秒；来自本片配乐的真实检测拍点和乐句循环映射。不是每一拍都应驱动动作，也不保证每个拍点是小节重拍。','',
        '## 真实来源和许可状态','',
        f'- 配音工具：用户既有 `{TTS.as_posix()}/models/Qwen3-TTS-0.6B`，个人参考音色仅从本地读取，没有复制到交付包。用户明确授权本片使用。',
        '- 模型和依赖各自的上游许可没有在本轮重新做法律审查；模型来源、权重哈希、参数和种子均保存在 `work/audio/voice-generation.json`。',
        f'- 配乐：用户明确指定的本地文件 `{MUSIC.as_posix()}`。',
        '- 用户指定了这首录音的使用，但本轮未取得或验证该录音及词曲的公开发布/商业授权；不把它标为免版税、CC0或原创音乐。',
        f"- 原曲SHA-256：`{qa['sourceMusicSha256']}`。参考音频和模型权重SHA在生成台账中；不交付私有参考音频。",'',
        '## 配乐衔接','',
        '保留原曲开场，采用21.316—117.841秒的乐句循环；片内117.841秒、214.367秒为两次接点，每次提前约2.020秒做互补余弦交叠。尾段约5.5秒柔和收束，无音乐变速或变调。',
        '音乐先约−25 LUFS整理，再为人声频段留空间；讲话前提前避让约4.4 dB，句后缓慢恢复。密集解释部分略降，避免每个字间的抽吸。','',
        '## 实际技术核查','',
        f"- WAV：{qa['masterWav']['input_i']} LUFS，{qa['masterWav']['input_tp']} dBTP；AAC预览：{qa['encodedAAC']['input_i']} LUFS，{qa['encodedAAC']['input_tp']} dBTP。",
        f"- 共 {qa['samples']:,} 样本，与{narr['durationFrames']}帧完全对应；每个clean源逐样本验证完整拼入旁白。",
        f"- 字幕{sourceqa['subtitleCount']}条，最长{sourceqa['maxSubtitleCharacters']}字。每句完整窗口连续，测得语音活跃窗口覆盖率{sourceqa['minimumPerCueSpeechEnergyCoverage']:.0%}。",
        '- 本地Whisper-small辅助检查无VAD裁剪、无提示词。数字段、句首句尾和差异对照在 `work/audio/readback-review.md`。自动识别的同音字、专名差异不能直接判定为原声错误。',
        '- 没有检测到超过1秒的混音静音，原声首尾检测没有触发疑似硬截断阈值。',
        '- **未完成人工主观听审。** 所有报告保持 `subjectiveListeningChecked: false`；没有宣称广播级认证、逐句真人试听或全片主观验收。',
        '- 目前仅AAC音频预览做过五处母带相关性检查；最终MP4的完整解码与同步核验必须等待成片生成。','',
        '## 32句实际时长','',
        '| 句号 | 场景 | 原声秒数 | 含保护clean秒数 | 片中开始秒 | 片中结束秒 |',
        '|---|---|---:|---:|---:|---:|']
    for c in narr['cues']:rows.append(f"| {c['id']} | {c['scene']} | {c['rawDurationSec']:.3f} | {c['actualDurationSec']:.3f} | {c['startSec']:.3f} | {c['endSec']:.3f} |")
    rows+=['','## 恢复与复现','',
        '源稿、所有raw/clean句源、处理JSON、模型参数、hash、种子、原曲路径与SHA必须保留；个人参考音色继续留在原TTS工程。完整环境版本在 `work/audio/environment.json`。',
        '先运行 `voice_generate.py --plan` 校验缓存；无改稿应显示0待生成。需要重录时只重录相应整句，再按新实际时长重建时间线。当前冻结母带不要直接覆盖。','',
        '在本片目录使用 `D:/python_project/tts/.venv/Scripts/python.exe` 执行：','',
        '```text','scripts/voice_generate.py --plan','scripts/audio_prepare.py','scripts/asr_verify.py','scripts/audio_qa.py','scripts/mix_master.py','scripts/voice_delivery.py','```','',
        '最终视频存在并完成封装后，两个只读核验脚本默认使用 `delivery/密码学_让小偷送秘密_1080p.mp4`：','',
        '```text','scripts/qa_final.py','scripts/qa_av_sync.py','```','',
        '`qa_final.py`完整顺序解码并以小块读取文件哈希；`qa_av_sync.py`只读取五段共40秒AAC，与母带相关性对齐，容许偏移不超过1帧。两者不修改成片、母带或视觉源码。','',
        '开场与两个循环口试听在 `work/audio/preview-*.mp3`，4组等响度raw/clean对照在 `work/audio/ab-previews/`。']
    (docs/'audio-production.md').write_text('\n'.join(rows)+'\n',encoding='utf8')
    print(json.dumps({'subtitle':str(subtitle),'beatCount':len(beats),'docs':str(docs/'audio-production.md')},ensure_ascii=False))

if __name__=='__main__':main()
