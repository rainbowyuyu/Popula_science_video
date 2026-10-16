import React from 'react';
import {AbsoluteFill,Sequence,OffthreadVideo,staticFile} from 'remotion';
import manifest from '../../research/generation/launch-v13-bridges.json';

type Bridge={id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;selection:string};
export const bridgesV14=(manifest.bridges as Bridge[]).filter(b=>b.selection==='selected');
function BridgeLayer({b}:{b:Bridge}){
 // Original 30 fps footage is sampled on the 60 fps timeline at real time.
 // Opaque endpoint cuts avoid doubled tower edges; provenance stays in delivery.
 return <AbsoluteFill style={{zIndex:5,pointerEvents:'none'}}><OffthreadVideo src={staticFile(b.asset)} muted playbackRate={1} style={{width:1920,height:1080,objectFit:'cover'}}/></AbsoluteFill>;
}
export function GeneratedLaunchBridgesV14(){return <>{bridgesV14.map(b=><Sequence key={b.id} from={b.fromFrame} durationInFrames={Math.round(b.sourceDurationSeconds*60)} layout="none"><BridgeLayer b={b}/></Sequence>)}</>;}
