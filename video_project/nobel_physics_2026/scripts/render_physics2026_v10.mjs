import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const outputDir=path.join(root,'delivery/physics2026_v10');
const bundleDir=path.join(root,'tmp/physics2026-v10-bundle');
const publicDir=path.join(root,'tmp/physics2026-v10-public');
fs.mkdirSync(outputDir,{recursive:true});
fs.mkdirSync(bundleDir,{recursive:true});
fs.rmSync(publicDir,{recursive:true,force:true});
fs.mkdirSync(publicDir,{recursive:true});
const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
if(!fs.existsSync(chrome)) throw new Error(`Missing Remotion Chrome: ${chrome}`);
const entryPoint=path.join(root,'src/index-physics2026-v06.tsx');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/physics2026/timeline-v10.json'),'utf8').replace(/^\uFEFF/,''));
const assets=[
  'logo.png','brand/rainbow-white.svg','fonts/sans.woff2','fonts/serif.woff2',
  'formulas/cherenkov.svg','formulas/cherenkov-threshold.svg','audio-v07/master.wav',
  'fig-main.jpg','fig-ice.jpg','fig-messenger.jpg',
  'bridges-v01/bridge-01-cosmic-arrival.mp4','bridges-v01/bridge-02-ice-descent.mp4',
  'bridges-v01/bridge-03-cherenkov-volume.mp4','bridges-v01/bridge-04-source-return.mp4',
  'bridges-v01/bridge-05-night-coda.mp4',
];
const dependencies=assets.map(asset=>{
  const src=path.join(root,'public',asset);
  if(!fs.existsSync(src)) throw new Error(`Missing asset: ${src}`);
  const dst=path.join(publicDir,asset);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
  return {asset,bytes:fs.statSync(src).size,sha256:createHash('sha256').update(fs.readFileSync(src)).digest('hex')};
});
fs.writeFileSync(path.join(outputDir,'render-dependencies.json'),JSON.stringify({version:'v10',composition:'NobelPhysics2026V06',entryPoint,assets:dependencies},null,2));
const serveUrl=await bundle({entryPoint,publicDir,outDir:bundleDir});
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const stills=process.argv.includes('stills');
const frameArg=process.argv.find(a=>a.startsWith('--sample-frames='));
const rangeArg=process.argv.find(a=>a.startsWith('--frames='));
const outputArg=process.argv.find(a=>a.startsWith('--output='));
const samples=frameArg?frameArg.slice('--sample-frames='.length).split(',').map(Number):null;
const range=rangeArg?rangeArg.slice(9).split('-').map(Number):null;
const base={serveUrl,browserExecutable:chrome,chromiumOptions:{gl:'angle'},puppeteerInstance:browser,inputProps:{audio:!stills&&!samples&&!range}};
try{
  const composition=await selectComposition({...base,id:'NobelPhysics2026V06'});
  if(stills||samples){
    const folder=path.join(outputDir,samples?'targeted':'stills');fs.mkdirSync(folder,{recursive:true});
    const frames=samples??[120,390,820,1210,1600,2070,2420,2860,3300,3650,4000,4400,4800,5200,6000,6500,7080,7390];
    for(const frame of frames){
      const label=`frame-${frame}`;
      await renderStill({...base,composition,inputProps:{audio:false},frame,output:path.join(folder,`${label}.jpg`),imageFormat:'jpeg',jpegQuality:95});
      console.log(`still ${label}`);
    }
  }else{
    const destination=outputArg?path.resolve(outputArg.slice(9)):path.join(outputDir,'2026诺贝尔物理学奖_一束蓝光穿过南极冰_v10_个人TTS与电影配乐1080p.mp4');
    const options={...base,composition,codec:'h264',outputLocation:destination,crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:1,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{})};
    await renderMedia(options);
    if(!range){
      const muxed=destination.replace(/\.mp4$/i,'.mux.mp4');
      execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',destination,'-i',path.join(publicDir,'audio-v07/master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-t',String(composition.durationInFrames/composition.fps),'-movflags','+faststart',muxed],{stdio:'inherit'});
      fs.renameSync(muxed,destination);
    }
    console.log(destination);
  }
} finally { await browser.close({silent:true}); }

