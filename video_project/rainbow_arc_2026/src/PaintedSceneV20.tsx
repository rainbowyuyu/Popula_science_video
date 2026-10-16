import React from 'react';
import {Img,staticFile} from 'remotion';
import {clamp,ease} from './Timeline';
type Pair={start:number;end:number;first:string;last:string};
// Endpoint plates are a restrained fallback behind the accepted Qwen video
// bridges. They keep the whole outdoor story in the same watercolor identity
// when a native clip is unavailable, while the optical core remains rendered
// by Three.js. Each plate pair is a real Qwen image edit of a deterministic
// V20 frame; it is never used for angles, labels, or formulas.
const full=(id:string)=>`assets_v20/full-art/${id}/keyframe-1920x1080.png`;
const pairs:Pair[]=[
 // The non-optical chapters use Qwen's accepted watercolor endpoint plates.
 // They are matched to the deterministic film frame at each boundary, so a
 // native Qwen video can take over without changing the story geography.
 {start:0,end:300,first:full('full_a01_start'),last:full('full_a01_end')},
 {start:300,end:600,first:full('full_a02_start'),last:full('full_a02_end')},
 {start:600,end:900,first:full('full_a03_start'),last:full('full_a03_end')},
 {start:900,end:1018,first:full('full_a04_start'),last:full('full_a04_end')},
 {start:5018,end:5318,first:full('full_d01_start'),last:full('full_d01_end')},
 {start:5318,end:5618,first:full('full_d02_start'),last:full('full_d02_end')},
 {start:5618,end:5918,first:full('full_d03_start'),last:full('full_d03_end')},
 {start:5918,end:6218,first:full('full_d04_start'),last:full('full_d04_end')},
 {start:6218,end:6518,first:full('full_d05_start'),last:full('full_d05_end')},
 {start:6518,end:6818,first:full('full_d06_start'),last:full('full_d06_end')},
 {start:6818,end:7118,first:full('full_d07_start'),last:full('full_d07_end')},
 {start:7118,end:7418,first:full('full_d08_start'),last:full('full_d08_end')},
 {start:7418,end:7718,first:full('full_d09_start'),last:full('full_d09_end')},
 // d10's original start plate was rejected with its first-generation pair;
 // reuse the accepted d09 end as the exact spatial handoff and the repaired
 // single-person d10 end plate.
 {start:7718,end:8018,first:full('full_d09_end'),last:full('full_d10_end_r2')},
 {start:8018,end:8318,first:full('full_d11_start'),last:full('full_d11_end')},
 {start:8318,end:8448,first:full('full_d12_start'),last:full('full_d12_end')},
 {start:9006,end:9306,first:full('full_f01_start'),last:full('full_f01_end')},
 {start:9306,end:9606,first:full('full_f02_start'),last:full('full_f02_end')},
 {start:9606,end:9906,first:full('full_f03_start'),last:full('full_f03_end')},
 {start:9906,end:10206,first:full('full_f04_start'),last:full('full_f04_end')},
 {start:10206,end:10506,first:full('full_f05_start'),last:full('full_f05_end')},
 {start:10506,end:10552,first:full('full_f06_start'),last:full('full_f06_end')}
];
const style=(extra:React.CSSProperties):React.CSSProperties=>({position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',pointerEvents:'none',...extra});
export function PaintedSceneV20({frame}:{frame:number}){
 const pair=pairs.find(x=>frame>=x.start&&frame<x.end); if(!pair)return null;
 const asset=(name:string)=>staticFile(name.includes('/')?name:`assets_v20/painted/${name}.png`);
 const q=clamp((frame-pair.start)/Math.max(1,pair.end-pair.start));
 const push=ease(clamp((q-.91)/.09));
 const drift=0.012*Math.sin(q*Math.PI);
 return <div style={{position:'absolute',inset:0,zIndex:1,overflow:'hidden',pointerEvents:'none',background:'#edf3ef'}} data-v20-painted={pair.first}>
   <Img src={asset(pair.first)} style={style({transform:`translate3d(${(-drift*100)-(push*100)}%,${drift*30}%,0) scale(${1.012+drift})`,filter:'saturate(.96) contrast(.98)'})}/>
   <Img src={asset(pair.last)} style={style({transform:`translate3d(${(100-push*100)}%,${-drift*30}%,0) scale(${1.012+drift})`,filter:'saturate(.96) contrast(.98)'})}/>
 </div>;
}
