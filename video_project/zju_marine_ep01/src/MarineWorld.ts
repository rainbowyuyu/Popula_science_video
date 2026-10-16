import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {staticFile} from 'remotion';
import {chapters,envelope,localTime,smoothstep} from './timeline';
import {createNativeWaterV7} from './NativeWaterV7';
import {createMachineAnatomyController,MachineAnatomyFocus} from './MachineAnatomy';
import {createCoastalCampus} from './CoastalCampus';
import {createJacketFoundation,createLandPileFoundation,createSemisubFoundation,createDetailedTurbinePrototype,cloneDetailedTurbine} from './EngineeringFoundations';
import {createWorldTypography} from './WorldTypography';
import {createMarineAnnotations} from './MarineAnnotations';
import {createNarrativeMechanismsV8} from './NarrativeMechanismsV8';
import {waterHeightAt} from './WaterSurfaceState';

const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const M=(c:string,r=.38,m=.0)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const glow=(c:string,i=.8)=>new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i,roughness:.35});
function box(g:T.Object3D,p:number[],s:number[],m:T.Material){const a=new T.Mesh(new T.BoxGeometry(...s as [number,number,number]),m);a.position.fromArray(p);a.castShadow=true;a.receiveShadow=true;g.add(a);return a;}
function rod(g:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m:T.Material,n=12){const q=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),n),m);q.position.copy(a).add(b).multiplyScalar(.5);q.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());q.castShadow=true;g.add(q);return q;}
function tube(g:T.Object3D,points:T.Vector3[],radius:number,material:T.Material){const c=new T.CatmullRomCurve3(points,false,'centripetal');const q=new T.Mesh(new T.TubeGeometry(c,120,radius,8,false),material);g.add(q);return {curve:c,mesh:q};}
function transparentGroup(group:T.Object3D){group.traverse(o=>{const m=(o as T.Mesh).material;if(m)for(const x of Array.isArray(m)?m:[m]){x.transparent=true;x.depthWrite=false;}});}
function opacity(group:T.Object3D,a:number){group.traverse(o=>{const m=(o as T.Mesh).material;if(m)for(const x of Array.isArray(m)?m:[m])x.opacity=a;});}

function station(){const g=new T.Group();g.position.set(-290,22,-100);g.name='OffshoreSubstation';const steel=M('#59757b',.3,.65),white=M('#dfe5db',.5),orange=M('#da963e',.4,.2),dark=M('#213b45',.55,.2);
 for(const x of [-18,18])for(const z of [-14,14]){rod(g,v(x,-65,z),v(x,-10,z),1.4,steel,20);rod(g,v(x,-56,z),v(-x,-16,z),.43,steel);}
 box(g,[0,-9,0],[48,2,39],steel);box(g,[-9,2,0],[23,20,29],white);const housing=box(g,[9,-2,0],[20,10,28],dark);housing.name='TransformerEnclosure';housing.renderOrder=2;housing.material=dark.clone();housing.material.transparent=true;box(g,[-9,12.6,0],[24,1.2,30],orange);
 for(let i=0;i<8;i++){box(g,[-16+i*2.2,5,14.55],[1.1,2,.12],M('#315263',.2,.35));box(g,[7+i*1.3,-1,14.2],[.32,8,.5],steel);}
 for(let i=0;i<3;i++){rod(g,v(7+i*5,3,-6),v(7+i*5,12,-6),.8,dark);for(let j=0;j<7;j++){const ins=new T.Mesh(new T.CylinderGeometry(1.35,1.35,.28,16),M('#637d83',.2));ins.position.set(7+i*5,4+j,-6);g.add(ins);}}
 for(const y of [-7,13.5]){for(let i=0;i<13;i++){rod(g,v(-23+i*3.8,y,-19),v(-23+i*3.8,y+1.5,-19),.07,orange);rod(g,v(-23+i*3.8,y,19),v(-23+i*3.8,y+1.5,19),.07,orange);}rod(g,v(-23,y+1.5,19),v(23,y+1.5,19),.07,orange);rod(g,v(-23,y+1.5,-19),v(23,y+1.5,-19),.07,orange);}
 rod(g,v(21,1,-16),v(21,24,-16),.38,orange);rod(g,v(21,24,-16),v(34,28,-16),.3,orange);rod(g,v(34,28,-16),v(34,7,-16),.035,dark);return g;
}
function foamLoop(g:T.Object3D,center:T.Vector3,rx:number,rz:number,y:number,color:string,thickness=.075){
 const pts:T.Vector3[]=[];const n=96;for(let i=0;i<n;i++){const a=i*Math.PI*2/n;const wob=1+.045*Math.sin(i*2.7+rx);pts.push(v(center.x+Math.cos(a)*rx*wob,y,center.z+Math.sin(a)*rz*wob));}
 pts.push(pts[0].clone());const curve=new T.CatmullRomCurve3(pts,false,'centripetal');const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false});const mesh=new T.Mesh(new T.TubeGeometry(curve,160,thickness,5,false),mat);mesh.renderOrder=8;g.add(mesh);return mesh;
}
function wakeRibbon(g:T.Object3D,points:T.Vector3[],width:number,color:string){
 const curve=new T.CatmullRomCurve3(points,false,'centripetal');const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide});const mesh=new T.Mesh(new T.TubeGeometry(curve,120,width,7,false),mat);mesh.renderOrder=7;g.add(mesh);return mesh;
}
function beacon(g:T.Object3D,pos:T.Vector3,color:string){
 const mat=glow(color,2.8);const mesh=new T.Mesh(new T.SphereGeometry(.34,16,10),mat);mesh.position.copy(pos);mesh.renderOrder=12;g.add(mesh);const light=new T.PointLight(color,0,24,2);light.position.copy(pos);g.add(light);return {mesh,light,mat};
}

type Moving={mesh:T.Mesh;curve:T.CatmullRomCurve3;phase:number};
export type MarineWorld={scene:T.Scene;camera:T.PerspectiveCamera;renderer:T.WebGPURenderer;model:T.Group;update:(t:number)=>Promise<void>;render:()=>void;capture:(canvas:HTMLCanvasElement)=>Promise<void>;dispose:()=>void};
export async function createMarineWorld(canvas:HTMLCanvasElement):Promise<MarineWorld>{
 const renderer=new T.WebGPURenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 await renderer.init();
 const scene=new T.Scene();const camera=new T.PerspectiveCamera(45,16/9,.45,15000);
 const [asset,hdr]=await Promise.all([new GLTFLoader().loadAsync(staticFile('models/v8/turbine-rayao.glb')),new RGBELoader().loadAsync(staticFile('models/v8/qwantani_late_afternoon_puresky_2k.hdr'))]);
 hdr.mapping=T.EquirectangularReflectionMapping;
 // The same HDR fills every view and powers reflection lighting. Sky's camera-
 // following dome adds WaterPro's fog integration, while this is a complete
 // background even in reflection/near-plane passes.
 scene.background=hdr;scene.backgroundIntensity=.90;
 const pmrem=new T.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(hdr);scene.environment=env.texture;scene.environmentIntensity=.50;pmrem.dispose();
 const model=asset.scene;scene.add(model);
 const captureTarget=new T.RenderTarget(1920,1080,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:false});
 const waterPro=await createNativeWaterV7({renderer,scene,camera,skyTexture:hdr,quality:'high',ownOceanFloor:false,requireWebGPU:true});
 const sun=waterPro.water.lighting.sunLight;
 const shadowAnchor=new T.Vector3();const shadowDirection=new T.Vector3();
 scene.add(sun.target);
 // One solar direction drives water, all models and a tightly focused shadow map.
 waterPro.water.lighting.addSunSyncListener(()=>{
  camera.getWorldDirection(shadowDirection);
  const shadowBlend=smoothstep(85,105,camera.position.y);
  const travel=95+(42-95)*shadowBlend;
  shadowAnchor.copy(camera.position).addScaledVector(shadowDirection,travel);
  sun.target.position.copy(shadowAnchor);
  sun.position.copy(waterPro.water.lighting.sun.direction.value).multiplyScalar(1600).add(shadowAnchor);
  const span=280+(95-280)*shadowBlend;
  Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:2600});sun.shadow.camera.updateProjectionMatrix();
 });
 const rim=new T.DirectionalLight('#b4d9e5',.10);rim.position.set(-350,230,220);scene.add(rim);
 const diveLamp=new T.SpotLight('#b6e3ee',0,140,Math.PI*.32,.78,1.4);diveLamp.castShadow=false;scene.add(diveLamp,diveLamp.target);
 const diveFill=new T.HemisphereLight('#8ebaca','#154155',0);scene.add(diveFill);

 const jacket=createJacketFoundation();scene.add(jacket.group);
 // Contact foam uses the actual waterline footprints rather than one large
 // decorative ring per asset.  Four jacket legs, four substation legs and the
 // three outer semisub columns are kept as separate deterministic bodies; this
 // keeps the foam tight to steel in both the hero close-up and the aerial pass.
 // Tune imported PBR materials for the pale, humid marine light. The source GLB remains
 // untouched; these clones only improve the film render and preserve cutaway opacity.
 model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];const tuned=source.map(src=>{const m=(src as T.MeshStandardMaterial).clone();if((m as any).isMeshStandardMaterial){m.envMapIntensity=0.72;if(m.name.includes('Blade')||o.name.startsWith('Blade')){m.color.set('#e6ece8');m.roughness=.28;}else if(o.name.startsWith('NacelleShell')||o.name==='TowerShell'){m.color.set('#cbd9d9');m.roughness=.26;}else if(m.name.includes('Copper')||o.name.includes('Copper')){m.color.set('#b76435');m.metalness=.76;m.roughness=.22;}else if(m.name.includes('Steel')||o.name.includes('Bearing')){m.roughness=.31;}}return m;});mesh.material=Array.isArray(mesh.material)?tuned:tuned[0];});
 // Keep the outer shell, rotor, generator and converter in one coordinate system.
 // The controller eases opacity/depth-write with absolute-time ramps so internal parts
 // never pop in or out while the camera advances along the rail.
 const prototype=createDetailedTurbinePrototype(model);
 const anatomy=createMachineAnatomyController(model);
 const rotor=model.getObjectByName('RotorAssembly')!,gen=model.getObjectByName('GeneratorRotor')!;const initialR=rotor.quaternion.clone(),initialG=gen.quaternion.clone();
 const seabed=new T.Group();scene.add(seabed);
 const sg=new T.PlaneGeometry(12000,12000,160,160);sg.rotateX(-Math.PI/2);const positions=sg.attributes.position as T.BufferAttribute;
 for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,-45+.48*Math.sin(x*.027)*Math.cos(z*.034));}sg.computeVertexNormals();
 const sand=M('#c3bda6',.97),rock=M('#8b9186',.96);
 const textureLoader=new T.TextureLoader();
 const loadMap=async(asset:string,file:string,color:boolean,repeat:number)=>{const tex=await textureLoader.loadAsync(staticFile(`models/v8-city/${asset}/${file}.jpg`));tex.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(repeat,repeat);tex.anisotropy=8;return tex;};
 const [sandColor,sandNormal,sandRough,rockColor,rockNormal,rockRough]=await Promise.all([
  loadMap('coast_sand_rocks_02','diff',true,1),loadMap('coast_sand_rocks_02','normal',false,1),loadMap('coast_sand_rocks_02','rough',false,1),
  loadMap('rock_boulder_dry','diff',true,1),loadMap('rock_boulder_dry','normal',false,1),loadMap('rock_boulder_dry','rough',false,1)]);
 Object.assign(sand,{map:sandColor,normalMap:sandNormal,roughnessMap:sandRough});sand.normalScale.set(.36,.36);
 Object.assign(rock,{map:rockColor,normalMap:rockNormal,roughnessMap:rockRough});rock.normalScale.set(.55,.55);
 const sandUV=sg.attributes.uv as T.BufferAttribute;for(let i=0;i<positions.count;i++)sandUV.setXY(i,positions.getX(i)/9,positions.getZ(i)/9);
 const seabottom=new T.Mesh(sg,sand);seabottom.receiveShadow=true;seabed.add(seabottom);
 // Section beds retain the exact jacket mudline. Below-ground piles are seen through this local teaching window.
 const strata=['#ada387','#978c74','#76827d'];for(let i=0;i<3;i++){const m=sand.clone();m.color.set(strata[i]);m.transparent=true;m.opacity=.055;m.depthWrite=false;const layer=box(seabed,[0,-49-i*8,0],[38,7,38],m);layer.castShadow=false;}
 const stoneGeometry=new T.IcosahedronGeometry(1,2),sp=stoneGeometry.attributes.position as T.BufferAttribute;
 for(let i=0;i<sp.count;i++){const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i),r=1+.16*Math.sin(x*6.7+y*4.1)*Math.cos(z*5.3)+.09*Math.sin(y*8.3-z*2.2);sp.setXYZ(i,x*r,y*r,z*r);}stoneGeometry.computeVertexNormals();
 const gravel=new T.InstancedMesh(stoneGeometry,rock,500),tmp=new T.Object3D();for(let i=0;i<500;i++){const a=i*2.39996,r=14+Math.sqrt(((i*73)%499)/499)*130,x=Math.cos(a)*r,z=Math.sin(a)*r;tmp.position.set(x,-45+.48*Math.sin(x*.027)*Math.cos(z*.034)-.13,z);tmp.scale.set(.55+(i%7)*.13,.42+(i%4)*.12,.6+(i%5)*.15);tmp.rotation.set(i*.27,i*.77,i*.19);tmp.updateMatrix();gravel.setMatrixAt(i,tmp.matrix);}gravel.castShadow=gravel.receiveShadow=true;seabed.add(gravel);
 const sub=station();scene.add(sub);const shore=createCoastalCampus();scene.add(shore.group);
 // Wait for the optional CC0 vegetation/PBR terrain maps before the first
 // capture. This keeps frame 0 deterministic while the synchronous campus
 // geometry and camera rail remain unchanged if an asset is unavailable.
 await shore.ready;
 // Navigation and obstruction lights supply a practical scale cue at nightfall and
 // keep the silhouette readable while the camera climbs from the foundation.
 const beacons:ReturnType<typeof beacon>[]=[];const beaconGroup=new T.Group();scene.add(beaconGroup);
 beacons.push(beacon(beaconGroup,v(0,146.8,0),'#ff6a55'));beacons.push(beacon(beaconGroup,v(-10,155.6,0),'#ffb85c'));beacons.push(beacon(beaconGroup,v(-290,29,-100),'#ffbc6e'));beacons.push(beacon(beaconGroup,v(-940,7.3,55),'#ffd389'));
 const fleet:{g:T.Group;r:T.Group;offset:number}[]=[];
 for(const [i,p] of [[-250,0,-500],[300,0,-650],[650,0,-330],[-600,0,-900]].entries()){
  const x=cloneDetailedTurbine(prototype);x.g.position.fromArray(p);const f=createJacketFoundation();x.g.add(f.group);scene.add(x.g);fleet.push({...x,offset:i});
 }
 // A separate semi-sub appears only where the narration introduces deeper water.
 const floating=cloneDetailedTurbine(prototype);floating.g.position.set(250,0,-230);const semi=createSemisubFoundation();floating.g.add(semi.group);scene.add(floating.g);
 const mechanisms=createNarrativeMechanismsV8(scene,model,floating.g);
 // Land turbines use the same detailed assembly on a piled concrete cap; scale is explicitly pedagogical.
 for(const [i,p] of [[-1280,0,310],[-1460,0,-320]].entries()){
  const x=cloneDetailedTurbine(prototype);x.g.scale.setScalar(.72);x.g.position.set(p[0],2.2-14*.72,p[2]);const f=createLandPileFoundation({groundY:14,soil:true});x.g.add(f.group);scene.add(x.g);fleet.push({...x,offset:i+5});
 }
 const typography=createWorldTypography(scene,camera);
 const annotations=createMarineAnnotations(scene);
 // Cable is one continuous route from the turbine through the offshore station to shore.
 const power=new T.Group();scene.add(power);const cablePoints=[v(1,149,0),v(0,140,0),v(0,15,0),v(8,-40,0),v(-115,-43,-28),v(-285,-43,-100),v(-300,17,-100),v(-310,-40.8,-100),v(-580,-40.8,-25),v(-643,-40.8,20),v(-680,-32.5,39),v(-720,-19.5,50),v(-755,-8.3,54),v(-780,-.8,55),v(-790,1,55),v(-798,1,55),v(-835,1,55),v(-900,1,55),v(-940,1,55)];
 const cable=tube(power,cablePoints,.30,M('#243c47',.45,.55));const energyMat=new T.MeshBasicMaterial({color:'#ffc566',transparent:true,opacity:.95});const energy=tube(power,cablePoints,.33,new T.MeshBasicMaterial({color:'#dba959',transparent:true,opacity:.24}));const pulses:Moving[]=[];for(let i=0;i<30;i++){const q=new T.Mesh(new T.SphereGeometry(.38,8,6),energyMat);power.add(q);pulses.push({mesh:q,curve:cable.curve,phase:i/30});}
 // Streamlines are pinned to the windward rotor region, with a pressure-side accent.
 const wind=new T.Group();scene.add(wind);const windPaths:Moving[]=[];for(let i=0;i<16;i++){const y=78+(i%4)*36,z=-65+Math.floor(i/4)*43;const pts=[v(180,y,z),v(100,y,z),v(22,y+2*Math.sin(i),z),v(-95,y-8,z+8)];const a=tube(wind,pts,.16,new T.MeshBasicMaterial({color:i%2?'#8de2ed':'#d3f5f2',transparent:true,opacity:.4}));const q=new T.Mesh(new T.SphereGeometry(.75,8,6),new T.MeshBasicMaterial({color:'#f0fffd',transparent:true}));wind.add(q);windPaths.push({mesh:q,curve:a.curve,phase:i/16});}transparentGroup(wind);
 // Magnetic flux bows between rotor and stator, synchronized with the rotating machine.
 const flux=new T.Group();flux.position.set(1,150,0);scene.add(flux);for(let i=0;i<12;i++){const a=i*Math.PI/6;const pts=[v(-1,3.9*Math.cos(a),3.9*Math.sin(a)),v(-1.6,4.4*Math.cos(a+.08),4.4*Math.sin(a+.08)),v(-1,4.8*Math.cos(a+.2),4.8*Math.sin(a+.2)),v(1.5,4.8*Math.cos(a+.2),4.8*Math.sin(a+.2)),v(2.1,4.4*Math.cos(a+.08),4.4*Math.sin(a+.08)),v(1.5,3.9*Math.cos(a),3.9*Math.sin(a))];tube(flux,pts,.025,new T.MeshBasicMaterial({color:i%2?'#80e4ed':'#ffba64',transparent:true,opacity:.9}));}transparentGroup(flux);
 // Converter schematic occupies the physical cabinet area, gently unfolding outward.
 const circuit=new T.Group();circuit.position.set(-9.3,151.4,5.8);scene.add(circuit);const waveMats=[new T.LineBasicMaterial({color:'#59cddd',transparent:true}),new T.LineBasicMaterial({color:'#f2bb67',transparent:true}),new T.LineBasicMaterial({color:'#8fdcc3',transparent:true})];const waves:T.Line[]=[];for(let i=0;i<3;i++){const arr=new Float32Array(120*3);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(arr,3));const line=new T.Line(geo,waveMats[i]);circuit.add(line);waves.push(line);}transparentGroup(circuit);
 // A pair of transformer windings uses the same electrical path near the tower base.
 const transformer=new T.Group();transformer.position.set(-278,19,-97);scene.add(transformer);const core=M('#536773',.4,.65);box(transformer,[0,0,0],[6.5,.7,4],core);box(transformer,[0,5.5,0],[6.5,.7,4],core);for(const x of [-2.3,2.3])box(transformer,[x,2.7,0],[.65,5.8,4],core);for(let i=0;i<19;i++){const ring=new T.Mesh(new T.TorusGeometry(1.3,.12,8,40),M(i<6?'#f2b36b':'#ad6335',.26,.7));ring.rotation.x=Math.PI/2;ring.position.set(i<6?-2.3:2.3,.5+(i<6?i*.8:(i-6)*.37),0);transformer.add(ring);}transformer.traverse(o=>{const m=(o as T.Mesh).material;if(m)for(const x of Array.isArray(m)?m:[m]){x.transparent=false;x.depthWrite=true;}});
 const towerTransformer=transformer.clone(true);towerTransformer.position.set(0,18,0);towerTransformer.scale.setScalar(.8);towerTransformer.name='TowerBaseTransformer';scene.add(towerTransformer);
 const stationShell=sub.getObjectByName('TransformerEnclosure') as T.Mesh;
 const technical=new T.Group();scene.add(technical);for(const r of [120,123]){const c=new T.EllipseCurve(0,0,r,r,0,Math.PI*2,false,0);const points=c.getPoints(180).map(p=>v(14,150+p.x,p.y));const l=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#aad2d6',transparent:true,opacity:.25}));technical.add(l);}transparentGroup(technical);
 const axis=new T.Vector3(1,0,0);const q=new T.Quaternion();
 const update=async(t:number)=>{const o=localTime('overview',t),overview=envelope('overview',t,2);const intern=Math.max(envelope('rotor',t,5),envelope('generator',t,5),envelope('converter',t,5));const foundation=Math.max(envelope('transformer',t,5),envelope('cable',t,5),overview*(smoothstep(.25,.34,o)*(1-smoothstep(.64,.73,o))));

  const focus:MachineAnatomyFocus=chapters.find(s=>t>=s.start&&t<s.end)?.id==='rotor'?'rotor':chapters.find(s=>t>=s.start&&t<s.end)?.id==='generator'?'generator':chapters.find(s=>t>=s.start&&t<s.end)?.id==='converter'?'converter':chapters.find(s=>t>=s.start&&t<s.end)?.id==='cable'?'cable':'whole';
  anatomy.setFocus(focus,t);anatomy.update(t);
  q.setFromAxisAngle(axis,t*.19);rotor.quaternion.copy(initialR).multiply(q);gen.quaternion.copy(initialG).multiply(q);fleet.forEach(x=>x.r.rotation.x=t*.16+x.offset);floating.r.rotation.x=t*.18;
  // Read the same absolute-time wave field at the three buoyancy columns.
  // The limited response is an explanatory rigid-body motion, not a claimed
  // hydrodynamic solve, but it now follows the water rather than an unrelated
  // sine. Spatial averaging gives the large platform its expected inertia.
  renderer.toneMappingExposure=.94;
  const blink=.18+.82*(.5+.5*Math.sin(t*Math.PI*2*.72));beacons.forEach((b,i)=>{b.light.intensity=blink*(i===3?1.6:2.2);b.mat.emissiveIntensity=1.8+blink*2.2;});
  const windA=envelope('wind',t,5);opacity(wind,windA*.25);windPaths.forEach(p=>p.mesh.position.copy(p.curve.getPoint((p.phase+t*.045)%1)));
  opacity(flux,envelope('generator',t,4)*.9);flux.rotation.x=t*.19;opacity(circuit,envelope('converter',t,4));waves.forEach((l,i)=>{const a=l.geometry.attributes.position as T.BufferAttribute;for(let j=0;j<120;j++){const x=j/119*6-3;const y=i===1?.16*Math.sin(x*25-t*6):Math.sin(x*(i===0?3.7+Math.sin(t*.3)*.5:4)-t*3)*(i===0?.7:.7);a.setXYZ(j,x,y-i*2.4,0);}a.needsUpdate=true;});
  const tx=envelope('transformer',t,4);
  // Let the station register as a solid object for the first beat of the
  // transformer chapter, then reveal the windings.  The short hold prevents a
  // shell pop while the camera and the electrical path settle on the station.
  const shellReveal=smoothstep(.28,.72,tx);
  opacity(transformer,1);const sm=stationShell.material as T.MeshStandardMaterial;sm.opacity=1-shellReveal*.94;sm.depthWrite=sm.opacity>.985;stationShell.castShadow=sm.opacity>.96;opacity(technical,envelope('wind',t,4)*.08);energy.mesh.material.opacity=Math.max(envelope('shore',t,6),envelope('cable',t,5),tx)*.38;pulses.forEach(p=>{p.mesh.position.copy(p.curve.getPointAt((p.phase+t*.018)%1));p.mesh.scale.setScalar(.5+Math.max(envelope('cable',t,5),envelope('shore',t,5))*.9);});
  typography.update(t,camera);
  annotations.update(t,envelope('wind',t,1.4),envelope('rotor',t,1.4));
  // All positions, ghost materials and world titles are frozen before both captures.
  const wet=smoothstep(2,-2,camera.position.y);
  diveLamp.intensity=wet*7200;diveFill.intensity=wet*.65;renderer.toneMappingExposure=.94+wet*.10;
  const gaze=camera.getWorldDirection(new T.Vector3());
  diveLamp.position.copy(camera.position).add(new T.Vector3(8,5,4));diveLamp.target.position.copy(camera.position).addScaledVector(gaze,38);
  await waterPro.update(t);
  // Native getHeightAt owns one shared query buffer; serialize reads so columns
  // do not overwrite each other's positions while the GPU mapping is pending.
  const heights:number[]=[];
  for(const [x,z] of [[51.75,0],[-25.875,44.817],[-25.875,-44.817]])heights.push(await waterPro.surfaceHeightAt(250+x,-230+z));
  const [h0,h1,h2]=heights;
  floating.g.position.y=(h0+h1+h2)/3*.24;
  floating.g.rotation.z=Math.max(-.012,Math.min(.012,(h0-(h1+h2)*.5)/77.625*.3));
  floating.g.rotation.x=Math.max(-.012,Math.min(.012,(h2-h1)/89.634*.3));
  mechanisms.update(t);

  await waterPro.water.postProcessing.renderPass(renderer);
  // Publish real FFT waterline evidence for QA and audio, not a CPU approximation.
  (window as any).__marineV7={state:waterPro.state,backend:waterPro.backend,drawCalls:renderer.info.render.calls};
 };
 return {scene,camera,renderer,model,update,render:()=>waterPro.render(),capture:async(canvas:HTMLCanvasElement)=>{
  renderer.setRenderTarget(captureTarget);waterPro.render();renderer.setRenderTarget(null);
  const raw=await renderer.readRenderTargetPixelsAsync(captureTarget,0,0,1920,1080);
  const pixels=new Uint8ClampedArray(raw as Uint8Array);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels,1920,1080),0,0);
 },dispose:()=>{waterPro.dispose();typography.dispose();annotations.dispose();mechanisms.dispose();anatomy.dispose();shore.disposeNatural();scene.traverse(o=>{const x=o as T.Mesh;if(x.geometry)x.geometry.dispose();if(x.material)for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose();});captureTarget.dispose();env.dispose();hdr.dispose();renderer.dispose();}};
}
