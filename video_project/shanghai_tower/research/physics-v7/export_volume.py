"""Export spatially registered fields from one native solved SU2 volume.

This exporter never approves a solution: acceptance must be supplied by an
independent audit JSON and all source hashes must match. Default is rejected.
No interpolated field is extended through solids or outside the solver mesh.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'visual-v4/flow-physics/fullscale/_deps'))
import vtk
from vtk.util.numpy_support import vtk_to_numpy, numpy_to_vtk

U_REF = 30.0
RHO_REF = 1.225
P_REF = 0.0


def read_vtu(path):
    rd = vtk.vtkXMLPolyDataReader() if Path(path).suffix.lower()=='.vtp' else vtk.vtkXMLUnstructuredGridReader()
    rd.SetFileName(str(path)); rd.Update()
    g = rd.GetOutput()
    if g.GetNumberOfCells() == 0: raise ValueError(f'Empty native mesh: {path}')
    # foamToVTK exports native volume cell values and interpolated point values.
    # If a field exists only per cell, use VTK's documented cell-to-point
    # interpolation; never fill holes or extend a field into the building.
    names={g.GetPointData().GetArrayName(i) for i in range(g.GetPointData().GetNumberOfArrays())}
    cell_names={g.GetCellData().GetArrayName(i) for i in range(g.GetCellData().GetNumberOfArrays())}
    if any(name not in names and name in cell_names for name in ('p','U','pMean','UMean','Pressure','Velocity')):
        interp=vtk.vtkCellDataToPointData();interp.SetInputData(g);interp.PassCellDataOn();interp.Update()
        g=interp.GetOutput()
    return g


def points_poly(xyz):
    p = vtk.vtkPoints(); p.SetData(numpy_to_vtk(np.asarray(xyz, dtype=np.float64), deep=True))
    d = vtk.vtkPolyData(); d.SetPoints(p)
    return d


def transform(a):
    """Solver XYZ/Z-up to film XYZ/Y-up, including vectors."""
    return np.asarray(a)[..., [0, 2, 1]] * np.array([1., 1., -1.])


def inverse(a):
    return np.asarray(a)[..., [0, 2, 1]] * np.array([1., -1., 1.])


def to_list(a, valid=None):
    a = np.asarray(a)
    if valid is None: return np.round(a, 7).tolist()
    if a.ndim == 1: return [round(float(x), 7) if ok else None for x, ok in zip(a, valid)]
    return [np.round(x, 7).tolist() if ok else None for x, ok in zip(a, valid)]


class NativeField:
    def __init__(self, grid, tower, solver='su2', reference_pressure_Pa=0., averaged=False):
        self.grid = grid
        self.velocity_name=('UMean' if averaged else 'U') if solver=='openfoam' else 'Velocity'
        self.pressure_name=('pMean' if averaged else 'p') if solver=='openfoam' else 'Pressure'
        self.velocity_scale=1. if solver=='openfoam' else U_REF
        self.pressure_scale=RHO_REF if solver=='openfoam' else RHO_REF*U_REF**2
        self.solver=solver
        self.reference_pressure_Pa=reference_pressure_Pa
        self.locator = vtk.vtkStaticCellLocator(); self.locator.SetDataSet(grid); self.locator.BuildLocator()
        sg = vtk.vtkGeometryFilter(); sg.SetInputData(tower); sg.Update()
        clean = vtk.vtkCleanPolyData(); clean.SetInputConnection(sg.GetOutputPort()); clean.Update()
        close = vtk.vtkFillHolesFilter(); close.SetInputConnection(clean.GetOutputPort()); close.SetHoleSize(1000.); close.Update()
        self.closed_tower = close.GetOutput()

    def probe(self, solver_xyz):
        data = points_poly(solver_xyz)
        p = vtk.vtkProbeFilter(); p.SetInputData(data); p.SetSourceData(self.grid)
        p.SetCellLocatorPrototype(self.locator); p.ComputeToleranceOff(); p.SetTolerance(1.e-7); p.Update()
        out = p.GetOutput().GetPointData()
        valid = vtk_to_numpy(out.GetArray('vtkValidPointMask')).astype(bool)
        names = [out.GetArrayName(i) for i in range(out.GetNumberOfArrays())]
        if self.velocity_name not in names or self.pressure_name not in names: raise ValueError(f'Missing actual primitive fields: {names}')
        vel = vtk_to_numpy(out.GetArray(self.velocity_name)).copy() * self.velocity_scale
        pressure = vtk_to_numpy(out.GetArray(self.pressure_name)).copy() * self.pressure_scale-self.reference_pressure_Pa
        cp = 2.0 * pressure / (RHO_REF * U_REF**2)
        enclosed = vtk.vtkSelectEnclosedPoints(); enclosed.SetInputData(data); enclosed.SetSurfaceData(self.closed_tower)
        enclosed.SetTolerance(1.e-10); enclosed.Update()
        solid = vtk_to_numpy(enclosed.GetOutput().GetPointData().GetArray('SelectedPoints')).astype(bool)
        valid &= ~solid
        if not np.isfinite(vel[valid]).all() or not np.isfinite(cp[valid]).all(): raise ValueError('Nonfinite native CFD field')
        return vel, cp, solid, valid


def make_slices(field):
    planes = []
    for z in [100., 300., 500.]:
        planes.append(dict(id=f'horizontal-{int(z)}m', kind='horizontal', label=f'{int(z)} m 高度流速',
                           origin_m=[-280., z, -240.], uAxis=[1.,0.,0.], vAxis=[0.,0.,1.],
                           width_m=1100., height_m=480., nx=441, ny=193,
                           displaySampling_m=2.5,displaySamplingMeaning='Native-cell interpolation for display, not finer CFD solution mesh.'))
    planes.append(dict(id='vertical-centre', kind='vertical', label='中心纵剖面流速',
                       origin_m=[-280., 1., 0.], uAxis=[1.,0.,0.], vAxis=[0.,1.,0.],
                           width_m=1100., height_m=800., nx=441, ny=321,
                       displaySampling_m=2.5,displaySamplingMeaning='Native-cell interpolation for display, not finer CFD solution mesh.'))
    for d in planes:
        u, v = np.meshgrid(np.linspace(0., d['width_m'], d['nx']), np.linspace(0., d['height_m'], d['ny']))
        film = np.array(d['origin_m']) + u.ravel()[:,None]*d['uAxis'] + v.ravel()[:,None]*d['vAxis']
        velocity, cp, solid, valid = field.probe(inverse(film))
        speed = np.linalg.norm(velocity, axis=1)
        d.update(speed_m_s=to_list(speed, valid), velocity_m_s=to_list(transform(velocity), valid),
                 Cp=to_list(cp, valid), insideSolidMask=solid.astype(int).tolist(), validMask=valid.astype(int).tolist(),
                 time_s=None, meaning='Steady RANS mean velocity sampled by native-cell interpolation; no physical time evolution.')
    return planes


def make_paths(field):
    # Solved velocity is integrated in native tetra/prism cells by VTK.
    # vtkStreamTracer integration time is trajectory travel time in a steady field.
    grid = field.grid
    vel = vtk_to_numpy(grid.GetPointData().GetArray(field.velocity_name)).copy()*field.velocity_scale
    arr = numpy_to_vtk(vel, deep=True); arr.SetName('Velocity_m_s'); grid.GetPointData().AddArray(arr)
    grid.GetPointData().SetActiveVectors('Velocity_m_s')
    seeds = [[-280., y, z] for z in [100., 300., 500.] for y in [-90., -60., -30., 0., 30., 60., 90.]]
    stream = vtk.vtkStreamTracer(); stream.SetInputData(grid); stream.SetSourceData(points_poly(seeds))
    stream.SetIntegratorTypeToRungeKutta45(); stream.SetIntegrationDirectionToForward()
    stream.SetMaximumPropagation(1500.); stream.SetInitialIntegrationStep(2.)
    stream.SetIntegrationStepUnit(vtk.vtkStreamTracer.LENGTH_UNIT)
    stream.SetMinimumIntegrationStep(.05); stream.SetMaximumIntegrationStep(4.)
    stream.SetMaximumError(1.e-6); stream.SetTerminalSpeed(.01); stream.SetMaximumNumberOfSteps(30000)
    stream.Update(); pd = stream.GetOutput()
    xyz = vtk_to_numpy(pd.GetPoints().GetData()); vectors = vtk_to_numpy(pd.GetPointData().GetArray('Velocity_m_s'))
    travel = vtk_to_numpy(pd.GetPointData().GetArray('IntegrationTime'))
    paths = []
    for i in range(pd.GetNumberOfCells()):
        ids = pd.GetCell(i).GetPointIds(); idx = np.array([ids.GetId(j) for j in range(ids.GetNumberOfIds())])
        if len(idx)<3: continue
        t = travel[idx]; good = np.r_[True, np.diff(t)>0.]
        idx=idx[good]; t=travel[idx]
        if len(idx)<3: continue
        paths.append(dict(points_m=to_list(transform(xyz[idx])), speed_m_s=to_list(np.linalg.norm(vectors[idx],axis=1)), travelTime_s=to_list(t-t[0])))
    if not paths: raise ValueError('No native-cell CFD streamlines')
    return paths


def make_pressure(field, common):
    # Close only the planar foundation opening to establish consistent outward
    # winding. Then discard that closure: the exported pressure is tower skin.
    norm = vtk.vtkPolyDataNormals(); norm.SetInputData(field.closed_tower)
    norm.ConsistencyOn(); norm.AutoOrientNormalsOn(); norm.SplittingOff(); norm.Update()
    pd=norm.GetOutput(); xyz=vtk_to_numpy(pd.GetPoints().GetData())
    pressure=vtk_to_numpy(pd.GetPointData().GetArray(field.pressure_name)).copy()*field.pressure_scale-field.reference_pressure_Pa
    cp=2.*pressure/(RHO_REF*U_REF**2)
    normal=vtk_to_numpy(pd.GetPointData().GetArray('Normals'))
    faces=[]
    for i in range(pd.GetNumberOfCells()):
        ids=pd.GetCell(i).GetPointIds(); idx=[ids.GetId(j) for j in range(ids.GetNumberOfIds())]
        if len(idx)<3 or np.max(np.abs(xyz[idx,2]))<1.e-6: continue
        for j in range(1,len(idx)-1): faces.append([idx[0],idx[j],idx[j+1]])
    if not np.isfinite(cp).all() or not np.isfinite(normal).all(): raise ValueError('Nonfinite boundary Cp / normal')
    used=np.unique(np.asarray(faces).ravel()); remap=np.full(len(xyz),-1,dtype=int); remap[used]=np.arange(len(used))
    tri=remap[np.asarray(faces)]
    cp_range=[float(np.floor(float(cp[used].min())*2.)/2.),float(np.ceil(float(cp[used].max())*2.)/2.)]
    return dict(common, schema='rainbow.computed-pressure/1', normalConvention='body-outward',cpRange=cp_range,
                points_m=to_list(transform(xyz[used])), triangles=tri.tolist(), cp=to_list(cp[used]),
                outward_normals=to_list(transform(normal[used])), pressure_Pa=to_list(pressure[used]),
                pressureMeaning='steady mean pressure relative to freestream',
                fieldRepresentation='Native solver point-interpolated surface pressure; raw cell pressure extrema retained in native-field-summary.json. No clipping.',
                provenance=dict(common['provenance'],triangleWinding='outward',
                                boundaryMeaning='Native solved tower skin. The artificial planar foundation closure is excluded.'))


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('case', type=Path); ap.add_argument('--volume',default='flow/zone_0/Internal.vtu')
    ap.add_argument('--solver', choices=['su2','openfoam'], default='su2')
    ap.add_argument('--averaged',action='store_true',help='Use solved physical-time UMean/pMean, never average SIMPLE iterations')
    ap.add_argument('--reference-surface',default=None,help='Inlet VTP: area-weighted native pressure defines freestream reference')
    ap.add_argument('--surface',default='flow/zone_0/tower.vtu'); ap.add_argument('--audit',type=Path); args=ap.parse_args()
    case=args.case.resolve(); src=case/args.volume; sha=hashlib.sha256(src.read_bytes()).hexdigest()
    reference_pressure=P_REF
    if args.reference_surface:
        inlet=read_vtu(case/args.reference_surface)
        p_name='pMean' if args.averaged else 'p'
        p_array=inlet.GetCellData().GetArray(p_name)
        if p_array is None:raise ValueError('Native inlet cell pressure required for the area-weighted reference')
        sizes=vtk.vtkCellSizeFilter();sizes.SetInputData(inlet);sizes.ComputeAreaOn();sizes.Update()
        areas=vtk_to_numpy(sizes.GetOutput().GetCellData().GetArray('Area'))
        reference_pressure=float(np.average(vtk_to_numpy(p_array),weights=areas))*RHO_REF
    quality={'acceptedForFilm':False,'acceptedForCoupling':False,'notes':'Await independent residual, mass, force, y+ and mesh-sensitivity audit.'}
    if args.audit:
        audit=json.loads(args.audit.read_text(encoding='utf-8'))
        if audit.get('sourceSHA256')!=sha: raise ValueError('Acceptance audit does not match native source hash')
        quality.update(audit.get('quality',{}))
    solver_name=('OpenFOAM v1912 pimpleFoam, physical-time-averaged incompressible kOmegaSST URANS' if args.averaged else 'OpenFOAM v1912 simpleFoam, incompressible kOmegaSST RANS') if args.solver=='openfoam' else 'SU2 8.5.0 incompressible RANS; see case.cfg and runtime audit for turbulence closure and numerical patch'
    provenance={'solver':solver_name,
                'case':case.name,'meaning':'Steady mean flow, uniform 30 m/s inflow and slip ground, isolated reconstructed educational exterior; not as-built Shanghai design wind.',
                'sourceSHA256':sha,'sourceVTU':str(src.relative_to(case)),
                'referencePressureMeaning':'area-weighted inlet mean static gauge pressure' if args.reference_surface else 'solver zero-pressure reference'}
    checkpoint=case/'checkpoint-provenance.json'
    if checkpoint.exists():
        cp_info=json.loads(checkpoint.read_text(encoding='utf-8'))
        if cp_info.get('nativeVolumeSHA256')!=sha:raise ValueError('Checkpoint metadata source hash mismatch')
        provenance.update(nativeSIMPLEIteration=cp_info['nativeSIMPLEIteration'],foamToVTKTimeIndex=cp_info['foamToVTKTimeIndex'],remoteSourceCase=cp_info['remoteSourceCase'])
    if args.audit:
        provenance.update(acceptanceAudit=str(args.audit),acceptanceAuditSHA256=hashlib.sha256(args.audit.read_bytes()).hexdigest())
    common={'coordinates':'metres, Three.js XYZ, Y up','quality':quality,'provenance':provenance,
            'referenceVelocity_m_s':U_REF,'referenceDensity_kg_m3':RHO_REF,'referencePressure_Pa':reference_pressure,
            'time_s':None,'timeMeaning':'steady mean; integration iterations are not physical time'}
    grid=read_vtu(src); tower=read_vtu(case/args.surface); field=NativeField(grid,tower,args.solver,reference_pressure,args.averaged)
    slices=make_slices(field)
    all_speed=[v for d in slices for v in d['speed_m_s'] if v is not None]
    vmax=float(np.ceil(max(all_speed)/5.)*5.)
    exports={'computed-flow-slices.json':dict(common,schema='rainbow.computed-flow-slices/1',speedRange_m_s=[0.,vmax],slices=slices),
             'computed-wind-paths.json':dict(common,schema='rainbow.computed-wind-paths/1',pathIntegrator='VTK RK45 through native finite-volume mesh, m/s field and physical integration travel seconds',streamlines=make_paths(field)),
             'computed-pressure.json':make_pressure(field,common)}
    for name,data in exports.items():
        (case/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({'source':str(src),'accepted':quality['acceptedForFilm'],'sliceCount':len(slices),'speedRange':[0,vmax],'paths':len(exports['computed-wind-paths.json']['streamlines'])}))


if __name__=='__main__': main()
