import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
await mkdir('public/headers',{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts')});
const browser=await openBrowser('chrome');
try {
  for(let i=0;i<18;i++) {
    const inputProps={chapterId:i};
    const composition=await selectComposition({serveUrl,id:'HeaderOverlay',inputProps,puppeteerInstance:browser});
    await renderStill({serveUrl,composition,inputProps,puppeteerInstance:browser,imageFormat:'png',
      output:path.join(root,`public/headers/${String(i).padStart(2,'0')}.png`),frame:15});
    console.log(`Overlay ${i+1}/18`);
  }
} finally { await browser.close({silent:true}); }
