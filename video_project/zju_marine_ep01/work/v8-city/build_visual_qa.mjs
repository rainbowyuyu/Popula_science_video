/** Run only after coordinator freeze. Builds a separate V8 code/assets snapshot. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {bundle} from '@remotion/bundler';
const root=path.resolve(import.meta.dirname,'../..');
const stamp=process.argv.find(x=>x.startsWith('--name='))?.slice(7);
if(!stamp||!/^[a-z0-9-]+$/.test(stamp))throw Error('Explicit unique --name required after freeze');
const out=path.resolve('C:/Users/zju/Videos/rainbow-marine-ep01-v8',stamp);
if(fs.existsSync(out))throw Error('Snapshot exists; choose unique name');
fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);
const sourceFiles=walk(path.join(root,'src')).sort();const before=Object.fromEntries(sourceFiles.map(p=>[path.relative(root,p).replaceAll('\\','/'),sha(p)]));
const publicDir=path.join(out,'assets');fs.mkdirSync(publicDir);
const assets=[];for(const d of ['models','brand','fonts','vendor']){
 const dir=path.join(root,'public',d);fs.cpSync(dir,path.join(publicDir,d),{recursive:true});
 for(const p of walk(dir)){const relative=path.relative(path.join(root,'public'),p).replaceAll('\\','/');assets.push({path:relative,bytes:fs.statSync(p).size,sha256:sha(p)});}
}
const empty=path.join(out,'empty-public');fs.mkdirSync(empty);
const bundleDir=path.join(out,'bundle');await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:empty,outDir:bundleDir,webpackOverride:config=>({...config,cache:false})});
const after=Object.fromEntries(sourceFiles.map(p=>[path.relative(root,p).replaceAll('\\','/'),sha(p)]));
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source changed while snapshot built; do not use this bundle');
const metadata={created:new Date().toISOString(),name:stamp,sourceStable:true,sources:before,assets,audio:'Not copied: this visual QA is explicitly silent; no audio asset loaded',bundle:bundleDir};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(metadata,null,2));
fs.writeFileSync(path.join(out,'snapshot-ready'),JSON.stringify({name:stamp,created:metadata.created}));
console.log(JSON.stringify({out,bundleDir,assets:assets.length,assetBytes:assets.reduce((n,a)=>n+a.bytes,0)}));
