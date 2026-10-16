// Isolated process-local GPU selection benchmark; no global settings or source inputs change.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const rendererPath=path.dirname(require.resolve('@remotion/renderer'));
const launcher=require(path.join(rendererPath,'browser/Launcher.js'));
const originalLaunch=launcher.launchChrome;
const mode=process.argv[2]||'angle';
const extra=mode==='d3d11-high-performance'?['--use-angle=d3d11','--force_high_performance_gpu','--enable-gpu']:[];
let launchArgs=[];
launcher.launchChrome=(options)=>{launchArgs=[...options.args,...extra];return originalLaunch({...options,args:launchArgs});};
const {openBrowser,selectComposition,renderStill}=require('@remotion/renderer');
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const serveUrl=path.join(root,'tmp/render-runs/final-v4b-stills-46728-1791491285518/bundle');
const out=path.join(__dirname,mode);fs.mkdirSync(out,{recursive:true});
const chromiumOptions={gl:mode==='vulkan'?'vulkan':'angle'};
const start=Date.now();
(async()=>{
 let browser;const report={mode,startedUTC:new Date().toISOString(),globalSettingsChanged:false,serveUrl,chromiumOptions,extra};
 try{
  browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
  const info=await browser.connection.send('SystemInfo.getInfo');
  report.systemInfo=info.value??info;report.launchArgs=launchArgs;
  const opts={serveUrl,browserExecutable,chromiumOptions,pupeteerInstance:browser,inputProps:{audio:false,clean:false}};
  const t=Date.now();const composition=await selectComposition({...opts,id:'ShanghaiTower'});report.selectSeconds=(Date.now()-t)/1000;
  report.stills=[];
  for(const frame of [430,7180]){
   const t=Date.now();const output=path.join(out,`frame-${frame}.jpg`);
   await renderStill({...opts,composition,frame,output,imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});
   report.stills.push({frame,seconds:(Date.now()-t)/1000,bytes:fs.statSync(output).size});
   console.log(JSON.stringify({mode,...report.stills.at(-1)}));
  }
  report.success=true;
 }catch(error){report.success=false;report.error=String(error.stack||error);console.error(report.error);}
 finally{if(browser)await browser.close({silent:true});report.totalSeconds=(Date.now()-start)/1000;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode,success:report.success,totalSeconds:report.totalSeconds,gpu:report.systemInfo?.gpu?.auxAttributes?.glRenderer}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
