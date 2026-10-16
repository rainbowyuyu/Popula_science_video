import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';import {bundle} from '@remotion/bundler';
const root=process.cwd(),arg=(k,d)=>process.argv.find(a=>a.startsWith(k+'='))?.slice(k.length+1)??d;
const mode=arg('--mode','preview'),out=path.resolve(root,arg('--out','tmp/v7-preview-01'));
if(!out.startsWith(root+path.sep)||fs.existsSync(path.join(out,'result.json')))throw Error('Fresh project output required');
fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),rel=p=>path.relative(root,p).replaceAll(path.sep,'/');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2),'utf8');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(p,d.name)):[path.join(p,d.name)]).sort();
const files=[...walk(path.join(root,'src')),...walk(path.join(root,'public')),...['package.json','package-lock.json','tsconfig.json','docs/story-v5.json','scripts/render_v7.mjs','scripts/run_v7.mjs','scripts/sheets_v7.py','scripts/motion_sheets_v7.py','scripts/verify_video_v7.py','scripts/package_v7.py'].map(p=>path.join(root,p))];
const hashes=Object.fromEntries(files.map(p=>[rel(p),sha(p)]));
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
const check=()=>{for(const [p,h] of Object.entries(hashes))if(sha(path.join(root,p))!==h)throw Error('Source changed during render: '+p);};
const run=(exe,args)=>new Promise((resolve,reject)=>{const p=spawn(exe,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('exit',code=>code===0?resolve({stdout,stderr}):reject(Error(exe+' failed '+code+'\n'+stderr)));});
const entry=path.join(root,'src/index.tsx'),start=Date.now();
if(mode==='full'){
 for(const p of files){const dest=path.join(out,'frozen',rel(p));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);if(sha(dest)!==hashes[rel(p)])throw Error('snapshot mismatch');}
 write(path.join(out,'source-lock.json'),{createdUTC:new Date().toISOString(),files:hashes,frames:timeline.duration,fps:timeline.fps});
 const old=path.join(root,'delivery/GLP1_V5_1080p.mp4');
 if(arg('--replay','false')==='true')write(path.join(out,'baseline.json'),{replay:true,note:'Reproduction from saved source; does not install a delivery or edit an older marker.'});
 else write(path.join(out,'baseline.json'),{path:rel(old),sha256:sha(old),marker:JSON.parse(fs.readFileSync(path.join(root,'tmp/final-render.json'),'utf8'))});
}
const served=await bundle({entryPoint:entry,publicDir:path.join(root,'public'),outDir:path.join(out,'bundle')});check();
const require=createRequire(import.meta.url),launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js')),old=launcher.launchChrome;launcher.launchChrome=o=>old({...o,args:[...(o.args??[]).filter(a=>!a.startsWith('--use-angle=')),'--use-angle=d3d11','--force_high_performance_gpu','--enable-gpu']});
const {openBrowser,selectComposition,renderMedia,renderFrames}=require('@remotion/renderer'),browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
let result;
try{
 const gpu=await browser.connection.send('SystemInfo.getInfo');write(path.join(out,'gpu.json'),gpu);
 const opts={serveUrl:served,puppeteerInstance:browser,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:false},timeoutInMilliseconds:180000},composition=await selectComposition({...opts,id:'GLP1'});
 if(composition.durationInFrames!==timeline.duration||composition.fps!==30||composition.width!==1920)throw Error('Composition mismatch');
 if(mode==='preview'){
  const requested=arg('--frames',''),planPath=arg('--frame-plan','');
  const frames=planPath?JSON.parse(fs.readFileSync(path.resolve(root,planPath),'utf8')).frames:requested?requested.split(',').map(Number):timeline.clips.flatMap(c=>[.18,.53,.85].map(u=>Math.floor(c.start+c.duration*u)));
  if(!frames.length||frames.some(f=>!Number.isInteger(f)||f<0||f>=timeline.duration))throw Error('Invalid inspection frame plan');
  const target=path.join(out,'frames');fs.mkdirSync(target,{recursive:true});
  await renderFrames({...opts,composition,frames,imageFormat:'jpeg',jpegQuality:93,outputDir:target,concurrency:2,onStart:()=>{},onFrameUpdate:(n)=>{if(n%25===0)console.log('Preview frames '+n+'/'+frames.length)}});
  result={mode,frames,hashes,seconds:(Date.now()-start)/1000,reviewStatus:'pending'};
 }else{
  const range=arg('--range',''),frameRange=range?range.split(',').map(Number):undefined;
  const silent=path.join(out,'silent.mp4');let last=-1;
  await renderMedia({...opts,composition,frameRange,outputLocation:silent,codec:'h264',crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',muted:true,concurrency:3,videoImageFormat:'jpeg',jpegQuality:95,scale:Number(arg('--scale','1')),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==last){console.log('Render '+n+'%');last=n;}}});
  check();
  if(mode==='full'){
   const final=path.join(out,'GLP1_V7_1080p.mp4');
   const chapterGroups=[];
   for(const c of timeline.clips){const title=c.id==='h077'?'识别急症，及时求助':c.heading??c.chapter;const last=chapterGroups.at(-1);if(last&&last.title===title)last.end=c.end;else chapterGroups.push({title,start:c.start,end:c.end});}
   chapterGroups.push({title:'研究来源',start:timeline.clips.at(-1).end,end:timeline.duration});
   const metadata=path.join(out,'chapters.ffmetadata');
   fs.writeFileSync(metadata,';FFMETADATA1\ntitle=如何科学减肥？看懂血糖、血压和血脂\n'+chapterGroups.map(c=>'[CHAPTER]\nTIMEBASE=1/30\nSTART='+c.start+'\nEND='+c.end+'\ntitle='+c.title+'\n').join(''),'utf8');
   await run('ffmpeg',['-hide_banner','-nostdin','-v','error','-n','-i',silent,'-i',path.join(root,'public/master.wav'),'-i',metadata,'-map','0:v:0','-map','1:a:0','-map_metadata','2','-map_chapters','2','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0','-movflags','+faststart+write_colr',final]);
   const probe=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',final])).stdout),video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
   if(Number(video.nb_frames)!==timeline.duration||video.width!==1920||video.height!==1080||Number(audio.sample_rate)!==48000||Math.abs(Number(probe.format.duration)-timeline.duration/30)>.08)throw Error('Encoded media dimensions/timing mismatch');
   await run('ffmpeg',['-hide_banner','-nostdin','-v','error','-xerror','-i',final,'-map','0:v:0','-map','0:a:0','-f','null','-']);
   result={mode,video:rel(final),videoSHA256:sha(final),masterSHA256:hashes['public/master.wav'],timelineSHA256:hashes['src/timeline.json'],frames:timeline.duration,fps:30,fullDecode:true,probe,hashes,seconds:(Date.now()-start)/1000,reviewStatus:'pending'};
  }else result={mode,frameRange,video:rel(silent),hashes,seconds:(Date.now()-start)/1000,reviewStatus:'pending'};
 }
 check();write(path.join(out,'result.json'),result);console.log(JSON.stringify({done:true,mode,out,seconds:result.seconds}));
}finally{await browser.close({silent:true});}
