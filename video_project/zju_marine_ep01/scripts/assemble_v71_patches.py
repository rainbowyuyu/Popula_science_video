"""Replace inclusive frame ranges from verified render patches; preserve 11015-frame film."""
from pathlib import Path
import argparse,datetime,hashlib,json,subprocess

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_streams','-of','json',str(p)]))['streams'][0]
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--dry-run',action='store_true');a=ap.parse_args()
    spec=json.loads(a.manifest.read_text(encoding='utf-8-sig'));base=Path(spec['base']);total=spec.get('frames',11015)
    patches=sorted(spec['patches'],key=lambda p:p['start']);paths=[base]+[Path(p['file']) for p in patches];streams=[probe(p) for p in paths]
    for p,v in zip(paths,streams):
        if (v['width'],v['height'],v['r_frame_rate'])!=(1920,1080,'30/1'):raise ValueError('Wrong format: '+str(p))
    if int(streams[0]['nb_frames'])!=total:raise ValueError('Incomplete base film')
    cursor=0;segments=[]
    for i,p in enumerate(patches,1):
        start,end=p['start'],p['end'];count=end-start+1
        if start<cursor or end<start or end>=total:raise ValueError('Overlapping or out-of-range patches')
        if int(streams[i]['nb_frames'])!=count:raise ValueError('Patch frame count mismatch: '+str(paths[i]))
        if cursor<start:segments.append({'input':0,'start':cursor,'endExclusive':start,'globalStart':cursor,'globalEnd':start-1})
        segments.append({'input':i,'start':0,'endExclusive':count,'globalStart':start,'globalEnd':end});cursor=end+1
    if cursor<total:segments.append({'input':0,'start':cursor,'endExclusive':total,'globalStart':cursor,'globalEnd':total-1})
    if sum(s['endExclusive']-s['start'] for s in segments)!=total:raise ValueError('Assembly count failed')
    graph=[]
    for i,s in enumerate(segments):
        graph.append(f"[{s['input']}:v]trim=start_frame={s['start']}:end_frame={s['endExclusive']},settb=1/30,setpts=N[v{i}]")
    graph.append(''.join(f'[v{i}]' for i in range(len(segments)))+f'concat=n={len(segments)}:v=1:a=0[v]')
    report={'created':datetime.datetime.now(datetime.timezone.utc).isoformat(),'segments':segments,'inputs':[{'file':str(p),'sha256':sha(p),'frames':int(v['nb_frames'])} for p,v in zip(paths,streams)],'method':'Frame-exact trims; no overlaps, blends, interpolation or dropped frames; whole-film H.264 CRF16 re-encode'}
    if a.dry_run:print(json.dumps(report,indent=2));return
    if a.output.exists():raise FileExistsError(a.output)
    a.output.parent.mkdir(parents=True,exist_ok=True);temp=a.output.with_name(a.output.stem+'.assembling.mp4')
    cmd=['ffmpeg','-hide_banner','-nostdin','-y']
    for p in paths:cmd+=['-i',str(p)]
    cmd+=['-filter_complex',';'.join(graph),'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-r','30','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(temp)]
    with a.output.with_suffix('.assembly.log').open('w',encoding='utf8') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,check=True)
    v=probe(temp)
    if int(v['nb_frames'])!=total or abs(float(v['duration'])-total/30)>.001:raise ValueError('Encoded frame count or duration failed')
    temp.replace(a.output);report['output']={'file':str(a.output),'sha256':sha(a.output),'frames':total,'duration':v['duration']}
    a.output.with_suffix('.assembly.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report['output']))
if __name__=='__main__':main()
