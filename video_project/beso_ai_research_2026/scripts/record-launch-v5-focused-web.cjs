/* Real local UI capture for the launch film. Capture-only typography/cropping;
 * no product source changes, chat submission, solver invocation or cloud calls. */
const {chromium}=require('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'public','beso-research','web-live');
const anchors=path.join(root,'public','generated','v5');
const work=path.join(root,'work','web-v5-record');
const base='http://127.0.0.1:8019';
for(const dir of [out,anchors,work])fs.mkdirSync(dir,{recursive:true});
const report={capturedAt:new Date().toISOString(),base,localOnly:true,policy:{noChatSubmit:true,noSolverStart:true,noCloudAIRequests:true,staticThreeJSDependencyOnly:true},presentation:'capture-only CSS focus and readable typography; product source unchanged',segments:{},blocked:[]};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function setup(browser,width,height,name){
 const context=await browser.newContext({viewport:{width,height},recordVideo:{dir:path.join(work,name),size:{width,height}}});
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(!['http:','https:'].includes(url.protocol))return route.continue();const staticThree=req.method()==='GET'&&url.hostname==='unpkg.com'&&url.pathname.startsWith('/three@0.165.0/');if(staticThree)return route.continue();const assistantRequest=/^\/api\/(assistant|chat|qwen)(\/|$)/.test(url.pathname);if(url.origin!==base||assistantRequest||!['GET','HEAD'].includes(req.method())){report.blocked.push({segment:name,method:req.method(),path:url.origin===base?url.pathname:'external'});return route.abort();}return route.continue();});
 const videoEpoch=Date.now();
 const page=await context.newPage();
 await page.goto(base+'/ui/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(950);
 await page.locator('#landingIntroSceneSkip').click().catch(()=>{});
 await page.waitForTimeout(450);
 return {context,page,videoEpoch};
}
async function finish(page,context,id,readyTime,duration){
 const video=page.video();await page.close();await context.close();
 const file=await video.path();const dest=path.join(out,id+'.mp4');
 const crop=id==='brief-focused-v5'?['-filter_complex','[0:v]split=2[a][b];[a]crop=1200:150:0:0[top];[b]crop=1200:90:0:226[bottom];[top][bottom]vstack[out]','-map','[out]']:[];
 const command=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(Math.max(0,readyTime-.6)),'-i',file,'-t',String(duration),...crop,'-an','-c:v','libx264','-crf','15','-pix_fmt','yuv420p','-r','60','-movflags','+faststart',dest],{encoding:'utf8',windowsHide:true});
 if(command.status!==0)throw Error(command.stderr);
 const thumb=path.join(out,id+'-first.png');
 const shot=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',dest,'-frames:v','1',thumb],{encoding:'utf8',windowsHide:true});if(shot.status!==0)throw Error(shot.stderr);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',dest],{encoding:'utf8',windowsHide:true});if(probe.status!==0)throw Error(probe.stderr);
 return {file:path.relative(root,dest).replaceAll('\\','/'),durationSec:Number(probe.stdout.trim()),requestedDurationSec:duration,sha256:sha(dest),firstFrame:path.relative(root,thumb).replaceAll('\\','/')};
}
async function brief(browser){
 const {context,page,videoEpoch}=await setup(browser,1200,316,'brief');
 const started=videoEpoch;
 await page.addStyleTag({content:`body{background:#f7fafb!important;overflow:hidden!important} body *{visibility:hidden!important} #landingComposerDock,#landingComposerDock *{visibility:visible!important} #landingMain #landingComposerDock{position:fixed!important;inset:0!important;width:1200px!important;padding:0!important;z-index:999999!important} #landingMain .composerPill{width:1200px!important;height:316px!important;box-sizing:border-box!important;padding:30px 38px 26px!important;min-height:316px!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:linear-gradient(150deg,#fff,#f1f6f8)!important;transform:none!important} #landingMain #msgLanding{font:500 42px/1.48 'Microsoft YaHei',sans-serif!important;height:174px!important;min-height:174px!important;max-height:174px!important;padding:0!important;color:#102c3c!important;resize:none!important;background:transparent!important;border:0!important;box-shadow:none!important} #landingSubflowStrip,.landingQuickRow,.landingRunsHint{display:none!important} #landingMain .landingModeToggle{font-size:25px!important;padding:12px 19px!important;border-radius:12px!important} #landingMain .landingModeToggleIcon{width:23px!important;height:23px!important} #landingMain .composerPillModeCluster{gap:14px!important} #landingMain .composerPillFooter{margin-top:0!important} .composerPillSendBtn{height:52px!important;width:52px!important}`});
 await page.addStyleTag({content:`#landingMain .landingModeToggle{width:auto!important;max-width:none!important;flex:0 0 auto!important} #landingMain .landingModeToggleText{width:auto!important;max-width:none!important;overflow:visible!important;text-overflow:clip!important} #landingMain .composerPillModeCluster{flex-wrap:nowrap!important}`});
 await page.locator('#msgLanding').fill('');
 // The prompt remains a real draft in the real product composer.
 const prompt='设计 20 MW 浮式风电基础，设置海况、材料和质量约束';
 const ready=(Date.now()-started)/1000;
 await page.waitForTimeout(160);
 await page.locator('#msgLanding').pressSequentially(prompt,{delay:62});
 if(await page.locator('#landingToggleDeepThink').getAttribute('aria-pressed')!=='true')await page.locator('#landingToggleDeepThink').click();
 await page.waitForTimeout(280);
 if(await page.locator('#landingToggleAssistantTools').getAttribute('aria-pressed')!=='true')await page.locator('#landingToggleAssistantTools').click();
 await page.screenshot({path:path.join(anchors,'web-brief-focused.png')});
 await page.waitForTimeout(6300);
 const elapsed=(Date.now()-started)/1000;
 const result=await finish(page,context,'brief-focused-v5',ready,Math.min(9.4,elapsed-ready));
 const anchor=path.join(anchors,'web-brief-focused.png');
 const shot=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','6','-i',path.join(root,result.file),'-frames:v','1',anchor],{encoding:'utf8',windowsHide:true});if(shot.status!==0)throw Error(shot.stderr);
 report.segments.brief={...result,prompt,actions:['typed draft only','confirmed real deep-think control enabled','confirmed real CAD-tools control enabled'],sourceViewport:[1200,316],deliveredViewport:[1200,240],crop:'removed only unused blank strip between real input and real controls',fontSizePx:42};
}
async function interaction(browser){
 const {context,page,videoEpoch}=await setup(browser,1200,660,'interaction');
 const started=videoEpoch;
 await page.locator('#resultsViewerBtn').click();
 await page.waitForTimeout(250);
 const source='D:/python_project/beso_ai/runs/beso9_centered_seed_campaign_v4/mw_20/seed_17/beso_run/parameters_summary.json';
 await page.locator('#rvFilesInput').setInputFiles(source);
 await page.waitForTimeout(1400);
 if(await page.locator('#rvBtnDim').getAttribute('aria-pressed')==='true')await page.locator('#rvBtnDim').click();
 await page.addStyleTag({content:`body{overflow:hidden!important} body *{visibility:hidden!important} #rvPreviewCol,#rvPreviewCol *{visibility:visible!important} #rvPreviewCol{position:fixed!important;inset:0!important;width:1200px!important;height:660px!important;border:0!important;border-radius:0!important;box-shadow:none!important;z-index:999999!important} #rvPreviewCol .resultsViewerPaneHd{display:none!important} #rvCanvasWrap{height:660px!important} #rvDimPanel,#rvBcPanel,#rvCanvasHint{display:none!important} #rvCanvasHud{right:20px!important;bottom:22px!important} .resultsViewerViewBtn{height:42px!important;width:42px!important}`});
 await page.waitForTimeout(500);
 await page.locator('#rvBtnFit').click();
 await page.waitForTimeout(350);
 if(await page.locator('#rvBtnSpin').getAttribute('aria-pressed')!=='true')await page.locator('#rvBtnSpin').click();
 await page.screenshot({path:path.join(anchors,'web-viewer-focused.png')});
 const ready=(Date.now()-started)/1000;
 await page.waitForTimeout(10100);
 const result=await finish(page,context,'interaction-focused-v5',ready,10);
 report.segments.interaction={...result,source,sourceSHA256:sha(source),actions:['imported saved parameters_summary.json','disabled dimensions to remove dense text','fit real model','enabled real viewer auto rotation'],sourceViewport:[1200,660],noSolver:true};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{await brief(browser);await interaction(browser);}finally{await browser.close();fs.writeFileSync(path.join(out,'focused-record-manifest-v5.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));})().catch(error=>{console.error(error);process.exitCode=1});
