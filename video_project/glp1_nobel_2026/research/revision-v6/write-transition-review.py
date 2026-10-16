from pathlib import Path
import hashlib,json
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'research/qa/final-v5'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def rel(p): return p.relative_to(ROOT).as_posix()
video='c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4'
timeline='e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0'
master='dec0de170d5796dadad56323e11041195049e3c0e4c365e4ed50f17fa15b1146'
assert sha(ROOT/'delivery/GLP1_V5_1080p.mp4')==video
assert sha(ROOT/'src/timeline.json')==timeline
assert sha(ROOT/'public/master.wav')==master
main=read(BASE/'frame-manifest.json')
focus=read(BASE/'focus-v6/c9f90b7b6c2f79a9/manifest.json')
dense=read(BASE/'focus-continuity-v6/c9f90b7b6c2f79a9/manifest.json')
actual=[]
def record(p,frames,observation):
 actual.append({'path':rel(p),'sha256':sha(p),'frames':frames,'observation':observation,'actuallyOpenedWithViewImage':True})
for i in range(18):
 rows=main['handoffs'][i*5:(i+1)*5]
 record(BASE/f'contacts/all-handoffs-{i+1:02d}.jpg',[f for r in rows for f in r['frames']], 'Before/after pair review; no new hard cut identified at these sparse samples. Dense review finds two separate weak-reference intervals below.')
for kind,count in [('sectionBoundaries',1),('microBoundaries',12)]:
 for i in range(count):
  rows=main[kind][i*3:(i+1)*3]
  record(BASE/f'contacts/{kind}-{i+1:02d}.jpg',[f['frame'] for r in rows for f in r['frames']], 'Same anchored scene and coherent camera progression at sampled boundaries; micro overview visibility prompted additional dense checks.')
focus_groups={'h070-scale-bridge','h070-scale-bridge-dense','wardrobe-depth-order','blood-state-handoff','heart-return-first','heart-return-second'}
for m in focus['contactSheets']:
 if m['groupId'] in focus_groups:
  p=ROOT/m['path'];assert sha(p)==m['sha256']
  record(p,m['frames'],'Reviewed actual encoded repair focus frames. Previous h070, wardrobe, blood-state, and opaque heart-return blockers did not recur in these samples.')
for m in dense['contactSheets']:
 p=ROOT/m['path'];assert sha(p)==m['sha256']
 record(p,m['frames'], 'Dense continuity review. h042 and h073 have unreadable-reference intervals; h025 retains a faint particle cloud. Three motion-flag windows preserve digestive anatomy continuously.')
natives=[7162,12127,12130,12133,12134,12135,20463,20468,20470]
for f in natives:
 record(BASE/f'focus-continuity-v6/c9f90b7b6c2f79a9/frames/frame-{f:06d}.jpg',[f], 'Opened at native 1920x1080 to judge weak reference visibility; see frame-specific findings.')
assert len(actual)==77,(len(actual),len(focus_groups))
blockers=[
 {'id':'HF-H042-REFERENCE-GAP','severity':'must-fix-before-approval','frames':[12127,12135],'coreFrames':[12130,12134], 'finding':'LDL receptor shrinks to faint marks; at native resolution the foreground object is practically unreadable before the first red-cell sliver enters. This is an optical-reference failure, not proof geometry literally vanishes.', 'rootCause':'V5CameraPath.viewOf resolves h042 to lipoprotein, while V5HandoffContext uses timeline.view=liver, so the existing platelet/context annotation is not activated.', 'repairStatus':'Isolated candidate prepared; not certified in final MP4 by this report'},
 {'id':'HF-H073-REFERENCE-GAP','severity':'must-fix-before-approval','frames':[20463,20472],'coreFrames':[20465,20469], 'finding':'The micro tissue plane becomes extremely faint before the existing parent lesion becomes readable. Native F20468 has almost no readable scene reference.', 'rootCause':'customMicro suppression retires the micro patch earlier than the millimetre lesion becomes sufficiently opaque on the return.', 'repairStatus':'Isolated candidate prepared; not certified in final MP4 by this report'}
]
manifests=[BASE/'frame-manifest.json',BASE/'focus-v6/c9f90b7b6c2f79a9/manifest.json',BASE/'focus-continuity-v6/c9f90b7b6c2f79a9/manifest.json']
report={
 'reviewType':'Actual sampled visual review of encoded V6 handoffs, scale transitions and dense focus windows',
 'reviewedAtUTC':datetime.now(timezone.utc).isoformat(),'reviewer':'transition_audit_now','status':'rejected-two-local-optical-reference-gaps',
 'videoSHA256':video,'timelineSHA256':timeline,'masterSHA256':master,
 'automaticReportSHA256':sha(BASE/'automatic-report.json'),'renderMarkerSHA256':sha(ROOT/'tmp/final-render.json'),
 'evidenceManifests':[{'path':rel(p),'sha256':sha(p)} for p in manifests],
 'actualFilesViewed':actual,
 'scope':{'contactSheetsOpened':68,'nativeFramesOpened':9,'distinctFramesRepresented':len({f for a in actual for f in a['frames']}),'handoffPairs':len(main['handoffs']),'sheetDisplay':'Large sheets were automatically downscaled in the tool display; nine weakest frames were additionally viewed at native resolution.','unreviewedScope':'No claim of every-frame subjective playback or full-duration audio listening.'},
 'blockingIssues':blockers,'openBlockingFindings':blockers,
 'resolvedFindings':[
  {'id':'HF-H070-REFERENCE-GAP','finding':'Plaque and tissue overlap through sampled F19610-F19760 and every frame F19660-F19686; previous near-empty passage not reproduced.'},
  {'id':'WARDROBE-DEPTH-JUMP','finding':'Every encoded frame F3523-F3529 retains teal shorts; previous F3525-F3526 depth-order jump not reproduced.'},
  {'id':'BLOOD-STATE-HANDOFF','finding':'Every encoded frame F21332-F21342 shows gradual wall/flow/lesion transition rather than one-frame creation.'},
  {'id':'HEART-RETURN-OPAQUE-SURFACE','finding':'F20535-F20585 and F21670-F21730 at five-frame spacing retain continuous anatomical context, without an opaque stray foreground facet in these samples.'}],
 'findings':[
  {'id':'HF-H025-LOW-CONTRAST','status':'nonblocking-limitation','frames':[7145,7186],'finding':'Tiny plasma protein cloud remains visible while the red cell exits. Native F7162 confirms continuity, although the cloud is low contrast at phone display size.'},
  {'id':'MOTION-FLAGS-DIGESTIVE','status':'sampled-pass','frames':[1852,1853,1854,1855,2649,2650,2651,2652,2653,5616,5617,5618,5619,5620,5621,5622,5623],'finding':'Organ group translates and changes view continuously; no abrupt geometry removal in these every-frame samples.'},
  {'id':'PAPER-CODA','status':'sampled-pass','finding':'Sampled section boundary shows horizontal camera departure from the meal and reference-page entrance; page images stay full card with captions beneath.'}],
 'limitations':['Faint tissue layers and anatomical surface/cloth facets remain visible in some close views.','Contact sheets verify sampled visual continuity, not perceptual smoothness of every frame during normal-speed playback.','The field is educational visualization, not patient-specific physiology or validated local CFD.'],
 'sampledVisualReviewCompleted':True,'fullDurationSubjectivePlaybackCompleted':False,'fullDurationSubjectiveAudioListeningCompleted':False,
 'sourceEditsPerformed':False,'isolatedResearchCandidateEditsPerformed':True,
 'candidateDirectory':'research/revision-v6/continuity-repair','candidateInstalledByReviewer':False
}
out=BASE/'review-transitions-v6.json'
assert not out.exists(),'Refusing to overwrite an existing independent review'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'path':rel(out),'sha256':sha(out),'actualFilesViewed':len(actual),'scope':report['scope']},ensure_ascii=False,indent=2))
