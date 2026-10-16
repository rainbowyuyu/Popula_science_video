"""Publish V4 audio metadata and evidence without changing visual source files."""
import json,shutil,subprocess
from audio_common import ROOT,OUT,sha,save,story

def main():
    s=story();narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    qa=json.loads((OUT/'source-qa.json').read_text(encoding='utf8'))
    mix=json.loads((OUT/'audio-qa.json').read_text(encoding='utf8'))
    pause=json.loads((OUT/'pause-audit.json').read_text(encoding='utf8'))
    words=json.loads((OUT/'word-events.json').read_text(encoding='utf8'))
    evidence=json.loads((OUT/'pronunciation-evidence/evidence.json').read_text(encoding='utf8'))
    ledger=json.loads((OUT/'voice-generation.json').read_text(encoding='utf8'))
    assert not pause['reviewCueIds'],'Resolve flagged internal pauses before publishing'
    assert not words['missingRequiredAnchors']
    assert len(qa['cues'])==len(s['cues'])==34
    for c in s['cues']:
        assert ledger[c['id']]['text']==c['spokenText'],c['id']+' has outdated spoken source'
    for name in ('narration.json','captions.json','word-events.json','beats.json'):
        shutil.copy2(OUT/name,ROOT/'src'/name)
    subprocess.run(['node','scripts/build_timeline.mjs'],cwd=ROOT,check=True)
    report={'version':'V4','durationSec':narr['durationSec'],'frames':narr['durationFrames'],
        'sourceStorySha256':sha(ROOT/'src/story.json'),'narrationCues':34,
        'pronunciation':{'display':'密钥','userRequested':'mì yào','speechOnlyInput':'密药',
            'incorrectOldInputRemoved':'密月','evidence':'work/audio/pronunciation-evidence/evidence.json',
            'actualContextClips':len(evidence['clips']),'phonemeCertified':False,'subjectiveListeningChecked':False},
        'pauses':{'betweenCuesSec':.16,'betweenGroupsSec':.42,'headProtectionSec':.08,'tailProtectionSec':.16,
            'artificialPaddingToTarget':False,'longInternalReviewCueIds':pause['reviewCueIds']},
        'subtitleCount':qa['subtitleCount'],'maxSubtitleCharacters':qa['maxSubtitleCharacters'],
        'subtitleSpeechCoverage':qa['subtitleSpeechEnergyCoverage'],'orphanPunctuationCaptions':qa['orphanPunctuationCaptions'],
        'fullSourceIncludedSampleExact':qa['sampleExactSources'],'tailReviewCandidates':qa['tailReviewCandidates'],
        'masterWav':mix['masterWav'],'aacPreview':mix['encodedAAC'],'visualAnchorCount':len(words['events']),
        'masterSha256':sha(ROOT/'public/audio/master.wav'),'sourceVersionPreserved':'V3 unmodified',
        'notYetChecked':'Final V4 MP4 encoding and semantic visual alignment require final render; no subjective listening claim'}
    save(OUT/'v4-change-report.json',report)
    lines=['# 密码学 V4：旁白、读音和字幕调整','',
        f"新录34句，总长 {narr['durationSec']:.3f} 秒 / {narr['durationFrames']} 帧。保持原科学过程和场景顺序，V3不修改。",'',
        '将“最妙的地方”“还差一个小心眼”等模板句改为生活化因果；减少句中碎逗号，去掉反复提示镜头的表述。s08只讲现有加解密动作，s12说明两端位置，不把会交换的杯子说成手机身份。',
        '相邻句额外停顿改为0.16秒，段落末0.42秒；仍保留80ms前护与160ms后护。按实际声源排时间，不变速、不截尾、不补停顿凑足300秒。','',
        '## 指定读音','',
        '密钥按用户要求读 **mì yào**。显示稿维持“密钥”，朗读专用输入用同音“密药”，撤销旧版错误“密月”覆盖。s08、s09、s28、s30均重新合成完整句子。',
        '实际声音证据保存在 `work/audio/pronunciation-evidence/`：四个语境WAV及原句、生成参数、哈希和ASR对照。自动识别文字只能辅助复核，不能证明声调和悦耳度；尚未进行主观听审。','',
        '## 技术核查','',
        f"- {qa['subtitleCount']}条字幕，最长{qa['maxSubtitleCharacters']}字，无孤立/前置标点；语音活跃窗口覆盖{qa['subtitleSpeechEnergyCoverage']:.0%}。",
        '- 所有clean源逐样本完整拼入独立旁白；没有检测到原声句尾截断候选。',
        f"- 逐句内部静音检测记录{pause['allDetectedGaps']}处≥0.6秒停顿；需额外复核的非语义长停顿：{pause['reviewCueIds']}。没有自动裁剪这些停顿。",
        f"- {len(words['events'])}个词事件已对齐到实际录音，s26退出锚点增加“拿不到”。",
        f"- 母带 {mix['masterWav']['input_i']} LUFS / {mix['masterWav']['input_tp']} dBTP；AAC预览 {mix['encodedAAC']['input_i']} LUFS / {mix['encodedAAC']['input_tp']} dBTP。",'',
        '指定背景音乐保持原曲，按乐句循环，并为旁白平滑避让。原声、独立旁白、母带和音乐各自留档。',
        '以上为真实文件和自动测量证据，不等于全片主观听审。最终V4成片还需要编码、同步、黑帧及音画语义检查。']
    (ROOT/'docs/audio-v4-changes.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
