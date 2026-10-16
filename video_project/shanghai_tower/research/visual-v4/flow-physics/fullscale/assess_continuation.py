"""Read actual candidate history and raw VTU; record diagnostics without acceptance."""
from pathlib import Path
import argparse,csv,datetime,json,re,struct,xml.etree.ElementTree as ET
import numpy as np
HERE=Path(__file__).resolve().parent

def vtu(path):
    raw=path.read_bytes();pos=raw.index(b'<AppendedData');header=ET.fromstring(raw[:pos]+b'</VTKFile>');start=raw.index(b'_',pos)+1
    types={'Float32':'<f4','Float64':'<f8','Int32':'<i4','UInt8':'u1','UInt64':'<u8','Int64':'<i8'}
    def field(e):
        at=start+int(e.attrib['offset']);n=struct.unpack_from('<Q',raw,at)[0];dt=np.dtype(types[e.attrib['type']]);a=np.frombuffer(raw,dtype=dt,count=n//dt.itemsize,offset=at+8).copy();c=int(e.attrib.get('NumberOfComponents',1));return a.reshape(-1,c) if c>1 else a
    piece=header.find('UnstructuredGrid/Piece');return field(piece.find('Points/DataArray')),{e.attrib['Name']:field(e) for e in piece.findall('PointData/DataArray')}

def main():
    p=argparse.ArgumentParser();p.add_argument('--case',type=Path,required=True);a=p.parse_args();case=a.case.resolve()
    if not case.is_relative_to(HERE):raise ValueError('Candidate must be below fullscale')
    rows=list(csv.reader((case/'history.csv').open()));keys=[k.replace('"','').replace("'",'').strip() for k in rows[0]]
    rows=[r for r in rows[1:] if len(r)==len(keys)]
    if not rows:raise ValueError('No complete iterations yet')
    values=np.array(rows,dtype=float);data={k:values[:,i] for i,k in enumerate(keys)};count=min(100,len(rows));report={'schema':'rainbow.su2-continuation-diagnostics/1','recordedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'case':str(case),'historyLastIteration':int(data['Inner_Iter'][-1]),'historySamples':len(rows),'acceptedForCoupling':False,'status':'diagnostic-only; independent field and convergence acceptance still required','tailWindow':count,'history':{}}
    for k in ['rms[P]','rms[U]','rms[V]','rms[W]','rms[nu]','CD','CFy','CFz','CMx','CMy','CMz','LinSolRes','LinSolIter']:
        if k not in data:continue
        v=data[k][-count:];report['history'][k]={'last':float(v[-1]),'min':float(v.min()),'max':float(v.max()),'mean':float(v.mean()),'std':float(v.std())}
    report['allFiveResidualsBelowMinus7']=all(data[k][-1]<=-7 for k in ['rms[P]','rms[U]','rms[V]','rms[W]','rms[nu]'])
    flow=case/'flow.vtu'
    if flow.is_file():
        xyz,fields=vtu(flow);report['volumeFileMtime']=datetime.datetime.fromtimestamp(flow.stat().st_mtime,datetime.timezone.utc).isoformat();report['volumeFieldNames']=list(fields);report['volumeFieldsFinite']=all(bool(np.isfinite(v).all()) for v in fields.values());report['residualLocations']={}
        for key,v in fields.items():
            # 'Pressure' also contains the substring 'res'; it is a solution
            # field, not a residual. Only SU2's explicit residual fields count.
            if not key.startswith('Residual_'):continue
            mag=np.abs(v) if v.ndim==1 else np.linalg.norm(v,axis=1);idx=np.argsort(mag)[-min(100,len(mag)):];q=xyz[idx];total=np.sum(mag**2)
            far_ground=(xyz[:,2]<.01)&(np.linalg.norm(xyz[:,:2],axis=1)>100)
            near_tower=(np.linalg.norm(xyz[:,:2],axis=1)<100)&(xyz[:,2]<640)
            report['residualLocations'][key]={'max':float(mag[idx[-1]]),'maxXYZ_m':xyz[idx[-1]].tolist(),'top100Range_m':[q.min(0).tolist(),q.max(0).tolist()],'farGroundFractionSquaredResidual':float(np.sum(mag[far_ground]**2)/max(1e-30,total)),'nearTowerFractionSquaredResidual':float(np.sum(mag[near_tower]**2)/max(1e-30,total))}
    surface=case/'surface_flow.vtu'
    if surface.is_file():
        xyz,f=vtu(surface);mask=xyz[:,2]>.01;report['surfaceFieldNames']=list(f)
        if 'Y_Plus' in f:report['towerYPlusPercentiles']={str(p):float(np.percentile(f['Y_Plus'][mask],p)) for p in [0,50,95,99,100]}
        if 'Pressure' in f and 'Pressure_Coefficient' in f:report['maxAbsCpMinusTwiceRawPressure']=float(np.max(abs(f['Pressure_Coefficient']-2*f['Pressure'])))
    path=case/f'assessment-{report["historyLastIteration"]:05}.json';path.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps(report,indent=2,allow_nan=False))

if __name__=='__main__':main()
