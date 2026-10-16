import * as THREE from 'three';
import {
  AIR,
  SPECTRUM,
  OpticalPath,
  findPrimaryExtremum,
  findSecondaryExtremum,
  rainbowAngleFor,
  tracePrimary,
  traceSecondary,
  refractBoundary,
  verifyPath,
} from './optics';
import {timeline} from './Timeline';

export type OpticsState = {
  scene: string;
  progress: number;
  time: number;
  line: number;
  lineProgress: number;
  frame: number;
  sceneStart: number;
  sceneEnd: number;
};

const DROP_CENTER = new THREE.Vector3(32, 2.6, 0);
const DROP_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
const OBSERVER = new THREE.Vector3(0, 1.5, 7);
const ANTI_SOLAR = new THREE.Vector3(0, -Math.sin(THREE.MathUtils.degToRad(12)), -Math.cos(THREE.MathUtils.degToRad(12))).normalize();
const SUN = OBSERVER.clone().addScaledVector(ANTI_SOLAR, -12);
const DROP_RADIUS = 1.6;
const C = {
  ink: '#153d43',
  teal: '#168b91',
  water: '#8dcad3',
  gold: '#efb54c',
  cloud: '#d7e7e8',
  axis: '#40777e',
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const smooth = (n: number) => { const x = clamp(n); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clipAt=(id:string)=>timeline.clips.find(c=>c.id===id);
const clipProgress=(id:string,frame:number)=>{const c=clipAt(id);return c?clamp((frame-c.start)/Math.max(1,c.duration)):0;};
const between=(frame:number,start:number,end:number)=>smooth((frame-start)/Math.max(1,end-start));
const valueAt=(frame:number,keys:[number,number][])=>{if(frame<=keys[0][0])return keys[0][1];for(let i=0;i<keys.length-1;i++)if(frame<keys[i+1][0])return mix(keys[i][1],keys[i+1][1],between(frame,keys[i][0],keys[i+1][0]));return keys.at(-1)![1];};

/** Parent camera can apply the same lift while keeping rain/terrain fixed. */
export function sampleOutdoorTransform(frame:number){
 const a=clipAt('r032'),b=clipAt('r033'),c=clipAt('r034'),end=clipAt('r037');
 const lift=a&&b&&c?11.5*between(frame,a.start,a.start+90)*(1-between(frame,b.end-15,b.end+75)):0;
 const p=clipProgress('r031',frame),sun=frame>=(clipAt('r031')?.start??Infinity)&&frame<(clipAt('r032')?.start??0)?(p<.3?mix(12,3,smooth(p/.3)):p<.75?mix(3,32,smooth((p-.3)/.45)):mix(32,12,smooth((p-.75)/.25))):12;
 const shift=c&&end?2.2*between(frame,c.start,(clipAt('r035')?.end??c.end))*(1-between(frame,end.start,end.end)):0;
 const axis=vec(0,-Math.sin(THREE.MathUtils.degToRad(sun)),-Math.cos(THREE.MathUtils.degToRad(sun)));
 const eye=OBSERVER.clone().add(vec(shift,lift,0)),quaternion=new THREE.Quaternion().setFromUnitVectors(ANTI_SOLAR,axis);
 return {eye,lift,shift,sunElevationDeg:sun,axis,quaternion};
}

function material(color: THREE.ColorRepresentation, opacity = 1, emissive = color, roughness = .34): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({color, roughness, metalness: .03, emissive, emissiveIntensity: opacity > .5 ? .18 : .08, transparent: opacity < 1, opacity, depthWrite: opacity > .7});
  m.userData.baseOpacity = opacity;
  return m;
}

function basicMaterial(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false});
  m.userData.baseOpacity = opacity;
  return m;
}

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, m: THREE.Material): THREE.Mesh<THREE.CylinderGeometry, THREE.Material> {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 12, 1, false), m);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.castShadow = true;
  return mesh;
}

function sphereAt(p: THREE.Vector3, r: number, m: THREE.Material, segments = 12): THREE.Mesh<THREE.SphereGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segments, Math.max(8, Math.floor(segments * .7))), m);
  mesh.position.copy(p);
  mesh.castShadow = true;
  return mesh;
}

function moveCylinder(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(vec(0,1,0),d.clone().normalize());mesh.scale.y=d.length()/(mesh.geometry as THREE.CylinderGeometry).parameters.height;}

function setAlpha(root: THREE.Object3D, factor: number) {
  root.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const item of Array.isArray(m) ? m : [m]) {
      const anyM = item as THREE.Material & {userData: {baseOpacity?: number}; opacity?: number};
      if (typeof anyM.opacity === 'number') {
        if (anyM.userData.baseOpacity === undefined) anyM.userData.baseOpacity = anyM.opacity;
        anyM.opacity = (anyM.userData.baseOpacity ?? 1) * factor;
        const transparent=anyM.opacity<1;
        if(anyM.transparent!==transparent){anyM.transparent=transparent;anyM.needsUpdate=true;}
      }
    }
  });
}

class PolylinePath {
  readonly group = new THREE.Group();
  private readonly segments: THREE.Mesh[] = [];
  private readonly nodes: THREE.Mesh[] = [];
  private readonly baseOpacity: number;
  private points:THREE.Vector3[];
  constructor(points: THREE.Vector3[], color: string, width = .075, opacity = .94) {
    this.baseOpacity = opacity;
    this.points=points.map(p=>p.clone());
    const lineMaterial = basicMaterial(color, opacity);
    const nodeMaterial = basicMaterial(color, opacity);
    for (let i = 0; i < points.length - 1; i++) {
      const mesh = cylinderBetween(points[i], points[i + 1], width, lineMaterial.clone());
      (mesh.material as THREE.Material).userData.baseOpacity = opacity;
      this.segments.push(mesh);
      this.group.add(mesh);
    }
    for (const point of points.slice(1, -1)) {
      const node = sphereAt(point, width * 1.24, nodeMaterial.clone(), 10);
      (node.material as THREE.Material).userData.baseOpacity = opacity;
      this.nodes.push(node);
      this.group.add(node);
    }
    this.group.userData.pathPoints = points.map(p => p.toArray());
  }
  update(progress: number, alpha = 1, highlight = 1) {
    const q = clamp(progress);
    const total = this.segments.length;
    this.segments.forEach((mesh, i) => {
      const local = clamp(q * total - i);
      const a = this.baseOpacity * alpha * smooth(local*8) * highlight;
      (mesh.material as THREE.Material & {opacity: number}).opacity = a;
      mesh.visible = a > .006;
      const from=this.points[i],to=this.points[i+1],length=from.distanceTo(to),height=(mesh.geometry as THREE.CylinderGeometry).parameters.height;
      mesh.position.copy(from).lerp(to,local*.5);mesh.scale.y=Math.max(.00001,length*local/height);
    });
    this.nodes.forEach((mesh, i) => {
      const local = clamp(q * total - (i + .5));
      const a = this.baseOpacity * alpha * smooth(local) * highlight;
      (mesh.material as THREE.Material & {opacity: number}).opacity = a;
      mesh.visible = a > .006;
    });
  }
  setPoints(points:THREE.Vector3[]){
    if(points.length!==this.segments.length+1)return;
    this.points=points.map(p=>p.clone());
    this.segments.forEach((mesh,i)=>{const d=points[i+1].clone().sub(points[i]),g=mesh.geometry as THREE.CylinderGeometry;mesh.position.copy(points[i]).add(points[i+1]).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(vec(0,1,0),d.clone().normalize());mesh.scale.y=d.length()/g.parameters.height;});
    this.nodes.forEach((mesh,i)=>mesh.position.copy(points[i+1]));
  }
  dispose() {
    this.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
    });
  }
}

type RainDrop = {mesh: THREE.Mesh; angleDeg: number; colorIndex: number; distance: number};

/**
 * Shared 3D optical stage.  Geometry never changes world coordinates when a
 * scene changes: the film camera travels between this drop laboratory and the
 * outdoor observer geometry.  All animation is a pure function of OpticsState.
 */
export class OpticsWorld {
  readonly group = new THREE.Group();
  readonly anchors = {
    dropCenter: DROP_CENTER.clone(),
    dropRadius: DROP_RADIUS,
    observer: OBSERVER.clone(),
    sun: SUN.clone(),
    antiSolarAxis: ANTI_SOLAR.clone(),
    primaryAnglesDeg: {} as Record<string, number>,
    secondaryAnglesDeg: {} as Record<string, number>,
  };

  private readonly dropGroup = new THREE.Group();
  private readonly outdoorGroup = new THREE.Group();
  private readonly rainGroup = new THREE.Group();
  private readonly coneGroup = new THREE.Group();
  private readonly ringGroup = new THREE.Group();
  private readonly secondaryRingGroup = new THREE.Group();
  private readonly eyeAngleGroup = new THREE.Group();
  private readonly scanningSight=new THREE.Group();
  private scanSightRay!:THREE.Mesh;
  private scanSightDrop!:THREE.Mesh;
  private readonly friendSight=new THREE.Group();
  private friendEye!:THREE.Mesh;
  private friendRay!:THREE.Mesh;
  private friendDrop!:THREE.Mesh;
  private sunEyeLine!:THREE.Mesh;
  private readonly darkBandGroup = new THREE.Group();
  private readonly observerRig=new THREE.Group();
  private readonly coneRig=new THREE.Group();
  private readonly ringRig=new THREE.Group();
  private readonly sunRig=new THREE.Group();
  private readonly originalLabels:Record<string,THREE.Vector3>={};
  private transmittedBranch!:PolylinePath;
  private incomingWhite!:PolylinePath;
  private observationPlatform=new THREE.Group();
  private platformColumn!:THREE.Mesh;
  private sprayRig=new THREE.Group();
  private sprayDrops!:THREE.InstancedMesh;
  private lastOutdoorSelection='';
  private dynamicCircleLift=0;
  private dynamicEyeShift=0;
  private dynamicSunElevation=12;
  readonly labelAnchors: Record<string, THREE.Vector3> = {};
  private photons: {mesh: THREE.Mesh; points: THREE.Vector3[]; secondary: boolean;name:string;color:string}[] = [];
  private readonly dropPaths: {name: string; path: OpticalPath; visual: PolylinePath; angleDeg: number}[] = [];
  private readonly secondaryPaths: {name: string; path: OpticalPath; visual: PolylinePath}[] = [];
  private readonly rainDrops: RainDrop[] = [];
  private rainInstances:{mesh:THREE.InstancedMesh;secondary:boolean;selected:boolean;positions:THREE.Vector3[];radii:number[]}[]=[];
  private readonly disposable: THREE.Object3D[] = [];
  private experimentSphere!: THREE.Mesh;
  private experimentEdge!: THREE.Mesh;
  private normalVisual!: THREE.Group;
  private angleVisual!: THREE.Group;
  private scanPath!:PolylinePath;
  private scanFan:PolylinePath[]=[];
  private disposed = false;

  constructor() {
    this.group.name = 'rainbow-optics-world';
    this.dropGroup.name = 'drop-laboratory';
    this.outdoorGroup.name = 'observer-rain-sun';
    this.rainGroup.name = 'deterministic-rain-drops';
    this.coneGroup.name = 'anti-solar-cone';
    this.ringGroup.name = 'primary-spectrum-ring';
    this.secondaryRingGroup.name = 'secondary-spectrum-ring';
    this.group.add(this.outdoorGroup, this.dropGroup);
    this.outdoorGroup.add(this.rainGroup,this.observerRig,this.coneRig,this.ringRig,this.sunRig);
    this.coneRig.add(this.coneGroup,this.eyeAngleGroup,this.scanningSight,this.friendSight);
    this.ringRig.add(this.ringGroup,this.secondaryRingGroup,this.darkBandGroup);
    this.dropGroup.position.copy(DROP_CENTER);
    this.dropGroup.quaternion.copy(DROP_ROTATION);
    this.buildDropLaboratory();
    this.buildOutdoorGeometry();
    this.bakeRainInstances();
    for(const [k,v] of Object.entries(this.labelAnchors))this.originalLabels[k]=v.clone();
    this.group.traverse(o => { o.frustumCulled = false;if(o instanceof THREE.Mesh&&o.geometry instanceof THREE.CylinderGeometry)o.castShadow=false; });
  }

  private buildDropLaboratory() {
    const water = new THREE.MeshPhysicalMaterial({color: C.water, roughness: .08, metalness: .01, transmission: .72, thickness: .45, transparent: true, opacity: .34, depthWrite: false, clearcoat: .92, clearcoatRoughness: .08, side: THREE.DoubleSide});
    water.userData.baseOpacity = .34;
    this.experimentSphere = new THREE.Mesh(new THREE.SphereGeometry(DROP_RADIUS, 64, 42), water);
    this.experimentSphere.name = 'transparent-water-drop';
    this.experimentSphere.castShadow = true;
    this.dropGroup.add(this.experimentSphere);
    this.disposable.push(this.experimentSphere);
    const edge = new THREE.Mesh(new THREE.SphereGeometry(DROP_RADIUS * 1.004, 64, 42), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms:{tint:{value:new THREE.Color('#458e9a')}},
      vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader:'varying vec3 n;varying vec3 v;uniform vec3 tint;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),3.5);gl_FragColor=vec4(tint,.42*f);}'
    }));
    edge.name = 'water-drop-silhouette';
    this.experimentEdge = edge;
    this.dropGroup.add(edge);
    this.disposable.push(edge);

    const commonImpact=findPrimaryExtremum(SPECTRUM[0].refractiveIndex).impactParameter;
    for (const sample of SPECTRUM) {
      const optimum = findPrimaryExtremum(sample.refractiveIndex);
      this.anchors.primaryAnglesDeg[sample.name] = optimum.rainbowAngleDeg;
      this.anchors.secondaryAnglesDeg[sample.name] = findSecondaryExtremum(sample.refractiveIndex).rainbowAngleDeg;
      const commonPath=tracePrimary(commonImpact,sample.refractiveIndex)!;
      const points=commonPath.points.map(p => p.clone().multiplyScalar(DROP_RADIUS));
      const visual = new PolylinePath(points, sample.color, .014, .95);
      visual.group.name = `primary-path-${sample.name}`;
      this.dropGroup.add(visual.group);
      this.dropPaths.push({name: sample.name, path: commonPath, visual, angleDeg: optimum.rainbowAngleDeg});
      const photon=sphereAt(points[0],.045,basicMaterial(sample.color,1),14);this.dropGroup.add(photon);this.photons.push({mesh:photon,points,secondary:false,name:sample.name,color:sample.color});
    }
    // Red/green/violet secondary paths explain the second bow,
    // while keeping the close-up free of a dozen overlapping lines.
    for (const sample of [SPECTRUM[0], SPECTRUM[3], SPECTRUM[6]]) {
      const optimum = findSecondaryExtremum(sample.refractiveIndex);
      const path = optimum.path;
      if (!path) continue;
      this.anchors.secondaryAnglesDeg[sample.name] = path.rainbowAngleDeg;
      const points=path.points.map(p=>p.clone().multiplyScalar(DROP_RADIUS));
      const visual = new PolylinePath(points, sample.color, .020, .88);
      visual.group.name = `secondary-path-${sample.name}`;
      this.dropGroup.add(visual.group);
      this.secondaryPaths.push({name: sample.name, path, visual});
      const photon=sphereAt(points[0],.05,basicMaterial(sample.color,1),14);this.dropGroup.add(photon);this.photons.push({mesh:photon,points,secondary:true,name:sample.name,color:sample.color});
    }
    this.normalVisual = this.makeNormalVisual();
    this.angleVisual = this.makeDropAngleVisual();
    this.dropGroup.add(this.normalVisual, this.angleVisual);
    const primary=this.dropPaths[0].path,inside=primary.firstHit.clone().sub(primary.entrance).normalize();
    this.incomingWhite=new PolylinePath(primary.points.slice(0,2).map(p=>p.clone().multiplyScalar(DROP_RADIUS)),'#d6b579',.025,.95);this.incomingWhite.group.name='shared-white-incident-beam';this.dropGroup.add(this.incomingWhite.group);
    const transmitted=refractBoundary(inside,primary.firstHit.clone().normalize(),primary.refractiveIndex,AIR.refractiveIndex)!;
    this.transmittedBranch=new PolylinePath([primary.firstHit.clone().multiplyScalar(DROP_RADIUS),primary.firstHit.clone().multiplyScalar(DROP_RADIUS).addScaledVector(transmitted,2.1)],'#ba9974',.025,.74);this.transmittedBranch.group.name='partial-transmission-at-back-surface';this.dropGroup.add(this.transmittedBranch.group);
    this.scanPath=new PolylinePath(tracePrimary(.5,1.331)!.points.map(p=>p.clone().multiplyScalar(DROP_RADIUS)),SPECTRUM[0].color,.036,.96);
    this.scanPath.group.name='incidence-height-scan';this.dropGroup.add(this.scanPath.group);
    for(let i=0;i<16;i++){const path=tracePrimary(.73+i/15*.25,1.331)!;const fan=new PolylinePath(path.points.map(p=>p.clone().multiplyScalar(DROP_RADIUS)),SPECTRUM[0].color,.010,.28);this.scanFan.push(fan);this.dropGroup.add(fan.group);}
    const red=this.dropPaths[0].path,violet=this.dropPaths.at(-1)!.path;
    const world=(p:THREE.Vector3)=>p.clone().multiplyScalar(DROP_RADIUS).applyQuaternion(DROP_ROTATION).add(DROP_CENTER);
    Object.assign(this.labelAnchors,{
      'Drop.center':DROP_CENTER.clone(), 'Drop.entry':world(red.entrance),'Drop.reflect1':world(red.firstHit),'Drop.exit':world(red.exit),
      'Drop.redEnd':world(red.points.at(-1)!),'Drop.violetEnd':world(violet.points.at(-1)!),
      'Drop.normal':world(red.entrance).addScaledVector(red.entrance.clone().normalize().applyQuaternion(DROP_ROTATION),.72),
      'Eye':OBSERVER.clone(),'AntiAxis':OBSERVER.clone().addScaledVector(ANTI_SOLAR,5), 'Sun':SUN.clone(),
      'Drop.reflect2':world(this.secondaryPaths[0].path.secondHit),
    });
  }

  private makeNormalVisual(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'local-normal-at-entrance';
    const sample = this.dropPaths[0]?.path;
    if (!sample) return g;
    const p = sample.entrance.clone().multiplyScalar(DROP_RADIUS);
    const n = sample.entrance.clone().normalize();
    const mat = basicMaterial(C.teal, .92);
    g.add(cylinderBetween(p, p.clone().addScaledVector(n, .72), .028, mat));
    const tip = p.clone().addScaledVector(n, .72);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.11, .24, 12), mat.clone());
    cone.position.copy(tip);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    g.add(cone);
    const dot = sphereAt(p, .09, basicMaterial(C.gold, 1), 12);
    g.add(dot);
    return g;
  }

  private makeDropAngleVisual(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'forty-two-degree-angle-marker';
    const red=this.dropPaths[0].path;
    const center = red.exit.clone().multiplyScalar(DROP_RADIUS);
    const radius = .72;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = Math.PI+THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.red) * i / 28;
      points.push(center.clone().add(vec(Math.cos(a) * radius, Math.sin(a) * radius, 0)));
    }
    const m = basicMaterial(C.gold, .92);
    for (let i = 0; i < points.length - 1; i++) g.add(cylinderBetween(points[i], points[i + 1], .034, m.clone()));
    g.add(cylinderBetween(center, points[0], .026, basicMaterial(C.ink, .66)));
    g.add(cylinderBetween(center, points.at(-1)!, .026, basicMaterial(C.ink, .66)));
    return g;
  }

  private buildOutdoorGeometry() {
    const observer = new THREE.Group();
    observer.name = 'observer';
    observer.position.copy(OBSERVER);
    const body = sphereAt(vec(0, -.42, 0), .22, material(C.ink, .96), 16);
    body.scale.set(.92, 1.5, .6);
    const head = sphereAt(vec(0, .04, 0), .17, material('#d49d7a', .98), 18);
    const eye = sphereAt(vec(0, .06, -.165), .022, basicMaterial(C.gold, 1), 8);
    observer.add(body, head, eye);
    const cloth=material(C.ink,.98);observer.add(cylinderBetween(vec(-.11,-.68,0),vec(-.12,-1.33,0),.072,cloth),cylinderBetween(vec(.11,-.68,0),vec(.12,-1.33,0),.072,cloth));
    observer.add(cylinderBetween(vec(-.16,-.22,0),vec(-.25,-.68,0),.052,cloth),cylinderBetween(vec(.16,-.22,0),vec(.25,-.68,0),.052,cloth));
    const foot1=sphereAt(vec(-.12,-1.4,-.065),.085,cloth,12),foot2=sphereAt(vec(.12,-1.4,-.065),.085,cloth,12);foot1.scale.set(.85,.55,1.6);foot2.scale.copy(foot1.scale);observer.add(foot1,foot2);
    this.observerRig.add(observer);
    // The high viewpoint stays visibly supported instead of floating in air.
    this.observationPlatform.name='high-viewpoint-observation-deck';
    const deck=new THREE.Mesh(new THREE.CylinderGeometry(.95,.88,.09,64),material('#dbe6e4',.82,'#dbe6e4',.7));deck.position.copy(OBSERVER).add(vec(0,-1.49,0));this.observationPlatform.add(deck);
    const deckRim=new THREE.Mesh(new THREE.TorusGeometry(.94,.014,8,64),basicMaterial('#6f9294',.65));deckRim.rotation.x=Math.PI/2;deckRim.position.copy(deck.position).add(vec(0,.043,0));this.observationPlatform.add(deckRim);this.observerRig.add(this.observationPlatform);
    this.platformColumn=new THREE.Mesh(new THREE.CylinderGeometry(.11,.18,1,18),material('#d7e4e2',.42,'#d7e4e2',.78));this.outdoorGroup.add(this.platformColumn);

    const sun = new THREE.Group();
    sun.name = 'sun-behind-observer';
    sun.position.copy(SUN);
    sun.add(sphereAt(vec(), .36, basicMaterial(C.gold, 1), 24));
    sun.add(sphereAt(vec(), .62, new THREE.MeshBasicMaterial({color: C.gold, transparent: true, opacity: .045, depthWrite: false, toneMapped:false}), 24));
    this.sunRig.add(sun);

    const axisStart = OBSERVER.clone();
    const axisEnd = OBSERVER.clone().addScaledVector(ANTI_SOLAR, 14);
    this.coneRig.add(cylinderBetween(axisStart, axisEnd, .025, basicMaterial(C.axis, .56)));
    this.sunEyeLine=cylinderBetween(SUN,OBSERVER,.018,basicMaterial(C.gold,.42));this.sunEyeLine.name='sun-to-eye-construction-line';this.sunRig.add(this.sunEyeLine);
    const axisTip = sphereAt(axisEnd, .075, basicMaterial(C.axis, .75), 12);
    this.coneRig.add(axisTip);

    const u = vec(1, 0, 0);
    const v = u.clone().cross(ANTI_SOLAR).normalize();
    // Deterministic ambient rain. The selected ring copies are inserted below
    // and always lie on the actual primary/secondary angular cones.
    for (let i = 0; i < 1800; i++) {
      const x = ((i * 83) % 257) / 257*29 - 14.5;
      const y = ((i * 47) % 131) / 131*37 - 10;
      const z = -5.7 + ((i * 29) % 97) / 60;
      const p = vec(x, y, z);
      const ray = p.clone().sub(OBSERVER);
      const distance = ray.length();
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(clamp(ray.normalize().dot(ANTI_SOLAR), -1, 1)));
      const nearest = SPECTRUM.reduce((best, sample, idx) => {
        const target = this.anchors.primaryAnglesDeg[sample.name] ?? 42;
        const diff = Math.abs(angleDeg - target);
        return diff < best.diff ? {idx, diff} : best;
      }, {idx: 0, diff: Infinity});
      const dropMat = material(nearest.diff < 1.2 ? SPECTRUM[nearest.idx].color : C.cloud, nearest.diff < 1.2 ? .5 : .14, nearest.diff < 1.2 ? SPECTRUM[nearest.idx].color : C.cloud, .52);
      const drop = sphereAt(p, .036 + (i % 3) * .009, dropMat, 8);
      this.rainGroup.add(drop);
      this.rainDrops.push({mesh: drop, angleDeg, colorIndex: nearest.idx, distance});
    }
    this.buildSelectedConeDrops(u, v, 10.5, 0, false);
    this.buildSelectedConeDrops(u, v, 10.5, 1, true);

    this.buildSpectrumRing(this.ringGroup, OBSERVER.clone().addScaledVector(ANTI_SOLAR, 10.5), 10.5, false, u, v);
    this.buildSpectrumRing(this.secondaryRingGroup, OBSERVER.clone().addScaledVector(ANTI_SOLAR, 10.5), 10.5, true, u, v);
    const primaryTop=OBSERVER.clone().addScaledVector(ANTI_SOLAR,10.5).addScaledVector(v,10.5*Math.tan(THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.red)));
    this.labelAnchors.arcTop=primaryTop;
    this.labelAnchors['Arc.red']=primaryTop.clone();
    this.labelAnchors['Arc.violet']=OBSERVER.clone().addScaledVector(ANTI_SOLAR,10.5).addScaledVector(v,10.5*Math.tan(THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.violet)));
    this.labelAnchors['Arc.secondary']=OBSERVER.clone().addScaledVector(ANTI_SOLAR,10.5).addScaledVector(v,10.5*Math.tan(THREE.MathUtils.degToRad(this.anchors.secondaryAnglesDeg.violet)));
    this.makeEyeAngle(u,v);
    this.makeDarkBand(u,v);
    const sightMat=basicMaterial('#c87952',.9);sightMat.depthTest=false;
    this.scanSightRay=cylinderBetween(OBSERVER,primaryTop,.029,sightMat);this.scanSightRay.renderOrder=22;
    const dropMat=basicMaterial('#df8760',.94);dropMat.depthTest=false;
    this.scanSightDrop=sphereAt(primaryTop,.115,dropMat,16);this.scanSightDrop.renderOrder=23;
    this.scanningSight.add(this.scanSightRay,this.scanSightDrop);this.scanningSight.name='constant-angle-sightline-sweep';
    this.friendEye=sphereAt(OBSERVER,.11,basicMaterial('#49888c',.92),16);this.friendRay=cylinderBetween(OBSERVER,primaryTop,.025,basicMaterial('#49888c',.7));this.friendDrop=sphereAt(primaryTop,.12,basicMaterial(SPECTRUM[0].color,.88),16);
    this.friendSight.add(this.friendEye,this.friendRay,this.friendDrop);this.friendSight.name='neighbour-observer-different-raindrops';

    const coneLength = 14;
    const coneRadius = coneLength * Math.tan(THREE.MathUtils.degToRad(42));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneLength, 96, 1, true), new THREE.MeshBasicMaterial({color: C.teal, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide}));
    cone.name = 'primary-42-degree-cone';
    cone.position.copy(OBSERVER).addScaledVector(ANTI_SOLAR, coneLength / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ANTI_SOLAR.clone().negate());
    this.coneGroup.add(cone);
    const coneRim = this.makeRing(OBSERVER.clone().addScaledVector(ANTI_SOLAR, coneLength), coneRadius, u, v, C.teal, .7);
    this.coneGroup.add(coneRim);
    this.buildWaterSpray();
  }

  private buildWaterSpray(){
    this.sprayRig.name='garden-water-mist-demonstration';this.outdoorGroup.add(this.sprayRig);
    const nozzle=vec(-2.4,.22,3.6),tip=nozzle.clone().add(vec(.15,.19,-.08));
    this.sprayRig.add(cylinderBetween(nozzle,tip,.075,material('#729ca0',.95,'#729ca0',.3)));
    const rim=sphereAt(tip,.078,material('#345a60',.94),14);rim.scale.set(1,.45,1);this.sprayRig.add(rim);
    const hosePoints=[vec(-6,.042,6.4),vec(-4.7,.044,6),vec(-4.1,.046,4.7),vec(-3.5,.047,3.4),nozzle];
    const hose=new THREE.CatmullRomCurve3(hosePoints);const hoseMesh=new THREE.Mesh(new THREE.TubeGeometry(hose,48,.035,8,false),material('#82a3a1',.92,'#82a3a1',.65));this.sprayRig.add(hoseMesh);
    const mistMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.62,depthWrite:false,toneMapped:false});
    this.sprayDrops=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),mistMaterial,480);this.sprayDrops.frustumCulled=false;this.sprayDrops.name='ballistic-mist-particles';this.sprayRig.add(this.sprayDrops);
    this.labelAnchors['Garden.nozzle']=tip.clone();
  }

  private buildSelectedConeDrops(u: THREE.Vector3, v: THREE.Vector3, distance: number, offset: number, secondary: boolean) {
    const center = OBSERVER.clone().addScaledVector(ANTI_SOLAR, distance);
    const count = 42;
    for (let c=0;c<SPECTRUM.length;c++) for (let i = 0; i < count; i++) {
      const sample=SPECTRUM[c];
      const target = secondary ? this.anchors.secondaryAnglesDeg[sample.name] : this.anchors.primaryAnglesDeg[sample.name];
      const radius = distance * Math.tan(THREE.MathUtils.degToRad(target));
      const a = Math.PI * 2 * (i / count) + offset * .04;
      const p = center.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius);
      const ray = p.clone().sub(OBSERVER);
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(clamp(ray.normalize().dot(ANTI_SOLAR), -1, 1)));
      const colorIndex = c;
      const m = material(sample.color, secondary ? .45 : .65, sample.color, .28);
      const drop = sphereAt(p, .036, m, 8);
      drop.userData.selected = true;
      drop.userData.secondary = secondary;
      this.rainGroup.add(drop);
      this.rainDrops.push({mesh: drop, angleDeg, colorIndex, distance});
    }
  }

  private makeRing(center: THREE.Vector3, radius: number, u: THREE.Vector3, v: THREE.Vector3, color: string, opacity: number): THREE.Group {
    const group = new THREE.Group();
    const points: THREE.Vector3[] = [];
    const n = 128;
    for (let i = 0; i <= n; i++) points.push(center.clone().addScaledVector(u, Math.cos(Math.PI * 2 * i / n) * radius).addScaledVector(v, Math.sin(Math.PI * 2 * i / n) * radius));
    for (let i = 0; i < n; i++) group.add(cylinderBetween(points[i], points[i + 1], .038, basicMaterial(color, opacity)));
    return group;
  }

  private buildSpectrumRing(parent: THREE.Group, center: THREE.Vector3, distance: number, secondary: boolean, u: THREE.Vector3, v: THREE.Vector3) {
    // Colour changes radially with wavelength, never around the circumference.
    const angular=192,radial=48,positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const angles=SPECTRUM.map(s=>secondary?this.anchors.secondaryAnglesDeg[s.name]:this.anchors.primaryAnglesDeg[s.name]);
    for(let j=0;j<=radial;j++){
      const f=j/radial*(SPECTRUM.length-1),k=Math.min(SPECTRUM.length-2,Math.floor(f)),q=f-k;
      const angle=mix(angles[k],angles[k+1],q),radius=distance*Math.tan(THREE.MathUtils.degToRad(angle));
      const color=new THREE.Color(SPECTRUM[k].color).lerp(new THREE.Color(SPECTRUM[k+1].color),q);
      for(let i=0;i<=angular;i++){const a=Math.PI*2*i/angular,p=center.clone().addScaledVector(u,Math.cos(a)*radius).addScaledVector(v,Math.sin(a)*radius);positions.push(...p.toArray());colors.push(color.r,color.g,color.b);}
    }
    for(let j=0;j<radial;j++)for(let i=0;i<angular;i++){const a=j*(angular+1)+i,b=a+angular+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:secondary?.6:.9,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});mat.userData.baseOpacity=secondary?.6:.9;
    parent.add(new THREE.Mesh(geometry,mat));
  }

  private bakeRainInstances(){
    const groups=new Map<string,RainDrop[]>();
    for(const d of this.rainDrops){const key=`${d.mesh.userData.secondary?'s':'p'}-${d.mesh.userData.selected?'sel':'ambient'}-${d.colorIndex}`;if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(d);}
    this.rainGroup.clear();
    for(const drops of groups.values()){
      const first=drops[0],m=(first.mesh.material as THREE.MeshStandardMaterial).clone(),geo=new THREE.SphereGeometry(1,10,7),inst=new THREE.InstancedMesh(geo,m,drops.length);inst.frustumCulled=false;m.color.set('#ffffff');m.emissive.set('#000000');
      const positions:THREE.Vector3[]=[],radii:number[]=[];
      drops.forEach((d,i)=>{d.mesh.updateMatrix();const r=(d.mesh.geometry as THREE.SphereGeometry).parameters.radius;const matrix=d.mesh.matrix.clone().multiply(new THREE.Matrix4().makeScale(r,r,r));inst.setMatrixAt(i,matrix);d.mesh.geometry.dispose();(d.mesh.material as THREE.Material).dispose();});
      drops.forEach(d=>{positions.push(d.mesh.position.clone());radii.push((d.mesh.geometry as THREE.SphereGeometry).parameters.radius);});
      inst.instanceMatrix.needsUpdate=true;this.rainGroup.add(inst);this.rainInstances.push({mesh:inst,secondary:!!first.mesh.userData.secondary,selected:!!first.mesh.userData.selected,positions,radii});
    }
    this.rainDrops.length=0;
  }

  private makeEyeAngle(u:THREE.Vector3,v:THREE.Vector3){
    const angle=THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.red),r=2.2,pts:THREE.Vector3[]=[];
    for(let i=0;i<=40;i++){const a=angle*i/40;pts.push(OBSERVER.clone().addScaledVector(ANTI_SOLAR,Math.cos(a)*r).addScaledVector(v,Math.sin(a)*r));}
    const m=basicMaterial(C.gold,.95);for(let i=0;i<pts.length-1;i++)this.eyeAngleGroup.add(cylinderBetween(pts[i],pts[i+1],.033,m.clone()));
    const topDir=ANTI_SOLAR.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
    this.eyeAngleGroup.add(cylinderBetween(OBSERVER,OBSERVER.clone().addScaledVector(topDir,7),.032,basicMaterial('#de7864',.82)));
    this.labelAnchors['Eye.angle42']=pts[22].clone().addScaledVector(u,.3);
  }

  private makeDarkBand(u:THREE.Vector3,v:THREE.Vector3){
    const center=OBSERVER.clone().addScaledVector(ANTI_SOLAR,10.55),inner=10.55*Math.tan(THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.red+.13)),outer=10.55*Math.tan(THREE.MathUtils.degToRad(this.anchors.secondaryAnglesDeg.red-.13));
    const pos:number[]=[],ind:number[]=[];for(let j=0;j<2;j++)for(let i=0;i<=192;i++){const a=Math.PI*2*i/192;pos.push(...center.clone().addScaledVector(u,Math.cos(a)*(j?outer:inner)).addScaledVector(v,Math.sin(a)*(j?outer:inner)).toArray());}
    for(let i=0;i<192;i++)ind.push(i,i+193,i+1,i+193,i+194,i+1);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(ind);geo.computeVertexNormals();const mat=new THREE.MeshBasicMaterial({color:'#6b8090',transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide});mat.userData.baseOpacity=.12;this.darkBandGroup.add(new THREE.Mesh(geo,mat));
    this.labelAnchors['Arc.darkBand']=center.clone().addScaledVector(v,(inner+outer)*.5);
  }

  update(state: OpticsState): void {
    if (this.disposed) return;
    const scene = state.scene;
    const p = clamp(state.progress);
    const outdoor=sampleOutdoorTransform(state.frame);this.dynamicCircleLift=outdoor.lift;this.dynamicEyeShift=outdoor.shift;this.dynamicSunElevation=outdoor.sunElevationDeg;
    const transformPosition=outdoor.eye.clone().sub(OBSERVER.clone().applyQuaternion(outdoor.quaternion));
    for(const rig of [this.coneRig,this.ringRig,this.sunRig]){rig.position.copy(transformPosition);rig.quaternion.copy(outdoor.quaternion);}
    this.observerRig.position.copy(outdoor.eye).sub(OBSERVER);
    this.anchors.observer.copy(outdoor.eye);this.anchors.antiSolarAxis.copy(outdoor.axis);this.anchors.sun.copy(outdoor.eye).addScaledVector(outdoor.axis,-12);
    for(const [name,pos] of Object.entries(this.originalLabels)){if(name.startsWith('Drop.')||name.startsWith('Garden.'))continue;this.labelAnchors[name].copy(pos).sub(OBSERVER).applyQuaternion(outdoor.quaternion).add(outdoor.eye);}
    const platformAlpha=smooth(outdoor.lift/.6);setAlpha(this.observationPlatform,platformAlpha);this.platformColumn.scale.y=Math.max(.001,outdoor.lift);this.platformColumn.position.set(outdoor.eye.x,outdoor.lift*.5,OBSERVER.z);(this.platformColumn.material as THREE.MeshStandardMaterial).opacity=.35*platformAlpha;
    const secondary=scene==='secondary';
    // Both physical locations are always present. The camera transfers between
    // them; no scene switch can remove a model in the middle of that journey.
    this.dropGroup.visible=true;this.outdoorGroup.visible=true;
    (this.experimentSphere.material as THREE.Material & {opacity: number}).opacity=.22;
    const t=state.frame;
    const reached=(id:string)=>t>=(clipAt(id)?.start??Infinity);
    const intervalAlpha=(start:string,end:string)=>smooth((t-(clipAt(start)?.start??Infinity))/24)*(1-smooth((t-(clipAt(end)?.start??Infinity))/24));
    setAlpha(this.sunEyeLine,Math.max(intervalAlpha('r005','r007'),intervalAlpha('r018','r038')));
    // Reveal actual path segments at the corresponding spoken explanation.
    // A segment grows from its previous interface, rather than simply fading
    // the entire four-segment polygon into view before the explanation.
    const lineProgress = !reached('r007')?.25:!reached('r008')?.25+.25*smooth(clipProgress('r007',t)*1.35):!reached('r014')?.5:!reached('r015')?.5+.25*smooth(clipProgress('r014',t)*1.4):!reached('r016')?.75+.25*smooth(clipProgress('r015',t)*1.3):1;
    const atComparison=reached('r010')&&!reached('r011'),violetFocus=smooth((clipProgress('r010',t)-.63)/.17);
    const colourArrival=smooth(clipProgress('r009',t)*1.8);
    this.dropPaths.forEach((entry, i) => {
      const coloured=scene==='dispersion'||scene==='angle'||(scene==='reflection'&&reached('r017'));
      const highlight=atComparison?(i===0?mix(1,.09,violetFocus):i===6?mix(.05,1,violetFocus):.025):i===0?1:coloured?(i===6?.95:.58)*colourArrival:.025;
      entry.visual.update(lineProgress,secondary?.03:.92,highlight);
    });
    this.incomingWhite.update(1,secondary?.08:1);
    this.secondaryPaths.forEach((entry,i)=>entry.visual.update(1,secondary?.92:0,i===0?1:.32));
    this.transmittedBranch.update(smooth(clipProgress('r013',t)*1.5),scene==='reflection'?.85:reached('r014')?.08:0);
    const angleElapsed=(state.frame-state.sceneStart)/30,scanAlpha=scene==='angle'?(1-smooth((angleElapsed-3)/1.3)):0;
    const scanB=.18+.81*smooth(clamp(angleElapsed/4));const scan=tracePrimary(scanB,1.331)!;
    this.scanPath.setPoints(scan.points.map(p=>p.multiplyScalar(DROP_RADIUS)));this.scanPath.update(1,scanAlpha);
    this.scanFan.forEach(fan=>fan.update(1,scanAlpha*.46));
    // The public narration explains the angle at the observer; unlabelled
    // drop-normal arrows would introduce a competing, unexplained angle.
    this.normalVisual.visible=false;
    this.angleVisual.visible=false;
    for(const photon of this.photons){
      const lengths=photon.points.slice(1).map((x,i)=>x.distanceTo(photon.points[i])),total=lengths.reduce((a,b)=>a+b,0);let distance=((state.time/7.8)%1)*total;let i=0;while(i<lengths.length-1&&distance>lengths[i]){distance-=lengths[i];i++;}
      photon.mesh.position.copy(photon.points[i]).lerp(photon.points[i+1],clamp(distance/lengths[i]));
      const stage=(i+clamp(distance/lengths[i]))/lengths.length;
      const showPrimary=!photon.secondary&&stage<=lineProgress&&(photon.name==='red'||(reached('r009')&&photon.name==='violet'));
      photon.mesh.visible=secondary?photon.secondary:showPrimary;
      const pm=photon.mesh.material as THREE.MeshBasicMaterial;pm.color.set(i===0?'#efd9a9':photon.color);pm.opacity=atComparison?(photon.name==='violet'?mix(.15,1,violetFocus):mix(1,.15,violetFocus)):1;
    }

    const s=(id:string)=>timeline.scenes.find(x=>x.id===id)!;
    // During the elevated view, the solar direction remains on the axis.
    // Gently withdraw its illustrative disc before it crosses the title area.
    const sunDisc=this.sunRig.getObjectByName('sun-behind-observer');
    if(sunDisc)setAlpha(sunDisc,valueAt(t,[[clipAt('r032')!.start-36,1],[clipAt('r032')!.start+18,0],[clipAt('r034')!.start+28,0],[clipAt('r034')!.start+88,1]]));
    const coneAlpha=valueAt(t,[[s('cone').start,0],[s('cone').start+60,1],[s('circle').start-22,1],[s('circle').start+22,.22],[s('observer').start-22,.22],[s('observer').start+22,1],[s('secondary').start-22,1],[s('secondary').start+22,0]]);
    const eyeAlpha=valueAt(t,[[s('angle').start,0],[s('angle').start+45,1],[s('circle').start-22,1],[s('circle').start+22,0],[s('observer').start-22,0],[s('observer').start+22,.45],[s('secondary').start-22,.45],[s('secondary').start+22,0]]);
    const emphasis=valueAt(t,[[s('angle').start,0],[s('angle').start+45,1],[s('circle').start-22,1],[s('circle').start+22,0],[s('observer').start-22,0],[s('observer').start+22,1],[s('secondary').start-22,1],[s('secondary').start+22,0]]);
    const ringAlpha=valueAt(t,[[0,.82],[s('drop').start-22,.82],[s('drop').start+22,.95],[s('references').start-22,.95],[s('references').start+22,.72]]);
    setAlpha(this.ringGroup, ringAlpha);
    const secondAlpha=valueAt(t,[[s('secondary').start,0],[s('secondary').start+60,1],[s('return').start-22,1],[s('return').start+22,.4]]);
    setAlpha(this.secondaryRingGroup,secondAlpha);setAlpha(this.darkBandGroup,secondAlpha);
    setAlpha(this.coneGroup,coneAlpha);setAlpha(this.eyeAngleGroup,eyeAlpha);
    const u=vec(1,0,0),v=u.clone().cross(ANTI_SOLAR).normalize(),sweepStart=clipAt('r024')!.start,sweepEnd=clipAt('r026')!.end,sweepProgress=smooth((t-sweepStart)/(sweepEnd-sweepStart));
    const sightAzimuth=Math.PI*.5+sweepProgress*Math.PI*2,sightRadius=10.5*Math.tan(THREE.MathUtils.degToRad(this.anchors.primaryAnglesDeg.red));
    const sightEnd=OBSERVER.clone().addScaledVector(ANTI_SOLAR,10.5).addScaledVector(u,Math.cos(sightAzimuth)*sightRadius).addScaledVector(v,Math.sin(sightAzimuth)*sightRadius);
    moveCylinder(this.scanSightRay,OBSERVER,sightEnd);this.scanSightDrop.position.copy(sightEnd);setAlpha(this.scanningSight,intervalAlpha('r024','r028')*(sightEnd.y<0?.4:1));
    const friendProgress=smooth(clipProgress('r036',t)*2.8),friendPosition=OBSERVER.clone().addScaledVector(u,mix(-3.1,-1.35,friendProgress));
    const friendEnd=friendPosition.clone().addScaledVector(ANTI_SOLAR,10.5).addScaledVector(u,Math.cos(1.1)*sightRadius).addScaledVector(v,Math.sin(1.1)*sightRadius);
    this.friendEye.position.copy(friendPosition);this.friendDrop.position.copy(friendEnd);moveCylinder(this.friendRay,friendPosition,friendEnd);setAlpha(this.friendSight,intervalAlpha('r036','r038')*friendProgress);
    const selectionKey=[outdoor.eye.x,outdoor.eye.y,outdoor.sunElevationDeg,emphasis].join('|'),needsSelection=selectionKey!==this.lastOutdoorSelection;
    const dummy=new THREE.Object3D(),cool=new THREE.Color('#aac9cf'),tempDirection=vec(),tempColour=new THREE.Color(),spectrumColours=SPECTRUM.map(s=>new THREE.Color(s.color));
    this.rainInstances.forEach(item=>{
      const m=item.mesh.material as THREE.Material & {opacity:number};
      const base=m.userData.baseOpacity??.2;
      m.opacity=item.secondary?base*secondAlpha*.8:item.selected?mix(base*.45,.84,emphasis):mix(base*.65,.38,emphasis);
      if(!needsSelection)return;
      item.positions.forEach((position,i)=>{const angle=THREE.MathUtils.radToDeg(Math.acos(clamp(tempDirection.copy(position).sub(outdoor.eye).normalize().dot(outdoor.axis),-1,1)));let nearest=0,diff=Infinity;
       SPECTRUM.forEach((s,k)=>{const delta=Math.abs(angle-(item.secondary?this.anchors.secondaryAnglesDeg[s.name]:this.anchors.primaryAnglesDeg[s.name]));if(delta<diff){diff=delta;nearest=k;}});
       const selection=Math.exp(-((diff/.65)**2));tempColour.copy(cool).lerp(spectrumColours[nearest],selection);
       item.mesh.setColorAt(i,tempColour);dummy.position.copy(position);dummy.scale.setScalar(mix(item.radii[i]*.55,mix(item.radii[i]*1.2,item.selected?.10:.085,emphasis),selection));dummy.updateMatrix();item.mesh.setMatrixAt(i,dummy.matrix);
      });
      if(item.mesh.instanceColor)item.mesh.instanceColor.needsUpdate=true;item.mesh.instanceMatrix.needsUpdate=true;
    });
    this.lastOutdoorSelection=selectionKey;
    // A small garden spray is part of the same outdoor world. Particle paths
    // are ballistic and deterministic; spectrum tint uses each particle's
    // angle to the actual eye/anti-solar axis, not an arbitrary rainbow stripe.
    // The return/fountain passage begins at r041; r046 is the final spoken
    // line and would leave the whole practical mist experiment invisible for
    // more than half of its intended scene.
    const mistActive=scene==='return'||scene==='references',mistAlpha=mistActive?smooth(Math.max(clipProgress('r041',t), clipProgress('r046',t)*.35)*1.35):.06;
    (this.sprayDrops.material as THREE.MeshBasicMaterial).opacity=.7*mistAlpha;
    for(let i=0;i<this.sprayDrops.count;i++){
      const age=((state.time*.55+i/this.sprayDrops.count)%1)*1.95,spread=((i*71)%251)/250-.5,depth=((i*37)%137)/136-.5;
      const position=vec(-2.25+(2.25+spread*2.5)*age,.41+(9.65+depth*.95)*age-4.905*age*age,3.52+(-2.75+depth*1.25)*age);
      const angle=THREE.MathUtils.radToDeg(Math.acos(clamp(tempDirection.copy(position).sub(outdoor.eye).normalize().dot(outdoor.axis),-1,1)));
      let nearest=0,diff=Infinity;SPECTRUM.forEach((s,k)=>{const d=Math.abs(angle-this.anchors.primaryAnglesDeg[s.name]);if(d<diff){diff=d;nearest=k;}});
      const strength=Math.exp(-((diff/.75)**2));tempColour.set('#9bc2cc').lerp(spectrumColours[nearest],strength);
      dummy.position.copy(position);dummy.scale.setScalar(position.y>.05?(.012+(i%4)*.004)*(1+strength*.8):.000001);dummy.updateMatrix();this.sprayDrops.setMatrixAt(i,dummy.matrix);this.sprayDrops.setColorAt(i,tempColour);
    }
    this.sprayDrops.instanceMatrix.needsUpdate=true;if(this.sprayDrops.instanceColor)this.sprayDrops.instanceColor.needsUpdate=true;
    // Geometry and world-space anchors stay fixed; all parallax comes from the
    // parent camera path, so labels and solar geometry cannot drift apart.
    this.dropGroup.quaternion.copy(DROP_ROTATION);this.outdoorGroup.rotation.set(0,0,0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
    });
    this.dropPaths.forEach(x => x.visual.dispose());
    this.secondaryPaths.forEach(x => x.visual.dispose());
    this.group.clear();
  }
}

/** Data used by the offline verification script and research notes. */
export function opticsVerificationData() {
  const primary = SPECTRUM.map(sample => {
    const e = findPrimaryExtremum(sample.refractiveIndex, 1024);
    return {name: sample.name, refractiveIndex: sample.refractiveIndex, impactParameter: e.impactParameter, rainbowAngleDeg: e.rainbowAngleDeg, residual: verifyPath(e.path)};
  });
    const secondary = SPECTRUM.filter((_, i) => i % 2 === 0).map(sample => {
    const p = findSecondaryExtremum(sample.refractiveIndex).path;
    return p ? {name: sample.name, refractiveIndex: sample.refractiveIndex, rainbowAngleDeg: p.rainbowAngleDeg, residual: verifyPath(p)} : null;
  }).filter(Boolean);
  return {model: 'spherical raindrop; explicit air/water boundaries; geometric optics', airRefractiveIndex: AIR.refractiveIndex, primary, secondary, antiSolarAxis: ANTI_SOLAR.toArray(), generatedAt: 'frame-deterministic'};
}

