import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

const root=process.cwd();
const runtimeTemp=path.join(root,'tmp','render-runtime');fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const story=JSON.parse(fs.readFileSync('src/beso-story.json','utf8'));
const fps=story.fps;
const mode=process.argv.includes('--stills')?'stills':'render';
const flag=(name,fallback)=>{const v=process.argv.find(a=>a.startsWith(name+'='));return v?v.slice(name.length+1):fallback;};
const sha=crypto.createHash('sha256');
for(const name of ['src/beso-story.json','src/beso-captions.json',...fs.readdirSync('src/beso').map(n=>'src/beso/'+n)])sha.update(fs.readFileSync(name));
const generated=path.join(root,'public/generated');
if(fs.existsSync(generated))for(const n of fs.readdirSync(generated).filter(n=>/\.(json|mp4)$/.test(n)).sort())sha.update(fs.readFileSync(path.join(generated,n)));
const revision=sha.digest('hex').slice(0,12);
const output=path.join(root,'output',`render-${revision}`), qa=path.join(output,'stills');
fs.mkdirSync(qa,{recursive:true});
const staging=path.join(root,'tmp',`active-public-${revision}`);
fs.mkdirSync(staging,{recursive:true});
for(const folder of ['beso-research','screens','generated','audio'])if(fs.existsSync(path.join(root,'public',folder)))fs.cpSync(path.join(root,'public',folder),path.join(staging,folder),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index-beso.tsx'),publicDir:staging,outDir:path.join(root,'tmp',`beso-bundle-${revision}`)});
const browserExecutable=getBrowserExecutable();
const chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay:true},timeoutInMilliseconds:120000};
const manifest={revision,fps,durationInFrames:story.duration,seconds:story.duration/fps,width:1920,height:1080,started:new Date().toISOString(),sceneStarts:story.scenes.map(s=>({id:s.id,start:s.start,duration:s.duration})),segments:[]};
try{
 const composition=await selectComposition({...common,id:'BesoAIResearchZH'});
 if(mode==='stills'){
  let frames=[];
  const custom=flag('--frames',null);
  if(custom)frames=custom.split(',').map(Number);
  else for(const s of story.scenes){
   frames.push(s.start+Math.min(Math.round(fps*2),s.duration-1),s.start+Math.floor(s.duration*.52),s.start+s.duration-1);
   if(s.start>0)for(const t of [-.25,0,.35,1.2,2.7,5.5])frames.push(Math.max(0,Math.min(story.duration-1,s.start+Math.round(t*fps))));
  }
  frames=[...new Set(frames)].sort((a,b)=>a-b);
  for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(qa,`frame-${String(frame).padStart(6,'0')}.jpg`),imageFormat:'jpeg',jpegQuality:93});console.log('STILL',frame)}
  fs.writeFileSync(path.join(output,'qa-frames.json'),JSON.stringify({revision,frames},null,2));
 }else{
  const chunk=Number(flag('--chunk','900')),concurrency=Number(flag('--concurrency','3'));
  const wanted=flag('--segments',null)?.split(',').map(Number);
  for(let start=0,index=0;start<story.duration;start+=chunk,index++){
   const end=Math.min(story.duration-1,start+chunk-1),file=path.join(output,`segment-${String(index).padStart(3,'0')}.mp4`),sidecar=file+'.json';
   const record={index,start,end,frames:end-start+1,file};manifest.segments.push(record);
   if(wanted&&!wanted.includes(index))continue;
   if(fs.existsSync(file)&&fs.existsSync(sidecar)&&JSON.parse(fs.readFileSync(sidecar,'utf8')).frames===record.frames){console.log('RESUME',index);continue}
   const began=Date.now();let last=-1;
   await renderMedia({...common,composition,frameRange:[start,end],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:file,onProgress:p=>{const q=Math.floor(p.progress*10);if(q!==last){console.log('SEGMENT',index,Math.round(p.progress*100)+'%');last=q}}});
   fs.writeFileSync(sidecar,JSON.stringify({...record,revision,finished:new Date().toISOString(),elapsedS:(Date.now()-began)/1000},null,2));
   fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2));
  }
  if(manifest.segments.every(s=>fs.existsSync(s.file)&&fs.existsSync(s.file+'.json'))){
   const concat=path.join(output,'concat.txt');fs.writeFileSync(concat,manifest.segments.map(s=>`file '${s.file.replaceAll('\\','/')}'`).join('\n'));
   const final=path.join(root,'output','beso_ai_research_1080p60.mp4');
   const res=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',concat,'-i',path.join(root,'public/audio/master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(story.duration/fps),final],{encoding:'utf8',windowsHide:true});
   if(res.status!==0)throw Error(res.stderr);
   manifest.finished=new Date().toISOString();manifest.final=final;fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2));console.log('FINAL',final);
  }
 }
 console.log('OUTPUT',output);
}finally{await browser.close({silent:true})}
