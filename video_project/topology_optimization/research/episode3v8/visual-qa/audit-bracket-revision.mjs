/** Actual-timeline WebGL cue/physics audit. No final render or production edit. */
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const qa=import.meta.dirname,root=path.resolve(qa,'../../..'),out=path.join(qa,'bracket-revision');
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
const frames=[3319,3328,3342,3360,3376,3410,3468,3522,3531,3590,3693,3702,3730,3780,3860];
const source=`import {JoineryWorld} from ${JSON.stringify(path.join(root,'src/episode3v8/World.ts').replaceAll('\\','/'))};
import {stateAt} from ${JSON.stringify(path.join(root,'src/episode3v8/Film.tsx').replaceAll('\\','/'))};
const canvas=document.querySelector('canvas');const world=new JoineryWorld(canvas,'/episode3v7/');
window.ready=world.ready.then(()=>{world.renderer.setSize(960,540,false);return true});
window.auditFrame=frame=>{const state=stateAt(frame);world.render(state);const overlay=world.getPhysicsOverlay(state),pose=world.blendedPose(state);return {state,overlay,pose:{heat:pose.heat,deform:pose.deform,flow:pose.flow,q:pose.q},anchors:world.getAnnotationAnchors(state),pixels:canvas.toDataURL('image/png').split(',')[1],partCount:world.parts.size,partOffsets:[...world.parts].filter(([id])=>['DOU_FL','GONG_X_FL','GONG_Y_FL','CAP_FL'].includes(id)).map(([id,p])=>({id,offset:p.offset.toArray()}))}};`;
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
 await fs.writeFile(path.join(out,'bracket-timing-audit.json'),JSON.stringify({scope:'Actual timeline World samples for bracket opening revision; no full Film layout',records,errors,provenance},null,2));
}finally{if(browser)await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));}
