import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {loadCameraParts} from './camera_geometry.mjs';

// Exercise the rendered projection with the actual GLB and camera, including
// random-access frame requests. A stable label must not jump just because its
// model-space anchor crosses the image centre while the camera is orbiting.
const outdir='tmp/v14-opening-labels-numerical';
fs.mkdirSync(outdir,{recursive:true});
await build({entryPoints:{opening:'src/OpeningCamera.ts',camera:'src/CameraPath.ts',inventory:'src/PartsInventory.ts',visual:'src/visual.ts'},outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const load=name=>import(pathToFileURL(path.resolve(outdir,name+'.mjs')));
const {openingCameraPose,applyOpeningCameraPose}=await load('opening');
const {CameraPath,towerCameraAnchors}=await load('camera');
const {PartsInventory}=await load('inventory');
const {stateAt}=await load('visual');
const tl=JSON.parse(fs.readFileSync('src/timeline.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const geometry=await loadCameraParts(manifest),inventory=new PartsInventory(geometry.parts,tl),route=new CameraPath(tl);
route.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
const camera=new T.PerspectiveCamera(34,1920/1080,.008,200);
function sample(frame){
 for(const p of geometry.parts){p.root.position.set(0,0,0);p.offset.set(0,0,0);p.root.quaternion.identity();}
 const s=stateAt(frame,tl),cue=s.n+s.u;
 inventory.apply(cue);
 applyOpeningCameraPose(camera,openingCameraPose(frame/30,route.at(frame/30)));
 return inventory.marks(camera,cue);
}
const frames=[],stats={},jumps=[],leaderSideSwitches=[];
let previous=[];
for(let f=0;f<1800;f++){
 const marks=sample(f);frames.push(marks);
 for(const m of marks){
  if(![m.x,m.y,m.width,m.weight,m.anchor?.x??0,m.anchor?.y??0].every(Number.isFinite))throw Error('Non-finite label F'+f);
  if(m.x-m.width/2<70||m.x+m.width/2>1850||m.y<170||m.y+100>940)throw Error('Unsafe label bounds F'+f);
  const before=previous.find(p=>p.id===m.id);
  if(before){
   const delta=Math.hypot(m.x-before.x,m.y-before.y);
   if(delta>6)jumps.push({frame:f,id:m.id,pixels:delta,before:before.x,after:m.x});
   // Film bends its leader based on label-versus-anchor X. This side must
   // also stay stable, otherwise the leader could jump with stationary text.
   if(m.anchor&&before.anchor&&Math.sign(m.x-m.anchor.x)!==Math.sign(before.x-before.anchor.x))leaderSideSwitches.push({frame:f,id:m.id});
  }
  const stat=stats[m.id]??={first:f,last:f,frames:0,xMin:Infinity,xMax:-Infinity,anchorXMin:Infinity,anchorXMax:-Infinity,anchorYMin:Infinity,anchorYMax:-Infinity};
  stat.last=f;stat.frames++;stat.xMin=Math.min(stat.xMin,m.x);stat.xMax=Math.max(stat.xMax,m.x);
  if(m.anchor){stat.anchorXMin=Math.min(stat.anchorXMin,m.anchor.x);stat.anchorXMax=Math.max(stat.anchorXMax,m.anchor.x);stat.anchorYMin=Math.min(stat.anchorYMin,m.anchor.y);stat.anchorYMax=Math.max(stat.anchorYMax,m.anchor.y);}
 }
 previous=marks;
}
// A full reverse seek pass catches frame-state smoothing and sticky-side
// implementations that happen to look correct only during forward playback.
for(let f=1799;f>=0;f--)if(JSON.stringify(sample(f))!==JSON.stringify(frames[f]))throw Error('Seek-dependent labels F'+f);
const sourceFiles=['src/PartsInventory.ts','src/OpeningCamera.ts','src/CameraPath.ts','src/Film.tsx','src/timeline.json','public/models/shanghai-tower.glb','scripts/check_opening_labels_v14.mjs'];
const report={sourceSHA256:Object.fromEntries(sourceFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),passed:jumps.length===0&&leaderSideSwitches.length===0,frameCount:frames.length,reverseSeekIdentical:true,jumps,leaderSideSwitches,stats,scope:'Actual GLB anchors and authored camera projected for all opening frames. Numerical continuity and safe margins; not an aesthetic or mesh occlusion certificate.'};
const out=process.argv[2]??'research/qa/v14-opening/labels-numerical.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
geometry.dispose();console.log(JSON.stringify({out,...report},null,2));if(!report.passed)process.exitCode=1;
