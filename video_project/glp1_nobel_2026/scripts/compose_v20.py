"""Compose V20 from inclusive IDR-aligned patches, without video re-encoding.

Default is read-only preflight. --compose builds an isolated candidate, verifies
every decoded video frame and the complete audio, then publishes a NEW V20 file.
No src/public file, baseline, patch, or existing delivery is modified/deleted.

Plan (paths are project-relative or absolute paths inside this project):
  {"patches": [{"start": 0, "end": 249, "path": "tmp/v19-patches/000.mp4"}]}
Every patch must have its renderer JSON marker (same stem by default), containing
start/end/path/sha256/sourceLockSHA256. The plan directory must contain the shared
source-lock.json {"hashes": {"project/path": "sha256"}}. plan.sourceLock identifies
the FINAL current inputs. Each patch may identify an older lock with sourceLock;
only the hand and GLP source files below may differ, with verified frozen
snapshots; the new molecular narration module may be absent from older locks.
plan.handSupportFrames is an array of inclusive [start, end] ranges, all of which
must be covered by patches whose hand sources match the final lock. The analogous
plan.glpSupportFrames requires current GLP sources. These independent coverage
checks allow old camera patches outside GLP support and old hands outside hand
support, without confusing one source generation with another. The analogous
captionSupportFrames covers the two locally corrected short subtitles.
Custom marker locations use patches[].marker. Optional extra SHA256 locks:
baseSHA256, masterSHA256, and patches[].sha256. plan.result optionally identifies
one renderer completion result; per-patch markers are always required.

Examples:
  python scripts/compose_v19.py --validate
  python scripts/compose_v19.py --compose
  python scripts/compose_v19.py --compose --work-dir tmp/v19-compose-r2
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import tempfile

from verify_idr_splice_v6 import (
    frame_hashes, idr_at, loudness, packet_timing, probe, require,
    run, sha, verify_audio, video_stream,
)

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'delivery/如何科学减肥_从身体调节说起_V19_1080p.mp4'
MASTER = ROOT / 'public/master-v20.wav'
PLAN = ROOT / 'tmp/v20-opening-patches/plan.json'
OUTPUT = ROOT / 'delivery/一顿饭后_身体在忙什么_V20_1080p.mp4'
WORK = ROOT / 'tmp/v20-compose'
CACHE = ROOT / 'tmp/v19-compose-hands/final-composed.yuv.sha256'
CACHE_MANIFEST = ROOT / 'tmp/v20-opening-patches/base-v19-manifest.json'
HAND_SOURCES = {'src/V5Person.ts', 'src/V7GripHand.ts'}
GLP_SOURCES = {'src/V5CameraPath.ts', 'src/V5World.ts', 'src/MolecularNarration.ts',
               'src/DrugDetail.ts'}
NEW_GLP_SOURCES = {'src/MolecularNarration.ts'}
CAPTION_SOURCES = {'src/V5Film.tsx'}
FULL = 26738
FPS = 30
CHAPTERS = 20
TIMESCALE = 90000
TITLE = '一顿饭后，身体在忙什么？'
FFMPEG = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-n']


def frame_hashes_parallel(path, output, expected_count, keyframes, jobs=8):
    """Decode independent IDR-started chunks concurrently, then merge exact YUV420 SHA rows.

    Every chunk starts at a baseline keyframe and emits framehash rows with a local
    1/30 time base. Hash bytes are identical to verify_idr_splice_v6.frame_hashes;
    only the scheduling changes. The merged file restores global PTS/DTS rows.
    """
    boundaries=sorted({0, expected_count, *(int(x) for x in keyframes if 0 < int(x) < expected_count)})
    # Keep enough work per process while avoiding hundreds of tiny ffmpeg jobs.
    target=max(1, expected_count//max(1,jobs*2))
    selected=[0]
    for frame in boundaries[1:-1]:
        if frame-selected[-1] >= target:selected.append(frame)
    if selected[-1] != expected_count:selected.append(expected_count)
    chunks=list(zip(selected[:-1],selected[1:]))
    tmpdir=Path(tempfile.mkdtemp(prefix='v20-hash-',dir=Path(output).parent))
    def one(pair):
        start,end=pair;count=end-start;dest=tmpdir/f'{start:06d}.hash'
        command=['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-hwaccel','none','-ss',f'{start/FPS:.9f}','-i',str(path),'-map','0:v:0','-an','-c:v','rawvideo','-pix_fmt','yuv420p','-threads','2','-frames:v',str(count),'-fps_mode','passthrough','-f','framehash','-hash','sha256','-y',str(dest)]
        result=__import__('subprocess').run(command,capture_output=True,encoding='utf8',errors='replace')
        require(result.returncode==0,f'Parallel framehash failed at F{start}: {result.stderr[-2000:]}')
        rows=[];header=[]
        for line in dest.read_text(encoding='utf8').splitlines():
            if line.startswith('#'):header.append(line);continue
            if not line.strip():continue
            fields=[x.strip() for x in line.split(',')];require(len(fields)==6 and fields[0]=='0','Invalid framehash row in parallel chunk')
            dts,pts,duration,size=map(int,fields[1:5]);require((pts,duration,size)==(len(rows),1,1920*1080*3//2),'Parallel chunk timing/size mismatch')
            require(re.fullmatch(r'[a-f0-9]{64}',fields[5]),'Invalid parallel YUV hash')
            rows.append(fields[5])
        require(len(rows)==count,f'Parallel decoded count mismatch at F{start}: {len(rows)} != {count}')
        return start,rows,header
    results={}
    try:
        with ThreadPoolExecutor(max_workers=min(jobs,len(chunks))) as pool:
            futures=[pool.submit(one,c) for c in chunks]
            for future in as_completed(futures):
                start,rows,header=future.result();results[start]=(rows,header)
        lines=results[min(results)][1]
        for start in sorted(results):
            for i,digest in enumerate(results[start][0]):
                index=start+i;lines.append(f'0, {index:12d}, {index:12d},        1,  3110400, {digest}')
        Path(output).write_text('\n'.join(lines)+'\n',encoding='utf8')
        # Re-parse the merged file with the same invariants as the canonical helper.
        text=Path(output).read_text(encoding='utf8');tb_match=re.search(r'#tb\s+0:\s+(\d+/\d+)',text);require(tb_match and tb_match.group(1)=='1/30','Merged framehash time base differs')
        rows=[line for line in text.splitlines() if line.strip() and not line.startswith('#')];require(len(rows)==expected_count,'Merged framehash count differs')
        return [line.split(',')[-1].strip() for line in rows]
    finally:
        shutil.rmtree(tmpdir,ignore_errors=True)
COLOR = ['-color_range', 'tv', '-color_primaries', 'bt709',
         '-color_trc', 'bt709', '-colorspace', 'bt709']


def now():
    return datetime.now(timezone.utc).isoformat()


def relative(path):
    return Path(path).relative_to(ROOT).as_posix()


def safe(value, *, exists=True):
    path = Path(os.path.abspath(ROOT / Path(value)))
    require(path != ROOT and path.is_relative_to(ROOT)
            and path.resolve().is_relative_to(ROOT), 'Path escapes project: ' + str(path))
    for item in [path, *path.parents]:
        if item == ROOT:
            break
        if item.exists():
            st = item.lstat()
            require(not stat.S_ISLNK(st.st_mode)
                    and not (getattr(st, 'st_file_attributes', 0) & 0x400),
                    'Linked/reparse path refused: ' + str(item))
    if exists:
        require(path.is_file() and path.stat().st_size > 0, 'Missing input: ' + str(path))
    return path


def write_new(path, value):
    with Path(path).open('x', encoding='utf8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def read_chapters(path):
    data = json.loads(run(['ffprobe', '-v', 'error', '-show_chapters', '-of', 'json', str(path)]))
    chapters = data.get('chapters', [])
    require(len(chapters) == CHAPTERS, f'Expected {CHAPTERS} chapters: {path}')
    canonical = []
    for chapter in chapters:
        tb = Fraction(chapter['time_base'])
        start, end = int(chapter['start']) * tb, int(chapter['end']) * tb
        title = chapter.get('tags', {}).get('title', '')
        require(title and 0 <= start < end <= Fraction(FULL, FPS) + Fraction(1, 1000),
                'Invalid chapter timing/title')
        require(not canonical or start == Fraction(canonical[-1]['end']),
                'Chapter gap/overlap')
        canonical.append({'start': str(start), 'end': str(end), 'title': title})
    require(canonical[0]['start'] == '0', 'Chapters do not start at zero')
    require(abs(Fraction(canonical[-1]['end']) - Fraction(FULL, FPS)) <= Fraction(1, 1000),
            'Chapters do not cover the complete film')
    return canonical


def write_chapters(path, chapters):
    """Keep explicit chapter tags: -map_metadata -1 would erase their titles."""
    def escape(value):
        return (value.replace('\\', '\\\\').replace('=', '\\=').replace(';', '\\;')
                .replace('#', '\\#').replace('\n', '\\\n'))
    lines = [';FFMETADATA1', 'title=' + escape(TITLE)]
    for chapter in chapters:
        start, end = Fraction(chapter['start']), Fraction(chapter['end'])
        # Existing chapter boundaries are exact milliseconds. Preserve them
        # instead of deriving a new chapter end from rounded video duration.
        require((start * 1000).denominator == (end * 1000).denominator == 1,
                'Chapter timestamps cannot be represented exactly in milliseconds')
        lines += ['[CHAPTER]', 'TIMEBASE=1/1000', f'START={int(start * 1000)}',
                  f'END={int(end * 1000)}', 'title=' + escape(chapter['title'])]
    with Path(path).open('x', encoding='utf8') as output:
        output.write('\n'.join(lines) + '\n')


def video_packets(path, report_path, count):
    """Canonical compressed payload/PTS/DTS, independent of MP4 time-base units."""
    data = json.loads(run([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_packets',
        '-show_data_hash', 'sha256', '-show_entries',
        'stream=time_base,extradata_hash:packet=pts,dts,duration,size,flags,data_hash',
        '-of', 'json', str(path),
    ]))
    require(len(data['streams']) == 1 and len(data['packets']) == count,
            'Compressed video packet count differs')
    stream = data['streams'][0]
    tb = Fraction(stream['time_base'])
    config = stream.get('extradata_hash', '')
    require(re.fullmatch(r'SHA256:[a-f0-9]{64}', config), 'Missing codec configuration hash')
    rows = []
    for packet in data['packets']:
        digest = packet.get('data_hash', '')
        require(re.fullmatch(r'SHA256:[a-f0-9]{64}', digest), 'Missing packet payload hash')
        rows.append({
            'pts': str(int(packet['pts']) * tb), 'dts': str(int(packet['dts']) * tb),
            'duration': str(int(packet['duration']) * tb), 'bytes': int(packet['size']),
            'flags': packet['flags'], 'sha256': digest[7:],
        })
    report = {'codecConfigSHA256': config[7:], 'packetCount': len(rows), 'packets': rows}
    write_new(report_path, report)
    return report


def cached_base_frames(state, watch):
    """Authenticate prior full decode and independently revalidate every hash row."""
    if not CACHE.exists() and not CACHE_MANIFEST.exists():
        return None
    cache, cache_sha = watch(CACHE)
    manifest_path, manifest_sha = watch(CACHE_MANIFEST)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    require(safe(manifest['base']) == BASE and manifest.get('baseSHA256') == state['baseSHA256'],
            'Cached baseline identity differs')
    require(safe(manifest['framehash']) == cache and manifest.get('framehashSHA256') == cache_sha,
            'Cached framehash identity differs')
    helper = safe(manifest['helper'])
    require(helper == ROOT / 'scripts/verify_idr_splice_v6.py'
            and manifest.get('helperSHA256') == sha(helper), 'Cached verifier identity differs')
    require(manifest.get('frames') == FULL and manifest.get('fps') == FPS
            and manifest.get('pixelFormat') == 'yuv420p' and manifest.get('dimensions') == [1920, 1080]
            and manifest.get('decodedPresentationTimestampsExact') is True
            and manifest.get('allFrameDurationsExact') is True
            and manifest.get('fullDecodeSuccess') is True, 'Cached decode completion/format differs')
    content = cache.read_text(encoding='utf8')
    match = re.search(r'#tb\s+0:\s+(\d+/\d+)', content)
    require(match, 'Missing cached framehash time base')
    tb = Fraction(match.group(1))
    rows = []
    for line in content.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [value.strip() for value in line.split(',')]
        require(len(fields) == 6 and fields[0] == '0', 'Invalid cached framehash row')
        _dts, pts, duration, size = map(int, fields[1:5])
        require(pts * tb == Fraction(len(rows), FPS) and duration * tb == Fraction(1, FPS),
                f'Cached decoded PTS/duration differs at F{len(rows)}')
        require(size == 1920 * 1080 * 3 // 2 and re.fullmatch(r'[a-f0-9]{64}', fields[5]),
                'Cached decoded size/hash differs')
        rows.append(fields[5])
    require(len(rows) == FULL, 'Cached full-frame count differs')
    return {'rows': rows, 'evidence': {
        'cache': relative(cache), 'cacheSHA256': cache_sha,
        'manifest': relative(manifest_path), 'manifestSHA256': manifest_sha,
        'baseSHA256': state['baseSHA256'], 'helperSHA256': manifest['helperSHA256'],
        'everyCachedPTSAndDurationRevalidated': True, 'authenticated': True,
    }}


def preflight(plan_path):
    plan_path = safe(plan_path)
    plan = json.loads(plan_path.read_text(encoding='utf-8-sig'))
    require(isinstance(plan, dict) and isinstance(plan.get('patches'), list),
            'Plan must contain a patches array')
    require(plan.get('frames', FULL) == FULL and plan.get('fps', FPS) == FPS,
            'Plan frame count/fps differs')
    require(safe(plan.get('base', BASE)) == BASE, 'Plan identifies a different baseline')
    watched = {}

    def watch(path, expected=None):
        path = safe(path)
        digest = sha(path)
        if expected is not None:
            require(digest == expected, 'Input SHA256 lock differs: ' + str(path))
        watched[path] = digest
        return path, digest

    base, base_sha = watch(BASE, plan.get('baseSHA256'))
    master, master_sha = watch(MASTER, plan.get('masterSHA256'))
    watch(plan_path)
    watch(Path(__file__).resolve())
    watch(ROOT / 'scripts/verify_idr_splice_v6.py')
    lock_path, lock_sha = watch(plan.get('sourceLock', plan_path.parent / 'source-lock.json'))
    lock = json.loads(lock_path.read_text(encoding='utf-8-sig'))
    hashes = lock.get('hashes')
    require(isinstance(hashes, dict) and hashes and 'src/timeline.json' in hashes
            and 'public/master-v20.wav' in hashes, 'Incomplete patch source lock')
    current_inventory = {relative(path) for directory in ['src', 'public']
                         for path in (ROOT / directory).rglob('*') if path.is_file()}
    locked_inventory = {name for name in hashes if name.startswith(('src/', 'public/'))}
    require(current_inventory == locked_inventory,
            'Final source lock does not match the complete current src/public file inventory')
    for name, expected in hashes.items():
        require(isinstance(expected, str) and re.fullmatch(r'[a-f0-9]{64}', expected),
                'Invalid source-lock SHA256')
        watch(name, expected)
    require(hashes['public/master-v20.wav'] == master_sha, 'Patch lock and current master differ')
    lock_inventory = {lock_path: {'path': relative(lock_path), 'sha256': lock_sha,
                                 'changedSources': [], 'frozenEvidence': []}}

    def patch_source_lock(value):
        path, digest = watch(value)
        if path in lock_inventory:
            return lock_inventory[path]
        old_lock = json.loads(path.read_text(encoding='utf-8-sig'))
        old_hashes = old_lock.get('hashes')
        require(isinstance(old_hashes, dict) and not (set(old_hashes) - set(hashes))
                and (set(hashes) - set(old_hashes)) <= NEW_GLP_SOURCES,
                'Older patch lock changed the source inventory beyond the new GLP narration module')
        changed = sorted(name for name, value in hashes.items() if old_hashes.get(name) != value)
        require(set(changed) <= HAND_SOURCES | GLP_SOURCES | CAPTION_SOURCES,
                'Older patch lock differs outside approved hand/GLP/caption sources: ' + ', '.join(changed))
        evidence = []
        for name in changed:
            if name not in old_hashes:
                require(name in NEW_GLP_SOURCES and not (path.parent / 'frozen' / name).exists(),
                        'New GLP source unexpectedly exists in the older frozen inventory')
                evidence.append({'source': name, 'absentFromOlderInventory': True,
                                 'absentFromOlderFrozenSnapshot': True})
                continue
            expected = old_hashes[name]
            require(isinstance(expected, str) and re.fullmatch(r'[a-f0-9]{64}', expected),
                    'Invalid older source hash')
            snapshot, snapshot_sha = watch(path.parent / 'frozen' / name, expected)
            evidence.append({'source': name, 'snapshot': relative(snapshot), 'sha256': snapshot_sha})
        record = {'path': relative(path), 'sha256': digest, 'changedSources': changed,
                  'frozenEvidence': evidence}
        lock_inventory[path] = record
        return record
    base_video = video_stream(base, FULL)
    base_timing = packet_timing(base, FULL)
    chapters = read_chapters(base)
    master_streams = probe(master)['streams']
    require(len(master_streams) == 1 and master_streams[0]['codec_type'] == 'audio',
            'Master must contain exactly one audio stream')
    audio = master_streams[0]
    require(int(audio['sample_rate']) == 48000 and audio['channels'] == 2,
            'Master must be stereo 48 kHz')
    require(int(audio['duration_ts']) * Fraction(audio['time_base']) == Fraction(FULL, FPS),
            'Master duration must be exactly 26738/30 seconds; no trimming or padding permitted')
    patches = []
    previous_end = -1
    for row in plan['patches']:
        require(isinstance(row, dict), 'Invalid patch record')
        s, e = row.get('start'), row.get('end')
        require(type(s) is int and type(e) is int and 0 <= s <= e < FULL,
                'Patch bounds must be inclusive integer frame indices')
        require(s > previous_end, 'Patches must be sorted and must not overlap')
        previous_end = e
        patch, digest = watch(row['path'], row.get('sha256'))
        require(patch not in {base, master, plan_path}, 'Patch path aliases another input')
        marker_path, marker_sha = watch(row.get('marker', patch.with_suffix('.json')))
        marker = json.loads(marker_path.read_text(encoding='utf-8-sig'))
        require(marker.get('start') == s and marker.get('end') == e
                and safe(marker['path']) == patch, 'Patch renderer marker bounds/path differ')
        patch_lock = patch_source_lock(row.get('sourceLock', lock_path))
        require(marker.get('sha256') == digest and marker.get('sourceLockSHA256') == patch_lock['sha256'],
                'Patch hash or source-lock marker differs')
        runner_evidence = None
        if 'runner' in marker or 'runnerSHA256' in marker:
            require(isinstance(marker.get('runner'), str)
                    and isinstance(marker.get('runnerSHA256'), str), 'Incomplete patch runner identity')
            runner_path, runner_sha = watch(marker['runner'], marker['runnerSHA256'])
            runner_evidence = {'path': relative(runner_path), 'sha256': runner_sha}
        video = video_stream(patch, e - s + 1, silent=True)
        timing = packet_timing(patch, e - s + 1)
        require(video.get('sample_aspect_ratio', '1:1') == base_video.get('sample_aspect_ratio', '1:1'),
                'Patch pixel aspect ratio differs')
        require(abs(timing['decodeStartSeconds'] - base_timing['decodeStartSeconds']) < 1e-9,
                'Patch decoder delay differs; render with the baseline B-frame configuration')
        patch_idr = idr_at(patch, 0)
        patches.append({'start': s, 'end': e, 'path': relative(patch), 'sha256': digest,
                        'marker': relative(marker_path), 'markerSHA256': marker_sha,
                        'sourceLock': patch_lock['path'], 'sourceLockSHA256': patch_lock['sha256'],
                        'sourceMatchesFinal': not patch_lock['changedSources'],
                        'handSourcesMatchFinal': not (set(patch_lock['changedSources']) & HAND_SOURCES),
                        'glpSourcesMatchFinal': not (set(patch_lock['changedSources']) & GLP_SOURCES),
                        'captionSourcesMatchFinal': not (set(patch_lock['changedSources']) & CAPTION_SOURCES),
                        'runner': runner_evidence,
                        'video': video, 'packetTiming': timing, 'firstIDR': patch_idr})
    def verify_supports(key, current_field):
        supports = plan.get(key, [])
        require(isinstance(supports, list), key + ' must be an array of inclusive ranges')
        has_older_sources = any(not patch[current_field] for patch in patches)
        require(not has_older_sources or supports,
                'Using older sources requires explicit ' + key + ' for coverage verification')
        for support in supports:
            require(isinstance(support, list) and len(support) == 2
                    and all(type(frame) is int for frame in support)
                    and 0 <= support[0] <= support[1] < FULL, 'Invalid ' + key + ' range')
            start, end = support
            cursor = start
            for patch in patches:
                if patch['end'] < cursor:
                    continue
                if patch['start'] > end or cursor > end:
                    break
                require(patch['start'] <= cursor, f'Unpatched {key} frame F{cursor}')
                require(patch[current_field], f'Older-source patch overlaps {key} at F{cursor}')
                cursor = min(end + 1, patch['end'] + 1)
            require(cursor > end, f'{key} coverage ends before F{end}')
        return supports

    hand_supports = verify_supports('handSupportFrames', 'handSourcesMatchFinal')
    glp_supports = verify_supports('glpSupportFrames', 'glpSourcesMatchFinal')
    caption_supports = verify_supports('captionSupportFrames', 'captionSourcesMatchFinal')
    if plan.get('result') is not None:
        result_path, _ = watch(plan['result'])
        result = json.loads(result_path.read_text(encoding='utf-8-sig'))
        require(result.get('complete') is True and result.get('sourceLockSHA256') == lock_sha
                and result.get('patches') == plan['patches'], 'Renderer completion result differs')
    cuts = sorted({0, FULL, *(p['start'] for p in patches), *(p['end'] + 1 for p in patches)})
    idrs = []
    keyframes = set(base_timing['keyframePresentationFrames'])
    for frame in cuts[:-1]:
        require(frame in keyframes, f'Baseline boundary F{frame} is not an actual keyframe')
        idrs.append(idr_at(base, frame))
    bounds = [(a, b - 1) for a, b in zip(cuts, cuts[1:])]
    state = {
        'planPath': relative(plan_path), 'planSHA256': watched[plan_path],
        'sourceLock': relative(lock_path), 'sourceLockSHA256': lock_sha,
        'sourceLockInventory': list(lock_inventory.values()), 'handSupportFrames': hand_supports,
        'glpSupportFrames': glp_supports,
        'captionSupportFrames': caption_supports,
        'baseSHA256': base_sha, 'masterSHA256': master_sha, 'baseVideo': base_video,
        'baseTiming': base_timing, 'boundaryIDRs': idrs, 'chapters': chapters,
        'patches': patches, 'bounds': bounds, 'cuts': cuts, 'watched': watched,
    }
    state['baseCache'] = cached_base_frames(state, watch)
    return state


def unchanged(state):
    for path, expected in state['watched'].items():
        require(sha(path) == expected, 'Input changed during composition: ' + str(path))


def compose(state, work, output):
    require(not work.exists(), 'Work directory already exists; retain evidence and use a new --work-dir')
    require(not output.exists(), 'V20 delivery already exists; it will not be overwritten')
    sidecar = output.with_suffix('.validation.json')
    require(not sidecar.exists(), 'V20 validation sidecar already exists')
    work.mkdir(parents=True)
    commands = []
    started = time.monotonic()

    def command(args, label):
        print(label, flush=True)
        commands.append({'label': label, 'command': args})
        return run(args, log=work / (label + '.stderr.log'))

    def hash_report(path):
        return {'path': relative(path), 'sha256': sha(path)}

    try:
        unchanged(state)
        write_new(work / 'input-lock.json', {
            'createdUTC': now(), 'files': [
                {'path': relative(p), 'sha256': h} for p, h in state['watched'].items()
            ],
        })
        split = FFMPEG + ['-i', str(BASE), '-map', '0:v:0', '-an', '-c:v', 'copy',
                          '-map_metadata', '-1', '-map_chapters', '-1',
                          '-avoid_negative_ts', 'disabled']
        internal_cuts = state['cuts'][1:-1]
        if internal_cuts:
            split += ['-f', 'segment', '-segment_frames', ','.join(map(str, internal_cuts)),
                      '-reset_timestamps', '1', '-segment_format', 'mp4',
                      '-segment_format_options',
                      f'movflags=+faststart+write_colr:video_track_timescale={TIMESCALE}:avoid_negative_ts=disabled',
                      str(work / 'base-%03d.mp4')]
        else:
            split += ['-video_track_timescale', str(TIMESCALE),
                      '-movflags', '+faststart+write_colr', str(work / 'base-000.mp4')]
        command(split, 'split-base-idr')

        base_hash_path = work / 'base-full.yuv.sha256'
        if state['baseCache'] is not None:
            print('Reuse authenticated full baseline framehash; every cached PTS was revalidated', flush=True)
            with CACHE.open('rb') as source, base_hash_path.open('xb') as destination:
                shutil.copyfileobj(source, destination)
            require(sha(base_hash_path) == state['baseCache']['evidence']['cacheSHA256'],
                    'Copied baseline framehash differs')
            expected = state['baseCache']['rows'].copy()
        else:
            print('Decode and hash all baseline frames', flush=True)
            expected = frame_hashes_parallel(BASE, base_hash_path, FULL, state['baseTiming']['keyframePresentationFrames'])
        patch_map = {(p['start'], p['end']): p for p in state['patches']}
        splits, segments, normalized_records, patch_reports = [], [], [], []
        for index, (s, e) in enumerate(state['bounds']):
            base_part = work / f'base-{index:03d}.mp4'
            count = e - s + 1
            video_stream(base_part, count, silent=True)
            timing = packet_timing(base_part, count)
            require(Fraction(probe(base_part)['streams'][0]['time_base']) == Fraction(1, TIMESCALE),
                    'Base segment time base differs')
            row = patch_map.get((s, e))
            splits.append({'start': s, 'end': e, 'path': relative(base_part),
                           'sha256': sha(base_part), 'packetTiming': timing,
                           'usedInComposition': row is None})
            if row is None:
                segments.append((base_part, s, e))
                continue

            source = safe(row['path'])
            patch_hash_path = work / f'patch-{s}-{e}.yuv.sha256'
            print(f'Decode and hash patch F{s}–F{e}', flush=True)
            patch_frames = frame_hashes_parallel(source, patch_hash_path, count, [0])
            expected[s:e + 1] = patch_frames
            patch_reports.append({'start': s, 'end': e, **hash_report(patch_hash_path)})
            normalized = work / f'patch-{s}-{e}.timescale{TIMESCALE}.mp4'
            command(FFMPEG + ['-i', str(source), '-map', '0:v:0', '-an', '-c:v', 'copy',
                '-map_metadata', '-1', '-map_chapters', '-1', '-avoid_negative_ts', 'disabled',
                '-video_track_timescale', str(TIMESCALE), '-movflags', '+faststart+write_colr',
                str(normalized)], f'normalize-patch-{s}')
            video_stream(normalized, count, silent=True)
            packet_timing(normalized, count)
            before_path = work / f'patch-{s}.original-packets.json'
            after_path = work / f'patch-{s}.normalized-packets.json'
            before = video_packets(source, before_path, count)
            after = video_packets(normalized, after_path, count)
            require(before == after, 'Patch normalization changed compressed payload or rational timing')
            normalized_records.append({'start': s, 'end': e, 'path': relative(normalized),
                'sha256': sha(normalized), 'reencoded': False,
                'allPayloadsAndPTSAndDTSMatched': True,
                'reports': [hash_report(before_path), hash_report(after_path)]})
            segments.append((normalized, s, e))

        # ffconcat durations are microseconds. Round absolute boundaries first so
        # many 1/30-second fragments cannot accumulate rounding drift.
        lines = ['ffconcat version 1.0']
        for file, s, e in segments:
            path = file.resolve().as_posix()
            require("'" not in path and '\n' not in path and '\r' not in path,
                    'Unsupported characters in concat path')
            us = round(Fraction((e + 1) * 1000000, FPS)) - round(Fraction(s * 1000000, FPS))
            lines += [f"file '{path}'", f'duration {us // 1000000}.{us % 1000000:06d}']
        concat = work / 'video.ffconcat'
        concat.write_text('\n'.join(lines) + '\n', encoding='utf8')
        silent = work / 'silent-spliced.mp4'
        command(FFMPEG + ['-f', 'concat', '-safe', '0', '-auto_convert', '1', '-i', str(concat),
            '-map', '0:v:0', '-an', '-c:v', 'copy', '-map_metadata', '-1', '-map_chapters', '-1',
            '-avoid_negative_ts', 'disabled', '-video_track_timescale', str(TIMESCALE),
            *COLOR, '-movflags', '+faststart+write_colr', str(silent)], 'concat-video-copy')
        video_stream(silent, FULL, silent=True)
        packet_timing(silent, FULL)
        silent_packet_path = work / 'silent-video-packets.json'
        silent_packets = video_packets(silent, silent_packet_path, FULL)

        candidate = work / 'V20.candidate.mp4'
        chapter_file = work / 'chapters.ffmetadata'
        write_chapters(chapter_file, state['chapters'])
        mux = FFMPEG + ['-i', str(silent), '-i', str(MASTER), '-f', 'ffmetadata', '-i', str(chapter_file),
            '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '2', '-map_chapters', '2',
            '-metadata', f'title={TITLE}', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
            '-ar', '48000', '-af', 'asetpts=PTS-STARTPTS', '-avoid_negative_ts', 'disabled',
            '-video_track_timescale', str(TIMESCALE), *COLOR,
            '-movflags', '+faststart+write_colr', str(candidate)]
        command(mux, 'full-master-aac-mux')
        # Fail metadata issues immediately, before the expensive full video scan.
        chapters = read_chapters(candidate)
        require(chapters == state['chapters'], 'Chapter titles or times changed')
        video = video_stream(candidate, FULL)
        final_timing = packet_timing(candidate, FULL)
        final_packet_path = work / 'final-video-packets.json'
        require(video_packets(candidate, final_packet_path, FULL) == silent_packets,
                'Final mux changed compressed video payload or timing')
        print('Decode all final frames and compare every absolute frame', flush=True)
        final_hash_path = work / 'final-composed.yuv.sha256'
        final_frames = frame_hashes_parallel(candidate, final_hash_path, FULL, state['baseTiming']['keyframePresentationFrames'])
        mismatch = next((i for i, (a, b) in enumerate(zip(final_frames, expected)) if a != b), None)
        require(mismatch is None, f'Final decoded pixel correspondence failed at F{mismatch}')

        metadata = probe(candidate)
        audios = [s for s in metadata['streams'] if s['codec_type'] == 'audio']
        extras = [s for s in metadata['streams'] if s['codec_type'] not in {'video', 'audio'}]
        require(len(audios) == 1 and all(s['codec_type'] == 'data'
                and s.get('codec_tag_string') == 'text' for s in extras), 'Unexpected final streams')
        audio = audios[0]
        require(audio['codec_name'] == 'aac' and int(audio['sample_rate']) == 48000
                and audio['channels'] == 2, 'Final audio format differs')
        require(abs(float(audio.get('start_time', 0))) <= 1 / 48000
                and abs(float(audio['duration']) - FULL / FPS) <= 1024 / 48000,
                'Final audio timing differs')
        print('Verify full-length AAC against master, including distributed lag search', flush=True)
        audio_comparison = verify_audio(candidate, MASTER, state['masterSHA256'])
        levels = loudness(candidate)
        require(float(levels['input_tp']) <= -1 and -17 <= float(levels['input_i']) <= -14,
                'AAC loudness/peak outside delivery range (−17…−14 LUFS, ≤−1 dBTP)')
        unchanged(state)
        patched_frames = sum(p['end'] - p['start'] + 1 for p in state['patches'])
        digest = sha(candidate)
        validation = {
            'finishedUTC': now(), 'seconds': time.monotonic() - started,
            'automaticChecksPass': True, 'fullDecodeSuccess': True, 'decodedFrames': FULL,
            'fps': FPS, 'output': relative(output), 'videoSHA256': digest,
            'baseline': relative(BASE), 'baseSHA256': state['baseSHA256'],
            'master': relative(MASTER), 'masterSHA256': state['masterSHA256'],
            'plan': state['planPath'], 'planSHA256': state['planSHA256'],
            'sourceLock': state['sourceLock'], 'sourceLockSHA256': state['sourceLockSHA256'],
            'sourceLockInventory': state['sourceLockInventory'],
            'handSupportFrames': state['handSupportFrames'], 'allHandSupportFramesUseFinalSources': True,
            'glpSupportFrames': state['glpSupportFrames'], 'allGLPSupportFramesUseFinalSources': True,
            'captionSupportFrames': state['captionSupportFrames'], 'allCaptionSupportFramesUseFinalSources': True,
            'singlePassRender': False, 'videoReencoded': False,
            'method': 'IDR-aligned video stream-copy composition; complete master encoded once to AAC',
            'video': video, 'audio': audio, 'packetTiming': final_timing,
            'boundaryIDRs': state['boundaryIDRs'], 'baseSegmentValidation': splits,
            'patches': state['patches'], 'patchTimebaseNormalization': normalized_records,
            'frameCorrespondence': {
                'allFramesMatched': True, 'totalFrames': FULL,
                'baseFramesMatched': FULL - patched_frames, 'patchFramesMatched': patched_frames,
                'decodedPresentationTimestampsExact': True, 'pixelFormat': 'yuv420p',
                'hash': 'sha256', 'base': hash_report(base_hash_path), 'patches': patch_reports,
                'baseCache': state['baseCache']['evidence'] if state['baseCache'] else None,
                'final': hash_report(final_hash_path),
                'method': 'Every final decoded frame equals its absolute baseline frame or local replacement frame; no sampling',
            },
            'videoCopyEvidence': {'allPayloadsAndPTSAndDTSMatched': True,
                'silent': hash_report(silent_packet_path), 'final': hash_report(final_packet_path)},
            'audioMux': {'command': mux, 'completeMasterEncodedOnce': True, 'videoCodec': 'copy',
                'audioCodec': 'aac', 'audioBitrate': '320k', 'trimmed': False,
                'padded': False, 'timeStretched': False},
            'audioComparison': audio_comparison, 'aacMeasurement': levels,
            'chaptersPreserved': True, 'chapterCount': CHAPTERS, 'chapters': chapters,
            'subjectiveVisualReviewCompleted': False, 'subjectiveAudioReviewCompleted': False,
        }
        write_new(work / 'commands.json', commands)
        write_new(work / 'validation.json', validation)
        unchanged(state)
        require(not output.exists() and not sidecar.exists(), 'Delivery appeared during verification')
        # Windows rename refuses to overwrite; the verified candidate moves on the
        # same project volume. No partially encoded file is published to delivery.
        candidate.rename(output)
        require(sha(output) == digest, 'Published output hash differs')
        write_new(sidecar, validation)
        write_new(work / 'published.json', {'finishedUTC': now(), 'output': relative(output),
            'videoSHA256': digest, 'validation': relative(sidecar), 'validationSHA256': sha(sidecar)})
        print(json.dumps({'success': True, 'output': relative(output), 'videoSHA256': digest,
                          'frames': FULL, 'chapters': CHAPTERS, 'allFramesMatched': True,
                          'zeroLagVerified': True, 'validation': relative(sidecar)}, ensure_ascii=False), flush=True)
    except BaseException as error:
        failure = work / 'failure.json'
        if not failure.exists():
            write_new(failure, {'failedUTC': now(), 'error': str(error), 'commands': commands,
                               'deliveryExists': output.exists()})
        raise


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--validate', action='store_true', help='Read-only preflight (default)')
    mode.add_argument('--compose', action='store_true', help='Build, verify, and publish a new V20 delivery')
    parser.add_argument('--plan', type=Path, default=PLAN)
    parser.add_argument('--work-dir', type=Path, default=WORK)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    work = safe(args.work_dir, exists=False)
    output = safe(args.output, exists=False)
    require(work.parent == ROOT / 'tmp' and work.name.startswith('v20-compose'),
            '--work-dir must be a direct tmp/v20-compose* directory')
    require(output.parent == ROOT / 'delivery' and output.suffix.lower() == '.mp4'
            and '_V20_' in output.name and output != BASE,
            '--output must be a new delivery/*_V20_*.mp4 file')
    state = preflight(args.plan)
    if args.compose:
        compose(state, work, output)
    else:
        unchanged(state)
        print(json.dumps({'validation': 'read-only-pass', 'plan': state['planPath'],
            'ranges': [[p['start'], p['end']] for p in state['patches']],
            'baseSHA256': state['baseSHA256'], 'masterSHA256': state['masterSHA256'],
            'frames': FULL, 'chapters': CHAPTERS, 'boundaryIDRs': state['boundaryIDRs']}, ensure_ascii=False))


if __name__ == '__main__':
    main()


