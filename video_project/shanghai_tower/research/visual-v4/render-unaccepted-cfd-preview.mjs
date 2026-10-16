import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=process.cwd(),dir=path.join(root,'research/visual-v4'),run=path.join(root,'tmp/render-runs',`unaccepted-cfd-${process.pid}-${Date.now()}`);await fs.mkdir(path.join(run,'empty-public'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(dir,'UnacceptedCFDPreview.tsx'),publicDir:path.join(run,'empty-public'),outDir:path.join(run,'bundle')});const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),chromiumOptions={gl:'angle'},browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});const opts={serveUrl,browserExecutable,chromiumOptions,pupeteerInstance:browser};
try{const composition=await selectComposition({...opts,id:'UnacceptedCFDResearchPreview'});for(const frame of [30,60,90])await renderStill({...opts,composition,frame,output:path.join(dir,`unaccepted-cfd-preview-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:92,timeoutInMilliseconds:120000});console.log('Wrote research-only unaccepted CFD preview stills.');}finally{await browser.close({silent:true});}
