"""Thin whole disconnected leaf components; never crush leaves into triangles."""
from pathlib import Path
import json, hashlib, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
ROOT=Path(__file__).resolve().parents[1];p=ROOT/'public/assets_v15/environment/source-models/tree_small_02'
j=json.loads((p/'tree_small_02_1k.gltf').read_text(encoding='utf-8'));primitive=j['meshes'][0]['primitives'][1]
a=j['accessors'][primitive['indices']];v=j['bufferViews'][a['bufferView']];original=p/j['buffers'][0]['uri'];b=original.read_bytes()
dtype={5123:'<u2',5125:'<u4'}[a['componentType']]
ix=np.frombuffer(b,dtype=dtype,count=a['count'],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
n=j['accessors'][primitive['attributes']['POSITION']]['count']
graph=coo_matrix((np.ones(len(ix)*3,dtype=np.uint8),(ix[:,[0,1,2]].reshape(-1),ix[:,[1,2,0]].reshape(-1))),shape=(n,n)).tocsr()
nc,labels=connected_components(graph,directed=False);rng=np.random.default_rng(154098);keep=rng.random(nc)<.55
filtered=ix[keep[labels[ix[:,0]]]].astype(dtype)
padding=b'\0'*((-len(b))%4);offset=len(b)+len(padding);new=b+padding+filtered.tobytes()
derived=p/'tree_small_02_v15_whole_leaf_lod.bin';derived.write_bytes(new);j['buffers'][0]['uri']=derived.name;j['buffers'][0]['byteLength']=len(new)
bv=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':filtered.nbytes,'target':34963})
acc=len(j['accessors']);j['accessors'].append({'bufferView':bv,'componentType':a['componentType'],'count':filtered.size,'type':'SCALAR','min':[int(filtered.min())],'max':[int(filtered.max())]});primitive['indices']=acc
out=p/'tree_small_02_v15_whole_leaf_lod.gltf';out.write_text(json.dumps(j,separators=(',',':')),encoding='utf-8')
meta={'method':'Deterministic thinning of whole original connected leaf components, all leaf topology preserved; no planar leaf-shape decimation','sourceLicense':'CC0-1.0','sourceSHA256':hashlib.sha256(original.read_bytes()).hexdigest(),'sourceComponents':int(nc),'keptComponents':int(keep.sum()),'originalLeafTriangles':len(ix),'retainedLeafTriangles':len(filtered),'output':out.name,'binarySHA256':hashlib.sha256(new).hexdigest()}
(p/'leaf-lod-v15.json').write_text(json.dumps(meta,indent=2),encoding='utf-8');print(json.dumps(meta))
