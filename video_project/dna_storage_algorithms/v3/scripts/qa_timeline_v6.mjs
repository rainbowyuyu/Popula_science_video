/** CPU-only check of the actual TimelineV6 function and its monotone C2 contract.
 * Defaults inspect activated V6 JSON. --expected-version 3 --label baseline
 * can exercise the implementation with a explicitly identified placeholder.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options={};
for(let i=2;i<process.argv.length;i++){
 const [key,...value]=process.argv[i].split('=');
 if(!key.startsWith('--'))throw new Error('Expected --option: '+key);
 options[key.slice(2)]=value.length?value.join('='):process.argv[++i];
}
const resolve=(key,fallback)=>path.resolve(options[key]??path.join(root,fallback));
const files={source:resolve('source','src/TimelineV6.ts'),narration:resolve('narration','src/narration-v6.json'),legacy:resolve('legacy','src/narration.json')};
const output=resolve('output','research/timeline-map-qa-v6.json');
const expectedVersion=Number(options['expected-version']??6),label=options.label??'activated-v6-timeline';
const checks=[];
const check=(id,pass,detail)=>checks.push({id,pass:Boolean(pass),detail});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={schema:'rainbow.dna.timeline-map-qa/v6',checkedAt:new Date().toISOString(),label,expectedVersion,inputs:files,checks,v6TimelineVerified:false,
 limits:['CPU source/timeline verification only; no encoded video or visual-quality approval.',
 'C2 continuity applies at interior chapter joins. Clamping before zero and after the film end intentionally need not preserve the endpoint velocity.']};

// Recursive derivative isolation finds every real polynomial root in [0,1].
// Critical points partition a polynomial into monotone intervals, so sign
// changes plus exact extrema also detect repeated roots without a coarse grid.
const polynomial=(coefficients,u)=>coefficients.reduceRight((sum,c)=>sum*u+c,0);
function roots01(input){
 const c=[...input];while(c.length>1&&Math.abs(c.at(-1))<1e-13)c.pop();
 if(c.length<2)return [];
 if(c.length===2){const u=-c[0]/c[1];return u>=0&&u<=1?[u]:[];}
 const critical=roots01(c.slice(1).map((v,i)=>v*(i+1))),bounds=[0,...critical.filter(u=>u>0&&u<1),1].sort((a,b)=>a-b),result=[];
 const tolerance=1e-11*Math.max(1,...c.map(Math.abs));
 for(const u of bounds)if(Math.abs(polynomial(c,u))<=tolerance)result.push(u);
 for(let i=1;i<bounds.length;i++){
  let lo=bounds[i-1],hi=bounds[i],flo=polynomial(c,lo),fhi=polynomial(c,hi);
  if(flo*fhi>=0)continue;
  for(let step=0;step<70;step++){const mid=(lo+hi)/2,fmid=polynomial(c,mid);if(flo*fmid<=0){hi=mid;fhi=fmid;}else{lo=mid;flo=fmid;}}
  result.push((lo+hi)/2);
 }
 return result.sort((a,b)=>a-b).filter((u,i,rows)=>!i||Math.abs(u-rows[i-1])>1e-8);
}

try{
 const source=fs.readFileSync(files.source,'utf8'),narration=JSON.parse(fs.readFileSync(files.narration,'utf8')),legacy=JSON.parse(fs.readFileSync(files.legacy,'utf8'));
 report.sourceHashes=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,hash(fs.readFileSync(file))]));
 report.actualNarrationVersion=narration.version;
 check('expected-narration-version',narration.version===expectedVersion,narration.version);
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true},reportDiagnostics:true});
 const errors=(compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 check('timeline-transpiles',errors.length===0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')));
 const nativeRequire=createRequire(files.source),module={exports:{}};
 const load=specifier=>specifier==='./narration-v6.json'?narration:specifier==='./narration.json'?legacy:nativeRequire(specifier);
 new Function('require','module','exports',compiled.outputText)(load,module,module.exports);
 const api=module.exports,fn=api.sceneTimeV6,knots=api.timeMapKnots;
 if(typeof fn!=='function'||!Array.isArray(knots))throw new Error('Missing sceneTimeV6/timeMapKnots export');
 const groups=narration.groups??[],oldGroups=legacy.groups??[],duration=narration.durationSec;
 check('chapter-list-present',groups.length>0&&oldGroups.length>0,{groups:groups.length,oldGroups:oldGroups.length});
 check('physical-duration-valid',duration>0&&narration.fps===30&&Number.isInteger(Math.round(duration*30))&&Math.abs(duration*30-Math.round(duration*30))<1e-4,duration);
 check('declared-frame-count',api.durationInFramesV6===Math.round(duration*30)&&api.durationSecondsV6===Math.round(duration*30)/30,
  {frames:api.durationInFramesV6,seconds:api.durationSecondsV6});
 const expectedKnots=groups.map(g=>({x:g.startSec,y:oldGroups.find(old=>old.id===g.id)?.startSec}));
 expectedKnots.push({x:groups.at(-1)?.endSec,y:290},{x:duration,y:300});
 check('knots-match-measured-chapters',JSON.stringify(knots)===JSON.stringify(expectedKnots),{actual:knots,expected:expectedKnots});
 check('knots-strictly-increasing',knots.length>=2&&knots.every((p,i)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&(!i||(p.x>knots[i-1].x&&p.y>knots[i-1].y))),knots);
 check('knots-cover-full-film',knots[0].x===0&&knots[0].y===0&&knots.at(-1).x===duration&&knots.at(-1).y===300);
 groups.forEach((group,i)=>check('group-'+group.id+'-bounds',group.endSec>group.startSec&&(!i||Math.abs(groups[i-1].endSec-group.startSec)<1e-6)&&group.endSec<=duration,group));
 const rates=knots.slice(0,-1).map((p,i)=>(knots[i+1].y-p.y)/(knots[i+1].x-p.x));
 const slopes=knots.map((_,i)=>i===0?rates[0]:i===knots.length-1?rates.at(-1):2/(1/rates[i-1]+1/rates[i]));
 const intervals=knots.slice(0,-1).map((a,i)=>{
  const b=knots[i+1],span=b.x-a.x,d=b.y-a.y,m0=slopes[i],m1=slopes[i+1];
  const coefficients=[a.y,span*m0,0,10*d-span*(6*m0+4*m1),-15*d+span*(8*m0+7*m1),6*d-3*span*(m0+m1)];
  const velocity=coefficients.slice(1).map((v,k)=>v*(k+1)/span),acceleration=velocity.slice(1).map((v,k)=>v*(k+1)/span);
  const locations=[0,1,...roots01(acceleration)],evaluated=locations.map(u=>({u,velocity:polynomial(velocity,u)}));
  const minimum=Math.min(...evaluated.map(p=>p.velocity)),maximum=Math.max(...evaluated.map(p=>p.velocity));
  check('interval-'+i+'-analytic-monotonicity',minimum>0,{startSec:a.x,endSec:b.x,minimumVelocity:minimum,maximumVelocity:maximum,criticalPoints:evaluated});
  check('interval-'+i+'-endpoint-position',Math.abs(fn(a.x)-a.y)<1e-8&&Math.abs(fn(b.x)-b.y)<1e-8,{startError:fn(a.x)-a.y,endError:fn(b.x)-b.y});
  return {start:a.x,end:b.x,span,coefficients,minimumVelocity:minimum,maximumVelocity:maximum};
 });
 report.intervals=intervals;
 const expected=t=>{let i=0;while(i<intervals.length-1&&t>intervals[i].end)i++;const interval=intervals[i];return polynomial(interval.coefficients,(t-interval.start)/interval.span);};
 let maximumIndependentError=0,minimumStep=Infinity,last=fn(0),finite=true;
 const samples=Math.round(duration*60);
 for(let frame=0;frame<=samples;frame++){
  const t=duration*frame/samples,value=fn(t);finite&&=Number.isFinite(value);
  maximumIndependentError=Math.max(maximumIndependentError,Math.abs(value-expected(t)));
  if(frame)minimumStep=Math.min(minimumStep,value-last);last=value;
 }
 check('actual-function-matches-independent-quintic',finite&&maximumIndependentError<1e-8,{samples:samples+1,maximumIndependentError});
 check('actual-function-sampled-monotone',finite&&minimumStep>0,{samples:samples+1,minimumSceneStep:minimumStep,physicalSampleStep:duration/samples});
 const joins=[];
 for(let i=1;i<knots.length-1;i++){
  const t=knots[i].x,h=Math.min(.02,(t-knots[i-1].x)*.001,(knots[i+1].x-t)*.001),f=fn(t);
  const left=[1,2,3].map(n=>fn(t-n*h)),right=[1,2,3].map(n=>fn(t+n*h));
  const vLeft=(3*f-4*left[0]+left[1])/(2*h),vRight=(-3*f+4*right[0]-right[1])/(2*h);
  const aLeft=(2*f-5*left[0]+4*left[1]-left[2])/(h*h),aRight=(2*f-5*right[0]+4*right[1]-right[2])/(h*h);
  const row={physicalSec:t,sceneSec:f,finiteDifferenceStep:h,expectedVelocity:slopes[i],leftVelocity:vLeft,rightVelocity:vRight,leftAcceleration:aLeft,rightAcceleration:aRight};
  joins.push(row);
  check('join-'+i+'-C1',Math.abs(vLeft-vRight)<1e-5&&Math.abs(vLeft-slopes[i])<1e-5&&Math.abs(vRight-slopes[i])<1e-5,row);
  check('join-'+i+'-C2',Math.abs(aLeft-aRight)<1e-4&&Math.abs(aLeft)<1e-4&&Math.abs(aRight)<1e-4,row);
 }
 report.interiorJoins=joins;
 check('clamps-and-invalid-inputs',fn(-1)===0&&fn(duration+1)===300&&fn(NaN)===0&&fn(Infinity)===0&&fn(-Infinity)===0);
 const seekTimes=[0,...knots.map(k=>k.x),...narration.cues.flatMap(c=>[c.startSec,c.endSec]),duration];
 const forward=seekTimes.map(fn),reverse=[...seekTimes].reverse().map(fn).reverse();
 check('deterministic-arbitrary-seeks',forward.every((v,i)=>v===reverse[i]),{seeks:seekTimes.length});
 check('mapped-cues-complete',api.sceneNarrationV6.cues.length===narration.cues.length);
 narration.cues.forEach((cue,i)=>{
  const mapped=api.sceneNarrationV6.cues[i],start=fn(cue.startSec),end=fn(cue.endSec);
  check('cue-'+cue.id+'-mapped-bounds',start<end&&start>=0&&end<=300&&mapped.startSec===start&&mapped.endSec===end&&mapped.id===cue.id,
   {physical:[cue.startSec,cue.endSec],scene:[start,end]});
 });
 report.summary={samples:samples+1,knots:knots.length,minimumVelocity:Math.min(...intervals.map(i=>i.minimumVelocity)),maximumVelocity:Math.max(...intervals.map(i=>i.maximumVelocity)),maximumIndependentError};
}catch(error){check('timeline-audit-exception',false,error.stack??String(error));}
const failures=checks.filter(c=>!c.pass);
report.status=failures.length?'failed':'cpu-timeline-checks-pass';
report.failedCheckIds=failures.map(c=>c.id);
report.v6TimelineVerified=!failures.length&&report.actualNarrationVersion===5&&expectedVersion===5&&
 files.source===path.join(root,'src/TimelineV6.ts')&&files.narration===path.join(root,'src/narration-v6.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,label,v6TimelineVerified:report.v6TimelineVerified,checks:checks.length,failedCheckIds:report.failedCheckIds,summary:report.summary,output},null,2));
if(failures.length)process.exitCode=1;
