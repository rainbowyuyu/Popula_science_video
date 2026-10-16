"""V15 self-contained recovery inventory and QA-gated ZIP; never cleans assets.

Default is a read-only source selection/hash/secret audit (reports only under
work/package-v15). --create requires --qa-approved and a current V15 final QA
JSON. Junctions are read through, recorded by their true resolved sources, and
materialized as ordinary files in the ZIP. No old version's selection code runs.
The ZIP is built/verified on D: first; optional delivery copy is space-checked.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, struct, sys, zipfile, zlib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / 'work/package-v15'
_OUTPUT_LOCATOR = Path(json.loads((ROOT/'work/output-root-v15.json').read_text('utf8'))['outputRoot'])
OUTPUT = (_OUTPUT_LOCATOR if _OUTPUT_LOCATOR.is_absolute() else ROOT/_OUTPUT_LOCATOR).resolve()
VISUAL = OUTPUT.parent
DELIVERY = OUTPUT/'delivery'
BASELINE = ROOT.parent / 'rainbow_arc_2026'
CHUNK = 4 * 1024 * 1024
BLOCK = {'.git', '.claude', '.codex', '.agents', 'node_modules', '__pycache__', 'cache', '.cache', 'bundle'}
TEXT = {'.json', '.md', '.txt', '.csv', '.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.svg', '.ps1', '.tex', '.srt', '.vtt', '.yaml', '.yml', '.jsonl'}
SECRET = [
 ('provider_key', re.compile(rb'(?<![A-Za-z0-9])sk-(?:sp-)?[A-Za-z0-9_.-]{24,}')),
 ('github_token', re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,})')),
 ('private_key', re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
 ('bearer_literal', re.compile(rb'\bBearer[ \t]+[A-Za-z0-9_.+/=-]{24,}')),
 ('signed_url', re.compile(rb'[?&](?:X-Amz-Signature|OSSAccessKeyId|Signature|access_token|api_key|token)=[A-Za-z0-9%_.+/=-]{12,}', re.I)),
]
ASSIGN = re.compile(rb'(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password)["\']?[ \t]*[:=][ \t]*["\']([^"\'\r\n]{8,})["\']', re.I)

def jd(value): return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode('utf8')
def load(path): return json.loads(Path(path).read_text('utf8'))
def safe_member(value):
    value=str(value).replace('\\','/'); p=PurePosixPath(value)
    if p.is_absolute() or '..' in p.parts or ':' in value or value!=p.as_posix() or any(x.casefold() in BLOCK or x.casefold().startswith('.env') for x in p.parts):
        raise RuntimeError('Unsafe archive member: '+value)
    if p.suffix.casefold() in {'.pyc','.pyo','.blend1','.tmp','.bak','.key','.pem','.log'}: raise RuntimeError('Forbidden archive suffix: '+value)
    return value

def scan(name, payload):
    for rule, pattern in SECRET:
        if pattern.search(payload): raise RuntimeError('Sensitive content rejected in '+name+' ['+rule+']; no matched value logged')
    for m in ASSIGN.finditer(payload):
        v=m.group(1).strip().lower()
        if v not in {b'redacted',b'undefined',b'placeholder',b'your_api_key',b'your-api-key',b'replace_me',b'not configured'} and not v.startswith((b'os.environ',b'process.env',b'env.',b'${')):
            raise RuntimeError('Sensitive assignment rejected in '+name+'; no matched value logged')
    if Path(name).suffix=='.json':
        obj=json.loads(payload)
        def walk(o):
            if isinstance(o,dict):
                for k,v in o.items():
                    # Symbolic credentialField and boolean persistence claims
                    # are provenance metadata, not credential material.
                    if re.fullmatch(r'(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password|authorization|credential)',k,re.I) and isinstance(v,str) and v.strip() and v.lower() not in {'redacted','placeholder','undefined'}:
                        raise RuntimeError('Sensitive JSON field rejected in '+name+'; value not logged')
                    walk(v)
            elif isinstance(o,list):
                for v in o: walk(v)
        walk(obj)

def digest(path):
    before=path.stat(); h=hashlib.sha256(); crc=0
    with path.open('rb') as f:
        for b in iter(lambda:f.read(CHUNK),b''): h.update(b); crc=zlib.crc32(b,crc)
    after=path.stat()
    if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns): raise RuntimeError('Source changed while hashing: '+path.name)
    return h.hexdigest(), f'{crc & 0xffffffff:08x}', after.st_size

def original_source(rel):
    """Current/restored member first, then actual earlier authoring records.

    Earlier locators remain provenance; selected members are ordinary portable
    copies and are never relabelled as newly authored V15 sources.
    """
    candidates=[ROOT/rel]+[ROOT.parent/name/rel for name in ['rainbow_arc_2026_v14','rainbow_arc_2026_v13','rainbow_arc_2026_v11','rainbow_arc_2026_v10','rainbow_arc_2026_v09','rainbow_arc_2026_v06','rainbow_arc_2026']]
    return next((p for p in candidates if p.exists()),ROOT/rel)

def source_graph():
    found=set(); todo=['src/index.tsx']
    while todo:
        rel=todo.pop()
        if rel in found: continue
        p=ROOT/rel
        if not p.is_file(): raise RuntimeError('Missing source import: '+rel)
        found.add(rel)
        if p.suffix not in {'.tsx','.ts','.js','.mjs'}: continue
        for target in re.findall(r'(?:from\s*|import\s*\()(["\'])(\.[^"\']+)\1',p.read_text('utf8')):
            q=p.parent/target[1]; options=[q] if q.suffix else [q.with_suffix(s) for s in ('.ts','.tsx','.js','.mjs','.json')]+[q/'index.ts',q/'index.tsx']
            f=next((x for x in options if x.is_file()),None)
            if f is None: raise RuntimeError('Unresolved import in '+rel+': '+target[1])
            todo.append(f.relative_to(ROOT).as_posix())
    if 'src/V11RainbowArcFilm.tsx' not in found: raise RuntimeError('Current V15 entry has changed; update inventory')
    return sorted(found)

def audio_source_records():
    """Select small original records, not the sample library or retired mixes.

    Restored archive members take precedence over their historical locators.
    Exact bytes are retained; current checks do not relabel historical listening
    or sample-audit scope as a new listening/full-library validation.
    """
    specs=[
        ('research/audio-v11/audio-v11-tail-repair.json','rainbow_arc_2026_v11','research/qa-v11/audio-v11-tail-repair.json','Historical-V11-final-master-and-narration-origin'),
        ('research/audio-v11/r041-clean-report.json','rainbow_arc_2026_v11','work/audio-v11/r041-clean-report.json','Historical-V11-replacement-take-mastering-record'),
        ('research/audio-v11/build_audio_v11.py','rainbow_arc_2026_v11','work/build_audio_v11.py','Historical-V11-master-authoring-recipe-not-active-render-code'),
        ('research/audio-v10/mix-report-v10.json','rainbow_arc_2026_v11','research/audio-v10/mix-report-v10.json','Historical-parent-mix-original-score-and-sample-license-record'),
        ('research/audio-v10/spectrum-music-events.json','rainbow_arc_2026_v11','research/audio-v10/spectrum-music-events.json','Historical-V10-actual-spectrum-arrangement-note-events'),
        ('research/music/composition-v06.json','rainbow_arc_2026_v06','research/music/composition-v06.json','Original-episode-composition-note-events-not-final-V15-timing'),
        ('research/music/music-history-entry-v06.json','rainbow_arc_2026_v06','research/music/music-history-entry-v06.json','Original-episode-composition-and-sample-origin-record'),
        ('research/music/LICENSE-AND-PROVENANCE.md','rainbow_arc_2026_v06','research/music/LICENSE-AND-PROVENANCE.md','Original-episode-music-authorship-and-license-note'),
        ('research/music/sample-integrity-v06.json','rainbow_arc_2026_v06','research/music/sample-integrity-v06.json','Historical-40-item-sample-integrity-record-not-new-library-audit'),
        ('research/music/samples/manifest.json','rainbow_arc_2026_v06','research/music/samples/manifest.json','Original-VSCO-source-commit-license-and-per-sample-hash-manifest'),
        ('research/music/samples/LICENSE','rainbow_arc_2026_v06','research/music/samples/LICENSE','Original-VSCO-CC0-license-text'),
        ('research/music/samples/README.md','rainbow_arc_2026_v06','research/music/samples/README.md','Original-VSCO-upstream-authorship-and-repository-note'),
        ('research/music/samples/Readme.txt','rainbow_arc_2026_v06','research/music/samples/Readme.txt','Original-VSCO-upstream-sample-library-note'),
    ]
    rows=[]
    for member,project,rel,role in specs:
        source=ROOT/member
        if not source.is_file():source=ROOT.parent/project/rel
        if not source.is_file():raise RuntimeError('Required original audio provenance missing: '+member)
        sha,crc,size=digest(source)
        rows.append({'member':safe_member(member),'source':source,'role':role,'sha256':sha,'bytes':size,'crc32':crc})
    by={r['member']:r for r in rows}
    tail=load(by['research/audio-v11/audio-v11-tail-repair.json']['source'])
    mix=load(by['research/audio-v10/mix-report-v10.json']['source'])
    sample_manifest=load(by['research/music/samples/manifest.json']['source'])
    historical_integrity=load(by['research/music/sample-integrity-v06.json']['source'])
    clean=load(by['research/audio-v11/r041-clean-report.json']['source'])
    composition=load(by['research/music/composition-v06.json']['source'])
    if tail.get('version')!='V11' or tail.get('replacedClip')!='r041' or tail.get('sampleRate')!=48000:
        raise RuntimeError('Unexpected original V11 master-origin record')
    for member,key in [('public/audio_v11/master-v11.wav','masterSHA256'),('public/audio_v11/narration-v11.wav','narrationSHA256')]:
        if digest(ROOT/member)[0]!=tail.get(key):raise RuntimeError('Current V15 audio is not the documented V11 origin: '+member)
    if clean.get('inputSha256')!=tail.get('sourceRawSHA256'):
        raise RuntimeError('V11 take mastering record does not bind the tail-repair source')
    if mix.get('version')!='V10' or mix.get('sampleLicense')!='CC0-1.0' or mix.get('reusedMixedMaster') is not False or mix.get('noMixedMasterLoop') is not True:
        raise RuntimeError('Unexpected original episode arrangement/license record')
    if sample_manifest.get('repository')!='https://github.com/sgossner/VSCO-2-CE' or sample_manifest.get('license')!='CC0-1.0' or historical_integrity.get('sourceCommit')!=sample_manifest.get('commit') or historical_integrity.get('allPassed') is not True:
        raise RuntimeError('Original sample-license manifest and historical integrity record disagree')
    if composition.get('reusedPriorMelody') is not False or not composition.get('events'):
        raise RuntimeError('Original episode note-event authorship record is incomplete')
    manifest_by={r['path']:r for r in sample_manifest.get('files',[])}
    integrity_by={r['path']:r for r in historical_integrity.get('filesChecked',[])}
    for filename in ['LICENSE','README.md','Readme.txt']:
        archived=by['research/music/samples/'+filename]
        original=manifest_by.get(filename,{})
        historical=integrity_by.get(filename,{})
        if archived['sha256']!=original.get('sha256') or archived['bytes']!=original.get('bytes') or archived['sha256']!=historical.get('sha256') or historical.get('passed') is not True:
            raise RuntimeError('Original upstream license/authorship bytes do not match recorded hashes: '+filename)
    if by['research/music/samples/LICENSE']['sha256']!=mix.get('sampleLicenseSHA256'):
        raise RuntimeError('Episode music report does not bind the original CC0 license')
    return rows,tail

def selection():
    selected={}; expected={}; runtime=set(); graph=source_graph(); transitions=load(ROOT/'src/transitions-v11.json')
    timeline=load(ROOT/'src/timeline.json')
    if timeline.get('timeUnit')!='seconds':raise RuntimeError('Unexpected source timeline time unit')
    to_frame=lambda seconds:int(seconds*timeline['fps']+.5)
    references_start=to_frame(next(s['start'] for s in timeline['scenes'] if s['id']=='references'))
    def bridge_start(bridge):
        anchor=bridge['anchor'];kind=anchor['kind']
        if kind=='frame':base=0
        elif kind=='scene':base=to_frame(next(s['start'] for s in timeline['scenes'] if s['id']==anchor['id']))
        elif kind=='clip':base=to_frame(next(c['start'] for c in timeline['clips'] if c['id']==anchor['id']))
        else:raise RuntimeError('Unrecognized closing bridge anchor')
        return base+anchor['offsetFrames']
    closing_candidates=[b for b in transitions['clips'] if b['id'].startswith('fountain_to_painted') and bridge_start(b)+b['frames']==references_start]
    if len(closing_candidates)>1:raise RuntimeError('Ambiguous closing bridge in actual V15 manifest')
    if len([b for b in transitions['clips'] if b['id'].startswith('fountain_to_painted')])!=len(closing_candidates):raise RuntimeError('Active closing bridge misses references endpoint')
    def add(member,role,source=None,required=True,sha=None):
        member=safe_member(member);logical=Path(source) if source else ROOT/member
        if not logical.is_file():
            if required:raise RuntimeError('Missing dependency: '+member)
            return
        real=logical.resolve(strict=True)
        if not (real.is_relative_to(ROOT.parent.resolve()) or real.is_relative_to(VISUAL.resolve())):
            raise RuntimeError('Source escaped accepted project/media roots: '+member)
        row={'member':member,'source':str(real),'logicalSource':str(logical.absolute()),'role':role}
        if member in selected and selected[member]['source']!=row['source']:
            # Ordinary published copies may refer to the same provider bytes;
            # retain the runtime locator instead of substituting a work path.
            if digest(Path(selected[member]['source']))[0]!=digest(real)[0]:raise RuntimeError('Conflicting dependency: '+member)
        else:selected[member]=row
        if sha:expected[member]=sha
    def tree(rel,role,source=None,required=True):
        base=Path(source) if source else ROOT/rel
        if not base.is_dir():
            if required:raise RuntimeError('Missing dependency tree: '+rel)
            return
        for p in sorted(base.rglob('*')):
            if p.is_file() and not any(x.casefold() in BLOCK for x in p.relative_to(base).parts) and p.suffix.casefold() not in {'.blend1','.pyc','.log','.tmp','.bak'}:
                add(rel+'/'+p.relative_to(base).as_posix(),role,p)
    # Only actual import closure enters the editable snapshot; inactive V11-V13
    # modules do not acquire fictional V15 status or unselected media dependencies.
    for rel in graph:add(rel,'V15-active-source-import-closure')
    tools=['package-v15.py','render-v15.mjs','finalize-audio-v15.mjs','audit-v15.mjs','audit-delivery-v15.py','audit-motion-content-v15.py','generate-art-v15.py','generate-art-video-v15.py','inspect-art-video-v15.py','build-fish-v15.py','build-environment-v15.py','prepare-tree-leaf-lod-v15.py','fetch-environment-sources-v15.py','refine-ground-maps-v15.py','build-gaussian-scene-v15.py','preview-gaussian-scene-v15.mjs','audit-gaussian-scene-v15.mjs']
    for rel in ['package.json','package-lock.json','tsconfig.json',*['scripts/'+x for x in tools]]:add(rel,'V15-build-or-audit-tool')
    for name in ['cleanup-v15-caches.py','render-contact-v15.py']:
        add('scripts/'+name,'Optional-current-V15-delivery-or-cleanup-helper',required=False)
    add('work/gaussian-preview-entry-v15.tsx','Explicit-V15-Gaussian-preview-tool-entry')
    for rel in graph:
        p=ROOT/rel
        if p.suffix not in {'.ts','.tsx','.js','.mjs'}:continue
        text=p.read_text('utf8')
        for _,asset in re.findall(r'staticFile\(\s*(["\'])([^"\']+)\1\s*\)',text):
            add('public/'+asset,'V15-actual-runtime-asset');runtime.add('public/'+asset)
        for expression in re.findall(r'staticFile\(\s*`([^`]+)`\s*\)',text):
            if '${' not in expression:
                add('public/'+expression,'V15-actual-runtime-asset');runtime.add('public/'+expression)
            elif expression.startswith('${layer.bridge.framePath}/frame_'):
                for b in transitions['clips']:
                    for i in range(1,b['frames']+1):
                        frame='public/'+b['framePath']+f'/frame_{i:04d}.jpg';add(frame,'V15-actual-Qwen-runtime-frame');runtime.add(frame)
            elif (rel=='src/TitlesV15.tsx'
                  and expression=="${closing.framePath}/frame_${String(closing.frames).padStart(4,'0')}.jpg"
                  and "bridgesV11.find(b=>b.id.startsWith('fountain_to_painted')&&bridgeStartV11(b)+b.frames===state.sceneStart)" in re.sub(r'\s+','',text)):
                closing=closing_candidates[0] if closing_candidates else None
                if closing:
                    frame='public/'+closing['framePath']+f"/frame_{closing['frames']:04d}.jpg"
                    add(frame,'V15-actual-closing-paper-compositing-image');runtime.add(frame)
            else:raise RuntimeError('Unclassified dynamic staticFile in '+rel)
    for rel in list(runtime):
        if not rel.endswith('.glb'):continue
        raw=(ROOT/rel).read_bytes()
        if raw[:4]!=b'glTF':raise RuntimeError('Invalid GLB: '+rel)
        n,kind=struct.unpack_from('<II',raw,12)
        if kind!=0x4e4f534a:raise RuntimeError('Missing GLB JSON: '+rel)
        document=json.loads(raw[20:20+n])
        for item in document.get('images',[])+document.get('buffers',[]):
            uri=item.get('uri','')
            if not uri or uri.startswith('data:'):continue
            if '://' in uri:raise RuntimeError('Remote GLB dependency: '+rel)
            add((Path(rel).parent/uri).as_posix(),'GLB-external-resource')
    # Resolve provenance from each ACTIVE frame directory. Retired padded
    # V12 drop frames do not enter this selection once the manifest changes.
    for b in transitions['clips']:
        frame_base=Path('public')/Path(b['framePath']).parent
        tree(frame_base.as_posix(),'Active-Qwen-source-provenance-and-runtime')
        prov=load(ROOT/frame_base/'provenance.json')
        if prov.get('taskId')!=b['taskId']:raise RuntimeError('Qwen task/provenance mismatch: '+b['id'])
        derivative=prov.get('frames') if isinstance(prov.get('frames'),list) else None
        if derivative and prov.get('source'):
            source_base=Path('public')/prov['source'];tree(source_base.as_posix(),'Original-Qwen-source-for-active-derivative')
            for r in derivative:
                expected[(frame_base/'frames'/f"frame_{r['frame']+1:04d}.jpg").as_posix()]=r['derivativeSHA256']
                expected[(source_base/'frames'/f"frame_{r['frame']+1:04d}.jpg").as_posix()]=r['sourceSHA256']
            prov=load(ROOT/source_base/'provenance.json')
        else:source_base=frame_base
        if prov.get('credentialsPersisted') is not False or len(prov.get('frameHashes',[]))!=b['frames']:
            raise RuntimeError('Qwen native-frame provenance incomplete: '+b['id'])
        for i,h in enumerate(prov['frameHashes'],1):expected[(source_base/'frames'/f'frame_{i:04d}.jpg').as_posix()]=h
        provider_candidates=[ROOT/source_base/'provider.mp4',OUTPUT/'work/qwen-v15/generated'/prov.get('id',b['id'])/'provider.mp4']
        version=prov.get('version','').lower()
        if version:
            provider_candidates.append(VISUAL/f'rainbow_arc_{version}/work/qwen-{version}/generated'/prov.get('id',b['id'])/'provider.mp4')
        provider=next((x for x in provider_candidates if x.is_file()),None)
        if provider is None:raise RuntimeError('Original provider video missing: '+b['id'])
        add((source_base/'provider.mp4').as_posix(),'Original-Qwen-provider-video',provider,sha=prov.get('providerSHA256'))
        for which in ['first','last']:
            reference=prov.get(which+'Reference',{})
            candidates=[ROOT/source_base/('reference-'+which+'.png')]
            if reference.get('file'):candidates.append(Path(reference['file']))
            ref=next((x for x in candidates if x.is_file()),None)
            if ref:add((source_base/('reference-'+which+'.png')).as_posix(),'Original-Qwen-matched-reference',ref,sha=reference.get('sha256'))
        acceptance=load(ROOT/frame_base/'visual-acceptance.json')
        for row in acceptance.get('contacts',[]):
            p=Path(row['file']).resolve(strict=True)
            if not p.is_relative_to((OUTPUT/'work/qwen-v15/generated').resolve()):
                raise RuntimeError('Qwen reviewed contact escaped the current original task tree')
            member='work/qwen-v15/generated/'+p.relative_to((OUTPUT/'work/qwen-v15/generated').resolve()).as_posix()
            add(member,'Exact-original-reviewed-Qwen-contact-evidence',p,sha=row['sha256'])
    # New V15 editable garden plus exact CC0 originals/materials and its
    # textured surface-splat derivative. Historical material names stay honest.
    tree('public/assets_v15/environment','Original-V15-Blender-garden-and-CC0-source-assets')
    environment=load(ROOT/'public/assets_v15/environment/provenance-v15.json')
    if environment.get('version')!='V15' or environment.get('authored') is not True or environment.get('notPhotogrammetry') is not True:raise RuntimeError('Current garden provenance is incomplete')
    for r in environment.get('files',[]):expected['public/assets_v15/environment/'+safe_member(r['file'])]=r['sha256']
    sources=load(ROOT/'public/assets_v15/environment/source-licenses-v15.json')
    if sources.get('version')!='V15':raise RuntimeError('V15 source licenses belong to another version')
    for asset in sources.get('assets',[]):
        if asset.get('license')!='CC0-1.0':raise RuntimeError('Unexpected new garden source license')
        for r in asset.get('files',[]):add(r['file'],'Exact-original-CC0-environment-source',sha=r['sha256'])
    ground_sources=load(ROOT/'public/assets_v15/environment/ground-map-provenance-v15.json')
    if ground_sources.get('version')!='V15':raise RuntimeError('Current garden ground-map provenance belongs to another version')
    for asset in ground_sources.get('assets',[]):
        if asset.get('license')!='CC0-1.0':raise RuntimeError('Unexpected ground-map source license')
        for r in asset.get('files',[]):
            add('public/assets_v15/environment/'+safe_member(r['file']),
                'Exact-original-CC0-ground-material-source',sha=r['sha256'])
    for rel in ['public/assets_v13/environment/sandstone_diffuse_v13.png','public/assets_v13/environment/provenance-v13.json','public/assets_v09/environment/textures/grass_ground_fresh_grade_v09.png']:
        add(rel,'Inherited-material-input-of-current-V15-garden')
    for rel in ['public/assets_v09/environment/source-models/fern_02','public/assets_v09/environment/source-models/grass_medium_01']:
        tree(rel,'Original-CC0-prototype-rebuild-input-of-current-V15-garden')
    tree('research/v15/environment','V15-environment-source-and-review-records')
    tree('public/assets_v15/gaussian','V15-authored-3D-Gaussian-source-and-metadata')
    splats=load(ROOT/'public/assets_v15/gaussian/rain-garden-v15.splats.json')
    if splats.get('version')!='V15' or splats.get('stride')!=16 or splats.get('physicalAuthority') is not False or splats.get('sourceGLB')!='public/assets_v15/environment/rain_garden_v15.glb':raise RuntimeError('Unexpected V15 Gaussian representation/source')
    expected['public/assets_v15/gaussian/rain-garden-v15.splats.bin']=splats['binarySHA256']
    expected[splats['sourceGLB']]=splats['sourceGLBSHA256']
    tree('public/assets_v15/brand','V15-logo-derivative-and-original-provenance')
    tree('public/assets_v15/characters/rainbow_fish_v15','V15-original-editable-twenty-bone-fish')
    fish=load(ROOT/'public/assets_v15/characters/rainbow_fish_v15/provenance.json')
    if fish.get('version')!='V15' or fish.get('boneCount')!=20 or fish.get('externalMeshOrTextures',[])!=[]:raise RuntimeError('Unexpected V15 original fish provenance')
    for r in fish.get('files',[]):
        add(r['file'],'V15-fish-frozen-authored-source-or-asset',sha=r['sha256'])
    expected['public/assets_v15/characters/rainbow_fish_v15/rainbow_fish_v15.glb']=fish.get('frozenGLBSHA256') or fish['glbSHA256']
    # Preserve license/provenance for reused environmental source materials,
    # without unconditionally importing the retired V09 environment mesh.
    for rel in ['public/assets_v09/environment/provenance-v09.json','public/assets_v08/macro/macro_leaf_raindrop_v08.blend','public/assets_v08/macro/provenance-v08.json','public/assets_v08/environment/provenance.json','public/assets_v08/environment/landscape-provenance.json','public/assets_v07/vendor-water/LICENSE.md','public/assets_v07/vendor-water/provenance.json']:
        add(rel,'Original-Blender-or-WaterPro-license')
    tree('public/assets_v08/environment/textures','Original-rebuild-materials')
    for rel in ['public/assets/lux3d/lux3d-delivery.json','public/assets/lux3d/extracted/3dgs/gaussian.ply','public/assets/lux3d/extracted/mesh/tex_mesh.glb','public/assets/lux3d/extracted/3dgs/gaussian-sampled.json']:
        add(rel,'Original-Lux3D-4040282-asset')
    if str(load(ROOT/'public/assets/lux3d/lux3d-delivery.json')['taskId'])!='4040282':raise RuntimeError('Unexpected original Lux3D task')
    tree('research/sources/fonts-v09','Font-license-and-original-source',original_source('research/sources/fonts-v09'))
    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf','research/sources/UBC_Practical_Meteorology_Ch22-Optics-v102.pdf','research/sources/metadata.json','research/sources/hashes.json','research/formulas/formula-snell.tex','research/formulas/formula-angle.tex']:
        add(rel,'Original-paper-textbook-or-LaTeX-source',original_source(rel))
    add('research/physics/check-optics.mjs','Deterministic-original-optics-tool')
    for rel in ['research/qwen-v15-shot-specs.json','research/qwen-v15-art-specs.json','research/qwen-v15-art-video-specs.json','research/qwen-v15-art-review.json','research/qwen-v15-story-continuity.json','research/qwen-v15-api-doc-check.json']:
        add(rel,'V15-actual-authoring-specification-or-source-record',required=False)
    add('research/qwen-v15-api.md','V15-actual-provider-reference-note',required=False)
    # Preserve original image-provider outputs, editable-cover assets and their
    # exact review records. They remain Qwen illustrations, not photographed
    # evidence; superseded image decisions are not rewritten as acceptance.
    tree('output-v15/work/qwen-art-v15/generated','V15-original-Qwen-still-provider-and-reference-records',OUTPUT/'work/qwen-art-v15/generated',required=False)
    if (DELIVERY/'covers/source-manifest-v15.json').is_file():
        cover_manifest=load(DELIVERY/'covers/source-manifest-v15.json')
        if cover_manifest.get('version')!='V15':raise RuntimeError('Unexpected cover-source version')
        tree('output-v15/delivery/covers','V15-four-ratio-independent-cover-artwork-and-editable-assets',DELIVERY/'covers')
        for rel,hash_ in cover_manifest.get('reproducibleSourceSHA256',{}).items():
            add(rel,'Exact-V15-cover-authoring-source',sha=hash_)
        for row in load(DELIVERY/'covers/layout-audit-v15.json'):
            add('output-v15/delivery/covers/'+safe_member(row['file']),'Exact-reviewed-V15-cover-JPEG',DELIVERY/'covers'/row['file'],sha=row['sha256'])
        for row in cover_manifest.get('artwork',[]):
            rel=safe_member(row['path'].replace('\\','/'))
            add(rel,'Exact-original-Qwen-cover-illustration',ROOT/rel,sha=row['sha256'])
            provenance=load(ROOT/row['provenanceFile'])
            if provenance.get('requestId')!=row.get('requestId') or provenance.get('derivativeSHA256')!=row['sha256']:
                raise RuntimeError('Qwen cover illustration identity/provenance mismatch')
        for row in cover_manifest.get('portableAssets',[]):
            add('output-v15/delivery/covers/'+safe_member(row['file']),'Exact-portable-cover-original-font-or-logo',DELIVERY/'covers'/row['file'],sha=row['sha256'])
    for name in ['build-environment-v09.py','build-environment-v08.py','build_macro_assets_v08.py','sample_gaussian_ply.py','build_formulas.py']:
        add('scripts/'+name,'Original-asset-authoring-tool')
    # All V15 submitted attempts are preserved, including rejected/incomplete
    # tasks; duplicate decoded work-frame caches are deliberately excluded.
    qwen_work=OUTPUT/'work/qwen-v15'
    spec_file=ROOT/'research/qwen-v15-art-video-specs.json'
    if not spec_file.is_file():spec_file=ROOT/'research/qwen-v15-shot-specs.json'
    spec=load(spec_file)
    if spec.get('version')!='V15':raise RuntimeError('Actual V15 generation specification is missing/stale')
    for shot in spec.get('shots',[]):
        task=qwen_work/'generated'/shot['id']
        for name in ['provenance.json','provider.mp4','reference-first.png','reference-last.png','visual-acceptance.json','contact.jpg','dense-contact.jpg','inspection-contact.jpg','exit-continuity-contact.jpg','inspection-evidence.json']:
            add('work/qwen-v15/generated/'+shot['id']+'/'+name,'V15-original-task-record-or-provider',task/name,required=False)
        for name in [shot.get('firstFile'),shot.get('lastFile')]:
            if name:add('work/qwen-v15/inputs/'+name,'V15-original-submitted-reference',qwen_work/'inputs'/name,required=False)
    # Preserve any superseded/new-ID V15 attempt even when it no longer occurs
    # in the current shot spec. Original FAIL decisions are not rewritten.
    generated_root=qwen_work/'generated'
    if generated_root.is_dir():
        for task in sorted(generated_root.iterdir()):
            if not task.is_dir():continue
            if not re.fullmatch(r'[a-z][a-z0-9_]{1,60}',task.name):raise RuntimeError('Unsafe Qwen attempt directory')
            for name in ['provenance.json','provider.mp4','reference-first.png','reference-last.png','visual-acceptance.json','contact.jpg','dense-contact.jpg','inspection-contact.jpg','exit-continuity-contact.jpg','inspection-evidence.json']:
                add('work/qwen-v15/generated/'+task.name+'/'+name,'V15-all-original-attempts-including-rejected',task/name,required=False)
            provenance_file=task/'provenance.json'
            if provenance_file.is_file():
                attempt=load(provenance_file)
                for which in ['first','last']:
                    reference=attempt.get(which+'Reference',{})
                    locator=reference.get('file')
                    if locator and Path(locator).is_file():add('work/qwen-v15/generated/'+task.name+'/reference-'+which+'.png','V15-original-submitted-reference',Path(locator),sha=reference.get('sha256'))
    for name in ['batch-latest.json','integration-fragment.json','credential-probe-latest.json']:
        add('work/qwen-v15/'+name,'V15-safe-task-batch-record',qwen_work/name,required=False)
    for run in sorted((ROOT/'work/opus-runs').glob('*v15*')):
        if run.is_dir():tree('work/opus-runs/'+run.name,'V15-external-Claude-attempt-with-reported-status')
    for prompt in sorted((ROOT/'work').glob('opus-*v15*.md')):
        add('work/'+prompt.name,'V15-original-Claude-prompt',prompt)
    audio_records,tail_origin=audio_source_records()
    for r in audio_records:add(r['member'],r['role'],r['source'],sha=r['sha256'])
    add('public/audio_v11/master-v11.wav','Actual-V15-final-master-audio',sha=tail_origin['masterSHA256'])
    add('public/audio_v11/narration-v11.wav','Unchanged-narration-source-stem',sha=tail_origin['narrationSHA256'])
    for clip in load(ROOT/'src/timeline.json')['clips']:
        if clip.get('audio'):add(clip['audio'],'Accepted-timeline-narration-clip',sha=clip.get('audioSHA256'))
    for rel in ['research/audio-v10/accepted-source-provenance-v10.json','research/audio-v10/source-identity-report.json','research/audio-v10/story-research-v10.md','research/audio-v10/story-source-access.json','public/audio_v10/audio-manifest-v10.json']:
        add(rel,'Historical-accepted-audio-or-story-source-provenance',original_source(rel))
    tree('research/release-v15','Fresh-V15-readable-scientific-reference-and-title-structure-research',required=False)
    for name in ['extract-release-reference-v15.py','write-release-documents-v15.py']:
        add('work/'+name,'Explicit-V15-release-support-authoring-tool',required=False)
    for name in ['彩虹为什么是弧形_V15.srt','V15制作说明.md','各平台发布文案_V15.md','V15来源与工具清单.md']:
        add('delivery/'+name,'Actual-V15-delivery-support',DELIVERY/name,required=False)
    # Keep current QA originals, including explicit FAIL/pending/pass1 records.
    # Final acceptance is separately gated to current movie/source hashes.
    qa_base=ROOT/'research/qa-v15'
    if qa_base.is_dir():
        for f in sorted(qa_base.rglob('*')):
            if f.is_file() and f.suffix.casefold() in {'.json','.md','.csv','.png','.jpg','.jpeg'}:
                add('research/qa-v15/'+f.relative_to(qa_base).as_posix(),'Current-V15-original-QA-record-or-reviewed-image',f)
    # Retired flow attempts are research evidence only. Preserve the exact
    # isolated processing script and copied contacts/provenance, without
    # accepting or packaging their derived raw-frame caches as runtime.
    flow_preservation=qa_base/'retired-flow-preservation-v15.json'
    if flow_preservation.is_file():
        flow_record=load(flow_preservation)
        if flow_record.get('activeRuntime') is not False or flow_record.get('rawDerivedFramesIncluded') is not False:
            raise RuntimeError('Retired optical-flow evidence must remain outside runtime')
        for row in flow_record.get('files',[]):
            member=safe_member(row['file'])
            if not member.startswith('research/qa-v15/retired-flow-attempts-v15/') or '/frames/' in member:
                raise RuntimeError('Unexpected retired flow evidence member')
            add(member,'Exact-retired-flow-processing-or-research-evidence-not-runtime',sha=row['sha256'])
    tree('research/qa-v15/optical-motion-previews','Explicit-bounded-silent-optical-preview-evidence',required=False)
    tree('research/qa-v15/camera-character-motion-v15','Explicit-three-two-second-peak-motion-preview-evidence',required=False)
    tree('research/qa-v15/root-preview-v15','Explicit-bounded-root-GPU-and-seam-preview-evidence',required=False)
    root_preview=qa_base/'root-preview-review-v15.json'
    if root_preview.is_file():
        for row in load(root_preview).get('records',[]):
            member=safe_member(row['file'])
            if not member.startswith('research/qa-v15/root-preview-v15/'):
                raise RuntimeError('Unexpected root preview evidence member')
            add(member,'Exact-root-reviewed-preview-bytes-not-final-film-approval',sha=row['sha256'])
    preservation=qa_base/'optical-preview-preservation-v15.json'
    if preservation.is_file():
        for row in load(preservation).get('records',[]):
            member=safe_member(row['preservedAssetFile'])
            if not member.startswith(('research/qa-v15/optical-still-reviews/','research/qa-v15/optical-motion-previews/')):
                raise RuntimeError('Unexpected preserved optical evidence member')
            add(member,'Exact-previously-reviewed-optical-preview-bytes',sha=row['sha256'])
    return selected,expected,graph,sorted(runtime)

def inventory():
    selected,expected,graph,runtime=selection(); rows=[]
    for member,row in sorted(selected.items()):
        p=Path(row['source']);sha,crc,size=digest(p)
        if member in expected and sha!=expected[member]: raise RuntimeError('Provenance hash mismatch: '+member)
        if p.suffix.casefold() in TEXT: scan(member,p.read_bytes())
        rows.append({**row,'sha256':sha,'crc32':crc,'bytes':size,'sensitiveScan':'passed' if p.suffix.casefold() in TEXT else 'binary-asset'})
    return {'version':'V15','status':'read-only-candidate-inventory','createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'project':str(ROOT),'scope':'Current active source import closure; exact active runtime dependency closure; active Qwen runtime and exact original provider/reference/task records; new V15 attempts; current master and narration with exact original V11 origin and small original composition/sample-license records; SRT; Blender/Lux originals; font/source/licenses. No sample-library WAVs, caches, credentials, unrelated inactive-version QA, node_modules, or retired renders.','sourceGraph':graph,'runtimeFiles':runtime,'activeTransitionSnapshot':load(ROOT/'src/transitions-v11.json'),'entries':rows,'fileCount':len(rows),'sourceBytes':sum(r['bytes'] for r in rows),'estimatedZipUpperBoundBytes':sum(r['bytes'] for r in rows)+len(rows)*1024,'mutatesOriginalSources':False,'cleansAnything':False}

def qwen_visual_gate(bridge,manifest_sha):
    """Every integrated provider shot needs its exact passing RAW review.

    Failed originals remain in the recovery inventory as historical attempts.
    V15 has no foreground-occlusion/composite exception to raw acceptance.
    """
    if bridge.get('requiresForegroundMist') is not None:
        raise RuntimeError('V15 does not permit a failed-provider foreground-mist exception: '+bridge['id'])
    base=ROOT/'public'/Path(bridge['framePath']).parent
    provenance=load(base/'provenance.json');approval=load(base/'visual-acceptance.json')
    provider_sha=provenance.get('providerSHA256')
    if provenance.get('status')!='processed' or not re.fullmatch(r'[0-9a-f]{64}',str(provider_sha or '')) or approval.get('providerSHA256')!=provider_sha:
        raise RuntimeError('Active Qwen provenance/raw acceptance does not bind its provider: '+bridge['id'])
    if approval.get('status')!='pass':raise RuntimeError('Active Qwen clip has no matching passing RAW visual acceptance: '+bridge['id'])
    if provenance.get('version')!='V15' or bridge.get('taskId')!=provenance.get('taskId'):
        raise RuntimeError('Active V15 transition must use its new matched V15 provider task: '+bridge['id'])
    if approval.get('id') not in {None,bridge['id']}:raise RuntimeError('Raw visual approval is for another Qwen shot')
    if approval.get('transitionManifestSHA256') is not None and approval['transitionManifestSHA256']!=manifest_sha:
        raise RuntimeError('Qwen raw approval has a stale transition-manifest binding')

def gate(qa_path,inv):
    qa=load(qa_path)
    if qa.get('version')!='V15' or qa.get('status')!='pass' or qa.get('passed') is not True or qa.get('errors')!=[] or qa.get('visualReviewApproved') is not True or qa.get('encodedFullDecodePassed') is not True:
        raise RuntimeError('Final V15 QA approval missing, visual review incomplete, or full decode not passed')
    video=DELIVERY/'彩虹为什么是弧形_V15_1080p.mp4'
    sha,crc,size=digest(video)
    if qa.get('videoSHA256')!=sha: raise RuntimeError('Final QA does not bind the current V15 MP4 hash')
    audit=load(ROOT/'research/qa-v15/audit-v15.json')
    audit_path=ROOT/'research/qa-v15/audit-v15.json'
    formal=ROOT/'research/qa-v15/delivery-qa-v15.json'
    if not formal.is_file() or digest(formal)[0]!=digest(Path(qa_path))[0]:raise RuntimeError('Approval must be the exact current formal V15 completed-delivery QA')
    if qa.get('sourceAudit',{}).get('sha256')!=digest(audit_path)[0]:raise RuntimeError('Final QA does not bind the current exact V15 source audit')
    if audit.get('version')!='V15' or audit.get('diagnosticOnly') is True or audit.get('passed') is not True or audit.get('errors')!=[]: raise RuntimeError('Current formal V15 source audit is not passing')
    for row in audit.get('sourceHashes',[]):
        if digest(ROOT/row['file'])[0]!=row['sha256']: raise RuntimeError('Source changed after V15 audit: '+row['file'])
    if not audit.get('sourceHashes'): raise RuntimeError('Source audit has no current source hashes')
    for row in audit.get('assets',{}).get('staticAssetHashes',[]):
        if digest(ROOT/row['file'])[0]!=row['sha256']:raise RuntimeError('Active input changed after source audit: '+row['file'])
    for name in ['彩虹为什么是弧形_V15.srt','V15制作说明.md']:
        if not (DELIVERY/name).is_file():raise RuntimeError('Final delivery support missing: '+name)
    release=load(ROOT/'research/release-v15/document-provenance-v15.json')
    if release.get('version')!='V15' or release.get('closingAcceptedActive') is not True or release.get('timelineSHA256')!=digest(ROOT/'src/timeline.json')[0] or release.get('transitionManifestSHA256')!=digest(ROOT/'src/transitions-v11.json')[0]:
        raise RuntimeError('Final V15 release documents do not bind current timeline/closing source')
    expected_documents={'V15制作说明.md','各平台发布文案_V15.md','V15来源与工具清单.md'}
    if {Path(row['file']).name for row in release.get('documents',[])}!=expected_documents:
        raise RuntimeError('Final release document set is incomplete')
    for row in release['documents']:
        if digest(DELIVERY/Path(row['file']).name)[0]!=row['sha256']:
            raise RuntimeError('Release prose changed without updating its provenance')
    if qa.get('audioMaster',{}).get('sha256')!=digest(ROOT/'public/audio_v11/master-v11.wav')[0]:raise RuntimeError('Final QA does not bind the actual audio master')
    manifest_path=ROOT/'src/transitions-v11.json'
    manifest_sha=digest(manifest_path)[0]
    for bridge in load(manifest_path)['clips']:
        qwen_visual_gate(bridge,manifest_sha)
    return {'path':str(video),'sha256':sha,'bytes':size,'crc32':crc,'qa':qa,'qaSource':str(Path(qa_path).resolve())}

def verify_zip(path,records):
    by={r['member']:r for r in records}
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or set(names)!=set(by): raise RuntimeError('ZIP member set differs from manifest')
        for info in z.infolist():
            safe_member(info.filename); r=by[info.filename]; h=hashlib.sha256(); crc=0; size=0
            with z.open(info) as f:
                for b in iter(lambda:f.read(CHUNK),b''): h.update(b);crc=zlib.crc32(b,crc);size+=len(b)
            if size!=r['bytes'] or h.hexdigest()!=r['sha256'] or f'{crc & 0xffffffff:08x}'!=r['crc32'] or info.CRC!=(crc & 0xffffffff): raise RuntimeError('ZIP hash/CRC verification failed: '+info.filename)
        if z.testzip() is not None: raise RuntimeError('ZIP CRC test failed')
    return {'memberCount':len(records),'allMemberSHA256Passed':True,'allMemberCRC32Passed':True,'testzipPassed':True}

def final_evidence_selection(acceptance):
    """Current actual final evidence, selected through exact file/hash bindings.

    Do not demand invented editorial/camera/optical V15 report names. The one
    formal final review plus all its current reviewed inputs is mandatory.
    Other original QA records retain their precise status and scope.
    """
    qa_dir=ROOT/'research/qa-v15'; selected=[];movie=acceptance['sha256']
    audit_sha=digest(qa_dir/'audit-v15.json')[0]
    render=load(qa_dir/'render-start-v15.json')
    if render.get('version')!='V15' or render.get('status')!='completed' or render.get('videoSHA256')!=movie or render.get('sourceAuditSHA256')!=audit_sha or Path(render.get('output','')).resolve()!=Path(acceptance['path']).resolve():
        raise RuntimeError('Actual completed render-start does not bind the final movie/source audit')
    selected.append(('research/qa-v15/render-start-v15.json',qa_dir/'render-start-v15.json'))
    bound=acceptance['qa'].get('visualReviewRecord',{})
    wanted=bound.get('file') or bound.get('path') or str(qa_dir/'final-visual-review-v15.json')
    review_path=Path(wanted)
    if not review_path.is_absolute():review_path=ROOT/review_path
    review_path=review_path.resolve(strict=True)
    if not review_path.is_relative_to(qa_dir.resolve()) or digest(review_path)[0]!=bound.get('sha256'):
        raise RuntimeError('Formal QA does not bind the actual current final visual review')
    review=load(review_path);video=review.get('video',{});video=video if isinstance(video,dict) else {}
    actual=review.get('videoSHA256') or review.get('finalVideo',{}).get('sha256') or video.get('sha256') or video.get('actualSHA256')
    if review.get('version')!='V15' or actual!=movie:raise RuntimeError('Final actual visual review binds a different video/version')
    if review.get('sourceAuditSHA256') is not None and review['sourceAuditSHA256']!=audit_sha:raise RuntimeError('Final visual review source binding is stale')
    selected.append((review_path.relative_to(ROOT).as_posix(),review_path))
    note=review_path.with_suffix('.md')
    if not note.is_file() or movie not in note.read_text('utf8'):raise RuntimeError('Final visual review note must identify the actual accepted movie')
    selected.append((note.relative_to(ROOT).as_posix(),note))
    support_path=qa_dir/'delivery-support-v15.json';support=load(support_path)
    if support.get('timelineSHA256')!=digest(ROOT/'src/timeline.json')[0] or support.get('srt',{}).get('sha256')!=digest(DELIVERY/'彩虹为什么是弧形_V15.srt')[0] or support.get('document',{}).get('sha256')!=digest(DELIVERY/'V15制作说明.md')[0] or support.get('actualMaster',{}).get('sha256')!=digest(ROOT/'public/audio_v11/master-v11.wav')[0]:
        raise RuntimeError('Actual final delivery-support inputs are stale')
    if support.get('targetVideo',{}).get('sha256')!=movie:raise RuntimeError('Delivery support does not bind actual final movie')
    selected.append(('research/qa-v15/delivery-support-v15.json',support_path))
    # Reviewed contact images are evidence, not proxies for normal-speed viewing.
    # Recursively validate hash-bearing file/path records in the formal review.
    def references(value):
        if isinstance(value,dict):
            name=value.get('file') or value.get('path');hash_=value.get('sha256') or value.get('actualSHA256')
            if name and hash_:
                p=Path(name)
                if not p.is_absolute():p=ROOT/p
                p=p.resolve(strict=True)
                if not (p.is_relative_to(ROOT.resolve()) or p.is_relative_to(OUTPUT.resolve())):raise RuntimeError('Reviewed evidence escaped current project/output')
                if digest(p)[0]!=hash_:raise RuntimeError('Reviewed evidence changed: '+p.name)
                if p.is_relative_to(ROOT.resolve()):selected.append((p.relative_to(ROOT).as_posix(),p))
                elif p.suffix.lower()!='.mp4':selected.append(('research/qa-v15/external-reviewed-evidence/'+p.name,p))
            for v in value.values():references(v)
        elif isinstance(value,list):
            for v in value:references(v)
    references(review)
    return list({member:(member,p) for member,p in selected}.values())

def create(inv,qa_path,copy_delivery):
    acceptance=gate(qa_path,inv); stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S'); archive=SCRATCH/f'rainbow_arc_V15_recovery_{stamp}.zip'; partial=archive.with_suffix('.zip.partial')
    if shutil.disk_usage(SCRATCH).free<inv['estimatedZipUpperBoundBytes']+256*1024*1024: raise RuntimeError('Insufficient D: scratch space for verified recovery ZIP')
    generated={};generated_sources={}
    def from_source(member,path):
        path=Path(path).resolve(strict=True);generated[member]=path.read_bytes();generated_sources[member]=str(path)
    original=(ROOT/'scripts/render-v15.mjs').read_text('utf8')
    old="const installed=path.resolve(root,'..','rainbow_arc_2026_v10','work','render-browser-v10','chrome-headless-shell.exe');"
    if old not in original: raise RuntimeError('Render browser dependency changed; update portable adaptation')
    portable=original.replace(old,"const installed=process.env.RAINBOW_BROWSER_EXECUTABLE || undefined;")
    generated['scripts/render-v15-portable.mjs']=portable.encode('utf8')
    generated['work/output-root-v15.json']=jd({'outputRoot':'output-v15','version':'V15','project':'.','restoredPortable':True})
    # Only the newly passing final delivery report is accepted. The previous
    # AAC synchronization FAIL is replaced in production before this runs and
    # must never be copied into this bundle as misleading "latest" evidence.
    final_report=load(ROOT/'research/qa-v15/delivery-qa-v15.json')
    if final_report.get('status')!='pass' or final_report.get('errors')!=[] or final_report.get('videoSHA256')!=acceptance['sha256']:
        raise RuntimeError('Formal completed-delivery QA is not a current passing report')
    for name in ['audit-v15.json','audit-v15.md','audio-finalization-v15.json','delivery-qa-v15.json','delivery-qa-v15.md','ffprobe-delivery-v15.json']:
        from_source('research/qa-v15/'+name,ROOT/'research/qa-v15'/name)
    for member,p in final_evidence_selection(acceptance):from_source(member,p)
    # This independent signal report may still say review-required. Preserve
    # that exact status; do not turn all-frame decode into aesthetic approval.
    motion_path=ROOT/'research/qa-v15/motion-content-film-v15.json'
    motion_csv=ROOT/'research/qa-v15/motion-content-film-v15.frames.csv'
    if motion_path.is_file():
        motion=load(motion_path)
        if motion.get('version')!='V15' or motion.get('video',{}).get('sha256')!=acceptance['sha256'] or not motion_csv.is_file() or motion.get('sample',{}).get('metricsCSVSHA256')!=digest(motion_csv)[0]:
            raise RuntimeError('Independent motion report/CSV is not bound to this final V15 video')
        from_source('research/qa-v15/'+motion_path.name,motion_path)
        from_source('research/qa-v15/'+motion_csv.name,motion_csv)
    elif motion_csv.is_file():
        raise RuntimeError('Independent motion CSV has no matching final JSON record')
    for name in ['audit-v15-render-start.json','visual-review-v15.md','final-visual-review-v15.md','editorial-v15.md','camera-character-v15.md','optical-art-v15.md','audit-tools-v15.md']:
        p=ROOT/'research/qa-v15'/name
        if p.is_file():from_source('research/qa-v15/'+name,p)
    for item in acceptance['qa'].get('contactSheets',[]):
        p=Path(item['file']).resolve(strict=True)
        if not p.is_relative_to((ROOT/'research/qa-v15').resolve()):raise RuntimeError('Final contact sheet escaped current QA directory')
        if digest(p)[0]!=item['sha256']:raise RuntimeError('Final contact sheet changed after QA')
        from_source(p.relative_to(ROOT).as_posix(),p)
    generated['research/qa-v15/final-approval-v15.json']=jd(acceptance['qa'])
    generated['RESTORE_V15.md']=('V15 private recovery bundle\n\nExtract into a new ordinary directory. No junctions are needed. Run npm ci, npm run check, then node scripts/render-v15-portable.mjs from the extracted root. Remotion may need its supported Chrome headless shell; optionally set RAINBOW_BROWSER_EXECUTABLE. The portable renderer writes output-v15. Original production source and exact active runtime media are preserved as ordinary archive files. Blender sources use D:/blender/blender.exe or your local installation.\n\nV15 retains the accepted V11 narration/master, uses the new V15 Blender garden, its authored textured 3-D Gaussian surface representation, original V15 twenty-bone pearl fish, adaptive user-logo derivative and new V15 optical modules, and selects Qwen provider/source/reference records from the actual active transition manifest. All V15 attempts and original acceptance decisions remain recorded. Every integrated Qwen clip must have passing RAW visual acceptance bound to its exact new V15 provider hash and task. Rejected originals remain rejected and are preserved as attempt records. No foreground-mist exception may integrate a failed provider shot. Failed Opus output is not claimed as integrated. Deterministic geometric rays/angles remain the scientific source. sourceGraph/runtimeFiles identify the exact active film and its portable media closure; reused source/material versions retain their original names and provenance. QA reports explicitly distinguish full automatic decode from sampled visual review and audio listening scope.\n\nCommercial WaterPro code and the personal voice make this a private local project recovery bundle. Original provenance paths are historical locators; archive paths provide portable copies. No original source is deleted or changed.\n').encode('utf8')
    generated['RESTORE_V15.md']+=('\nSmall original audio records preserve the exact V11 master/narration origin, tail-repair/mastering recipe, original episode composition and V10 arrangement, plus the VSCO source-commit/per-sample manifest, historical integrity record and exact CC0/license/readme bytes. The sample-library WAVs and retired mixes are excluded; render from the included final PCM master. The independent full-frame motion JSON/CSV, when present and bound to this video, retain their actual review-required status rather than asserting aesthetic approval.\n').encode('utf8')
    # Current QA may already have been selected during inventory. Write each
    # member once and reject any changed snapshot rather than duplicate ZIP names.
    inventory_by={r['member']:r for r in inv['entries']}
    for member in list(generated):
        if member in inventory_by:
            if hashlib.sha256(generated[member]).hexdigest()!=inventory_by[member]['sha256']:raise RuntimeError('Current evidence changed after inventory: '+member)
            del generated[member]
    records=[dict(r) for r in inv['entries']]
    for member,payload in generated.items():
        scan(member,payload);records.append({'member':member,'source':generated_sources.get(member),'role':'Current-final-QA-evidence' if member in generated_sources else 'Generated-portable-restoration-support','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'crc32':f'{zlib.crc32(payload)&0xffffffff:08x}'})
    manifest={**inv,'status':'QA-approved-recovery-manifest','acceptedVideo':{k:v for k,v in acceptance.items() if k!='qa'},'entries':records,'generatedFiles':sorted(generated),'currentQAOnly':True,'portableBrowserAdaptation':True}
    manifest_bytes=jd(manifest);scan('manifest-v15.json',manifest_bytes)
    ziprecords=records+[{'member':'manifest-v15.json','bytes':len(manifest_bytes),'sha256':hashlib.sha256(manifest_bytes).hexdigest(),'crc32':f'{zlib.crc32(manifest_bytes)&0xffffffff:08x}'}]
    with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
        for r in inv['entries']:
            # Hash every exact source again while streaming; fail if it changed
            # after selection without silently making a mismatched archive.
            h=hashlib.sha256();crc=0;size=0
            with Path(r['source']).open('rb') as f,z.open(r['member'],'w',force_zip64=True) as dest:
                for b in iter(lambda:f.read(CHUNK),b''):dest.write(b);h.update(b);crc=zlib.crc32(b,crc);size+=len(b)
            if h.hexdigest()!=r['sha256'] or size!=r['bytes'] or f'{crc&0xffffffff:08x}'!=r['crc32']:raise RuntimeError('Source changed during ZIP write: '+r['member'])
        for member,payload in generated.items():z.writestr(member,payload)
        z.writestr('manifest-v15.json',manifest_bytes)
    validation=verify_zip(partial,ziprecords);partial.rename(archive)
    (SCRATCH/'manifest-v15.json').write_bytes(manifest_bytes)
    result={'version':'V15','status':'verified','archive':str(archive),'sha256':digest(archive)[0],'bytes':archive.stat().st_size,'verification':validation,'deliveryCopy':None,'deletedFiles':0}
    if copy_delivery:
        if shutil.disk_usage(DELIVERY).free>archive.stat().st_size+512*1024*1024:
            target=DELIVERY/archive.name;shutil.copy2(archive,target)
            if digest(target)[0]!=result['sha256']:raise RuntimeError('Delivery ZIP copy hash mismatch')
            result['deliveryCopy']=str(target)
        else:result['deliveryCopySkipped']='Insufficient C: reserve; verified D: archive retained'
    (SCRATCH/'package-result-v15.json').write_bytes(jd(result));return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--create',action='store_true');p.add_argument('--qa-approved',action='store_true');p.add_argument('--qa',type=Path);p.add_argument('--copy-to-delivery',action='store_true');a=p.parse_args()
    if a.create and (not a.qa_approved or not a.qa):p.error('--create needs --qa-approved and --qa <current final approval JSON>')
    SCRATCH.mkdir(parents=True,exist_ok=True);inv=inventory();(SCRATCH/'candidate-inventory-v15.json').write_bytes(jd(inv))
    if a.create: result=create(inv,a.qa,a.copy_to_delivery)
    else: result={k:inv[k] for k in ['version','status','fileCount','sourceBytes','estimatedZipUpperBoundBytes','mutatesOriginalSources','cleansAnything']};result['inventory']=str(SCRATCH/'candidate-inventory-v15.json')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as e:print('PACKAGE_V15_REJECTED: '+str(e),file=sys.stderr);sys.exit(1)
