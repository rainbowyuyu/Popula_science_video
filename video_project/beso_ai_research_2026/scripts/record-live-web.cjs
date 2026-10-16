const { chromium } = require('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const root=path.resolve(__dirname,'..'); const out=path.join(root,'public','beso-research','web-live'); const recDir=path.join(root,'tmp','live-recordings'); fs.mkdirSync(out,{recursive:true}); fs.mkdirSync(recDir,{recursive:true});
const base=process.env.AI_ENGINEER_URL||'http://127.0.0.1:8018';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const pw='C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const manifest={capturedAt:new Date().toISOString(),base,localOnly:true,policy:{noChatSubmit:true,noSolverStart:true,noCloudRequests:true},segments:{}};
async function prep(page){ await page.goto(`${base}/ui/`,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(1300); await page.locator('#landingIntroSceneSkip').click().catch(()=>{}); await page.waitForTimeout(500); }
async function brief(){
 const dir=path.join(recDir,'brief'); fs.mkdirSync(dir,{recursive:true}); const b=await chromium.launch({headless:true,executablePath:chrome}); const c=await b.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}}); const p=await c.newPage(); const actions=[]; const t0=Date.now(); const mark=(action)=>actions.push({action,elapsedMs:Date.now()-t0});
 await prep(p); mark('loaded local AI Engineer workspace and skipped intro');
 const prompt='设计 20 MW 浮式风电基础，设置海况、材料和质量约束'; await p.locator('#msgLanding').click(); await p.locator('#msgLanding').pressSequentially(prompt,{delay:20}); mark('typed engineering brief into real composer (not submitted)');
 await p.locator('#landingToggleDeepThink').click(); mark('toggled 深度思考'); await p.locator('#landingToggleAssistantTools').click(); mark('toggled CAD 工具'); await p.waitForTimeout(7000); mark('held on live workspace response surface');
 const video=await p.video(); await p.close(); await c.close(); const vp=await video.path(); const dest=path.join(out,'brief-live.webm'); fs.copyFileSync(vp,dest); manifest.segments.brief={file:'public/beso-research/web-live/brief-live.webm',actions,durationMs:Date.now()-t0}; await b.close();
}
async function interaction(){
 const dir=path.join(recDir,'interaction'); fs.mkdirSync(dir,{recursive:true}); const b=await chromium.launch({headless:true,executablePath:chrome}); const c=await b.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}}); const p=await c.newPage(); const actions=[]; const t0=Date.now(); const mark=(action)=>actions.push({action,elapsedMs:Date.now()-t0});
 await prep(p); mark('loaded local workspace and skipped intro'); await p.locator('#resultsViewerBtn').click(); mark('opened existing 结果查看器'); await p.waitForTimeout(800); await p.locator('#rvHelpBtn').click(); mark('opened real viewer help panel'); await p.waitForTimeout(1300); await p.locator('#rvCloseBtn').click(); mark('closed viewer panel'); await p.locator('#topConsoleTrigger').click(); mark('opened 运行控制台'); await p.waitForTimeout(2800); mark('held on real monitor / storage surface');
 const video=await p.video(); await p.close(); await c.close(); const vp=await video.path(); const dest=path.join(out,'interaction-live.webm'); fs.copyFileSync(vp,dest); manifest.segments.interaction={file:'public/beso-research/web-live/interaction-live.webm',actions,durationMs:Date.now()-t0}; await b.close();
}
(async()=>{await brief(); await interaction(); fs.writeFileSync(path.join(out,'live-record-manifest.json'),JSON.stringify(manifest,null,2)); console.log(JSON.stringify(manifest,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
