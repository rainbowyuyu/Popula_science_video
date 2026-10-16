import * as T from 'three';
import {timeline,ease,clamp} from './Timeline';

const rainHash=(index:number,salt:number)=>{
  let n=Math.imul(index+1,0x9e3779b1)^salt;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);
  return ((n^(n>>>16))>>>0)/4294967296;
};
const RAIN_VERTEX=/*glsl*/`
attribute vec4 aPath;attribute vec4 aLook;
uniform float uTime,uOpacity;uniform vec2 uViewport;uniform vec3 uSolar;
varying vec2 vDrop;varying float vAlpha,vGlint,vExposure;
void main(){
 // Each sheet is a physical 28-metre rain volume. Wrap occurs below ground
 // and is smoothly masked at both volume ends; it never teleports on-screen.
 float travel=mod(uTime*aPath.w+aPath.z*28.,28.);
 float age=travel/aPath.w,y=25.-travel;
 float gust=.095*sin(uTime*.62+aPath.y*.13)+.035*sin(uTime*1.37+aPath.x*.17);
 vec3 p=vec3(aPath.x+.18*age+gust,y,aPath.y-.085*age);
 vec3 velocity=vec3(.18+.059*cos(uTime*.62+aPath.y*.13)+.048*cos(uTime*1.37+aPath.x*.17),-aPath.w,-.085);
 vec4 view=modelViewMatrix*vec4(p,1.);float depth=-view.z;
 vec4 clip=projectionMatrix*view;
 vec4 tail=projectionMatrix*(viewMatrix*vec4(p-velocity*aLook.y,1.));
 if(depth<.75||depth>120.||clip.w<=0.){
   gl_Position=vec4(2.,2.,2.,1.);vDrop=vec2(0.);vAlpha=0.;vGlint=0.;vExposure=0.;return;
 }
 vec2 projected=(clip.xy/clip.w-tail.xy/tail.w)*uViewport*.5;
 vec2 axis=length(projected)>.001?normalize(projected):vec2(0.,-1.);
 vec2 side=vec2(-axis.y,axis.x);
 float perspective=projectionMatrix[1][1]*uViewport.y*.5/depth;
 float width=clamp(aLook.x*perspective,.36,1.15);
 float halfLength=clamp(length(projected)*.5,.8,5.8);
 vec2 offset=side*position.x*width+axis*position.y*halfLength;
 clip.xy+=offset/uViewport*2.*clip.w;gl_Position=clip;
 float edge=smoothstep(.35,2.2,y)*(1.-smoothstep(23.5,25.,y));
 float depthFade=smoothstep(.85,2.8,depth)*(1.-smoothstep(65.,110.,depth));
 vec3 viewDirection=normalize(cameraPosition-p);
 float backlight=pow(max(0.,dot(viewDirection,-normalize(uSolar))),5.);
 vDrop=position.xy;vAlpha=aLook.z*uOpacity*edge*depthFade;
 vGlint=.45+.55*pow(.5+.5*sin(uTime*1.8+aLook.w),6.);
 vExposure=.34+backlight*.35;
}`;
const RAIN_FRAGMENT=/*glsl*/`
varying vec2 vDrop;varying float vAlpha,vGlint,vExposure;
void main(){
 float across=exp(-vDrop.x*vDrop.x*4.4);
 float tip=1.-smoothstep(.30,1.,abs(vDrop.y));
 // Compact glass highlight and a thinner downstream streak; no gray ball,
 // opaque disc, broad additive halo, or whole-screen fog overlay.
 float glint=exp(-pow(vDrop.x/.36,2.)-pow((vDrop.y-.26)/.28,2.))*vGlint;
 float opacity=vAlpha*(across*tip*.40+glint*.60);
 if(opacity<.006)discard;
 vec3 colour=mix(vec3(.32,.44,.46),vec3(.82,.89,.84),clamp(vExposure+glint*.42,0.,1.));
 gl_FragColor=vec4(colour,opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Reversible art direction on the V19 world. White KHR_materials_sheen was
 * exported at full strength despite Blender's .03–.10 weight: remove the
 * erroneous velvet lobe, retaining photographed albedo and the solar shadows.
 * Water is owned separately by WaterPoolV19Repair. */
export class EnvironmentV19Motion {
  private readonly additions=new T.Group();
  private readonly groundMaterials:T.MeshStandardMaterial[]=[];
  private readonly ownedGeometries:T.BufferGeometry[]=[];
  private readonly ownedMaterials:T.Material[]=[];
  private readonly ownedTextures:T.Texture[]=[];
  private readonly lights:T.Light[]=[];
  private readonly windTime={value:0};
  private readonly rainGeometry=new T.InstancedBufferGeometry();
  private readonly rainMaterial:T.ShaderMaterial;
  private readonly rainMesh:T.Mesh<T.InstancedBufferGeometry,T.ShaderMaterial>;
  private readonly oldRain:T.Object3D|undefined;
  private readonly selectedMatrix=new T.Matrix4();
  private readonly selectedScale=new T.Vector3();
  private readonly selectedPosition=new T.Vector3();
  private readonly selectedRotation=new T.Quaternion();
  private readonly defaultRainColour=new T.Color('#a9c7cf');
  private readonly selectedRainColour=new T.Color('#ea925e');
  private readonly solar=new T.Vector3(0,.21,.98).normalize();
  readonly rainDiagnostics={instances:420,widthPixelsAt1080p:[.72,2.3],maximumLengthPixelsAt1080p:11.6,oldBackgroundSpheresSuppressed:true};
  constructor(private readonly group:T.Group,private readonly scene:T.Scene,private readonly worldRain?:T.InstancedMesh){
    this.additions.name='v19-repair-continuous-outer-landscape';
    const asset=group.getObjectByName('v09-authored-blender-environment');
    // Parent in the authored world so micro transitions and optical isolation
    // retain exactly the original lifecycle.
    (asset??group).add(this.additions);
    let ground:T.MeshStandardMaterial|undefined;
    const seen=new Set<T.Material>();
    group.traverse(o=>{
      if((o as T.Light).isLight)this.lights.push(o as T.Light);
      const mesh=o as T.Mesh;if(!mesh.isMesh)return;
      if(mesh.name==='v15_continuous_rain_meadow'){
        const g=mesh.geometry.clone();const idx=g.index;
        if(idx){for(let i=0;i<idx.count;i+=3){const b=idx.getX(i+1);idx.setX(i+1,idx.getX(i+2));idx.setX(i+2,b);}idx.needsUpdate=true;}
        g.computeVertexNormals();mesh.geometry=g;this.ownedGeometries.push(g);
      }
      for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(seen.has(mat))continue;seen.add(mat);
        const p=mat as T.MeshPhysicalMaterial;if(!p.isMeshStandardMaterial)continue;
        if(p.isMeshPhysicalMaterial){p.sheen=0;p.sheenColor.set(0,0,0);p.clearcoat=Math.min(p.clearcoat,.065);p.clearcoatRoughness=.34;}
        if(/photographed_meadow/.test(p.name)){
          p.color.setRGB(.92,.97,.90);p.roughness=.94;p.envMapIntensity=.23;
          p.emissive.set(0,0,0);ground=p;
        }else if(/living_meadow_blades/.test(p.name)){
          p.color.setRGB(.040,.115,.021);p.roughness=.93;p.envMapIntensity=.16;p.emissive.set(0,0,0);
        }else if(/tree_small_02_leaves|fern|shrub/.test(p.name)){
          p.color.setRGB(.88,.94,.78);p.roughness=.82;p.envMapIntensity=.28;p.emissive.set(0,0,0);
          p.alphaTest=.46;p.depthWrite=true;
        }else if(/damp_earth_shore/.test(p.name)){
          p.color.setRGB(.078,.10,.039);p.roughness=.92;p.envMapIntensity=.18;
        }else if(/submerged_natural_pebble_bed/.test(p.name)){
          p.color.setRGB(.43,.48,.40);p.roughness=.81;p.envMapIntensity=.20;
        }else if(/damp_slate/.test(p.name)){
          p.color.set('#a8afa0');p.roughness=.61;p.envMapIntensity=.34;
        }
        p.needsUpdate=true;
      }
    });
    if(ground)this.extendMeadow(ground);
    this.plantHorizon();
    this.oldRain=group.getObjectByName('v09-distant-residual-rain');
    this.rainGeometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    this.rainGeometry.setIndex([0,1,2,0,2,3]);
    const paths:number[]=[],looks:number[]=[];
    for(let i=0;i<420;i++){
      // Unequal depth strata preserve natural parallax. A small number of
      // foreground drops cross the lens, most residual rain stays distant.
      const layer=i<42?0:i<196?1:2;
      const z=layer===0?3+rainHash(i,31)*12:layer===1?-15+rainHash(i,31)*18:-38+rainHash(i,31)*23;
      const x=(rainHash(i,83)-.5)*(layer===0?24:layer===1?48:70);
      const speed=3.3+rainHash(i,219)*2.3;
      paths.push(x,z,rainHash(i,113),speed);
      looks.push(.006+rainHash(i,431)*.004,.010+rainHash(i,811)*.007,
        layer===0?.20:layer===1?.26:.20,rainHash(i,517)*Math.PI*2);
    }
    this.rainGeometry.setAttribute('aPath',new T.InstancedBufferAttribute(new Float32Array(paths),4));
    this.rainGeometry.setAttribute('aLook',new T.InstancedBufferAttribute(new Float32Array(looks),4));
    this.rainGeometry.instanceCount=420;
    this.rainMaterial=new T.ShaderMaterial({vertexShader:RAIN_VERTEX,fragmentShader:RAIN_FRAGMENT,
      transparent:true,depthTest:true,depthWrite:false,side:T.DoubleSide,
      uniforms:{uTime:{value:0},uOpacity:{value:0},uViewport:{value:new T.Vector2(1920,1080)},uSolar:{value:this.solar}}});
    this.rainMesh=new T.Mesh(this.rainGeometry,this.rainMaterial);this.rainMesh.name='v19-motion-depth-layered-residual-rain';
    this.rainMesh.frustumCulled=false;this.rainMesh.renderOrder=5;
    // Direct world-space child, not attached to the camera or rotating fish.
    this.scene.add(this.rainMesh);
  }
  private extendMeadow(source:T.MeshStandardMaterial){
    // 28 contiguous rings begin at the exact boundary of the authored meadow.
    // No flat circular plinth, fog curtain, or rectangle in front of the HDR.
    const nx=140,nz=160,edge:{x:number;z:number}[]=[];
    for(let i=0;i<nx;i++)edge.push({x:-58+116*i/nx,z:-74});
    for(let i=0;i<nz;i++)edge.push({x:58,z:-74+114*i/nz});
    for(let i=0;i<nx;i++)edge.push({x:58-116*i/nx,z:40});
    for(let i=0;i<nz;i++)edge.push({x:-58,z:40-114*i/nz});
    const positions:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
    const n=edge.length,rings=22;
    for(let r=0;r<=rings;r++)for(let i=0;i<n;i++){
      const e=edge[i],q=r/rings,scale=1+q*.93;
      const x=e.x*scale,z=(e.z+17)*scale-17;
      const y0=-.07+Math.max(.01,.30+1.15*Math.sin(e.x*.072+e.z*.021)**2+.52*Math.sin(e.z*.104-e.x*.023))+.085*Math.sin(e.x*.51+e.z*.16)*Math.cos(e.z*.33-e.x*.21);
      const d=Math.abs(e.x-(-11+2.3*Math.sin(e.z*.075)+.65*Math.sin(e.z*.23)));
      const ch=Math.exp(-((d/2.05)**4));
      const seamY=y0*(1-ch)+(-.23+.018*Math.sin(e.z*.13)-.18)*ch;
      const hill=.7+1.5*Math.sin(x*.039+z*.022)**2+.55*Math.cos(z*.047-x*.018);
      const fade=q*q*(3-2*q);
      positions.push(x,seamY*(1-fade)+hill*fade-5.5*q**6,z);
      uv.push((x+58)/116,(z+74)/114);
      const patch=.92+.08*Math.sin(x*.16)*Math.cos(z*.13);
      colors.push(patch,patch,patch*.96);
      if(r<rings){const a=r*n+i,b=r*n+(i+1)%n,c=(r+1)*n+i,d2=(r+1)*n+(i+1)%n;indices.push(a,b,c,b,d2,c);}
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mat=source.clone();mat.name='v19-repair-outlying-meadow';mat.vertexColors=true;
    // Repeat only beyond the original UV footprint, preserving the same edge.
    if(source.map){mat.map=source.map.clone();mat.map.wrapS=mat.map.wrapT=T.MirroredRepeatWrapping;mat.map.needsUpdate=true;this.ownedTextures.push(mat.map);}
    const mesh=new T.Mesh(geo,mat);mesh.name='v19-repair-continuous-outlying-meadow';mesh.receiveShadow=true;
    this.additions.add(mesh);this.ownedGeometries.push(geo);this.ownedMaterials.push(mat);this.groundMaterials.push(mat);
  }
  private plantHorizon(){
    const prototypes:T.InstancedMesh[]=[];
    const groundMeshes:T.Mesh[]=[];
    this.group.traverse(o=>{const m=o as T.InstancedMesh;if(m.isInstancedMesh&&!Array.isArray(m.material)&&/tree_small_02_(branches|leaves|trunk)/.test(m.material.name))prototypes.push(m);});
    this.group.traverse(o=>{if((o as T.Mesh).isMesh&&/v15_continuous_rain_meadow|v19-repair-continuous-outlying-meadow/.test(o.name))groundMeshes.push(o as T.Mesh);});
    this.group.updateMatrixWorld(true);
    const raycaster=new T.Raycaster();raycaster.ray.direction.set(0,-1,0);
    // Reuse the scanned tree's actual branch/leaf meshes together: every part
    // receives the SAME transform, rather than inventing billboard treetops.
    const places:{x:number;y:number;z:number;size:number;angle:number}[]=[];
    for(let i=0;i<72;i++){
      const cluster=Math.floor(i/6),member=i%6;
      const a=(cluster/12)*Math.PI*2+.065*Math.sin(member*3.12+cluster*.7);
      const r=61+member*3.8+5*Math.sin(cluster*1.91)+2*Math.cos(i*.79);
      const x=Math.cos(a)*r,z=-14+Math.sin(a)*(r*.83);
      raycaster.ray.origin.set(x,50,z);const hit=raycaster.intersectObjects(groundMeshes,false)[0];
      if(!hit)throw new Error('Distant tree has no terrain underneath '+i);
      places.push({x,y:hit.point.y-.08,z,size:.57+.47*(.5+.5*Math.sin(i*2.31)),angle:i*2.399});
    }
    const baseX=-11,baseZ=15;
    const baseY=-.07+Math.max(.01,.30+1.15*Math.sin(baseX*.072+baseZ*.021)**2+.52*Math.sin(baseZ*.104-baseX*.023))+.085*Math.sin(baseX*.51+baseZ*.16)*Math.cos(baseZ*.33-baseX*.21);
    for(const source of prototypes){
      const mat=(source.material as T.MeshStandardMaterial).clone();
      // These are distant static silhouettes. Nearby imported trees keep their
      // existing frame-driven branch motion without extra shadow passes.
      mat.onBeforeCompile=()=>{};mat.customProgramCacheKey=()=>`v19-repair-horizon-${mat.name}`;
      const inst=new T.InstancedMesh(source.geometry,mat,places.length),old=new T.Matrix4();source.getMatrixAt(0,old);
      places.forEach((p,i)=>{
        const m=new T.Matrix4().makeTranslation(p.x,p.y,p.z)
          .multiply(new T.Matrix4().makeRotationY(p.angle))
          .multiply(new T.Matrix4().makeScale(p.size,p.size,p.size))
          .multiply(new T.Matrix4().makeTranslation(-baseX,-baseY,-baseZ)).multiply(old);
        inst.setMatrixAt(i,m);
      });
      inst.name='v19-repair-mid-distance-'+mat.name;inst.castShadow=false;inst.receiveShadow=false;inst.computeBoundingSphere();
      this.additions.add(inst);this.ownedMaterials.push(mat);this.groundMaterials.push(mat);
    }
  }
  update(frame:number,micro:number,_camera:T.Camera){
    if(!Number.isFinite(frame))throw new Error('Rain expects an absolute finite frame');
    const m=T.MathUtils.clamp(micro,0,1),s=m*m*(3-2*m),out=(1-s)**2;
    this.windTime.value=frame/30;
    for(const light of this.lights){
      if(light.name==='v09-real-sun-behind-observer')light.intensity=2.02*out*(.997+.003*Math.sin(frame/30*.19));
      if(light.name==='v09-soft-overcast-sky')light.intensity=.54*out+.08*s;
      if(light.name==='v09-valley-bounce')light.intensity=.20*out;
      if(light.name==='v18-wet-leaf-rim')light.intensity=.075*out;
    }
    // Cool distant air retains detail instead of washing the whole ground out.
    if(this.scene.fog instanceof T.FogExp2){this.scene.fog.color.set('#97aca7');this.scene.fog.density=.0048*out;}
    this.additions.visible=s<.999;
    for(const mat of this.groundMaterials){mat.opacity=1-s;mat.transparent=true;mat.depthWrite=true;}
    if(this.oldRain)this.oldRain.visible=false;
    const sunlight=this.lights.find(light=>light.name==='v09-real-sun-behind-observer') as T.DirectionalLight|undefined;
    if(sunlight)this.solar.copy(sunlight.position).sub(sunlight.target.position).normalize();
    this.rainMaterial.uniforms.uTime.value=frame/30;
    // Real rain after a shower: restrained daily texture, diminishing during
    // the magnified optical explanation, independent of render order.
    this.rainMaterial.uniforms.uOpacity.value=(1-s)*.78;
    this.rainMesh.visible=s<.999;
    if(this.worldRain){
      const sceneStart=(id:string)=>timeline.scenes.find(x=>x.id===id)?.start??1e8;
      const sceneEnd=(id:string)=>timeline.scenes.find(x=>x.id===id)?.end??-1;
      const window=(start:number,end:number)=>ease((frame-start)/90)*(1-ease((frame-(end-140))/140));
      const selection=Math.max(window(sceneStart('cone'),sceneEnd('cone')+90),window(sceneStart('observer'),sceneEnd('observer')+90));
      const colors=this.worldRain.instanceColor;
      this.worldRain.visible=selection>.0001&&s<.999;
      if(this.worldRain.visible&&colors){
        // WorldV10 has just written the actual angular selection to instance
        // colour. Keep those same world positions/colours and remove only
        // the unselected decorative glass balls. Selection is never invented.
        for(let i=0;i<this.worldRain.count;i++){
          const selected=clamp((colors.getX(i)-this.defaultRainColour.r)/(this.selectedRainColour.r-this.defaultRainColour.r));
          const gain=ease((selected-.025)/.25);
          this.worldRain.getMatrixAt(i,this.selectedMatrix);
          this.selectedMatrix.decompose(this.selectedPosition,this.selectedRotation,this.selectedScale);
          const base=.033+(i%4)*.01,size=(base+(.09-base)*selected)*gain;
          this.selectedScale.set(size,size*1.12,size);
          // Reconstruct from the original WorldV10 size law each time, so
          // repeated calls at the same frame cannot cumulatively shrink it.
          if(![this.selectedRotation.x,this.selectedRotation.y,this.selectedRotation.z,this.selectedRotation.w].every(Number.isFinite))this.selectedRotation.identity();
          this.selectedMatrix.compose(this.selectedPosition,this.selectedRotation,this.selectedScale);
          this.worldRain.setMatrixAt(i,this.selectedMatrix);
        }
        this.worldRain.instanceMatrix.needsUpdate=true;
      }
    }
  }
  dispose(){this.rainMesh.removeFromParent();this.rainGeometry.dispose();this.rainMaterial.dispose();this.additions.removeFromParent();for(const x of [...this.ownedGeometries,...this.ownedMaterials,...this.ownedTextures])x.dispose();}
}

