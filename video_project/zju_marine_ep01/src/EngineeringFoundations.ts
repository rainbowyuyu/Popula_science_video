import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createMarineCoating} from './MarineSurfaceMaterials';

/** Original teaching geometry, metres / Y up. Public OC4 topology and the
 * user-supplied illustrated triangular semisub inform the forms. Dimensions are
 * adapted for this film, not a certified IEA 15 MW support design. */
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const mat=(color:string,roughness=.45,metalness=.2)=>new T.MeshStandardMaterial({color,roughness,metalness});
const steel=()=>mat('#365e67',.42,.66),paint=()=>mat('#d5dfdc',.4,.3),ochre=()=>mat('#d9a34c',.39,.38);
function mesh(g:T.Group,n:string,geo:T.BufferGeometry,m:T.Material,p:T.Vector3){const a=new T.Mesh(geo,m);a.name=n;a.position.copy(p);a.castShadow=true;a.receiveShadow=true;g.add(a);return a;}
function rod(g:T.Group,n:string,a:T.Vector3,b:T.Vector3,r:number,m:T.Material,sides=14){const o=mesh(g,n,new T.CylinderGeometry(r,r,a.distanceTo(b),sides),m,a.clone().add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());return o;}
function cyl(g:T.Group,n:string,p:T.Vector3,r:number,h:number,m:T.Material,sides=48){return mesh(g,n,new T.CylinderGeometry(r,r,h,sides),m,p);}
function box(g:T.Group,n:string,p:T.Vector3,s:T.Vector3,m:T.Material){return mesh(g,n,new T.BoxGeometry(s.x,s.y,s.z),m,p);}
function ring(g:T.Group,n:string,y:number,r:number,tube:number,m:T.Material,center=V(0,0,0)){
 const o=mesh(g,n,new T.TorusGeometry(r,tube,8,64),m,V(center.x,y,center.z));o.rotation.x=Math.PI/2;return o;
}
function rail(g:T.Group,n:string,corners:T.Vector3[],m:T.Material){
 for(let i=0;i<corners.length;i++){const a=corners[i],b=corners[(i+1)%corners.length];const steps=Math.ceil(a.distanceTo(b)/2.3);for(let j=0;j<steps;j++){const p=a.clone().lerp(b,j/steps);rod(g,n+'_post',p,p.clone().add(V(0,1.1,0)),.034,m,8);}for(const h of [.55,1.1])rod(g,n+'_rail',a.clone().add(V(0,h,0)),b.clone().add(V(0,h,0)),.035,m,8);}
}
function ladder(g:T.Group,a:T.Vector3,b:T.Vector3,m:T.Material,cage=false){
 const n=Math.ceil(a.distanceTo(b)/.3);for(const x of [-.36,.36])rod(g,'LadderStringer',a.clone().add(V(x,0,0)),b.clone().add(V(x,0,0)),.035,m,8);
 for(let i=0;i<=n;i++){const p=a.clone().lerp(b,i/n);rod(g,'LadderRung',p.clone().add(V(-.36,0,0)),p.clone().add(V(.36,0,0)),.024,m,8);}
 if(cage)for(let i=2;i<n;i+=6){const p=a.clone().lerp(b,i/n),o=mesh(g,'LadderSafetyHoop',new T.TorusGeometry(.52,.018,5,16),m,p.clone().add(V(0,0,.32)));o.rotation.x=Math.PI/2;}
}

/** Merge only static meshes by material. Shapes, vertices and silhouettes remain;
 * this limits jacket/handrail draw calls without discarding physical details. */
export function mergeStaticDetails(group:T.Group){
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();const bins=new Map<T.Material,T.BufferGeometry[]>();const old:T.Mesh[]=[];
 group.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh||Array.isArray(m.material))return;let geo=m.geometry.clone();geo.applyMatrix4(inverse.clone().multiply(m.matrixWorld));if(geo.index)geo=geo.toNonIndexed();for(const k of Object.keys(geo.attributes))if(!['position','normal','uv','uv1'].includes(k))geo.deleteAttribute(k);if(!geo.attributes.uv)geo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));if(!geo.attributes.uv1)geo.setAttribute('uv1',geo.attributes.uv.clone());const a=bins.get(m.material)??[];a.push(geo);bins.set(m.material,a);old.push(m);});
 for(const m of old)m.removeFromParent();
 for(const [material,geos] of bins){const g=mergeGeometries(geos,false);if(!g)throw new Error('Foundation merge failed');const o=new T.Mesh(g,material);o.name=group.name+'_Merged_'+material.uuid.slice(0,8);o.castShadow=true;o.receiveShadow=true;group.add(o);geos.forEach(g=>g.dispose());}
 return group;
}

export type FoundationAsset={group:T.Group;towerBaseY:number;seabedY?:number;context?:T.Group;};
export function createJacketFoundation(options:{seabedY?:number;merged?:boolean}={}):FoundationAsset{
 const g=new T.Group();g.name='FourLegJacketFoundation';const bed=options.seabedY??-45;
 const s=steel(),y=ochre(),light=paint(),dark=mat('#293e44',.7,.65),zinc=mat('#aab8b5',.43,.7);
 const levels=[bed,-29,-12,3,10];const corners=[[1,1],[-1,1],[-1,-1],[1,-1]];
 const spread=(h:number)=>7.0+(10.6-7.0)*(10-h)/(10-bed);
 const pt=(i:number,h:number)=>V(corners[i][0]*spread(h),h,corners[i][1]*spread(h));
 for(let i=0;i<4;i++){
  // Piles extend below mudline; every leg has a grouted sleeve and mudmat.
  rod(g,'JacketLeg',pt(i,bed),pt(i,10),.90,s,20);
  const p=pt(i,bed);cyl(g,'DrivenPile',p.clone().add(V(0,-12,0)),.88,26,dark,20);cyl(g,'GroutedPileSleeve',p.clone().add(V(0,1.1,0)),1.22,4.1,s,24);
  box(g,'Mudmat',p.clone().add(V(0,-.18,0)),V(4.3,.35,4.3),dark);
  for(let k=0;k<levels.length-1;k++){
   const h0=levels[k],h1=levels[k+1],j=(i+1)%4;
   rod(g,'JacketXBraceA',pt(i,h0),pt(j,h1),.42,s);rod(g,'JacketXBraceB',pt(j,h0),pt(i,h1),.42,s);
   rod(g,'JacketHorizontal',pt(i,h1),pt(j,h1),.39,s);
   cyl(g,'LegJointCollar',pt(i,h1),1.01,.38,zinc,20);
   if(k<3){const mid=pt(i,(h0+h1)/2).add(V(.8,0,0));box(g,'SacrificialAnode',mid,V(.22,1.5,.3),zinc);}
  }
  // Inclined transition beams carry the tower flange into all four jacket legs.
  rod(g,'TransitionStrut',pt(i,10),V(corners[i][0]*3.6,12.4,corners[i][1]*3.6),.9,y,20);
 }
 cyl(g,'TowerTransitionPiece',V(0,11.7,0),5.1,4.4,y,64);
 cyl(g,'TowerSupportTopFlange',V(0,13.94,0),5.3,.12,light,64);
 // Service deck, grating, rails, boat landing and ladders in human scale.
 box(g,'JacketServiceDeck',V(0,9.65,0),V(16.2,.35,16.2),zinc);
 for(let i=-7;i<=7;i++)box(g,'DeckGratingStrip',V(i,9.86,0),V(.035,.04,15.6),dark);
 rail(g,'DeckRail',[V(-8,9.86,-8),V(8,9.86,-8),V(8,9.86,8),V(-8,9.86,8)],y);
 const landing=new T.Group();landing.name='BoatLanding';g.add(landing);
 box(landing,'LandingPlatform',V(0,4.2,11),V(4,.2,3.2),zinc);rail(landing,'LandingRail',[V(-2,4.3,12.6),V(-2,4.3,9.5),V(2,4.3,9.5),V(2,4.3,12.6)],y);
 for(const x of [-1.25,1.25])rod(landing,'BoatFender',V(x,-1,12.8),V(x,4.0,12.8),.26,dark,16);
 ladder(g,V(0,.2,12.55),V(0,4.35,12.55),y);ladder(g,V(0,4.2,9.3),V(0,10.0,9.3),y,true);ladder(g,V(5.6,9.9,0),V(5.6,15,0),y,true);
 // Curved J-tube cable riser terminates at the transition deck, never in air.
 const curve=new T.CatmullRomCurve3([V(18,bed+.5,4),V(12,bed+1,5),V(8.9,bed+4,6),V(8.6,-15,6.2),V(7.4,8,6.2)]);
 mesh(g,'CableJTube',new T.TubeGeometry(curve,48,.21,10,false),dark,V(0,0,0));
 if(options.merged!==false)mergeStaticDetails(g);g.userData={type:'four-leg-X-braced-jacket',towerBaseY:14,seabedY:bed,source:'OpenFAST OC4 topology; original adapted teaching dimensions; no structural certification'};
 return {group:g,towerBaseY:14,seabedY:bed};
}

export function createLandPileFoundation(options:{groundY?:number;soil?:boolean;merged?:boolean}={}):FoundationAsset{
 const g=new T.Group();g.name='LandPileCapFoundation';const y=options.groundY??14;
 const concrete=mat('#b3b6aa',.9,.02),pile=mat('#909c94',.8,.06),rebar=mat('#5b6260',.58,.75),steelMat=steel();
 cyl(g,'ReinforcedPileCap',V(0,y-2.15,0),12.5,4.3,concrete,64);cyl(g,'FoundationPedestal',V(0,y-.05,0),5.55,.5,concrete,64);
 for(let i=0;i<24;i++){const a=i*Math.PI*2/24,x=Math.cos(a)*10.1,z=Math.sin(a)*10.1;cyl(g,'FoundationPile_'+i,V(x,y-13.1,z),.65,22,pile,16);for(const h of [-.6,-3.8])rod(g,'PileCapRadialRebar',V(1.7*Math.cos(a),y+h,1.7*Math.sin(a)),V(11.6*Math.cos(a),y+h,11.6*Math.sin(a)),.028,rebar,8);}
 for(const h of [-.6,-3.8])for(const r of [4.8,7.2,9.8,11.6])ring(g,'RebarHoop',y+h,r,.028,rebar);
 for(let i=0;i<40;i++){const a=i*Math.PI*2/40;rod(g,'AnchorBolt',V(4.97*Math.cos(a),y-2.8,4.97*Math.sin(a)),V(4.97*Math.cos(a),y+.45,4.97*Math.sin(a)),.038,steelMat,8);}
 const context=new T.Group();context.name='LandSoilStrata';if(options.soil!==false){for(let i=0;i<3;i++){const m=mat(['#92997c','#9e927c','#7d897f'][i],1);m.transparent=true;m.opacity=.22;m.depthWrite=false;box(context,'SoilLayer_'+i,V(0,y-4-i*9,0),V(35,8.7,35),m);}g.add(context);}
 if(options.merged!==false)mergeStaticDetails(g);g.userData={type:'reinforced-concrete-pile-cap',towerBaseY:y,pileCount:24,source:'original teaching pile-cap geometry, geotechnical design depends on site'};return {group:g,towerBaseY:y,context};
}

/** Reference-led triangular semisub teaching model. The user's illustrated
 * topology is preserved: three outer columns, central tower column, closed
 * triangular lower pontoons, upper radial box girders and inclined braces.
 * The existing R/datum keep the movie's tower and water queries registered;
 * these adapted dimensions are not a VolturnUS-S or certified OC4 CAD model. */
export function createSemisubFoundation(options:{merged?:boolean;mooring?:boolean}={}):FoundationAsset{
 const g=new T.Group();g.name='TriangularPontoonSemisubV8';
 const shell=createMarineCoating('#aab9bd',.46,.46),blue=createMarineCoating('#234f72',.42,.20),
  yellow=createMarineCoating('#d5a63b',.36,.18),deck=createMarineCoating('#7e9296',.66,.18),
  seam=mat('#52676c',.66,.38),steelMat=steel(),edge=mat('#829caa',.36,.58),dark=mat('#253b43',.77,.28);
 const R=51.75,cols=[0,1,2].map(i=>V(R*Math.cos(i*Math.PI*2/3),0,R*Math.sin(i*Math.PI*2/3)));
 const girder=(name:string,a:T.Vector3,b:T.Vector3,width:number,height:number,m:T.Material,radius=.14)=>{
  const direction=b.clone().sub(a),o=mesh(g,name,new RoundedBoxGeometry(direction.length(),height,width,3,radius),m,a.clone().add(b).multiplyScalar(.5));
  const x=direction.normalize(),z=new T.Vector3().crossVectors(x,V(0,1,0)).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();o.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));return o;
 };
 const hull=(name:string,p:T.Vector3,r:number)=>{
  cyl(g,name+'_LowerHull',p.clone().setY(-8.5),r,24,shell,96);
  cyl(g,name+'_YellowFreeboard',p.clone().setY(8.75),r,10.5,yellow,96);
  cyl(g,name+'_KeelNode',p.clone().setY(-19.30),r+.52,3.4,blue,96);
  ring(g,name+'_WeldAtCoating',3.50,r+.018,.035,seam,p);
  ring(g,name+'_KeelWeld',-17.58,r+.54,.038,edge,p);
  for(const h of [-13.4,-5.3])ring(g,name+'_ShellCourseWeld',h,r+.009,.023,seam,p);
  cyl(g,name+'_TopDeck',p.clone().setY(14.05),r+.04,.12,yellow,96);
  const hatch=cyl(g,name+'_BallastAccessHatch',p.clone().add(V(1.6,14.16,-1.1)),.62,.15,deck,40);
  ring(g,name+'_HatchSeal',14.24,.55,.025,dark,hatch.position);
 };
 hull('CentralTowerColumn',V(0,0,0),5);
 cyl(g,'CentralTowerFlange',V(0,14.25,0),5.35,.22,edge,96);
 for(let i=0;i<3;i++){
  const p=cols[i],next=cols[(i+1)%3],radial=p.clone().normalize();hull('OuterBuoyancyColumn_'+i,p,6.25);
  // A closed triangle of real box pontoons connects EACH adjacent outer pair.
  const along=next.clone().sub(p).normalize(),a=p.clone().addScaledVector(along,4.4).setY(-17.6),b=next.clone().addScaledVector(along,-4.4).setY(-17.6);
  girder('OuterTriangularBoxPontoon_'+i,a,b,8.4,5.8,shell,.22);
  for(const u of [.10,.49,.90]){const q=a.clone().lerp(b,u);girder('PontoonCollar_'+i+'_'+u,q.clone().addScaledVector(along,-.45),q.clone().addScaledVector(along,.45),8.56,5.96,blue,.10);}
  for(const lateral of [-1,1]){const across=V(-along.z,0,along.x).multiplyScalar(lateral*4.1);rod(g,'PontoonWeld',a.clone().add(across).setY(-14.68),b.clone().add(across).setY(-14.68),.024,seam,8);}
  // Lower centre-to-side-midpoint girders join the closed triangle, as shown
  // in the supplied diagram, instead of retaining the old radial-only floats.
  const middle=p.clone().add(next).multiplyScalar(.5),midDirection=middle.clone().normalize();
  girder('LowerSpokeToEdgeMidpoint_'+i,midDirection.clone().multiplyScalar(4.2).setY(-17.55),middle.clone().addScaledVector(midDirection,-4.15).setY(-17.55),6.0,5.8,yellow,.18);
  // Upper load path and diagonal truss end inside real column connection zones.
  girder('UpperRadialBoxGirder_'+i,radial.clone().multiplyScalar(4.0).setY(10.6),p.clone().addScaledVector(radial,-4.8).setY(10.6),2.4,2.8,yellow,.16);
  const braceA=radial.clone().multiplyScalar(4.0).setY(-13.7),braceB=p.clone().addScaledVector(radial,-5.15).setY(7.4);
  rod(g,'InclinedLoadBrace_'+i,braceA,braceB,1.0,yellow,40);
  const unit=braceB.clone().sub(braceA).normalize();for(const [j,point]of [braceA,braceB].entries())rod(g,'BraceConnectionSleeve_'+i+'_'+j,point.clone().addScaledVector(unit,-.6),point.clone().addScaledVector(unit,.6),1.16,edge,40);
  // Small deck equipment remains subordinate to the structural silhouette.
  ring(g,'ColumnSafetyHandrail',15.10,5.90,.035,yellow,p);
  for(let j=0;j<20;j++){const a=j*Math.PI*2/20;rod(g,'ColumnRailPost',V(p.x+5.9*Math.cos(a),14.14,p.z+5.9*Math.sin(a)),V(p.x+5.9*Math.cos(a),15.10,p.z+5.9*Math.sin(a)),.029,yellow,8);}
  for(const offset of [-1.2,1.2]){const a=p.clone().add(V(offset,14.16,1.8));rod(g,'DeckVent',a,a.clone().add(V(0,.85,0)),.11,edge,12);cyl(g,'VentCap',a.clone().add(V(0,.9,0)),.18,.12,deck,20);}
  ladder(g,V(p.x+6.56,-.5,p.z),V(p.x+6.56,14.4,p.z),yellow,true);
  const fair=p.clone().addScaledVector(radial,6.3).setY(-8);
  const fairlead=mesh(g,'MooringFairlead',new T.TorusGeometry(.70,.12,12,32),edge,fair);fairlead.quaternion.setFromUnitVectors(V(0,0,1),radial);
  if(options.mooring!==false){const end=p.clone().multiplyScalar(3.8).setY(-70),cv=new T.CatmullRomCurve3([fair,p.clone().multiplyScalar(1.7).setY(-39),p.clone().multiplyScalar(2.9).setY(-68),end]);mesh(g,'CatenaryMooring',new T.TubeGeometry(cv,80,.16,10,false),dark,V(0,0,0));box(g,'MooringAnchor',end,V(3,.7,4),dark);}
 }
 g.userData={type:'triangular-box-pontoon-semisub-teaching',towerBaseY:14,keelY:-21,columnRadiusFromCenter:R,outerColumnDiameter:12.5,outerPontoons:3,lowerSpokesToSideMidpoints:3,upperRadialBoxGirders:3,inclinedBraces:3,source:'User supplied illustrated topology; OpenFAST OC4 DeepCwind HydroDyn member vocabulary consulted. Adapted teaching dimensions; not VolturnUS-S, not certified structural CAD or a new hydrodynamic solve.'};
 if(options.merged!==false)mergeStaticDetails(g);
 return {group:g,towerBaseY:14};
}

/** Same detailed exterior as the hero, retaining every source silhouette and
 * exterior bolt. Merge by material once, clone merged geometry for every fleet
 * member. Call BEFORE anatomy mutates visibility/materials. No capsule blades. */
export function createDetailedTurbinePrototype(source:T.Group){
 const g=new T.Group();g.name='DetailedFleetPrototype';const r=new T.Group();r.name='RotorAssembly';r.position.set(14,150,0);g.add(r);source.updateMatrixWorld(true);const inv=source.matrixWorld.clone().invert();const mats=new Map<T.Material,T.Material>();
 source.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh)return;let parent:T.Object3D|null=m;const names:string[]=[];while(parent&&parent!==source){names.push(parent.name);parent=parent.parent;}
 const rotating=names.some(n=>n==='Blades'||n==='Hub');const keep=rotating||names.includes('TowerAssembly')||/^(NacelleShell|NacelleTeal|CoolingIntake|RoofHatch|Anemometer|Yaw)/.test(m.name);if(!keep)return;
 const original=Array.isArray(m.material)?m.material[0]:m.material;let material=mats.get(original);if(!material){material=original.clone();material.opacity=1;material.transparent=false;material.depthWrite=true;mats.set(original,material);}
 const geo=m.geometry.clone();geo.applyMatrix4(inv.clone().multiply(m.matrixWorld));if(rotating)geo.translate(-14,-150,0);const a=new T.Mesh(geo,material);a.name=m.name;a.castShadow=true;a.receiveShadow=true;(rotating?r:g).add(a);
 });
 g.remove(r);mergeStaticDetails(g);mergeStaticDetails(r);g.add(r);return {g,r};
}
export function cloneDetailedTurbine(prototype:{g:T.Group;r:T.Group}){const g=prototype.g.clone(true);const r=g.getObjectByName('RotorAssembly') as T.Group;return {g,r};}
