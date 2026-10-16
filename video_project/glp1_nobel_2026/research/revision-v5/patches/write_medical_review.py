import datetime
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
mf = json.loads((root / 'research/qa/final-v5/frame-manifest.json').read_text(encoding='utf8'))
zoom_files = ['zoom-h008.jpg','zoom-h009.jpg','zoom-h014.jpg','zoom-h020.jpg','zoom-h021.jpg','zoom-h022.jpg','zoom-h023.jpg','zoom-h025.jpg','zoom-h033.jpg','zoom-h035.jpg','zoom-h042.jpg','zoom-h051.jpg','zoom-h058.jpg','zoom-h059.jpg','zoom-h062.jpg','zoom-h070.jpg','zoom-h073.jpg','zoom-h074.jpg']
micro_files = [f'microBoundaries-{i:02d}.jpg' for i in range(1, 13)]
def sha(name):
    return hashlib.sha256((root / 'research/qa/final-v5/contacts' / name).read_bytes()).hexdigest()
zoom = {x['id']: x['frames'] for x in mf['zoomWindows']}
micro = {x['label']: [z['frame'] for z in x['frames']] for x in mf['microBoundaries']}
observations = [
 {'severity':'blocking','scope':'h026-h027 drug visual','frames':[7235,7393,7737], 'finding':'Current encoded video shows the h026 peptide/cleavage detail barely resolved at F7235/F7393 and h027 already pulled away at F7737. DrugDetail/V5CameraPath patch was prepared; this SHA is pre-patch.'},
 {'severity':'blocking','scope':'h025-h026 transition','frames':[7097,7171], 'finding':'Stomach-to-drug handoff briefly leaves mostly blank background with a fragment at the right edge; a middle-context handoff is needed.'},
 {'severity':'major','scope':'h033 entry','frames':[9306], 'finding':'At h033 F9306 the liver/heart remain behind the seated body and the liver leader lands near the face; later frames recover.'},
 {'severity':'major','scope':'h051 exit','frames':[14501,14549], 'finding':'At h051 nephron exit the frame is filled by a near opaque torso/body layer and the nephron is no longer visible.'},
 {'severity':'observation','scope':'all sampled mechanisms','frames':[], 'finding':'Scale rulers remain visible. Sampled GLUT4, beta-cell insulin release, receptor, LDL clearance/statin, CPAP, CCB/ARB, platelet/fibrin and anticoagulant semantics match the frozen narration. Still images cannot certify continuous motion.'},
]
out = {
 'reviewType':'scoped medical visual review',
 'reviewedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'videoSHA256':hashlib.sha256((root/'delivery/GLP1_V5_1080p.mp4').read_bytes()).hexdigest(),
 'timelineSHA256':hashlib.sha256((root/'src/timeline.json').read_bytes()).hexdigest(),
 'actualFilesViewed': {'zoom':[{'file':f,'sha256':sha(f),'frames':zoom.get(f[5:-4],[])} for f in zoom_files], 'micro':[{'file':f,'sha256':sha(f),'frames':micro.get(f,[])} for f in micro_files]},
 'sampledVisualReviewCompleted':True,
 'blockingIssues':[x for x in observations if x['severity']=='blocking'],
 'observations':observations,
 'limitations':['Viewed 18 zoom and 12 micro contact sheets plus selected original frames; no claim of frame-by-frame full-duration viewing, continuous playback, full listening, or clinical certification.','Blocking drug findings refer to the current pre-patch encoded SHA.'],
}
(root/'research/qa/final-v5/medical-visual-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
