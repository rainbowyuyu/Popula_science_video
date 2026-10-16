import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {configureRenderer as configureBase} from './renderer-options.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let configured=false;
export function getBrowserExecutable(){
 const file=path.join(root,'work/browser-webgpu/chrome-headless-shell.exe');
 if(!fs.existsSync(file))throw Error('Verified WebGPU browser is missing');
 return file;
}
export function configureRenderer(){
 const settings=configureBase();
 if(!configured){
  const launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js'));
  const original=launcher.launchChrome;
  launcher.launchChrome=options=>original({...options,args:[...options.args,'--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--disable-vulkan-surface']});
  configured=true;
 }
 return settings;
}
