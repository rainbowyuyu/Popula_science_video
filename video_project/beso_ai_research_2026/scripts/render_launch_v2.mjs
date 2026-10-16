import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

const root=process.cwd();
const storyPath=path.join(root,'src/launch-story.json');
const entryPoint=path.join(root,'src/index-launch-film.tsx');
const compositionId='AIEngineerLaunchFilm';
const audioPath=path.join(root,'public/audio/launch-v2-master.wav');
const finalPath=path.join(root,'output/ai_engineer_launch_v2_1080p60.mp4');
const runtimeTemp=path.join(root,'tmp','render-v2-runtime');
fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const story=JSON.parse(fs.readFileSync(storyPath,'utf8'));
const fps=story.fps;
if(!Number.isInteger(story.duration)||story.duration<1||fps!==60||story.duration>7200)throw Error('Launch story must be a valid <=120 s / 60 fps composition');
const mode=process.argv.includes('--stills')?'stills':'render';
const flag=(name,fallback)=>{const v=process.argv.find(a=>a.startsWith(name+'='));return v?v.slice(name.length+1):fallback;};
const filesBelow=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>item.isDirectory()?filesBelow(path.join(dir,item.name)):item.isFile()?[path.join(dir,item.name)]:[]):[];
const sha=crypto.createHash('sha256');
// Include all local source dependencies and frozen media. This makes segment
// reuse invalid after any changed source, data, texture, model, or sound.
const sourceFiles=filesBelow(path.join(root,'src')).filter(f=>/\.(tsx?|json|css)$/.test(f));
const publicFolders=['beso-research','screens','generated','brand','web-capture','environment'];
const publicFiles=publicFolders.flatMap(folder=>filesBelow(path.join(root,'public',folder)));
const assetFiles=filesBelow(path.join(root,'public/assets')).filter(f=>/\.(glb|png)$/i.test(f));
const activePublic=[...publicFiles,...assetFiles,audioPath];
for(const file of [...sourceFiles,path.join(root,'scripts/render_launch_v2.mjs'),path.join(root,'scripts/renderer-options.mjs'),...activePublic]){
 if(!fs.existsSync(file))throw Error(`Missing launch asset: ${file}`);
 sha.update(path.relative(root,file).replaceAll('\\','/'));sha.update(fs.readFileSync(file));
}
const revision=sha.digest('hex').slice(0,12);
const output=path.join(root,'output',`launch-v2-render-${revision}`),qa=path.join(output,'stills');
const staging=path.join(root,'tmp',`launch-v2-public-${revision}`);
fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(staging,{recursive:true});
// Copy only runtime assets. In particular .blend/.blend1 never enter a bundle.
for(const src of activePublic){const rel=path.relative(path.join(root,'public'),src),dest=path.join(staging,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
const serveUrl=await bundle({entryPoint,publicDir:staging,outDir:path.join(root,'tmp',`launch-v2-bundle-${revision}`)});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay:true},timeoutInMilliseconds:120000};
const manifest={revision,compositionId,entryPoint,audioPath,fps,durationInFrames:story.duration,seconds:story.duration/fps,width:1920,height:1080,started:new Date().toISOString(),sceneStarts:story.scenes.map(s=>({id:s.id,start:s.start,duration:s.duration})),assets:activePublic.map(f=>path.relative(root,f).replaceAll('\\','/')),segments:[]};
const saveManifest=()=>fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2));
const validSegment=(record)=>{
 const sidecar=record.file+'.json';if(!fs.existsSync(record.file)||!fs.existsSync(sidecar)||!fs.statSync(record.file).size)return false;
 try{const saved=JSON.parse(fs.readFileSync(sidecar,'utf8'));return saved.revision===revision&&saved.frames===record.frames&&saved.start===record.start&&saved.end===record.end}catch{return false}
};
try{
 const composition=await selectComposition({...common,id:compositionId});
 if(composition.durationInFrames!==story.duration||composition.fps!==fps)throw Error('Launch entry and story timeline disagree');
 if(mode==='stills'){
  let frames=[];const custom=flag('--frames',null);
  if(custom)frames=custom.split(',').map(Number);
  else for(const s of story.scenes){
   frames.push(s.start+Math.min(Math.round(fps*2),s.duration-1),s.start+Math.floor(s.duration*.52),s.start+s.duration-1);
   if(s.start>0)for(const t of [-.25,0,.35,1.2,2.7,5.5])frames.push(Math.max(0,Math.min(story.duration-1,s.start+Math.round(t*fps))));
  }
  if(frames.some(f=>!Number.isInteger(f)||f<0||f>=story.duration))throw Error('--frames contains an invalid or out-of-range frame');
  frames=[...new Set(frames)].sort((a,b)=>a-b);
  for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(qa,`frame-${String(frame).padStart(6,'0')}.jpg`),imageFormat:'jpeg',jpegQuality:93});console.log('STILL',frame);}
  fs.writeFileSync(path.join(output,'qa-frames.json'),JSON.stringify({revision,frames},null,2));saveManifest();
 }else{
  const chunk=Number(flag('--chunk','900')),concurrency=Number(flag('--concurrency','1'));
  if(!Number.isInteger(chunk)||chunk<1||!Number.isInteger(concurrency)||concurrency<1)throw Error('--chunk and --concurrency must be positive integers');
  const wanted=flag('--segments',null)?.split(',').map(Number);
  if(wanted?.some(i=>!Number.isInteger(i)||i<0||i>=Math.ceil(story.duration/chunk)))throw Error('--segments contains an invalid segment index');
  for(let start=0,index=0;start<story.duration;start+=chunk,index++){
   const end=Math.min(story.duration-1,start+chunk-1),file=path.join(output,`segment-${String(index).padStart(3,'0')}.mp4`);
   const record={index,start,end,frames:end-start+1,file};manifest.segments.push(record);
   if(wanted&&!wanted.includes(index))continue;
   if(validSegment(record)){console.log('RESUME',index);continue;}
   const began=Date.now();let last=-1;
   await renderMedia({...common,composition,frameRange:[start,end],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:file,onProgress:p=>{const q=Math.floor(p.progress*10);if(q!==last){console.log('SEGMENT',index,Math.round(p.progress*100)+'%');last=q;}}});
   fs.writeFileSync(file+'.json',JSON.stringify({...record,revision,finished:new Date().toISOString(),elapsedS:(Date.now()-began)/1000},null,2));saveManifest();
  }
  saveManifest();
  if(manifest.segments.every(validSegment)){
   const concat=path.join(output,'concat.txt');fs.writeFileSync(concat,manifest.segments.map(s=>`file '${s.file.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
   const res=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',concat,'-i',audioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(story.duration/fps),finalPath],{encoding:'utf8',windowsHide:true});
   if(res.status!==0)throw Error(res.stderr||'FFmpeg final mux failed');
   manifest.finished=new Date().toISOString();manifest.final=finalPath;saveManifest();console.log('FINAL',finalPath);
  }else console.log('PARTIAL',manifest.segments.filter(validSegment).length,'/',manifest.segments.length);
 }
 console.log('OUTPUT',output);
}finally{await browser.close({silent:true});}
