from pathlib import Path
import json,hashlib,datetime
r=Path.cwd()
protected=['delivery/ShanghaiTower_1080p_v14.mp4','delivery/ShanghaiTower_1080p_v15.mp4','delivery/ShanghaiTower_1080x1920_v15.mp4','src/World.ts','src/FilmV15.tsx','src/FilmV15Vertical.tsx']
obj={'version':'V16','status':'in-production','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected':{p:hashlib.file_digest((r/p).open('rb'),'sha256').hexdigest() for p in protected if (r/p).exists()}}
(r/'research/qa/v16/production-lock.json').write_text(json.dumps(obj,indent=2),encoding='utf-8')
for name in ['audio-timeline.json','audio-timeline-vertical.json']:
 t=json.loads((r/'src/v16'/name).read_text(encoding='utf-8-sig'));print(name)
 for x in t['sceneSegments']:print(x)
