import * as T from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,ease,timeline} from './Timeline';
import {sampleFishPose,type FishRole,type FishEuler} from './FishMotionV14';

type ObserverWorld={observer:T.Group;friend:T.Group;sprayObserver:T.Group};
type BoneRest={bone:T.Bone;position:T.Vector3;quaternion:T.Quaternion;parentBasis:T.Quaternion};
type Rig={role:FishRole;figure:T.Group;model:T.Object3D;outline:T.Object3D;eye:T.Object3D;hover:T.Object3D;
  rest:Map<string,BoneRest>;parent?:T.Group};
const EYE_HEIGHT=1.55;
// V17 presentation scale: keep the fish readable in the wide garden while
// retaining the same world-space eye anchor and true 3-D depth.
const CHARACTER_SCALE=1.16;
// Readable at the wide garden scale while retaining the soft reference
// illustration palette. These are material response values only; the authored
// skeleton, eye anchor and camera rail remain unchanged.
const BODY_TINT='#d9f0e8', FIN_TINT='#e9b7d0', EYE_INK='#020304', CONTOUR='#2e5d61';
const scene=(id:string)=>timeline.scenes.find(s=>s.id===id)!;
const clip=(id:string)=>timeline.clips.find(c=>c.id===id)!;
const smootherVelocity=(q:number)=>q>0&&q<1?30*q*q*(q-1)*(q-1):0;

/** V16 20-bone, continuously weighted round chibi rainbow fish. +Z forward/Y up.
 * Eye midpoint is anchored exactly to the world's optical observer. The fish
 * hovers, so it has no false ground-contact gait or feet. Each instance has its
 * own Skeleton, bones, geometry and materials. Seeking does not integrate state. */
export class FishObserverV16{
  private rigs:Rig[]=[];
  private retired:T.Object3D[]=[];
  private cameraLocal=new T.Vector3();
  private geometries=new Set<T.BufferGeometry>();
  private materials=new Set<T.Material>();
  private point=new T.Vector3();
  readonly normalization:{sourceEye:number[];scale:number;eyeHeight:number;reference:string};

  constructor(asset:T.Object3D,_animations:T.AnimationClip[]=[]){
    asset.updateMatrixWorld(true);const source=asset.getObjectByName('EyeReference');
    if(!source)throw new Error('FishObserverV16 requires original rainbow_fish_v16.glb EyeReference');
    const sourceEye=asset.worldToLocal(source.getWorldPosition(new T.Vector3()));
    this.normalization={sourceEye:sourceEye.toArray(),scale:CHARACTER_SCALE,eyeHeight:EYE_HEIGHT,
      reference:'Actual centre-pole midpoint of both curved black eye patches; dynamically anchored to local (0,1.55,0); hover character, no feet'};
    for(const role of ['observer','friend','spray'] as const){
      const model=cloneSkeleton(asset),outline=cloneSkeleton(asset),figure=new T.Group();figure.name=`rainbow-fish-${role}-V17`;
      // A slightly enlarged, depth-tested silhouette hull gives the cute
      // illustrated contour from the reference without drawing a flat stroke.
      // It never writes depth, so the opaque hero model cleanly covers it.
      outline.name=`rainbow-fish-${role}-V17-contour`;outline.scale.setScalar(CHARACTER_SCALE*1.016);
      outline.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;
        mesh.name=`${mesh.name}-contour`;
        // The GLB also carries two raised cheek-glaze patches.  They read as
        // stickers once the character is lit in the garden, while the body
        // vertex paint already contains the intended soft blush.  Keep those
        // patches out of both the contour hull and the shaded clone.
        if(/cheek|glaze/i.test(mesh.name)){mesh.visible=false;return;}
        mesh.material=new T.MeshBasicMaterial({name:`${role}-soft-contour-V17`,color:CONTOUR,side:T.DoubleSide,transparent:true,opacity:.72,depthWrite:false,depthTest:true,toneMapped:false});
        this.materials.add(mesh.material as T.Material);
        mesh.renderOrder=0;mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=false;
      });
      figure.add(outline,model);model.scale.setScalar(CHARACTER_SCALE);
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
          const isEye=/iris|pupil|catchlight|eyes/i.test(`${m.name} ${mesh.name}`),
            isFin=/fins|satin|tail|pectoral|dorsal|pelvic|anal/i.test(`${m.name} ${mesh.name}`),
            isBody=/body|pearl/i.test(`${m.name} ${mesh.name}`);
          if(isEye)color.set(EYE_INK);
          if(isFin)color.lerp(new T.Color(FIN_TINT),.34);
          // The GLB vertex paint already carries the mint-to-cream gradient;
          // keep the base cream so outdoor tone mapping does not muddy the
          // character into a dark teal sphere.
          if(isBody)color.set('#fff4de');
          const material=new T.MeshPhysicalMaterial({name:`${role}-${m.name}-V16`,color,
            vertexColors:isEye?false:source.vertexColors,roughness:isEye?.14:isFin?.43:.38,
            metalness:0,clearcoat:isEye?.35:isFin?.18:.29,
            clearcoatRoughness:isEye?.05:isFin?.30:.30,iridescence:isEye?0:isFin?.025:.012,
            iridescenceIOR:1.32,iridescenceThicknessRange:[180,300],
            sheen:isEye?0:isFin?.15:.07,sheenRoughness:.58,sheenColor:new T.Color('#e6dceb'),
            envMapIntensity:isEye?.05:.55,reflectivity:isEye?.05:.32,transparent:false,opacity:1,depthWrite:true,
            side:source.side});
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
      const hover=new T.Object3D();hover.name=`hover-datum-${role}`;hover.position.set(0,.85,0);figure.add(hover);
      this.rigs.push({role,figure,model,outline,eye,hover,rest});
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

  update(frame:number,camera?:T.Camera){
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
      // Mirror the posed primary rig into the contour hull.  Copying local
      // bone transforms keeps the outline attached under arbitrary seeking.
      const outlineBones=new Map<string,T.Bone>();rig.outline.traverse(o=>{if((o as T.Bone).isBone)outlineBones.set(o.name,o as T.Bone);});
      rig.model.traverse(o=>{if(!(o as T.Bone).isBone)return;const ob=outlineBones.get(o.name);if(ob){ob.position.copy((o as T.Bone).position);ob.quaternion.copy((o as T.Bone).quaternion);ob.scale.copy((o as T.Bone).scale);}});
      // Preserve a readable three-quarter face in the final camera instead of
      // allowing the authored swim heading to turn into a side profile. Keep
      // the camera yaw on the authored heading branch, then use one fixed
      // three-quarter offset per role. Choosing the offset sign from a wrapped
      // +/-PI delta causes a one-frame flip when the aerial rail passes behind
      // the fish, so the sign is intentionally role-fixed.
      // Optional camera keeps update(frame) compatible with the numeric audit.
      let heading=pose.heading;
      if(camera&&rig.parent){
        camera.getWorldPosition(this.cameraLocal);rig.parent.worldToLocal(this.cameraLocal);
        this.cameraLocal.sub(new T.Vector3(0,EYE_HEIGHT,0));
        const cameraYaw=Math.atan2(this.cameraLocal.x,this.cameraLocal.z);
        // Re-anchor the camera yaw to the authored heading branch before the
        // fixed offset. This prevents atan2's +/-PI seam from turning into a
        // one-frame figure rotation when the camera passes behind the fish.
        // The envelope is about 40 degrees, keeping both eyes and the heart
        // tail readable in wide garden shots. The breathing term is smooth and
        // analytic, so arbitrary frame seeking remains deterministic.
        const cameraDelta=Math.atan2(Math.sin(cameraYaw-pose.heading),Math.cos(cameraYaw-pose.heading));
        const cameraYawContinuous=pose.heading+cameraDelta;
        const fixedOffset=rig.role==='friend'?.58:rig.role==='spray'?.40:.58;
        heading=cameraYawContinuous+fixedOffset+.10*Math.sin(pose.breathPhase*.71);
      }
      rig.figure.rotation.set(0,heading,0);rig.model.position.set(0,0,0);
      rig.figure.updateWorldMatrix(true,true);
      // Correct the actual bone-parented iris midpoint after posing, not an
      // arbitrary head centre. Translation leaves all anatomical proportions intact.
      const eye=rig.figure.worldToLocal(rig.eye.getWorldPosition(this.point));
      rig.model.position.set(-eye.x,EYE_HEIGHT-eye.y,-eye.z);
      rig.outline.position.copy(rig.model.position);
      rig.figure.updateWorldMatrix(true,true);
      rig.figure.userData={source:'Original skinned rainbow fish V16',eyeHeight:EYE_HEIGHT,
        hoverDatum:.85,gaitWeight:pose.swimWeight,swimWeight:pose.swimWeight,
        tailPhase:pose.tailPhase,breathPhase:pose.breathPhase,heading,railHeading:pose.heading,
        cameraThreeQuarter:!!camera,frame};
    }
  }

  dispose(){
    for(const rig of this.rigs){rig.figure.removeFromParent();const skeletons=new Set<T.Skeleton>();
      rig.model.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)skeletons.add((o as T.SkinnedMesh).skeleton);});
      rig.outline.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)skeletons.add((o as T.SkinnedMesh).skeleton);});
      for(const skeleton of skeletons)skeleton.dispose();}
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
    for(const old of this.retired)old.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometry.add(mesh.geometry);
      if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});
    for(const g of geometry)g.dispose();for(const m of materials)m.dispose();
    this.rigs=[];this.retired=[];
  }
}





