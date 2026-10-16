// Evaluate the project's actual TypeScript edit mapper and probe baseline IDRs.
// This writes no timeline or source edits. Extra asset envelopes are retained.
const fs=require('fs'),path=require('path'),ts=require('typescript'),cp=require('child_process'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../..'),cache={};
function load(file){
 if(cache[file])return cache[file].exports;
 const module={exports:{}};cache[file]=module;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>name==='three'?require('three'):name.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),name),'utf8')):load(path.resolve(path.dirname(file),name+'.ts'));
 new Function('require','module','exports',code)(req,module,module.exports);return module.exports;
}
const timeline=load(path.join(root,'src/v16/timeline.ts'));
const target=path.join(__dirname,'patch-ranges-initial.json');
const previous=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
const result={};
const ranges=a=>a.reduce((out,f)=>{const x=out.at(-1);if(x&&f===x[1]+1)x[1]=f;else out.push([f,f]);return out},[]);
for(const[kind,aspect,file]of[['main','16:9','ShanghaiTower_1080p_v16.mp4'],['vertical','9:16','ShanghaiTower_1080x1920_v16.mp4']]){
 const frozen=path.join(__dirname,'baseline',file),baseline=fs.existsSync(frozen)?frozen:path.join(root,'delivery',file);
 const meta=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-select_streams','v:0','-skip_frame','nokey','-show_frames','-show_entries','frame=key_frame,pts_time','-of','json',baseline],{encoding:'utf8'}));
 const duration=timeline.editTimeline(aspect).duration,keys=meta.frames.map(f=>Math.round(Number(f.pts_time)*30)).concat([duration]);
 const affected=[],sky=[];
 for(let f=0;f<duration;f++){
  const state=timeline.sourceStateAt(f,aspect),cue=state.n+state.u;
  if((cue>5.3&&cue<9.2)||(cue>6.3&&cue<8.36))affected.push(f);
  if(timeline.transitionAt(f,aspect)?.mode==='sky-whip')sky.push(f);
 }
 const envelope=a=>ranges(a).map(([a,b])=>[Math.max(...keys.filter(k=>k<=a)),Math.min(...keys.filter(k=>k>b))-1]);
 result[kind]={duration,keyframes:keys,foundationActive:ranges(affected),foundationEnvelope:envelope(affected),skyActive:ranges(sky),skyEnvelopes:envelope(sky),baseline,
  mappingSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/v16/timeline.ts'))).digest('hex'),
  extraEnvelopes:previous[kind]?.extraEnvelopes??[],extraReason:previous[kind]?.extraReason??null};
}
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
