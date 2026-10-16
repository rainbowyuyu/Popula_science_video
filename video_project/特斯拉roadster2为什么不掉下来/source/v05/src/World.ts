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
const COLORS={paper:0xd8d5ce,navy:0x33454e,blue:0x167e94,cyan:0x8bdfeb,gold:0xad7136,red:0xb83235};
// Conservative metre-space body bounds around the 0.65 m presentation pivot.
// Includes the 2.0 m-wide v05 body and wheel rim edges.
const BODY_HALF_HEIGHT=.65,BODY_HALF_WIDTH=1.01;
const IDS=['hook','suction','ceiling','release','thrust','roll','control','limits','recap','coda'];
type Pose={position:T.Vector3;rotation:number;plateRotation:number;fan:number;air:number;gravity:number;suction:number;shell:number;tank:number;jets:Record<ThrusterName,number>;torque:number;gas:number;thrustRatio:number;verticalAcceleration:number};
type Mat=T.MeshStandardMaterial|T.MeshPhysicalMaterial|T.MeshBasicMaterial;
const noJets=():Record<ThrusterName,number>=>({frontLeft:0,frontRight:0,rearLeft:0,rearRight:0});
function allJets(n:number){return {frontLeft:n,frontRight:n,rearLeft:n,rearRight:n};}
function makeMesh(g:T.BufferGeometry,m:T.Material,n:string){const o=new T.Mesh(g,m);o.name=n;o.castShadow=true;o.receiveShadow=true;return o;}
function material(color:number,metalness=.15,roughness=.45){return new T.MeshStandardMaterial({color,metalness,roughness});}
function fadedMaterial(color:number,opacity=1){return new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});}
function microTexture(seed=1){const size=256,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=fract(Math.sin(x*127.1+y*311.7+seed)*43758.5453),v=125+Math.floor(n*24);const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}const tx=new T.DataTexture(data,size,size);tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.repeat.set(18,18);tx.needsUpdate=true;return tx;}
function roundedPlate(w:number,d:number,h:number,r:number){const s=new T.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);const g=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:3,steps:1,curveSegments:16});g.rotateX(-Math.PI/2);g.translate(0,-h/2,0);return g;}
function fadeObject(o:T.Object3D,alpha:number){o.visible=alpha>.001;o.traverse(c=>{if(c instanceof T.Mesh){const mats=Array.isArray(c.material)?c.material:[c.material];for(const m of mats){if(m.userData.baseOpacity===undefined)m.userData.baseOpacity=m.opacity;m.transparent=true;m.opacity=m.userData.baseOpacity*alpha;m.depthWrite=alpha>.97;}c.castShadow=alpha>.85;}});}

/** A solid tapered arrow, not a floating screen overlay. Local arrow is +Y. */
class ForceArrow {
  readonly root=new T.Group();readonly stem:T.Mesh;readonly head:T.Mesh;readonly mat:T.MeshStandardMaterial;
  constructor(color:number){this.mat=new T.MeshStandardMaterial({color,roughness:.4,metalness:.1,transparent:true,depthWrite:false});this.stem=makeMesh(new T.CylinderGeometry(.014,.014,1,12),this.mat,'Force shaft');this.head=makeMesh(new T.ConeGeometry(.055,.15,24),this.mat,'Force tip');this.stem.castShadow=this.head.castShadow=false;this.root.add(this.stem,this.head);}
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
  private readonly tankGas:T.Mesh;private readonly tankMolecules:T.InstancedMesh;private readonly tankFlow:T.InstancedMesh;
  private readonly tankParticleMat=fadedMaterial(0x167f98,.8);private readonly tankFlowMat=fadedMaterial(0x6ed8e6,.85);
  private readonly tankFlowPaths:T.CatmullRomCurve3[]=[];private readonly halo:T.Mesh;private readonly contactShadow:T.Mesh;
  private readonly pmrem:T.PMREMGenerator;private readonly env:T.WebGLRenderTarget;private readonly clockRing:T.Mesh;
  private readonly anchorPoints=new Map<string,T.Vector3>();
  private readonly cabin:T.Object3D|undefined;
  private readonly props:Array<{cue:string;prop:MechanismProp;scale:number}>;
  private readonly com:T.Group=new T.Group();
  private readonly comMaterial=fadedMaterial(0xc77c36,.9);
  private readonly trajectory:T.Line;private trajectoryMaterial=new T.LineDashedMaterial({color:0x99a8a8,dashSize:.14,gapSize:.13,transparent:true,opacity:0,depthWrite:false});
  private keys:Array<{time:number;offset:T.Vector3;target:T.Vector3;fov:number}>=[];
  private currentPose:Pose|undefined;private currentSection='hook';
  private currentTime=0;
  private cameraLook=V(0,0,0);

  constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private gl:T.WebGLRenderer){
    this.root.name='Roadster_continuous_illustration_stage';scene.add(this.root);
    scene.background=new T.Color(COLORS.paper);scene.fog=new T.Fog(COLORS.paper,27,72);
    gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFSoftShadowMap;gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=.92;gl.outputColorSpace=T.SRGBColorSpace;
    this.pmrem=new T.PMREMGenerator(gl);const room=new RoomEnvironment();
    // Broad softbox cards make deliberate long highlights on curved metal.
    for(const [x,y,z,w,h]of[[-2,5,3,9,2],[1,3,-4,12,1.4],[-5,2,0,3,5]]){const card=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(3.8,3.6,3.3),side:T.DoubleSide}));card.position.set(x,y,z);card.lookAt(0,.5,0);room.add(card);}
    this.env=this.pmrem.fromScene(room,.025);scene.environment=this.env.texture;scene.environmentIntensity=.68;room.dispose();
    this.root.add(new T.HemisphereLight(0xfff7e9,0x6f777c,.85));
    const sun=new T.DirectionalLight(0xffeed7,2.45);sun.position.set(-6,10,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:22,top:15,bottom:-15,near:.5,far:45});sun.shadow.normalBias=.018;sun.shadow.bias=-.00015;sun.shadow.radius=6;sun.target.position.set(8,0,0);this.root.add(sun,sun.target);
    const rim=new T.DirectionalLight(0xd2e4ed,1.5);rim.position.set(3,7,-8);this.root.add(rim);
    const floorMat=new T.MeshStandardMaterial({color:0xbabbb5,metalness:.12,roughness:.70,bumpMap:microTexture(),bumpScale:.016});
    this.stageFloor=makeMesh(new T.PlaneGeometry(180,120),floorMat,'Finely honed architectural concrete');this.stageFloor.rotation.x=-Math.PI/2;this.stageFloor.position.y=-.055;this.stageFloor.castShadow=false;this.root.add(this.stageFloor);
    // Architectural depth stays quiet: one seamless curved backdrop.
    const curve:Array<[number,number]>=[[0,-16]];for(let i=1;i<=32;i++){const a=i/32*Math.PI/2;curve.push([6-6*Math.cos(a),-16-6*Math.sin(a)]);}curve.push([28,-22]);
    const points:number[]=[],indices:number[]=[];for(let i=0;i<curve.length;i++){points.push(-70,curve[i][0],curve[i][1],85,curve[i][0],curve[i][1]);if(i<curve.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
    const backdropGeo=new T.BufferGeometry();backdropGeo.setAttribute('position',new T.Float32BufferAttribute(points,3));backdropGeo.setIndex(indices);backdropGeo.computeVertexNormals();
    const backdropMat=floorMat.clone();backdropMat.bumpMap=null;backdropMat.side=T.DoubleSide;
    const wall=new T.Mesh(backdropGeo,backdropMat);wall.receiveShadow=true;this.root.add(wall);
    // The turntable is a continuous physical teaching prop. Car and deck share
    // the same rigid rotation, maintaining exact tire contact throughout.
    this.plateRig.position.set(0,2.55,0);this.root.add(this.plateRig);
    this.plateMat=new T.MeshPhysicalMaterial({color:0xaec3c5,metalness:.18,roughness:.29,transparent:true,opacity:.30,clearcoat:.6,side:T.DoubleSide,depthWrite:false});
    this.glassPlate=makeMesh(roundedPlate(6.2,2.7,.08,.42),this.plateMat,'Rounded translucent test surface');this.glassPlate.position.y=-2.59;this.glassPlate.castShadow=false;this.plateRig.add(this.glassPlate);
    const edgeMat=material(0x687c83,.65,.31);
    for(const z of[-1.31,1.31]){const rail=makeMesh(new T.CylinderGeometry(.018,.018,5.3,12),edgeMat,'Satin test-road edge');rail.rotation.z=Math.PI/2;rail.position.set(0,-2.585,z);this.plateRig.add(rail);}
    // Two hairline tire routes clarify what is a road, leaving the car readable.
    for(const z of[-.86,.86]){const route=new T.Mesh(new T.BoxGeometry(5.5,.003,.014),material(0x8a9da1));route.position.set(0,-2.545,z);this.plateRig.add(route);}
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
    // Gas always occupies the whole vessel: reserve is encoded by density,
    // never by a shrinking cylinder or a liquid-like free surface.
    this.tankGas=new T.Mesh(new T.CapsuleGeometry(.17,.76,10,32),new T.MeshBasicMaterial({color:0x42b9d0,transparent:true,opacity:.10,depthWrite:false}));this.tankGas.rotation.x=Math.PI/2;this.tankGas.position.set(-.56,.64,0);this.car.root.add(this.tankGas);
    this.tankMolecules=new T.InstancedMesh(new T.SphereGeometry(.009,7,5),this.tankParticleMat,128);this.tankMolecules.frustumCulled=false;this.car.root.add(this.tankMolecules);
    this.tankFlow=new T.InstancedMesh(new T.SphereGeometry(.016,7,5),this.tankFlowMat,32);this.tankFlow.frustumCulled=false;this.car.root.add(this.tankFlow);
    for(const socket of Object.values(this.car.thrusters))this.tankFlowPaths.push(new T.CatmullRomCurve3([V(-.56,.64,.20),V(-.56,.64,.61),V(-.30,.46,.45),V(socket.x,.37,socket.z),socket.clone()],false,'centripetal'));
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
      const fan=new T.Group();fan.position.set(x,.245,0);const hub=makeMesh(new T.CylinderGeometry(.09,.09,.05,32),alloy,'Fan rotor');fan.add(hub);
      const bladeOutline=new T.Shape();bladeOutline.moveTo(.07,-.018);bladeOutline.quadraticCurveTo(.18,-.008,.31,.095);bladeOutline.lineTo(.28,.147);bladeOutline.quadraticCurveTo(.17,.056,.065,.036);bladeOutline.closePath();
      const bladeGeo=new T.ExtrudeGeometry(bladeOutline,{depth:.012,bevelEnabled:true,bevelSegments:2,bevelSize:.003,bevelThickness:.003,curveSegments:10});bladeGeo.rotateX(-Math.PI/2);
      for(let k=0;k<9;k++){const blade=makeMesh(bladeGeo,alloy,'Curved radial impeller blade');blade.rotation.y=k/9*Math.PI*2;fan.add(blade);}this.fans.push(fan);this.chamber.add(fan);
      for(let k=0;k<8;k++){const a=k*Math.PI/4,bolt=makeMesh(new T.CylinderGeometry(.009,.009,.014,6),alloy,'Fan housing fastener');bolt.position.set(x+Math.cos(a)*.34,.25,Math.sin(a)*.34);this.chamber.add(bolt);}
    }
    for(let i=0;i<3;i++){const arrow=new ForceArrow(COLORS.blue);this.pressureArrows.push(arrow);this.car.root.add(arrow.root);}
    for(const side of[-1,1]){
      const points=[V(-.7,.2,side*.22),V(-.7,.22,side*.62),V(-.7,.25,side*1.0),V(-.9,.45,side*1.30)];
      const ribbon=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),32,.012,7,false),fadedMaterial(COLORS.blue,.65));this.flowRibbons.push(ribbon);this.car.root.add(ribbon);
    }
  }

  private cue(id:string){return timeline.cues.find(c=>c.id===id)!;}
  private phraseMatch(cueId:string,words:RegExp,fallback:number){const c=captions.cues.find(c=>c.cueId===cueId&&words.test(c.text));return c?c.startFrame/30:fallback;}
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
    const requiredHeight=BODY_HALF_HEIGHT*Math.abs(Math.cos(angle))+BODY_HALF_WIDTH*Math.abs(Math.sin(angle));
    const deficit=requiredHeight-baseHeight,margin=.025*Math.sin(Math.PI*u)**2;
    // C1 upper envelope of max(0, deficit). The smoothing window vanishes
    // quadratically at the upright endpoints, retaining exact tyre contact and
    // zero endpoint speed after narration retiming. No tolerance relaxation.
    const correction=margin<1e-10?Math.max(0,deficit):deficit<=-margin?0:deficit>=margin?deficit:(deficit+margin)**2/(4*margin);
    return{angle,right,left,position:V(12+3.6*q,baseHeight+correction,0),progress:u};
  }

  private buildCameraKeys(){
    const definitions:Record<string,Array<[number,number[],number[],number]>>={
      hook:[[0,[6.5,-1.1,7.0],[0,.15,0],36],[.32,[5.5,1.8,7.2],[0,.15,0],37],[.70,[4.8,1.6,7.5],[0,.20,0],38],[1,[5.8,1.8,6.8],[0,.15,0],37]],
      suction:[[0,[5.8,1.8,6.8],[0,.15,0],37],[.33,[3.5,2.5,5.1],[-.15,-.12,0],35],[.67,[2.7,2.2,4.7],[-.30,-.16,0],35],[1,[5.9,2.2,7.8],[0,.12,0],38]],
      ceiling:[[0,[5.9,2.2,7.8],[0,.12,0],38],[.40,[6.2,1.8,7.5],[0,.15,0],38],[1,[6.1,1.1,7.8],[0,.10,0],38]],
      release:[[0,[6.1,1.1,7.8],[0,.10,0],38],[.42,[5.8,2.4,7.3],[0,.10,0],38],[1,[5.8,1.5,7.0],[0,.15,0],37]],
      thrust:[[0,[5.8,1.5,7.0],[0,.15,0],37],[.42,[4.8,.75,6.4],[0,-.1,0],37],[1,[6.0,1.8,8.2],[0,.20,0],39]],
      roll:[[0,[6.0,1.8,8.2],[0,.20,0],39],[.34,[5.0,1.6,8.4],[0,.20,0],39],[.76,[4.3,1.8,8.8],[0,.20,0],39],[1,[5.2,1.7,7.9],[0,.20,0],38]],
      control:[[0,[5.2,1.7,7.9],[0,.20,0],38],[.48,[4.8,2.4,7.4],[0,.12,0],37],[1,[4.3,2.5,6.2],[-.25,.05,0],36]],
      limits:[[0,[4.3,2.5,6.2],[-.25,.05,0],36],[.35,[-1.0,1.45,3.2],[-.56,-.06,0],35],[.73,[-.8,1.8,3.4],[-.56,-.04,0],35],[1,[5.6,2.2,7.3],[0,.15,0],38]],
      recap:[[0,[5.6,2.2,7.3],[0,.15,0],38],[.5,[5.3,1.6,7.6],[0,.15,0],37],[1,[6.7,2.5,8.7],[0,.15,0],38]],
      coda:[[0,[6.7,2.5,8.7],[0,.15,0],38],[1,[7.2,2.8,9.5],[0,.15,0],38]],
    };
    this.keys=[];for(const id of IDS){const s=section(id);const rows=definitions[id];for(const [u,off,target,fov] of rows){const time=mix(s.start,s.end,u);if(this.keys.length&&Math.abs(this.keys[this.keys.length-1].time-time)<.001)continue;this.keys.push({time,offset:V(...off as [number,number,number]),target:V(...target as [number,number,number]),fov});}}
  }

  private pose(t:number):Pose{
    const {id,u}=getSection(t);this.currentSection=id;
    let p:Pose={position:V(0,.65,0),rotation:0,plateRotation:0,fan:0,air:0,gravity:0,suction:0,shell:1,tank:0,jets:noJets(),torque:0,gas:1,thrustRatio:0,verticalAcceleration:0};
    const attached=(angle:number)=>{p.plateRotation=angle;p.rotation=angle;p.position.set(0,2.55-1.90*Math.cos(angle),-1.90*Math.sin(angle));};
    if(id==='hook'){
      const s1=this.cue('s01'),s2=this.cue('s02'),s3=this.cue('s03');
      if(t<s2.startSec){attached(Math.PI*(1-ramp(t,mix(s1.startSec,s1.endSec,.57),s1.endSec)));p.fan=1;}
      else if(t<s3.startSec){
        const q=clamp((t-s2.startSec)/(s2.endSec-s2.startSec)),fly=ramp(q,.30,.92),omega=2*Math.PI/.46,integral=(z:number)=>z**3-.5*z**4;
        let roll=0,accel=0,brake=0;
        if(q>.30&&q<.46){const z=(q-.30)/.16;roll=omega*.16*integral(z);accel=4*z*(1-z);}
        else if(q>=.46&&q<.76)roll=omega*(.08+q-.46);
        else if(q>=.76&&q<.92){const z=(q-.76)/.16;roll=omega*(.38+.16*(z-integral(z)));brake=4*z*(1-z);}
        else if(q>=.92)roll=2*Math.PI;
        const x=6*ramp(q,0,.30)+2*ramp(q,.30,.92),y=.65+2.8*Math.sin(Math.PI*fly)+1.1*Math.sin(Math.PI*clamp((q-.30)/.62))**2;
        p.position.set(x,Math.max(y,BODY_HALF_HEIGHT*Math.abs(Math.cos(roll))+BODY_HALF_WIDTH*Math.abs(Math.sin(roll))+.04*Math.sin(Math.PI*fly)**2),0);p.rotation=roll;
        p.jets.frontRight=accel;p.jets.rearRight=accel;p.jets.frontLeft=brake;p.jets.rearLeft=brake;
      }else{p.position.set(8*(1-ramp(t,s3.startSec,s3.endSec)),.65,0);p.rotation=Math.PI*2;}
    }
    if(id==='suction'){p.fan=1;p.air=bell(u,.20,.32,.90,1);p.shell=1-.70*bell(u,.24,.40,.78,1);p.suction=0;}
    if(id==='ceiling'){
      const turn=this.cue('s08');attached(Math.PI*ramp(t,turn.startSec,turn.endSec));p.fan=1;p.air=.80*bell(u,.0,.12,.90,1);
      const arrows=ramp(t,turn.startSec+.5,turn.startSec+2)*(1-ramp(u,.92,1));p.gravity=arrows;p.suction=arrows;p.shell=1-.36*bell(u,.12,.23,.85,1);
    }
    if(id==='release'){attached(Math.PI*(1-ramp(u,0,.35)));p.position.x=12*ramp(u,.35,1);p.fan=1-ramp(u,.50,.76);p.air=.5*bell(u,.37,.48,.72,.92);}
    if(id==='thrust'){
      const s16=this.cue('s16'),s15=this.cue('s15'),s17=this.cue('s17');
      // Gas stops at s17: momentum first carries the car upward, then the same
      // car returns to its contact plane. Slow motion is stated in the overlay.
      const brakeStart=this.phraseMatch('s16',/要悬停|先让上升|先把上升|停在空中/,s16.startSec+(s16.endSec-s16.startSec)*.28),hoverStart=this.phraseMatch('s16',/再让推力|抵消重力/,s16.startSec+(s16.endSec-s16.startSec)*.55),jumpStart=this.phraseMatch('s16',/跳起来|跳起|跃起|落下/,s16.startSec+(s16.endSec-s16.startSec)*.77);
      const accelerationTime=brakeStart-s16.startSec,brakingTime=hoverStart-brakeStart,peakVelocity=1.2/(accelerationTime+brakingTime);
      const integralSmooth=(q:number)=>{const z=clamp(q);return z**6-3*z**5+2.5*z**4;};
      const launchDuration=s17.startSec-jumpStart,launchVelocity=.24,launchHeight=1.8+.5*launchVelocity*launchDuration,landingTime=s17.endSec-.60,flightDuration=landingTime-s17.startSec;
      const ballisticGravity=2*(launchHeight+launchVelocity*flightDuration-.65)/(flightDuration**2);
      const heightAt=(at:number)=>{
        let h=.65+.55*ramp(at,s15.startSec,s15.endSec-.8);
        // Integrating a smooth velocity curve keeps position and velocity C1.
        // Acceleration changes sign only when narration starts slowing to hover.
        if(at>=s16.startSec&&at<brakeStart)h=1.2+peakVelocity*accelerationTime*integralSmooth((at-s16.startSec)/accelerationTime);
        else if(at>=brakeStart&&at<hoverStart){const q=(at-brakeStart)/brakingTime;h=1.2+.5*peakVelocity*accelerationTime+peakVelocity*brakingTime*(q-integralSmooth(q));}
        else if(at>=hoverStart&&at<jumpStart)h=1.8;
        else if(at>=jumpStart&&at<s17.startSec)h=1.8+.5*launchVelocity/launchDuration*(at-jumpStart)**2;
        // One constant downward acceleration governs both ascent and descent.
        // Ground contact is the only point that arrests the downward velocity.
        else if(at>=s17.startSec&&at<landingTime){const dt=at-s17.startSec;h=launchHeight+launchVelocity*dt-.5*ballisticGravity*dt*dt;}
        else if(at>=landingTime)h=.65;
        return h;
      };
      const height=heightAt(t),acceleration=(heightAt(t+.005)-2*height+heightAt(t-.005))/.000025;p.position.set(12,height,0);p.verticalAcceleration=acceleration;
      // Relative-force diagram shares the trajectory's acceleration sign.
      // Magnitudes are intentionally normalized for readable slow motion.
      p.thrustRatio=t<s15.startSec?.78:t<s17.startSec?1+clamp(acceleration*2.4,-.55,.85):0;
      const power=ramp(t,s15.startSec,s15.startSec+2)*(1-ramp(t,s17.startSec-.20,s17.startSec));p.jets=allJets(.52*p.thrustRatio*power);
      p.gravity=.8*ramp(t,s15.startSec,s15.startSec+3)*(1-ramp(t,landingTime,landingTime+.45));p.suction=.8*power;p.shell=1-.45*bell(u,.20,.30,.42,.57);p.tank=bell(u,.20,.30,.42,.57);
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
    for(const {cue}of this.props){const w=this.cueEnvelope(t,cue);if(w>0){const focus=p.position.clone().add(V(-4.0,cue==='s18'?.55:.75,2.30));const pos=focus.clone().add(V(2.7,1.25,4.9));this.camera.position.lerp(pos,w*.95);this.cameraLook.lerp(focus,w*.95);}}
    this.camera.lookAt(this.cameraLook);this.camera.fov=mix(a.fov,b.fov,v);this.camera.near=.05;this.camera.far=160;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }

  update(t:number){
    this.currentTime=t;const p=this.pose(Math.max(0,t));this.currentPose=p;this.pivot.position.copy(p.position);this.pivot.rotation.set(p.rotation,0,0);this.plateRig.rotation.x=p.plateRotation;
    for(const {cue,prop}of this.props){const c=this.cue(cue),q=(t-c.startSec)/(c.endSec-c.startSec),entrance=ramp(q,0,.16),exit=ramp(q,.82,1);prop.root.position.copy(p.position).add(V(-4.0-30*(1-entrance)-30*exit,cue==='s18'?-.62:.40,2.30));prop.update(ramp(q,.19,.73));prop.root.visible=q>=0&&q<=1;}
    this.car.setShellOpacity(p.shell);this.car.setWheelSpin(-p.position.x/.36);this.car.setTankVisible(p.tank>.005);fadeObject(this.car.tank,p.tank);
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
      if(!exterior){const q=fract(t*.25+i*.277),side=i%2?1:-1,fanX=i%3?-.7:.7;if(q<.55){const k=q/.55;this.tmp.position.set(mix(fanX-.30,fanX,k),.14,mix(side*.86,0,k));}else{const k=(q-.55)/.45;this.tmp.position.set(fanX-.18*k,.14+.22*k,side*1.35*k);}}
      const size=exterior?.50+f*.4:.60;this.tmp.scale.setScalar(size);this.tmp.updateMatrix();this.pressureParticles.setMatrixAt(i,this.tmp.matrix);
    }this.pressureParticles.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.pressureArrows.length;i++){const x=[-1.12,0,1.12][i%3],z=1.13;this.pressureArrows[i].set(V(x,.93,z),V(0,-1,0),.35+.025*Math.sin(t*1.8+i),p.air*.67);}
    for(const ribbon of this.flowRibbons){(ribbon.material as T.MeshBasicMaterial).opacity=p.air*.45;ribbon.visible=p.air>.005;}
    const release=section('release'),hookNozzles=this.cueEnvelope(t,'s02'),hardware=Math.max(hookNozzles,ramp(t,release.end-3,release.end));fadeObject(this.car.thrusterHardware,hardware);
    let ji=0;for(const name of Object.keys(this.jets) as ThrusterName[]){const strength=p.jets[name];this.jets[name].update(t,strength,ji++*.13);const origin=this.car.thrusters[name].clone();origin.z+=origin.z>0?.38:-.38;const review=this.orientationReview(t).arrows,diagramAlpha=this.currentSection==='thrust'?0:Math.max(strength*.85,review*.7);this.jetArrows[name].set(origin,V(0,1,0),.65+strength*.75,diagramAlpha);}
    const gravityOrigin=p.position.clone().add(V(-2.6,.65,1.15));this.weight.set(gravityOrigin,V(0,-1,0),1.40,p.gravity);
    const forceDirection=V(0,-1,0).applyQuaternion(this.pivot.quaternion);const forceOrigin=p.position.clone().add(V(2.8,.0,0));
    if(this.currentSection==='thrust'){this.lift.set(forceOrigin,V(0,1,0),1.40*p.thrustRatio,p.suction);}else this.lift.set(forceOrigin,forceDirection,1.55,p.suction);
    const actualTorque=p.jets.frontRight+p.jets.rearRight-p.jets.frontLeft-p.jets.rearLeft,torqueAlpha=p.torque*Math.min(1,Math.abs(actualTorque));this.torqueMat.opacity=torqueAlpha;this.torqueGroup.visible=torqueAlpha>.001;this.torqueGroup.rotation.x=-p.rotation;this.torqueGroup.scale.z=actualTorque<0?-1:1;
    const comAlpha=bell(t,this.cue('s20').startSec,this.cue('s20').startSec+2,this.cue('s22').endSec,this.cue('s23').startSec+2),traceAlpha=bell(t,this.cue('s20').startSec,this.cue('s20').startSec+2,this.cue('s20').endSec-1,this.cue('s21').startSec);this.com.position.copy(p.position);this.com.quaternion.copy(this.camera.quaternion);this.comMaterial.opacity=comAlpha*.9;this.com.visible=comAlpha>.001;this.trajectoryMaterial.opacity=traceAlpha*.6;this.trajectory.visible=traceAlpha>.001;this.trajectory.geometry.setDrawRange(0,Math.floor(this.rollMotion(t).progress*100)+1);
    this.tankGas.visible=this.tankMolecules.visible=this.tankFlow.visible=p.tank>.001;this.tankGas.scale.set(1,1,1);(this.tankGas.material as T.MeshBasicMaterial).opacity=(.035+.065*p.gas)*p.tank;
    this.tankParticleMat.opacity=.82*p.tank;this.tankFlowMat.opacity=.84*p.tank;
    for(let i=0;i<128;i++){
      const z=.53*Math.sin(t*.31+i*2.399963),cap=Math.max(0,Math.abs(z)-.38),r=Math.sqrt(Math.max(0,.16**2-cap**2))*Math.sqrt(fract(i*.6180339887+.11)),a=t*.61+i*2.399963;
      this.tmp.position.set(-.56+Math.cos(a)*r,.64+Math.sin(a)*r,z);
      const threshold=fract(i*.754877666+.17),density=smooth((p.gas+.10-threshold)/.20);
      this.tmp.scale.setScalar((.65+.5*fract(i*.313))*density);this.tmp.updateMatrix();this.tankMolecules.setMatrixAt(i,this.tmp.matrix);
    }this.tankMolecules.instanceMatrix.needsUpdate=true;
    const gasFlow=this.currentSection==='limits'?bell(getSection(t).u,.16,.25,.75,.85):clamp(Object.values(p.jets).reduce((sum,n)=>sum+n,0));
    for(let i=0;i<32;i++){const q=fract(t*.28+Math.floor(i/4)/8),path=this.tankFlowPaths[i%4];this.tmp.position.copy(path.getPoint(q));this.tmp.scale.setScalar(Math.sin(Math.PI*q)*gasFlow);this.tmp.updateMatrix();this.tankFlow.setMatrixAt(i,this.tmp.matrix);}this.tankFlow.instanceMatrix.needsUpdate=true;
    const vessel=this.car.tank.getObjectByName('Pressure_vessel_capsule') as T.Mesh|undefined;if(vessel){const m=vessel.material as T.MeshStandardMaterial;m.opacity=p.tank*.32;m.depthWrite=false;}
    this.clockRing.visible=p.tank>.001;(this.clockRing.material as T.MeshBasicMaterial).opacity=.6*p.tank;this.clockRing.scale.setScalar(.9+.05*Math.sin(t));
    this.contactShadow.position.x=p.position.x;this.contactShadow.position.z=p.position.z;const height=Math.max(0,p.position.y-.65);this.contactShadow.scale.setScalar(1+height*.17);(this.contactShadow.material as T.MeshBasicMaterial).opacity=.65/(1+height*1.8);this.halo.position.x=p.position.x;this.halo.position.z=p.position.z;(this.halo.material as T.MeshBasicMaterial).opacity=.12;
    this.plateMat.opacity=mix(.30,.15,p.air);this.cameraAt(t,p);this.root.updateMatrixWorld(true);
    this.anchorPoints.set('car',p.position.clone());
    this.anchorPoints.set('fan',this.car.root.localToWorld(V(-.70,.245,0)));
    this.anchorPoints.set('tank',this.car.root.localToWorld(V(-.55,.65,0)));
    this.anchorPoints.set('pressure',this.car.root.localToWorld(V(.7,.18,1.02)));
    this.anchorPoints.set('weight',gravityOrigin.clone().add(V(0,-.75,0)));
    this.anchorPoints.set('lift',forceOrigin.clone().add((this.currentSection==='thrust'?V(0,1,0):forceDirection).multiplyScalar(.75)));
    this.anchorPoints.set('com',p.position.clone());
    this.anchorPoints.set('thrust',this.car.root.localToWorld(V(1.45,-.4,.69)));
    this.anchorPoints.set('roll',this.pivot.localToWorld(V(2.7,1.3,.0)));
    this.anchorPoints.set('platform',this.plateRig.localToWorld(V(2.6,-2.55,1.25)));
  }

  /** NDC coordinates for large post-composited labels. */
  projectAnchor(name:string){const p=this.anchorPoints.get(name)?.clone();if(!p)return {x:0,y:0,visible:false};p.project(this.camera);return {x:p.x,y:p.y,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.90};}
  get telemetry(){const p=this.currentPose;return {section:this.currentSection,position:p?.position.toArray(),rotation:p?.rotation,fan:p?.fan,suction:p?.suction,jets:p?.jets,thrustRatio:p?.thrustRatio,verticalAcceleration:p?.verticalAcceleration,bodyEnvelope:{height:BODY_HALF_HEIGHT,width:BODY_HALF_WIDTH},gasReserve:p?.gas,gasVolumeScale:this.tankGas.scale.toArray(),camera:this.camera.position.toArray(),target:this.cameraLook.toArray(),plateRotation:p?.plateRotation,surfaceAttached:this.currentSection==='ceiling'||this.currentSection==='hook'&&this.currentTime<this.cue('s02').startSec,plateContactTop:this.plateRig.localToWorld(V(0,-2.55,0)).toArray(),tireContact:this.car.root.localToWorld(V(0,0,0)).toArray(),gravityDirection:[0,-1,0],liftDirection:V(0,-1,0).applyQuaternion(this.pivot.quaternion).toArray(),nozzleExhaustDirection:V(0,-1,0).applyQuaternion(this.pivot.quaternion).toArray(),props:this.props.map(({cue,prop})=>({cue,visible:prop.root.visible})),illustrative:true};}

  dispose(){this.scene.remove(this.root);const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>(),textures=new Set<T.Texture>();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);}}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const tx of textures)tx.dispose();this.env.dispose();this.pmrem.dispose();if(this.scene.environment===this.env.texture)this.scene.environment=null;}
}
