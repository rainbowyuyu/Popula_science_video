from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'));assert not tl.get('notFinal')
paths=list((ROOT/'src').glob('*.ts*'))+[ROOT/'src/timeline.json',ROOT/'public/audio/master.wav',ROOT/'public/fonts/unified.woff2',ROOT/'public/brand/logo.png']
paths+=list((ROOT/'public/assets_v06').rglob('provenance.json'))
paths+=[ROOT/'public/assets_v06/lux3d/splats-v06.json',ROOT/'public/assets_v06/blender/spherical_raindrop_v06.glb']
paths+=list((ROOT/'public/assets_v06/vendor-water').glob('*'))
paths+=[ROOT/'public/sources'/n for n in ['formula-snell.svg','formula-angle.svg','gettelman-2023-rainbow-optics-page4939.png','gettelman-2023-title-page.png']]
for slug in ['street','droplet','waterfall','circle','fountain']:
    frames=sorted((ROOT/'public/assets_v06/qwen/generated'/slug/'frames').glob('frame_*.jpg'))
    assert len(frames)==150,(slug,len(frames))
    paths+=frames
paths=list(dict.fromkeys(paths))
files={}
for p in paths:
    if not p.is_file():raise FileNotFoundError(p)
    files[p.relative_to(ROOT).as_posix()]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
(ROOT/'research/qa/render-source-lock-v06.json').write_text(json.dumps({'version':'V06','files':files},indent=2),'utf8')
print({'lockedFiles':len(files),'seconds':tl['duration']/30})
