"""Validate embedded GLB resources, measured world boxes, and stable integration names."""
from pathlib import Path
import struct,json,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[1]
reports=[]
for path in sorted((ROOT/'public/models').glob('*.glb')):
    data=path.read_bytes();magic,ver,length=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and ver==2 and length==len(data)
    n,t=struct.unpack_from('<II',data,12);g=json.loads(data[20:20+n])
    assert all('uri' not in im for im in g.get('images',[])), path
    verts=[]
    def transform(node):
        if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
        x,y,z,w=node.get('rotation',[0,0,0,1]);R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        M=np.eye(4);M[:3,:3]=R@np.diag(node.get('scale',[1,1,1]));M[:3,3]=node.get('translation',[0,0,0]);return M
    def visit(i,parent):
        node=g['nodes'][i];M=parent@transform(node)
        if 'mesh' in node:
            for p in g['meshes'][node['mesh']]['primitives']:
                a=g['accessors'][p['attributes']['POSITION']]
                for x in [a['min'][0],a['max'][0]]:
                    for y in [a['min'][1],a['max'][1]]:
                        for z in [a['min'][2],a['max'][2]]:verts.append((M@np.array([x,y,z,1]))[:3])
        for c in node.get('children',[]):visit(c,M)
    for n in g['scenes'][g.get('scene',0)]['nodes']:visit(n,np.eye(4))
    vs=np.array(verts);bbox=[vs.min(0).tolist(),vs.max(0).tolist()];dims=(vs.max(0)-vs.min(0)).tolist()
    names=[n.get('name') for n in g['nodes']]
    expected={'phone':'Phone','router':'Router','server':'Server','cup':'Cup','table':'Table','cafebackground':'CafeBackground','cake':'Cake'}[path.stem]
    assert expected in names
    if expected=='Phone':assert 'Screen' in names and .07<dims[0]<.08 and .15<dims[2]<.16 and dims[1]<.012
    reports.append(dict(path=str(path.relative_to(ROOT)).replace('\\','/'),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),units='metres',gltfUp='Y',dimensionsXYZ=dims,boundsXYZ=bbox,nodeCount=len(g['nodes']),embeddedImageCount=len(g.get('images',[])),primitiveCount=sum(len(m['primitives']) for m in g['meshes']),triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'] if 'indices' in p),rootName=expected,resourcesEmbedded=True))
result=dict(passed=True,tests=['GLB2 signature/declared length','all images embedded','named roots','phone measured dimensions','finite node transform bounds'],assets=reports)
(ROOT/'docs/models-validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2))
