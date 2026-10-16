/** Quantify visible near-wall retirement, with immutable accepted CFD exports. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const out=path.resolve('research/qa/v12-flow-registration');await fs.mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['src/FlowSliceGeometry.ts'],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const G=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fieldPath='public/physics/computed-flow-slices.json',boundaryPath='public/physics/computed-pressure.json';
const fieldBytes=await fs.readFile(fieldPath),boundaryBytes=await fs.readFile(boundaryPath),data=JSON.parse(fieldBytes),boundary=JSON.parse(boundaryBytes);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(data.provenance.sourceSHA256,boundary.provenance.sourceSHA256);
assert.equal(sha(fieldBytes),'df8042af9af917aeeb43ead8f9312ed54e80186cfe6420e134e577534a3e34ce');
assert.equal(sha(boundaryBytes),'29366c0452fb702c565665676e8fcd43f91f953311828af9c761fa512a1d8b0a');
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const stat=a=>{const b=[...a].sort((x,y)=>x-y);return {min:b[0],median:b[Math.floor(b.length/2)],p95:b[Math.floor((b.length-1)*.95)],max:b.at(-1),probes:b.length};};
function raster(m,values,x,y){
 const gx=(x-m.bounds[0])/(m.bounds[2]-m.bounds[0])*(m.nx-1),gy=(y-m.bounds[1])/(m.bounds[3]-m.bounds[1])*(m.ny-1);
 assert.ok(gx>=0&&gy>=0&&gx<=m.nx-1&&gy<=m.ny-1);
 const i=Math.min(m.nx-2,Math.floor(gx)),j=Math.min(m.ny-2,Math.floor(gy)),a=gx-i,b=gy-j;
 return (values[j*m.nx+i]*(1-a)+values[j*m.nx+i+1]*a)*(1-b)+(values[(j+1)*m.nx+i]*(1-a)+values[(j+1)*m.nx+i+1]*a)*b;
}

// Missing triangle half and the outer rectangle are both genuine boundaries.
const fixture={id:'test-only',kind:'horizontal',origin_m:[0,0,0],uAxis:[1,0,0],vAxis:[0,0,1],width_m:2,height_m:2,nx:2,ny:2,speed_m_s:[999,12,14,16],validMask:[0,1,1,1],insideSolidMask:[0,0,0,0],time_s:null,meaning:'analytic fixture, never film data'};
assert.equal(G.sampleValidTriangle(fixture,.2,.2),null);
assert.ok(Math.abs(G.supportSignedDistance(fixture,[.8,.8])+Math.sqrt(.08))<1e-10);
assert.ok(Math.abs(G.supportSignedDistance(fixture,[1.2,1.2])-Math.sqrt(.08))<1e-10);
assert.ok(Math.abs(G.supportSignedDistance(fixture,[2.1,1])+.1)<1e-10);
const sections=[];
for(const s of data.slices){
 const start=Date.now(),m=G.buildSliceBodyMask(s,boundary),support=G.validSupportBoundary(s,true),grid=Math.max(s.width_m/(s.nx-1),s.height_m/(s.ny-1));
 const beforeFeather=1.5*grid,afterFeather=.06*grid;
 let maxBodyError=0,maxSupportError=0,bodyViolation=0,supportViolation=0;
 for(let k=0;k<1600;k++){
  const x=m.bounds[0]+((k*.6180339887498949)%1)*(m.bounds[2]-m.bounds[0]),y=m.bounds[1]+((k*.4142135623730951)%1)*(m.bounds[3]-m.bounds[1]);
  const bodyExact=G.bodySignedDistance([x,y],m.segments),supportExact=G.supportSignedDistance(s,[x,y],support);
  const bodyRaster=raster(m,m.distance_m,x,y),supportRaster=raster(m,m.supportDistance_m,x,y);
  maxBodyError=Math.max(maxBodyError,Math.abs(bodyExact-bodyRaster));maxSupportError=Math.max(maxSupportError,Math.abs(supportExact-supportRaster));
  if(bodyExact<0&&bodyRaster-m.interpolationErrorBound_m>0)bodyViolation++;
  if(supportExact<0&&supportRaster-m.interpolationErrorBound_m>0)supportViolation++;
 }
 assert.ok(maxBodyError<m.interpolationErrorBound_m+1e-5);assert.ok(maxSupportError<m.interpolationErrorBound_m+1e-5);
 assert.equal(bodyViolation,0);assert.equal(supportViolation,0);
 const raw=[],before05=[],before50=[],before95=[],after05=[],after50=[],after95=[];
 for(const [a,b] of m.segments){
  const p=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-3)continue;
  if(p[0]<0||p[1]<0||p[0]>s.width_m||p[1]>s.height_m)continue;
  let n=[-(b[1]-a[1])/len,(b[0]-a[0])/len];if(G.bodySignedDistance([p[0]+n[0]*.01,p[1]+n[1]*.01],m.segments)<0)n=n.map(x=>-x);
  const hits=Array(7).fill(null);
  for(let d=0;d<=8;d+=.025){
   const x=p[0]+n[0]*d,y=p[1]+n[1]*d,valid=G.sampleValidTriangle(s,x/s.width_m,y/s.height_m)!==null;
   if(!valid)continue;if(hits[0]===null)hits[0]=d;
   const bodyDistance=raster(m,m.distance_m,x,y)-m.interpolationErrorBound_m,supportDistance=raster(m,m.supportDistance_m,x,y)-m.interpolationErrorBound_m;
   const before=smooth(m.supportBoundaryInset_m,m.supportBoundaryInset_m+beforeFeather,bodyDistance);
   // A .5 m output-pixel footprint is explicitly assumed for this numeric
   // comparison. Actual camera fwidth is reviewed in the rendered stills.
   const after=smooth(0,.5,bodyDistance)*smooth(0,Math.max(.5,afterFeather),supportDistance);
   for(let t=0;t<3;t++){if(before>=[.05,.5,.95][t]&&hits[1+t]===null)hits[1+t]=d;if(after>=[.05,.5,.95][t]&&hits[4+t]===null)hits[4+t]=d;}
   if(hits.every(v=>v!==null))break;
  }
  if(hits.every(v=>v!==null))[raw,before05,before50,before95,after05,after50,after95].forEach((a,k)=>a.push(hits[k]));
 }
 assert.ok(raw.length>20);assert.ok(stat(after50).median<stat(before50).median*.5);
 sections.push({id:s.id,origin_m:s.origin_m,uAxis:s.uAxis,vAxis:s.vAxis,gridSpacing_m:[s.width_m/(s.nx-1),s.height_m/(s.ny-1)],buildMilliseconds:Date.now()-start,validSampleCount:s.validMask.filter((v,i)=>v&&!s.insideSolidMask[i]).length,sourceNearWallUnsupported_m:stat(raw),before:{globalInset_m:m.supportBoundaryInset_m,feather_m:beforeFeather,opacity05Distance_m:stat(before05),opacity50Distance_m:stat(before50),opacity95Distance_m:stat(before95)},after:{globalInset_m:0,minimumFeather_m:afterFeather,assumedOutputPixelFootprint_m:.5,opacity05Distance_m:stat(after05),opacity50Distance_m:stat(after50),opacity95Distance_m:stat(after95)},mask:{errorBound_m:m.interpolationErrorBound_m,measuredBodyError_m:maxBodyError,measuredSupportError_m:maxSupportError,bodyViolation,supportViolation}});
 console.log(s.id,JSON.stringify(sections.at(-1)));
}
const report={passed:true,createdAt:new Date().toISOString(),fieldSHA256:sha(fieldBytes),boundarySHA256:sha(boundaryBytes),nativeSourceSHA256:data.provenance.sourceSHA256,worldScale:.01,shaderPlaneDisplacement_m:0,worldHorizontalCutDisplayAllowance_m:.1,scalarPolicy:'Only original valid triangles. No wall speed, extrapolation, velocity sample, palette value, valid mask or native solved boundary changed.',appearancePolicy:'Remove global worst-case near-wall opacity buffer. Apply local valid-support and native-body SDF coverage with conservative raster error bound plus one delivered-pixel antialias ramp.',sections};
await fs.writeFile(path.join(out,'registration-and-opacity.json'),JSON.stringify(report,null,2));
console.log('PASS '+path.join(out,'registration-and-opacity.json'));
