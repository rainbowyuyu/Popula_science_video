import * as T from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,ease,timeline} from './Timeline';
import {sampleFishPose,type FishRole,type FishEuler} from './FishMotionV14';

type ObserverWorld={observer:T.Group;friend:T.Group;sprayObserver:T.Group;
  eyeRay?:T.Mesh;friendRay?:T.Mesh;sprayLight?:{points:T.Vector3[];group:T.Group}};
type BoneRest={bone:T.Bone;position:T.Vector3;quaternion:T.Quaternion;parentBasis:T.Quaternion};
type Rig={role:FishRole;figure:T.Group;model:T.Object3D;eye:T.Object3D;gaze:T.Object3D;hover:T.Object3D;
  rest:Map<string,BoneRest>;parent?:T.Group};
const EYE_HEIGHT=1.55;
// Preserve V19 presentation scale: keep the fish readable in the wide garden while
// retaining the same world-space eye anchor and true 3-D depth.
const CHARACTER_SCALE=.94;
const ROLE_SCALE:Record<FishRole,number>={observer:.94,friend:.90,spray:.68};
// Readable at the wide garden scale while retaining the soft reference
// illustration palette. These are material response values only; the authored
// skeleton, eye anchor and camera rail remain unchanged.
const EYE_INK='#071518';
const scene=(id:string)=>timeline.scenes.find(s=>s.id===id)!;
const clip=(id:string)=>timeline.clips.find(c=>c.id===id)!;
const smootherVelocity=(q:number)=>q>0&&q<1?30*q*q*(q-1)*(q-1):0;

/** V19 repair: 20-bone, continuously weighted round chibi rainbow fish. +Z forward/Y up.
 * Eye midpoint is anchored exactly to the world's optical observer. The fish
 * hovers, so it has no false ground-contact gait or feet. Each instance has its
 * own Skeleton, bones, geometry and materials. Seeking does not integrate state. */
export class FishObserverV19Repair{
  private rigs:Rig[]=[];
  private retired:T.Object3D[]=[];
  private world?:ObserverWorld;
  private geometries=new Set<T.BufferGeometry>();
  private materials=new Set<T.Material>();
  private point=new T.Vector3();
  readonly normalization:{sourceEye:number[];scale:number;eyeHeight:number;reference:string;roleScales:Record<FishRole,number>};

  constructor(asset:T.Object3D,_animations:T.AnimationClip[]=[]){
    asset.updateMatrixWorld(true);const source=asset.getObjectByName('EyeReference');
    if(!source)throw new Error('FishObserverV19Repair requires bone-parented EyeReference');
    const sourceEye=asset.worldToLocal(source.getWorldPosition(new T.Vector3()));
    this.normalization={sourceEye:sourceEye.toArray(),scale:CHARACTER_SCALE,eyeHeight:EYE_HEIGHT,roleScales:ROLE_SCALE,
      reference:'Actual centre-pole midpoint of both curved black eye patches; dynamically anchored to local (0,1.55,0); hover character, no feet'};
    for(const role of ['observer','friend','spray'] as const){
      const model=cloneSkeleton(asset),figure=new T.Group();figure.name=`rainbow-fish-${role}-V19-repair`;
      // The old DoubleSide contour rendered over the whole fish. Use genuine
      // smooth geometry and physical shading; no overlay shell.
      figure.add(model);model.scale.setScalar(ROLE_SCALE[role]);
      model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;
        if(/cheek|glaze/i.test(mesh.name)){mesh.visible=false;return;}
        mesh.geometry=mesh.geometry.clone();this.geometries.add(mesh.geometry);
        const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const materials=originals.map(m=>{
          const source=m as T.MeshStandardMaterial;
          const color=source.color?.clone()??new T.Color('#ffffff');
          if(role==='friend'&&source.vertexColors)color.multiply(new T.Color('#fff0e1'));
          if(role==='spray'&&source.vertexColors)color.multiply(new T.Color('#e1f7f1'));
          // Imported GLB material names are shared by several fin meshes. Use
          // the mesh name as well so the tail and pectoral fins keep the
          // saturated pink/lilac identity from the reference in outdoor light.
          const isCatchlight=/catchlight/i.test(`${m.name} ${mesh.name}`),
            isEye=!isCatchlight&&/iris|pupil|eyes/i.test(`${m.name} ${mesh.name}`),
            isFin=/fins|satin|tail|pectoral|dorsal|pelvic|anal/i.test(`${m.name} ${mesh.name}`),
            isBody=!isEye&&!isCatchlight&&/body|skin/i.test(`${m.name} ${mesh.name}`);
          if(isEye)color.set(EYE_INK);
          if(isCatchlight)color.set('#fffaf0');
          if(isFin)color.set('#ffffff');
          // The GLB vertex paint already carries the mint-to-cream gradient;
          // multiply by neutral white so exported vertex paint is not tinted twice.
          if(isBody)color.set('#ffffff');
          const material=new T.MeshPhysicalMaterial({name:`${role}-${m.name}-V19Repair`,color,
            vertexColors:isEye||isCatchlight?false:source.vertexColors,roughness:isEye?.12:isCatchlight?.18:isFin?.47:.42,
            metalness:0,clearcoat:isEye?.65:isFin?.14:.22,
            clearcoatRoughness:isEye?.05:isFin?.30:.30,iridescence:isEye?0:isFin?.025:.012,
            iridescenceIOR:1.32,iridescenceThicknessRange:[180,300],
            sheen:isEye?0:isFin?.15:.07,sheenRoughness:.58,sheenColor:new T.Color('#e6dceb'),
            envMapIntensity:isEye?.65:.45,reflectivity:isEye?.48:.26,
            emissive:isCatchlight?new T.Color('#fff8ea'):new T.Color('#000000'),emissiveIntensity:isCatchlight?.12:0,transparent:false,opacity:1,depthWrite:true,
            side:T.FrontSide});
          this.materials.add(material);return material;
        });
        mesh.material=Array.isArray(mesh.material)?materials:materials[0];
        mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=false;
      });
      model.updateMatrixWorld(true);const rest=new Map<string,BoneRest>();
      const modelInverse=model.getWorldQuaternion(new T.Quaternion()).invert();
      model.traverse(o=>{if(!(o as T.Bone).isBone)return;const bone=o as T.Bone;
        const parentBasis=bone.parent!.getWorldQuaternion(new T.Quaternion()).premultiply(modelInverse);
        rest.set(bone.name,{bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),parentBasis});
      });
      for(const name of ['Root','Head','Jaw','Spine0','Spine1','Spine2','Tail0','Tail1','Tail2','Tail3','PectoralL0','PectoralL1','PectoralR0','PectoralR1','Dorsal','PelvicL0','PelvicL1','PelvicR0','PelvicR1','Anal']){
        if(!rest.has(name))throw new Error(`Fish skeletal bone absent: ${name}`);
      }
      const eye=model.getObjectByName('EyeReference')!;eye.name=`optical-eye-reference-${role}`;
      // A second, bone-parented datum permits numerical verification of the
      // actual head-forward direction, including imported glTF rest bases.
      const gaze=new T.Object3D();gaze.name=`optical-gaze-forward-${role}`;
      const point=eye.getWorldPosition(new T.Vector3());
      const axis=new T.Vector3(0,0,1).transformDirection(model.matrixWorld);
      gaze.position.copy(eye.parent!.worldToLocal(point.addScaledVector(axis,.20)));
      eye.parent!.add(gaze);
      const hover=new T.Object3D();hover.name=`hover-datum-${role}`;hover.position.set(0,.85,0);figure.add(hover);
      this.rigs.push({role,figure,model,eye,gaze,hover,rest});
    }
    this.update(0);
  }

  attach(world:ObserverWorld){
    this.world=world;
    for(const rig of this.rigs){const parent=rig.role==='spray'?world.sprayObserver:world[rig.role];
      if(rig.parent===parent)continue;
      for(const child of [...parent.children]){parent.remove(child);this.retired.push(child);}
      parent.add(rig.figure);rig.parent=parent;
    }
    return this;
  }

  private motion(frame:number,role:FishRole){
    if(role==='spray')return {weight:0,distance:0,heading:Math.atan2(.24,-.955)-.62-3.2*ease((frame-10270)/125),headPitch:-.10};
    const walk=clip('r002'),observer=scene('observer'),drop=scene('drop');
    const streetDuration=walk.duration*.72,streetQ=clamp((frame-walk.start)/streetDuration);
    const streetDistance=1.6*ease(streetQ),streetSpeed=1.6*smootherVelocity(streetQ)*timeline.fps/streetDuration;
    const moveDuration=Math.max(90,observer.end-observer.start)*.38,q=clamp((frame-observer.start)/moveDuration);
    const returnQ=clamp((frame-(observer.end-45))/135);
    const outDistance=2.8*ease(q),backDistance=2.8*ease(returnQ);
    const observerSpeed=2.8*smootherVelocity(q)*timeline.fps/moveDuration;
    const returnSpeed=2.8*smootherVelocity(returnQ)*timeline.fps/135;
    if(role==='friend'){
      const entryStart=clip('r031').start-180,entryDuration=210,preStart=entryStart-240;
      const entryQ=clamp((frame-entryStart)/entryDuration),preQ=clamp((frame-preStart)/240);
      const entranceDistance=4.6*ease(entryQ),entranceSpeed=4.6*smootherVelocity(entryQ)*timeline.fps/entryDuration;
      const preDistance=18*ease(preQ),preSpeed=18*smootherVelocity(preQ)*timeline.fps/240;
      const entryShift=2.8*ease(clamp((entryStart-observer.start)/moveDuration));
      const shiftDistance=outDistance*(1-ease(returnQ));
      const shiftSpeed=observerSpeed*(1-ease(returnQ))-outDistance*smootherVelocity(returnQ)*timeline.fps/135;
      const travelled=Math.max(0,shiftDistance-entryShift)+preDistance+entranceDistance+backDistance;
      const settleTurn=ease((frame-(entryStart+entryDuration-85))/110),leaveTurn=ease((frame-(observer.end-85))/100);
      return {weight:ease(clamp(Math.abs(preSpeed+entranceSpeed+shiftSpeed)/.46)),distance:travelled,
        heading:Math.PI/2-.36+Math.PI/2*settleTurn+Math.PI/2*leaveTurn,headPitch:-.025};
    }
    const streetActive=frame<drop.start,speed=streetActive?streetSpeed:observerSpeed+returnSpeed;
    // Anticipation starts before the world rail accelerates. The whole body
    // reaches its travel heading over 3 seconds rather than snapping in 1.
    const turnInto=ease((frame-observer.start+45)/105),turnOut=ease((frame-(observer.start+moveDuration-40))/110);
    const returnTurn=ease((frame-(observer.end-85))/100),returnFinish=ease((frame-(observer.end+60))/110);
    const weight=ease(clamp(speed/.46));
    return {weight,distance:streetDistance+outDistance+backDistance,
      heading:Math.PI-1.20-Math.PI/2*turnInto*(1-turnOut)+Math.PI/2*returnTurn*(1-returnFinish),headPitch:-.025};
  }

  private rotate(rig:Rig,name:string,angles:FishEuler){
    const rest=rig.rest.get(name)!;
    const delta=new T.Quaternion().setFromEuler(new T.Euler(...angles,'XYZ'));
    // Authored bones use arbitrary glTF local bases. Convert requested model-space
    // axes to the neutral parent basis, then apply them relative to the rest pose.
    const local=rest.parentBasis.clone().invert().multiply(delta).multiply(rest.parentBasis);
    rest.bone.quaternion.copy(local.multiply(rest.quaternion));
  }

  /** Resolve the same actual rainbow endpoint used by WorldV10's ray. Camera
   * position never changes an observer's heading. All coordinates are converted
   * through the authored parent transform, so scene yaw/scale stays correct. */
  private target(rig:Rig):T.Vector3{
    const parent=rig.parent;
    if(parent&&this.world){
      if(rig.role==='spray'&&this.world.sprayLight){
        const light=this.world.sprayLight;
        light.group.updateWorldMatrix(true,false);
        return light.group.localToWorld(light.points[1].clone());
      }
      const ray=rig.role==='friend'?this.world.friendRay:this.world.eyeRay;
      if(ray){
        ray.updateWorldMatrix(true,false);
        const height=(ray.geometry as T.CylinderGeometry).parameters.height;
        return ray.localToWorld(new T.Vector3(0,height/2,0));
      }
      parent.updateWorldMatrix(true,false);
      return parent.localToWorld(new T.Vector3(0,10,-22));
    }
    return new T.Vector3(0,10,-22);
  }

  update(frame:number,_camera?:T.Camera){
    for(const rig of this.rigs){
      for(const rest of rig.rest.values()){
        rest.bone.position.copy(rest.position);rest.bone.quaternion.copy(rest.quaternion);
      }
      const rail=this.motion(frame,rig.role);
      const before=this.motion(frame-.5,rig.role),after=this.motion(frame+.5,rig.role);
      const turnRate=(after.heading-before.heading)*timeline.fps;
      const pose=sampleFishPose(frame,timeline.fps,rig.role,{...rail,turnRate,gazeYaw:0});
      const targetWorld=this.target(rig),targetLocal=targetWorld.clone();
      if(rig.parent)rig.parent.worldToLocal(targetLocal);
      const direction=targetLocal.sub(new T.Vector3(0,EYE_HEIGHT,0)).normalize();
      const heading=Math.atan2(direction.x,direction.z);
      const pitch=-Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
      // The smaller buoyant body shares the upward look with a modest Head
      // bend. Role-specific fixed scale keeps the spray foreground actor
      // within the composition and leaves physical tail clearance.
      const torsoPitch=pitch*.55;
      this.rotate(rig,'Root',[pose.rootEuler[0]*.35,pose.rootEuler[1]*.35,pose.rootEuler[2]*.45]);
      this.rotate(rig,'Head',[pitch-torsoPitch-pose.rootEuler[0]*.35,-pose.rootEuler[1]*.35,0]);
      this.rotate(rig,'Jaw',pose.jawEuler);
      for(let i=0;i<3;i++)this.rotate(rig,`Spine${i}`,pose.spineEuler[i]);
      for(let i=0;i<4;i++)this.rotate(rig,`Tail${i}`,pose.tailEuler[i]);
      for(const [side,key] of [['L','left'],['R','right']] as const){
        this.rotate(rig,`Pectoral${side}0`,pose.pectoralEuler[key]);
        this.rotate(rig,`Pectoral${side}1`,pose.pectoralEuler[key].map(v=>v*.38) as FishEuler);
        this.rotate(rig,`Pelvic${side}0`,pose.pelvicEuler[key]);
        this.rotate(rig,`Pelvic${side}1`,pose.pelvicEuler[key].map(v=>v*.30) as FishEuler);
      }
      this.rotate(rig,'Dorsal',pose.dorsalEuler);this.rotate(rig,'Anal',[0,0,-pose.dorsalEuler[2]*.6]);
      rig.figure.position.set(0,0,0);rig.model.position.set(0,0,0);
      rig.figure.rotation.set(torsoPitch,heading,0,'YXZ');
      rig.figure.updateWorldMatrix(true,true);
      // Anchor in parent space AFTER the full pose and figure yaw/pitch. Using
      // eye position directly in a differently rotated model space would drift.
      const actualEye=rig.eye.getWorldPosition(this.point);
      const parentEye=rig.parent?rig.parent.worldToLocal(actualEye):actualEye;
      rig.figure.position.set(-parentEye.x,EYE_HEIGHT-parentEye.y,-parentEye.z);
      rig.figure.updateWorldMatrix(true,true);
      const hoverWorld=rig.parent?rig.parent.localToWorld(new T.Vector3(0,.85,0)):new T.Vector3(0,.85,0);
      rig.hover.position.copy(rig.figure.worldToLocal(hoverWorld));
      rig.figure.updateMatrixWorld(true);
      const eyeWorld=rig.eye.getWorldPosition(new T.Vector3());
      const gazeWorld=rig.gaze.getWorldPosition(new T.Vector3()).sub(eyeWorld).normalize();
      const targetDirection=targetWorld.clone().sub(eyeWorld).normalize();
      const anchor=rig.parent?rig.parent.localToWorld(new T.Vector3(0,EYE_HEIGHT,0)):new T.Vector3(0,EYE_HEIGHT,0);
      rig.figure.userData={source:'V19 repaired physical fish; twenty-bone skin',eyeHeight:EYE_HEIGHT,
        hoverDatum:.85,gaitWeight:pose.swimWeight,swimWeight:pose.swimWeight,
        tailPhase:pose.tailPhase,breathPhase:pose.breathPhase,heading,pitch,
        cameraThreeQuarter:false,gazeTarget:targetWorld.toArray(),gazeDirection:gazeWorld.toArray(),
        targetDirection:targetDirection.toArray(),gazeErrorDegrees:T.MathUtils.radToDeg(gazeWorld.angleTo(targetDirection)),
        eyeAnchorError:eyeWorld.distanceTo(anchor),frame};
    }
  }

  dispose(){
    for(const rig of this.rigs){rig.figure.removeFromParent();const skeletons=new Set<T.Skeleton>();
      rig.model.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)skeletons.add((o as T.SkinnedMesh).skeleton);});
      for(const skeleton of skeletons)skeleton.dispose();}
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
    for(const old of this.retired)old.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometry.add(mesh.geometry);
      if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});
    for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
    this.rigs=[];this.retired=[];
  }
}





