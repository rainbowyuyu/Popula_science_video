"""Build coarse human protein surfaces from deposited coordinates, not AI shapes.

The smoothed van der Waals envelope is a teaching representation, not a
solvent-accessible mesh for docking. PDB angstroms are converted explicitly.
"""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/v8-python-libs'))
import numpy as np
from scipy.ndimage import gaussian_filter, binary_fill_holes
import trimesh
from skimage.measure import marching_cubes
import requests

OUT=ROOT/'src/data';OUT.mkdir(exist_ok=True)
RAW=ROOT/'research/revision-v8/sources'
def build(pdb,name,catalytic=None):
 p=RAW/(pdb+'.pdb')
 if not p.exists():
  r=requests.get('https://files.rcsb.org/download/'+pdb+'.pdb',timeout=60);r.raise_for_status();p.write_text(r.text,'ascii')
 rows=[l for l in p.read_text('ascii').splitlines() if l.startswith('ATOM  ') and l[21]=='A' and l[16] in ' A']
 atoms=np.array([[float(l[30:38]),float(l[38:46]),float(l[46:54])] for l in rows])
 center=atoms.mean(0)
 if catalytic:
  a=next(i for i,l in enumerate(rows) if int(l[22:26])==catalytic and l[12:16].strip()=='OG')
  active=atoms[a];x=active-center;x/=np.linalg.norm(x)
  y=np.array([0.,0.,1.]);y-=x*np.dot(y,x);y/=np.linalg.norm(y);z=np.cross(x,y);basis=np.column_stack((x,y,z))
 else:
  _,_,vt=np.linalg.svd(atoms-center,full_matrices=False);basis=vt.T
  if np.linalg.det(basis)<0:basis[:,2]*=-1
  active=None
 xyz=(atoms-center)@basis
 lo=xyz.min(0)-3;hi=xyz.max(0)+3;step=.8
 dim=np.ceil((hi-lo)/step).astype(int)+1;vol=np.zeros(dim,dtype=np.float32)
 radii={'C':1.7,'N':1.55,'O':1.52,'S':1.8}
 for a,l in zip(xyz,rows):
  r=radii.get(l[76:78].strip(),1.7);b=np.maximum(0,np.floor((a-r-lo)/step).astype(int));e=np.minimum(dim-1,np.ceil((a+r-lo)/step).astype(int))
  xx,yy,zz=np.ogrid[b[0]:e[0]+1,b[1]:e[1]+1,b[2]:e[2]+1]
  occupied=((xx*step+lo[0]-a[0])**2+(yy*step+lo[1]-a[1])**2+(zz*step+lo[2]-a[2])**2)<r*r
  sub=vol[b[0]:e[0]+1,b[1]:e[1]+1,b[2]:e[2]+1];np.maximum(sub,occupied,out=sub)
 vol=gaussian_filter(binary_fill_holes(vol>.5).astype(np.float32),1.1/step)
 verts,faces,norms,_=marching_cubes(vol,level=.32,spacing=(step,step,step),step_size=1)
 verts+=lo
 mesh=trimesh.Trimesh(vertices=verts,faces=faces,process=False)
 trimesh.smoothing.filter_taubin(mesh,lamb=.42,nu=.44,iterations=8)
 verts=np.asarray(mesh.vertices);norms=np.asarray(mesh.vertex_normals)
 # DrugDetail's one drawing unit is 2.2 nm = 22 angstroms.
 payload={'pdb':pdb,'chain':'A','name':name,'units':'DrugDetail drawing unit = 2.2 nm','position':np.round(verts/22,5).reshape(-1).tolist(),'normal':np.round(norms,5).reshape(-1).tolist(),'index':faces.reshape(-1).tolist(),'activeSite':None if active is None else np.round(((active-center)@basis)/22,5).tolist(),'boundsNm':np.round((xyz.max(0)-xyz.min(0))/10,3).tolist(),'source':'https://www.rcsb.org/structure/'+pdb,'sourceSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'surface':'Smoothed coarse van der Waals envelope, chain A only; no docking or molecular dynamics.'}
 dest=OUT/(name+'-v8.json');dest.write_text(json.dumps(payload,separators=(',',':')),'utf8')
 print(name,len(rows),'atoms',len(verts),'vertices',payload['boundsNm'],'nm','active',payload['activeSite'])

if __name__=='__main__':
 build('1NU6','human-dpp4',630)
 build('1AO6','human-albumin')
