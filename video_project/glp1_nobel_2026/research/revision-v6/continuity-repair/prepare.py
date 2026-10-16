from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
world=(HERE/'V5World.baseline.ts').read_text(encoding='utf-8')
handoff=(HERE/'V5HandoffContext.baseline.ts').read_text(encoding='utf-8')
old="  this.bloodExitWeight=this.bloodWeight;"
new="""  // h042 is a lipoprotein view through the camera's semantic override,
  // although the narration timeline calls its broad organ 'liver'. Restore
  // the same fixed blood-context field during this bounded return only.
  this.bloodWeight=Math.max(this.bloodWeight,gate(frame,12070,12195,25));
  this.bloodExitWeight=this.bloodWeight;"""
assert handoff.count(old)==1
handoff=handoff.replace(old,new)
old="  // Atlas vessel tubes and surface highlights are centimetre context."
new="""  // The reverse platelet-to-artery hand-off must expose its existing parent
  // before the 65 micrometre tissue patch becomes unreadably small. Only
  // optical opacity is bridged; position, dimensions and camera stay fixed.
  const clotExitBridge=smooth((s.frame-20430)/20)*(1-smooth((s.frame-20510)/25));
  if(clotExitBridge>0){
   const parentAlpha=.12*clotExitBridge*(1-closer(d,.00020,.00070));
   if(parentAlpha>0){
    this.cardio.arteryRoot.visible=true;
    for(const name of ['aggregated-lipid-pool','fibrous-cap','contiguous-platelet-fibrin-clot'])this.cardio.root.getObjectByName(name)?.traverse(object=>{
     if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.opacity=Math.max(material.opacity,(material.userData.baseAlpha??1)*parentAlpha);
    });
   }
   const tissue=this.mechanisms.clot.children[0];
   const childAlpha=.85*clotExitBridge*closer(d,.00070,.0020)*near('clotDetail',5);
   if(tissue instanceof T.Mesh&&childAlpha>0){
    this.mechanisms.clot.visible=true;
    for(const material of Array.isArray(tissue.material)?tissue.material:[tissue.material])material.opacity=Math.max(material.opacity,(material.userData.baseOpacity??.46)*childAlpha);
   }
  }
  // Atlas vessel tubes and surface highlights are centimetre context."""
assert world.count(old)==1
world=world.replace(old,new)
(HERE/'V5World.ts').write_text(world,encoding='utf-8')
(HERE/'V5HandoffContext.ts').write_text(handoff,encoding='utf-8')
manifest={'installed':False,'scope':'Bounded opacity-only continuity candidates; frozen camera, geometry size, timeline and audio','frameSupport':[[12071,12194],[20431,20534]],'changedFiles':[{ 'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':sha(p),'baselineSHA256':sha(HERE/(p.stem+'.baseline.ts'))} for p in [HERE/'V5World.ts',HERE/'V5HandoffContext.ts']]}
(HERE/'candidate-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
