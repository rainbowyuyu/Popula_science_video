"""Compare actual GLB exterior vertices with the native CFD boundary skin."""
from pathlib import Path
import argparse, hashlib, json, re, struct, sys
import numpy as np
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'visual-v4/flow-physics/fullscale/_deps'))
import vtk
from vtk.util.numpy_support import numpy_to_vtk


def exterior(path):
    raw=path.read_bytes(); magic,version,length=struct.unpack_from('<III',raw)
    assert magic==0x46546c67 and version==2 and length==len(raw)
    size,kind=struct.unpack_from('<II',raw,12); doc=json.loads(raw[20:20+size]); start=20+size
    bsize,bkind=struct.unpack_from('<II',raw,start); data=raw[start+8:start+8+bsize]
    types={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
    def accessor(i):
        a=doc['accessors'][i]; v=doc['bufferViews'][a['bufferView']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        dt=np.dtype(types[a['componentType']]); offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return np.ndarray((a['count'],n),dtype=dt,buffer=data,offset=offset,strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).copy()
    def matrix(n):
        if 'matrix' in n:return np.array(n['matrix']).reshape((4,4),order='F')
        m=np.eye(4);x,y,z,w=n.get('rotation',[0,0,0,1]); r=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
        m[:3,:3]=r@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
    out={}
    def walk(i,parent):
        n=doc['nodes'][i]; world=parent@matrix(n); name=n.get('name','')
        if re.match(r'^ENVELOPE.*GLASS$',name):
            ps=[]
            for prim in doc['meshes'][n['mesh']]['primitives']:
                p=accessor(prim['attributes']['POSITION']); ps.append((np.c_[p,np.ones(len(p))]@world.T)[:,:3])
            out[name]=np.concatenate(ps)
        for k in n.get('children',[]):walk(k,world)
    for n in doc['scenes'][doc.get('scene',0)]['nodes']:walk(n,np.eye(4))
    assert out,'No expected envelope GLASS nodes'
    return out,hashlib.sha256(raw).hexdigest()


def signature(parts):
    h=hashlib.sha256()
    for name,p in sorted(parts.items()):h.update(name.encode());h.update(np.round(p,6).astype('<f8').tobytes())
    return h.hexdigest()


def main():
    ap=argparse.ArgumentParser();ap.add_argument('current',type=Path);ap.add_argument('--prior',type=Path);ap.add_argument('--boundary',type=Path);ap.add_argument('--out',type=Path,default=HERE/'envelope-geometry-audit.json');args=ap.parse_args()
    parts,sha=exterior(args.current);report={'currentGLB_SHA256':sha,'currentExteriorGeometry_SHA256':signature(parts),'objects':len(parts),'vertexCount':sum(len(p) for p in parts.values()),'units':'metres, Three.js XYZ, Y up'}
    if args.prior:
        old,oldsha=exterior(args.prior);same_names=old.keys()==parts.keys();delta={}
        for n,p in parts.items():
            if n in old and p.shape==old[n].shape:delta[n]=float(np.max(np.linalg.norm(p-old[n],axis=1)))
        report.update(priorGLB_SHA256=oldsha,priorExteriorGeometry_SHA256=signature(old),sameExteriorObjectNames=same_names,maxCoordinateDelta_m=max(delta.values()) if len(delta)==len(parts) else None,perObjectMaxDelta_m=delta)
    if args.boundary:
        r=vtk.vtkXMLPolyDataReader() if args.boundary.suffix=='.vtp' else vtk.vtkXMLUnstructuredGridReader();r.SetFileName(str(args.boundary));r.Update();g=r.GetOutput()
        # Transform native surface points and preserve exact triangle cells.
        xyz=np.array([g.GetPoint(i) for i in range(g.GetNumberOfPoints())]); xyz=xyz[:,[0,2,1]]*np.array([1,1,-1])
        pp=vtk.vtkPoints();pp.SetData(numpy_to_vtk(xyz,deep=True));g.SetPoints(pp)
        loc=vtk.vtkStaticCellLocator();loc.SetDataSet(g);loc.BuildLocator();distances={}
        for n,points in parts.items():
            dd=[]
            for p in points:
                cp=[0.,0.,0.];cellid=vtk.reference(0);subid=vtk.reference(0);d2=vtk.reference(0.)
                loc.FindClosestPoint(p,cp,cellid,subid,d2);dd.append(float(d2)**.5)
            distances[n]={'vertices':len(dd),'max_m':max(dd),'rms_m':float(np.sqrt(np.mean(np.square(dd)))),'p95_m':float(np.quantile(dd,.95)),'coverageWithin1_5m':float(np.mean(np.array(dd)<=1.5))}
        report.update(boundaryFile=str(args.boundary),boundarySHA256=hashlib.sha256(args.boundary.read_bytes()).hexdigest(),projectionByObject=distances,geometryRegistrationPassed=all(d['coverageWithin1_5m']>=.995 for d in distances.values()))
    args.out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['projectionByObject','perObjectMaxDelta_m']}))


if __name__=='__main__':main()
