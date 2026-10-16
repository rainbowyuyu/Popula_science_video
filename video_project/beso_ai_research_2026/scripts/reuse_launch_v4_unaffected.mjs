import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// This is a narrowly scoped equivalence proof, not a general render cache.
// Dry run is the default. --apply may be used only after reviewing its report.
const root=process.cwd();
const flag=(key,fallback)=>process.argv.find(x=>x.startsWith(key+'='))?.slice(key.length+1)??fallback;
const from=flag('--from','5ea832a34db4'),to=flag('--to',null);
const apply=process.argv.includes('--apply'),capture=process.argv.includes('--capture-baseline');
const indices=[0,4,5,6],chunk=900;
const snapshot=path.resolve(root,flag('--snapshot','work/v4-final-layout-repair/LaunchV4.before.tsx'));
const baselinePath=path.resolve(root,flag('--baseline','work/v4-final-layout-repair/reuse-baseline.json'));
const reportPath=path.join(root,'research/qa/launch-v4-segment-reuse.json');
const expectedSnapshotSHA='46a305919dbb459aca6e97d39b77c9bb487e11f4e5c932d2ac97e7a7c59daf3a';
const rel=f=>path.relative(root,f).replaceAll('\\','/');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const readJSON=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const fail=m=>{throw Error(m)};
const filesBelow=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>item.isDirectory()?filesBelow(path.join(dir,item.name)):item.isFile()?[path.join(dir,item.name)]:[]):[];
if(!/^[0-9a-f]{12}$/.test(from)||(!capture&&!/^[0-9a-f]{12}$/.test(to??'')))fail('Expected --from and --to renderer revisions (12 lowercase hexadecimal characters).');
if(apply&&capture)fail('Baseline capture cannot apply reuse.');
if(sha(fs.readFileSync(snapshot))!==expectedSnapshotSHA)fail('Original LaunchV4 snapshot SHA-256 does not match the reviewed pre-repair source.');

// Exactly the input order and extension filters in render_launch_v4.mjs.
// Baseline capture verifies this implementation against that renderer revision.
const sourceFiles=filesBelow(path.join(root,'src')).filter(f=>/\.(tsx?|json|css)$/.test(f));
const importedManifest=path.join(root,'research/generation/launch-v4-bridges.json');
const publicFolders=['beso-research','screens','generated','brand','web-capture','environment'];
const publicFiles=publicFolders.flatMap(folder=>filesBelow(path.join(root,'public',folder)));
const assetFiles=filesBelow(path.join(root,'public/assets')).filter(f=>/\.(glb|png|jpe?g|webp)$/i.test(f));
const audioPath=path.join(root,'public/audio/launch-v4-master.wav');
const inputs=[...sourceFiles,importedManifest,path.join(root,'scripts/render_launch_v4.mjs'),path.join(root,'scripts/renderer-options.mjs'),...publicFiles,...assetFiles,audioPath];
const launchPath=path.join(root,'src/LaunchV4.tsx');
function inputState(useSnapshot){
 const digest=crypto.createHash('sha256'),records=[];
 for(const file of inputs){
  if(!fs.existsSync(file))fail(`Missing renderer input ${rel(file)}`);
  const bytes=fs.readFileSync(useSnapshot&&file===launchPath?snapshot:file),name=rel(file);
  digest.update(name);digest.update(bytes);records.push({file:name,bytes:bytes.length,sha256:sha(bytes)});
 }
 const fullSHA256=digest.digest('hex');return {revision:fullSHA256.slice(0,12),fullSHA256,records};
}
const oldState=inputState(true),newState=inputState(false);
if(oldState.revision!==from)fail(`Substituting the reviewed LaunchV4 snapshot computes ${oldState.revision}, not source revision ${from}. Another input has changed or the hash procedure is unsupported.`);
const oldDir=path.join(root,'output',`launch-v4-render-${from}`),oldManifest=readJSON(path.join(oldDir,'render-manifest.json'));
if(oldManifest.revision!==from||!oldManifest.finished||oldManifest.durationInFrames!==6300||oldManifest.fps!==60||oldManifest.width!==1920||oldManifest.height!==1080||oldManifest.segments.length!==7)fail('Source render must be the completed 6300-frame / 1080p60 render with seven 900-frame segments.');
if(oldManifest.audioSHA256!==sha(fs.readFileSync(audioPath)))fail('The master audio differs from the source render.');
if(capture){
 if(fs.existsSync(baselinePath))fail('Baseline already exists; do not overwrite an original provenance record.');
 fs.mkdirSync(path.dirname(baselinePath),{recursive:true});
 const record={schema:1,created:new Date().toISOString(),from,sourceSnapshot:rel(snapshot),sourceSnapshotSHA256:expectedSnapshotSHA,oldState,rendererSHA256:sha(fs.readFileSync(path.join(root,'scripts/render_launch_v4.mjs'))),rendererOptionsSHA256:sha(fs.readFileSync(path.join(root,'scripts/renderer-options.mjs'))),scope:'Ordered exact render input bytes, with reviewed pre-repair LaunchV4 source substituted. Matches original renderer revision.'};
 fs.writeFileSync(baselinePath,JSON.stringify(record,null,2));console.log('BASELINE',baselinePath,oldState.fullSHA256);process.exit(0);
}
const baseline=readJSON(baselinePath);
if(baseline.from!==from||baseline.sourceSnapshotSHA256!==expectedSnapshotSHA||baseline.oldState.fullSHA256!==oldState.fullSHA256||JSON.stringify(baseline.oldState.records)!==JSON.stringify(oldState.records))fail('Ordered original input bytes no longer match the captured baseline.');
if(sha(fs.readFileSync(path.join(root,'scripts/render_launch_v4.mjs')))!==baseline.rendererSHA256||sha(fs.readFileSync(path.join(root,'scripts/renderer-options.mjs')))!==baseline.rendererOptionsSHA256)fail('Renderer code/options changed; equivalence is no longer established.');
if(newState.revision!==to||to===from)fail(`Current renderer inputs compute ${newState.revision}; expected distinct target ${to}.`);
const changes=newState.records.filter((r,i)=>r.sha256!==oldState.records[i].sha256).map(r=>r.file);
if(JSON.stringify(changes)!==JSON.stringify(['src/LaunchV4.tsx']))fail(`Unexpected changed renderer inputs: ${JSON.stringify(changes)}`);

const before=fs.readFileSync(snapshot,'utf8'),after=fs.readFileSync(launchPath,'utf8');
function sourceParts(text){
 const tree=ts.createSourceFile('LaunchV4.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(tree.parseDiagnostics.length)fail('Cannot parse LaunchV4 source.');
 const functions={};
 for(const node of tree.statements)if(ts.isFunctionDeclaration(node)&&['Logo','WebCopy','Topology'].includes(node.name?.text)){
  if(functions[node.name.text])fail('Duplicate allowed function');functions[node.name.text]={start:node.getStart(tree),end:node.end,text:text.slice(node.getStart(tree),node.end)};
 }
 if(Object.keys(functions).length!==3)fail('All three scoped functions must exist.');
 const calls=[];function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(tree)==='Logo')calls.push({start:n.getStart(tree),end:n.end,text:n.getText(tree)});ts.forEachChild(n,visit)}visit(tree);
 if(calls.length!==1)fail('Exactly one Logo JSX call is required.');
 const masks=[...Object.values(functions).map((p,i)=>({...p,replacement:`/* scoped-function-${Object.keys(functions)[i]} */`})),{...calls[0],replacement:'/* scoped-logo-call */'}];
 let rest=text;for(const m of masks.sort((a,b)=>b.start-a.start))rest=rest.slice(0,m.start)+m.replacement+rest.slice(m.end);
 return {functions,call:calls[0].text,rest};
}
const a=sourceParts(before),b=sourceParts(after);
if(a.rest!==b.rest)fail('Source outside Logo/WebCopy/Topology and their single Logo call changed.');
if(a.call!=='<Logo/>'||b.call!=='<Logo s={s}/>')fail('Only the reviewed Logo state argument may change.');

// Evaluate the exact TSX functions as pure element producers. This compares
// every prop/style/child for every reused frame, not a few sampled values.
// Inputs include two different result states and absent info to detect accidental
// changes to dynamic values. Other components/source are byte-identical above.
const story=readJSON(path.join(root,'src/launch-story.json'));
const bridgeManifest=readJSON(importedManifest);
if(!Array.isArray(bridgeManifest.bridges))fail('Unsupported generated bridge manifest structure.');
function initializers(text,names){
 const tree=ts.createSourceFile('helpers.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found={};
 for(const node of tree.statements)if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){
  const name=d.name.getText(tree);if(names.includes(name)&&d.initializer)found[name]=d.initializer.getText(tree);
 }
 if(names.some(n=>!found[n]))fail(`Missing exact helper initializer: ${names.join(',')}`);
 return names.map(n=>`const ${n}=${found[n]};`).join('\n');
}
// Use the exact source initializers, including the film's quintic smoother and
// manifest duration normalization. Do not approximate their timing in the proof.
const helpers=[
 initializers(fs.readFileSync(path.join(root,'src/beso/World.ts'),'utf8'),['clamp','smooth']),
 initializers(fs.readFileSync(path.join(root,'src/beso/GeneratedLaunchBridges.tsx'),'utf8'),['generatedBridges']),
 initializers(before,['at','phase','leave','slide','bridgeSpan','bridged'])
].join('\n');
const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children})};
function evaluate(parts){
 const text=helpers+'\n'+Object.values(parts.functions).map(f=>f.text).join('\n')+'\nglobalThis.__functions={Logo,WebCopy,Topology,at};';
 const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
 const context=vm.createContext({React,Img:'Img',staticFile:x=>x,ink:'#123a4b',teal:'#167d86',gold:'#e8ad76',fps:story.fps,scenes:story.scenes,manifest:bridgeManifest});
 new vm.Script(code).runInContext(context,{timeout:1000});return context.__functions;
}
const oldFunctions=evaluate(a),newFunctions=evaluate(b);
const infoCases=[undefined,{fraction:.327,iteration:10},{fraction:.918,iteration:43}];
const compared=[];let comparisons=0;
for(const index of indices){
 const start=index*chunk,end=Math.min(story.duration-1,start+chunk-1);
 for(let frame=start;frame<=end;frame++){
  const s=oldFunctions.at(frame);
  for(const name of ['Logo','WebCopy','Topology'])for(const info of infoCases){
   const input={s,info},oldValue=JSON.stringify(oldFunctions[name](input)),newValue=JSON.stringify(newFunctions[name](input));
   if(oldValue!==newValue)fail(`Element equivalence failed: ${name} at frame ${frame}, scene ${s.id}.`);comparisons++;
  }
 }
 compared.push({index,start,end,frames:end-start+1});
}

const targetDir=path.join(root,'output',`launch-v4-render-${to}`),targetManifestPath=path.join(targetDir,'render-manifest.json');
if(!fs.existsSync(targetManifestPath))fail('Target stills render manifest must exist before proving/applying reuse.');
const targetManifest=readJSON(targetManifestPath);
if(targetManifest.revision!==to||targetManifest.audioSHA256!==oldManifest.audioSHA256||targetManifest.durationInFrames!==6300||targetManifest.fps!==60)fail('Target manifest does not match the proven inputs/timeline/audio.');
const segments=compared.map(c=>{
 const source=path.join(oldDir,`segment-${String(c.index).padStart(3,'0')}.mp4`),sourceSidecar=readJSON(source+'.json');
 if(sourceSidecar.revision!==from||sourceSidecar.index!==c.index||sourceSidecar.start!==c.start||sourceSidecar.end!==c.end||sourceSidecar.frames!==c.frames||!sourceSidecar.finished)fail(`Invalid original segment sidecar ${c.index}`);
 if(path.resolve(sourceSidecar.file)!==path.resolve(source)||!fs.statSync(source).size)fail(`Invalid original segment file ${c.index}`);
 const sourceSHA256=sha(fs.readFileSync(source)),dest=path.join(targetDir,path.basename(source));
 if(fs.existsSync(dest)||fs.existsSync(dest+'.json'))fail(`Target segment ${c.index} already exists; reuse never overwrites completed work.`);
 return {...c,source:rel(source),sourceSHA256,sourceSidecarSHA256:sha(fs.readFileSync(source+'.json')),file:rel(dest),sourceRecord:sourceSidecar};
});
const report={schema:1,created:new Date().toISOString(),passed:true,applied:false,from,to,sourceSnapshot:rel(snapshot),sourceSnapshotSHA256:expectedSnapshotSHA,currentLaunchSourceSHA256:sha(Buffer.from(after)),scopedFunctions:Object.keys(a.functions).map(name=>({name,beforeSHA256:sha(Buffer.from(a.functions[name].text)),afterSHA256:sha(Buffer.from(b.functions[name].text))})),baseline:rel(baselinePath),baselineSHA256:sha(fs.readFileSync(baselinePath)),oldInputsSHA256:oldState.fullSHA256,newInputsSHA256:newState.fullSHA256,orderedInputCount:inputs.length,changedInputs:changes,outsideScopedFunctionsByteIdentical:true,frameCount:compared.reduce((n,s)=>n+s.frames,0),elementComparisons:comparisons,allComparedElementTreesEqual:true,scope:{reusedIndices:indices,rerenderIndices:[1,2,3],changes:['Brief WebCopy earlier leftward exit beginning 16.0 s (frame 960).','Topology stats rightward exit 32.3–32.9 s, with a subtle text contour after 31.0 s, entirely inside segment 2.','Logo outline active only 46.7–50.1 s (frames 2803–3005), original filter everywhere else.'],limits:['Equivalence proves the narrowly changed overlay components produce identical element trees on every reused frame; all other renderer inputs match original byte hashes.','Three representative info states test output invariance; underlying native info producer/data are byte-identical.','Original segment encoding is reused unchanged; no claim of a second independent rendering of those frames.','The final concatenated movie still requires full technical QA and sampled visual inspection.']},segments:segments.map(({sourceRecord,...s})=>s)};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
if(apply){
 // A second complete hash check closes the validation-to-copy edit window.
 if(inputState(false).fullSHA256!==newState.fullSHA256||inputState(true).fullSHA256!==oldState.fullSHA256)fail('Inputs changed after verification; no reuse was applied.');
 for(const s of segments){
  const began=Date.now(),source=path.join(root,s.source),dest=path.join(root,s.file);fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);
  if(sha(fs.readFileSync(dest))!==s.sourceSHA256)fail(`Copied segment ${s.index} SHA mismatch.`);
  const sidecar={index:s.index,start:s.start,end:s.end,frames:s.frames,file:dest,revision:to,finished:new Date().toISOString(),reusedFrom:from,reuseElapsedS:(Date.now()-began)/1000,sourceFile:source,sourceSHA256:s.sourceSHA256,sourceSidecarSHA256:s.sourceSidecarSHA256,originalFinished:s.sourceRecord.finished,originalRenderElapsedS:s.sourceRecord.elapsedS,equivalenceScope:'Byte-identical renderer inputs except three pure overlay functions; element trees match every reused frame.',equivalenceCheck:reportPath};
  fs.writeFileSync(dest+'.json',JSON.stringify(sidecar,null,2),{flag:'wx'});
 }
 report.applied=true;report.appliedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
}
console.log(apply?'REUSED':'PROVED (dry run)',indices.join(','),'revision',to,'comparisons',comparisons,'report',reportPath);
