import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
const server=http.createServer((_,r)=>r.end('<!doctype html><canvas></canvas>'));
await new Promise(r=>server.listen(5199,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/home/fusion/marine-energy-v7-20261014/browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--use-vulkan=native','--enable-gpu','--disable-vulkan-fallback-to-gl-for-testing']});
try {
 const page=await browser.newPage(); const cdp=await browser.newBrowserCDPSession();fs.writeFileSync('gpu-system.json',JSON.stringify(await cdp.send('SystemInfo.getInfo'),null,2));await page.goto('http://127.0.0.1:5199');
 const report=await page.evaluate(async()=>{
  if(!navigator.gpu)return {available:false};
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)return {available:false,reason:'no adapter'};
  const info={vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description};
  const d=await adapter.requestDevice();
  const b=d.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const out=d.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const shader=d.createShaderModule({code:'@group(0) @binding(0) var<storage,read_write> result:array<u32>; @compute @workgroup_size(4) fn main(@builtin(global_invocation_id) id:vec3<u32>) {result[id.x] = id.x * 7u + 11u;}'});
  const pipeline=d.createComputePipeline({layout:'auto',compute:{module:shader,entryPoint:'main'}});
  const bind=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b}}]});
  const enc=d.createCommandEncoder();const pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(1);pass.end();enc.copyBufferToBuffer(b,0,out,0,16);d.queue.submit([enc.finish()]);
  await out.mapAsync(GPUMapMode.READ);const result=[...new Uint32Array(out.getMappedRange())];out.unmap();d.destroy();
  return {available:true,info,computeResult:result,computePassed:JSON.stringify(result)==='[11,18,25,32]'};
 });
 fs.writeFileSync('server-webgpu-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser.close();server.close();}
