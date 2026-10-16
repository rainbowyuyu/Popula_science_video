import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CameraPath} from '../../src/CameraPath';
import {PhysicsPlayback} from '../../src/PhysicsPlayback';
import {stateAt,pulse,mix,V} from '../../src/visual';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const tl=read('src/timeline.json'),manifest=read('public/models/shanghai-tower-manifest.json');
const bytes=fs.readFileSync('public/models/shanghai-tower.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
const physics=new PhysicsPlayback(read('public/physics/response.json'),tl),camera=new T.PerspectiveCamera(34,1920/1080,.005,200),path=new CameraPath(tl);path.setAnchors(manifest.cameraAnchorsThree);
const meshes:T.Mesh[]=[],bounds:any[]=[];
for(const info of manifest.parts.filter((p:any)=>p.role==='facadesupport'||p.role==='floorbeams')){
 const source=gltf.scene.getObjectByName(info.id)!;source.traverse(o=>{if(!(o instanceof T.Mesh))return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01);const mesh=new T.Mesh(geometry,(o.material as T.Material).clone());mesh.name=info.id;mesh.userData.role=info.role;meshes.push(mesh);geometry.computeBoundingBox();const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');let maxRadius=0,maxNormalError=0;for(let i=0;i<p.count;i++){maxRadius=Math.max(maxRadius,Math.hypot(p.getX(i),p.getZ(i)));maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));}bounds.push({id:info.id,role:info.role,vertices:p.count,finitePositions:Array.from(p.array).every(Number.isFinite),normalUnitError:maxNormalError,maxRadiusMetres:maxRadius*100,box:{min:geometry.boundingBox!.min.toArray(),max:geometry.boundingBox!.max.toArray()},sourceMaterialOpacity:(mesh.material as T.Material).opacity});});
}
const result:any={date:new Date().toISOString(),scope:'Read-only GLB and pre-fix World classification diagnostic; raycasts restricted to suspect facade-support meshes, not a full occlusion render; no production edits',bounds,frames:[]};
for(const frame of [2350,3900]){
 const s=stateAt(frame,tl),u=s.n+s.u;physics.update(s);path.apply(camera,s.time);camera.updateMatrixWorld(true);
 const corePlan=pulse(10.1,10.82,11.92,12.58,u),coreSection=pulse(9.98,10.55,11.99,12.62,u),cut=coreSection>0?mix(6.8,1.73701,coreSection):100;
 const classifications=manifest.parts.filter((p:any)=>p.role==='facadesupport'||p.id==='FLOOR_BEAMS_Z03').map((p:any)=>{const id=p.id,slab=/FLOORS|FLOOR_INSPECTION/.test(id),beam=/FLOOR_BEAMS/.test(id),col=/MEGACOL|CORNER/.test(id),truss=/OUTRIGGER|BELT|CONNECTION_PLATES/.test(id)||['outrigger','belt'].includes(p.role),shell=/ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER/.test(id),transparentByCore=slab||beam||col||truss||p.role==='garden'||p.role==='sky_lobby'||p.role==='floorbeams';return{id,role:p.role,shell,truss,beam,transparentByCore,corePlanMultiplier:transparentByCore?1-.985*corePlan:1,castShadow:!/ENVELOPE|FACADE|GLASS/.test(id)};});
 const points=frame===2350?[[420,473],[529,488],[463,299],[765,80],[304,682],[1646,885]]:[[700,315],[776,349],[1590,305],[1822,414],[1134,288]];
 const ray=new T.Raycaster(),hits:any[]=[];
 for(const [x,y] of points){let found:any[]=[];for(let dx=-4;dx<=4;dx+=2)for(let dy=-4;dy<=4;dy+=2){ray.setFromCamera(new T.Vector2((x+dx)/1920*2-1,1-(y+dy)/1080*2),camera);for(const h of ray.intersectObjects(meshes.filter(m=>m.userData.role==='facadesupport'),false)){if(h.point.y>cut+.00001)continue;found.push({id:h.object.name,point:h.point.toArray(),faceIndex:h.faceIndex,pixel:[x+dx,y+dy]});}}hits.push({requestedPixel:[x,y],hitCount:found.length,firstHits:found.slice(0,3)});}
 result.frames.push({frame,clip:s.clip.id,u,corePlan,cut,solverPlayback:physics.play?.kind,solverWeight:physics.play?.weight,camera:camera.position.toArray(),classifications,pixelHits:hits});
}
fs.writeFileSync('research/visual-v3/protrusion-diagnostic.json',JSON.stringify(result,null,2));console.log(JSON.stringify({bounds:bounds.filter(p=>p.role==='facadesupport'),frames:result.frames},null,2));
