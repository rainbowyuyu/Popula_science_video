"""Only scene assets and draft visual timings; never process/retime narration."""
from pathlib import Path
import json,shutil,math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
pub=ROOT/'public/episode3v7';ref=pub/'references';ref.mkdir(parents=True,exist_ok=True)
shutil.copy2(ROOT/'public/episode3v6/logo.png',pub/'logo.png')
for n in ['sha-2019-page1.png','tenon-2024-page1.png']:
    shutil.copy2(ROOT/'public/episode3v6/references'/n,ref/n)
equations={'equilibrium':r'\mathbf{K}\mathbf{u}=\mathbf{f}', 'diffusion':r'\partial_{\tau}\mathbf{p}=-\mathbf{L}\mathbf{p}'}
for name,equation in equations.items():
    fig=plt.figure(figsize=(8,1.5),dpi=180);fig.text(.5,.5,'$'+equation+'$',ha='center',va='center',fontsize=40,color='#293b32');fig.savefig(ref/(name+'.png'),transparent=True,bbox_inches='tight',pad_inches=.12);plt.close(fig)
(ref/'equations.tex').write_text('\n'.join(equations.values()),encoding='utf8')
tl=ROOT/'src/episode3v7/timeline.json'
if not tl.exists():
    rows=json.loads((ROOT/'research/episode3v7/story.json').read_text(encoding='utf8'))['clips'];frame=20;scenes=[];clips=[];captions=[]
    for c in rows:
        if not scenes or scenes[-1]['id']!=c['scene']:
            if scenes:scenes[-1]['end']=frame
            scenes.append({'id':c['scene'],'start':frame if scenes else 0,'end':0})
        d=math.ceil(len(c['text'])/5.1*30);clips.append({**c,'start':frame,'end':frame+d,'duration':d});frame+=d+9
    scenes[-1]['end']=frame;scenes.append({'id':'references','start':frame,'end':frame+360});frame+=360
    t={'fps':30,'duration':frame,'clips':clips,'captions':captions,'scenes':scenes,'draft':True};tl.write_text(json.dumps(t,ensure_ascii=False,indent=2),encoding='utf8')
print('Visual assets prepared; audio timeline left untouched if present.')
