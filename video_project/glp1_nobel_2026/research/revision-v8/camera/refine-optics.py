from pathlib import Path
p=Path('src/V5World.ts');s=p.read_text(encoding='utf-8')
s=s.replace(' private pancreaticField=new T.Group();',' private pancreaticField=new T.Group();\n private arterySectionCue=new T.Group();\n private arteryWindow={value:0};')
s=s.replace('this.root.add(this.cardio.root,this.pancreaticField,','this.root.add(this.arterySectionCue,this.cardio.root,this.pancreaticField,')
s=s.replace('p.x+=12e-6*Math.sin(i*7.31);p.y+=11e-6*Math.cos(i*9.27);p.z-=12e-6+28e-6*(.5+.5*Math.sin(i*3.81));','p.x+=28e-6*Math.sin(i*7.31);p.y+=25e-6*Math.cos(i*9.27);p.z-=12e-6+55e-6*(.5+.5*Math.sin(i*3.81));scale.multiply(V(.83+.27*(.5+.5*Math.sin(i*5.2)),.85+.28*(.5+.5*Math.cos(i*3.2)),1));')
s=s.replace("visibility(this.tissueContext,.48*wp*closer(d,.0012,.006)*(1-closer(d,150e-6,450e-6)));","visibility(this.tissueContext,.48*wp*closer(d,.0012,.0038)*(1-closer(d,150e-6,450e-6)));")
needle="   this.cardio.arteryRoot.userData.registration="
a=s.index(needle);b=s.index('\n',a)
s=s[:b]+'''
   const arterialTriangles=atlasTriangles(this.organs.aorta),sectionPoints:number[][]=[];
   for(const axial of [-.019,.019]){
    const sectionCenter=arterialPoint.clone().addScaledVector(tangent,axial),points:T.Vector3[]=[];
    for(let j=0;j<64;j++){
     const theta=j/64*Math.PI*2,direction=transverse.clone().multiplyScalar(Math.cos(theta)).addScaledVector(anterior,Math.sin(theta));
     const crossing=triangleCrossings(arterialTriangles,sectionCenter,direction)[0];if(crossing)points.push(crossing.point.clone().addScaledVector(direction,.00005));
    }
    if(points.length>48){const ring=new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#487c78',transparent:true,opacity:.7,depthWrite:false}));ring.name='actual-atlas-aortic-section-outline';this.arterySectionCue.add(ring);sectionPoints.push(...points.map(p=>p.toArray()));}
   }
   this.arterySectionCue.userData={annotation:true,source:'Ray intersections with actual atlas aorta at the two local section planes',sampledWorldPoints:sectionPoints};
   // Open the same axial region on the true source vessel. The continuous
   // exterior remains visible around the representative histological cutaway.
   this.organs.aorta.traverse(node=>{if(!(node instanceof T.Mesh))return;for(const m of Array.isArray(node.material)?node.material:[node.material]){
    m.onBeforeCompile=shader=>{shader.uniforms.sectionAmount=this.arteryWindow;shader.uniforms.sectionCenter={value:arterialPoint};shader.uniforms.sectionAxis={value:tangent};
     shader.vertexShader='varying vec3 vAtlasSection;\\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\\nvAtlasSection=(modelMatrix*vec4(transformed,1.0)).xyz;');
     shader.fragmentShader='varying vec3 vAtlasSection; uniform float sectionAmount; uniform vec3 sectionCenter; uniform vec3 sectionAxis;\\n'+shader.fragmentShader.replace('#include <opaque_fragment>','float axial=abs(dot(vAtlasSection-sectionCenter,sectionAxis)); diffuseColor.a*=1.0-sectionAmount*(1.0-smoothstep(0.014,0.024,axial));\\n#include <opaque_fragment>');
    };m.customProgramCacheKey=()=> 'v8-anatomical-aortic-window';m.needsUpdate=true;
   }});
   const plasmaRoute=this.routes?.routes.find(r=>r.id==='inferior_vena_cava');
   if(plasmaRoute){this.anchors.drug=new T.Vector3(...plasmaRoute.points[Math.floor(plasmaRoute.points.length*.60)]);this.drug.root.position.copy(this.anchors.drug);this.drug.root.userData.location={sourceRoute:plasmaRoute.id,representation:'Fixed plasma-location teaching schematic, not a measured molecule or a pharmacokinetic simulation'};}
''' +s[b:]
s=s.replace("if(name==='aorta')alpha*=(1-arteryFamily*closer(d,.045,.16))*(1-.995*atrialWeight*closer(d,.18,.55));","if(name==='aorta')alpha*=(1-.97*arteryFamily*closer(d,.036,.12))*(1-.995*atrialWeight*closer(d,.18,.55));")
s=s.replace('  visibility(this.pancreaticField,','  this.arteryWindow.value=arteryFamily*closer(d,.055,.20);\n  visibility(this.arterySectionCue,arteryFamily*near(\'artery\',4)*closer(d,.20,.48)*(1-closer(d,.045,.10))*.7);\n  visibility(this.pancreaticField,')
s=s.replace("  const drugProgress=drugIndex<0?0:clamp((drugIndex+s.clipProgress)/Math.max(1,drugClips.length));","  const drugProgress=s.clip.id==='h026'?.5*clamp((s.clipProgress-.35)/.65):s.clip.id==='h027'?.5+.5*s.clipProgress:drugIndex<0?0:clamp((drugIndex+s.clipProgress)/Math.max(1,drugClips.length));")
p.write_text(s,encoding='utf-8')
p=Path('src/V7Director.ts');s=p.read_text(encoding='utf-8');a=s.index(' "h026": {');b=s.index(' "h028": {',a)
s=s[:a]+''' "h026": {"group":"glp1-peptide-engineering","view":"drug","anchor":"drug","distance":17e-9,"az":.10,"el":.14,"parent":"veins"},
 "h027": {"group":"glp1-peptide-engineering","view":"drug","anchor":"drug","distance":17e-9,"az":.10,"el":.14,"parent":"veins"},
'''+s[b:];p.write_text(s,encoding='utf-8')
p=Path('src/V5CameraPath.ts');s=p.read_text(encoding='utf-8');s=s.replace('const end=nc.start+nc.duration*(measurementExit?.68:',"const end=nc.start+nc.duration*(nc.id==='h026'?.34:measurementExit?.68:");p.write_text(s,encoding='utf-8')
