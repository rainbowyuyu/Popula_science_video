"""Bind technical metadata and endpoint/interior samples to six WAN originals."""
from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,subprocess
R=Path(__file__).resolve().parents[1];O=R/'research/qa/bridges-v4';O.mkdir(parents=True,exist_ok=True)
specs=json.loads((R/'research/generation/qwen-v4-specs.json').read_text('utf8'))
mf=R/'research/generation/launch-v4-bridges.json';manifest=json.loads(mf.read_text('utf8'))
tasks=json.loads((R/'research/generation/qwen-v4-tasks.json').read_text('utf8'))
report={'originalCount':len(tasks),'selectedCount':len(manifest['bridges']),'compositionFps':60,'conceptualOnly':True,'sampleTimesS':[0,.5,1.5,2.5,3.5,4.5],
    'generationTasks':'research/generation/qwen-v4-tasks.json','clips':[]}
all_sheet=Image.new('RGB',(1920,6*380),(236,239,232));ad=ImageDraw.Draw(all_sheet)
for row,entry in enumerate(manifest['bridges']):
    name=entry['id'];spec=specs[name]
    p=R/'public/generated/v4'/(name+'.mp4')
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
    vs=next(x for x in meta['streams'] if x['codec_type']=='video');fps=vs['r_frame_rate']
    # The generated soundtrack extends the MP4 container to 5.062s. The video
    # itself is 150/30 = 5.000s: do not insert a held endpoint from audio padding.
    source_fps=eval(fps,{'__builtins__':{}})
    duration=float(vs['nb_frames'])/source_fps if vs.get('nb_frames') else float(vs.get('duration',meta['format']['duration']))
    sheet=Image.new('RGB',(1920,760),(236,239,232));d=ImageDraw.Draw(sheet);samples=[]
    for j,t in enumerate([0,.5,1.5,2.5,3.5,4.5]):
        dest=O/(name+'-'+str(j)+'.jpg')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(p),'-frames:v','1','-vf','scale=640:360',str(dest)],check=True)
        im=Image.open(dest).convert('RGB');x=(j%3)*640;y=(j//3)*380+20
        sheet.paste(im,(x,y));d.text((x+8,y-17),name+' / '+str(t)+'s',fill=(28,54,59))
        thumb=im.resize((320,180));all_sheet.paste(thumb,(j*320,row*380+25))
        samples.append(str(dest.relative_to(R)).replace('\\','/'))
    sheet.save(O/(name+'-contact.jpg'),quality=94)
    ad.text((10,row*380+4),name+' — originals at 0 / .5 / 1.5 / 2.5 / 3.5 / 4.5 s',fill=(28,54,59))
    # Source and destination endpoint thumbs make qualitative comparison easy.
    for j,k in enumerate(['first','last']):
        im=Image.open(R/'public/generated/v4'/spec[k]).convert('RGB').resize((320,180))
        all_sheet.paste(im,(j*320,row*380+200))
    entry['sourceDurationSeconds']=duration;entry['sourceFps']=source_fps
    report['clips'].append({'id':name,'asset':str(p.relative_to(R)).replace('\\','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
       'taskId':tasks[name]['taskId'],'width':vs['width'],'height':vs['height'],'sourceFps':fps,'sourceDurationSeconds':duration,
       'sourceFrameCount':vs.get('nb_frames'),'compositionFrames':int((duration-entry.get('sourceTrimSeconds',0))*60),'motionSamples':samples,
       'technicalPass':vs['width']==1920 and vs['height']==1080 and 4.9<duration<5.2,'visualReview':'pending','notEvidence':True})
all_sheet.save(O/'all-bridges-contact.jpg',quality=94)
mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
(R/'research/qa/launch-v4-bridges.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'clips':len(report['clips']),'technicalPass':all(c['technicalPass'] for c in report['clips']),'contactSheet':str(O/'all-bridges-contact.jpg')}))
