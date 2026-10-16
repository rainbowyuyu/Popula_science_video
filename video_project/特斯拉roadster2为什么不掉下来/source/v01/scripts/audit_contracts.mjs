import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const frames=JSON.parse(fs.readFileSync(path.join(root,'source/v01/physics/preview-frames-v3.json')));
const mesh=JSON.parse(fs.readFileSync(path.join(root,'assets/v01/teaching-car.mesh.json')));
const rx=(p,a)=>[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)];
const centre=o=>[0,1,2].map(k=>{const p=o.positions.filter((_,i)=>i%3===k);return (Math.min(...p)+Math.max(...p))/2});
const pods=mesh.objects.filter(o=>o.name.startsWith('Teaching nozzle pod')).map(centre);
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const audits=[];
const add=(id,pass,evidence)=>audits.push({id,pass,evidence});
add('central nozzle exists in actual mesh',pods.some(p=>dist(p,[0,0,-.33])<.01),pods);
const hover=frames[0].arrows.find(a=>a.label==='推力 T');
add('hover origin includes centre-of-mass translation',dist(hover.origin,[0,0,frames[0].c[2]-.33])<1e-8,{actual:hover.origin,expected:[0,0,-.23]});
const mismatch=frames.filter(f=>f.scene==='couple').filter(f=>{
 const label=f.u<.18?'accelerate':f.u<.82?'coast':'brake';const actual=f.rollRate>0?'accelerate':f.rollRate<0?'brake':'coast';return actual!==label;
});
add('phase label matches actual nozzle activation',!mismatch.length,{mismatchFrames:mismatch.map(f=>f.frame)});
// Offline ASR: fixed phrase '推力只剩横向' occupies 3.70--4.74 s in its clean source.
const fixed=frames.filter(f=>f.scene==='fixed'&&f.local>=Math.floor(3.7*30)&&f.local<=Math.ceil(4.74*30));
add('90 degree hold spans spoken lateral-only explanation',fixed.every(f=>Math.abs(f.phi-Math.PI/2)<1e-8),{frames:fixed.map(f=>f.frame),lastAngle:fixed.at(-1).phi*180/Math.PI});
add('no plume while propulsion off',frames.filter(f=>f.scene==='ballistic').every(f=>f.plumes.length===0),{unexpectedPlumeFrames:frames.filter(f=>f.scene==='ballistic'&&f.plumes.length).length});
const report={target:'v02a / preview-frames-v3',scope:'independent cross-check against mesh and raw ASR words, not self-repeated generator equations',audits,failures:audits.filter(x=>!x.pass).length};
fs.mkdirSync(path.join(root,'work/v01/crosscheck'),{recursive:true});fs.writeFileSync(path.join(root,'work/v01/crosscheck/baseline-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
