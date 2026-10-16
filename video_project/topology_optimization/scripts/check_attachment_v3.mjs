import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';
fs.mkdirSync('tmp/attachment-check',{recursive:true});
await build({stdin:{contents:`import {World,smooth} from './src/v3/World';import * as THREE from 'three';import sim from './src/v3/simulation.json';window.test={World,smooth,THREE,sim};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,outfile:'tmp/attachment-check/test.js'});
fs.writeFileSync('tmp/attachment-check/index.html','<body style="margin:0"><canvas></canvas><script src="test.js"></script>');
const browser=await openBrowser('chrome',{browserExecutable:path.resolve('node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),chromiumOptions:{gl:'angle'}});
try{
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 await page.goto({url:'file:///'+path.resolve('tmp/attachment-check/index.html').replaceAll('\\','/'),timeout:30000});
 const result=await page.evaluate(()=>{
  const {World,smooth,THREE,sim}=window.test;const world=new World(document.querySelector('canvas'));const rows=[];
  // Non-monotonic seeking detects stale surface transforms as well as normal playback.
  const states=[...Array.from({length:11},(_,i)=>({scene:'manufacture',progress:i/10,line:2,lineProgress:.5,time:i})),
   ...[0,.25,.7,1].flatMap(p=>[{scene:'strip',progress:p,line:3,lineProgress:p,time:30*p},{scene:'grid',progress:p,line:0,lineProgress:p,time:60+p,elapsed:p*1.5,previous:'strip'},{scene:'load',progress:p,line:2,lineProgress:p,time:90+p},{scene:'caveat',progress:p,line:2,lineProgress:p,time:200+p,elapsed:p*1.5,previous:'compare'}]),
   {scene:'manufacture',progress:.5,line:2,lineProgress:.2,time:250},{scene:'solid',progress:.2,line:2,lineProgress:.5,time:25},{scene:'lab',progress:.3,line:2,lineProgress:.2,time:180}];
  for(const s of states){world.render(s);let deform=0;
   if(s.scene==='strip')deform=200*smooth((s.line-2+smooth(s.lineProgress))/1.1);
   if(s.scene==='grid')deform=200*(1-smooth(s.elapsed/1.5));
   if(s.scene==='load')deform=200*smooth(s.progress*2);
   const disp=sim.comparisons[['strip','grid'].includes(s.scene)?'strip':'solid'].displacement;
   const u=[38,39,40].map(y=>disp[y*81+80]);
   const expected=new THREE.Vector3(3.95+u.reduce((a,b)=>a+b[0],0)/3/50*deform,3.9+u.reduce((a,b)=>a+b[1],0)/3/50*deform,.12);
   if(s.scene==='manufacture')expected.applyAxisAngle(new THREE.Vector3(0,1,0),Math.sin(s.progress*Math.PI)*.45);
   world.model.localToWorld(expected);
   const actual=world.arrow.localToWorld(new THREE.Vector3(0,1.4,0));
   const a=actual.clone().project(world.camera),b=expected.clone().project(world.camera);
   const pixels=Math.hypot((a.x-b.x)*960,(a.y-b.y)*540);
   if(pixels>.01||actual.distanceTo(expected)>1e-7)throw Error('Detached: '+JSON.stringify(s));
   rows.push({scene:s.scene,progress:s.progress,errorPixels:pixels});
  }world.dispose();return {passed:true,states:rows.length,maxErrorPixels:Math.max(...rows.map(r=>r.errorPixels)),rows};
 });fs.writeFileSync('research/v3/load-attachment-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,states:result.states,maxErrorPixels:result.maxErrorPixels}));
}finally{await browser.close({silent:true})}
