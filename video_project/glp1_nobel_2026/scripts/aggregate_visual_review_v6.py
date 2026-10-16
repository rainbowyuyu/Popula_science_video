"""Bind already performed visual reviews to the installed composite; no auto viewing."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = 'research/qa/archive-c9-before-continuity-v6'
FINAL_SHA = '2d6b8de1da3ac344ee95adfb255ac86d2b94daddc06b86bd70a74507c1300e11'
BASE_SHA = 'c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4'


def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def read(path):
    return json.loads((ROOT / path).read_text('utf8'))


def ref(path):
    return {'path': path, 'sha256': sha(ROOT / path)}


def frame_hashes(path):
    return [line.split(',')[-1].strip() for line in (ROOT / path).read_text('utf8').splitlines()
            if line.strip() and not line.startswith('#')]


def outside(frame):
    return not (12000 <= frame <= 12249 or 20250 <= frame <= 20749)


def verify_views(report, archived=False):
    result = []
    for item in report['actualFilesViewed']:
        path = item['path'].replace('\\', '/')
        if archived and path.startswith('research/qa/final-v5/'):
            path = path.replace('research/qa/final-v5/', ARCHIVE + '/', 1)
        assert sha(ROOT / path) == item['sha256'], path
        result.append({**item, 'path': path})
    return result


def main():
    marker = read('tmp/final-render.json')
    assert sha(ROOT / 'delivery/GLP1_V5_1080p.mp4') == marker['videoSHA256'] == FINAL_SHA
    validation = read(marker['validation'])
    assert validation['frameCorrespondence']['allFramesMatched'] and validation['audioComparison']['zeroLagVerified']
    reports = {
        'transitions': 'research/qa/final-v5/review-transitions-v6-composite.json',
        'person': ARCHIVE + '/focus-v6/c9f90b7b6c2f79a9/review-person-v6.json',
        'rootOriginal': ARCHIVE + '/review-root-v6.json',
        'rootPatches': 'research/revision-v6/continuity-repair/root-patch-review-r2.json',
        'rootSeams': 'research/revision-v6/continuity-repair/root-composite-review.json',
    }
    loaded = {k: read(p) for k, p in reports.items()}
    transition = loaded['transitions']
    assert transition['videoSHA256'] == FINAL_SHA and transition['sampledVisualReviewCompleted']
    assert not transition['blockingIssues'] and not transition['openBlockingFindings']
    for key in ('person', 'rootOriginal'):
        assert loaded[key]['videoSHA256'] == BASE_SHA
    direct = verify_views(transition)
    direct += verify_views(loaded['rootPatches']) + verify_views(loaded['rootSeams'])
    archived_person = verify_views(loaded['person'], True)
    archived_root = verify_views(loaded['rootOriginal'], True)
    assert not loaded['person']['blockingIssues']
    base = frame_hashes(validation['frameCorrespondence']['hashReports']['base']['path'])
    final = frame_hashes(validation['frameCorrespondence']['hashReports']['final']['path'])
    assert len(base) == len(final) == 25621
    person_frames = loaded['person']['distinctRepresentedFrames']
    assert all(outside(f) and base[f] == final[f] for f in person_frames)
    plan = read(ARCHIVE + '/frame-manifest.json')
    root_frames = {r['frame'] for r in plan['representatives'] if outside(r['frame'])}
    for row in plan['zoomWindows']:
        if row['id'] in loaded['rootOriginal']['zoomWindowsViewed']:
            root_frames.update(f for f in row['frames'] if outside(f))
    root_frames.update(plan['codaFrames'])
    assert all(outside(f) and base[f] == final[f] for f in root_frames)
    inherited = set(transition['inheritedEvidence']['frames']) | set(person_frames) | root_frames
    patch_frames = set(transition['scope']['newPatchFramesActuallyViewed'])
    seam_frames = set(transition['scope']['finalSeamFramesActuallyViewed'])
    report = {
        'reviewedUTC': datetime.now(timezone.utc).isoformat(),
        'reviewer': 'root with independent person and transition reviewers',
        'videoSHA256': FINAL_SHA, 'timelineSHA256': marker['timelineSHA256'], 'masterSHA256': marker['masterSHA256'],
        'renderMode': marker['renderMode'], 'renderMarker': ref('tmp/final-render.json'),
        'sampledVisualReviewCompleted': True, 'blockingIssues': [], 'openBlockingFindings': [],
        'resolvedFindings': transition['resolvedFindings'],
        'evidenceReports': {k: ref(p) for k, p in reports.items()},
        'frameCorrespondenceEvidence': ref(marker['validation']),
        'actualFilesViewed': list({r['path']: r for r in direct}.values()),
        'inheritedEvidence': {
            'originalVideoSHA256': BASE_SHA,
            'method': 'Previously actually viewed c9 images are carried only for absolute frames outside both replacement ranges, each proven identical by decoded YUV420 SHA256. Old rejected intervals are excluded, and new patch and seam reviews close their findings.',
            'transitionReport': ref(reports['transitions']),
            'personFrames': person_frames, 'personFiles': archived_person,
            'rootRepresentativeZoomCodaFrames': sorted(root_frames), 'rootOriginalFiles': archived_root,
            'rootFileScope': 'The original 37-sheet record includes replaced frames; only the explicitly listed unchanged frames carry forward. No claim that old h042/h073 images describe the new picture.',
            'allListedFramesRawPixelIdentical': True,
        },
        'scope': {
            'distinctFinalFramesRepresented': len(inherited | patch_frames | seam_frames),
            'inheritedUnchangedFrames': sorted(inherited),
            'newlyViewedPatchFrames': sorted(patch_frames),
            'newlyViewedFinalSeamFrames': sorted(seam_frames),
            'noFullSubjectivePlaybackClaim': True,
        },
        'findings': [
            'Dorsal-up fork grip, curled fingers and moderate seated lift were checked in the encoded film and all listed reused person scenes.',
            'Content-linked camera transitions, wardrobe transparency and organ label placement were reviewed in representative and dense transition frames.',
            'LDL-to-body and platelet-to-parent returns now retain visible fixed-scale reference geometry; the short plasma label remains on one anchor.',
            'Four final splice joins remain visually continuous in inspected adjacent frames; paper coda and unified typography retain the established layout.',
        ],
        'limitations': [
            'This is whole-file automated verification plus recorded visual samples; no full-duration normal-speed subjective viewing or listening was performed.',
            'Atlas mesh faceting and a fine elbow crease remain visible in close views. The seated fork motion shows pickup, modest lift and return, not a simulated swallow.',
            'The drug-protein bridge retains some faint reference geometry. The h073 parent tissue briefly fills much of the lens as a soft translucent shape.',
            'Microscopic structures and response markers are teaching illustrations; the pressure model is 0D Windkessel, not patient-specific 3D CFD or molecular dynamics.',
        ],
        'fullDurationSubjectivePlaybackCompleted': False,
        'fullDurationSubjectiveAudioListeningCompleted': False,
    }
    out = ROOT / 'research/qa/final-v5/visual-review.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
    (out.with_suffix('.md')).write_text(f'''# V6最终编码画面抽样复核

视频SHA256：`{FINAL_SHA}`。记录范围内未解决阻塞项：0。

覆盖{report['scope']['distinctFinalFramesRepresented']}个独立帧：新补片98帧、四处接缝44帧，以及逐像素一致的既有实看帧；范围存在交集，不能直接相加。旧c9失败区间不继承，改由新补片检查关闭。

手背朝上持叉、透明交接、两处尺度参照与标注跳位、四处合成接缝均有对应实际查看记录。完整文件自动检查另见automatic-report.json。

没有完成整片逐秒主观观看或全长主观听审。原网格近景棱角、轻微肘部折痕、部分参照较淡以及短暂柔透明母层占屏仍如JSON列明。JSON记录所有原图/报告路径、哈希、来源与继承条件。
''', 'utf8')
    print(json.dumps({'review': str(out), 'sha256': sha(out), 'uniqueFramesRepresented': report['scope']['distinctFinalFramesRepresented']}))


if __name__ == '__main__':
    main()
