import * as T from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {clamp,ease,timeline} from './Timeline';

type Role='observer'|'friend'|'spray';
type ObserverWorld={observer:T.Group;friend:T.Group;sprayObserver:T.Group};
type Rig={role:Role;figure:T.Group;model:T.Object3D;head:T.Object3D;headPosition:T.Vector3;eye:T.Object3D;
  feet:T.Mesh[];mixer:T.AnimationMixer;idle:T.AnimationAction;walk:T.AnimationAction;
  idleHead:T.Interpolant;walkHead:T.Interpolant;parent?:T.Group};
const EYE_HEIGHT=1.55,STRIDE_METRES=.54;
const scene=(id:string)=>timeline.scenes.find(s=>s.id===id)!;
const clip=(id:string)=>timeline.clips.find(c=>c.id===id)!;
const smootherVelocity=(q:number)=>q>0&&q<1?30*q*q*(q-1)*(q-1):0;

function footMinimum(root:T.Object3D,feet:T.Mesh[]){
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),point=new T.Vector3();let min=Infinity;
  for(const foot of feet){const matrix=inverse.clone().multiply(foot.matrixWorld),p=foot.geometry.attributes.position;
    for(let i=0;i<p.count;i++){foot.getVertexPosition(i,point);point.applyMatrix4(matrix);min=Math.min(min,point.y);}}
  return min;
}

/** The two largest connected components of Head_4 are the actual black optical lenses.
 * Their front-pole midpoint is the reference, rather than an arbitrary head centre. */
function lensReference(root:T.Object3D){
  const mesh=root.getObjectByName('Head_4') as T.Mesh|undefined;
  if(!mesh?.isMesh)throw new Error('AnimatedObserverV09 requires the verified RobotExpressive GLB');
  const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,parent=new Map<string,string>();
  const key=(i:number)=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
  const keys=Array.from({length:pos.count},(_,i)=>key(i));for(const k of keys)parent.set(k,k);
  const find=(k:string):string=>{const p=parent.get(k)!;if(p===k)return k;const r=find(p);parent.set(k,r);return r;};
  for(let i=0;i<(index?.count??pos.count);i+=3){const a=find(keys[index?index.getX(i):i]);
    for(let j=1;j<3;j++)parent.set(find(keys[index?index.getX(i+j):i+j]),a);}
  const boxes=new Map<string,{count:number;box:T.Box3}>(),inverse=root.matrixWorld.clone().invert();
  const matrix=inverse.multiply(mesh.matrixWorld),point=new T.Vector3();
  for(let i=0;i<pos.count;i++){const id=find(keys[i]);if(!boxes.has(id))boxes.set(id,{count:0,box:new T.Box3()});
    const part=boxes.get(id)!;part.count++;mesh.getVertexPosition(i,point);part.box.expandByPoint(point.applyMatrix4(matrix));}
  const lenses=[...boxes.values()].sort((a,b)=>b.count-a.count).slice(0,2);
  if(lenses.length!==2||lenses.some(p=>p.count<100))throw new Error('Robot lens topology no longer matches verified source');
  const eye=new T.Vector3();for(const lens of lenses){const pole=lens.box.getCenter(new T.Vector3());pole.z=lens.box.max.z;eye.add(pole);}return eye.multiplyScalar(.5);
}

function finishMaterial(source:T.Material,role:Role){
  const isBand=source.name==='Grey',isLens=source.name==='Black';
  const main=role==='friend'?'#b69a7a':role==='spray'?'#709e94':'#5e9694';
  const material=new T.MeshPhysicalMaterial({name:`${role}-${source.name}-V09`,
    color:isLens?'#162c34':isBand?'#e6ede7':main,
    roughness:isLens?.16:isBand?.29:.30,metalness:isLens?.54:isBand?.23:.32,
    clearcoat:isLens?.85:.58,clearcoatRoughness:isLens?.14:.23,
    emissive:isLens?'#092024':'#000000',emissiveIntensity:isLens?.08:0,
    transparent:false,opacity:1,depthWrite:true});
  material.userData={riggedObserverV09:true,sourceMaterial:source.name};return material;
}

function preciseCreasedNormals(source:T.BufferGeometry,angle:number){
  const result=source.index?source.toNonIndexed():source,p=result.attributes.position;
  const normals:T.Vector3[]=[],adjacency=new Map<string,T.Vector3[]>(),keys:string[]=[];
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),edge=new T.Vector3();
  // The authored rig uses centimetre-sized local meshes beneath a scale-100 armature.
  // Three's stock utility hashes at 0.01 local units, too coarse for this particular
  // model. Use micrometre local precision to smooth truly shared vertices only.
  const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e6)).join(',');
  for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const normal=new T.Vector3().crossVectors(edge.copy(c).sub(b),a.sub(b)).normalize();
    for(let j=0;j<3;j++){const k=key(i+j);keys[i+j]=k;normals[i+j]=normal;if(!adjacency.has(k))adjacency.set(k,[]);adjacency.get(k)!.push(normal);}}
  const cosine=Math.cos(angle),values=new Float32Array(p.count*3),average=new T.Vector3();
  for(let i=0;i<p.count;i++){average.set(0,0,0);for(const n of adjacency.get(keys[i])!)if(n.dot(normals[i])>cosine)average.add(n);average.normalize();average.toArray(values,i*3);}
  result.setAttribute('normal',new T.BufferAttribute(values,3));return result;
}

function polishGeometry(source:T.BufferGeometry){
  const privateGeometry=source.clone(),angle=T.MathUtils.degToRad(49);
  const result=preciseCreasedNormals(privateGeometry,angle);if(result!==privateGeometry)privateGeometry.dispose();
  const morphs=result.morphAttributes.position??[];
  if(morphs.length){const base=result.attributes.position,normal=result.attributes.normal;
    // GLTF facial animation includes normal deltas. Rebuilding only the base normals
    // would leave an active facial target replacing them with the old faceted normals.
    result.morphAttributes.normal=morphs.map(morph=>{
      const positions=new Float32Array(base.count*3);
      for(let i=0;i<base.count;i++)for(let c=0;c<3;c++)positions[i*3+c]=morph.getComponent(i,c)+(result.morphTargetsRelative?base.getComponent(i,c):0);
      const temporary=new T.BufferGeometry();temporary.setAttribute('position',new T.BufferAttribute(positions,3));
      const smooth=preciseCreasedNormals(temporary,angle),target=smooth.attributes.normal,array=new Float32Array(base.count*3);
      for(let i=0;i<base.count;i++)for(let c=0;c<3;c++)array[i*3+c]=target.getComponent(i,c)-(result.morphTargetsRelative?normal.getComponent(i,c):0);
      smooth.dispose();return new T.BufferAttribute(array,3);
    });
  }
  return result;
}

/** CC0 Quaternius/Don McCurdy character, real upstream skeletal animation.
 * Parent groups own optical/world translation and visibility. This adapter only poses
 * private skeletal clones and never changes those parent positions or their opacity. */
export class AnimatedObserverV09{
  private rigs:Rig[]=[];
  private retired:T.Object3D[]=[];
  private geometries=new Set<T.BufferGeometry>();
  private materials=new Set<T.Material>();
  private point=new T.Vector3();
  private scale=1;
  readonly normalization:{sourceEye:number[];sourceFootY:number;scale:number;eyeHeight:number;reference:string};

  constructor(asset:T.Object3D,animations:T.AnimationClip[]){
    const idleClip=animations.find(c=>c.name==='Idle'),walkClip=animations.find(c=>c.name==='Walking');
    if(!idleClip||!walkClip)throw new Error('RobotExpressive Idle/Walking clips are required');
    const probe=cloneSkeleton(asset),probeMixer=new T.AnimationMixer(probe);
    probeMixer.clipAction(idleClip).play();probeMixer.setTime(0);probe.updateMatrixWorld(true);
    const feet:T.Mesh[]=[];probe.traverse(o=>{if((o as T.Mesh).isMesh&&/^Foot[LR]_/.test(o.name))feet.push(o as T.Mesh);});
    const floor=footMinimum(probe,feet),eyeSource=lensReference(probe);this.scale=EYE_HEIGHT/(eyeSource.y-floor);
    const probeHead=probe.getObjectByName('Head')!;
    const localEye=probeHead.worldToLocal(probe.localToWorld(eyeSource.clone()));
    this.normalization={sourceEye:eyeSource.toArray(),sourceFootY:floor,scale:this.scale,eyeHeight:EYE_HEIGHT,
      reference:'Front-pole midpoint of two actual black lens components; dynamically held at local (0,1.55,0), feet pinned to y=0'};
    probeMixer.stopAllAction();probeMixer.uncacheRoot(probe);
    for(const role of ['observer','friend','spray'] as const){
      const model=cloneSkeleton(asset),figure=new T.Group();figure.name=`actual-rigged-${role}-V09`;figure.add(model);
      const rigFeet:T.Mesh[]=[];
      model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;
        const source=mesh.geometry;
        // Preserve plates and eyebrows while polishing curved surfaces. Positions,
        // skin weights and facial morph positions stay from the original mesh.
        const smooth=polishGeometry(source);mesh.geometry=smooth;this.geometries.add(smooth);
        const sourceMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const materials=sourceMaterials.map(m=>finishMaterial(m,role));for(const m of materials)this.materials.add(m);
        mesh.material=Array.isArray(mesh.material)?materials:materials[0];mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
        if(/^Foot[LR]_/.test(mesh.name))rigFeet.push(mesh);
      });
      const head=model.getObjectByName('Head')!;const eye=new T.Object3D();eye.name=`optical-lens-reference-${role}`;eye.position.copy(localEye);head.add(eye);
      const mixer=new T.AnimationMixer(model),idle=mixer.clipAction(idleClip),walk=mixer.clipAction(walkClip);
      idle.setLoop(T.LoopRepeat,Infinity).play();walk.setLoop(T.LoopRepeat,Infinity).play();model.scale.setScalar(this.scale);
      const idleHeadTrack=idleClip.tracks.find(t=>t.name==='Head.quaternion')!,walkHeadTrack=walkClip.tracks.find(t=>t.name==='Head.quaternion')!;
      const idleHead=new T.QuaternionLinearInterpolant(idleHeadTrack.times,idleHeadTrack.values,4),walkHead=new T.QuaternionLinearInterpolant(walkHeadTrack.times,walkHeadTrack.values,4);
      this.rigs.push({role,figure,model,head,headPosition:head.position.clone(),eye,feet:rigFeet,mixer,idle,walk,idleHead,walkHead});
    }
    this.update(0);
  }

  attach(world:ObserverWorld){
    for(const rig of this.rigs){const parent=rig.role==='spray'?world.sprayObserver:world[rig.role];
      if(rig.parent===parent)continue;for(const child of [...parent.children]){parent.remove(child);this.retired.push(child);}
      parent.add(rig.figure);rig.parent=parent;
    }
    return this;
  }

  private motion(frame:number,role:Role){
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
      // The second observer arrives from off screen on its own rail. Its gait must
      // follow this 5 m entrance, rather than inheriting the first observer's dolly.
      const entryStart=clip('r031').start-180,entryDuration=210,preStart=entryStart-240;
      const entryQ=clamp((frame-entryStart)/entryDuration);
      const entranceDistance=5*ease(entryQ),entranceSpeed=5*smootherVelocity(entryQ)*timeline.fps/entryDuration;
      // The fixed core entrance starts inside the wide shot. A decelerating
      // preroll begins beyond the left frustum, keeping its visibility boundary hidden.
      const preQ=clamp((frame-preStart)/240),preDistance=18*ease(preQ),preSpeed=18*smootherVelocity(preQ)*timeline.fps/240;
      const entryShift=2.8*ease(clamp((entryStart-observer.start)/moveDuration));
      const shiftDistance=outDistance*(1-ease(returnQ));
      const shiftSpeed=observerSpeed*(1-ease(returnQ))-outDistance*smootherVelocity(returnQ)*timeline.fps/135;
      const travelled=Math.max(0,shiftDistance-entryShift)+preDistance+entranceDistance+backDistance;
      const settleTurn=ease((frame-(entryStart+entryDuration-32))/55);
      const leaveTurn=ease((frame-(observer.end-55))/42);
      return {weight:ease(clamp(Math.abs(preSpeed+entranceSpeed+shiftSpeed)/.46)),distance:travelled,
        heading:Math.PI/2+Math.PI/2*settleTurn+Math.PI/2*leaveTurn,headPitch:-.025};
    }
    const streetActive=role==='observer'&&frame<drop.start;
    const speed=streetActive?streetSpeed:observerSpeed+returnSpeed;
    const weight=ease(clamp(speed/.46));
    const turnInto=ease((frame-observer.start+12)/36),turnOut=ease((frame-(observer.start+moveDuration-10))/55);
    const returnTurn=ease((frame-(observer.end-55))/42),returnFinish=ease((frame-(observer.end+90))/65);
    const heading=Math.PI-Math.PI/2*turnInto*(1-turnOut)+Math.PI/2*returnTurn*(1-returnFinish);
    // Distance drives stride phase, so an eased dolly does not leave feet walking
    // rapidly while the world-space character is nearly stationary.
    return {weight,distance:(role==='observer'?streetDistance:0)+outDistance+backDistance,heading,headPitch:-.025};
  }

  update(frame:number){
    const seconds=Math.max(0,frame)/timeline.fps;
    for(const rig of this.rigs){const movement=this.motion(frame,rig.role);
      rig.head.position.copy(rig.headPosition);
      rig.idle.reset().setEffectiveWeight(1-movement.weight).setEffectiveTimeScale(.55).play();
      const phase=movement.distance/STRIDE_METRES*rig.walk.getClip().duration+(rig.role==='friend'?.21:0);
      rig.walk.reset().setEffectiveWeight(movement.weight).setEffectiveTimeScale(seconds>0?phase/seconds:0).play();
      rig.mixer.setTime(seconds);
      // Sample the modified head bone directly: AnimationMixer may skip an unchanged
      // binding after a nonsequential seek, so postmultiplying its prior pose can drift.
      rig.head.quaternion.fromArray(rig.idleHead.evaluate(rig.idle.time) as ArrayLike<number>);
      rig.head.quaternion.slerp(new T.Quaternion().fromArray(rig.walkHead.evaluate(rig.walk.time) as ArrayLike<number>),movement.weight);
      rig.head.rotateX(movement.headPitch);rig.figure.rotation.y=movement.heading;
      rig.model.position.set(0,0,0);rig.figure.updateWorldMatrix(true,true);
      const inverse=rig.model.matrixWorld.clone().invert();rig.eye.getWorldPosition(this.point).applyMatrix4(inverse);
      const floor=footMinimum(rig.model,rig.feet);
      const dy=EYE_HEIGHT/this.scale+floor-this.point.y;
      // A small mechanical neck translation preserves head motion while holding the
      // exact optical eye and exact floor simultaneously; never move the world parent.
      const sourceDelta=new T.Vector3(0,dy,0),rootOrigin=rig.model.getWorldPosition(new T.Vector3());
      const worldDelta=sourceDelta.clone().applyMatrix4(rig.model.matrixWorld).sub(rootOrigin);
      const headParent=rig.head.parent!,localDelta=headParent.worldToLocal(rootOrigin.clone().add(worldDelta)).sub(headParent.worldToLocal(rootOrigin.clone()));
      rig.head.position.add(localDelta);rig.figure.updateWorldMatrix(true,true);
      rig.eye.getWorldPosition(this.point).applyMatrix4(rig.model.matrixWorld.clone().invert());
      rig.model.position.set(-this.point.x*this.scale,-floor*this.scale,-this.point.z*this.scale);
      rig.figure.updateWorldMatrix(true,true);
      rig.figure.userData={source:'RobotExpressive CC0',eyeHeight:EYE_HEIGHT,gaitWeight:movement.weight,heading:movement.heading,frame};
    }
  }

  dispose(){
    for(const rig of this.rigs){rig.mixer.stopAllAction();rig.mixer.uncacheRoot(rig.model);rig.figure.removeFromParent();
      const skeletons=new Set<T.Skeleton>();rig.model.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)skeletons.add((o as T.SkinnedMesh).skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();
    const geometry=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();for(const old of this.retired)old.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometry.add(mesh.geometry);if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});
    for(const g of geometry)g.dispose();for(const m of materials)m.dispose();this.rigs=[];this.retired=[];
  }
}
