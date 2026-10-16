// Read-only source/data audit; no browser and no video re-render.
// node --experimental-strip-types scripts/audit_metro_speed.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {MetroWorld,ease} from '../src/metro/World.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const sha=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const film=read('src/metro/Film.tsx');
const match=film.match(/if\(s\.scene==='speed'\)\{const a=([^;]+);const bar=([^;]+);/);
if(!match)throw Error('Cannot locate speed HUD formula; audit requires review');
const compact=s=>s.replace(/\s+/g,'');
if(compact(match[1])!=='ease((p-.2)/.25)'||compact(match[2])!=='(1+a)**2')throw Error('HUD formula changed; do not claim this audit covers an unknown expression');
if(!film.includes('progress:clamp((f-s.start)/Math.max(1,s.end-s.start-1))'))throw Error('stateAt progress mapping changed; review required');
const timeline=json('src/metro/timeline.json'),scene=timeline.scenes.find(s=>s.id==='speed');
const world=Object.create(MetroWorld.prototype);world.balance=json('public/metro/physics/balance.json');
const rows=[],roundedDifferences=[];let maxAbsoluteDifference=0,worst=null,maxLegacyError=0;
for(let frame=scene.start;frame<scene.end;frame++){
 const progress=Math.max(0,Math.min(1,(frame-scene.start)/Math.max(1,scene.end-scene.start-1)));
 const a=ease((progress-.2)/.25),windMultiplier=1+a;
 // Formula is verified against the exact, hashed Film source above.
 const hudForceMultiplier=(1+a)**2;
 // Call the actual current World implementation and its saved data table.
 const worldForceMultiplier=world.forceScaleForSpeedMultiplier(windMultiplier);
 const absoluteDifference=Math.abs(hudForceMultiplier-worldForceMultiplier);
 const row={frame,windMultiplier,hudForceMultiplier,worldForceMultiplier,absoluteDifference};
 rows.push(row);if(absoluteDifference>maxAbsoluteDifference){maxAbsoluteDifference=absoluteDifference;worst=row}
 maxLegacyError=Math.max(maxLegacyError,Math.abs(1+3*a-hudForceMultiplier));
 if(hudForceMultiplier.toFixed(1)!==worldForceMultiplier.toFixed(1))roundedDifferences.push({...row,hudRounded:hudForceMultiplier.toFixed(1),worldIfRounded:worldForceMultiplier.toFixed(1)});
}
const anchors=[1,1.25,1.5,1.75,2].map(m=>({windMultiplier:m,quadratic:m*m,world:world.forceScaleForSpeedMultiplier(m),legacyHUD:1+3*(m-1)}));
const sourceFiles=['src/metro/Film.tsx','src/metro/World.ts','src/metro/timeline.json','public/metro/physics/balance.json'];
const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,sha(p)]));
const previous=json('research/metro/visual-state-audit.json');
const unchangedWorld=sourceHashes['src/metro/World.ts']===previous.sourceHashes['src/metro/World.ts'];
const unchangedTimeline=sourceHashes['src/metro/timeline.json']===previous.sourceHashes['src/metro/timeline.json'];
const unchangedBalance=sourceHashes['public/metro/physics/balance.json']===previous.sourceHashes['public/metro/physics/balance.json'];
// The data table is spaced by 0.2 m/s. Linear interpolation of u^2 differs
// from exact u^2 by at most h^2/4; normalized by baseline 4^2 this is .000625.
const analyticInterpolationErrorBound=.2**2/(4*4**2);
const checks={filmUsesSquaredWindMultiplier:true,frameRangeIsIntendedPatch:scene.start===6339&&scene.end===7088&&rows.length===749,finiteResults:rows.every(r=>Object.values(r).every(Number.isFinite)),interpolationWithinAnalyticBound:maxAbsoluteDifference<=analyticInterpolationErrorBound+1e-12,gridAnchorsMatchQuadratic:anchors.every(p=>Math.abs(p.world-p.quadratic)<1e-12),endpointsOneAndFour:rows[0].hudForceMultiplier===1&&rows.at(-1).hudForceMultiplier===4,worldUnchangedSinceVisualAudit:unchangedWorld,timelineUnchangedSinceVisualAudit:unchangedTimeline,balanceDataUnchangedSinceVisualAudit:unchangedBalance};
const report={createdUTC:new Date().toISOString(),scope:'Numerical HUD/World comparison over all speed-chapter frames only. Does not rerender or certify subtitles, image quality, splice decoding, or audio.',method:'Verify exact current Film HUD/progress expressions; use actual imported World.forceScaleForSpeedMultiplier, easing function, timeline, and balance.json; compare all 749 frames.',reproduce:'node --experimental-strip-types scripts/audit_metro_speed.mjs',sourceHashes,hudExpression:match[2],windExpression:'1 + '+match[1],frameRangeInclusive:[scene.start,scene.end-1],framesChecked:rows.length,analyticInterpolationErrorBound,maxAbsoluteDifference,worst,maxArrowLengthDifferenceModelUnits:.43*maxAbsoluteDifference,anchors,legacyFormula:{expression:'1+3*a',errorAtWindMultiplier1_5:{legacy:2.5,correct:2.25,absolute:.25,relative:1/9},maxSampledAbsoluteError:maxLegacyError},rounding:{digits:1,worldRoundingIsNotDisplayedByHUD:true,differences:roundedDifferences,interpretation:'A tiny piecewise-linear data interpolation difference crosses one decimal rounding boundary at one frame. The HUD uses the correct analytic square; the World arrow is effectively identical in length.'},subtitleReview:{reviewType:'Read-only source-text review; no new audio listening or transcription',clips:timeline.clips.filter(c=>c.scene==='speed').map(c=>({id:c.id,text:c.text,start:c.start,end:c.end})),conclusion:'The script fixes posture and frontal area, describes the standard drag estimate as approximately fourfold when relative wind speed doubles, and explicitly distinguishes local relative wind from train speed. No wording/audio change is needed for this HUD correction.'},previousVisualAudit:{path:'research/metro/visual-state-audit.json',worldStillCovered:unchangedWorld&&unchangedTimeline&&unchangedBalance,priorFilmSHA256:previous.sourceHashes['src/metro/Film.tsx'],currentFilmSHA256:sourceHashes['src/metro/Film.tsx'],filmSourceChanged:previous.sourceHashes['src/metro/Film.tsx']!==sourceHashes['src/metro/Film.tsx'],coversHUDChange:false,reason:'The prior audit explicitly excludes React HUD/text and its Film hash predates this change. Its unchanged World/data coverage remains valid. Corrected HUD appearance and patch seams require the targeted new segment checks.',fullWorldVisualAuditRerun:false},checks,allChecksPass:Object.values(checks).every(Boolean),frameResults:rows};
fs.writeFileSync(path.join(root,'research/metro/speed-ratio-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:'research/metro/speed-ratio-audit.json',sourceHashes,frames:rows.length,maxAbsoluteDifference,worst,checks,roundingDifferences:roundedDifferences,previousVisualAudit:report.previousVisualAudit},null,2));
if(!report.allChecksPass)process.exitCode=1;
