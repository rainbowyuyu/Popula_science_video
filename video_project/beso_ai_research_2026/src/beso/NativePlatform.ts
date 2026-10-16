import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {gerstnerHeight} from './WaterProCompat';
import {cinematicOceanHeight} from './CinematicOcean';

type ResponseRecord = {t:number;platform:number[];towerTop:number[];mooringTensionN:number[]};
type NativeModel = {
  nodes:Record<string,number[]>;
  elements:{id:number;from:number;to:number;role:string;diameterM?:number;widthM?:number;heightM?:number}[];
  hub:{radiusM:number;heightM:number;zM:number};
  tower:{baseZM:number;lengthM:number;topNodeId:number;sectionNote?:string};
  rotor:{hubX:number;hubZM:number;bladeLengthM:number;visualizationNote?:string};
  mooringPolylines:{line:number;nativeXYZ:number[][]}[];
};
type NativeResponse = {durationS?:number;records:ResponseRecord[];servoEnabled?:boolean;claimBoundary?:string};
export type NativePlatformInfo = {time:number;surge:number;pitch:number;tension:number};
export type NativeCalloutAnchor = {id:string;label:string;role:string;object:THREE.Object3D};
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const sourceVector=(a:number[])=>V(a[0]??0,a[2]??0,-(a[1]??0));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const clip=(x:number)=>Math.max(0,Math.min(1,x));
const UP=V(0,1,0);
const colorBlue=new THREE.Color('#198495');
const colorHeat=new THREE.Color('#e3b56a');
const colorLoad=new THREE.Color('#d59457');

/**
 * Native 20 MW Zwind source geometry with saved response playback.
 *
 * World coordinates are metres / Y-up: [source x, source z, -source y].
 * The outer `group` belongs to the film: playback never resets its transform.
 * Hull members use native nodes and section dimensions. Tower/airfoil skins are
 * explanatory surfaces around the equivalent beam model, not recovered CAD.
 * Blade azimuth is held still: the saved response does not provide rotor RPM.
 */
export class NativePlatform {
  readonly group=new THREE.Group();
  readonly platform=new THREE.Group();
  readonly sea=new THREE.Group();
  readonly rotor=new THREE.Group();
  readonly nacelle=new THREE.Group();
  /** Named structural parents keep the physical assembly inspectable while
   * preserving one rigid response transform on `platform`. */
  readonly structuralGroups={
    outerColumns:new THREE.Group(),
    innerLegs:new THREE.Group(),
    radialBeams:new THREE.Group(),
    deckDetails:new THREE.Group(),
    moorings:new THREE.Group(),
  };
  /** Empty world anchors used by the cinematic callout layer. They carry no
   * geometry and cannot be mistaken for extra solver members. */
  readonly calloutAnchors:Record<string,NativeCalloutAnchor>={};
  readonly tower:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  info:NativePlatformInfo={time:0,surge:0,pitch:0,tension:0};
  private model:NativeModel;
  private response:NativeResponse;
  private pivot:THREE.Vector3;
  private rigidQuaternion=new THREE.Quaternion();
  private rigidPosition=new THREE.Vector3();
  private topQuaternion=new THREE.Quaternion();
  private towerRings=56;
  private towerSides=40;
  private topRest:THREE.Vector3;
  private towerTopWorld=new THREE.Vector3();
  private towerResidual=new THREE.Vector3();
  private towerCollars:{q:number;mesh:THREE.Mesh<THREE.TorusGeometry,THREE.MeshStandardMaterial>}[]=[];
  private moorings:{mesh:THREE.Mesh<THREE.TubeGeometry,THREE.MeshStandardMaterial>;base:THREE.Vector3[];line:number;points:THREE.Vector3[];fairlead:THREE.Mesh;packet:THREE.Mesh}[]=[];
  /** Display-only float details.  They are attached to the native platform so
   * the response playback moves the entire hydrodynamic assembly together. */
  private waterlineFoam:{mesh:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;a:THREE.Vector3;b:THREE.Vector3;phase:number;base:Float32Array}[]=[];
  private seaSurface?:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  private seaBasePositions?:Float32Array;
  private tensionMax=1;
  private sharedMaterials:THREE.Material[]=[];
  private disposed=false;
  private previousTime=NaN;
  private previousStatic=false;
  private visualOceanTime?:number;
  private visualOceanBaseY=0;
  private previousVisualTime=NaN;
  private previousVisualX=NaN;
  private previousVisualZ=NaN;
  private previousVisualBase=NaN;

  constructor(modelData:NativeModel,responseData:NativeResponse){
    this.model=modelData;this.response=responseData;
    if(!modelData.nodes?.['1']||!responseData.records?.length)throw Error('NativePlatform requires verified native model and response records');
    this.group.name='20 MW native Zwind geometry and response';
    this.group.userData={sourceCoordinates:'metres, source Z-up -> render Y-up',evidenceType:'saved_native_probe',servoEnabled:responseData.servoEnabled,claimBoundary:responseData.claimBoundary,skinNote:'Tower and blade skins illustrative; hull section dimensions and response are native.'};
    this.platform.name='Native platform: rigid motion about node 1';
    this.structuralGroups.outerColumns.name='Structural group / three outer columns';
    this.structuralGroups.innerLegs.name='Structural group / three inner legs';
    this.structuralGroups.radialBeams.name='Structural group / three hub radial beams';
    this.structuralGroups.deckDetails.name='Presentation details / deck, seams, railings';
    this.structuralGroups.moorings.name='Structural group / twelve mooring lines';
    this.platform.add(this.structuralGroups.outerColumns,this.structuralGroups.innerLegs,this.structuralGroups.radialBeams,this.structuralGroups.deckDetails);
    this.pivot=sourceVector(modelData.nodes['1']);
    this.topRest=V(0,modelData.tower.baseZM+modelData.tower.lengthM,0);
    this.group.add(this.platform,this.sea,this.nacelle,this.structuralGroups.moorings);
    // A deeper blue-green palette keeps the native platform readable against
    // the pale cinematic sky.  The materials remain physically based; the
    // contrast is visual design only and does not alter the source response.
    const steel=this.mat('#a5bfc1',.3,.36);
    const outer=this.mat('#246775',.29,.3);
    const leg=this.mat('#779c9e',.31,.27);
    const deck=this.mat('#758b8b',.72,.07);
    const dark=this.mat('#0d3d50',.3,.72);
    for(const el of modelData.elements){
      const a=sourceVector(modelData.nodes[String(el.from)]).sub(this.pivot);
      const b=sourceVector(modelData.nodes[String(el.to)]).sub(this.pivot);
      const direction=b.clone().sub(a),length=direction.length();
      const geometry=el.diameterM&&el.role==='outer_column'
        ?this.makeStreamlinedHull(el.diameterM,length)
        :el.diameterM
          ?new THREE.CylinderGeometry(el.diameterM/2,el.diameterM/2,length,48,1)
        :new THREE.BoxGeometry(el.widthM??1,length,el.heightM??1);
      const material=el.role==='outer_column'?outer:el.role==='inner_leg'?leg:steel;
      const member=new THREE.Mesh(geometry,material);
      member.position.copy(a).add(b).multiplyScalar(.5);
      direction.normalize();
      if(el.diameterM){
        member.quaternion.setFromUnitVectors(UP,direction);
      }else{
        // Width stays horizontal and section height stays vertical for the
        // radial box beams; a generic axis quaternion would roll the section.
        const widthAxis=UP.clone().cross(direction).normalize();
        const heightAxis=widthAxis.clone().cross(direction).normalize();
        member.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(widthAxis,direction,heightAxis));
      }
      member.castShadow=member.receiveShadow=true;
      member.name=`Native member ${el.id} (${el.role})`;
      member.userData={nativeElement:el.id,role:el.role,from:el.from,to:el.to};
      const memberParent=el.role==='outer_column'?this.structuralGroups.outerColumns:el.role==='inner_leg'?this.structuralGroups.innerLegs:this.structuralGroups.radialBeams;
      memberParent.add(member);
      if(el.role==='outer_column')this.registerAnchor(`outer-column-${el.id}`,`外柱 ${el.id}`,'outer_column',memberParent,member.position,{elementId:el.id});
      if(el.role==='inner_leg')this.registerAnchor(`inner-leg-${el.id}`,`内腿 ${el.id}`,'inner_leg',memberParent,member.position,{elementId:el.id});
      if(el.role==='outer_column'&&Math.abs(direction.y)>1e-6){
        // Three quiet, irregular contact streaks replace the complete torus.
        // Foam is a surface cue; it never outlines the whole float like a UI
        // selection ring and never introduces a hydrodynamic result claim.
        const phase=this.waterlineFoam.length*1.9;
        const foam=this.makeContactFoam(el.diameterM!*.52,phase);
        foam.name=`Discontinuous water contact ${el.id}`;foam.renderOrder=5;this.group.add(foam);
        this.waterlineFoam.push({mesh:foam,a:a.clone(),b:b.clone(),phase,base:(foam.geometry.getAttribute('position').array as Float32Array).slice()});
        // Fabricated circumferential seams and a service deck provide a real
        // scale cue. They are surface details, never new calculation members.
        for(const u of [.22,.53,.81]){
          const seam=new THREE.Mesh(new THREE.TorusGeometry(el.diameterM!/2+.025,.065,6,64),dark);
          seam.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
          seam.position.copy(a).lerp(b,u);seam.userData.illustrative=true;this.structuralGroups.deckDetails.add(seam);
        }
        const cap=el.diameterM!/2;
        const serviceDeck=new THREE.Mesh(new THREE.CylinderGeometry(cap+.42,cap+.42,.28,48),deck);
        serviceDeck.quaternion.setFromUnitVectors(UP,direction);serviceDeck.position.copy(a).addScaledVector(direction,-.1);serviceDeck.name=`Column service deck ${el.id}`;serviceDeck.userData.illustrative=true;this.structuralGroups.deckDetails.add(serviceDeck);
        this.addSafetyRailing(cap+.22,serviceDeck.position,direction,dark,el.id);
      }
    }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(modelData.hub.radiusM,modelData.hub.radiusM,modelData.hub.heightM,64),deck);
    hub.position.set(0,modelData.hub.zM-this.pivot.y,0);hub.castShadow=hub.receiveShadow=true;
    hub.name='Native central hub';this.structuralGroups.deckDetails.add(hub);
    this.registerAnchor('hub','中心 hub','hub',this.structuralGroups.deckDetails,hub.position,{radiusM:modelData.hub.radiusM});
    this.registerAnchor('platform-center','三浮筒半潜式','platform',this.structuralGroups.deckDetails,hub.position,{source:'native-model.json'});
    // Quiet engineering detail around the real hub, not extra load-carrying members.
    const ring=new THREE.Mesh(new THREE.TorusGeometry(modelData.hub.radiusM+.08,.13,8,96),dark);
    ring.rotation.x=Math.PI/2;ring.position.y=hub.position.y+modelData.hub.heightM/2+.07;
    ring.userData.illustrative=true;this.structuralGroups.deckDetails.add(ring);
    this.addSafetyRailing(modelData.hub.radiusM-.35,V(0,hub.position.y+modelData.hub.heightM/2,0),UP,dark,0);
    const towerGeometry=this.makeTowerGeometry();
    this.tower=new THREE.Mesh(towerGeometry,this.mat('#c3d1ce',.4,.13));
    this.tower.name='Tower explanatory skin: exact native endpoint displacement';
    this.tower.userData={nativeTopNode:modelData.tower.topNodeId,skinIllustrative:true,note:modelData.tower.sectionNote};
    this.tower.castShadow=this.tower.receiveShadow=true;this.group.add(this.tower);
    this.registerAnchor('tower-base','塔筒基座','tower_base',this.group,this.rigidPosition,{nativeNode:modelData.nodes['1']});
    this.registerAnchor('tower-top','塔筒顶部','tower_top',this.group,this.topRest,{nativeNode:modelData.tower.topNodeId});
    for(const q of [.22,.49,.76,.975]){
      const mesh=new THREE.Mesh(new THREE.TorusGeometry(mix(5.35,3.1,q)+.035,.07,6,48),steel);
      mesh.name='Tower shell weld / flange (illustrative detail)';mesh.userData.illustrative=true;this.group.add(mesh);this.towerCollars.push({q,mesh});
    }
    this.buildRotor();
    this.buildSea();
    for(const row of responseData.records)for(const t of row.mooringTensionN)this.tensionMax=Math.max(this.tensionMax,t);
    this.buildMoorings();
    this.setTime(0,true);
  }

  private mat(color:string,roughness:number,metalness:number){
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});
    this.sharedMaterials.push(material);return material;
  }

  private registerAnchor(id:string,label:string,role:string,parent:THREE.Object3D,position:THREE.Vector3,userData:Record<string,unknown>={}){
    const object=new THREE.Object3D();
    object.name=`Callout anchor / ${id}`;
    object.position.copy(position);
    object.userData={anchorId:id,label,role,...userData};
    parent.add(object);
    this.calloutAnchors[id]={id,label,role,object};
    return object;
  }

  getCalloutAnchors():Readonly<Record<string,NativeCalloutAnchor>>{return this.calloutAnchors;}

  /** Refined Blender fairing is a local, fully separate presentation skin.
   * Native member positions, sections and saved response stay unchanged. */
  async loadPresentationNacelle(url:string){
    const asset=await new GLTFLoader().loadAsync(url);
    if(this.disposed)return;
    for(const child of [...this.nacelle.children])if(child!==this.rotor){
      this.nacelle.remove(child);
      child.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    }
    asset.scene.name='Blender fabricated nacelle skin / illustrative';
    asset.scene.userData={illustrative:true,solverGeometry:false,source:url};
    asset.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])this.sharedMaterials.push(m);}});
    this.nacelle.add(asset.scene);
  }

  /** Current interpolated display line, not a recovered full cable solution. */
  getMooringPath(line:number):readonly THREE.Vector3[]{return this.moorings.find(m=>m.line===line)?.points??[];}
  getMooringTension(line:number):number{return Number(this.moorings.find(m=>m.line===line)?.mesh.userData.tensionN??0);}
  /** Film wave clock is independent of physical response playback time. */
  setVisualOceanTime(seconds:number,baseY=0){this.visualOceanTime=seconds;this.visualOceanBaseY=baseY;}
  /** Centre of the saved-endpoint-constrained display tower shell. */
  getTowerCenter(fraction:number){
    const row=Math.round(clip(fraction)*this.towerRings),positions=this.tower.geometry.getAttribute('position') as THREE.BufferAttribute,center=V();
    for(let j=0;j<this.towerSides;j++)center.add(V(positions.getX(row*(this.towerSides+1)+j),positions.getY(row*(this.towerSides+1)+j),positions.getZ(row*(this.towerSides+1)+j)));
    return center.divideScalar(this.towerSides);
  }

  private makeContactFoam(radius:number,phase:number){
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    const arcs=[{start:-1.05,span:.48,width:.27},{start:.04,span:.66,width:.39},{start:1.16,span:.37,width:.21}];
    const samples=28;
    for(let a=0;a<arcs.length;a++){
      const arc=arcs[a],offset=positions.length/3;
      for(let i=0;i<=samples;i++){
        const q=i/samples,angle=arc.start+q*arc.span;
        const wobble=.11*Math.sin(angle*13+phase)+.06*Math.sin(angle*31-phase);
        const width=arc.width*(.65+.35*Math.sin(Math.PI*q))*(1+.16*Math.sin(q*17+a));
        for(const edge of [-1,1]){
          const r=radius+.08+a*.07+wobble+edge*width;
          positions.push(Math.cos(angle)*r,0,Math.sin(angle)*r);uvs.push(q,(edge+1)/2);
        }
        if(i<samples){const j=offset+i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{clock:{value:0},phase:{value:phase},alpha:{value:.16}},
      vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float clock;uniform float phase;uniform float alpha;varying vec2 vUv;
        void main(){float edge=smoothstep(0.,.28,vUv.y)*(1.-smoothstep(.66,1.,vUv.y));float end=smoothstep(0.,.18,vUv.x)*(1.-smoothstep(.75,1.,vUv.x));float fleck=.68+.32*sin(vUv.x*36.+phase-clock*.45);float a=alpha*edge*end*fleck;if(a<.004)discard;gl_FragColor=vec4(vec3(.72,.84,.85),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`});
    this.sharedMaterials.push(material);return new THREE.Mesh(geometry,material);
  }

  private addSafetyRailing(radius:number,center:THREE.Vector3,normal:THREE.Vector3,material:THREE.MeshStandardMaterial,id:number){
    const group=new THREE.Group();group.position.copy(center);
    // The deck normal points outwards; member axes were generated from their
    // upper node to their lower node and therefore need the opposite sign.
    const deckUp=normal.y<0?normal.clone().negate():normal;
    group.quaternion.setFromUnitVectors(UP,deckUp);group.name=`Service railing ${id} (illustrative scale detail)`;group.userData.illustrative=true;
    for(const height of [.65,1.18]){
      const rail=new THREE.Mesh(new THREE.TorusGeometry(radius,.055,5,64),material);rail.rotation.x=Math.PI/2;rail.position.y=height;group.add(rail);
    }
    const postGeometry=new THREE.CylinderGeometry(.055,.055,1.2,5);
    for(let i=0;i<20;i++){
      const a=i/20*Math.PI*2,post=new THREE.Mesh(postGeometry,material);post.position.set(Math.cos(a)*radius,.6,Math.sin(a)*radius);group.add(post);
    }
    this.structuralGroups.deckDetails.add(group);
  }

  /**
   * Low-poly-friendly streamlined hull skin, aligned to the local Y axis.
   * The endpoints retain a small rounded shoulder instead of the hard cut of
   * a cylinder, which reads as a fabricated floater when the camera glides
   * past the waterline.  The overall length and maximum diameter are still
   * taken from the native member dimensions.
   */
  private makeStreamlinedHull(diameter:number,length:number){
    const radius=diameter*.5,half=length*.5;
    const bevel=Math.min(.65,length*.03);
    const profile=[new THREE.Vector2(0,-half),new THREE.Vector2(radius*.96,-half),new THREE.Vector2(radius,-half+bevel),new THREE.Vector2(radius,half-bevel),new THREE.Vector2(radius*.96,half),new THREE.Vector2(0,half)];
    const geometry=new THREE.LatheGeometry(profile,48,0,Math.PI*2);
    geometry.computeVertexNormals();
    return geometry;
  }

  private makeTowerGeometry(){
    const positions=new Float32Array((this.towerRings+1)*(this.towerSides+1)*3);
    const indices:number[]=[];
    for(let r=0;r<this.towerRings;r++)for(let j=0;j<this.towerSides;j++){
      const a=r*(this.towerSides+1)+j,b=a+this.towerSides+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(indices);
    return g;
  }

  private makeBlade(length:number){
    const spanSteps=56,sectionSteps=24,points:number[]=[],indices:number[]=[];
    for(let i=0;i<=spanSteps;i++){
      const q=i/spanSteps;
      const chord=q<.13?mix(2.4,7.1,q/.13):mix(7.1,.22,Math.pow((q-.13)/.87,.85));
      const twist=(1-q)*.23;
      for(let j=0;j<sectionSteps;j++){
        const theta=2*Math.PI*j/sectionSteps;
        const u=(1-Math.cos(theta))/2;
        // Closed NACA-like section: smooth thickness and tapered swept planform.
        const thick=5*.15*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u);
        const tangential=(u-.28)*chord;
        const axial=Math.sign(Math.sin(theta))*thick*chord;
        const x=axial*Math.cos(twist)+tangential*Math.sin(twist)-3.5*q*q;
        const z=tangential*Math.cos(twist)-axial*Math.sin(twist)+3*q*q*q;
        points.push(x,3.2+q*length,z);
      }
    }
    for(let i=0;i<spanSteps;i++)for(let j=0;j<sectionSteps;j++){
      const a=i*sectionSteps+j,b=i*sectionSteps+(j+1)%sectionSteps,c=a+sectionSteps,d=b+sectionSteps;
      indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();
    return g;
  }

  private buildRotor(){
    const bodyMat=this.mat('#d6dfda',.4,.09),trim=this.mat('#3b6873',.43,.32);
    // A manufactured nacelle silhouette, with a clear upwind hub clearance.
    // Its fairing begins behind the native rotor plane; the previous capsule
    // overlapped that plane and visually swallowed the blade roots.
    const body=new THREE.Mesh(new RoundedBoxGeometry(13.8,5.4,5.8,3,.62),bodyMat);
    body.position.set(7.6,1.65,0);body.castShadow=true;
    body.name='Nacelle explanatory skin';this.nacelle.add(body);
    const roof=new THREE.Mesh(new RoundedBoxGeometry(7.6,.75,4.6,2,.18),bodyMat);roof.position.set(7.2,4.47,0);roof.castShadow=true;this.nacelle.add(roof);
    const ventGeometry=new THREE.BoxGeometry(.1,2.25,3.7);
    for(let i=0;i<7;i++){
      const vent=new THREE.Mesh(ventGeometry,trim);vent.position.set(14.55,-.05+i*.38,0);vent.scale.set(1,.042,1);vent.name='Nacelle rear cooling grille';this.nacelle.add(vent);
    }
    const seam=new THREE.Mesh(new THREE.BoxGeometry(.055,4.35,5.86),trim);seam.position.set(10.8,1.4,0);this.nacelle.add(seam);
    const underside=new THREE.Mesh(new THREE.CylinderGeometry(3.05,3.7,1.5,40),trim);
    underside.position.y=.3;this.nacelle.add(underside);
    this.rotor.position.set(this.model.rotor.hubX,this.model.rotor.hubZM-this.topRest.y,0);
    this.rotor.name='Static rotor airfoil skins (no native RPM channel)';
    this.rotor.userData={illustrative:true,bladeLengthM:this.model.rotor.bladeLengthM,rotorRotation:'Not synthesized; saved response has no rotor azimuth channel.'};
    const spinner=new THREE.Mesh(new THREE.SphereGeometry(3.7,32,24),bodyMat);
    spinner.scale.set(1.8,1,1);spinner.position.x=-2.2;spinner.castShadow=true;this.rotor.add(spinner);
    const bladeGeometry=this.makeBlade(this.model.rotor.bladeLengthM);
    // A quiet cool-grey blade coat keeps the narrow airfoil silhouette legible
    // against the film's pale sky without changing any span or section size.
    // Offshore blade coating is a matte dielectric, not brushed metal.
    // A slightly warm grey avoids a glowing white cut-out against overcast sky.
    const bladeMat=this.mat('#829fa8',.48,.025);
    for(let i=0;i<3;i++){
      const blade=new THREE.Mesh(bladeGeometry,bladeMat);
      blade.rotation.x=i*Math.PI*2/3+.12;blade.castShadow=blade.receiveShadow=true;
      blade.name=`Illustrative airfoil blade ${i+1}`;this.rotor.add(blade);
    }
    this.nacelle.add(this.rotor);
  }

  private buildSea(){
    this.sea.name='Semitransparent sea level reference (environment illustration)';
    this.sea.userData={illustrative:true,nativeFluidField:false,levelM:0};
    const segments=96,rings=10,radius=172,positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const c=new THREE.Color();
    for(let r=0;r<=rings;r++)for(let j=0;j<=segments;j++){
      const angle=j/segments*Math.PI*2,d=r/rings*radius;
      positions.push(Math.cos(angle)*d,0,Math.sin(angle)*d);
      c.set('#397f92').lerp(new THREE.Color('#b8dce2'),Math.pow(r/rings,2.2));colors.push(c.r,c.g,c.b);
    }
    for(let r=0;r<rings;r++)for(let j=0;j<segments;j++){
      const a=r*(segments+1)+j,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({vertexColors:true,transparent:true,opacity:.34,roughness:.22,metalness:.18,side:THREE.DoubleSide,depthWrite:false});
    this.sharedMaterials.push(material);const water=new THREE.Mesh(geometry,material);water.renderOrder=2;this.sea.add(water);this.seaSurface=water;this.seaBasePositions=new Float32Array(positions);
    // Sparse glints locate the free surface while allowing the submerged members to read.
    const glintMaterial=new THREE.LineBasicMaterial({color:'#5dabb8',transparent:true,opacity:.34,depthWrite:false});this.sharedMaterials.push(glintMaterial);
    for(let i=0;i<4;i++){
      const pts=[];for(let j=0;j<=64;j++){const a=j/64*Math.PI*1.14+.55+i*.07;const r=72+i*20;pts.push(V(Math.cos(a)*r,.04,Math.sin(a)*r));}
      this.sea.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),glintMaterial));
    }
  }

  private buildMoorings(){
    for(const source of this.model.mooringPolylines){
      // Keep the original anchor as well as the fairlead. Camera framing and
      // ocean depth may hide the distant span; no cropped point is called an
      // anchor and no new cable length is substituted for native coordinates.
      const base=source.nativeXYZ.map(sourceVector);
      if(base.length<2)continue;
      const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(base),Math.max(24,base.length*4),.22,6,false);
      const material=new THREE.MeshStandardMaterial({color:'#317e8e',roughness:.4,metalness:.4,transparent:true,opacity:.82,emissive:'#0a2830',emissiveIntensity:.02});this.sharedMaterials.push(material);
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`Native mooring line ${source.line}, complete native anchor-to-fairlead path`;
      mesh.userData={sourceLine:source.line,nativePolyline:true,distantPartCropped:false,shapeBetweenRecordedPoints:'smooth display interpolation; dynamic intermediate shape is not a cable-solver output'};
      // Display-size fittings and travelling markers make the line-to-body
      // attachment readable. Their colour is bound to saved tension; marker
      // travel is explanatory and never implies a solved force-wave speed.
      const fitting=new THREE.Mesh(new THREE.TorusGeometry(.85,.2,8,24),this.mat('#bbcbc8',.29,.72));
      fitting.name=`Fairlead visual fitting ${source.line}`;fitting.userData.illustrative=true;
      const packet=new THREE.Mesh(new THREE.SphereGeometry(.66,12,8),new THREE.MeshBasicMaterial({color:'#e5b069',transparent:true,opacity:0,depthWrite:false}));
      packet.name=`Saved tension highlight ${source.line}`;packet.userData={illustrative:true,physicalValue:'saved fairlead tension; path interpolation only'};
      this.group.add(fitting,packet);
      this.moorings.push({mesh,base,line:source.line,points:base,fairlead:fitting,packet});this.structuralGroups.moorings.add(mesh);
      const fairlead=base[base.length-1];
      this.registerAnchor(`fairlead-${source.line}`,`系泊 ${source.line} fairlead`,'fairlead',this.group,fairlead,{line:source.line});
      this.registerAnchor(`anchor-${source.line}`,`锚点 ${source.line}`,'anchor',this.group,base[0],{line:source.line});
    }
  }

  /** Compress the long-tailed tension range into a stable visual scale. The
   * source remains in Newtons; this mapping only improves legibility of the
   * display heat colour when one line carries most of the load. */
  private tensionVisual(tensionN:number){
    const ratio=clip(tensionN/Math.max(1,this.tensionMax));
    const logRatio=Math.log1p(9*ratio)/Math.log(10);
    return logRatio*logRatio*(3-2*logRatio);
  }

  private sample(seconds:number):ResponseRecord{
    const records=this.response.records;
    const t=Math.max(records[0].t,Math.min(records[records.length-1].t,seconds));
    let lo=0,hi=records.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(records[mid].t<=t)lo=mid;else hi=mid;}
    const a=records[lo],b=records[hi],q=clip((t-a.t)/Math.max(1e-9,b.t-a.t));
    const blend=(x:number[],y:number[])=>x.map((v,i)=>mix(v,y[i]??v,q));
    return {t,platform:blend(a.platform,b.platform),towerTop:blend(a.towerTop,b.towerTop),mooringTensionN:blend(a.mooringTensionN,b.mooringTensionN)};
  }

  private quaternionFromNativeRotation(d:number[]){
    const vector=V(d[3]??0,d[5]??0,-(d[4]??0));
    const angle=vector.length();
    return angle>1e-12?new THREE.Quaternion().setFromAxisAngle(vector.multiplyScalar(1/angle),angle):new THREE.Quaternion();
  }

  /** `staticPose=true` is an undeformed establishing shot; response is otherwise 1:1. */
  setTime(seconds:number,staticPose=false){
    if(this.disposed)return;
    const row=staticPose?{t:0,platform:[0,0,0,0,0,0],towerTop:[0,0,0,0,0,0],mooringTensionN:Array(12).fill(0)}:this.sample(seconds);
    const waveTime=this.visualOceanTime??(staticPose?0:seconds*.72);
    const waveHeight=(x:number,z:number)=>this.visualOceanTime===undefined?gerstnerHeight(x,z,waveTime):this.visualOceanBaseY+cinematicOceanHeight(x+this.group.position.x,z+this.group.position.z,waveTime);
    // WaterProCompat-style Gerstner display pass.  It is intentionally
    // separate from the native platform/response pose: the saved response
    // remains the only source for the rigid-body motion and mooring tension.
    if(this.seaSurface&&this.seaBasePositions){
      const position=this.seaSurface.geometry.getAttribute('position') as THREE.BufferAttribute;
      for(let i=0;i<position.count;i++){
        const x=this.seaBasePositions[i*3],z=this.seaBasePositions[i*3+2];
        position.setY(i,waveHeight(x,z));
      }
      position.needsUpdate=true;this.seaSurface.geometry.computeVertexNormals();
    }
    if(row.t===this.previousTime&&staticPose===this.previousStatic&&waveTime===this.previousVisualTime&&this.group.position.x===this.previousVisualX&&this.group.position.z===this.previousVisualZ&&this.visualOceanBaseY===this.previousVisualBase)return;
    this.previousTime=row.t;this.previousStatic=staticPose;this.previousVisualTime=waveTime;
    this.previousVisualX=this.group.position.x;this.previousVisualZ=this.group.position.z;this.previousVisualBase=this.visualOceanBaseY;
    this.rigidQuaternion.copy(this.quaternionFromNativeRotation(row.platform));
    this.rigidPosition.copy(this.pivot).add(sourceVector(row.platform));
    this.platform.position.copy(this.rigidPosition);this.platform.quaternion.copy(this.rigidQuaternion);
    // Each contact streak hugs the local wave surface instead of remaining a
    // rigid horizontal band. Mechanical response is still read only from data.
    for(const foam of this.waterlineFoam){
      const a=foam.a.clone().applyQuaternion(this.rigidQuaternion).add(this.rigidPosition),b=foam.b.clone().applyQuaternion(this.rigidQuaternion).add(this.rigidPosition);
      const center=a.clone().lerp(b,clip(-a.y/(b.y-a.y)));
      foam.mesh.position.set(center.x,0,center.z);
      const points=foam.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for(let i=0;i<points.count;i++){
        const x=foam.base[i*3],z=foam.base[i*3+2];
        points.setY(i,waveHeight(center.x+x,center.z+z)+.045);
      }
      points.needsUpdate=true;foam.mesh.geometry.computeBoundingSphere();
      foam.mesh.material.uniforms.clock.value=waveTime;
      foam.mesh.material.uniforms.alpha.value=.115+.028*Math.sin(waveTime*.63+foam.phase);
    }
    this.towerTopWorld.copy(this.topRest).add(sourceVector(row.towerTop));
    const predictedTop=this.topRest.clone().sub(this.pivot).applyQuaternion(this.rigidQuaternion).add(this.rigidPosition);
    this.towerResidual.copy(this.towerTopWorld).sub(predictedTop);
    const direction=UP.clone().applyQuaternion(this.rigidQuaternion);
    this.topQuaternion.copy(this.quaternionFromNativeRotation(row.towerTop));
    const topDirection=UP.clone().applyQuaternion(this.topQuaternion);
    const positions=this.tower.geometry.getAttribute('position') as THREE.BufferAttribute;
    const length=this.model.tower.lengthM;
    for(let r=0;r<=this.towerRings;r++){
      const q=r/this.towerRings,q2=q*q,q3=q2*q;
      // Hermite reconstruction satisfies both native endpoint translations and
      // endpoint rotations. It adds no second copy of the rigid-body motion.
      const center=this.rigidPosition.clone().multiplyScalar(2*q3-3*q2+1)
        .addScaledVector(direction,length*(q3-2*q2+q))
        .addScaledVector(this.towerTopWorld,-2*q3+3*q2)
        .addScaledVector(topDirection,length*(q3-q2));
      const tangent=this.rigidPosition.clone().multiplyScalar(6*q2-6*q)
        .addScaledVector(direction,length*(3*q2-4*q+1))
        .addScaledVector(this.towerTopWorld,-6*q2+6*q)
        .addScaledVector(topDirection,length*(3*q2-2*q)).normalize();
      const rotation=new THREE.Quaternion().setFromUnitVectors(UP,tangent);
      // The source has equivalent stiffness, not a shell CAD radius distribution.
      const radius=mix(5.35,3.1,q);
      for(let j=0;j<=this.towerSides;j++){
        const angle=j/this.towerSides*Math.PI*2;
        const p=V(Math.cos(angle)*radius,0,Math.sin(angle)*radius).applyQuaternion(rotation).add(center);
        positions.setXYZ(r*(this.towerSides+1)+j,p.x,p.y,p.z);
      }
    }
    positions.needsUpdate=true;this.tower.geometry.computeVertexNormals();this.tower.geometry.computeBoundingSphere();
    this.nacelle.position.copy(this.towerTopWorld);this.nacelle.quaternion.copy(this.topQuaternion);
    const towerBaseAnchor=this.calloutAnchors['tower-base'];
    const towerTopAnchor=this.calloutAnchors['tower-top'];
    if(towerBaseAnchor)towerBaseAnchor.object.position.copy(this.rigidPosition);
    if(towerTopAnchor)towerTopAnchor.object.position.copy(this.towerTopWorld);
    for(const collar of this.towerCollars){
      const q=collar.q,q2=q*q,q3=q2*q;
      const center=this.rigidPosition.clone().multiplyScalar(2*q3-3*q2+1).addScaledVector(direction,length*(q3-2*q2+q)).addScaledVector(this.towerTopWorld,-2*q3+3*q2).addScaledVector(topDirection,length*(q3-q2));
      const tangent=this.rigidPosition.clone().multiplyScalar(6*q2-6*q).addScaledVector(direction,length*(3*q2-4*q+1)).addScaledVector(this.towerTopWorld,-6*q2+6*q).addScaledVector(topDirection,length*(3*q2-2*q)).normalize();
      collar.mesh.position.copy(center);collar.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);
    }
    for(const m of this.moorings){
      const end=m.base[m.base.length-1];
      const target=end.clone().sub(this.pivot).applyQuaternion(this.rigidQuaternion).add(this.rigidPosition);
      const delta=target.clone().sub(end);
      const points=m.base.map((point,i)=>{const q=i/(m.base.length-1);return point.clone().addScaledVector(delta,q*q*(3-2*q));});
      m.points=points;
      const curve=new THREE.CatmullRomCurve3(points);
      const geometry=new THREE.TubeGeometry(curve,Math.max(24,points.length*4),.22,6,false);
      m.mesh.geometry.dispose();m.mesh.geometry=geometry;
      const tension=row.mooringTensionN[m.line-1]??0;
      const visual=this.tensionVisual(tension);
      // Three-stop colour ramp keeps low loads visible without allowing one
      // outlier to flatten every other line to the same blue.
      const ramp=visual<.58
        ?colorBlue.clone().lerp(colorHeat,visual/.58)
        :colorHeat.clone().lerp(colorLoad,(visual-.58)/.42);
      m.mesh.material.color.copy(ramp);
      m.mesh.material.emissive.copy(ramp).multiplyScalar(.035+.095*visual);
      m.mesh.material.emissiveIntensity=.35+.75*visual;
      m.mesh.material.opacity=.68+.26*visual;
      m.mesh.userData.tensionN=tension;m.mesh.userData.tensionVisual=visual;m.mesh.userData.displayMapping='log1p normalized source Newtons';
      const fairlead=this.calloutAnchors[`fairlead-${m.line}`];
      if(fairlead)fairlead.object.position.copy(target);
      m.fairlead.position.copy(target);m.fairlead.quaternion.setFromUnitVectors(V(0,0,1),points[points.length-2].clone().sub(target).normalize());
      m.packet.position.copy(curve.getPoint(.83+((seconds*.046+m.line*.051)%1)*.16));
      (m.packet.material as THREE.MeshBasicMaterial).color.copy(ramp);
      (m.packet.material as THREE.MeshBasicMaterial).opacity=staticPose?0:.3+.52*visual;
      m.packet.visible=!staticPose;
    }
    this.info={time:row.t,surge:row.platform[0]??0,pitch:(row.platform[4]??0)*180/Math.PI,tension:Math.max(0,...row.mooringTensionN)};
  }

  dispose(){
    if(this.disposed)return;this.disposed=true;
    const geometries=new Set<THREE.BufferGeometry>();
    this.group.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line)geometries.add(object.geometry);});
    geometries.forEach(g=>g.dispose());new Set(this.sharedMaterials).forEach(m=>m.dispose());this.group.clear();
  }
}

