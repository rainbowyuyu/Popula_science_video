import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBrowser} from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const molDir = path.join(root, 'public/nobel2026/molecular');
const pdb = fs.readFileSync(path.join(molDir, '6EID.pdb'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'node_modules/3dmol/build/3Dmol-min.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1600px;height:1000px;background:#f7fbf8;overflow:hidden}#viewer{width:1600px;height:1000px}</style></head><body><div id="viewer"></div><script>${lib}</script><script>
const pdb = ${JSON.stringify(pdb)};
const viewer = $3Dmol.createViewer('viewer', {backgroundColor:'#f7fbf8', antialias:true});
viewer.addModel(pdb, 'pdb');
viewer.setStyle({}, {});
viewer.setStyle({chain:'A'}, {cartoon:{color:'spectrum',opacity:0.96}});
viewer.setStyle({resn:'LYR',chain:'A'}, {stick:{colorscheme:'Jmol',radius:0.18}});
viewer.setStyle({resn:'PO4'}, {sphere:{colorscheme:'Jmol',scale:0.38,opacity:0.55}});
viewer.zoomTo({chain:'A'}); viewer.rotate(22,'y'); viewer.rotate(-8,'x'); viewer.render();
window.__3dmolReady = true;
</script></body></html>`;
const outDir = path.join(root, 'public/nobel2026/molecular/renders');
fs.mkdirSync(outDir, {recursive:true});
const htmlPath = path.join(root, 'tmp/6eid-3dmol.html');
fs.mkdirSync(path.dirname(htmlPath), {recursive:true}); fs.writeFileSync(htmlPath, html);
const chrome = path.join(root, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await openBrowser('chrome', {browserExecutable:chrome, chromiumOptions:{gl:'angle'}});
try {
  const page = await browser.newPage({context:()=>null, logLevel:'error', indent:false, pageIndex:0, onBrowserLog:null, onLog:()=>{}});
  await page.setViewport({width:1600,height:1000,deviceScaleFactor:1});
  await page.goto({url:'file:///'+htmlPath.replaceAll('\\','/'), timeout:60000});
  for (let i=0;i<120;i++) { const ready = await page.evaluate(() => Boolean(window.__3dmolReady)); if (ready) break; await new Promise(r=>setTimeout(r,250)); }
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('#viewer canvas');
    return canvas ? canvas.toDataURL('image/png') : null;
  });
  if (!dataUrl) throw new Error('3Dmol canvas was not created');
  fs.writeFileSync(path.join(outDir,'6EID-chainA-cartoon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(JSON.stringify({tool:'3Dmol.js',structure:'6EID',selection:'chain A cartoon; chain B ghost; heteroatom spheres',output:'public/nobel2026/molecular/renders/6EID-chainA-cartoon.png'}));
} finally { await browser.close({silent:true}); }
