import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

export const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalized=file=>file.replaceAll('\\','/');

/** Follow only v19's local import closure, plus named dynamic runtime inputs.
 * Direct public JSON imports belong to both source hashing and media freezing.
 * Nonliteral fetch/staticFile paths must be named in the explicit runtime manifest.
 */
export function collectLaunchInputs({root,entryPoint,audioPath,manifestPath}){
 const publicRoot=path.join(root,'public');
 const sources=new Set(),media=new Set(),moduleFiles=new Set(),packages=new Set(),pending=[],dynamicCalls=[];
 const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{schema:'launch-v19-runtime-v1',publicAssets:[],sourceDependencies:[]};
 if(manifest.schema!=='launch-v19-runtime-v1')throw Error('Invalid v19 runtime manifest schema');
 const inside=(file,base)=>{const r=path.relative(base,file);return r!==''&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
 const addMedia=name=>{
  if(name==='')return; // staticFile('') supplies the public URL base, not a file.
  const file=path.resolve(publicRoot,name);
  if(!inside(file,publicRoot))throw Error('Runtime asset escapes public: '+name);
  if(!fs.existsSync(file)){if(file!==path.resolve(audioPath))pending.push(normalized(path.relative(root,file)));return;}
  if(!fs.statSync(file).isFile())throw Error('Runtime manifest must list exact files, not folders: '+name);
  media.add(file);sources.add(file);
 };
 const resolveLocal=(owner,spec)=>{
  const base=path.resolve(path.dirname(owner),spec);
  if(!inside(base,root))throw Error('Source dependency escapes project: '+spec);
  const opts=[base,...['.ts','.tsx','.mjs','.js','.json','.css','.svg'].map(e=>base+e),...['index.ts','index.tsx','index.mjs','index.js'].map(e=>path.join(base,e))];
  if(/\.js$/.test(base))opts.push(base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx');
  return opts.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
 };
 const visit=file=>{
  file=path.resolve(file);
  if(moduleFiles.has(file))return;
  if(!inside(file,root))throw Error('Source dependency escapes project: '+file);
  if(!fs.existsSync(file)){pending.push(normalized(path.relative(root,file)));return;}
  moduleFiles.add(file);
  sources.add(file);
  if(inside(file,publicRoot))media.add(file);
  if(!/\.(tsx?|m?js|cjs|css)$/.test(file))return;
  const text=fs.readFileSync(file,'utf8');
  const dependencies=ts.preProcessFile(text,true,true).importedFiles.map(i=>i.fileName);
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const walk=node=>{
   if(ts.isCallExpression(node)){
    const callee=node.expression.getText(source);
    if(callee==='staticFile'){
     if(node.arguments.length===1&&ts.isStringLiteralLike(node.arguments[0]))addMedia(node.arguments[0].text);
     else dynamicCalls.push({file:normalized(path.relative(root,file)),kind:'staticFile',expression:node.getText(source).slice(0,160)});
    }
    if((callee==='require'||node.expression.kind===ts.SyntaxKind.ImportKeyword)&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))dependencies.push(node.arguments[0].text);
   }
   ts.forEachChild(node,walk);
  };
  walk(source);
  for(const spec of new Set(dependencies)){
   if(!spec.startsWith('.')){packages.add(spec);continue;}
   const dependency=resolveLocal(file,spec);
   if(!dependency){
    // A concurrently authored entry may precede its captions or local modules.
    // Report those as pending readiness; a render still fails before freezing.
    pending.push(normalized(path.relative(root,path.resolve(path.dirname(file),spec))));
    continue;
   }
   visit(dependency);
  }
 };
 visit(entryPoint);
 for(const name of ['src/launch-v19-story.json','src/launch-v19-captions.json','scripts/render_launch_v19.mjs','scripts/renderer-options-v19.mjs','scripts/renderer-inputs-v19.mjs','package.json','tsconfig.json',...manifest.sourceDependencies])visit(path.resolve(root,name));
 if(fs.existsSync(manifestPath))visit(manifestPath);else pending.push(normalized(path.relative(root,manifestPath)));
 for(const name of manifest.publicAssets)addMedia(name);
 if(fs.existsSync(audioPath))addMedia(normalized(path.relative(publicRoot,audioPath)));
 for(const name of ['package-lock.json','npm-shrinkwrap.json','pnpm-lock.yaml'])if(fs.existsSync(path.join(root,name)))visit(path.join(root,name));
 return {sourceFiles:[...sources].sort(),sourceFreezeFiles:[...moduleFiles].sort(),publicFiles:[...media].sort(),pending:[...new Set(pending)],dynamicCalls,externalPackages:[...packages].sort(),manifest};
}
