"""Build a closed twisted-tapered tower / ground CFD volume with prism walls.

Geometry is the film's published-parameter reconstruction, not as-built CAD.
SI units. Both ground and tower receive actual extruded near-wall layers.
"""
from pathlib import Path
import json, math, sys, time, hashlib, argparse
import numpy as np
import gmsh
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'visual-v4/flow-physics'))
from prepare_section import profile

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--name',default='tower-3d-rans');ap.add_argument('--lc',type=float,default=12.)
    ap.add_argument('--first-layer',type=float,default=.002);ap.add_argument('--layers',type=int,default=24)
    ap.add_argument('--flat-crown',action='store_true');ap.add_argument('--twist',type=float,default=120.)
    args=ap.parse_args();out=HERE/args.name;out.mkdir(exist_ok=True)
    gmsh.initialize();gmsh.logger.start();gmsh.model.add('Shanghai reconstructed aerodynamic envelope')
    gmsh.option.setNumber('General.NumThreads',4)
    # The 12.6 km outer domain must not merge 10 micrometre wall layers.
    # Gmsh's default geometry-relative tolerance is too large for this ratio.
    gmsh.option.setNumber('Geometry.Tolerance',1e-12)
    gmsh.option.setNumber('Geometry.ToleranceBoolean',1e-12)
    gmsh.option.setNumber('Mesh.Algorithm',6);gmsh.option.setNumber('Mesh.Algorithm3D',1)
    gmsh.option.setNumber('Mesh.MeshSizeMin',args.lc*.55);gmsh.option.setNumber('Mesh.MeshSizeMax',550.)
    gmsh.option.setNumber('Mesh.MeshSizeExtendFromBoundary',0)
    geo=gmsh.model.geo
    H=632.;levels=np.unique(np.r_[np.linspace(0,580,23),600,616,632]);sectors=6
    def xyz(h,t):
        if h>580 and not args.flat_crown:
            h=580+(h-580)/(632-580)*(615.5+16.5*np.cos(t-.7)-580)
        r=49*np.sqrt(1-.55*h/H);a=np.deg2rad(args.twist*h/H)
        x,y=profile(np.array([t]))[0]
        return r*(x*np.cos(a)-y*np.sin(a)),r*(x*np.sin(a)+y*np.cos(a)),h
    # One CAD kernel is essential: mixed OCC/geo boundaries do not share
    # extrusion normals at the foot of the tower. Shared spline patches use
    # the exact reconstruction curve and a 26.3m vertical interval.
    anchors=[[geo.addPoint(*xyz(h,j*2*np.pi/sectors),args.lc) for j in range(sectors)] for h in levels]
    arcs=[]
    for k,h in enumerate(levels):
        row=[]
        for j in range(sectors):
            ts=np.linspace(j*2*np.pi/sectors,(j+1)*2*np.pi/sectors,9)
            pp=[anchors[k][j]]+[geo.addPoint(*xyz(h,t),args.lc) for t in ts[1:-1]]+[anchors[k][(j+1)%sectors]]
            row.append(geo.addSpline(pp))
        arcs.append(row)
    uprights=[]
    for k in range(len(levels)-1):
        uprights.append([geo.addSpline([anchors[k][j],geo.addPoint(*xyz((levels[k]+levels[k+1])/2,j*2*np.pi/sectors),args.lc),anchors[k+1][j]]) for j in range(sectors)])
    body=[]
    for k in range(len(levels)-1):
        for j in range(sectors):
            loop=geo.addCurveLoop([arcs[k][j],uprights[k][(j+1)%sectors],-arcs[k+1][j],-uprights[k][j]])
            body.append((2,geo.addSurfaceFilling([loop])))
    if args.flat_crown:
        body.append((2,geo.addPlaneSurface([geo.addCurveLoop(arcs[-1])])))
    else:
        cap_center=geo.addPoint(0,0,615.5,args.lc)
        spokes=[geo.addLine(p,cap_center) for p in anchors[-1]]
        for j in range(sectors):
            body.append((2,geo.addSurfaceFilling([geo.addCurveLoop([arcs[-1][j],spokes[(j+1)%sectors],-spokes[j]])])))
    basecurves=arcs[0]
    geo.synchronize()
    # Ground is one connected wall with the building removed. Extrude ground
    # and tower together to avoid a coarse/untreated floor-wall junction.
    xmin,xmax,ymin,ymax,zmax=-5*H,15*H,-5*H,5*H,6*H
    corners=[(xmin,ymin),(xmax,ymin),(xmax,ymax),(xmin,ymax)]
    pts=[geo.addPoint(x,y,0,550) for x,y in corners]
    edges=[geo.addLine(pts[i],pts[(i+1)%4]) for i in range(4)]
    ground=geo.addPlaneSurface([geo.addCurveLoop(edges),geo.addCurveLoop(basecurves)])
    geo.synchronize()
    wall=body+[(2,ground)]
    dist=np.cumsum(args.first_layer*1.3**np.arange(args.layers))
    gmsh.option.setNumber('Geometry.ExtrudeReturnLateralEntities',0)
    ext=geo.extrudeBoundaryLayer(wall,[1]*args.layers,dist.tolist(),recombine=True)
    geo.synchronize()
    tops=[(d,t) for d,t in ext if d==2];blvol=[t for d,t in ext if d==3]
    bnd=gmsh.model.getBoundary(tops,combined=True,oriented=True)
    print(json.dumps({'body':body,'ground':ground,'basecurves':basecurves,'ext':ext,'tops':tops,'bnd':bnd}))
    assert len(bnd)==4,('Unexpected external boundary',bnd)
    # Match virtual extruded corner points by their x/y locations; only the
    # z coordinates are displaced when the boundary-layer mesh is generated.
    endpoints={}
    for d,c in bnd:
        pp=gmsh.model.getBoundary([(d,abs(c))],oriented=True)
        endpoints[c]=[abs(t) for dd,t in pp]
    lowids=sorted(set(v for pair in endpoints.values() for v in pair))
    lowcoords={p:gmsh.model.getValue(0,p,[]).tolist() for p in lowids}
    topids={p:geo.addPoint(lowcoords[p][0],lowcoords[p][1],zmax,550) for p in lowids}
    vertical={p:geo.addLine(p,topids[p]) for p in lowids}
    topedges=[];sides=[]
    for c,(p0,p1) in endpoints.items():
        tc=geo.addLine(topids[p0],topids[p1]);topedges.append(tc)
        # Query oriented boundary to determine curve direction exactly.
        op=gmsh.model.getBoundary([(1,abs(c))],oriented=True)
        start=next(abs(t) for d,t in op if t<0) if any(t<0 for d,t in op) else p0
        end=next(abs(t) for d,t in op if t>0) if any(t<0 for d,t in op) else p1
        direction=1 if start==p0 else -1
        loop=geo.addCurveLoop([direction*abs(c),vertical[p1],-tc,-vertical[p0]],reorient=True)
        sides.append(geo.addPlaneSurface([loop]))
    loops=geo.addCurveLoops(topedges);assert len(loops)==1
    ceiling=geo.addPlaneSurface([loops[0]])
    volume=geo.addVolume([geo.addSurfaceLoop([t for d,t in tops]+sides+[ceiling])])
    geo.synchronize()
    # Surface distance refinement limits cell counts while resolving the
    # near-building flow and downstream wake with actual 3D elements.
    f=gmsh.model.mesh.field.add('Distance');gmsh.model.mesh.field.setNumbers(f,'SurfacesList',[t for d,t in body])
    gmsh.model.mesh.field.setNumber(f,'Sampling',80)
    t=gmsh.model.mesh.field.add('Threshold');gmsh.model.mesh.field.setNumber(t,'InField',f)
    gmsh.model.mesh.field.setNumber(t,'SizeMin',args.lc);gmsh.model.mesh.field.setNumber(t,'SizeMax',550)
    gmsh.model.mesh.field.setNumber(t,'DistMin',35);gmsh.model.mesh.field.setNumber(t,'DistMax',2400)
    wake=gmsh.model.mesh.field.add('Box')
    for key,val in {'VIn':35.,'VOut':550.,'XMin':-100.,'XMax':2300.,'YMin':-300.,'YMax':300.,'ZMin':0.,'ZMax':850.,'Thickness':300.}.items():gmsh.model.mesh.field.setNumber(wake,key,val)
    mini=gmsh.model.mesh.field.add('Min');gmsh.model.mesh.field.setNumbers(mini,'FieldsList',[t,wake]);gmsh.model.mesh.field.setAsBackgroundMesh(mini)
    gmsh.model.addPhysicalGroup(3,blvol+[volume],name='fluid')
    gmsh.model.addPhysicalGroup(2,[t for d,t in body],name='tower')
    gmsh.model.addPhysicalGroup(2,[ground],name='ground')
    start=time.time()
    try:
        gmsh.model.mesh.generate(3)
        # Include the thin outer strips created by ground layer extrusion.
        # Omitting these leaves the CFD boundary unclosed even if volume
        # cells themselves are valid.
        external=gmsh.model.getBoundary([(3,v) for v in blvol+[volume]],combined=True,oriented=False)
        wallset={tag for dd,tag in wall}
        labels={'inlet':[],'outlet':[],'sides':[],'ceiling':[]}
        for dd,tag in external:
            if tag in wallset:continue
            xyzs=gmsh.model.mesh.getNodes(2,tag,includeBoundary=True)[1].reshape(-1,3)
            if np.max(np.abs(xyzs[:,0]-xmin))<1e-4:labels['inlet'].append(tag)
            elif np.max(np.abs(xyzs[:,0]-xmax))<1e-4:labels['outlet'].append(tag)
            elif np.max(np.abs(xyzs[:,2]-zmax))<1e-4:labels['ceiling'].append(tag)
            elif np.max(np.abs(xyzs[:,1]-ymin))<1e-4 or np.max(np.abs(xyzs[:,1]-ymax))<1e-4:labels['sides'].append(tag)
            else:raise RuntimeError(f'Unclassified external surface {tag}, range {xyzs.min(0)} .. {xyzs.max(0)}')
        for label,labels_ in labels.items():
            assert labels_,label
            gmsh.model.addPhysicalGroup(2,labels_,name=label)
        gmsh.write(str(out/'tower.msh'));gmsh.write(str(out/'tower.su2'))
        tags,xyz,_=gmsh.model.mesh.getNodes();et,ets,ens=gmsh.model.mesh.getElements(3)
        quality={}
        for typ,tags_ in zip(et,ets):
            q=gmsh.model.mesh.getElementQualities(tags_,'minSICN')
            quality[gmsh.model.mesh.getElementProperties(typ)[0]]={'count':len(tags_),'minSICN':float(np.min(q)),'negative':int(np.sum(q<0)),'zero':int(np.sum(q==0))}
            assert np.all(q>0),f'Degenerate or inverted elements of type {typ}'
        report={'nodes':len(tags),'seconds':time.time()-start,'elementQuality':quality,'bodyHeight':H,'crown':'flat' if args.flat_crown else 'film rim 615.5+16.5*cos(t-0.7); closed smooth top membrane approximation','twistDegrees':args.twist,'firstLayer':args.first_layer,'layers':args.layers,'layerThicknessesCumulative':dist.tolist(),'surfaceTargetSize':args.lc,'domain':[xmin,xmax,ymin,ymax,0,zmax],'externalSurfaceGroups':labels,'allExternalSurfacesClassified':True,'geometry':'Film support-function rounded triangle, taper area ratio 0.45, 120 degree twist, ground attached; no surrounding city.','limitations':['Smooth reconstructed envelope, not as-built facade, openings or neighboring city.','A RANS setup/mesh is not yet a converged or validated flow solution.','Prescribed isolated-building inflow is not a measured Shanghai atmospheric boundary layer.']}
        (out/'mesh-report.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
    finally:
        (out/'gmsh.log').write_text('\n'.join(gmsh.logger.get())+'\n',encoding='utf-8')
        gmsh.finalize()

if __name__=='__main__':main()
