/**
 * V11 deterministic skeletal pose sampler for the rainbow-koi guide.
 *
 * The pose is a pure function of frame, rail distance and role. A frame can
 * therefore be rendered or sought in either direction without accumulating
 * state. Low-frequency breath and fin tremor keep the guide alive while it
 * pauses to explain a ray.
 */
export type FishRole='observer'|'friend'|'spray';
export type FishRail={weight:number;distance:number;heading:number;headPitch:number;turnRate?:number;gazeYaw?:number};
export type FishEuler=[number,number,number];

const clamp=(x:number)=>Math.min(1,Math.max(0,x));
const TAU=Math.PI*2;

export type FishPoseV11={
  heading:number;rootEuler:FishEuler;headEuler:FishEuler;
  spineEuler:FishEuler[];tailEuler:FishEuler[];
  pectoralEuler:{left:FishEuler;right:FishEuler};
  pelvicEuler:{left:FishEuler;right:FishEuler};
  dorsalEuler:FishEuler;jawEuler:FishEuler;
  swimWeight:number;tailPhase:number;breathPhase:number;
};

export function sampleFishPose(frame:number,fps:number,role:FishRole,rail:FishRail):FishPoseV11{
  const t=Math.max(0,frame)/Math.max(1,fps);
  const offset=role==='friend'?.71:role==='spray'?1.39:0;
  const weight=clamp(rail.weight);

  // Arc-length phase keeps the tail cadence tied to travel rather than to a
  // camera cut. The second harmonic gives the caudal fan a soft follow-through.
  const phase=rail.distance*(TAU/4.80)+t*.67+offset;
  const breathPhase=t*.61+offset*.31;
  const breath=Math.sin(breathPhase);
  const turn=Math.max(-.85,Math.min(.85,rail.turnRate??0));
  const wave=(lag:number,idle:number,active:number,follow=0)=>
    Math.sin(phase-lag)*(idle+active*weight)+
    follow*Math.sin(phase*.5-lag*.45+.7)*weight;
  const finWave=(lag:number,side:number)=>
    .009*Math.sin(phase-lag)+.020*weight*Math.sin(phase-lag+.8*side)+
    .006*Math.sin(breathPhase*1.7+side*.4);

  const rootEuler:FishEuler=[
    .006*Math.sin(breathPhase*.73)+.003*Math.sin(phase*.5),
    .004*Math.sin(breathPhase*.47),
    -.034*turn+.006*Math.sin(phase-.34)+.002*breath,
  ];
  const headEuler:FishEuler=[
    rail.headPitch*.55+.004*Math.sin(breathPhase*.8),
    .060*turn+(rail.gazeYaw??0)-.006*Math.sin(phase*.72),
    .018*turn+.002*Math.sin(breathPhase*.63),
  ];
  const spineEuler:FishEuler[]=[
    [0,wave(0,.004,.015,.002)-.016*turn,.001*Math.sin(breathPhase)],
    [0,wave(.52,.007,.027,.003)-.025*turn,.002*Math.sin(phase*.5)],
    [0,wave(1.04,.010,.039,.004)-.036*turn,.002*Math.sin(phase*.5+.3)],
  ];
  const tailEuler:FishEuler[]=[
    [0,wave(1.48,.012,.045,.006)-.032*turn,.003*Math.sin(phase)],
    [0,wave(1.94,.014,.059,.008)-.025*turn,.002*Math.sin(phase-.6)],
    [0,wave(2.39,.017,.077,.010)-.019*turn,.003*Math.sin(phase-1.3)],
    [0,wave(2.78,.020,.094,.012)-.013*turn,.004*Math.sin(phase-1.8)],
  ];

  // Opposed pectoral strokes prevent the fins from looking mirrored or rigid.
  const leftFlap=.065+.017*breath+.033*weight*Math.sin(phase+.45)-.022*turn;
  const rightFlap=-.065-.015*breath-.033*weight*Math.sin(phase+.45)-.022*turn;
  const pectoralEuler={
    left:[finWave(.2,-1), .022*Math.sin(phase+.25), leftFlap] as FishEuler,
    right:[finWave(.2,1),-.022*Math.sin(phase+.25), rightFlap] as FishEuler,
  };
  const pelvicBeat=.014*Math.sin(phase-1.1)+.008*Math.sin(breathPhase*1.2);
  const pelvicEuler={
    left:[.010*Math.sin(phase-1),0,.030+pelvicBeat] as FishEuler,
    right:[.010*Math.sin(phase-1.05),0,-.030-pelvicBeat] as FishEuler,
  };
  const dorsal=.012*Math.sin(phase-.84)+.005*Math.sin(breathPhase);
  return {
    heading:rail.heading,
    rootEuler,headEuler,spineEuler,tailEuler,pectoralEuler,pelvicEuler,
    dorsalEuler:[0,0,dorsal] as FishEuler,
    // The jaw is a restrained breathing/mouth cue, never a cartoon snap.
    jawEuler:[.006+.005*Math.sin(breathPhase*1.13)+.002*weight*Math.sin(phase),0,0] as FishEuler,
    swimWeight:weight,tailPhase:phase,breathPhase,
  };
}
