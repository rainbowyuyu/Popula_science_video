"""Bind actually opened final-video QA images to their actual hashes."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'research/qa/final-v5/crossscale-audit/cd708646f4815878'
OBS = Path(__file__).with_name('visual-review-observations.json')

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def evidence(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'actuallyOpened': True}

def main():
    obs = json.loads(OBS.read_text(encoding='utf-8'))
    extraction = json.loads((OUT / 'extraction-complete.json').read_text(encoding='utf-8'))
    video = ROOT / 'delivery/GLP1_V5_1080p.mp4'
    assert sha(video) == extraction['videoSHA256'], 'Final video changed after extraction'
    contacts = [evidence(OUT / group / name) for group, names in obs.pop('contactSheetsOpened').items() for name in names]
    natives = [evidence(OUT / name) for name in obs.pop('nativeFramesOpened')]
    expected = {item['path']: item['sha256'] for item in extraction['contactSheets']}
    assert len(contacts) == 75 and len({x['path'] for x in contacts}) == 75
    assert {x['path']: x['sha256'] for x in contacts} == expected, 'Opened contact evidence differs from extractor locks'
    copied_auto = OUT / 'automatic-report.json'
    assert sha(copied_auto) == extraction['automaticReportSHA256']
    bound = {
        'reviewedAtUTC': datetime.now(timezone.utc).isoformat(),
        'video': video.relative_to(ROOT).as_posix(),
        'videoSHA256': extraction['videoSHA256'],
        'timelineSHA256': extraction['timelineSHA256'],
        'masterSHA256': extraction['masterSHA256'],
        'automaticReportSHA256': extraction['automaticReportSHA256'],
        'renderMarkerSHA256': extraction['renderMarkerSHA256'],
        'inputLocksAtExtraction': extraction['inputSHA256'],
        'automaticChecksPass': json.loads(copied_auto.read_text(encoding='utf-8'))['automaticChecksPass'],
        'evidenceManifestSHA256': {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in [OUT/'extraction-complete.json', OUT/'sampling-plan.json', OUT/'crossscale-current/manifest.json', OUT/'focused-transitions/manifest.json', OBS, Path(__file__)]},
        **obs,
        'contactSheetCount': len(contacts),
        'nativeFrameCount': len(natives),
        'contactSheetsActuallyOpened': contacts,
        'nativeFramesActuallyOpened': natives,
    }
    dest = OUT / 'visual-review.json'
    dest.write_text(json.dumps(bound, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'report': str(dest), 'sha256': sha(dest), 'contactsOpened':len(contacts), 'nativeFramesOpened':len(natives), 'globalVisualPass':False}))

if __name__ == '__main__':
    main()
