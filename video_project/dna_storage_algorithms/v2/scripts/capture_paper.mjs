import {openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
const chrome='D:/python_project/manim_extend_rainbow/video_project/dna_storage_algorithms/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const page=await browser.newPage({context: () => null});
await page.setViewport({width:1200,height:1600,deviceScaleFactor:1});
await page.goto({url:'file:///D:/python_project/manim_extend_rainbow/video_project/dna_storage_algorithms/v2/research/pmc-goldman.html',timeout:60000});
console.log('url',page.url()); console.log((await page.evaluate(() => document.body?.innerText || '')).slice(0,500));
const r=await page._client().send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
fs.writeFileSync('v2/public/papers/goldman-2013-page.png',Buffer.from(r.value.data,'base64'));
await browser.close({silent:true}); console.log('captured');

