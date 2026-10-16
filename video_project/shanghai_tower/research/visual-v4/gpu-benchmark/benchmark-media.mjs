// Thirty-frame comparison on an immutable bundle. Outputs remain in research.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const mode=process.argv[2]??'default';
const concurrency=Number(process.argv[3]??2);
const {configureRenderer}=await import('../../../scripts/renderer-options.mjs');
const chromiumOptions=configureRenderer({preferHighPerformanceGpu:mode==='nvidia'});
// Use the CommonJS entry, which is the verified Remotion launcher module on this
// installation; ESM interop may hold an unpatched namespace copy.
const {openBrowser,selectComposition,renderMedia}=require('@remotion/renderer');
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const serveUrl=path.join(root,'tmp/render-runs/final-v4b-stills-46728-1791491285518/bundle');
const out=path.join(here,`media-${mode}-c${concurrency}`);fs.mkdirSync(out,{recursive:true});
let browser;
const report={mode,concurrency,serveUrl,startedUTC:new Date().toISOString(),frames:[7180,7209],sourceInputsChanged:false};
const totalStart=Date.now();
try{
 browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
 const info=await browser.connection.send('SystemInfo.getInfo');report.systemInfo=info.value??info;
 const opts={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,clean:false}};
 const selectStart=Date.now();const composition=await selectComposition({...opts,id:'ShanghaiTower'});report.selectSeconds=(Date.now()-selectStart)/1000;
 const start=Date.now();
 await renderMedia({...opts,composition,codec:'h264',outputLocation:path.join(out,'30frames.mp4'),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency,timeoutInMilliseconds:120000,frameRange:report.frames});
 report.renderSeconds=(Date.now()-start)/1000;report.success=true;
}catch(e){report.success=false;report.error=String(e.stack??e);console.error(report.error);}
finally{
 if(browser)await browser.close({silent:true});report.totalSeconds=(Date.now()-totalStart)/1000;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({mode,concurrency,success:report.success,totalSeconds:report.totalSeconds,renderSeconds:report.renderSeconds,gpu:report.systemInfo?.gpu?.auxAttributes?.glRenderer}));
}
