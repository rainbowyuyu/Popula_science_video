/** Deterministic local implementation. The bounded Opus request timed out and its
 * incomplete output was not used. Fish displacement is owned by the parent world. */
export type FishRole='observer'|'friend'|'spray';
export type FishRail={weight:number;distance:number;heading:number;headPitch:number};
export type FishEuler=[number,number,number];
export function sampleFishPose(frame:number,fps:number,role:FishRole,rail:FishRail){
  const t=Math.max(0,frame)/fps,offset=role==='friend'?.46:role==='spray'?1.07:0;
  const w=Math.min(1,Math.max(0,rail.weight));
  // Basal oscillation keeps fins alive at rest. The powerful additional swim
  // cycles follow cumulative distance, not wall-clock cadence or frame history.
  const phase=t*.78+rail.distance*(2*Math.PI/3.6)+offset;
  const wave=(lag:number,idle:number,swim:number)=>Math.sin(phase-lag)*(idle+swim*w);
  const rootEuler:FishEuler=[.007*Math.sin(t*.57+offset),0,.012*Math.sin(phase-.35)];
  const headEuler:FishEuler=[rail.headPitch*.48+.006*Math.sin(t*.39),-.010*Math.sin(phase),0];
  const spineEuler:FishEuler[]=[
    [0,wave(0,.012,.026),0],
    [0,wave(.55,.018,.044),0],
    [0,wave(1.10,.023,.064),0],
  ];
  const tailEuler:FishEuler[]=[
    [0,wave(1.55,.029,.079),.006*Math.sin(phase)],
    [0,wave(2.00,.035,.103),0],
    [0,wave(2.45,.042,.134),.009*Math.sin(phase-1.8)],
  ];
  const flap=.095+.075*Math.sin(t*1.34+offset)+.095*w*Math.sin(phase+.3);
  return {heading:rail.heading,rootEuler,headEuler,spineEuler,tailEuler,
    pectoralEuler:{left:[.022*Math.sin(phase),.045*Math.sin(phase+.3),flap] as FishEuler,
      right:[.022*Math.sin(phase),-.045*Math.sin(phase+.3),-flap] as FishEuler},
    dorsalEuler:[0,0,.024*Math.sin(phase-.8)] as FishEuler,
    pelvicEuler:{left:[.022*Math.sin(phase-1),0,.035+.04*Math.sin(t*.9+offset)] as FishEuler,
      right:[.022*Math.sin(phase-1),0,-.035-.04*Math.sin(t*.9+offset)] as FishEuler},
    jawEuler:[.007+.009*Math.sin(t*.83+offset),0,0] as FishEuler,
    swimWeight:w,tailPhase:phase};
}
