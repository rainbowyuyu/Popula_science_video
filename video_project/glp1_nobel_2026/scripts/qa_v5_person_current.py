"""Extract CPU-only person/garment and anatomical-handoff samples from final V5.

Run after qa_final.py --revision v5. Each contact sheet has eight fixed slots.
No source or media edits; extraction never certifies motion or art quality.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'
TIMELINE = ROOT / 'src/timeline.json'
MAIN_QA = ROOT / 'research/qa/final-v5/automatic-report.json'
OUT = MAIN_QA.parent / 'person-current'

# Reference frames from the 25621-frame timeline. Offsets follow their clip
# anchors if a revised voice take changes earlier clip lengths.
SPECS = [
    ('opening-meal', 'h001', 12, [0, 120, 285, 420, 555],
     'Spoon contact, seated thigh coverage, chair clearance.'),
    ('opening-anatomy-handoff', 'h003', 565,
     [540, 565, 600, 640, 680, 700, 720, 760, 820, 857, 900, 980, 1080, 1137],
     'Seated person returns to atlas coordinates; organ reveal stays registered. '
     'No detached shorts survive the anatomy-only phase.'),
    ('meal-return-h012', 'h012', 3046,
     [2925, 2945, 2956, 2967, 2978, 2989, 3001, 3021],
     'Anatomy-to-meal return: camera widens before seated skin appears; '
     'no giant face enters, and the bowl close-up can settle normally.'),
    ('meal-return-h030', 'h030', 8418,
     [8290, 8310, 8324, 8338, 8352, 8366, 8379, 8399],
     'Later anatomy-to-meal return: body reveal follows sufficient camera '
     'clearance, with registered sitting pose and dining furniture.'),
    ('meal-return-h040', 'h040', 11294,
     [11351, 11371, 11378, 11385, 11392, 11399, 11406, 11426],
     'Meal-focus approach keeps the seated person at a readable size while '
     'the dining close-up is restored without an abrupt appearance.'),
    ('meal-return-h052', 'h052', 14560,
     [14514, 14534, 14544, 14550, 14560, 14568, 14587, 14607],
     'Kidney-to-meal return: skin waits for the camera to pull wide; no giant '
     'face/body crossover before the table and seated person settle.'),
    ('seat-to-walk', 'h013', 3317,
     [3270, 3317, 3350, 3390, 3430, 3470, 3510, 3550, 3592],
     'Pose continuity, waistband, leg openings, foot sliding.'),
    ('sit-stand-training', 'h016', 4147,
     [4110, 4147, 4180, 4220, 4260, 4300, 4340, 4380, 4437, 4470],
     'Hip hinge, cloth fit, knee silhouette, seated/standing handoff.'),
    ('measurement-anatomy-to-person', 'h066', 18487,
     [18380, 18400, 18410, 18415, 18420, 18425, 18430, 18435,
      18440, 18445, 18450, 18455, 18460, 18470, 18480, 18487],
     'Dense pre-entry samples: stationary anatomical kidney hands off to the '
     'same posed person; cuff, chair and torso do not register at separate positions.'),
    ('measurement-entry', 'h066', 18487,
     [18487, 18500, 18530, 18590, 18640, 18720, 18777, 18860, 19030, 19081],
     'Cuff fit, supported forearm, tube clearance, display framing.'),
    ('measurement-exit-to-anatomy', 'h068', 19081,
     [19030, 19080, 19081, 19082, 19100, 19130, 19170, 19220, 19300],
     'Measurement chair, cuff and wardrobe retire with the person before '
     'the pressure/arterial anatomy becomes dominant; no clothing remnant.'),
    ('later-walk', 'h079', 22187,
     [22130, 22187, 22220, 22260, 22300, 22340, 22420, 22477],
     'Walking leg/arm phase, feet, return to seated pose.'),
    ('weight-feedback-person', 'h083', 23253,
     [23253, 23300, 23350, 23400, 23460, 23543],
     'Waistband remains fitted through schematic adiposity change.'),
    ('meal-to-measurement', 'h086', 24096,
     [23960, 23991, 24000, 24015, 24030, 24045, 24060, 24075, 24090,
      24096, 24130, 24180, 24230, 24310, 24412, 24520, 24680],
     'Continuous seating/measurement pose and garment handoff.'),
    ('closing-measurement-to-anatomy', 'h088', 24680,
     [24660, 24679, 24680, 24681, 24700, 24740, 24780, 24820, 24880, 24940, 24986],
     'Closing person-to-torso handoff preserves body/organ registration; '
     'wardrobe clears the transparent anatomy without an isolated ring.'),
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    require(path.is_file(), f'Required input missing: {path}')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def file_state(path):
    status = path.stat()
    return {'bytes': status.st_size, 'mtimeNS': status.st_mtime_ns}


def clip_at(timeline, frame):
    return next((clip['id'] for clip in timeline['clips']
                 if clip['start'] <= frame < clip['end']), 'opening-or-coda')


def build_windows(timeline):
    lookup = {clip['id']: clip for clip in timeline['clips']}
    total = timeline['duration']
    windows = []
    for name, anchor, reference_start, reference_frames, purpose in SPECS:
        require(anchor in lookup, f'Missing person QA clip: {anchor}')
        start = lookup[anchor]['start']
        frames = [max(0, min(total - 1, start + frame - reference_start))
                  for frame in reference_frames]
        windows.append({'name': name, 'anchorClipId': anchor,
                        'anchorFrame': start, 'referenceAnchorFrame': reference_start,
                        'frames': sorted(set(frames)), 'purpose': purpose})
    return windows


def font(size):
    for path in ['C:/Windows/Fonts/NotoSansSC-VF.ttf',
                 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/arial.ttf']:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def make_contact(window, page, frames, timeline, video_sha):
    width, height, gap, header, label_height = 640, 360, 14, 96, 42
    canvas = Image.new('RGB', (gap + 2 * (width + gap),
                              header + gap + 4 * (height + label_height + gap)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 12), 'FINAL MP4 | ' + window['name'], font=font(28), fill='#29484a')
    draw.text((gap, 49), f'SHA {video_sha[:20]} | visual review pending | page {page}',
              font=font(21), fill='#29484a')
    for index, frame in enumerate(frames):
        x = gap + index % 2 * (width + gap)
        y = header + gap + index // 2 * (height + label_height + gap)
        with Image.open(OUT / 'frames' / f'frame-{frame:06d}.jpg') as image:
            canvas.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 4, y + height + 5),
                  f'F{frame} | {frame / timeline["fps"]:.3f}s | {clip_at(timeline, frame)}',
                  font=font(24), fill='#29484a')
    path = OUT / f'{window["name"]}-{page:02d}.jpg'
    canvas.save(path, quality=94, subsampling=0)
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path),
            'window': window['name'], 'frames': frames,
            'visualReviewStatus': 'pending'}


def main():
    started = datetime.now(timezone.utc).isoformat()
    qa = read_json(MAIN_QA)
    timeline = read_json(TIMELINE)
    require(VIDEO.is_file(), f'Final MP4 missing: {VIDEO}')
    qa_sha, timeline_sha, video_sha = sha(MAIN_QA), sha(TIMELINE), sha(VIDEO)
    initial_state = file_state(VIDEO)
    require(qa.get('automaticChecksPass') is True, 'Main final V5 QA has not passed.')
    require(qa.get('videoSHA256') == video_sha, 'Main QA video hash differs from final MP4.')
    require(qa.get('timelineSHA256') == timeline_sha, 'Main QA timeline hash is stale.')
    require(qa.get('videoBytes') == initial_state['bytes'], 'Main QA video byte count is stale.')
    require(qa.get('expected', {}).get('frames') == timeline['duration'],
            'Main QA frame count differs from timeline.')
    require(qa.get('measured', {}).get('fps') == timeline['fps'],
            'Main QA fps differs from timeline.')
    require(timeline['fps'] == 30, 'Person sample plan expects 30 fps.')
    ffmpeg = shutil.which('ffmpeg')
    require(ffmpeg, 'ffmpeg must be on PATH.')
    windows = build_windows(timeline)
    frames = sorted({frame for window in windows for frame in window['frames']})
    (OUT / 'frames').mkdir(parents=True, exist_ok=True)
    expression = '+'.join(f'eq(n\\,{frame})' for frame in frames)
    with tempfile.TemporaryDirectory(prefix='extract-', dir=OUT) as temporary:
        folder = Path(temporary)
        command = [ffmpeg, '-hide_banner', '-nostdin', '-xerror', '-hwaccel', 'none',
                   '-threads', '2', '-i', str(VIDEO), '-map', '0:v:0', '-an',
                   '-vf', f'select={expression}', '-fps_mode', 'vfr',
                   '-q:v', '2', '-threads', '2', '-frames:v', str(len(frames)),
                   '-start_number', '0', '-y', str(folder / 'selected-%06d.jpg')]
        process = subprocess.run(command, capture_output=True, text=True,
                                 encoding='utf-8', errors='replace')
        require(process.returncode == 0, 'CPU frame extraction failed: ' + process.stderr[-1600:])
        require(len(list(folder.glob('selected-*.jpg'))) == len(frames),
                'Decoded sample count does not match the person plan.')
        for index, frame in enumerate(frames):
            (folder / f'selected-{index:06d}.jpg').replace(OUT / 'frames' / f'frame-{frame:06d}.jpg')
    contacts = []
    for window in windows:
        for index in range(0, len(window['frames']), 8):
            contacts.append(make_contact(window, index // 8 + 1,
                                         window['frames'][index:index + 8], timeline, video_sha))
    require(file_state(VIDEO) == initial_state and sha(VIDEO) == video_sha,
            'Final video changed during extraction; do not review these samples.')
    require(sha(TIMELINE) == timeline_sha and sha(MAIN_QA) == qa_sha,
            'Timeline or main QA changed during extraction; do not review these samples.')
    report = {'startedAtUTC': started, 'finishedAtUTC': datetime.now(timezone.utc).isoformat(),
              'video': VIDEO.relative_to(ROOT).as_posix(), 'videoSHA256': video_sha,
              'videoBytes': initial_state['bytes'], 'timelineSHA256': timeline_sha,
              'automaticReportSHA256': qa_sha, 'fps': timeline['fps'],
              'durationFrames': timeline['duration'], 'windows': windows,
              'frames': [{'frame': frame, 'timeSeconds': frame / timeline['fps'],
                          'path': (OUT / 'frames' / f'frame-{frame:06d}.jpg').relative_to(ROOT).as_posix(),
                          'sha256': sha(OUT / 'frames' / f'frame-{frame:06d}.jpg')}
                         for frame in frames],
              'contactSheets': contacts, 'extractionCommand': command,
              'decodeHardwareAcceleration': 'none', 'subjectiveReviewCompleted': False,
              'scope': 'Selected final-encoded person/garment/measurement and '
                       'anatomical-handoff samples, with a dense measurement-entry window. '
                       'No art acceptance, continuous motion review or source render.'}
    (OUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'framesExtracted': len(frames), 'contactSheets': len(contacts),
                      'videoSHA256': video_sha, 'subjectiveReviewCompleted': False}), flush=True)


if __name__ == '__main__':
    main()
