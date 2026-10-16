"""Six atmosphere bridges, official DashScope, resumable and credential-safe.

Provide QWEN_API_KEY only through this process's environment. Never put it in arguments.
Usage: python work/generate_qwen_batch_v06.py --only street,fountain
       python work/generate_qwen_batch_v06.py (all six)
       python work/generate_qwen_batch_v06.py --resume-only
An unknown POST response is never automatically retried.
"""
import argparse, hashlib, json, os, pathlib, subprocess, time, urllib.parse
import requests

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v08/qwen/generated'
LEDGER=ROOT/'work/qwen-v08'
OUT.mkdir(parents=True,exist_ok=True);LEDGER.mkdir(parents=True,exist_ok=True)
HOST=os.environ.get('DASHSCOPE_API_HOST','https://dashscope.aliyuncs.com').rstrip('/')
KEY=os.environ.get('QWEN_API_KEY') or os.environ.get('DASHSCOPE_API_KEY')
MODEL='wan2.6-t2v'
BASE='One uninterrupted cinematic photoreal shot. Beautiful authentic rain-after-sunlight atmosphere, soft daylight, natural colors, pale luminous air, premium documentary cinematography, smooth physically plausible camera movement, no cuts, no on-screen text, no logo, no diagrams. '
NEG='text, subtitles, watermark, logo, diagrams, drawn rays, laser beams, arrows, blue wedge, optical wedges, neon colors, fantasy rainbow, abrupt cuts, glitch, flicker, distorted architecture, pointed teardrop, cartoon, plastic CGI'
SHOTS=[{'slug': 'opening_v08',
  'seed': 8101,
  'insert': 'V08 first5seconds; replaces oversized suburban rainbow',
  'prompt': 'One uninterrupted photoreal cinematic documentary shot at 1080p. Low aerial camera '
            'glides smoothly forward over a wet slate pathway just after a rain shower at the edge '
            'of a beautiful green mountain valley. Genuine richly textured wet stone, puddles '
            'reflecting a bright cloud break, naturally shaped foliage moving gently, realistic '
            'layered forest mountains. Distant rain curtain across valley and one faint but '
            'clearly visible NATURAL rainbow arc high in the distant pale blue gray sky. Natural '
            'rainbow translucent, red outside violet inside, correct smooth color order; rain '
            'curtain and landscape remain visible through the rainbow. Sun is behind the camera '
            'out of frame. Beautiful gentle backlit air and true scale, contemporary premium '
            'nature documentary photography, restrained cinematic contrast, nuanced greens and '
            'warm stone, not hazy washed out. Camera glides at walking pace with foreground '
            'parallax and unbroken continuous movement, no cuts. Keep upper middle sky readable, '
            'no close people, no diagrams, no written words, no graphic symbols.'},
 {'slug': 'fountain_v08',
  'seed': 8102,
  'insert': 'V08 fountain bridge; complements new stone basin material',
  'prompt': 'One uninterrupted photoreal cinematic nature documentary macro-to-medium shot '
            'at1080p. Slowly gliding laterally along the rim of a real elegant circular low stone '
            'fountain on a wet slate garden terrace in a quiet mountain park after rain. Slate '
            'texture, subtle mineral streaks, real polished wet edges, moss only in small joints, '
            'sunlight glancing from behind the camera. A slim center jet breaks into countless '
            'tiny sparkling droplets and transparent drifting mist. In a small area of that '
            'illuminated mist only, a faint natural rainbow is visible. Keep actual liquid shape '
            'and inertia physically plausible, sharp near droplets softly defocus distant '
            'mountains and foliage, restrained palette with pale blue water and fresh dark greens. '
            'Camera gently arcs around the near rim, smooth foreground parallax, exquisite fine '
            'water reflections and soft depth of field. Do not overfill image with bright fog; '
            'retain photographic contrast. No cuts, no diagrams, no arrows, no lasers, no words or '
            'logo, no toy-like plastic materials.'}]

def atomic_json(path,value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(path)

def short_output(row):
    print(json.dumps({k:row.get(k) for k in ['slug','status','task_id','request_id','model','file','frame_count','error_code'] if row.get(k) is not None},ensure_ascii=False),flush=True)

def save(row):
    folder=OUT/row['slug'];folder.mkdir(exist_ok=True)
    atomic_json(folder/'provenance.json',row)
    short_output(row)

def load(shot):
    path=OUT/shot['slug']/'provenance.json'
    if path.exists():return json.loads(path.read_text(encoding='utf8'))
    return {'slug':shot['slug'],'model':MODEL,'status':'planned','prompt':shot['prompt'],'negative_prompt':NEG,
            'seed':shot['seed'],'duration_requested_seconds':5,'size_requested':'1920*1080','audio_requested':False,
            'purpose':'Generated realistic atmosphere/transition only. Geometrical rainbow angles and ray tracing are computed separately.',
            'recommended_insert':shot['insert'],'cost_verified':False,'source':'Alibaba Cloud DashScope official API',
            'submission_count':0}

def request_session():
    s=requests.Session()
    # Prefer the user-configured local network route, matching the existing Qwen integration.
    proxy=os.environ.get('TRAILER_HTTPS_PROXY','http://127.0.0.1:7897')
    if proxy:s.proxies={'https':proxy,'http':proxy}
    return s

def submit(s,row):
    if row['status']!='planned':return
    payload={'model':MODEL,'input':{'prompt':row['prompt'],'negative_prompt':NEG},
             'parameters':{'size':'1920*1080','duration':5,'audio':False,'prompt_extend':False,'seed':row['seed']}}
    row['status']='submitting';row['submission_count']+=1;row['submitted_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());save(row)
    try:
        resp=s.post(HOST+'/api/v1/services/aigc/video-generation/video-synthesis',
                    headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=payload,timeout=120)
        try:data=resp.json()
        except Exception:data={}
        row['http_status']=resp.status_code;row['request_id']=data.get('request_id')
        task=data.get('output',{}).get('task_id')
        if task:
            row['task_id']=task;row['status']='running'
        elif resp.status_code>=400:
            row['status']='rejected';row['error_code']=data.get('code','HTTP_'+str(resp.status_code));row['error_message']=data.get('message','Request rejected')
        else:
            row['status']='submission_unknown';row['error_code']='Successful_response_without_task_id'
    except Exception as exc:
        row['status']='submission_unknown';row['error_code']=type(exc).__name__
    save(row)

def process_video(row):
    folder=OUT/row['slug'];src=folder/'provider.mp4';out=folder/'cfr_allintra.mp4';frames=folder/'frames';frames.mkdir(exist_ok=True)
    if not out.exists():
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(src),'-an','-vf',
                        'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30',
                        '-c:v','libx264','-preset','fast','-crf','18','-g','1','-keyint_min','1','-pix_fmt','yuv420p',str(out)],check=True)
    if len(list(frames.glob('frame_*.jpg')))!=150:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out),'-q:v','2',str(frames/'frame_%04d.jpg')],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration','-of','json',str(out)],text=True))
    stream=probe['streams'][0]
    row.update({'status':'processed','file':str(out.relative_to(ROOT)).replace('\\','/'),'frame_pattern':str((frames/'frame_%04d.jpg').relative_to(ROOT)).replace('\\','/'),
                'frame_count':len(list(frames.glob('frame_*.jpg'))),'first_frame':1,'fps':30,'width':stream['width'],'height':stream['height'],
                'duration_seconds':float(stream['duration']),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),
                'decode_strategy':'Real video decoded to every actual CFR frame; random-seek-safe all-intra backup. No still-image pan.',
                'quality_review':'Pending contact-sheet and transition review before use in final film'})
    save(row)

def query(s,row):
    if row['status'] in ('processed','rejected','submission_unknown','planned'):return
    if not row.get('task_id'):
        row['status']='submission_unknown';save(row);return
    try:
        resp=s.get(HOST+'/api/v1/tasks/'+row['task_id'],headers={'Authorization':'Bearer '+KEY},timeout=40)
        if resp.status_code!=200:
            row['last_query_http_status']=resp.status_code;save(row);return
        data=resp.json();output=data.get('output',{})
        state=output.get('task_status','UNKNOWN');row['provider_status']=state
        if state=='SUCCEEDED':
            row['completed_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
            url=output.get('video_url')
            # Signed provider URL is deliberately not persisted or printed.
            if not url:
                row['error_code']='Missing_video_url';save(row);return
            row['download_host']=urllib.parse.urlparse(url).hostname
            folder=OUT/row['slug'];src=folder/'provider.mp4'
            if not src.exists():
                download=s.get(url,timeout=180);download.raise_for_status()
                part=folder/'provider.mp4.part';part.write_bytes(download.content);part.replace(src)
            row['status']='downloaded';save(row);process_video(row)
        elif state in ('FAILED','CANCELED'):
            row['status']=state.lower();row['error_code']=output.get('code');row['error_message']=output.get('message');save(row)
        else:
            row['status']='running';save(row)
    except Exception as exc:
        row['last_query_error']=type(exc).__name__;save(row)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',default='');ap.add_argument('--resume-only',action='store_true');ap.add_argument('--prepare-only',action='store_true');ap.add_argument('--timeout-minutes',type=float,default=20)
    args=ap.parse_args()
    selected=set(args.only.split(',')) if args.only else None
    shots=[shot for shot in SHOTS if selected is None or shot['slug'] in selected]
    rows=[load(shot) for shot in shots]
    if args.prepare_only:
        # Regenerate decoded-frame caches from already downloaded source without a credential.
        for row in rows:
            if (OUT/row['slug']/'provider.mp4').exists():process_video(row)
        return 0
    if not KEY:raise SystemExit('Missing runtime Qwen credential; no tasks submitted.')
    session=request_session()
    for row in rows:
        # A previous interrupted HTTP POST has unknown billing state. Never retry it automatically.
        if row['status']=='submitting':row['status']='submission_unknown';save(row)
        if row['status']=='planned' and not args.resume_only:submit(session,row)
        elif row['status']=='downloaded':process_video(row)
        elif row['status']=='processed' and (len(list((OUT/row['slug']/'frames').glob('frame_*.jpg')))!=150 or not (OUT/row['slug']/'cfr_allintra.mp4').exists()):process_video(row)
    deadline=time.monotonic()+args.timeout_minutes*60
    active=lambda:[r for r in rows if r['status'] in ('running','downloaded','submitting')]
    while active() and time.monotonic()<deadline:
        for row in active():query(session,row)
        atomic_json(LEDGER/'batch.json',{'model':MODEL,'rows':[{'slug':r['slug'],'status':r['status'],'task_id':r.get('task_id'),'frame_count':r.get('frame_count')} for r in rows],
                                         'credential_persisted':False,'signed_urls_persisted':False})
        if active():time.sleep(12)
    short_output({'slug':'batch','status':'finished' if not active() else 'still_running','model':MODEL})
    return 0 if all(row['status']=='processed' for row in rows) else 2

if __name__=='__main__':raise SystemExit(main())
