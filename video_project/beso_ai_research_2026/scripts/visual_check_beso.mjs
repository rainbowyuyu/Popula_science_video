import path from 'node:path';import fs from 'node:fs';import {bundle} from '@remotion/bundler';import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {configureRenderer} from './renderer-options.mjs';
const root=process.cwd(),story=JSON.parse(fs.readFileSync('src/beso-story.json','utf8'));
const output=path.join(root,'output/visual-check');fs.mkdirSync(output,{recursive:true});
const url=await bundle({entryPoint:path.join(root,'src/index.ts'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/beso-visual-check')});
const chrome='D:/python_project/manim_extend_rainbow/video_project/topology_optimization/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const chromiumOptions=configureRenderer();const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions});
const opts={serveUrl:url,browserExecutable:chrome,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false},timeoutInMilliseconds:90000};
const comp=await selectComposition({...opts,id:'BesoAIResearchZH'});
for(const s of story.scenes){if(process.argv[2]&&!process.argv[2].split(',').includes(s.id))continue;await renderStill({...opts,composition:comp,frame:s.start+Math.floor(s.duration*.56),output:path.join(output,s.id+'.png')});console.log('Checked',s.id)}
await browser.close({silent:true});
