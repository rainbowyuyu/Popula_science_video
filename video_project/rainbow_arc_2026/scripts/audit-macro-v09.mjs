import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const root=process.cwd(),scratch=path.join(root,'work/macro-audit-v09');fs.mkdirSync(scratch,{recursive:true});
const outfile=path.join(scratch,'macro-check.mjs');
await build({stdin:{contents:`export {MacroLookV09} from './src/MacroLookV09';export {SPECTRUM,findPrimaryExtremum,tracePrimary,traceSecondary} from './src/optics';`,resolveDir:root,sourcefile:'macro-check.ts'},outfile,bundle:true,format:'esm',platform:'node',external:['three']});
const {MacroLookV09,SPECTRUM,findPrimaryExtremum,tracePrimary,traceSecondary}=await import('file:///'+outfile.replaceAll('\\','/'));
const impact=findPrimaryExtremum(SPECTRUM[0].refractiveIndex,300).impactParameter;
const inputs=SPECTRUM.map(s=>{const p=tracePrimary(impact,s.refractiveIndex);return {points:p.points.map(q=>q.clone().multiplyScalar(1.6)),color:s.color,role:'primary'};});
const before=JSON.stringify(inputs.map(p=>p.points.map(q=>q.toArray())));
const body=new T.Mesh(new T.SphereGeometry(1.6,24,16),new T.MeshPhysicalMaterial()),rim=new T.Mesh(new T.SphereGeometry(1.61,24,16),new T.MeshBasicMaterial());
const look=new MacroLookV09(body,rim,inputs),camera=new T.PerspectiveCamera(45,16/9,.03,200);camera.position.set(0,4.6,9.8);
const sample=()=>JSON.stringify({opacity:body.material.opacity,roughness:body.material.roughness,shell:look.group.children[0].material.uniforms.uOpacity.value,fields:look.spectrum.group.children.map(m=>[m.visible,Object.fromEntries(Object.entries(m.material.uniforms).map(([k,v])=>[k,v.value]))])});
look.update(1234,.75,.83,0,0,.8,camera,.6);const a=sample();look.update(8000,1,0,1,1,1,camera,0);look.update(1234,.75,.83,0,0,.8,camera,.6);
if(a!==sample())throw Error('Nondeterministic seek');
if(before!==JSON.stringify(inputs.map(p=>p.points.map(q=>q.toArray()))))throw Error('Input vertices mutated');
let maxEndpointError=0;
for(const mesh of look.spectrum.group.children){
  const segment=Number(mesh.name.split('-').at(-1)),position=mesh.geometry.getAttribute('position');
  for(const [row,source] of [[0,inputs[0]],[48,inputs.at(-1)]])for(const [column,point] of [[0,source.points[segment]],[16,source.points[segment+1]]]){
    const j=row*17+column,q=new T.Vector3().fromBufferAttribute(position,j);maxEndpointError=Math.max(maxEndpointError,q.distanceTo(point));
  }
  for(let i=0;i<position.count;i++)if(!Number.isFinite(position.getX(i)+position.getY(i)+position.getZ(i)))throw Error('Nonfinite mesh vertex');
}
if(maxEndpointError>2e-6)throw Error('A spectral field left its supplied Snell boundaries');
const b=fs.readFileSync('public/assets_v08/macro/spherical_raindrop_v08.glb');
const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');let radiusError=0;
g.scene.updateMatrixWorld(true);g.scene.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)radiusError=Math.max(radiusError,Math.abs(new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).length()-1));});
if(radiusError>2e-6)throw Error('Blender drop interface is not exactly spherical');
look.dispose();look.dispose();
const report={deterministicSeek:true,inputVerticesUnchanged:true,finiteVertices:true,maxEndpointError,blenderUnitSphereRadiusError:radiusError,shellRadius:1.605,bodyIor:look.waterMaterial.ior,disposeIdempotent:true,illustration:'Faint spectral sheet linearly connects exact calculated paths; alpha is not measured optical intensity',opusCodeIntegrated:false};
fs.mkdirSync('research/qa',{recursive:true});fs.writeFileSync('research/qa/macro-v09-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
