import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options-v16.mjs';
const root=process.cwd(),base=path.join(root,'research/generation/v16-qwen'),out=process.argv.includes('--verify')?path.join(base,'current-verification'):base,stage=path.join(out,'runtime-public');
fs.mkdirSync(stage,{recursive:true});
const geo=JSON.parse(fs.readFileSync(path.join(root,'public/beso-research/geometry/manifest.json'),'utf8'));
const files=['beso-research/physics/native-model.json','beso-research/physics/zwind-response.json','beso-research/geometry/manifest.json',`beso-research/geometry/${geo.shared}`,...geo.iterations.map(s=>`beso-research/geometry/${s.file}`),'assets/v16/connected-native-hull.glb','assets/v16/nacelle-skin.glb','assets/v16/waterpro-adapter.min.js','assets/v16/world-webgpu.js','environment/v2-sky.hdr'];
for(const name of files){const src=path.join(root,'public',name),dest=path.join(stage,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
const serveUrl=await bundle({entryPoint:path.join(base,'entry.tsx'),publicDir:stage,outDir:path.join(out,'anchor-bundle')});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer(),browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const errors=[];
const sourceFiles=['src/beso/LaunchWorldV16.ts','src/beso/LaunchV16Camera.ts','src/beso/NativePlatformV16.ts','scripts/renderer-options-v16.mjs',...files.map(name=>'public/'+name)];
const hashes=sourceFiles.map(name=>({file:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
try{
 for(const shot of [{frame:420,name:'platform-7s',blueprint:false},{frame:660,name:'platform-11s',blueprint:false},{frame:1020,name:'platform-17s',blueprint:false},{frame:1260,name:'platform-21s',blueprint:false},{frame:1020,name:'blueprint-17s',blueprint:true}]){
  const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{blueprint:shot.blueprint},timeoutInMilliseconds:120000,onBrowserLog:log=>{if(/shader error|validate_status false|WebGL.*error/i.test(log.text??'')){errors.push(log.text);console.log('WEBGL_ERROR',log.text)}}};
  const composition=await selectComposition({...common,id:'NativeV16Anchor'});
  const dest=path.join(out,'native-anchors',shot.name+'.png');fs.mkdirSync(path.dirname(dest),{recursive:true});
  await renderStill({...common,composition,frame:shot.frame,output:dest,imageFormat:'png'});console.log('ANCHOR',shot.name);
 }
 fs.writeFileSync(path.join(out,'native-anchors/qa.json'),JSON.stringify({world:'LaunchWorldV16',createdAt:new Date().toISOString(),files,hashes,errors},null,2));
 if(errors.length)throw new Error('WebGL validation errors; do not submit these anchors');
} finally {await browser.close({silent:true});}
