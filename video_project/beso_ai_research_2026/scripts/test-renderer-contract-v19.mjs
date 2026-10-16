import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTimeline,parseFrames,parseClip,parseSegments,validateOutput} from './renderer-contract-v19.mjs';
import {collectLaunchInputs} from './renderer-inputs-v19.mjs';

// Boundaries that can silently invalidate a under-two-minute delivery or overwrite a
// prior accepted render; no source, audio or previous delivery is modified.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checks=[];
const test=(name,fn)=>{fn();checks.push(name);};
const rejects=(name,fn)=>test(name,()=>assert.throws(fn));
test('first-last-frame',()=>assert.deepEqual(parseFrames('5759,0,5759'),[0,5759]));
for(const value of ['-1','5760','1,','1,,2','1.5',''])rejects('reject-frame-'+value,()=>parseFrames(value));
test('inclusive-full-clip',()=>assert.deepEqual(parseClip('0-5759'),[0,5759]));
for(const value of ['0-5760','4-3','0-','1-2-3','1.5-2'])rejects('reject-clip-'+value,()=>parseClip(value));
test('segments-last',()=>assert.deepEqual(parseSegments('0,6',900),[0,6]));
rejects('segment-overrun',()=>parseSegments('7',900));
rejects('chunk-zero',()=>parseSegments(null,0));
rejects('chunk-noninteger',()=>parseSegments(null,900.1));
for(const v of [1,9,10,16,17,18])rejects(`protect-v${v}-output`,()=>validateOutput(root,path.join(root,`output/ai_engineer_launch_v${v}_v19.mp4`),'render'));
rejects('protect-root-source',()=>validateOutput(root,path.join(root,'src/LaunchV19.tsx'),'render'));
rejects('protect-external',()=>validateOutput(root,path.resolve(root,'../v19.mp4'),'render'));
rejects('require-version-token',()=>validateOutput(root,path.join(root,'output/launch.mp4'),'render'));
test('allow-v19-clip',()=>validateOutput(root,path.join(root,'output/launch-v19-test.mp4'),'clip'));
test('allow-v19-stills',()=>validateOutput(root,path.join(root,'research/qa/v19-test'),'stills'));
rejects('reject-still-file',()=>validateOutput(root,path.join(root,'research/qa/v19-test.jpg'),'stills'));
rejects('reject-video-directory',()=>validateOutput(root,path.join(root,'output/v19-directory'),'render'));
const story={fps:60,duration:5760,scenes:[{id:'one',start:0,duration:3000},{id:'two',start:3000,duration:2760}]};
const captions=[{startMs:100,endMs:1000,text:'AI Engineer'},{startMs:2000,endMs:4000,text:'可复查交付'}];
test('valid-timeline',()=>assert.equal(validateTimeline(story,captions).valid,true));
test('accept-90s-duration',()=>assert.equal(validateTimeline({...story,duration:5400,scenes:[{id:'one',start:0,duration:5400}]},captions).valid,true));
rejects('reject-two-minute-duration',()=>validateTimeline({...story,duration:7200,scenes:[{id:'one',start:0,duration:7200}]},captions));
rejects('reject-short-duration',()=>validateTimeline({...story,duration:3599,scenes:[{id:'one',start:0,duration:3599}]},captions));
rejects('reject-noninteger-duration',()=>validateTimeline({...story,duration:5760.5},captions));
rejects('reject-scene-gap',()=>validateTimeline({...story,scenes:[story.scenes[0],{...story.scenes[1],start:3001}]},captions));
rejects('reject-scene-duplicate',()=>validateTimeline({...story,scenes:[story.scenes[0],{...story.scenes[1],id:'one'}]},captions));
rejects('reject-caption-overlap',()=>validateTimeline(story,[captions[0],{...captions[1],startMs:999}]));
rejects('reject-caption-overrun',()=>validateTimeline(story,[{startMs:100,endMs:96001,text:'x'}]));
rejects('reject-caption-empty',()=>validateTimeline(story,[{startMs:100,endMs:1000,text:''}]));

const fixture=fs.mkdtempSync(path.join(root,'work/v19-render-contract-'));
try{
 fs.mkdirSync(path.join(fixture,'src'),{recursive:true});fs.mkdirSync(path.join(fixture,'public/assets/v19'),{recursive:true});
 const entryPoint=path.join(fixture,'src/index-launch-v19.tsx'),audioPath=path.join(fixture,'public/audio/launch-v19-master.wav'),manifestPath=path.join(fixture,'runtime.json');
 fs.writeFileSync(entryPoint,"import './child.ts'; const u=staticFile('assets/v19/picture.svg'); const font=new FontFace('Launch Sans', `url(${staticFile('assets/v19/typeface.ttf')})`);");
 fs.writeFileSync(path.join(fixture,'src/child.ts'),'export const child=42;');
 fs.writeFileSync(path.join(fixture,'public/assets/v19/picture.svg'),'<svg/>');
 fs.writeFileSync(path.join(fixture,'public/assets/v19/typeface.ttf'),'font-placeholder');
 const manifest={schema:'launch-v19-runtime-v1',publicAssets:[],sourceDependencies:[]};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 let result=collectLaunchInputs({root:fixture,entryPoint,audioPath,manifestPath});
 test('closure-recurses-import',()=>assert.ok(result.sourceFiles.includes(path.join(fixture,'src/child.ts'))));
 test('closure-finds-static-public-asset',()=>assert.ok(result.publicFiles.includes(path.join(fixture,'public/assets/v19/picture.svg'))));
 test('closure-finds-fontface-template-static-asset',()=>assert.ok(result.publicFiles.includes(path.join(fixture,'public/assets/v19/typeface.ttf'))));
 test('missing-entry-is-pending',()=>assert.ok(collectLaunchInputs({root:fixture,entryPoint:path.join(fixture,'src/missing.tsx'),audioPath,manifestPath}).pending.includes('src/missing.tsx')));
 fs.writeFileSync(manifestPath,JSON.stringify({...manifest,publicAssets:['../../outside']}));
 rejects('reject-public-escape',()=>collectLaunchInputs({root:fixture,entryPoint,audioPath,manifestPath}));
 fs.writeFileSync(manifestPath,JSON.stringify({...manifest,publicAssets:['assets/v19']}));
 rejects('reject-public-directory',()=>collectLaunchInputs({root:fixture,entryPoint,audioPath,manifestPath}));
 fs.writeFileSync(manifestPath,JSON.stringify({...manifest,sourceDependencies:['../outside.ts']}));
 rejects('reject-source-escape',()=>collectLaunchInputs({root:fixture,entryPoint,audioPath,manifestPath}));
 fs.writeFileSync(manifestPath,JSON.stringify({...manifest,schema:'launch-v17-runtime-v1'}));
 rejects('reject-previous-manifest',()=>collectLaunchInputs({root:fixture,entryPoint,audioPath,manifestPath}));
}finally{
 // Only the fresh, verified fixture subtree is removed.
 const relative=path.relative(path.join(root,'work'),fixture);
 if(!relative.startsWith('v19-render-contract-')||relative.includes(path.sep)||!fs.lstatSync(fixture).isDirectory())throw Error('Fixture cleanup escaped expected subtree');
 fs.rmSync(fixture,{recursive:true});
}
const report={schema:'v19-render-contract-test-v1',passed:true,count:checks.length,checks};
fs.mkdirSync(path.join(root,'research/qa'),{recursive:true});
fs.writeFileSync(path.join(root,'research/qa/v19-render-contract-tests.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,count:checks.length}));
