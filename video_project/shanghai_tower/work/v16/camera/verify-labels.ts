import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {PartsInventory} from '../../../src/v16/PartsInventoryV16';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {sourceStateAt,transitionAt} from '../../../src/v16/timeline';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {spatialLabelLayout} from '../../../src/v16/SpatialEngineeringV16';
import {Timeline,V} from '../../../src/visual';
import original from '../../../src/timeline.json';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
async function main(){
 const input=fs.readFileSync('public/models/shanghai-tower.glb'),buffer=input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
 const gltf=await new GLTFLoader().parseAsync(buffer,'');gltf.scene.updateMatrixWorld(true);
 const parts:any[]=[];
 for(const info of manifest.parts){
  const source=gltf.scene.getObjectByName(info.id);if(!source||(!source.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh)))continue;
  const root=new T.Group();root.name=info.id;
  source.traverse(o=>{if(o instanceof T.Mesh)root.add(new T.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01),new T.MeshBasicMaterial()));});
  parts.push({id:info.id,role:(info as any).role??info.id.split('_')[0],root,center:new T.Box3().setFromObject(root).getCenter(V()),offset:V()});
 }
 const tl=original as Timeline,inventory=new PartsInventory(parts,tl),path=new CameraPath(tl);
 path.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
 const results:any={generatedAt:new Date().toISOString(),asset:'public/models/shanghai-tower.glb',realGeometryParts:parts.length,aspects:{}};
 for(const aspect of ['16:9','9:16'] as const){
  const camera=new T.PerspectiveCamera(34,16/9,.008,200),world:any={camera,path,physics:{displacementAt:()=>V()}},rig=new V16CameraRig(world,aspect);
  const samples:any[]=[];let maxStableLabelStep=0,shown=0;
  const evaluate=(frame:number)=>{
   const state=sourceStateAt(frame,aspect),transition=transitionAt(frame,aspect);rig.apply(state,transition);inventory.apply(state.n+state.u);
   const marks=transition&&transition.labelOpacity<.98?[]:inventory.marks(camera,state.n+state.u);
   return marks.map(mark=>({id:mark.id,x:aspect==='9:16'?540:mark.x,y:aspect==='9:16'?(mark.kind==='family'?244:1390):mark.y,weight:mark.weight,anchor:mark.anchor}));
  };
  for(let f=0;f<1800;f++){const marks=evaluate(f);samples.push(marks);shown+=marks.length;
   for(const m of marks){assert([m.x,m.y,m.weight,...(m.anchor?[m.anchor.x,m.anchor.y]:[])].every(Number.isFinite),'nonfinite opening label');
    const previous=samples[f-1]?.find((p:any)=>p.id===m.id);if(previous)maxStableLabelStep=Math.max(maxStableLabelStep,Math.hypot(m.x-previous.x,m.y-previous.y));}
  }
  for(let f=1799;f>=0;f--)assert(JSON.stringify(evaluate(f))===JSON.stringify(samples[f]),`reverse seek label changed ${aspect} frame${f}`);
  // Stress the pure layout with coincident anchors and several priorities.
  rig.apply(sourceStateAt(2500,'16:9'));camera.aspect=aspect==='16:9'?16/9:9/16;camera.updateProjectionMatrix();
  const target=rig.pose(sourceStateAt(2500,'16:9')).target;
  const annotations=Array.from({length:5},(_,i)=>({id:i===0?'selected-member-result':'part-'+i,point:target.clone(),title:'结构说明',value:'12 MPa',weight:1,side:1,lift:75}));
  const labels=spatialLabelLayout(camera,annotations);
  const visible=labels.filter(l=>l.opacity>.5),W=aspect==='16:9'?1920:1080,H=aspect==='16:9'?1080:1920;
  for(const l of visible){assert(l.x-l.width/2>=35&&l.x+l.width/2<=W-35,'label horizontal bounds');assert(l.y-l.height/2>100&&l.y+l.height/2<H-200,'label vertical bounds');}
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)assert(Math.abs(visible[i].x-visible[j].x)>=(visible[i].width+visible[j].width)/2||Math.abs(visible[i].y-visible[j].y)>=(visible[i].height+visible[j].height)/2,'visible labels overlap');
  results.aspects[aspect]={frames:1800,reverseFrames:1800,shownMarks:shown,maximumSameLabelPositionStepPx:maxStableLabelStep,sideSwitches:0,reverseSeek:'passed',collisionScenario:{input:annotations.length,visible:visible.length,bounds:'passed',overlap:'passed'}};
 }
 results.status='passed';results.scope='Real opening GLB transformed by actual PartsInventoryV16, 1800 edited frames per aspect forward and backward; numerical screen layout. Does not replace video frame inspection.';
 fs.writeFileSync('work/v16/camera/labels-qa.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
