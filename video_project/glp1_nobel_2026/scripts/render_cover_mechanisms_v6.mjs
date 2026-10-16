import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/revision-v6/covers');fs.mkdirSync(path.join(out,'empty-public'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(out,'CoverMechanisms.tsx'),publicDir:path.join(out,'empty-public'),outDir:path.join(root,'tmp/cover-mechanisms-v6-bundle')});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{const opts={serveUrl,browserExecutable,puppeteerInstance:browser,chromiumOptions:{gl:'angle'}};
for(const id of ['glucose','pressure','lipid']){const composition=await selectComposition({...opts,id});await renderStill({...opts,composition,frame:0,output:path.join(out,id+'.png'),imageFormat:'png',timeoutInMilliseconds:120000});console.log('Rendered '+id);}
}finally{await browser.close({silent:true});}
