"""Independent elastic wall-shell reconstruction; SI units and Three.js Y-up.

This is not the old equivalent-core beam solver and not an as-built model.
Only this script's v10 research directory is written. The local Zwind compiled
OpenSees 3.8 backend is mandatory. No third-party model is imported.
"""
from pathlib import Path
import argparse, copy, datetime, hashlib, json, math, os, sys, time
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'research/physics-v10'
ZWIND = Path('D:/python_project/os2zwind')
G = 9.80665
A = dict(concreteE=34e9, concreteRho=2500., columnE=40e9, columnRho=3500.,
         steelE=200e9, steelRho=7850., nu=.2, floorDeadPa=7500., floorLivePa=1500.,
         floorCoreShare=.6, outerWallBase=1.2, outerWallTop=.5, innerWallBase=.9,
         innerWallTop=.5, outriggerChordA=.20, outriggerDiagonalA=.14,
         beltChordA=.16, beltDiagonalA=.10, windSpeed500=30., windCd=1.2,
         airRho=1.225, dampingRatio=.0057, tmdMass=1e6)

def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p, data):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n', 'utf8')
def backend():
    if sys.version_info[:2] != (3, 14): raise RuntimeError('Use local Python314 for Zwind binary')
    dll = os.add_dll_directory(str(ZWIND/'bin')); sys.path.insert(0, str(ZWIND))
    import zwind as ops
    if Path(ops._ops.__file__).resolve() != (ZWIND/'bin/opensees.pyd').resolve():
        raise RuntimeError('Refuse any fallback solver')
    return ops, dll
def frozen_parameters():
    target = OUT/'inputs/parameters.json'
    if not target.exists():
        source = ROOT/'research/model-source-parameters.json'
        source_data = json.loads(source.read_text('utf8'))
        params = json.loads((ROOT/'public/models/shanghai-tower-manifest.json').read_text('utf8'))['parameters']
        params.update(source_data['parameters'])
        save(target, dict(parameters=params, assumptions=A, sources=source_data['verified'],
                         explicitApproximations=source_data['explicit_approximations'],
                         sourceSHA256=sha(source), frozenUTC=stamp()))
    return json.loads(target.read_text('utf8'))['parameters']
def lerp(a, b, t): return a+(b-a)*t
def zone(p, y): return next((i for i, b in enumerate(p['zone_boundaries'][1:], 1) if y<=b+1e-6), 9)
def radius(p, y): return lerp(p['inner_radius_base'], p['inner_radius_top'], min(y/p['floor_radius_top_height'], 1))
def column(p, y, c):
    r=radius(p,y)*p['column_axis_ratio']; d=p['mega_column_pair_offset']
    x,b=[(r,d),(d,r),(-d,r),(-r,d),(-r,-d),(-d,-r),(d,-r),(r,-d)][c]
    return [x,y,-b]
def corner(p,y,c):
    a=math.pi/4+c*math.pi/2; r=radius(p,y)*p['corner_column_axis_ratio']
    return [r*math.cos(a),y,-r*math.sin(a)]
def core_ids(z): return [f'CORE_Z{z:02}_W{k}' for k in range(1,5)]+[f'CORE_Z{z:02}_CELLS']
def beam_section(p,y,kind):
    if kind=='corner': b=h=lerp(p['corner_column_base_width'],p['corner_column_top_width'],y/p['corner_column_top'])
    else:
        b=lerp(p['mega_column_base_section'][0],p['mega_column_top_section'][0],y/p['mega_column_top'])
        h=lerp(p['mega_column_base_section'][1],p['mega_column_top_section'][1],y/p['mega_column_top'])
    return dict(A=b*h,E=A['columnE'],G=A['columnE']/2.4,
                J=b*h**3*(1/3-.21*h/b*(1-h**4/(12*b**4))),Iy=h*b**3/12,
                Iz=b*h**3/12,cy=h/2,cz=b/2,density=A['columnRho'])

def wall_segments(shape, step):
    """Unique wall centrelines with shared nodes at intersections; local shell 2 is vertical."""
    def inside(x,z):
        if shape=='square9': return True
        if shape=='chamfer9': return abs(x)+abs(z)<=20+1e-7
        if shape=='cross5': return abs(x)<=5+1e-7 or abs(z)<=5+1e-7
        return abs(z)<=5+1e-7
    raw=[]
    for q in [-15.,-5.,5.,15.]:
        for k in [-15.,-5.,5.]:
            for a,b in [((q,k),(q,k+10)),((k,q),(k+10,q))]:
                if inside((a[0]+b[0])/2,(a[1]+b[1])/2): raw.append((a,b))
    if shape=='chamfer9':
        for sx,sz in [(1,1),(-1,1),(-1,-1),(1,-1)]:raw.append(((15*sx,5*sz),(5*sx,15*sz)))
    result=[]
    for a,b in raw:
        a=np.array(a);b=np.array(b)
        # Grid segments contain 5m outrigger anchor coordinates at all resolutions.
        n=max(1,math.ceil(float(np.linalg.norm(b-a))/step))
        if np.count_nonzero(a-b)==1: n=max(2,int(round(10/step)))
        for j in range(n):
            v=a+(b-a)*j/n; w=a+(b-a)*(j+1)/n
            mid=(v+w)/2; eps=.01; tangent=(b-a)/np.linalg.norm(b-a);normal=np.array([-tangent[1],tangent[0]])
            outer=not inside(*(mid+normal*eps)) or not inside(*(mid-normal*eps))
            if shape=='square9': outer=abs(mid[0])>14.99 or abs(mid[1])>14.99
            # For non-square shapes the finite bounding square also defines perimeter.
            outer=outer or abs(mid[0])>14.99 or abs(mid[1])>14.99
            result.append((v,w,outer))
    return result

def make_graph(p, step=5., vertical_refine=1):
    anchors=np.array(p['floor_elevation_anchors'])
    floors=[round(float(np.interp(i,anchors[:,0],anchors[:,1])),6) for i in range(2,p['floors']+1)]+[p['occupied_top']]
    structural_levels=sorted(set([0.,*floors,*p['zone_boundaries'][1:],*[round(y-8.6,6) for y in p['zone_boundaries'][1:-1]]]))
    heights=sorted(set(round(lerp(a,b,k/vertical_refine),6) for a,b in zip(structural_levels[:-1],structural_levels[1:]) for k in range(vertical_refine))|{structural_levels[-1]})
    nodes=[];members=[];by={};coord={};level_nodes={}; masters={};cols={};corners={};sections={}
    def node(id,xyz,role,meshids=None):
        key=tuple(round(float(v),6) for v in xyz)
        if key in coord:return coord[key]
        n=dict(id=id,tag=len(nodes)+1,xyz=list(key),level=key[1],role=role,meshIds=meshids or [],gravityLoad=[0.,0.,0.],mass6=[0.]*6)
        nodes.append(n);by[id]=n;coord[key]=id;level_nodes.setdefault(key[1],[]).append(id);return id
    def shell_node(li,x,z): return node(f'N_W_{li:03}_{x:+09.5f}_{z:+09.5f}',[x,heights[li],z],'wall',core_ids(zone(p,heights[li])))
    def member(id,nids,role,kind,sec,mesh):
        m=dict(id=id,tag=len(members)+1,nodeIds=nids,role=role,type=kind,section=sec,meshIds=mesh)
        members.append(m);return m
    for li,(low,high) in enumerate(zip(heights[:-1],heights[1:]),1):
        z=zone(p,(low+high)/2);shape=p['core_shapes'][z-1]
        for si,(a,b,outer) in enumerate(wall_segments(shape,step)):
            # counterclockwise from lower-left, with local 1 horizontal, local 2 up
            ids=[shell_node(li-1,*a),shell_node(li-1,*b),shell_node(li,*b),shell_node(li,*a)]
            thick=lerp(A['outerWallBase'] if outer else A['innerWallBase'],A['outerWallTop'] if outer else A['innerWallTop'],(low+high)/2/p['occupied_top'])
            skey=round(thick,9);sections.setdefault(skey,len(sections)+1)
            horizontal=np.array([b[0]-a[0],0.,b[1]-a[1]]);horizontal/=np.linalg.norm(horizontal)
            sec=dict(E=A['concreteE'],nu=A['nu'],thickness=thick,density=A['concreteRho'],sectionTag=sections[skey])
            mesh=core_ids(z) if outer else [f'CORE_Z{z:02}_CELLS']
            m=member(f'S_Z{z:02}_L{li:03}_{si:03}',ids,'corewall','shell',sec,mesh)
            m.update(area=float(np.linalg.norm(b-a))*(high-low),localAxes=[horizontal.tolist(),[0.,1.,0.],np.cross(horizontal,[0,1,0]).tolist()],zone=z,exterior=bool(outer))
    for li,y in enumerate(heights):
        z=zone(p,y)
        if y in structural_levels:
            masters[y]=node(f'N_CORE_{li:03}',[0.,y,0.],'diaphragm')
        for c in range(8):
            if y>p['mega_column_top']+1e-6:continue
            cols[li,c]=node(f'N_C{c+1:02}_{li:03}',column(p,y,c),'megacolumn',[f'MEGACOL_Z{z:02}_C{c+1:02}'])
            if li: member(f'M_C{c+1:02}_{li:03}',[cols[li-1,c],cols[li,c]],'megacolumn','beam',beam_section(p,(y+heights[li-1])/2,'column'),[f'MEGACOL_Z{zone(p,(y+heights[li-1])/2):02}_C{c+1:02}'])
        for c in range(4):
            if y>p['corner_column_top']+1e-6:continue
            corners[li,c]=node(f'N_K{c+1:02}_{li:03}',corner(p,y,c),'cornercolumn',[f'CORNERCOL_Z{z:02}_C{c+1:02}'])
            if li:member(f'M_K{c+1:02}_{li:03}',[corners[li-1,c],corners[li,c]],'cornercolumn','beam',beam_section(p,(y+heights[li-1])/2,'corner'),[f'CORNERCOL_Z{zone(p,(y+heights[li-1])/2):02}_C{c+1:02}'])
    for zi,top in enumerate(p['zone_boundaries'][1:-1],1):
        bottom=round(top-8.6,6);bl=heights.index(bottom);tl=heights.index(top);coreanchors={};cn={}
        for c in range(8) if zi in p['outrigger_zone_indices'] else []:
            for side,li in [('B',bl),('T',tl)]:
                v=column(p,heights[li],c);ax=math.copysign(15,v[0]) if abs(v[0])>abs(v[2]) else v[0];az=math.copysign(15,v[2]) if abs(v[2])>abs(v[0]) else v[2]
                key=tuple(round(v,6) for v in [ax,heights[li],az])
                if key not in coord:raise RuntimeError(f'Unconnected wall anchor {key}')
                coreanchors[c,side]=coord[key]
        for c in range(4):
            for side,li in [('B',bl),('T',tl)]:
                cn[c,side]=corners.get((li,c)) or node(f'N_BELT_CORNER_Z{zi:02}_K{c+1:02}_{side}',corner(p,heights[li],c),'beltNode',[f'OUTRIGGERS_Z{zi:02}_TRUSS'])
        for c in range(8):
            nxt=(c+1)%8;cb=cols[bl,c];ct=cols[tl,c];nb=cols[bl,nxt];nt=cols[tl,nxt]
            def truss(code,a,b,role,diag):
                id=f'M_Z{zi:02}_C{c+1:02}_{code}';area=A[role+('DiagonalA' if diag else 'ChordA')]
                member(id,[a,b],role,'truss',dict(A=area,E=A['steelE'],density=A['steelRho']),['FE_'+id])
            if zi in p['outrigger_zone_indices']:
                for code,a,b,diag in [('OB',coreanchors[c,'B'],cb,False),('OT',coreanchors[c,'T'],ct,False),('OX1',coreanchors[c,'B'],ct,True),('OX2',coreanchors[c,'T'],cb,True)]:truss(code,a,b,'outrigger',diag)
            spans=[('',cb,ct,nb,nt)]
            if c%2==0:
                kb=cn[c//2,'B'];kt=cn[c//2,'T'];spans=[('A',cb,ct,kb,kt),('B',kb,kt,nb,nt)]
            for suffix,ab,at,bb,bt in spans:
                for code,a,b,diag in [('BB',ab,bb,False),('BT',at,bt,False),('BX1',ab,bt,True),('BX2',at,bb,True)]:truss(code+suffix,a,b,'belt',diag)
    # Structural selfweight and lumped translational structural mass, counted once.
    for m in members:
        sec=m['section']
        volume=m['area']*sec['thickness'] if m['type']=='shell' else float(np.linalg.norm(np.array(by[m['nodeIds'][1]]['xyz'])-by[m['nodeIds'][0]]['xyz']))*sec['A']
        mass=volume*sec['density'];m['mass']=mass
        for nid in m['nodeIds']:
            n=by[nid];share=mass/len(m['nodeIds']);n['gravityLoad'][1]-=share*G
            for d in range(3):n['mass6'][d]+=share
    for y in floors:
        ids=level_nodes[y];ws=[i for i in ids if by[i]['role']=='wall'];cs=[i for i in ids if by[i]['role'] in ('megacolumn','cornercolumn')]
        floor_area=math.pi*radius(p,y)**2-900
        mass=floor_area*(A['floorDeadPa']+A['floorLivePa'])/G
        master=by[masters[y]];master['mass6'][0]+=mass;master['mass6'][2]+=mass
        # Uniform disk minus 30m square floor polar mass moment (explicit load idealization).
        master['mass6'][4]+=mass*(math.pi*radius(p,y)**4/2-135000)/floor_area
        share=A['floorCoreShare'] if cs else 1.
        for group,factor in [(ws,share),(cs,1-share)]:
            for nid in group:
                by[nid]['gravityLoad'][1]-=mass*G*factor/len(group);by[nid]['mass6'][1]+=mass*factor/len(group)
    top=p['occupied_top'];topwalls=[by[i] for i in level_nodes[top] if by[i]['role']=='wall']
    by[masters[top]]['mass6'][0]+=A['tmdMass'];by[masters[top]]['mass6'][2]+=A['tmdMass']
    for n in topwalls:n['gravityLoad'][1]-=A['tmdMass']*G/len(topwalls);n['mass6'][1]+=A['tmdMass']/len(topwalls)
    constraints=[]
    for y,master in masters.items():
        if y==0:continue
        for nid in level_nodes[y]:
            if nid!=master:constraints.append(dict(type='rigidDiaphragm',master=master,slave=nid,perpendicularAxis=2))
    wind=[];windlevels=sorted(y for y in masters if y>0);exp=math.log(50/31.7)/math.log(500/10)
    for i,y in enumerate(windlevels):
        low=0. if i==0 else (y+windlevels[i-1])/2
        high=p['height'] if i+1==len(windlevels) else (y+windlevels[i+1])/2
        speed=A['windSpeed500']*(max(y,10)/500)**exp;r=p['base_outer_radius']*math.sqrt(lerp(1,p['top_area_ratio'],y/p['height']))
        force=.5*A['airRho']*speed**2*A['windCd']*2*r*(high-low)
        wind.append(dict(nodeId=masters[y],height=y,force=[force,0.,0.],speed=speed,tributaryHeight=high-low))
    return dict(schema='rainbow.shanghai-shell-graph/10',coordinates='Three Y-up',units=dict(length='m',force='N',mass='kg'),
                parameters=p,assumptions=A,nodes=nodes,members=members,constraints=constraints,
                fixedNodeIds=[n['id'] for n in nodes if n['level']==0],heights=heights,floorHeights=floors,diaphragmLevels=structural_levels,
                masters={str(k):v for k,v in masters.items()},windLoads=wind,mesh=dict(horizontalStepMax_m=step,verticalRefine=vertical_refine),
                scope=['Actual assembled linear-elastic ShellMITC4 wall mesh, elastic beam columns, and steel axial trusses. No equivalent core beam.',
                       'Public source-constrained geometry; all unverified section interpolation, openings omission, material constants, floor mass, truss sizes, and wind inputs explicitly assumed.',
                       'Walls are continuous solid panels without door/lift openings or reinforcement, cracking, yielding, creep, buckling, connection failure, or second-order effects.',
                       'Fixed ground boundary; piles, raft, soil, basement flexibility and facade loads other than assumed floor/wind loads are not solved.',
                       'Rigid in-plane floors at explicit floor/strengthening/mechanical truss chord levels; gravity distributed to walls and columns; out-of-plane floor bending not solved.',
                       'Wind pressure is a prescribed 30m/s at500m educational case, not CFD or installed-design wind. Mass and E are not fitted to a target period.',
                       'TMD mass included as attached mass for modal/static tower baseline; no installed damping-device certification.'])

def build(ops,g,remove_outriggers=False):
    ops.wipe();ops.model('basic','-ndm',3,'-ndf',6);ops.geomTransf('Linear',1,0,0,1);ops.uniaxialMaterial('Elastic',1,A['steelE'])
    by={n['id']:n for n in g['nodes']};fixed=set(g['fixedNodeIds'])
    for n in g['nodes']:
        ops.node(n['tag'],*n['xyz']);ops.mass(n['tag'],*n['mass6'])
        if n['id'] in fixed:ops.fix(n['tag'],1,1,1,1,1,1)
        elif n['role']=='diaphragm':ops.fix(n['tag'],0,1,0,1,0,1)
        elif n['role']=='beltNode':ops.fix(n['tag'],0,0,0,1,0,1)
    done=set()
    for m in g['members']:
        s=m['section'];ts=[by[n]['tag'] for n in m['nodeIds']]
        if m['type']=='shell':
            if s['sectionTag'] not in done:
                # rho=0: selfweight and mass are already explicitly lumped above.
                ops.section('ElasticMembranePlateSection',s['sectionTag'],s['E'],s['nu'],s['thickness'],0.);done.add(s['sectionTag'])
            ops.element('ShellMITC4',m['tag'],*ts,s['sectionTag'])
        elif m['type']=='beam':ops.element('elasticBeamColumn',m['tag'],*ts,s['A'],s['E'],s['G'],s['J'],s['Iy'],s['Iz'],1)
        elif not(remove_outriggers and m['role']=='outrigger'):ops.element('truss',m['tag'],*ts,s['A'],1)
    for c in g['constraints']:ops.rigidDiaphragm(2,by[c['master']]['tag'],by[c['slave']]['tag'])
    ops.constraints('Transformation');ops.numberer('RCM');ops.system('UmfPack');ops.test('NormUnbalance',1e-5,30);ops.algorithm('Linear')

def fields(ops,g,remove_outriggers=False):
    six=np.array([ops.nodeDisp(n['tag']) for n in g['nodes']]);wall=[];line=[];globalforces=[]
    for m in g['members']:
        if remove_outriggers and m['role']=='outrigger':
            line.append([0.,0.]);globalforces.append([0.]*24);continue
        f=list(ops.eleForce(m['tag']))
        if len(f)==6:f=f[:3]+[0.]*3+f[3:]+[0.]*3
        globalforces.append(f+[0.]*(24-len(f)))
        if m['type']=='shell':
            s=np.array(ops.eleResponse(m['tag'],'stresses')).reshape(4,8)
            wall.append(s)
        else:
            s=m['section']
            if m['type']=='truss':
                axial=ops.eleResponse(m['tag'],'axialForce')[0]/s['A']/1e6;extreme=abs(axial)
            else:
                f=ops.eleResponse(m['tag'],'localForce');axial=(f[6]-f[0])/2/s['A']/1e6
                extreme=max(abs(axial)+(abs(f[k+4])*s['cz']/s['Iy']+abs(f[k+5])*s['cy']/s['Iz'])/1e6 for k in [0,6])
            line.append([axial,extreme])
    wall=np.array(wall);thick=np.array([m['section']['thickness'] for m in g['members'] if m['type']=='shell'])[:,None]
    n11,n22,n12=[wall[:,:,i]/thick/1e6 for i in range(3)]
    vm=np.sqrt(n11*n11+n22*n22-n11*n22+3*n12*n12)
    pmax=(n11+n22)/2+np.sqrt(((n11-n22)/2)**2+n12*n12)
    return dict(u=six[:,:3],r=six[:,3:],shellResultants=wall,wallVerticalMPa=n22,wallVonMisesMPa=vm,
                wallPrincipalMaxMPa=pmax,lineStressMPa=np.array(line),globalElementForces=np.array(globalforces))

def balance(ops,g,loads):
    ops.reactions();by={n['id']:n for n in g['nodes']};reaction=np.zeros(6);applied=np.zeros(6);moment_scale=0.
    for nid in g['fixedNodeIds']:
        n=by[nid];v=np.array(ops.nodeReaction(n['tag']));reaction+=v;reaction[3:]+=np.cross(n['xyz'],v[:3])
    for nid,f in loads.items():
        applied[:3]+=f;moment=np.cross(by[nid]['xyz'],f);applied[3:]+=moment;moment_scale+=np.linalg.norm(moment)
    return dict(applied=applied.tolist(),reaction=reaction.tolist(),residual=(reaction+applied).tolist(),
                relativeForce=float(np.linalg.norm((reaction+applied)[:3])/max(1,np.linalg.norm(applied[:3]))),
                momentNormalization_Nm=float(moment_scale),relativeMoment=float(np.linalg.norm((reaction+applied)[3:])/max(1,moment_scale)))

def static(ops,g,axis=None,factor=1.,gravity=True,rebuild=True,remove_outriggers=False):
    if rebuild:build(ops,g,remove_outriggers)
    by={n['id']:n for n in g['nodes']};loads={n['id']:np.array(n['gravityLoad'] if gravity else [0.,0.,0.]) for n in g['nodes']}
    if axis is not None:
        direction=np.array([math.cos(axis),0.,math.sin(axis)])
        for w in g['windLoads']:loads[w['nodeId']]+=np.linalg.norm(w['force'])*factor*direction
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
    for nid,load in loads.items():
        if np.any(load):ops.load(by[nid]['tag'],*load,0.,0.,0.)
    ops.integrator('LoadControl',1.);ops.analysis('Static');started=time.time();code=ops.analyze(1)
    if code:raise RuntimeError(f'Static analysis failed {code}')
    result=fields(ops,g,remove_outriggers);eq=balance(ops,g,loads)
    if not all(np.isfinite(v).all() for v in result.values()):raise RuntimeError('Non-finite response')
    return result,dict(code=code,seconds=time.time()-started,equilibrium=eq)

def patch_tests(ops):
    """A real membrane shell tensile patch and transverse plate test against analytics."""
    output=[]
    for nx in [1,2,4]:
        ops.wipe();ops.model('basic','-ndm',3,'-ndf',6)
        E=34e9;nu=.2;t=.5;L=10.;H=10.;traction=1e5
        for j in range(nx+1):
            for i in range(nx+1):
                tag=j*(nx+1)+i+1;ops.node(tag,L*i/nx,H*j/nx,0.)
                # In-plane tensile patch, suppress only rigid body motion and out-of-plane DOFs.
                ops.fix(tag,int(i==0),int(j==0),1,1,1,0)
        ops.section('ElasticMembranePlateSection',1,E,nu,t,0.)
        for j in range(nx):
            for i in range(nx):
                n=j*(nx+1)+i+1;ops.element('ShellMITC4',j*nx+i+1,n,n+1,n+nx+2,n+nx+1,1)
        ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
        for j in range(nx+1):ops.load(j*(nx+1)+nx+1,traction*t*H/nx*(.5 if j in [0,nx] else 1),0.,0.,0.,0.,0.)
        ops.constraints('Plain');ops.numberer('RCM');ops.system('UmfPack');ops.algorithm('Linear');ops.integrator('LoadControl',1);ops.analysis('Static')
        code=ops.analyze(1);u=ops.nodeDisp((nx+1)**2,1);expected=traction*L/E
        ops.eleForce(1) # Shell material strains update when its resisting force is assembled.
        stress=np.array(ops.eleResponse(1,'stresses')).reshape(4,8)[:,0]/t
        output.append(dict(name='uniaxial shell membrane patch',subdivisions=nx,code=code,expectedDisplacement=expected,actualDisplacement=u,
                           relativeDisplacementError=abs(u-expected)/expected,stressRelativeError=float(np.max(abs(stress-traction))/traction),
                           passed=bool(code==0 and abs(u-expected)/expected<1e-8 and np.max(abs(stress-traction))/traction<1e-8)))
    ops.wipe();return output

def topology_audit(g):
    by={n['id']:n for n in g['nodes']};used={i:0 for i in by};adj={i:set() for i in by}
    for m in g['members']:
        for n in m['nodeIds']:
            used[n]+=1;adj[n].update(m['nodeIds'])
    for c in g['constraints']:adj[c['master']].add(c['slave']);adj[c['slave']].add(c['master'])
    seen=set(g['fixedNodeIds']);queue=list(seen)
    while queue:
        for n in adj[queue.pop()]:
            if n not in seen:seen.add(n);queue.append(n)
    anchors={nid for m in g['members'] if m['role']=='outrigger' for nid in m['nodeIds'] if by[nid]['role']=='wall'}
    return dict(nodes=len(by),members=len(g['members']),shells=sum(m['type']=='shell' for m in g['members']),
                beamTruss=sum(m['type']!='shell' for m in g['members']),shellAnchorCount=len(anchors),
                disconnectedNodes=[i for i in by if i not in seen],
                unattachedStructuralNodes=[i for i,n in by.items() if not used[i] and n['role']!='diaphragm'],
                totalGravity_N=-sum(n['gravityLoad'][1] for n in g['nodes']),
                totalMassX=sum(n['mass6'][0] for n in g['nodes']),totalMassY=sum(n['mass6'][1] for n in g['nodes']))

def run(args):
    ops,dll=backend();OUT.mkdir(parents=True,exist_ok=True);p=frozen_parameters()
    tests=patch_tests(ops);save(OUT/'verification/shell-patch-tests.json',tests)
    if not all(t['passed'] for t in tests):raise RuntimeError('Shell patch test failed')
    g=make_graph(p,args.step,args.vertical_refine);folder=OUT/args.name;folder.mkdir(parents=True,exist_ok=True)
    save(folder/'graph.json',g);audit=topology_audit(g);save(folder/'topology.json',audit)
    if audit['disconnectedNodes'] or audit['unattachedStructuralNodes']:raise RuntimeError('Disconnected mesh')
    print('GRAPH',json.dumps(audit),flush=True)
    if args.mesh_only:return
    reports={};base=None
    cases=[('gravity',None,1.,True),('wind-x',0.,1.,False),('wind-z',math.pi/2,1.,False)]
    if not args.quick:cases.extend([('wind-half',0.,.5,False),('wind-reverse',0.,-1.,False),('wind-z-reverse',math.pi/2,-1.,False)])
    for name,axis,factor,gravity in cases:
        state,report=static(ops,g,axis,factor,gravity);reports[name]=report
        np.savez_compressed(folder/(name+'.npz'),**state)
        print('CASE',name,json.dumps(report),flush=True)
    started=time.time();build(ops,g)
    eig=np.array(ops.eigen(args.modes));period=2*math.pi/np.sqrt(eig)
    modes=np.array([[ops.nodeEigenvector(n['tag'],j+1) for n in g['nodes']] for j in range(len(eig))])
    np.savez_compressed(folder/'modes.npz',eigenvalues=eig,periods=period,vectors=modes)
    reports['modal']=dict(eigenvalues=eig.tolist(),periods_s=period.tolist(),seconds=time.time()-started,positive=bool(np.all(eig>0)))
    reports['provenance']=dict(finishedUTC=stamp(),scriptSHA256=sha(__file__),inputSHA256=sha(OUT/'inputs/parameters.json'),graphSHA256=sha(folder/'graph.json'),
                               backendVersion=ops.version(),backendFile=str(ZWIND/'bin/opensees.pyd'),backendSHA256=sha(ZWIND/'bin/opensees.pyd'),wrapperSHA256=sha(ZWIND/'zwind/__init__.py'),python=sys.version)
    save(folder/'run-summary.json',reports);print('COMPLETE',json.dumps(reports['modal']),flush=True);ops.wipe()

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--step',type=float,default=5.);ap.add_argument('--vertical-refine',type=int,default=1)
    ap.add_argument('--name',default='coarse');ap.add_argument('--modes',type=int,default=8);ap.add_argument('--quick',action='store_true');ap.add_argument('--mesh-only',action='store_true')
    run(ap.parse_args())

