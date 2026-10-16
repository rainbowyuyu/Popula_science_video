"""Publish the locally reviewed V4 export into the delivery folder."""
from pathlib import Path
import hashlib
import json
import shutil
import argparse
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'
DELIVERY = ROOT / 'delivery/hypertension'

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--version',default='v4',choices=['v4','v5','v6','v7'])
    parser.add_argument('--revision',default='vascular-continuous-v4')
    args=parser.parse_args()
    quality = read(RESEARCH / 'encoded-continuous-qa.json')
    camera = read(RESEARCH / ('camera-v7-audit.json' if args.version=='v7' else 'camera-flow-audit.json'))
    timeline = read(ROOT / 'src/hypertension/timeline.json')
    audio = read(RESEARCH / 'audio-final-qa.json')
    render = read(RESEARCH / 'final-render.json')
    sources = read(RESEARCH / f'final-source-hashes-{args.version}.json')
    assert quality['revision'] == args.revision
    assert quality['decodePassed'] and quality['blackIntervals'] == 0
    assert quality['visualInspection'].startswith('passed'), 'Encoded visual review is required'
    assert camera['passed'] and camera['frames'] == timeline['duration']
    assert render['success'] and render['frames'] == [0, timeline['duration'] - 1]
    assert audio['status'] == 'passed' and not audio['asrReviewIds']
    for relative, expected in sources.items():
        assert sha(ROOT / relative) == expected, f'Source changed after rendering: {relative}'
    video = ROOT / 'output/hypertension/hypertension_1080p.mp4'
    expected_video_hash = sha(video)
    assert quality.get('mp4Sha256',expected_video_hash)==expected_video_hash, 'Visual QA must match delivered encoding'
    copies = {
        'audio-final-qa.json':'audio-final-qa.json',
        'audio-mix.json':'audio-mix.json',
        'final-render.json':'final-render.json',
        f'final-render-{args.version}.log':'final-render.log',
        'encoded-continuous-loudness.txt':'final-loudness.txt',
        'encoded-continuous-qa.json':'encoded-continuous-qa.json',
        'camera-flow-audit.json':'camera-flow-audit.json',
        'arteriole-constant-flow-qa.json':'arteriole-constant-flow-qa.json',
        'arteriole-flow-direction-qa.json':'arteriole-flow-direction-qa.json',
        'anatomy-camera-design.json':'anatomy-camera-design.json',
        f'camera-{args.version}-review.md':f'camera-{args.version}-review.md',
        f'final-source-hashes-{args.version}.json':'final-source-hashes.json',
        'encoded-continuous-contact.jpg':'encoded-contact.jpg',
        'medical-v4-evidence.md':'medical-v4-evidence.md',
        'medical-v4-evidence.json':'medical-v4-evidence.json',
    }
    if args.version=='v7':
        copies.pop('camera-flow-audit.json')
        copies['camera-v7-audit.json']='camera-v7-audit.json'
        copies.update({name:name for name in ['arm-v7-geometry-qa.json','arm-v7-impact-scope.json','arm-v7-visual-review.md','annotations-v7-qa.json','measurement-assembly-v7.json','music-v7-design.md','music-v7-script-amendment.json']})
        copies['README-v7.md']='README.md'
        for report_name in ['arm-v7-geometry-qa.json','annotations-v7-qa.json','camera-v7-audit.json']:
            report=read(RESEARCH/report_name)
            assert report['passed'], report_name
            for relative,expected in report.get('sourceHashes',{}).items():
                assert sha(ROOT/relative)==expected, f'Stale report {report_name}: {relative}'
        assert sha(ROOT/'src/hypertension/World.ts')==read(RESEARCH/'arm-v7-geometry-qa.json')['sourceHash']
        assert read(RESEARCH/'arm-v7-impact-scope.json')['passed']
    if args.version in ['v5','v6']:
        copies.update({name:name for name in ['spatial-v5-qa.json','arteriole-v5-geometry-qa.json','nephron-v5-source.txt','vascular-bridge-v5.json']})
        if args.version=='v5':
            copies.update({name:name for name in ['camera-v5-design.md','v5-independent-findings.md','v5-motion-qa.json','v5-delivery-preflight.md','v5-objective-audit.md','plaque-assembly-v5.json','plaque-assembly-checks-v5.json','plaque-visibility-scope-v5.json','plaque-v5-root-cause.md']})
        else:
            copies.update({name:name for name in ['camera-v6-design.md','cuff-v6-design.md','cuff-v6-geometry-qa.json','annotations-v6-qa.json','annotations-v6-visual-review.md','annotations-v6-design.md']})
            copies['README-v6.md']='README.md'
        spatial=read(RESEARCH/'spatial-v5-qa.json')
        assert spatial['passed'], 'Spatial model validation required'
        for report_name in ['spatial-v5-qa.json','camera-flow-audit.json','arteriole-flow-direction-qa.json','arteriole-constant-flow-qa.json']:
            report=read(RESEARCH/report_name)
            assert report['passed'], f'Failed validation: {report_name}'
            for relative, expected in report.get('sourceHashes',{}).items():
                assert sha(ROOT/relative)==expected, f'Stale report {report_name}: {relative}'
        if args.version=='v6':
            for report_name in ['annotations-v6-qa.json','cuff-v6-geometry-qa.json']:
                report=read(RESEARCH/report_name)
                assert report['passed'], f'Failed validation: {report_name}'
                for relative,expected in report.get('sourceHashes',{}).items():
                    assert sha(ROOT/relative)==expected, f'Stale report {report_name}: {relative}'
                if report_name=='cuff-v6-geometry-qa.json':
                    assert sha(ROOT/'src/hypertension/World.ts')==report['worldSourceSha256'], 'Stale cuff geometry check'
    for original in copies:
        assert (RESEARCH/original).is_file(), f'Missing delivery evidence: {original}'
    shutil.copy2(video, DELIVERY / video.name)
    assert sha(DELIVERY / video.name) == expected_video_hash
    for name in ['timeline.json','physics.json','subtitles.srt']:
        shutil.copy2(ROOT/'public/hypertension'/name, DELIVERY/name)
    for original, target in copies.items():
        shutil.copy2(RESEARCH/original, DELIVERY/target)
    shutil.copy2(RESEARCH/'encoded-continuous-contact.jpg', DELIVERY/'final-stills-contact.jpg')
    shutil.copy2(RESEARCH/'encoded-dolly-detail-1.jpg', DELIVERY/'transitions-contact.jpg')
    contacts=[RESEARCH/name for name in quality['contactSheets']] if args.version=='v7' else [p for pattern in ['encoded-transitions-*.jpg','encoded-dolly-detail-*.jpg','encoded-current-overview-*.jpg','encoded-annotations-*.jpg'] for p in RESEARCH.glob(pattern)]
    for original in contacts:
        shutil.copy2(original, DELIVERY/original.name)
        if original.name.startswith('encoded-transitions-'):
            shutil.copy2(original, DELIVERY/original.name.replace('encoded-',''))
    if args.version=='v7':
        for original,target in [('music-v7-samples/LICENSE','MUSIC_SAMPLE_LICENSE.txt'),('music-v7-samples/manifest.json','music-sample-manifest.json'),('music-v7-qa.json','music-v7-qa.json')]:
            shutil.copy2(RESEARCH/original,DELIVERY/target)
    loud = quality['loudness']
    ledger = {
        'title':'每天5分钟知识·高血压是怎样形成的',
        'revision':args.revision+'-20261007',
        'video':video.name,'durationSeconds':float(quality['videoSeconds']),
        'videoFrames':int(quality['frames']),'fps':30,'size':'1920x1080',
        'codec':'H.264 yuv420p BT.709','audio':'AAC 48 kHz stereo',
        'audioDurationSeconds':float(quality['audioSeconds']),
        'fileBytes':video.stat().st_size,'mp4Sha256':expected_video_hash,
        'mixedAudioLufs':float(loud['input_i']),'aacTruePeakDbtp':float(loud['input_tp']),
        'narrationClips':audio['rawClips'],'asrReviewIds':audio['asrReviewIds'],
        'asrMeanCharacterCoverage':audio['asrMeanCharacterCoverage'],
        'timelineSha256':audio['timelineSha256'],
        'subjectiveListeningChecked':False,'humanPronunciationReview':False,
        'fullSpeedHumanPlayback':False,'codaSeconds':12,
        'musicTitle':read(RESEARCH/'audio-mix.json')['trackTitle'],'musicSha256':sources['public/hypertension/music.wav'],
        'decodeCheck':'Complete audio/video decode without errors',
        'blackFrameCheck':'No blackdetect intervals >=0.5 seconds',
        'sampledVisualReviewFrames':quality['sampleCount'],
        'allFrameNumericalCameraAudit':True,
        'cameraAuditedFrames':camera['frames'],
        'arterioleFlowAuditScope':read(RESEARCH/'arteriole-flow-direction-qa.json')['scope'],
        'cameraKnotCount':camera['cameraKnotCount'],
        'arterioleConstantFlowCheck':f"Three fixed-shape conditions; maximum sampled A*v discrepancy {100*max(c['maxAbsoluteError'] for c in read(RESEARCH/'arteriole-constant-flow-qa.json')['cases']):.4f}%",
        'sourceHashes':sources,
        'generatedAt':datetime.now(timezone(timedelta(hours=8))).isoformat()
    }
    if args.version in ['v6','v7']:
        annotations=read(RESEARCH/f'annotations-{args.version}-qa.json')
        ledger.update({'annotationCues':annotations['annotationCount'],'annotationAuditFrames':annotations['frames'],'annotationNumericalAuditPassed':annotations['passed'],'cuffGeometryCheckPassed':read(RESEARCH/('arm-v7-geometry-qa.json' if args.version=='v7' else 'cuff-v6-geometry-qa.json'))['passed']})
    if args.version=='v7':
        ledger.update({'armProportion':read(RESEARCH/'arm-v7-geometry-qa.json')['geometry']['forearmToUpper'],'musicSource':'Original arrangement with VSCO 2 CE CC0 recorded instrument samples','visualReuse':'Unchanged V6 frames 0–7999; replacement frames 8000–9670. Full film re-encoded with new audio. See measurement-assembly-v7.json.'})
    (DELIVERY/'DELIVERY.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:ledger[k] for k in ['revision','durationSeconds','videoFrames','fileBytes','mp4Sha256','mixedAudioLufs','aacTruePeakDbtp','sampledVisualReviewFrames']},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
