from pathlib import Path
p=Path('scripts/render-v16.mjs');s=p.read_text(encoding='utf-8').replace('const {renderMedia,renderStill,selectComposition,openBrowser}', 'const {renderMedia,renderStill,renderFrames,selectComposition,openBrowser}')
a=s.index('  for(const frame of shots)');b=s.index("  fs.writeFileSync(path.join(stillDir,'stills.json')",a)
s=s[:a]+'''  await renderFrames({...opts,pupeteerInstance:browser,composition,frames:shots,outputDir:stillDir,imageFormat:'jpeg',jpegQuality:92,concurrency:1,timeoutInMilliseconds:180000,onStart:()=>console.log('Batch frames',shots.length),onFrameUpdate:(count,index,ms)=>console.log('QA frame',index,count,Math.round(ms)+'ms'),onFrameBuffer:async(buffer,frame)=>{fs.writeFileSync(path.join(stillDir,`frame-${frame}.jpg`),buffer);}});
'''+s[b:]
p.write_text(s,encoding='utf-8')
