"""Actual local Zwind/OpenSees 3.8 structural solve for the educational tower.

Python 3.14 is required by os2zwind/bin/opensees.pyd. No pip backend fallback
is allowed. SI metres / Newtons / kilograms / seconds, Three.js Y-up axes.
This is a documented equivalent model, NOT an as-built safety calculation.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,math,os,sys,time
import numpy as np

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/physics';RAW=OUT/'raw'
ZWIND=Path('D:/python_project/os2zwind');G=9.80665
PARAM=json.loads((ROOT/'public/models/shanghai-tower-manifest.json').read_text('utf8'))['parameters']
PARAM.update(json.loads((ROOT/'research/model-source-parameters.json').read_text('utf8')).get('parameters',{}))
ASSUMPTIONS={
 'concrete_E_Pa':34e9,'concrete_density_kg_m3':2500,'composite_column_E_Pa':40e9,
 'composite_column_density_kg_m3':3500,'steel_E_Pa':200e9,'steel_density_kg_m3':7850,
 'poisson_ratio':.2,'floor_dead_load_Pa':7500,'floor_live_participating_Pa':1500,
 'gravity_core_floor_share':.6,'damping_ratio':.0057,'wind_reference_m_s':30,'wind_reference_height_m':500,
 'wind_exponent':math.log(50/31.7)/math.log(500/10),'air_density_kg_m3':1.225,'wind_force_coefficient':1.2,
 'column_width_base_m':PARAM['mega_column_base_section'][0],'column_width_top_m':2.4,'column_depth_base_m':PARAM['mega_column_base_section'][1],'column_depth_top_m':1.9,
 'outrigger_chord_area_m2':.20,'outrigger_diagonal_area_m2':.14,
 'belt_chord_area_m2':.16,'belt_diagonal_area_m2':.10,'mechanical_truss_height_m':8.6,
 'tmd_mass_kg':1e6,'tmd_damping_ratio_assumed':.08,
}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
def lerp(a,b,t):return a+(b-a)*t
def level_zone(y):return next((i for i,b in enumerate(PARAM['zone_boundaries'][1:],1) if y<=b+1e-6),9)
def core_mesh_ids(zone):return [f'CORE_Z{zone:02}_W{i}' for i in range(1,5)]+[f'CORE_Z{zone:02}_CELLS']
def inner(y):return lerp(PARAM['inner_radius_base'],PARAM['inner_radius_top'],min(y/PARAM['floor_radius_top_height'],1))
def width(y):return lerp(PARAM['core_width_base'],PARAM['core_width_top'],y/PARAM['occupied_top'])
def column(y,c):
    r=inner(y)*PARAM['column_axis_ratio'];d=PARAM['mega_column_pair_offset']
    x,b=[(r,d),(d,r),(-d,r),(-r,d),(-r,-d),(-d,-r),(d,-r),(r,-d)][c]
    return [x,y,-b]
def corner(y,c):
    a=math.pi/4+c*math.pi/2;r=inner(y)*PARAM['corner_column_axis_ratio']
    return [r*math.cos(a),y,-r*math.sin(a)]
def core_section(y):
    # Midpoint integration of the SOURCE-CONSTRAINED nine-cell wall network.
    # The 0.05 m quadrature is independently refined during verification.
    return integrate_core(y,.05)
def integrate_core(y,step):
    t=lerp(PARAM['core_wall_base'],PARAM['core_wall_top'],y/PARAM['occupied_top']);web=lerp(.9,.5,y/PARAM['occupied_top']);shape=PARAM['core_shapes'][level_zone(y)-1]
    a=np.arange(-15+step/2,15,step);x,z=np.meshgrid(a,a)
    envelope=np.ones(x.shape,bool)
    if shape=='chamfer9':envelope=(abs(x)+abs(z)<=20)
    elif shape=='cross5':envelope=(abs(x)<=5)|(abs(z)<=5)
    elif shape=='rectangle3':envelope=abs(z)<=5
    # Grid walls and the actual perimeter of the cut envelope are retained.
    walls=np.zeros(x.shape,bool)
    for p in [-15,-5,5,15]:walls|=(abs(x-p)<=web/2 if abs(p)<15 else abs(x)>=15-t)|(abs(z-p)<=web/2 if abs(p)<15 else abs(z)>=15-t)
    if shape=='chamfer9':walls|=(abs(x)+abs(z)>=20-t*math.sqrt(2))
    elif shape=='cross5':walls|=((abs(x)>=5-t)&(abs(z)>=5-t))
    elif shape=='rectangle3':walls|=(abs(z)>=5-t)
    mask=envelope&walls;area=float(mask.sum()*step**2);Iy=float(np.sum(z[mask]**2)*step**2);Iz=float(np.sum(x[mask]**2)*step**2)
    return area,Iy,Iz,float(abs(x[mask]).max()+step/2),float(abs(z[mask]).max()+step/2)
def section(y,kind):
    if kind=='core':
        area,Iy,Iz,cy,cz=core_section(y);E=ASSUMPTIONS['concrete_E_Pa'];rho=ASSUMPTIONS['concrete_density_kg_m3']
        # Approximate effective torsion; lateral explanation avoids claiming torsion accuracy.
        return dict(A=area,E=E,G=E/(2*(1+ASSUMPTIONS['poisson_ratio'])),J=.5*(Iy+Iz),Iy=Iy,Iz=Iz,cy=cy,cz=cz,density=rho)
    if kind=='corner':
        b=h=lerp(PARAM['corner_column_base_width'],PARAM['corner_column_top_width'],y/PARAM['corner_column_top'])
    else:
        b=lerp(ASSUMPTIONS['column_width_base_m'],ASSUMPTIONS['column_width_top_m'],y/PARAM['mega_column_top']);h=lerp(ASSUMPTIONS['column_depth_base_m'],ASSUMPTIONS['column_depth_top_m'],y/PARAM['mega_column_top'])
    E=ASSUMPTIONS['composite_column_E_Pa']
    return dict(A=b*h,E=E,G=E/2.4,J=b*h**3*(1/3-.21*h/b*(1-h**4/(12*b**4))),Iy=h*b**3/12,Iz=b*h**3/12,cy=h/2,cz=b/2,density=ASSUMPTIONS['composite_column_density_kg_m3'])

def graph():
    occ=PARAM['occupied_top'];zones=PARAM['zone_boundaries'];anchors=np.array(PARAM['floor_elevation_anchors']);floors=[float(np.interp(i,anchors[:,0],anchors[:,1])) for i in range(2,PARAM['floors']+1)]+[occ]
    heights=sorted(set(round(x,6) for x in [0,*floors,*zones[1:],*[z-ASSUMPTIONS['mechanical_truss_height_m'] for z in zones[1:-1]]]))
    nodes=[];members=[];constraints=[];index={};nodebyid={};loads={};nexttag=1
    def node(id,xyz,role,meshids):
        nonlocal nexttag
        n=dict(id=id,tag=nexttag,xyz=[round(v,7) for v in xyz],xyzBlender=[round(xyz[0],7),round(-xyz[2],7),round(xyz[1],7)],role=role,level=round(xyz[1],6),meshIds=meshids)
        nexttag+=1;nodes.append(n);nodebyid[id]=n;loads[id]=np.zeros(3);return id
    def member(id,i,j,role,sec,meshids,legacy=None):
        members.append(dict(id=id,tag=len(members)+1,nodeIds=[i,j],role=role,type='truss' if role in ['outrigger','belt'] else 'beam',meshIds=meshids,legacyMeshIds=legacy or [],section=sec))
    for li,y in enumerate(heights):
        z=level_zone(y);coreid=node(f'N_CORE_{li:03}',[0,y,0],'core',core_mesh_ids(z));index[(li,-1)]=coreid
        for c in range(8):
            if y>PARAM['mega_column_top']+1e-6:continue
            cid=node(f'N_C{c+1:02}_{li:03}',column(y,c),'megacolumn',[f'MEGACOL_Z{z:02}_C{c+1:02}']);index[(li,c)]=cid
            if li>0:constraints.append(dict(type='rigidDiaphragm',master=coreid,slave=cid,perpendicularAxis=2))
        for c in range(4):
            if y>PARAM['corner_column_top']+1e-6:continue
            cid=node(f'N_K{c+1:02}_{li:03}',corner(y,c),'cornercolumn',[f'CORNERCOL_Z{z:02}_C{c+1:02}']);index[(li,8+c)]=cid
            if li>0:constraints.append(dict(type='rigidDiaphragm',master=coreid,slave=cid,perpendicularAxis=2))
        if li>0:
            mid=(y+heights[li-1])/2;z=level_zone(mid)
            member(f'M_CORE_{li:03}',index[(li-1,-1)],coreid,'core',section(mid,'core'),core_mesh_ids(z))
            for c in range(8):
                if (li,c) not in index:continue
                midid=f'M_C{c+1:02}_{li:03}'
                member(midid,index[(li-1,c)],index[(li,c)],'megacolumn',section(mid,'column'),[f'MEGACOL_Z{z:02}_C{c+1:02}'])
            for c in range(4):
                if (li,8+c) not in index:continue
                member(f'M_K{c+1:02}_{li:03}',index[(li-1,8+c)],index[(li,8+c)],'cornercolumn',section(mid,'corner'),[f'CORNERCOL_Z{z:02}_C{c+1:02}'])
    for zi,top in enumerate(zones[1:-1],1):
        bottom=top-ASSUMPTIONS['mechanical_truss_height_m'];bottomli=heights.index(round(bottom,6));topli=heights.index(round(top,6));coreanchors={}
        for c in range(8) if zi in PARAM['outrigger_zone_indices'] else []:
            for side,li in [('B',bottomli),('T',topli)]:
                yy=heights[li];col=column(yy,c)
                ax=math.copysign(15,col[0]) if abs(col[0])>abs(col[2]) else col[0];az=math.copysign(15,col[2]) if abs(col[2])>abs(col[0]) else col[2]
                aid=node(f'N_ANCHOR_Z{zi:02}_C{c+1:02}_{side}',[ax,yy,az],'coreAnchor',core_mesh_ids(zi))
                coreanchors[(c,side)]=aid;constraints.append(dict(type='rigidLink',master=index[(li,-1)],slave=aid))
        cornernodes={}
        for c in range(4):
            for side,li in [('B',bottomli),('T',topli)]:
                if (li,8+c) in index:cornernodes[c,side]=index[li,8+c]
                else:
                    nid=node(f'N_BELT_CORNER_Z{zi:02}_K{c+1:02}_{side}',corner(heights[li],c),'beltNode',[f'OUTRIGGERS_Z{zi:02}_TRUSS']);cornernodes[c,side]=nid
                    constraints.append(dict(type='rigidDiaphragm',master=index[li,-1],slave=nid,perpendicularAxis=2))
        for c in range(8):
            nxt=(c+1)%8;cb=index[(bottomli,c)];ct=index[(topli,c)];nb=index[(bottomli,nxt)];nt=index[(topli,nxt)]
            def truss(code,a,b,role,area):
                id=f'M_Z{zi:02}_C{c+1:02}_{code}';member(id,a,b,role,dict(A=area,E=ASSUMPTIONS['steel_E_Pa'],density=ASSUMPTIONS['steel_density_kg_m3']),['FE_'+id],[f'OUTRIGGERS_Z{zi:02}_TRUSS'])
            for code,a,b,diag in ([('OB',coreanchors[c,'B'],cb,False),('OT',coreanchors[c,'T'],ct,False),('OX1',coreanchors[c,'B'],ct,True),('OX2',coreanchors[c,'T'],cb,True)] if zi in PARAM['outrigger_zone_indices'] else []):
                if zi in PARAM['outrigger_zone_indices']:truss(code,a,b,'outrigger',ASSUMPTIONS['outrigger_diagonal_area_m2' if diag else 'outrigger_chord_area_m2'])
            spans=[('',cb,ct,nb,nt)]
            if c%2==0:
                kb=cornernodes[c//2,'B'];kt=cornernodes[c//2,'T'];spans=[('A',cb,ct,kb,kt),('B',kb,kt,nb,nt)]
            for suffix,ab,at,bb,bt in spans:
                for code,a,b,diag in [('BB',ab,bb,False),('BT',at,bt,False),('BX1',ab,bt,True),('BX2',at,bb,True)]:truss(code+suffix,a,b,'belt',ASSUMPTIONS['belt_diagonal_area_m2' if diag else 'belt_chord_area_m2'])
    # Each real floor tributary is represented explicitly, despite the equivalent
    # structural core and beams; unverified uniform floor spacing is disclosed.
    for y in floors:
        li=heights.index(round(y,6));area=math.pi*inner(y)**2-width(y)**2
        mass=area*(ASSUMPTIONS['floor_dead_load_Pa']+ASSUMPTIONS['floor_live_participating_Pa'])/G
        cols=[c for c in range(12) if (li,c) in index];share=ASSUMPTIONS['gravity_core_floor_share'] if cols else 1.
        loads[index[li,-1]][1]-=mass*G*share
        for c in cols:loads[index[li,c]][1]-=mass*G*(1-share)/len(cols)
    loads[index[len(heights)-1,-1]][1]-=ASSUMPTIONS['tmd_mass_kg']*G
    for n in nodes:n['floorGravityLoad']=loads[n['id']].tolist()
    for m in members:
        a,b=[np.array(nodebyid[id]['xyz']) for id in m['nodeIds']];weight=float(np.linalg.norm(b-a))*m['section']['A']*m['section']['density']*G
        for id in m['nodeIds']:loads[id][1]-=weight/2
    wind=[]
    for li,y in enumerate(heights[1:],1):
        low=(y+heights[li-1])/2;high=(y+heights[li+1])/2 if li+1<len(heights) else PARAM['height']
        speed=ASSUMPTIONS['wind_reference_m_s']*(max(y,10)/ASSUMPTIONS['wind_reference_height_m'])**ASSUMPTIONS['wind_exponent']
        radius=PARAM['base_outer_radius']*math.sqrt(lerp(1,PARAM['top_area_ratio'],y/PARAM['height']))
        force=.5*ASSUMPTIONS['air_density_kg_m3']*speed**2*ASSUMPTIONS['wind_force_coefficient']*2*radius*(high-low)
        wind.append(dict(nodeId=index[li,-1],force=[force,0,0],height=y,speed=speed,tributaryHeight=high-low))
    for n in nodes:n['gravityLoad']=[float(v) for v in loads[n['id']]];n['mass']=max(1e-3,-loads[n['id']][1]/G)
    return dict(schema='rainbow.shanghai-structural-graph/1',units={'length':'m','force':'N','mass':'kg','stress':'Pa'},coordinates='Three Y-up',parameters=PARAM,assumptions=ASSUMPTIONS,
        nodes=nodes,members=members,constraints=constraints,fixedNodeIds=[index[0,i] for i in range(-1,12)],heights=heights,floorHeights=floors,windLoads=wind,
        renderMapping={'meshToMember':'Each member.meshIds maps exact GLB object IDs; CORE_*_CELLS are core-wall displacement proxies.',
            'nonStructuralMeshRoles':['floors','floorbeams','innerglass','outerglass','garden','sky_lobby'],'memberRoles':['core','megacolumn','cornercolumn','outrigger','belt'],
            'structuralMappingSHA256':'b4ec77240604336f6e81390d2265841a28c0f82fd0745a7ce258b1518cd0de8d'},
        scope=['Equivalent elastic 3D core beam + eight composite columns + steel outrigger/belt trusses, connected by rigid floor diaphragms.',
        'Fixed boundary at ground. Basement, piles, soil, facade support bolts, cracking, yielding, creep, buckling and construction residual stresses are not solved.',
        '1000-tonne TMD mass is sourced from Wu2021. Its illustrative spring is tuned to this equivalent model first mode with assumed 8% internal damping; actual installed stiffness/damping are not public inputs here.',
        'Gravity construction stages rebuild successively taller models; no sequential stress lock-in is implied.',
        'Wind is prescribed power-law pressure with deterministic fluctuations. The primary source reports 50 m/s at 500 m for a 100-year reference profile; this film uses an explicit 30 m/s illustrative input to keep the linear teaching response bounded. It is NOT CFD, wind-tunnel data or an as-built design wind.',
        'Intermediate floor heights interpolate published Fig6 elevations; unreported member sections, elastic constants and loads remain explicit teaching assumptions.'])

def load_backend():
    if sys.version_info[:2]!=(3,14):raise RuntimeError('Use Python314: local Zwind extension is compiled against python314.dll')
    dll=os.add_dll_directory(str(ZWIND/'bin'));sys.path.insert(0,str(ZWIND));import zwind as ops
    if Path(ops._ops.__file__).resolve()!=(ZWIND/'bin/opensees.pyd').resolve():raise RuntimeError('Refuse fallback solver: must execute the local Zwind component')
    return ops,dll

def verification(ops):
    ops.wipe();ops.model('basic','-ndm',2,'-ndf',3);ops.node(1,0,0);ops.node(2,0,10);ops.fix(1,1,1,1)
    ops.geomTransf('Linear',1);ops.element('elasticBeamColumn',1,1,2,1.,3e10,1/12,1)
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1);ops.load(2,1000,0,0)
    ops.system('BandGeneral');ops.numberer('RCM');ops.constraints('Plain');ops.integrator('LoadControl',1);ops.algorithm('Linear');ops.analysis('Static');code=ops.analyze(1);ops.reactions()
    expected=1000*10**3/(3*3e10/12);actual=ops.nodeDisp(2,1);r=ops.nodeReaction(1)
    result=dict(analysisCode=code,expectedDisplacement_m=expected,measuredDisplacement_m=actual,relativeError=abs(actual-expected)/expected,baseReaction=r,passed=code==0 and abs(actual-expected)/expected<1e-10 and abs(r[0]+1000)<1e-6)
    ops.wipe();return result

def build(ops,g,height=None):
    height=height if height is not None else PARAM['occupied_top'];nodes=[dict(n) for n in g['nodes'] if n['level']<=height+1e-6];ids={n['id'] for n in nodes};by={n['id']:n for n in nodes}
    members=[m for m in g['members'] if all(id in ids for id in m['nodeIds'])]
    stagedloads={n['id']:np.array(n['floorGravityLoad']) for n in nodes}
    for m in members:
        aa,bb=[np.array(by[id]['xyz']) for id in m['nodeIds']];weight=float(np.linalg.norm(bb-aa))*m['section']['A']*m['section']['density']*G
        for id in m['nodeIds']:stagedloads[id][1]-=weight/2
    for n in nodes:n['gravityLoad']=stagedloads[n['id']].tolist();n['mass']=max(1e-3,-n['gravityLoad'][1]/G)
    ops.wipe();ops.model('basic','-ndm',3,'-ndf',6);ops.geomTransf('Linear',1,0,0,1);ops.uniaxialMaterial('Elastic',1,ASSUMPTIONS['steel_E_Pa'])
    for n in nodes:
        ops.node(n['tag'],*n['xyz']);mass=n['mass'];ops.mass(n['tag'],mass,mass,mass,1e-5,1e-5,1e-5)
        if n['id'] in g['fixedNodeIds']:ops.fix(n['tag'],1,1,1,1,1,1)
        elif n['role']=='beltNode':ops.fix(n['tag'],0,0,0,1,0,1)
    for m in members:
        it,jt=[by[id]['tag'] for id in m['nodeIds']];s=m['section']
        if m['type']=='beam':ops.element('elasticBeamColumn',m['tag'],it,jt,s['A'],s['E'],s['G'],s['J'],s['Iy'],s['Iz'],1)
        else:ops.element('truss',m['tag'],it,jt,s['A'],1)
    for c in g['constraints']:
        if c['master'] not in ids or c['slave'] not in ids:continue
        if c['type']=='rigidDiaphragm':ops.rigidDiaphragm(2,by[c['master']]['tag'],by[c['slave']]['tag'])
        else:ops.rigidLink('beam',by[c['master']]['tag'],by[c['slave']]['tag'])
    ops.constraints('Transformation');ops.numberer('RCM');ops.system('UmfPack');ops.test('NormUnbalance',1e-5,20);ops.algorithm('Linear')
    return nodes,members

def state(ops,nodes,members):
    six=np.array([ops.nodeDisp(n['tag']) for n in nodes],float);u=six[:,:3];rotation=six[:,3:];axial=[];extreme=[];forces=[]
    for m in members:
        s=m['section']
        if m['type']=='truss':
            N=float(ops.eleResponse(m['tag'],'axialForce')[0]);axial.append(N/s['A']/1e6);extreme.append(abs(N/s['A'])/1e6);forces.append([-N,0,0,0,0,0,N,0,0,0,0,0])
        else:
            f=ops.eleResponse(m['tag'],'localForce');N=(f[6]-f[0])/2
            axial.append(N/s['A']/1e6)
            extreme.append(max(abs(N/s['A'])+abs(f[k+4])*s['cz']/s['Iy']+abs(f[k+5])*s['cy']/s['Iz'] for k in [0,6])/1e6)
            forces.append(f)
    return dict(u=u,r=rotation,axialMPa=np.array(axial),extremeMPa=np.array(extreme),localForces=np.array(forces))

def serialize(s):return {k:np.round(v,9 if k in ['u','r'] else 5).tolist() for k,v in s.items()}
def reactions(ops,g,nodes,applied,dynamic=False):
    ops.reactions('-dynamic') if dynamic else ops.reactions()
    by={n['id']:n for n in nodes};force=np.zeros(3);moment=np.zeros(3);reac=[]
    for id in g['fixedNodeIds']:
        n=by[id];v=np.array(ops.nodeReaction(n['tag']));force+=v[:3];moment+=v[3:]+np.cross(n['xyz'],v[:3]);reac.append(dict(nodeId=id,force=v[:3].tolist(),moment=v[3:].tolist()))
    external=np.zeros(3);externalmoment=np.zeros(3)
    for id,v in applied.items():external+=v;externalmoment+=np.cross(by[id]['xyz'],v)
    return dict(reactions=reac,externalForce_N=external.tolist(),reactionForce_N=force.tolist(),forceResidual_N=(external+force).tolist(),relativeForceResidual=float(np.linalg.norm(external+force)/max(1,np.linalg.norm(external))),
        externalMoment_Nm=externalmoment.tolist(),reactionMoment_Nm=moment.tolist(),momentResidual_Nm=(externalmoment+moment).tolist(),relativeMomentResidual=float(np.linalg.norm(externalmoment+moment)/max(1,np.linalg.norm(externalmoment))))

def static_case(ops,g,height=None,wind=False):
    nodes,members=build(ops,g,height);by={n['id']:n for n in nodes};loads={n['id']:np.array(n['gravityLoad']) for n in nodes}
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
    for n in nodes:ops.load(n['tag'],*n['gravityLoad'],0,0,0)
    if wind:
        for w in g['windLoads']:
            if w['nodeId'] in by:ops.load(by[w['nodeId']]['tag'],*w['force'],0,0,0);loads[w['nodeId']]+=w['force']
    ops.integrator('LoadControl',.1);ops.analysis('Static');code=ops.analyze(10)
    if code:raise RuntimeError('Static convergence failed '+str(code))
    s=state(ops,nodes,members);eq=reactions(ops,g,nodes,loads)
    return nodes,members,s,eq

def dynamic_case(ops,g,duration,dt=.05,sampledt=1.,with_tmd=True,export_fields=True):
    nodes,members,gravity,eq=static_case(ops,g);ops.loadConst('-time',0.)
    eigenvalues=np.array(ops.eigen(4));freq=np.sqrt(eigenvalues);zeta=ASSUMPTIONS['damping_ratio'];w1,w2=freq[0],freq[2]
    top=next(n for n in nodes if n['role']=='core' and abs(n['level']-PARAM['occupied_top'])<1e-5)
    tmdtag=max(n['tag'] for n in nodes)+1;mass=ASSUMPTIONS['tmd_mass_kg'];spring=mass*w1**2;dashpot=2*ASSUMPTIONS['tmd_damping_ratio_assumed']*mass*w1
    if with_tmd:
        ops.node(tmdtag,*top['xyz']);ops.mass(tmdtag,mass,1e-5,1e-5,1e-5,1e-5,1e-5)
        ops.mass(top['tag'],max(1e-3,top['mass']-mass),top['mass'],top['mass'],1e-5,1e-5,1e-5)
        ops.equalDOF(top['tag'],tmdtag,2,3,4,5,6)
        ops.uniaxialMaterial('Elastic',11,spring);ops.uniaxialMaterial('Viscous',12,dashpot,1.);ops.uniaxialMaterial('Parallel',13,11,12)
        ops.element('zeroLength',max(m['tag'] for m in members)+1,top['tag'],tmdtag,'-mat',13,'-dir',1)
    am=2*zeta*w1*w2/(w1+w2);bk=2*zeta/(w1+w2);ops.rayleigh(am,0,bk,0)
    # A smooth, reproducible prescribed gust history; deliberately not called CFD.
    t=np.arange(round(duration/dt)+1)*dt;ramp=np.clip(t/10,0,1);ramp=ramp*ramp*(3-2*ramp)
    factors=ramp*(1+.12*np.sin(2*np.pi*.11*t)+.07*np.sin(2*np.pi*.19*t+.7)+.045*np.sin(2*np.pi*.043*t+1.1))
    ops.timeSeries('Path',2,'-dt',dt,'-values',*factors.tolist());ops.pattern('Plain',2,2);by={n['id']:n for n in nodes}
    for w in g['windLoads']:ops.load(by[w['nodeId']]['tag'],*w['force'],0,0,0)
    ops.wipeAnalysis();ops.constraints('Transformation');ops.numberer('RCM');ops.system('UmfPack');ops.test('NormUnbalance',1e-4,20);ops.algorithm('Linear');ops.integrator('Newmark',.5,.25);ops.analysis('Transient')
    sampled=[];full_u=[];full_r=[];full_ax=[];full_ex=[];codes=[];times=[];applied=[];topx=[];tmdrelative=[]
    for i in range(1,len(t)):
        code=ops.analyze(1,dt);codes.append(code)
        if code:raise RuntimeError(f'Transient failed at {i*dt}s: {code}')
        topx.append(ops.nodeDisp(top['tag'],1));tmdrelative.append(ops.nodeDisp(tmdtag,1)-topx[-1] if with_tmd else 0.)
        if export_fields:
            s=state(ops,nodes,members);full_u.append(s['u']);full_r.append(s['r']);full_ax.append(s['axialMPa']);full_ex.append(s['extremeMPa'])
        if i%round(sampledt/dt)==0:
            sampled.append(i-1);times.append(round(i*dt,6));applied.append(round(float(factors[i]),8))
        if i%200==0:print('DYNAMIC',round(i*dt,2),'s',flush=True)
    topx=np.array(topx);tmdrelative=np.array(tmdrelative)
    if not export_fields:
        np.savez_compressed(RAW/'without-tmd-top-history.npz',time=t[1:],topX_m=topx,windFactors=factors[1:])
        return dict(time=times,topX_m=np.round(topx[sampled],8).tolist(),peakAbsTopX_m=float(abs(topx).max()),rmsAfterRamp_m=float(np.sqrt(np.mean(topx[round(10/dt):]**2))),failedSteps=sum(c!=0 for c in codes))
    U=np.array(full_u);R=np.array(full_r);A=np.array(full_ax);X=np.array(full_ex)
    np.savez_compressed(RAW/'dynamic-all-steps.npz',time=t[1:],u=U,r=R,axialMPa=A,extremeMPa=X,windFactors=factors[1:],topX_m=topx,tmdRelativeX_m=tmdrelative)
    # Increment fields isolate the wind from the pre-existing gravity stress.
    return dict(dt=sampledt,solverDt=dt,time=times,nodeIds=[n['id'] for n in nodes],memberIds=[m['id'] for m in members],
        u=np.round(U[sampled]-gravity['u'],8).tolist(),r=np.round(R[sampled]-gravity['r'],9).tolist(),axialMPa=np.round(A[sampled]-gravity['axialMPa'],5).tolist(),
        extremeMPa=np.round(X[sampled],5).tolist(),windLoadNodeIds=[w['nodeId'] for w in g['windLoads']],
        baseAppliedForces_N=[w['force'] for w in g['windLoads']],appliedForceFactors=applied,
        semantics={'u':'wind-induced displacement increment relative to converged gravity state','axialMPa':'signed axial stress increment from gravity; positive tension','extremeMPa':'maximum absolute section normal stress including gravity'},
        tmd=dict(included=with_tmd,mass_kg=mass,spring_N_m=spring,dashpot_Ns_m=dashpot,relativeX_m=np.round(tmdrelative[sampled],8).tolist(),topX_m=np.round(topx[sampled],8).tolist(),
            equivalentPendulumLength_m=G/w1**2,tuning='Tuned to equivalent model first eigenmode; installed tuning/damping not asserted',peakAbsTopX_m=float(abs(topx).max()),rmsAfterRamp_m=float(np.sqrt(np.mean(topx[round(10/dt):]**2)))),
        modalPeriods_s=(2*np.pi/freq).tolist(),damping=dict(type='Rayleigh initial stiffness',ratio=zeta,alphaM=am,betaKinit=bk),convergence=dict(steps=len(codes),failedSteps=sum(c!=0 for c in codes),algorithm='Linear',integrator='Newmark average acceleration',dt=dt))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--graph-only',action='store_true');ap.add_argument('--duration',type=float,default=60);a=ap.parse_args();OUT.mkdir(parents=True,exist_ok=True);RAW.mkdir(parents=True,exist_ok=True)
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();g=graph();save(OUT/'structural-graph.json',g)
    print('GRAPH',len(g['nodes']),'nodes',len(g['members']),'members',flush=True)
    if a.graph_only:return
    ops,dll=load_backend();ops.logFile(str(RAW/'opensees.log'),'-noEcho')
    verify=verification(ops);assert verify['passed'];save(OUT/'solver-verification.json',verify)
    nodes,members,grav,eqg=static_case(ops,g);print('GRAVITY',eqg['relativeForceResidual'],flush=True)
    _,_,combined,eqw=static_case(ops,g,wind=True);wind={k:combined[k]-grav[k] for k in ['u','r','axialMPa','localForces']};wind['extremeMPa']=np.maximum(abs(wind['axialMPa']),0)
    # Extreme WIND-only stress is computed from force differences, not subtracting
    # magnitudes of combined and gravity extreme stress.
    for i,m in enumerate(members):
        if m['type']=='beam':
            sec=m['section'];f=wind['localForces'][i];N=(f[6]-f[0])/2;wind['extremeMPa'][i]=max(abs(N/sec['A'])+abs(f[k+4])*sec['cz']/sec['Iy']+abs(f[k+5])*sec['cy']/sec['Iz'] for k in [0,6])/1e6
    stages=[]
    for height in PARAM['zone_boundaries'][1:]:
        ns,ms,s,eq=static_case(ops,g,height);stages.append(dict(height=height,nodeIds=[n['id'] for n in ns],memberIds=[m['id'] for m in ms],**serialize(s),equilibrium=eq));print('STAGE',height,flush=True)
    without=dynamic_case(ops,g,a.duration,with_tmd=False,export_fields=False);dynamic=dynamic_case(ops,g,a.duration)
    dynamic['tmd']['withoutTMD']=without
    result=dict(schema='rainbow.shanghai-physics/1',units={'length':'m','force':'N','stress':'MPa','time':'s'},coordinates='Three Y-up',nodes=g['nodes'],members=g['members'],
        static=dict(nodeIds=[n['id'] for n in nodes],memberIds=[m['id'] for m in members],zero=serialize({k:np.zeros_like(v) for k,v in grav.items()}),gravity=serialize(grav),windPlusGravity=serialize(combined),windOnly=serialize(wind),
            gravityAppliedForces_N=[n['gravityLoad'] for n in nodes],windAppliedForces=[dict(nodeId=w['nodeId'],force=w['force']) for w in g['windLoads']]),
        stages=stages,dynamic=dynamic,visualization={'displacementsAlwaysPhysicalMetres':True,'rotationsRadians':True,'axialPositive':'tension','axialNegative':'compression','incrementsMayRemainCompressive':'positive wind increment can be a reduction of pre-existing compression','suggestedGravityMagnification':1,'magnificationLabelRequiredIfNotOne':True},provenance=dict(startedUTC=started,finishedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            backend='Zwind local OpenSees component',wrapperFile=str(ZWIND/'zwind/__init__.py'),wrapperSHA256=sha(ZWIND/'zwind/__init__.py'),binaryFile=str(ZWIND/'bin/opensees.pyd'),binarySHA256=sha(ZWIND/'bin/opensees.pyd'),
            solverVersion=ops.version(),python=sys.version,scriptSHA256=sha(__file__),graphSHA256=sha(OUT/'structural-graph.json'),responseSHA256='self-hash-after-write',windCase={'U10_m_s':30*(10/500)**ASSUMPTIONS['wind_exponent'],'U500_m_s':30,'referenceU10_m_s':31.7,'referenceU500_m_s':50,'scale':.6,'pressureCoefficients':'assumed','gust':'deterministic low-amplitude harmonic'},windInput='Prescribed power-law mean pressure and deterministic gust factor; explicit illustrative U500=30m/s. No CFD was run.',assumptions=ASSUMPTIONS,scope=g['scope']),
        validation=dict(cantileverBenchmark=verify,gravityEquilibrium=eqg,windPlusGravityEquilibrium=eqw,dynamicConvergence=dynamic['convergence'],
            finiteResults=all(np.isfinite(s[k]).all() for s in [grav,combined,wind] for k in s),gravityForceBalancePassed=eqg['relativeForceResidual']<1e-6,windForceBalancePassed=eqw['relativeForceResidual']<1e-6))
    save(OUT/'response.json',result);save(OUT/'run-summary.json',dict(provenance=result['provenance'],validation=result['validation'],counts={'nodes':len(nodes),'members':len(members),'stages':len(stages),'dynamicSamples':len(dynamic['time'])},
        modalPeriods_s=dynamic['modalPeriods_s'],peakWindDisplacement_m=float(np.max(np.linalg.norm(wind['u'],axis=1))),totalGravity_N=float(-sum(n['gravityLoad'][1] for n in nodes)),responseBytes=(OUT/'response.json').stat().st_size))
    ops.wipe();print('COMPLETE',OUT/'response.json',flush=True)
if __name__=='__main__':main()
