"""Record completed, sampled visual review and verify the exact release inputs."""
from pathlib import Path
import datetime
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / 'research/revision-v8'

def read(path):
    return json.loads((ROOT / path).read_text('utf8'))

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf8')

def frames_of(sheets):
    result = set()
    for item in sheets:
        result.update(item.get('frames', []))
        for clip in item.get('clips', []):
            result.update(clip['frames'])
    return result

render = read('tmp/v8-full-corrected/result.json')
technical = read('tmp/v8-encoded-qa/technical.json')
audio = read('research/revision-v8/audio/final-mp4-check/verification.json')
person = read('research/revision-v8/person/encoded-film-review.json')
camera = read('research/revision-v8/camera/encoded-film-review.json')
low = read('tmp/v8-encoded-qa/low-motion/audit.json')
sheets = read('tmp/v8-encoded-qa/sheets/index.json')
motion = read('tmp/v8-encoded-qa/motion-sheets/index.json')
digest = sha(ROOT / render['video'])
assert digest == render['videoSHA256'] == technical['videoSHA256'] == audio['videoSHA256']
assert digest == person['videoSha256'] == camera['actualVideoSHA256'] == low['videoSHA256']
assert render['fullDecode'] and technical['technicalPass'] and technical['fullDecode']
assert not technical['blackIntervals']
assert audio['passed'] and audio['inputsUnchanged']
assert audio['waveformTimingVerified'] and audio['waveformContentVerified']
assert not person['blockingFindings'] and not camera['unresolvedVisualFindings']
changed = [p for p, h in render['hashes'].items() if sha(ROOT / p) != h]
assert not changed, changed

owned = set(range(7, 17)) | set(range(29, 35)) | set(range(71, 85))
root_sheets = [s for s in sheets if int(s['clips'][0]['id'][1:]) in owned]
root_motion = [s for s in motion if not s['span'].startswith('measurement-exit-')]
root_frames = frames_of(root_sheets) | frames_of(root_motion) | {26468, 26708}
all_frames = set(root_frames)
all_frames |= frames_of(person['storyboardSheetsActuallyOpened'])
all_frames |= frames_of(person['motionSheetsActuallyOpened'])
all_frames |= {x['frame'] for x in person['fullResolutionFramesActuallyOpened']}
all_frames |= frames_of(camera['primarySheetReview'])
all_frames |= frames_of(camera['extraSheetReview'])
all_frames |= frames_of(camera['motionSheetReview'])
all_frames |= {x['frame'] for x in camera['native1080pInspections']}
assert set(technical['extractedFrames']) <= all_frames

classifications = [
    '胰岛素补偿与抵抗：小泡保持在膜下，信号与糖粒子继续变化，缓慢推进。',
    '减少甜饮输入：相邻建议保持同一尺度，用糖粒子数量和来源变化衔接运动信号。',
    'DPP-4剪切后的解释停留：保留断裂结果及局部运动，未恢复切断的键。',
    '工程化GLP-1与白蛋白：稳定展示侧链及结合示意，缓慢推进直至退出。',
    '胃部不适解释：胃与周边透明解剖保持定位，局部运动延续。',
    'VLDL介绍：保留脂蛋白与细胞膜关系，缓慢推进和粒子转动。',
    '肾上腺信号：固定宏观定位，以小粒子示意消息传递。',
    '肾脏与血管调节：原解剖上继续呈现信号粒子，维持器官可读性。',
    '正压通气：气道剖面保持稳定，小范围流向动画持续。',
    '利尿剂机制：肾小管局部保留，离子流向和轻微推进承接解释。',
    '减重后的调节：全身位置稳定，强调脂肪变化及信号路径。',
    '活动与体重反馈：维持宏观定位，小粒子路径衔接肌肉与脑。',
    '血压与日常记录：保留测量姿势，轻微推进与局部动作，供观众读取。',
]
assert len(classifications) == len(low['spans']) == 13
for span, explanation in zip(low['spans'], classifications):
    assert span['exactAdjacentDuplicatePairs'] == 0
    span['visualClassification'] = explanation
    span['blockingFinding'] = False

now = datetime.datetime.now(datetime.timezone.utc).isoformat()
root_review = {
    'reviewer': 'root', 'createdUTC': now, 'videoSHA256': digest,
    'method': 'Actually opened decoded-MP4 contact sheets, dense sequences and full-size coda frames with view_image. h007-h016 were reviewed before context compaction; the remaining listed sheets were reviewed after resuming. This is sampled review, not every-frame playback.',
    'storyboardSheetsActuallyOpened': root_sheets,
    'motionSheetsActuallyOpened': root_motion,
    'fullResolutionFramesActuallyOpened': [26468, 26708],
    'uniquePlannedFramesReviewedByRoot': len(root_frames),
    'lowMotionContactSheetsActuallyOpened': [f'tmp/v8-encoded-qa/low-motion/review-{i}.jpg' for i in range(4)],
    'lowMotionContactFrameCount': 39,
    'lowMotionClassifications': low['spans'],
    'findings': [
        'GLUT4小泡接近、融合、膜上运输依次发生，和字幕叙述顺序一致。',
        '运动信号复用相同膜位置，没有另起孤立画面。',
        'GLP-1剪切后保持结果，再呈现单独的工程化分子和白蛋白；退出经过分子、血细胞和原器官。',
        '主动脉局部窗口随原血管方向显示；宏观画面保持直立，靠近局部才调整观察方向。',
        '小动脉退出回到肌肉上下文，未见此前漂浮整片肌肉矩形背景。',
        '血栓、药物类别和生活建议的采样画面与字幕对应，未见新的关键遮挡。',
        '片尾真实论文页完整置入卡片，作者年份及主题在卡片外，最后12秒保留阅读时间。',
    ],
    'blockingFindings': [],
    'limitations': ['Temporal sampling cannot exclude unsampled brief defects.', 'Visual explanations use representative anatomy and schematic mechanisms; no CFD, docking, molecular dynamics or patient-specific reconstruction is claimed.', 'No subjective listening was performed by this reviewer.'],
}
write(QA / 'root-encoded-film-review.json', root_review)
reports = [
    'research/revision-v8/root-encoded-film-review.json',
    'research/revision-v8/person/encoded-film-review.json',
    'research/revision-v8/camera/encoded-film-review.json',
    'research/revision-v8/audio/final-mp4-check/verification.json',
    'tmp/v8-encoded-qa/technical.json',
    'tmp/v8-encoded-qa/low-motion/audit.json',
]
release = {
    'version': 'v8', 'createdUTC': now,
    'releaseApproved': True, 'videoSHA256': digest, 'audioVerified': True, 'sourceStable': True,
    'title': '如何科学减肥？从身体调节说起',
    'durationSeconds': render['frames'] / render['fps'], 'frames': render['frames'], 'fps': render['fps'],
    'protectedFilesVerified': len(render['hashes']),
    'fullDecode': True, 'blackIntervals': [],
    'visualReview': {
        'allNarrationClipsCoveredBySamples': 89,
        'plannedDecodedFrames': len(technical['extractedFrames']),
        'uniquePlannedFramesReviewedAcrossReviewers': len(set(technical['extractedFrames']) & all_frames),
        'allVideoFramesVisuallyWatched': False,
        'lowMotionFlaggedIntervals': 13,
        'lowMotionFramesAlgorithmicallyComparedAt5FPS': sum(s['frames'] for s in low['spans']),
        'exactAdjacentDuplicatePairsInLowMotionSamples': 0,
        'conclusion': 'No new blocking issue in inspected samples. All low-motion flags were reviewed as readable explanation holds with local animation or slow camera motion.',
    },
    'audio': {
        'waveformTimingVerified': True, 'waveformContentVerified': True,
        'windows': audio['informativeWindowCount'],
        'minimumZeroLagCorrelation': min(x['zeroLagCorrelation'] for x in audio['everyFiveSecondWindowLagSearch']),
        'integratedLUFS': audio['loudness']['integratedLUFS'],
        'truePeakDBTP': audio['loudness']['truePeakDBTP'],
        'subjectiveListeningCompleted': audio['subjectiveListeningCompleted'],
        'pronunciationMethod': 'Corrected TTS input and existing recognition/alignment checks, followed by final encoded waveform comparison. 120 uses 幺二零; LDL first introduces 低密度脂蛋白 and later voice uses the full Chinese term.',
    },
    'remainingMinorObservations': person['nonBlockingFindings'],
    'limitations': ['Sampled visual review, not complete frame-by-frame aesthetic certification.', 'Generic atlas and simplified garment shapes remain; the limited fork contact audit is not exhaustive collision simulation.', 'Molecular encounters and physiological flows are mechanism illustrations, not quantitative patient simulations.', 'Waveform and recognition checks do not constitute human listening.'],
    'reports': [{'path': p, 'sha256': sha(ROOT / p)} for p in reports],
}
write(QA / 'release-qa.json', release)
print(json.dumps({k:release[k] for k in ['releaseApproved','videoSHA256','protectedFilesVerified','visualReview','audio']},ensure_ascii=False,indent=2))
