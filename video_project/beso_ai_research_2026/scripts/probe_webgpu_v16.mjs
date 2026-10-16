/** Project-local WebGPU compute probe. Verifies WGSL writes by reading them back. */
import {openBrowser} from '@remotion/renderer';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=configureRenderer();
const require=createRequire(import.meta.url);
const launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js'));
const launch=launcher.launchChrome;
const extraFlags=['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--disable-vulkan-surface'];
if(process.env.BESO_WEBGPU_ADAPTER)extraFlags.push('--use-webgpu-adapter='+process.env.BESO_WEBGPU_ADAPTER);
if(process.env.BESO_WEBGPU_POWER)extraFlags.push('--use-webgpu-power-preference='+process.env.BESO_WEBGPU_POWER);
launcher.launchChrome=o=>launch({...o,args:[...o.args,...extraFlags]});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>GPU compute probe</body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browserExecutable=getBrowserExecutable();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:opt});
let result;
try{
 const page=await browser.newPage({context:'webgpu-probe',logLevel:'error',indent:false,pageIndex:0,onBrowserLog:()=>{},onLog:()=>{}});
 await page.goto({url:'http://127.0.0.1:'+server.address().port,timeout:30000});
 result=await page.evaluate(async()=>{
  let device;
  try{
   const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
   if(!adapter)return {available:false,gpuAPI:!!navigator.gpu};
   const info=adapter.info;
   const adapterInfo={vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter};
   device=await adapter.requestDevice();
   const errors=[];device.addEventListener('uncapturederror',e=>errors.push(String(e.error)));
   const module=device.createShaderModule({code:'@group(0) @binding(0) var<storage, read_write> values: array<u32>; @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id: vec3<u32>) { values[id.x] = id.x * id.x + 17u; }'});
   const compilation=await module.getCompilationInfo();
   const messages=compilation.messages.map(m=>({type:m.type,message:m.message,lineNum:m.lineNum}));
   const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
   const values=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
   const readback=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:values}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
   pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(1);pass.end();
   encoder.copyBufferToBuffer(values,0,readback,0,16);device.queue.submit([encoder.finish()]);
   await device.queue.onSubmittedWorkDone();await readback.mapAsync(GPUMapMode.READ);
   const observed=Array.from(new Uint32Array(readback.getMappedRange().slice(0)));readback.unmap();
   values.destroy();readback.destroy();
   const expected=[17,18,21,26];
   const passed=JSON.stringify(observed)===JSON.stringify(expected)&&!messages.some(m=>m.type==='error')&&errors.length===0;
   return {available:passed,backend:'WebGPU WGSL compute with GPU readback',adapter:adapterInfo,features:[...adapter.features],userAgent:navigator.userAgent,shaderCompilation:messages,uncapturedErrors:errors,compute:{expected,observed,passed}};
  }catch(e){return {available:false,error:String(e),stack:e?.stack};}
  finally{device?.destroy();}
 });
}finally{await browser.close({silent:true});await new Promise(r=>server.close(r));}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const browserDir=browserExecutable?path.dirname(browserExecutable):null;
const localDLLs=browserDir?['dxil.dll','dxcompiler.dll'].map(name=>path.join(browserDir,name)).filter(p=>fs.existsSync(p)).map(p=>({path:p,sha256:sha(p),bytes:fs.statSync(p).size})):[];
const report={...result,browserExecutable,flags:extraFlags,localDLLs,checkedAt:new Date().toISOString(),note:'WGSL arithmetic executed and mapped back. This does not certify WaterPro or full scene rendering.'};
fs.mkdirSync(path.join(root,'research/qa'),{recursive:true});
fs.writeFileSync(path.join(root,'research/qa/v16-webgpu-probe.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.available)process.exitCode=1;
