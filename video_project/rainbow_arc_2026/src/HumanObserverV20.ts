import * as T from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';

/** V20 human observer wrapper for the rigged stylised proxy.
 *
 * It intentionally exposes the same attach/update/dispose shape as the prior
 * FishObserver so the film can switch characters without changing WorldV10.
 * The model's world-space eye height is normalized to the existing 1.55m
 * observer marker; only a deterministic idle clip is sampled per frame.
 */
type ObserverWorld={observer:T.Group;friend:T.Group;sprayObserver:T.Group};
type Role='observer'|'friend'|'spray';
type HumanRig={role:Role;figure:T.Group;model:T.Object3D;parent?:T.Group;mixer?:T.AnimationMixer;duration:number;modelHeight:number};
const EYE_HEIGHT=1.55;
const MODEL_SCALE=.83;

function disposeObject(root:T.Object3D){
  const geoms=new Set<T.BufferGeometry>(), mats=new Set<T.Material>();
  root.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geoms.add(m.geometry); if(m.material)for(const x of Array.isArray(m.material)?m.material:[m.material])mats.add(x);});
  for(const g of geoms)g.dispose(); for(const m of mats)m.dispose();
}

export class HumanObserverV20{
  private rigs:HumanRig[]=[];
  private retired:T.Object3D[]=[];
  readonly normalization={scale:MODEL_SCALE,eyeHeight:EYE_HEIGHT,reference:'V20 stylised human proxy, round glasses/head anchor'};
  constructor(asset:T.Object3D, animations:T.AnimationClip[]=[]){
    asset.updateMatrixWorld(true);
    for(const role of ['observer','friend','spray'] as Role[]){
      const model=cloneSkeleton(asset); model.name=`human-v20-model-${role}`; model.scale.setScalar(MODEL_SCALE);
      // The authored Blender proxy is Z-up; after GLTF Y-up conversion its
      // eye line remains just above the existing 1.55m marker. A tiny offset
      // keeps shoe contact at the parent ground datum while avoiding floating.
      model.position.set(0,-.02,0);
      const figure=new T.Group(); figure.name=`human-v20-${role}`; figure.add(model);
      model.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;}});
      const mixer=animations.length?new T.AnimationMixer(model):undefined;
      const clip=animations[0]; if(mixer&&clip)mixer.clipAction(clip).play();
      const box=new T.Box3().setFromObject(model),duration=clip&&clip.duration>0?clip.duration:4;
      this.rigs.push({role,figure,model,mixer,duration,modelHeight:box.max.y-box.min.y});
    }
    this.update(0);
  }
  attach(world:ObserverWorld){
    for(const rig of this.rigs){
      const parent=rig.role==='friend'?world.friend:rig.role==='spray'?world.sprayObserver:world.observer;
      if(rig.parent===parent)continue;
      for(const child of [...parent.children]){parent.remove(child);this.retired.push(child);}
      parent.add(rig.figure);rig.parent=parent;
    }
    return this;
  }
  update(frame:number,_camera?:T.Camera){
    const t=frame/30;
    for(const rig of this.rigs){
      // setTime is analytic, so arbitrary Remotion seeks remain reproducible.
      if(rig.mixer)rig.mixer.setTime((t%rig.duration+rig.duration)%rig.duration);
      const head=rig.model.getObjectByName('Head');
      if(head){head.rotation.x=.010*Math.sin(t*.55);head.rotation.y=.016*Math.sin(t*.43+.6);head.rotation.z=.006*Math.sin(t*.37);}
      // A restrained upper-body breath keeps the still shots alive without
      // fighting the authored idle clip or changing screen direction.
      const chest=rig.model.getObjectByName('Chest');
      if(chest)chest.rotation.z=.004*Math.sin(t*.7+(rig.role==='friend'?1:.2));
      rig.figure.userData={source:'V20 stylised human rainbow observer',role:rig.role,frame,eyeHeight:EYE_HEIGHT,scale:MODEL_SCALE,deterministic:true};
    }
  }
  dispose(){
    for(const rig of this.rigs){rig.figure.removeFromParent();disposeObject(rig.model);}
    for(const old of this.retired)disposeObject(old);
    this.rigs=[];this.retired=[];
  }
}
