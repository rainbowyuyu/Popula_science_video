"""Measure a defensible atlas renal-artery to schematic-arteriole bridge."""
from pathlib import Path
import json, struct, math
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
b = (ROOT/'public/hypertension/models/human-atlas-hypertension.glb').read_bytes()
chunks = {}; off = 12
while off < len(b):
    n, kind = struct.unpack_from('<II', b, off); chunks[kind] = b[off+8:off+8+n]; off += n+8
g = json.loads(chunks[0x4e4f534a]); data = chunks[0x004e4942]
node = next(n for n in g['nodes'] if n.get('name')=='arteriesMesh')
part = next(p for p in node['extras']['sourceParts'] if p['id']=='FJ2046')
prim = g['meshes'][node['mesh']]['primitives'][0]

def acc(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
    dt={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];item=np.dtype(dt).itemsize
    count={'VEC3':3,'SCALAR':1}[a['type']]
    return np.ndarray((a['count'],count),dtype=dt,buffer=data,
                      offset=v.get('byteOffset',0)+a.get('byteOffset',0),
                      strides=(v.get('byteStride',count*item),item)).copy()

positions=acc(prim['attributes']['POSITION']).astype(float)
indices=acc(prim['indices']).reshape(-1)
manifest=json.loads((ROOT/'public/hypertension/models/asset-manifest.json').read_text(encoding='utf-8'))
bb=np.array(manifest['groups']['bodySurface']['bounds']);scale=6.85/(bb[1,1]-bb[0,1]);shift=np.array([0,-bb[0,1]*scale+.08,0])
world=positions*scale+shift
triangles=world[indices[part['firstIndex']:part['firstIndex']+part['indexCount']].reshape(-1,3)]
verts=world[part['firstVertex']:part['firstVertex']+part['vertexCount']]
kidney=np.array(manifest['groups']['leftKidney']['center'])*scale+shift
root=kidney+np.array([-.068,.026,.092]);c=math.cos(.16);s=math.sin(.16)
rotation=np.array([[c,-s,0],[s,c,0],[0,0,1.]])
local=np.array([-1.77,.025,-.035]);entry=root+rotation@(local*.006)

def section(x):
    seg=[]
    for tri in triangles:
        points=[]
        for a,bb in [(tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])]:
            d0,d1=a[0]-x,bb[0]-x
            if d0*d1<0:points.append(a+(bb-a)*(-d0)/(d1-d0))
        if len(points)==2 and np.linalg.norm(points[0]-points[1])>1e-10:seg.append(points)
    if not seg:return None
    seg=np.array(seg);lengths=np.linalg.norm(seg[:,1]-seg[:,0],axis=1)
    center=(((seg[:,0]+seg[:,1])/2)*lengths[:,None]).sum(axis=0)/lengths.sum()
    allp=seg.reshape(-1,3);radii=np.linalg.norm((allp-center)[:,1:],axis=1)
    return {'planeX':float(x),'segments':len(seg),'perimeterCentroid':center.tolist(),
            'radiusMedian':float(np.median(radii)),'radiusRange':[float(radii.min()),float(radii.max())],
            'YZExtent':(allp[:,1:].max(0)-allp[:,1:].min(0)).tolist(),
            'perimeter':float(lengths.sum())}

def closest_point(p,a,b,c):
    ab=b-a;ac=c-a;ap=p-a;d1=ab@ap;d2=ac@ap
    if d1<=0 and d2<=0:return a
    bp=p-b;d3=ab@bp;d4=ac@bp
    if d3>=0 and d4<=d3:return b
    vc=d1*d4-d3*d2
    if vc<=0 and d1>=0 and d3<=0:return a+ab*(d1/(d1-d3))
    cp=p-c;d5=ab@cp;d6=ac@cp
    if d6>=0 and d5<=d6:return c
    vb=d5*d2-d1*d6
    if vb<=0 and d2>=0 and d6<=0:return a+ac*(d2/(d2-d6))
    va=d3*d6-d5*d4
    if va<=0 and (d4-d3)>=0 and (d5-d6)>=0:return b+(c-b)*((d4-d3)/((d4-d3)+(d5-d6)))
    denom=1/(va+vb+vc);return a+ab*(vb*denom)+ac*(vc*denom)

surfaces=[closest_point(entry,*tri) for tri in triangles]
ds=[np.linalg.norm(p-entry) for p in surfaces];ii=int(np.argmin(ds));nearest=surfaces[ii]
end=float(verts[:,0].max());sections=[section(end-d) for d in [.001,.003,.005,.008,.012]]
chosen=sections[2];p0=np.array(chosen['perimeterCentroid'])
previous=np.array(sections[3]['perimeterCentroid']);tangent=(p0-previous);tangent/=np.linalg.norm(tangent)
axis=rotation@np.array([1.,0,0]);distance=float(np.linalg.norm(entry-p0))
control1=p0+tangent*min(distance*.28,.008)
control2=entry-axis*min(distance*.25,.007)
report={'sourcePart':part,'worldScale':scale,'worldTranslation':shift.tolist(),
        'sourceDistalMaxX':end,'sections':sections,'selectedSection':chosen,
        'kidneyCenter':kidney.tolist(),'arterioleRoot':root.tolist(),
        'schematicInletLocal':local.tolist(),'schematicInletWorld':entry.tolist(),
        'schematicInletAxisWorld':axis.tolist(),
        'nearestSourceSurface':{'point':nearest.tolist(),'distance':float(ds[ii]),'triangleInPart':ii},
        'suggestedCubicBezier':{'p0':p0.tolist(),'p1':control1.tolist(),'p2':control2.tolist(),'p3':entry.tolist(),
                               'straightEndpointDistance':distance,'sourceTangentEstimate':tangent.tolist(),
                               'sourceOuterRadiusApprox':chosen['radiusMedian'],
                               'schematicInletRadiusApprox':.23*.006},
        'boundary':'A simplified tapering branch bridge from a measured gross renal-artery section to a schematic microscopic inlet. It is not original atlas microgeometry or a fitted physiological arteriole centerline.',
        'method':'Intersect FJ2046 indexed triangles with X-normal planes near maximal X; perimeter-length-weighted centroid and median YZ radius. Nearest surface via point-triangle closest point. Radii are oblique-section approximations.'}
out=ROOT/'research/hypertension/left-renal-bridge-v5.json';out.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
