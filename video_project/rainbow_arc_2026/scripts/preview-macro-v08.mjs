import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'work/macro-review-v08');fs.mkdirSync(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'work/macro-preview-entry-v08.tsx'),publicDir:path.join(root,'public'),outDir:path.join(out,'bundle')});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{
  const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},puppeteerInstance:browser};
  const composition=await selectComposition({...opts,id:'MacroAssetReviewV08'});
  for(const frame of [0,150,300]){await renderStill({...opts,composition,frame,output:path.join(out,`macro-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:96});console.log('macro review',frame);}
}finally{await browser.close({silent:true});}
