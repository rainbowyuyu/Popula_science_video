import * as T from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,ease,timeline} from './Timeline';
import {sampleFishPose,type FishRole,type FishEuler} from './FishMotionV14';

type ObserverWorld={observer:T.Group;friend:T.Group;sprayObserver:T.Group};
type BoneRest={bone:T.Bone;position:T.Vector3;quaternion:T.Quaternion;parentBasis:T.Quaternion};
type Rig={role:FishRole;figure:T.Group;model:T.Object3D;eye:T.Object3D;hover:T.Object3D;
  rest:Map<string,BoneRest>;parent?:T.Group};
const EYE_HEIGHT=1.55;
const scene=(id:string)=>timeline.scenes.find(s=>s.id===id)!;
const clip=(id:string)=>timeline.clips.find(c=>c.id===id)!;
const smootherVelocity=(q:number)=>q>0&&q<1?30*q*q*(q-1)*(q-1):0;

/** V14 20-bone, continuously weighted pearl rainbow fish. +Z faces forward, Y up.
 * Eye midpoint is anchored exactly to the world's optical observer. The fish
 * hovers, so it has no false ground-contact gait or feet. Each instance has its
 * own Skeleton, bones, geometry and materials. Seeking does not integrate state. */
export class FishObserverV14{
  private rigs:Rig[]=[];
  private retired:T.Object3D[]=[];
  private geometries=new Set<T.BufferGeometry>();
  private materials=new Set<T.Material>();
  private point=new T.Vector3();
  readonly normalization:{sourceEye:number[];scale:number;eyeHeight:number;reference:string};

  constructor(asset:T.Object3D,_animations:T.AnimationClip[]=[]){
    asset.updateMatrixWorld(true);const source=asset.getObjectByName('EyeReference');
    if(!source)throw new Error('FishObserverV14 requires original rainbow_fish_v14.glb EyeReference');
    const sourceEye=asset.worldToLocal(source.getWorldPosition(new T.Vector3()));
    this.normalization={sourceEye:sourceEye.toArray(),scale:1,eyeHeight:EYE_HEIGHT,
      reference:'Actual front-pole midpoint of both eye irises; dynamically anchored to local (0,1.55,0); hover character, no feet'};
    for(const role of ['observer','friend','spray'] as const){
      const model=cloneSkeleton(asset),figure=new T.Group();figure.name=`rainbow-fish-${role}-V14`;figure.add(model);
      model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;
        mesh.geometry=mesh.geometry.clone();this.geometries.add(mesh.geometry);
        const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const materials=originals.map(m=>{
          const source=m as T.MeshStandardMaterial;
          const color=source.color?.clone()??new T.Color('#ffffff');
          if(role==='friend'&&source.vertexColors)color.multiply(new T.Color('#fff0e1'));
          if(role==='spray'&&source.vertexColors)color.multiply(new T.Color('#e1f7f1'));
          const isEye=/iris|pupil|catchlight|porcelain/i.test(m.name),isFin=/fins|silk|sail/i.test(m.name);
          const material=new T.MeshPhysicalMaterial({name:`${role}-${m.name}-V14`,color,
            vertexColors:source.vertexColors,roughness:isEye?.21:isFin?.34:.30,
            metalness:isEye?0:isFin?.020:.032,clearcoat:isEye?.64:isFin?.30:.46,
            clearcoatRoughness:isEye?.13:.28,iridescence:isEye?0:isFin?.08:.12,
            iridescenceIOR:1.32,iridescenceThicknessRange:[180,300],
            sheen:isEye?0:isFin?.22:.10,sheenRoughness:.55,sheenColor:new T.Color('#d8eee9'),
            envMapIntensity:isEye?.80:.70,reflectivity:.42,transparent:false,opacity:1,depthWrite:true,
            side:source.side});
          this.materials.add(material);return material;
        });
        mesh.material=Array.isArray(mesh.material)?materials:materials[0];
        mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
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
      const hover=new T.Object3D();hover.name=`hover-datum-${role}`;hover.position.set(0,.85,0);figure.add(hover);
      this.rigs.push({role,figure,model,eye,hover,rest});
    }
    this.update(0);
  }

  attach(world:ObserverWorld){
    for(const rig of this.rigs){const parent=rig.role==='spray'?world.sprayObserver:world[rig.role];
      if(rig.parent===parent)continue;
      for(const child of [...parent.children]){parent.remove(child);this.retired.push(child);}
      parent.add(rig.figure);rig.parent=parent;
    }
    return this;
  }

  private motion(frame:number,role:FishRole){
    if(role==='spray')return {weight:0,distance:0,heading:Math.atan2(.24,-.955),headPitch:-.10};
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
      const entranceDistance=5*ease(entryQ),entranceSpeed=5*smootherVelocity(entryQ)*timeline.fps/entryDuration;
      const preDistance=18*ease(preQ),preSpeed=18*smootherVelocity(preQ)*timeline.fps/240;
      const entryShift=2.8*ease(clamp((entryStart-observer.start)/moveDuration));
      const shiftDistance=outDistance*(1-ease(returnQ));
      const shiftSpeed=observerSpeed*(1-ease(returnQ))-outDistance*smootherVelocity(returnQ)*timeline.fps/135;
      const travelled=Math.max(0,shiftDistance-entryShift)+preDistance+entranceDistance+backDistance;
      const settleTurn=ease((frame-(entryStart+entryDuration-85))/110),leaveTurn=ease((frame-(observer.end-85))/100);
      return {weight:ease(clamp(Math.abs(preSpeed+entranceSpeed+shiftSpeed)/.46)),distance:travelled,
        heading:Math.PI/2+Math.PI/2*settleTurn+Math.PI/2*leaveTurn,headPitch:-.025};
    }
    const streetActive=frame<drop.start,speed=streetActive?streetSpeed:observerSpeed+returnSpeed;
    // Anticipation starts before the world rail accelerates. The whole body
    // reaches its travel heading over 3 seconds rather than snapping in 1.
    const turnInto=ease((frame-observer.start+45)/105),turnOut=ease((frame-(observer.start+moveDuration-40))/110);
    const returnTurn=ease((frame-(observer.end-85))/100),returnFinish=ease((frame-(observer.end+60))/110);
    return {weight:ease(clamp(speed/.46)),distance:streetDistance+outDistance+backDistance,
      heading:Math.PI-Math.PI/2*turnInto*(1-turnOut)+Math.PI/2*returnTurn*(1-returnFinish),headPitch:-.025};
  }

  private rotate(rig:Rig,name:string,angles:FishEuler){
    const rest=rig.rest.get(name)!;
    const delta=new T.Quaternion().setFromEuler(new T.Euler(...angles,'XYZ'));
    // Authored bones use arbitrary glTF local bases. Convert requested model-space
    // axes to the neutral parent basis, then apply them relative to the rest pose.
    const local=rest.parentBasis.clone().invert().multiply(delta).multiply(rest.parentBasis);
    rest.bone.quaternion.copy(local.multiply(rest.quaternion));
  }

  update(frame:number){
    for(const rig of this.rigs){
      for(const rest of rig.rest.values()){rest.bone.position.copy(rest.position);rest.bone.quaternion.copy(rest.quaternion);}
      const rail=this.motion(frame,rig.role);
      // Symmetric analytic look-around is independent of previously rendered
      // frames, so turning/banking and sub-frame seeks remain reproducible.
      const before=this.motion(frame-.5,rig.role),after=this.motion(frame+.5,rig.role);
      const turnRate=(after.heading-before.heading)*timeline.fps;
      const lookCue=rig.role==='friend'?clip('r031'):rig.role==='observer'?clip('r003'):clip('r039');
      const look=ease((frame-lookCue.start)/75)*(1-ease((frame-lookCue.end+10)/90));
      const gazeYaw=(rig.role==='friend'?-.065:rig.role==='spray'?.035:.045)*look;
      const pose=sampleFishPose(frame,timeline.fps,rig.role,{...rail,turnRate,gazeYaw});
      this.rotate(rig,'Root',pose.rootEuler);this.rotate(rig,'Head',pose.headEuler);this.rotate(rig,'Jaw',pose.jawEuler);
      for(let i=0;i<3;i++)this.rotate(rig,`Spine${i}`,pose.spineEuler[i]);
      for(let i=0;i<4;i++)this.rotate(rig,`Tail${i}`,pose.tailEuler[i]);
      for(const [side,key] of [['L','left'],['R','right']] as const){
        this.rotate(rig,`Pectoral${side}0`,pose.pectoralEuler[key]);
        this.rotate(rig,`Pectoral${side}1`,pose.pectoralEuler[key].map(v=>v*.38) as FishEuler);
        this.rotate(rig,`Pelvic${side}0`,pose.pelvicEuler[key]);
        this.rotate(rig,`Pelvic${side}1`,pose.pelvicEuler[key].map(v=>v*.30) as FishEuler);
      }
      this.rotate(rig,'Dorsal',pose.dorsalEuler);this.rotate(rig,'Anal',[0,0,-pose.dorsalEuler[2]*.6]);
      rig.figure.rotation.set(0,pose.heading,0);rig.model.position.set(0,0,0);
      rig.figure.updateWorldMatrix(true,true);
      // Correct the actual bone-parented iris midpoint after posing, not an
      // arbitrary head centre. Translation leaves all anatomical proportions intact.
      const eye=rig.model.worldToLocal(rig.eye.getWorldPosition(this.point));
      rig.model.position.set(-eye.x,EYE_HEIGHT-eye.y,-eye.z);
      rig.figure.updateWorldMatrix(true,true);
      rig.figure.userData={source:'Original skinned rainbow fish V14',eyeHeight:EYE_HEIGHT,
        hoverDatum:.85,gaitWeight:pose.swimWeight,swimWeight:pose.swimWeight,
        tailPhase:pose.tailPhase,breathPhase:pose.breathPhase,heading:pose.heading,frame};
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




