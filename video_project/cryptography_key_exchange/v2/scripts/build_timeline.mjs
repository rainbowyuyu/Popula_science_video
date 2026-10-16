import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const source=read('src/story.json');let data,captions;
if(fs.existsSync(path.join(root,'src/narration.json'))){data=read('src/narration.json');captions=read('src/captions.json');data.actualVoice=true;}
else{let at=.6;const n=source.cues.reduce((s,c)=>s+c.spokenText.length,0);const cues=source.cues.map(c=>{const start=at;at+=(289*c.spokenText.length/n);const end=at;at+=.16;return {...c,start,end,startSec:start,endSec:end,startFrame:Math.round(start*30),endFrame:Math.round(end*30)};});data={fps:30,durationFrames:Math.ceil((at+7)*30),durationSec:Math.ceil((at+7)*30)/30,cues,coda:{startSec:at,startFrame:Math.round(at*30)},actualVoice:false};captions={cues:cues.flatMap(c=>{const parts=c.text.match(/.{1,22}(?:[，。？！：；]|$)|.{1,22}/g)||[c.text];return parts.map((text,i)=>({id:c.id+'-'+i,text,startFrame:Math.round((c.start+(c.end-c.start)*i/parts.length)*30),endFrame:Math.round((c.start+(c.end-c.start)*(i+1)/parts.length)*30)}));})};}
const names=['opening','secret','exchange','intruder','identity','delivery','ending'];
data.groups=names.map((id,i)=>{const cues=data.cues.filter(c=>c.scene===id);return {id,index:i,x:i*24,start:i===0?0:cues[0].startSec,end:cues.at(-1).endSec,cueIds:cues.map(c=>c.id)};});
fs.writeFileSync(path.join(root,'src/timeline-data.json'),JSON.stringify(data,null,2));fs.writeFileSync(path.join(root,'src/captions-data.json'),JSON.stringify(captions,null,2));console.log(JSON.stringify({actualVoice:data.actualVoice,seconds:data.durationSec,frames:data.durationFrames}));

