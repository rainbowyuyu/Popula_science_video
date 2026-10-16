import * as T from 'three';

/** Reversible art direction on the V19 world. White KHR_materials_sheen was
 * exported at full strength despite Blender's .03–.10 weight: remove the
 * erroneous velvet lobe, retaining photographed albedo and the solar shadows.
 * Water is owned separately by WaterPoolV19Repair. */
export class EnvironmentV19Repair {
  private readonly additions=new T.Group();
  private readonly groundMaterials:T.MeshStandardMaterial[]=[];
  private readonly ownedGeometries:T.BufferGeometry[]=[];
  private readonly ownedMaterials:T.Material[]=[];
  private readonly ownedTextures:T.Texture[]=[];
  private readonly lights:T.Light[]=[];
  private readonly windTime={value:0};
  constructor(private readonly group:T.Group,private readonly scene:T.Scene){
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
    const m=T.MathUtils.clamp(micro,0,1),s=m*m*(3-2*m),out=(1-s)**2;
    this.windTime.value=frame/30;
    for(const light of this.lights){
      if(light.name==='v09-real-sun-behind-observer')light.intensity=2.02*out*(.997+.003*Math.sin(frame/30*.19));
      if(light.name==='v09-soft-overcast-sky')light.intensity=.54*out+.08*s;
      if(light.name==='v09-valley-bounce')light.intensity=.20*out;
      if(light.name==='v18-wet-leaf-rim')light.intensity=.075*out;
    }
    // Cool distant air retains detail instead of washing the whole ground out.
    if(this.scene.fog instanceof T.FogExp2){this.scene.fog.color.set('#97aca7');this.scene.fog.density=.0055*out;}
    this.additions.visible=s<.999;
    for(const mat of this.groundMaterials){mat.opacity=1-s;mat.transparent=true;mat.depthWrite=true;}
  }
  dispose(){this.additions.removeFromParent();for(const x of [...this.ownedGeometries,...this.ownedMaterials,...this.ownedTextures])x.dispose();}
}

