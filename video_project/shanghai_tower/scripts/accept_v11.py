"""Collect completed, hash-bound V11 reviews into a delivery acceptance record."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT/name).read_text('utf-8-sig'))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def record(name):
    return {'path': name, 'sha256': digest(ROOT/name)}


def write(name, data):
    (ROOT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', 'utf-8')


def main():
    video = ROOT/'delivery/ShanghaiTower_1080p_v11.mp4'
    video_sha = digest(video)
    marker = read('tmp/final-render-v11.json')
    auto = read('research/qa/v11-final/automatic-report.json')
    audio = read('research/qa/v11-final/audio/audio-wave-match.json')
    opening = read('research/qa/v11-final/opening-identity.json')
    tail = read(marker['copyProof'])
    seam = read('research/qa/v11-final-seam/visual-review.json')
    root_seam = read('research/qa/v11-final/root-seam-review.json')
    previous = read('research/qa/v10-final/visual-review.json')
    compatibility = read('research/qa/v11-mux-compat/execution.json')
    assert auto['automaticChecksPass'] and audio['passed'] and opening['passed'] and tail['passed']
    assert seam['verdict'] == 'pass' and not seam['blockingFindings']
    assert seam['scope']['frameRangeInclusive'] == [1740,1859] and seam['scope']['frameCount'] == 120
    assert seam['source']['finalVideoSHA256'] == video_sha
    assert seam['source']['extractionManifestSHA256'] == digest(ROOT/'research/qa/v11-final-seam/manifest.json')
    assert root_seam['sampledVisualReviewPass']
    assert compatibility['status'] == 'completed'
    assert all(x['videoSHA256'] == video_sha for x in
               (marker, auto, audio, opening, tail, root_seam, compatibility))
    assert opening['decodedOpeningPixelsIdentical'] and opening['comparedFrameCount'] == 1800
    assert tail['decodedTailPixelsIdentical'] and tail['tailFrames'] == 13912
    assert tail['completeAACPayloadIdentical'] and tail['aacTimingAndSkipMetadataIdentical']
    assert previous['sampledVisualReviewPass'] and previous['videoSHA256'] == tail['sourceVideoSHA256']
    assert marker['timelineSHA256'] == auto['timelineSHA256'] == digest(ROOT/'src/timeline.json')
    assert digest(ROOT/marker['copyProof']) == marker['copyProofSHA256']
    opening_reviews = [f'research/qa/v11-opening/encoded-review-{name}.json'
                       for name in ('0-599','600-1199','1200-1799')]
    reviews = [read(path) for path in opening_reviews]
    assert reviews[0]['verdict'] == 'pass-for-assigned-sampled-range'
    assert reviews[1]['passed'] and reviews[2]['verdict'] == 'pass'
    for review in reviews:
        binding = review.get('source', review)
        assert binding['videoSHA256'] == opening['sourceVideoSHA256']
        assert not review.get('blockingFindings', [])
    root_opening = read('research/qa/v11-opening/root-motion-review.json')
    assert root_opening['segmentSHA256'] == opening['sourceVideoSHA256']
    assert not root_opening['blockingFindings']
    opening_frames = sorted(set(range(0,1800,3)) | set(root_opening['frames']))
    seam_frames = list(range(1740,1860))
    new_frames = sorted(set(opening_frames) | set(seam_frames))
    old_tail_frames = [f for f in previous['reviewedFrameNumbers'] if f >= 1800]
    sources = opening_reviews + [
        'research/qa/v11-opening/root-motion-review.json',
        'research/qa/v11-final/opening-identity.json',
        'research/qa/v11-final-seam/manifest.json',
        'research/qa/v11-final-seam/visual-review.json',
        'research/qa/v11-final/root-seam-review.json',
        'research/qa/v11-final/automatic-report.json',
        'research/qa/v11-final/audio/audio-wave-match.json',
        'research/qa/v10-final/visual-review.json', marker['copyProof'],
        'research/qa/v11-mux-compat/execution.json',
    ]
    report = {
        'schema': 'rainbow.v11-final-sampled-visual/1',
        'reviewedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': str(video), 'videoSHA256': video_sha,
        'timelineSHA256': marker['timelineSHA256'],
        'sampledVisualReviewPass': True,
        'openingEveryThirdFrameCount': 600,
        'rootOpeningSupplementCount': len(root_opening['frames']),
        'uniqueOpeningFramesReviewed': len(opening_frames),
        'finalSeamEveryFrameRange': [1740,1859], 'finalSeamFramesReviewed': 120,
        'newlyReviewedFrameNumbers': new_frames,
        'newlyReviewedUniqueFrames': len(new_frames),
        'inheritedV10TailReviewedFrameNumbers': old_tail_frames,
        'inheritedTailPixelIdentityVerified': True,
        'reviewEvidence': [record(path) for path in sources],
        'automaticExtractedFrames': auto['framesExtracted'],
        'allAutomaticSampleFramesVisuallyReviewed': False,
        'blockingFindings': [],
        'nonblockingObservations': [
            '梁柱交接中存在短暂但一致的前后遮挡；相邻帧可辨识两条运动路径。',
            '伸臂说明句开头约一秒用于原件交接，随后到达前景阅读位置。',
        ],
        'scope': '实际编码开场密集抽帧、相邻帧补查和120帧接缝检查；原后段复用V10审查，并以全部13912帧像素身份确认。',
        'limitations': ['没有进行本轮全片实时播放或完整主观听审。',
                       '全片解码和音频波形检测属于自动检查，不等同于逐秒视觉与听觉判断。'],
    }
    write('research/qa/v11-final/visual-review.json', report)
    text = '# V11 成片视觉审查\n\n抽帧审查通过。\n\n'
    text += f'- 最终文件 SHA256：`{video_sha}`\n'
    text += f'- 开场每3帧抽查600帧，另查159个相邻帧采样；去重后{len(opening_frames)}帧。\n'
    text += '- 实际成片F1740–1859共120帧逐帧联系图检查，接缝连续。\n'
    text += '- 新开场1800帧与已审片段逐帧像素一致；后段13912帧与V10逐帧一致，复用其已完成的审查。\n'
    text += '- 全片15712帧解码通过，无检测到的黑场；AAC响度−15.03 LUFS、真峰值−1.65 dBTP、对齐偏移0。\n\n'
    text += '本轮没有实时逐秒看完或完整主观听审。自动抽出的491帧不全部计作新目视审查，范围以JSON逐帧清单为准。\n'
    (ROOT/'research/qa/v11-final/visual-review.md').write_text(text, 'utf-8')
    delivery = {
        'version': 'V11', 'acceptedAtUTC': report['reviewedAtUTC'],
        'video': str(video), 'videoSHA256': video_sha, 'bytes': video.stat().st_size,
        'width': 1920, 'height': 1080, 'fps': 30, 'frames': 15712,
        'durationSeconds': 15712/30,
        'automaticChecksPass': True, 'sampledVisualReviewPass': True,
        'audioChecksPass': True, 'openingPixelsIdenticalToReviewedSegment': True,
        'copiedTailPixelsIdenticalToAcceptedV10': True,
        'reports': [record('research/qa/v11-final/visual-review.json'), *[record(p) for p in sources]],
        'cleanupStatus': 'pending', 'limitations': report['limitations'],
    }
    write('delivery/交付校验_V11.json', delivery)
    print(json.dumps({'accepted':True,'videoSHA256':video_sha,'newlyReviewedUniqueFrames':len(new_frames)}))


if __name__ == '__main__':
    main()
