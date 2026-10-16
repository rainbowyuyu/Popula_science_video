"""Publish metadata to the audio workspace only; the editor owns scene integration."""
import json,difflib
from audio_common import ROOT,OUT,TTS,MUSIC,sha,save

def export_word_events(narr):
    # These observed word anchors let the editor time an explanatory action to
    # the sentence that actually names it. Missing matches remain absent.
    from audio_asr import norm
    reviews=json.loads((OUT/'asr-review.json').read_text(encoding='utf8'))['cues']
    byid={r['id']:r for r in reviews}
    wanted={'s02':['幸福路八号','别按门铃'],'s06':['杂乱','数字'],'s07':['还原'],
            's08':['密钥'],'s09':['密钥'],'s10':['钥匙'],'s13':['黄色'],'s14':['红色'],
            's15':['蓝色'],'s16':['黄色和红色','黄色和蓝色'],'s17':['交换','原色'],
            's19':['红色'],'s20':['蓝色'],'s21':['一样'],'s22':['两端'],
            's24':['蛋糕店','冒名'],'s25':['证书','网址','私人钥匙'],
            's26':['证书','私人钥匙','拿不到'],'s27':['握手'],'s28':['密钥'],
            's29':['改动'],'s30':['核验','拒收'],'s31':['恢复订单','报错'],
            's32':['蛋糕店'],'s34':['门铃没响']}
    events=[]
    for cue in narr['cues']:
        chars='';times=[]
        for w in byid[cue['id']]['words']:
            text=norm(w['text'])
            for k,ch in enumerate(text):
                chars+=ch;times.append(w['start']+(w['end']-w['start'])*k/max(1,len(text)))
        for phrase in wanted.get(cue['id'],[]):
            at=chars.find(norm(phrase))
            method='exact observed ASR phrase'
            if at<0:
                target=norm(cue['text']);pos=target.find(norm(phrase))
                mapping={}
                for block in difflib.SequenceMatcher(None,target,chars).get_matching_blocks():
                    for k in range(block.size):mapping[block.a+k]=block.b+k
                nearby=[k for k in mapping if pos<=k<pos+len(norm(phrase))]
                if pos<0 or not nearby:continue
                at=mapping[min(nearby)];method='source phrase aligned to observed ASR characters'
            sec=cue['startSec']+times[at]
            events.append({'cueId':cue['id'],'phrase':phrase,'startSec':sec,'startFrame':round(sec*30),
                           'method':method+'; auxiliary animation anchor, not pronunciation approval'})
    required={(id,phrase) for id,phrases in wanted.items() for phrase in phrases}
    actual={(event['cueId'],event['phrase']) for event in events}
    missing=sorted(required-actual)
    if missing:raise RuntimeError('Unresolved visual word anchors: '+repr(missing))
    save(OUT/'word-events.json',{'fps':30,'events':events,'missingRequiredAnchors':[],
                               'subjectiveListeningChecked':False})

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    arr=json.loads((OUT/'music-arrangement.json').read_text(encoding='utf8'))
    qa=json.loads((OUT/'audio-qa.json').read_text(encoding='utf8'))
    source=json.loads((OUT/'source-qa.json').read_text(encoding='utf8'))
    beats=[float(t) for t in arr['beatTimesSec'] if 0<=t<narr['durationSec']]
    assert all(a<b for a,b in zip(beats,beats[1:]))
    save(OUT/'beats.json',beats)
    export_word_events(narr)
    manifest={'title':narr['title'],'durationSec':narr['durationSec'],'durationFrames':narr['durationFrames'],
              'fps':30,'sampleRate':48000,'channels':2,'newLocalNarration':True,
              'localTtsProject':TTS.as_posix(),'voiceModel':'Qwen3-TTS-0.6B',
              'referenceAudioIncluded':False,'originalMusic':MUSIC.as_posix(),
              'sourceMusicSha256':sha(MUSIC),'timeStretch':False,'subjectiveListeningChecked':False,
              'timelineMetadata':['work/audio/narration.json','work/audio/captions.json','work/audio/beats.json'],
              'subtitle':'work/audio/subtitles.srt',
              'sourceQa':source,'masterQa':qa,
              'files':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in [OUT/'narration.json',OUT/'captions.json',OUT/'beats.json',OUT/'subtitles.srt',ROOT/'public/audio/master.wav',ROOT/'public/audio/narration.wav']]}
    save(OUT/'delivery-manifest.json',manifest)
    lines=[f"# {narr['title']} · V4声音记录",'',
           f"全新个人音色旁白 {len(narr['cues'])} 句；总长 {narr['durationSec']:.3f} 秒，{narr['durationFrames']} 帧，30fps，48kHz立体声。",'',
           '原声逐句保留，加80ms前护和160ms后护。轻处理的滤镜延迟逐句测量补偿，不变速、不变调、不切句尾。',
           '字幕使用标准源稿，Whisper词级锚点定位，按实际旁白时间拼接；自动识别辅助找漏字和重复，不能替代音色与声调听审。','',
           f"使用用户指定原曲：{MUSIC.name}。原曲SHA256：`{sha(MUSIC)}`。",
           '从原始MP3重新解码、检测节拍与乐句，保留原曲开头，按检测的乐句循环。每个接点一小节互补余弦交叠，人声前提前降低音乐、句后柔和恢复。','',
           f"WAV {qa['masterWav']['input_i']} LUFS / {qa['masterWav']['input_tp']} dBTP；AAC预览 {qa['encodedAAC']['input_i']} LUFS / {qa['encodedAAC']['input_tp']} dBTP。",
           f"字幕 {source['subtitleCount']} 条，最长 {source['maxSubtitleCharacters']} 字；语音活跃窗口覆盖率 {source['subtitleSpeechEnergyCoverage']:.1%}。",'',
           '**主观听审未完成。** 参数、ASR和响度核验不能证明悦耳或读音全部正确。没有宣称广播级认证。',
           '用户授权本片使用指定本地录音；其公开发行许可未在本轮另行核实，不将其标为免版税音乐。','',
           '## 入口','',
           '- 成片声音：`public/audio/master.wav`；独立旁白：`public/audio/narration.wav`。',
           '- 时间线：`work/audio/narration.json`；字幕：`work/audio/captions.json`和`subtitles.srt`；节拍：`beats.json`。',
           '- 原声：`work/audio/raw`；处理后：`clean`；原句参数和种子：`voice-generation.json`。',
           '- 参考音色仍留在用户TTS工程，没有复制到本片。','',
           '## 复现','',
           '使用 `D:/python_project/tts/.venv/Scripts/python.exe`，依次执行本片 scripts 下的：',
           '`tts_generate.py --plan`、`tts_generate.py`、`audio_prepare.py`、`audio_asr.py`、`audio_qa.py`、`audio_music_analyze.py`、`mix_master.py`、`audio_delivery.py`。',
           '冻结后重跑计划应显示0条待生成。改稿后只重录变更整句，再依据真实时长重建音画。','',
           '## 实际时长','', '|句号|场景|原声秒数|片内开始|片内结束|','|---|---|---:|---:|---:|']
    for c in narr['cues']:lines.append(f"|{c['id']}|{c['scene']}|{c['rawDurationSec']:.3f}|{c['startSec']:.3f}|{c['endSec']:.3f}|")
    (ROOT/'docs/audio-production.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps({'durationSec':narr['durationSec'],'durationFrames':narr['durationFrames'],'beatCount':len(beats),'manifest':'work/audio/delivery-manifest.json'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
