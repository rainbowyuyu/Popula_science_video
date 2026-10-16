import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/hypertension/timeline.json'),'utf8'));
const physics=JSON.parse(fs.readFileSync(path.join(root,'public/hypertension/physics.json'),'utf8'));
const stem=`hypertension-flow-v5-${process.pid}-${Date.now()}`,generated=[];
const sourceFiles=['src/hypertension/World.ts','src/hypertension/VascularDetail.ts','src/hypertension/timeline.json','public/hypertension/physics.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const sourceHashes=hashes();
for(const name of ['World','VascularDetail','CameraPath']){
 let source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8');
 source=source.replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`).replace("'./CameraPath'",`'./${stem}-CameraPath.mjs'`).replace("'./VascularDetail'",`'./${stem}-VascularDetail.mjs'`);
 const out=path.join(root,'tmp',`${stem}-${name}.mjs`);generated.push(out);fs.writeFileSync(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
try{
 const {HypertensionWorld}=await import(pathToFileURL(path.join(root,'tmp',`${stem}-World.mjs`)).href);
 const {ArterioleDetail}=await import(pathToFileURL(path.join(root,'tmp',`${stem}-VascularDetail.mjs`)).href);
 const world=Object.create(HypertensionWorld.prototype);Object.assign(world,{physics,vessel:{length:1.72},flowPhase:new Float64Array(timeline.duration+2)});world.integrateFlow();
 const model=new ArterioleDetail(),first=timeline.clips.find(c=>c.id==='h018'),last=timeline.clips.find(c=>c.id==='h022');
 const begin=Math.max(0,first.start-60),end=Math.min(timeline.duration-1,last.end+60),details=[];
 const stats=[['redCells',model.cellMesh],['plasmaParticles',model.plasmaMesh]].map(([kind,mesh])=>({kind,mesh,minAdvancePerFrame:Infinity,maxAdvancePerFrame:-Infinity,minFrame:0,negativeNonWrapSteps:0,expectedBoundaryWraps:0,samples:0,prior:null}));
 for(let frame=begin;frame<=end;frame++){
  const time=frame/30,constriction=world.arterioleContraction(time),pulse=world.solvedExpansion('baseline',time),flowPhase=world.arteriolePhase[frame];
  model.update({time,activation:1,constriction,pressure:.28+constriction*.5,pulse,flowPhase});
  for(const stat of stats){const values=Array.from({length:stat.mesh.count},(_,i)=>stat.mesh.instanceMatrix.array[i*16+12]);
   if(stat.prior)values.forEach((x,i)=>{const advance=x-stat.prior[i];if(advance< -1.272){stat.expectedBoundaryWraps++;return;}stat.samples++;if(advance<stat.minAdvancePerFrame){stat.minAdvancePerFrame=advance;stat.minFrame=frame;}stat.maxAdvancePerFrame=Math.max(stat.maxAdvancePerFrame,advance);if(advance<=0){stat.negativeNonWrapSteps++;details.push({frame,particle:i,kind:stat.kind,advance});}});stat.prior=values;
  }
 }
 const particles=stats.map(({mesh,prior,...stat})=>({...stat,particleCount:mesh.count}));
 const direction={createdAt:new Date().toISOString(),passed:particles.every(s=>s.negativeNonWrapSteps===0),totalFilmFrames:timeline.duration,fps:timeline.fps,source:'Fresh current-source TypeScript modules; actual World.integrateFlow(), arterioleContraction(), solvedExpansion() and ArterioleDetail.update() executed. No prior compiled cache imported.',physicsIntegration:{physics:'public/hypertension/physics.json',pulseCase:'baseline',phaseRule:'Actual production integrated phase passed at each frame; midpoint integration includes contraction and solved pulse expansion'},scope:{startFrame:begin,endFrame:end,sampledFrames:end-begin+1,firstClip:'h018',firstClipStart:first.start,lastClip:'h022',lastClipStart:last.start,lastClipEnd:last.end,paddingSeconds:2,limits:'Direction of explanatory RBC/plasma particle matrices in the central cutaway only; does not claim CFD, flow through all newly connected branches, or pixel-level visibility.'},particles,negativeNonWrapSteps:particles.reduce((n,s)=>n+s.negativeNonWrapSteps,0),expectedBoundaryWraps:particles.reduce((n,s)=>n+s.expectedBoundaryWraps,0),details:details.slice(0,20),sourceHashes};
 // Controlled steady-state cases still execute the same production integrator.
 // Only physiological inputs are held constant; its integration algebra is not reimplemented.
 const steadyRate=contraction=>{const fixed=Object.create(HypertensionWorld.prototype);Object.assign(fixed,{physics,vessel:{length:1.72},flowPhase:new Float64Array(3),arterioleContraction:()=>contraction,solvedExpansion:()=>0});fixed.integrateFlow();return (fixed.arteriolePhase[2]-fixed.arteriolePhase[1])*30;};
 const lumenRadiusAt=x=>{const shell=model.shells[0],attr=shell.geometry.attributes.position,f=(x/model.length+.5)*shell.nx,lo=Math.max(0,Math.min(shell.nx-1,Math.floor(f))),q=Math.max(0,Math.min(1,f-lo));const r=i=>{const j=shell.n+i*(shell.nt+1);return Math.hypot(attr.getY(j),attr.getZ(j));};return r(lo)*(1-q)+r(lo+1)*q;};
 const dt=1/30,startPhase=.231,cases=[],baselineRate=steadyRate(0);
 model.update({time:8,activation:1,constriction:0,pulse:0,flowPhase:startPhase});
 const baselineFlux=Math.PI*lumenRadiusAt(0)**2*model.length*baselineRate;
 const quantile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*q)];
 for(const contraction of [0,.3,.30/.39]){
  const rate=steadyRate(contraction);model.update({time:8,activation:1,constriction:contraction,pulse:0,flowPhase:startPhase});
  const centerRadius=lumenRadiusAt(0),previous=Array.from({length:model.cellMesh.count},(_,i)=>model.cellMesh.instanceMatrix.array[i*16+12]);
  model.update({time:8+dt,activation:1,constriction:contraction,pulse:0,flowPhase:startPhase+rate*dt});
  const normalized=[];let wraps=0;
  previous.forEach((x,i)=>{const next=model.cellMesh.instanceMatrix.array[i*16+12],dx=next-x;if(dx< -1){wraps++;return;}const flow=Math.PI*lumenRadiusAt((x+next)*.5)**2*dx/dt;normalized.push(flow/baselineFlux);});
  cases.push({contraction,centerRadiusRatio:centerRadius/model.radius,meanAreaRatio:baselineRate/rate,integratedPhaseRate:rate,medianNormalizedAV:quantile(normalized,.5),minNormalizedAV:Math.min(...normalized),maxNormalizedAV:Math.max(...normalized),maxAbsoluteError:Math.max(...normalized.map(x=>Math.abs(x-1))),samples:normalized.length,excludedBoundaryWraps:wraps});
 }
 const constant={createdAt:new Date().toISOString(),passed:cases.every(c=>c.maxAbsoluteError<.01),method:'Current production World.integrateFlow() with controlled constant contraction and zero pulse supplies phase rate. Actual current ArterioleDetail.update() supplies particle transforms. Area is measured/interpolated from the updated inner-wall geometry; finite-difference velocity × area compared with relaxed baseline.',model:'96-cell cumulative-volume advection map; actual 64-axial-segment wall measurement; 58 RBC tracers per condition; dt=1/30s',scope:'Three steady central-lumen cases only. Does not assert globally incompressible moving-wall flow, daughter-branch CFD, patient physiology, or validate bridge vessel flow. Interpolation/discretization tolerance 1%.',baselineFlux,cases,sourceHashes};
 if(JSON.stringify(hashes())!==JSON.stringify(sourceHashes))throw Error('Production inputs changed while auditing; results are not saved.');
 fs.writeFileSync(path.join(root,'research/hypertension/arteriole-flow-direction-qa.json'),JSON.stringify(direction,null,2));
 fs.writeFileSync(path.join(root,'research/hypertension/arteriole-constant-flow-qa.json'),JSON.stringify(constant,null,2));
 console.log(JSON.stringify({direction:{passed:direction.passed,sampledFrames:direction.scope.sampledFrames,negativeNonWrapSteps:direction.negativeNonWrapSteps,nonWrapSamples:particles.reduce((n,s)=>n+s.samples,0)},constant:{passed:constant.passed,cases},sourceHashes},null,2));
 model.dispose();if(!direction.passed||!constant.passed)process.exitCode=1;
}finally{for(const file of generated)fs.unlinkSync(file);}
