import fs from 'node:fs';import path from 'node:path';import {buildSync} from 'esbuild';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const source=fs.readFileSync('src/V5World.ts','utf8');
const head=source.slice(source.indexOf('  const clipIndex=this.tl.clips.findIndex'),source.indexOf('  // A macro hand-off begins'));
const block=source.slice(source.indexOf('  const mealWeight=this.viewWeight'),source.indexOf('  if(measurementWeight>.000001)'));
const entry=`import fs from 'node:fs';import * as T from 'three';import {V5CameraPath,viewOf} from './src/V5CameraPath';import {smooth,clamp,stateAt} from './src/visual';
const tl=JSON.parse(fs.readFileSync('src/timeline.json','utf8'));const evidence=JSON.parse(fs.readFileSync('research/revision-v5/garment-diagnostic/metrics.json','utf8'));const anchors=Object.fromEntries(Object.entries(evidence.anchors).map(([k,v])=>[k,new T.Vector3(...v as [number,number,number])]));const route=new V5CameraPath(anchors,tl);
const closer=(d:number,a:number,b:number)=>1-smooth(Math.log(Math.max(d,1e-12)/a)/Math.log(b/a));
let last:any;const context={tl,anchors,cameraPath:route,person:{update:(v:any)=>last=v},viewWeight(s:any,views:string[]){return Math.max(0,...tl.clips.flatMap((c:any,i:number)=>views.includes(viewOf(c))?[ (i===0?1:smooth((s.frame-(c.start-(tl.clips[i-1]?.duration??120)*.38))/Math.max(45,(tl.clips[i-1]?.duration??120)*.35)))*(1-smooth((s.frame-c.end)/Math.max(75,(tl.clips[i+1]?.duration??120)*.58))) ]:[]));}};
function sample(this:any,s:any){const pose=route.sample(s.frame),d=pose.distance,view=viewOf(s.clip);
${head}${block}
return {frame:s.frame,clip:s.clip.id,distance:d,opacity:last.wardrobeOpacity};}
const rows=Array.from({length:tl.duration},(_,frame)=>sample.call(context,stateAt(frame,tl)));
function ranges(list:number[]){const r:number[][]=[];for(const f of list){const last=r.at(-1);if(last&&f===last[1]+1)last[1]=f;else r.push([f,f]);}return r;}
const partial=rows.filter(r=>r.opacity>0&&r.opacity<.998);const supports=ranges(partial.map(r=>r.frame));const padded=ranges([...new Set(supports.flatMap(([a,b])=>Array.from({length:Math.min(tl.duration-1,b+30)-Math.max(0,a-30)+1},(_,i)=>Math.max(0,a-30)+i)))].sort((a,b)=>a-b));
const report={method:'CPU evaluation of the exact extracted V5World person-opacity block, current V5CameraPath and saved same-atlas anchors; no rendering.',totalFrames:tl.duration,partialAlphaFrames:partial.length,rawRanges:supports,paddedRanges:padded,thresholdCrossings:rows.filter((r,i)=>i>0&&((r.opacity>=.998)!==(rows[i-1].opacity>=.998))).map(r=>({before:rows[r.frame-1],after:r})),rows};fs.writeFileSync('research/revision-v5/person-final-candidates/wardrobe-alpha-support.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined},null,2));`;
const bundled=path.join(out,'trace_wardrobe_support.cjs');buildSync({stdin:{contents:entry,loader:'ts',resolveDir:process.cwd()},bundle:true,platform:'node',packages:'external',outfile:bundled});require(bundled);
