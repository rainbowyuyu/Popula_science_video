/** Actual-timeline WebGL cue/physics audit. No final render or production edit. */
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const qa=import.meta.dirname,root=path.resolve(qa,'../../..'),out=path.join(qa,'cues');
const json=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const hash=async p=>createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex');
const timeline=await json('src/episode3v8/timeline.json'),story=await json('research/episode3v8/story.json'),cues=await json('src/episode3v8/annotations.json');
if(timeline.draft||timeline.clips.length!==47||!cues.length||story.clips.some((c,i)=>['id','scene','line','text','spoken'].some(k=>timeline.clips[i]?.[k]!==c[k])))throw Error('Actual v8 narration timeline and first-mention cues are not ready. No draft pass permitted.');
if(await hash('public/episode3v8/timeline.json')!==await hash('src/episode3v8/timeline.json'))throw Error('Public/src actual timeline mismatch');
await fs.mkdir(out,{recursive:true});
const sourceFiles=['src/episode3v8/World.ts','src/episode3v8/ForceStory.ts','src/episode3v8/StressField.ts','src/episode3v8/SurfaceSampling.ts','src/episode3v8/Film.tsx','src/episode3v8/Annotations.tsx','src/episode3v8/timeline.json','src/episode3v8/annotations.json','src/episode3v8/force-evidence.json','public/episode3v7/models/pavilion-v7.glb','public/episode3v7/models/pavilion-manifest.json','public/episode3v7/physics/static-cases.json','public/episode3v7/physics/dynamic-response.json'];
const provenance=await Promise.all(sourceFiles.map(async file=>({file,sha256:await hash(file)})));
const samples=[];
for(const [index,cue]of cues.entries())for(const [fraction,phase]of [[.15,'enter'],[.5,'mid'],[.85,'leave']])samples.push({frame:Math.round(cue.start+(cue.end-cue.start)*fraction),cueIndex:index,term:cue.term,phase});
for(const clip of timeline.clips.filter(c=>['gravity','wind'].includes(c.scene)||(c.scene==='hip'&&c.line===1)))samples.push({frame:Math.round(clip.start+clip.duration*.5),clip:clip.id,phase:'physics-mid'});
const frames=[...new Set(samples.map(s=>s.frame))].sort((a,b)=>a-b);
const source=`import {JoineryWorld} from ${JSON.stringify(path.join(root,'src/episode3v8/World.ts').replaceAll('\\','/'))};
import {stateAt} from ${JSON.stringify(path.join(root,'src/episode3v8/Film.tsx').replaceAll('\\','/'))};
const canvas=document.querySelector('canvas');const world=new JoineryWorld(canvas,'/episode3v7/');
window.ready=world.ready.then(()=>{world.renderer.setSize(960,540,false);return true});
window.auditFrame=frame=>{const state=stateAt(frame);world.render(state);const overlay=world.getPhysicsOverlay(state),pose=world.blendedPose(state);return {state,overlay,pose:{heat:pose.heat,deform:pose.deform,flow:pose.flow,q:pose.q},anchors:world.getAnnotationAnchors(state),pixels:canvas.toDataURL('image/png').split(',')[1],partCount:world.parts.size,partOffsets:[...world.parts].filter(([id])=>id.startsWith('HIP_')).map(([id,p])=>({id,offset:p.offset.toArray()}))}};`;
const bundle=path.join(out,'audit-entry.js');
await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,format:'iife',platform:'browser',outfile:bundle,logLevel:'silent'});
const html='<!doctype html><style>html,body{margin:0;background:#eee7d8}canvas{width:960px;height:540px}</style><canvas></canvas><script src="/audit-entry.js"></script>';
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const target=url.pathname==='/audit-entry.js'?bundle:path.resolve(root,'public','.'+decodeURIComponent(url.pathname));if(target!==bundle&&!target.startsWith(path.join(root,'public')+path.sep))throw Error('Outside public');res.setHeader('Content-Type',path.extname(target)==='.js'?'text/javascript':path.extname(target)==='.json'?'application/json':'application/octet-stream');res.end(await fs.readFile(target));}catch(e){res.statusCode=404;res.end(String(e));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const records=[],errors=[];
try{
 browser=await openBrowser('chrome',{browserExecutable:path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),chromiumOptions:{gl:'angle'}});
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});page.on('error',e=>errors.push(String(e)));
 await page.setViewport({width:960,height:540,deviceScaleFactor:1});await page.goto({url:`http://127.0.0.1:${server.address().port}`,timeout:60000});await page.evaluate(()=>window.ready);
 for(const frame of frames){const data=await page.evaluate(f=>window.auditFrame(f),frame);await fs.writeFile(path.join(out,`frame-${frame}.png`),Buffer.from(data.pixels,'base64'));delete data.pixels;records.push({frame,...data});console.log('cue/physics sample',frame);}
 const cueSummary=cues.map((cue,index)=>{const key=cue.anchor??cue.term;const states=samples.filter(s=>s.cueIndex===index).map(s=>{const record=records.find(r=>r.frame===s.frame),anchor=record.anchors[key],active=cues.filter(c=>s.frame>=c.start&&s.frame<c.end),scheduledVisible=active.slice(0,2).includes(cue),requiresVisibleAnchor=s.frame<cue.end-18,valid=scheduledVisible&&!!anchor&&anchor.visible&&!anchor.occluded&&Number.isFinite(anchor.x+anchor.y);return {frame:s.frame,phase:s.phase,anchorKey:key,anchor:anchor??null,present:!!anchor,scheduledVisible,activeCueCount:active.length,requiresVisibleAnchor,rawValid:valid,valid,activeLeaderValid:!requiresVisibleAnchor||valid,surfaceDistance:anchor?.distanceToSurface,insideSafeFrame:!!anchor&&anchor.x>=64&&anchor.x<=1856&&anchor.y>=156&&anchor.y<=916};});return {index,...cue,samples:states,hasValidMidpoint:states.some(s=>s.phase==='mid'&&s.valid),allSamplesValid:states.every(s=>s.valid),allActiveLeaderSamplesValid:states.every(s=>s.activeLeaderValid)};});
 const expectations={gravity:{4:['signed','MPa',true],6:['signed','MPa',true],7:['reaction','N',false]},wind:{0:['flow','',false],1:['flow','',false],2:['pressure','Pa',false],3:['path','',false],4:['signed','MPa',true],5:['path','',false],6:['envelope','MPa',false]}};
 const quantityChecks=records.filter(r=>samples.some(s=>s.frame===r.frame&&s.phase==='physics-mid')).map(r=>{const expected=expectations[r.state.scene]?.[r.state.line],o=r.overlay;const checks={partCount117:r.partCount===117};if(expected){checks.mode=o.mode===expected[0];checks.unit=o.unit===expected[1];checks.signed=o.signed===expected[2];}if(r.state.scene==='gravity'&&r.state.line===4){checks.actualTopCompression=o.probe?.topMPa<0;checks.actualBottomTension=o.probe?.bottomMPa>0;}if(r.state.scene==='wind'&&r.state.line===2)checks.pressureBothSigns=o.min<0&&o.max>0;if(r.state.scene==='wind'&&r.state.line===6){checks.envelopeNonnegative=o.min===0&&o.max>0;checks.actualDeformationEnabled=r.pose.deform>0;}return {frame:r.frame,scene:r.state.scene,line:r.state.line,overlay:o,checks,pass:Object.values(checks).every(Boolean)};});
 const sourceChanged=[];for(const p of provenance)if(await hash(p.file)!==p.sha256)sourceChanged.push(p.file);
 const report={scope:'Actual Film stateAt at each annotation cue enter/mid/leave and every gravity/wind clip midpoint. Images contain real WebGL model, not full Film text layout. Label layout is reviewed from final-media samples.',provisional:false,provenance,cueSummary,quantityChecks,records,errors,sourceChanged,checks:{allCueMidpointsValid:cueSummary.every(c=>c.hasValidMidpoint),allCueSamplesValid:cueSummary.every(c=>c.allSamplesValid),allActiveLeaderSamplesValid:cueSummary.every(c=>c.allActiveLeaderSamplesValid),physicalQuantitiesMatchNarration:quantityChecks.every(c=>c.pass),sourceUnchanged:sourceChanged.length===0,noBrowserErrors:errors.length===0},exitPhaseMeaning:'Raw anchor occlusion is retained in rawValid=false and anchor.occluded. requiresVisibleAnchor = frame < cue.end-18. During the final 18 frames the actual Annotations.tsx has completely retracted its line/point and independently slides the name offscreen; allActiveLeaderSamplesValid excludes only this no-leader interval. Frame 3232 for dou has rawValid=false/occluded=true but requiresVisibleAnchor=false (end=3247); this does not waive visible teaching/hold-phase occlusion.',humanLayoutReviewComplete:false};
 await fs.writeFile(path.join(out,'cue-audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({report:path.join(out,'cue-audit.json'),checks:report.checks,invalidCueMidpoints:cueSummary.filter(c=>!c.hasValidMidpoint).map(c=>c.term)},null,2));
}finally{if(browser)await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));}
