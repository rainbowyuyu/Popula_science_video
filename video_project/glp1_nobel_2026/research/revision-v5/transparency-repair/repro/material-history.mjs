import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import * as T from 'three';
import {Audit,V5CameraPath,stateAt,V5Person} from '../../seated-meal-entry/expanded-impact-current.mjs';

const root=process.cwd(),out=path.resolve('research/revision-v5/transparency-repair/repro');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inputs=['src/World.ts','src/V5World.ts','src/V5Person.ts','src/V5Atrium.ts','src/timeline.json'];
const hashes=Object.fromEntries(inputs.map(p=>[p,sha(p)]));
const anchors=Object.fromEntries(Object.entries(read('research/revision-v5/seated-meal-entry/impact.json').anchors).map(([k,v])=>[k,new T.Vector3(...v)]));
const tl=read('src/timeline.json'),audit=new Audit(anchors,tl,new V5CameraPath(anchors,tl));
const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({transparent:true}));
const chairTrace=[];
for(const f of [0,200,2300,3300,3400,3450,3464,3465,3466,3480,3490,3500]){
  const state=audit.update(stateAt(f,tl)),p=audit.personState;
  const k=p.propsOpacity*(1-p.measurementWeight)*Math.min(1,(p.actionWeights.eat??0)+(p.actionWeights.sitStand??0));
  V5Person.prototype.alpha.call({},mesh,k);
  chairTrace.push({frame:f,clip:state.clip,d:state.camera.distance,k,visible:mesh.visible,opacity:mesh.material.opacity,transparent:mesh.material.transparent,depthWrite:mesh.material.depthWrite,version:mesh.material.version});
}
const entry=`import * as T from 'three';
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,alpha:false});renderer.setSize(256,256);renderer.setClearColor('#ffffff');renderer.outputColorSpace=T.LinearSRGBColorSpace;document.body.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
function test(name,startTransparent,updateTransparent,needsUpdate){
 const material=new T.MeshBasicMaterial({color:'#ff0000',transparent:startTransparent,opacity:1,depthWrite:true});
 const plane=new T.Mesh(new T.PlaneGeometry(1,1),material);scene.add(plane);renderer.render(scene,camera);
 const startVersion=material.version;material.opacity=.20;material.transparent=updateTransparent;if(needsUpdate)material.needsUpdate=true;renderer.render(scene,camera);
 const gl=renderer.getContext(),rgba=new Uint8Array(4);gl.readPixels(128,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
 const program=renderer.properties.get(material).currentProgram;const shader=gl.getShaderSource(program.fragmentShader);
 const result={name,startTransparent,updateTransparent,needsUpdate,startVersion,endVersion:material.version,pixel:[...rgba],hasOpaqueDefine:/^#define OPAQUE\\s*$/m.test(shader)};
 scene.remove(plane);plane.geometry.dispose();material.dispose();return result;
}
window.results=[test('mutable-history-no-update',false,true,false),test('mutable-history-needs-update',false,true,true),test('fixed-transparent-history',true,true,false),test('isolated-low-alpha',true,true,false)];window.ready=true;`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'material-history.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',outfile:path.join(out,'runner.js')});
fs.writeFileSync(path.join(out,'index.html'),'<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v5/transparency-repair/repro/runner.js"></script>');
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':'text/html');fs.createReadStream(p).pipe(res)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 await page.setViewport({width:256,height:256,deviceScaleFactor:1});await page.goto({url:`http://127.0.0.1:${server.address().port}/research/revision-v5/transparency-repair/repro/index.html`,timeout:120000});
 const gpu=await page.evaluate(async()=>{let start=performance.now();while(!window.ready){if(performance.now()-start>30000)throw Error('timeout');await new Promise(r=>setTimeout(r,10));}return window.results;});
 const result={createdAtUTC:new Date().toISOString(),sourceSHA256:hashes,sourceUnchanged:inputs.every(p=>sha(p)===hashes[p]),threeRevision:T.REVISION,gpu,chairTrace,interpretation:'A red plane at opacity .20 should blend with white to [255,204,204,255]. Unchanged material.version retains the initial OPAQUE define and produces solid red after transparent toggles. The fixed-transparent policy preserves alpha in both first-frame and history render paths. Chair trace uses the frozen production-state Audit and actual V5Person.alpha method; it is CPU evidence, not a full-scene GPU replay.'};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close({silent:true});server.close();}
