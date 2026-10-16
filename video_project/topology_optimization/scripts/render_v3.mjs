import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const output=path.join(root,'output/v3');fs.mkdirSync(output,{recursive:true});
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const lock=path.join(root,'tmp/render-v3-active.lock');
fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
process.on('exit',()=>{try{fs.unlinkSync(lock)}catch{}});
const timeline=JSON.parse(fs.readFileSync('public/v3/timeline.json','utf8'));
const bundled=await bundle({entryPoint:path.join(root,'src/index-v3.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/v3-bundle')});
const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const options={serveUrl:bundled,browserExecutable:chrome,chromiumOptions:{gl:'angle'},inputProps:{audio:!process.argv.includes('stills')}};
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const comp=await selectComposition({...options,pupeteerInstance:browser,id:'TopologyStoryV3'});
if(process.argv.includes('checks')){
 const folder=path.join(output,'checks');fs.mkdirSync(folder,{recursive:true});
 for(const s of timeline.scenes){for(const offset of [0,12,36]){const f=Math.min(timeline.duration-1,s.start+offset);await renderStill({...options,inputProps:{audio:false},pupeteerInstance:browser,composition:comp,frame:f,output:path.join(folder,s.id+'-'+offset+'.jpg'),imageFormat:'jpeg',jpegQuality:92})}console.log('Checked',s.id)}
}else if(process.argv.includes('stills')){
 for(const s of timeline.scenes){const f=Math.floor(s.start+(s.end-s.start)*.63);await renderStill({...options,pupeteerInstance:browser,composition:comp,frame:f,output:path.join(output,s.id+'.jpg'),imageFormat:'jpeg',jpegQuality:95});console.log(s.id,f)}
}else{
 const rangeArg=process.argv.find(x=>x.startsWith('--frames='));const range=rangeArg?rangeArg.split('=')[1].split('-').map(Number):null;
 let last=-1;
 const outputArg=process.argv.find(x=>x.startsWith('--output='));
 await renderMedia({...options,pupeteerInstance:browser,composition:comp,codec:'h264',outputLocation:outputArg?path.resolve(outputArg.slice(9)):path.join(output,range?'motion-check.mp4':'书架为什么敢挖空_1080p.mp4'),crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:4,timeoutInMilliseconds:90000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*20);if(n>last){last=n;console.log('Render',n*5+'%',p.renderedFrames)}}});
}
await browser.close({silent:true});
