"""Record the completed V2 review decision against the inspected file hashes."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/qa/final'

def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))

def sha(path):
    return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()

def write(path, value):
    (ROOT/path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

qa = read('research/qa/final/automatic-report.json')
video_sha = sha('delivery/GLP1_1080p.mp4')
assert qa['automaticChecksPass'] and all(qa['checks'].values())
assert qa['videoSHA256'] == video_sha
assert qa['timelineSHA256'] == sha('src/timeline.json')
root = read('research/qa/final/root-visual-review.json')
late = read('research/qa/final/evidence-visual-review.json')
motion = read('research/qa/final-motion/visual-review.json')
assert root['videoSHA256'] == late['video']['sha256'] == motion['videoSHA256'] == video_sha
assert not root['blockingIssues'] and not late['blockingIssues'] and not motion['blockingIssues']
opened = {p.replace('\\','/'):h for p,h in root['openedFilesSHA256'].items()}
for row in late['openedImages'] + motion['openedEvidence']:
    path = row['path'].replace('\\','/')
    if path in opened:
        assert opened[path] == row['sha256']
    opened[path] = row['sha256']
for path, expected in opened.items():
    assert sha(path) == expected, path
base_plan = read('research/qa/final/frame-manifest.json')
motion_plan = read('research/qa/final-motion/motion-manifest.json')
frames = {x['frame'] for x in base_plan['frames']} | {x['frame'] for x in motion_plan['frames']}
reports = ['research/qa/final/root-visual-review.json',
           'research/qa/final/evidence-visual-review.json',
           'research/qa/final-motion/visual-review.json']
review = {
    'reviewedAtUTC': datetime.now(timezone.utc).isoformat(),
    'videoSHA256': video_sha,
    'decision': 'Accepted for delivery within the documented sampled visual and technical scope.',
    'reviewers': ['Codex root','Codex glp1_evidence_story','Codex glp1_anatomy_assets'],
    'blockingIssues': [],
    'finalArtAcceptance': True,
    'sourceReportsSHA256': {p:sha(p) for p in reports},
    'openedImagesSHA256': opened,
    'distinctOpenedImages': len(opened),
    'contactSheetsOpened': 37,
    'fullResolutionImageFilesOpened': len(opened)-37,
    'baseExtractedFrames': 147,
    'additionalMotionFrames': 156,
    'uniqueExtractedFrameNumbers': len(frames),
    'nonBlockingIssues': motion['nonBlockingIssues'],
    'otherLimitations': root['limits'] + late['limitations'],
    'continuousMotionPlaybackReviewed': False,
    'fullDurationAudiovisualReviewCompleted': False,
    'subjectiveFullListeningCompleted': False,
}
write('research/qa/final/visual-review.json', review)
markdown = f'''# V2 成片检查汇总

已完成技术检查和下述视觉取样，在检查范围内未发现阻断交付的问题。当前版本可交付；两项轻微可读性观察完整保留。

最终MP4 SHA256：`{video_sha}`。

- 完整解码9776帧；1920×1080、30 FPS、视频轨325.866667秒，无检出的黑场。
- 最终AAC：−15.04 LUFS、−1.44 dBTP、LRA 2.4 LU。
- 实际打开37张接触表及{len(opened)-37}张不同文件的1080p单帧，共{len(opened)}个图像文件，全部哈希已再次匹配。
- 基础147帧覆盖48句代表帧、章节及微观边界和片尾；额外156帧覆盖13处转场，每窗12帧、间隔10帧。两组共有{len(frames)}个不同帧号。

轻微观察：F2366受体说明文字末端与膜网格局部相叠，文字仍可读；F1165“胃”的引线端点在透明视图中与后方胰腺投影重叠，可进一步提高指向辨识。片尾F9516–9526的小桌角随镜头退出，未遮挡论文。

餐桌的程序式鸡肉仍是风格化模型；真实扫描甜点、器皿和材质层次改善了场景观感。微观放大、信号流动、配体接近属于机制动画；没有将其称作MD或CFD结果。

这是最终编码图像的模型视觉抽查，加上源码相机连续性与技术测量。未连续播放或逐帧观看完整影片，未完成主观完整听审。抽样不能保证未取样帧没有细小闪烁，ASR与响度不能替代人声自然度听审。

详细记录：`root-visual-review.json`、`evidence-visual-review.json`、`../final-motion/visual-review.json`。全部实际打开图像路径、SHA及取样局限收录于本目录`visual-review.json`。
'''
(OUT/'visual-review.md').write_text(markdown, encoding='utf-8')
qa['manualVisualReviewCompleted'] = True
qa['finalArtAcceptance'] = True
qa['visualReviewReport'] = 'research/qa/final/visual-review.json'
qa['visualReviewReportSHA256'] = sha(qa['visualReviewReport'])
qa['visualAcceptanceScope'] = 'Model visual inspection of encoded samples; no full playback or subjective full listening claim.'
write('research/qa/final/automatic-report.json', qa)
print(json.dumps({'videoSHA256':video_sha,'imagesReviewed':len(opened),'uniqueFrameNumbers':len(frames),'acceptedWithinScope':True}))
