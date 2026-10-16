from pathlib import Path
import json,hashlib
root=Path.cwd();folder=root/'research/revision-v8/camera'
source={str(p.relative_to(root)):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [root/'src/V5World.ts',root/'src/V5CameraPath.ts',root/'src/V7Director.ts']}
report={'scope':'V8 spatial handoff and camera-source review; not a claim of full final encoded film review','source':source,'changes':[
'Pancreas: actual mesh anterior triangle intersections and local surface-normal basis; fixed physical child offsets rotated together. Lobule samples clipped to actual front/back tissue intervals instead of a floating round planar field.',
'Midscale pancreatic lobules: 4579 accepted fixed physical samples, deterministic irregular 3D packing; micrometre acinar jitter registered to same basis; parent opacity overlaps child optical range.',
'Artery: 24-sample-smoothed tangent of atlas-derived descending-aorta centerline; local X aligns to flow tangent, local Z to anterior cross-section vector; actual source window opens in same axial region. Representative 10mm lumen dimensions remain unchanged.',
'Aortic section annotations sampled from actual mesh rays; 40mm straight representative segment has at most 1.09mm centerline-to-tangent deviation over chosen local range. It is not a patient-specific lumen reconstruction.',
'GLP h026/h027 restored to one drug observation group at 24nm; plasma anchor lies on atlas-derived inferior vena cava route. h026 first35% retains travel; spoken progress maps to cleavage0-.5, h027 spoken progress maps .5-1.',
'h027 holds completed engineering state through narrated ending, departure uses voiceEndSeconds+1s and h028 first60%; later pause changes do not delay molecular animation.',
'Muscle transport group h008-h015 observation distance set to850nm; no per-sentence rezoom.'
], 'visualEvidence':[
{'stage':'baseline','purpose':'before changes; regular flat circles and detached artery observed'},
{'stage':'registered01','purpose':'first actual geometry registration; reviewed surface direction and child anchors'},
{'stage':'registered02','purpose':'refined acinar visibility and actual source arterial optical window'},
{'stage':'pancreatic-motion','frames':[5830,6060],'fps':30,'video':'pancreatic-motion/transition.mp4','review':'pancreatic-motion/review.jpg','reviewScope':'dense ordered frame sheet plus native intermediate stills; 231 source frames encoded, no audio'},
{'stage':'arterial-motion','frames':[12980,13140],'fps':30,'video':'arterial-motion/transition.mp4','review':'arterial-motion/review.jpg','reviewScope':'dense ordered frame sheet; 161 source frames encoded, no audio'},
{'stage':'oblique-left and oblique-right','yawRadians':[-.28,.28],'review':'oblique-review.jpg','purpose':'13 identical intermediate frames at each diagnostic viewing angle; source mesh spatial fit persists'},
{'stage':'glp-atlas-surface01','review':'glp-atlas-surface01/review.jpg','finding':'Real DPP4 surface occluded cut site; reported to root for transparency/orientation repair. Protein geometry and molecular UI are root-owned.'},
{'stage':'glp-context02','review':'glp-context02/review.jpg','purpose':'same IVC plasma handoff, retentive venous wall and fixed erythrocyte scale bridge'}
], 'validation':{'typescript':'npm run check passed','geometryBoundaries':'illustrative meso/micro tissue and 10mm arterial lumen remain teaching models; no patient histology, measured flow, or molecular dynamics claims'},'pending':['Recheck GLP camera/labels on staged V8 measured narration timeline after root DPP4/albumin modifications; source checks before that use original current timings.','Final encoded-film, audio/phonetics, clothing and body-action QA remain parent and other agents scope.']}
(folder/'camera-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(folder/'camera-audit.json')
