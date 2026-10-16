"""Write compact, factual audio provenance and production notes after QA."""
import json
from audio_common import ROOT,OUT,MUSIC,TTS,sha,save

def main():
    load=lambda name:json.loads((OUT/name).read_text(encoding='utf8'))
    narration=load('narration.json');qa=load('audio-qa.json');sources=load('source-qa.json')
    arrangement=load('music-arrangement.json');analysis=load('music-analysis.json')
    asr=load('asr-review.json');pause=load('pause-audit.json')
    assert sha(ROOT/'public/audio/master.wav')==sha(OUT/'master.wav')
    assert narration['durationFrames']==json.loads((ROOT/'src/beats.json').read_text(encoding='utf8'))['durationFrames']
    ledger=load('voice-generation.json')
    report={'title':'C语言指针：游戏里丢掉的一分','durationSec':narration['durationSec'],
        'fps':narration['fps'],'durationFrames':narration['durationFrames'],
        'sourceStorySha256':narration['sourceStorySha256'],'rawCueCount':len(ledger),
        'referenceSha256':sha(TTS/'work/clone-reference.wav'),'rawAndCleanPreserved':True,
        'timeStretch':False,'pitchShift':False,'sampleExactVoiceAssembly':sources['sampleExactSources'],
        'captionEnergyCoverage':sources['subtitleSpeechEnergyCoverage'],'musicSourceSha256':sha(MUSIC),
        'masterSha256':sha(OUT/'master.wav'),'audioQA':qa,
        'asrReviewCandidates':[r['id'] for r in asr['cues'] if r['requiresReview']],
        'pauseReviewCandidates':pause['reviewCueIds'],'subjectiveListeningChecked':False,
        'musicRights':'User-provided recording; distribution rights not independently verified.'}
    save(OUT/'audio-delivery.json',report)
    lines=[
      '# C语言指针 · 声音制作记录','',
      f"成片音轨 {narration['durationSec']:.3f} 秒，{narration['durationFrames']} 帧，30 fps；48 kHz、双声道、24-bit PCM。",
      '', '## 个人旁白','',
      '全部34句由用户的 Qwen3-TTS-0.6B 和既有 rainbow鱼参考音色新合成。前9句使用本地RTX5060，后25句使用用户自有fusion-gpu的空闲H100；两端模型权重和参考音色SHA256逐字一致。没有复用旧影片旁白，也没有替换通用云端音色。',
      '远端仅上传本片脚本与文案；直接使用已经部署的同一参考音色和模型，不重复上传私人参考音频、不安装全局依赖。所有回传句源均核对SHA256，批次、随机种子、物理GPU与环境记录在 voice-generation.json。',
      '原始 WAV、带保护静音的句源、清理后 WAV 分开保留；每句增加80 ms字头及160 ms句尾保护，温和降噪后测量并补偿滤镜延迟。',
      '不变速、不变调、不裁掉句尾。句间约0.32秒，段落间约0.5秒，第一句0.5秒起讲，片尾保留7秒。',
      '显示稿使用 p、C语言等规范写法；朗读稿使用“皮”“西语言”控制个人模型发音。源句、随机种子、模型参数及哈希见 voice-generation.json。',
      '', '## 配乐与节奏','',
      f'用户指定音乐：{MUSIC.name}。源文件 SHA256：`{sha(MUSIC)}`。',
      f"源曲长 {analysis['durationSec']:.3f} 秒，自动检测约 {analysis['estimatedBpm']:.2f} BPM。逐拍时间和每16拍的能量/色度特征见 src/beats.json、music-analysis.json。",
      '保留原曲开场；约166.383秒回到原曲23.417秒处同拍乐句，使用约2.961秒互补余弦交叠。最后一轮在适合时继续至原曲尾段，最后5.2秒柔和收束，不对歌曲作机械变速或变调。',
      '在解说期间温和减少中置1.1–5.2 kHz频段及少量2–4.2 kHz竞争频段，低频和立体声音乐空间保留。这是频谱处理中置减弱，并非真正人声分离。',
      '音乐基准约-25 LUFS，再依据旁白实际10 ms能量包络进行最长约5.2 dB平滑闪避；保留预先下降和较慢恢复，避免逐字抽吸。',
      '源曲由用户提供；未独立验证对外发布授权。',
      '', '## 实测与复核','',
      f"WAV：{qa['masterWav']['input_i']} LUFS，{qa['masterWav']['input_tp']} dBTP；AAC：{qa['encodedAAC']['input_i']} LUFS，{qa['encodedAAC']['input_tp']} dBTP。",
      f"字幕覆盖检测到的语音能量：{sources['subtitleSpeechEnergyCoverage']*100:.2f}%；字幕共{sources['subtitleCount']}条，最长{sources['maxSubtitleCharacters']}字符。",
      '逐句源已逐采样核对完整拼入旁白。Whisper-small只辅助找漏字、重复和字幕词边界，不替代真实听审。没有声称逐句主观听过，subjectiveListeningChecked 保持 false。',
      '', '## 复现','',
      '使用 `D:/python_project/tts/.venv/Scripts/python.exe` 依次运行：',
      '', '```powershell',
      'python scripts/audio_music_analyze.py','python scripts/tts_generate.py',
      'python scripts/audio_prepare.py --natural','python scripts/audio_asr.py',
      'python scripts/audio_pause_audit.py','python scripts/audio_qa.py','python scripts/mix_master.py',
      'python scripts/audio_delivery.py','```',
      '', '个人参考音频和模型保留在现有 TTS 工程，不复制进视频交付包。',
    ]
    dest=ROOT/'docs/audio-production.md';dest.parent.mkdir(exist_ok=True);dest.write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps({k:report[k] for k in ('durationSec','durationFrames','captionEnergyCoverage','masterSha256','asrReviewCandidates','pauseReviewCandidates')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
