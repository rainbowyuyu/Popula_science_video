"""Decode and scan the V14 delivery after mux; never assert subjective approval."""
import argparse
from datetime import datetime, timezone
import re

from v12_common import (
    ROOT, FRAMES, FFMPEG, require, digest, read, save, project_path, record,
    run, probe, check_video,
)
from v14_common import V13_SHA, checked_record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='research/qa/v14-release/automatic')
    args = parser.parse_args()
    out = project_path(args.out)
    require(not out.exists(), 'Use a fresh automatic evidence directory')
    video = ROOT / 'delivery/ShanghaiTower_1080p_v14.mp4'
    provenance_path = ROOT / 'delivery/ShanghaiTower_1080p_v14.provenance.json'
    provenance = read(provenance_path)
    sha = digest(video)
    require(provenance['success'] is True and provenance['videoSHA256'] == sha
            and provenance['sourceV13VideoSHA256'] == V13_SHA
            and provenance['rerenderedSegmentNumbers'] == [1], 'V14 provenance differs')
    proof_path = checked_record(provenance['identityProof'])
    proof = read(proof_path)
    require(proof['passed'] is True and proof['videoSHA256'] == sha
            and proof['matchedFrames'] == FRAMES
            and proof['newReviewedFramesCompared'] == 1800
            and proof['acceptedV13FramesCompared'] == FRAMES - 1800
            and proof['completeAACPayloadIdentical'] is True
            and proof['aacTimingAndSkipMetadataIdentical'] is True,
            'V14 identity proof incomplete')
    checked_record(provenance['mixedSourceManifest'])
    inputs = {video: sha, provenance_path: digest(provenance_path), proof_path: digest(proof_path)}
    out.mkdir(parents=True, exist_ok=False)
    report = {
        'schema': 'rainbow.v14-automatic-delivery-audit/1', 'automaticChecksPass': False,
        'startedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': record(video), 'provenance': record(provenance_path),
        'sourceIdentityProof': record(proof_path), 'visualReviewPending': True,
        'scope': 'Technical decode/identity/black-frame checks only. Camera smoothness, alignment, '
                 'label stability and the frame-1800 seam require a separate actual visual review.',
    }
    try:
        # The bound identity proof already decoded and counted all 15712 frames.
        # The black-frame scan below performs the required full delivery decode;
        # avoid an extra full decode merely to repeat the same frame count.
        metadata = probe(video, out, 'v14-final', count=False)
        require(len(metadata['streams']) == 2, 'Unexpected delivery stream count')
        check_video(next(s for s in metadata['streams'] if s['codec_type'] == 'video'), FRAMES)
        run([FFMPEG, '-hide_banner', '-v', 'error', '-xerror', '-i', video,
             '-map', '0:a:0', '-vn', '-f', 'null', '-'], out / 'audio-full-decode.log')
        scan_log = out / 'black-frame-scan.log'
        run([FFMPEG, '-hide_banner', '-v', 'info', '-xerror', '-i', video,
             '-map', '0:v:0', '-an', '-vf', 'blackdetect=d=0.08:pix_th=0.10:pic_th=0.98',
             '-f', 'null', '-'], scan_log)
        scan = scan_log.read_text('utf-8')
        events = [
            {'startSeconds': float(a), 'endSeconds': float(b), 'durationSeconds': float(c)}
            for a, b, c in re.findall(r'black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)', scan)
        ]
        report.update({'fullVideoDecodePass': True, 'fullAudioDecodePass': True,
                       'blackFrameEvents': events, 'blackFrameScanPass': not events})
        require(not events, 'Black-frame scan detected events; inspect the scan log')
        require(all(digest(path) == expected for path, expected in inputs.items()),
                'Delivery or evidence changed during automatic audit')
        report['automaticChecksPass'] = True
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        report['finishedAtUTC'] = datetime.now(timezone.utc).isoformat()
        report['evidence'] = [record(path) for path in sorted(out.iterdir()) if path.is_file()]
        report['script'] = record(ROOT / 'scripts/audit_v14_delivery.py')
        save(out / 'automatic-report.json', report, exclusive=True)
    print({'automaticChecksPass': True, 'videoSHA256': sha, 'visualReviewPending': True})


if __name__ == '__main__':
    main()
