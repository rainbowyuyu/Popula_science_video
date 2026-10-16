import {bundle} from '@remotion/bundler';
import {renderMedia,selectComposition,openBrowser,renderStill} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).replace(/^--/,''),x.slice(i+1)]}));
const stills=process.argv.includes('--stills');
const silence=process.argv.includes('--silent');
const outRoot=path.resolve(root,args.outdir||'output');fs.mkdirSync(outRoot,{recursive:true});fs.mkdirSync(path.join(outRoot,'stills'),{recursive:true});
const bundleDir=path.resolve(root,args.bundle||'work/bundle');fs.mkdirSync(path.dirname(bundleDir),{recursive:true});
const publicDir=path.join(root,'public');const b=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir,outDir:bundleDir});
const installed=process.env.CHROME_PATH||'D:/python_project/manim_extend_rainbow/video_project/rainbow_arc_2026_v10/work/render-browser-v10/chrome-headless-shell.exe';
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
let last=-1;try{
 const opts={serveUrl:b,browserExecutable:installed,chromiumOptions:{gl:'angle'},timeoutInMilliseconds:180000,inputProps:{audio:!silence},puppeteerInstance:browser};
 const comp=await selectComposition({...opts,id:'MarineEnergyEpisode01'});
 if(stills){const end=Math.max(0,comp.durationInFrames-1);const marks=args.frames?args.frames.split(',').map(Number):[0,.08,.17,.28,.4,.52,.64,.75,.86,.96,1].map(x=>Math.min(end,Math.round(end*x)));for(const frame of [...new Set(marks)]) await renderStill({...opts,composition:comp,frame,output:path.join(outRoot,'stills',`frame-${String(frame).padStart(5,'0')}.png`),imageFormat:'png',scale:Number(args.scale||1)});}
 else {const output=path.join(outRoot,args.output||'marine_energy_episode01_6m.mp4');await renderMedia({...opts,composition:comp,codec:'h264',audioBitrate:'192k',outputLocation:output,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:92,concurrency:Number(args.concurrency||2),...(args.range?{frameRange:args.range.split('-').map(Number)}:{}),scale:Number(args.scale||1),onProgress:({progress})=>{const n=Math.floor(progress*20);if(n>last){last=n;console.log(`Render ${n*5}%`);}}});console.log(output);}
}finally{await browser.close({silent:true});}
