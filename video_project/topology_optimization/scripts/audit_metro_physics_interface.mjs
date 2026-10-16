// Run with: node --experimental-strip-types scripts/audit_metro_physics_interface.mjs
// Read-only numerical interface check; does not render or claim visual inspection.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {MetroWorld} from '../src/metro/World.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(root,'public/metro/physics',n),'utf8'));
const world=Object.create(MetroWorld.prototype);
world.balance=load('balance.json');world.flow=load('flow.json');
const d=load('streamlines.json'),lines=d.snapshots.at(-1).lines;
let minimumPathClearance=Infinity,pointsChecked=0;
for(const line of lines){
 for(let k=0;k<=800;k++){
  const p=world.samplePath(line,k*line.travelTime/800,new T.Vector3());
  if(!p.toArray().every(Number.isFinite))throw Error('Nonfinite interpolated streamline');
  const gap=Math.hypot(Math.max(Math.abs(p.x)-3.35,0),p.z)-.65;
  minimumPathClearance=Math.min(minimumPathClearance,gap);pointsChecked++;
 }
}
const ratioAt1=world.forceScaleForSpeedMultiplier(1),ratioAt2=world.forceScaleForSpeedMultiplier(2);
const row0Z=new T.Vector3(0,-6,0).applyAxisAngle(new T.Vector3(1,0,0),Math.PI/2).z;
const report={scope:'Numerical integration interface only: no browser rendering, no camera-frustum or aesthetics claim',pointsChecked,minimumPathClearance,ratioAt1,ratioAt2,textureRow0ExpectedZ:-6,textureRow0ActualZ:row0Z,
 checks:{streamlinesOutsideNumericalBody:minimumPathClearance>0,forceRatio1:ratioAt1===1,forceRatio2:ratioAt2===4,textureRowOrder:Math.abs(row0Z+6)<1e-12,fieldSampleFinite:Object.values(world.sample(-5,1)).every(Number.isFinite)}};
report.allChecksPass=Object.values(report.checks).every(Boolean);
fs.writeFileSync(path.join(root,'research/metro/physics-render-integration-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.allChecksPass)process.exitCode=1;
