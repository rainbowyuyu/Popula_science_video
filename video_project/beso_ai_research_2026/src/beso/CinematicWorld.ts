import * as T from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {BesoWorld,FilmState,WorldInfo,clamp,smooth} from './World';
import {EngineeringTaskGraph} from './EngineeringTaskGraph';
import {sampleCinematicCamera,projectAnchor,CameraKey} from './CinematicMotion';

type Pose={position:T.Vector3;target:T.Vector3};
export type CinematicCallout={id:string;label:string;role:string;x:number;y:number;depth:number;visible:boolean;value?:string;tone?:string};
export type CinematicInfo=WorldInfo&{callouts:CinematicCallout[];taskNodes:{id:string;label:string;x:number;y:number;z:number;visible:boolean;status:string;input:string;output:string}[];cameraTarget:{x:number;y:number;z:number}};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const ramp=(time:number,a:number,b:number)=>smooth((time-a)/Math.max(.001,b-a));

/** Absolute-time cinematography around read-only physical evidence. Scenes
 * share one world space and never reset a model when a semantic ID changes. */
export class CinematicWorld extends BesoWorld{
  private cinematicGroup=new T.Group();
  private launchMode=false;
  private sky?:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
  private ocean?:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
  private oceanDepth?:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;
  private drawingStage=new T.Group();
  private drawingModel?:T.Group;
  private drawingInk:T.LineSegments[]=[];
  private drawingMinimumY=0;
  private tasks=new EngineeringTaskGraph();
  private topologyPoints?:T.Points<T.BufferGeometry,T.PointsMaterial>;
  private topologyBase?:Float32Array;
  private flowLines:T.Line<T.BufferGeometry,T.LineBasicMaterial>[]=[];
  private windLines:T.Line<T.BufferGeometry,T.LineBasicMaterial>[]=[];
  private windBase:Float32Array[]=[];
  private flowBase:Float32Array[]=[];
  private forceArrows:T.ArrowHelper[]=[];

  constructor(canvas:HTMLCanvasElement,base:string,timings:{id:string;start:number;duration:number}[],fps:number,launchMode=false){
    super(canvas,base,timings,fps);this.launchMode=launchMode;if(!launchMode)return;
    this.scene.add(this.cinematicGroup,this.drawingStage,this.tasks.group);
    this.cinematicGroup.name='AI Engineer / cinematic presentation';
    this.buildSky();this.buildLaunchOcean();this.buildTopologyAccent();
    this.ready=this.ready.then(async()=>{
      if(this.native)await this.native.loadPresentationNacelle(base+'assets/v4/nacelle-skin.glb');
      this.buildDrawingStage();this.buildNativeFlow();
      const texture=await new RGBELoader().loadAsync(base+'environment/v2-sky.hdr');texture.mapping=T.EquirectangularReflectionMapping;
      const pm=new T.PMREMGenerator(this.renderer),environment=pm.fromEquirectangular(texture);
      this.environment.dispose();this.environment=environment;this.scene.environment=environment.texture;this.scene.environmentIntensity=.62;pm.dispose();
      if(this.sky){this.sky.material.uniforms.daylight.value=texture;this.sky.material.uniforms.hasDaylight.value=1;}
    });
  }

  private buildDrawingStage(){
    if(!this.native)return;
    this.drawingStage.name='Native platform / geometry drafting reveal';
    const paper=new T.Mesh(new T.BoxGeometry(174,.5,150),new T.MeshStandardMaterial({color:'#eef3ef',roughness:.81,metalness:.01}));
    paper.position.set(-8,-26,0);paper.receiveShadow=true;paper.castShadow=true;this.drawingStage.add(paper);
    const grid:number[]=[];for(let x=-90;x<=74;x+=8)grid.push(x,-25.72,-70,x,-25.72,70);for(let z=-70;z<=70;z+=8)grid.push(-90,-25.72,z,74,-25.72,z);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(grid,3));
    this.drawingStage.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:'#88afb1',transparent:true,opacity:.23})));
    this.native.setTime(0,true);
    const platform=this.native.platform.clone(true);platform.name='Native hull pieces / drafting reveal';platform.updateMatrixWorld(true);
    platform.traverse(o=>{
      if(!(o instanceof T.Mesh))return;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
      const edges=new T.EdgesGeometry(o.geometry,28);edges.applyMatrix4(o.matrixWorld);const pos=edges.getAttribute('position') as T.BufferAttribute;
      for(let i=0;i<pos.count;i++)pos.setY(i,-25.64);
      const ink=new T.LineSegments(edges,new T.LineBasicMaterial({color:'#327488',transparent:true,opacity:.65,depthWrite:false}));ink.renderOrder=3;this.drawingStage.add(ink);this.drawingInk.push(ink);
    });
    this.drawingMinimumY=new T.Box3().setFromObject(platform).min.y-platform.position.y;this.drawingModel=platform;this.drawingStage.add(platform);this.drawingStage.visible=false;
  }

  private updateDrawingStage(time:number){
    if(!this.drawingModel)return;
    // The same native hull stays under the concept macro while the real product
    // page enters. It travels out of frame before topology enters; visibility
    // changes only at the ends of its offscreen corridor.
    const brief=time>=8.5&&time<=20.7;
    const entry=brief?ramp(time,8.5,11.8):ramp(time,61.3,65.1),exit=brief?ramp(time,16.9,20.7):ramp(time,77,81.2);
    this.drawingStage.visible=brief||(time>=61.3&&time<=81.2);
    this.drawingStage.position.set(128+610*(1-entry)+(brief?-790:610)*exit,brief?-18*exit:0,8+38*exit);
    this.drawingStage.rotation.y=brief?-.12+.09*ramp(time,11.8,17):-.12+.15*ramp(time,67,76);
    const grow=brief?1:ramp(time,66.3,71);this.drawingModel.visible=true;this.drawingModel.scale.set(1,Math.max(.0001,grow),1);this.drawingModel.position.y=-25.4-this.drawingMinimumY*Math.max(.0001,grow);
    for(const [i,ink]of this.drawingInk.entries()){ink.geometry.setDrawRange(0,brief?ink.geometry.getAttribute('position').count:Math.floor(ink.geometry.getAttribute('position').count*ramp(time,64+i*.028,66.8+i*.028)));(ink.material as T.LineBasicMaterial).opacity=.7-.45*grow;}
  }

  private buildSky(){
    const g=new T.PlaneGeometry(2100,1250);
    const m=new T.ShaderMaterial({side:T.DoubleSide,depthWrite:false,depthTest:false,uniforms:{daylight:{value:null},hasDaylight:{value:0},seaWeight:{value:1}},
      vertexShader:`varying vec2 vUv;varying vec3 direction;void main(){vUv=uv;direction=(modelMatrix*vec4(position,1.)).xyz-cameraPosition;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform sampler2D daylight;uniform float hasDaylight;uniform float seaWeight;varying vec2 vUv;varying vec3 direction;
      void main(){vec3 horizon=vec3(.89,.91,.88);vec3 top=vec3(.50,.69,.79);vec3 bottom=vec3(.39,.62,.70);float y=vUv.y;
      vec3 c=mix(bottom,horizon,smoothstep(0.,.55,y));c=mix(c,top,smoothstep(.56,1.,y));vec3 d=normalize(direction);
      vec2 eUv=vec2(atan(d.z,d.x)/6.2831853+.5,.5+asin(clamp(d.y,-1.,1.))/3.14159265);vec3 photo=texture2D(daylight,eUv).rgb;photo=vec3(1.)-exp(-photo*.7);
      c=mix(c,photo,.16*hasDaylight);c=mix(vec3(.91,.945,.94),c,.32+.68*seaWeight);gl_FragColor=vec4(c,1.);}`});
    this.sky=new T.Mesh(g,m);this.sky.renderOrder=-100;this.sky.frustumCulled=false;this.cinematicGroup.add(this.sky);
  }

  private buildLaunchOcean(){
    const g=new T.PlaneGeometry(4400,4400,220,220);g.rotateX(-Math.PI/2);
    const m=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{clock:{value:0},seaWeight:{value:1},cutaway:{value:0},revealCenter:{value:new T.Vector2()}},
      vertexShader:`uniform float clock;varying vec3 wpos;varying vec3 wn;varying float crest;
      void main(){vec3 p=position;float a=.038*p.x+.025*p.z-clock*.72;float b=.089*p.x-.065*p.z-clock*1.12;float c=.24*p.x+.12*p.z-clock*1.94;
      float h=.94*sin(a)+.38*sin(b)+.12*sin(c);p.y+=h;vec2 grad=vec2(.0357*cos(a)+.0338*cos(b)+.0288*cos(c),.0235*cos(a)-.0247*cos(b)+.0144*cos(c));
      wn=normalize(vec3(-grad.x,1.,-grad.y));wpos=(modelMatrix*vec4(p,1.)).xyz;crest=h;gl_Position=projectionMatrix*viewMatrix*vec4(wpos,1.);}`,
      fragmentShader:`uniform float clock;uniform float seaWeight;uniform float cutaway;uniform vec2 revealCenter;varying vec3 wpos;varying vec3 wn;varying float crest;
      void main(){vec3 N=normalize(wn);vec3 V=normalize(cameraPosition-wpos);float fres=pow(1.-max(dot(N,V),0.),4.);vec3 deep=vec3(.018,.12,.165);vec3 sky=vec3(.39,.64,.72);vec3 col=mix(deep,sky,.16+.70*fres);
      vec3 L=normalize(vec3(-.42,.72,-.32));float spec=pow(max(dot(reflect(-L,N),V),0.),130.);col+=vec3(1.,.78,.47)*spec*.68;
      float noise=sin(wpos.x*.9+wpos.z*.71-clock*.6)*sin(wpos.z*1.31-wpos.x*.68);float cap=smoothstep(1.06,1.38,crest)*smoothstep(.0,.6,noise);col=mix(col,vec3(.73,.87,.85),cap*.38);
      col=mix(col,vec3(.65,.77,.78),smoothstep(1000.,2100.,length(cameraPosition-wpos)));col=mix(vec3(.81,.875,.87),col,.26+.74*seaWeight);
      float radius=length(wpos.xz-revealCenter);float window=(1.-smoothstep(72.,132.,radius))*cutaway;float alpha=1.-window*.90;
      gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    this.ocean=new T.Mesh(g,m);this.ocean.frustumCulled=false;this.ocean.name='WaterPro-compatible visual ocean / non-solver';this.cinematicGroup.add(this.ocean);
    this.oceanDepth=new T.Mesh(new T.PlaneGeometry(4400,4400),new T.MeshBasicMaterial({color:'#285362',side:T.DoubleSide}));this.oceanDepth.rotation.x=-Math.PI/2;this.oceanDepth.position.y=-72;this.cinematicGroup.add(this.oceanDepth);
    for(const child of this.scene.children){if(child instanceof T.GridHelper)child.visible=false;if(child instanceof T.Mesh&&child.geometry instanceof T.PlaneGeometry)child.visible=false;}
    for(const light of this.scene.children){if(light instanceof T.DirectionalLight)light.intensity*=.48;if(light instanceof T.HemisphereLight)light.intensity=.7;}
    const key=new T.DirectionalLight('#ffd9af',.82);key.position.set(-200,140,-110);this.scene.add(key);
    this.scene.fog=new T.Fog('#b6cdd2',1500,3500);this.renderer.toneMappingExposure=.99;this.camera.far=2600;this.camera.updateProjectionMatrix();
  }

  /** One spline shared by all semantic scenes. */
  private launchCamera(s:FilmState):Pose{
    const keys:CameraKey[]=[
      {t:0,p:[330,165,765],q:[-28,126,0]},
      {t:2.7,p:[245,107,493],q:[-18,78,0]},
      {t:5.8,p:[155,48,205],q:[6,10,0]},
      {t:8,p:[207,49,187],q:[121,12,0]},
      {t:15.8,p:[194,55,170],q:[127,9,0]},
      {t:19.6,p:[124,84,184],q:[15,20,0]},
      {t:24.8,p:[82,71,155],q:[13,19,7]},
      {t:30.5,p:[-30,75,177],q:[12,19,0]},
      {t:34.5,p:[-232,86,339],q:[0,43,0]},
      {t:38.5,p:[-181,53,222],q:[0,16,0]},
      {t:42,p:[-131,32,126],q:[-69,23,7]},
      {t:46,p:[-133,21,92],q:[-94,18,6]},
      {t:48.3,p:[-145,1,92],q:[-107,-10,8]},
      {t:50.5,p:[-153,39,157],q:[-26,7,5]},
      {t:54,p:[204,51,181],q:[126,10,0]},
      {t:60.8,p:[190,59,170],q:[127,11,0]},
      {t:65.7,p:[240,128,261],q:[126,6,0]},
      {t:70.5,p:[199,106,234],q:[128,6,0]},
      {t:75.8,p:[144,77,223],q:[128,6,0]},
      {t:81,p:[184,57,204],q:[128,5,0]},
      {t:89,p:[146,50,195],q:[128,6,0]},
      {t:94,p:[340,176,730],q:[-36,126,0]},
      {t:99.4,p:[278,143,635],q:[-24,132,0]},
      {t:103.5,p:[263,155,680],q:[-24,130,0]},
      {t:105,p:[332,188,804],q:[-16,139,0]},
    ];return sampleCinematicCamera(keys,s.time);
  }
  cameraPose(s:FilmState):Pose{return this.launchMode?this.launchCamera(s):super.cameraPose(s);}

  /** Presentation trajectory is shared by render and screen-space layout QA. */
  presentationModelPose(time:number){
    if(time>=16.8&&time<=36.4)return{visible:true,x:-380*(1-ramp(time,16.8,19.3))+650*ramp(time,31.1,36.4),y:0,z:0,scale:1};
    if(time>=74.7&&time<=95.2){
      const enter=ramp(time,74.7,78.1),exit=ramp(time,89.65,94.2);
      return{visible:true,x:-320+388*enter-880*exit,y:-6-240*exit,z:2+72*exit,scale:.64};
    }
    return{visible:false,x:-1200,y:-240,z:74,scale:.64};
  }

  /** A delayed lower-left entry keeps the end turbine below proof text until
   * its exit is complete. It reaches the unchanged hero pose at 95 seconds. */
  presentationNativePose(time:number){
    const hero=time<=11,physics=time>=30.3&&time<=55.3,close=time>=91.5;
    let x=0,y=0;
    if(hero)x=-760*ramp(time,6.8,11);
    if(physics)x=760*(1-ramp(time,30.3,35.3))-780*ramp(time,50.5,55.3);
    if(close){x=-740*(1-ramp(time,91.5,95))+125*ramp(time,103.5,105);y=-400*(1-ramp(time,93.5,95));}
    return{visible:hero||physics||close,x,y,z:0,scale:1};
  }

  private buildTopologyAccent(){
    const count=220,positions=new Float32Array(count*3);for(let i=0;i<count;i++){const q=i/count,a=q*Math.PI*12;positions.set([Math.cos(a)*(16+q*23),-19+q*38,Math.sin(a)*(11+q*21)],i*3);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions.slice(),3));this.topologyPoints=new T.Points(g,new T.PointsMaterial({color:'#e0ac71',size:.73,transparent:true,opacity:0,depthWrite:false}));this.topologyPoints.name='Material-path accent / explanatory';this.topologyBase=positions;this.cinematicGroup.add(this.topologyPoints);
  }

  private buildNativeFlow(){
    if(!this.native)return;
    for(let row=0;row<12;row++){
      const base=new Float32Array(120);for(let i=0;i<40;i++){const q=i/39;base.set([-143+q*286,-.3,(row-5.5)*13+Math.sin(q*6.3+row)*4],i*3);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(base.slice(),3));const line=new T.Line(g,new T.LineBasicMaterial({color:'#6bb4bd',transparent:true,opacity:.2,depthWrite:false}));line.name='Visual wave/current trajectory';this.native.group.add(line);this.flowLines.push(line);this.flowBase.push(base);
    }
    for(let row=0;row<9;row++){
      const base=new Float32Array(108);for(let i=0;i<36;i++){const q=i/35,x=-100+q*230,z=(row-4)*6,bend=Math.exp(-Math.pow((x+6)/25,2));base.set([x,60+row*8,z+Math.sign(z||1)*bend*6],i*3);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(base.slice(),3));const line=new T.Line(g,new T.LineBasicMaterial({color:'#99ccd1',transparent:true,opacity:.2,depthWrite:false}));line.name='Illustrated wind path / non-field-output';this.native.group.add(line);this.windLines.push(line);this.windBase.push(base);
    }
    for(let i=0;i<3;i++){const a=new T.ArrowHelper(V(-1,0,0),V(-15,40+i*24,0),12,0xe7ac68,2.8,1.55);a.name='Illustrative wind-load direction';a.userData={illustrative:true,noComputedMagnitude:true};this.native.group.add(a);this.forceArrows.push(a);}
  }

  private updateFlow(time:number){
    const physics=ramp(time,34.6,37)*(1-ramp(time,48.5,51.8)),sea=ramp(time,0,1.7)*(1-ramp(time,6.3,9));const strength=Math.max(physics,sea*.34);
    for(const [row,line]of this.flowLines.entries()){
      line.visible=strength>.003;line.material.opacity=strength*.38;const p=line.geometry.getAttribute('position') as T.BufferAttribute,base=this.flowBase[row];
      for(let i=0;i<p.count;i++){const x=base[i*3],z=base[i*3+2];p.setXYZ(i,x,.95*Math.sin(x*.038+z*.025-time*.72),z+Math.sin(time*.63+i*.14+row)*1.2);}p.needsUpdate=true;
    }
    for(const [row,line]of this.windLines.entries()){
      line.visible=physics>.003;line.material.opacity=physics*.29;const p=line.geometry.getAttribute('position') as T.BufferAttribute,base=this.windBase[row];
      for(let i=0;i<p.count;i++)p.setXYZ(i,base[i*3],base[i*3+1]+Math.sin(time*.8+i*.2+row)*.22,base[i*3+2]);p.needsUpdate=true;
    }
    for(const [i,a]of this.forceArrows.entries()){
      a.visible=physics>.1;const centre=this.native?.getTowerCenter(.18+i*.18);
      if(centre)a.position.copy(centre).add(V(-12,0,0));
      a.setLength(8+physics*13,3,1.6);
    }
  }

  private updateInfo(s:FilmState){
    const callouts:CinematicCallout[]=[],taskNodes:CinematicInfo['taskNodes']=[];
    if(this.native?.group.visible){
      const ids=s.id==='zwind'?['platform-center','fairlead-1','tower-top']:s.id==='hook'||s.id==='close'?['platform-center']:[];
      for(const id of ids){const a=this.native.getCalloutAnchors()[id];if(!a)continue;const p=projectAnchor(this.camera,a.object.getWorldPosition(V()));
        const value=id==='fairlead-1'?`${(this.native.getMooringTension(1)/1000).toFixed(0)} kN`:id==='platform-center'?`pitch ${this.native.info.pitch.toFixed(2)}°`:undefined;
        callouts.push({id,label:id==='fairlead-1'?'系泊张力':id==='tower-top'?'塔筒顶部':a.label,role:a.role,...p,value,tone:id==='fairlead-1'?'#e9b377':'#a5d8d4'});
      }
    }
    for(const node of this.tasks.nodes){const p=projectAnchor(this.camera,node.object.getWorldPosition(V()));taskNodes.push({id:node.id,label:node.label,...p,z:p.depth,visible:p.visible&&this.tasks.group.visible,status:node.status,input:node.input,output:node.output});}
    const pose=this.launchCamera(s);this.info={...this.info,callouts,taskNodes,cameraTarget:{x:pose.target.x,y:pose.target.y,z:pose.target.z}} as CinematicInfo;
  }

  render(s:FilmState){
    if(this.launchMode)this.native?.setVisualOceanTime(s.time,this.ocean?.position.y??0);
    super.render(s);if(!this.launchMode)return;const time=s.time;
    if(this.sky){const direction=V();this.camera.getWorldDirection(direction);this.sky.position.copy(this.camera.position).addScaledVector(direction,1000);this.sky.quaternion.copy(this.camera.quaternion);}
    const heroWeight=1-ramp(time,7.2,11),physicsWeight=ramp(time,30.6,35)*(1-ramp(time,50,55.3)),closeWeight=ramp(time,89.3,94);const seaWeight=Math.max(heroWeight,physicsWeight,closeWeight);
    if(this.sky)this.sky.material.uniforms.seaWeight.value=seaWeight;
    if(this.ocean){this.ocean.position.y=-47*(1-seaWeight);this.ocean.material.uniforms.clock.value=time;this.ocean.material.uniforms.seaWeight.value=seaWeight;this.ocean.material.uniforms.cutaway.value=ramp(time,40.8,43.5)*(1-ramp(time,49,51.7));}
    if(this.oceanDepth)this.oceanDepth.position.y=-75-47*(1-seaWeight);
    for(const child of this.scene.children)if(child instanceof T.Mesh&&child.geometry instanceof T.PlaneGeometry)child.visible=false;
    this.screens.visible=this.chartGroup.visible=this.papers.visible=this.tubeSection.visible=false;
    if(this.native){
      const pose=this.presentationNativePose(time);this.native.group.visible=pose.visible;this.native.sea.visible=false;
      this.native.group.position.set(pose.x,pose.y,pose.z);this.native.group.scale.setScalar(pose.scale);
      this.native.setVisualOceanTime(time,this.ocean?.position.y??0);
      if(time>=34&&time<=52)this.native.setTime(clamp((time-34)/18)*120);else if(time>52&&time<88.8)this.native.setTime(120);else this.native.setTime(0,true);
      if(this.ocean)this.ocean.material.uniforms.revealCenter.value.set(pose.x,pose.z);
    }
    const modelPose=this.presentationModelPose(time);this.model.visible=modelPose.visible;
    this.model.position.set(modelPose.x,modelPose.y,modelPose.z);this.model.scale.setScalar(modelPose.scale);
    if(s.id==='beso')for(const surf of this.surfaces){surf.mesh.material.roughness=.4;surf.mesh.material.metalness=.22;}
    const sourceLoad=ramp(time,20.2,22)*(1-ramp(time,30,31.5));this.loads.visible=sourceLoad>.002;
    if(this.loadArrow){const length=23*sourceLoad;this.loadArrow.position.y=18.95+length;this.loadArrow.setLength(Math.max(.01,length),Math.min(4.6,length*.25),2.3);}
    this.momentLine?.geometry.setDrawRange(0,Math.floor(65*sourceLoad));if(this.momentArrow)this.momentArrow.visible=sourceLoad>.93;
    if(this.topologyPoints&&this.topologyBase){const strength=ramp(time,20.1,23)*(1-ramp(time,30.8,33));this.topologyPoints.visible=strength>.003;this.topologyPoints.material.opacity=strength*.53;this.topologyPoints.position.copy(this.model.position);const p=this.topologyPoints.geometry.getAttribute('position') as T.BufferAttribute;
      for(let i=0;i<p.count;i++){const a=time*.37+i*.03;p.setXYZ(i,this.topologyBase[i*3]+Math.sin(a)*.5,this.topologyBase[i*3+1]+Math.sin(a*.73)*.38,this.topologyBase[i*3+2]+Math.cos(a)*.5);}p.needsUpdate=true;
    }
    this.updateDrawingStage(time);this.updateFlow(time);
    const graphEntry=ramp(time,62.2,66),graphExit=ramp(time,76.8,81.2);this.tasks.group.visible=time>=62.2&&time<=81.2;this.tasks.group.position.set(128+610*(1-graphEntry)+610*graphExit,-21,8+38*graphExit);this.tasks.update(time);
    this.scene.updateMatrixWorld(true);this.updateInfo(s);this.renderer.render(this.scene,this.camera);
  }
}
