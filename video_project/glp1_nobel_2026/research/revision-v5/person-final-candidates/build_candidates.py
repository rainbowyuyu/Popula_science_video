from pathlib import Path
import json, hashlib, difflib
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
EVIDENCE = "{\"openedSheets\":[\"opening-meal-01\",\"opening-anatomy-handoff-01\",\"opening-anatomy-handoff-02\",\"meal-return-h012-01\",\"meal-return-h030-01\",\"meal-return-h040-01\",\"meal-return-h052-01\",\"seat-to-walk-01\",\"seat-to-walk-02\",\"sit-stand-training-01\",\"sit-stand-training-02\",\"measurement-anatomy-to-person-01\",\"measurement-anatomy-to-person-02\",\"measurement-entry-01\",\"measurement-entry-02\",\"measurement-exit-to-anatomy-01\",\"measurement-exit-to-anatomy-02\",\"later-walk-01\",\"weight-feedback-person-01\",\"meal-to-measurement-01\",\"meal-to-measurement-02\",\"meal-to-measurement-03\",\"closing-measurement-to-anatomy-01\",\"closing-measurement-to-anatomy-02\"],\"openedFrames\":[3470,4260,4300,18590,22260,23543,24045],\"additional\":[21808,23173,23737,24894]}"
opened = json.loads(EVIDENCE)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

source_path = ROOT / 'src/V5Person.ts'
source = source_path.read_text(encoding='utf-8')
old = 'm.opacity=k;m.transparent=k<1;m.depthWrite=true'
new = 'm.opacity=k;m.transparent=true;m.depthWrite=k>=.998'
assert source.count(old) == 1
candidate = source.replace(old, new)
old_prop = 'this.alpha(this.diningProps,propsOpacity*Math.min(1,eatWeight+sitWeight));this.alpha(this.utensil,propsOpacity*eatWeight);this.chair.position.z=-.21*(1-seated);'
new_prop = '''this.alpha(this.diningProps,propsOpacity*Math.min(1,eatWeight+sitWeight));
  // Retire the dining utensil before measurement begins to move the hand.
  // The final measurement writer owns the arm; an unbound spoon must not
  // continue using the earlier dining grip while that hand travels away.
  const utensilHandoff=1-smooth(measurementWeight/.06);
  this.alpha(this.utensil,propsOpacity*eatWeight*utensilHandoff);this.chair.position.z=-.21*(1-seated);'''
assert candidate.count(old_prop) == 1
candidate = candidate.replace(old_prop, new_prop)
(OUT / 'V5Person.candidate.ts').write_text(candidate, encoding='utf-8')
(OUT / 'V5Person.candidate.diff').write_text(''.join(difflib.unified_diff(source.splitlines(True),candidate.splitlines(True),fromfile='src/V5Person.ts',tofile='research/revision-v5/person-final-candidates/V5Person.candidate.ts')),encoding='utf-8')

tl = json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8-sig'))
clips = tl['clips']
def smooth(x):
    u = min(1,max(0,x))
    return u*u*u*(u*(u*6-15)+10)
def weight(f, views):
    values = [0.0]
    for i,c in enumerate(clips):
        if c.get('view') not in views: continue
        before = clips[i-1]['duration'] if i else 120
        after = clips[i+1]['duration'] if i+1<len(clips) else 120
        values.append(smooth((f-(c['start']-before*.38))/max(45,before*.35))*(1-smooth((f-c['end'])/max(75,after*.58))))
    return max(values)
records=[]
for frame in [21808,23173,23737,24880,24894,24940]:
    w=weight(frame,['meal','action_meal','homecheck','muscle'])
    records.append({'frame':frame,'semanticPersonWeight':w,'bodyAlphaBeforeOptical':.065+.935*w,'organMultiplierBeforeOptical':1-.999*smooth(w/.06)})
(OUT/'ghost-alpha-analysis.json').write_text(json.dumps({'method':'CPU evaluation of current V5World viewWeight and alpha equations; assumes optical gate 1 in macro shots. This is source algebra, not an executed GPU diagnosis.','timelineSHA256':sha(ROOT/'src/timeline.json'),'V5WorldSHA256':sha(ROOT/'src/V5World.ts'),'samples':records},indent=2)+'\n',encoding='utf-8')

manifest_path=ROOT/'research/qa/final-v5/person-current/manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8-sig'))
assert manifest['videoSHA256']=='cd708646f4815878d84f422bd4e3bb2a072178d8ffc760d96c556b3902d7ee21'
assert manifest['videoSHA256']==sha(ROOT/manifest['video'])
assert manifest['timelineSHA256']==sha(ROOT/'src/timeline.json')
assert len(opened['openedSheets'])==24
files=[]
for name in opened['openedSheets']:
    item=next(x for x in manifest['contactSheets'] if Path(x['path']).stem==name)
    assert sha(ROOT/item['path'])==item['sha256']
    files.append({'path':item['path'],'sha256':item['sha256'],'kind':'contact-sheet','frames':item['frames'],'actuallyOpened':True})
for frame in opened['openedFrames']:
    item=next(x for x in manifest['frames'] if x['frame']==frame)
    assert sha(ROOT/item['path'])==item['sha256']
    files.append({'path':item['path'],'sha256':item['sha256'],'kind':'full-resolution-frame','frames':[frame],'actuallyOpened':True})
for frame in opened['additional']:
    p=ROOT/f'research/qa/final-v5/frames/frame-{frame:06d}.jpg'
    files.append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'kind':'full-resolution-additional-main-QA-frame','frames':[frame],'actuallyOpened':True})
unique=sorted(set(f for item in files for f in item['frames']))
report={
 'reviewedAtUTC':datetime.now(timezone.utc).isoformat(),
 'video':manifest['video'],'videoSHA256':manifest['videoSHA256'],'timelineSHA256':manifest['timelineSHA256'],
 'frameManifestSHA256':sha(manifest_path),'automaticReportSHA256':manifest['automaticReportSHA256'],
 'reviewMethod':'Actually opened all 24 contact sheets, 7 person original frames, and 4 additional main-QA original frames. No continuous playback or audio listening claimed.',
 'openedFiles':files,'uniqueFrames':unique,'personManifestFramesReviewed':len(manifest['frames']),'uniqueFramesReviewed':len(unique),
 'sampleReviewCompleted':True,'acceptedWithinReviewedScope':False,'status':'changes-required',
 'fullDurationSubjectivePlaybackCompleted':False,'fullDurationSubjectiveAudioListeningCompleted':False,
 'findings':[
  {'id':'PERS-FINAL-01','severity':'high','frames':[3470],'finding':'A rectangular missing band crosses the screen-right lower leg. Confirmed in full-resolution encoded frame. Current fading dining props keep depthWrite=true before the EqualDepth skin surface; depth occlusion is a supported source hypothesis requiring controlled GPU comparison.','action':'Candidate limits fading non-wardrobe props depth writes. Recheck the exact frame and adjacent motion after controlled render.'},
  {'id':'PERS-FINAL-02','severity':'high','frames':[4260,4300],'finding':'Return from the muscle detail reveals an extreme waist/hip close-up. The angular dark waist/crotch folds dominate the frame; acceptance of a mild crease in earlier wide stills does not cover this close shot.','action':'Camera/World specialist owns optically gated figure reveal and broad arrival. Review source and final samples around both directions.'},
  {'id':'PERS-FINAL-03','severity':'medium','frames':[24030,24045,24060,24075],'finding':'Dining spoon remains near the chest after the hand has moved toward the measurement pose. F24045 original frame clearly separates utensil and hand.','action':'Sequence utensil retirement before the handoff, or bind utensil to the final posed hand. A minimal early retirement candidate is supplied but not rendered or accepted.'},
  {'id':'PERS-FINAL-04','severity':'high','frames':[21808,23173,23737,24894],'finding':'Main-QA originals show only a very faint external figure, with explanatory organs suppressed. Source algebra shows incoming person weights about 0.074–0.080 reduce the organ multiplier to 0.001 while body alpha stays 0.134–0.140.','action':'Coordinate organ retirement with readable exterior opacity; avoid a global torso whitelist that would erase metabolic-links and other organ teaching views. Camera/World specialist notified.'}
 ],
 'positiveObservations':[
  'Stable opening, dining and measurement samples use one consistent person and coherent shorts with two leg openings. No return of the former broad seated thigh breakthrough was found in the reviewed stable poses.',
  'F18590 cuff follows the upper arm, forearm has a visible support and no isolated floating cuff is present in stable measurement samples.',
  'Four revised anatomy-to-meal returns h012/h030/h040/h052 establish a wider view before the seated person becomes dominant; the previously oversized facial entrances are reduced.',
  'F23543 waistband is continuous with the abdomen; no separate loose ring is visible in this encoded full-resolution sample.'
 ],
 'limitations':[
  'Still samples cannot establish full continuous motion quality, freedom from foot sliding or frame-to-frame flicker.',
  'No audio was listened to in this review; polyphone correctness remains outside this scope.',
  'The cloth is a skin-attached teaching mesh, not simulated fabric; angular folds remain visible during intermediate hip poses.',
  'All findings and file hashes belong to video cd708646f4815878; a new encode must be rechecked.'
 ],
 'candidateFiles':{'person':'research/revision-v5/person-final-candidates/V5Person.candidate.ts','diff':'research/revision-v5/person-final-candidates/V5Person.candidate.diff','algebra':'research/revision-v5/person-final-candidates/ghost-alpha-analysis.json'},
 'candidateState':'Not installed in production; no GPU render performed; no art acceptance of candidates.'
}
review=manifest_path.parent/'visual-review-final-cd708646.json'
review.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'candidate-manifest.json').write_text(json.dumps({'createdUTC':datetime.now(timezone.utc).isoformat(),'source':'src/V5Person.ts','baseSHA256':sha(source_path),'candidateSHA256':sha(OUT/'V5Person.candidate.ts'),'productionModified':False,'gpuRenderExecuted':False,'reviewPath':review.relative_to(ROOT).as_posix(),'reviewSHA256':sha(review)},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'review':str(review),'openedSheets':len(opened['openedSheets']),'uniqueFrames':len(unique),'sourceSHA256Unchanged':sha(source_path),'candidate':str(OUT/'V5Person.candidate.ts')}))
