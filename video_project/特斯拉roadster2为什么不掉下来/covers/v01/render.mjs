import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const dir=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(dir,'../../source/v05');
const req=createRequire(path.join(source,'package.json'));
const {build}=req('esbuild'),{chromium}=req('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await fs.mkdir(path.join(dir,'work'),{recursive:true});await fs.mkdir(path.join(dir,'assets'),{recursive:true});
await build({entryPoints:[path.join(dir,'scene.ts')],bundle:true,format:'iife',outfile:path.join(dir,'work/scene.js'),nodePaths:[path.join(source,'node_modules')]});
await fs.writeFile(path.join(dir,'work/index.html'),'<!doctype html><html><body style="margin:0;background:transparent"><script src="/scene.js"></script></body></html>');
const server=createServer(async(req,res)=>{const file=req.url==='/scene.js'?'scene.js':'index.html';res.setHeader('Content-Type',file.endsWith('js')?'application/javascript':'text/html');res.end(await fs.readFile(path.join(dir,'work',file)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready,{timeout:60000});
 const preview=process.argv.includes('--preview'),landscapeOnly=process.argv.includes('--landscape'),metadata=[];
 for(const variant of landscapeOnly?['landscape']:['landscape','portrait']){const w=variant==='landscape'?(preview?1200:3600):(preview?1000:2400),h=variant==='landscape'?(preview?750:2250):(preview?1250:3000);await page.setViewportSize({width:w,height:h});const info=await page.evaluate(({variant,w,h})=>window.draw(variant,w,h),{variant,w,h});const file=`hero-${variant}${preview?'-preview':''}.png`;await page.screenshot({path:path.join(dir,'assets',file),omitBackground:true});metadata.push({...info,file});}
 await fs.writeFile(path.join(dir,`assets/render${preview?'-preview':''}.json`),JSON.stringify({metadata,errors},null,2));console.log(JSON.stringify({metadata,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));}
