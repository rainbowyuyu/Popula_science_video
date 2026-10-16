import * as T from 'three';
import {explodedOffset,outriggerDetailOffset} from './ExplodedLayout';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {TessellateModifier} from 'three/examples/jsm/modifiers/TessellateModifier.js';
import {ShellWallPlayback} from './ShellWallPlayback';
import {CameraPath,towerCameraAnchors} from './CameraPath';
import {openingCameraPose,applyOpeningCameraPose} from './OpeningCamera';
import {CinematicEnvironment} from './CinematicEnvironment';
import {WindVisualization} from './WindVisualization';
import {PhysicsPlayback,SolverResponse,DETAIL_WEB_STRESS_LIMIT} from './PhysicsPlayback';
import {HighResolutionResponse} from './HighResolutionResponse';
import {EnvironmentPlayback,EnvironmentData,TMD_RELATIVE_MAGNIFICATION} from './EnvironmentPlayback';
import {ComputedWindVisualization,ComputedWindData} from './ComputedWindVisualization';
import {ComputedPressureVisualization,ComputedPressureData} from './ComputedPressureVisualization';
import {ComputedFlowSlices} from './ComputedFlowSlices';
import {PileDynamicsVisualization} from './PileDynamicsVisualization';
import {MemberForceVisualization,WEB_FORCE_SELECTIONS} from './MemberForceVisualization';
import {PartsInventory} from './PartsInventory';
import {SpatialEngineering} from './SpatialEngineering';
import {C,V,State,Timeline,channel,ramp,pulse,mix,Label,clamp} from './visual';

type Part={id:string;role:string;zone:number;root:T.Group;meshes:T.Mesh[];center:T.Vector3;offset:T.Vector3;materials:T.MeshStandardMaterial[];restVertices:Float32Array[]};
type Route={curve:T.CurvePath<T.Vector3>;line:T.Mesh;dots:T.Mesh[];kind:string;rest:Float32Array};
const color=(s:string)=>new T.Color(s);
export class World{
 spatial?:SpatialEngineering;
 inventory?:PartsInventory;
 flowSlices?:ComputedFlowSlices;
 pileDynamics?:PileDynamicsVisualization;
 memberForces?:MemberForceVisualization;
 ready:Promise<void>;parts:Part[]=[];tower=new T.Group();ground=new T.Group();routes:Route[]=[];flow=new T.Group();flowDots:T.Mesh[]=[];flowPaths:T.Vector3[][]=[];
 environment:CinematicEnvironment;wind?:WindVisualization;computedWind?:ComputedWindVisualization;pressure?:ComputedPressureVisualization;path:CameraPath;cut=new T.Plane(V(0,-1,0),100);state?:State;anchors:any;tmdAnchors:any;eddy=new T.Group();eddyDots:T.Mesh[]=[];platform=new T.Group();physics?:PhysicsPlayback;manifest:any;effects?:EnvironmentPlayback;flowTrails:T.Line[]=[];panelDirections=new Map<string,T.Vector3>();tmdFill:T.DirectionalLight;
 constructor(public scene:T.Scene,public camera:T.PerspectiveCamera,public renderer:T.WebGLRenderer,base:string,tl:Timeline){
  // The film normally uses a 4x drawing buffer for the ordered coverage pass.
  // V15 may opt into a 2x buffer to keep long exports practical; the shader
  // below switches to a deterministic 2x2 coverage pattern in that mode.
  renderer.transmissionResolutionScale=.5;
  const context=renderer.getContext(),buffer=renderer.getDrawingBufferSize(new T.Vector2());
  const minBuffer=Math.min(buffer.x,buffer.y);
  const coverageGrid=minBuffer>=4320?4:minBuffer>=2160?2:0;
  if(!coverageGrid||context.getParameter(context.SAMPLES)<4)throw new Error('Ordered coverage requires at least a verified 2x drawing buffer and 4x MSAA');
  this.path=new CameraPath(tl);renderer.localClippingEnabled=true;
  this.environment=new CinematicEnvironment(scene,renderer,base);
  scene.add(this.tower,this.ground,this.eddy,this.platform);
  // A restrained camera-side fill is only active in the TMD close-up. It
  // restores the mass's metal edge without changing the tower's daylight look.
  this.tmdFill=new T.DirectionalLight('#d5e9ec',0);this.tmdFill.castShadow=false;scene.add(this.tmdFill,this.tmdFill.target);
  this.makeSite();this.makeEddy();this.makePlatform();
  const computedWind=fetch(base+'physics/computed-wind-paths.json').then(r=>r.ok?r.json():null).catch(()=>null);
  const computedPressure=fetch(base+'physics/computed-pressure.json').then(r=>r.ok?r.json():null).catch(()=>null);
  const computedSlices=fetch(base+'physics/computed-flow-slices.json').then(r=>r.ok?r.json():null).catch(()=>null);
  const pileData=fetch(base+'physics/pile-dynamics.json').then(r=>r.ok?r.json():null).catch(()=>null),pileProvenance=fetch(base+'physics/pile-dynamics-provenance.json').then(r=>r.ok?r.json():null).catch(()=>null);
  this.ready=Promise.all([new GLTFLoader().loadAsync(base+'models/shanghai-tower.glb'),fetch(base+'models/shanghai-tower-manifest.json').then(r=>r.json()),fetch(base+'physics/response.json').then(r=>{if(!r.ok)throw new Error('Missing verified solver response');return r.json()}),fetch(base+'physics/environment-response.json').then(r=>{if(!r.ok)throw new Error('Missing environmental solver response');return r.json()}),this.environment.ready,HighResolutionResponse.load(base),computedWind,computedPressure,computedSlices,pileData,pileProvenance]).then(async([gltf,manifest,response,environment,_,highResolution,computed,pressure,slices,pile,pileAcceptance])=>{
   this.manifest=manifest;this.physics=new PhysicsPlayback(response as SolverResponse,tl,highResolution);
   this.physics.shells=await ShellWallPlayback.load(base,response as SolverResponse);
   this.path.setAnchors(towerCameraAnchors(manifest));
   gltf.scene.updateMatrixWorld(true);
   // Export nodes are independent physical teaching groups. Baking their world
   // matrices once makes arbitrary-frame playback independent of previous frames.
   for(const info of manifest.parts){
    const source=gltf.scene.getObjectByName(info.id);if(!source)throw new Error('Missing part: '+info.id);
    if(!source.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh))continue;
    const id=source.name;const root=new T.Group();root.name=id;this.tower.add(root);const meshes:T.Mesh[]=[],materials:T.MeshStandardMaterial[]=[];
    source.traverse(o=>{if(!(o instanceof T.Mesh))return;let geo=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01);if(this.physics!.shells?.byMesh.has(id)){const coarse=geo;geo=new TessellateModifier(.06,9).modify(coarse);coarse.dispose();}if(/ENVELOPE.*GLASS/.test(id)){const flat=geo;flat.deleteAttribute('normal');geo=mergeVertices(flat,.000001);geo.computeVertexNormals();flat.dispose();}geo.computeBoundingSphere();
     const old=Array.isArray(o.material)?o.material[0]:o.material;
    const m=/ENVELOPE.*GLASS/.test(id)?new T.MeshPhysicalMaterial({
      // The curtain wall is a teaching surface, so it must read as glass while
      // remaining quiet enough for the structure behind it to stay legible.
      // A small amount of transmission plus a cool attenuation tint gives a
      // stable architectural reflection rather than a stack of opaque grey
      // petals during the opening explode.
      color:'#9dbbc8',roughness:.14,metalness:.06,clearcoat:.94,
      clearcoatRoughness:.055,ior:1.46,transmission:.25,thickness:.026,
      attenuationColor:new T.Color('#6f9da8'),attenuationDistance:2.4,
      envMapIntensity:1.25,specularIntensity:.92,side:T.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2
    }):(old as T.MeshStandardMaterial).clone();
     m.clippingPlanes=[this.cut,new T.Plane(V(0,-1,0),100),new T.Plane(V(0,-1,0),100),new T.Plane(V(0,1,0),100),new T.Plane(V(0,-1,0),100)];m.clipShadows=true;m.userData.originalColor=m.color.clone();m.userData.originalOpacity=m.opacity;
     m.userData.originalSurface={roughness:m.roughness,metalness:m.metalness,envMapIntensity:m.envMapIntensity};
     this.physics!.bind(id,geo);m.vertexColors=true;
     // Fixed depth-tested MSAA coverage keeps ghost structures in the glass
     // capture without sorting jumps. At 4x we use the original 4x4 ordered
     // pattern; the V15 2x export uses a smaller deterministic 2x2 pattern.
     const optical=/GLASS|MULLIONS/.test(id);
     m.transparent=optical;m.alphaHash=false;m.alphaToCoverage=!optical;m.depthWrite=!optical;
     if(!optical){
      const seed=[...id].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0);
      m.onBeforeCompile=shader=>{
       shader.uniforms.coverageShift={value:new T.Vector2(seed%coverageGrid,Math.floor(seed/coverageGrid)%coverageGrid)};
       shader.fragmentShader='uniform vec2 coverageShift;\n'+shader.fragmentShader;
       const coverageCode=coverageGrid===4?`vec2 p = mod(floor(gl_FragCoord.xy) + coverageShift, 4.0);
        vec2 a = mod(p, 2.0), b = floor(p / 2.0);
        float low = 2.0 * a.x + 3.0 * a.y - 4.0 * a.x * a.y;
        float high = 2.0 * b.x + 3.0 * b.y - 4.0 * b.x * b.y;
        gl_FragColor.a = clamp(diffuseColor.a * 16.0 - (4.0 * low + high), 0.0, 1.0);`:`vec2 p = mod(floor(gl_FragCoord.xy) + coverageShift, 2.0);
        float ordered = p.x + 2.0 * p.y;
        gl_FragColor.a = clamp(diffuseColor.a * 4.0 - ordered - 0.5, 0.0, 1.0);`;
       shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>\n        ${coverageCode}`);
      };
      m.customProgramCacheKey=()=> 'rainbow-ordered-msaa-coverage-v1';
     }
     const mesh=new T.Mesh(geo,m);mesh.castShadow=!/ENVELOPE|FACADE|GLASS/.test(id);mesh.receiveShadow=true;
     if(mesh.castShadow){
      // A fixed opacity threshold removes an entire slab's shadow in one
      // frame. Deterministic shadow-map coverage lets the existing soft PCF
      // filter reduce shadow density continuously with the visible material.
      const shadowOpacity={value:m.opacity};
      const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
      depth.onBeforeCompile=shader=>{
       shader.uniforms.shadowOpacity=shadowOpacity;
       shader.fragmentShader='uniform float shadowOpacity;\n'+shader.fragmentShader;
       shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        float coverageNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
        if (coverageNoise >= shadowOpacity) discard;`);
      };
      depth.customProgramCacheKey=()=> 'rainbow-continuous-shadow-coverage-v1';
      mesh.customDepthMaterial=depth;mesh.userData.shadowOpacity=shadowOpacity;
     }
     root.add(mesh);meshes.push(mesh);materials.push(m);
    });
    const center=new T.Box3().setFromObject(root).getCenter(V());const zone=Number(/_Z(\d+)/.exec(id)?.[1]??0);this.parts.push({id,role:info.role??id.split('_')[0],zone,root,meshes,center,offset:V(),materials,restVertices:meshes.map(m=>new Float32Array(m.geometry.getAttribute('position').array))});
   }
   if(!this.parts.length)throw new Error('No separable tower parts in GLB');
   this.inventory=new PartsInventory(this.parts,this.path.tl);this.path.setAnchors({...towerCameraAnchors(manifest),...this.inventory.anchors});
   this.anchors=manifest.forceAnchorsThree;this.tmdAnchors=manifest.tmdAnchorsThree;this.makeRoutes(manifest);this.effects=new EnvironmentPlayback(scene,environment as EnvironmentData,this.physics);
   this.memberForces=new MemberForceVisualization(scene,this.physics);
   this.spatial=new SpatialEngineering(scene,this.physics);
   if(pile?.acceptedForFilm===true&&pileAcceptance?.acceptedForFilm===true)this.pileDynamics=new PileDynamicsVisualization(scene,pile,pileAcceptance,{worldHead_m:[12.48,-31.4,34.32],entrance:[5.85,6.22],staticWindow:[6.18,6.58]});
   // Only an explicitly accepted solver export may replace the explanatory
   // streamlines. A missing or rejected file keeps the transparent teaching
   // fallback; it can never silently turn an illustration into a CFD claim.
   if(computed && (computed as ComputedWindData).quality?.acceptedForFilm===true){
    try{this.computedWind=new ComputedWindVisualization(scene,computed as ComputedWindData,tl);}catch(error){console.warn('Computed wind rejected; retaining teaching fallback',error);}
   }
   if(!this.computedWind)this.wind=new WindVisualization(scene,this.physics);
   if(slices?.quality?.acceptedForFilm===true){
    const horizontal=slices.slices.filter((x:any)=>x.kind==='horizontal').slice(0,3),vertical=slices.slices.find((x:any)=>x.kind==='vertical');
    const windows:Record<string,[number,number,number,number]>={};
    // The narration cues the climb at .354 / .678. Let the camera and the
    // geometric cut reach the next altitude before scanning that fixed field
    // in, so its solid mask never floats above a lower building section.
    const heightWindows:[number,number,number,number][]=[
     [30,30.08,30.35,30.45],[30.46,30.54,30.675,30.775],[30.79,30.87,30.96,31.08],
    ];
    horizontal.forEach((x:any,i:number)=>{windows[x.id]=heightWindows[i];});
    if(vertical)windows[vertical.id]=[31,31.2,31.92,32.14];
    this.flowSlices=new ComputedFlowSlices(scene,slices,{windows,opacity:.68,contourOpacity:.46,boundary:pressure});
   }
   if(pressure && (pressure as ComputedPressureData).quality?.acceptedForFilm===true){
    try{
     this.pressure=new ComputedPressureVisualization(scene,pressure as ComputedPressureData,{maxProjectionDistanceM:1.5});
     for(const p of this.parts)for(const mesh of p.meshes)if(/ENVELOPE.*GLASS/.test(p.id))this.pressure.bind(p.id,mesh.geometry);
    }catch(error){console.warn('Computed pressure rejected; keeping structural view',error);this.pressure?.dispose();this.pressure=undefined;}
   }
   for(const p of this.parts.filter(p=>/ENVELOPE.*GLASS/.test(p.id))){this.panelDirections.set(p.id.replace(/_GLASS$/,''),V(p.center.x,0,p.center.z).normalize());}
  });
 }
 makeSite(){
  const mat=new T.MeshStandardMaterial({color:'#ced6d1',roughness:.85,metalness:.03});
  const plinth=new T.Mesh(new T.CylinderGeometry(1.1,1.16,.035,96),mat);plinth.position.y=-.03;this.ground.add(plinth);
  for(let i=0;i<4;i++){const r=1.24+i*.09;const points=[];for(let k=0;k<=128;k++)points.push(V(Math.cos(k/128*Math.PI*2)*r,-.02,Math.sin(k/128*Math.PI*2)*r));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#b4c7c4',transparent:true,opacity:.5}));this.ground.add(line);}
 }
 makeRoutes(manifest:any){
  const make=(points:T.Vector3[],kind:string,c:string,r=.012)=>{const curve=new T.CurvePath<T.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>1e-7)curve.add(new T.LineCurve3(points[i-1],points[i]));const line=new T.Mesh(new T.TubeGeometry(curve,90,r,8,false),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.17,roughness:.4,transparent:true,opacity:.8}));const dots=Array.from({length:4},()=>new T.Mesh(new T.ConeGeometry(r*2.1,r*6,12),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.45})));this.scene.add(line,...dots);this.physics!.bind('force-route',line.geometry);this.routes.push({curve,line,dots,kind,rest:new Float32Array(line.geometry.getAttribute('position').array)});};
  const anchors=manifest.forceAnchorsThree;
  const point=(a:number[])=>V(a[0],a[1],a[2]).multiplyScalar(.01);
  const load=point(anchors.floorLoad.point),contact=point(anchors.floorCoreContact.point),column=point(anchors.outriggerColumn.point),core=point(anchors.outriggerCore.point);
  const down=(manifest.columnPathThree??anchors.columnPath).map(point) as T.Vector3[];
  const wallPath=(manifest.coreLoadPathThree??anchors.coreLoadPathThree).map(point) as T.Vector3[];
  make([load,contact,...wallPath],'gravity','#d87739',.010);
  make([load,column.clone().setY(load.y),...down],'gravity','#d87739',.010);
  make([core,column,column.clone().add(V(0,-.35,0))],'moment',C.red,.01);
  make([V(-column.x,column.y-.30,-column.z),V(-column.x,column.y,-column.z),V(-core.x,core.y,-core.z)],'moment',C.teal,.01);
  // Foundation arrows are supplied by the actual pile-spring solution.
 }
 makeEddy(){
  for(let j=0;j<4;j++){const x=(j%2-.5)*.041,z=(Math.floor(j/2)-.5)*.041;const ring=new T.Mesh(new T.TorusGeometry(.017,.0014,8,48),new T.MeshStandardMaterial({color:'#ce7042',emissive:'#ce7042',emissiveIntensity:.4,roughness:.4}));ring.rotation.x=Math.PI/2;ring.position.set(x,5.731,z);this.eddy.add(ring);const dot=new T.Mesh(new T.SphereGeometry(.003,12,8),new T.MeshStandardMaterial({color:'#f4c575',emissive:'#e5a844',emissiveIntensity:.4}));dot.userData.center=[x,z];this.eddyDots.push(dot);this.eddy.add(dot);}
 }
 makePlatform(){
  const steel=new T.MeshStandardMaterial({color:'#c69454',metalness:.5,roughness:.4});
  const beam=(a:T.Vector3,b:T.Vector3,r=.005)=>{const d=b.clone().sub(a),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),8),steel);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());this.platform.add(m);};
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const wall=new T.Mesh(new T.BoxGeometry(.34,.06,.014),steel);wall.position.set(Math.sin(a)*.17,0,Math.cos(a)*.17);wall.rotation.y=a;this.platform.add(wall);for(let j=-2;j<=2;j++){const x=j*.07,z=.175;const xx=x*Math.cos(a)+z*Math.sin(a),zz=z*Math.cos(a)-x*Math.sin(a);beam(V(xx,.03,zz),V(xx,.07,zz),.002);}beam(V(-.175*Math.cos(a)+.175*Math.sin(a),.07,.175*Math.cos(a)+.175*Math.sin(a)),V(.175*Math.cos(a)+.175*Math.sin(a),.07,.175*Math.cos(a)-.175*Math.sin(a)),.002);}
  beam(V(.14,0,.08),V(.14,.7,.08),.009);beam(V(-.30,.67,.08),V(.75,.67,.08),.009);beam(V(.14,.7,.08),V(.70,.64,.08),.003);beam(V(.14,.7,.08),V(-.28,.64,.08),.003);beam(V(.59,.66,.08),V(.59,.31,.08),.0015);
  const member=new T.Mesh(new T.BoxGeometry(.20,.012,.02),steel);member.position.set(.59,.3,.08);this.platform.add(member);
 }
 update(s:State){
  this.state=s;const u=s.n+s.u,t=s.time;
  const pressureWeight=this.pressure?.weightAt(s)??0;
  // Both accepted CFD streamlines and an accepted Cp field are registered to
  // the rest shell. Hold that shell continuously while the solved field enters
  // and exits; using the full streamline envelope prevents a late jump when
  // pressure colours have already faded but paths are still on screen.
  // Keep the registered shell rigid for the full accepted-field window. The
  // short lead/lag ramps prevent an abrupt deformation jump at either edge;
  // fallback analytical wind never changes the structural solve weight.
  const cfdRigidWeight=(this.computedWind||this.pressure||this.flowSlices?.accepted)
   ? pulse(28.55,28.85,32.15,32.45,u)
   : 0;
  this.physics?.update(s);
  this.physics?.setRigidWeight(cfdRigidWeight);
  const pose=openingCameraPose(t,this.path.at(t));
  applyOpeningCameraPose(this.camera,pose);
  const cameraFollow=pulse(33.3,34.7,38.1,39.1,u),follow=this.physics!.displacementAt(pose.target).multiplyScalar(cameraFollow),focus=pose.target.clone().add(follow);this.camera.position.add(follow);this.camera.lookAt(focus);this.camera.rotateZ(pose.roll);this.camera.updateMatrixWorld();this.environment.update(s,this.camera,focus);
  const inventoryWeight=this.inventory?.weight(u)??0;
  const inventoryMaterial=this.inventory?.materialWeight(u)??0;
  const hook=pulse(1.98,2.64,3.05,3.60,u)*(1-inventoryWeight);
  const reveal=channel([[1,0],[5.0,0],[5.65,1],[21,1],[22.8,.42],[26,.38],[26.98,0],[34.1,0],[35.2,.85],[38.3,.85],[39.7,0],[49,0]],u);
  // Descend a section plane to the published zone-3 boundary, exposing the
  // actual nine-cell mesh while the camera rises continuously above it.
  const corePlan=pulse(10.1,10.82,11.92,12.58,u);
  const coreSection=pulse(9.98,10.55,11.99,12.62,u);
  this.cut.constant=coreSection>0?mix(6.8,1.73701,coreSection):100;
  const openUpper=pulse(14.05,14.85,26.0,26.98,u);
  const skin=pulse(21.4,22.5,26.0,26.98,u);
  // Once the two skins are in their close-up positions, return directly to
  // the envelope. Multiplying two independent exit ramps used to send the
  // glass sideways a second time while the camera was revealing its shape.
  const facadeLateral=reveal*(1-skin)*(1-pulse(25.8,26.0,27.0,27.1,u));
  const construction=pulse(39.10,39.95,44.05,44.90,u),progress=ramp(39.75,44.10,u),builtHeight=.20+6.12*progress;
  const windSection=pulse(32.35,32.75,33.75,34.25,u);
  // Use delivered-image pixels, not devicePixelRatio, for the finest facade
  // detail. The exported 90–96 mm strips are retained at their true coordinates;
  // only their contrast recedes when a whole-building view cannot resolve them.
  const facadeFocalPixels=this.renderer.getSize(new T.Vector2()).y/(2*Math.tan(T.MathUtils.degToRad(this.camera.fov)*.5));
  const webDetail=pulse(18.9,19.15,20.51,20.62,u),columnDetail=pulse(20.60,20.74,21.00,21.14,u);
  const horizontalStudy=this.flowSlices?.accepted?pulse(29.94,30.12,30.96,31.12,u):0;
  const horizontalFocusHeight=this.flowSlices?.accepted?this.flowSlices.getScanHeight(u)*.01:channel([[30.10,1],[30.354,1],[30.46,3],[30.678,3],[30.785,5],[30.96,5]],u);
  for(const p of this.parts){
   const id=p.id,c=p.center,z=p.zone;
   p.offset.set(0,0,0);p.root.quaternion.identity();
   const shell=/ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER|FACADE_RADIAL_TRUSSES/.test(id),inner=/INNER_FACADE/.test(id),slab=/FLOORS|FLOOR_INSPECTION/.test(id),beam=/FLOOR_BEAMS/.test(id),core=/CORE/.test(id),col=/MEGACOL|CORNER/.test(id),truss=/OUTRIGGER|BELT|CONNECTION_PLATES/.test(id)||['outrigger','belt'].includes(p.role),crown=/CROWN/.test(id);
   const radial=(this.panelDirections.get(id.replace(/_(GLASS|MULLIONS)$/, ''))??V(c.x,0,c.z)).clone();if(radial.length()<.005)radial.set(1,0,0);radial.normalize();
   const sector=Number(/_S(\d+)/.exec(id)?.[1]??1);
   // The same six curved facade assemblies extend through every height. There
   // is no independent radial/vertical travel for each floor of glass.
   const flap=this.panelDirections.get(`ENVELOPE_Z01_S${String(sector).padStart(2,'0')}`)?.clone()??radial.clone();
   const stagedHook=pulse(1.98,2.64,3.05,3.60,u)*(1-inventoryWeight);
   if(shell){
    const rib=/SPIRAL_RIBS|FACADE_RADIAL_TRUSSES/.test(id),exitDirection=V().setFromMatrixColumn(this.camera.matrixWorld,0),side=flap.dot(V(-Math.sin(1.36),0,Math.cos(1.36)))>0?1:-1;
    if(rib){const ribExit=Math.max(facadeLateral,.85*pulse(34.06,34.30,38.3,39.7,u));p.offset.addScaledVector(exitDirection,ribExit*34);}
    else{p.offset.addScaledVector(flap,skin*.16);p.offset.addScaledVector(exitDirection,side*(stagedHook*5.8+facadeLateral*18));}
   }else if(inner){const half=Number(/_(\d)_(?:GLASS|FRAME)$/.exec(id)?.[1]??1);p.offset.addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld,0),(half===1?1:-1)*facadeLateral*34);}
   else if(slab||beam){p.offset.y+=(z-1)*stagedHook*.035;}
   else if(core||col||truss){p.offset.y+=(z-1)*stagedHook*.035;if(col)p.offset.addScaledVector(radial,stagedHook*.12);}
   if(crown&&!shell)p.offset.y+=hook*.46+pulse(34.1,35.1,38,39.6,u)*1.8;
   if((z>=6||crown)&&!shell&&!inner)p.offset.y+=openUpper*16;
   if((z>=6||crown)&&(shell||inner))p.offset.y+=openUpper*16;
   // The damper has no storey-zone identifier, but belongs to the roof
   // assembly. Carry it with the same upper-storey presentation transform.
   if(/^TMD/.test(id))p.offset.y+=openUpper*16;
   if(z===5)p.offset.y+=pulse(14.05,14.85,21.5,22.5,u)*14;
   if(id==='GROUND_PLAZA')p.offset.x+=pulse(5.0,5.65,8.8,9.9,u)*12;
   if(this.pileDynamics?.accepted&&/^PILES_/.test(id))p.offset.addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld,0),-4*pulse(5.95,6.30,8.08,8.6,u));

   // Opening exploded view: the real exported parts fan into a readable,
   // three-dimensional layout before the exterior is reassembled.  Radial
   // separation follows each member's physical position; a small tangential
   // phase and vertical lift prevents coplanar overlaps in the close camera
   // move.  The pulse is C2-eased in/out (u=2.2–4.2), so no part pops in or
   // vanishes at a cut.  This is a presentation transform only: solver meshes,
   // anchors and rest vertices are never modified.
   p.offset.add(explodedOffset(id,p.role,c,z,u).multiplyScalar(1-inventoryWeight));
   p.offset.add(outriggerDetailOffset(id,u));
   // A rising construction section follows the climbing core and advancing work
   // fronts. No full-floor stacks or glass sleeves fall from the sky.
   p.root.position.copy(p.offset);p.root.visible=!/^SOIL/.test(id);
   for(const m of p.materials){
    // Curtain-wall work begins once the main structure is roughly one third
    // of its final height, as described in s043; it then advances from grade.
    const curtainHeight=clamp((builtHeight-2.10)/(6.32-2.10))*5.94;
    const buildLevel=core?builtHeight+.35:col||truss?builtHeight:slab||beam?builtHeight-.25:shell||inner?curtainHeight:builtHeight;
    m.clippingPlanes![1].constant=Math.min(mix(6.8,Math.max(.02,buildLevel),construction),z>=4?mix(6.8,1.7368,coreSection):6.8)+p.offset.y;
    // Height sections need a geometric cut, not visibility by the centre of
    // a whole multi-storey group: that restores floors above the inspected
    // plane and places a white stack over the wake as the camera climbs.
    // Keep the cut visually coplanar with the measured horizontal field. The
    // previous .015 scene-unit clearance represented 1.5 m, leaving a raised
    // rim above the flow plane. 0.1 m is only a small raster-depth allowance.
    m.clippingPlanes![2].constant=mix(6.8,horizontalFocusHeight+.001,horizontalStudy)+p.offset.y;
    const original=m.userData.originalColor as T.Color;m.color.copy(original);
    Object.assign(m,m.userData.originalSurface);
    let op=m.userData.originalOpacity as number;
    if(core){m.color.set('#c1b69f');m.roughness=.76;m.metalness=.025;}
    if(col||truss){m.color.set('#456472');m.roughness=.29;m.metalness=.53;}
    if(slab){m.color.set('#c7ccc9');m.roughness=.8;op*=1-.78*pulse(9.5,10.4,13.2,14,u);}
    if(beam){m.color.set('#5b7480');op*=1-.74*pulse(17.1,17.65,21.1,21.7,u);}
    if(slab&&z===4){op*=1-.91*pulse(14.3,15.0,21.0,21.8,u);}
    if(id==='FLOOR_INSPECTION_Z04')op=mix(op,.28,pulse(15.0,15.4,16.7,17.2,u));
    if(core&&/_W[23]$/.test(id)){op*=1-.65*pulse(17.2,17.8,20.6,21.3,u);}
    // Keep the selected computed web readable against its supporting frame.
    // White base material preserves the signed solver colour; it does not
    // invent a different stress or normalise that member's field per frame.
    const web1=pulse(...WEB_FORCE_SELECTIONS[0].window,u),web2=pulse(...WEB_FORCE_SELECTIONS[1].window,u);
    // The two force readings hand over in a short gap. Keep the surrounding
    // structure optically quiet throughout; restoring every floor in that
    // gap creates a visible flash despite each individual ramp being smooth.
    const webFocus=Math.max(web1,web2,pulse(20.13,20.17,20.24,20.28,u));
    const selectedWeb=id==='FE_M_Z04_C03_OX1'?web1:id==='FE_M_Z04_C03_OX2'?web2:0;
    if(selectedWeb>0){m.color.lerp(color('#f0f4f4'),selectedWeb);m.metalness=mix(m.metalness,.15,selectedWeb);m.roughness=mix(m.roughness,.42,selectedWeb);}
    if(truss)op*=1-.35*webFocus*(1-selectedWeb);
    if(slab||beam)op*=1-.988*webFocus;
    // The diagonal load pair is the subject of this close-up. Preserve a
    // quiet core outline without accumulating many translucent floor grids
    // behind the signed member colour and its registered end-force arrows.
    if(core)op*=1-.978*webFocus;
    // The selected diagonal ends exactly at this column face. Reduce its
    // optical density in the force close-up so both signed end arrows remain
    // visible without relocating their physical contact points.
    if(id==='MEGACOL_Z04_C03')op*=1-.84*webFocus;
    if(webFocus>0&&z===4&&(col||truss)&&!/^FE_M_Z04_C03_O/.test(id)&&id!=='MEGACOL_Z04_C03'){
     const webCenter=V(...this.path.anchors.outriggerWebCenter as [number,number,number]).multiplyScalar(.01),viewDirection=this.camera.position.clone().sub(webCenter).normalize();
     // Reveal the actual interior member by softening intervening structure,
     // with a spatial ramp so an orbit never toggles a whole column abruptly.
     const inFront=ramp(-.025,.07,p.center.clone().sub(webCenter).dot(viewDirection));
     op*=1-.90*webFocus*inFront;
    }
    if(inner){op=(/GLASS/.test(id)?.12:1)*(1-.86*hook);m.color.set(/GLASS/.test(id)?'#70a0ac':'#607f85');}
    if(shell){if(/GLASS/.test(id)){
      // Keep a single restrained glass language across all six facade sleeves.
      // The height tint is intentionally subtle; the rim light supplies the
      // edge highlight while transmission preserves the structural silhouette.
      op=.995-.61*hook;m.color.set('#9dbbc8');m.roughness=.14;m.metalness=.06;
      m.envMapIntensity=1.25;if(m instanceof T.MeshPhysicalMaterial){m.clearcoat=.94;m.transmission=.25;m.thickness=.026;}
     }else {op=1;m.color.set(/MULLIONS/.test(id)?'#536772':'#81979e');m.roughness=.25;m.metalness=.58;}}
    if(/MULLIONS/.test(id)){
     // These strips share the glass support surface in the source model.
     // A stable raster depth bias separates their drawing without offsetting
     // either the architectural geometry or the registered CFD shell.
     m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-2;
     m.color.set('#879ea5');m.roughness=.48;m.metalness=.35;m.envMapIntensity=.8;
     const depth=Math.max(this.camera.near,-p.center.clone().add(p.offset).applyMatrix4(this.camera.matrixWorldInverse).z);
     const projectedWidth=.0009*facadeFocalPixels/depth;
     // Fixed C2 sampling transition: never driven by frame history or a
     // binary distance threshold. Close views retain the complete fine grid.
     op*=ramp(.12,.65,projectedWidth);m.userData.facadeProjectedWidthPx=projectedWidth;
    }
    if(shell&&/GLASS/.test(id))op=mix(op,.12,skin);
    // Retain a low-opacity architectural silhouette during the wind study so
    // the arrows and streamlines remain spatially registered to the tower.
    // The facade still recedes enough to expose the core and load path.
    if(shell)op*=1-.76*windSection;
    if(inner||slab)op*=1-.82*windSection;
    // During section inspection keep only a quiet glass silhouette above
    // the active height. Hundreds of individually faint internal members
    // otherwise accumulate into an opaque web and hide the actual wake.
    // This optical reveal never changes registered solver coordinates.
    if(horizontalStudy>0&&c.y>horizontalFocusHeight+.06){
     const overhead=horizontalStudy*ramp(horizontalFocusHeight+.06,horizontalFocusHeight+.42,c.y);
     const overheadOpacity=/ENVELOPE.*GLASS/.test(id)?.035:.0001;
     op*=mix(1,overheadOpacity,overhead);
    }
    if(/PILES|RAFT|BASEMENT|DIAPHRAGM/.test(id)){m.color.set('#bab9af');m.roughness=.84;}
    if(/PILES/.test(id))op*=1-.97*pulse(6.2,6.65,7.95,8.45,u);
    if(/RAFT|BASEMENT|DIAPHRAGM/.test(id))op*=1-.68*pulse(6.4,6.95,7.85,8.45,u);
    if(core&&/_W[34]$/.test(id)){op*=1-.75*pulse(10.3,10.8,11.9,12.5,u)*(1-corePlan);}
    if(slab||beam||col||truss||p.role==='garden'||p.role==='sky_lobby'||p.role==='floorbeams'){op*=1-.9999*corePlan;}
    // Keep only a quiet spatial trace of the Z09 floor stack during the TMD
    // close-up; the mass, cables and support plate remain the visual subject.
    if(z===9&&(core||slab||beam||col||truss))op*=1-.975*pulse(34.2,35.1,37.9,38.8,u);
    if(/TMD/.test(id)){m.color.set(/MASS/.test(id)?'#89979f':/MAGNET/.test(id)?'#405966':'#b6c2c2');m.metalness=/MASS/.test(id)?.64:.76;m.roughness=/MASS/.test(id)?.32:.29;if(/MASS/.test(id)){m.emissive.set('#26383d');m.emissiveIntensity=.14;}}
    if(inventoryMaterial>0){
     const atlasColor=/GLASS/.test(id)?'#28677c':slab?'#839997':core?'#a39172':col||truss||beam?'#294a58':null;
     if(atlasColor)m.color.lerp(color(atlasColor),inventoryMaterial);
     if(/GLASS/.test(id)){
      op=mix(op,.98,inventoryMaterial);m.roughness=mix(m.roughness,.34,inventoryMaterial);
      m.envMapIntensity=mix(m.envMapIntensity,.42,inventoryMaterial);
      if(m instanceof T.MeshPhysicalMaterial){m.transmission=mix(m.transmission,.08,inventoryMaterial);m.clearcoat=mix(m.clearcoat,.45,inventoryMaterial);}
     }
     if(/MULLIONS/.test(id))op=mix(op,.7,inventoryMaterial);
    }
    m.opacity=op*(/^SOIL/.test(id)?inventoryWeight:1)*(this.inventory?.opacityFor(id,u)??1);
    // The physics tint starts from this frame's authored material, never a
    // colour cached by whichever frame happened to render first.
    const physicsBase=m.userData.physicsBaseColor as T.Color|undefined;
    if(physicsBase)physicsBase.copy(m.color);else m.userData.physicsBaseColor=m.color.clone();
   }
   p.meshes.forEach((mesh,j)=>{if(mesh.userData.shadowOpacity)mesh.userData.shadowOpacity.value=clamp(p.materials[j].opacity);});
   if(!/TMD/.test(id))p.meshes.forEach((mesh,j)=>{
    const localWeb=/^FE_M_Z04_C03_OX[12]$/.test(id);
    const forceColorWeight=localWeb?1-columnDetail:col?1-webDetail:1-Math.max(webDetail,columnDetail);
    this.physics?.deform(mesh.geometry,p.restVertices[j],p.materials[j],cfdRigidWeight,forceColorWeight,localWeb&&u>=18.75&&u<=21.25?this.physics?.detailStressLimit:undefined);
    this.pressure?.updateMaterial(mesh.geometry,p.materials[j],s,pressureWeight);
   });
   const tm=this.effects!.tmd(s),tw=pulse(29.05,29.6,38.55,39.1,u),sway=tm.relative*.01*TMD_RELATIVE_MAGNIFICATION*tw;
   const support=this.physics!.displacementAt(V(...this.tmdAnchors.massCenter as [number,number,number]).multiplyScalar(.01));
   if(/TMD/.test(id))p.root.position.add(support);
   const suspensionLength=(this.tmdAnchors?.cableLength??25)*.01;
   const pendulumRise=suspensionLength-Math.sqrt(Math.max(0,suspensionLength*suspensionLength-sway*sway));
   if(/TMD.*MASS|TMD_MASS|TMD_MAGNET/.test(id)){p.root.position.x+=sway;p.root.position.y+=pendulumRise;}
   if(id==='TMD_DAMPER_PLATE'){for(const m of p.materials)m.color.set('#a96543');}
   if(id==='TMD_CABLES')p.meshes.forEach((mesh,j)=>{const rest=p.restVertices[j],attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;let top=-Infinity,bottom=Infinity;for(let k=1;k<rest.length;k+=3){top=Math.max(top,rest[k]);bottom=Math.min(bottom,rest[k]);}for(let k=0;k<rest.length;k+=3){const w=(top-rest[k+1])/(top-bottom);attr.setXYZ(k/3,rest[k]+sway*w,rest[k+1]+pendulumRise*w,rest[k+2]);}attr.needsUpdate=true;});
  }
  this.ground.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.material.transparent=true;o.material.opacity=(1-.94*pulse(5.0,5.65,8.8,9.8,u))*(1-.94*horizontalStudy);o.material.depthWrite=false;}});
  this.ground.position.set(12*pulse(5.0,5.65,8.8,9.9,u),0,0);
  const platformWeight=pulse(39.55,40.25,42.7,43.5,u);this.platform.position.set(120*(1-platformWeight),Math.min(builtHeight+.27,5.81),0);this.platform.visible=platformWeight>.00001;
  const gravity=pulse(15.9,16.15,16.85,17.15,u)+pulse(32.9,33.2,33.7,34,u),moment=0,foundation=0;
  for(const r of this.routes){const weight=r.kind==='gravity'?gravity:r.kind==='foundation'?foundation:moment;r.line.visible=weight>.001;(r.line.material as T.Material & {opacity:number}).opacity=.85*weight;if(weight>.001)this.physics?.deform(r.line.geometry,r.rest,r.line.material as T.MeshStandardMaterial);for(let i=0;i<r.dots.length;i++){const d=r.dots[i];d.visible=weight>.001;d.position.copy(r.curve.getPoint((t*.15+i/4)%1));d.position.add(this.physics!.displacementAt(d.position));d.quaternion.setFromUnitVectors(V(0,1,0),r.curve.getTangent((t*.15+i/4)%1).normalize());d.scale.setScalar(weight);}}
  this.computedWind?.update(s,this.camera);
  this.wind?.update(s,this.camera);
  this.pressure?.update(s,this.camera,pressureWeight);
  this.flowSlices?.update(s,this.camera);
  const eddy=pulse(36.7,37.1,37.8,38.2,u),plate=this.parts.find(p=>p.id==='TMD_DAMPER_PLATE'),plateY=plate?.center.y??5.73,support=plate?.root.position??V();this.eddy.position.copy(support).add(V(0,plateY-5.73+.004,0));this.eddy.visible=eddy>.001;this.eddy.traverse(o=>{if(o instanceof T.Mesh){o.material.transparent=true;o.material.opacity=eddy;}});for(let j=0;j<this.eddyDots.length;j++){const d=this.eddyDots[j],[x,z]=d.userData.center;d.position.set(x+.017*Math.cos(t*3+j),5.733,z+.017*Math.sin(t*3+j));}
  const separateStructuralWind=(this.computedWind||this.pressure||this.flowSlices?.accepted)?ramp(32.45,32.75,u):1;
  this.effects!.update(s,this.camera,separateStructuralWind);
  this.memberForces?.update(s,this.camera);
  if(u>=18.85&&u<21.15)this.effects!.axialArrows.forEach(a=>a.root.visible=false);
  if(this.pileDynamics?.accepted){
   this.effects!.pile.visible=false;
   const soilExit=pulse(5.95,6.30,8.08,8.6,u);
   this.effects!.soil.position.x=0;this.effects!.soil.position.z=0;
   this.effects!.soil.position.addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld,0),-8*soilExit);
   this.pileDynamics.update(s,this.camera);
  }
  // Structural wind input and CFD are independent cases. The force arrows
  // grow at their registered contact points only after the CFD view exits.
  const tmdLight=pulse(34.2,35.0,38.2,39.0,u);this.tmdFill.intensity=1.15*tmdLight;this.tmdFill.position.copy(this.camera.position).add(V(1.4,2.2,2.6));this.tmdFill.target.position.set(0,5.83,0);this.tmdFill.target.updateMatrixWorld();
  this.inventory?.apply(u);
  // The opening shows one actual storey cut from the existing multi-storey
  // meshes. Both cut faces are defined in the original metre-based model,
  // then travel with the extracted part; a rotated slab cannot escape a
  // world-horizontal crop. These two planes are independently reset on every
  // frame so arbitrary seeks and the accepted later camera stay deterministic.
  for(const p of this.parts){
   const section=this.inventory?.sectionFor(u,p.role);
   p.root.updateMatrixWorld(true);
   for(const m of p.materials){
    const lower=m.clippingPlanes![3],upper=m.clippingPlanes![4];
    lower.set(V(0,1,0),section?-section.minY:100);
    upper.set(V(0,-1,0),section?section.maxY:100);
    if(section){lower.applyMatrix4(p.root.matrixWorld);upper.applyMatrix4(p.root.matrixWorld);}
   }
  }
  // These planes belong to the later construction/section studies. During
  // the opening they travel with each original so raised crown and floor
  // groups cannot be silently sliced at the assembled tower's roof height.
  const openingEndFrame=this.path.tl.sections.find(section=>section.id==='hook')?.end??1786;
  if(s.frame<openingEndFrame)for(const p of this.parts)for(const m of p.materials){
   if(m.clippingPlanes?.[1])m.clippingPlanes[1].constant=6.8+p.root.position.y;
   if(m.clippingPlanes?.[2])m.clippingPlanes[2].constant=6.8+p.root.position.y;
  }
  // The atlas uses the same daylight, with a wide shadow footprint while the
  // camera reads the complete table. Return smoothly to the architectural rig.
  const shadow=this.environment.sun.shadow.camera,atlasWideShadow=inventoryWeight*ramp(6,20,this.camera.position.distanceTo(focus));
  shadow.left=mix(shadow.left,-23,atlasWideShadow);shadow.right=mix(shadow.right,23,atlasWideShadow);
  shadow.top=mix(shadow.top,23,atlasWideShadow);shadow.bottom=mix(shadow.bottom,-23,atlasWideShadow);shadow.updateProjectionMatrix();
  this.environment.ground.position.y=-1.35;
  if(this.scene.fog instanceof T.Fog){this.scene.fog.near=mix(28,75,inventoryWeight);this.scene.fog.far=mix(92,140,inventoryWeight);}
  this.scene.updateMatrixWorld(true);
  const flowMarks=this.flowSlices?.getSpatialAnnotations().map((a,i)=>({id:'flow-'+i,point:a.point,title:a.text,color:a.color,weight:a.weight??1,side:i%2?-1:1,lift:80,...(i%2?{maxLabelY:320}:{})}))??[];
  this.spatial?.update(s,this.camera,this.labels(s),this.memberForces,this.effects,this.parts,flowMarks);
 }
 labels(s:State):Label[]{
  const u=s.n+s.u;const list:Label[]=[];const registered=new Set<T.Vector3>();
  const add=(text:string,id:string,fallback:T.Vector3,side:'left'|'right'='right')=>{const p=this.parts.find(x=>x.id===id)??this.parts.find(x=>x.id.startsWith(id));const point=p?p.center.clone().add(this.physics!.displacementForMesh(p.id,p.center)).add(p.offset):fallback;list.push({text,point,side});if(p)registered.add(point);};
  if(u>=5.3&&u<6.12){const layer=this.effects?.data.pile.soilLayers.find(l=>l.name.includes('软弱'));const depth=layer?(layer.depthRangeBelowGrade_m[0]+layer.depthRangeBelowGrade_m[1])*.005:.064;const point=V(.75,-depth,-.485);if(this.effects)point.applyMatrix4(this.effects.soil.matrixWorld);list.push({text:'软黏土层',point,color:C.gold});registered.add(point);add('筏板','RAFT',V(.3,-.07,0),'left');}
  if(u>=6.8&&u<7.9&&!this.pileDynamics?.accepted){list.push({text:'桩侧阻力',point:this.effects!.sideArrows[3].tip.clone().add(this.effects!.pile.position),color:C.teal},{text:'桩端反力',point:this.effects!.toeArrow.tip.clone().add(this.effects!.pile.position),color:C.gold,side:'left'});}
  if(u>=10.6&&u<12.5)list.push({text:'核心筒',point:V(...this.manifest.cameraAnchorsThree.coreInterior as [number,number,number]).multiplyScalar(.01)});
  if(u>=15.5&&u<17){const dir=this.camera.position.clone().setY(0).normalize();const col=this.parts.filter(x=>x.id.startsWith('MEGACOL_Z04')).sort((a,b)=>b.center.clone().setY(0).dot(dir)-a.center.clone().setY(0).dot(dir))[0];if(col)list.push({text:'巨柱',point:col.center.clone().addScaledVector(dir,.013)});}
  if(u>=18.16&&u<18.29){add('上弦杆','FE_M_Z04_C03_OT',V(),'left');add('下弦杆','FE_M_Z04_C03_OB',V(),'left');}
  if(u>=18.29&&u<18.66){add('斜腹杆','FE_M_Z04_C03_OX1',V(),'left');}
  if(u>=23&&u<25.6){add('内层幕墙','INNER_FACADE_Z05',V(.32,2.6,0));const garden=this.parts.find(p=>p.id==='GARDEN_Z05'),front=this.camera.position.clone().setY(0).normalize();const platform=front.multiplyScalar(.385).setY(garden?garden.center.y+.003:2.405);if(garden)platform.add(garden.root.position);list.push({text:'空中花园',point:platform,side:'left'});}
  if(u>=35.3&&u<36.8){const p=this.parts.find(p=>p.id==='TMD_MASS');if(p){const point=p.center.clone().add(p.root.position);list.push({text:'千吨质量块',point});registered.add(point);}}
  if(u>=37.1&&u<37.8){const p=this.parts.find(p=>p.id==='TMD_DAMPER_PLATE');if(p){const point=p.center.clone().add(p.root.position);list.push({text:'固定铜板',point,side:'right'});registered.add(point);}}
  const windows:Record<string,[number,number]>={'软黏土层':[5.3,5.85],'筏板':[5.3,6.12],'桩侧阻力':[6.8,7.9],'桩端反力':[6.8,7.9],'核心筒':[10.6,12.5],'巨柱':[15.5,17],'上弦杆':[18.16,18.29],'下弦杆':[18.16,18.29],'斜腹杆':[18.29,18.66],'内层幕墙':[23,25.6],'空中花园':[23,25.6],'千吨质量块':[35.3,36.8],'固定铜板':[37.1,37.8]};
  for(const l of list){if(!registered.has(l.point))l.point.add(this.physics!.displacementAt(l.point));const range=windows[l.text];if(range){const ease=Math.min(.11,(range[1]-range[0])*.22);l.weight=pulse(range[0],range[0]+ease,range[1]-ease,range[1],u);}}return list;
 }
 dispose(){this.spatial?.dispose();this.tmdFill.removeFromParent();this.tmdFill.target.removeFromParent();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();if(o instanceof T.Mesh)o.customDepthMaterial?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.effects?.dispose();this.wind?.dispose();this.computedWind?.dispose();this.pressure?.dispose();this.flowSlices?.dispose();this.pileDynamics?.dispose();this.memberForces?.dispose();this.environment.dispose();}
}
