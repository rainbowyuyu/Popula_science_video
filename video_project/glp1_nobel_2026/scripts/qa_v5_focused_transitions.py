"""Extract dense final-encoded samples around high-speed and pose transitions.

No source changes or subjective pass decisions. Run after qa_final.py --revision v5.
"""
from pathlib import Path
import hashlib
import json
import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/qa/final-v5/focused-transitions'
VIDEO = ROOT / 'delivery/GLP1_V5_1080p.mp4'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def build_windows(tl):
    lookup = {c['id']: c for c in tl['clips']}
    specs = [
        ('resistance-return', 'h010', -45, 120),
        ('muscle-membrane-entry', 'h014', -45, 150),
        ('lcell-islet', 'h021', -90, 150),
        ('islet-receptor', 'h022', -90, 150),
        ('receptor-secretion', 'h023', -45, 180),
        ('statin-receptor-entry', 'h042', -90, 150),
        ('statin-receptor-return', 'h043', -45, 150),
        ('airway-entry', 'h058', -45, 150),
        ('cpap-opening', 'h059', -30, 180),
        ('measurement-entry', 'h066', -90, 210),
        ('measurement-exit', 'h068', -90, 210),
        ('clot-to-atrium', 'h073', -90, 150),
        ('atrial-anticoagulant', 'h074', -90, 180),
    ]
    windows = []
    # Densely inspect the repaired seated-person/static-organ visibility handoff
    # within the existing measurement window, without starting another extract.
    repair_frames = {'measurement-entry': list(range(18415, 18461, 5))}
    for name, clip, before, after in specs:
        center = lookup[clip]['start']
        extra = repair_frames.get(name, [])
        assert all(0 <= frame < tl['duration'] for frame in extra)
        frames = sorted(set(range(max(0, center + before), min(tl['duration'], center + after + 1), 15)) | set(extra))
        windows.append({'name': name, 'clipId': clip, 'frames': frames, 'stepSeconds': 15 / tl['fps'],
                        'additionalRepairFrames': extra})
    return windows


def main():
    qa = json.loads((OUT.parent / 'automatic-report.json').read_text(encoding='utf8'))
    assert qa['automaticChecksPass'] and qa['videoSHA256'] == sha(VIDEO)
    tl = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf8'))
    assert qa['timelineSHA256'] == sha(ROOT / 'src/timeline.json')
    windows = build_windows(tl)
    OUT.mkdir(parents=True, exist_ok=True)
    frames = sorted({f for w in windows for f in w['frames']})
    wanted = set(frames)
    capture = cv2.VideoCapture(str(VIDEO))
    n = 0
    while n <= frames[-1]:
        ok, bgr = capture.read()
        assert ok, f'Failed to decode frame {n}'
        if n in wanted:
            Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(OUT / f'frame-{n:06d}.jpg', quality=94)
        n += 1
    capture.release()
    font = ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf', 25)
    sheets = []
    for window in windows:
        for start in range(0, len(window['frames']), 8):
            subset = window['frames'][start:start + 8]
            canvas = Image.new('RGB', (1322, 70 + ((len(subset) + 1) // 2) * 408), '#f2eee7')
            draw = ImageDraw.Draw(canvas)
            spacing = ' | 0.5 s + repair frames' if window['additionalRepairFrames'] else ' | 0.5 s samples'
            draw.text((14, 13), 'FINAL MP4 | ' + window['name'] + spacing, font=font, fill='#29484a')
            for i, f in enumerate(subset):
                x, y = 14 + (i % 2) * 654, 64 + (i // 2) * 408
                with Image.open(OUT / f'frame-{f:06d}.jpg') as im:
                    canvas.paste(im.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
                draw.text((x, y + 365), f'F{f} | {f / tl["fps"]:.3f}s', font=font, fill='#29484a')
            path = OUT / f'{window["name"]}-{start // 8 + 1:02d}.jpg'
            canvas.save(path, quality=94)
            sheets.append(str(path.relative_to(ROOT)))
    assert sha(VIDEO) == qa['videoSHA256']
    report = {'videoSHA256': qa['videoSHA256'], 'timelineSHA256': qa['timelineSHA256'],
              'windows': windows, 'frames': frames, 'contactSheets': sheets,
              'subjectiveReviewCompleted': False,
              'scope': 'Half-second samples plus explicit repair frames from the actual final MP4; not continuous subjective playback.'}
    (OUT / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({'framesExtracted': len(frames), 'contactSheets': len(sheets)}), flush=True)


if __name__ == '__main__':
    main()
