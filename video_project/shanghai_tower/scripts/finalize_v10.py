"""Publish only the fully accepted V10 MP4, without changing any old delivery.

Run after all three final reports exist. This script never renders, edits audio,
fabricates an acceptance report, or overwrites an existing V10 release file.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from string import Template
import tempfile
import zipfile

from PIL import Image
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
DELIVERY = ROOT / 'delivery'
QA = ROOT / 'research/qa/v10-final'
LOCK = ROOT / 'research/visual/v10-final-lock.json'
MUX = ROOT / 'tmp/v10-final-segments/mux/mux-report.json'
TEMPLATES = ROOT / 'scripts/release_v10'
VIDEO = DELIVERY / 'ShanghaiTower_1080p_v10.mp4'
FRAMES, FPS = 15712, 30
SECONDS = FRAMES / FPS
COUNTS = {'nodes': 6037, 'shells': 5412, 'lines': 1852}
RELEASE_FILES = (
    '制作说明_V10.md',
    '发布文案_V10.md',
    '上海中心_V10_封面与发布文案.zip',
    '交付校验_V10.json',
)
COVERS = {
    'covers/上海中心_封面_16x9.jpg': (1920, 1080),
    'covers/上海中心_封面_4x3.jpg': (1920, 1440),
    'covers/上海中心_封面_3x4.jpg': (1440, 1920),
    'covers/上海中心_封面_9x16.jpg': (1080, 1920),
}
ZIP_MEMBERS = (*COVERS, RELEASE_FILES[0], RELEASE_FILES[1], 'ShanghaiTower.srt')
SCOPE = (
    'Public-source linear-elastic wall-shell/beam/truss reconstruction; '
    '6037 nodes, 5412 shells, 1852 lines, fixed ground, 60 s full-DOF Newmark. '
    'Independent prescribed structural wind, independent single-pile case and '
    'qualitative steady mean CFD; no pressure-to-structure coupling. '
    'No Diffusion inversion executed; not an as-built input or safety validation.'
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def load(path):
    require(path.is_file(), f'Required evidence is missing: {path}')
    return json.loads(path.read_text('utf-8-sig'))


def sha(path):
    require(path.is_file(), f'Required file is missing: {path}')
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def child(base, value):
    """Resolve an existing or prospective child without allowing path escape."""
    path = (base / value).resolve()
    require(path.is_relative_to(base.resolve()), f'Path leaves expected directory: {value}')
    return path


def project_path(value):
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    require(path.is_relative_to(ROOT.resolve()), f'Non-project evidence path: {value}')
    return path


def record(path):
    path = path.resolve()
    return {'file': path.relative_to(ROOT.resolve()).as_posix(),
            'bytes': path.stat().st_size, 'sha256': sha(path)}


def srt_text(timeline):
    def stamp(frame):
        ms = round(frame * 1000 / timeline['fps'])
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f'{h:02}:{m:02}:{s:02},{ms:03}'
    return '\n\n'.join(
        f"{i + 1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}"
        for i, c in enumerate(timeline['captions'])) + '\n'


def verify_covers():
    report = load(ROOT / 'research/cover-qa.json')
    require(report.get('visual_review_status') == 'passed', 'Cover visual review is not passed')
    rows = report.get('covers', [])
    require(len(rows) == len(COVERS), 'Expected exactly four accepted covers')
    by_path = {project_path(row['path']): row for row in rows}
    require(set(by_path) == {(DELIVERY / name).resolve() for name in COVERS},
            'Cover review differs from the four-file allowlist')
    for name, size in COVERS.items():
        path = DELIVERY / name
        row = by_path[path.resolve()]
        require(row.get('formatCheck', {}).get('passed') is True, f'Cover format not passed: {name}')
        require(sha(path) == row['sha256'], f'Cover changed since review: {name}')
        with Image.open(path) as im:
            require(im.format == 'JPEG' and im.size == size and im.mode == 'RGB',
                    f'Cover dimensions/format changed: {name}')
            im.verify()
    return report


def verify():
    # No writes happen until every gate, including visual and encoded audio, passes.
    for name in RELEASE_FILES:
        require(not (DELIVERY / name).exists(), f'Refusing to overwrite V10 delivery: {name}')
    video_hash = sha(VIDEO)
    lock = load(LOCK)
    lock_hash = sha(LOCK)
    require(lock.get('tag') == 'v10-final' and lock.get('frames') == FRAMES
            and lock.get('fps') == FPS, 'Unexpected V10 production lock')
    require(bool(lock.get('files')) and bool(lock.get('bundleFiles'))
            and bool(lock.get('bundleFingerprint')), 'Incomplete production lock')
    bundle = project_path(lock['bundle'])
    for rel, digest in lock['files'].items():
        require(sha(child(ROOT, rel)) == digest, f'Production source changed: {rel}')
        if rel.startswith('public/'):
            require(sha(child(bundle, rel)) == digest, f'Frozen asset changed: {rel}')
    for rel, digest in lock['bundleFiles'].items():
        require(sha(child(bundle, rel)) == digest, f'Frozen bundle file changed: {rel}')

    timeline_path = ROOT / 'src/timeline.json'
    timeline_hash = sha(timeline_path)
    timeline = load(timeline_path)
    require(timeline.get('draft') is False and not timeline.get('pendingNarrationClips'),
            'Narration timeline is unfinished')
    require(timeline.get('duration') == timeline.get('durationFrames') == FRAMES
            and timeline.get('fps') == FPS
            and abs(timeline.get('durationSeconds', -1) - SECONDS) < 1e-9,
            'V10 timeline does not match the frozen frame count')
    require(timeline_hash == lock['files'].get('src/timeline.json')
            == lock['files'].get('public/timeline.json')
            == sha(ROOT / 'public/timeline.json'), 'Timeline identity mismatch')
    master_hash = sha(ROOT / 'public/master.wav')
    music_hash = sha(ROOT / 'public/music.wav')
    master = sf.info(str(ROOT / 'public/master.wav'))
    require(master.samplerate == 48000 and master.channels == 2
            and master.frames == FRAMES * 1600, 'Master does not span the full timeline exactly')

    mux = load(MUX)
    marker = load(ROOT / 'tmp/final-render-v10.json')
    require(marker == mux, 'Final render marker differs from the V10 mux report')
    require(mux.get('success') is True and mux.get('tag') == 'v10-final', 'V10 mux is not passed')
    require(project_path(mux['outputLocation']) == VIDEO.resolve()
            and project_path(mux['productionLock']) == LOCK.resolve(), 'Mux targets another release')
    require(mux.get('videoSHA256') == video_hash
            and mux.get('productionLockSHA256') == lock_hash
            and mux.get('masterSHA256') == master_hash
            and mux.get('bundleFingerprint') == lock['bundleFingerprint'], 'Mux identity mismatch')
    require(mux.get('frames') == [0, FRAMES - 1] and mux.get('fps') == FPS
            and abs(mux.get('durationSeconds', -1) - SECONDS) < 1e-9
            and mux.get('allFramesDecoded') is True
            and mux.get('videoCodecCopied') is True
            and mux.get('audioEncodedOnce') is True
            and 0 <= mux.get('maxTimestampErrorSeconds', 99) < 2e-6,
            'Mux frame, timestamp or encoding checks did not pass')

    automatic = load(QA / 'automatic-report.json')
    visual = load(QA / 'visual-review.json')
    encoded = load(QA / 'audio/audio-wave-match.json')
    require(automatic.get('automaticChecksPass') is True
            and bool(automatic.get('checks'))
            and all(value is True for value in automatic['checks'].values()), 'Automatic QA is not passed')
    require(visual.get('sampledVisualReviewPass') is True, 'Final sampled visual review is not passed')
    require(encoded.get('passed') is True, 'Final encoded AAC QA is not passed')
    for name, report in [('automatic', automatic), ('visual', visual), ('audio', encoded)]:
        require(report.get('videoSHA256') == video_hash, f'{name} QA belongs to another MP4')
        require(report.get('timelineSHA256') == timeline_hash, f'{name} QA belongs to another timeline')
        if 'video' in report:
            require(project_path(report['video']) == VIDEO.resolve(), f'{name} QA video path mismatch')
    require(visual.get('productionLockSHA256') == lock_hash, 'Visual QA belongs to another production lock')
    if 'productionLock' in visual:
        require(project_path(visual['productionLock']) == LOCK.resolve(), 'Visual QA lock path mismatch')
    require(automatic.get('videoBytes') == VIDEO.stat().st_size, 'Automatic QA file size mismatch')
    expected = automatic['expected']
    measured = automatic['measured']
    require(expected.get('frames') == FRAMES and expected.get('fps') == FPS
            and expected.get('width') == 1920 and expected.get('height') == 1080,
            'Automatic QA expects another film format')
    require(measured.get('decodedFrames') == FRAMES and measured.get('metadataFrames') == FRAMES
            and measured.get('width') == 1920 and measured.get('height') == 1080
            and measured.get('fps') == FPS
            and abs(measured.get('videoDurationSeconds', -1) - SECONDS) < 0.001,
            'Measured delivered video differs from the V10 timeline')
    require(encoded.get('selectedMasterSHA256') == master_hash
            and encoded.get('selectedMusicSHA256') == music_hash
            and encoded.get('timelineFrames') == FRAMES
            and abs(encoded.get('expectedDurationSeconds', -1) - SECONDS) < 1e-9,
            'Encoded audio is bound to another master, music or timeline')
    require(encoded.get('audioCodec') == 'aac' and encoded.get('sampleRate') == 48000
            and encoded.get('channels') == 2 and len(encoded.get('matchedWindows', [])) == 4
            and bool(encoded.get('musicOnlyTailMatch')), 'Encoded audio acceptance is incomplete')
    require(-16 <= float(measured['aacIntegratedLUFS']) <= -14
            and float(measured['aacTruePeakDBTP']) <= -1, 'AAC loudness or true peak out of limits')
    encoded_level = encoded.get('measuredAAC', {})
    require(-16 <= float(encoded_level.get('input_i', '-inf')) <= -14
            and float(encoded_level.get('input_tp', 'inf')) <= -1,
            'Encoded AAC report has no passing loudness/true-peak measurements')
    require(abs(float(encoded_level['input_i']) - float(measured['aacIntegratedLUFS'])) <= 0.1
            and abs(float(encoded_level['input_tp']) - float(measured['aacTruePeakDBTP'])) <= 0.1,
            'Automatic and audio QA measurements disagree for the same MP4')

    audio = load(ROOT / 'research/audio-report.json')
    validation = load(ROOT / 'research/audio-validation.json')
    require(audio.get('musicReplacementPending') is False, 'Selected music has not been completed')
    require(validation.get('passed') is True and validation.get('totalFrames') == FRAMES
            and validation.get('captionCount') == len(timeline['captions'])
            and validation.get('timelineSHA256') == timeline_hash, 'Audio source validation is stale')
    require(set(validation.get('checks', {})) == {'master.wav', 'music.wav', 'narration.wav'},
            'Audio validation does not cover all three production WAV files')
    for name, row in validation['checks'].items():
        digest = sha(ROOT / 'public' / name)
        require(digest == row.get('sha256') == audio['hashes'].get(name)
                == lock['files'].get('public/' + name), f'Audio identity mismatch: {name}')
    require(audio['hashes'].get('timeline.json') == timeline_hash, 'Audio report timeline is stale')
    beats = load(ROOT / 'src/camera-beats.json')
    require(beats.get('timelineFrames') == FRAMES and beats.get('musicSHA256') == music_hash
            and bool(beats.get('beats')), 'Camera/music beat grid is stale')
    srt = DELIVERY / 'ShanghaiTower.srt'
    require(srt.read_text('utf-8-sig') == srt_text(timeline), 'Delivery subtitles differ from the timeline')
    require(sha(srt) == validation.get('srtSHA256'), 'Subtitle validation hash differs')
    verify_covers()

    response = load(ROOT / 'public/physics/response.json')
    counts = {'nodes': len(response['nodes']), 'shells': len(response['walls']), 'lines': len(response['members'])}
    require(response.get('modelVersion') == 10 and counts == COUNTS, 'Unexpected production structure counts')
    summary = load(ROOT / 'research/physics-v10/export/run-summary.json')
    require(summary.get('modelVersion') == 10
            and all(summary.get('counts', {}).get(k) == v for k, v in COUNTS.items()),
            'Research summary differs from the V10 structure')
    require(len(load(ROOT / 'public/models/shanghai-tower-manifest.json')['parts']) == 987,
            'Unexpected visual semantic group count')
    for name in ['docs/V10_CALCULATION_NOTES.md', 'docs/V10_ACCEPTANCE_INDEX.md']:
        require((ROOT / name).is_file(), f'Missing linked V10 documentation: {name}')
    return dict(videoSHA256=video_hash, productionLockSHA256=lock_hash,
                timelineSHA256=timeline_hash, masterSHA256=master_hash, musicSHA256=music_hash,
                lock=lock, mux=mux, timeline=timeline, automatic=automatic, visual=visual, encoded=encoded)


def production_notes(data):
    visual, encoded, qa = data['visual'], data['encoded'], data['automatic']
    observations = visual.get('observations', [])
    if observations:
        text = '\n'.join('- ' + (str(row.get('finding', row)) if isinstance(row, dict) else str(row))
                         for row in observations)
        observations_text = '抽样视觉报告保留以下具体观察：\n\n' + text
    else:
        observations_text = '具体抽样范围与限制见视觉报告；不额外扩大报告的结论。'
    listening = encoded.get('subjectiveListeningChecked') is True
    pronunciation = encoded.get('pronunciationListeningVerified') is True
    scope = ('主观听审已有单独通过记录' if listening else '未完成整片主观听审')
    scope += '；' + ('读音已有单独听审记录' if pronunciation else '未认证整片所有读音')
    values = dict(caption_count=len(data['timeline']['captions']),
                  aac_lufs=qa['measured']['aacIntegratedLUFS'],
                  aac_true_peak=qa['measured']['aacTruePeakDBTP'],
                  decoded_frames=qa['measured']['decodedFrames'],
                  frames_extracted=qa['framesExtracted'],
                  audio_review_scope=scope, visual_observations=observations_text,
                  video_sha256=data['videoSHA256'], lock_sha256=data['productionLockSHA256'],
                  bundle_fingerprint=data['lock']['bundleFingerprint'])
    return Template((TEMPLATES / 'production_notes.md').read_text('utf-8')).substitute(values)


def main():
    data = verify()
    notes = production_notes(data)
    copy = (TEMPLATES / 'publishing_copy.md').read_text('utf-8')
    evidence_paths = [
        VIDEO, DELIVERY / 'ShanghaiTower.srt', LOCK, MUX, ROOT / 'tmp/final-render-v10.json',
        QA / 'automatic-report.json', QA / 'visual-review.json', QA / 'audio/audio-wave-match.json',
        ROOT / 'src/timeline.json', ROOT / 'public/timeline.json', ROOT / 'src/camera-beats.json',
        ROOT / 'public/master.wav', ROOT / 'public/music.wav', ROOT / 'public/narration.wav',
        ROOT / 'research/audio-report.json', ROOT / 'research/audio-validation.json',
        ROOT / 'research/cover-qa.json', ROOT / 'research/physics-v10/export/run-summary.json',
        ROOT / 'docs/V10_CALCULATION_NOTES.md', ROOT / 'docs/V10_ACCEPTANCE_INDEX.md',
        Path(__file__), TEMPLATES / 'production_notes.md', TEMPLATES / 'publishing_copy.md',
        *[DELIVERY / name for name in COVERS],
    ]
    # Complete staged documents and validate ZIP members before creating any final file.
    with tempfile.TemporaryDirectory(prefix='v10-release-', dir=ROOT / 'tmp') as folder:
        staged = Path(folder)
        (staged / RELEASE_FILES[0]).write_text(notes, 'utf-8')
        (staged / RELEASE_FILES[1]).write_text(copy, 'utf-8')
        archive = staged / RELEASE_FILES[2]
        with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as zf:
            for name in ZIP_MEMBERS:
                source = staged / name if name in RELEASE_FILES[:2] else DELIVERY / name
                zf.write(source, name)
        with zipfile.ZipFile(archive) as zf:
            require(zf.namelist() == list(ZIP_MEMBERS) and zf.testzip() is None,
                    'ZIP contents do not match the exact allowlist')
            for name in ZIP_MEMBERS:
                source = staged / name if name in RELEASE_FILES[:2] else DELIVERY / name
                require(hashlib.sha256(zf.read(name)).hexdigest() == sha(source),
                        f'ZIP member integrity failure: {name}')
        report = {
            'schema': 'rainbow.delivery/10', 'status': 'complete-scoped-acceptance',
            'checkedAtUTC': datetime.now(timezone.utc).isoformat(),
            'video': VIDEO.relative_to(ROOT).as_posix(),
            'videoSHA256': data['videoSHA256'],
            'productionLock': LOCK.relative_to(ROOT).as_posix(),
            'productionLockSHA256': data['productionLockSHA256'],
            'bundleFingerprint': data['lock']['bundleFingerprint'],
            'timelineSHA256': data['timelineSHA256'], 'masterSHA256': data['masterSHA256'],
            'musicSHA256': data['musicSHA256'],
            'frames': FRAMES, 'fps': FPS, 'durationSeconds': SECONDS, 'width': 1920, 'height': 1080,
            'seriesName': '每天5分钟科普', 'actualDurationIsFiveMinutes': False,
            'structuralCounts': COUNTS, 'visualSemanticGroups': 987,
            'automaticChecksPass': True, 'sampledVisualReviewPass': True, 'encodedAudioChecksPass': True,
            'finalVisualAndAACAcceptancePending': False,
            'muxReportStateAtCreation': {
                'finalVisualAndAACAcceptancePending': data['mux'].get('finalVisualAndAACAcceptancePending'),
                'meaning': 'Historical state when mux completed; superseded by the three current-video final QA reports.',
            },
            'allProductionInputsMatchLock': True, 'frozenBundleHashChecksPassed': True,
            'fullFrameByFrameHumanReview': data['visual'].get('fullFrameByFrameHumanReview') is True,
            'subjectiveListeningChecked': data['encoded'].get('subjectiveListeningChecked') is True,
            'pronunciationListeningVerified': data['encoded'].get('pronunciationListeningVerified') is True,
            'scope': SCOPE,
            'visualObservations': data['visual'].get('observations', []),
            'visualLimitations': data['visual'].get('additionalLimitations', []),
            'zipAllowlist': list(ZIP_MEMBERS),
            'coverScope': 'Four reused verified JPG artworks; not re-rendered from V10 physics metadata.',
            'files': [record(path) for path in evidence_paths],
        }
        for name in RELEASE_FILES[:3]:
            path = staged / name
            report['files'].append({'file': 'delivery/' + name, 'bytes': path.stat().st_size, 'sha256': sha(path)})
        (staged / RELEASE_FILES[3]).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf-8')
        # Exclusive creation remains fail-closed even if another process creates an output after preflight.
        # The acceptance manifest is committed last; no earlier version is ever replaced.
        for name in RELEASE_FILES:
            with (staged / name).open('rb') as source, (DELIVERY / name).open('xb') as target:
                shutil.copyfileobj(source, target)
            require(sha(DELIVERY / name) == sha(staged / name), f'Delivery copy integrity failure: {name}')
    print(json.dumps({'status': report['status'], 'videoSHA256': data['videoSHA256'],
                      'durationSeconds': SECONDS, 'created': list(RELEASE_FILES)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
