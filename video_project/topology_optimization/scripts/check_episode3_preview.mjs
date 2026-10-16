import {openBrowser} from '@remotion/renderer';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const exe=path.resolve('node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');const b=await openBrowser('chrome',{browserExecutable:exe,chromiumOptions:{gl:'angle'}});const errors=[];const p=await b.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});p.on('error',e=>errors.push(String(e)));await p.setViewport({width:1440,height:1000,deviceScaleFactor:1});await p.goto({url:pathToFileURL(path.resolve('delivery/episode3/可拆装模型.html')).href,timeout:60000});
for(let i=0;i<40;i++){if(await p.evaluate(()=>Boolean(window.modelPreviewReady)))break;await new Promise(r=>setTimeout(r,250));}
const loaded=await p.evaluate(()=>Boolean(window.modelPreviewReady));
await p.evaluate(()=>{const x=document.querySelector('input');x.value='100';x.dispatchEvent(new Event('input'));});
await new Promise(r=>setTimeout(r,300));let img=await p._client().send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/episode3/interactive-pavilion.png',Buffer.from(img.value.data,'base64'));
await p.evaluate(()=>{document.querySelectorAll('button')[1].click();const x=document.querySelector('input');x.value='100';x.dispatchEvent(new Event('input'));});
await new Promise(r=>setTimeout(r,300));img=await p._client().send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/episode3/interactive-joint.png',Buffer.from(img.value.data,'base64'));
const result={loaded,buttons:await p.evaluate(()=>Array.from(document.querySelectorAll('button')).map(x=>x.textContent)),status:await p.evaluate(()=>document.getElementById('status').textContent),errors};fs.writeFileSync('delivery/episode3/interactive-qa.json',JSON.stringify(result,null,2));console.log(result);await b.close({silent:true});

