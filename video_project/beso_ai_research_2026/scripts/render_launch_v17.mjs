import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options-v17.mjs';
import {collectLaunchInputs,hashFile} from './renderer-inputs-v17.mjs';
import {validateTimeline,parseFrames,parseClip,parseSegments,validateOutput} from './renderer-contract-v17.mjs';

// Independent v17 entry, story, personal-voice master, media freeze and caches.
// Every segment is silent; the final FFmpeg pass adds the frozen v17 mix once.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const known=new Set(['--help','--check-inputs','--stills','--frames','--clip','--output','--overlay','--blueprint','--image-format','--chunk','--concurrency','--segments','--no-mux']);
for(const token of args)if(token.startsWith('--')&&!known.has(token.split('=')[0]))throw Error('Unknown option: '+token);
const value=(name,fallback=null)=>{const index=args.findIndex(a=>a===name||a.startsWith(name+'='));if(index<0)return fallback;const item=args[index];if(item.includes('='))return item.slice(name.length+1);const next=args[index+1];if(!next||next.startsWith('--'))throw Error(`${name} requires a value`);return next;};
const boolean=(name,fallback)=>{const item=args.find(a=>a===name||a.startsWith(name+'='));if(!item)return fallback;if(item===name)return true;const val=item.slice(name.length+1);if(!['true','false'].includes(val))throw Error(`${name} must be true or false`);return val==='true';};
if(args.includes('--help')){
 console.log(`v17 rendering (run from any directory):
  node scripts/render_launch_v17.mjs
  node scripts/render_launch_v17.mjs --check-inputs
  node scripts/render_launch_v17.mjs --stills --frames=900,1200,2940,3240 --overlay=false --image-format=png --output=public/generated/v17/native-anchors
  node scripts/render_launch_v17.mjs --clip=870-1230 --output=output/launch-v17-bridge-preview.mp4
Flags: --stills --frames=F,F --clip=START-END --output=FILE_OR_STILLS_DIR
       --overlay=false --blueprint=true --image-format=jpeg|png --chunk=900 --concurrency=2
       --segments=0,1 --no-mux --help
Stills do not contain audio. Preview clips and the full film use the frozen
rainbow narration with the new launch-v17-master.wav mix. --output does not change cache locations.
--check-inputs reports pending inputs without failing before v17 source exists.
--no-mux renders silent segments; a later normal run resumes them and muxes.
Earlier output, generation inputs and cache locations are protected.`);
 process.exit(0);
}
const storyPath=path.join(root,'src/launch-v17-story.json');
const entryPoint=path.join(root,'src/index-launch-v17.tsx');
const compositionId='AIEngineerLaunchFilmV17';
const audioPath=path.join(root,'public/audio/launch-v17-master.wav');
const captionPath=path.join(root,'src/launch-v17-captions.json');
if(args.includes('--check-inputs')){
 const required=[entryPoint,storyPath,captionPath,audioPath];
 const inputs=required.map(file=>({file:path.relative(root,file).replaceAll('\\','/'),exists:fs.existsSync(file)}));
 let timeline=null;
 if(fs.existsSync(storyPath)&&fs.existsSync(captionPath)){try{const saved=JSON.parse(fs.readFileSync(storyPath,'utf8'));timeline={fps:saved.fps,durationInFrames:saved.duration,...validateTimeline(saved,JSON.parse(fs.readFileSync(captionPath,'utf8')))};}catch(error){timeline={valid:false,error:String(error)};}}
 const exists=file=>inputs.find(item=>item.file===path.relative(root,file).replaceAll('\\','/'))?.exists===true;
 let closure={ready:false,pending:[],error:null};
 try{const c=collectLaunchInputs({root,entryPoint,audioPath,manifestPath:path.join(root,'research/launch-v17-runtime.json')});closure={ready:c.pending.length===0,pending:c.pending,error:null,sourceCount:c.sourceFiles.length,publicCount:c.publicFiles.length,dynamicCalls:c.dynamicCalls};}catch(error){closure.error=String(error);}
 console.log(JSON.stringify({schema:'launch-v17-input-readiness-v1',inputs,timeline,dependencyClosure:closure,readyForStills:exists(entryPoint)&&exists(storyPath)&&exists(captionPath)&&timeline?.valid===true&&closure.ready,readyForRender:inputs.every(input=>input.exists)&&timeline?.valid===true&&closure.ready,sourceValidation:'Availability, dependency closure and timeline metadata only; TypeScript and visual checks remain separate.'},null,2));
 process.exit(0);
}
for(const file of [entryPoint,storyPath,captionPath])if(!fs.existsSync(file))throw Error(`v17 source is not ready: ${path.relative(root,file)}. Use --check-inputs to list pending files.`);
const story=JSON.parse(fs.readFileSync(storyPath,'utf8'));
validateTimeline(story,JSON.parse(fs.readFileSync(captionPath,'utf8')));
const fps=story.fps;
if(story.duration!==6300||fps!==60)throw Error('v17 must preserve the verified 105 s / 6300-frame / 60 fps timeline');
const customFrames=value('--frames');
const clip=value('--clip');
const parsedFrames=customFrames===null?null:parseFrames(customFrames,story.duration);
const parsedClip=clip===null?null:parseClip(clip,story.duration);
const chunk=Number(value('--chunk','900'));
const wanted=parseSegments(value('--segments'),chunk,story.duration);
const mode=boolean('--stills',false)||customFrames?'stills':clip?'clip':'render';
if(mode==='stills'&&clip)throw Error('--stills/--frames cannot be combined with --clip');
const overlay=boolean('--overlay',true);
const blueprint=boolean('--blueprint',false);
if(blueprint&&(mode!=='stills'||overlay))throw Error('--blueprint requires --stills --overlay=false; it is an anchor rendering mode, never an automatic film effect');
const noMux=boolean('--no-mux',false);
const concurrency=Number(value('--concurrency','2'));
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('--concurrency must be an integer from 1 to 4; default 2 for this WebGPU composition');
if(mode!=='stills'&&!noMux&&!fs.existsSync(audioPath))throw Error('v17 master is not ready; full renders/clips require public/audio/launch-v17-master.wav. Stills may be produced before audio.');
const imageFormat=value('--image-format','jpeg');
if(!['jpeg','png'].includes(imageFormat))throw Error('--image-format must be jpeg or png');
const requestedOutput=value('--output');
const absoluteOutput=requestedOutput?path.resolve(root,requestedOutput):null;
validateOutput(root,absoluteOutput,mode);
const protectedOutput=absoluteOutput&&(absoluteOutput.split(/[\\/]/).some(part=>/^launch-v(?:[1-9]|1[0-6])-(?:render|public|bundle)-/i.test(part)||/^ai_engineer_launch_v(?:[1-9]|1[0-6])_.*\.mp4$/i.test(part))||/[\\/]public[\\/]generated[\\/]v(?:[1-9]|1[0-6])(?:[\\/]|$)/i.test(absoluteOutput));
if(protectedOutput)throw Error('v17 output must not overwrite earlier deliveries, generation inputs or revision caches');
const runtimeTemp=path.join(root,'tmp','render-v17-runtime');
fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const publicRoot=path.join(root,'public');
const runtimeManifestPath=path.join(root,'research/launch-v17-runtime.json');
const dependencies=collectLaunchInputs({root,entryPoint,audioPath,manifestPath:runtimeManifestPath});
if(dependencies.pending.length)throw Error('Missing v17 dependencies: '+dependencies.pending.join(', '));
const activePublic=dependencies.publicFiles;
const inputFiles=dependencies.sourceFiles;
const sourceAssets=inputFiles.map(file=>{if(!fs.existsSync(file))throw Error(`Missing launch input: ${file}`);return{file:path.relative(root,file).replaceAll('\\','/'),sha256:hashFile(file),sizeBytes:fs.statSync(file).size};});
const sha=crypto.createHash('sha256');
sha.update(JSON.stringify({overlay,blueprint,fps,frames:story.duration,width:1920,height:1080,compositionId,codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709'}));
for(const asset of sourceAssets){sha.update(asset.file);sha.update(asset.sha256);}
const revision=sha.digest('hex').slice(0,12);
const output=path.join(root,'output',`launch-v17-render-${revision}`);
const qa=mode==='stills'&&absoluteOutput?absoluteOutput:path.join(output,'stills');
if(mode==='stills'&&/\.(mp4|png|jpe?g)$/i.test(qa))throw Error('--output for --stills must name a directory');
const staging=path.join(root,'tmp',`launch-v17-public-${revision}`);
const sourceStaging=path.join(root,'tmp',`launch-v17-source-${revision}`);
fs.mkdirSync(qa,{recursive:true});fs.mkdirSync(staging,{recursive:true});
const copiedMedia=[];
for(const src of activePublic){const rel=path.relative(publicRoot,src),dest=path.join(staging,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);const sourceRecord=sourceAssets.find(asset=>asset.file===path.relative(root,src).replaceAll('\\','/'));const frozenSHA256=hashFile(dest);if(frozenSHA256!==sourceRecord.sha256)throw Error(`Asset changed while freezing: ${src}`);copiedMedia.push({source:sourceRecord.file,frozenAbsolutePath:dest,sha256:frozenSHA256,sizeBytes:fs.statSync(dest).size});}
const frozenSources=[];
for(const src of dependencies.sourceFreezeFiles){const rel=path.relative(root,src),dest=path.join(sourceStaging,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);const record=sourceAssets.find(asset=>asset.file===rel.replaceAll('\\','/'));if(hashFile(dest)!==record.sha256)throw Error('Source changed while freezing: '+rel);frozenSources.push({source:record.file,frozenAbsolutePath:dest,sha256:record.sha256});}
const frozenEntryPoint=path.join(sourceStaging,path.relative(root,entryPoint));
const frozenAudioPath=fs.existsSync(audioPath)?path.join(staging,path.relative(publicRoot,audioPath)):null;
const manifest={schema:'launch-v17-render-v1',revision,compositionId,entryPoint,audioPath,frozenAudioPath,audioSHA256:frozenAudioPath?hashFile(frozenAudioPath):null,audioPending:!frozenAudioPath,fps,durationInFrames:story.duration,seconds:story.duration/fps,width:1920,height:1080,overlay,blueprint,mode,concurrency,noMux,started:new Date().toISOString(),sceneStarts:(story.scenes||[]).map(s=>({id:s.id,start:s.start,duration:s.duration})),sourceAssets,dependencyClosure:{dynamicCalls:dependencies.dynamicCalls,externalPackages:dependencies.externalPackages,runtimeManifest:path.relative(root,runtimeManifestPath).replaceAll('\\','/')},copiedMedia,copyReport:'Exact public runtime files copied to this revision staging directory; no old output or cache is copied or modified.',assets:activePublic.map(f=>path.relative(root,f).replaceAll('\\','/')),segments:[]};
const manifestName=mode==='render'?'render-manifest.json':mode==='stills'?'stills-manifest.json':`clip-${clip}-manifest.json`;
const saveManifest=()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,manifestName),JSON.stringify(manifest,null,2)+'\n');};
saveManifest();
manifest.frozenSources=frozenSources;manifest.frozenEntryPoint=frozenEntryPoint;saveManifest();
const serveUrl=await bundle({entryPoint:frozenEntryPoint,publicDir:staging,outDir:path.join(root,'tmp',`launch-v17-bundle-${revision}`)});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const layoutSamples=[],browserErrors=[];
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay,blueprint,qa:mode==='stills'},timeoutInMilliseconds:120000,onBrowserLog:log=>{if(log.text?.startsWith('LAYOUT_QA ')){try{layoutSamples.push(JSON.parse(log.text.slice(10)))}catch{}}if(/shader error|validate_status false|WebGL.*error|WebGPU.*error|GPUValidationError|device lost/i.test(log.text??'')){browserErrors.push(log.text);console.log('WEBGL_ERROR',log.text);}}};
const validSegment=(record)=>{const sidecar=record.file+'.json';if(!fs.existsSync(record.file)||!fs.existsSync(sidecar)||!fs.statSync(record.file).size)return false;try{const saved=JSON.parse(fs.readFileSync(sidecar,'utf8'));return saved.revision===revision&&saved.frames===record.frames&&saved.start===record.start&&saved.end===record.end&&saved.sha256===hashFile(record.file);}catch{return false;}};
const mux=(video,file,from,frames)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-i',video,'-ss',String(from/fps),'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(frames/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg audio mux failed');};
try{
 const composition=await selectComposition({...common,id:compositionId});
 if(composition.durationInFrames!==6300||composition.fps!==60||composition.width!==1920||composition.height!==1080)throw Error('Launch entry and v17 delivery specification disagree');
 if(mode==='clip'){
  const [from,to]=parsedClip;
  const rendered=path.join(output,`clip-${from}-${to}-silent.mp4`),file=absoluteOutput||path.join(output,`clip-${from}-${to}.mp4`);
  if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
  await renderMedia({...common,composition,frameRange:[from,to],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',concurrency,outputLocation:rendered});
  if(noMux){const silentTarget=absoluteOutput||rendered;if(silentTarget!==rendered){fs.mkdirSync(path.dirname(silentTarget),{recursive:true});fs.copyFileSync(rendered,silentTarget);}manifest.preview={from,to,frames:to-from+1,file:silentTarget,sha256:hashFile(silentTarget),silent:true};console.log('SILENT_CLIP',silentTarget);}else{mux(rendered,file,from,to-from+1);manifest.preview={from,to,frames:to-from+1,file,sha256:hashFile(file),silent:false};console.log('CLIP',file);}manifest.finished=new Date().toISOString();saveManifest();
 }else if(mode==='stills'){
  let frames=[];
  if(customFrames)frames=parsedFrames;
  else for(const scene of story.scenes){frames.push(scene.start+Math.min(120,scene.duration-1),scene.start+Math.floor(scene.duration*.52),scene.start+scene.duration-1);if(scene.start>0)for(const offset of [-30,-15,0,15,30,60])frames.push(Math.max(0,Math.min(story.duration-1,scene.start+offset)));}
  if(frames.some(f=>!Number.isInteger(f)||f<0||f>=story.duration))throw Error('--frames contains an invalid or out-of-range frame');
  frames=[...new Set(frames)].sort((a,b)=>a-b);
  for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(qa,`frame-${String(frame).padStart(6,'0')}.${imageFormat==='png'?'png':'jpg'}`),imageFormat,...(imageFormat==='jpeg'?{jpegQuality:95}:{})});console.log('STILL',frame);}
  const record={revision,overlay,blueprint,imageFormat,frames,stillsDirectory:qa};fs.writeFileSync(path.join(output,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(qa,'qa-frames.json'),JSON.stringify(record,null,2)+'\n');fs.writeFileSync(path.join(output,'qa-layout.json'),JSON.stringify({revision,samples:layoutSamples},null,2)+'\n');manifest.stills=record;manifest.finished=new Date().toISOString();saveManifest();
 }else{
  for(let start=0,index=0;start<story.duration;start+=chunk,index++){
   const end=Math.min(story.duration-1,start+chunk-1),file=path.join(output,`segment-${String(start).padStart(6,'0')}-${String(end).padStart(6,'0')}.mp4`),record={index,start,end,frames:end-start+1,file};manifest.segments.push(record);
   if(wanted&&!wanted.includes(index))continue;
   if(validSegment(record)){console.log('RESUME',index);continue;}
   const began=Date.now();let last=-1;
   await renderMedia({...common,composition,frameRange:[start,end],codec:'h264',crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:file,onProgress:p=>{const q=Math.floor(p.progress*10);if(q!==last){console.log('SEGMENT',index,Math.round(p.progress*100)+'%');last=q;}}});
   fs.writeFileSync(file+'.json',JSON.stringify({...record,revision,sha256:hashFile(file),finished:new Date().toISOString(),elapsedS:(Date.now()-began)/1000},null,2)+'\n');saveManifest();
  }
  saveManifest();
  if(manifest.segments.every(validSegment)&&!noMux){
   const concat=path.join(output,'concat.txt');fs.writeFileSync(concat,manifest.segments.map(segment=>`file '${segment.file.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
   const file=absoluteOutput||path.join(root,'output/ai_engineer_launch_v17_1080p60.mp4');if(!/\.mp4$/i.test(file))throw Error('--output for clip/full render must end in .mp4');
   fs.mkdirSync(path.dirname(file),{recursive:true});const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y','-f','concat','-safe','0','-i',concat,'-i',frozenAudioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t',String(story.duration/fps),file],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'FFmpeg final mux failed');
   manifest.finished=new Date().toISOString();manifest.final=file;manifest.finalSHA256=hashFile(file);saveManifest();console.log('FINAL',file);
  }else if(manifest.segments.every(validSegment)){manifest.mixPending=true;saveManifest();console.log('SILENT_SEGMENTS_COMPLETE',manifest.segments.length);}else console.log('PARTIAL',manifest.segments.filter(validSegment).length,'/',manifest.segments.length);
 }
 manifest.browserErrors=browserErrors;saveManifest();if(browserErrors.length)throw Error('GPU renderer validation failed');console.log('OUTPUT',output);
}catch(error){manifest.error=String(error);saveManifest();throw error;}finally{await browser.close({silent:true});}



