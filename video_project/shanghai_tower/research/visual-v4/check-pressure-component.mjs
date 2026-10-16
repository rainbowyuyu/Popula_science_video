/** Synthetic analytic fixtures only. Never imported into the film or solver. */
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as T from 'three';

const root=process.cwd(),tmp=path.join(root,'tmp','pressure-component-check');await fs.mkdir(tmp,{recursive:true});
const modulePath=path.join(tmp,'component.mjs');
await build({entryPoints:[path.join(root,'src','ComputedPressureVisualization.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:modulePath,logLevel:'silent'});
const {ComputedPressureVisualization}=await import(pathToFileURL(modulePath).href+'?'+Date.now());
const scene=new T.Scene();
const base={coordinates:'metres, Three.js XYZ, Y up',normalConvention:'body-outward',points_m:[[0,0,0],[2,0,0],[0,2,0],[2,2,0]],triangles:[[0,1,2],[1,3,2]],cp:[-1,1,-1,1],outward_normals:[[0,0,1],[0,0,1],[0,0,1],[0,0,1]],provenance:{solver:'TEST ONLY: analytic plane; not CFD'}};
const p=new ComputedPressureVisualization(scene,base,{geometryUnitsPerMetre:1,maxProjectionDistanceM:.1,cpRange:[-1,1]});
let interpolationMaxError=0,distanceMaxError=0;
for(let ix=0;ix<=20;ix++)for(let iy=0;iy<=20;iy++){
 const x=ix/10,y=iy/10,s=p.sampleSurface(new T.Vector3(x,y,.025));
 interpolationMaxError=Math.max(interpolationMaxError,Math.abs(s.cp-(x-1)));
 distanceMaxError=Math.max(distanceMaxError,Math.abs(s.distanceM-.025));
 assert.ok(s.normal.distanceTo(new T.Vector3(0,0,1))<1e-12);
}
assert.ok(interpolationMaxError<1e-12);assert.ok(distanceMaxError<1e-12);
const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([.25,.25,.025,1.75,.25,.025,.25,1.75,.025,1.75,1.75,.025],3));
const physicsColor=new T.Float32BufferAttribute([.1,.2,.3,.4,.5,.6,.7,.8,.9,.2,.4,.6],3);geometry.setAttribute('color',physicsColor);
const material=new T.MeshPhysicalMaterial({color:'#123456',vertexColors:true,opacity:.71,transparent:true});
const originalMaterialColor=material.color.clone(),originalColorArray=Array.from(physicsColor.array),originalCompile=material.onBeforeCompile;
const report=p.bind('ENVELOPE_TEST_GLASS',geometry);assert.equal(report.coverage,1);assert.ok(report.maxDistanceM<.026);
const state={n:30,u:0,time:1,frame:30};
p.updateMaterial(geometry,material,state);
const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};material.onBeforeCompile(shader,{});
assert.equal(shader.uniforms.computedPressureWeight.value,1);
assert.ok(shader.vertexShader.includes('computedPressureRgba'));assert.ok(shader.fragmentShader.includes('diffuseColor.rgb = mix'));
assert.equal(geometry.getAttribute('color'),physicsColor);assert.deepEqual(Array.from(physicsColor.array),originalColorArray);assert.ok(material.color.equals(originalMaterialColor));
p.update(state);assert.ok(p.root.children.length>=2);
const directions=[];
for(const glyph of p.root.children){
 const direction=new T.Vector3(0,1,0).applyQuaternion(glyph.quaternion),color=glyph.children[0].material.color;
 const positive=color.equals(new T.Color('#d7653e'));directions.push({positive,direction:direction.toArray()});
 assert.ok(positive?direction.z<-.999:direction.z>.999,'Cp sign must set inward push / outward suction');
}
assert.ok(directions.some(d=>d.positive)&&directions.some(d=>!d.positive));
// A subsequent structural result can change the live color buffer while the
// pressure shader is active. restore must preserve that newer result exactly.
physicsColor.setXYZ(0,.91,.81,.71);p.restore();
assert.equal(shader.uniforms.computedPressureWeight.value,0);assert.equal(geometry.getAttribute('color'),physicsColor);assert.ok(Math.abs(physicsColor.getX(0)-.91)<1e-6);assert.ok(material.color.equals(originalMaterialColor));assert.equal(material.opacity,.71);assert.equal(material.vertexColors,true);
assert.throws(()=>p.bind('UNRELATED_INTERIOR',geometry.clone()),/only binds exterior/);
const distant=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,8,1,0,8,0,1,8],3));assert.throws(()=>p.bind('ENVELOPE_UNREGISTERED_GLASS',distant),/registration failed/);assert.equal(distant.getAttribute('computedPressureRgba'),undefined);
const noData=new ComputedPressureVisualization(scene,null);assert.equal(noData.bind('ENVELOPE_TEST_GLASS',geometry),null);noData.update(state);assert.equal(noData.root.visible,false);noData.dispose();
assert.throws(()=>new ComputedPressureVisualization(scene,{...base,coordinates:'SU2 original axes'}),/exactly one/);
assert.throws(()=>new ComputedPressureVisualization(scene,{...base,normalConvention:'fluid-domain-outward'}),/body-outward/);
assert.throws(()=>new ComputedPressureVisualization(scene,{...base,outward_normals:undefined}),/outward_normals/);
p.dispose();assert.equal(material.onBeforeCompile,originalCompile);assert.equal(geometry.getAttribute('computedPressureRgba'),undefined);assert.equal(geometry.getAttribute('color'),physicsColor);
const result={testData:'Synthetic analytic fixture, not CFD and not a film asset',samples:441,interpolationMaxError,distanceMaxError,mapping:report,arrowDirections:directions,physicsColorsPreserved:true,missingDataInert:true,outOfToleranceRejected:true,passed:true};
await fs.writeFile(path.join(root,'research','visual-v4','pressure-component-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
