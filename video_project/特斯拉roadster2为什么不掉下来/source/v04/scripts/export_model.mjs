/** Export/review the procedural teaching model; never modifies earlier versions.
 * node scripts/export_model.mjs --glb --preview
 * Model reference: 2026-10-15 official reveal images reproduced by Electrek.
 * Geometry is authored procedurally, not extracted from reference photography.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work','car-review');
await fs.mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'src','Car.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:path.join(out,'Car.mjs')});
const {Car}=await import(pathToFileURL(path.join(out,'Car.mjs')).href);
const {Box3,Vector3}=await import('three');
const car=new Car();
const bounds=new Box3().setFromObject(car.root),size=bounds.getSize(new Vector3());
let triangles=0,meshCount=0;
car.root.traverse(o=>{if(o.isMesh){meshCount++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
const report={source:'procedural 2026 Roadster-inspired educational model',officialCAD:false,units:'metres',dimensions:[size.x,size.y,size.z],meshCount,triangles,hiddenTeachingTank:!car.tank.visible,hiddenTeachingNozzles:!car.thrusterHardware.visible};
if(process.argv.includes('--glb')){
  globalThis.FileReader=class {
    onloadend=null;result=null;
    readAsArrayBuffer(blob){blob.arrayBuffer().then(a=>{this.result=a;this.onloadend?.();});}
    readAsDataURL(blob){blob.arrayBuffer().then(a=>{this.result=`data:${blob.type};base64,${Buffer.from(a).toString('base64')}`;this.onloadend?.();});}
  };
  const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
  const bin=await new GLTFExporter().parseAsync(car.root,{binary:true,onlyVisible:true});
  await fs.writeFile(path.join(out,'roadster_teaching.glb'),Buffer.from(bin));
  report.glb='roadster_teaching.glb';
}
if(process.argv.includes('--preview')){
  const browserEntry=`import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Car} from ${JSON.stringify(path.join(root,'src','Car.ts').replaceAll('\\','/'))};
import {createSuctionCup,createBalloon,createDoor} from ${JSON.stringify(path.join(root,'src','AnalogyProps.ts').replaceAll('\\','/'))};
const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1400,900);r.setPixelRatio(1);r.shadowMap.enabled=true;r.shadowMap.type=T.PCFSoftShadowMap;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.16;document.body.appendChild(r.domElement);
const s=new T.Scene();s.background=new T.Color('#e9e7e1');const env=new T.PMREMGenerator(r);s.environment=env.fromScene(new RoomEnvironment(),.04).texture;s.environmentIntensity=.75;
const c=new T.PerspectiveCamera(38,1400/900,.05,100);const car=new Car();s.add(car.root);
if(${process.argv.includes('--analogies')}){car.root.visible=false;const cup=createSuctionCup(),balloon=createBalloon(),door=createDoor();cup.root.position.set(-1.8,.66,0);cup.update(.65);balloon.root.position.set(-.2,.85,0);balloon.update(.55);door.root.position.set(1.45,0,0);door.update(.65);s.add(cup.root,balloon.root,door.root);}
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#e0dfdb',roughness:.8}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.008;s.add(floor);
const key=new T.DirectionalLight('#fff3df',3);key.position.set(2,6,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.025;key.shadow.bias=-.0001;key.shadow.radius=4;s.add(key);s.add(new T.HemisphereLight('#f5faff','#969486',1.4));
window.show=(angle)=>{car.root.rotation.set(0,0,0);car.root.position.set(0,0,0);floor.visible=true;if(angle==='front'){c.position.set(5.5,2.8,5.3);}if(angle==='side'){c.position.set(.2,1.6,7.8);}if(angle==='rear'){c.position.set(-5.2,2.4,5.2);}if(angle==='under'){car.root.rotation.x=Math.PI;car.root.position.y=1.25;c.position.set(-3.8,3.8,5);floor.visible=false;}c.lookAt(0,.53,0);r.render(s,c);};window.show('front');window.ready=true;`;
  await build({stdin:{contents:browserEntry,resolveDir:root,sourcefile:'car-preview.ts',loader:'ts'},bundle:true,format:'iife',outfile:path.join(out,'preview.js')});
  await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html><body style="margin:0"><script src="/preview.js"></script></body></html>');
  const server=createServer(async(req,res)=>{try{const p=req.url==='/preview.js'?'preview.js':'index.html';res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(await fs.readFile(path.join(out,p)));}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const req=createRequire(import.meta.url);let playwright;
  try{playwright=req('playwright');}catch{playwright=req('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
  const browser=await playwright.chromium.launch({channel:'msedge',headless:true,args:['--disable-web-security','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
    for(const angle of['front','side','rear','under']){await page.evaluate(a=>window.show(a),angle);await page.screenshot({path:path.join(out,`${process.argv.includes('--analogies')?'analogies-':''}${angle}.png`)});}
    report.browserErrors=errors;
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
await fs.writeFile(path.join(out,'model-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
