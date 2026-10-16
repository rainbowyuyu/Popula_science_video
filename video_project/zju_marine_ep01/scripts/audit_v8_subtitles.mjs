/** Browser-layout audit of the real WOFF2 and current caption CSS; no GPU/video render. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work/v8/qa-subtitles');await fs.mkdir(out,{recursive:true});
const req=createRequire(import.meta.url);let playwright;
try{playwright=await import(pathToFileURL(req.resolve('playwright')).href);}catch{playwright=await import('file:///D:/python_project/waterpro/node_modules/playwright/index.mjs');}
const story=JSON.parse((await fs.readFile(path.join(root,'src/story.json'),'utf8')).replace(/^\uFEFF/,''));
const source=await fs.readFile(path.join(root,'src/EpisodeFilm.tsx'),'utf8');
const captions=story.captions;
if(source.includes('caption-holds-v7'))throw new Error('V7 caption timing override remains');
const captionMatch=source.match(/\{cap&&<div style=\{\{([\s\S]*?)\}\}>\{cap\.text\}/);
if(!captionMatch)throw new Error('Caption inline-style entry was not found; update auditor rather than assume CSS.');
// Match the actual checked-in CSS instead of duplicating hand-maintained values.
const style=Function('return ({'+captionMatch[1]+'});')();
const font=await fs.readFile(path.join(root,'public/fonts/unified.woff2'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const duration=Math.ceil(Math.max(...story.scenes.map(s=>s.end))*30)/30;
const browser=await playwright.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
try{
await page.setContent('<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;background:#376172}#frame{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;font-family:RainbowSans,Microsoft YaHei,sans-serif}#cap{position:absolute}</style></head><body><div id="frame"><div id="cap"></div></div></body></html>');
// Remotion makeDefaultPreviewCSS supplies the universal border-box reset.
await page.evaluate(async({font,style})=>{
 const f=new FontFace('RainbowSans','url(data:font/woff2;base64,'+font+')',{weight:'100 900'});await f.load();document.fonts.add(f);await document.fonts.ready;
 const cap=document.querySelector('#cap');for(const [k,v]of Object.entries(style)){cap.style[k]=typeof v==='number'&&!['fontWeight','lineHeight','opacity','zIndex','flexGrow','flexShrink'].includes(k)?v+'px':v;}
}, {font:font.toString('base64'),style});
const client=await page.context().newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');
const documentNode=await client.send('DOM.getDocument');const {nodeId}=await client.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#cap'});
const rows=[];const issues=[];
let previous=null;
for(let index=0;index<captions.length;index++){
 const cap=captions[index];
 const geometry=await page.evaluate(text=>{
  const e=document.querySelector('#cap');e.textContent=text;
  const r=e.getBoundingClientRect(),cs=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);
  const textRects=Array.from(range.getClientRects()).map(x=>({x:x.x,y:x.y,width:x.width,height:x.height}));
  const lineYs=[...new Set(textRects.map(x=>Math.round(x.y*10)/10))];
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=cs.font;ctx.letterSpacing=cs.letterSpacing;
  const measured=ctx.measureText(text);
  return {box:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},textRects,lineCount:lineYs.length,measuredUnwrappedWidth:measured.width,
   style:{font:cs.font,fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,letterSpacing:cs.letterSpacing,lineHeight:cs.lineHeight,maxWidth:cs.maxWidth,padding:cs.padding,boxSizing:cs.boxSizing},
   overflow:e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1};
 },cap.text);
 const fonts=(await client.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
 const firstFrame=Math.ceil(cap.start*30-1e-8),lastFrame=Math.ceil(cap.end*30-1e-8)-1;
 const row={index,...cap,duration:cap.end-cap.start,firstFrame,lastFrame,characterCount:[...cap.text].length,charactersPerSecond:[...cap.text].length/(cap.end-cap.start),...geometry,fonts};rows.push(row);
 if(!Number.isFinite(cap.start)||!Number.isFinite(cap.end)||cap.end<=cap.start)issues.push({severity:'error',index,type:'invalid-time'});
 if(cap.start<0||cap.end>duration+1/30)issues.push({severity:'error',index,type:'outside-video'});
 if(previous&&cap.start<previous.end-1e-6)issues.push({severity:'error',index,type:'overlapping-captions',previous:index-1,seconds:previous.end-cap.start});
 if(firstFrame>lastFrame)issues.push({severity:'error',index,type:'no-visible-frame'});
 if(geometry.overflow||geometry.box.x<0||geometry.box.right>1920||geometry.box.y<0||geometry.box.bottom>1080)issues.push({severity:'error',index,type:'clipped-or-offscreen'});
 if(geometry.box.x<48||geometry.box.right>1872||geometry.box.bottom>1040)issues.push({severity:'warning',index,type:'safe-area-margin'});
 if(geometry.lineCount>1)issues.push({severity:'warning',index,type:'wrapped-caption',lineCount:geometry.lineCount});
 if(fonts.some(f=>!f.isCustomFont&&f.glyphCount>0))issues.push({severity:'warning',index,type:'font-fallback',fonts:fonts.filter(f=>!f.isCustomFont)});
 if(row.charactersPerSecond>8)issues.push({severity:'warning',index,type:'dense-reading',cps:row.charactersPerSecond});
 previous=cap;
}
const widest=rows.reduce((a,b)=>a.measuredUnwrappedWidth>b.measuredUnwrappedWidth?a:b);
const missingCharacters=[];
for(const character of [...new Set(story.captions.map(c=>c.text).join('')+'浙江大学·海洋新能源第一期海洋风电总览×rainbow鱼')]){
 await page.evaluate(t=>document.querySelector('#cap').textContent=t,character);
 const fonts=(await client.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
 if(fonts.some(f=>!f.isCustomFont&&f.glyphCount>0))missingCharacters.push({character,unicode:'U+'+character.codePointAt(0).toString(16).toUpperCase(),fonts});
}
await page.evaluate(t=>document.querySelector('#cap').textContent=t,widest.text);
await page.screenshot({path:path.join(out,'widest-caption.png')});
const timelineArg=process.argv.indexOf('--timeline');
const timelinePath=timelineArg>=0?path.resolve(process.argv[timelineArg+1]):null;
const crossings=timelinePath?JSON.parse(await fs.readFile(timelinePath,'utf8')):{crossings:[]};
const crossingFrames=crossings.crossings.map(c=>{const frame=Math.round(c.time*30);return{kind:c.kind,time:c.time,frame,frames:[frame-2,frame-1,frame,frame+1,frame+2]};});
const sceneFrames=story.scenes.map(s=>({chapter:s.chapter,frames:[Math.max(0,Math.round(s.start*30)-2),Math.round(s.start*30),Math.round(s.start*30)+2,Math.round((s.start+s.end)*15),Math.min(Math.ceil(duration*30)-1,Math.round(s.end*30)-2)]}));
const report={schema:'v8-real-browser-font-caption-audit',status:issues.some(i=>i.severity==='error')?'FAIL':issues.length?'PASS_WITH_REVIEW':'PASS',fps:30,width:1920,height:1080,duration,
 evidence:{source:'src/EpisodeFilm.tsx',sourceSha256:hash(source),story:'src/story.json',storySha256:hash(await fs.readFile(path.join(root,'src/story.json'))),captionTiming:'Current src/story.json start/end only; no external holds',waterTimeline:timelinePath,font:'public/fonts/unified.woff2',fontSha256:hash(font),method:'Chromium layout using actual WOFF2 + extracted current inline CSS; DOM text rects, canvas measureText, CDP platform fonts'},
 summary:{captionCount:rows.length,errorCount:issues.filter(i=>i.severity==='error').length,warningCount:issues.filter(i=>i.severity==='warning').length,maxLineCount:Math.max(...rows.map(r=>r.lineCount)),missingCharacterCount:missingCharacters.length,widest:{index:widest.index,text:widest.text,width:widest.measuredUnwrappedWidth,box:widest.box},actualStyle:widest.style},issues,missingCharacters,rows};
await fs.writeFile(path.join(out,'subtitle-audit.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(out,'capture-check-frames.json'),JSON.stringify({fps:30,crossings:crossingFrames,chapters:sceneFrames,captionFrames:[widest.firstFrame,Math.round((widest.start+widest.end)*15),widest.lastFrame],fixedFrames:[0,120,470,850,1200,1650,3600,5700,7200,7950,9000,9600,10795,Math.ceil(duration*30)-1]},null,2));
console.log(JSON.stringify(report.summary));console.log(JSON.stringify({status:report.status,issueCounts:issues.reduce((a,x)=>(a[x.type]=(a[x.type]??0)+1,a),{}),missingCharacters:missingCharacters.map(x=>x.character).join('')}));
}finally{await browser.close();}
