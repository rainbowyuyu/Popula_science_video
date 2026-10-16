from pathlib import Path
p=Path('research/revision-v8/person/preview.mjs')
s=p.read_text(encoding='utf-8-sig').replace('revision-v7/person','revision-v8/person').replace('revision-v7','revision-v8')
s=s.replace("person.root.getObjectByName('V7 connected palm and articulated precision grip').traverse(o=>{if(o.isMesh)","body.traverse(o=>{if(o.isMesh)")
s=s.replace("const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);tri.set", "const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);if(!ids.every(id=>(weights.weights[id]?.handL??0)>.6))continue;tri.set")
s=s.replace("measure.update(o.measurementWeight)","measure.update(o.measurementWeight,true)")
s=s.replace("{id:'stand',action:'stand'", "{id:'hand-close',action:'eat',time:5.2,camera:[.65,.98,.73],target:[.13,.91,.37]},\n {id:'stand',action:'stand'")
p.write_text(s,encoding='utf-8')
