from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
tl=json.loads((ROOT/'src/timeline.json').read_text('utf8'));assert not tl.get('notFinal')
paths=list((ROOT/'src').glob('*.ts*'))+[ROOT/'src/timeline.json',ROOT/'public/audio/master-v07.wav',ROOT/'public/fonts/unified.woff2',ROOT/'public/brand/logo.png']
paths+=list((ROOT/'public/assets_v07').rglob('*'))
paths+=list((ROOT/'public/assets_v06').rglob('provenance.json'))
paths+=[ROOT/'public/assets_v06/lux3d/splats-v06.json',ROOT/'public/assets_v06/blender/spherical_raindrop_v06.glb']
paths+=list((ROOT/'public/assets_v06/vendor-water').glob('*'))
paths+=list((ROOT/'public/sources').glob('*'))
for slug in ['street','droplet','waterfall','circle','fountain']:
    frames=sorted((ROOT/'public/assets_v06/qwen/generated'/slug/'frames').glob('frame_*.jpg'))
    assert len(frames)==150,(slug,len(frames));paths+=frames
files={}
for p in dict.fromkeys(paths):
    if p.is_dir():continue
    if not p.is_file():raise FileNotFoundError(p)
    files[p.relative_to(ROOT).as_posix()]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
(ROOT/'research/qa/render-source-lock-v07.json').write_text(json.dumps({'version':'V07','files':files},indent=2),'utf8')
print({'lockedFiles':len(files),'seconds':tl['duration']/30})
