// Freeze a new immutable V11 bundle without modifying the V10 production lock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)??'v11-final';
if(!/^v11-[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Use a distinct V11 tag');
const lockFile=path.join(root,`research/visual/${tag}-lock.json`);
if(fs.existsSync(lockFile))throw new Error('A production lock is immutable. Use a new tag.');
const additional=['package.json','package-lock.json','scripts/renderer-options.mjs','scripts/render_v10.mjs','scripts/freeze_v11.mjs','scripts/mux_v11.py','scripts/verify_v11_tail.py','scripts/check_opening_v11.mjs'];
const files={};
for(const file of [...walk(path.join(root,'src')),...walk(path.join(root,'public')),...additional.map(p=>path.join(root,p))].filter(p=>fs.existsSync(p)).sort())files[path.relative(root,file).replaceAll('\\','/')]=sha(file);
const serveUrl=path.join(root,'tmp/render-runs',`${tag}-${Date.now()}`,'bundle');
await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:serveUrl});
for(const [relative,digest]of Object.entries(files)){
 if(sha(path.join(root,relative))!==digest)throw new Error('Input changed while bundling: '+relative);
 if(relative.startsWith('public/')&&sha(path.join(serveUrl,relative))!==digest)throw new Error('Bundled data mismatch: '+relative);
}
const bundleFiles={};
for(const name of fs.readdirSync(serveUrl).sort())if(fs.statSync(path.join(serveUrl,name)).isFile())bundleFiles[name]=sha(path.join(serveUrl,name));
const bundleFingerprint=crypto.createHash('sha256').update(JSON.stringify(bundleFiles)).digest('hex');
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
const lock={tag,recordedAtUTC:new Date().toISOString(),bundle:serveUrl,bundleFiles,bundleFingerprint,files,frames:tl.duration,fps:tl.fps,parentLock:'research/visual/v10-final-lock.json',parentLockSHA256:sha(path.join(root,'research/visual/v10-final-lock.json'))};
fs.mkdirSync(path.dirname(lockFile),{recursive:true});fs.writeFileSync(lockFile,JSON.stringify(lock,null,2));
console.log(JSON.stringify({lock:lockFile,bundle:serveUrl,files:Object.keys(files).length,frames:tl.duration}));
