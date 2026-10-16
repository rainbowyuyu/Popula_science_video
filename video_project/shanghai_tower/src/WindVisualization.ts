import * as T from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {PhysicsPlayback} from './PhysicsPlayback';
import {V,State,clamp,mix,pulse,ramp} from './visual';
import {installWindScreenMask} from './WindScreenMask';

type Stream={height:number;offset:number;phase:number;width:number;primary:boolean;color:T.Color;basePoints:T.Vector3[];points:T.Vector3[];lengths:number[];length:number;guide:Line2;ribbon:T.Mesh;positions:Float32Array;colors:Float32Array;head:T.Mesh;};
const POINTS=161,TAIL=32,TRAVEL=9.6;
// High-contrast data colours remain within the film's teal/amber palette but
// hold up against the brightened sky and glass.
// High-key daylight needs a darker cyan and a restrained amber accent. The
// field remains depth-tested so it cannot draw through the tower, while the
// contrast survives the pale sky and glass reflections.
const INK=new T.Color('#075b78'),AMBER=new T.Color('#b35b20');

/**
 * Analytical paths explain flow around the tower; they are not CFD samples.
 * The tower-relative path follows the same interpolated structural displacement.
 * Particle phase is deterministic in the solver's continuous wind clock, allowing
 * arbitrary-frame Remotion rendering without resetting particles at clip cuts.
 */
export class WindVisualization {
  root=new T.Group();streams:Stream[]=[];
  private integral:number[]=[];
  private times:number[]=[];
  private factor:number[]=[];
  constructor(public scene:T.Scene,public physics:PhysicsPlayback){
    this.root.name='analytical-wind-illustration';scene.add(this.root);
    const d=physics.data.dynamic as typeof physics.data.dynamic&{appliedForceFactors?:number[]};
    this.times=[0,...d.time];this.factor=[0,...(d.appliedForceFactors??d.time.map(()=>1))];this.integral=[0];
    for(let i=1;i<this.times.length;i++)this.integral.push(this.integral[i-1]+(this.times[i]-this.times[i-1])*(Math.sqrt(Math.abs(this.factor[i-1]))+Math.sqrt(Math.abs(this.factor[i])))*.5);
    // Keep two lanes per height so the flow remains legible against the
    // exterior.  A dense grid read like a wire cage during close-ups.
    const heights=[.78,2.18,3.62,5.02],offsets=[-.68,.68];
    for(let row=0;row<heights.length;row++)for(let lane=0;lane<offsets.length;lane++){
      const height=heights[row],offset=offsets[lane],primary=lane===0||row===1;
      const color=(primary&&row===1&&lane===0?AMBER:INK).clone();
      // Circular-body stream-function contours give unambiguous front/back
      // deflection. Radius is an illustrative clearance envelope, not pressure.
      const radius=.78-.255*height/6.32,points:T.Vector3[]=[],lengths=[0];
      for(let k=0;k<POINTS;k++){
        const x=-TRAVEL/2+k/(POINTS-1)*TRAVEL;let lo=Math.abs(offset),hi=3;
        for(let n=0;n<25;n++){const z=(lo+hi)*.5,psi=z*(1-radius*radius/(x*x+z*z));if(psi<Math.abs(offset))lo=z;else hi=z;}
        points.push(V(x,height,Math.sign(offset)*(lo+hi)*.5));
        if(k)lengths.push(lengths[k-1]+points[k].distanceTo(points[k-1]));
      }
      const gm=new LineMaterial({color:color.getHex(),linewidth:primary?4.6:2.0,transparent:true,opacity:primary?.82:.27,depthWrite:false,depthTest:true,worldUnits:false});gm.toneMapped=false;gm.resolution.set(1920,1080);
      installWindScreenMask(gm);
      const guide=new Line2(new LineGeometry().setPositions(points.flatMap(p=>p.toArray())),gm);(guide.geometry.getAttribute('instanceStart') as T.InterleavedBufferAttribute).data.setUsage(T.DynamicDrawUsage);guide.frustumCulled=false;this.root.add(guide);
      const positions=new Float32Array(TAIL*2*3),colors=new Float32Array(TAIL*2*4),indices:number[]=[];
      for(let k=0;k<TAIL-1;k++){const n=k*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,4));geometry.setIndex(indices);
      const material=new T.MeshBasicMaterial({color:'#ffffff',vertexColors:true,side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false});
      installWindScreenMask(material);
      const ribbon=new T.Mesh(geometry,material);ribbon.frustumCulled=false;this.root.add(ribbon);
      const headMaterial=new T.MeshBasicMaterial({color,transparent:true,opacity:.98,depthWrite:false,toneMapped:false});installWindScreenMask(headMaterial);
      // A wedge communicates direction more reliably than the former sphere.
      const head=new T.Mesh(new T.ConeGeometry(1,1,8),headMaterial);head.frustumCulled=false;this.root.add(head);
      this.streams.push({height,offset,phase:(row*.183+lane*.257)%1,width:primary?11.5:6.6,primary,color,basePoints:points.map(p=>p.clone()),points,lengths,length:lengths.at(-1)!,guide,ribbon,positions,colors,head});
    }
  }
  private pathAt(stream:Stream,distance:number){
    const d=clamp(distance/stream.length)*stream.length;let lo=0,hi=stream.lengths.length-1;
    while(hi-lo>1){const k=(lo+hi)>>1;if(stream.lengths[k]<d)lo=k;else hi=k;}
    return stream.points[lo].clone().lerp(stream.points[hi],clamp((d-stream.lengths[lo])/(stream.lengths[hi]-stream.lengths[lo])));
  }
  private travelAt(time:number){
    let i=0;while(i<this.times.length-2&&this.times[i+1]<time)i++;
    const t=clamp((time-this.times[i])/(this.times[i+1]-this.times[i]));return mix(this.integral[i],this.integral[i+1],t);
  }
  private updateWake(stream:Stream,time:number,u:number){
    // The sinuous downstream wake is a mechanism diagram, not a CFD solution.
    // It has no velocity/pressure scale. Only existing paths move: no new swarm.
    // The narration's height-decorrelation example unfolds during s031; smooth
    // phase separation illustrates the mechanism without asserting a measured
    // shedding frequency or changing the stored structural wind loading.
    const separate=ramp(31.0,31.85,u),heightPhase=separate*(stream.height-.58)*1.12;
    const near=stream.primary,amplitude=near?.23:.04;
    stream.lengths[0]=0;
    for(let k=0;k<stream.points.length;k++){
      const rest=stream.basePoints[k],p=stream.points[k];p.copy(rest);
      // Deflection begins beyond the tower's conservative clearance envelope.
      // It advects downstream with positive X, matching all inlet trails.
      const envelope=ramp(.82,1.48,rest.x)*(1-.32*ramp(3.2,4.8,rest.x));
      const phase=(rest.x-.82)*3.65-time*1.16-heightPhase;
      const turn=Math.sin(phase)+Math.sign(stream.offset)*.13*Math.sin(phase*2);
      p.z+=envelope*amplitude*turn;
      // A restrained rise/fall makes the wake legible under a shallow camera;
      // its amplitude remains below neighbouring height-plane spacing.
      p.y+=envelope*(near?.055:.009)*Math.cos(phase);
      if(k)stream.lengths[k]=stream.lengths[k-1]+p.distanceTo(stream.points[k-1]);
    }
    stream.length=stream.lengths.at(-1)!;
    // Reuse the interleaved line buffer; setPositions every frame would allocate
    // fresh GPU attributes during a full-length render.
    const start=stream.guide.geometry.getAttribute('instanceStart') as T.InterleavedBufferAttribute,end=stream.guide.geometry.getAttribute('instanceEnd') as T.InterleavedBufferAttribute;
    for(let k=0;k<stream.points.length-1;k++){const a=stream.points[k],b=stream.points[k+1];start.setXYZ(k,a.x,a.y,a.z);end.setXYZ(k,b.x,b.y,b.z);}start.data.needsUpdate=true;
  }
  update(state:State,camera:T.PerspectiveCamera){
    const u=state.n+state.u,weight=pulse(28.85,29.6,34.05,35.15,u);
    this.root.visible=weight>.00001;if(!this.root.visible)return;
    // The complete layer translates into and out of camera view; no clip-local
    // particle reset or whole-field opacity crossfade.
    this.root.position.x=-14*(1-ramp(28.85,29.6,u))+14*ramp(34.05,35.15,u);
    const time=this.physics.physicalTime(state),travel=this.travelAt(time)*.091;
    const focus=1-.62*pulse(31.45,31.95,33.55,34.15,u);
    const worldPerPixel=(p:T.Vector3)=>2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(p)/1080;
    const cameraRight=V().setFromMatrixColumn(camera.matrixWorld,0);
    for(const stream of this.streams){
      this.updateWake(stream,time,u);
      const displacement=this.physics.displacementAt(V(0,stream.height,0));
      // This shared translation maintains the original clearance even while the
      // tower's exaggerated displacement is visible.
      // As the exterior comparison ends, the secondary height planes travel
      // toward camera-right and leave the viewport. Keeping the motion in world
      // space avoids an in-frame hide/fade and leaves the near pair to hand off
      // to the structural close-up a little later.
      // Primary lanes stay for the close-up hand-off; quiet guides leave a
      // little earlier so they never crowd the next structural shot.
      const secondary=!stream.primary;
      const exitProgress=secondary?ramp(31.45,32.35,u):ramp(32.12,33.18,u);
      const exitDistance=exitProgress*(secondary?15:12);
      stream.guide.position.copy(displacement).addScaledVector(cameraRight,exitDistance);
      stream.guide.material.opacity=(stream.primary?.72:.30)*focus;
      const phase=(travel+stream.phase)%1,tailLength=stream.primary?1.42:.92;
      const leading=phase*(stream.length+tailLength);
      const visibility=ramp(0,.16,leading)*(1-ramp(stream.length,stream.length+tailLength,leading));
      for(let k=0;k<TAIL;k++){
        const t=k/(TAIL-1),distance=leading-tailLength*(1-t),p=this.pathAt(stream,distance).add(displacement).addScaledVector(cameraRight,exitDistance);
        const tangent=this.pathAt(stream,Math.min(stream.length,distance+.015)).sub(this.pathAt(stream,Math.max(0,distance-.015))).normalize();
        const view=camera.position.clone().sub(p).normalize(),side=new T.Vector3().crossVectors(tangent,view).normalize();
        const half=worldPerPixel(p)*stream.width*.5*Math.pow(t,.58)*focus;
        const alpha=visibility*(distance>0&&distance<stream.length?1:0)*Math.pow(t,.7)*.9;
        for(let e=0;e<2;e++){
          const v=p.clone().addScaledVector(side,(e?1:-1)*half),vi=(k*2+e)*3,ci=(k*2+e)*4;
          stream.positions[vi]=v.x;stream.positions[vi+1]=v.y;stream.positions[vi+2]=v.z;
          stream.colors[ci]=stream.color.r;stream.colors[ci+1]=stream.color.g;stream.colors[ci+2]=stream.color.b;stream.colors[ci+3]=alpha;
        }
      }
      stream.ribbon.geometry.getAttribute('position').needsUpdate=true;stream.ribbon.geometry.getAttribute('color').needsUpdate=true;
      const tip=this.pathAt(stream,leading).add(displacement).addScaledVector(cameraRight,exitDistance);
      stream.head.position.copy(tip);
      const tangent=this.pathAt(stream,Math.min(stream.length,leading+.022)).sub(this.pathAt(stream,Math.max(0,leading-.022)));
      if(tangent.lengthSq()>1e-10)stream.head.quaternion.setFromUnitVectors(V(0,1,0),tangent.normalize());
      const coneLength=worldPerPixel(tip)*stream.width*(stream.primary?1.05:.75)*focus;
      stream.head.scale.set(coneLength*.72,coneLength,coneLength*.72);
      stream.head.visible=leading>0&&leading<stream.length;
      (stream.head.material as T.MeshBasicMaterial).opacity=visibility*.96;
    }
  }
  dispose(){
    this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});this.streams.length=0;
  }
}
