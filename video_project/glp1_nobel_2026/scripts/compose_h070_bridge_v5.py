"""Verify and compose explicitly bounded V5 video patches, preserving full master audio.

Default is read-only preflight. Add --execute to encode, verify, retain the
prior composed film at tmp/v5-before-h070-bridge-repair.mp4, and atomically install the new film.
Never run while the base or segment renders are still being written.

Plan JSON (paths may be project-relative or absolute within this project):
{
  "version": "v5-local-patches",
  "timelineSHA256": "<64 hex>", "masterSHA256": "<64 hex>",
  "baseVideoSHA256": "<frozen dfa2 full SHA>",
  "baseComposition": {
    "provenancePath": "research/revision-v5/final-boundary-repair/patch-render-provenance.json",
    "provenanceSHA256": "<pinned prior provenance SHA>",
    "planPath": "research/revision-v5/final-boundary-repair/patch-plan.json",
    "planSHA256": "<pinned prior plan SHA>",
    "markerSHA256": "<pinned current final marker SHA>"
  },
  "patches": [{
    "start": 19600, "end": 19740,
    "video": "tmp/segment-19600-19740.mp4",
    "marker": "research/revision-v5/h070-bridge-repair/segment-19600-19740.json",
    "sourceHashes": {"src/V5World.ts": "<64 hex after patch>"},
    "sourceSnapshots": {}, "reason": "Gradual tissue hand-off"
  }]
}
All start/end values are absolute, inclusive frame numbers. The base and each
patch require successful Remotion markers with exact frame ranges and hashes.
Patch source hashes must match current files or explicit archived snapshots.
The example range is illustrative: use the reviewed actual support range.
Only the pinned dfa2 composition is accepted as base. Its complete original
render, 23 prior patches, source snapshots, inputs and provenance remain nested;
flat baseSourceHashes/baseSourceSnapshots are rejected for this composite base.
No audio trim, seek, speed change, shortest flag or frame-rate interpolation is
used. FFmpeg trims decoded video by exact frame indices and concatenates it;
the complete public/master.wav is encoded once to AAC 320 kb/s from time zero.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
MARKER = ROOT / 'tmp/final-render.json'
MASTER = ROOT / 'public/master.wav'
TIMELINE = ROOT / 'src/timeline.json'
BACKUP = ROOT / 'tmp/v5-before-h070-bridge-repair.mp4'
PROVENANCE = ROOT / 'research/revision-v5/h070-bridge-repair/patch-render-provenance.json'
LOCK = ROOT / 'tmp/compose-v5-h070-bridge.lock'
ALLOWED_BASE_SHA256 = 'dfa2d9a89817f74a5a436b5a4acae48334700ef92f5068676cb65c167f705ccb'
PRIOR_PROVENANCE = ROOT / 'research/revision-v5/final-boundary-repair/patch-render-provenance.json'
PRIOR_PROVENANCE_SHA256 = '446b4843f67d971041f42d59cfb8a0db8b782c42e5095d6acce8bf7c92b68a34'
PRIOR_PLAN = ROOT / 'research/revision-v5/final-boundary-repair/patch-plan.json'
PRIOR_PLAN_SHA256 = '475c61b20ea706748b6d5577b422cc54b106b9a4bdda6b3127a395058bed84c0'
PRIOR_MARKER_SHA256 = 'aa54fc81959c293a87f1a8498851fe03dbccfe57c685c066d91fcb2de7c96f34'
FPS, WIDTH, HEIGHT = 30, 1920, 1080
REPARSE = getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def relative(path):
    return path.relative_to(ROOT).as_posix()


def safe_path(value, *, must_exist=True):
    path = Path(value)
    path = Path(os.path.abspath(path if path.is_absolute() else ROOT / path))
    require(path != ROOT and path.is_relative_to(ROOT), 'Path leaves this film: ' + str(path))
    require(path.resolve().is_relative_to(ROOT), 'Resolved path leaves this film: ' + str(path))
    for part in [path, *path.parents]:
        if part == ROOT:
            break
        if part.exists() or part.is_symlink():
            info = part.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not (getattr(info, 'st_file_attributes', 0) & REPARSE),
                    'Symlink/reparse path refused: ' + str(part))
    if must_exist:
        require(path.is_file() and path.stat().st_size > 0, 'Missing/empty input: ' + str(path))
    return path


def expected_hash(value, label):
    require(isinstance(value, str) and re.fullmatch(r'[a-fA-F0-9]{64}', value) is not None,
            label + ' must be a completed SHA-256; pending/null render hashes cannot compose')
    return value.lower()


def require_hash(path, value, label):
    actual = sha(path)
    require(actual == expected_hash(value, label), label + ' mismatch: ' + relative(path))
    return actual


def command_json(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    require(result.returncode == 0, 'Probe failed: ' + result.stderr[-2000:])
    return json.loads(result.stdout)


def video_probe(path, ffprobe):
    data = command_json([ffprobe, '-v', 'error', '-threads', '4', '-count_frames',
        '-select_streams', 'v:0', '-show_entries',
        'stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,start_time,duration,time_base,color_space,color_transfer,color_primaries,color_range',
        '-of', 'json', str(path)])
    require(len(data.get('streams', [])) == 1, 'Expected one readable video stream: ' + str(path))
    stream = data['streams'][0]
    require(str(stream.get('nb_read_frames', '')).isdigit(), 'Decoded frame count unavailable: ' + str(path))
    return stream


def check_video(path, stream, frames):
    require((stream.get('width'), stream.get('height')) == (WIDTH, HEIGHT), 'Wrong video size: ' + str(path))
    require(stream.get('codec_name') == 'h264' and stream.get('pix_fmt') == 'yuv420p',
            'Expected h264/yuv420p input: ' + str(path))
    for key in ('r_frame_rate', 'avg_frame_rate'):
        require(Fraction(stream[key]) == FPS, 'Wrong/non-constant fps: ' + str(path))
    require(int(stream['nb_read_frames']) == frames,
            f'Frame count mismatch for {path}: {stream["nb_read_frames"]} != {frames}')
    if str(stream.get('nb_frames', '')).isdigit():
        require(int(stream['nb_frames']) == frames, 'Declared/decoded frame count mismatch: ' + str(path))
    require(abs(float(stream.get('start_time', 0))) < 1 / FPS, 'Non-zero video start time: ' + str(path))
    if 'duration' in stream:
        require(abs(float(stream['duration']) - frames / FPS) < 1 / FPS,
                'Video duration mismatch: ' + str(path))


def audio_probe(path, ffprobe):
    data = command_json([ffprobe, '-v', 'error', '-select_streams', 'a:0', '-show_entries',
        'stream=codec_name,sample_rate,channels,duration,duration_ts,time_base,start_time,bit_rate',
        '-of', 'json', str(path)])
    require(len(data.get('streams', [])) == 1, 'Expected one audio stream: ' + str(path))
    return data['streams'][0]


def audio_seconds(stream):
    if 'duration_ts' in stream and 'time_base' in stream:
        return Fraction(stream['duration_ts']) * Fraction(stream['time_base'])
    return Fraction(stream['duration'])


def source_records(hashes, snapshots, label, watched, *, require_snapshots=False):
    require(isinstance(hashes, dict) and len(hashes) > 0, label + ' requires non-empty sourceHashes')
    require(isinstance(snapshots, dict), label + ' sourceSnapshots must be an object')
    records = {}
    for source, value in hashes.items():
        logical = safe_path(source, must_exist=False)
        # The complete-render lock also retained these two inert TS backups.
        # Preserve and hash-check them as provenance; never execute them.
        archived_ts_backup = source in {
            'src/V5Measure.ts.bak-person-garment',
            'src/V5Person.ts.bak-person-garment',
        }
        require(logical.suffix.lower() in {'.ts', '.tsx', '.js', '.mjs', '.json', '.css'} or archived_ts_backup,
                'Unexpected source file type: ' + source)
        if require_snapshots:
            require(source in snapshots, label + ' needs an archived source snapshot for ' + source)
        actual_file = safe_path(snapshots.get(source, source))
        value = require_hash(actual_file, value, label + ': ' + source)
        watched[actual_file] = value
        records[source] = {'sha256': value, 'verifiedFile': relative(actual_file),
                           'archivedSnapshot': source in snapshots}
    return records


def build_segments(patches, total):
    segments, cursor = [], 0
    for patch in patches:
        if patch['start'] > cursor:
            segments.append({'kind': 'base', 'start': cursor, 'end': patch['start'] - 1, 'path': VIDEO})
        segments.append({'kind': 'patch', 'start': patch['start'], 'end': patch['end'], 'path': patch['path']})
        cursor = patch['end'] + 1
    if cursor < total:
        segments.append({'kind': 'base', 'start': cursor, 'end': total - 1, 'path': VIDEO})
    require(sum(s['end'] - s['start'] + 1 for s in segments) == total, 'Composition has a frame gap/overlap')
    return segments


def input_seek_seconds(segment):
    # An integer-second accurate input seek preserves the 30 fps grid. Keep
    # two seconds before the desired span, then trim by exact local frames.
    return max(0, segment['start'] // FPS - 2) if segment['kind'] == 'base' else 0


def filter_graph(segments):
    lines = []
    for i, segment in enumerate(segments):
        # Independent inputs bound decoder buffering. Preseek skips redundant
        # base prefixes; the remaining local trim still selects exact frames.
        start = segment['start'] - input_seek_seconds(segment) * FPS if segment['kind'] == 'base' else 0
        count = segment['end'] - segment['start'] + 1
        lines.append(f'[{i}:v:0]trim=start_frame={start}:end_frame={start + count},'
                     f'settb=expr=1/{FPS},setpts=N[v{i}]')
    inputs = ''.join(f'[v{i}]' for i in range(len(segments)))
    lines.append(f'{inputs}concat=n={len(segments)}:v=1:a=0,'
                 f'settb=expr=1/{FPS},setpts=N,format=yuv420p[outv]')
    return ';\n'.join(lines) + '\n'


def atomic_bytes(path, data):
    safe_path(path, must_exist=False)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    with temporary.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def verify_unchanged(watched):
    for path, value in watched.items():
        safe_path(path)
        require(sha(path) == value, 'Input changed during composition: ' + relative(path))


def encode_command(state, args, graph_path, candidate):
    command = [args.ffmpeg, '-hide_banner', '-nostdin', '-n', '-filter_complex_threads', '2']
    for segment in state['segments']:
        command += ['-threads', '2']
        if segment['kind'] == 'base':
            command += ['-ss', str(input_seek_seconds(segment))]
        command += ['-i', str(segment['path'])]
    audio_input = len(state['segments'])
    return command + ['-i', str(MASTER), '-filter_complex_script', str(graph_path),
        '-map', '[outv]', '-map', f'{audio_input}:a:0', '-map_metadata', '-1',
        '-c:v', 'libx264', '-preset', args.preset, '-crf', '16', '-threads', str(args.threads),
        '-pix_fmt', 'yuv420p', '-fps_mode:v', 'passthrough', '-color_range', 'tv',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
        '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-af', 'asetpts=PTS-STARTPTS',
        '-movflags', '+faststart+write_colr', '-progress', 'pipe:1', '-nostats', str(candidate)]


def preflight_reuse(state, plan_path, args):
    candidate = safe_path(args.reuse_encoded)
    require(candidate.name == 'composed.mp4' and candidate.parent.parent == ROOT / 'tmp'
            and candidate.parent.name.startswith('v5-h070-bridge-'), 'Reuse only a retained composer candidate')
    old_dir = candidate.parent
    evidence_paths = {name: safe_path(old_dir / name) for name in
        ['command.json', 'filtergraph.txt', 'failure.json', 'ffmpeg.progress.log', 'base-final-render-original.json']}
    failure = read(evidence_paths['failure.json'])
    require(failure.get('error') == 'Composed video missing BT.709 metadata'
            and failure.get('originalRestored') is False and failure.get('baseBackupExists') is False,
            'Reuse requires the isolated pre-install BT.709 metadata failure')
    old = read(evidence_paths['command.json'])
    graph = filter_graph(state['segments'])
    require(old.get('filterGraph') == graph
            and evidence_paths['filtergraph.txt'].read_text(encoding='utf-8') == graph,
            'Retained filter graph differs from the current exact-frame segment plan')
    require(old.get('sourcePlan') == relative(plan_path), 'Retained encoding used a different plan path')
    require(old.get('command') == encode_command(state, args, evidence_paths['filtergraph.txt'], candidate),
            'Retained command differs from current inputs/options; use the original preset and thread count')
    require(evidence_paths['base-final-render-original.json'].read_bytes() == state['baseMarkerBytes'],
            'Retained encoding used a different base render marker')
    progress = evidence_paths['ffmpeg.progress.log'].read_text(encoding='utf-8').splitlines()
    require(progress and progress[-1].strip() == 'progress=end', 'Retained encode did not finish')
    values = dict(line.strip().split('=', 1) for line in progress if '=' in line)
    require(int(values.get('frame', '-1')) == state['total']
            and int(values.get('dup_frames', '-1')) == 0 and int(values.get('drop_frames', '-1')) == 0,
            'Retained encoding frame progress is incomplete or reports duplicate/dropped frames')
    # New runs carry explicit input hashes. For the existing legacy run, whose
    # metadata check failed before that record existed, also require every
    # current source/input to predate its saved command and to match the frozen
    # plan/Remotion markers verified above. The composer itself is the one
    # intentionally updated file and is recorded separately in final provenance.
    previous_hashes = old.get('inputFiles')
    command_mtime = evidence_paths['command.json'].stat().st_mtime_ns
    for path, value in state['watched'].items():
        if path == Path(__file__).resolve():
            continue
        if previous_hashes is not None:
            require(previous_hashes.get(relative(path)) == value, 'Prior input hash differs: ' + relative(path))
        else:
            require(path.stat().st_mtime_ns <= command_mtime,
                    'Input is newer than retained encoding; cannot establish safe reuse: ' + relative(path))
    before = video_probe(candidate, args.ffprobe)
    check_video(candidate, before, state['total'])
    require(before.get('color_space') == 'bt709'
            and all(before.get(k) in {None, 'unknown', 'bt709'} for k in ['color_transfer', 'color_primaries']),
            'Reuse may fill missing BT.709 labels, not relabel a differently encoded color space')
    before_audio = audio_probe(candidate, args.ffprobe)
    require(before_audio.get('codec_name') == 'aac' and int(before_audio['sample_rate']) == 48000
            and before_audio['channels'] == state['masterProbe']['channels'], 'Retained audio encoding differs')
    require(abs(audio_seconds(before_audio) - Fraction(state['total'], FPS)) <= Fraction(1024, 48000)
            and abs(float(before_audio.get('start_time', 0))) <= 1 / 48000, 'Retained audio timing differs')
    watched_evidence = {path: sha(path) for path in [candidate, *evidence_paths.values()]}
    state['watched'].update(watched_evidence)
    verify_unchanged(state['watched'])
    return {'candidate': relative(candidate), 'candidateSHA256': watched_evidence[candidate],
            'originalRun': relative(old_dir), 'originalEncodingCommand': old['command'],
            'originalEncodingFFmpeg': old.get('ffmpeg'), 'originalFailure': failure,
            'verifiedVideoBeforeRemux': before, 'verifiedAudioBeforeRemux': before_audio,
            'inputVerification': 'original input hash snapshot' if previous_hashes is not None
                else 'current frozen-plan/marker hashes plus all input mtimes preceding saved encoding command',
            'evidenceSHA256': {relative(p): h for p, h in watched_evidence.items()},
            'progressEnd': True, 'frameCount': state['total'], 'duplicateFrames': 0, 'droppedFrames': 0}



def verify_base_composition(plan, base_marker, base_marker_bytes, base_sha,
                            tl_sha, master_sha, total, watched):
    """Accept only the reviewed dfa2 final and its exact, retained ancestry."""
    require(base_sha == ALLOWED_BASE_SHA256, 'This repair accepts only the frozen dfa2 base video')
    require(digest(base_marker_bytes) == PRIOR_MARKER_SHA256, 'Frozen prior final marker changed')
    require(base_marker.get('singlePassRender') is False and bool(base_marker.get('composition')),
            'Expected the exact previously composed base, not a new single-pass render')
    request = plan.get('baseComposition')
    expected = {'provenancePath': relative(PRIOR_PROVENANCE),
                'provenanceSHA256': PRIOR_PROVENANCE_SHA256,
                'planPath': relative(PRIOR_PLAN), 'planSHA256': PRIOR_PLAN_SHA256,
                'markerSHA256': PRIOR_MARKER_SHA256}
    require(request == expected, 'baseComposition must exactly identify the reviewed prior lineage')
    require('baseSourceHashes' not in plan and 'baseSourceSnapshots' not in plan,
            'Composed base sources must retain their layers; omit flat baseSourceHashes/baseSourceSnapshots')
    for path, value in [(PRIOR_PROVENANCE, PRIOR_PROVENANCE_SHA256), (PRIOR_PLAN, PRIOR_PLAN_SHA256)]:
        safe_path(path)
        watched[path] = require_hash(path, value, 'prior ancestry')
    prior = read(PRIOR_PROVENANCE)
    prior_plan = read(PRIOR_PLAN)
    require(prior.get('version') == 'v5-patch-render-provenance' and prior.get('state') == 'complete',
            'Prior composition provenance is not complete')
    require(prior.get('finalRenderMarker') == base_marker, 'Prior provenance/current marker disagreement')
    require(prior.get('plan') == prior_plan and safe_path(prior['planPath']) == PRIOR_PLAN,
            'Prior provenance/plan disagreement')
    require(safe_path(base_marker['provenancePath']) == PRIOR_PROVENANCE
            and base_marker.get('planSHA256') == PRIOR_PLAN_SHA256,
            'Current marker does not identify the pinned prior plan/provenance')
    require(prior_plan.get('timelineSHA256') == tl_sha and prior_plan.get('masterSHA256') == master_sha,
            'Prior plan uses different timeline/audio')
    base_render = base_marker.get('baseRender', {})
    original = prior.get('originalFinalRenderMarker')
    require(isinstance(original, dict) and base_render.get('marker') == original,
            'Nested original render marker disagreement')
    require(original.get('success') is True and original.get('singlePassRender') is True
            and not original.get('composition') and original.get('frames') == [0, total - 1],
            'Prior composition must originate from the retained successful complete render')
    original_sha = expected_hash(prior_plan.get('baseVideoSHA256'), 'prior original base hash')
    require(original.get('videoSHA256') == original_sha and base_render.get('videoSHA256') == original_sha,
            'Original video ancestry mismatch')
    require(original.get('timelineSHA256') == tl_sha and original.get('masterSHA256') == master_sha,
            'Original render timeline/audio mismatch')
    original_marker_copy = safe_path(prior['originalFinalRenderMarkerCopy'])
    original_marker_bytes = original_marker_copy.read_bytes()
    original_marker_sha = require_hash(original_marker_copy, prior.get('originalFinalRenderMarkerSHA256'),
                                      'original marker copy')
    require(base_render.get('originalMarkerSHA256') == original_marker_sha
            and json.loads(original_marker_bytes.decode('utf-8-sig')) == original
            and original_marker_bytes.decode('utf-8-sig') == prior.get('originalFinalRenderMarkerText'),
            'Original marker copy/text/nested marker disagreement')
    original_backup = safe_path(base_render['originalVideoBackup'])
    require(original_backup == ROOT / 'tmp/v5-before-final-boundary-repair.mp4',
            'Unexpected prior original backup location')
    require(safe_path(base_marker['composition']['originalRetainedAt']) == original_backup,
            'Prior composition backup pointers disagree')
    watched[original_backup] = require_hash(original_backup, original_sha, 'retained original base')
    watched[original_marker_copy] = original_marker_sha

    # Every historical composer input is verified. Two historical names were
    # mutable installation targets; resolve only those exact aliases to their
    # retained original files, never to today's replaced delivery/marker.
    prior_inputs = prior.get('inputFiles')
    require(isinstance(prior_inputs, dict) and len(prior_inputs) > 0, 'Missing historical input hash map')
    aliases = {relative(VIDEO): original_backup, relative(MARKER): original_marker_copy}
    verified_inputs = {}
    for name, value in prior_inputs.items():
        logical = safe_path(name, must_exist=False)
        actual = aliases[relative(logical)] if relative(logical) in aliases else safe_path(name)
        watched[actual] = require_hash(actual, value, 'historical input')
        verified_inputs[name] = {'sha256': watched[actual], 'verifiedFile': relative(actual),
                                 'retainedInstallationAlias': name in aliases}
    require(prior_inputs.get(relative(VIDEO)) == original_sha
            and prior_inputs.get(relative(MARKER)) == original_marker_sha
            and prior_inputs.get(relative(PRIOR_PLAN)) == PRIOR_PLAN_SHA256,
            'Prior input map does not bind its original base, marker and plan')
    composer = safe_path('scripts/compose_final_boundary_patches_v5.py')
    require(base_marker.get('composerSHA256') == prior_inputs.get(relative(composer))
            and sha(composer) == base_marker.get('composerSHA256'), 'Prior composer hash disagreement')

    original_sources = source_records(prior_plan.get('baseSourceHashes'),
        prior_plan.get('baseSourceSnapshots', {}), 'ancestry original render', watched, require_snapshots=True)
    require(original_sources == base_render.get('verifiedSourceSnapshots'),
            'Original archived source records disagree')
    require(all(original.get('sourceHashes', {}).get(k) == v['sha256'] for k, v in original_sources.items()),
            'Original marker source hashes disagree with archived source records')
    old_rows, old_patches = prior_plan.get('patches'), base_marker.get('patches')
    require(isinstance(old_rows, list) and isinstance(old_patches, list)
            and len(old_rows) == len(old_patches) == 23, 'Expected the reviewed 23-patch prior composition')
    patch_layers, segment_rows, previous_end = [], [], -1
    for row, patch in zip(old_rows, old_patches):
        start, end = row.get('start'), row.get('end')
        require(type(start) is int and type(end) is int and previous_end < start <= end < total,
                'Invalid prior patch range/order')
        previous_end = end
        path, marker_path = safe_path(row['video']), safe_path(row['marker'])
        require(patch.get('start') == start and patch.get('end') == end
                and safe_path(patch['path']) == path and safe_path(patch['markerPath']) == marker_path,
                'Prior plan/marker patch range or path disagreement')
        segment_marker = read(marker_path)
        require(segment_marker == patch.get('marker') and segment_marker.get('success') is True
                and segment_marker.get('frames') == [start, end]
                and segment_marker.get('timelineSHA256') == tl_sha
                and segment_marker.get('masterSHA256') == master_sha
                and segment_marker.get('planSHA256') == PRIOR_PLAN_SHA256
                and safe_path(segment_marker['outputLocation']) == path,
                'Prior patch render marker disagreement')
        require(prior_inputs.get(relative(path)) == patch.get('videoSHA256') == segment_marker.get('videoSHA256')
                and prior_inputs.get(relative(marker_path)) == patch.get('markerSHA256'),
                'Prior patch file/marker hash disagreement')
        require(row.get('sourceHashes') == patch.get('sourceHashes') == segment_marker.get('sourceHashes'),
                'Prior patch source hash map disagreement')
        sources = source_records(row.get('sourceHashes'), row.get('sourceSnapshots', {}),
            f'ancestry patch {start}-{end}', watched, require_snapshots=True)
        require(sources == patch.get('verifiedSources'), 'Prior patch source snapshot disagreement')
        patch_layers.append({'frames': [start, end], 'videoSHA256': patch['videoSHA256'],
                             'sourceSnapshots': sources})
        segment_rows.append({'start': start, 'end': end, 'path': path})
    old_segments = build_segments(segment_rows, total)
    serialized_segments = [{**s, 'path': relative(s['path'])} for s in old_segments]
    graph = filter_graph(old_segments)
    require(base_marker['composition'].get('segments') == serialized_segments
            and base_marker['composition'].get('filterGraph') == graph
            and base_marker['composition'].get('filterGraphSHA256') == digest(graph.encode('utf-8')),
            'Prior composition frame graph does not match the verified plan')
    require(base_marker['composition'].get('audio', {}).get('masterSHA256') == master_sha
            and base_marker['composition']['audio'].get('trimmed') is False
            and base_marker['composition']['audio'].get('start') == 0,
            'Prior composition did not use the full original master from zero')
    # Public assets belong to the original render layer and remain inputs to
    # the repaired scene. They are verified separately from mutable TS files.
    asset_hashes = original.get('publicAssetHashes')
    require(isinstance(asset_hashes, dict) and asset_hashes, 'Missing original public-asset hashes')
    for name, value in asset_hashes.items():
        asset = safe_path(name)
        watched[asset] = require_hash(asset, value, 'original public asset')
    return {'identity': expected, 'originalVideoSHA256': original_sha,
            'originalVideoRetainedAt': relative(original_backup),
            'verifiedHistoricalInputs': verified_inputs,
            'verifiedSourceLayers': {'originalCompleteRender': original_sources, 'priorPatches': patch_layers},
            'priorProvenance': prior}


def preflight(plan_path, ffprobe):
    watched = {plan_path: sha(plan_path), Path(__file__).resolve(): sha(Path(__file__).resolve())}
    plan = read(plan_path)
    require(plan.get('version') == 'v5-local-patches', 'Unsupported/missing plan version')
    for key, fixed in [('fps', FPS), ('width', WIDTH), ('height', HEIGHT)]:
        require(plan.get(key, fixed) == fixed, 'Unexpected plan ' + key)
    for path in (VIDEO, MARKER, MASTER, TIMELINE, ROOT / 'public/timeline.json'):
        safe_path(path)
    if plan.get('baseVideo') is not None:
        require(safe_path(plan['baseVideo']) == VIDEO, 'Plan points at a different base video')
    timeline = read(TIMELINE)
    total = timeline['duration']
    require(type(total) is int and total > 0, 'Invalid timeline duration')
    tl_sha = require_hash(TIMELINE, plan.get('timelineSHA256'), 'timelineSHA256')
    require_hash(ROOT / 'public/timeline.json', tl_sha, 'public timelineSHA256')
    master_sha = require_hash(MASTER, plan.get('masterSHA256'), 'masterSHA256')
    base_sha = require_hash(VIDEO, plan.get('baseVideoSHA256'), 'baseVideoSHA256')
    base_marker_bytes = MARKER.read_bytes()
    base_marker = json.loads(base_marker_bytes.decode('utf-8-sig'))
    require(base_marker.get('success') is True and base_marker.get('frames') == [0, total - 1],
            'Base marker does not describe a successful full current render')
    require(base_marker.get('timelineSHA256') == tl_sha and base_marker.get('masterSHA256') == master_sha,
            'Base marker timeline/audio mismatch')
    require(base_marker.get('videoSHA256') == base_sha, 'Base marker video hash mismatch')
    require(safe_path(base_marker['outputLocation']) == VIDEO, 'Base marker points at a different video')
    base_ancestry = verify_base_composition(plan, base_marker, base_marker_bytes, base_sha,
                                           tl_sha, master_sha, total, watched)
    for path, value in [(VIDEO, base_sha), (MARKER, digest(base_marker_bytes)), (MASTER, master_sha),
                        (TIMELINE, tl_sha), (ROOT / 'public/timeline.json', tl_sha)]:
        watched[path] = value
    print('Preflight: counting decoded base frames', flush=True)
    base_probe = video_probe(VIDEO, ffprobe)
    check_video(VIDEO, base_probe, total)
    master_probe = audio_probe(MASTER, ffprobe)
    require(int(master_probe['sample_rate']) == 48000, 'Expected 48 kHz full-length master')
    require(abs(audio_seconds(master_probe) - Fraction(total, FPS)) <= Fraction(1, 48000),
            'Master is not exactly the timeline length; audio will not be trimmed or padded')
    base_sources = base_ancestry['verifiedSourceLayers']
    rows = plan.get('patches')
    require(isinstance(rows, list) and len(rows) == 1, 'This h070 repair requires exactly one bounded patch')
    h070 = next((c for c in timeline['clips'] if c['id'] == 'h070'), None)
    require(h070 is not None, 'Timeline has no h070 clip')
    patches, previous_end = [], -1
    for row in rows:
        start, end = row.get('start'), row.get('end')
        require(type(start) is int and type(end) is int and 0 <= start <= end < total,
                'Patch requires valid inclusive absolute frame bounds')
        require(start <= h070['end'] and end >= h070['start'], 'Repair range must intersect h070')
        require(start > previous_end, 'Patch ranges must be sorted and non-overlapping')
        previous_end = end
        support = row.get('supportFrames')
        if support is not None:
            require(isinstance(support, list) and len(support) == 2
                    and all(type(f) is int for f in support) and start <= support[0] <= support[1] <= end,
                    'Patch supportFrames must lie inside its rendered range')
        path, marker_path = safe_path(row['video']), safe_path(row['marker'])
        require(path != VIDEO and path != BACKUP and path.suffix.lower() == '.mp4', 'Invalid patch video path')
        require(marker_path != MARKER, 'Each segment marker must be copied before another render overwrites it')
        marker = read(marker_path)
        require(marker.get('success') is True and marker.get('frames') == [start, end],
                'Patch marker frame range/success mismatch')
        require(marker.get('timelineSHA256') == tl_sha and marker.get('masterSHA256') == master_sha,
                'Patch was rendered against a different timeline or master')
        require(safe_path(marker['outputLocation']) == path, 'Patch marker output location mismatch')
        patch_sha = require_hash(path, marker.get('videoSHA256'), 'patch videoSHA256')
        if row.get('videoSHA256') is not None:
            require_hash(path, row['videoSHA256'], 'plan patch videoSHA256')
        sources = source_records(row.get('sourceHashes'), row.get('sourceSnapshots', {}),
                                 f'patch {start}-{end}', watched)
        require(marker.get('sourceHashes') == row['sourceHashes'], 'Patch marker/plan source hash mismatch')
        require(marker.get('planSHA256') == watched[plan_path], 'Patch marker uses a different repair plan')
        print(f'Preflight: counting patch {start}-{end}', flush=True)
        probe = video_probe(path, ffprobe)
        check_video(path, probe, end - start + 1)
        watched[path], watched[marker_path] = patch_sha, sha(marker_path)
        patches.append({'start': start, 'end': end, 'path': path, 'markerPath': marker_path,
                        'videoSHA256': patch_sha, 'markerSHA256': watched[marker_path], 'marker': marker,
                        'sourceHashes': row['sourceHashes'], 'verifiedSources': sources,
                        'probe': probe, 'supportFrames': support, 'reason': row.get('reason', '')})
    require(not BACKUP.exists(), 'Original-film backup already exists; refusing to overwrite: ' + str(BACKUP))
    require(not PROVENANCE.exists(), 'Patch provenance already exists; inspect it before another compose')
    for path in (BACKUP, PROVENANCE, LOCK):
        safe_path(path, must_exist=False)
    return {'plan': plan, 'watched': watched, 'total': total, 'timelineSHA256': tl_sha,
            'masterSHA256': master_sha, 'baseVideoSHA256': base_sha, 'baseMarker': base_marker,
            'baseMarkerBytes': base_marker_bytes, 'baseProbe': base_probe, 'masterProbe': master_probe,
            'baseSources': base_sources, 'baseCompositionAncestry': base_ancestry,
            'patches': patches, 'segments': build_segments(patches, total)}


def compose(state, plan_path, args):
    token = uuid.uuid4().hex
    with LOCK.open('x', encoding='ascii') as stream:
        stream.write(token)
    installed = False
    run_dir = ROOT / 'tmp' / ('v5-h070-bridge-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + token[:8])
    run_dir.mkdir()
    candidate, graph_path = run_dir / 'composed.mp4', run_dir / 'filtergraph.txt'
    started = time.monotonic()
    try:
        verify_unchanged(state['watched'])
        atomic_bytes(run_dir / 'base-final-render-original.json', state['baseMarkerBytes'])
        graph = filter_graph(state['segments'])
        graph_path.write_text(graph, encoding='utf-8')
        command = encode_command(state, args, graph_path, candidate)
        version = subprocess.run([args.ffmpeg, '-version'], capture_output=True, text=True,
                                 encoding='utf-8', errors='replace', check=True).stdout.splitlines()[0]
        reused = state.get('reuseEncoded')
        if reused:
            encoded_copy = run_dir / 'encoded-before-vui.mp4'
            shutil.copyfile(safe_path(reused['candidate']), encoded_copy)
            require(sha(encoded_copy) == reused['candidateSHA256'], 'Retained candidate copy hash mismatch')
            command = reused['originalEncodingCommand']
            run_command = [args.ffmpeg, '-hide_banner', '-nostdin', '-n', '-i', str(encoded_copy),
                '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1',
                '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
                '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                '-movflags', '+faststart+write_colr', '-progress', 'pipe:1', '-nostats', str(candidate)]
            reused.update(remuxCommand=run_command, copiedCandidate=relative(encoded_copy),
                          copiedCandidateSHA256=sha(encoded_copy), videoReencoded=False, audioReencoded=False,
                          remuxPurpose='Fill missing H.264 VUI and MP4 BT.709 limited-range color labels only')
            print('Reusing verified encoded frames; stream-copying H.264 VUI and MP4 color metadata', flush=True)
        else:
            run_command = command
            print('Composing exact video frames with the complete untrimmed master', flush=True)
        atomic_bytes(run_dir / 'command.json', json_bytes({'command': run_command, 'filterGraph': graph,
            'sourcePlan': relative(plan_path), 'ffmpeg': version,
            'inputFiles': {relative(p): h for p, h in state['watched'].items()},
            'reusedEncoding': reused}))
        with (run_dir / 'ffmpeg.stderr.log').open('w', encoding='utf-8') as errors, \
             (run_dir / 'ffmpeg.progress.log').open('w', encoding='utf-8') as progress:
            process = subprocess.Popen(run_command, stdout=subprocess.PIPE, stderr=errors, text=True,
                                       encoding='utf-8', errors='replace')
            try:
                for line in process.stdout:
                    progress.write(line)
                    if line.startswith(('frame=', 'out_time=', 'progress=')):
                        print(line.strip(), flush=True)
                require(process.wait() == 0, 'FFmpeg failed; retained diagnostics at ' + str(run_dir))
            except BaseException:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                raise
        final_probe = video_probe(candidate, args.ffprobe)
        check_video(candidate, final_probe, state['total'])
        color_remux = None
        if not all(final_probe.get(key) == 'bt709' for key in ('color_space', 'color_transfer', 'color_primaries')):
            require(final_probe.get('color_space') == 'bt709'
                    and all(final_probe.get(k) in {None, 'unknown', 'bt709'} for k in ['color_transfer', 'color_primaries']),
                    'Unexpected encoded color space; refusing to relabel')
            # Some local FFmpeg builds drop transfer/primaries at encoder output.
            # A separate stream-copy pass sets both H.264 VUI and MP4 colr tags.
            encoded_before_color = run_dir / 'encoded-before-color.mp4'
            os.replace(candidate, encoded_before_color)
            color_command = [args.ffmpeg, '-hide_banner', '-nostdin', '-n', '-i', str(encoded_before_color),
                '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1',
                '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
                '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                '-movflags', '+faststart+write_colr', str(candidate)]
            result = subprocess.run(color_command, capture_output=True, text=True, encoding='utf-8', errors='replace')
            (run_dir / 'color-remux.stderr.log').write_text(result.stderr, encoding='utf-8')
            require(result.returncode == 0, 'Color metadata stream-copy failed')
            color_remux = {'command': color_command, 'inputSHA256': sha(encoded_before_color),
                           'videoReencoded': False, 'audioReencoded': False, 'beforeProbe': final_probe}
            final_probe = video_probe(candidate, args.ffprobe)
            check_video(candidate, final_probe, state['total'])
            color_remux.update(outputSHA256=sha(candidate), afterProbe=final_probe)
            atomic_bytes(run_dir / 'color-remux.json', json_bytes(color_remux))
        require(all(final_probe.get(key) == 'bt709' for key in ('color_space', 'color_transfer', 'color_primaries')),
                'Composed video missing BT.709 metadata')
        require(final_probe.get('color_range') == 'tv', 'Composed video must retain limited-range color metadata')
        final_audio = audio_probe(candidate, args.ffprobe)
        require(final_audio['codec_name'] == 'aac' and int(final_audio['sample_rate']) == 48000,
                'Unexpected composed audio codec/sample rate')
        require(final_audio['channels'] == state['masterProbe']['channels'], 'Audio channel count changed')
        require(abs(audio_seconds(final_audio) - Fraction(state['total'], FPS)) <= Fraction(1024, 48000),
                'Composed AAC duration exceeds one AAC packet tolerance')
        require(abs(float(final_audio.get('start_time', 0))) <= 1 / 48000, 'Composed audio start shifted')
        final_sha = sha(candidate)
        if reused:
            reused.update(remuxedSHA256=final_sha, verifiedVideoAfterRemux=final_probe,
                          verifiedAudioAfterRemux=final_audio, completeColorMetadataValidated=True)
            atomic_bytes(run_dir / 'reuse-encoded-provenance.json', json_bytes(reused))
        verify_unchanged(state['watched'])
        # The copy is exclusive: an earlier backup can never be overwritten.
        with VIDEO.open('rb') as source, BACKUP.open('xb') as retained:
            shutil.copyfileobj(source, retained, 4 * 1024 * 1024)
            retained.flush()
            os.fsync(retained.fileno())
        require(sha(BACKUP) == state['baseVideoSHA256'], 'Original-film backup hash mismatch')
        verify_unchanged(state['watched'])
        patches = [{k: (relative(v) if isinstance(v, Path) else v) for k, v in p.items()} for p in state['patches']]
        composition = {
            'method': 'decode; exact-frame trim; video-only concat; full original master encoded once',
            'ffmpeg': version, 'command': command, 'filterGraph': graph, 'filterGraphSHA256': digest(graph.encode('utf-8')),
            'video': {'codec': 'libx264', 'crf': 16, 'preset': args.preset, 'pix_fmt': 'yuv420p', 'colorSpace': 'bt709'},
            'audio': {'source': relative(MASTER), 'masterSHA256': state['masterSHA256'], 'trimmed': False,
                      'codec': 'aac', 'bitrate': '320k', 'sampleRate': 48000, 'start': 0},
            'segments': [{**s, 'path': relative(s['path'])} for s in state['segments']],
            'measuredVideo': final_probe, 'measuredAudio': final_audio,
            'diagnostics': relative(run_dir), 'originalRetainedAt': relative(BACKUP),
            'reusedEncoding': reused,
            'colorMetadataRemux': color_remux,
        }
        final_marker = {
            'finished': now(), 'frames': [0, state['total'] - 1], 'seconds': round(time.monotonic() - started, 3),
            'outputLocation': str(VIDEO), 'success': True, 'timelineSHA256': state['timelineSHA256'],
            'masterSHA256': state['masterSHA256'], 'videoSHA256': final_sha,
            'renderMode': 'remotion-base-with-local-remotion-patches-and-ffmpeg-composition', 'singlePassRender': False,
            'baseRender': {'videoSHA256': state['baseVideoSHA256'], 'originalMarkerSHA256': digest(state['baseMarkerBytes']),
                           'marker': state['baseMarker'], 'verifiedSourceSnapshots': state['baseSources'],
                           'sourceScope': 'layered original complete render plus 23 prior patches',
                           'priorCompositionIdentity': state['baseCompositionAncestry']['identity'],
                           'originalVideoBackup': relative(BACKUP)},
            'patches': patches, 'composition': composition,
            'provenancePath': relative(PROVENANCE), 'planSHA256': state['watched'][plan_path],
            'composerSHA256': state['watched'][Path(__file__).resolve()],
        }
        provenance = {'version': 'v5-patch-render-provenance', 'state': 'prepared', 'createdUTC': now(),
                      'planPath': relative(plan_path), 'plan': state['plan'],
                      'originalFinalRenderMarker': state['baseMarker'],
                      'originalFinalRenderMarkerCopy': relative(run_dir / 'base-final-render-original.json'),
                      'originalFinalRenderMarkerText': state['baseMarkerBytes'].decode('utf-8-sig'),
                      'originalFinalRenderMarkerSHA256': digest(state['baseMarkerBytes']),
                      'originalVideoProbe': state['baseProbe'], 'finalRenderMarker': final_marker,
                      'baseCompositionAncestry': state['baseCompositionAncestry'],
                      'inputFiles': {relative(p): h for p, h in state['watched'].items()}}
        atomic_bytes(PROVENANCE, json_bytes(provenance))
        atomic_bytes(run_dir / 'final-render-staged.json', json_bytes(final_marker))
        # A single filesystem replacement installs the completely verified MP4.
        # Marker/provenance writes are individually atomic. Normal failures after
        # install roll back to the preserved original; a crash is detectable by
        # a mismatched marker and the retained prepared provenance record.
        os.replace(candidate, VIDEO)
        installed = True
        atomic_bytes(MARKER, json_bytes(final_marker))
        require(sha(VIDEO) == final_sha, 'Installed video hash mismatch')
        provenance.update(state='complete', completedUTC=now())
        atomic_bytes(PROVENANCE, json_bytes(provenance))
        print(json.dumps({'success': True, 'frames': state['total'], 'videoSHA256': final_sha,
                          'output': str(VIDEO), 'baseRetained': str(BACKUP), 'provenance': str(PROVENANCE),
                          'singlePassRender': False}, ensure_ascii=False), flush=True)
    except BaseException as error:
        if installed:
            rollback = run_dir / 'rollback-original.mp4'
            shutil.copyfile(BACKUP, rollback)
            require(sha(rollback) == state['baseVideoSHA256'], 'Rollback backup mismatch; inspect retained original')
            os.replace(rollback, VIDEO)
            atomic_bytes(MARKER, state['baseMarkerBytes'])
            if PROVENANCE.exists():
                previous = read(PROVENANCE)
                previous.update(state='rolled-back', rolledBackAtUTC=now(), error=str(error))
                atomic_bytes(PROVENANCE, json_bytes(previous))
        atomic_bytes(run_dir / 'failure.json', json_bytes({'failedAtUTC': now(), 'error': str(error),
                     'originalRestored': installed, 'baseBackupExists': BACKUP.exists(),
                     'note': 'No source, segment, master or diagnosis files were removed. Inspect before retry.'}))
        raise
    finally:
        if LOCK.exists() and LOCK.read_text(encoding='ascii') == token:
            LOCK.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--execute', action='store_true', help='Encode and install after all checks; default only verifies')
    parser.add_argument('--reuse-encoded', type=Path, help='Retained composed.mp4 from a BT.709-only metadata failure; verify then stream-copy VUI tags')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--ffprobe', default='ffprobe')
    parser.add_argument('--threads', type=int, default=8)
    parser.add_argument('--preset', default='slow', choices=['medium', 'slow', 'slower'])
    args = parser.parse_args()
    require(1 <= args.threads <= 32, 'Choose 1–32 encoder threads')
    require(not LOCK.exists(), 'Another patch composition is active; inspect the lock before proceeding')
    plan_path = safe_path(args.plan)
    state = preflight(plan_path, args.ffprobe)
    if args.reuse_encoded:
        state['reuseEncoded'] = preflight_reuse(state, plan_path, args)
    if not args.execute:
        print(json.dumps({'preflightPassed': True, 'executed': False, 'frames': state['total'],
                          'patchRanges': [[p['start'], p['end']] for p in state['patches']],
                          'filterGraph': filter_graph(state['segments']),
                          'reuseEncoded': state.get('reuseEncoded'),
                          'audioPolicy': 'complete master from zero; no trimming, padding or time stretching'},
                         ensure_ascii=False, indent=2), flush=True)
        return
    compose(state, plan_path, args)


if __name__ == '__main__':
    main()


