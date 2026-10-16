"""V12 self-contained recovery inventory and QA-gated ZIP; never cleans assets.

Default is a read-only source selection/hash/secret audit (reports only under
work/package-v12). --create requires --qa-approved and a current V12 final QA
JSON. Junctions are read through, recorded by their true resolved sources, and
materialized as ordinary files in the ZIP. No old version's selection code runs.
The ZIP is built/verified on D: first; optional delivery copy is space-checked.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, struct, sys, zipfile, zlib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / 'work/package-v12'
VISUAL = Path('C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204')
DELIVERY = VISUAL / 'rainbow_arc_v12/delivery'
BASELINE = ROOT.parent / 'rainbow_arc_2026'
CHUNK = 4 * 1024 * 1024
BLOCK = {'.git', '.claude', '.codex', '.agents', 'node_modules', '__pycache__', 'cache', '.cache', 'bundle'}
TEXT = {'.json', '.md', '.txt', '.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.svg', '.ps1', '.tex', '.srt', '.vtt', '.yaml', '.yml'}
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
    if 'src/V11RainbowArcFilm.tsx' not in found: raise RuntimeError('Current V12 entry has changed; update inventory')
    return sorted(found)

def selection():
    selected={}; expected={}; runtime=set(); graph=source_graph()
    def add(member,role,source=None,required=True,sha=None):
        member=safe_member(member); logical=Path(source) if source else ROOT/member
        if not logical.is_file():
            if required: raise RuntimeError('Missing dependency: '+member)
            return
        real=logical.resolve(strict=True)
        # Only this project, actual junction targets in its sibling video
        # projects, or explicit media locators below VISUAL may be selected.
        if not (real.is_relative_to(ROOT.parent.resolve()) or real.is_relative_to(VISUAL.resolve())): raise RuntimeError('Source escaped accepted asset roots: '+member)
        row={'member':member,'source':str(real),'logicalSource':str(logical.absolute()),'role':role}
        if member in selected and selected[member]['source']!=row['source']: raise RuntimeError('Conflicting dependency: '+member)
        selected[member]=row
        if sha: expected[member]=sha
    def tree(rel,role,source=None):
        base=Path(source) if source else ROOT/rel
        if not base.is_dir(): raise RuntimeError('Missing required dependency tree: '+rel)
        for p in sorted(base.rglob('*')):
            if p.is_file() and not any(x.casefold() in BLOCK for x in p.relative_to(base).parts) and p.suffix.casefold() not in {'.blend1','.pyc','.log','.tmp','.bak'}:
                add(rel+'/'+p.relative_to(base).as_posix(),role,p)
    # Keep latest complete source tree, but discover runtime only through the
    # active entry. Inactive historical source never expands public selection.
    tree('src','V12-current-source-snapshot')
    for rel in ['package.json','package-lock.json','tsconfig.json','scripts/package-v12.py','scripts/render-v12.mjs','scripts/prepare-drop-v12.py','scripts/audit-v12.mjs','scripts/diagnose-gpu-v12.mjs','scripts/finalize-audio-v12.mjs','scripts/audit-delivery-v12.py','scripts/cleanup-v12-caches.py']:
        add(rel,'V12-build-or-audit-tool')
    for rel in graph:
        p=ROOT/rel
        if p.suffix not in {'.ts','.tsx','.js','.mjs'}: continue
        text=p.read_text('utf8')
        literals=re.findall(r'staticFile\(\s*(["\'])([^"\']+)\1\s*\)',text)
        for _,asset in literals:
            add('public/'+asset,'V12-actual-runtime-asset'); runtime.add('public/'+asset)
        for expression in re.findall(r'staticFile\(\s*`([^`]+)`\s*\)',text):
            if '${' not in expression:
                add('public/'+expression,'V12-actual-runtime-asset');runtime.add('public/'+expression)
            elif expression.startswith('${layer.bridge.framePath}/frame_'):
                for b in load(ROOT/'src/transitions-v11.json')['clips']:
                    for i in range(1,b['frames']+1):
                        rel='public/'+b['framePath']+f'/frame_{i:04d}.jpg';add(rel,'V12-actual-Qwen-runtime-frame');runtime.add(rel)
            else: raise RuntimeError('Unclassified dynamic staticFile in '+rel)
    # GLB URI closure is required even when current assets are embedded.
    for rel in list(runtime):
        if not rel.endswith('.glb'): continue
        raw=(ROOT/rel).read_bytes()
        if raw[:4]!=b'glTF': raise RuntimeError('Invalid GLB: '+rel)
        n,kind=struct.unpack_from('<II',raw,12)
        if kind!=0x4e4f534a: raise RuntimeError('Missing GLB JSON: '+rel)
        document=json.loads(raw[20:20+n])
        for item in document.get('images',[])+document.get('buffers',[]):
            uri=item.get('uri','')
            if not uri or uri.startswith('data:'): continue
            if '://' in uri: raise RuntimeError('Remote GLB dependency: '+rel)
            add((Path(rel).parent/uri).as_posix(),'GLB-external-resource')
    for b in load(ROOT/'src/transitions-v11.json')['clips']:
        sid=b['id'];base='public/assets_v10/qwen/'+sid;tree(base,'Original-accepted-Qwen-source-and-provenance')
        prov=load(ROOT/base/'provenance.json')
        if prov.get('taskId')!=b['taskId'] or prov.get('credentialsPersisted') is not False or len(prov.get('frameHashes',[]))!=150: raise RuntimeError('Qwen provenance mismatch: '+sid)
        for i,sha in enumerate(prov['frameHashes'],1): expected[base+f'/frames/frame_{i:04d}.jpg']=sha
        source=ROOT/base/'provider.mp4'
        if not source.is_file(): source=VISUAL/'rainbow_arc_v10/work/qwen-v10/generated'/sid/'provider.mp4'
        add(base+'/provider.mp4','Original-Qwen-provider-video',source,sha=prov['providerSHA256'])
    tree('public/assets_v12/drop_detail','V12-derived-drop-frames-and-source-correspondence')
    derivative=load(ROOT/'public/assets_v12/drop_detail/provenance.json')
    for r in derivative['frames']:
        expected[f"public/assets_v12/drop_detail/frames/frame_{r['frame']+1:04d}.jpg"]=r['derivativeSHA256']
        expected[f"public/assets_v10/qwen/drop_detail/frames/frame_{r['frame']+1:04d}.jpg"]=r['sourceSHA256']
    tree('public/assets_v11/characters/rainbow_fish_v11','V11-editable-fish-rig-and-provenance')
    tree('public/assets_v09/environment','Blender-environment-source-materials-and-CC0-provenance')
    env=load(ROOT/'public/assets_v09/environment/provenance-v09.json')
    blend=next(r for r in env['files'] if r['file'].endswith('.blend'))
    add('public/assets_v09/environment/rain_after_terrace_v09.blend','Original-editable-Blender-environment',Path(env['blenderSourceLocator']),sha=blend['sha256'])
    for rel in ['public/assets_v08/macro/macro_leaf_raindrop_v08.blend','public/assets_v08/macro/provenance-v08.json','public/assets_v08/environment/rain_after_terrace_v08.blend','public/assets_v08/environment/provenance.json','public/assets_v08/environment/landscape-provenance.json','public/assets_v07/vendor-water/LICENSE.md','public/assets_v07/vendor-water/provenance.json']:
        add(rel,'Original-Blender-or-WaterPro-license')
    tree('public/assets_v08/environment/textures','Original-rebuild-materials')
    for rel in ['public/assets/lux3d/lux3d-delivery.json','public/assets/lux3d/extracted/3dgs/gaussian.ply','public/assets/lux3d/extracted/mesh/tex_mesh.glb','public/assets/lux3d/extracted/3dgs/gaussian-sampled.json']:
        add(rel,'Original-Lux3D-4040282-asset')
    if str(load(ROOT/'public/assets/lux3d/lux3d-delivery.json')['taskId'])!='4040282': raise RuntimeError('Unexpected Lux task')
    tree('research/sources/fonts-v09','Font-license-and-original-source')
    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf','research/sources/UBC_Practical_Meteorology_Ch22-Optics-v102.pdf','research/sources/metadata.json','research/sources/hashes.json','research/formulas/formula-snell.tex','research/formulas/formula-angle.tex']:
        add(rel,'Original-paper-textbook-or-LaTeX-source',(ROOT/rel) if (ROOT/rel).is_file() else BASELINE/rel)
    for rel in ['research/qwen-v10-shot-specs.json','research/qwen-v11-reuse.json','research/qwen-v10-visual-review.md','research/physics/check-optics.mjs']:
        add(rel,'Source-provenance-or-optics-tool')
    # Original generation scripts are retained to explain/rebuild imported
    # assets; they are not selected as current V12 QA evidence.
    for name in ['build-fish-v11.py','build-environment-v09.py','build-environment-v08.py','build_macro_assets_v08.py','sample_gaussian_ply.py','build_formulas.py']:
        add('scripts/'+name,'Original-asset-authoring-tool')
    add('public/audio_v11/master-v11.wav','Actual-V12-final-master-audio')
    add('public/audio_v11/narration-v11.wav','Unchanged-narration-source-stem')
    for clip in load(ROOT/'src/timeline.json')['clips']:
        if clip.get('audio'):
            add(clip['audio'],'Accepted-timeline-narration-clip',sha=clip.get('audioSHA256'))
    for rel in ['research/audio-v10/accepted-source-provenance-v10.json','research/audio-v10/source-identity-report.json','research/audio-v10/story-research-v10.md','research/audio-v10/story-source-access.json','public/audio_v10/audio-manifest-v10.json']:
        add(rel,'Historical-accepted-audio-or-story-source-provenance')
    # Preserve the bounded V12 collaborator attempt exactly, while correctly
    # labeling its incomplete result as not integrated into the film.
    tree('work/opus-runs/macro-contact-v12-20261012-075848-f15c764a','V12-failed-Opus-attempt-no-code-integrated')
    add('delivery/彩虹为什么是弧形_V12.srt','Actual-V12-subtitles',DELIVERY/'彩虹为什么是弧形_V12.srt')
    add('delivery/V12制作说明.md','V12-delivery-notes',DELIVERY/'V12制作说明.md')
    return selected,expected,graph,sorted(runtime)

def inventory():
    selected,expected,graph,runtime=selection(); rows=[]
    for member,row in sorted(selected.items()):
        p=Path(row['source']);sha,crc,size=digest(p)
        if member in expected and sha!=expected[member]: raise RuntimeError('Provenance hash mismatch: '+member)
        if p.suffix.casefold() in TEXT: scan(member,p.read_bytes())
        rows.append({**row,'sha256':sha,'crc32':crc,'bytes':size,'sensitiveScan':'passed' if p.suffix.casefold() in TEXT else 'binary-asset'})
    return {'version':'V12','status':'read-only-candidate-inventory','createdUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'project':str(ROOT),'scope':'Current complete source snapshot; active runtime dependency closure; original Qwen 4x150 plus V12 drop 150 with provenance/provider originals; current master and narration; SRT; Blender/Lux originals; font/source/licenses. No caches, credentials, inactive-version QA, node_modules, or retired renders.','sourceGraph':graph,'runtimeFiles':runtime,'entries':rows,'fileCount':len(rows),'sourceBytes':sum(r['bytes'] for r in rows),'estimatedZipUpperBoundBytes':sum(r['bytes'] for r in rows)+len(rows)*1024,'mutatesOriginalSources':False,'cleansAnything':False}

def gate(qa_path,inv):
    qa=load(qa_path)
    if qa.get('version')!='V12' or qa.get('status')!='pass' or qa.get('visualReviewApproved') is not True or qa.get('encodedFullDecodePassed') is not True:
        raise RuntimeError('Final V12 QA approval missing, visual review incomplete, or full decode not passed')
    video=DELIVERY/'彩虹为什么是弧形_V12_1080p.mp4'
    sha,crc,size=digest(video)
    if qa.get('videoSHA256')!=sha: raise RuntimeError('Final QA does not bind the current V12 MP4 hash')
    audit=load(ROOT/'research/qa-v12/audit-v12.json')
    if audit.get('version')!='V12' or audit.get('errors')!=[]: raise RuntimeError('Current V12 source audit is not passing')
    for row in audit.get('sourceHashes',[]):
        if digest(ROOT/row['file'])[0]!=row['sha256']: raise RuntimeError('Source changed after V12 audit: '+row['file'])
    if not audit.get('sourceHashes'): raise RuntimeError('Source audit has no current source hashes')
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

def create(inv,qa_path,copy_delivery):
    acceptance=gate(qa_path,inv); stamp=dt.datetime.now().strftime('%Y%m%d-%H%M%S'); archive=SCRATCH/f'rainbow_arc_V12_recovery_{stamp}.zip'; partial=archive.with_suffix('.zip.partial')
    if shutil.disk_usage(SCRATCH).free<inv['estimatedZipUpperBoundBytes']+256*1024*1024: raise RuntimeError('Insufficient D: scratch space for verified recovery ZIP')
    generated={};generated_sources={}
    def from_source(member,path):
        path=Path(path).resolve(strict=True);generated[member]=path.read_bytes();generated_sources[member]=str(path)
    original=(ROOT/'scripts/render-v12.mjs').read_text('utf8')
    old="const installed=path.resolve(root,'..','rainbow_arc_2026_v10','work','render-browser-v10','chrome-headless-shell.exe');"
    if old not in original: raise RuntimeError('Render browser dependency changed; update portable adaptation')
    portable=original.replace(old,"const installed=process.env.RAINBOW_BROWSER_EXECUTABLE || undefined;")
    generated['scripts/render-v12-portable.mjs']=portable.encode('utf8')
    generated['work/output-root-v12.json']=jd({'outputRoot':'output-v12','version':'V12','project':'.','restoredPortable':True})
    # Only the newly passing final delivery report is accepted. The previous
    # AAC synchronization FAIL is replaced in production before this runs and
    # must never be copied into this bundle as misleading "latest" evidence.
    final_report=load(ROOT/'research/qa-v12/delivery-qa-v12.json')
    if final_report.get('status')!='pass' or final_report.get('errors')!=[] or final_report.get('videoSHA256')!=acceptance['sha256']:
        raise RuntimeError('Formal completed-delivery QA is not a current passing report')
    for name in ['audit-v12.json','audit-v12.md','audit-v12-render-start.json','visual-review-v12.md','final-visual-review-v12.md','audio-finalization-v12.json','delivery-qa-v12.json','delivery-qa-v12.md','ffprobe-delivery-v12.json']:
        from_source('research/qa-v12/'+name,ROOT/'research/qa-v12'/name)
    generated['research/qa-v12/final-approval-v12.json']=jd(acceptance['qa'])
    generated['RESTORE_V12.md']=('V12 private recovery bundle\n\nExtract into a new ordinary directory. No junctions are needed. Run npm ci, npm run check, then node scripts/render-v12-portable.mjs from the extracted root. Remotion may need its supported Chrome headless shell; optionally set RAINBOW_BROWSER_EXECUTABLE to your browser executable. The portable render writes to output-v12. Original production scripts and all actual runtime media are preserved. Blender original sources require D:/blender/blender.exe or your Blender installation.\n\nThe film intentionally reuses V11 master audio and the accepted Qwen tasks. V12 is a source/render revision, not a new paid Qwen generation. Scientific rays/angles are deterministic. Inactive source files are retained only as source history; only sourceGraph/runtimeFiles in manifest bind this film. Current QA scope remains explicit in its reports and is not a claim of an independent human listening review.\n\nCommercial WaterPro code and the personal voice make this a private local user-project bundle, not a public asset redistribution package. Original provenance paths are historical locators; ordinary archive member paths provide portable copies. No original is deleted or modified.\n').encode('utf8')
    records=[dict(r) for r in inv['entries']]
    for member,payload in generated.items():
        scan(member,payload);records.append({'member':member,'source':generated_sources.get(member),'role':'Current-final-QA-evidence' if member in generated_sources else 'Generated-portable-restoration-support','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'crc32':f'{zlib.crc32(payload)&0xffffffff:08x}'})
    manifest={**inv,'status':'QA-approved-recovery-manifest','acceptedVideo':{k:v for k,v in acceptance.items() if k!='qa'},'entries':records,'generatedFiles':sorted(generated),'currentQAOnly':True,'portableBrowserAdaptation':True}
    manifest_bytes=jd(manifest);scan('manifest-v12.json',manifest_bytes)
    ziprecords=records+[{'member':'manifest-v12.json','bytes':len(manifest_bytes),'sha256':hashlib.sha256(manifest_bytes).hexdigest(),'crc32':f'{zlib.crc32(manifest_bytes)&0xffffffff:08x}'}]
    with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
        for r in inv['entries']:
            # Hash every exact source again while streaming; fail if it changed
            # after selection without silently making a mismatched archive.
            h=hashlib.sha256();crc=0;size=0
            with Path(r['source']).open('rb') as f,z.open(r['member'],'w',force_zip64=True) as dest:
                for b in iter(lambda:f.read(CHUNK),b''):dest.write(b);h.update(b);crc=zlib.crc32(b,crc);size+=len(b)
            if h.hexdigest()!=r['sha256'] or size!=r['bytes'] or f'{crc&0xffffffff:08x}'!=r['crc32']:raise RuntimeError('Source changed during ZIP write: '+r['member'])
        for member,payload in generated.items():z.writestr(member,payload)
        z.writestr('manifest-v12.json',manifest_bytes)
    validation=verify_zip(partial,ziprecords);partial.rename(archive)
    (SCRATCH/'manifest-v12.json').write_bytes(manifest_bytes)
    result={'version':'V12','status':'verified','archive':str(archive),'sha256':digest(archive)[0],'bytes':archive.stat().st_size,'verification':validation,'deliveryCopy':None,'deletedFiles':0}
    if copy_delivery:
        if shutil.disk_usage(DELIVERY).free>archive.stat().st_size+512*1024*1024:
            target=DELIVERY/archive.name;shutil.copy2(archive,target)
            if digest(target)[0]!=result['sha256']:raise RuntimeError('Delivery ZIP copy hash mismatch')
            result['deliveryCopy']=str(target)
        else:result['deliveryCopySkipped']='Insufficient C: reserve; verified D: archive retained'
    (SCRATCH/'package-result-v12.json').write_bytes(jd(result));return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--create',action='store_true');p.add_argument('--qa-approved',action='store_true');p.add_argument('--qa',type=Path);p.add_argument('--copy-to-delivery',action='store_true');a=p.parse_args()
    if a.create and (not a.qa_approved or not a.qa):p.error('--create needs --qa-approved and --qa <current final approval JSON>')
    SCRATCH.mkdir(parents=True,exist_ok=True);inv=inventory();(SCRATCH/'candidate-inventory-v12.json').write_bytes(jd(inv))
    if a.create: result=create(inv,a.qa,a.copy_to_delivery)
    else: result={k:inv[k] for k in ['version','status','fileCount','sourceBytes','estimatedZipUpperBoundBytes','mutatesOriginalSources','cleansAnything']};result['inventory']=str(SCRATCH/'candidate-inventory-v12.json')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as e:print('PACKAGE_V12_REJECTED: '+str(e),file=sys.stderr);sys.exit(1)
