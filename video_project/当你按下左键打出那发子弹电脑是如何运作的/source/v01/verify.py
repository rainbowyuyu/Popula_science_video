"""Technical checks are not a subjective watch/listen review."""
from pathlib import Path
import subprocess,json,hashlib,re
from prepare import write
import revision
ROOT=revision.ROOT
VIDEO=revision.VIDEO
PREVIOUS=revision.PREVIOUS_VIDEO

def command(args,name):
    p=subprocess.run(args,cwd=ROOT,capture_output=True,encoding='utf-8',errors='replace')
    write(ROOT/f'work/v01/{name}.log',(p.stdout+'\n'+p.stderr).encode('utf-8'))
    return p

if __name__=='__main__':
    p=command(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(VIDEO)],'probe')
    assert p.returncode==0,p.stderr
    meta=json.loads(p.stdout);vs=[x for x in meta['streams'] if x['codec_type']=='video'];aus=[x for x in meta['streams'] if x['codec_type']=='audio'];v=vs[0]
    decode=command(['ffmpeg','-v','error','-xerror','-i',str(VIDEO),'-map','0:v','-f','null','-'],'full_decode')
    black=command(['ffmpeg','-hide_banner','-i',str(VIDEO),'-vf','blackdetect=d=0.1:pix_th=0.1:pic_th=0.98','-an','-f','null','-'],'blackdetect')
    detected=re.findall(r'black_start:[^\r\n]+',black.stderr)
    checks={'resolution':v['width']==1280 and v['height']==720,'fps':v['avg_frame_rate']=='24/1','frames':int(v['nb_read_frames'])==576,'duration':abs(float(meta['format']['duration'])-24)<.01,'fullDecode':decode.returncode==0,'blackDetectionCommand':black.returncode==0,'noBlackIntervalsOver100ms':not detected,'intentionallyNoAudio':len(aus)==0}
    model=json.loads((ROOT/'work/v01/mechanism.json').read_text(encoding='utf-8'));checks['sixGeometryTests']=len(model['tests'])==6 and all(t['pass'] for t in model['tests'])
    assets=[]
    for rel in ['source/v01/scene.py','source/v01/render.py','source/v01/mechanism.py','source/v01/narration.md','source/v01/edit_contract.json','source/v01/shot_timing.json','subtitles/v01/preview.ass','assets/brand/logo.png','assets/v01/mechanism_scene_r2.blend','output/v01/mechanism_preview_v01.mp4']:
        path=ROOT/rel;assets.append({'path':rel,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    report={'kind':'24-second silent prototype, NOT finished episode','checks':checks,'probe':meta,'blackIntervals':detected,'assets':assets,'visualInspection':{'actuallyInspected':['work/v01/frames/0001.png','work/v01/frames/0218.png','work/v01/frames/0385.png','output/v01/review_0001.png','output/v01/review_0385.png'],'findings':['First revision clipped monitor and occluded ray intersection; revision 2 corrects these in inspected frames.','Original dark-line logo was weak on dark background; final compose adds white backing. Final backing not visually re-inspected because frame tool limit reached.'],'allTransitionsInspected':False,'continuousPlaybackReviewed':False,'finalEncodedFramesVisuallyReviewed':False},'audio':{'present':False,'loudnessPeakSilenceAVSync':'not applicable to intentional silent prototype','subjectiveListeningChecked':False},'blockers':['Real Danking/ZywOo clip not provided; no authentic opening or ending.','No TTS or actual narration timing yet.','Source SDK 2013 is not CS:GO implementation evidence; CS:GO-specific fact review still needed.','GPU/display/audio detailed scene not yet built.']}
    write(ROOT/'work/v01/verification.json',json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps({'checks':checks,'allTechnicalChecksPassed':all(checks.values()),'output':str(VIDEO),'sha256':assets[-1]['sha256'],'continuousPlaybackReviewed':False,'subjectiveListeningChecked':False},ensure_ascii=False,indent=2))
    assert all(checks.values()),checks
