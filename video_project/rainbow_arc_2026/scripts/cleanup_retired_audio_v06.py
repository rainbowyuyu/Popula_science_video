"""Remove only verified V05 cache copies after the parent accepts the full film.

Default is a dry inventory. It does not touch original V05 assets, new V06
takes, raw/protected takes, archived long narration, or any mix stem.
"""
from pathlib import Path
import json, hashlib, argparse

ROOT=Path(__file__).resolve().parents[1]
PRIOR=ROOT.parent/'rainbow_arc_2026_v05'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    manifest=json.loads((ROOT/'public/audio/audio-manifest.json').read_text('utf8'))
    active={row['id'] for row in manifest['clips']}
    candidates=[]
    for directory in [ROOT/'public/audio',ROOT/'research/audio/raw',ROOT/'research/audio/takes']:
        for p in directory.iterdir():
            cid=p.name.split('-')[0].split('.')[0]
            retired=cid in {f'r{number:03d}' for number in range(42,47)} or cid.startswith('v5_')
            if not p.is_file() or not retired or cid in active:continue
            resolved=p.resolve();resolved.relative_to(ROOT.resolve())
            prior=PRIOR/p.relative_to(ROOT)
            identical=prior.exists() and sha(p)==sha(prior)
            candidates.append({'file':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,
                               'sha256':sha(p),'preservedOriginal':str(prior),
                               'originalVerifiedIdentical':identical})
    if args.apply:
        qa=json.loads((ROOT/'research/qa/audio-v06.json').read_text('utf8'))
        if not qa['technicalPassed']:raise SystemExit('Current audio technical QA has not passed')
        if any(not row['originalVerifiedIdentical'] for row in candidates):
            raise SystemExit('A candidate has no hash-identical original; nothing deleted')
        for row in candidates:(ROOT/row['file']).unlink()
    report={'applied':args.apply,'files':candidates,
            'candidateBytes':sum(row['bytes'] for row in candidates),
            'releasedBytes':sum(row['bytes'] for row in candidates) if args.apply else 0,
            'newTakesAndStemsPreserved':True,
            'fullFilmAcceptanceRequiredBeforeApply':True}
    out=ROOT/'research/audio'/('retired-cache-cleanup-v06.json' if args.apply else 'retired-cache-inventory-v06.json')
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
