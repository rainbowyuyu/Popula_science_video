"""Verify exported GLB geometry and continuous instantiated chain evidence."""
from pathlib import Path
import json,struct,hashlib,math
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
blob=(ROOT/'public/assets/v18/reference-platform.glb').read_bytes()
size=struct.unpack('<I',blob[12:16])[0];glb=json.loads(blob[20:20+size]);nodes=glb['nodes']
layout=json.loads((ROOT/'public/assets/v18/visual-layout.json').read_text())
def local_y_up_angle(node):
 x,y,z,w=node.get('rotation',[0,0,0,1]);up_y=1-2*(x*x+z*z)
 return math.degrees(math.acos(min(1,max(-1,up_y))))
bases=[n for n in nodes if n.get('name','').startswith('BallastBase_')]
columns=[n for n in nodes if n.get('name','').startswith('OuterColumn_')]
forbidden=[n['name'] for n in nodes if n.get('name') in ('CentralKeel','CentralFoot')]
preview=json.loads((ROOT/'research/v18-world-preview/report.json').read_text())
chain=preview['records'][0]['chainQA']
checks={
 'exactlyThreeBases':len(bases)==3,
 'exactlyThreeOuterColumns':len(columns)==3,
 'noFourthCentralColumnOrBase':len(forbidden)==0,
 'allBasesHorizontal':all(local_y_up_angle(n)<.0001 for n in bases),
 'allOuterColumnsSixDegrees':all(abs(local_y_up_angle(n)-6)<.001 for n in columns),
 'twelveFullLengthChains':chain['lineCount']==12 and chain['allLinksAreMeshes'] and chain['tubeCableSegments']==0,
 'fourChainsPerBase':all(sum(m['side']==i for m in layout['moorings'])==4 for i in (1,2,3)),
 'fairleadAndAnchorBinding':all(l['fairleadEndpointErrorM']<1e-6 and l['anchorEndpointErrorM']<1e-6 for l in chain['lines']),
 'allLinksRemainInterlocked':all(.98<l['pitchM']<=1 and l['nearCount']+l['subseaCount']==l['linkCount'] for l in chain['lines']),
 'sourceGeometryUnchanged':sha('public/beso-research/physics/native-model.json')=='2d156156e6faff7073fa34dd46546f2dd90e215c3ebac58290f9dc4fe8381668',
 'sourceResponseUnchanged':sha('public/beso-research/physics/zwind-response.json')=='509c491df6bea647a3593fbc8e7e7d29675ec6dc3b64b0aaf9801e17982c6719',
 'noBrowserErrors':len(preview['errors'])==0,
}
report={'pass':all(checks.values()),'checks':checks,'baseAxes':[{'name':n['name'],'tiltDeg':local_y_up_angle(n)} for n in bases],'columnAxes':[{'name':n['name'],'tiltDeg':local_y_up_angle(n)} for n in columns],'chain':chain,'forbiddenNodes':forbidden,'geometrySHA256':sha('public/assets/v18/reference-platform.glb'),'scope':'Exported presentation geometry and rendered full-chain endpoint binding; not a structural or coupled mooring solve.'}
(ROOT/'research/v18-world-model-qa.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'pass':report['pass'],'checks':checks,'chainLinks':chain['linkCount']}))
if not report['pass']:raise SystemExit(1)
