"""Package only the active film; no shared dependencies, credentials or reference voice."""
from pathlib import Path
import json,hashlib,zipfile,re
R=Path(__file__).resolve().parents[1];D=R/'delivery'
files=set()
def add(p):
    p=R/p if isinstance(p,str) else p
    assert p.resolve().is_relative_to(R.resolve()) and not p.is_symlink()
    if p.is_dir():
        for f in p.rglob('*'):
            if f.is_file() and '__pycache__' not in f.parts and f.suffix not in ['.pyc','.tmp']:add(f)
    elif p.exists():files.add(p)
for p in ['README.md','package.json','package-lock.json','tsconfig.json','src/index-beso.tsx','src/beso','src/en/zju-paths.json','src/beso-story.json','src/beso-captions.json','public/beso-research','public/screens','public/generated','public/brand','public/audio/master.wav','public/audio/narration.wav','public/audio/music.wav','audio/takes','audio/asr','audio/music_source','research','output/cover-source-beso.png']:
    add(p)
for p in ['README.md','renderer-options.mjs','render_beso_film.mjs','voice.py','qc.py','finalize_audio.py','score.py','acoustic_bank.py','media_bridge.py','bridge_blueprint.py','render_bridge_frame.mjs','render_covers.py','build_beso_surface_assets.py','export_beso_paper_pages.py','export_zwind_visual_data.py','render_formula_assets.py','research_web.py','write_story.py','verify_delivery.py','document_audio.py','package_source.py']:
    add('scripts/'+p)
for f in (R/'audio/takes').glob('*.json'):
    d=json.loads(f.read_text('utf8'));add(d['raw']);add(d['processed'])
for f in D.iterdir():
    # The manifest describes the payload, never a prior copy of itself.
    if f.name!='source-package-manifest.json' and f.suffix in ['.md','.json','.srt']:add(f)
add('delivery/covers')
secret=re.compile(r'(?<![A-Za-z0-9])sk-[A-Za-z0-9_.-]{18,}')
records=[]
for p in sorted(files):
    if p.suffix in ['.py','.mjs','.ts','.tsx','.json','.md','.txt','.html']:
        if secret.search(p.read_text('utf8',errors='replace')):raise RuntimeError('Possible credential in '+str(p.relative_to(R)))
    records.append({'file':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
manifest={'files':records,'sourceRepositoryCopied':False,'apiSecretsIncluded':False,'referenceVoiceIncluded':False,'sharedNodeModulesIncluded':False}
(D/'source-package-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
dest=D/'AI-Engineer-源码与素材.zip'
with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=2) as z:
    for p in sorted(files):z.write(p,p.relative_to(R).as_posix())
    z.write(D/'source-package-manifest.json','delivery/source-package-manifest.json')
with zipfile.ZipFile(dest) as z:assert z.testzip() is None
print('Packaged',len(files),'files',dest.stat().st_size,'bytes',flush=True)
