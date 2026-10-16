from pathlib import Path
from datetime import datetime, timezone
import json, hashlib

root=Path(__file__).resolve().parents[3]
sha=lambda p: hashlib.sha256((root/p).read_bytes()).hexdigest()
folder=root/'work/v16/camera/sky-crane-review'
contacts=json.loads((folder/'clear-contact-index.json').read_text())
sources=['src/v16/V16CameraRig.ts','src/v16/timeline.ts','src/FilmV16.tsx','src/v16/WorldV16.ts']
frames=[]
for tag in ['sky-crane-clear-main','sky-crane-clear-vertical']:
    info=json.loads((root/'tmp/v16'/f'{tag}-stills'/'stills.json').read_text())
    for f in info['shots']:
        p=f'tmp/v16/{tag}-stills/frame-{f}.jpg'
        frames.append({'aspect':'9:16' if info['vertical'] else '16:9','frame':f,'path':str(root/p),'sha256':sha(p)})
report={
 'schema':'rainbow.visual-repair-review/1','generatedUTC':datetime.now(timezone.utc).isoformat(),
 'status':'preview_pass_freeze_ready','finalEncodedVideoVerified':False,
 'changeScope':'Only V16CameraRig.apply sky-whip branch. Normal pose(), source timeline, physical model and solver channels unchanged by this repair.',
 'sourceEvidence':{p:sha(p) for p in sources},
 'renderBundle':str(root/'tmp/v16/render-runs/sky-crane-clear-main-40216-1791694913268/bundle'),
 'mechanism':'Off-axis lateral whip followed by a true camera crane to [0,32,0] looking along normalized [0.28,0.91,-0.30]. This is above the upper groups raised by 16 world units. Progress .35–.65 shares physical position, direction, FOV38, zero projection and roll across both source clocks. No geometry hiding or crossfade was added.',
 'iterations':[
  {'version':'first encoded film','finding':'Remote exploded glass panels at F3147–3148 and F3754–3756 expose hidden source cut. See preserved main-visual-review.json.'},
  {'version':'sky position Y12 preview','finding':'Removed glass grid but lifted crown still peeks at top in main F3756–3758/F5433 and vertical F1029/F1290. These preview contacts are retained as initial findings.'},
  {'version':'sky position Y32 preview','finding':'All 60 inspected frames clear of the identified glass/crown intrusions.'}
 ],
 'coverage':{'mainFrames':36,'verticalFrames':24,'uniqueAspectFramePairs':len({(f['aspect'],f['frame']) for f in frames}),'contactSheetsActuallyOpened':7,'all17TransitionQuarterMidThreeQuarterSamples':True,'fullRealTimeMotionPlayback':False,'audioListening':False},
 'contactsActuallyOpened':contacts,'framesActuallyViewedInContacts':frames,
 'observations':[
  'All nine main and eight portrait windows inspected at approximately q=.25/.5/.75; frame quantization recorded in still manifests.',
  'Two originally exposed main cuts additionally inspected through consecutive neighboring source-switch frames.',
  'The intermediate views show sky/horizon travel with no reappearance of building elements at the opposite screen edge in the inspected samples.',
  'Brand and existing chapter overlays remain stable in the sampled sky intervals. No claim is made that all overlays are generated in 3D.',
 ],
 'numericalEvidence':{'editQA':{'path':'work/v16/camera/edit-qa.json','sha256':sha('work/v16/camera/edit-qa.json')},'registry':{'path':'research/qa/v16/cinematic-shots.json','sha256':sha('research/qa/v16/cinematic-shots.json')},'typescript':'npm run check passed'},
 'limitations':['This is rendered still acceptance prior to localized final encoding. Final MP4 must receive new hash-bound media/visual evidence.','Editorial source cuts remain intentional: 9 main + 8 portrait. Do not describe the film as globally C2.','No complete real-time playback or subjective audio listening was performed by this reviewer.']
}
(folder/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':report['status'],'frames':len(frames),'rigSHA256':report['sourceEvidence'][sources[0]]}))
