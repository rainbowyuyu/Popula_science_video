import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
function edit(rel,fn){const p=path.join(root,rel);const old=fs.readFileSync(p,'utf8');const fresh=fn(old);if(fresh===old)throw Error('No change '+rel);const b=path.join(root,'work/v03/prepatch',rel);if(fs.existsSync(b))throw Error('Patch already applied '+rel);fs.mkdirSync(path.dirname(b),{recursive:true});fs.writeFileSync(b,old);fs.writeFileSync(p,fresh);}
function one(text,a,b){if(text.split(a).length!==2)throw Error('Not unique '+a.slice(0,70));return text.replace(a,b);}
edit('source/v01/src/VehicleStage.tsx',s=>{
 s=one(s,"import meshData from '../../../assets/v01/teaching-car.mesh.json';","import meshData from '../../../assets/v03/teaching-car.mesh.json';\nimport {layoutFor} from './stage-layout.mjs';");
 s=one(s,'scene:string;frame:number;','scene:string;phase:string;frame:number;');
 const begin=s.indexOf('// One camera driver'),end=s.indexOf('const Car:');if(begin<0||end<begin)throw Error('camera markers');s=s.slice(0,begin)+s.slice(end);
 const a=s.indexOf('const chipWidth='),b=s.indexOf(' return <div style={{width:VW',a);if(a<0||b<a)throw Error('layout markers');
 s=s.slice(0,a)+`export const VehicleStage:React.FC<{state:State}>=({state:s})=>{
 const {camera,project,p,box,com,chips}=useMemo(()=>layoutFor(s),[s]);
 const trail=s.trail.map(project).map((v:number[])=>v.join(',')).join(' ');
 const ground=project(s.groundMark);
 const carPx=project([s.c[0]+1,s.c[1],s.c[2]])[0]-p[0];
 const cLabelX=com.x,cLabelY=com.y+24;
 const lines:string[]=[];
 for(let i=-7;i<=7;i++){
  const a=project([i,-7,-2.2]),b=project([i,7,-2.2]),c=project([-7,i,-2.2]),d=project([7,i,-2.2]);
  lines.push(\`M\${a}L\${b}M\${c}L\${d}\`);
 }
`+s.slice(b);
 s=one(s,'pos,width,height,mid','pos,width,height');
 s=one(s,'y2={p[1]-30}','y2={cLabelY}');
 s=one(s,"x={cLabelX+(centroidSide==='right'?0:0)} y={p[1]-36} textAnchor={cLabelAnchor}","x={cLabelX} y={cLabelY-5} textAnchor=\"start\"");
 return s;
});
edit('source/v01/src/Preview.tsx',s=>{
 s=one(s,"'../timeline-preview.json'","'../timeline-crosschecked.json'");s=one(s,"'../physics/preview-frames-v3.json'","'../physics/preview-frames-v4.json'");
 s=one(s,"{s.u<.18?'① 加速转动，约 1.25 圈':s.u<.82?'② 关闭喷口，转动继续':'③ 反向力矩，减速停转'}","{s.phase==='accelerate'?'① 推力力偶启动转动':s.phase==='coast'?'② 关喷口，转动继续':s.phase==='brake'?'③ 反向力矩制动':'④ 已停转，仍在下落'}");
 s=one(s,"<div style={{fontSize:41,marginTop:32}}>ΣF喷口 = 0</div>","<div style={{fontSize:41,marginTop:32}}>ΣF喷口 = 0</div>");
 return s;
});
