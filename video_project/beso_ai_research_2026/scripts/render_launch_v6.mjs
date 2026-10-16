import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

// v6 deliberately keeps the verified v5 timeline and rainbow personal voice.
// Its cache, bundle, stills, preview clips and final MP4 have independent paths.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const value=(name,fallback=null)=>{const index=args.findIndex(a=>a===name||a.startsWith(name+'='));if(index<0)return fallback;const item=args[index];if(item.includes('='))return item.slice(name.length+1);const next=args[index+1];if(!next||next.startsWith('--'))throw Error(`${name} requires a value`);return next;};
const boolean=(name,fallback)=>{const item=args.find(a=>a===name||a.startsWith(name+'='));if(!item)return fallback;if(item===name)return true;const val=item.slice(name.length+1);if(!['true','false'].includes(val))throw Error(`${name} must be true or false`);return val==='true';};
if(args.includes('--help')){
 console.log(`v6 rendering (run from any directory):
  node scripts/render_launch_v6.mjs
  node scripts/render_launch_v6.mjs --stills --frames=900,1200,2940,3240 --overlay=false --image-format=png --output=public/generated/v5/native-anchors
  node scripts/render_launch_v6.mjs --clip=870-1230 --output=output/launch-v6-bridge-preview.mp4
Flags: --stills --frames=F,F --clip=START-END --output=FILE_OR_STILLS_DIR
       --overlay=false --image-format=jpeg|png --chunk=900 --concurrency=1
       --segments=0,1 --media-dir=PUBLIC_RELATIVE_DIR[,DIR] --help
Stills do not contain audio. Preview clips and the full film use the frozen
rainbow launch-v5-master.wav track. --output does not change cache locations.`);
 process.exit(0);
}
const storyPath=path.join(root,'src/launch-v5-story.json');
const entryPoint=path.join(root,'src/index-launch-v5.tsx');
const compositionId='AIEngineerLaunchFilmV5';
const audioPath=path.join(root,'public/audio/launch-v5-master.wav');
const story=JSON.parse(fs.readFileSync(storyPath,'utf8'));
const fps=story.fps;
if(story.duration!==6300||fps!==60)throw Error('v6 must preserve the verified 105 s / 6300-frame / 60 fps timeline');
const customFrames=value('--frames');
const clip=value('--clip');
const mode=boolean('--stills',false)||customFrames?'stills':clip?'clip':'render';
if(mode==='stills'&&clip)throw Error('--stills/--frames cannot be combined with --clip');
const overlay=boolean('--overlay',true);
const imageFormat=value('--image-format','jpeg');
if(!['jpeg','png'].includes(imageFormat))throw Error('--image-format must be jpeg or png');
const requestedOutput=value('--output');
const absoluteOutput=requestedOutput?path.resolve(root,requestedOutput):null;
if(absoluteOutput&&/(?:^|[\\/])(?:ai_engineer_launch_v5_1080p60\.mp4|launch-v5-(?:render|public|bundle)-[^\\/]*)$/i.test(absoluteOutput))throw Error('v6 output must not overwrite the preserved v5 delivery or cache');
const runtimeTemp=path.join(root,'tmp','render-v6-runtime');
fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const filesBelow=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>item.isDirectory()?filesBelow(path.join(dir,item.name)):item.isFile()?[path.join(dir,item.name)]:[]):[];
const hashFile=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const publicRoot=path.join(root,'public');
const extraFolders=(value('--media-dir','')||'').split(',').filter(Boolean).map(folder=>{const resolved=path.resolve(publicRoot,folder);const rel=path.relative(publicRoot,resolved);if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(resolved)||!fs.statSync(resolved).isDirectory())throw Error('--media-dir must identify an existing directory below public');return resolved;});
// Includes both new WAN endpoint clips and all new real-web recordings.
const runtimeFolders=['beso-research','brand','environment','generated/v5','generated/v6','web-v6'].map(folder=>path.join(publicRoot,folder));
const publicFiles=[...runtimeFolders,...extraFolders].flatMap(filesBelow);
const assetFiles=filesBelow(path.join(publicRoot,'assets/v4')).filter(f=>/\.(glb|png|jpe?g|webp)$/i.test(f));
const activePublic=[...new Set([...publicFiles,...assetFiles,audioPath])].sort();
const sourceFiles=filesBelow(path.join(root,'src')).filter(f=>/\.(tsx?|json|css)$/.test(f));
const optionalManifests=['research/launch-v5-design.json','research/generation/qwen-v5-specs.json','research/generation/launch-v6-bridges.json'].map(f=>path.join(root,f)).filter(fs.existsSync);
const inputFiles=[...new Set([...sourceFiles,...optionalManifests,fileURLToPath(import.meta.url),path.join(root,'scripts/renderer-options.mjs'),...activePublic])].sort();
const sourceAssets=inputFiles.map(file=>{if(!fs.existsSync(file))throw Error(`Missing launch input: ${file}`);return{file:path.relative(root,file).replaceAll('\\','/'),sha256:hashFile(file),sizeBytes:fs.statSync(file).size};});
const sha=crypto.createHash('sha256');
sha.update(JSON.stringify({overlay,fps,frames:story.duration,width:1920,height:1080,compositionId}));
for(const asset of sourceAssets){sha.update(asset.file);sha.update(asset.sha256);}
const revision=sha.digest('hex').slice(0,12);
const output=path.join(root,'output',`launch-v6-render-${revision}`);
const qa=mode==='stills'&&absoluteOutput?absoluteOutput:path.join(output,'stills');
if(mode==='stills'&&/\.(mp4|png|jpe?g)$/i.test(qa))throw Error('--output for --stills must name a directory');
const staging=path.join(root,'tmp',`launch-v6-public-${revision}`);
fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(staging,{recursive:true});
for(const src of activePublic){const rel=path.relative(publicRoot,src),dest=path.join(staging,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
const frozenAudioPath=path.join(staging,path.relative(publicRoot,audioPath));
const manifest={schema:'launch-v6-render-v1',revision,compositionId,entryPoint,audioPath,frozenAudioPath,audioSHA256:hashFile(frozenAudioPath),fps,durationInFrames:story.duration,seconds:story.duration/fps,width:1920,height:1080,overlay,mode,started:new Date().toISOString(),sceneStarts:story.scenes.map(s=>({id:s.id,start:s.start,duration:s.duration})),sourceAssets,assets:activePublic.map(f=>path.relative(root,f).replaceAll('\\','/')),segments:[]};
const saveManifest=()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
saveManifest();
const serveUrl=await bundle({entryPoint,publicDir:staging,outDir:path.join(root,'tmp',`launch-v6-bundle-${revision}`)});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const layoutSamples=[],browserErrors=[];
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay,qa:mode==='stills'},timeoutInMilliseconds:120000,onBrowserLog:log=>{if(log.text?.startsWith('LAYOUT_QA ')){try{layoutSamples.push(JSON.parse(log.text.slice(10)))}catch{}}if(/shader error|validate_status false|WebGL.*error/i.test(log.text??'')){browserErrors.push(log.text);console.log('WEBGL_ERROR',log.text);}}};
const validSegment=(record)=>{const sidecar=record.file+'.json';if(!fs.existsSync(record.file)||!fs.existsSync(sidecar)||!fs.statSync(record.file).size)return false;try{const saved=JSON.parse(fs.readFileSync(sidecar,'utf8'));return saved.revision===revision&&saved.frames===record.frames&&saved.start===record.start&&saved.end===record.end;}catch{return false;}};
const mux=(video,file,from,frames)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-i',video,'-ss',String(from/fps),'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(frames/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg audio mux failed');};
try{
 const composition=await selectComposition({...common,id:compositionId});
 if(composition.durationInFrames!==6300||composition.fps!==60||composition.width!==1920||composition.height!==1080)throw Error('Launch entry and v6 delivery specification disagree');
 if(mode==='clip'){
  const [from,to,...extra]=clip.split('-').map(Number);if(extra.length||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=story.duration)throw Error('Invalid --clip; use inclusive frame range START-END');
  const rendered=path.join(output,`clip-${from}-${to}-silent.mp4`),file=absoluteOutput||path.join(output,`clip-${from}-${to}.mp4`);
  if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
  await renderMedia({...common,composition,frameRange:[from,to],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',concurrency:1,outputLocation:rendered});
  mux(rendered,file,from,to-from+1);manifest.preview={from,to,frames:to-from+1,file,sha256:hashFile(file)};saveManifest();console.log('CLIP',file);
 }else if(mode==='stills'){
  let frames=[];
  if(customFrames)frames=customFrames.split(',').map(Number);
  else for(const scene of story.scenes){frames.push(scene.start+Math.min(120,scene.duration-1),scene.start+Math.floor(scene.duration*.52),scene.start+scene.duration-1);if(scene.start>0)for(const offset of [-30,-15,0,15,30,60])frames.push(Math.max(0,Math.min(story.duration-1,scene.start+offset)));}
  if(frames.some(f=>!Number.isInteger(f)||f<0||f>=story.duration))throw Error('--frames contains an invalid or out-of-range frame');
  frames=[...new Set(frames)].sort((a,b)=>a-b);
  for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(qa,`frame-${String(frame).padStart(6,'0')}.${imageFormat==='png'?'png':'jpg'}`),imageFormat,...(imageFormat==='jpeg'?{jpegQuality:95}:{})});console.log('STILL',frame);}
  const record={revision,overlay,imageFormat,frames,stillsDirectory:qa};fs.writeFileSync(path.join(output,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(qa,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(output,'qa-layout.json'),JSON.stringify({revision,samples:layoutSamples},null,2)+'\n');manifest.stills=record;saveManifest();
 }else{
  const chunk=Number(value('--chunk','900')),concurrency=Number(value('--concurrency','1'));
  if(!Number.isInteger(chunk)||chunk<1||!Number.isInteger(concurrency)||concurrency<1)throw Error('--chunk and --concurrency must be positive integers');
  const wanted=value('--segments')?.split(',').map(Number);if(wanted?.some(i=>!Number.isInteger(i)||i<0||i>=Math.ceil(story.duration/chunk)))throw Error('--segments contains an invalid segment index');
  for(let start=0,index=0;start<story.duration;start+=chunk,index++){
   const end=Math.min(story.duration-1,start+chunk-1),file=path.join(output,`segment-${String(index).padStart(3,'0')}.mp4`),record={index,start,end,frames:end-start+1,file};manifest.segments.push(record);
   if(wanted&&!wanted.includes(index))continue;
   if(validSegment(record)){console.log('RESUME',index);continue;}
   const began=Date.now();let last=-1;
   await renderMedia({...common,composition,frameRange:[start,end],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:file,onProgress:p=>{const q=Math.floor(p.progress*10);if(q!==last){console.log('SEGMENT',index,Math.round(p.progress*100)+'%');last=q;}}});
   fs.writeFileSync(file+'.json',JSON.stringify({...record,revision,finished:new Date().toISOString(),elapsedS:(Date.now()-began)/1000},null,2)+'\n');saveManifest();
  }
  saveManifest();
  if(manifest.segments.every(validSegment)){
   const concat=path.join(output,'concat.txt');fs.writeFileSync(concat,manifest.segments.map(segment=>`file '${segment.file.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
   const file=absoluteOutput||path.join(root,'output/ai_engineer_launch_v6_1080p60.mp4');if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
   fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-f','concat','-safe','0','-i',concat,'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(story.duration/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg final mux failed');
   manifest.finished=new Date().toISOString();manifest.final=file;manifest.finalSHA256=hashFile(file);saveManifest();console.log('FINAL',file);
  }else console.log('PARTIAL',manifest.segments.filter(validSegment).length,'/',manifest.segments.length);
 }
 manifest.browserErrors=browserErrors;saveManifest();if(browserErrors.length)throw Error('WebGL shader validation failed');console.log('OUTPUT',output);
}catch(error){manifest.error=String(error);saveManifest();throw error;}finally{await browser.close({silent:true});}
