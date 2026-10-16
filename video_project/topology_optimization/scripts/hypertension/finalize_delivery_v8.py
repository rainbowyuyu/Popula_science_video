from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'
DELIVERY = ROOT / 'delivery/hypertension'
VIDEO = ROOT / 'output/hypertension/hypertension_1080p.mp4'

def read(name):
    return json.loads((RESEARCH / name).read_text(encoding='utf8'))

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    timeline = json.loads((ROOT/'src/hypertension/timeline.json').read_text(encoding='utf8'))
    render = read('final-render.json')
    camera = read('camera-flow-audit.json')
    flow = read('arteriole-flow-direction-qa.json')
    constant = read('arteriole-constant-flow-qa.json')
    spatial = read('spatial-v5-qa.json')
    annotations = read('annotations-v7-qa.json')
    audio = read('audio-final-qa.json')
    qa = read('encoded-continuous-qa.json')
    sources = read('final-source-hashes-v8.json')
    assert render['success'] and render['frames'] == [0, timeline['duration']-1]
    assert camera['passed'] and camera['frames'] == timeline['duration']
    assert flow['passed'] and constant['passed'] and spatial['passed']
    assert annotations['passed'] and audio['status'] == 'passed'
    assert qa['decodePassed'] and qa['blackIntervals'] == 0 and qa['visualInspection'].startswith('passed')
    for rel, expected in sources.items():
        assert sha(ROOT/rel) == expected, f'stale source hash: {rel}'
    video_hash = sha(VIDEO)
    DELIVERY.mkdir(parents=True, exist_ok=True)
    shutil.copy2(VIDEO, DELIVERY/VIDEO.name)
    for name in ['timeline.json','physics.json','subtitles.srt']:
        shutil.copy2(ROOT/'public/hypertension'/name, DELIVERY/name)
    copy_names = [
        'encoded-continuous-qa.json','encoded-continuous-loudness.txt','encoded-continuous-probe.json',
        'final-render.json','final-source-hashes-v8.json','camera-flow-audit.json',
        'arteriole-flow-direction-qa.json','arteriole-constant-flow-qa.json','spatial-v5-qa.json',
        'annotations-v7-qa.json','audio-final-qa.json','audio-mix.json','music-v7-design.md',
        'music-v7-qa.json','music-v7-script-amendment.json','camera-v8-design.md','vascular-v8-design.md',
        'intro-v8-continuity-plan.md','arm-v7-geometry-qa.json','arm-v7-visual-review.md',
        'measurement-assembly-v7.json','medical-v4-evidence.md','medical-v4-evidence.json'
    ]
    for name in copy_names:
        src = RESEARCH/name
        if src.exists(): shutil.copy2(src, DELIVERY/name)
    for name in ['encoded-continuous-contact.jpg','encoded-current-overview-1.jpg','encoded-transitions-1.jpg','encoded-dolly-detail-1.jpg','encoded-dolly-detail-2.jpg','encoded-annotations-1.jpg']:
        if (RESEARCH/name).exists(): shutil.copy2(RESEARCH/name, DELIVERY/name)
    readme = f'''# 每天5分钟知识·高血压是怎样形成的（V8）\n\n- 成片：`hypertension_1080p.mp4`\n- 规格：1920×1080、30 fps、H.264 yuv420p、AAC 48 kHz stereo\n- 时长：{float(qa["videoSeconds"]):.3f} s（约 5 分 22 秒）\n- 开场：同一套坐姿测量小人模型，从全身、袖带/前臂、显示器连续推进，再沿镜头进入人体图谱。\n- 可视化：主动脉压力波、小动脉收缩与血流、肾脏滤过、肝脏 VLDL→IDL→LDL、受体内吞、斑块与血栓，以及测量姿势回收。\n- 片尾：压力—流量公式、技术路线和真实论文页。\n- 编码抽帧、黑帧、音频峰值、相机、空间、流量和标注审计证据随目录提供。\n\n视频 SHA-256：`{video_hash}`\n'''
    (DELIVERY/'README-v8.md').write_text(readme, encoding='utf8')
    shutil.copy2(DELIVERY/'README-v8.md', DELIVERY/'README.md')
    loud = qa['loudness']
    ledger = {
        'title':'每天5分钟知识·高血压是怎样形成的', 'revision':'vascular-continuous-v8-20261008',
        'video':VIDEO.name, 'durationSeconds':float(qa['videoSeconds']), 'videoFrames':int(qa['frames']),
        'fps':30, 'size':'1920x1080', 'codec':'H.264 yuv420p BT.709', 'audio':'AAC 48 kHz stereo',
        'audioDurationSeconds':float(qa['audioSeconds']), 'fileBytes':VIDEO.stat().st_size,
        'mp4Sha256':video_hash, 'mixedAudioLufs':float(loud['input_i']), 'aacTruePeakDbtp':float(loud['input_tp']),
        'narrationClips':audio['rawClips'], 'asrReviewIds':audio['asrReviewIds'],
        'asrMeanCharacterCoverage':audio['asrMeanCharacterCoverage'], 'timelineSha256':audio['timelineSha256'],
        'subjectiveListeningChecked':False, 'humanPronunciationReview':False, 'fullSpeedHumanPlayback':False,
        'codaSeconds':12, 'musicTitle':read('audio-mix.json')['trackTitle'],
        'musicSha256':sources['public/hypertension/music.wav'], 'decodeCheck':'Complete audio/video decode without errors',
        'blackFrameCheck':'No blackdetect intervals >=0.5 seconds', 'sampledVisualReviewFrames':qa['sampleCount'],
        'allFrameNumericalCameraAudit':True, 'cameraAuditedFrames':camera['frames'],
        'cameraKnotCount':camera['cameraKnotCount'], 'arterioleFlowAuditPassed':flow['passed'],
        'arterioleConstantFlowMaxError':max(c['maxAbsoluteError'] for c in constant['cases']),
        'annotationAuditFrames':annotations['frames'], 'annotationNumericalAuditPassed':annotations['passed'],
        'cuffGeometryCheckPassed':read('arm-v7-geometry-qa.json')['passed'], 'sourceHashes':sources,
        'generatedAt':datetime.now(timezone(timedelta(hours=8))).isoformat()
    }
    (DELIVERY/'DELIVERY.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:ledger[k] for k in ['revision','durationSeconds','videoFrames','fileBytes','mp4Sha256','mixedAudioLufs','aacTruePeakDbtp','sampledVisualReviewFrames']},ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
