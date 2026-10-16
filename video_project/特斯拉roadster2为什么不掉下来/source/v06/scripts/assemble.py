"""Reproducible V06 prepend. V05 is an immutable picture/voice source.

Every clip is sampled forward. Official footage and provider audio are muted.
No frame interpolation, reversed animation, frozen endpoint, or full-scene dissolve.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess

ROOT=Path(__file__).resolve().parents[3]
SRC=ROOT/'source/v06'
WORK=ROOT/'work/v06/assembly'
OUT=ROOT/'output/v06'
OLD=ROOT/'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4'
OFFICIAL=ROOT/'assets/v06/official/official-highlight-289frames.mp4'
OVERLAYS=ROOT/'assets/v06/overlays'
WORK.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()

def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],encoding='utf8'))
def run(args,label):
    cmd=['ffmpeg','-hide_banner','-y','-nostdin',*map(str,args)]
    save(WORK/f'{label}-command.json',cmd)
    with (WORK/f'{label}.log').open('w',encoding='utf8') as log:
        p=subprocess.run(cmd,stdout=log,stderr=log)
    if p.returncode:raise RuntimeError(f'{label}: see {WORK/label}.log')
def norm(matrix='auto',range_='auto'):
    return (f'scale=1920:1080:flags=lanczos:in_color_matrix={matrix}:out_color_matrix=bt709:'
            f'in_range={range_}:out_range=tv,format=yuv420p,setsar=1,'
            'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,'
            'fps=30:round=near,settb=1/90000,setpts=N/(30*TB)')
ENC=['-an','-c:v','libx264','-preset','fast','-crf','17','-threads','6','-pix_fmt','yuv420p',
     '-profile:v','high','-level:v','4.1','-g','60','-keyint_min','30','-video_track_timescale','90000',
     '-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709','-movie_timescale','90000','-movflags','+faststart']

def body():
    dst=WORK/'body-normalized.mp4'
    run(['-i',OLD,'-vf',norm('bt601','full'),'-frames:v','9500',*ENC,dst],'body')
    save(WORK/'body-input.json',{'source':str(OLD.relative_to(ROOT)),'sha256':sha(OLD),'outputSha256':sha(dst),
         'transform':'Full-range bt470bg to limited-range BT.709; no timing, framing or text edits.'})

def intro(bridge):
    bridge=Path(bridge).resolve()
    info=probe(bridge);v=next(s for s in info['streams'] if s['codec_type']=='video')
    duration=float(v['duration']);bridge_frames=round(duration*30)
    total=289+bridge_frames
    save(WORK/'edit-contract.json',{'fps':30,'size':[1920,1080],'officialFrames':289,'bridgeFrames':bridge_frames,
        'introFrames':total,'introSec':total/30,'bodyFrames':9500,'totalFrames':total+9500,'totalSec':(total+9500)/30,
        'firstVoiceSec':total/30+.5,'bridgeSource':str(bridge.relative_to(ROOT)), 'bridgeSha256':sha(bridge),
        'bridgeNative':{'fps':v['avg_frame_rate'],'frames':v.get('nb_frames'),'duration':duration},
        'sampling':'Forward fps=30 round=near; normal-rate frame repeat/drop only. No scene overlaps.',
        'cuts':[168,228,289,total],'bodySourceSha256':sha(OLD),'officialSourceSha256':sha(OFFICIAL)})
    args=['-filter_complex_threads','2','-i',OFFICIAL,'-i',bridge]
    names=['brand-light','source','brand-dark','generated','series']
    for n in names:args+=['-loop','1','-framerate','30','-i',OVERLAYS/f'{n}.png']
    fade=max(0,bridge_frames/30-.7)
    # The underlying generated image sequence stays intact; only corner captions ease in/out.
    graph=[f'[0:v]{norm()}[o]',f'[1:v]{norm()}[b]',
           '[2:v]format=rgba,split[lighto][lightb]',
           '[o][lighto]overlay=shortest=1[ol]','[ol][3:v]overlay=shortest=1[official]',
           '[lightb]fade=t=out:st=1.7:d=1.2:alpha=1[bl]',
           '[4:v]format=rgba,fade=t=in:st=1.7:d=1.2:alpha=1[bd]',
           f'[5:v]format=rgba,fade=t=out:st={fade-.7}:d=0.6:alpha=1[badge]',
           f'[6:v]format=rgba,fade=t=in:st={fade}:d=0.6:alpha=1[series]',
           '[b][bl]overlay=shortest=1[b1]','[b1][bd]overlay=shortest=1[b2]',
           '[b2][badge]overlay=shortest=1[b3]','[b3][series]overlay=shortest=1[b4]',
           f'[b4]trim=end_frame={bridge_frames},setpts=PTS-STARTPTS[generated]',
           '[official][generated]concat=n=2:v=1:a=0,format=yuv420p[out]']
    graph_path=WORK/'intro-filter.txt';graph_path.write_text(';\n'.join(graph),encoding='utf8')
    run([*args,'-filter_complex_script',graph_path,'-map','[out]','-frames:v',total,*ENC,WORK/'intro-picture.mp4'],'intro')
    return total

def final():
    contract=json.loads((WORK/'edit-contract.json').read_text(encoding='utf8'))
    audio=SRC/'public/audio/master.wav'
    ai=next(s for s in probe(audio)['streams'] if s['codec_type']=='audio')
    if abs(float(ai['duration'])-contract['totalSec'])>1/48000:raise RuntimeError('Audio duration does not match picture')
    concat=WORK/'concat.txt'
    concat.write_text(f"file 'intro-picture.mp4'\nduration {contract['introFrames']/30:.12f}\nfile 'body-normalized.mp4'\nduration {9500/30:.12f}\n",encoding='utf8')
    dst=OUT/'Roadster_倒挂与飞行翻滚_1080p.mp4'
    run(['-f','concat','-safe','0','-i',concat,'-i',audio,'-map','0:v:0','-map','1:a:0',
         '-c:v','copy','-bsf:v','setts=pts=PTS:dts=DTS:duration=3000','-c:a','aac','-b:a','320k','-ar','48000','-ac','2',
         '-video_track_timescale','90000','-movie_timescale','90000','-movflags','+faststart',dst],'final')
    save(OUT/'encoding.json',probe(dst))
    print(json.dumps({'output':str(dst),'sha256':sha(dst),**contract},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['body','intro','final']);p.add_argument('--bridge')
    a=p.parse_args()
    if a.mode=='body':body()
    elif a.mode=='intro':
        if not a.bridge:p.error('--bridge is required')
        print(intro(a.bridge))
    else:final()
