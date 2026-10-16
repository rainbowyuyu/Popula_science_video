/** Read-only candidate timing audit using the actual renderer's physics classes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonicalPath='src/timeline.json',canonicalSHA=sha(canonicalPath),canonical=read(canonicalPath);
const cuePath='research/v7-final-candidate-cues.json',candidates=read(cuePath);
const changes=new Map(candidates.clips.map(c=>[c.id,c]));
const tl=structuredClone(canonical);let cursor=tl.clips[0].start;
for(const clip of tl.clips){
 const candidate=changes.get(clip.id);
 if(candidate){
  const take=read(`audio/candidates/${candidate.candidate}/${clip.id}.json`);
  if(sha(take.processed)!==candidate.sourceSHA256)throw new Error('Stale candidate audio '+clip.id);
  clip.duration=candidate.expectedClipFrames;
  clip.text=clip.caption=take.text;clip.ttsText=take.ttsText;clip.voiceDurationSeconds=take.duration;
 }
 clip.start=cursor;clip.end=cursor+clip.duration;cursor=clip.end;
}
tl.outro={...tl.outro,start:cursor,end:cursor+canonical.outro.duration};tl.duration=tl.outro.end;
tl.durationFrames=tl.duration;tl.durationSeconds=tl.duration/tl.fps;
for(const section of tl.sections){
 const clips=tl.clips.filter(c=>c.section===section.id);
 if(clips.length){section.start=clips[0].start;section.end=clips.at(-1).end;}
 else if(section.id==='references'){section.start=tl.outro.start;section.end=tl.outro.end;}
}
const bundle=path.join(root,'tmp/audio-candidate-physics-audit.mjs');
await build({stdin:{contents:`export {PhysicsPlayback} from './src/PhysicsPlayback';export {HighResolutionResponse} from './src/HighResolutionResponse';export {stateAt,pulse} from './src/visual';export {WEB_FORCE_SELECTIONS,solverAreaSquareMetres} from './src/MemberForceVisualization';`,resolveDir:root},outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
const {PhysicsPlayback,HighResolutionResponse,stateAt,pulse,WEB_FORCE_SELECTIONS,solverAreaSquareMetres}=await import(pathToFileURL(bundle));
const data=read('public/physics/response.json'),meta=read('public/physics/cinematic-response.json');
const raw=fs.readFileSync('public/physics/cinematic-response.f32');
const high=new HighResolutionResponse(meta,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const physics=new PhysicsPlayback(data,tl,high);
const s19=tl.clips.find(c=>c.id==='s019'),s20=tl.clips.find(c=>c.id==='s020');
const cue20=changes.get('s020');
const requirements=[['橙色','FE_M_Z04_C03_OX1',-1],['向受压方向变化','FE_M_Z04_C03_OX1',-1],['蓝色','FE_M_Z04_C03_OX2',1],['向受拉方向变化','FE_M_Z04_C03_OX2',1]];
const results=[];
for(const [phrase,meshId,sign] of requirements){
 const cue=cue20.cues.find(c=>c.phrase===phrase),axis=physics.byMesh.get(meshId);
 if(!cue||axis?.length!==1)throw new Error('Unresolved phrase/member '+phrase);
 const index=axis[0].index,spec=WEB_FORCE_SELECTIONS.find(s=>s.meshId===meshId);
 const first=Math.ceil(s20.start+cue.voiceStart_s*tl.fps-1e-9),last=Math.floor(s20.start+cue.voiceEnd_s*tl.fps-1e-9);
 const samples=[];
 for(let frame=first;frame<=last;frame++){
  const state=stateAt(frame,tl);physics.update(state);
  samples.push({frame,voiceTime_s:(frame-s20.start)/tl.fps,physicalTime_s:physics.physicalTime(state),
   signedMPa:physics.currentStress[index],forceMN:physics.currentStress[index]*solverAreaSquareMetres(data.members[index]),
   selectedGlyphReveal:spec?pulse(...spec.window,state.n+state.u):0,physicsKind:physics.play?.kind});
 }
 const bad=samples.filter(s=>sign*s.signedMPa<=0);
 results.push({phrase,meshId,memberId:data.members[index].id,expectedSign:sign<0?'negative compression increment':'positive tension increment',
  voiceInterval_s:[cue.voiceStart_s,cue.voiceEnd_s],candidateFilmFrames:[first,last],framesChecked:samples.length,
  physicalInterval_s:[samples[0].physicalTime_s,samples.at(-1).physicalTime_s],
  signedMPaRange:[Math.min(...samples.map(x=>x.signedMPa)),Math.max(...samples.map(x=>x.signedMPa))],
  selectedGlyphRevealRange:[Math.min(...samples.map(x=>x.selectedGlyphReveal)),Math.max(...samples.map(x=>x.selectedGlyphReveal))],
  expectedSignAllFrames:bad.length===0,oppositeOrZeroFrames:bad.map(s=>s.frame),samples});
}
const whole=[];
for(const meshId of ['FE_M_Z04_C03_OX1','FE_M_Z04_C03_OX2']){
 const index=physics.byMesh.get(meshId)[0].index,values=[];
 for(let f=s20.start;f<s20.end;f++){const state=stateAt(f,tl);physics.update(state);values.push(physics.currentStress[index]);}
 whole.push({meshId,signedMPaRange:[Math.min(...values),Math.max(...values)],positiveFrames:values.filter(x=>x>0).length,negativeFrames:values.filter(x=>x<0).length});
}
const protectedPaths=['public/physics/response.json','public/physics/cinematic-response.json','public/physics/cinematic-response.f32','src/PhysicsPlayback.ts','src/HighResolutionResponse.ts','src/visual.ts','src/MemberForceVisualization.ts',cuePath];
const report={passed:results.every(x=>x.expectedSignAllFrames),scope:'Read-only candidate timeline; six measured clip durations substituted in memory; 5-frame inter-take gaps retained inside measured clip durations; canonical timeline and physical data unchanged.',
 candidateTimingMatchesCanonical:tl.duration===canonical.duration&&tl.clips.every((c,i)=>c.start===canonical.clips[i].start&&c.end===canonical.clips[i].end),
 canonicalTimelineSHA256:canonicalSHA,candidateTimelineFrames:tl.duration,candidateTimelineDuration_s:tl.duration/tl.fps,
 candidateClips:tl.clips.filter(c=>changes.has(c.id)).map(c=>({id:c.id,start:c.start,end:c.end,duration:c.duration})),
 clockOrigin:{clip:'s019',frame:s19.start,seconds:s19.start/tl.fps,formula:'Actual physicalTimeAt: elapsed film seconds since s019 start within frame section; read unmodified high-resolution solver samples.'},
 signConvention:'Positive = tensile wind-induced axial stress increment; negative = compressive increment. This does not report gravity-plus-wind net stress.',
 sources:Object.fromEntries(protectedPaths.map(p=>[p,sha(p)])),results,wholeS020:whole};
if(sha(canonicalPath)!==canonicalSHA)throw new Error('Canonical timeline changed during read-only audit');
fs.writeFileSync('research/v7-candidate-voice-force-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,candidateTimelineFrames:tl.duration,clockOrigin:report.clockOrigin,
 phrases:results.map(({samples,...r})=>r),wholeS020:whole},null,2));
