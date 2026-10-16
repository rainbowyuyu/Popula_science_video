import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'work/rainbow-review-v09');fs.mkdirSync(out,{recursive:true});
const publicDir=path.join(out,'empty-public');fs.mkdirSync(publicDir,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'work/rainbow-preview-entry-v09.tsx'),publicDir,outDir:path.join(out,'small-bundle'),webpackOverride:config=>({...config,cache:false})});
const browserExecutable=path.join(root,'work/render-browser-v09/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
const logs=[];
try{
  const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},puppeteerInstance:browser,onBrowserLog:log=>{logs.push(log);console.log(log.type,log.text);}};
  const composition=await selectComposition({...opts,id:'RainbowMaterialReviewV09'});
  for(const frame of [0,30,60]){
    await renderStill({...opts,composition,frame,output:path.join(out,`rainbow-${frame}.png`),imageFormat:'png'});
    console.log('rainbow review',frame);
  }
  fs.writeFileSync(path.join(out,'browser-logs.json'),JSON.stringify(logs,null,2));
  if(logs.some(l=>l.type==='error'&&/Shader|VALIDATE_STATUS|WebGLProgram|GLSL|ERROR:/i.test(l.text??'')))throw new Error('GPU shader compile log reported an error');
}finally{await browser.close({silent:true});}
