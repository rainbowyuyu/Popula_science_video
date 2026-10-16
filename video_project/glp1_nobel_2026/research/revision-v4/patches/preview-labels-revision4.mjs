import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const output=path.join(here,'preview-labels-revision4');fs.mkdirSync(output,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/revision4-label-preview-bundle')});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'},logLevel:'error'});
const options={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions:{gl:'angle'},inputProps:{audio:false}};
const frames=[7946,7985,8023,8073,8092,8110,8149,16736,16775,16791,16860,16896,16911,16925,16942,16981];
try{
 const composition=await selectComposition({...options,id:'GLP1'});
 for(const frame of frames){
  await renderStill({...options,composition,frame,output:path.join(output,`frame-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});
  console.log('Revision 4 label preview',frame);
 }
 fs.writeFileSync(path.join(output,'rendered-frames.json'),JSON.stringify({source:'current V4World, isolated Remotion bundle',frames},null,2));
}finally{await browser.close({silent:true});}
