import {bundle} from '@remotion/bundler';
import {renderMedia,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.includes('--help')){console.log('Usage: node scripts/render_patches.mjs --plan=PATH --video=PATH --report=PATH [--out-dir=PATH] [--bundle-dir=PATH] [--concurrency=3] [--append]\nAll paths are project-relative. Existing reports and patch clips are protected.');process.exit(0);}
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const planPath=option('plan');
if(!planPath)throw new Error('Provide --plan=research/qa/patch-plan.json');
const plan=JSON.parse(fs.readFileSync(path.resolve(root,planPath),'utf8'));
const videoOption=option('video',plan.video);
if(!videoOption)throw new Error('Provide --video=PATH or plan.video');
const video=path.resolve(root,videoOption),stem=path.parse(video).name;
if(plan.video&&path.resolve(root,plan.video).toLowerCase()!==video.toLowerCase())throw new Error('Plan video does not match --video');
const reportPath=path.resolve(root,option('report',`research/qa/patch-renders-${stem}.json`));
const out=path.resolve(root,option('out-dir',`tmp/patches-${stem}`));
const bundleDir=path.resolve(root,option('bundle-dir',`tmp/patch-bundle-${stem}`));
const mainBundle=path.join(root,'tmp/bundle').toLowerCase();
if(bundleDir.toLowerCase()===mainBundle||mainBundle.startsWith(bundleDir.toLowerCase()+path.sep)||bundleDir.toLowerCase().startsWith(mainBundle+path.sep))throw new Error('Patch bundle must be separate from tmp/bundle');
const concurrency=Number(option('concurrency','3'));
if(!Number.isInteger(concurrency)||concurrency<1)throw new Error('Invalid concurrency');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(plan.timelineFrames!==timeline.duration||plan.fps!==timeline.fps)throw new Error('Patch plan does not match current timeline');
const previous=process.argv.includes('--append')?JSON.parse(fs.readFileSync(reportPath,'utf8')):null;
if(!previous&&fs.existsSync(reportPath))throw new Error('Report already exists: '+reportPath);
if(previous&&(!previous.complete||!previous.video||path.resolve(root,previous.video).toLowerCase()!==video.toLowerCase()))throw new Error('Append requires a complete report for the selected video');
let rangeEnd=-1;
for(const patch of [...(previous?.patches??[]),...plan.patches].sort((a,b)=>a.start-b.start)){
 if(!Number.isInteger(patch.start)||!Number.isInteger(patch.end)||patch.start<0||patch.end<patch.start||patch.end>=timeline.duration||patch.start<=rangeEnd)throw new Error('Invalid or overlapping patch range');
 rangeEnd=patch.end;
}
for(const patch of plan.patches)if(fs.existsSync(path.join(out,`frames-${patch.start}-${patch.end}.mp4`)))throw new Error('Patch clip already exists');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.dirname(reportPath),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:bundleDir});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const options={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
const report={started:previous?.started??new Date().toISOString(),video,plan:planPath,timelineFrames:timeline.duration,fps:timeline.fps,patches:previous?.patches??[],complete:false};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
save();
try{
 const composition=await selectComposition({...options,pupeteerInstance:browser,id:'ShanghaiTower'});
 if(composition.durationInFrames!==timeline.duration||composition.fps!==timeline.fps)throw new Error('Composition timeline mismatch');
 for(const patch of plan.patches){
  const {start,end}=patch;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=composition.durationInFrames)throw new Error('Invalid patch range');
  const outputLocation=path.join(out,`frames-${start}-${end}.mp4`);let previous=-1;const clock=Date.now();
  console.log(`PATCH ${start}-${end}: ${patch.reason}`);
  await renderMedia({...options,pupeteerInstance:browser,composition,codec:'h264',outputLocation,crf:16,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency,timeoutInMilliseconds:120000,frameRange:[start,end],onProgress:p=>{const n=Math.floor(p.progress*10)*10;if(n!==previous){console.log(`${start}-${end} ${n}%`);previous=n;}}});
  report.patches.push({...patch,file:path.relative(root,outputLocation).replaceAll('\\','/'),seconds:(Date.now()-clock)/1000});save();
 }
 report.complete=true;report.finished=new Date().toISOString();save();
}finally{await browser.close({silent:true});}
