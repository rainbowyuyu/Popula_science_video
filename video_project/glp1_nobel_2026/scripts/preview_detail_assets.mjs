import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'research/qa');
fs.mkdirSync(qa, {recursive: true});
const entry = `
import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MolecularDetail} from './src/MolecularDetail';
import {DrugDetail} from './src/DrugDetail';
const scene=new T.Scene();scene.background=new T.Color('#e8e9e3');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1400,1000);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.appendChild(renderer.domElement);
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
scene.add(new T.HemisphereLight('#fff8ed','#80969b',2.1));const key=new T.DirectionalLight('#fff8ee',3.3);key.position.set(-2,4,4);scene.add(key);const rim=new T.DirectionalLight('#d3efed',1.8);rim.position.set(3,2,-1);scene.add(rim);
const camera=new T.PerspectiveCamera(33,1.4,.01,100);camera.position.set(1.5,.55,6.1);camera.lookAt(0,-.05,0);
const molecule=new MolecularDetail('/public/');const drug=new DrugDetail();scene.add(molecule.root,drug.root);await molecule.ready;
window.setStage=(type,p)=>{molecule.root.visible=type==='molecule';drug.root.visible=type==='drug';molecule.render(12,p);drug.render(12,p);camera.position.set(type==='molecule'?1.0:.2,.55,6.1);camera.lookAt(0,-.05,0);renderer.render(scene,camera);return {labels:drug.getLabels(),moleculeBounds:molecule.root.userData.boundProteinBounds}};
window.setStage('molecule',.85);window.assetsReady=true;
`;
await build({stdin: {contents: entry, resolveDir: root, sourcefile: 'asset-preview-entry.ts', loader: 'ts'}, bundle: true,
  format: 'esm', platform: 'browser', outfile: path.join(qa, 'asset-preview.js')});
fs.writeFileSync(path.join(qa, 'asset-preview.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0;overflow:hidden}</style><script type="module" src="/research/qa/asset-preview.js"></script>');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) {response.writeHead(404);response.end();return;}
  const type = filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html';
  response.writeHead(200, {'Content-Type': type});
  fs.createReadStream(filename).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}, logLevel: 'error'});
try {
  const page = await browser.newPage({context: {sourceMap: null}, logLevel: 'error', indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {}});
  await page.setViewport({width: 1400, height: 1000, deviceScaleFactor: 1});
  await page.goto({url: `http://127.0.0.1:${server.address().port}/research/qa/asset-preview.html`, timeout: 30000});
  await page.evaluate(async () => {
    const start = performance.now();
    while (!window.assetsReady) {if (performance.now() - start > 20000) throw new Error('Asset preview timeout');await new Promise(resolve => setTimeout(resolve, 50));}
  });
  for (const [type, progress, filename] of [['molecule', .85, 'molecule-bound.png'], ['drug', .23, 'drug-cleavage.png'], ['drug', .45, 'drug-aib8.png'], ['drug', .86, 'drug-albumin.png']]) {
    const state = await page.evaluate((t, p) => window.setStage(t, p), type, progress);
    const {value: screenshot} = await page._client().send('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync(path.join(qa, filename), Buffer.from(screenshot.data, 'base64'));
    fs.writeFileSync(path.join(qa, filename.replace('.png', '.json')), JSON.stringify(state, null, 2));
    console.log(filename);
  }
} finally {
  await browser.close({silent: true});
  server.close();
}
