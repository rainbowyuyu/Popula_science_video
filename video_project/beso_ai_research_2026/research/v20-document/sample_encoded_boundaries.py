from pathlib import Path
from hashlib import sha256
from PIL import Image, ImageDraw
import json,subprocess
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent/'encoded-boundaries'
OUT.mkdir(exist_ok=True)
REV='2afc39fce9ba'
CACHE=ROOT/'work/render-v20'/('launch-v20-render-'+REV)
ffmpeg='C:/ffmpeg/bin/ffmpeg.exe'
digest=lambda p:sha256(p.read_bytes()).hexdigest()
manifest=json.loads((CACHE/'render-manifest.json').read_text(encoding='utf-8-sig'))
assert manifest['revision']==REV
segments=[]
for p in sorted(CACHE.glob('segment-*.mp4.json')):
    m=json.loads(p.read_text(encoding='utf-8-sig'))
    if m['revision']!=REV:continue
    assert digest(Path(m['file']))==m['sha256'],f'Completion hash mismatch {p}'
    segments.append(m)
centers={'ocean_to_desk':780,'recovery_to_recheck':2012,'recheck_to_selection':2443,'selection_to_physics':2866}
offsets=[-36,-24,-12,-1,0,12,24,36]
extras={'ocean_desk_wipe':[665,677,689,701,713,724,725,736,748],'final_physics_scope':[3082],'research_numbers':[3601,4074,4469],'certificate_to_close':[5816,5828,5839,5840,5852,5864,5876],'final_close':[6086,6234],'final_last_frame':[6263]}
groups=[];pending=[]
for name,fs in [(name,[c+o for o in offsets]) for name,c in centers.items()]+list(extras.items()):
    if not all(any(m['start']<=f<=m['end'] for m in segments) for f in fs):pending.append(name);continue
    record=OUT/(name+'-sampling.json')
    if record.exists():groups.append(json.loads(record.read_text(encoding='utf-8')));continue
    group={'name':name,'frames':[]}
    for f in fs:
        m=next(m for m in segments if m['start']<=f<=m['end'])
        dest=OUT/f'frame-{f:06d}.jpg'
        subprocess.run([ffmpeg,'-v','error','-y','-ss',f'{(f-m["start"])/60:.9f}','-i',m['file'],'-frames:v','1','-q:v','2',str(dest)],check=True)
        group['frames'].append({'frame':f,'file':dest.relative_to(ROOT).as_posix(),'sha256':digest(dest),'segmentIndex':m['index'],'segmentSHA256':m['sha256']})
    rows=(len(fs)+2)//3
    sheet=Image.new('RGB',(1920,rows*386),'#173c49');draw=ImageDraw.Draw(sheet)
    for i,item in enumerate(group['frames']):
        with Image.open(ROOT/item['file']) as im:sheet.paste(im.resize((640,360),Image.Resampling.LANCZOS),((i%3)*640,(i//3)*386))
        draw.text(((i%3)*640+12,(i//3)*386+365),str(item['frame'])+f' / {item["frame"]/60:.3f}s',fill='white')
    sheetpath=OUT/(name+'-contact.jpg');sheet.save(sheetpath,quality=94)
    group['sheet']=sheetpath.relative_to(ROOT).as_posix()
    group['visualReviewPassed']=None
    record.write_text(json.dumps(group,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    groups.append(group)
r={'schema':'v20-independent-encoded-boundary-sampling-v1','revision':REV,'updatedAt':datetime.now(timezone.utc).isoformat(),'segmentsChecked':[{'index':m['index'],'file':m['file'],'sha256':m['sha256']} for m in segments],'groups':groups,'pending':pending,'fullContinuousWatch':False,'audioListeningPerformed':False}
(OUT/'sampling.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'revision':REV,'completedGroups':[g['name'] for g in groups],'pending':pending,'frames':sum(len(g['frames']) for g in groups)}))
