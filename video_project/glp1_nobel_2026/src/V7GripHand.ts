import * as T from 'three';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const q=clamp(x);return q*q*(3-2*q)};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);

/** Articulate the original atlas palm and its five connected fingers about
 * MCP/PIP/DIP landmarks. No substitute mitten, shortened palm or wrist seam. */
export function poseAtlasFingers(point:T.Vector3,side:number,grip:number,dining=0):T.Vector3{
 const wrist=V(side*.250,.911,.008),forward=V(side*.023,-.104,.042).normalize();
 const dorsal=V(0,0,-1).addScaledVector(forward,forward.z).normalize();
 const lateral=V().crossVectors(forward,dorsal).normalize();
 const delta=point.clone().sub(wrist),local=V(delta.dot(lateral)*side,delta.dot(forward),delta.dot(dorsal));
 if(local.y<.025||local.y>.23||Math.abs(local.x)>.082)return point.clone();
 // The atlas hand is already a relaxed open hand.  Grip only adds a
 // restrained, anatomically ordered curl; keeping the MCP/PIP/DIP sums below
 // about 1 radian prevents the old long, claw-like fingers.  These centrelines
 // were measured from the handL/handR weighted vertices in body.glb.
 const q=clamp(grip),meal=clamp(dining),out=local.clone();
 const thumb=local.clone();
 {
  // The short lateral column is the thumb.  Two small rotations bring its pad
  // toward the fork shaft at (x=.006, z=-.038), while preserving atlas surface
  // continuity at the metacarpal.
  const thumbRegion=smooth((local.x-.028)/.014)*smooth((local.y-.055)/.020)*(1-smooth((local.y-.180)/.022));
  const base=V(.031,.082,-.004),pad=V(.030,.125,-.006);
  thumb.sub(base).applyAxisAngle(V(0,0,1),(.25+.08*meal)*q*thumbRegion).add(base);
  thumb.sub(pad).applyAxisAngle(V(0,1,0),(.30+.08*meal)*q*smooth((local.y-.095)/.028)*thumbRegion).add(pad);
 }
 {
  // Pinky→index centrelines and joint heights follow the measured atlas mesh.
  // The modest slopes keep the fingers parallel instead of fanning outward.
  const fingers=[
   // The atlas hand starts slightly open.  A dining grip should close as a
   // shallow, parallel arc around the shaft: the little finger has the most
   // lateral sweep, while the index stays near the thumb.  The old -0.18
   // pinky slope made the four digits fan apart and read like a claw in the
   // wide shot, so the slopes are deliberately restrained here.
   {x:-.045,y:.101,dx:-.105,pip:.132,dip:.158,a:[.22,.42,.25]},
   {x:-.026,y:.108,dx:-.018,pip:.145,dip:.173,a:[.20,.39,.23]},
   {x:-.006,y:.114,dx:-.004,pip:.153,dip:.184,a:[.18,.36,.22]},
   {x:.021,y:.112,dx:.004,pip:.151,dip:.181,a:[.16,.34,.20]}
  ];
  const sum=V();let total=0;
  // Wider in the palm for a smooth web; tighter at the separated fingers so
  // each digit keeps its own thickness and does not borrow a neighbour's arc.
  const upper=smooth((local.y-.105)/.035),sigma=.010-.004*upper;
  for(const finger of fingers){
   const centre=finger.x+finger.dx*Math.max(0,local.y-finger.y);
   const distance=local.x-centre,weight=Math.exp(-distance*distance/(2*sigma*sigma));
   if(weight<1e-8)continue;
   const posed=local.clone(),axis=V(1,-finger.dx,0).normalize();
   for(const joint of [{y:finger.dip,a:finger.a[2]},{y:finger.pip,a:finger.a[1]},{y:finger.y,a:finger.a[0]}]){
    const pivot=V(finger.x+finger.dx*(joint.y-finger.y),joint.y,-.003);
    // A broad smoothstep across each phalanx keeps neighbouring atlas
    // triangles at nearly the same arc length (no pinched knuckles).
    const influence=smooth((local.y-joint.y+.008)/.022);
    posed.sub(pivot).applyAxisAngle(axis,-joint.a*q*influence).add(pivot);
   }
   // During dining the index eases a few degrees toward the shaft.  Other
   // fingers remain parallel and lightly curled.
   if(finger===fingers[3]){
    const pivot=V(finger.x,finger.y,-.003);
    posed.sub(pivot).applyAxisAngle(V(0,0,1),(.075+.025*meal)*q*smooth((local.y-finger.y+.005)/.022)).add(pivot);
   }
   sum.addScaledVector(posed,weight);total+=weight;
  }
  if(total>1e-8)out.copy(sum.multiplyScalar(1/total));
 }
 // Blend only the anatomically plausible thumb envelope back over the four
 // finger result; the palm and wrist never get a separate primitive seam.
 const thumbWeight=smooth((local.x-.028)/.016)*smooth((local.y-.050)/.020)*(1-smooth((local.y-.180)/.022));
 out.lerp(thumb,thumbWeight);
 return wrist.clone().addScaledVector(lateral,out.x*side).addScaledVector(forward,out.y).addScaledVector(dorsal,out.z);
}

/** Forearm axial quarter-turn takes anatomical palms-forward toward palms-in. */
export function relaxedForearmRoll(side:number):T.Quaternion{
 return new T.Quaternion().setFromAxisAngle(V(side*.025,-.197,.044).normalize(),side*Math.PI*.46);
}
