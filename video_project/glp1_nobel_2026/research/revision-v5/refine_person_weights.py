import json,struct
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix,diags
from scipy.sparse.linalg import spsolve
root=Path(__file__).resolve().parents[2]
b=(root/'public/models/body.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];size={'SCALAR':1,'VEC3':3}[a['type']];return np.frombuffer(binary,dtype=dtype,count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0))
primitive=g['meshes'][0]['primitives'][0];original=accessor(primitive['attributes']['POSITION']).reshape(-1,3);faces=accessor(primitive['indices']).reshape(-1,3)
_,selected,inverse=np.unique(np.round(original,5),axis=0,return_index=True,return_inverse=True);p=original[selected];f=inverse[faces]
edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);edges=np.unique(np.sort(edges,axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
dist=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);w=1/np.maximum(dist,.001)
a=coo_matrix((np.r_[w,w],(np.r_[edges[:,0],edges[:,1]],np.r_[edges[:,1],edges[:,0]])),shape=(len(p),len(p))).tocsr();L=diags(np.asarray(a.sum(axis=1)).ravel())-a
weights=[{} for _ in original]
for side,tag in [(1,'L'),(-1,'R')]:
 # Dirichlet constraints sit well inside limbs and torso; harmonic interpolation
 # across the connected skin gives every seam duplicate the same influence.
 arm=(p[:,0]*side>.202)&(p[:,1]>.735)&(p[:,1]<1.33)
 rest=(np.abs(p[:,0])<.138)|(p[:,1]>1.440)|(p[:,1]<.700)|(p[:,0]*side<0)
 fixed=arm|rest;free=~fixed;target=np.zeros(len(p));target[arm]=1
 target[free]=spsolve(L[free][:,free].tocsc(),-L[free][:,fixed]@target[fixed]);target=np.clip(target,0,1)
 influence=target[inverse]
 def smooth(x):x=np.clip(x,0,1);return x*x*x*(x*(x*6-15)+10)
 fore=1-smooth((original[:,1]-1.063)/.100);hand=1-smooth((original[:,1]-.874)/.075)
 for i in range(len(original)):
  for name,value in [('upper',influence[i]*(1-fore[i])),('forearm',influence[i]*fore[i]*(1-hand[i])),('hand',influence[i]*fore[i]*hand[i])]:
   if value>1e-7:weights[i][name+tag]=round(float(value),7)
out={'source':'Topology-constrained harmonic skin weights (SciPy), refined after Blender bone-heat preview; same atlas vertex order','vertices':len(original),'weights':weights}
(root/'src/V5PersonWeights.json').write_text(json.dumps(out,separators=(',',':')))
print('HARMONIC',len(p),'welded vertices',len(original),'source vertices')
