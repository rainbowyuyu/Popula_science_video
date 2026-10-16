import {openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
const installed=path.resolve('work/render-browser-v09/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try {
 const page=await browser.newPage({context:null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas'),gl=c.getContext('webgl2',{powerPreference:'high-performance'});
  if(!gl)return {webgl2:false};
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {webgl2:true,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION)};
 });
 fs.mkdirSync('research/qa',{recursive:true});fs.writeFileSync('research/qa/gpu-v09.json',JSON.stringify(data,null,2));console.log(data);
} finally {await browser.close({silent:true});}
