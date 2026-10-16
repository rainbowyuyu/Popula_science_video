import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const configPath=path.join(root,'work/output-root-v19-motion.json');
export const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
export const outputRoot=path.resolve(config.outputRoot);
export const qaRoot=path.join(outputRoot,'research/qa-v19-motion');
const overrides=config.publicOverrides??{};
for(const [key,value]of Object.entries(overrides)){
 if(!/^[\w-]+$/.test(key)||!path.isAbsolute(value))throw new Error('publicOverrides must map one top-level public directory to an absolute path');
}
export function resolveInput(p){
 if(path.isAbsolute(p))return path.normalize(p);
 const normalized=p.replaceAll('\\','/');
 if(normalized.startsWith('public/')){
  const [prefix,...tail]=normalized.slice(7).split('/');
  if(overrides[prefix])return path.join(overrides[prefix],...tail);
 }
 return path.join(root,p);
}
export function logicalInput(p){
 if(!path.isAbsolute(p))return p.replaceAll('\\','/').replace(/^\.\//,'');
 const absolute=path.resolve(p);
 for(const [name,folder]of Object.entries(overrides)){
  const remainder=path.relative(folder,absolute);
  if(remainder===''||(!remainder.startsWith('..')&&!path.isAbsolute(remainder)))return 'public/'+name+(remainder?'/'+remainder.replaceAll('\\','/'):'');
 }
 return path.relative(root,absolute).replaceAll('\\','/');
}
export function hashFile(p){
 const fd=fs.openSync(p,'r'),h=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(8*1024*1024);
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}
 return h.digest('hex');
}
export function makeBinding(file){
 const absolutePath=resolveInput(file);
 if(!fs.existsSync(absolutePath)||!fs.statSync(absolutePath).isFile())throw new Error('Missing render input: '+file);
 return {file:file.replaceAll('\\','/'),absolutePath,bytes:fs.statSync(absolutePath).size,sha256:hashFile(absolutePath)};
}
export function assertBindings(rows){
 for(const row of rows){
  const expected=resolveInput(row.file);
  if(row.absolutePath&&path.resolve(row.absolutePath)!==path.resolve(expected))throw new Error('Input mapping changed: '+row.file);
  if(!fs.existsSync(expected)||hashFile(expected)!==row.sha256)throw new Error('Bound input changed: '+row.file);
 }
}
export async function collectSourceBindings(){
 const graph=await build({entryPoints:[path.join(root,'src/index-v19-motion.tsx')],absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',packages:'external',metafile:true,logLevel:'silent'});
 const active=Object.keys(graph.metafile.inputs).filter(p=>!p.startsWith('<')).map(p=>path.relative(root,path.resolve(root,p)).replaceAll('\\','/'));
 const rows=new Map(),add=p=>{if(!rows.has(p))rows.set(p,makeBinding(p));};
 const walk=p=>{for(const e of fs.readdirSync(resolveInput(p),{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected nested source symlink: '+p+'/'+e.name);const child=p+'/'+e.name;if(e.isDirectory())walk(child);else if(e.isFile())add(child);}};
 for(const p of active){
  add(p);
  for(const m of fs.readFileSync(resolveInput(p),'utf8').matchAll(/['"`]((?:assets_v[\w-]*|brand|fonts|sources|audio(?:_[\w-]+)?)\/[^'"`\r\n]+)['"`]/g)){
   let asset=m[1];
   if(asset.includes('${')){const prefix=asset.slice(0,asset.indexOf('${'));asset=prefix.slice(0,prefix.lastIndexOf('/')+1);}
   if(!asset)continue;
   const logical='public/'+asset.replace(/\/$/,'');
   if(fs.existsSync(resolveInput(logical))&&fs.statSync(resolveInput(logical)).isDirectory())walk(logical);
   else if(path.posix.extname(asset))add(logical);
  }
 }
 for(const p of ['package.json','package-lock.json','tsconfig.json','scripts/render-v19-motion.mjs','scripts/source-bindings-v19-motion.mjs','scripts/audit-v19-motion.mjs','scripts/qa-delivery-v19-motion.py','scripts/package-v19-motion.py','scripts/finalize-audio-v15.mjs','work/output-root-v19-motion.json','public/audio_v18/master-v18.wav'])add(p);
 // Public Qwen sequence paths in JSON do not necessarily match source literals.
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/transitions-v19-motion.json'),'utf8'));
 const inspect=v=>{
  if(Array.isArray(v))return v.forEach(inspect);
  if(v&&typeof v==='object')return Object.values(v).forEach(inspect);
  if(typeof v==='string'&&/^assets_v[\w-]*\/.+/.test(v)){
   const logical='public/'+v;
   if(fs.existsSync(resolveInput(logical))){if(fs.statSync(resolveInput(logical)).isDirectory()){walk(logical);const parent=path.posix.dirname(logical);for(const name of ['provenance.json','visual-acceptance.json'])if(fs.existsSync(resolveInput(parent+'/'+name)))add(parent+'/'+name);}else add(logical);}
  }
 };inspect(manifest);
 for(const p of [...rows.keys()].filter(p=>p.endsWith('.glb'))){
  const b=fs.readFileSync(resolveInput(p));if(b.toString('ascii',0,4)!=='glTF')throw new Error('Invalid GLB '+p);
  const data=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  for(const item of [...(data.images??[]),...(data.buffers??[])])if(item.uri&&!item.uri.startsWith('data:'))add(path.posix.join(path.posix.dirname(p),decodeURI(item.uri)));
 }
 const result=[...rows.values()].sort((a,b)=>a.file.localeCompare(b.file));assertBindings(result);
 return {version:'V19Motion',schema:'rainbow.v19-motion.render-input-snapshot/1',createdUTC:new Date().toISOString(),entry:'src/index-v19-motion.tsx',active,sourceHashes:result,scope:'Current active source graph, literal/dynamic public assets, declared Qwen assets and embedded/external GLB dependencies. Integrity snapshot only; not a visual or scientific pass.'};
}
export function mountPublicIntoBundle(bundleDir){
 // Temporary serving aliases only. No existing asset is moved or removed.
 const mount=path.join(bundleDir,'public');
 if(fs.existsSync(mount)){
  const stat=fs.lstatSync(mount);
  if(stat.isSymbolicLink()||!stat.isDirectory()||fs.readdirSync(mount).length)throw new Error('Refusing to alter nonempty bundle/public');
 }else fs.mkdirSync(mount);
 for(const folder of Object.values(overrides))fs.mkdirSync(folder,{recursive:true});
 const names=new Set([...fs.readdirSync(path.join(root,'public')),...Object.keys(overrides)]),mappings=[];
 for(const name of names){
  const source=overrides[name]??path.join(root,'public',name),target=path.join(mount,name),stat=fs.statSync(source);
  if(stat.isDirectory())fs.symlinkSync(source,target,'junction');else fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  mappings.push({publicName:name,source,target,type:stat.isDirectory()?'temporary-directory-junction':'copied-file'});
 }
 return mappings;
}
