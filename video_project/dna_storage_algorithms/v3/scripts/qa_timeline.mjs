/** Timeline, measured audio and caption checks. No rendered-aesthetic claims. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const checks=[];
const check=(id,pass,detail)=>checks.push({id,pass:Boolean(pass),detail});
const narr=JSON.parse(read('src/narration.json'));
const captionData=JSON.parse(read('src/captions.json'));
const caps=Array.isArray(captionData)?captionData:captionData.captions;
const fps=30,durationSec=300,totalFrames=9000;
const index=read('src/index.tsx'),film=read('src/Film.tsx'),camera=read('src/CameraPathV3.ts');
const stations=[...camera.matchAll(/\{id:'([^']+)',start:([\d.]+),end:([\d.]+),origin:/g)].map(m=>({id:m[1],start:Number(m[2]),end:Number(m[3])}));
check('composition-layout',/width=\{1920\}/.test(index)&&/height=\{1080\}/.test(index)&&/fps=\{30\}/.test(index)&&/durationInFrames=\{9000\}/.test(index),{width:1920,height:1080,fps,totalFrames});
check('narration-layout',narr.durationSec===durationSec&&narr.fps===fps&&narr.cues.length===37,{durationSec:narr.durationSec,fps:narr.fps,cues:narr.cues.length});
check('station-coverage',stations.length===9&&stations[0].start===0&&stations.at(-1).end===300&&stations.every((s,i)=>s.start<s.end&&(!i||s.start===stations[i-1].end)),stations);

/** RIFF PCM decoder, independent from the Python audio QA. */
function wavInfo(file,decode=false){
 const b=fs.readFileSync(file);
 if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw new Error('Unsupported WAV container '+file);
 let format,sampleRate,channels,bits,blockAlign,dataOffset,dataBytes;
 for(let at=12;at+8<=b.length;){const id=b.toString('ascii',at,at+4),length=b.readUInt32LE(at+4),p=at+8;
  if(id==='fmt '){format=b.readUInt16LE(p);channels=b.readUInt16LE(p+2);sampleRate=b.readUInt32LE(p+4);blockAlign=b.readUInt16LE(p+12);bits=b.readUInt16LE(p+14);if(format===65534&&length>=40)format=b.readUInt16LE(p+24);}
  if(id==='data'){dataOffset=p;dataBytes=Math.min(length,b.length-p);}
  at=p+length+(length%2);
 }
 if(!sampleRate||!dataBytes||![1,3].includes(format))throw new Error('Unsupported audio format '+file);
 const samples=dataBytes/blockAlign,info={sampleRate,channels,bits,samples,durationSec:samples/sampleRate,sha256:digest(b)};
 if(decode){const mono=new Float32Array(samples),sampleBytes=bits/8;
  for(let i=0;i<samples;i++){let sum=0;for(let ch=0;ch<channels;ch++){const p=dataOffset+i*blockAlign+ch*sampleBytes;let v;
   if(format===3)v=bits===32?b.readFloatLE(p):b.readDoubleLE(p);
   else if(bits===16)v=b.readInt16LE(p)/32768;
   else if(bits===24)v=b.readIntLE(p,3)/8388608;
   else if(bits===32)v=b.readInt32LE(p)/2147483648;
   else if(bits===8)v=(b.readUInt8(p)-128)/128;
   else throw new Error('Unsupported bit depth');sum+=v;
  }mono[i]=sum/channels;}info.mono=mono;
 }return info;
}
const cueRows=[];let allActive=0,allCovered=0,lastCueEnd=0;
for(const cue of narr.cues){
 const station=stations.find(s=>s.id===cue.shotId),file=path.join(root,'public',cue.audioFile);
 const row={id:cue.id,station:cue.shotId,startSec:cue.startSec,endSec:cue.endSec,source:cue.audioFile,timingStatus:cue.timingStatus};
 check(`cue-${cue.id}-station`,station&&cue.startSec>=station.start-1/fps&&cue.endSec<=station.end+1/fps,{station,window:[cue.startSec,cue.endSec]});
 check(`cue-${cue.id}-ordered`,cue.startSec>=lastCueEnd&&cue.endSec>cue.startSec,{previousEnd:lastCueEnd,start:cue.startSec,end:cue.endSec});lastCueEnd=cue.endSec;
 check(`cue-${cue.id}-frame-rounding`,Math.abs(cue.startFrame/fps-cue.startSec)<=.5/fps+1e-6&&Math.abs(cue.endFrame/fps-cue.endSec)<=.5/fps+1e-6,{startFrame:cue.startFrame,endFrame:cue.endFrame});
 if(!fs.existsSync(file)){check(`cue-${cue.id}-audio-present`,false,file);cueRows.push({...row,status:'missing'});continue;}
 const info=wavInfo(file,true),{mono,...meta}=info;Object.assign(row,{audio:meta});
 const windowError=Math.abs((cue.endSec-cue.startSec)-meta.durationSec),declaredError=Math.abs(cue.actualDuration-meta.durationSec);
 check(`cue-${cue.id}-measured-window`,windowError<=1/meta.sampleRate+1e-6&&declaredError<=1/meta.sampleRate+1e-6&&cue.timingStatus==='measured-unscaled',{measuredDurationSec:meta.durationSec,windowErrorSec:windowError,declaredErrorSec:declaredError});
 const cueCaps=caps.filter(c=>c.cueId===cue.id&&c.text.trim());
 const binSize=Math.round(meta.sampleRate*.01),rms=[];
 for(let start=0;start<mono.length;start+=binSize){const end=Math.min(mono.length,start+binSize);let sum=0;for(let i=start;i<end;i++)sum+=mono[i]*mono[i];rms.push(Math.sqrt(sum/(end-start)));}
 const threshold=Math.max(.002,Math.max(...rms)*.07);let active=0,covered=0,firstActive=null,lastActive=null;
 rms.forEach((energy,i)=>{if(energy<=threshold)return;active++;const at=cue.startSec+(i+.5)*.01;firstActive??=at;lastActive=at;
  if(cueCaps.some(c=>at>=c.startFrame/fps-.005&&at<c.endFrame/fps+.005))covered++;
 });
 const activeCoverage=covered/Math.max(1,active);allActive+=active;allCovered+=covered;
 const captionEnd=cueCaps.length?Math.max(...cueCaps.map(c=>c.endFrame))/fps:null;
 const lateActiveTailSec=lastActive!==null&&captionEnd!==null?Math.max(0,lastActive-captionEnd):null;
 Object.assign(row,{status:'measured',captionCount:cueCaps.length,activityThresholdRms:threshold,activityBinSec:.01,activeSeconds:active*.01,captionedActiveSeconds:covered*.01,activeCoverage,firstActiveSec:firstActive,lastActiveSec:lastActive,lateActiveTailSec});
 check(`cue-${cue.id}-caption-active-coverage`,active>0&&activeCoverage>=.95,{activeCoverage,activeSeconds:active*.01,captionedSeconds:covered*.01,thresholdRms:threshold});
 check(`cue-${cue.id}-caption-tail`,lateActiveTailSec!==null&&lateActiveTailSec<=.12+1/fps,{lateActiveTailSec,allowedBreathTailSec:.12,frameToleranceSec:1/fps,note:'Measured tail only; the95% coverage check above does not silently discard this tail.'});
 const procPath=path.join(root,`research/voice-processing/${cue.id}.json`);
 if(fs.existsSync(procPath)){const p=JSON.parse(fs.readFileSync(procPath,'utf8'));check(`cue-${cue.id}-no-stretch`,p.profile?.timeStretch===false&&p.preservedLengthSamples===true&&p.outputSha256===meta.sha256,{timeStretch:p.profile?.timeStretch,preservedLengthSamples:p.preservedLengthSamples,hashMatches:p.outputSha256===meta.sha256});}
 else check(`cue-${cue.id}-processing-record`,false,'Missing processing provenance');
 cueRows.push(row);
}
check('aggregate-active-caption-coverage',allCovered/Math.max(1,allActive)>=.95,{coverage:allCovered/Math.max(1,allActive),measuredActiveSeconds:allActive*.01,captionedSeconds:allCovered*.01});

const charStats=[];let previousCaptionEnd=0;
for(const c of caps){const han=[...c.text.matchAll(/\p{Script=Han}/gu)].length,total=[...c.text].length;charStats.push({id:c.id,han,total,startFrame:c.startFrame,endFrame:c.endFrame});
 check(`caption-${c.id}-bounds`,Number.isInteger(c.startFrame)&&Number.isInteger(c.endFrame)&&c.startFrame>=0&&c.endFrame<=totalFrames&&c.endFrame>c.startFrame&&c.startFrame>=previousCaptionEnd,{window:[c.startFrame,c.endFrame],previousEnd:previousCaptionEnd});previousCaptionEnd=c.endFrame;
 check(`caption-${c.id}-short`,han<=24&&total<=24,{han,total,maximum:24});
 const cue=narr.cues.find(q=>q.id===c.cueId);check(`caption-${c.id}-cue`,cue&&cue.shotId===c.shotId&&c.startFrame>=cue.startFrame-1&&c.endFrame<=cue.endFrame+1,{cue:c.cueId,station:c.shotId});
}
const captionFunction=film.slice(film.indexOf('function Caption'),film.indexOf('type Callout'));
const fontSize=Number(captionFunction.match(/fontSize:(\d+)/)?.[1]??NaN);
const left=Number(captionFunction.match(/left:(\d+)/)?.[1]??NaN),right=Number(captionFunction.match(/right:(\d+)/)?.[1]??NaN),bottom=Number(captionFunction.match(/bottom:(\d+)/)?.[1]??NaN);
const maxChars=Math.max(...charStats.map(c=>c.total));
const layoutEstimate={fontSizePx:fontSize,leftPx:left,rightPx:right,bottomPx:bottom,maxCaptionCharacters:maxChars,conservativeGlyphWidthPx:maxChars*fontSize,paddingWidthPx:52,availableWidthPx:1920-left-right,method:'Conservative one-em-per-character static estimate of the single-line source style; not actual font raster bounds or a rendered occlusion test.',renderedReadabilityVerified:false};
check('caption-style-static-width',fontSize===48&&layoutEstimate.conservativeGlyphWidthPx+52<=layoutEstimate.availableWidthPx&&bottom>=24,layoutEstimate);

function sourceFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sourceFiles(path.join(dir,e.name)):/\.(ts|tsx)$/.test(e.name)?[path.join(dir,e.name)]:[]);}
const nondeterminism=[];
for(const f of sourceFiles(path.join(root,'src'))){const text=fs.readFileSync(f,'utf8');for(const [kind,regex]of [['wall-clock',/\bDate\s*\.\s*now\s*\(/g],['unseeded-random',/\bMath\s*\.\s*random\s*\(/g],['realtime-clock',/\bperformance\s*\.\s*now\s*\(/g],['interval-animation',/\bsetInterval\s*\(/g],['animation-frame-loop',/\brequestAnimationFrame\s*\(/g],['three-clock',/new\s+(?:T|THREE)\.Clock\s*\(/g]])for(const m of text.matchAll(regex))nondeterminism.push({path:path.relative(root,f).replaceAll('\\','/'),kind,line:text.slice(0,m.index).split('\n').length});}
check('no-wall-clock-or-unseeded-animation',nondeterminism.length===0,{scanned:'all src/**/*.ts(x)',violations:nondeterminism,scope:'Static audit of first-party scene source only; seeded random helpers are allowed, dependencies are not falsely reported as deterministic.'});
const tsc=spawnSync(process.execPath,[path.join(root,'../node_modules/typescript/bin/tsc'),'--noEmit','-p',path.join(root,'tsconfig.json')],{encoding:'utf8',windowsHide:true,timeout:120000});
const compile={command:'npm --prefix v3 run check',executedEquivalent:`node <project>/node_modules/typescript/bin/tsc --noEmit -p v3/tsconfig.json`,exitCode:tsc.status,output:(tsc.stdout+tsc.stderr).trim().slice(0,6000),error:tsc.error?.message??null};
check('typescript-compile',tsc.status===0,compile);

let master={status:'missing'};const masterPath=path.join(root,'public/audio/master.wav');
if(fs.existsSync(masterPath)){master={status:'present',...wavInfo(masterPath)};check('master-audio-layout',master.sampleRate===48000&&master.channels===2&&master.samples===300*48000,master);}else check('master-audio-layout',false,master);
const explicitVideo=process.argv.find(a=>a.startsWith('--video='))?.slice(8);
const videoPath=explicitVideo?path.resolve(explicitVideo):path.join(root,'delivery/DNA存储_连续数据之旅_V3_1080p.mp4');
let finalVideo={status:'not-rendered',path:path.relative(root,videoPath).replaceAll('\\','/'),releaseApproved:false};
if(fs.existsSync(videoPath)){
 const ff=spawnSync('ffprobe',['-v','error','-show_entries','stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels:format=duration','-of','json',videoPath],{encoding:'utf8',windowsHide:true,timeout:120000});
 if(ff.status===0){const probe=JSON.parse(ff.stdout),video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');finalVideo={...finalVideo,status:'probed',probe,bytes:fs.statSync(videoPath).size,sha256:digest(fs.readFileSync(videoPath))};check('final-video-layout',video?.width===1920&&video?.height===1080&&video?.r_frame_rate==='30/1'&&Number(video?.nb_frames)===9000,video);check('final-video-audio-layout',audio?.sample_rate==='48000'&&audio?.channels===2,audio??null);check('final-video-av-duration',Math.abs(Number(video?.duration)-300)<=1/fps&&Math.abs(Number(audio?.duration)-Number(video?.duration))<=1/fps,{video:video?.duration,audio:audio?.duration,maxDifferenceSec:1/fps});}
 else {finalVideo.status='ffprobe-failed';check('final-video-probe',false,{stderr:ff.stderr,error:ff.error?.message});}
}
const failures=checks.filter(c=>!c.pass);
const report={schema:'rainbow.dna.timeline-qa/v3',checkedAt:new Date().toISOString(),status:failures.length?'failed':finalVideo.status==='not-rendered'?'source-checks-pass-awaiting-final-render':'automated-checks-pass-visual-review-separate',releaseApproved:false,sourceHashes:Object.fromEntries(['src/index.tsx','src/Film.tsx','src/World.ts','src/CameraPathV3.ts','src/narration.json','src/captions.json'].map(p=>[p,digest(read(p))])),composition:{width:1920,height:1080,fps,totalFrames,durationSec},cueCount:narr.cues.length,captionCount:caps.length,coverage:{method:'Independently decoded clean WAV samples;10ms RMS bins active above max(.002,7% maximum clip-bin RMS). Compare active-bin midpoint to that cue’s real caption frames; silence and uncaptioned inter-cue breaths need no text.',minimumPerCue:Math.min(...cueRows.filter(r=>r.activeCoverage!==undefined).map(r=>r.activeCoverage)),aggregate:allCovered/Math.max(1,allActive),activeSeconds:allActive*.01,captionedActiveSeconds:allCovered*.01,allowedFinalBreathTailSec:.12,subjectiveListeningChecked:false},captionLength:{maximumHan:Math.max(...charStats.map(c=>c.han)),maximumAllCharacters:maxChars},layoutEstimate,master,compile,finalVideo,cues:cueRows,checks,failedCheckIds:failures.map(c=>c.id),limits:['These are measured audio/timeline, static source, compile and optional encoded-file checks. They do not certify visual beauty, organ/model visibility, text occlusion, camera intent, or subjective narration quality.','A screenshot/contact sheet is not a substitute for full-motion and final-film inspection.','No full MP4 is claimed until the default delivery file exists and is successfully probed; release approval remains a separate visual/listening decision.']};
fs.writeFileSync(path.join(root,'research/timeline-qa.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,failed:report.failedCheckIds,cues:report.cueCount,captions:report.captionCount,activeCaptionCoverage:report.coverage.aggregate,minimumCueCoverage:report.coverage.minimumPerCue,finalVideo:finalVideo.status},null,2));
if(failures.length)process.exitCode=1;
