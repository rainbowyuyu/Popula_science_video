/** Numerical audit of the actual V7 rail + actual typography geometry.
 * Run: node scripts/audit-v7-motion.mjs
 * Outputs only work/v7/qa-motion; warnings remain warnings, not a visual-quality pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work/v7/qa-motion');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceRail=read('src/CameraRail.ts'),sourceType=read('src/WorldTypography.ts'),story=JSON.parse(read('src/story.json'));
const chapters=story.scenes.map(s=>({id:s.chapter,start:s.start,end:s.end}));
const fps=30,W=1920,H=1080,duration=Math.ceil(Math.max(...chapters.map(x=>x.end))*fps)/fps;
function compile(source,file){
 const result=ts.transpileModule(source,{fileName:file.replace(/\.mjs$/,'.ts'),reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,strict:true}});
 const fatal=(result.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 if(fatal.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(fatal,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=>"\n"}));
 fs.writeFileSync(path.join(out,file),result.outputText);return pathToFileURL(path.join(out,file)).href;
}
const railURL=compile(sourceRail,'CameraRail.audit.mjs');
const {sampleCamera}=await import(railURL);
let adapted=sourceType;
const replacements=[
 [/import \{ sampleCamera \} from '\.\/CameraRail';/,`import {sampleCamera} from './CameraRail.audit.mjs';`],
 [/import \{ chapters \} from '\.\/timeline';/,`const chapters=${JSON.stringify(chapters)};`],
 [/import story from '\.\/story\.json';/,`const story=${JSON.stringify(story)};`],
 [/import series from '\.\.\/data\/series36\.json';/,`const series=${read('data/series36.json')};`],
 [/import fontData from '\.\.\/public\/fonts\/marine-display\.typeface\.json';/,`const fontData=${read('public/fonts/marine-display.typeface.json')};`],
];
for(const [re,value]of replacements){if(!re.test(adapted))throw new Error('Source interface changed; audit adapter needs review: '+re);adapted=adapted.replace(re,value);}
const {createWorldTypography}=await import(compile(adapted,'WorldTypography.audit.mjs'));
const camera=new T.PerspectiveCamera(50,W/H,.2,12000),scene=new T.Scene();
const typography=createWorldTypography(scene,camera);
const vec=a=>new T.Vector3(...a),deg=x=>x*180/Math.PI;
function setCamera(t){const s=sampleCamera(t,chapters);camera.position.fromArray(s.position);camera.lookAt(vec(s.target));camera.fov=s.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return s;}
const chapterAt=t=>chapters.find(x=>t>=x.start&&t<=x.end)?.id??'narration_gap';
const samples=[],failures=[],warnings=[];
for(let frame=0;frame<Math.ceil(duration*fps);frame++){
 const t=frame/fps,s=setCamera(t),values=[...s.position,...s.target,s.fov];
 if(!values.every(Number.isFinite))failures.push({kind:'nonfinite',frame,t,values});
 const distance=vec(s.target).distanceTo(vec(s.position));
 if(distance<.01)failures.push({kind:'degenerate_view',frame,t,distance});
 samples.push({frame,t,chapter:chapterAt(t),...s,quaternion:camera.quaternion.toArray()});
}
const steps=[];
for(let i=1;i<samples.length;i++){
 const a=samples[i-1],b=samples[i];
 const dp=vec(b.position).sub(vec(a.position)),dq=new T.Quaternion().fromArray(a.quaternion).angleTo(new T.Quaternion().fromArray(b.quaternion));
 const prev=i>1?vec(a.position).sub(vec(samples[i-2].position)):dp.clone();
 steps.push({frame:i,t:b.t,chapter:b.chapter,displacementM:dp.length(),speedMps:dp.length()*fps,angularStepDeg:deg(dq),angularSpeedDegps:deg(dq)*fps,fovStepDeg:Math.abs(b.fov-a.fov),accelerationMps2:dp.sub(prev).length()*fps*fps});
}
// These are transparent review triggers, not universal cinematography laws.
const thresholds={displacementWarnMPerFrame:1.5,angularWarnDegPerFrame:1.0,fovWarnDegPerFrame:.15,accelerationWarnMps2:25,hardCameraDisplacementMPerFrame:12,hardAngularDegPerFrame:10,hardFovDegPerFrame:2};
const fast=steps.filter(x=>x.displacementM>thresholds.displacementWarnMPerFrame||x.angularStepDeg>thresholds.angularWarnDegPerFrame||x.fovStepDeg>thresholds.fovWarnDegPerFrame||x.accelerationMps2>thresholds.accelerationWarnMps2);
for(const x of steps)if(x.displacementM>thresholds.hardCameraDisplacementMPerFrame||x.angularStepDeg>thresholds.hardAngularDegPerFrame||x.fovStepDeg>thresholds.hardFovDegPerFrame)failures.push({kind:'large_frame_jump',...x});
function compressSpans(rows){const spans=[];for(const r of rows){const prev=spans.at(-1);if(prev&&r.frame===prev.endFrame+1){prev.endFrame=r.frame;prev.end=r.t;prev.maxSpeedMps=Math.max(prev.maxSpeedMps,r.speedMps);prev.maxAngularDegps=Math.max(prev.maxAngularDegps,r.angularSpeedDegps);prev.maxAcceleration=Math.max(prev.maxAcceleration,r.accelerationMps2);}else spans.push({startFrame:r.frame,endFrame:r.frame,start:r.t,end:r.t,chapter:r.chapter,maxSpeedMps:r.speedMps,maxAngularDegps:r.angularSpeedDegps,maxAcceleration:r.accelerationMps2});}return spans;}
const stopSpans=compressSpans(steps.filter(x=>x.speedMps<.01)).filter(x=>x.end-x.start>=.12);
const fastSpans=compressSpans(fast);if(fastSpans.length)warnings.push({kind:'motion_review_ranges',count:fastSpans.length,ranges:fastSpans});
const metrics={};for(const key of ['displacementM','speedMps','angularStepDeg','angularSpeedDegps','fovStepDeg','accelerationMps2'])metrics[key]=steps.slice().sort((a,b)=>b[key]-a[key]).slice(0,8).map(x=>({frame:x.frame,t:x.t,chapter:x.chapter,value:x[key]}));
// Seek determinism: evaluate reverse and non-monotonic calls after forward pass.
let mismatches=0;const seekFrames=[0,samples.length-1,72,1148,10873,0,...Array.from({length:101},(_,i)=>(i*7919)%samples.length)].filter(x=>x<samples.length);
for(const frame of seekFrames){const s=sampleCamera(frame/fps,chapters),baseline=samples[frame];if(JSON.stringify(s.position)!==JSON.stringify(baseline.position)||JSON.stringify(s.target)!==JSON.stringify(baseline.target)||s.fov!==baseline.fov)mismatches++;}
if(mismatches)failures.push({kind:'seek_camera_nondeterministic',mismatches});
const seamChecks=[];
for(let i=1;i<chapters.length;i++){
 const left=chapters[i-1],right=chapters[i];
 for(const edge of [{name:'narration_end',t:left.end},{name:'chapter_start',t:right.start}]){
  const eps=1e-4,a=sampleCamera(edge.t-eps,chapters),b=sampleCamera(edge.t+eps,chapters),v0=sampleCamera(edge.t-2*eps,chapters),v1=sampleCamera(edge.t+2*eps,chapters);
  const displacement=vec(b.position).distanceTo(vec(a.position));
  const before=vec(a.position).sub(vec(v0.position)).multiplyScalar(1/eps),after=vec(v1.position).sub(vec(b.position)).multiplyScalar(1/eps);
  const row={from:left.id,to:right.id,edge:edge.name,t:edge.t,narrationGapSeconds:right.start-left.end,positionDeltaAcross0_2ms:displacement,velocityDeltaMps:after.sub(before).length(),fovDelta:Math.abs(b.fov-a.fov)};
  seamChecks.push(row);if(displacement>.10||row.fovDelta>.02)failures.push({kind:'seam_discontinuity',...row});else if(row.velocityDeltaMps>.20)warnings.push({kind:'seam_speed_kink',...row});
 }
}
const vp=new T.Matrix4(),frustum=new T.Frustum(),mirror=new T.Matrix4().makeScale(1,-1,1);
function visibilityEvidence(object,t,reflection=false){
 setCamera(t);typography.update(t,camera);scene.updateMatrixWorld(true);vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(vp);
 let count=0,hits=0;const names=[];const bounds=[];
 object.traverse(mesh=>{if(!mesh.isMesh||!mesh.geometry)return;count++;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const mat=reflection?mirror.clone().multiply(mesh.matrixWorld):mesh.matrixWorld;const box=mesh.geometry.boundingBox.clone().applyMatrix4(mat);if(frustum.intersectsBox(box)){hits++;if(names.length<6)names.push(mesh.name||mesh.type);}if(mesh.name.startsWith('WorldGlyph_')){for(const x of [mesh.geometry.boundingBox.min.x,mesh.geometry.boundingBox.max.x])for(const y of [mesh.geometry.boundingBox.min.y,mesh.geometry.boundingBox.max.y])for(const z of [mesh.geometry.boundingBox.min.z,mesh.geometry.boundingBox.max.z]){const p=new T.Vector3(x,y,z).applyMatrix4(mat),cv=p.clone().applyMatrix4(camera.matrixWorldInverse);if(cv.z<-.2){p.project(camera);bounds.push([(p.x+1)*W/2,(1-p.y)*H/2]);}}}});
 return {t,groupVisibleFlag:object.visible,reflectionProxy:reflection,testedMeshes:count,intersectingMeshAABBs:hits,intersectionsSample:names,glyphBoundsPx:bounds.length?{left:Math.min(...bounds.map(x=>x[0])),right:Math.max(...bounds.map(x=>x[0])),top:Math.min(...bounds.map(x=>x[1])),bottom:Math.max(...bounds.map(x=>x[1]))}:null};
}
const typeChecks=[];
for(const a of typography.anchors){
 const object=scene.getObjectByName(a.name);if(!object)throw new Error('Missing actual typography object '+a.name);
 // Discover visibility flips from the component itself; do not assume its authored ramp.
 const scanStart=Math.max(0,a.start-1),scanEnd=Math.min(duration,a.end+1),events=[];let previous=null;
 for(let f=Math.floor(scanStart*fps);f<=Math.ceil(scanEnd*fps);f++){
  const t=f/fps;typography.update(t,camera);const visible=object.visible;if(!previous&&f===0&&visible)events.push({kind:'film_start_visible',previousFrame:null,frame:f,t});if(previous&&visible!==previous.visible)events.push({kind:visible?'load':'unload',previousFrame:previous.frame,frame:f,t});previous={visible,frame:f};
 }
 const transitions=[];
 for(const e of events){
  const ts=e.kind==='unload'?(e.frame-1)/fps:e.t;
  const main=visibilityEvidence(object,ts,false),reflected=visibilityEvidence(object,ts,true);
  const verdict=main.intersectingMeshAABBs===0&&reflected.intersectingMeshAABBs===0?'offscreen_in_both_conservative_tests':'REVIEW_conservative_intersection';
  transitions.push({...e,testedAt:ts,main,reflected,verdict});
  if(verdict.startsWith('REVIEW'))warnings.push({kind:'typography_cull_may_be_visible',name:a.name,...e,mainHits:main.intersectingMeshAABBs,reflectionHits:reflected.intersectingMeshAABBs,note:'Mesh world AABB is conservative. A hit does not prove a visible pixel; inspect the listed frame.'});
 }
 const mid=(a.start+Math.min(a.end,duration))/2;
 const reading=[a.start+.9,mid,Math.min(a.end,duration)-.9].filter(t=>t>=0&&t<=duration).map(t=>visibilityEvidence(object,t,false));
 for(const r of reading){const b=r.glyphBoundsPx;if(b&&(b.left<48||b.right>1872||b.top<128||b.bottom>900))warnings.push({kind:'typography_reading_safe_zone',name:a.name,t:r.t,bounds:b,note:'Advisory at 0.9s after entry/mid/0.9s before exit; the fixed sign may intentionally be entering/leaving the frame. Visual review needed.'});}
 typography.update(mid,camera);scene.updateMatrixWorld(true);const baseline=object.children[0].matrixWorld.elements.slice();typography.update(0,camera);typography.update(duration,camera);typography.update(mid,camera);scene.updateMatrixWorld(true);const after=object.children[0].matrixWorld.elements;
 const stable=baseline.every((v,i)=>v===after[i]);if(!stable)failures.push({kind:'typography_seek_nondeterministic',name:a.name});
 typeChecks.push({name:a.name,start:a.start,end:a.end,worldAnchor:a.position,transitions,reading,seekDeterministic:stable,endOutsideFilm:a.end>duration});
}
typography.dispose();
const report={created:new Date().toISOString(),auditVersion:1,sourceHashes:{CameraRail:hash(sourceRail),WorldTypography:hash(sourceType),story:hash(read('src/story.json'))},fps,durationSeconds:duration,frames:samples.length,scope:'Numerical rail + actual text mesh bounds. No WebGL rendered occlusion, material transparency, water sorting, sound, or aesthetic certification.',thresholds,finiteAndLookDirection:{finite:!failures.some(x=>x.kind==='nonfinite'),degenerateView:failures.filter(x=>x.kind==='degenerate_view').length},seekDeterminism:{tests:seekFrames.length,mismatches},metrics,motionReviewRanges:fastSpans,nearStationarySpans:stopSpans,seamChecks,typography:typeChecks,warnings,failures,status:failures.length?'FAIL_NUMERIC':warnings.length?'NUMERIC_VALID_WITH_REVIEW':'NUMERIC_VALID',limitations:['Reflection culling mirrors each mesh AABB across y=0; displaced waves/refraction and renderer clip bias are not reproduced.','An intersecting AABB is conservative and may have no visible pixels; an offscreen AABB proves geometry is outside the tested frustum.','Geometry safe zones concern letters only, not material legibility. No assertion that wind turbines or other scene objects cannot occlude text.','Camera velocity/acceleration thresholds are declared review triggers, not validated comfort limits.','Only existing current source is tested; report hashes become stale if source changes.']};
fs.writeFileSync(path.join(out,'motion-audit.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'motion-frames.csv'),'frame,time,chapter,displacement_m,speed_mps,angle_deg,fov_delta_deg,acceleration_mps2\n'+steps.map(x=>[x.frame,x.t,x.chapter,x.displacementM,x.speedMps,x.angularStepDeg,x.fovStepDeg,x.accelerationMps2].join(',')).join('\n'));
const md=['# V7 数值运动审计','',`状态：${report.status}。${samples.length}帧，${duration.toFixed(3)}秒，30fps。`, '','本报告只对当前文件哈希成立；不能代替正常速度看片、遮挡检查或听审。','',`- 有限值：${report.finiteAndLookDirection.finite}；退化朝向：${report.finiteAndLookDirection.degenerateView}。`,`- 随机顺序定位：${seekFrames.length}次，${mismatches}次不一致。`,`- 最高单帧位移：${metrics.displacementM[0].value.toFixed(4)}m，${metrics.displacementM[0].t.toFixed(3)}s。`,`- 最高单帧朝向转角：${metrics.angularStepDeg[0].value.toFixed(4)}°，${metrics.angularStepDeg[0].t.toFixed(3)}s。`,`- 最高单帧FOV变化：${metrics.fovStepDeg[0].value.toFixed(5)}°。`,`- ${seamChecks.length}处边界左右0.1ms检查；${failures.length}项硬失败，${warnings.length}项需复看片。`,'','## 需复看片段','',...fastSpans.map(x=>`- ${x.start.toFixed(3)}–${x.end.toFixed(3)}秒（${x.chapter}）：速度峰值${x.maxSpeedMps.toFixed(2)}m/s，转速峰值${x.maxAngularDegps.toFixed(2)}°/s，加速度峰值${x.maxAcceleration.toFixed(2)}m/s²。`),'','## 低速停顿','',...stopSpans.map(x=>`- ${x.start.toFixed(3)}–${x.end.toFixed(3)}秒：速度低于0.01m/s。多为章间0.22秒口播间隙；这是连续停顿，不是断帧。若要求摄影机不停，可再调整章间相机轨道。`),'','## 三维文字加载/卸载','',...typeChecks.map(x=>`- ${x.name}：${x.transitions.map(t=>`${t.kind}@${t.t.toFixed(3)}s → ${t.verdict}`).join('；')||'片内未发生visible翻转'}。`),'','## 其他复查项目','',...warnings.filter(x=>x.kind!=='motion_review_ranges').map(x=>`- ${x.kind}：${x.name??x.from??''} ${x.t?.toFixed?.(3)??''}秒。${x.note??''}`),'','## 限制','',...report.limitations.map(x=>'- '+x),''];
fs.writeFileSync(path.join(out,'motion-audit.md'),md.join('\n'));
console.log(JSON.stringify({status:report.status,frames:report.frames,finite:report.finiteAndLookDirection.finite,deterministic:!mismatches,hardFailures:failures.length,warnings:warnings.length,reviewRanges:fastSpans,report:'work/v7/qa-motion/motion-audit.json'},null,2));
process.exitCode=failures.length?1:0;

