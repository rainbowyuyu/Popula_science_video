import fs from 'node:fs';import * as T from 'three';import {build} from 'esbuild';
await build({entryPoints:['src/V7GripHand.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'research/revision-v8/person/hand-helper.mjs'});
const {poseAtlasFingers}=await import('./hand-helper.mjs');
const rows=JSON.parse(fs.readFileSync('research/revision-v8/person/atlas-hand-points.json'));
const w=new T.Vector3(.25,.911,.008),f=new T.Vector3(.023,-.104,.042).normalize(),b=new T.Vector3(0,0,-1).addScaledVector(f,f.z).normalize(),x=new T.Vector3().crossVectors(f,b).normalize();
const posed=rows.map(r=>{const p=poseAtlasFingers(new T.Vector3(...r.xyz),1,.88).sub(w);return {...r,local:[p.dot(x),p.dot(f),p.dot(b)]}});fs.writeFileSync('research/revision-v8/person/posed-hand-points.json',JSON.stringify(posed));
