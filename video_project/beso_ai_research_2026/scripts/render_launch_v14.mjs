import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

// Independent v14 entry, story, personal-voice master, media freeze and caches.
// Every segment is silent; the final FFmpeg pass adds the frozen v14 mix once.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const value=(name,fallback=null)=>{const index=args.findIndex(a=>a===name||a.startsWith(name+'='));if(index<0)return fallback;const item=args[index];if(item.includes('='))return item.slice(name.length+1);const next=args[index+1];if(!next||next.startsWith('--'))throw Error(`${name} requires a value`);return next;};
const boolean=(name,fallback)=>{const item=args.find(a=>a===name||a.startsWith(name+'='));if(!item)return fallback;if(item===name)return true;const val=item.slice(name.length+1);if(!['true','false'].includes(val))throw Error(`${name} must be true or false`);return val==='true';};
if(args.includes('--help')){
 console.log(`v14 rendering (run from any directory):
  node scripts/render_launch_v14.mjs
  node scripts/render_launch_v14.mjs --check-inputs
  node scripts/render_launch_v14.mjs --stills --frames=900,1200,2940,3240 --overlay=false --image-format=png --output=public/generated/v14/native-anchors
  node scripts/render_launch_v14.mjs --clip=870-1230 --output=output/launch-v14-bridge-preview.mp4
Flags: --stills --frames=F,F --clip=START-END --output=FILE_OR_STILLS_DIR
       --overlay=false --blueprint=true --image-format=jpeg|png --chunk=900 --concurrency=2
       --segments=0,1 --no-mux --media-dir=PUBLIC_RELATIVE_DIR[,DIR] --help
Stills do not contain audio. Preview clips and the full film use the frozen
rainbow narration with the new launch-v14-master.wav mix. --output does not change cache locations.
--check-inputs reports pending inputs without failing before v14 source exists.
--no-mux renders silent segments; a later normal run resumes them and muxes.
Earlier output, generation inputs and cache locations are protected.`);
 process.exit(0);
}
const storyPath=path.join(root,'src/launch-v14-story.json');
const entryPoint=path.join(root,'src/index-launch-v14.tsx');
const compositionId='AIEngineerLaunchFilmV14';
const audioPath=path.join(root,'public/audio/launch-v14-master.wav');
const captionPath=path.join(root,'src/launch-v14-captions.json');
if(args.includes('--check-inputs')){
 const required=[entryPoint,storyPath,captionPath,audioPath];
 const inputs=required.map(file=>({file:path.relative(root,file).replaceAll('\\','/'),exists:fs.existsSync(file)}));
 let timeline=null;
 if(fs.existsSync(storyPath)){try{const saved=JSON.parse(fs.readFileSync(storyPath,'utf8'));timeline={fps:saved.fps,durationInFrames:saved.duration,valid:saved.fps===60&&saved.duration===6300};}catch(error){timeline={valid:false,error:String(error)};}}
 const exists=file=>inputs.find(item=>item.file===path.relative(root,file).replaceAll('\\','/'))?.exists===true;
 console.log(JSON.stringify({schema:'launch-v14-input-readiness-v1',inputs,timeline,readyForStills:exists(entryPoint)&&exists(storyPath)&&exists(captionPath)&&timeline?.valid===true,readyForRender:inputs.every(input=>input.exists)&&timeline?.valid===true,sourceValidation:'Availability and timeline metadata only; TypeScript and visual checks remain separate.'},null,2));
 process.exit(0);
}
for(const file of [entryPoint,storyPath,captionPath])if(!fs.existsSync(file))throw Error(`v14 source is not ready: ${path.relative(root,file)}. Use --check-inputs to list pending files.`);
const story=JSON.parse(fs.readFileSync(storyPath,'utf8'));
const fps=story.fps;
if(story.duration!==6300||fps!==60)throw Error('v14 must preserve the verified 105 s / 6300-frame / 60 fps timeline');
const customFrames=value('--frames');
const clip=value('--clip');
const mode=boolean('--stills',false)||customFrames?'stills':clip?'clip':'render';
if(mode==='stills'&&clip)throw Error('--stills/--frames cannot be combined with --clip');
const overlay=boolean('--overlay',true);
const blueprint=boolean('--blueprint',false);
if(blueprint&&(mode!=='stills'||overlay))throw Error('--blueprint requires --stills --overlay=false; it is an anchor rendering mode, never an automatic film effect');
const noMux=boolean('--no-mux',false);
const concurrency=Number(value('--concurrency','2'));
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('--concurrency must be an integer from 1 to 4; default 2 for this WebGL composition');
if(mode!=='stills'&&!fs.existsSync(audioPath))throw Error('v14 master is not ready; full renders/clips require public/audio/launch-v14-master.wav. Stills may be produced before audio.');
const imageFormat=value('--image-format','jpeg');
if(!['jpeg','png'].includes(imageFormat))throw Error('--image-format must be jpeg or png');
const requestedOutput=value('--output');
const absoluteOutput=requestedOutput?path.resolve(root,requestedOutput):null;
const protectedOutput=absoluteOutput&&(absoluteOutput.split(/[\\/]/).some(part=>/^launch-v(?:[1-9]|1[0-3])-(?:render|public|bundle)-/i.test(part)||/^ai_engineer_launch_v(?:[1-9]|1[0-3])_.*\.mp4$/i.test(part))||/[\\/]public[\\/]generated[\\/]v(?:[1-9]|1[0-3])(?:[\\/]|$)/i.test(absoluteOutput));
if(protectedOutput)throw Error('v14 output must not overwrite earlier deliveries, generation inputs or revision caches');
const runtimeTemp=path.join(root,'tmp','render-v14-runtime');
fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const filesBelow=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>item.isDirectory()?filesBelow(path.join(dir,item.name)):item.isFile()?[path.join(dir,item.name)]:[]):[];
const hashFile=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const publicRoot=path.join(root,'public');
const extraFolders=(value('--media-dir','')||'').split(',').filter(Boolean).map(folder=>{const resolved=path.resolve(publicRoot,folder);const rel=path.relative(publicRoot,resolved);if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(resolved)||!fs.statSync(resolved).isDirectory())throw Error('--media-dir must identify an existing directory below public');return resolved;});
// Freeze only assets this entry actually reads. Generated anchor images,
// rejected WAN clips, historic viewers and Blender sources remain preserved
// in the project, but are not duplicated into every render revision.
const geometryRoot=path.join(publicRoot,'beso-research/geometry');
const geometryManifest=JSON.parse(fs.readFileSync(path.join(geometryRoot,'manifest.json'),'utf8'));
const bridgeManifestPath=path.join(root,'research/generation/launch-v13-bridges.json');
const selectedBridges=fs.existsSync(bridgeManifestPath)?JSON.parse(fs.readFileSync(bridgeManifestPath,'utf8')).bridges.filter(b=>b.selection==='selected'):[];
const runtimeNames=['beso-research/geometry/manifest.json',`beso-research/geometry/${geometryManifest.shared}`,
 ...geometryManifest.iterations.map(s=>`beso-research/geometry/${s.file}`),
 'beso-research/physics/native-model.json','beso-research/physics/zwind-response.json',
 'brand/zju-horizontal-mark.svg',
 'environment/v2-sky.hdr','assets/v4/nacelle-skin.glb',
 // v12 uses only genuine tight crops and the continuous native model.
 // Rejected generated bridges remain in their original provenance archive.
 'beso-research/web-live/v12/demand-input.png',
 'beso-research/web-live/v12/geometry-model.png',
 ...selectedBridges.map(b=>b.asset)];
const publicFiles=[...runtimeNames.map(name=>{const file=path.resolve(publicRoot,name);if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file))throw Error('Missing or invalid v14 runtime asset: '+name);return file;}),...extraFolders.flatMap(filesBelow).filter(file=>! /\.blend\d*$/i.test(file))];
const reusedNacelle=path.join(publicRoot,'assets/v4/nacelle-skin.glb');
const activePublic=[...new Set([...publicFiles,...(fs.existsSync(reusedNacelle)?[reusedNacelle]:[]),...(fs.existsSync(audioPath)?[audioPath]:[])])].sort();
const sourceFiles=filesBelow(path.join(root,'src')).filter(f=>/\.(tsx?|json|css)$/.test(f));
const optionalManifests=['research/launch-v14-design.json','research/generation/qwen-v13-specs.json','research/generation/launch-v13-bridges.json'].map(f=>path.join(root,f)).filter(fs.existsSync);
const inputFiles=[...new Set([...sourceFiles,...optionalManifests,fileURLToPath(import.meta.url),path.join(root,'scripts/renderer-options.mjs'),...activePublic])].sort();
const sourceAssets=inputFiles.map(file=>{if(!fs.existsSync(file))throw Error(`Missing launch input: ${file}`);return{file:path.relative(root,file).replaceAll('\\','/'),sha256:hashFile(file),sizeBytes:fs.statSync(file).size};});
const sha=crypto.createHash('sha256');
sha.update(JSON.stringify({overlay,blueprint,fps,frames:story.duration,width:1920,height:1080,compositionId,codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709'}));
for(const asset of sourceAssets){sha.update(asset.file);sha.update(asset.sha256);}
const revision=sha.digest('hex').slice(0,12);
const output=path.join(root,'output',`launch-v14-render-${revision}`);
const qa=mode==='stills'&&absoluteOutput?absoluteOutput:path.join(output,'stills');
if(mode==='stills'&&/\.(mp4|png|jpe?g)$/i.test(qa))throw Error('--output for --stills must name a directory');
const staging=path.join(root,'tmp',`launch-v14-public-${revision}`);
fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(staging,{recursive:true});
const copiedMedia=[];
for(const src of activePublic){const rel=path.relative(publicRoot,src),dest=path.join(staging,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);const sourceRecord=sourceAssets.find(asset=>asset.file===path.relative(root,src).replaceAll('\\','/'));const frozenSHA256=hashFile(dest);if(frozenSHA256!==sourceRecord.sha256)throw Error(`Asset changed while freezing: ${src}`);copiedMedia.push({source:sourceRecord.file,frozenAbsolutePath:dest,sha256:frozenSHA256,sizeBytes:fs.statSync(dest).size});}
const frozenAudioPath=fs.existsSync(audioPath)?path.join(staging,path.relative(publicRoot,audioPath)):null;
const manifest={schema:'launch-v14-render-v1',revision,compositionId,entryPoint,audioPath,frozenAudioPath,audioSHA256:frozenAudioPath?hashFile(frozenAudioPath):null,audioPending:!frozenAudioPath,fps,durationInFrames:story.duration,seconds:story.duration/fps,width:1920,height:1080,overlay,blueprint,mode,concurrency,noMux,started:new Date().toISOString(),sceneStarts:story.scenes.map(s=>({id:s.id,start:s.start,duration:s.duration})),sourceAssets,copiedMedia,copyReport:'Exact public runtime files copied to this revision staging directory; no old output or cache is copied or modified.',assets:activePublic.map(f=>path.relative(root,f).replaceAll('\\','/')),segments:[]};
const saveManifest=()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');};
saveManifest();
const serveUrl=await bundle({entryPoint,publicDir:staging,outDir:path.join(root,'tmp',`launch-v14-bundle-${revision}`)});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const layoutSamples=[],browserErrors=[];
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay,blueprint,qa:mode==='stills'},timeoutInMilliseconds:120000,onBrowserLog:log=>{if(log.text?.startsWith('LAYOUT_QA ')){try{layoutSamples.push(JSON.parse(log.text.slice(10)))}catch{}}if(/shader error|validate_status false|WebGL.*error/i.test(log.text??'')){browserErrors.push(log.text);console.log('WEBGL_ERROR',log.text);}}};
const validSegment=(record)=>{const sidecar=record.file+'.json';if(!fs.existsSync(record.file)||!fs.existsSync(sidecar)||!fs.statSync(record.file).size)return false;try{const saved=JSON.parse(fs.readFileSync(sidecar,'utf8'));return saved.revision===revision&&saved.frames===record.frames&&saved.start===record.start&&saved.end===record.end&&saved.sha256===hashFile(record.file);}catch{return false;}};
const mux=(video,file,from,frames)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-i',video,'-ss',String(from/fps),'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(frames/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg audio mux failed');};
try{
 const composition=await selectComposition({...common,id:compositionId});
 if(composition.durationInFrames!==6300||composition.fps!==60||composition.width!==1920||composition.height!==1080)throw Error('Launch entry and v14 delivery specification disagree');
 if(mode==='clip'){
  const [from,to,...extra]=clip.split('-').map(Number);if(extra.length||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=story.duration)throw Error('Invalid --clip; use inclusive frame range START-END');
  const rendered=path.join(output,`clip-${from}-${to}-silent.mp4`),file=absoluteOutput||path.join(output,`clip-${from}-${to}.mp4`);
  if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
  await renderMedia({...common,composition,frameRange:[from,to],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',concurrency,outputLocation:rendered});
  if(noMux){manifest.preview={from,to,frames:to-from+1,file:rendered,sha256:hashFile(rendered),silent:true};console.log('SILENT_CLIP',rendered);}else{mux(rendered,file,from,to-from+1);manifest.preview={from,to,frames:to-from+1,file,sha256:hashFile(file),silent:false};console.log('CLIP',file);}saveManifest();
 }else if(mode==='stills'){
  let frames=[];
  if(customFrames)frames=customFrames.split(',').map(Number);
  else for(const scene of story.scenes){frames.push(scene.start+Math.min(120,scene.duration-1),scene.start+Math.floor(scene.duration*.52),scene.start+scene.duration-1);if(scene.start>0)for(const offset of [-30,-15,0,15,30,60])frames.push(Math.max(0,Math.min(story.duration-1,scene.start+offset)));}
  if(frames.some(f=>!Number.isInteger(f)||f<0||f>=story.duration))throw Error('--frames contains an invalid or out-of-range frame');
  frames=[...new Set(frames)].sort((a,b)=>a-b);
  for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(qa,`frame-${String(frame).padStart(6,'0')}.${imageFormat==='png'?'png':'jpg'}`),imageFormat,...(imageFormat==='jpeg'?{jpegQuality:95}:{})});console.log('STILL',frame);}
  const record={revision,overlay,blueprint,imageFormat,frames,stillsDirectory:qa};fs.writeFileSync(path.join(output,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(qa,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(output,'qa-layout.json'),JSON.stringify({revision,samples:layoutSamples},null,2)+'\n');manifest.stills=record;saveManifest();
 }else{
  const chunk=Number(value('--chunk','900'));
  if(!Number.isInteger(chunk)||chunk<1)throw Error('--chunk must be a positive integer');
  const wanted=value('--segments')?.split(',').map(Number);if(wanted?.some(i=>!Number.isInteger(i)||i<0||i>=Math.ceil(story.duration/chunk)))throw Error('--segments contains an invalid segment index');
  for(let start=0,index=0;start<story.duration;start+=chunk,index++){
   const end=Math.min(story.duration-1,start+chunk-1),file=path.join(output,`segment-${String(index).padStart(3,'0')}.mp4`),record={index,start,end,frames:end-start+1,file};manifest.segments.push(record);
   if(wanted&&!wanted.includes(index))continue;
   if(validSegment(record)){console.log('RESUME',index);continue;}
   const began=Date.now();let last=-1;
   await renderMedia({...common,composition,frameRange:[start,end],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:file,onProgress:p=>{const q=Math.floor(p.progress*10);if(q!==last){console.log('SEGMENT',index,Math.round(p.progress*100)+'%');last=q;}}});
   fs.writeFileSync(file+'.json',JSON.stringify({...record,revision,sha256:hashFile(file),finished:new Date().toISOString(),elapsedS:(Date.now()-began)/1000},null,2)+'\n');saveManifest();
  }
  saveManifest();
  if(manifest.segments.every(validSegment)&&!noMux){
   const concat=path.join(output,'concat.txt');fs.writeFileSync(concat,manifest.segments.map(segment=>`file '${segment.file.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
   const file=absoluteOutput||path.join(root,'output/ai_engineer_launch_v14_1080p60.mp4');if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
   fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-f','concat','-safe','0','-i',concat,'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(story.duration/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg final mux failed');
   manifest.finished=new Date().toISOString();manifest.final=file;manifest.finalSHA256=hashFile(file);saveManifest();console.log('FINAL',file);
  }else if(manifest.segments.every(validSegment)){manifest.mixPending=true;saveManifest();console.log('SILENT_SEGMENTS_COMPLETE',manifest.segments.length);}else console.log('PARTIAL',manifest.segments.filter(validSegment).length,'/',manifest.segments.length);
 }
 manifest.browserErrors=browserErrors;saveManifest();if(browserErrors.length)throw Error('WebGL shader validation failed');console.log('OUTPUT',output);
}catch(error){manifest.error=String(error);saveManifest();throw error;}finally{await browser.close({silent:true});}
