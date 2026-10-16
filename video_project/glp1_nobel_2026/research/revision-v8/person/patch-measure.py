from pathlib import Path
p=Path('src/V5Person.ts');s=p.read_text(encoding='utf-8')
s=s.replace('function diningHandRotation(', 'export function diningHandRotation(').replace('function dualPose(', 'export function dualPose(').replace('function dualDeform(', 'export function dualDeform(')
needle='  this.syncWardrobeToSkin();\n }\n}'
insert="""  const armOffset=V(0,-.45*seated,chairForward);
  this.body.userData.v8Arms=[leftPose,rightPose].map((r,index)=>({side:index===0?1:-1,shoulder:r.s.clone().add(armOffset),elbow:r.pe.clone().add(armOffset),wrist:r.pw.clone().add(armOffset),upper:r.upper.clone(),forearm:r.forearm.clone().multiply(new T.Quaternion().slerp(relaxedForearmRoll(index===0?1:-1),1-sitWeight).slerp(index===0?leftLocalRoll:rightLocalRoll,eatWeight)),hand:r.hand.clone(),grip:.10+.78*eatWeight*(index===0?1:.12)}));
  this.syncWardrobeToSkin();
 }
}"""
assert needle in s;s=s.replace(needle,insert)
p.write_text(s,encoding='utf-8')
p=Path('src/V5Measure.ts');s=p.read_text(encoding='utf-8-sig')
s=s.replace("import skinRig from './V5PersonWeights.json';", "import skinRig from './V5PersonWeights.json';\nimport {diningHandRotation,dualPose,dualDeform} from './V5Person';\nimport {poseAtlasFingers} from './V7GripHand';")
s=s.replace('  placedElbow=shoulder.clone().addScaledVector(V(-.051,-.292,.070).normalize(),upperLength);\n  forearmDirection=V(.105,-.126,.142).normalize();handDirection=V(.12,-.07,.990).normalize();', """  const target=V(-.145,1.025,.235),d=target.clone().sub(shoulder),length=d.length();d.normalize();
  const along=(upperLength**2-forearmLength**2+length**2)/(2*length),height=Math.sqrt(Math.max(0,upperLength**2-along**2));
  const pole=V(-.25,-.70,-.1).addScaledVector(d,-V(-.25,-.70,-.1).dot(d)).normalize();
  placedElbow=shoulder.clone().addScaledVector(d,along).addScaledVector(pole,height);
  forearmDirection=target.clone().sub(placedElbow).normalize();handDirection=V(.025,-.09,.995).normalize();""")
s=s.replace('hand:new T.Quaternion().setFromUnitVectors(V(side*.023,-.104,.042).normalize(),handDirection)', "hand:side>0?new T.Quaternion().setFromUnitVectors(V(side*.023,-.104,.042).normalize(),handDirection):diningHandRotation(side,handDirection)")
s=s.replace(' constructor(body:T.Group){',' constructor(private body:T.Group){')
s=s.replace(' private pose(p:T.Vector3,vertexIndex?:number){',' private pose(p:T.Vector3,vertexIndex?:number){\n  if(vertexIndex!==undefined){const row=(skinRig.weights as Record<string,number>[])[vertexIndex]??{};if((row[p.x>0?\'handL\':\'handR\']??0)>.5)p=poseAtlasFingers(p,p.x>0?1:-1,.09)}')
needle='  for(const g of this.geometries){\n   const p=g.geometry.getAttribute(\'position\'),n=g.geometry.getAttribute(\'normal\');'
insert="""  const poseSource=this.body.userData.v8Arms as {side:number;shoulder:T.Vector3;elbow:T.Vector3;wrist:T.Vector3;upper:T.Quaternion;forearm:T.Quaternion;hand:T.Quaternion;grip:number}[]|undefined;
  const blendedArms=blendFromCurrent&&poseSource?poseSource.map(source=>{
   const destination=source.side>0?this.arms.right:this.arms.left;
   const shoulder=source.shoulder.clone().lerp(destination.shoulder.clone().add(V(0,-.45,0)),q);
   const upper=source.upper.clone().slerp(destination.upper,q);
   const forearm=source.forearm.clone().slerp(destination.forearm,q);
   const hand=source.hand.clone().slerp(destination.hand,q);
   const elbow=destination.elbow.clone().sub(destination.shoulder).applyQuaternion(upper).add(shoulder);
   const wrist=destination.wrist.clone().sub(destination.elbow).applyQuaternion(forearm).add(elbow);
   return {side:source.side,upper:dualPose(upper,destination.shoulder,shoulder),forearm:dualPose(forearm,destination.elbow,elbow),hand:dualPose(hand,destination.wrist,wrist),grip:T.MathUtils.lerp(source.grip,.09,q)};
  }):[];
  for(const g of this.geometries){
   const p=g.geometry.getAttribute('position'),n=g.geometry.getAttribute('normal');"""
assert needle in s;s=s.replace(needle,insert)
needle='   p.needsUpdate=true;n.needsUpdate=true;g.geometry.computeBoundingSphere();'
insert="""   if(blendedArms.length){
    const weights=skinRig.weights as Record<string,number>[];
    for(let i=0;i<p.count;i++){
     const original=V().fromArray(g.standing,i*3),row=weights[i]??{},rig=blendedArms[original.x>0?0:1],tag=original.x>0?'L':'R';
     const up=row['upper'+tag]??0,fore=row['forearm'+tag]??0,hand=row['hand'+tag]??0,total=up+fore+hand;if(total<.00001)continue;
     const source=hand>.5?poseAtlasFingers(original,rig.side,rig.grip):original;
     const arm=dualDeform(source,[[rig.upper,up/total],[rig.forearm,fore/total],[rig.hand,hand/total]]);
     const current=V().fromBufferAttribute(p,i).lerp(arm,Math.min(1,total));p.setXYZ(i,current.x,current.y,current.z);
    }
    g.geometry.computeVertexNormals();
   }
   p.needsUpdate=true;n.needsUpdate=true;g.geometry.computeBoundingSphere();"""
assert needle in s;s=s.replace(needle,insert)
p.write_text(s,encoding='utf-8')
