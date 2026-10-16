"""Inspect the encoded film, not merely its render configuration."""
from pathlib import Path
import json
import subprocess
import sys
import concurrent.futures
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/hypertension'
VIDEO = ROOT / 'output/hypertension/hypertension_1080p.mp4'
TIMELINE = json.loads((ROOT / 'src/hypertension/timeline.json').read_text(encoding='utf8'))
OUT = RESEARCH / 'encoded-continuous-frames'

def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf8', errors='replace')
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result

def verify(kind):
    base = ['ffmpeg', '-hide_banner', '-nostdin', '-threads', '2', '-i', str(VIDEO)]
    if kind == 'decode':
        args = base[:1]+['-v', 'error']+base[1:]+['-f', 'null', '-']
    elif kind == 'blackdetect':
        args = base+['-vf', 'blackdetect=d=0.5:pix_th=0.05', '-an', '-f', 'null', '-']
    else:
        args = base+['-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']
    result = run(args)
    (RESEARCH / f'encoded-continuous-{kind}.txt').write_text(result.stderr, encoding='utf8')
    return kind, result.stderr

def grab(frame):
    dst = OUT / f'{frame:05d}.jpg'
    run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-threads','1','-ss',str(frame/30),'-i',str(VIDEO),'-frames:v','1','-q:v','2','-y',str(dst)])
    return frame

def contact(frames, name, cols=4):
    sheet = Image.new('RGB', (cols*480, ((len(frames)+cols-1)//cols)*300), '#e8e5df')
    draw = ImageDraw.Draw(sheet)
    for i, frame in enumerate(frames):
        im = Image.open(OUT/f'{frame:05d}.jpg').convert('RGB')
        im.thumbnail((472,266))
        x,y=(i%cols)*480,(i//cols)*300
        sheet.paste(im,(x+4,y+26))
        draw.text((x+9,y+7),f'{frame/30:.2f}s  /  frame {frame}',fill='#263e43')
    sheet.save(RESEARCH/name, quality=94)

def main():
    OUT.mkdir(exist_ok=True)
    probe = json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(VIDEO)]).stdout)
    (RESEARCH/'encoded-continuous-probe.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2),encoding='utf8')
    v = next(s for s in probe['streams'] if s['codec_type']=='video')
    assert (v['width'],v['height']) == (1920,1080)
    assert int(v['nb_frames']) == TIMELINE['duration']
    checks = {}
    if '--reuse-measurements' in sys.argv:
        checks={kind:(RESEARCH/f'encoded-continuous-{kind}.txt').read_text(encoding='utf8') for kind in ['decode','blackdetect','loudness']}
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for kind, log in pool.map(verify, ['decode','blackdetect','loudness']):
                checks[kind] = log
    assert not checks['decode'].strip(), 'Decode produced an error'
    assert 'black_start:' not in checks['blackdetect'], 'Sustained black frame interval'
    loud = json.JSONDecoder().raw_decode(checks['loudness'][checks['loudness'].rfind('{'):])[0]
    assert float(loud['input_tp']) <= -1, loud
    selected=['h025','h028','h001','h006','h007','h008','h009','h011','h012','h013','h016','h017','h018','h019','h020','h022','h024','h026','h027','h030','h031','h032','h034','h036','h038','h039','h040','h040a','h040b','h040c','h041','h042','h043','h044','h047','h048','h050']
    clip_by_id={c['id']:c for c in TIMELINE['clips']}
    def at(clip_id,fraction):
        c=clip_by_id[clip_id]
        return round(c['start']+fraction*c['duration'])
    middle=[at(c,.64) for c in selected]
    middle.extend([TIMELINE['scenes'][-1]['start']+150,TIMELINE['duration']-30])
    boundaries=[]
    for scene in TIMELINE['scenes'][1:]:
        boundaries.extend(scene['start']+d for d in [-2,0,30,65,110,165])
    extra=[at(c,f) for c in ['h004','h017','h023','h024','h025','h028','h032','h040a','h040b','h040c','h041','h045'] for f in [.05,.3,.55,.8,.98]]
    extra.extend([2855,2890,2938,2985,3120,4291,4522,4697,5191,5529,6998,7034,7487])
    extra.extend([7429,7430,7545,7600,7680,7710,7757,7825,7870,7939,7990,8047,8080,8180,8181])
    extra.extend([8011,8025,8035,8055,8065])
    annotations=[]
    revision=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--revision=')),'vascular-continuous-v4')
    if 'v6' in revision or 'v7' in revision or 'v8' in revision or 'v9' in revision:
        annotations=[690,1007,1168,1350,1537,2046,2980,3120,3325,3830,4090,4337,4522,4697,5220,5385,5529,5890,6060,6578,6955,7080,7213,7340,7400,7598,7710,7790,7950,8660,8820,8890]
        annotation_qa=json.loads((RESEARCH/('annotations-v7-qa.json' if ('v7' in revision or 'v8' in revision or 'v9' in revision) else 'annotations-v6-qa.json')).read_text(encoding='utf8'))
        assert annotation_qa['passed']
        annotations=sorted(set(annotations+[c['representativeFrame'] for c in annotation_qa['cues']]))
        extra.extend([6870,6922,6941,6970,7034,7075,7109,8650,8730,8790,8851,8920,9000])
    if 'v7' in revision or 'v8' in revision or 'v9' in revision:
        # This revision changes the measurement geometry and full soundtrack.
        # Review the new passage densely and sample the reused V6 content;
        # do not count historical V6 images as new encoded-frame inspection.
        middle=[0,690,1007,3120,4697,7340,7790,8340,8665,8840,9000,9470,9641]
        boundaries=[7998,7999,8000,8001,8180,8260,8267,8300,8340,9120,9260,9311,9400]
        extra=list(range(8500,9041,45))+[8730,8755,8790,8851,8890,8929,9000]
        annotations=[8665,8755,8840,8929]
    frames=sorted(set(f for f in middle+boundaries+extra+annotations if 0<=f<TIMELINE['duration']))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(grab,frames))
    contact(middle,'encoded-continuous-contact.jpg')
    contact_sheets=['encoded-continuous-contact.jpg']
    for i in range(0,len(middle),20):
        name=f'encoded-current-overview-{i//20+1}.jpg';contact(middle[i:i+20],name);contact_sheets.append(name)
    for i in range(0,len(boundaries),18):
        name=f'encoded-transitions-{i//18+1}.jpg';contact(boundaries[i:i+18],name,cols=3);contact_sheets.append(name)
    for i in range(0,len(extra),15):
        name=f'encoded-dolly-detail-{i//15+1}.jpg';contact(extra[i:i+15],name,cols=3);contact_sheets.append(name)
    for i in range(0,len(annotations),12):
        name=f'encoded-annotations-{i//12+1}.jpg';contact(annotations[i:i+12],name,cols=3);contact_sheets.append(name)
    summary={'revision':revision,'video':str(VIDEO),'frames':v['nb_frames'],'videoSeconds':v['duration'],'audioSeconds':next(s['duration'] for s in probe['streams'] if s['codec_type']=='audio'),'decodePassed':True,'blackIntervals':0,'loudness':loud,'sampleFrames':frames,'sampleCount':len(frames),'visualInspection':'pending model inspection of encoded contact sheets'}
    summary['contactSheets']=contact_sheets
    (RESEARCH/'encoded-continuous-qa.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in summary.items() if k not in ['sampleFrames','loudness']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
