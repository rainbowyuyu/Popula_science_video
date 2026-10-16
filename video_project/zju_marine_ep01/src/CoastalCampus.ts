import * as T from 'three';
import {mergeGeometries,mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {loadCoastalNaturalAssets,loadGrassGroundMaterial,loadCampusSurfaceMaterials,type NaturalTreePlacement,type NaturalShrubPlacement} from './CoastalNaturalAssets';
const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const mat=(c:string,r=.8,m=0)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m});
function box(g:T.Object3D,p:number[],s:number[],m:T.Material){
 const geo=new T.BoxGeometry(...s as [number,number,number]);
 // Metric UVs keep the aggregate/grout the same size on a long road and a step.
 const metres=m.userData.metresPerTile as number|undefined;
 if(metres){const pos=geo.attributes.position,norm=geo.attributes.normal,uv=geo.attributes.uv;for(let i=0;i<pos.count;i++){const x=pos.getX(i)+p[0],y=pos.getY(i)+p[1],z=pos.getZ(i)+p[2];if(Math.abs(norm.getY(i))>.5)uv.setXY(i,x/metres,z/metres);else if(Math.abs(norm.getZ(i))>.5)uv.setXY(i,x/metres,y/metres);else uv.setXY(i,z/metres,y/metres);}}
 const q=new T.Mesh(geo,m);q.position.fromArray(p);q.castShadow=q.receiveShadow=true;g.add(q);return q;
}
function pole(g:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m:T.Material){const q=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),8),m);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());q.castShadow=true;g.add(q);return q;}
/** Static campus detail is batched by material; the animated narrative lamp stays
 * independent. No pruning of geometry or camera-driven appearance/disappearance. */
function batchCampus(group:T.Group,lamp:T.Group){
 group.updateMatrixWorld(true);const bins=new Map<T.Material,T.BufferGeometry[]>(),old:T.Mesh[]=[];
 group.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh||(m as T.InstancedMesh).isInstancedMesh||Array.isArray(m.material))return;for(let p:T.Object3D|null=m;p;p=p.parent)if(p===lamp)return;let geo=m.geometry.clone();geo.applyMatrix4(m.matrixWorld);if(geo.index)geo=geo.toNonIndexed();for(const key of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(key))geo.deleteAttribute(key);if(!geo.attributes.uv)geo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));const arr=bins.get(m.material)??[];arr.push(geo);bins.set(m.material,arr);old.push(m);});
 for(const mesh of old){mesh.removeFromParent();mesh.geometry.dispose();}
 for(const [material,geos] of bins){const geo=mergeGeometries(geos,false);if(!geo)throw Error('Campus material batch failed');const mesh=new T.Mesh(geo,material);mesh.name='CampusStatic_'+material.uuid.slice(0,6);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);geos.forEach(g=>g.dispose());}
}
export function createCoastalCampus(){
 const group=new T.Group();group.name='CoastalCampus';
 const concrete=mat('#b7b8ad',.86),asphalt=mat('#424c50',.97),brick=mat('#c9c2b2'),brickCool=mat('#b8c0ba'),glass=mat('#506a72',.31,.20),glassPale=mat('#768b8e',.34,.16),glassDark=mat('#293e49',.35,.18),trim=mat('#979f99',.82,.04),windowFrame=mat('#344b52',.68,.18),reveal=mat('#6d7978',.90,.02),steel=mat('#294650',.4,.62),sand=mat('#b9b398',.95),stripe=mat('#ddd7b5'),leaves=[mat('#38594c',.72,.02),mat('#50684d',.72,.02),mat('#648063',.74,.015)],grass=mat('#7f8d71',1),gravel=mat('#8f9588',.94),soil=mat('#666b51',1),wood=mat('#83705b',.87),vent=mat('#717f7e',.55,.45);
 for(const [m,tile] of [[asphalt,5],[concrete,4],[brick,3.6],[brickCool,3.6],[sand,10],[grass,16]] as const)m.userData.metresPerTile=tile;
 // Long, nearly coplanar roads need a stable depth bias against the campus
 // slab at the far end of the aerial rail. The offset keeps curbs at their
 // authored height while preventing road texture flicker and disappearance.
 for(const surface of [concrete,asphalt,trim,stripe]){
  surface.polygonOffset=true;
  surface.polygonOffsetFactor=-1.5;
  surface.polygonOffsetUnits=-1.5;
 }
 // Thermoplastic lane paint is a separate thin physical surface. A stronger
 // depth bias keeps its narrow silhouettes from losing to the road at distance.
 stripe.polygonOffsetFactor=-2.4;stripe.polygonOffsetUnits=-3.0;
 leaves.forEach(m=>{m.side=T.DoubleSide;m.flatShading=false;});
 // Pull the grass towards the viewer. A positive offset made the lower sand
 // slab overtake it in the distance and produced a moving beige/green seam.
 grass.polygonOffset=true;grass.polygonOffsetFactor=-1;grass.polygonOffsetUnits=-1;
 // Tree slots are collected alongside the campus layout.  The CC0 geometry is
 // attached after batching as shared InstancedMeshes, so roads and buildings
 // keep their exact coordinates and sight lines.
 const naturalPlacements:NaturalTreePlacement[]=[],shrubPlacements:NaturalShrubPlacement[]=[];
 const shrub=(x:number,y:number,z:number,height:number,width:number,rotation=0)=>shrubPlacements.push({x,y,z,height,width,rotation});
 box(group,[-2395,-10.65,0],[3210,24,4800],sand);
 box(group,[-2395,2.05,0],[3200,.18,4800],grass);
 // Keep the established coastline vertices exactly: camera rail and crossings
 // depend on this shore slope and world-water intersection.
 const p:number[]=[],su:number[]=[],ix:number[]=[];for(let z=0;z<=180;z++)for(let x=0;x<=36;x++){const px=-790+x*4,py=2.05-x*1.3;p.push(px,py,-2400+z*(4800/180));su.push(px/10,(-2400+z*(4800/180))/10);}
 for(let z=0;z<180;z++)for(let x=0;x<36;x++){const a=z*37+x;ix.push(a,a+37,a+1,a+1,a+37,a+38);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(su,2));geo.setIndex(ix);geo.computeVertexNormals();const slope=new T.Mesh(geo,sand);slope.receiveShadow=true;group.add(slope);
 // The road sits just above the beach shoulder.  A thin raised kerb and a
 // narrow drainage strip keep the sea mask from visually washing over the
 // asphalt in the long shoreline dolly.
 box(group,[-807,2.20,0],[20,.24,1900],concrete);box(group,[-837,2.27,0],[28,.16,1900],asphalt);
 // The campus road is a T junction at z=55. Keep only the seaward curb
 // continuous; the inland curb/sidewalk end at the side-road opening.
 const junctionMin=46.5,junctionMax=63.5;
 const inlandSegments:[[number,number],[number,number]]=[[-950,junctionMin],[junctionMax,950]];
 box(group,[-822.8,2.31,0],[.45,.30,1900],trim);
 for(const [from,to]of inlandSegments){const center=(from+to)/2,length=to-from;box(group,[-851.2,2.31,center],[.45,.30,length],trim);box(group,[-856,2.23,center],[6.6,.18,length],concrete);}
 for(let i=0;i<90;i++){const z=-900+i*20;if(z+4>=junctionMin&&z-4<=junctionMax)continue;box(group,[-837,2.365,z],[.22,.015,8],stripe);}
 box(group,[-970,2.27,55],[254,.16,14],asphalt);
 for(let i=0;i<23;i++){const x=-845-i*11;if(x+2>-858)continue;box(group,[x,2.365,55],[4,.015,.18],stripe);}
 // Raised road kerbs, continuous pavement and planting strips give the site a
 // usable pedestrian scale. The actual roads remain in their previous positions.
 // Side-road edging stops outside the main carriageway, instead of carrying
 // white bars across the intersection. No overlapping duplicate curb set.
 const sideRoadStart=-1097,sideRoadEnd=-851.45;
 for(const z of [46.9,63.1])box(group,[(sideRoadStart+sideRoadEnd)/2,2.32,z],[sideRoadEnd-sideRoadStart,.22,.35],trim);
 for(let i=0;i<8;i++)box(group,[-837,2.368,79+i*2.4],[21,.02,1.05],stripe);
 for(let i=0;i<47;i++)box(group,[-807,2.335,-920+i*40],[19,.02,.035],gravel);
 const buildings:{x:number;z:number;w:number;h:number}[]=[];
 for(let i=0;i<11;i++){
  const x=-922-(i%4)*83,z=([-250,-90,155][Math.floor(i/4)]),h=20+(i*7)%24,w=38+(i%3)*6;buildings.push({x,z,w,h});
  // Three facade families share coordinates but have distinct massing and depth.
  box(group,[x,h/2+2.3,z],[w,h,49],i%3===1?brickCool:brick);
  if(i%3===0){box(group,[x-w*.25,h+4.65,z-9],[w*.48,4.5,26],brickCool);box(group,[x-w*.25,h+6.96,z-9],[w*.50,.22,26.4],trim);}
  if(i%3===2){box(group,[x+w*.37,h/2+2.35,z-13],[w*.20,h+.1,22.5],brickCool);}
  box(group,[x,2.8,z],[w+.18,1,49.18],concrete);
  box(group,[x,h+2.4,z],[w+1.4,.9,50.4],trim);
  // Shallow roof gravel and a perimeter capping prevent a featureless white slab.
  box(group,[x,h+2.89,z],[w-.8,.045,47.8],gravel);
  const floors=Math.floor(h/4.2),cols=6;
  // Four real facade orientations: no blank back or side when the camera circles.
  for(const side of [-1,1]){
   for(let floor=0;floor<floors;floor++){
    const yy=5+floor*4.2;
    for(let col=0;col<cols;col++){
     const xx=x-w/2+4.4+col*(w-8)/5,gm=(floor+col+i)%5===0?glassPale:(floor*3+col+i)%7===0?glassDark:glass;
     box(group,[xx,yy,z+side*24.58],[3.1,2.45,.12],gm);
     // Window reveal has physical depth: glass sits behind the outer jambs.
     for(const edge of [-1,1])box(group,[xx+edge*1.63,yy,z+side*24.79],[.10,2.58,.29],windowFrame);
     box(group,[xx,yy+1.30,z+side*24.79],[3.30,.10,.29],windowFrame);
     box(group,[xx,yy+.45,z+side*24.68],[3.05,.075,.07],steel);
     if(i%3===1)box(group,[xx,yy+1.47,z+side*25.17],[3.65,.10,1.14],windowFrame);
     box(group,[xx,yy-1.24,z+side*24.78],[3.28,.10,.31],windowFrame);
     box(group,[xx,yy,z+side*24.70],[.08,2.43,.12],windowFrame);
    }
    box(group,[x,yy+1.5,z+side*24.72],[w+.04,.085,.22],reveal);
    for(let col=0;col<7;col++){
     const zz=z-20+col*6.65,gm=(floor+col+i)%6===0?glassPale:glass;
     box(group,[x+side*(w/2+.065),yy,zz],[.13,2.45,3.8],gm);
     for(const edge of [-1,1])box(group,[x+side*(w/2+.23),yy,zz+edge*1.99],[.29,2.58,.10],windowFrame);
     box(group,[x+side*(w/2+.23),yy+1.31,zz],[.29,.10,4.02],windowFrame);
     box(group,[x+side*(w/2+.25),yy-1.24,zz],[.31,.10,4.02],windowFrame);
     box(group,[x+side*(w/2+.16),yy,zz],[.15,2.43,.08],windowFrame);
    }
    box(group,[x+side*(w/2+.20),yy+1.5,z],[.22,.085,49.10],reveal);
   }
   for(const xx of [x-w/2+.2,x+w/2-.2])box(group,[xx,h/2+2.3,z+side*24.78],[.12,h,.15],reveal);
   // A low parapet reveals roof thickness while keeping existing silhouettes.
   box(group,[x,h+3.03,z+side*24.7],[w+.9,.46,.35],concrete);
   box(group,[x+side*(w/2+.30),h+3.03,z],[.35,.46,49.6],concrete);
  }
  // Entrance canopy, paired doors and circulation paving; daylight glazing.
  box(group,[x,3.8,z+24.8],[6,3,.2],glassDark);box(group,[x,5.45,z+26.2],[8,.22,3.4],trim);
  for(const dx of [-3.5,3.5])pole(group,v(x+dx,2.35,z+27.55),v(x+dx,5.45,z+27.55),.10,steel);
  box(group,[x,2.23,z+29.1],[10,.16,9],concrete);box(group,[x,2.28,z+24.98],[7,.2,1.15],concrete);
  // Rooftop service enclosure, air-handling plant and low solar arrays.
  box(group,[x-7,h+4.15,z-8],[7,2.6,7],brickCool);box(group,[x-7,h+5.50,z-8],[7.3,.18,7.3],trim);
  for(let k=0;k<3;k++){
   const xx=x+1+k*3.7;box(group,[xx,h+3.5,z-10],[2.7,1.25,4.2],vent);
   for(let j=0;j<5;j++)box(group,[xx-.98+j*.49,h+4.145,z-10],[.055,.04,3.6],steel);
   box(group,[xx,h+3.0,z+7],[3.1,.18,5.2],steel);const panel=box(group,[xx,h+3.2,z+7],[2.9,.08,5],glassDark);panel.rotation.x=-.09;
  }
  // A ground-level entrance forecourt with scale-accurate paving, trees and seating.
  box(group,[x,2.245,z+37.3],[w+6,.15,13.8],concrete);
  for(let joint=-3;joint<=3;joint++)box(group,[x+joint*4.2,2.325,z+37.3],[.025,.012,13.3],gravel);
  for(const zz of [32.8,37.3,41.8])box(group,[x,2.326,z+zz],[w+5.5,.012,.025],gravel);
  for(const side of [-1,1]){const bx=x+side*(w*.36);box(group,[bx,2.62,z+39.8],[5.6,.65,1.3],concrete);box(group,[bx,2.99,z+39.8],[5.5,.10,1.24],wood);}
  // A little planting around each entry, rather than an empty green rectangle.
  for(const side of [-1,1]){
   const px=x+side*9;box(group,[px,2.4,z+29.2],[5,.45,4],concrete);box(group,[px,2.67,z+29.2],[4.65,.08,3.6],soil);
   for(let k=0;k<5;k++)shrub(px-1.6+(k%3)*1.55,2.70,z+28.2+Math.floor(k/3)*1.65,.80+(k%2)*.18,1.45,i+k*2.1);
  }
 }
 // Shallow drainage and road-edge seams remain above, rather than inside, asphalt.
 for(let i=0;i<36;i++){const z=-580+i*35;if(z+.6>=junctionMin&&z-.6<=junctionMax)continue;box(group,[-851,2.36,z],[.55,.025,1.2],steel);for(let j=0;j<4;j++)box(group,[-851,2.38,z-.42+j*.27],[.44,.01,.036],gravel);}
 // The arrival court beside the narrative lamp supplies readable human scale.
 box(group,[-924,2.24,74],[44,.18,15],concrete);
 for(let i=0;i<12;i++)box(group,[-945+i*3.8,2.335,74],[.028,.01,14.5],gravel);
 for(let i=0;i<8;i++){const z=-230+i*94;pole(group,v(-859,2.35,z),v(-859,7.9,z),.075,steel);box(group,[-858.3,7.86,z],[1.8,.12,.46],steel);}
 // A real pedestrian spine connects the courts; the east-west road at z55
 // has a 22m clear corridor. Moving the former z70 row to z155 removes the
 // road-through-building collision and keeps the lamp/shore camera unobstructed.
 // Stop each walkway at the road boundary; coplanar pedestrian slabs under
 // asphalt can flicker under polygon offset at grazing camera angles.
 for(const x of [-967,-1050,-1133])for(const [a,b] of [[-292.5,47],[63,192.5]])box(group,[x,2.245,(a+b)/2],[5.2,.15,b-a],concrete);
 for(const zz of [-207,-47,198])box(group,[-1030,2.245,zz],[290,.15,5.6],concrete);
 box(group,[-936,2.245,79],[77,.15,29],concrete);
 for(let i=0;i<15;i++)box(group,[-972+i*5.2,2.329,79],[.024,.01,28.8],gravel);
 for(const side of [-1,1]){box(group,[-936+side*26,2.65,78],[12,.8,3],concrete);box(group,[-936+side*26,3.1,78],[11.6,.10,2.6],soil);for(let k=0;k<7;k++)shrub(-941+side*26+k*1.65,3.15,78,.90+(k%3)*.10,1.8,k*1.7);}
 const addNaturalTree=(x:number,z:number,i:number,scale:number)=>naturalPlacements.push({x,y:2.30,z,scale,variant:Math.abs(i)%3,broadleaf:i>=500,rotation:(i*1.73)%6.283});
 for(let i=0;i<88;i++){
  const x=-881-(i%8)*34+Math.sin(i*2.01)*5,z=-350+Math.floor(i/8)*76+Math.cos(i*.9)*6;
  if(Math.abs(z-55)<18||buildings.some(b=>Math.abs(x-b.x)<b.w/2+5&&Math.abs(z-b.z)<29))continue;
  if(i%2===0) addNaturalTree(x,z,i,7.5+(i%3)*.85);
 }
 for(let i=0;i<16;i++){const x=-952-(i%4)*37,z=-10+Math.floor(i/4)*38;if(Math.abs(z-55)<16)continue;addNaturalTree(x,z,400+i,7.5+(i%3));}
 // A few larger foreground trees create real depth parallax in the aerial pass;
 // their branched silhouettes are still deterministic and share the same material
 // family as the campus planting, so they do not read as pasted billboard cards.
 for(const [i,z] of [310,170,25,-120,-270,-410].entries()) addNaturalTree(-885,z,300+i,7.9-(i%2)*.45);
 // Low wooded hinterland breaks the flat campus slab/horizon without touching
 // the coastal road or any film camera. Terrain is actual smooth geometry/PBR.
 const hillY=(x:number,z:number)=>{
  const smooth=(q:number)=>{const u=Math.max(0,Math.min(1,q));return u*u*(3-2*u);};
  const edgeBlend=smooth((-x-1260)/220),padBlend=Math.min(...[[-1280,310],[-1460,-320]].map(([px,pz])=>smooth((Math.hypot(x-px,z-pz)-28)/58)));
  return 2.20+edgeBlend*padBlend*(68*Math.exp(-1*((x+1760)/340)**2-((z+180)/700)**2)+51*Math.exp(-1*((x+2390)/520)**2-((z-610)/650)**2)+31*Math.exp(-1*((x+1510)/250)**2-((z+1050)/440)**2)+25*Math.exp(-1*((x+3050)/600)**2-((z+850)/1100)**2));
 };
 const hp:number[]=[],hu:number[]=[],hi:number[]=[];for(let zz=0;zz<=80;zz++)for(let xx=0;xx<=60;xx++){const x=-3900+xx*44,z=-2200+zz*55;hp.push(x,hillY(x,z),z);hu.push((x+2050)/16,(z+1200)/17);}
 for(let zz=0;zz<80;zz++)for(let xx=0;xx<60;xx++){const a=zz*61+xx;hi.push(a,a+61,a+1,a+1,a+61,a+62);}
 const hg=new T.BufferGeometry();hg.setAttribute('position',new T.Float32BufferAttribute(hp,3));hg.setAttribute('uv',new T.Float32BufferAttribute(hu,2));hg.setIndex(hi);hg.computeVertexNormals();const hm=grass.clone();hm.userData.hills=true;const hill=new T.Mesh(hg,hm);hill.castShadow=hill.receiveShadow=true;group.add(hill);
 for(let i=0;i<1500;i++){const cluster=Math.floor(i/25),j=i%25,cx=-1330-(cluster%10)*106+Math.sin(cluster*1.37)*26,cz=-840+Math.floor(cluster/10)*270+Math.cos(cluster*.91)*43,r=8+Math.sqrt(j/25)*77,a=j*2.399+cluster*.73,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if([[-1280,310],[-1460,-320]].some(([px,pz])=>Math.hypot(x-px,z-pz)<40))continue;naturalPlacements.push({x,y:hillY(x,z),z,scale:18+(i%9)*1.45,variant:i%3,forest:i%6!==0,rotation:i*1.81});}
 // Denser irregular belts connect the teaching campus to the wooded hinterland.
 for(let i=0;i<95;i++){const x=-1225-(i%5)*27+Math.sin(i*1.73)*8,z=-630+Math.floor(i/5)*68+Math.cos(i)*12;if([[-1280,310],[-1460,-320]].some(([px,pz])=>Math.hypot(x-px,z-pz)<40))continue;naturalPlacements.push({x,y:hillY(x,z),z,scale:11+(i%4)*1.4,variant:i%3,rotation:i*2.1});}
 // Low promontories continue beyond the authored road ends (|z|>1050).
 // Their varying coastline breaks the rectangular slab without moving a single
 // established road, camera crossing, building or near-shore reference point.
 for(const sign of [-1,1]){
  const vp:number[]=[],vu:number[]=[],vi:number[]=[];
  for(let j=0;j<=48;j++)for(let k=0;k<=16;k++){
   const z=sign*(1050+j*27.8),blend=Math.sin(j/48*Math.PI)*Math.sin(j/48*Math.PI),edge=-790+blend*(235+45*Math.sin(j*.12+sign));
   const u=k/16,x=-795+(edge+130+795)*u,land=Math.max(0,Math.min(1,(edge-x)/140)),y=x<edge?2.18+blend*12*Math.sin(Math.PI*land*.5):2.18-(x-edge)*.26;
   vp.push(x,y,z);vu.push(x/16,z/16);
  }
  for(let j=0;j<48;j++)for(let k=0;k<16;k++){const a=j*17+k;if(sign===1)vi.push(a,a+17,a+1,a+1,a+17,a+18);else vi.push(a,a+1,a+17,a+1,a+18,a+17);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vp,3));geo.setAttribute('uv',new T.Float32BufferAttribute(vu,2));geo.setIndex(vi);geo.computeVertexNormals();const headland=new T.Mesh(geo,grass);headland.name='FarCoastPromontory_'+sign;headland.receiveShadow=true;group.add(headland);
  for(let i=0;i<50;i++){const j=8+(i%34)+Math.sin(i*2)*.5,z=sign*(1050+j*27.8),blend=Math.sin(j/48*Math.PI)**2,edge=-790+blend*(235+45*Math.sin(j*.12+sign)),x=-790+blend*(90+(i%4)*24),land=Math.max(0,Math.min(1,(edge-x)/140)),y=2.18+blend*12*Math.sin(Math.PI*land*.5)-.18;naturalPlacements.push({x,y,z,scale:18+(i%7)*1.4,forest:true,rotation:i*2.13});}
 }
 // Irregular groves sit clear of roads, buildings and the shore-camera corridor.
 // They make connected canopies, rather than widely separated decorative sticks.
 const groveCenters=[[-902,-40],[-985,-20],[-1070,-19],[-1145,-23],[-984,102],[-1060,102],[-1136,101],[-1205,15],[-1205,120],[-891,270],[-942,275]];
 for(let c=0;c<groveCenters.length;c++)for(let j=0;j<5;j++){
  const [cx,cz]=groveCenters[c],a=j*2.399+c*.73,r=7+3*(j%3),x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
  const onRoad=Math.abs(z-55)<15||Math.abs(x+837)<20||[-967,-1050,-1133].some(px=>Math.abs(x-px)<5);
  if(onRoad||buildings.some(b=>Math.abs(x-b.x)<b.w/2+6&&Math.abs(z-b.z)<31))continue;
  addNaturalTree(x,z,500+c*5+j,8.5+(j%3)*1.1);
 }
 // Two staggered grove belts along the public promenade leave the road clear.
 for(let i=0;i<28;i++){const z=-385+i*27;if(Math.abs(z-55)<34)continue;const x=-872-(i%2)*13;addNaturalTree(x,z,700+i,7.5+(i%3));}

 // Roadside avenue and low clipped shrubs mark the public edge of the campus.
 for(let i=0;i<35;i++){
  const z=-540+i*34;if(Math.abs(z-55)<26||i%2===1)continue;addNaturalTree(-869,z,100+i,4.8+(i%3)*.32);
  box(group,[-869,2.27,z],[5.6,.12,5.6],concrete);box(group,[-869,2.34,z],[4.9,.08,4.9],soil);
  for(let k=0;k<6;k++)shrub(-817.7,2.16,z+8+k*1.45,.85+(k%3)*.12,1.8,k*2.1+i);
 }
 // Benches, rail-side bins and simple cycle hoops supply human-scale objects.
 for(let i=0;i<15;i++){
  const z=-340+i*48;for(const dx of [-1.2,1.2])box(group,[-807+dx,2.68,z],[.1,.7,.5],steel);
  for(let k=0;k<4;k++)box(group,[-807,3.04,z-.3+k*.2],[3,.11,.15],wood);
  for(let k=0;k<3;k++)box(group,[-807,3.38+k*.16,z-.38],[3,.12,.10],wood);
  box(group,[-803.7,2.95,z+1.2],[.65,1.2,.65],steel);
 }
 for(let i=0;i<5;i++){const x=-928-i*1.5;pole(group,v(x,2.3,37),v(x,3.05,37),.035,steel);pole(group,v(x,3.05,37),v(x,3.05,38),.035,steel);pole(group,v(x,3.05,38),v(x,2.3,38),.035,steel);}
 const lamp=new T.Group();lamp.name='CampusNarrativeLamp';lamp.position.set(-940,2.25,63);pole(lamp,v(0,0,0),v(0,6,0),.12,steel);pole(lamp,v(0,6,0),v(1.3,6,0),.10,steel);
 const lit=new T.MeshStandardMaterial({color:'#fff1bf',emissive:'#ffd390',emissiveIntensity:2.4});const bulb=box(lamp,[1.3,5.9,0],[1.3,.15,.5],lit);box(lamp,[1.3,6.05,0],[1.5,.1,.65],steel);const point=new T.PointLight('#ffe6ae',20,22,2);point.position.set(1.3,5.75,0);lamp.add(point);group.add(lamp);
 for(let i=0;i<38;i++){const z=-600+i*35;pole(group,v(-800,2.4,z),v(-800,3.5,z),.055,steel);}pole(group,v(-800,3.5,-600),v(-800,3.5,695),.065,steel);
 // Five irregular rock forms with real photographed PBR maps. Each stone is
 // partly buried in the actual beach slope; dense mixed sizes form a revetment,
 // not a necklace of smooth untextured spheres.
 const rockMaterials=Array.from({length:5},(_,i)=>mat(['#a0a7a4','#9ca3a0','#a8aba4','#919b99','#adb1a7'][i],.96));
 const rand=(i:number,k:number)=>{const n=Math.sin(i*12.9898+k*78.233)*43758.5453;return n-Math.floor(n);};
 for(let variant=0;variant<5;variant++){
  let rockGeo:T.BufferGeometry=new T.IcosahedronGeometry(1,3);const rp=rockGeo.attributes.position,uv=rockGeo.attributes.uv;
  for(let i=0;i<rp.count;i++){
   let x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i);const noise=.10*Math.sin(x*4.7+y*3.3+z*5.2+variant)+.045*Math.sin(x*17+y*13+z*11+variant*3);
   x*=1+noise;y*=.78+noise*.5;z*=1+noise;
   // Broken weathered planes and a low underside, with rounded edges between.
   const cut=Math.max(1,(Math.abs(x*.83+z*.57)+Math.abs(y)*.28)/(1.02+variant*.025));x/=cut;z/=cut;y=Math.max(-.58,y);
   rp.setXYZ(i,x,y,z);uv.setXY(i,.5+Math.atan2(z,x)/(Math.PI*2),.5+Math.asin(Math.max(-1,Math.min(1,y/.95)))/Math.PI);
  }
  rockGeo.deleteAttribute('normal');const smoothRock=mergeVertices(rockGeo,.0001);rockGeo.dispose();rockGeo=smoothRock;rockGeo.computeVertexNormals();const count=210,rocks=new T.InstancedMesh(rockGeo,rockMaterials[variant],count),tmp=new T.Object3D();rocks.name='TexturedRevetmentRocks_v'+variant;
  for(let j=0;j<count;j++){
   const i=j*5+variant,lane=i%6,z=-970+Math.floor(i/6)*11.05+rand(i,1)*7.4,x=-788.8+lane*2.65+rand(i,2)*1.9,r=.48+Math.pow(rand(i,3),1.2)*1.65,ground=2.05-(x+790)*.325;
   tmp.position.set(x,ground+r*.17,z);tmp.scale.set(r*(1.0+rand(i,4)*.5),r*(.72+rand(i,5)*.32),r*(.85+rand(i,6)*.55));tmp.rotation.set((rand(i,7)-.5)*.5,rand(i,8)*6.28,(rand(i,9)-.5)*.45);tmp.updateMatrix();rocks.setMatrixAt(j,tmp.matrix);
   rocks.setColorAt(j,new T.Color().setHSL(.13+rand(i,10)*.03,.03+rand(i,11)*.035,.61+rand(i,12)*.14));
  }
  rocks.castShadow=rocks.receiveShadow=true;rocks.instanceMatrix.needsUpdate=true;if(rocks.instanceColor)rocks.instanceColor.needsUpdate=true;rocks.computeBoundingSphere();group.add(rocks);
 }

 batchCampus(group,lamp);
 // Optional CC0 PBR assets are attached after batching, so their instances do
 // not duplicate or z-fight with the campus slab, roads or shrubs.
 const natural=loadCoastalNaturalAssets(group,naturalPlacements,shrubPlacements);
 const naturalReady=Promise.all([natural.ready,loadGrassGroundMaterial(grass),loadCampusSurfaceMaterials({asphalt,concrete,brick,brickCool,sand,rocks:rockMaterials}),loadGrassGroundMaterial(hm).then(()=>{for(const k of ['map','normalMap','roughnessMap'] as const)if(hm[k]){hm[k]=hm[k]!.clone();hm[k]!.repeat.set(1,1);hm[k]!.needsUpdate=true;}})]).then(()=>undefined);
 return {group,lamp,bulb,naturalGroup:natural.group,ready:naturalReady,disposeNatural:natural.dispose,naturalTreeCount:naturalPlacements.length};
}

