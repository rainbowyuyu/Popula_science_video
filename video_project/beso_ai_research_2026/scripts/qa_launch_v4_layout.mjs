/** Read measured browser rectangles from the reviewed contact-frame render. */
import fs from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve(process.argv[2]);
const data=JSON.parse(await fs.readFile(path.join(dir,'qa-layout.json'),'utf8'));
const rows=new Map();
for(const s of data.samples){if(s.boxes.some(b=>b.y<-1000))continue;rows.set(s.frame,s);}
const failures=[],checks=[];
const intersect=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
for(const s of rows.values()){
 const brand=s.boxes.find(b=>b.role==='brand'),caption=s.boxes.find(b=>b.role==='caption');
 if(!brand||brand.x<0||brand.y<0||brand.x+brand.width>1920||brand.y+brand.height>1080)failures.push({frame:s.frame,type:'brand_out_of_bounds'});
 if(caption&&(caption.x<0||caption.y<0||caption.x+caption.width>1920.5||caption.y+caption.height>1080.5))failures.push({frame:s.frame,type:'caption_out_of_bounds'});
 const inner=s.local>1.3&&s.boxes.filter(b=>['title','physics-readout','physical-label','topology-stats','proof','web-copy','graph-note','graph-label'].includes(b.role));
 if(inner)for(const b of inner){if(b.x+b.width<0||b.x>1920)continue;if(brand&&intersect(brand,b))failures.push({frame:s.frame,type:'label_brand_collision',role:b.role});if(caption&&intersect(caption,b))failures.push({frame:s.frame,type:'label_caption_collision',role:b.role});}
 const physical=s.boxes.filter(b=>b.role==='physical-label');
 for(let i=0;i<physical.length;i++)for(let j=i+1;j<physical.length;j++)if(intersect(physical[i],physical[j]))failures.push({frame:s.frame,type:'physical_label_overlap'});
 const graph=s.boxes.filter(b=>b.role==='graph-label'&&b.x>0&&b.x+b.width<1920),title=s.boxes.find(b=>b.role==='title');
 for(let i=0;i<graph.length;i++){if(title&&intersect(graph[i],title))failures.push({frame:s.frame,type:'graph_title_overlap'});for(let j=i+1;j<graph.length;j++)if(intersect(graph[i],graph[j]))failures.push({frame:s.frame,type:'graph_label_overlap'});}
 checks.push({frame:s.frame,scene:s.scene,local:s.local,boxCount:s.boxes.length});
}
const report={revision:data.revision,checked:new Date().toISOString(),pass:rows.size>0&&!failures.length,samples:checks,failures,limitation:'Measured safe-area/overlay rectangle checks. Models and generated footage are reviewed separately by contact frames; not a subjective full viewing certificate.'};
await fs.writeFile(path.join(dir,'qa-layout-result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,frames:rows.size,failures},null,2));if(!report.pass)process.exitCode=1;
