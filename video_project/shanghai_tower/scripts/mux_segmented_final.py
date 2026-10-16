"""Verify and join the frozen V8 silent segments, then encode the master once.

No source edits, audio filters, offsets, fades, time stretching or cleanup.
Every attempt retains its silent concatenation, logs and failed candidate.
The final-render marker reports render/mux completion, not final visual/AAC QA.
"""
from __future__ import annotations

from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
SEGMENTS = ROOT / 'tmp/v8-final4-segments'
MANIFEST = SEGMENTS / 'segments.json'
LOCK = ROOT / 'research/visual/v8-production-lock4.json'
MASTER = ROOT / 'public/master.wav'
DELIVERY = ROOT / 'delivery/ShanghaiTower_1080p_v7.mp4'
MARKER = ROOT / 'tmp/final-render.json'
TAG = 'v8-final4'
FRAMES = 15712
FPS = 30
SR = 48000
SAMPLES = FRAMES * SR // FPS
VIDEO_IDENTITY_FIELDS = (
    'codec_name', 'profile', 'codec_tag_string', 'width', 'height',
    'pix_fmt', 'level', 'sample_aspect_ratio', 'r_frame_rate', 'avg_frame_rate',
    'time_base', 'color_range', 'color_space', 'color_transfer',
    'color_primaries', 'field_order', 'extradata_hash',
)


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex[:8] + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def executable(name):
    found = shutil.which(name)
    fallback = Path('C:/ffmpeg/bin') / (name + '.exe')
    require(bool(found) or fallback.is_file(), 'Missing executable: ' + name)
    return found or str(fallback)


def fraction(value):
    return Fraction(str(value))


def verify_production_lock(expected_sha=None):
    lock_sha = digest(LOCK)
    if expected_sha is not None:
        require(lock_sha == expected_sha, 'Production lock document changed during mux')
    lock = load(LOCK)
    for relative, expected in lock['files'].items():
        path = (ROOT / relative).resolve(strict=True)
        require(path.is_relative_to(ROOT.resolve()), 'Production lock path escapes project: ' + relative)
        require(digest(path) == expected, 'Frozen production input changed: ' + relative)
    require(digest(ROOT / 'src/timeline.json') == digest(ROOT / 'public/timeline.json'),
            'Source and public timelines differ')
    timeline = load(ROOT / 'public/timeline.json')
    require(timeline['duration'] == FRAMES and timeline['fps'] == FPS, 'Unexpected V8 timeline')
    require(not timeline.get('draft') and not timeline.get('pendingNarrationClips'), 'Narration remains unfinished')
    return lock_sha


class Commands:
    def __init__(self, directory):
        self.directory = directory
        self.records = []

    def run(self, name, args):
        command = [str(x) for x in args]
        started = time.monotonic()
        item = dict(name=name, command=command, startedAt=now())
        self.records.append(item)
        save(self.directory / 'commands.json', self.records)
        print('MUX_CHECK', name, flush=True)
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding='utf-8', errors='replace',
                                timeout=3600, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        item.update(returncode=result.returncode, seconds=round(time.monotonic() - started, 3))
        (self.directory / (name + '.stderr.txt')).write_text(result.stderr, encoding='utf-8')
        save(self.directory / 'commands.json', self.records)
        require(result.returncode == 0, f'{name} failed; see retained stderr log')
        require(not result.stderr.strip(), f'{name} emitted an error diagnostic; see retained stderr log')
        return result.stdout

    def probe(self, name, path, count_frames=True):
        args = [executable('ffprobe'), '-v', 'error']
        if count_frames:
            args += ['-count_frames']
        args += ['-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path]
        result = json.loads(self.run(name, args))
        save(self.directory / (name + '.json'), result)
        return result


def validate_video_stream(stream, frames, expected_identity=None, decoded_count=True):
    require(stream.get('codec_type') == 'video' and stream.get('codec_name') == 'h264', 'Expected H264 video')
    require(stream.get('width') == 1920 and stream.get('height') == 1080, 'Video resolution changed')
    require(stream.get('pix_fmt') == 'yuv420p', 'Unexpected video pixel format')
    require(fraction(stream['r_frame_rate']) == FPS and fraction(stream['avg_frame_rate']) == FPS,
            'Video is not constant 30 fps')
    require(all(stream.get(key) == 'bt709' for key in ('color_space', 'color_transfer', 'color_primaries')),
            'Missing or changed BT.709 matrix/transfer/primaries')
    require(int(stream['nb_frames']) == frames, 'Video reported frame count mismatch')
    if decoded_count:
        require(int(stream['nb_read_frames']) == frames, 'Video decoded frame count mismatch')
    tick = fraction(stream['time_base'])
    require(abs(fraction(stream.get('start_time', '0'))) <= tick, 'Video does not start at zero')
    require(abs(int(stream['duration_ts']) * tick - Fraction(frames, FPS)) <= tick,
            'Video timestamp duration differs from its exact frame duration')
    require(bool(stream.get('extradata_hash')), 'Missing H264 codec parameter hash')
    identity = {key: stream.get(key) for key in VIDEO_IDENTITY_FIELDS}
    if expected_identity is not None:
        different = {key: [expected_identity.get(key), identity[key]]
                     for key in VIDEO_IDENTITY_FIELDS if expected_identity.get(key) != identity[key]}
        require(not different, 'Video stream-copy parameter mismatch: ' + json.dumps(different))
    return identity


def validate_silent(probe, frames, expected_identity=None):
    streams = probe['streams']
    require(len(streams) == 1 and streams[0].get('codec_type') == 'video',
            'A segment or silent concatenation contains an extra/audio stream')
    return validate_video_stream(streams[0], frames, expected_identity)


def validate_master(probe):
    streams = probe['streams']
    require(len(streams) == 1, 'Master must contain one PCM stream')
    stream = streams[0]
    require(stream.get('codec_name') == 'pcm_s24le' and stream.get('codec_type') == 'audio',
            'Locked master format changed')
    require(int(stream['sample_rate']) == SR and stream['channels'] == 2, 'Master must be 48 kHz stereo')
    require(int(stream['duration_ts']) * fraction(stream['time_base']) * SR == SAMPLES,
            'Master no longer has the exact timeline sample count')


def validate_muxed(probe, identity, decoded_count=True):
    streams = probe['streams']
    video = [s for s in streams if s.get('codec_type') == 'video']
    audio = [s for s in streams if s.get('codec_type') == 'audio']
    require(len(streams) == 2 and len(video) == len(audio) == 1, 'Mux must contain exactly video and AAC')
    validate_video_stream(video[0], FRAMES, identity, decoded_count=decoded_count)
    stream = audio[0]
    require(stream.get('codec_name') == 'aac' and stream.get('profile') == 'LC', 'Expected AAC-LC')
    require(int(stream['sample_rate']) == SR and stream['channels'] == 2, 'AAC must be 48 kHz stereo')
    require(abs(float(stream['duration']) - FRAMES / FPS) < .1, 'AAC duration fails existing QA tolerance')
    require(abs(float(stream.get('start_time', '0'))) <= 1 / SR, 'AAC presentation is offset from zero')
    return stream


def verify_video_payload(commands, name, path):
    output = commands.run(name, [executable('ffmpeg'), '-v', 'error', '-i', path,
                                 '-map', '0:v:0', '-an', '-c:v', 'copy',
                                 '-f', 'streamhash', '-hash', 'sha256', '-'])
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    require(len(lines) == 1 and re.fullmatch(r'0,v,SHA256=[0-9a-fA-F]{64}', lines[0]) is not None,
            'Unexpected stream-copy payload hash output')
    return lines[0].split('=', 1)[1].lower()


def verify_video_timestamps(commands, path, time_base, seams):
    output = commands.run('candidate-video-packets', [executable('ffprobe'), '-v', 'error',
                          '-select_streams', 'v:0', '-show_packets', '-show_entries',
                          'packet=pts,dts,duration,flags', '-of', 'json', path])
    packets = json.loads(output)['packets']
    require(len(packets) == FRAMES, 'Final H264 packet count differs from frame count')
    tick = fraction(time_base)
    step = Fraction(1, FPS) / tick
    require(step.denominator == 1, 'Video timebase cannot exactly represent 30 fps')
    step = int(step)
    presentation = sorted(packets, key=lambda p: int(p['pts']))
    require(all(int(p['pts']) == i * step and int(p['duration']) == step
                for i, p in enumerate(presentation)), 'Final PTS has a gap, overlap or fractional-frame drift')
    require(all(int(b['dts']) - int(a['dts']) == step for a, b in zip(packets, packets[1:])),
            'Final decoding timestamps are discontinuous')
    boundaries = [0] + [seam['afterFrame'] for seam in seams]
    require(all('K' in presentation[i].get('flags', '') for i in boundaries),
            'A copied segment does not begin on its expected key frame')
    report = dict(passed=True, packetCount=len(packets), timeBase=time_base,
                  frameDurationTicks=step, firstPTS=int(presentation[0]['pts']),
                  lastPTS=int(presentation[-1]['pts']), firstDTS=int(packets[0]['dts']),
                  lastDTS=int(packets[-1]['dts']), keyFramesAtSegmentStarts=boundaries,
                  seamNeighborhoods=[dict(afterFrame=seam['afterFrame'],
                      packets=[dict(frame=i, **presentation[i]) for i in range(seam['afterFrame']-2, seam['afterFrame']+3)])
                      for seam in seams])
    save(commands.directory / 'video-timestamp-continuity.json', report)
    return report


def verify_bundle(manifest, lock_path=LOCK):
    bundle = Path(manifest['bundle']).resolve(strict=True)
    files = manifest['bundleFiles']
    for relative, expected in files.items():
        path = (bundle / relative).resolve(strict=True)
        require(path.is_relative_to(bundle), 'Bundle path escapes frozen directory')
        require(digest(path) == expected, 'Frozen bundle file changed: ' + relative)
    text = json.dumps(files, ensure_ascii=False, separators=(',', ':'))
    require(hashlib.sha256(text.encode('utf-8')).hexdigest() == manifest['bundleFingerprint'],
            'Frozen bundle fingerprint mismatch')
    for relative, expected in load(lock_path)['files'].items():
        if relative.startswith('public/'):
            require(digest(bundle / relative) == expected, 'Frozen bundle public input differs: ' + relative)


def project_file(value):
    path = (ROOT / value).resolve(strict=True)
    require(path.is_relative_to(ROOT.resolve()) and path.is_file(), 'Provenance path escapes project')
    return path


def verify_reuse_provenance(manifest):
    """Prove the seven copied segments cannot contain the single changed label."""
    require(manifest.get('priorManifest') == 'tmp/v8-final3-segments/segments.json',
            'Unexpected prior segment manifest')
    require(manifest.get('reuseProof') == 'research/visual/v8-label-repair/reuse-proof.json',
            'Unexpected segment reuse proof')
    prior_path = project_file(manifest['priorManifest'])
    proof_path = project_file(manifest['reuseProof'])
    require(digest(prior_path) == manifest['priorManifestSHA256'], 'Prior manifest hash changed')
    require(digest(proof_path) == manifest['reuseProofSHA256'], 'Reuse proof hash changed')
    prior, proof = load(prior_path), load(proof_path)
    require(prior.get('tag') == 'v8-final3' and prior.get('status') == 'silent-complete',
            'Prior visual export is incomplete or from another revision')
    require(proof.get('kind') == 'single-label-side-only'
            and proof.get('onlyChangedInput') == 'src/World.ts', 'Unsupported reuse proof')
    require(proof['oldProductionLock'] == 'research/visual/v8-production-lock3.json'
            and proof['newProductionLock'] == LOCK.relative_to(ROOT).as_posix(),
            'Reuse proof references unexpected production locks')
    old_lock_path = project_file(proof['oldProductionLock'])
    require(digest(old_lock_path) == proof['oldProductionLockSHA256'], 'Old production lock hash changed')
    require(digest(LOCK) == proof['newProductionLockSHA256'], 'New production lock hash changed')
    old_files, new_files = load(old_lock_path)['files'], load(LOCK)['files']
    require(old_files.keys() == new_files.keys(), 'Production input set changed during label repair')
    changed = [name for name in old_files if old_files[name] != new_files[name]]
    require(changed == ['src/World.ts'], 'Label repair changed another production input')
    require(len(new_files) - 1 == proof['unchangedInputCount'] == 126,
            'Unchanged production input count differs')
    require(proof['oldSource'] == 'research/visual/v8-label-repair/World.before.ts'
            and proof['newSource'] == 'src/World.ts', 'Unexpected archived source paths')
    old_source, new_source = project_file(proof['oldSource']), project_file(proof['newSource'])
    require(digest(old_source) == old_files['src/World.ts'] == proof['oldWorldSHA256'],
            'Archived World source differs from the original lock')
    require(digest(new_source) == new_files['src/World.ts'] == proof['newWorldSHA256'],
            'Current World source differs from the repaired lock')
    before = ("  if(u>=37.1&&u<37.8){const p=this.parts.find(p=>p.id==='TMD_DAMPER_PLATE');"
              "if(p)list.push({text:'固定铜板',point:p.center.clone(),side:'left'});}")
    after = before.replace("side:'left'", "side:'right'")
    require(proof['beforeLine'] == before and proof['afterLine'] == after, 'Label repair text differs')
    old_bytes, new_bytes = old_source.read_bytes(), new_source.read_bytes()
    exact_replacement = old_bytes.replace(before.encode('utf-8'), after.encode('utf-8'), 1)
    edited_line_lf = old_bytes.replace((before + '\r\n').encode('utf-8'), (after + '\n').encode('utf-8'), 1)
    require(old_bytes.count(before.encode('utf-8')) == 1
            and new_bytes in (exact_replacement, edited_line_lf),
            'World repair contains changes beyond the single label side')
    line_ending_change = None if new_bytes == exact_replacement else 'Edited label line only: CRLF to LF'

    timeline = load(ROOT / 'src/timeline.json')
    affected = []
    # Match stateAt() in the unchanged, locked visual.ts, including clip gaps.
    for frame in range(FRAMES):
        preceding = [clip for clip in timeline['clips'] if frame >= clip['start']]
        clip = preceding[-1] if preceding else timeline['clips'][0]
        cue = int(clip['id'][1:]) + min(1, max(0, (frame - clip['start']) / (clip['end'] - clip['start'])))
        if 37.1 <= cue < 37.8:
            affected.append(frame)
    require(affected == list(range(12452, 12610))
            and proof['affectedFrameRange'] == [12452, 12609], 'Label repair frame range differs')
    rerendered = sorted({frame // 1800 + 1 for frame in affected})
    reused = [i for i in range(1, 10) if i not in rerendered]
    require(rerendered == proof['rerenderedSegmentNumbers'] == [7, 8]
            and reused == proof['reusedSegmentNumbers'] == [1, 2, 3, 4, 5, 6, 9],
            'Segment reuse coverage differs from the label branch')
    require(prior['productionLock'] == proof['oldProductionLock'], 'Prior export lock differs')
    for field in ('timelineSHA256', 'masterSHA256', 'totalFrames', 'fps', 'settings'):
        require(prior[field] == manifest[field], 'Reused export input/settings mismatch: ' + field)
    prior_rows = prior['segments']
    require(len(prior_rows) == 9 and all(row['start'] == i * 1800
            and row['end'] == min(FRAMES - 1, (i + 1) * 1800 - 1) for i, row in enumerate(prior_rows)),
            'Prior segment coverage is incomplete')
    verify_bundle(prior, old_lock_path)
    origins = []
    for row in manifest['segments']:
        number = row['start'] // 1800 + 1
        require(1 <= number <= 9, 'Segment number outside expected coverage')
        is_reused = number in reused
        require(row.get('reused') is is_reused, 'Incorrect reused segment declaration')
        origin = prior if is_reused else manifest
        require(row.get('originTag') == origin['tag']
                and row.get('originProductionLock') == origin['productionLock']
                and row.get('originBundleFingerprint') == origin['bundleFingerprint'],
                'Segment origin metadata does not match its frozen source')
        if is_reused:
            original = prior_rows[number - 1]
            for field in ('start', 'end', 'frames', 'width', 'height', 'fps', 'sha256'):
                require(row[field] == original[field], 'Copied segment differs from origin: ' + field)
            source = project_file(row['originVideo'])
            require(source == project_file(original['outputLocation'])
                    and source.is_relative_to(prior_path.parent), 'Copied segment origin path differs')
            require(digest(source) == row['sha256'], 'Original copied segment bytes changed')
            require(row['end'] < affected[0] or row['start'] > affected[-1],
                    'Copied segment intersects the modified label interval')
        else:
            require(row['start'] <= affected[-1] and row['end'] >= affected[0],
                    'Unexpected rerendered segment outside the modified label interval')
        origins.append(dict(segment=number, originTag=row['originTag'],
                            productionLock=row['originProductionLock'],
                            bundleFingerprint=row['originBundleFingerprint'], reused=is_reused,
                            sha256=row['sha256']))
    return dict(passed=True, priorManifestSHA256=manifest['priorManifestSHA256'],
                reuseProofSHA256=manifest['reuseProofSHA256'],
                oldProductionLockSHA256=proof['oldProductionLockSHA256'],
                newProductionLockSHA256=proof['newProductionLockSHA256'],
                onlyChangedInput='src/World.ts', unchangedInputCount=126,
                sourceLineEndingChange=line_ending_change,
                affectedFrameRange=[affected[0], affected[-1]], affectedFrameCount=len(affected),
                rerenderedSegmentNumbers=rerendered, reusedSegmentNumbers=reused, origins=origins)


def main():
    manifest_sha = digest(MANIFEST)
    manifest = load(MANIFEST)
    require(manifest.get('tag') == TAG and manifest.get('status') == 'silent-complete',
            'All V8 final4 silent segments must finish before mux')
    require(manifest.get('totalFrames') == FRAMES and manifest.get('fps') == FPS, 'Manifest timeline differs')
    require(manifest.get('productionLock') == LOCK.relative_to(ROOT).as_posix(), 'Unexpected production lock')
    production_sha = verify_production_lock()
    verify_bundle(manifest)
    provenance = verify_reuse_provenance(manifest)
    require(manifest['timelineSHA256'] == digest(ROOT / 'src/timeline.json'), 'Manifest timeline hash changed')
    require(manifest['masterSHA256'] == digest(MASTER), 'Manifest master hash changed')
    rows = manifest['segments']
    require(isinstance(rows, list) and len(rows) == 9, 'Expected nine V8 silent segments')
    ordered = sorted(rows, key=lambda s: s['start'])
    require(rows == ordered, 'Segments must be in increasing frame order')

    attempt = SEGMENTS / 'mux-attempts' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    attempt.mkdir(parents=True, exist_ok=False)
    commands = Commands(attempt)
    report = dict(tag=TAG, startedAt=now(), status='verifying', manifestSHA256=manifest_sha,
                  productionLockSHA256=production_sha, sourceMasterSHA256=digest(MASTER),
                  timelineSHA256=digest(ROOT / 'src/timeline.json'), bundleFingerprint=manifest['bundleFingerprint'],
                  attemptDirectory=str(attempt), sourceAudioModified=False, audioFilters=[], audioOffsetSeconds=0,
                  audioEncodePasses=1, videoCodecCopied=True, finalVisualAndAACAcceptancePending=True,
                  segmentReuseProvenance=provenance)
    save(attempt / 'mux-report.json', report)
    promoted = False
    backup = None
    try:
        cursor = 0
        paths = []
        identity = None
        seams = []
        for i, row in enumerate(rows):
            require(isinstance(row['start'], int) and isinstance(row['end'], int), 'Noninteger frame range')
            count = row['end'] - row['start'] + 1
            require(row['start'] == cursor and count > 0, 'Segment ranges overlap or leave a gap')
            require(row['start'] == i * 1800 and row['end'] == min(FRAMES - 1, (i + 1) * 1800 - 1),
                    'Unexpected V8 segment boundary')
            require(row['frames'] == count and row['width'] == 1920 and row['height'] == 1080
                    and fraction(row['fps']) == FPS, 'Segment manifest dimensions/count differ')
            source = Path(row['outputLocation'])
            source = (ROOT / source).resolve(strict=True) if not source.is_absolute() else source.resolve(strict=True)
            require(source.is_relative_to(SEGMENTS.resolve()), 'Segment must reside in the retained segment directory')
            require(digest(source) == row['sha256'], 'Saved segment hash changed: ' + str(source))
            info = commands.probe(f'segment-{i + 1:02d}', source)
            identity = validate_silent(info, count, identity)
            paths.append(source)
            if i:
                seams.append(dict(beforeFrame=row['start'] - 1, afterFrame=row['start'],
                                  seconds=row['start'] / FPS, correspondingAudioSample=row['start'] * SR // FPS,
                                  reviewFrames=[row['start'] + delta for delta in (-15, -2, -1, 0, 1, 2, 15)]))
            cursor = row['end'] + 1
        require(cursor == FRAMES and len(seams) == 8, 'Frame coverage or seam count differs')
        validate_master(commands.probe('source-master', MASTER, count_frames=False))
        save(attempt / 'seams.json', dict(tag=TAG, fps=FPS, frames=FRAMES, seams=seams))

        # Concat's demuxer keeps each independently encoded GOP; H264 video is
        # copied, not decoded/re-encoded. Exact per-segment durations were checked.
        playlist = attempt / 'segments.ffconcat'
        escaped = ["'" + path.as_posix().replace("'", "'\\''") + "'" for path in paths]
        playlist.write_text('ffconcat version 1.0\n' + ''.join('file ' + path + '\n' for path in escaped), encoding='utf-8')
        silent = attempt / 'silent-concatenation.mp4'
        ffmpeg = executable('ffmpeg')
        commands.run('concat-silent', [ffmpeg, '-v', 'error', '-n', '-f', 'concat', '-safe', '0',
                                      '-i', playlist, '-map', '0:v:0', '-an', '-c:v', 'copy',
                                      '-map_metadata', '-1', '-movflags', '+faststart', silent])
        silent_info = commands.probe('silent-concatenation', silent)
        validate_silent(silent_info, FRAMES, identity)
        silent_payload = verify_video_payload(commands, 'silent-video-payload-hash', silent)
        report['silentConcatenation'] = dict(path=str(silent), sha256=digest(silent), frames=FRAMES,
                                           videoPacketPayloadSHA256=silent_payload)

        # The source already includes its lead, sentence spacing and music tail.
        # No -shortest, -t, trim, delay, fade, resampling filter or normalization.
        candidate = attempt / 'candidate-with-audio.mp4'
        commands.run('encode-aac-once', [ffmpeg, '-v', 'error', '-n', '-i', silent, '-i', MASTER,
                                        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                                        '-c:a', 'aac', '-b:a', '320k', '-ar', str(SR), '-ac', '2',
                                        '-map_metadata', '-1', '-movflags', '+faststart', candidate])
        candidate_info = commands.probe('candidate', candidate)
        aac = validate_muxed(candidate_info, identity)
        candidate_payload = verify_video_payload(commands, 'candidate-video-payload-hash', candidate)
        require(candidate_payload == silent_payload, 'Mux changed copied H264 packet payloads')
        timestamps = verify_video_timestamps(commands, candidate, identity['time_base'], seams)
        candidate_sha = digest(candidate)
        require(digest(MANIFEST) == manifest_sha, 'Segment manifest changed during mux')
        for source, row in zip(paths, rows):
            require(digest(source) == row['sha256'], 'Segment changed during mux')
        verify_production_lock(production_sha)
        verify_bundle(manifest)
        require(verify_reuse_provenance(manifest) == provenance, 'Segment origin evidence changed during mux')
        report.update(status='candidate_verified', candidate=dict(path=str(candidate), sha256=candidate_sha,
                      bytes=candidate.stat().st_size), seams=seams,
                      videoStreamIdentity=identity,
                      videoStreamCopyProof=dict(method='FFmpeg streamhash over copied H264 packet payloads, no decoder/re-encoder',
                          silentSHA256=silent_payload, candidateSHA256=candidate_payload, identical=True),
                      presentationTimestampsContinuous=timestamps['passed'],
                      aac=dict(codec=aac['codec_name'], sampleRate=SR, channels=2,
                               streamDurationSeconds=float(aac['duration']), targetBitrate='320k'))
        save(attempt / 'mux-report.json', report)

        require(not DELIVERY.is_symlink() and DELIVERY.resolve().parent == (ROOT / 'delivery').resolve(),
                'Delivery target must be the project delivery file')
        DELIVERY.parent.mkdir(parents=True, exist_ok=True)
        if DELIVERY.exists():
            require(DELIVERY.is_file(), 'Existing delivery target is not a regular file')
            backup = attempt / 'previous-delivery-diagnostic.mp4'
            before = digest(DELIVERY)
            shutil.copy2(DELIVERY, backup)
            require(digest(backup) == before and digest(DELIVERY) == before, 'Previous delivery backup verification failed')
            report['previousDeliveryBackup'] = dict(path=str(backup), sha256=before, bytes=backup.stat().st_size)
            save(attempt / 'mux-report.json', report)
        # Only this verified candidate can replace the stable delivery name.
        candidate.replace(DELIVERY)
        promoted = True
        require(digest(DELIVERY) == candidate_sha, 'Promoted delivery hash differs')
        final_probe = commands.probe('promoted-delivery', DELIVERY, count_frames=False)
        # The promoted bytes match the fully decoded/probed candidate hash.
        # Do not manufacture a second decoded-frame reading for this metadata probe.
        validate_muxed(final_probe, identity, decoded_count=False)
        verify_production_lock(production_sha)
        report.update(status='mux_verified_final_QA_pending', finishedAt=now(),
                      outputLocation=str(DELIVERY), videoSHA256=candidate_sha,
                      verifiedCandidatePromoted=True, sourceLockUnchanged=True)
        save(attempt / 'mux-report.json', report)
        save(SEGMENTS / 'seams.json', dict(tag=TAG, fps=FPS, frames=FRAMES, videoSHA256=candidate_sha, seams=seams))
        marker = dict(finished=now(), frames=[0, FRAMES - 1], outputLocation=str(DELIVERY),
                      runDir=str(SEGMENTS), muxAttemptDir=str(attempt), tag=TAG, success=True,
                      videoSHA256=candidate_sha, durationFrames=FRAMES, fps=FPS,
                      durationSeconds=FRAMES / FPS, productionLock=LOCK.relative_to(ROOT).as_posix(),
                      productionLockSHA256=production_sha, timelineSHA256=report['timelineSHA256'],
                      masterSHA256=report['sourceMasterSHA256'], segmentsManifestSHA256=manifest_sha,
                      segmentCount=9, seams=seams, videoCodecCopied=True, audioEncodedOnce=True,
                      retainedSilentVideo=str(silent), finalVisualAndAACAcceptancePending=True,
                      segmentReuseProvenance=provenance,
                      muxReport=str(attempt / 'mux-report.json'))
        # Readiness is the last write; no failed attempt publishes a success marker.
        save(MARKER, marker)
        print(json.dumps(dict(success=True, tag=TAG, outputLocation=str(DELIVERY),
                              videoSHA256=candidate_sha, frames=FRAMES, seams=len(seams),
                              finalVisualAndAACAcceptancePending=True, report=str(attempt / 'mux-report.json')),
                         ensure_ascii=False), flush=True)
    except Exception as error:
        restored = False
        # If a post-promotion metadata check ever fails, put the prior stable
        # file back. The verified candidate and all diagnostics remain in the
        # attempt folder for inspection.
        if promoted and backup is not None and backup.is_file():
            try:
                restore = attempt / 'restore-previous-delivery.mp4'
                shutil.copy2(backup, restore)
                expected_previous = report['previousDeliveryBackup']['sha256']
                require(digest(restore) == expected_previous, 'Previous delivery restoration copy differs')
                if DELIVERY.exists():
                    failed = attempt / 'failed-promoted-candidate.mp4'
                    DELIVERY.replace(failed)
                restore.replace(DELIVERY)
                restored = digest(DELIVERY) == expected_previous
            except (OSError, RuntimeError):
                restored = False
        report.update(status='failed_candidate_and_intermediates_retained', failedAt=now(),
                      error=str(error), verifiedCandidatePromoted=promoted,
                      previousDeliveryRestored=restored,
                      retainedAttemptFiles=sorted(path.name for path in attempt.iterdir() if path.is_file()))
        save(attempt / 'mux-report.json', report)
        raise


if __name__ == '__main__':
    main()
