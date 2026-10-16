/**
 * Continuous, frame-addressable teaching stage. All motion is absolute-time.
 * The pressure chamber and cold-gas layout explain mechanisms; they are not
 * engineering drawings, CFD, or claimed production Roadster specifications.
 * Units: metres. Vehicle +X forward, +Y up, +Z left. World gravity is -Y.
 */
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Car, type ThrusterName} from './Car';
import {getSection, section, timeline} from './Timeline';
import {createSuctionCup,createBalloon,createDoor,type MechanismProp} from './AnalogyProps';
import captions from './captions-data.json';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*x*(x*(x*6-15)+10);};
const ramp=(u:number,a:number,b:number)=>smooth((u-a)/(b-a));
const bell=(u:number,a:number,b:number,c:number,d:number)=>ramp(u,a,b)*(1-ramp(u,c,d));
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
const fract=(v:number)=>v-Math.floor(v);
const integratedRamp=(t:number,a:number,b:number)=>{if(t<=a)return 0;if(t>=b)return t-(a+b)/2;const x=(t-a)/(b-a);return (b-a)*(x**6-3*x**5+2.5*x**4);};
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const COLORS={paper:0xf3f0e9,navy:0x33454e,blue:0x117f9a,cyan:0x8bdfeb,gold:0xc27a3c,red:0xb83235};
const IDS=['hook','suction','ceiling','release','thrust','roll','control','limits','recap','coda'];
type Pose={position:T.Vector3;rotation:number;plateRotation:number;fan:number;air:number;gravity:number;suction:number;shell:number;tank:number;jets:Record<ThrusterName,number>;torque:number;gas:number};
type Mat=T.MeshStandardMaterial|T.MeshPhysicalMaterial|T.MeshBasicMaterial;
const noJets=():Record<ThrusterName,number>=>({frontLeft:0,frontRight:0,rearLeft:0,rearRight:0});
function allJets(n:number){return {frontLeft:n,frontRight:n,rearLeft:n,rearRight:n};}
function makeMesh(g:T.BufferGeometry,m:T.Material,n:string){const o=new T.Mesh(g,m);o.name=n;o.castShadow=true;o.receiveShadow=true;return o;}
function material(color:number,metalness=.15,roughness=.45){return new T.MeshStandardMaterial({color,metalness,roughness});}
function fadedMaterial(color:number,opacity=1){return new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});}
function fadeObject(o:T.Object3D,alpha:number){o.visible=alpha>.001;o.traverse(c=>{if(c instanceof T.Mesh){const mats=Array.isArray(c.material)?c.material:[c.material];for(const m of mats){if(m.userData.baseOpacity===undefined)m.userData.baseOpacity=m.opacity;m.transparent=true;m.opacity=m.userData.baseOpacity*alpha;m.depthWrite=alpha>.97;}c.castShadow=alpha>.85;}});}

/** A solid tapered arrow, not a floating screen overlay. Local arrow is +Y. */
class ForceArrow {
  readonly root=new T.Group();readonly stem:T.Mesh;readonly head:T.Mesh;readonly mat:T.MeshStandardMaterial;
  constructor(color:number){this.mat=new T.MeshStandardMaterial({color,roughness:.35,metalness:.05,transparent:true,depthWrite:false});this.stem=makeMesh(new T.CylinderGeometry(.025,.025,1,12),this.mat,'Force shaft');this.head=makeMesh(new T.ConeGeometry(.09,.22,24),this.mat,'Force tip');this.root.add(this.stem,this.head);}
  set(origin:T.Vector3,direction:T.Vector3,length:number,alpha:number){this.root.position.copy(origin);this.root.quaternion.setFromUnitVectors(V(0,1,0),direction.clone().normalize());this.stem.position.y=Math.max(0,length-.19)/2;this.stem.scale.y=Math.max(.001,length-.19);this.head.position.y=length-.11;this.mat.opacity=alpha;this.root.visible=alpha>.001;}
}

/** Deterministic particles anchored to the actual nozzle. No simulated claim. */
class Jet {
  readonly root=new T.Group();readonly particles:T.InstancedMesh;readonly core:T.Mesh;private tmp=new T.Object3D();
  private mat=new T.MeshBasicMaterial({color:0xa4dce5,transparent:true,opacity:.6,depthWrite:false});
  private coreMat=new T.MeshBasicMaterial({color:0xddf6fb,transparent:true,opacity:.7,depthWrite:false});
  constructor(){this.particles=new T.InstancedMesh(new T.SphereGeometry(1,5,4),this.mat,56);this.particles.frustumCulled=false;this.core=new T.Mesh(new T.CylinderGeometry(.038,.10,.45,16,1,true),this.coreMat);this.core.position.y=-.20;this.root.add(this.core,this.particles);}
  update(t:number,strength:number,seed:number){this.root.visible=strength>.003;this.mat.opacity=.5*strength;this.coreMat.opacity=.72*strength;this.core.scale.y=.4+.6*strength;
    for(let i=0;i<56;i++){const p=fract(t*(1.6+strength*.7)+i*.61803398875+seed),a=i*2.399963+seed;const radius=(.035+p*.24)*Math.sqrt(fract(i*.732+seed));this.tmp.position.set(Math.cos(a)*radius,-.08-p*(.7+strength*1.7),Math.sin(a)*radius);const s=(.019+p*.08)*Math.sin(Math.PI*p);this.tmp.scale.set(s,s*1.65,s);this.tmp.updateMatrix();this.particles.setMatrixAt(i,this.tmp.matrix);}this.particles.instanceMatrix.needsUpdate=true;
  }
}

export class World {
  readonly car=new Car();
  private readonly root=new T.Group();private readonly pivot=new T.Group();private readonly plateRig=new T.Group();
  private readonly stageFloor:T.Mesh;private readonly glassPlate:T.Mesh;private readonly plateMat:T.MeshPhysicalMaterial;
  private readonly chamber=new T.Group();private readonly fans:T.Group[]=[];private readonly pressureParticles:T.InstancedMesh;
  private readonly airMat:T.MeshBasicMaterial;private readonly tmp=new T.Object3D();
  private readonly flowRibbons:T.Mesh[]=[];private readonly pressureArrows:ForceArrow[]=[];
  private readonly weight=new ForceArrow(COLORS.gold);private readonly lift=new ForceArrow(COLORS.blue);private readonly jetArrows:Record<ThrusterName,ForceArrow>;
  private readonly jets:Record<ThrusterName,Jet>;private readonly torqueGroup=new T.Group();private readonly torqueMat:T.MeshBasicMaterial;
  private readonly tankGas:T.Mesh;private readonly halo:T.Mesh;private readonly contactShadow:T.Mesh;
  private readonly pmrem:T.PMREMGenerator;private readonly env:T.WebGLRenderTarget;private readonly clockRing:T.Mesh;
  private readonly anchorPoints=new Map<string,T.Vector3>();
  private readonly cabin:T.Object3D|undefined;
  private readonly props:Array<{cue:string;prop:MechanismProp;scale:number}>;
  private readonly com:T.Group=new T.Group();
  private readonly comMaterial=fadedMaterial(0xc77c36,.9);
  private readonly trajectory:T.Line;private trajectoryMaterial=new T.LineDashedMaterial({color:0x99a8a8,dashSize:.14,gapSize:.13,transparent:true,opacity:0,depthWrite:false});
  private keys:Array<{time:number;offset:T.Vector3;target:T.Vector3;fov:number}>=[];
  private currentPose:Pose|undefined;private currentSection='hook';
  private cameraLook=V(0,0,0);

  constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private gl:T.WebGLRenderer){
    this.root.name='Roadster_continuous_illustration_stage';scene.add(this.root);
    scene.background=new T.Color(COLORS.paper);scene.fog=new T.Fog(COLORS.paper,29,80);
    gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFSoftShadowMap;gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.08;gl.outputColorSpace=T.SRGBColorSpace;
    this.pmrem=new T.PMREMGenerator(gl);const room=new RoomEnvironment();this.env=this.pmrem.fromScene(room,.04);scene.environment=this.env.texture;room.dispose();
    this.root.add(new T.HemisphereLight(0xfff9ee,0x9aa6ad,1.8));
    const sun=new T.DirectionalLight(0xfff2dc,4.3);sun.position.set(-7,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:22,top:15,bottom:-15,near:.5,far:45});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=4;sun.target.position.set(8,0,0);this.root.add(sun,sun.target);
    const rim=new T.DirectionalLight(0xc7e8f3,2.3);rim.position.set(4,8,-10);this.root.add(rim);
    this.stageFloor=makeMesh(new T.PlaneGeometry(180,120),material(COLORS.paper,.03,.64),'Seamless warm porcelain floor');this.stageFloor.rotation.x=-Math.PI/2;this.stageFloor.position.y=-.055;this.stageFloor.castShadow=false;this.root.add(this.stageFloor);
    const grid=new T.GridHelper(120,60,0xddd9cf,0xe8e4db);grid.position.y=-.045;const gm=grid.material as T.Material;gm.transparent=true;gm.opacity=.18;this.root.add(grid);
    // The turntable is a continuous physical teaching prop. Car and deck share
    // the same rigid rotation, maintaining exact tire contact throughout.
    this.plateRig.position.set(0,2.55,0);this.root.add(this.plateRig);
    this.plateMat=new T.MeshPhysicalMaterial({color:0xdce7e7,metalness:.14,roughness:.24,transparent:true,opacity:.45,clearcoat:.8,side:T.DoubleSide,depthWrite:false});
    this.glassPlate=makeMesh(new T.BoxGeometry(7.2,.12,4.4),this.plateMat,'Transparent rotating road surface');this.glassPlate.position.y=-2.61;this.glassPlate.castShadow=false;this.plateRig.add(this.glassPlate);
    const edgeMat=material(0xb9c5c4,.7,.3);
    for(const z of[-2.19,2.19]){const rail=makeMesh(new T.BoxGeometry(7.3,.14,.065),edgeMat,'Plate edge extrusion');rail.position.set(0,-2.61,z);this.plateRig.add(rail);}
    for(const x of[-3.62,3.62]){const rail=makeMesh(new T.BoxGeometry(.065,.14,4.4),edgeMat,'Plate edge extrusion');rail.position.set(x,-2.61,0);this.plateRig.add(rail);}
    // Few quiet road dashes give speed/direction without a dense technical grid.
    for(let x=-3;x<=3;x+=1){for(const z of[-1.45,1.45]){const dash=new T.Mesh(new T.BoxGeometry(.44,.006,.025),material(0x8b9a9d));dash.position.set(x,-2.545,z);this.plateRig.add(dash);}}
    this.car.root.position.y=-.65;this.pivot.add(this.car.root);this.root.add(this.pivot);
    // Every fading cutaway owns its materials. Car alloys are otherwise shared
    // with wheels, so fading a tank retaining band must not fade the wheel rims.
    this.cabin=this.car.root.getObjectByName('Interior_under_glass');
    for(const group of [this.car.tank,this.cabin,this.car.thrusterHardware])group?.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
    // Soft projected contact tint supplements real map shadows; it flattens and
    // fades as the car lifts, so it never appears pasted onto the car.
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=256;shadowCanvas.height=128;const sctx=shadowCanvas.getContext('2d')!;const grad=sctx.createRadialGradient(128,64,10,128,64,120);grad.addColorStop(0,'rgba(39,50,57,.29)');grad.addColorStop(.55,'rgba(39,50,57,.13)');grad.addColorStop(1,'rgba(39,50,57,0)');sctx.fillStyle=grad;sctx.fillRect(0,0,256,128);
    const shadowTex=new T.CanvasTexture(shadowCanvas);this.contactShadow=new T.Mesh(new T.PlaneGeometry(7,4),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));this.contactShadow.rotation.x=-Math.PI/2;this.contactShadow.position.y=-.035;this.root.add(this.contactShadow);
    const haloMat=new T.MeshBasicMaterial({color:0xdfe7e5,transparent:true,opacity:.28,depthWrite:false,side:T.DoubleSide});this.halo=new T.Mesh(new T.RingGeometry(2.3,2.32,128),haloMat);this.halo.rotation.x=-Math.PI/2;this.halo.position.y=-.03;this.root.add(this.halo);
    this.buildPressureChamber();
    this.airMat=fadedMaterial(0x147f9a,.7);this.pressureParticles=new T.InstancedMesh(new T.SphereGeometry(.026,6,5),this.airMat,96);this.pressureParticles.frustumCulled=false;this.car.root.add(this.pressureParticles);
    this.jets={frontLeft:new Jet(),frontRight:new Jet(),rearLeft:new Jet(),rearRight:new Jet()};
    this.jetArrows={frontLeft:new ForceArrow(COLORS.blue),frontRight:new ForceArrow(COLORS.blue),rearLeft:new ForceArrow(COLORS.blue),rearRight:new ForceArrow(COLORS.blue)};
    for(const key of Object.keys(this.jets) as ThrusterName[]){this.jets[key].root.position.copy(this.car.thrusters[key]);this.car.root.add(this.jets[key].root,this.jetArrows[key].root);}
    this.root.add(this.weight.root,this.lift.root);
    this.torqueMat=fadedMaterial(0xa87843,.8);
    const arc=new T.EllipseCurve(0,0,1.55,1.55,.12,Math.PI*1.43,false,0).getPoints(70).map(p=>V(0,p.x,p.y));const torqueArc=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arc),100,.016,7,false),this.torqueMat);this.torqueGroup.add(torqueArc);
    const arrowHead=new T.Mesh(new T.ConeGeometry(.065,.18,16),this.torqueMat);arrowHead.position.copy(arc[arc.length-1]);arrowHead.quaternion.setFromUnitVectors(V(0,1,0),arc[arc.length-1].clone().sub(arc[arc.length-2]).normalize());this.torqueGroup.add(arrowHead);this.pivot.add(this.torqueGroup);this.torqueGroup.position.x=2.7;
    // Tank contents stay inside the actual tank, exposed by shell transparency.
    this.tankGas=new T.Mesh(new T.CylinderGeometry(.17,.17,.91,32),new T.MeshBasicMaterial({color:0x42b9d0,transparent:true,opacity:.28,depthWrite:false}));this.tankGas.rotation.x=Math.PI/2;this.tankGas.position.set(-.56,.64,0);this.car.root.add(this.tankGas);
    this.clockRing=new T.Mesh(new T.TorusGeometry(.24,.009,7,80),fadedMaterial(0x76b3bf,.7));this.clockRing.position.set(-.56,.64,.61);this.car.root.add(this.clockRing);
    this.props=[{cue:'s04',prop:createSuctionCup(),scale:1.55},{cue:'s14',prop:createBalloon(),scale:2.5},{cue:'s18',prop:createDoor(),scale:1.25}];
    for(const {prop,scale}of this.props){prop.root.scale.setScalar(scale);this.root.add(prop.root);}
    this.comMaterial.depthTest=false;this.com.renderOrder=100;this.com.add(new T.Mesh(new T.SphereGeometry(.065,20,14),this.comMaterial));const comRing=new T.Mesh(new T.TorusGeometry(.14,.012,8,40),this.comMaterial);this.com.add(comRing);this.root.add(this.com);
    const pathPoints:T.Vector3[]=[];const flightStart=this.cue('s19').startSec,flightEnd=this.cue('s22').endSec;
    for(let i=0;i<=100;i++)pathPoints.push(this.rollMotion(mix(flightStart,flightEnd,i/100)).position);
    this.trajectory=new T.Line(new T.BufferGeometry().setFromPoints(pathPoints),this.trajectoryMaterial);this.trajectory.computeLineDistances();this.root.add(this.trajectory);
    this.buildCameraKeys();this.update(0);
  }

  private buildPressureChamber(){
    this.chamber.name='Illustrative low pressure underfloor chamber';this.car.root.add(this.chamber);
    const rubber=material(0x283d45,.2,.6),alloy=material(0x91a9b0,.8,.25);
    for(const z of[-.64,.64]){const seal=makeMesh(new T.BoxGeometry(3.2,.12,.028),rubber,'Flexible perimeter skirt');seal.position.set(0,.14,z);this.chamber.add(seal);}
    for(const x of[-1.60,1.60]){const seal=makeMesh(new T.BoxGeometry(.028,.12,1.28),rubber,'Flexible perimeter skirt');seal.position.set(x,.14,0);this.chamber.add(seal);}
    const air=new T.Mesh(new T.BoxGeometry(3.18,.09,1.25),new T.MeshBasicMaterial({color:0x7cb6c2,transparent:true,opacity:.11,depthWrite:false}));air.position.y=.15;this.chamber.add(air);
    for(const x of[-.70,.70]){
      const ring=makeMesh(new T.TorusGeometry(.34,.025,10,56),alloy,'Suction fan rim');ring.rotation.x=Math.PI/2;ring.position.set(x,.235,0);this.chamber.add(ring);
      const fan=new T.Group();fan.position.set(x,.245,0);const hub=makeMesh(new T.CylinderGeometry(.09,.09,.05,24),alloy,'Fan rotor');fan.add(hub);
      for(let k=0;k<9;k++){const blade=makeMesh(new T.BoxGeometry(.265,.018,.095),alloy,'Impeller blade');const a=k/9*Math.PI*2;blade.position.set(Math.cos(a)*.18,0,Math.sin(a)*.18);blade.rotation.y=-a+.4;blade.rotation.z=.12;fan.add(blade);}this.fans.push(fan);this.chamber.add(fan);
    }
    for(let i=0;i<3;i++){const arrow=new ForceArrow(COLORS.blue);this.pressureArrows.push(arrow);this.car.root.add(arrow.root);}
    for(const side of[-1,1]){
      const points=[V(-.7,.2,side*.22),V(-.7,.22,side*.62),V(-.7,.25,side*1.0),V(-.9,.45,side*1.30)];
      const ribbon=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),32,.012,7,false),fadedMaterial(COLORS.blue,.65));this.flowRibbons.push(ribbon);this.car.root.add(ribbon);
    }
  }

  private cue(id:string){return timeline.cues.find(c=>c.id===id)!;}
  private phrase(id:string,fallback:number){return captions.cues.find(c=>c.id===id)?.startFrame!==undefined?captions.cues.find(c=>c.id===id)!.startFrame/30:fallback;}
  private cueProgress(t:number,id:string){const c=this.cue(id);return clamp((t-c.startSec)/(c.endSec-c.startSec));}
  private cueEnvelope(t:number,id:string){const c=this.cue(id),u=(t-c.startSec)/(c.endSec-c.startSec);return bell(u,0,.20,.76,1);}
  private orientationReview(t:number){const s23=this.cue('s23'),s24=this.cue('s24');return {lift:ramp(t,s23.startSec,s23.startSec+1)*(1-ramp(t,s24.startSec+1.4,s24.startSec+2.8)),angle:ramp(t,s23.startSec+1.0,s23.startSec+3.3)*(1-ramp(t,s24.startSec,s24.startSec+1.7)),arrows:ramp(t,s23.startSec+2,s23.startSec+3.4)*(1-ramp(t,s24.startSec,s24.startSec+1.7))};}

  /** One teaching roll: positive torque, torque-free coast, negative torque.
   * The time-stretched angular trajectory and jet envelopes share derivatives;
   * the diagram is explicitly slow motion, not vehicle performance data.
   */
  private rollMotion(t:number){
    const a=this.cue('s19').startSec,b=mix(a,this.cue('s19').endSec,.68),c=this.cue('s22').startSec,d=this.cue('s22').endSec;
    const ta=b-a,tc=c-b,td=d-c,omega=2*Math.PI/(ta*.5+tc+td*.5);let angle=0,right=0,left=0;
    const integral=(u:number)=>u*u*u-.5*u*u*u*u;
    if(t<a)angle=0;
    else if(t<b){const u=(t-a)/ta;angle=omega*ta*integral(u);right=4*u*(1-u);}
    else if(t<c)angle=omega*(ta*.5+t-b);
    else if(t<d){const u=(t-c)/td;angle=omega*(ta*.5+tc+td*(u-integral(u)));left=4*u*(1-u)*ta/td;}
    else angle=2*Math.PI;
    const u=clamp((t-a)/(d-a)),q=smooth(u);
    // C1 lift margin protects the full rotating body/tyre envelope near takeoff
    // and landing. This is a time-stretched kinematic teaching path, not a
    // simulated flight trajectory or an inferred real-car performance claim.
    const clearanceArc=1.1*Math.sin(Math.PI*u)**2;
    const baseHeight=.65+2.8*Math.sin(Math.PI*q)+clearanceArc;
    const requiredHeight=.65*Math.abs(Math.cos(angle))+.98*Math.abs(Math.sin(angle));
    const deficit=requiredHeight-baseHeight,margin=.025*Math.sin(Math.PI*u)**2;
    // C1 upper envelope of max(0, deficit). The smoothing window vanishes
    // quadratically at the upright endpoints, retaining exact tyre contact and
    // zero endpoint speed after narration retiming. No tolerance relaxation.
    const correction=margin<1e-10?Math.max(0,deficit):deficit<=-margin?0:deficit>=margin?deficit:(deficit+margin)**2/(4*margin);
    return{angle,right,left,position:V(12+3.6*q,baseHeight+correction,0),progress:u};
  }

  private buildCameraKeys(){
    const definitions:Record<string,Array<[number,number[],number[],number]>>={
      hook:[[0,[7,-1.5,7.8],[0,.0,0],36],[.5,[6,-.8,8.1],[0,.0,0],36],[1,[5.9,3.5,7.4],[0,.0,0],37]],
      suction:[[0,[5.9,3.5,7.4],[0,.0,0],37],[.33,[4.4,3.3,5.7],[0,-.15,0],35],[.74,[3.8,2.8,5.5],[0,-.18,0],35],[1,[6.4,3.8,8.0],[0,.0,0],38]],
      ceiling:[[0,[6.4,3.8,8.0],[0,.0,0],38],[.46,[7.0,2.9,8.4],[0,.15,0],38],[1,[6.7,2.7,8.4],[0,.10,0],38]],
      release:[[0,[6.7,2.7,8.4],[0,.10,0],38],[.42,[6.5,3.7,8.4],[0,.10,0],38],[1,[6.3,2.9,7.8],[0,.15,0],38]],
      thrust:[[0,[6.3,2.9,7.8],[0,.15,0],38],[.45,[5.4,1.1,7.7],[0,-.1,0],37],[1,[6.5,2.5,8.6],[0,.1,0],39]],
      roll:[[0,[6.5,2.5,8.6],[0,.1,0],39],[.34,[5.4,2.4,8.8],[0,.1,0],39],[.76,[5.2,2.0,9.2],[0,.1,0],39],[1,[5.8,2.5,8.0],[0,.1,0],38]],
      control:[[0,[5.8,2.5,8.0],[0,.1,0],38],[.48,[5.5,3.8,7.2],[0,.0,0],37],[1,[4.5,3.4,6.0],[-.25,-.03,0],36]],
      limits:[[0,[4.5,3.4,6.0],[-.25,-.03,0],36],[.35,[3.3,2.5,4.0],[-.65,.05,0],34],[.73,[3.3,2.2,4.2],[-.65,.05,0],34],[1,[6.4,3.4,7.8],[0,.1,0],38]],
      recap:[[0,[6.4,3.4,7.8],[0,.1,0],38],[.5,[6.8,2.9,8.3],[0,.1,0],37],[1,[7.4,3.6,9.2],[0,.1,0],38]],
      coda:[[0,[7.4,3.6,9.2],[0,.1,0],38],[1,[8,4.0,10.3],[0,.1,0],38]],
    };
    this.keys=[];for(const id of IDS){const s=section(id);const rows=definitions[id];for(const [u,off,target,fov] of rows){const time=mix(s.start,s.end,u);if(this.keys.length&&Math.abs(this.keys[this.keys.length-1].time-time)<.001)continue;this.keys.push({time,offset:V(...off as [number,number,number]),target:V(...target as [number,number,number]),fov});}}
  }

  private pose(t:number):Pose{
    const {id,u}=getSection(t);this.currentSection=id;
    let p:Pose={position:V(0,.65,0),rotation:0,plateRotation:0,fan:0,air:0,gravity:0,suction:0,shell:1,tank:0,jets:noJets(),torque:0,gas:1};
    const attached=(angle:number)=>{p.plateRotation=angle;p.rotation=angle;p.position.set(0,2.55-1.90*Math.cos(angle),-1.90*Math.sin(angle));};
    if(id==='hook'){attached(Math.PI*(1-ramp(u,.60,1)));p.fan=1;}
    if(id==='suction'){p.fan=1;p.air=bell(u,.20,.32,.90,1);p.shell=1-.70*bell(u,.24,.40,.78,1);p.suction=0;}
    if(id==='ceiling'){
      const turn=this.cue('s08');attached(Math.PI*ramp(t,turn.startSec,turn.endSec));p.fan=1;p.air=.80*bell(u,.0,.12,.90,1);
      const arrows=ramp(t,turn.startSec+.5,turn.startSec+2)*(1-ramp(u,.92,1));p.gravity=arrows;p.suction=arrows;p.shell=1-.36*bell(u,.12,.23,.85,1);
    }
    if(id==='release'){attached(Math.PI*(1-ramp(u,0,.35)));p.position.x=12*ramp(u,.35,1);p.fan=1-ramp(u,.50,.76);p.air=.5*bell(u,.37,.48,.72,.92);}
    if(id==='thrust'){
      const s16=this.cue('s16'),fall=this.cueProgress(t,'s17'),s15=this.cue('s15'),s17=this.cue('s17');
      // Gas stops at s17: momentum first carries the car upward, then the same
      // car returns to its contact plane. Slow motion is stated in the overlay.
      const hoverStart=this.phrase('s16-3',s16.startSec+(s16.endSec-s16.startSec)*.32),jumpStart=this.phrase('s16-5',s16.startSec+(s16.endSec-s16.startSec)*.77);
      const apexTime=s17.startSec+(s17.endSec-s17.startSec)*.45,coastDuration=apexTime-s17.startSec,launchVelocity=.60/coastDuration;
      let height=.65+1.15*ramp(t,s16.startSec,hoverStart);
      if(t>=jumpStart&&t<s17.startSec){const dt=s17.startSec-jumpStart,z=clamp((t-jumpStart)/dt),h00=2*z**3-3*z*z+1,h01=-2*z**3+3*z*z,h11=z**3-z*z;height=h00*1.8+h01*2.05+h11*dt*launchVelocity;}
      if(t>=s17.startSec&&t<apexTime){const dt=t-s17.startSec;height=2.05+launchVelocity*dt-.5*launchVelocity/coastDuration*dt*dt;}
      if(t>=apexTime)height=mix(2.35,.65,ramp(t,apexTime,s17.endSec));
      p.position.set(12,height,0);
      const power=ramp(t,s15.startSec,s15.startSec+2)*(1-ramp(t,s17.startSec-.4,s17.startSec));p.jets=allJets(.72*power);
      p.gravity=.8*ramp(t,s15.startSec,s15.startSec+3)*(1-ramp(fall,.78,1));p.suction=.8*power;p.shell=1-.45*bell(u,.20,.30,.42,.57);p.tank=bell(u,.20,.30,.42,.57);
    }
    if(id==='roll'){
      const m=this.rollMotion(t);p.position.copy(m.position);p.rotation=m.angle;
      p.jets.frontRight=m.right;p.jets.rearRight=m.right;p.jets.frontLeft=m.left;p.jets.rearLeft=m.left;p.torque=.85*ramp(t,this.cue('s19').startSec,this.cue('s19').startSec+2);p.gravity=.8*ramp(t,this.cue('s19').startSec,this.cue('s19').startSec+2);
    }
    if(id==='control'){
      const m=this.rollMotion(t);p.position.copy(m.position);p.rotation=m.angle;
      p.jets.frontRight=m.right;p.jets.rearRight=m.right;p.jets.frontLeft=m.left;p.jets.rearLeft=m.left;
      p.torque=.85*(1-ramp(t,this.cue('s22').endSec,this.cue('s22').endSec+2));p.gravity=.8*(1-ramp(t,this.cue('s23').startSec,this.cue('s23').startSec+2));
      // Explicit direction-review pose, not a second flight. No gas emits here.
      // The same vehicle lifts into inspection space, turns over, then returns.
      const review=this.orientationReview(t);p.position.y+=1.65*review.lift;p.rotation+=Math.PI*review.angle;p.shell=1-.38*review.arrows;p.gravity=Math.max(p.gravity,.65*review.arrows);
    }
    if(id==='limits'){p.position.set(15.6,.65,0);p.tank=bell(u,0,.18,.88,1);p.shell=1-.85*bell(u,.0,.18,.82,1);p.gas=1-.80*ramp(u,.22,.77);}
    if(id==='recap'){p.position.set(15.6,.65,0);p.fan=bell(u,.12,.22,.38,.49);p.air=.55*bell(u,.13,.23,.39,.50);p.jets=allJets(.35*bell(u,.54,.63,.72,.82));p.shell=1-.35*bell(u,.16,.25,.40,.50);}
    if(id==='coda'){p.position.set(15.6,.65,0);}
    return p;
  }

  private cameraAt(t:number,p:Pose){
    let i=0;while(i<this.keys.length-2&&this.keys[i+1].time<t)i++;const a=this.keys[i],b=this.keys[i+1],u=clamp((t-a.time)/(b.time-a.time));
    // Quintic interpolation has matching zero endpoint velocity. A continuous
    // global drift prevents conspicuous locked-off holds at key boundaries.
    const v=smooth(u),off=a.offset.clone().lerp(b.offset,v),target=a.target.clone().lerp(b.target,v);
    off.applyAxisAngle(V(0,1,0),Math.sin(t*.027)*.065);this.camera.position.copy(p.position).add(off);
    this.cameraLook.copy(p.position).add(target);this.cameraLook.y+=Math.sin(t*.043)*.035;
    for(const {cue}of this.props){const w=this.cueEnvelope(t,cue);if(w>0){const focus=p.position.clone().add(V(-4.0,cue==='s18'?.34:.52,2.30));const pos=focus.clone().add(V(3.5,1.5,6.1));this.camera.position.lerp(pos,w*.86);this.cameraLook.lerp(focus,w*.86);}}
    this.camera.lookAt(this.cameraLook);this.camera.fov=mix(a.fov,b.fov,v);this.camera.near=.05;this.camera.far=160;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }

  update(t:number){
    const p=this.pose(Math.max(0,t));this.currentPose=p;this.pivot.position.copy(p.position);this.pivot.rotation.set(p.rotation,0,0);this.plateRig.rotation.x=p.plateRotation;
    for(const {cue,prop}of this.props){const c=this.cue(cue),q=(t-c.startSec)/(c.endSec-c.startSec),entrance=ramp(q,0,.16),exit=ramp(q,.82,1);prop.root.position.copy(p.position).add(V(-4.0-30*(1-entrance)-30*exit,cue==='s18'?-.62:.40,2.30));prop.update(ramp(q,.19,.73));prop.root.visible=q>=0&&q<=1;}
    this.car.setShellOpacity(p.shell);this.car.setWheelSpin(-p.position.x/.342);this.car.setTankVisible(p.tank>.005);fadeObject(this.car.tank,p.tank);
    // Exposed pressure chamber requires only the real undertray to fade; tyres
    // and trim stay opaque so the model retains scale and a readable silhouette.
    this.car.setUnderbodyOpacity(Math.max(.07,p.shell**3));
    if(this.cabin)fadeObject(this.cabin,Math.max(.08,p.shell**2.5));
    const rsec=section('release'),rec=section('recap'),fanPhase=30*(t-integratedRamp(t,mix(rsec.start,rsec.end,.50),mix(rsec.start,rsec.end,.76))+integratedRamp(t,mix(rec.start,rec.end,.12),mix(rec.start,rec.end,.22))-integratedRamp(t,mix(rec.start,rec.end,.38),mix(rec.start,rec.end,.49)));
    for(let i=0;i<this.fans.length;i++)this.fans[i].rotation.y=fanPhase+i;
    fadeObject(this.chamber,1-.65*p.tank);
    this.airMat.opacity=.76*p.air;this.pressureParticles.visible=p.air>.002;
    for(let i=0;i<96;i++){
      const f=fract(i*.6180339887),phase=t*.14+i*.237;const exterior=i<84;
      const x=(fract(i*.719)-.5)*3.6,z=exterior?(i%2?1:-1)*(.81+fract(i*.371)*.49): (fract(i*.391)-.5)*1.1;
      const y=exterior?.20+fract(i*.161)*.72:.13;
      this.tmp.position.set(x+Math.sin(phase)*.06,y+Math.sin(phase*.7)*.022,z+Math.cos(phase*.8)*.025);
      const size=exterior?.7+f*.5:.55;this.tmp.scale.setScalar(size);this.tmp.updateMatrix();this.pressureParticles.setMatrixAt(i,this.tmp.matrix);
    }this.pressureParticles.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.pressureArrows.length;i++){const x=[-1.12,0,1.12][i%3],z=1.13;this.pressureArrows[i].set(V(x,.93,z),V(0,-1,0),.35+.025*Math.sin(t*1.8+i),p.air*.67);}
    for(const ribbon of this.flowRibbons){(ribbon.material as T.MeshBasicMaterial).opacity=p.air*.45;ribbon.visible=p.air>.005;}
    const release=section('release'),hardware=ramp(t,release.end-3,release.end);fadeObject(this.car.thrusterHardware,hardware);
    let ji=0;for(const name of Object.keys(this.jets) as ThrusterName[]){const strength=p.jets[name];this.jets[name].update(t,strength,ji++*.13);const origin=this.car.thrusters[name].clone();origin.z+=origin.z>0?.38:-.38;const review=this.orientationReview(t).arrows;this.jetArrows[name].set(origin,V(0,1,0),.65+strength*.75,Math.max(strength*.85,review*.7));}
    const gravityOrigin=p.position.clone().add(V(-2.6,.65,1.15));this.weight.set(gravityOrigin,V(0,-1,0),1.5,p.gravity);
    const forceDirection=V(0,-1,0).applyQuaternion(this.pivot.quaternion);const forceOrigin=p.position.clone().add(V(2.8,.0,0));
    if(this.currentSection==='thrust'){this.lift.set(forceOrigin,V(0,1,0),1.55,p.suction);}else this.lift.set(forceOrigin,forceDirection,1.45,p.suction);
    const actualTorque=p.jets.frontRight+p.jets.rearRight-p.jets.frontLeft-p.jets.rearLeft,torqueAlpha=p.torque*Math.min(1,Math.abs(actualTorque));this.torqueMat.opacity=torqueAlpha;this.torqueGroup.visible=torqueAlpha>.001;this.torqueGroup.rotation.x=-p.rotation;this.torqueGroup.scale.z=actualTorque<0?-1:1;
    const comAlpha=bell(t,this.cue('s20').startSec,this.cue('s20').startSec+2,this.cue('s22').endSec,this.cue('s23').startSec+2),traceAlpha=bell(t,this.cue('s20').startSec,this.cue('s20').startSec+2,this.cue('s20').endSec-1,this.cue('s21').startSec);this.com.position.copy(p.position);this.com.quaternion.copy(this.camera.quaternion);this.comMaterial.opacity=comAlpha*.9;this.com.visible=comAlpha>.001;this.trajectoryMaterial.opacity=traceAlpha*.6;this.trajectory.visible=traceAlpha>.001;this.trajectory.geometry.setDrawRange(0,Math.floor(this.rollMotion(t).progress*100)+1);
    this.tankGas.visible=p.tank>.001;this.tankGas.scale.set(1,p.gas,1);(this.tankGas.material as T.MeshBasicMaterial).opacity=.36*p.tank;
    const vessel=this.car.tank.getObjectByName('Pressure_vessel_capsule') as T.Mesh|undefined;if(vessel){const m=vessel.material as T.MeshStandardMaterial;m.opacity=p.tank*.32;m.depthWrite=false;}
    this.clockRing.visible=p.tank>.001;(this.clockRing.material as T.MeshBasicMaterial).opacity=.6*p.tank;this.clockRing.scale.setScalar(.9+.05*Math.sin(t));
    this.contactShadow.position.x=p.position.x;const height=Math.max(0,p.position.y-.65);this.contactShadow.scale.setScalar(1+height*.17);(this.contactShadow.material as T.MeshBasicMaterial).opacity=.8/(1+height*1.8);this.halo.position.x=p.position.x;
    this.plateMat.opacity=mix(.40,.20,p.air);this.cameraAt(t,p);this.root.updateMatrixWorld(true);
    this.anchorPoints.set('car',p.position.clone());
    this.anchorPoints.set('fan',this.car.root.localToWorld(V(-.70,.245,0)));
    this.anchorPoints.set('tank',this.car.root.localToWorld(V(-.55,.65,0)));
    this.anchorPoints.set('pressure',this.car.root.localToWorld(V(.7,.18,1.02)));
    this.anchorPoints.set('weight',gravityOrigin.clone().add(V(0,-.75,0)));
    this.anchorPoints.set('lift',forceOrigin.clone().add((this.currentSection==='thrust'?V(0,1,0):forceDirection).multiplyScalar(.75)));
    this.anchorPoints.set('com',p.position.clone());
    this.anchorPoints.set('thrust',this.car.root.localToWorld(V(1.45,-.4,.69)));
    this.anchorPoints.set('roll',this.pivot.localToWorld(V(2.7,1.3,.0)));
    this.anchorPoints.set('platform',this.plateRig.localToWorld(V(2.9,-2.55,1.4)));
  }

  /** NDC coordinates for large post-composited labels. */
  projectAnchor(name:string){const p=this.anchorPoints.get(name)?.clone();if(!p)return {x:0,y:0,visible:false};p.project(this.camera);return {x:p.x,y:p.y,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.90};}
  get telemetry(){const p=this.currentPose;return {section:this.currentSection,position:p?.position.toArray(),rotation:p?.rotation,fan:p?.fan,suction:p?.suction,jets:p?.jets,camera:this.camera.position.toArray(),target:this.cameraLook.toArray(),plateRotation:p?.plateRotation,plateContactTop:this.plateRig.localToWorld(V(0,-2.55,0)).toArray(),tireContact:this.car.root.localToWorld(V(0,0,0)).toArray(),gravityDirection:[0,-1,0],liftDirection:V(0,-1,0).applyQuaternion(this.pivot.quaternion).toArray(),nozzleExhaustDirection:V(0,-1,0).applyQuaternion(this.pivot.quaternion).toArray(),props:this.props.map(({cue,prop})=>({cue,visible:prop.root.visible})),illustrative:true};}

  dispose(){this.scene.remove(this.root);const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),textures=new Set<T.Texture>();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.LineSegments){geometries.add(o.geometry);const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);}}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const tx of textures)tx.dispose();this.env.dispose();this.pmrem.dispose();if(this.scene.environment===this.env.texture)this.scene.environment=null;}
}
