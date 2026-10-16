"""Decode SU2's raw-appended VTU and export reproducible flow playback fields.

No flow vectors, wake oscillations, or pressure values are invented here.
Interpolation uses the native CFD triangles; the solid hole remains masked.
"""
from pathlib import Path
import argparse, hashlib, json, re, struct
import xml.etree.ElementTree as ET
import numpy as np
import scipy.sparse as sp
import matplotlib
matplotlib.use('Agg')
import matplotlib.tri as mtri
import matplotlib.pyplot as plt

HERE=Path(__file__).resolve().parent
DTYPES={'Float32':'<f4','Float64':'<f8','Int32':'<i4','UInt8':'u1','UInt64':'<u8','Int64':'<i8'}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def read_vtu(path):
    raw=Path(path).read_bytes(); ap=raw.index(b'<AppendedData')
    header=ET.fromstring(raw[:ap]+b'</VTKFile>')
    assert header.attrib['byte_order']=='LittleEndian'
    assert header.attrib['header_type']=='UInt64'
    start=raw.index(b'_',ap)+1
    def field(elem):
        offset=start+int(elem.attrib['offset']); n=struct.unpack_from('<Q',raw,offset)[0]
        x=np.frombuffer(raw, dtype=DTYPES[elem.attrib['type']],count=n//np.dtype(DTYPES[elem.attrib['type']]).itemsize,offset=offset+8).copy()
        nc=int(elem.attrib.get('NumberOfComponents','1'))
        return x.reshape(-1,nc) if nc>1 else x
    piece=header.find('UnstructuredGrid/Piece')
    points=field(piece.find('Points/DataArray'))
    cells={el.attrib['Name']:field(el) for el in piece.findall('Cells/DataArray')}
    vals={el.attrib['Name']:field(el) for el in piece.findall('PointData/DataArray')}
    assert len(points)==int(piece.attrib['NumberOfPoints'])
    return points,cells,vals

def ordered_boundary(points,edges):
    ids=np.unique(edges); p=points[ids]
    order=np.argsort(np.arctan2(p[:,1],p[:,0]-.5))
    return ids[order],p[order]

def interpolation_matrix(points,tris,xx,yy):
    tri=mtri.Triangulation(points[:,0],points[:,1],tris)
    finder=tri.get_trifinder(); ti=finder(xx.ravel(),yy.ravel()); mask=ti>=0
    row=np.flatnonzero(mask); verts=tris[ti[mask]]
    p=points[verts,:2]; q=np.column_stack((xx.ravel()[mask],yy.ravel()[mask]))
    v1=p[:,1]-p[:,0];v2=p[:,2]-p[:,0];v=q-p[:,0]
    det=v1[:,0]*v2[:,1]-v1[:,1]*v2[:,0]
    b=(v[:,0]*v2[:,1]-v[:,1]*v2[:,0])/det
    c=(v1[:,0]*v[:,1]-v1[:,1]*v[:,0])/det
    weights=np.column_stack((1-b-c,b,c))
    assert np.min(weights)>-1e-7 and np.max(np.abs(weights.sum(axis=1)-1))<1e-10
    return sp.csr_matrix((weights.ravel(),(np.repeat(row,3),verts.ravel())),shape=(xx.size,len(points))),mask

def curl_and_divergence(points,tris,uv):
    p=points[tris,:2]; v1=p[:,1]-p[:,0];v2=p[:,2]-p[:,0]
    det=v1[:,0]*v2[:,1]-v1[:,1]*v2[:,0];area=np.abs(det)/2
    du=uv[tris[:,1],0]-uv[tris[:,0],0];eu=uv[tris[:,2],0]-uv[tris[:,0],0]
    dv=uv[tris[:,1],1]-uv[tris[:,0],1];ev=uv[tris[:,2],1]-uv[tris[:,0],1]
    dux=(du*v2[:,1]-eu*v1[:,1])/det;duy=(eu*v1[:,0]-du*v2[:,0])/det
    dvx=(dv*v2[:,1]-ev*v1[:,1])/det;dvy=(ev*v1[:,0]-dv*v2[:,0])/det
    curl=dvx-duy;div=dux+dvy
    weights=np.zeros(len(points));nodes=np.zeros(len(points))
    for k in range(3):
        np.add.at(weights,tris[:,k],area)
        np.add.at(nodes,tris[:,k],area*curl)
    return nodes/weights,div,area

def main():
    ap=argparse.ArgumentParser();ap.add_argument('case');ap.add_argument('--min-time',type=float,default=0)
    ap.add_argument('--nx',type=int,default=201);ap.add_argument('--ny',type=int,default=121)
    ap.add_argument('--xlim',type=float,nargs=2,default=[-2.5,7.5]);ap.add_argument('--ylim',type=float,nargs=2,default=[-3.,3.])
    ap.add_argument('--partial',action='store_true');args=ap.parse_args()
    case=HERE/args.case;manifest=json.loads((case/'case-manifest.json').read_text(encoding='utf-8'))
    dt=manifest['timeStep'];done='Exit Success (SU2_CFD)' in (case/'run.log').read_text(errors='replace')
    assert done or args.partial,'Solver not completed; add --partial for explicitly provisional export'
    files=sorted(case.glob('flow_*.vtu'))
    if not files: files=[case/'flow.vtu']
    def flowtime(f):
        m=re.fullmatch(r'flow_(\d+)\.vtu',f.name)
        return (int(m[1])+1)*dt if m else 0.
    files=[p for p in files if flowtime(p)>=args.min_time]
    assert files
    points,cells,_=read_vtu(files[0]);assert np.all(cells['types']==5)
    tris=cells['connectivity'].reshape(-1,3)
    geo=np.load(case/'mesh-geometry.npz');assert np.max(np.abs(points[:,:2]-geo['points']))<1e-5
    ids,body=ordered_boundary(points,geo['body_edges'])
    x=np.linspace(*args.xlim,args.nx);y=np.linspace(*args.ylim,args.ny);xx,yy=np.meshgrid(x,y)
    interp,valid=interpolation_matrix(points,tris,xx,yy)
    dest=case/('playback-partial' if args.partial else 'playback');dest.mkdir(exist_ok=True)
    times=[]; metrics=[];streams=[];surfs=[];hashes=[]
    for i,file in enumerate(files):
        p,_,data=read_vtu(file);assert np.array_equal(p,points)
        uv=data['Velocity'][:,:2];cp=data['Pressure_Coefficient'];vort,div,area=curl_and_divergence(points,tris,uv)
        raw=np.column_stack((uv,cp,vort));assert np.all(np.isfinite(raw))
        field=np.asarray(interp@raw,dtype='<f4').T.reshape(4,args.ny,args.nx)
        streams.append(field);surfs.append(cp[ids]);times.append(flowtime(file))
        tri_centers=points[tris,:2].mean(axis=1);local=(tri_centers[:,0]>-2)&(tri_centers[:,0]<6)&(np.abs(tri_centers[:,1])<2.5)
        near=np.linalg.norm(tri_centers-[.5,0],axis=1)>.6;measure=local&near
        metrics.append({'time':flowtime(file),'source':file.name,'uMin':float(uv[:,0].min()),'uMax':float(uv[:,0].max()),'speedMax':float(np.linalg.norm(uv,axis=1).max()),'CpMin':float(cp.min()),'CpMax':float(cp.max()),'wallMaxSpeed':float(np.linalg.norm(uv[ids],axis=1).max()),'divergenceAreaWeightedRmsNearBodyExcluded':float(np.sqrt(np.sum(div[measure]**2*area[measure])/area[measure].sum()))})
        hashes.append({'path':file.name,'sha256':sha(file)})
    fields=np.stack(streams);surf=np.asarray(surfs,dtype='<f4');time=np.asarray(times,dtype='<f4')
    fields.tofile(dest/'fields.f32');surf.tofile(dest/'surface-cp.f32');valid.astype('u1').tofile(dest/'valid-mask.u8')
    np.savez_compressed(dest/'fields.npz',x=x,y=y,times=time,fields=fields,valid=valid.reshape(args.ny,args.nx),body=body,surface_cp=surf)
    out={'schema':'rainbow.cfd.section-fields/1','title':'二维截面流动教学计算（Re=100）','solver':'SU2 8.5.0 / incompressible Navier–Stokes / laminar','status':'provisional-running' if args.partial else 'completed','solverExitSuccess':done,
         'case':manifest,'grid':{'nx':args.nx,'ny':args.ny,'x':args.xlim,'y':args.ylim,'xOrder':'ascending','yOrder':'ascending','index':'y * nx + x'},
         'coordinates':{'bodyCenter':[.5,0.],'relativeCenterCoordinates':'subtract (0.5,0) before scale/rotation','referenceLength':'D0=1 (support-curve reference diameter, not full building metres)','flowDirection':[1,0],'blenderToThree':'CFD x -> Three X; CFD y -> minus Three Z for horizontal plane; offset Three Y to selected cut height','viewLimitation':'Use only on its matching 2D slice; never extrude Cp onto the full-height tower'},
         'data':{'file':'fields.f32','dtype':'little-endian Float32','shape':[len(files),4,args.ny,args.nx],'order':'C: time, field, y, x','fieldNames':['u','v','Cp','vorticity'],'fieldUnits':['Uref','Uref','dimensionless','Uref/D0'],'insideSolid':'zeros only as storage padding; use valid-mask.u8 and do not interpolate through the solid','validMaskFile':'valid-mask.u8','surfaceCpFile':'surface-cp.f32','surfaceCpShape':list(surf.shape),'times':times,'bodyBoundary':body.tolist()},
         'visualizationRules':['Show 二维截面流动教学计算（Re=100） while using this data.','Cp represents pressure only on this low-Re reconstructed section. Do not call it measured Shanghai Tower pressure.','Interpolate time and space, integrate actual velocity for particle paths; avoid generating or hand-oscillating vortices.','Temporal field sequence is not necessarily cyclic; loop only by matching phase or hide reset outside shot.','Vorticity was recovered from piecewise-linear native triangular velocity gradients, then area-weighted at vertices.'],
         'metrics':metrics,'sourceVTU':hashes,'artifacts':{name:{'bytes':(dest/name).stat().st_size,'sha256':sha(dest/name)} for name in ['fields.f32','surface-cp.f32','valid-mask.u8','fields.npz']}}
    (dest/'manifest.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    last=fields[-1];masked=lambda a:np.ma.masked_where(~valid.reshape(args.ny,args.nx),a)
    fig,axes=plt.subplots(1,3,figsize=(16,4),layout='constrained')
    fig.patch.set_facecolor('#f5f4ef')
    for ax,field,cmap,label,clim in zip(axes,[last[2],np.hypot(last[0],last[1]),last[3]],['RdBu_r','viridis','RdBu_r'],['Pressure coefficient Cp','Speed / Uref','Vorticity / (Uref/D0)'],[(-1.8,1.2),(0,1.8),(-2,2)]):
        ax.set_facecolor('#f5f4ef');im=ax.pcolormesh(x,y,masked(field),cmap=cmap,shading='auto',vmin=clim[0],vmax=clim[1]);ax.fill(body[:,0],body[:,1],'#ded3bc',ec='#554d3e',lw=1.2,zorder=4)
        ax.set_aspect('equal');ax.set_title(label);ax.set_xlabel('x / D0');ax.set_ylabel('y / D0');fig.colorbar(im,ax=ax,shrink=.75)
    fig.suptitle(f'SU2 8.5.0 | Re=100 two-dimensional reconstructed section | t*={times[-1]:.2f}')
    fig.savefig(dest/'qa-fields.png',dpi=160);plt.close(fig)
    print(json.dumps({'destination':str(dest),'frames':len(files),'times':[times[0],times[-1]],'bytes':(dest/'fields.f32').stat().st_size,'lastMetrics':metrics[-1]},indent=2))

if __name__=='__main__':main()
