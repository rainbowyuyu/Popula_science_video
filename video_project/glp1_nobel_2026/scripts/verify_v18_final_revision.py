"""Verify final GLP/subtitle revisions without presenting older QA as a new scan.

Run only after compose_v18.py has published the complete final V18:
  python scripts/verify_v18_final_revision.py --work-dir tmp/v18-compose-release

The complete FINAL video receives fresh black/freeze detection. The composer's
authenticated complete framehash and full-audio checks are independently checked.
Older stills are reused only where every decoded pixel is unchanged; previous
GLP/subtitle stills are excluded. All four splice boundaries receive 12 consecutive
frames on each side plus new GLP/subtitle stills. No visual approval is made.
The existing technical.json is preserved byte-for-byte as technical-before-glp.json.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from compose_v18 import FULL, FPS, ROOT, OUTPUT, read_chapters, safe
from verify_idr_splice_v6 import require, sha

QA = ROOT / 'tmp/v18-qa'
TECHNICAL = QA / 'technical.json'
BACKUP = QA / 'technical-before-glp.json'
OLD_VIDEO = ROOT / 'tmp/v18-compose/V18.candidate.mp4'
OLD_HASH = ROOT / 'tmp/v18-compose/final-composed.yuv.sha256'
FREEZE_MEASUREMENTS = ROOT / 'tmp/v18-freeze-review/measurements.json'
FREEZE_REVIEW = ROOT / 'tmp/v18-freeze-review/review-report.md'
GLP_START, GLP_END = 6935, 8434
ALLOWED_RANGES = [(5500, 5749), (GLP_START, GLP_END)]
OLD_VIDEO_SHA = '6b079dc32f5f58a820b8964846bd263ea11438d35ada9dc4cb4d0d294aadfa9c'
OLD_HASH_SHA = 'a19bcb7ef330115f9c4262278d919ffde1c83be8d13ebdc66081b2ed7b445f9e'
OLD_TECHNICAL_SHA = '784e18aeaa21b9f318537c2db46203d1d3fe90c4d1932f29a8184541d9f7a561'
OLD_FREEZE_SHA = '72492deb2d7cb668b80c78ef6b1b8c5c59f08dab7ff1bf47477a2e91afe96811'
OLD_FREEZE_REVIEW_SHA = 'd064f0422d04548546526335cb07bf1bcf2aa73f1b73bc9a0479c73df42159a1'
DETECTION = 'blackdetect=d=0.10:pix_th=0.1:pic_th=0.98,freezedetect=n=-45dB:d=8'


def rel(path):
    return Path(path).relative_to(ROOT).as_posix()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_new(path, value):
    with Path(path).open('x', encoding='utf8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def evidence(path, expected=None):
    path = safe(path)
    digest = sha(path)
    require(expected is None or digest == expected, 'Evidence SHA256 differs: ' + str(path))
    return {'path': rel(path), 'sha256': digest, 'bytes': path.stat().st_size}


def frame_rows(path):
    text = Path(path).read_text(encoding='utf8')
    tb_match = re.search(r'#tb\s+0:\s+(\d+/\d+)', text)
    require(tb_match, 'Missing framehash time base: ' + str(path))
    tb = Fraction(tb_match.group(1))
    hashes = []
    for line in text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [value.strip() for value in line.split(',')]
        require(len(fields) == 6 and fields[0] == '0', 'Invalid framehash row')
        _dts, pts, duration, size = map(int, fields[1:5])
        require(pts * tb == Fraction(len(hashes), FPS) and duration * tb == Fraction(1, FPS),
                f'Framehash PTS/duration differs at F{len(hashes)}')
        require(size == 1920 * 1080 * 3 // 2 and re.fullmatch(r'[a-f0-9]{64}', fields[5]),
                'Invalid framehash YUV size/hash')
        hashes.append(fields[5])
    require(len(hashes) == FULL, 'Framehash total count differs')
    return hashes


def contiguous_ranges(frames):
    result = []
    for frame in frames:
        if result and frame == result[-1][1] + 1:
            result[-1][1] = frame
        else:
            result.append([frame, frame])
    return result


def revised(frame):
    return any(start <= frame <= end for start, end in ALLOWED_RANGES)


def execute(args, log, progress=None):
    result = subprocess.run(args, capture_output=True, encoding='utf8', errors='replace')
    Path(log).write_text(result.stderr, encoding='utf8')
    if progress is not None:
        Path(progress).write_text(result.stdout, encoding='utf8')
    require(result.returncode == 0, f'{args[0]} failed: {result.stderr[-3000:]}')
    return result


def freeze_intervals(log):
    events, pending = [], None
    for name, value in re.findall(r'lavfi\.freezedetect\.(freeze_start|freeze_duration|freeze_end):\s*([\d.]+)', log):
        if name == 'freeze_start':
            if pending is not None:
                events.append(pending)
            pending = {'startSeconds': float(value)}
        elif pending is not None and name == 'freeze_duration':
            pending['durationSeconds'] = float(value)
        elif pending is not None and name == 'freeze_end':
            pending['endSeconds'] = float(value)
            pending.setdefault('durationSeconds', pending['endSeconds'] - pending['startSeconds'])
            events.append(pending)
            pending = None
    if pending is not None:
        pending['endSeconds'] = FULL / FPS
        pending['durationSeconds'] = pending['endSeconds'] - pending['startSeconds']
        pending['continuesToEOF'] = True
        events.append(pending)
    return events


def make_sheet(frame_dir, frames, output, title):
    columns, tile_w, tile_h = 6, 320, 202
    rows = math.ceil(len(frames) / columns)
    canvas = Image.new('RGB', (columns * tile_w, rows * tile_h + 42), '#f0eeeb')
    draw = ImageDraw.Draw(canvas)
    font_path = Path('C:/Windows/Fonts/consola.ttf')
    font = ImageFont.truetype(str(font_path), 16) if font_path.exists() else ImageFont.load_default()
    draw.text((12, 10), title, font=font, fill='#252525')
    for index, frame in enumerate(frames):
        x, y = (index % columns) * tile_w, (index // columns) * tile_h + 42
        with Image.open(frame_dir / f'frame-{frame:05d}.jpeg') as source:
            thumb = source.convert('RGB')
            thumb.thumbnail((tile_w, 180))
            canvas.paste(thumb, (x, y))
        draw.text((x + 6, y + 181), f'F{frame}  {frame / FPS:.3f}s', font=font, fill='#252525')
    canvas.save(output, quality=94)
    return evidence(output)


def boundary_diagnostics(frame_dir, frames, boundary, hashes):
    arrays = []
    for frame in frames:
        with Image.open(frame_dir / f'frame-{frame:05d}.jpeg') as image:
            arrays.append(np.asarray(image.convert('L').resize((320, 180)), dtype=np.float64))
    rows = []
    for index in range(1, len(frames)):
        rows.append({'previousFrame': frames[index - 1], 'frame': frames[index],
                     'meanAbsoluteDifference255': float(np.mean(np.abs(arrays[index] - arrays[index - 1]))),
                     'decodedPixelsIdentical': hashes[frames[index]] == hashes[frames[index - 1]],
                     'isSplicePair': frames[index] == boundary})
    return {'boundaryFrame': boundary, 'frames': frames, 'beforeFrames': 12, 'afterFrames': 12,
            'adjacentPairs': rows,
            'metricLimit': 'Downscaled JPEG difference is diagnostic only; it is not an automatic aesthetic/continuity approval.',
            'subjectiveVisualReviewCompleted': False}


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, default=ROOT / 'tmp/v18-compose-release')
    parser.add_argument('--out', type=Path, default=QA / 'final-release')
    args = parser.parse_args()
    work = safe(args.work_dir, exists=False)
    out = safe(args.out, exists=False)
    require(work.parent == ROOT / 'tmp' and work.name.startswith('v18-compose'), 'Unexpected composer work directory')
    require(out.parent == QA and out.name.startswith(('final-glp', 'final-release')),
            'Evidence output must be tmp/v18-qa/final-release*')
    require(not out.exists(), 'Evidence output exists; preserve it and choose a new --out')

    video = safe(OUTPUT)
    validation_path = safe(video.with_suffix('.validation.json'))
    work_validation = safe(work / 'validation.json')
    validation = read(validation_path)
    require(validation == read(work_validation), 'Delivery and work validation reports differ')
    digest = sha(video)
    require(validation.get('videoSHA256') == digest and validation.get('automaticChecksPass') is True
            and validation.get('fullDecodeSuccess') is True and validation.get('decodedFrames') == FULL,
            'Final composition identity/decode evidence incomplete')
    correspondence = validation['frameCorrespondence']
    require(correspondence.get('allFramesMatched') is True and correspondence.get('totalFrames') == FULL
            and correspondence.get('decodedPresentationTimestampsExact') is True,
            'Final complete-frame correspondence evidence incomplete')
    require(validation['packetTiming'].get('allPresentationTimestampsExact') is True
            and validation['packetTiming'].get('allDecodeIntervalsExact') is True,
            'Final exact packet timing evidence incomplete')
    require(validation['audioComparison'].get('zeroLagVerified') is True
            and validation['audioComparison'].get('masterSHA256') == validation['masterSHA256']
            and sha(ROOT / validation['master']) == validation['masterSHA256'],
            'Final complete audio/master evidence incomplete')
    levels = validation['aacMeasurement']
    require(float(levels['input_tp']) <= -1 and -17 <= float(levels['input_i']) <= -14,
            'Final measured audio outside delivery targets')
    require(validation.get('chaptersPreserved') is True and validation.get('chapterCount') == 20
            and read_chapters(video) == validation['chapters'], 'Final chapter evidence differs')
    new_hash_path = safe(work / 'final-composed.yuv.sha256')
    require(safe(correspondence['final']['path']) == new_hash_path
            and sha(new_hash_path) == correspondence['final']['sha256'],
            'Final framehash is not the file authenticated by composition validation')

    source_technical_path = BACKUP if BACKUP.exists() else TECHNICAL
    source_technical_evidence = evidence(source_technical_path, OLD_TECHNICAL_SHA)
    old = read(source_technical_path)
    require(old.get('technicalPass') is True and old.get('fullDecode') is True
            and old.get('blackIntervals') == [] and old.get('videoSHA256') == OLD_VIDEO_SHA
            and safe(old['video']) == OLD_VIDEO and sha(OLD_VIDEO) == OLD_VIDEO_SHA,
            'Older candidate identity/full technical scan is not verified')
    old_hash_evidence = evidence(OLD_HASH, OLD_HASH_SHA)
    old_rows, new_rows = frame_rows(OLD_HASH), frame_rows(new_hash_path)
    changed = [frame for frame, (before, after) in enumerate(zip(old_rows, new_rows)) if before != after]
    require(changed and all(revised(frame) for frame in changed),
            'Final decoded changes are empty or escape F5500–F5749 / F6935–F8434')
    for start, end in ALLOWED_RANGES:
        require(any(p['start'] == start and p['end'] == end for p in validation['patches']),
                f'Final composition does not identify expected patch F{start}–F{end}')
    freeze_evidence = evidence(FREEZE_MEASUREMENTS, OLD_FREEZE_SHA)
    freeze_review_evidence = evidence(FREEZE_REVIEW, OLD_FREEZE_REVIEW_SHA)
    freeze_review = read(FREEZE_MEASUREMENTS)
    require(freeze_review['sourceSHA256'] == OLD_VIDEO_SHA and len(freeze_review['tests']) == 4,
            'Older freeze-review identity/count differs')
    for test in freeze_review['tests']:
        start, end = test['rangeFrames']
        require(not any(max(start, a) <= min(end, b) for a, b in ALLOWED_RANGES),
                'Older freeze review intersects a revised range')
        require(all(old_rows[frame] == new_rows[frame] for frame in range(start, end + 1)),
                'Freeze-review pixels changed')
    old_frames = old['extractedFrames']
    require(old_frames == sorted(set(old_frames)) and len(old_frames) == 491,
            'Unexpected older extracted-frame inventory')
    inherited_frames = [frame for frame in old_frames if not revised(frame)]
    discarded_glp_frames = [frame for frame in old_frames if GLP_START <= frame <= GLP_END]
    discarded_revision_frames = [frame for frame in old_frames if revised(frame)]

    # Preserve the exact original before updating technical.json; never rewrite it.
    if not BACKUP.exists():
        with source_technical_path.open('rb') as source, BACKUP.open('xb') as destination:
            shutil.copyfileobj(source, destination)
    require(sha(BACKUP) == OLD_TECHNICAL_SHA, 'Original technical backup differs')
    initial_technical_sha = sha(TECHNICAL)
    if initial_technical_sha != OLD_TECHNICAL_SHA:
        require(read(TECHNICAL).get('revisionVerifier') == 'v18-final-glp-revision',
                'Current technical report changed outside this verifier')
    out.mkdir(parents=True)
    try:
        inherited = []
        for frame in inherited_frames:
            image_path = safe(QA / f'frames/element-{frame:05d}.jpeg')
            inherited.append({'frame': frame, 'image': evidence(image_path),
                              'finalDecodedPixelSHA256': new_rows[frame],
                              'basis': 'Identical complete decoded YUV frame in old and final videos'})
        inherited_path = out / 'inherited-frame-evidence.json'
        write_new(inherited_path, {'oldSourceSHA256': OLD_VIDEO_SHA, 'finalVideoSHA256': digest,
            'originalExtractedCount': len(old_frames), 'inheritedCount': len(inherited),
            'excludedOldGLPFrames': discarded_glp_frames,
            'excludedOldRevisionFrames': discarded_revision_frames, 'frames': inherited,
            'scope': 'Existing extracted images retained; extraction alone is not a visual review pass.'})

        print('Fresh full-final-video black/freeze scan (includes all 1500 GLP frames)', flush=True)
        scan_command = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'info', '-xerror', '-nostats',
            '-i', str(video), '-map', '0:v:0', '-map', '0:a:0', '-vf', DETECTION,
            '-progress', 'pipe:1', '-f', 'null', '-']
        scan = execute(scan_command, out / 'final-full-detection.log', out / 'final-full-detection.progress.txt')
        counts = re.findall(r'^frame=(\d+)\s*$', scan.stdout, re.MULTILINE)
        require(counts and int(counts[-1]) == FULL and 'progress=end' in scan.stdout,
                'Fresh final-video scan did not complete all 26738 frames')
        black_lines = [line for line in scan.stderr.splitlines() if 'black_start:' in line]
        freeze_events = freeze_intervals(scan.stderr)
        inherited_freezes, unreviewed_freezes = [], []
        for event in freeze_events:
            match = next((test for test in freeze_review['tests']
                if abs(test['rangeSeconds'][0] - event['startSeconds']) <= 1 / FPS
                and abs(test['rangeSeconds'][1] - event['endSeconds']) <= 1 / FPS), None)
            if match is None:
                unreviewed_freezes.append(event)
            else:
                inherited_freezes.append({**event, 'reviewName': match['name'],
                    'classification': 'Previously reviewed low-average-motion explanation; exact pixels unchanged',
                    'reviewReport': freeze_review_evidence, 'measurements': freeze_evidence})

        boundary_sets = [(boundary, list(range(boundary - 12, boundary + 12)))
                         for start, end in ALLOWED_RANGES for boundary in [start, end + 1]]
        overview = sorted({GLP_START, GLP_END, *range(GLP_START, GLP_END + 1, 60),
                           7117, 7200, 7380, 7440, 7520, 7600, 7690, 7777, 7780,
                           7790, 7810, 7840, 7900, 8137, 8186, 8187, 8188, 8347})
        caption_frames = list(range(5676, 5684)) + list(range(8184, 8192))
        frames = sorted(set([frame for _, group in boundary_sets for frame in group]
                            + overview + caption_frames))
        frame_dir = out / 'frames'
        frame_dir.mkdir()
        filter_path = out / 'frame-filter.txt'
        filter_path.write_text("select='" + '+'.join(f'eq(n,{frame})' for frame in frames) + "'", encoding='utf8')
        print(f'Extract {len(frames)} final GLP/boundary frames; retain unchanged older stills', flush=True)
        extraction_command = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-n',
            '-i', str(video), '-map', '0:v:0', '-an', '-filter_script:v', str(filter_path),
            '-fps_mode', 'vfr', '-frames:v', str(len(frames)), '-q:v', '2', str(frame_dir / 'extract-%05d.jpeg')]
        execute(extraction_command, out / 'extract-final-frames.log')
        extracted = sorted(frame_dir.glob('extract-*.jpeg'))
        require(len(extracted) == len(frames), 'Final boundary/GLP extraction count differs')
        new_images = []
        for image, frame in zip(extracted, frames):
            target = frame_dir / f'frame-{frame:05d}.jpeg'
            image.rename(target)
            new_images.append({'frame': frame, 'image': evidence(target),
                               'decodedPixelSHA256': new_rows[frame], 'sourceVideoSHA256': digest})
        sheets = [make_sheet(frame_dir, group, out / f'boundary-{boundary}.jpg',
                            f'Splice F{boundary}: 12 frames before / 12 after')
                  for boundary, group in boundary_sets]
        sheets += [make_sheet(frame_dir, overview, out / 'glp-overview.jpg', 'Final encoded GLP sequence'),
                   make_sheet(frame_dir, caption_frames, out / 'caption-revisions.jpg',
                              'Final caption frames: h021 F5679 / h027 F8187')]
        boundary_data = [boundary_diagnostics(frame_dir, group, boundary, new_rows)
                         for boundary, group in boundary_sets]
        boundary_path = out / 'boundary-evidence.json'
        write_new(boundary_path, {'videoSHA256': digest, 'boundaries': boundary_data,
                                 'newImages': new_images, 'contactSheets': sheets})

        probe_command = ['ffprobe', '-v', 'error', '-show_streams', '-show_chapters',
                         '-show_format', '-of', 'json', str(video)]
        metadata = json.loads(execute(probe_command, out / 'probe.stderr.log').stdout)
        final_video = evidence(video, digest)
        final_validation = evidence(validation_path)
        final_hash = evidence(new_hash_path, correspondence['final']['sha256'])
        require(read(validation_path) == validation and read(work_validation) == validation,
                'Composition reports changed during QA')
        require(sha(OLD_VIDEO) == OLD_VIDEO_SHA and sha(OLD_HASH) == OLD_HASH_SHA
                and sha(BACKUP) == OLD_TECHNICAL_SHA, 'Inherited evidence changed during QA')
        proof = {
            'oldVideo': evidence(OLD_VIDEO, OLD_VIDEO_SHA), 'finalVideo': final_video,
            'oldFramehash': old_hash_evidence, 'finalFramehash': final_hash,
            'oldTechnical': evidence(BACKUP, OLD_TECHNICAL_SHA),
            'compositionValidation': final_validation,
            'comparedFrames': FULL, 'allowedChangeRanges': ALLOWED_RANGES,
            'changedFrameCount': len(changed), 'actualChangedRanges': contiguous_ranges(changed),
            'allChangesInsideAllowedRange': True,
            'outsideRangeFramesComparedAndPixelIdentical': FULL - sum(b - a + 1 for a, b in ALLOWED_RANGES),
            'allFramehashPTSAndDurationsExact': True,
        }
        proof_path = out / 'revision-correspondence.json'
        write_new(proof_path, proof)
        report = {
            'revisionVerifier': 'v18-final-glp-revision',
            'finishedUTC': datetime.now(timezone.utc).isoformat(),
            'video': str(video), 'videoSHA256': digest,
            'technicalPass': not black_lines, 'fullDecode': True,
            'fullDecodeProvenance': {
                'compositionValidation': final_validation, 'allFinalFramesHashedAndMatched': True,
                'freshDetectionDecode': {'video': final_video, 'frames': FULL,
                    'log': evidence(out / 'final-full-detection.log'),
                    'progress': evidence(out / 'final-full-detection.progress.txt')},
            },
            'blackIntervals': black_lines,
            'freezeEvents': freeze_events, 'freezeEventsRequireReview': unreviewed_freezes,
            'freezeEventsWithInheritedReview': inherited_freezes,
            'detectionScope': {
                'mode': 'fresh-full-final-video-scan', 'frames': [0, FULL - 1],
                'completeGLPPatchScanned': [GLP_START, GLP_END],
                'completeRevisionRangesScanned': ALLOWED_RANGES,
                'filters': DETECTION, 'command': scan_command,
                'oldDetectionResultsUsedAsNewScan': False,
                'note': 'Final full-film detection was rerun; only pixel-identical existing stills and matching freeze interpretations are inherited.',
            },
            'probe': metadata, 'compositionValidation': final_validation,
            'packetTiming': validation['packetTiming'], 'audioComparison': validation['audioComparison'],
            'aacMeasurement': levels, 'chapters': validation['chapters'], 'chapterCount': 20,
            'revisionCorrespondence': evidence(proof_path),
            'extractedFrames': frames, 'newlyExtractedFrames': frames,
            'inheritedExtractedFrames': inherited_frames,
            'combinedAvailableFrameEvidence': sorted(set(frames + inherited_frames)),
            'inheritedFrameEvidence': evidence(inherited_path),
            'excludedOldGLPFrames': discarded_glp_frames,
            'excludedOldRevisionFrames': discarded_revision_frames,
            'inheritedFreezeReview': {'sourceVideoSHA256': OLD_VIDEO_SHA,
                'measurements': freeze_evidence, 'review': freeze_review_evidence,
                'allFourReviewedRangesPixelIdentical': True},
            'boundaryEvidence': evidence(boundary_path), 'contactSheets': sheets,
            'visualReview': 'Pending final reviewer approval; inherited stills and extracted frames are not an automatic aesthetic pass. Review any new freeze flags and the new GLP/boundary sheets.',
            'subjectiveFullAudioListening': False, 'manualFullFilmPlayback': False,
            'inheritedMetadataLimit': 'The old technical report had empty chapter titles; no old chapter metadata is inherited. Final chapter titles/times come from the successful final composition and fresh probe.',
        }
        report_path = out / 'technical-final.json'
        write_new(report_path, report)
        require(sha(TECHNICAL) == initial_technical_sha, 'technical.json changed while this revision QA was running')
        staged = QA / ('.technical-' + out.name + '.staged.json')
        require(not staged.exists(), 'Stale technical staging file exists')
        with report_path.open('rb') as source, staged.open('xb') as destination:
            shutil.copyfileobj(source, destination)
        os.replace(staged, TECHNICAL)
        require(sha(TECHNICAL) == sha(report_path), 'Published technical report differs')
        print(json.dumps({'technicalPass': report['technicalPass'], 'videoSHA256': digest,
            'changedFrames': len(changed), 'allowedChangeRanges': ALLOWED_RANGES,
            'newExtractedFrames': len(frames), 'inheritedExtractedFrames': len(inherited_frames),
            'blackIntervals': len(black_lines), 'unreviewedFreezeEvents': len(unreviewed_freezes),
            'technical': rel(TECHNICAL), 'preservedOriginal': rel(BACKUP),
            'boundarySheets': [item['path'] for item in sheets[:4]],
            'visualApprovalGranted': False}, ensure_ascii=False), flush=True)
        if black_lines:
            raise RuntimeError('Unexpected black interval in final film; technicalPass is false')
    except BaseException as error:
        failure = out / 'failure.json'
        if not failure.exists():
            write_new(failure, {'failedUTC': datetime.now(timezone.utc).isoformat(), 'error': str(error),
                               'originalTechnicalPreserved': rel(BACKUP)})
        raise


if __name__ == '__main__':
    main()
