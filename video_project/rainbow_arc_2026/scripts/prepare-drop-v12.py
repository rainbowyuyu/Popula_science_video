from pathlib import Path
import numpy as np
from PIL import Image
import json,hashlib
root=Path('.');source=root/'public/assets_v10/qwen/drop_detail/frames';out=root/'public/assets_v12/drop_detail/frames'
y,x=np.mgrid[0:1080,0:1920];records=[]
for f in range(150):
 path=source/f'frame_{f+1:04d}.jpg';a=np.array(Image.open(path).convert('RGB'),dtype=np.float32);p=f/149;s=p*p*(3-2*p);r=272+11*s
 # Remove unrelated leaf by reconstructing only the empty optical backdrop.
 # Sphere radiance, reflections and 30fps temporal movement are retained.
 bg=np.median(a[:,12:116,:],axis=1);bg=np.repeat(bg[:,None,:],1920,axis=1)
 d=np.hypot(x-960,y-548);keep=np.clip((r+38-d)/22,0,1);keep=keep*keep*(3-2*keep)
 b=np.clip(a*keep[:,:,None]+bg*(1-keep[:,:,None]),0,255).astype('uint8')
 padded=np.pad(b,((512,512),(512,512),(0,0)),mode='edge'); target=out/path.name;Image.fromarray(padded).save(target,quality=97,subsampling=0)
 records.append({'frame':f,'sourceSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'derivativeSHA256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest={'version':'V12','taskId':'81ce44d0-7df5-4819-99ce-87b44be97c51','method':'Local background reconstruction outside the source droplet; original Qwen droplet retained. Native frame rate and chronology unchanged. No new Qwen request.','source':'assets_v10/qwen/drop_detail','sourceRetained':True,'generatedPhysics':False,'paddingPixels':512,'dimensions':[2944,2104],'frames':records}
(root/'public/assets_v12/drop_detail/provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
cfg=root/'src/transitions-v11.json';data=json.loads(cfg.read_text('utf-8'));next(c for c in data['clips'] if c['id']=='drop_detail')['framePath']='assets_v12/drop_detail/frames';cfg.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf-8')
