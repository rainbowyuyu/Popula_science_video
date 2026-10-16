/** Read-only story/event contract check. Run after narration and word alignment freeze. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const story=read('src/story.json'),narration=read('src/narration.json'),words=read('src/word-events.json');
const overridePath='work/audio/speech-overrides.json',overrides=fs.existsSync(path.join(root,overridePath))?read(overridePath):{};
const captions=read('src/captions-data.json').cues;
const normalizeDisplay=s=>s.replace(/[\p{P}\p{Z}\s]/gu,'');
const report={scope:'story/narration/event data contract only; no subjective listening or visual acceptance',storySha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/story.json'))).digest('hex'),speechOverrideSource:overridePath,errors:[],warnings:[],acceptedSpeechOverrides:[],reviewedRepeatedAnchors:[],references:[]};
for(const id of Object.keys(overrides))if(!story.cues.some(c=>c.id===id))report.errors.push({type:'orphan-speech-override',id});
for(const cue of story.cues){
  const n=narration.cues.find(c=>c.id===cue.id);
  if(!n)report.errors.push({type:'missing-narration-cue',id:cue.id});
  else{
    // Pronunciation-only TTS input is explicitly recorded; displayed words stay standard.
    const override=overrides[cue.id],expectedSpoken=override??cue.spokenText;
    if(n.text!==cue.text||(n.displayText!==undefined&&n.displayText!==cue.text))report.errors.push({type:'story-display-text-stale',id:cue.id});
    if(n.spokenText!==expectedSpoken)report.errors.push({type:'story-spoken-text-stale',id:cue.id});
    if(override!==undefined){
      if(typeof override!=='string'||n.originalSpokenText!==cue.spokenText)report.errors.push({type:'invalid-or-stale-speech-override',id:cue.id});
      else report.acceptedSpeechOverrides.push({id:cue.id,source:overridePath,displayTextPreserved:n.text===cue.text,originalSpokenTextPreserved:true});
    }
  }
  const display=captions.filter(c=>(c.cueId??c.id.split('-')[0])===cue.id).map(c=>c.text).join('');
  if(normalizeDisplay(display)!==normalizeDisplay(cue.text))report.errors.push({type:'caption-display-text-stale',id:cue.id});
}
// These first occurrences issue the action; the later occurrence only lists ingredients.
// Pin the reviewed sentence so a future rewrite still requests fresh review.
const reviewedFirstOccurrence={
  's13:黄色':{text:'先在两边各放一点黄色。这份黄色是公开的，手机知道，蛋糕店知道，中间偷看的人也能拿到。',reason:'First 黄色 introduces public fill; second describes that same sample.'},
  's19:红色':{text:'手机收到店家的混色，再倒进自己的红色。这只杯子现在凑齐了三样材料，黄色、蓝色，还有红色。',reason:'First 红色 begins the phone pour; later 红色 is the completed ingredient list.'},
  's20:蓝色':{text:'蛋糕店收到手机的混色，再倒进自己的蓝色。它的杯子也凑齐了黄色、红色和蓝色，一样都没少。',reason:'First 蓝色 begins the shop pour; later 蓝色 is the completed ingredient list.'},
};
for(const file of ['src/World.ts','src/Mixing.ts']){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  for(const match of source.matchAll(/word(?:Time|Progress)\('(s\d+)'\s*,\s*'([^']+)'/g)){
    const[,id,phrase]=match,cue=story.cues.find(c=>c.id===id),event=words.events.find(e=>e.cueId===id&&e.phrase===phrase);
    const count=cue?cue.text.split(phrase).length-1:0;
    const ref={file,id,phrase,occurrences:count,eventFrame:event?.startFrame??null};report.references.push(ref);
    if(count===0)report.errors.push({type:'anchor-phrase-missing-from-story',...ref});
    if(!event)report.errors.push({type:'animation-would-fallback-to-cue-start',...ref});
    if(count>1){
      const reviewed=reviewedFirstOccurrence[`${id}:${phrase}`];
      if(reviewed&&cue.text===reviewed.text)report.reviewedRepeatedAnchors.push({...ref,occurrence:1,reason:reviewed.reason});
      else report.warnings.push({type:'ambiguous-repeated-phrase-use-unique-event',...ref});
    }
    const n=narration.cues.find(c=>c.id===id);
    if(event&&n&&(event.startSec<n.startSec||event.startSec>n.endSec))report.errors.push({type:'event-outside-own-cue',...ref});
  }
}
report.pass=report.errors.length===0;
fs.mkdirSync(path.join(root,'work/qa'),{recursive:true});
fs.writeFileSync(path.join(root,'work/qa/story-contract-v4.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,errors:report.errors,warnings:report.warnings,acceptedSpeechOverrides:report.acceptedSpeechOverrides,reviewedRepeatedAnchors:report.reviewedRepeatedAnchors},null,2));
if(!report.pass)process.exitCode=1;
