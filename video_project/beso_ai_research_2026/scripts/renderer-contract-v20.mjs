import fs from 'node:fs';
import path from 'node:path';

export function validateTimeline(story,captions){
 if(story.fps!==60||!Number.isSafeInteger(story.duration)||story.duration<6000||story.duration>6600)throw Error('v20 requires 60 fps and an integral 100-to-110-second launch timeline');
 if(!Array.isArray(story.scenes)||!story.scenes.length)throw Error('Story scenes must be nonempty');
 let next=0;const ids=new Set();
 for(const scene of story.scenes){
  if(!scene.id||ids.has(scene.id))throw Error('Scene IDs must be unique');ids.add(scene.id);
  if(!Number.isInteger(scene.start)||!Number.isInteger(scene.duration)||scene.duration<1||scene.start!==next)throw Error('Scenes must cover the timeline contiguously: '+scene.id);
  next+=scene.duration;
 }
 if(next!==story.duration)throw Error('Scenes must cover exactly story.duration frames');
 if(!Array.isArray(captions)||!captions.length)throw Error('Captions must be nonempty');
 let previous=0;
 for(const caption of captions){
  if(!Number.isFinite(caption.startMs)||!Number.isFinite(caption.endMs)||caption.startMs<previous||caption.endMs<=caption.startMs||caption.endMs>story.duration/story.fps*1000||!String(caption.text||'').trim())throw Error('Invalid or overlapping caption');
  previous=caption.endMs;
 }
 return{valid:true,sceneCount:story.scenes.length,captionCount:captions.length};
}

export function parseFrames(value,total=6300){
 if(!/^\d+(?:,\d+)*$/.test(value))throw Error('--frames requires a comma-separated integer list');
 const values=value.split(',').map(Number);
 if(values.some(f=>!Number.isSafeInteger(f)||f<0||f>=total))throw Error('--frames is out of bounds');
 return [...new Set(values)].sort((a,b)=>a-b);
}
export function parseClip(value,total=6300){
 if(!/^\d+-\d+$/.test(value))throw Error('--clip requires inclusive START-END');
 const[from,to]=value.split('-').map(Number);
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>=total)throw Error('--clip is out of bounds');
 return[from,to];
}
export function parseSegments(value,chunk,total=6300){
 if(!Number.isSafeInteger(chunk)||chunk<1||chunk>total)throw Error('--chunk must be positive and no longer than the film');
 if(value===null)return null;
 if(!/^\d+(?:,\d+)*$/.test(value))throw Error('--segments requires a comma-separated integer list');
 const list=value.split(',').map(Number);
 if(list.some(i=>!Number.isSafeInteger(i)||i<0||i>=Math.ceil(total/chunk)))throw Error('--segments is out of bounds');
 return[...new Set(list)];
}
export function validateOutput(root,output,mode){
 if(!output)return;
 const relative=path.relative(root,output).replaceAll('\\','/');
 if(relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw Error('Render output must stay inside this project');
 if(!/^(?:output|research\/qa|public\/generated\/v20)(?:\/|$)/.test(relative))throw Error('Use output/, research/qa/ or public/generated/v20/ for render artifacts');
 if(!/(?:^|[\/_-])v20(?:[\/_\-.]|$)/i.test(relative))throw Error('Custom output must explicitly contain the v20 version token');
 if(/(?:^|[\/_-])v(?:[1-9]|1[0-9])(?:[\/_\-.]|$)/i.test(relative))throw Error('Earlier version outputs are protected');
 if(mode==='stills'&&/\.(?:mp4|png|jpe?g)$/i.test(output))throw Error('Still output must be a directory');
 if(mode!=='stills'&&!/\.mp4$/i.test(output))throw Error('Video output must end in .mp4');
 for(let p=output;;p=path.dirname(p)){
  if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Output cannot traverse a symlink or junction');
  if(p===root||path.dirname(p)===p)break;
 }
}
