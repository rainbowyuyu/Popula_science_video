/** Production 30 Hz screenshot waterline versus measured 60 Hz audio cues.
 * node ... PRODUCTION_TIMELINE.json AUDIO_REPORT.json OUTPUT.json
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [productionPath,audioPath,outPath]=process.argv.slice(2);if(!outPath)throw Error('Required production timeline, audio report, output');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const p=JSON.parse(fs.readFileSync(productionPath)),a=JSON.parse(fs.readFileSync(audioPath));
if(p.fps!==30||p.gpuSampleCount!==p.frameCount||!p.samples.every(s=>s.sampling==='production-native-webgpu-capture'))throw Error('Complete actual production screenshot waterline required');
const samplePath=path.resolve(a.timeline.path.replaceAll('\\','/')),sampleBytes=fs.readFileSync(samplePath);
if(hash(sampleBytes)!==a.timeline.sha256)throw Error('Audio sampler timeline hash mismatch');
const measured=JSON.parse(sampleBytes),sourceKeys=['camera','wave','story','nativeLibrary','sampler'];
const sourceMatches=sourceKeys.every(k=>p.sources?.[k]?.sha256===a.timeline.sources?.[k]?.sha256);
if(!sourceMatches)throw Error('Production source hashes differ from the audio waterline source');
const crossingCountMatches=p.crossings.length===a.crossings.length;
const comparisons=p.crossings.map((c,i)=>{const audio=a.crossings[i];return {index:i,kind:c.kind,audioKind:audio?.kind,productionTime:c.time,audioCueTime:audio?.time,deltaSeconds:audio?c.time-audio.time:null,productionPrecisionSeconds:c.precisionSeconds,audioPrecisionSeconds:audio?.precisionSeconds,passed:!!audio&&audio.kind===c.kind&&Math.abs(c.time-audio.time)<=1/30};});
const m=new Map(measured.samples.map(s=>[s.frame,s])),paired=[];
for(const s of p.samples){const ref=m.get(s.frame*2);if(!ref||ref.surfaceY===null)continue;paired.push({frame:s.frame,heightError:Math.abs(s.surfaceY-ref.surfaceY),positionError:Math.hypot(...s.position.map((v,i)=>v-ref.position[i])),immersionError:Math.abs(s.immersion-ref.immersion)});}
if(!paired.length)throw Error('No measured near-water samples overlap');
const maxHeightError=Math.max(...paired.map(x=>x.heightError)),maxPositionError=Math.max(...paired.map(x=>x.positionError)),maxImmersionError=Math.max(...paired.map(x=>x.immersionError));
const sampleComparisonPassed=maxHeightError<1e-4&&maxPositionError<1e-5&&maxImmersionError<1e-4;
const result={schema:'marine-production-audio-waterline-v8',production:path.resolve(productionPath),productionSHA256:hash(fs.readFileSync(productionPath)),audioReport:path.resolve(audioPath),audioReportSHA256:hash(fs.readFileSync(audioPath)),measured60HzTimeline:samplePath,sourceMatches,crossingCountMatches,comparisons,pairedMeasuredSamples:paired.length,maxHeightError,maxPositionError,maxImmersionError,sampleComparisonPassed,passed:sourceMatches&&crossingCountMatches&&comparisons.every(x=>x.passed)&&sampleComparisonPassed,limitations:['Comparison uses actual 30 Hz screenshot states against measured 60 Hz near-water GPU states.','Crossing timestamps linearly interpolate different sampling intervals; this is not an exact analytic root.','This confirms the visual waterline matches the timing used for audio effects; it does not replace listening or AAC timing verification.']};
fs.mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
