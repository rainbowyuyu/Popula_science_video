import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
execFileSync('python',[path.join(root,'scripts/prepare_fonts_v03.py')],{stdio:'inherit'});
const outDir=path.join(root,'delivery/chemistry2026_v03');
const bundleDir=path.join(root,`tmp/chemistry-v03-bundle-${process.pid}`);
const publicDir=path.join(root,`tmp/chemistry-v03-public-${process.pid}`);
for(const p of [outDir,bundleDir,publicDir])fs.mkdirSync(p,{recursive:true});
const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
if(!fs.existsSync(chrome))throw new Error(`Missing Chrome: ${chrome}`);
const entryPoint=path.join(root,'src/index-chemistry2026-v03.tsx');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/chemistry2026v03/timeline-v03.json'),'utf8').replace(/^\uFEFF/,''));
const stills=process.argv.includes('stills');
const value=flag=>process.argv.find(a=>a.startsWith(`${flag}=`))?.slice(flag.length+1);
const sampleArg=value('--sample-frames');const outputArg=value('--output');const rangeArg=value('--frames');
const renderConcurrency=Number(value('--concurrency')??2);if(!Number.isInteger(renderConcurrency)||renderConcurrency<1||renderConcurrency>8)throw new Error('Concurrency must be 1..8');
const range=rangeArg?rangeArg.split('-').map(Number):null;
if(range&&(!range.every(Number.isInteger)||range.length!==2||range[0]<0||range[1]<range[0]||range[1]>=timeline.duration))throw new Error('Invalid --frames=start-end range');
// Each render owns its staging directories. Never stage unused voice/music stems.
const assets=[];
function collect(dir,relative=''){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const rel=path.posix.join(relative,e.name);
  if(e.isDirectory()){if(/^audio(?:-|\/|$)/i.test(rel)||rel==='fonts')continue;collect(path.join(dir,e.name),rel);}
  else if(e.isFile())assets.push(rel);
 }
}
collect(path.join(root,'public'));
const needsMaster=!stills&&!sampleArg&&!range;if(needsMaster)assets.push('audio-v03/master.wav');
const deps=assets.map(asset=>{
 const source=path.join(root,'public',asset);if(!fs.existsSync(source))throw new Error(`Missing input: ${source}`);
 const destination=path.join(publicDir,asset);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);
 return {asset,bytes:fs.statSync(source).size,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')};
});
const dependencies={version:'chemistry-v03',composition:'NobelChemistry2026V03',entryPoint,visualAudio:false,assets:deps,mode:needsMaster?'full':range?'segment':'stills'};
fs.writeFileSync(path.join(outDir,needsMaster?'render-dependencies.json':`render-dependencies-${dependencies.mode}.json`),JSON.stringify(dependencies,null,2));
const serveUrl=await bundle({entryPoint,publicDir,outDir:bundleDir});
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const base={serveUrl,browserExecutable:chrome,chromiumOptions:{gl:'angle'},puppeteerInstance:browser,inputProps:{audio:false}};
try{
 const composition=await selectComposition({...base,id:'NobelChemistry2026V03'});
 if(stills||sampleArg){
  const folder=path.join(outDir,sampleArg?'targeted':'stills');fs.mkdirSync(folder,{recursive:true});
  const raw=sampleArg?sampleArg.split(',').map(Number):timeline.clips.flatMap(c=>[.2,.5,.8].map(q=>c.start+Math.floor((c.end-c.start-1)*q)));
  const frames=[...new Set(raw)].sort((a,b)=>a-b);if(frames.some(f=>!Number.isInteger(f)||f<0||f>=composition.durationInFrames))throw new Error('Invalid sample frame');
  for(const frame of frames){await renderStill({...base,composition,frame,output:path.join(folder,`frame-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95});console.log('still',frame);}
 }else{
  const dest=outputArg?path.resolve(outputArg):path.join(outDir,range?`segment-${range[0]}-${range[1]}.mp4`:'2026诺贝尔化学奖_让化学选择同一只手_v03_1080p.mp4');
  fs.mkdirSync(path.dirname(dest),{recursive:true});let last=-1;
  await renderMedia({...base,composition,codec:'h264',outputLocation:dest,crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:renderConcurrency,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:({progress,renderedFrames})=>{const bucket=Math.floor(progress*20);if(bucket>last){last=bucket;console.log(`render ${Math.floor(progress*100)}% / ${renderedFrames} frames`)}}});
  if(!range){const mux=dest.replace(/\.mp4$/i,'.mux.mp4');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',dest,'-i',path.join(publicDir,'audio-v03/master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-t',String(composition.durationInFrames/composition.fps),'-movflags','+faststart',mux],{stdio:'inherit'});fs.renameSync(mux,dest);}
  console.log(dest);
 }
}finally{await browser.close({silent:true})}
