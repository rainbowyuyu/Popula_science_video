/** Independent, reproducible checks of the film's fixed teaching examples.
 * This is not an experimental validation of a DNA-storage pipeline.
 * Run from any directory: node v3/scripts/qa_teaching.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const data=JSON.parse(read('src/teaching-data.json'));
const checks=[];
function check(id,actual,expected,note=''){
 const pass=JSON.stringify(actual)===JSON.stringify(expected);
 checks.push({id,pass,actual,expected,...(note?{note}: {})});
 return pass;
}
function gc(sequence){return [...sequence].filter(c=>c==='G'||c==='C').length/sequence.length;}
function longestRun(sequence){let previous='',run=0,longest=0;for(const base of sequence){run=base===previous?run+1:1;previous=base;longest=Math.max(longest,run);}return longest;}
const sequences=['ATGCGT','GCTAGT','TACGAC'];
const gcExamples=sequences.map(sequence=>({sequence,length:sequence.length,gcCount:[...sequence].filter(c=>'GC'.includes(c)).length,gcFraction:gc(sequence),longestHomopolymer:longestRun(sequence)}));
for(const example of gcExamples)check(`gc-${example.sequence}`,example.gcFraction,.5);
check('homopolymer-length-AAAAAA',longestRun('AAAAAA'),6);
const homopolymer={sequence:'AAAAAA',longestRun:longestRun('AAAAAA'),teachingMaximumAllowedRun:3,rejected:longestRun('AAAAAA')>3,scope:'A maximum run length of three is an explicit fixed teaching constraint, not a universal chemical or platform limit.'};
check('homopolymer-teaching-filter',homopolymer.rejected,true);

const sw=data.smithWaterman;
const rows=sw.query.length+1,columns=sw.reference.length+1;
const computed=Array.from({length:rows},()=>Array(columns).fill(0));
let bestScore=0;
for(let row=1;row<rows;row++)for(let column=1;column<columns;column++){
 const match=sw.query[row-1]===sw.reference[column-1];
 computed[row][column]=Math.max(0,computed[row-1][column-1]+(match?sw.scoring.match:sw.scoring.mismatch),computed[row-1][column]+sw.scoring.gap,computed[row][column-1]+sw.scoring.gap);
 bestScore=Math.max(bestScore,computed[row][column]);
}
check('smith-waterman-full-matrix',sw.matrix,computed,'Every cell checked, including zero row and zero column.');
check('smith-waterman-optimum-independent',bestScore,8);
check('smith-waterman-declared-best-score',sw.bestScore,bestScore);
const pathSteps=[];let previous=[0,0],pathScore=0,validPath=true,alignedReference='',alignedQuery='';
for(const point of sw.path){
 const [row,column]=point,dr=row-previous[0],dc=column-previous[1];
 let delta,kind,reference='-',query='-';
 if(dr===1&&dc===1){reference=sw.reference[column-1];query=sw.query[row-1];kind=reference===query?'match':'mismatch';delta=kind==='match'?sw.scoring.match:sw.scoring.mismatch;}
 else if(dr===0&&dc===1){reference=sw.reference[column-1];kind='gap-in-query';delta=sw.scoring.gap;}
 else if(dr===1&&dc===0){query=sw.query[row-1];kind='gap-in-reference';delta=sw.scoring.gap;}
 else {kind='invalid-move';delta=Number.NaN;validPath=false;}
 pathScore+=delta;
 const recurrenceMatches=Number.isFinite(delta)&&computed[row]?.[column]===computed[previous[0]]?.[previous[1]]+delta;
 validPath&&=recurrenceMatches;
 pathSteps.push({from:previous,to:point,kind,reference,query,delta,cumulativeScore:pathScore,matrixScore:computed[row]?.[column],recurrenceMatches});
 alignedReference+=reference;alignedQuery+=query;previous=point;
}
check('smith-waterman-path-valid-predecessors',validPath,true);
check('smith-waterman-path-score',pathScore,8);
check('smith-waterman-path-reaches-optimum',computed[previous[0]][previous[1]],bestScore);

const A=Buffer.from('HOME','ascii'),B=Buffer.from('2026','ascii'),C=Buffer.from('DNA!','ascii');
function xor(a,b){if(a.length!==b.length)throw new Error('Teaching blocks must have equal byte length');return Buffer.from(a.map((byte,i)=>byte^b[i]));}
const AB=xor(A,B),BC=xor(B,C),ABC=xor(AB,C);
const recoveredB=xor(A,AB),recoveredC=xor(recoveredB,BC);
check('fountain-fixed-XOR-recovery-B',[...recoveredB],[...B]);
check('fountain-fixed-XOR-recovery-C',[...recoveredC],[...C]);
check('fountain-fixed-full-payload-hash',sha(Buffer.concat([A,recoveredB,recoveredC])),sha(Buffer.concat([A,B,C])));
const byteRecord=(label,bytes)=>({label,bytes:[...bytes],hex:bytes.toString('hex'),sha256:sha(bytes)});
const fountain={evidence:'fixed-teaching-example',scope:'A three-block XOR peeling demonstration only. It does not implement the robust soliton distribution, pseudorandom seed selection, sequence screening, Reed–Solomon protection, synthesis, sequencing, or measured DNA Fountain recovery performance.',inputs:[byteRecord('A',A),byteRecord('B',B),byteRecord('C',C)],transmittedRelations:[byteRecord('A',A),byteRecord('A XOR B',AB),byteRecord('B XOR C',BC),byteRecord('A XOR B XOR C',ABC)],missingSourceBlocks:['B','C'],recoverySteps:[{expression:'B = A XOR (A XOR B)',recovered:byteRecord('B',recoveredB)},{expression:'C = B XOR (B XOR C)',recovered:byteRecord('C',recoveredC)}],inputPayloadSha256:sha(Buffer.concat([A,B,C])),recoveredPayloadSha256:sha(Buffer.concat([A,recoveredB,recoveredC]))};
const verification={schema:'rainbow.dna.teaching-verification/v3',checkedAt:new Date().toISOString(),status:checks.every(c=>c.pass)?'passed':'failed',source:{path:'src/teaching-data.json',sha256:sha(read('src/teaching-data.json'))},gcExamples,homopolymer,smithWaterman:{evidence:'fixed-teaching-example',reference:sw.reference,query:sw.query,scoring:sw.scoring,computedMatrix:computed,bestScore,providedPath:sw.path,pathSteps,pathScore,alignedReference,alignedQuery,scope:'Small local-alignment example. Does not establish that Smith–Waterman alone is a production DNA-storage decoder.'},fountain,editorialLimits:[{topic:'Tokenization',statement:'k-mer and BPE are alternative tokenization designs. The diagram must not imply a mandatory k-mer → BPE serial pipeline.'},{topic:'Nucleotide Transformer',doi:'10.1038/s41592-024-02523-z',statement:'This paper supports genomic sequence representation and predictive modeling examples. It is not evidence for the performance, accuracy, cost, or recovery rate of the DNA-storage workflow in this film.'},{topic:'Model-assisted feedback',statement:'Candidate scoring and device feedback are an illustrative proposal. Their performance requires data and validation for the corresponding device and protocol.'}],checks};
fs.mkdirSync(path.join(root,'research'),{recursive:true});
fs.writeFileSync(path.join(root,'research/teaching-verification.json'),JSON.stringify(verification,null,2)+'\n');

// Inventory the current executable sources, not the inherited V2 timeline manifest.
const sourcePaths=['src/World.ts','src/Film.tsx','src/scene/Stations.ts'];
const sources=Object.fromEntries(sourcePaths.map(p=>[p,read(p)]));
const world=sources['src/World.ts'],film=sources['src/Film.tsx'],stations=sources['src/scene/Stations.ts'];
const namesMatch=world.match(/const names=\[([^\]]+)\]/);
if(!namesMatch)throw new Error('World GLB list not found; update asset scanner instead of inventing references');
const modelNames=[...namesMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
const requests=[];
const lineAt=(source,needle)=>source.slice(0,source.indexOf(needle)).split('\n').length;
const stationClasses=[...stations.matchAll(/export class (\w+)[\s\S]*?(?=export class |export const makeStations|$)/g)].map(m=>({name:m[1],source:m[0]}));
for(const name of modelNames){
 const installedBy=stationClasses.filter(c=>new RegExp(`name\\s*===\\s*['"]${name}['"]`).test(c.source)).map(c=>c.name);
 requests.push({path:`3d/${name}.glb`,kind:'model',reference:{source:'src/World.ts',line:lineAt(world,'const names=')},load:'GLTFLoader.loadAsync then Station.installAsset',installedBy,claim:'Referenced and installed in source. This inventory does not establish visibility in every rendered frame.'});
}
for(const match of film.matchAll(/staticFile\(['"]([^'"]+)['"]\)/g)){
 const rel=match[1];
 requests.push({path:rel,kind:rel.startsWith('audio/')?'audio':rel.startsWith('brand/')?'logo':'paper',reference:{source:'src/Film.tsx',line:lineAt(film,match[0])},...(rel.startsWith('audio/')?{condition:'Film audio prop must be true; default composition prop is false.'}:{})});
}
for(const match of world.matchAll(/base\(['"]([^'"]+)['"]\)/g)){
 const isAtlas=match[1].includes('wan-atlas');
 requests.push({path:match[1],kind:isAtlas?'video-atlas':'image',reference:{source:'src/World.ts',line:lineAt(world,match[0])},...(isAtlas?{sourceVideo:{path:'bridges/wan-lab-macro.mp4',usage:'Source for atlas, not loaded directly by World'}}:match[1].includes('family-memory')?{sourceAI:true,scientificEvidence:false,provenance:'research/tool-family-memory.json'}:{})});
}
const formulaMatch=film.match(/\[([^\]]+)\]\.map\(\(name,i\)/);
if(film.includes('formulas/${name}.svg')&&!formulaMatch)throw new Error('Formula list not found; scanner cannot safely infer filenames');
if(formulaMatch)for(const match of formulaMatch[1].matchAll(/['"]([^'"]+)['"]/g))requests.push({path:`formulas/${match[1]}.svg`,kind:'formula',reference:{source:'src/Film.tsx',line:lineAt(film,'formulas/${name}.svg')},rendering:'LaTeX-derived SVG, source.tex retained'});
const assets=requests.map(item=>{
 const abs=path.join(root,'public',item.path);
 if(!fs.existsSync(abs))return {...item,status:item.kind==='audio'?'pending':'missing',sha256:null,bytes:null};
 const bytes=fs.readFileSync(abs);return {...item,status:'present',sha256:sha(bytes),bytes:bytes.length};
});
const references=new Set(assets.map(a=>a.path));
const unreferenced=[];
for(const dir of ['3d','papers','formulas','brand'])for(const entry of fs.readdirSync(path.join(root,'public',dir),{withFileTypes:true})){
 if(entry.isFile()&&/\.(glb|png|svg)$/i.test(entry.name)&&!references.has(`${dir}/${entry.name}`))unreferenced.push({path:`${dir}/${entry.name}`,usage:'Not directly referenced by current executable sources; retained source/preview/alternative asset.'});
}
const assetUsage={schema:'rainbow.dna.asset-usage/v3',checkedAt:new Date().toISOString(),sourceSnapshots:sourcePaths.map(p=>({path:p,sha256:sha(sources[p])})),sourceOfTruth:'Current World.ts and Film.tsx imports/load calls, plus Stations.ts install handlers. The inherited timeline-source.json asset entries were deliberately not treated as active usage.',status:assets.some(a=>a.status==='missing')?'missing-required-assets':assets.some(a=>a.status==='pending')?'pending-audio':'all-referenced-files-present',modelCount:modelNames.length,assets,retainedButNotDirectlyReferenced:unreferenced,limits:['Static source references and file hashes only; final visibility, occlusion, timing and audio-enabled final render require integrated film QA.','Rerun this script after master.wav becomes available to replace pending status with its real hash.']};
fs.writeFileSync(path.join(root,'research/asset-usage.json'),JSON.stringify(assetUsage,null,2)+'\n');
console.log(JSON.stringify({teaching:verification.status,checks:checks.length,failed:checks.filter(c=>!c.pass).map(c=>c.id),assets:assetUsage.status,modelCount:assetUsage.modelCount,referencedAssets:assets.length,pending:assets.filter(a=>a.status==='pending').map(a=>a.path)},null,2));
if(verification.status!=='passed'||assets.some(a=>a.status==='missing'))process.exitCode=1;
