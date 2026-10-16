from pathlib import Path
p=Path('src/V5Measure.ts');s=p.read_text(encoding='utf-8')
s=s.replace("const forearm=source.forearm.clone().slerp(destination.forearm,q);", """const forearm=source.forearm.clone().slerp(destination.forearm,q);
   const forearmSwing=new T.Quaternion().setFromUnitVectors(destination.wrist.clone().sub(destination.elbow).normalize(),source.wrist.clone().sub(source.elbow).normalize()).slerp(new T.Quaternion().setFromUnitVectors(destination.wrist.clone().sub(destination.elbow).normalize(),destination.placedWrist.clone().sub(destination.placedElbow).normalize()),q);
   const localRoll=forearmSwing.clone().invert().multiply(forearm),sourceAxis=destination.wrist.clone().sub(destination.elbow).normalize();
   const rollAngle=2*Math.atan2(V(localRoll.x,localRoll.y,localRoll.z).dot(sourceAxis),localRoll.w);""")
s=s.replace('applyQuaternion(forearm).add(elbow);','applyQuaternion(forearmSwing).add(elbow);')
s=s.replace("return {side:source.side,upper:dualPose(upper,destination.shoulder,shoulder),forearm:dualPose(forearm,destination.elbow,elbow),hand:dualPose(hand,destination.wrist,wrist),grip:","return {side:source.side,destination,shoulder,elbow,wrist,upperQ:upper,forearmSwing,localRoll,rollAngle,upper:dualPose(upper,destination.shoulder,shoulder),forearm:dualPose(forearm,destination.elbow,elbow),hand:dualPose(hand,destination.wrist,wrist),grip:")
s=s.replace("const arm=dualDeform(source,[[rig.upper,up/total],[rig.forearm,fore/total],[rig.hand,hand/total]]);", """const along=T.MathUtils.clamp(original.clone().sub(rig.destination.elbow).dot(rig.destination.wrist.clone().sub(rig.destination.elbow))/rig.destination.elbow.distanceToSquared(rig.destination.wrist),0,1);
     const upperAlong=T.MathUtils.clamp(original.clone().sub(rig.destination.shoulder).dot(rig.destination.elbow.clone().sub(rig.destination.shoulder))/rig.destination.shoulder.distanceToSquared(rig.destination.elbow),0,1);
     const upperQ=rig.upperQ.clone().multiply(new T.Quaternion().setFromAxisAngle(rig.destination.elbow.clone().sub(rig.destination.shoulder).normalize(),rig.rollAngle*.42*q*smooth((upperAlong-.10)/.80)));
     const foreQ=rig.forearmSwing.clone().multiply(new T.Quaternion().slerp(rig.localRoll,.42*q+(1-.42*q)*smooth((along-.02)/.92)));
     const arm=dualDeform(source,[[dualPose(upperQ,rig.destination.shoulder,rig.shoulder),up/total],[dualPose(foreQ,rig.destination.elbow,rig.elbow),fore/total],[rig.hand,hand/total]]);""")
# Smooth the cuff as taut cloth over a conservative linearly tapered envelope.
needle='  // Relax small sampling ridges outward only, preserving the skin clearance.'
insert="""  // The textile sleeve bridges local skin-mesh ridges; it is a smooth cone,
  // not a corrugated copy of each decimated skin section. Keep outward clearance.
  const firstCentre=ringCentres[0].clone(),lastCentre=ringCentres[last].clone();
  for(let k=0;k<ringCentres.length;k++){
   const centre=firstCentre.clone().lerp(lastCentre,k/last),offset=Math.hypot(ringCentres[k].x-centre.x,ringCentres[k].z-centre.z);
   ringCentres[k].copy(centre);radial[k]=radial[k].map(r=>r+offset);
  }
  for(let a=0;a<64;a++){
   const first=radial[0][a],lastRadius=radial[last][a];
   const allowance=Math.max(0,...radial.map((row,k)=>row[a]-T.MathUtils.lerp(first,lastRadius,k/last)));
   for(let k=0;k<=last;k++)radial[k][a]=T.MathUtils.lerp(first,lastRadius,k/last)+allowance;
  }
  // Relax small sampling ridges outward only, preserving the skin clearance."""
assert needle in s;s=s.replace(needle,insert)
p.write_text(s,encoding='utf-8')
