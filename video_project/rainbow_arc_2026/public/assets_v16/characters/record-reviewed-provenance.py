import hashlib,json,datetime
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=P.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files=['rainbow_fish_v16.glb','rainbow-fish-source-v16.blend','rig-build-v16.json','rig-audit-v16.json','review-v17/multiview-and-swim-contact.jpg']
evidence=[{'path':str((P/f).relative_to(ROOT)).replace('\\','/'),'sha256':sha(P/f)} for f in files]
review={
 'version':'V16','reviewer':'/root/v14_fish','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status':'pass-within-standalone-static-and-numeric-rig-scope','source':'Original Blender procedural model and twenty-bone continuous weights',
 'evidence':evidence,'blenderExecutable':'D:/blender/blender.exe',
 'userReference':{'path':'research/iterations/v16/user-01.png','sha256':sha(ROOT/'research/iterations/v16/user-01.png'),'actuallyViewed':True},
 'sourceScript':{'path':'scripts/build-fish-v16.py','sha256':sha(ROOT/'scripts/build-fish-v16.py')},
 'runtimeAdapter':{'path':'src/FishObserverV16.ts','sha256':sha(ROOT/'src/FishObserverV16.ts')},
 'actualVisualReview':{
  'fullResolutionViews':['review-v17/front-threequarter-wide.png','review-v17/front.png','review-v17/side.png'],
  'contactSheetActuallyViewed':'review-v17/multiview-and-swim-contact.jpg',
  'contactCoverage':['front','front-threequarter','front-threequarter-wide','side','back-threequarter','swim-001','swim-031','swim-061','swim-091'],
  'finding':'V17 keeps the round mint/cream silhouette with a broad heart tail, soft body-painted blush, surface-following teal gill strokes and a glTF-compatible twenty-bone rig. Runtime applies a fixed ~40-degree three-quarter camera bias for readable eyes and fins; raised cheek-glaze meshes remain hidden in the runtime to avoid a sticker look. The standalone views remain true 3-D geometry; the runtime contour hull is applied only in Three.js and does not write depth.',
  'normalSpeedAnimationPlayback':False,
 },
 'numericRigAudit':{'path':'public/assets_v16/characters/rig-audit-v16.json','pass':True,'denseFrameCount':2024,'sourceGLBUnchangedDuringAudit':True},
 'integrationContract':{
  'load':'public/assets_v16/characters/rainbow_fish_v16.glb',
  'class':'FishObserverV16','update':'update(frame, currentCamera) after world.update and applyCamera',
  'optionalCamera':'When supplied, face uses a continuous fixed ~40-degree three-quarter bias (under .70 rad) from the active camera; update(frame) remains compatible and uses original locomotion heading without wrapped-clamp jumps.',
  'EyeReference':'Real centre-pole midpoint of EyeIrisL/EyeIrisR; not maximum-z bounding poles. Precisely anchored to local(0,1.55,0) after skeletal pose.',
  'friendTravelDistance':4.6,
 },
 'limits':['Standalone static preview and meaningful numeric rig checks only. Integrated world lighting, occlusion and final-film playback remain parent review duties.','Four rendered swim poses do not constitute every-frame visual or normal-speed animation review.'],
 'otherVersionsModified':False,'paidGenerationUsed':False,
}
(P/'provenance-v16.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(P/'provenance-v16.json')
