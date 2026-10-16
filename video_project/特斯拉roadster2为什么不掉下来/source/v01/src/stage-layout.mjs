import * as THREE from 'three';
export const VW=1280,VH=760;
export const rotateX=(v,a)=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function cameraFor(s){
 const target=new THREE.Vector3(0,0,.1);let zoom=1.55,offset=new THREE.Vector3(6.4,-9.4,5.2);
 if(s.scene==='ballistic'){zoom=1.62;target.set(s.c[0]*.55,0,s.c[2]*.45+.65);offset.set(8.2,-11.4,5.2);}
 if(s.scene==='couple'){zoom=1.5;target.set(0,0,.05);offset.set(7.2,-10.4,5.6);}
 if(s.scene==='fixed'){zoom=1.65;target.set(0,0,.4);offset.set(7,-10,5.3);}
 const h=5.8/zoom,w=h*VW/VH;const camera=new THREE.OrthographicCamera(-w,w,h,-h,.1,200);
 camera.manual=true;camera.up.set(0,0,1);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();camera.updateProjectionMatrix();return camera;
}
export function projectPoint(p,camera){const q=new THREE.Vector3(...p).project(camera);return [(q.x+1)*VW/2,(1-q.y)*VH/2];}
const widthFor=text=>[...text].reduce((n,c)=>n+(/[\u3000-\u9fff\uff00-\uffef]/.test(c)?1:.62),0)*25+28;
export function layoutFor(s){
 const camera=cameraFor(s),project=p=>projectPoint(p,camera),p=project(s.c);
 const corners=[];
 // Covers actual mesh bounds, including tire undersides. All values metres, not pixels.
 for(const x of [-2.15,2.15])for(const y of [-1.14,1.14])for(const z of [-.58,.92])corners.push(project(add(s.c,rotateX([x,y,z],s.phi))));
 const box={minX:Math.min(...corners.map(v=>v[0])),maxX:Math.max(...corners.map(v=>v[0])),minY:Math.min(...corners.map(v=>v[1])),maxY:Math.max(...corners.map(v=>v[1]))};
 const cx=box.maxX+28,cy=box.minY-34;
 const com={x:cx,y:cy,w:64,h:32};
 // Stable named lanes: no side flipping or greedy oscillation during rotation.
 const lane={ '推力 T':0,'重力 mg':2,'推力 A':0,'推力 B':1,'固定喷口推力 T':0,'横向分量':1,'竖直分量':2 };
 const chips=s.arrows.map(a=>{
  const start=project(a.origin),end=project(add(a.origin,a.vector));
  const w=widthFor(a.label),h=38,side=a.side??'left';
  const x=side==='right'?box.maxX+28:box.minX-28-w;
  const y=Math.max(170,p[1]-46)+(lane[a.label]??0)*51;
  return {a,start,end,pos:[x,y],width:w,height:h};
 });
 return {camera,project,p,box,com,chips};
}
