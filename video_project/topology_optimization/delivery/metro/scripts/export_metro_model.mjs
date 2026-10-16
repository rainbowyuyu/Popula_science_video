// Export an editable still assembly without rendering a WebGL frame.
// Run from any directory: node scripts/export_metro_model.mjs
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=path.join(project,'tmp/metro-export');
const modelDir=path.join(project,'public/metro/models');
const modelPath=path.join(modelDir,'metro-station.glb');
await fs.mkdir(temp,{recursive:true});await fs.mkdir(modelDir,{recursive:true});
const sourceFiles=['src/metro/World.ts','src/metro/Film.tsx','src/metro/timeline.json'];
const sha=data=>createHash('sha256').update(data).digest('hex');
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,sha(await fs.readFile(path.join(project,f)))])));
const timeline=JSON.parse(await fs.readFile(path.join(project,'src/metro/timeline.json'),'utf8'));
const shot=timeline.scenes.find(s=>s.id==='doors');if(!shot)throw Error('Missing stable doors shot');
const frame=Math.floor((shot.start+shot.end-1)/2);
const entry=path.join(temp,'export-entry.js');
const source=`
import {MetroWorld} from ${JSON.stringify(path.join(project,'src/metro/World.ts').replaceAll('\\','/'))};
import {stateAt} from ${JSON.stringify(path.join(project,'src/metro/Film.tsx').replaceAll('\\','/'))};
import * as T from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const summaries=[];
function inspect(root){let nodes=0,meshes=0,geometries=new Set(),materials=new Set(),textures=new Set(),triangles=0,nonfiniteValues=0;root.updateMatrixWorld(true);root.traverse(o=>{nodes++;if(!o.isMesh)return;meshes++;geometries.add(o.geometry);const pos=o.geometry.attributes.position;if(pos){for(const value of pos.array)if(!Number.isFinite(value))nonfiniteValues++;triangles+=(o.geometry.index?o.geometry.index.count:pos.count)/3;}for(const value of o.matrixWorld.elements)if(!Number.isFinite(value))nonfiniteValues++;for(const m of(Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});const box=new T.Box3().setFromObject(root);return {nodes,meshes,uniqueGeometries:geometries.size,uniqueMaterials:materials.size,uniqueTextures:textures.size,triangles,nonfiniteValues,bounds:{min:box.min.toArray(),max:box.max.toArray()},topLevelNames:root.children.map(o=>o.name)}}
function rename(group,name){group.name=name;let count=0;group.traverse(o=>{if(o===group)return;if(!o.name)o.name=name+'_'+o.type+'_'+String(++count).padStart(3,'0');});return group}
window.exportModel=async()=>{
 const world=new MetroWorld('/metro/');await world.ready;
 const state=stateAt(${frame}),camera=new T.PerspectiveCamera(39,16/9,.04,180);world.update(state,camera);
 const asset=new T.Group();asset.name='MetroStation_EditableAssembly';asset.userData={purpose:'Editable static scene exported from the procedural video model',source:'src/metro/World.ts',frame:${frame},scene:'doors',coordinateUnits:'normalized video model units; not a surveyed real station',animation:'None. The video uses the original procedural source.'};
 for(const [key,name]of[['train','Train_ThreeCars'],['station','Platform'],['screen','PlatformScreenDoors'],['propsGroup','Luggage_Stroller']])asset.add(rename(world[key].clone(true),name));
 const people=new T.Group();people.name='Passengers';for(const[i,p]of world.humans.entries())people.add(rename(p.clone(true),'Passenger_'+String(i+1).padStart(2,'0')));asset.add(people);
 asset.updateMatrixWorld(true);const before=inspect(asset);
 const bytes=await new GLTFExporter().parseAsync(asset,{binary:true,trs:true,onlyVisible:true,embedImages:true});
 if(!(bytes instanceof ArrayBuffer))throw Error('Exporter did not return GLB bytes');
 const write=await fetch('/export-glb',{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:bytes});if(!write.ok)throw Error('GLB write failed: '+await write.text());
 const saved=await write.json();
 // Fetch the file from disk again; do not just parse the in-memory export.
 const read=await fetch('/metro/models/metro-station.glb',{cache:'no-store'});if(!read.ok)throw Error('Saved GLB readback failed');
 const roundTrip=await new GLTFLoader().parseAsync(await read.arrayBuffer(),'');
 const after=inspect(roundTrip.scene),root=roundTrip.scene.getObjectByName('MetroStation_EditableAssembly');
 const maxBoundsDifference=Math.max(...before.bounds.min.map((v,i)=>Math.abs(v-after.bounds.min[i])),...before.bounds.max.map((v,i)=>Math.abs(v-after.bounds.max[i])));
 const checks={savedGLBExists:saved.bytes>0,meshCountPreserved:before.meshes===after.meshes,triangleCountPreserved:before.triangles===after.triangles,finiteGeometry:after.nonfiniteValues===0,boundsPreserved:maxBoundsDifference<1e-4,assemblyRootPresent:Boolean(root),selectedAssembliesPresent:root&&['Train_ThreeCars','Platform','PlatformScreenDoors','Passengers','Luggage_Stroller'].every(name=>Boolean(root.getObjectByName(name)))};
 const result={frame:${frame},state,before,after,maxBoundsDifference,checks,allChecksPass:Object.values(checks).every(Boolean),saved,rendererCreated:false,webGLFrameRendered:false,animations:roundTrip.animations.length};
 world.dispose();return result;
};window.exportReady=true;
`;
await build({stdin:{contents:source,resolveDir:project,loader:'ts',sourcefile:'metro-export-entry.ts'},bundle:true,format:'iife',platform:'browser',outfile:entry,logLevel:'silent'});
let uploadBytes=0;
const publicRoot=path.join(project,'public');
const server=createServer(async(req,res)=>{try{
 const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(req.method==='POST'&&url==='/export-glb'){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256*1024*1024)throw Error('Model exceeds export limit');chunks.push(chunk)}
  const data=Buffer.concat(chunks);if(data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2)throw Error('Invalid GLB header');
  if(data.readUInt32LE(8)!==data.length)throw Error('GLB byte length differs from header');
  await fs.writeFile(modelPath,data);uploadBytes=data.length;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({bytes:data.length,sha256:sha(data)}));return;
 }
 if(url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><script src="/export-entry.js"></script>');return}
 const target=url==='/export-entry.js'?entry:path.resolve(publicRoot,'.'+url);
 if(target!==entry&&!target.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return}
 const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':path.extname(target)==='.js'?'text/javascript':path.extname(target)==='.json'?'application/json':path.extname(target)==='.glb'?'model/gltf-binary':'application/octet-stream','Cache-Control':'no-store'});res.end(data);
}catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end(String(e))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const errors=[],report={createdAt:new Date().toISOString(),sourceHashes,output:path.relative(project,modelPath),frame,errors};
const chrome=path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');let browser;
try{
 browser=await openBrowser('chrome',{browserExecutable:chrome});
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 page.on('error',e=>errors.push(String(e)));
 await page.goto({url:'http://127.0.0.1:'+server.address().port,timeout:60000});
 for(let i=0;i<100;i++){if(await page.evaluate(()=>Boolean(window.exportReady)))break;await new Promise(r=>setTimeout(r,100))}
 if(!await page.evaluate(()=>Boolean(window.exportReady)))throw Error('Export page did not initialize');
 report.result=await page.evaluate(()=>window.exportModel());
 if(!report.result.allChecksPass)throw Error('Saved GLB failed readback checks');
 const finalHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,sha(await fs.readFile(path.join(project,f)))])));
 report.sourceChangedDuringRun=Object.entries(finalHashes).filter(([f,h])=>h!==sourceHashes[f]).map(([f])=>f);
 if(report.sourceChangedDuringRun.length)throw Error('Video source changed during export');
 const data=await fs.readFile(modelPath);report.glbBytes=data.length;report.glbSHA256=sha(data);
 // Parse the GLB JSON chunk as an additional on-disk structural check.
 const jsonLength=data.readUInt32LE(12);if(data.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing GLB JSON chunk');
 const gltf=JSON.parse(data.subarray(20,20+jsonLength).toString('utf8').trim());
 report.glbStructure={asset:gltf.asset,nodeCount:gltf.nodes?.length??0,meshCount:gltf.meshes?.length??0,accessorCount:gltf.accessors?.length??0,materialCount:gltf.materials?.length??0,images:gltf.images?.length??0,externalURIs:(gltf.images??[]).map(x=>x.uri).filter(Boolean),extensionsUsed:gltf.extensionsUsed??[]};
 report.allChecksPass=report.result.allChecksPass&&report.glbStructure.externalURIs.length===0;
}catch(e){errors.push(e.stack??String(e));process.exitCode=1}finally{
 if(browser)await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));
 await fs.writeFile(path.join(project,'research/metro/model-export-audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({output:modelPath,bytes:uploadBytes,checks:report.result?.checks,sourceChangedDuringRun:report.sourceChangedDuringRun,errors},null,2));
}
