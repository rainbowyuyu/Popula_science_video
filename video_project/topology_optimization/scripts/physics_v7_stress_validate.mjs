/** Runs the actual TypeScript module against native results and analytic signs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/episode3v7/physics');
const sourcePath=path.join(root,'src/episode3v7/StressField.ts');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=fs.readFileSync(sourcePath,'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,strict:true}});
const exports={};vm.runInNewContext(compiled.outputText,{exports},{filename:sourcePath});
const {prepareCoordinate,sampleSigned,sampleEnvelope}=exports;
const contractPath=path.join(root,'research/episode3v7/frame-contract.json');
const model=read(contractPath),data=read(path.join(out,'static-cases.json'));
const probes=read(path.join(out,'stress-field-probes.json'));
const nodes=new Map(model.nodes.map(n=>[n.id,n.xyz]));
const members=new Map(model.members.map(m=>[m.id,m]));
const errors=[];let fiberSections=0,fiberValues=0,envelopeMidpoints=0;
let maxFiberAbsoluteError=0,maxFiberRelativeError=0,maxCoordinateError=0,maxEnvelopeError=0;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l)};
const axes=(m,a,b)=>{
 const x=unit(b.map((v,i)=>v-a[i]));let roll=m.roll_vec??[0,0,1];
 if(Math.hypot(...cross(x,roll))<1e-8)roll=[0,1,0];
 const y=unit(cross(roll,x));return [x,y,unit(cross(x,y))];
};
const position=(a,b,localAxes,s,y,z)=>{
 const p=a.map((v,i)=>v+s*(b[i]-v)+y*localAxes[1][i]+z*localAxes[2][i]);
 return [p[0],p[2],-p[1]];
};
const fail=(message,context)=>{if(errors.length<30)errors.push({message,...context})};
if(data.provenance.input_sha256!==sha(contractPath))fail('wrong physics input hash',{});

// Independent saved section extrema were computed during the native solve.
// Evaluate the actual TS fiber function at all four real rectangular corners
// and demand that its min/max reproduce every saved section in every case.
for(const [caseName,entry] of Object.entries(data.cases)){
 const frame=entry.response;
 for(const [partId,part] of Object.entries(frame.members))for(const element of part.elementResults){
  const m=members.get(element.elementID),a=nodes.get(m.nodes[0]),b=nodes.get(m.nodes[1]);
  const localAxes=axes(m,a,b),width=m.section.b,height=m.section.h;
  for(const section of element.sectionSamples){
   const stresses=[];
   for(const sy of [-1,1])for(const sz of [-1,1]){
    const y=sy*width/2,z=sz*height/2;
    const coord=prepareCoordinate(m,[a,b],position(a,b,localAxes,section.s,y,z));
    const value=sampleSigned(frame,coord);
    maxCoordinateError=Math.max(maxCoordinateError,Math.abs(coord.s-section.s),Math.abs(coord.localY-y),Math.abs(coord.localZ-z));
    if(!Number.isFinite(value)){fail('undefined/nonfinite native fiber',{caseName,partId,element:element.elementID});continue}
    stresses.push(value);fiberValues++;
    const env=sampleEnvelope(frame,coord),expectedEnv=Math.max(Math.abs(section.normalMinPa),Math.abs(section.normalMaxPa));
    maxEnvelopeError=Math.max(maxEnvelopeError,Math.abs(env-expectedEnv));
   }
   const actual=[Math.min(...stresses),Math.max(...stresses)],expected=[section.normalMinPa,section.normalMaxPa];
   const abs=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i]))),scale=Math.max(1,...expected.map(Math.abs));
   maxFiberAbsoluteError=Math.max(maxFiberAbsoluteError,abs);maxFiberRelativeError=Math.max(maxFiberRelativeError,abs/scale);
   if(abs/scale>1e-9)fail('fiber extrema differ from native saved section',{caseName,partId,element:element.elementID,s:section.s,actual,expected});
   fiberSections++;
  }
  for(let i=1;i<element.sectionSamples.length;i++){
   const p=element.sectionSamples[i-1],q=element.sectionSamples[i],s=(p.s+q.s)/2;
   const coord=prepareCoordinate(m,[a,b],position(a,b,localAxes,s,0,0));
   const expected=(Math.max(Math.abs(p.normalMinPa),Math.abs(p.normalMaxPa))+Math.max(Math.abs(q.normalMinPa),Math.abs(q.normalMaxPa)))/2;
   const actual=sampleEnvelope(part,coord);maxEnvelopeError=Math.max(maxEnvelopeError,Math.abs(actual-expected));
   if(Math.abs(actual-expected)>1e-7*Math.max(1,expected))fail('envelope interpolation wrong',{caseName,element:element.elementID});
   envelopeMidpoints++;
  }
 }
}

// Physical sign checks do NOT derive expected stresses from the implementation:
// native cantilever and simply supported beam forces + classical closed forms.
const signChecks=[];
for(const fixture of probes.cases){
 const [a,b]=fixture.endpoints_blender;
 for(const c of fixture.checks){
  const p=position(a,b,fixture.axes_blender,c.s,c.y,c.z);
  const coord=prepareCoordinate(fixture.member,[a,b],p);
  const actual=sampleSigned(fixture.response,coord),relative=Math.abs(actual-c.expected_Pa)/Math.max(1,Math.abs(c.expected_Pa));
  const passed=Number.isFinite(actual)&&relative<1e-9;
  signChecks.push({case:fixture.name,physical:c.physical,expectedPa:c.expected_Pa,actualPa:actual,relativeError:relative,passed});
  if(!passed)fail('physical sign or orientation wrong',{case:fixture.name,actual,expected:c.expected_Pa});
 }
}

const fixture=probes.cases[0],[a,b]=fixture.endpoints_blender,m=fixture.member;
const outside=prepareCoordinate(m,[a,b],position(a,b,fixture.axes_blender,.5,m.section.b*2,0));
if(sampleSigned(fixture.response,outside)!==undefined)fail('stress invented outside gross section',{});
const center=prepareCoordinate(m,[a,b],position(a,b,fixture.axes_blender,.5,0,0));
if(sampleSigned({elementID:m.id},center)!==undefined)fail('stress invented without native end forces',{});
if(sampleSigned({...fixture.response,elementID:999},center)!==undefined)fail('wrong element result accepted',{});

const report={
 input_sha256:sha(contractPath),module_sha256:sha(sourcePath),validation_script_sha256:sha(fileURLToPath(import.meta.url)),
 native_static_sha256:sha(path.join(out,'static-cases.json')),native_probe_sha256:sha(path.join(out,'stress-field-probes.json')),
 nativeVersion:probes.native_version,convention:'ZDyn/OpenSees: y=vecxz cross x; z=x cross y; sigma=N/A+My*z/Iy-Mz*y/Iz, positive tension.',
 fiberSections,fiberValues,envelopeMidpoints,maxFiberAbsoluteErrorPa:maxFiberAbsoluteError,maxFiberRelativeError,maxCoordinateErrorM:maxCoordinateError,maxEnvelopeErrorPa:maxEnvelopeError,
 signChecks,errors,passed:errors.length===0&&signChecks.every(c=>c.passed),
 limitation:'Gross rectangular beam section only. No notch/tenon/contact/pin-bearing stress concentration is computed.',
};
fs.writeFileSync(path.join(out,'stress-field-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
