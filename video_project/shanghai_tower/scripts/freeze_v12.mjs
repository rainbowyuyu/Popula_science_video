// Create a distinct V12 production lock; never alter earlier locks or deliveries.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const help=`Usage: node scripts/freeze_v12.mjs [--tag=v12-final] [--segments=1,6,7]

Explicit execution bundles and freezes the current source into a NEW V12 lock.
All public data, voice, timeline, package files and any data/ input are protected.
Default affected ranges: 0-1799,9000-10799,10800-12599. Add segment 5 if changing
the CFD rigid lead-in at F8959.85. Range choice is an editorial dependency audit,
not an automatic guarantee that all modified source code is confined to it.

Next, after authorization to render:
  node scripts/render_v10.mjs --tag=v12-final --ranges=0-1799,9000-10799,10800-12599
Review the resulting encoded segments before running mux_v12.py.
--help only prints this text; it does not freeze or render anything.`;
if(process.argv.includes('--help')||process.argv.includes('-h')){console.log(help);process.exit(0);}
const args=process.argv.slice(2);
if(args.some(x=>!/^--(?:tag|segments)=/.test(x)))throw new Error('Unknown argument; use --help');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const required=(ok,message)=>{if(!ok)throw new Error(message);};
const tag=args.find(x=>x.startsWith('--tag='))?.slice(6)??'v12-final';
required(/^v12-[A-Za-z0-9_-]+$/.test(tag),'Use a distinct safe V12 tag');
const raw=args.find(x=>x.startsWith('--segments='))?.slice(11)??'1,6,7';
required(/^\d+(,\d+)*$/.test(raw),'Segments must be comma-separated one-based numbers');
const segments=raw.split(',').map(Number).sort((a,b)=>a-b);
required(new Set(segments).size===segments.length&&segments.includes(1)&&segments.every(x=>x>=1&&x<=9),'Expected distinct segments 1-9 including opening segment 1');
const lockFile=path.join(root,`research/visual/${tag}-lock.json`);
required(!fs.existsSync(lockFile),'Production locks are immutable. Use a fresh tag.');
const oldLockFile=path.join(root,'research/visual/v11-final-lock.json');
const oldManifestFile=path.join(root,'tmp/v11-final-segments/segments.json');
const oldVideo=path.join(root,'delivery/ShanghaiTower_1080p_v11.mp4');
const acceptedSHA='f7d1dc67519fb5bf6233e063acf5d9e353e63c71511dd9546c27fc8e74cf1486';
required(sha(oldVideo)===acceptedSHA,'Accepted V11 video changed');
const old=read(oldLockFile),manifest=read(oldManifestFile),marker=read(path.join(root,'tmp/final-render-v11.json'));
required(marker.success===true&&marker.videoSHA256===acceptedSHA&&marker.productionLockSHA256===sha(oldLockFile)&&marker.mixedSourceManifestSHA256===sha(oldManifestFile),'V11 marker binding differs');
for(const [name,field]of [['automatic-report.json','automaticChecksPass'],['visual-review.json','sampledVisualReviewPass'],['audio/audio-wave-match.json','passed']]){
 const report=read(path.join(root,'research/qa/v11-final',name));
 required(report[field]===true&&report.videoSHA256===acceptedSHA&&report.timelineSHA256===manifest.timelineSHA256,'Missing/stale V11 acceptance: '+name);
}
const snapshot={};
for(const p of [oldLockFile,oldManifestFile,oldVideo,path.join(root,'tmp/final-render-v11.json')])snapshot[p]=sha(p);
const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 const p=path.join(dir,e.name);required(!e.isSymbolicLink(),'Freeze refuses symbolic links: '+p);
 return e.isDirectory()?walk(p):[p];
}):[];
const added=['package.json','scripts/renderer-options.mjs','scripts/render_v10.mjs',
 'scripts/freeze_v12.mjs','scripts/v12_common.py','scripts/mux_v12.py','scripts/verify_v12_mix.py'];
// A missing optional package lock was also absent from the V11 freeze. Do not
// create/install one; an already tracked lock remains mandatory and immutable.
if(fs.existsSync(path.join(root,'package-lock.json'))||old.files['package-lock.json'])added.push('package-lock.json');
const files={};
for(const file of [...['src','public','data'].flatMap(x=>walk(path.join(root,x))),...added.map(x=>path.join(root,x))].sort()){
 required(fs.existsSync(file),'Missing freeze input: '+file);
 files[path.relative(root,file).replaceAll('\\','/')]=sha(file);
}
const protectedFile=name=>name.startsWith('public/')||name.startsWith('data/')||['src/timeline.json','package.json','package-lock.json'].includes(name);
const newlyTrackedInputs={};
for(const name of new Set([...Object.keys(old.files),...Object.keys(files)]))if(protectedFile(name)){
 if(!old.files[name]&&(name.startsWith('data/')||name==='package-lock.json')){
  required(!!files[name],'New optional input is missing: '+name);
  newlyTrackedInputs[name]=files[name];
 }else required(!!old.files[name]&&old.files[name]===files[name],'Protected data/voice/timeline changed: '+name);
}
const tl=read(path.join(root,'src/timeline.json'));
required(tl.duration===15712&&tl.fps===30,'V12 must retain accepted duration/fps');
const rerenderRanges=segments.map(n=>[(n-1)*1800,Math.min(tl.duration-1,n*1800-1)]);
const bundleDir=path.join(root,'tmp/render-runs',`${tag}-${Date.now()}`,'bundle');
const {bundle}=await import('@remotion/bundler');
await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:bundleDir});
for(const [name,hash]of Object.entries(files)){
 required(sha(path.join(root,name))===hash,'Input changed during freeze: '+name);
 if(name.startsWith('public/'))required(sha(path.join(bundleDir,name))===hash,'Bundled asset differs: '+name);
}
for(const [file,hash]of Object.entries(snapshot))required(sha(file)===hash,'V11 source changed during freeze');
const bundleFiles={};
for(const name of fs.readdirSync(bundleDir).sort())if(fs.statSync(path.join(bundleDir,name)).isFile())bundleFiles[name]=sha(path.join(bundleDir,name));
const lock={schema:'rainbow.v12-production-lock/1',tag,recordedAtUTC:new Date().toISOString(),bundle:bundleDir,
 bundleFiles,bundleFingerprint:crypto.createHash('sha256').update(JSON.stringify(bundleFiles)).digest('hex'),
 files,frames:tl.duration,fps:tl.fps,parentLock:'research/visual/v11-final-lock.json',parentLockSHA256:sha(oldLockFile),
 parentManifest:'tmp/v11-final-segments/segments.json',parentManifestSHA256:sha(oldManifestFile),
 parentVideo:'delivery/ShanghaiTower_1080p_v11.mp4',parentVideoSHA256:acceptedSHA,
 rerenderSegmentNumbers:segments,rerenderRanges,protectedBaselineInputsUnchanged:true,
 optionalInputPresence:{dataDirectory:fs.existsSync(path.join(root,'data')),packageLock:fs.existsSync(path.join(root,'package-lock.json'))},
 newlyTrackedInputs,
 newlyTrackedInputScope:'Optional inputs absent from the V11 file inventory are first tracked by V12. Their pre-V12 byte identity is not claimed; they are immutable after this freeze.',
 scope:'Only rerenderRanges use this bundle in the planned mixed-source release. Other ranges retain their V11/V10 origin. Explicit pixel identity is required after assembly.'};
fs.mkdirSync(path.dirname(lockFile),{recursive:true});
fs.writeFileSync(lockFile,JSON.stringify(lock,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({lock:lockFile,bundle:bundleDir,segments,ranges:rerenderRanges,renderCommand:`node scripts/render_v10.mjs --tag=${tag} --ranges=${rerenderRanges.map(r=>r.join('-')).join(',')}`}));
