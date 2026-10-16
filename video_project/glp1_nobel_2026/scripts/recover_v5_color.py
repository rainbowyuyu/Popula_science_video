"""Complete the already-rendered V5 after verified, lossless color-tag repair."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def main():
    original = ROOT / 'delivery/GLP1_V5_1080p.mp4'
    corrected = ROOT / 'tmp/v5-color-verified.mp4'
    backup = ROOT / 'tmp/v5-precolor-tags.mp4'
    assert original.is_file() and corrected.is_file() and not backup.exists()
    lock = json.loads((ROOT / 'research/revision-v5/render-source-lock.json').read_text(encoding='utf8'))
    changes = [row['path'] for row in lock['files'] if sha(ROOT / row['path']) != row['sha256']]
    assert changes == ['scripts/render.mjs'], changes
    renderer = (ROOT / 'scripts/render.mjs').read_bytes()
    old_renderer = renderer.replace(b",'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709'", b'')
    old_renderer_sha = next(row['sha256'] for row in lock['files'] if row['path'] == 'scripts/render.mjs')
    assert hashlib.sha256(old_renderer).hexdigest() == old_renderer_sha, 'Unexpected renderer change'
    tlfile = ROOT / 'src/timeline.json'
    tl = json.loads(tlfile.read_text(encoding='utf8'))
    assert tl['duration'] == 25628
    hashes = []
    for path in [original, corrected]:
        result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0', '-c', 'copy',
                                 '-f', 'streamhash', '-hash', 'sha256', '-'], capture_output=True, text=True, check=True)
        hashes.append(result.stdout)
    assert hashes[0] == hashes[1], 'Encoded audio/video packet hashes changed'
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(corrected)],
                            capture_output=True, text=True, check=True)
    streams = json.loads(result.stdout)['streams']
    video = next(s for s in streams if s['codec_type'] == 'video')
    assert all(video[k] == 'bt709' for k in ['color_space', 'color_transfer', 'color_primaries'])
    assert int(video['nb_frames']) == tl['duration'] and (video['width'], video['height']) == (1920, 1080)
    report = {'timeUTC': datetime.now(timezone.utc).isoformat(),
              'originalSHA256': sha(original), 'correctedSHA256': sha(corrected),
              'sameEncodedPacketHashes': True, 'streamHashes': hashes[0].splitlines(),
              'unchangedSourceLockFilesVerified': len(lock['files']) - 1,
              'onlyPostRenderSourcePatch': 'Explicit BT709 container arguments in scripts/render.mjs; inverse patch matches locked renderer SHA.',
              'method': 'Stream copy; explicit BT709 container tags and matching H264 metadata. No re-encoding.',
              'sourceRenderCompleted': True, 'initialFailure': 'BT709 color primaries/transfer absent from MP4 container.'}
    os.replace(original, backup)
    os.replace(corrected, original)
    (ROOT / 'research/revision-v5/color-tag-repair.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    marker = {'finished': report['timeUTC'], 'frames': [0, tl['duration'] - 1],
              'outputLocation': str(original), 'success': True,
              'timelineSHA256': sha(tlfile), 'masterSHA256': sha(ROOT / 'public/master.wav'),
              'videoSHA256': sha(original), 'singlePassRender': True,
              'postprocessRecovery': 'research/revision-v5/color-tag-repair.json'}
    (ROOT / 'tmp/final-render.json').write_text(json.dumps(marker, indent=2), encoding='utf8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
