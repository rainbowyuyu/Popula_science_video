/** Compare the isolated 60 Hz native sampler to actual screenshot native states. */
import fs from 'node:fs';
const [timelineFile,proofFile,outFile]=process.argv.slice(2);
if(!outFile)throw Error('Usage: node scripts/compare_waterline_capture_v8.mjs TIMELINE PROOF OUTPUT');
const timeline=JSON.parse(fs.readFileSync(timelineFile,'utf8')),samples=new Map(timeline.samples.map(x=>[x.frame,x]));
const comparisons=[];
for(const line of fs.readFileSync(proofFile,'utf8').trim().split(/\r?\n/)){
 const p=JSON.parse(line),s=samples.get(p.frame*2);if(s?.surfaceY===null)continue;
 if(!s||!Number.isFinite(p.before.waterHeight)||!Array.isArray(p.before.cameraPosition))throw Error('Missing real paired water state at '+p.frame);
 const positionError=Math.hypot(...p.before.cameraPosition.map((v,i)=>v-s.position[i]));
 const heightError=Math.abs(p.before.waterHeight-s.surfaceY),immersionError=Math.abs(p.before.submersion-s.immersion);
 comparisons.push({frame:p.frame,positionError,heightError,immersionError,capture:p.before.waterHeight,sampler:s.surfaceY});
}
if(!comparisons.length)throw Error('No real near-surface overlap');
const result={schema:'waterline-capture-crosscheck-v8',count:comparisons.length,maxHeightError:Math.max(...comparisons.map(x=>x.heightError)),maxPositionError:Math.max(...comparisons.map(x=>x.positionError)),maxImmersionError:Math.max(...comparisons.map(x=>x.immersionError)),comparisons};
result.passed=result.maxHeightError<1e-4&&result.maxPositionError<1e-5&&result.maxImmersionError<1e-4;fs.writeFileSync(outFile,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
