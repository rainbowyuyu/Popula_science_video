from pathlib import Path
p=Path('src/V5Measure.ts');s=p.read_text(encoding='utf-8')
a=s.index('   const forearm=source.forearm.clone().slerp(destination.forearm,q);');b=s.index('   const elbow=',a)
s=s[:a]+"""   const sourceAxis=destination.wrist.clone().sub(destination.elbow).normalize();
   const sourceSwing=new T.Quaternion().setFromUnitVectors(sourceAxis,source.wrist.clone().sub(source.elbow).normalize());
   const destinationSwing=new T.Quaternion().setFromUnitVectors(sourceAxis,destination.placedWrist.clone().sub(destination.placedElbow).normalize());
   const sourceRoll=sourceSwing.clone().invert().multiply(source.forearm),destinationRoll=destinationSwing.clone().invert().multiply(destination.forearm);
   const forearmSwing=sourceSwing.clone().slerp(destinationSwing,q),localRoll=sourceRoll.clone().slerp(destinationRoll,q);
   const forearm=forearmSwing.clone().multiply(localRoll);
   const rollAngle=2*Math.atan2(V(localRoll.x,localRoll.y,localRoll.z).dot(sourceAxis),localRoll.w);
   const sourceWristRotation=source.forearm.clone().invert().multiply(source.hand),destinationWristRotation=destination.forearm.clone().invert().multiply(destination.hand);
   const hand=forearm.clone().multiply(sourceWristRotation.slerp(destinationWristRotation,q));
"""+s[b:]
a=s.index('  // The textile sleeve bridges');b=s.index('  // Relax small sampling ridges outward only',a)
s=s[:a]+s[b:]
s=s.replace('for(let pass=0;pass<2;pass++){','for(let pass=0;pass<5;pass++){')
p.write_text(s,encoding='utf-8')
