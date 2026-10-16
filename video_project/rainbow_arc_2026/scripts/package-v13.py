"""V13 self-contained recovery inventory and QA-gated ZIP; never cleans assets.

Default is a read-only source selection/hash/secret audit (reports only under
work/package-v13). --create requires --qa-approved and a current V13 final QA
JSON. Junctions are read through, recorded by their true resolved sources, and
materialized as ordinary files in the ZIP. No old version's selection code runs.
The ZIP is built/verified on D: first; optional delivery copy is space-checked.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, struct, sys, zipfile, zlib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / 'work/package-v13'
OUTPUT = Path(json.loads((ROOT/'work/output-root-v13.json').read_text('utf8'))['outputRoot']).resolve()
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
    if 'src/V11RainbowArcFilm.tsx' not in found: raise RuntimeError('Current V13 entry has changed; update inventory')
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
        ('research/music/composition-v06.json','rainbow_arc_2026_v06','research/music/composition-v06.json','Original-episode-composition-note-events-not-final-V13-timing'),
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
        if digest(ROOT/member)[0]!=tail.get(key):raise RuntimeError('Current V13 audio is not the documented V11 origin: '+member)
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
    tree('src','V13-current-source-snapshot')
    tools=['package-v13.py','render-v13.mjs','finalize-audio-v13.mjs','audit-v13.mjs','audit-delivery-v13.py','audit-motion-content-v13.py','audit-editorial-v13.mjs','audit-optical-art-v13.mjs','build-environment-v13.py','generate-qwen-v13.py','cleanup-v13-caches.py']
    for rel in ['package.json','package-lock.json','tsconfig.json',*['scripts/'+x for x in tools]]:add(rel,'V13-build-or-audit-tool')
    for rel in graph:
        p=ROOT/rel
        if p.suffix not in {'.ts','.tsx','.js','.mjs'}:continue
        text=p.read_text('utf8')
        for _,asset in re.findall(r'staticFile\(\s*(["\'])([^"\']+)\1\s*\)',text):
            add('public/'+asset,'V13-actual-runtime-asset');runtime.add('public/'+asset)
        for expression in re.findall(r'staticFile\(\s*`([^`]+)`\s*\)',text):
            if '${' not in expression:
                add('public/'+expression,'V13-actual-runtime-asset');runtime.add('public/'+expression)
            elif expression.startswith('${layer.bridge.framePath}/frame_'):
                for b in transitions['clips']:
                    for i in range(1,b['frames']+1):
                        frame='public/'+b['framePath']+f'/frame_{i:04d}.jpg';add(frame,'V13-actual-Qwen-runtime-frame');runtime.add(frame)
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
        provider_candidates=[ROOT/source_base/'provider.mp4']
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
    tree('public/assets_v13/environment','V13-original-editable-Blender-environment')
    environment=load(ROOT/'public/assets_v13/environment/provenance-v13.json')
    for r in environment.get('files',[]):expected['public/assets_v13/environment/'+r['file']]=r['sha256']
    add('public/assets_v09/environment/rain_after_terrace_v09.glb','Original-explicit-input-of-V13-Blender-authoring-script')
    tree('public/assets_v11/characters/rainbow_fish_v11','Original-editable-fish-rig-and-provenance')
    # Preserve license/provenance for reused environmental source materials,
    # without unconditionally importing the retired V09 environment mesh.
    for rel in ['public/assets_v09/environment/provenance-v09.json','public/assets_v08/macro/macro_leaf_raindrop_v08.blend','public/assets_v08/macro/provenance-v08.json','public/assets_v08/environment/provenance.json','public/assets_v08/environment/landscape-provenance.json','public/assets_v07/vendor-water/LICENSE.md','public/assets_v07/vendor-water/provenance.json']:
        add(rel,'Original-Blender-or-WaterPro-license')
    tree('public/assets_v08/environment/textures','Original-rebuild-materials')
    for rel in ['public/assets/lux3d/lux3d-delivery.json','public/assets/lux3d/extracted/3dgs/gaussian.ply','public/assets/lux3d/extracted/mesh/tex_mesh.glb','public/assets/lux3d/extracted/3dgs/gaussian-sampled.json']:
        add(rel,'Original-Lux3D-4040282-asset')
    if str(load(ROOT/'public/assets/lux3d/lux3d-delivery.json')['taskId'])!='4040282':raise RuntimeError('Unexpected original Lux3D task')
    tree('research/sources/fonts-v09','Font-license-and-original-source')
    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf','research/sources/UBC_Practical_Meteorology_Ch22-Optics-v102.pdf','research/sources/metadata.json','research/sources/hashes.json','research/formulas/formula-snell.tex','research/formulas/formula-angle.tex']:
        add(rel,'Original-paper-textbook-or-LaTeX-source',(ROOT/rel) if (ROOT/rel).is_file() else BASELINE/rel)
    for rel in ['research/qwen-v13-shot-specs.json','research/qwen-v13-api.md','research/physics/check-optics.mjs']:
        add(rel,'V13-authoring-provenance-or-optics-tool')
    for name in ['build-fish-v11.py','build-environment-v09.py','build-environment-v08.py','build_macro_assets_v08.py','sample_gaussian_ply.py','build_formulas.py']:
        add('scripts/'+name,'Original-asset-authoring-tool')
    # All V13 submitted attempts are preserved, including rejected/incomplete
    # tasks; duplicate decoded work-frame caches are deliberately excluded.
    qwen_work=OUTPUT/'work/qwen-v13'
    for shot in load(ROOT/'research/qwen-v13-shot-specs.json').get('shots',[]):
        task=qwen_work/'generated'/shot['id']
        for name in ['provenance.json','provider.mp4','reference-first.png','reference-last.png','visual-acceptance.json','composite-acceptance-v13.json','contact.jpg']:
            add('work/qwen-v13/generated/'+shot['id']+'/'+name,'V13-original-task-record-or-provider',task/name,required=False)
        for name in [shot.get('firstFile'),shot.get('lastFile')]:
            if name:add('work/qwen-v13/inputs/'+name,'V13-original-submitted-reference',qwen_work/'inputs'/name,required=False)
    for name in ['batch-latest.json','integration-fragment.json','credential-probe-latest.json']:
        add('work/qwen-v13/'+name,'V13-safe-task-batch-record',qwen_work/name,required=False)
    for run in sorted((ROOT/'work/opus-runs').glob('*v13*')):
        if run.is_dir():tree('work/opus-runs/'+run.name,'V13-external-Claude-attempt-with-reported-status')
    for prompt in sorted((ROOT/'work').glob('opus-*v13*.md')):
        add('work/'+prompt.name,'V13-original-Claude-prompt',prompt)
    audio_records,tail_origin=audio_source_records()
    for r in audio_records:add(r['member'],r['role'],r['source'],sha=r['sha256'])
    add('public/audio_v11/master-v11.wav','Actual-V13-final-master-audio',sha=tail_origin['masterSHA256'])
    add('public/audio_v11/narration-v11.wav','Unchanged-narration-source-stem',sha=tail_origin['narrationSHA256'])
    for clip in load(ROOT/'src/timeline.json')['clips']:
        if clip.get('audio'):add(clip['audio'],'Accepted-timeline-narration-clip',sha=clip.get('audioSHA256'))
    for rel in ['research/audio-v10/accepted-source-provenance-v10.json','research/audio-v10/source-identity-report.json','research/audio-v10/story-research-v10.md','research/audio-v10/story-source-access.json','public/audio_v10/audio-manifest-v10.json']:
        add(rel,'Historical-accepted-audio-or-story-source-provenance')
    for name in ['彩虹为什么是弧形_V13.srt','V13制作说明.md']:
        add('delivery/'+name,'Actual-V13-delivery-support',DELIVERY/name,required=False)
    return selected,expected,graph,sorted(runtime)

def inventory():
    selected,expected,graph,runtime=selection(); rows=[]
    for member,row in sorted(selected.items()):
        p=Path(row['source']);sha,crc,size=digest(p)
        if member in expected and sha!=expected[member]: raise RuntimeError('Provenance hash mismatch: '+member)
        if p.suffix.casefold() in TEXT: scan(member,p.read_bytes())
        rows.append({**row,'sha256':sha,'crc32':crc,'bytes':size,'sensitiveScan':'passed' if p.suffix.casefold() in TEXT else 'binary-asset'})
    return {'version':'V13','status':'read-only-candidate-inventory','createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'project':str(ROOT),'scope':'Current complete source snapshot; active runtime dependency closure; active Qwen runtime and exact original provider/reference/task records; new V13 attempts; current master and narration with exact original V11 origin and small original composition/sample-license records; SRT; Blender/Lux originals; font/source/licenses. No sample-library WAVs, caches, credentials, unrelated inactive-version QA, node_modules, or retired renders.','sourceGraph':graph,'runtimeFiles':runtime,'activeTransitionSnapshot':load(ROOT/'src/transitions-v11.json'),'entries':rows,'fileCount':len(rows),'sourceBytes':sum(r['bytes'] for r in rows),'estimatedZipUpperBoundBytes':sum(r['bytes'] for r in rows)+len(rows)*1024,'mutatesOriginalSources':False,'cleansAnything':False}

def qwen_visual_gate(bridge,manifest_sha):
    """Keep rejected provider footage rejected; approve only its exact composite.

    The opening's compulsory authored occlusion is an explicit exception to
    raw-asset acceptance, not permission to relabel a failed provider attempt.
    Other clips still need their matching raw visual acceptance. Final-video
    visual approval is independently required by gate(), before this helper.
    """
    base=ROOT/'public'/Path(bridge['framePath']).parent
    provenance=load(base/'provenance.json')
    if provenance.get('version')!='V13':
        if bridge.get('requiresForegroundMist') is not None:
            raise RuntimeError('Foreground-mist exception requires a V13 provider record')
        return
    approval_path=base/'visual-acceptance.json'
    approval=load(approval_path)
    provider_sha=provenance.get('providerSHA256')
    if provenance.get('status')!='processed' or not re.fullmatch(r'[0-9a-f]{64}',str(provider_sha or '')) or approval.get('providerSHA256')!=provider_sha:
        raise RuntimeError('Active V13 Qwen provenance/raw acceptance does not match its provider: '+bridge['id'])
    mist=bridge.get('requiresForegroundMist')
    if mist is None:
        if approval.get('status')!='pass':
            raise RuntimeError('Active V13 Qwen asset has no matching documented visual acceptance: '+bridge['id'])
        return
    # No free-form module locator is followed, even if a manifest is edited.
    # This exception is solely for the known opening repair and exact interval.
    if bridge.get('id')!='opening_mist' or not isinstance(mist,dict) or mist.get('module')!='src/ForegroundMistV13.tsx' or mist.get('opaqueFrames')!=[55,120] or mist.get('rawVisualAccepted') is not False:
        raise RuntimeError('Unsupported Qwen foreground-mist exception: '+bridge['id'])
    if approval.get('status')!='fail':
        raise RuntimeError('Opening raw visual FAIL must remain preserved separately from composite approval')
    module=ROOT/'src/ForegroundMistV13.tsx'
    if not module.is_file():raise RuntimeError('Required foreground-mist module is missing')
    composite_path=base/'composite-acceptance-v13.json'
    if not composite_path.is_file():raise RuntimeError('Opening composite has no independent visual acceptance')
    composite=load(composite_path)
    bindings={
        'providerSHA256':provider_sha,
        'moduleSHA256':digest(module)[0],
        'transitionManifestSHA256':manifest_sha,
        'rawAcceptanceSHA256':digest(approval_path)[0],
    }
    if composite.get('version')!='V13' or composite.get('id')!=bridge['id'] or composite.get('status')!='pass' or composite.get('rawVisualAccepted') is not False or composite.get('opaqueFrames')!=mist['opaqueFrames'] or not isinstance(composite.get('reviewScope'),str) or not composite['reviewScope'].strip():
        raise RuntimeError('Opening independent composite visual acceptance is incomplete')
    for key,wanted in bindings.items():
        if composite.get(key)!=wanted:
            raise RuntimeError('Opening composite visual acceptance has a stale '+key)

def gate(qa_path,inv):
    qa=load(qa_path)
    if qa.get('version')!='V13' or qa.get('status')!='pass' or qa.get('visualReviewApproved') is not True or qa.get('encodedFullDecodePassed') is not True:
        raise RuntimeError('Final V13 QA approval missing, visual review incomplete, or full decode not passed')
    video=DELIVERY/'彩虹为什么是弧形_V13_1080p.mp4'
    sha,crc,size=digest(video)
    if qa.get('videoSHA256')!=sha: raise RuntimeError('Final QA does not bind the current V13 MP4 hash')
    audit=load(ROOT/'research/qa-v13/audit-v13.json')
    audit_path=ROOT/'research/qa-v13/audit-v13.json'
    formal=ROOT/'research/qa-v13/delivery-qa-v13.json'
    if not formal.is_file() or digest(formal)[0]!=digest(Path(qa_path))[0]:raise RuntimeError('Approval must be the exact current formal V13 completed-delivery QA')
    if qa.get('sourceAudit',{}).get('sha256')!=digest(audit_path)[0]:raise RuntimeError('Final QA does not bind the current exact V13 source audit')
    if audit.get('version')!='V13' or audit.get('passed') is not True or audit.get('errors')!=[]: raise RuntimeError('Current V13 source audit is not passing')
    for row in audit.get('sourceHashes',[]):
        if digest(ROOT/row['file'])[0]!=row['sha256']: raise RuntimeError('Source changed after V13 audit: '+row['file'])
    if not audit.get('sourceHashes'): raise RuntimeError('Source audit has no current source hashes')
    for row in audit.get('assets',{}).get('staticAssetHashes',[]):
        if digest(ROOT/row['file'])[0]!=row['sha256']:raise RuntimeError('Active input changed after source audit: '+row['file'])
    for name in ['彩虹为什么是弧形_V13.srt','V13制作说明.md']:
        if not (DELIVERY/name).is_file():raise RuntimeError('Final delivery support missing: '+name)
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
    """Select actual pass2 review/provenance records, with exact input binding."""
    qa_dir=ROOT/'research/qa-v13'; selected=[]; movie=acceptance['sha256']
    audit_sha=digest(qa_dir/'audit-v13.json')[0]
    render=load(qa_dir/'render-start-v13.json')
    if render.get('version')!='V13' or render.get('status')!='completed' or render.get('videoSHA256')!=movie or render.get('sourceAuditSHA256')!=audit_sha or Path(render.get('output','')).resolve()!=Path(acceptance['path']).resolve():
        raise RuntimeError('Actual completed render-start does not bind the final movie/source audit')
    selected.append(('research/qa-v13/render-start-v13.json',qa_dir/'render-start-v13.json'))
    records={}
    review_names=['final-visual-review-v13.json','root-final-sampled-review-v13.json','editorial-final-sampled-v13.json','optical-final-film-sample-review-v13.json','camera-character-final-source-review-v13.json']
    for name in review_names:
        p=qa_dir/name
        if not p.is_file():
            if name=='final-visual-review-v13.json':raise RuntimeError('Actual final sampled visual review required')
            continue
        r=load(p); v=r.get('video',{}); v=v if isinstance(v,dict) else {}
        actual=r.get('videoSHA256') or r.get('finalVideo',{}).get('sha256') or v.get('sha256') or v.get('actualSHA256')
        if r.get('version')!='V13' or actual!=movie:raise RuntimeError('Independent final review is stale: '+name)
        if r.get('sourceAuditSHA256') is not None and r['sourceAuditSHA256']!=audit_sha:raise RuntimeError('Independent source binding differs: '+name)
        selected.append(('research/qa-v13/'+name,p));records[name]=r
        md=p.with_suffix('.md')
        if md.is_file():
            if movie not in md.read_text('utf8'):raise RuntimeError('Review note does not name actual final movie: '+md.name)
            selected.append(('research/qa-v13/'+md.name,md))
        elif name=='final-visual-review-v13.json':raise RuntimeError('Final visual review note required')
    bound=acceptance['qa'].get('visualReviewRecord',{})
    if bound.get('sha256')!=digest(qa_dir/'final-visual-review-v13.json')[0]:raise RuntimeError('Formal QA does not bind the actual sampled-review record')
    support=load(qa_dir/'delivery-support-v13.json')
    if support.get('timelineSHA256')!=digest(ROOT/'src/timeline.json')[0] or support.get('srt',{}).get('sha256')!=digest(DELIVERY/'彩虹为什么是弧形_V13.srt')[0] or support.get('document',{}).get('sha256')!=digest(DELIVERY/'V13制作说明.md')[0] or support.get('actualMaster',{}).get('sha256')!=digest(ROOT/'public/audio_v11/master-v11.wav')[0]:
        raise RuntimeError('Actual final delivery-support inputs are stale')
    if support.get('targetVideo',{}).get('sha256')!=movie:raise RuntimeError('Delivery support does not bind actual final movie')
    for name in ['delivery-support-v13.json','environment-depth-fix-v13.json','qwen-render-input-integrity-v13.json']:
        p=qa_dir/name
        if p.is_file():
            r=load(p)
            if name=='environment-depth-fix-v13.json' and r.get('sourceSHA256')!=digest(ROOT/r['source'])[0]:raise RuntimeError('Depth-fix source evidence is stale')
            if name=='qwen-render-input-integrity-v13.json' and (r.get('passed') is not True or r.get('sourceAuditSHA256')!=audit_sha):raise RuntimeError('Qwen render-input integrity evidence is stale')
            selected.append(('research/qa-v13/'+name,p))
    for name,role,key in [('root-final-sampled-review-v13.json','root','motionSheets'),('camera-character-final-source-review-v13.json','camera','contactSheets'),('optical-final-film-sample-review-v13.json','optical','additionalDecodedContactSheets')]:
        record=records.get(name,{})
        for image in record.get(key,[]):
            p=Path(image['file']).resolve(strict=True); expected=image.get('sha256',image.get('actualSHA256'))
            if not p.is_relative_to(ROOT.resolve()) or digest(p)[0]!=expected:raise RuntimeError('Independent image evidence is stale or outside project')
            selected.append((safe_member('research/qa-v13/review-images/'+role+'/'+p.name),p))
        if role=='camera' and record.get('extractionManifest'):
            x=record['extractionManifest'];p=Path(x['file']).resolve(strict=True)
            if not p.is_relative_to(ROOT.resolve()) or digest(p)[0]!=x['sha256']:raise RuntimeError('Camera comparison evidence is stale')
            selected.append(('research/qa-v13/review-images/camera/extraction-and-comparison.json',p))
    return selected

def create(inv,qa_path,copy_delivery):
    acceptance=gate(qa_path,inv); stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S'); archive=SCRATCH/f'rainbow_arc_V13_recovery_{stamp}.zip'; partial=archive.with_suffix('.zip.partial')
    if shutil.disk_usage(SCRATCH).free<inv['estimatedZipUpperBoundBytes']+256*1024*1024: raise RuntimeError('Insufficient D: scratch space for verified recovery ZIP')
    generated={};generated_sources={}
    def from_source(member,path):
        path=Path(path).resolve(strict=True);generated[member]=path.read_bytes();generated_sources[member]=str(path)
    original=(ROOT/'scripts/render-v13.mjs').read_text('utf8')
    old="const installed=path.resolve(root,'..','rainbow_arc_2026_v10','work','render-browser-v10','chrome-headless-shell.exe');"
    if old not in original: raise RuntimeError('Render browser dependency changed; update portable adaptation')
    portable=original.replace(old,"const installed=process.env.RAINBOW_BROWSER_EXECUTABLE || undefined;")
    generated['scripts/render-v13-portable.mjs']=portable.encode('utf8')
    generated['work/output-root-v13.json']=jd({'outputRoot':'output-v13','version':'V13','project':'.','restoredPortable':True})
    # Only the newly passing final delivery report is accepted. The previous
    # AAC synchronization FAIL is replaced in production before this runs and
    # must never be copied into this bundle as misleading "latest" evidence.
    final_report=load(ROOT/'research/qa-v13/delivery-qa-v13.json')
    if final_report.get('status')!='pass' or final_report.get('errors')!=[] or final_report.get('videoSHA256')!=acceptance['sha256']:
        raise RuntimeError('Formal completed-delivery QA is not a current passing report')
    for name in ['audit-v13.json','audit-v13.md','audio-finalization-v13.json','delivery-qa-v13.json','delivery-qa-v13.md','ffprobe-delivery-v13.json']:
        from_source('research/qa-v13/'+name,ROOT/'research/qa-v13'/name)
    for member,p in final_evidence_selection(acceptance):from_source(member,p)
    # This independent signal report may still say review-required. Preserve
    # that exact status; do not turn all-frame decode into aesthetic approval.
    motion_path=ROOT/'research/qa-v13/motion-content-film-v13.json'
    motion_csv=ROOT/'research/qa-v13/motion-content-film-v13.frames.csv'
    if motion_path.is_file():
        motion=load(motion_path)
        if motion.get('version')!='V13' or motion.get('video',{}).get('sha256')!=acceptance['sha256'] or not motion_csv.is_file() or motion.get('sample',{}).get('metricsCSVSHA256')!=digest(motion_csv)[0]:
            raise RuntimeError('Independent motion report/CSV is not bound to this final V13 video')
        from_source('research/qa-v13/'+motion_path.name,motion_path)
        from_source('research/qa-v13/'+motion_csv.name,motion_csv)
    elif motion_csv.is_file():
        raise RuntimeError('Independent motion CSV has no matching final JSON record')
    for name in ['audit-v13-render-start.json','visual-review-v13.md','final-visual-review-v13.md','editorial-v13.md','camera-character-v13.md','optical-art-v13.md','audit-tools-v13.md']:
        p=ROOT/'research/qa-v13'/name
        if p.is_file():from_source('research/qa-v13/'+name,p)
    for item in acceptance['qa'].get('contactSheets',[]):
        p=Path(item['file']).resolve(strict=True)
        if not p.is_relative_to((ROOT/'research/qa-v13').resolve()):raise RuntimeError('Final contact sheet escaped current QA directory')
        if digest(p)[0]!=item['sha256']:raise RuntimeError('Final contact sheet changed after QA')
        from_source(p.relative_to(ROOT).as_posix(),p)
    generated['research/qa-v13/final-approval-v13.json']=jd(acceptance['qa'])
    generated['RESTORE_V13.md']=('V13 private recovery bundle\n\nExtract into a new ordinary directory. No junctions are needed. Run npm ci, npm run check, then node scripts/render-v13-portable.mjs from the extracted root. Remotion may need its supported Chrome headless shell; optionally set RAINBOW_BROWSER_EXECUTABLE. The portable renderer writes output-v13. Original production source and exact active runtime media are preserved as ordinary archive files. Blender sources use D:/blender/blender.exe or your local installation.\n\nV13 retains the accepted V11 narration/master, adds the new original Blender garden, and selects Qwen provider/source/reference records from the actual active transition manifest. All V13 attempts and original acceptance decisions remain recorded. The opening raw provider visual FAIL stays a FAIL; only an independently reviewed composite with the exact mandatory ForegroundMistV13 module, provider, raw decision and transition-manifest hashes may be accepted in the final film. Other active Qwen clips need passing raw visual acceptance. Failed Opus output is not claimed as integrated. Deterministic geometric rays/angles remain the scientific source. Source history is retained; sourceGraph/runtimeFiles identify the active film. QA reports explicitly distinguish full automatic decode from sampled visual review and audio listening scope.\n\nCommercial WaterPro code and the personal voice make this a private local project recovery bundle. Original provenance paths are historical locators; archive paths provide portable copies. No original source is deleted or changed.\n').encode('utf8')
    generated['RESTORE_V13.md']+=('\nSmall original audio records preserve the exact V11 master/narration origin, tail-repair/mastering recipe, original episode composition and V10 arrangement, plus the VSCO source-commit/per-sample manifest, historical integrity record and exact CC0/license/readme bytes. The sample-library WAVs and retired mixes are excluded; render from the included final PCM master. The independent full-frame motion JSON/CSV, when present and bound to this video, retain their actual review-required status rather than asserting aesthetic approval.\n').encode('utf8')
    records=[dict(r) for r in inv['entries']]
    for member,payload in generated.items():
        scan(member,payload);records.append({'member':member,'source':generated_sources.get(member),'role':'Current-final-QA-evidence' if member in generated_sources else 'Generated-portable-restoration-support','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'crc32':f'{zlib.crc32(payload)&0xffffffff:08x}'})
    manifest={**inv,'status':'QA-approved-recovery-manifest','acceptedVideo':{k:v for k,v in acceptance.items() if k!='qa'},'entries':records,'generatedFiles':sorted(generated),'currentQAOnly':True,'portableBrowserAdaptation':True}
    manifest_bytes=jd(manifest);scan('manifest-v13.json',manifest_bytes)
    ziprecords=records+[{'member':'manifest-v13.json','bytes':len(manifest_bytes),'sha256':hashlib.sha256(manifest_bytes).hexdigest(),'crc32':f'{zlib.crc32(manifest_bytes)&0xffffffff:08x}'}]
    with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
        for r in inv['entries']:
            # Hash every exact source again while streaming; fail if it changed
            # after selection without silently making a mismatched archive.
            h=hashlib.sha256();crc=0;size=0
            with Path(r['source']).open('rb') as f,z.open(r['member'],'w',force_zip64=True) as dest:
                for b in iter(lambda:f.read(CHUNK),b''):dest.write(b);h.update(b);crc=zlib.crc32(b,crc);size+=len(b)
            if h.hexdigest()!=r['sha256'] or size!=r['bytes'] or f'{crc&0xffffffff:08x}'!=r['crc32']:raise RuntimeError('Source changed during ZIP write: '+r['member'])
        for member,payload in generated.items():z.writestr(member,payload)
        z.writestr('manifest-v13.json',manifest_bytes)
    validation=verify_zip(partial,ziprecords);partial.rename(archive)
    (SCRATCH/'manifest-v13.json').write_bytes(manifest_bytes)
    result={'version':'V13','status':'verified','archive':str(archive),'sha256':digest(archive)[0],'bytes':archive.stat().st_size,'verification':validation,'deliveryCopy':None,'deletedFiles':0}
    if copy_delivery:
        if shutil.disk_usage(DELIVERY).free>archive.stat().st_size+512*1024*1024:
            target=DELIVERY/archive.name;shutil.copy2(archive,target)
            if digest(target)[0]!=result['sha256']:raise RuntimeError('Delivery ZIP copy hash mismatch')
            result['deliveryCopy']=str(target)
        else:result['deliveryCopySkipped']='Insufficient C: reserve; verified D: archive retained'
    (SCRATCH/'package-result-v13.json').write_bytes(jd(result));return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--create',action='store_true');p.add_argument('--qa-approved',action='store_true');p.add_argument('--qa',type=Path);p.add_argument('--copy-to-delivery',action='store_true');a=p.parse_args()
    if a.create and (not a.qa_approved or not a.qa):p.error('--create needs --qa-approved and --qa <current final approval JSON>')
    SCRATCH.mkdir(parents=True,exist_ok=True);inv=inventory();(SCRATCH/'candidate-inventory-v13.json').write_bytes(jd(inv))
    if a.create: result=create(inv,a.qa,a.copy_to_delivery)
    else: result={k:inv[k] for k in ['version','status','fileCount','sourceBytes','estimatedZipUpperBoundBytes','mutatesOriginalSources','cleansAnything']};result['inventory']=str(SCRATCH/'candidate-inventory-v13.json')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as e:print('PACKAGE_V13_REJECTED: '+str(e),file=sys.stderr);sys.exit(1)
