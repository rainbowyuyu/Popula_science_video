import {openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const gl=process.argv.find(x=>x.startsWith('--gl='))?.slice(5)??'angle';
const browser=await openBrowser('chrome',{browserExecutable:path.resolve('../node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),chromiumOptions:{gl}});
try {
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 const result=await page.evaluate(()=>{const canvas=document.createElement('canvas');const ctx=canvas.getContext('webgl2',{powerPreference:'high-performance'});if(!ctx)return{error:'No WebGL2'};const ext=ctx.getExtension('WEBGL_debug_renderer_info');return{version:ctx.getParameter(ctx.VERSION),vendor:ctx.getParameter(ctx.VENDOR),renderer:ctx.getParameter(ctx.RENDERER),unmaskedVendor:ext?ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:ext?ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
 fs.mkdirSync('research',{recursive:true});fs.writeFileSync(`research/webgl-v4-${gl}.json`,JSON.stringify({gl,...result},null,2));console.log(result);
} finally {await browser.close({silent:true});}

