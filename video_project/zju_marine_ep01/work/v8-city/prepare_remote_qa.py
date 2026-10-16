import hashlib,json,pathlib,re,shutil,sys,tarfile
name=sys.argv[1] if len(sys.argv)>1 else 'qa-v8-a'
if not re.fullmatch(r'qa-v8-[a-z0-9-]+',name):raise RuntimeError('Explicit snapshot directory required')
base=(pathlib.Path('/home/fusion/marine-energy-v7-20261014')/name).resolve()
archive=base/'snapshot.tar'
with tarfile.open(archive) as tf:
    for entry in tf.getmembers():
        target=(base/entry.name).resolve()
        if not target.is_relative_to(base) or entry.issym() or entry.islnk():
            raise RuntimeError('Unsafe archive member')
    tf.extractall(base)
public=base/'bundle/public'
public.mkdir(parents=True,exist_ok=True)
for asset in (base/'assets').iterdir():
    target=public/asset.name
    if target.exists():raise RuntimeError('Refuse to overwrite an existing snapshot')
    shutil.move(str(asset),str(target))
manifest=json.loads((base/'manifest.json').read_text())
for item in manifest['assets']:
    p=public/item['path']
    if p.stat().st_size!=item['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
        raise RuntimeError('Asset content mismatch: '+item['path'])
(base/'bundle-ready').write_text(json.dumps({'verifiedAssets':len(manifest['assets']),'manifestSHA256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest()}))
print(json.dumps({'ready':str(base/'bundle-ready'),'verifiedAssets':len(manifest['assets'])}))
