"""Build a private, reproducible V16 render source archive after media QA."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'delivery'

def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

def main():
    frozen = json.loads((ROOT/'research/qa/v16/source-freeze.json').read_text('utf-8-sig'))
    files = {ROOT/name for name in frozen['files']}
    for name, expected in frozen['files'].items():
        assert digest(ROOT/name) == expected, f'Changed after source freeze: {name}'
    for name in ['ShanghaiTower_1080p_v16.mp4', 'ShanghaiTower_1080x1920_v16.mp4']:
        assert (OUT/name).is_file(), f'Final video missing: {name}'
    for folder in ['src', 'audio/music_source/samples', 'work/v16/vendor', 'research/qa/v16']:
        files.update(p for p in (ROOT/folder).rglob('*') if p.is_file())
    # Preserve solver inputs and verification evidence without duplicating the
    # multi-gigabyte intermediate CFD fields or archived development cases.
    for folder in ['scripts/physics', 'research/physics-v10/inputs', 'research/physics-v10/verification']:
        files.update(p for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in {'.py','.mjs','.json','.md'})
    for folder in ['work/v16/audio', 'work/v16/camera', 'work/v16/finishing']:
        files.update(p for p in (ROOT/folder).glob('*') if p.suffix in {'.py','.ts','.md','.json'})
    files.update(p for p in (ROOT/'work/v16/finishing').rglob('*') if p.is_file() and p.suffix in {'.json','.py','.cjs','.ts','.md','.framemd5','.ffconcat'})
    files.update(p for p in (ROOT/'work/v16/camera').rglob('*') if p.is_file() and p.suffix in {'.json','.ts','.py','.md','.jpg','.png'})
    for name in ['package.json','tsconfig.json','scripts/render-v16.mjs','scripts/renderer-options.mjs',
                 'scripts/build_tower.py','model/shanghai-tower.blend','delivery/README_V16.md','delivery/QA_V16.md','audio/acoustic_bank.py',
                 'research/sources.json','research/sources.md','research/model-source-parameters.json',
                 'research/visual-v4/source-manifest.json','research/visual-v3/polyhaven-license.html',
                 'docs/model-spec.md','docs/physics-equations.tex','docs/structural-evidence.md',
                 'docs/V10_CALCULATION_NOTES.md',
                 'research/physics-v10/README.md','research/physics-v10/EXPORT-INTERFACE.md',
                 'research/physics-v10/production-promotion.json',
                 'research/physics-v7/final-educational-cfd-acceptance.md',
                 'research/physics-v7/final-educational-cfd-acceptance.json',
                 'research/structural/source-manifest.json','research/structural/verified-parameters.json',
                 'docs/environment-physics-interface.md',
                 'work/v16/freeze-source.py','work/v16/package-delivery.py','work/v16/finalize-delivery.py','work/v16/cleanup-render-caches.py']:
        path=ROOT/name
        if path.is_file(): files.add(path)
    asset_names=['README.md','asset-acceptance.json','final-resource-review.json','blender-inspection.json',
                 'soil-cutaway-inspection.json','qwen-media-acceptance.json','qwen-video-task.json',
                 'lux3d-request.json','lux3d-quote.json','lux3d-delivery-spec.json','lux3d-delivery-state.json',
                 'inspect_lux3d_blender.py','build_soil_cutaway.py',
                 'riverfront-detail-v16.blend','soil-cutaway-rim-v16.blend']
    files.update(ROOT/'work/v16/assets'/name for name in asset_names)
    files.update(p for p in (ROOT/'work/v16/assets').glob('*') if p.is_file() and p.suffix in {'.py','.json','.md','.log'})
    for folder in ['work/v16/assets/previews', 'work/v16/assets/lux3d-delivery']:
        files.update(p for p in (ROOT/folder).rglob('*') if p.is_file())
    files.update(p for p in (ROOT/'work/v16/assets/soil-textures').glob('*') if p.is_file())
    files.update(p for p in (ROOT/'work/v16/assets/originals').glob('*') if p.is_file() and p.suffix in {'.glb','.mp4','.json'})
    opus=ROOT/'work/opus-runs/v16-camera-20261011-111435-bdbd7445'
    files.update(opus/name for name in ['prompt.md','response.md','response.partial.md','report.json'])
    archive=OUT/'ShanghaiTower_V16_source_private.zip'
    ordered=sorted(files,key=lambda p:p.relative_to(ROOT).as_posix())
    # Never include live service keys even in the private render handoff.
    for file in ordered:
        if file.suffix in {'.py','.ts','.tsx','.mjs','.js','.json','.md','.txt','.html','.log'}:
            if re.search(rb'\bsk-[A-Za-z0-9_.-]{24,}',file.read_bytes()):
                raise RuntimeError('Credential-shaped content excluded: '+file.relative_to(ROOT).as_posix())
    manifest={'version':'V16','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'purpose':'Private local render sources; licensed WaterPro adaptation is not open-source redistribution.',
              'nodeDependencies':'Exact versions in package.json; install locally, node_modules excluded.',
              'files':{p.relative_to(ROOT).as_posix():{'bytes':p.stat().st_size,'sha256':digest(p)} for p in ordered}}
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as bundle:
        for path in ordered: bundle.write(path,path.relative_to(ROOT).as_posix())
        bundle.writestr('V16-archive-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None, 'Archive CRC failed'
    report={'path':archive.relative_to(ROOT).as_posix(),'files':len(ordered),
            'bytes':archive.stat().st_size,'sha256':digest(archive),'crcCheck':'passed'}
    (ROOT/'research/qa/v16/source-archive.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__': main()
