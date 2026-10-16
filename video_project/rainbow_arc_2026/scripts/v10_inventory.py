"""Actual V10 import/runtime dependency inventory. Never follows junctions."""
from pathlib import Path
import json,re,stat,struct

ROOT=Path(__file__).resolve().parents[1]
COMPOSITION='RainbowArc'
VERSION='V10'
ENTRY='src/index.tsx'
FILM='src/V10RainbowArcFilm.tsx'
FORBIDDEN={'node_modules','.git','.claude','.codex','.agents','__pycache__'}

def is_reparse(path):
    s=path.lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)

def checked(relative,required=True):
    p=ROOT/relative
    if p.is_absolute():
        p=Path(str(p))
    p=Path(__import__('os').path.abspath(p))
    rel=p.relative_to(ROOT);cur=ROOT
    if is_reparse(cur):raise RuntimeError('Episode root is a reparse point')
    for part in rel.parts:
        if part.casefold() in FORBIDDEN:raise RuntimeError('Forbidden inventory directory: '+rel.as_posix())
        cur=cur/part
        if cur.exists() and is_reparse(cur):raise RuntimeError('Refusing inventory junction/symlink: '+rel.as_posix())
    if required and not p.is_file():raise RuntimeError('Missing actual V10 dependency: '+rel.as_posix())
    return p

def source_files():
    result=set();todo=[ENTRY]
    while todo:
        rel=todo.pop()
        if rel in result:continue
        p=checked(rel);result.add(rel)
        if p.suffix not in {'.ts','.tsx','.js','.mjs'}:continue
        text=p.read_text('utf8')
        references=re.findall(r'(?:from\s*|import\s*\()([\"\'])(\.[^\"\']+)\1',text)
        for _,target in references:
            candidate=p.parent/target
            options=[candidate] if candidate.suffix else [candidate.with_suffix(e) for e in ('.ts','.tsx','.js','.mjs','.json')]+[candidate/'index.ts',candidate/'index.tsx']
            found=next((q for q in options if q.is_file()),None)
            if found is None:raise RuntimeError('Cannot resolve import '+target+' from '+rel)
            todo.append(checked(found).relative_to(ROOT).as_posix())
    if FILM not in result:raise RuntimeError('Entry does not import the V10 film')
    return sorted(result)

def qwen_slugs():
    manifest=json.loads(checked('src/transitions-v10.json').read_text('utf8'))
    return [r['id'] for r in manifest['clips']]

def gltf_external_resources(relative):
    p=checked(relative);data=p.read_bytes()
    if len(data)<20 or data[:4]!=b'glTF':raise RuntimeError('Invalid GLB header: '+relative)
    length,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a:raise RuntimeError('GLB lacks JSON chunk: '+relative)
    document=json.loads(data[20:20+length].decode('utf8'))
    for row in document.get('buffers',[])+document.get('images',[]):
        uri=row.get('uri','')
        if not uri or uri.startswith('data:'):continue
        if '://' in uri:raise RuntimeError('Remote GLB dependency must be archived explicitly: '+relative)
        yield checked(p.parent/uri).relative_to(ROOT).as_posix()

def runtime_files(preview=False):
    result=set(source_files());result.update(['package.json','package-lock.json','tsconfig.json','scripts/render-v10.mjs'])
    for relative in source_files():
        p=checked(relative)
        if p.suffix not in {'.ts','.tsx','.js','.mjs'}:continue
        text=p.read_text('utf8')
        for _,asset in re.findall(r"staticFile\(\s*(['\"])([^'\"]+)\1\s*\)",text):
            if '${' in asset:raise RuntimeError('Unclassified interpolated staticFile dependency in '+relative)
            if preview and asset.startswith('audio_v10/'):continue
            result.add(checked('public/'+asset).relative_to(ROOT).as_posix())
        dynamic=re.findall(r'staticFile\(\s*`([^`]+)`\s*\)',text)
        for expression in dynamic:
            if expression.startswith('${active.framePath}/frame_') or expression.startswith('${previous.framePath}/frame_'):
                manifest=json.loads(checked('src/transitions-v10.json').read_text('utf8'))
                for row in manifest['clips']:
                    for i in range(1,row['frames']+1):
                        result.add(checked('public/'+row['framePath']+f'/frame_{i:04d}.jpg').relative_to(ROOT).as_posix())
            elif '${' not in expression:result.add(checked('public/'+expression).relative_to(ROOT).as_posix())
            else:raise RuntimeError('Unclassified dynamic staticFile dependency in '+relative)
    for relative in list(result):
        if relative.endswith('.glb'):result.update(gltf_external_resources(relative))
    return sorted(result)

def immutable_record(relative):
    import hashlib
    p=checked(relative);before=p.stat();h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
    after=p.stat()
    if (before.st_mtime_ns,before.st_size)!=(after.st_mtime_ns,after.st_size):raise RuntimeError('Dependency changed while hashing: '+relative)
    return {'sha256':h.hexdigest(),'bytes':after.st_size,'hardLinkCount':after.st_nlink}
