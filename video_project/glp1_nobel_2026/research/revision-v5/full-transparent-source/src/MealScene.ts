import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A metre-scale lunch, fixed in world space. The owning scene moves root. */
export class MealScene {
  root = new T.Group();
  ready: Promise<void>;
  private random = seeded(20261008);
  private textures = new Set<T.Texture>();
  private steamMaterials: T.ShaderMaterial[] = [];
  private disposed = false;
  private chicken?: T.Mesh;
  private wood: T.MeshPhysicalMaterial;
  private linen: T.MeshPhysicalMaterial;

  constructor(base = '') {
    this.root.name = 'MealScene — rice, chicken and vegetables';
    this.wood = new T.MeshPhysicalMaterial({color:'#d4b38b', roughness:.62, clearcoat:.08, clearcoatRoughness:.65});
    this.linen = new T.MeshPhysicalMaterial({color:'#e2d7c0', roughness:.97, sheen:.35, sheenColor:new T.Color('#e5dac8')});
    this.buildTable();
    this.buildBowl();
    this.buildRice();
    this.buildChicken();
    this.buildBroccoli();
    this.buildTomatoes();
    this.buildGarnish();
    this.buildChopsticks();
    this.buildSteam();
    const url = base && !base.endsWith('/') ? base + '/' : base;
    this.ready = Promise.all([this.loadSurfaceTextures(url), this.loadDessert(url)]).then(() => {
      if (!this.disposed) this.root.updateMatrixWorld(true);
    });
    this.root.updateMatrixWorld(true);
  }

  /** Absolute-time steam only: deterministic on seeks, no camera access. */
  update(time:number):void {
    for (const material of this.steamMaterials) material.uniforms.uTime.value = time;
  }

  private add<G extends T.BufferGeometry, M extends T.Material>(geometry:G, material:M, x=0, y=0, z=0):T.Mesh<G,M> {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private noiseTexture(kind:'ceramic'|'rice'|'chicken'|'tomato', size=256):T.DataTexture {
    const random = seeded({ceramic:83, rice:384, chicken:571, tomato:117}[kind]);
    const pixels = new Uint8Array(size*size*4);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const n = random();
      let r=255,g=255,b=255;
      if (kind==='ceramic') {
        const v = n < .013 ? 192+random()*28 : 244+random()*11;
        r=v;g=v*.995;b=v*.98;
      } else if (kind==='rice') {
        const v = 231+19*n+4*Math.sin(x*.22+Math.sin(y*.09));
        r=v;g=v*.992;b=v*.956;
      } else if (kind==='chicken') {
        // Low-contrast irregular fibres; the seared crust is defined by vertex colour.
        // No periodic waves and no diffuse-as-bump mapping: both made meat look like sugar.
        const patch=valueNoise(x/71,y/71,571),fibre=valueNoise(x/95,y/3.6,981);
        r=246-10*patch-3*fibre+n*2;g=240-12*patch-4*fibre+n*2;b=224-15*patch-5*fibre+n*2;
      } else {
        const v = .77+.19*n+.04*Math.sin(x*.04)*Math.sin(y*.08);
        r=255*v;g=246*v;b=228*v;
      }
      const p=(y*size+x)*4; pixels[p]=r;pixels[p+1]=g;pixels[p+2]=b;pixels[p+3]=255;
    }
    const texture = new T.DataTexture(pixels,size,size,T.RGBAFormat);
    texture.colorSpace=T.SRGBColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.needsUpdate=true;
    this.textures.add(texture);
    return texture;
  }

  private ceramic(color:string):T.MeshPhysicalMaterial {
    const map=this.noiseTexture('ceramic');
    return new T.MeshPhysicalMaterial({color,map,roughness:.24,metalness:0,clearcoat:.65,clearcoatRoughness:.22});
  }

  private buildTable():void {
    const table=this.add(new RoundedBoxGeometry(1.2,.024,.65,3,.009),this.wood,0,.92,.42);
    table.name='Rounded solid wood tabletop · 1.20 × 0.65 m';
    // Top-facing UVs follow the tabletop grain rather than the thin edge UV scale.
    const pos=table.geometry.attributes.position,uv=table.geometry.attributes.uv;
    for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/1.2+.5,pos.getZ(i)/.65+.5);
    const matGeometry=new T.PlaneGeometry(.72,.44,72,44);
    const p=matGeometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i);
      p.setZ(i,.00027*Math.sin(x*65+y*17)+.00018*Math.sin(y*102-x*12));
    }
    matGeometry.computeVertexNormals();
    const mat=this.add(matGeometry,this.linen,.074,.9332,.451);
    mat.rotation.x=-Math.PI/2;mat.name='Woven natural linen placemat';
    // A stitched edge and loose fibres keep the cloth edge from looking like a card.
    const threadMat=new T.MeshStandardMaterial({color:'#bdb19a',roughness:1});
    const stitchGeometry=new T.CylinderGeometry(.0002,.0002,.002,4);
    const stitches=new T.InstancedMesh(stitchGeometry,threadMat,286);
    const q=new T.Object3D();let index=0;
    for(let side=0;side<2;side++)for(let j=0;j<89;j++) {
      q.position.set(-.276+j*.0079,.9338,.239+side*.424);q.rotation.set(0,0,Math.PI/2);q.updateMatrix();stitches.setMatrixAt(index++,q.matrix);
    }
    for(let side=0;side<2;side++)for(let j=0;j<54;j++) {
      q.position.set(-.278+side*.704,.9338,.243+j*.0078);q.rotation.set(Math.PI/2,0,0);q.updateMatrix();stitches.setMatrixAt(index++,q.matrix);
    }
    stitches.count=index;this.root.add(stitches);
  }

  private buildBowl():void {
    const ceramic=this.ceramic('#f8f5e9');
    const saucer=[v2(0,0),v2(.058,0),v2(.07,.003),v2(.119,.005),v2(.135,.012),v2(.138,.016),v2(.135,.019),v2(.12,.014),v2(.076,.010),v2(0,.010)];
    const plate=this.add(new T.LatheGeometry(saucer,112),ceramic,.055,.934,.43);
    plate.name='Warm ivory ceramic underplate';
    // A real wall section, foot ring and rolled lip; the bowl interior is visible.
    const profile=[v2(0,0),v2(.043,0),v2(.046,.003),v2(.046,.006),v2(.052,.007),v2(.061,.011),v2(.073,.021),v2(.09,.042),v2(.105,.060),v2(.111,.065),v2(.112,.068),v2(.110,.071),v2(.107,.070),v2(.101,.059),v2(.085,.041),v2(.068,.023),v2(.054,.014),v2(0,.013)];
    const bowl=this.add(new T.LatheGeometry(profile,128).translate(0,-.010,0),ceramic,.055,.954,.43);
    bowl.name='22 cm hand-glazed ceramic rice bowl';
    // Fine celadon rim and foot, each a single continuous 3D ring.
    const glaze=new T.MeshPhysicalMaterial({color:'#81968c',roughness:.27,clearcoat:.7,clearcoatRoughness:.2});
    const ring=this.add(new T.TorusGeometry(.1102,.00068,8,128),glaze,.055,1.0135,.43);ring.rotation.x=Math.PI/2;
    const foot=this.add(new T.TorusGeometry(.043,.002,8,80),ceramic,.055,.946,.43);foot.rotation.x=Math.PI/2;
    const sideProfile=[v2(0,0),v2(.04,0),v2(.046,.003),v2(.069,.008),v2(.081,.014),v2(.082,.018),v2(.079,.019),v2(.061,.010),v2(0,.008)];
    const side=this.add(new T.LatheGeometry(sideProfile,96),ceramic,.294,.934,.438);
    side.name='Small dessert side plate';
  }

  private buildRice():void {
    const random=this.random;
    const grainGeometry=new T.SphereGeometry(1,10,7);
    const p=grainGeometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      p.setXYZ(i,x*.00295,y*.00138+.00018*(1-x*x),z*.00143*(.94+.06*Math.sin(x*4)));
    }
    grainGeometry.computeVertexNormals();
    const riceMap=this.noiseTexture('rice');
    const material=new T.MeshPhysicalMaterial({color:'#fffaf0',map:riceMap,roughness:.34,clearcoat:.26,clearcoatRoughness:.34,ior:1.35,transmission:.055,thickness:.0018,attenuationColor:new T.Color('#efe7d3'),attenuationDistance:.006});
    const count=7200,rice=new T.InstancedMesh(grainGeometry,material,count);
    rice.name='7,200 plump cooked rice grains · eight overlapping layers';
    const dummy=new T.Object3D(),color=new T.Color();
    // A filled volume plus several irregular scooped heaps, not a flat sprinkling.
    for(let i=0;i<count;i++) {
      const layer=Math.floor(i/900),j=i%900;
      const a=j*2.3999632297+layer*.62+(random()-.5)*.26;
      const rr=Math.sqrt((j+random())/900),radius=.085+layer*.00145;
      const x=Math.cos(a)*radius*rr,z=Math.sin(a)*radius*rr;
      const wx=.049+x,wz=.434+z*.94;
      dummy.position.set(wx,this.riceHeight(wx,wz)-(7-layer)*.00265+(random()-.5)*.0016,wz);
      dummy.rotation.set((random()-.5)*.92,random()*Math.PI*2,(random()-.5)*1.05);
      const s=.86+random()*.30;dummy.scale.set(s,.92+random()*.25,s);
      dummy.updateMatrix();rice.setMatrixAt(i,dummy.matrix);
      const tone=.92+random()*.08;color.setRGB(tone,tone*.992,tone*.963);rice.setColorAt(i,color);
    }
    rice.instanceMatrix.needsUpdate=true;if(rice.instanceColor)rice.instanceColor.needsUpdate=true;
    rice.castShadow=true;rice.receiveShadow=true;rice.computeBoundingSphere();this.root.add(rice);
  }

  private riceHeight(x:number,z:number):number {
    const dx=x-.049,dz=(z-.434)/.94,r2=(dx*dx+dz*dz)/(.098*.098);
    const heap=(cx:number,cz:number,w:number,h:number)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/(w*w));
    return 1.012+.026*Math.pow(Math.max(0,1-r2),.72)
      +heap(.035,.469,.030,.011)+heap(.082,.438,.024,.007)+heap(.014,.417,.023,.007);
  }

  private buildChicken():void {
    const random=this.random,geometries:T.BufferGeometry[]=[];
    const centers=[[-.010,.450],[.013,.471],[.042,.482],[.058,.464],[.004,.430],[.029,.450],[.021,.479]];
    for(let k=0;k<centers.length;k++) {
      const g=new RoundedBoxGeometry(1,1,1,5,.29),p=g.attributes.position,normals=g.attributes.normal;
      const colors=new Float32Array(p.count*3),c=new T.Color();
      for(let i=0;i<p.count;i++) {
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const irregular=valueNoise(x*3+k*7,z*3+k*3,45),warp=.85+.28*irregular;
        p.setXYZ(i,x*warp+.045*z*z,y*(.94+.13*valueNoise(x*5,z*4,72+k)),z*(.88+.25*valueNoise(x*3+k,z*3-k,88)));
        const upward=Math.max(0,normals.getY(i));
        const toasted=Math.pow(upward,.35)*(.63+.34*valueNoise(x*3.3+k*2,z*3.5,29));
        c.set('#d6bf9d').lerp(new T.Color('#77401f'),toasted);
        const brownedEdge=Math.max(0,(Math.abs(x)+Math.abs(z)-.56)*1.4)*upward;
        c.lerp(new T.Color('#75492c'),brownedEdge*.65);
        // A few irregular white fibre breaks remain on the browned upper surface.
        const fibre=valueNoise(x*2.8+k*3,z*22,43);
        if(fibre>.68)c.lerp(new T.Color('#f0e2c7'),(fibre-.68)*.48);
        c.toArray(colors,i*3);
      }
      g.setAttribute('color',new T.BufferAttribute(colors,3));g.computeVertexNormals();
      const h=.014+random()*.006;
      const d=new T.Object3D();d.position.set(centers[k][0],this.riceHeight(...centers[k] as [number,number])+h*.38+(k===6?.009:0),centers[k][1]);
      d.rotation.set((random()-.5)*.52,-.35+random()*1.15,(random()-.5)*.36);
      d.scale.set(.030+random()*.011,h,.020+random()*.008);d.updateMatrix();g.applyMatrix4(d.matrix);geometries.push(g);
    }
    const chickenMap=this.noiseTexture('chicken');
    const mat=new T.MeshPhysicalMaterial({color:'#ffffff',map:chickenMap,vertexColors:true,roughness:.72,clearcoat:.025,clearcoatRoughness:.75,specularIntensity:.30,envMapIntensity:.25});
    const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());
    this.chicken=this.add(merged,mat);this.chicken.name='Irregular pan-seared chicken · merged geometry';
  }

  private buildBroccoli():void {
    const random=this.random,dummy=new T.Object3D(),color=new T.Color();
    // Loosely piled florets, tilted by 49–112 degrees; crowns settle directly into rice.
    const florets=[[-.008,.400,.017,1.20],[.012,.381,.018,1.75],[.039,.390,.016,.85],[.071,.399,.019,1.25],[.093,.420,.016,1.80],[.067,.427,.016,1.05],[.030,.414,.013,1.95]];
    const stems=new T.InstancedMesh(new T.CylinderGeometry(.00155,.0025,1,7),new T.MeshStandardMaterial({color:'#45652d',roughness:.88,envMapIntensity:.25}),florets.length*6);
    const buds=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshPhysicalMaterial({color:'#eef1df',roughness:.91,clearcoat:.008,envMapIntensity:.25}),florets.length*7*48);
    const cores=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),new T.MeshStandardMaterial({color:'#20421c',roughness:.94,envMapIntensity:.25}),florets.length*7);
    let bi=0,si=0,ci=0;
    for(let f=0;f<florets.length;f++) {
      const [fx,fz,r,tilt]=florets[f];
      const orientation=new T.Quaternion().setFromEuler(new T.Euler(tilt,f*2.11+.6,(random()-.5)*.6));
      const clusters:{center:T.Vector3;radius:number}[]=[];
      for(let cluster=0;cluster<7;cluster++) {
        const a=cluster*2.399+f*.45,rad=cluster===0?0:r*(.46+random()*.14);
        clusters.push({center:new T.Vector3(Math.cos(a)*rad,.003+(cluster===0?.004:0)+random()*.003,Math.sin(a)*rad),radius:r*(.33+random()*.17)});
      }
      const lowest=Math.min(...clusters.map(c=>c.center.clone().applyQuaternion(orientation).y-c.radius));
      const offset=new T.Vector3(fx,this.riceHeight(fx,fz)-lowest-.003,fz);
      const world=(point:T.Vector3)=>point.applyQuaternion(orientation).add(offset);
      for(let cluster=0;cluster<clusters.length;cluster++) {
        const {center,radius:cr}=clusters[cluster],cworld=world(center.clone());
        dummy.position.copy(cworld);dummy.quaternion.copy(orientation);dummy.scale.set(cr,cr*.89,cr);dummy.updateMatrix();cores.setMatrixAt(ci++,dummy.matrix);
        if(cluster<6) {
          const start=world(new T.Vector3(0,-.012,0)),end=world(center.clone().add(new T.Vector3(0,-.002,0))),dir=end.clone().sub(start);
          dummy.position.copy(start.add(end).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());dummy.scale.set(1,dir.length(),1);dummy.updateMatrix();stems.setMatrixAt(si++,dummy.matrix);
        }
        for(let j=0;j<48;j++) {
          const a2=j*2.399+random()*.5,h=-.26+1.26*(j+.5)/48,radial=Math.sqrt(1-h*h);
          dummy.position.copy(world(center.clone().add(new T.Vector3(Math.cos(a2)*radial*cr,h*cr*.88,Math.sin(a2)*radial*cr))));
          dummy.rotation.set(random(),random(),random());const s=.0010+random()*.00072;dummy.scale.set(s,s*(.83+random()*.38),s);dummy.updateMatrix();buds.setMatrixAt(bi,dummy.matrix);
          // Hex colours are converted from sRGB to linear before instance upload.
          // Linear HSL values made the first version look pale under the scene lights.
          color.set('#173d19').lerp(new T.Color('#41672b'),random()*.76);buds.setColorAt(bi++,color);
        }
      }
    }
    for(const m of [stems,cores,buds]) {m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();this.root.add(m);}
    stems.name='Broccoli short sideways branching stalks';cores.name='Broccoli crowns resting on rice';buds.name='2,352 dark green broccoli flower buds · one instanced draw';
  }

  private buildTomatoes():void {
    const skin=new T.MeshPhysicalMaterial({color:'#a4140c',map:this.noiseTexture('tomato'),roughness:.34,clearcoat:.19,clearcoatRoughness:.32,envMapIntensity:.55});
    const calyxMaterial=new T.MeshStandardMaterial({color:'#36572a',roughness:.82});
    const locations=[[.102,.448,.0125],[.099,.478,.012],[.075,.494,.0105],[.112,.421,.0105]];
    for(let i=0;i<locations.length;i++) {
      const [x,z,r]=locations[i],group=new T.Group();
      group.position.set(x,this.riceHeight(x,z)+r*.76,z);group.rotation.set(.25+i*.20,i*.83,.13-i*.13);
      const geometry=new T.SphereGeometry(1,32,20),p=geometry.attributes.position;
      for(let j=0;j<p.count;j++) {
        const px=p.getX(j),py=p.getY(j),pz=p.getZ(j),a=Math.atan2(pz,px);
        const lobe=1+.025*Math.cos(a*5+i)*Math.pow(Math.abs(py),2);
        const dent=py>.60?.08*Math.pow((py-.60)/.40,2):0;
        p.setXYZ(j,px*r*lobe,py*r*.94-dent*r,pz*r*(.96+i*.012)*lobe);
      }
      geometry.computeVertexNormals();group.add(new T.Mesh(geometry,skin));
      if(i===0||i===2) {
        const leaves:T.BufferGeometry[]=[];
        for(let leaf=0;leaf<5;leaf++) {
          const a=leaf*Math.PI*2/5+.3,L=r*(.46+.06*Math.sin(leaf+i)),w=.00145;
          const points=[new T.Vector3(-w,r*.85,0),new T.Vector3(w,r*.85,0),new T.Vector3(w*.46,r*.89,L*.47),new T.Vector3(0,r*.75,L),new T.Vector3(-w*.46,r*.89,L*.47)];
          const positions:number[]=[];for(const index of [0,1,2,0,2,4,4,2,3]){const point=points[index].clone().applyAxisAngle(new T.Vector3(0,1,0),a);positions.push(point.x,point.y,point.z);}
          const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();leaves.push(g);
        }
        const merged=mergeGeometries(leaves)!;leaves.forEach(g=>g.dispose());
        const leavesMaterial=calyxMaterial.clone();leavesMaterial.side=T.DoubleSide;group.add(new T.Mesh(merged,leavesMaterial));
        const stem=new T.Mesh(new T.CylinderGeometry(.00065,.00085,.0034,7),calyxMaterial);stem.position.set(0,r*.92,0);stem.rotation.z=.27;group.add(stem);
      }
      group.name='Whole ripe red cherry tomato';
      group.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.root.add(group);
    }
  }

  private buildGarnish():void {
    const random=this.random,d=new T.Object3D();
    const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0);
    this.chicken!.updateMatrixWorld(true);
    const surface=()=>{
      for(let attempt=0;attempt<80;attempt++) {
        const x=-.015+random()*.090,z=.422+random()*.075;
        ray.set(new T.Vector3(x,1.15,z),down);
        const hit=ray.intersectObject(this.chicken!,false)[0];
        if(hit&&hit.face&&hit.face.normal.y>.30) return hit;
      }
      // Fallback also raycasts a known chicken centre instead of leaving garnish in midair.
      ray.set(new T.Vector3(.033,1.15,.477),down);return ray.intersectObject(this.chicken!,false)[0];
    };
    const sesame=new T.InstancedMesh(new T.SphereGeometry(1,7,5),new T.MeshStandardMaterial({color:'#ecd2a0',roughness:.68}),92);
    for(let i=0;i<92;i++) {
      const hit=surface(),normal=hit.face!.normal;
      d.position.copy(hit.point).addScaledVector(normal,.00024);d.quaternion.setFromUnitVectors(up,normal);d.rotateY(random()*6);d.scale.set(.00105,.00032,.0005);d.updateMatrix();sesame.setMatrixAt(i,d.matrix);
    }
    sesame.castShadow=true;sesame.receiveShadow=true;sesame.computeBoundingSphere();this.root.add(sesame);
    const rings=new T.InstancedMesh(new T.TorusGeometry(.0016,.00042,5,14),new T.MeshStandardMaterial({color:'#6a9638',roughness:.65}),24);
    for(let i=0;i<24;i++) {
      const hit=surface(),normal=hit.face!.normal;
      d.position.copy(hit.point).addScaledVector(normal,.00045);d.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);d.rotateZ(random()*6);d.scale.set(1,1,1);d.updateMatrix();rings.setMatrixAt(i,d.matrix);
    }
    rings.castShadow=true;rings.receiveShadow=true;rings.computeBoundingSphere();this.root.add(rings);
  }

  private buildChopsticks():void {
    const material=new T.MeshPhysicalMaterial({color:'#765337',roughness:.43,clearcoat:.28,clearcoatRoughness:.36});
    const woodLineMat=new T.MeshStandardMaterial({color:'#a68258',roughness:.6});
    for(let i=0;i<2;i++) {
      const group=new T.Group();group.position.set(.08,.951,.637+i*.012);group.rotation.set(.035,0,-Math.PI/2+.045);
      const stick=new T.Mesh(new T.CylinderGeometry(.0028,.0015,.245,10),material);group.add(stick);
      for(let j=0;j<3;j++) {
        const band=new T.Mesh(new T.TorusGeometry(.00268,.00014,5,12),woodLineMat);band.position.y=.084+j*.006;band.rotation.x=Math.PI/2;group.add(band);
      }
      group.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.root.add(group);
    }
    const rest=this.add(new RoundedBoxGeometry(.025,.007,.022,3,.0025),this.ceramic('#809b8d'),.163,.937,.643);
    rest.rotation.y=.07;rest.name='Celadon chopstick rest';
  }

  private buildSteam():void {
    const geometry=new T.PlaneGeometry(.034,.13,12,28);
    for(let i=0;i<4;i++) {
      const material=new T.ShaderMaterial({
        transparent:true,depthWrite:false,side:T.DoubleSide,
        uniforms:{uTime:{value:0},uPhase:{value:i*1.87}},
        vertexShader:`varying vec2 vUv; uniform float uTime; uniform float uPhase;
          void main(){vUv=uv;vec3 p=position;float h=uv.y;
            p.x+=sin(h*8.0-uTime*.72+uPhase)*.0045*h;
            p.z+=cos(h*6.0-uTime*.43+uPhase)*.005*h;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
        fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uPhase;
          void main(){float h=vUv.y;float center=.5+.13*sin(h*10.-uTime*.55+uPhase);
            float w=.065+h*.12;float a=exp(-pow((vUv.x-center)/w,2.));
            a*=sin(3.14159265*h)*(.52+.48*sin(h*22.-uTime*.7+uPhase));
            gl_FragColor=vec4(.91,.91,.86,a*.038);}`
      });
      const mesh=new T.Mesh(geometry,material);mesh.position.set(.026+i*.012,1.111,.411+i*.007);mesh.rotation.y=i*1.19;mesh.renderOrder=2;
      mesh.name='Subtle rising cooking vapour';this.steamMaterials.push(material);this.root.add(mesh);
    }
  }

  private async loadSurfaceTextures(base:string):Promise<void> {
    const loader=new T.TextureLoader();
    const load=async(asset:string,type:string,color:boolean,repeat:[number,number])=>{
      const texture=await loader.loadAsync(base+`textures/meal/${asset}_${type}_1k.jpg`);
      if(this.disposed){texture.dispose();return texture;}
      texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(...repeat);texture.anisotropy=8;this.textures.add(texture);return texture;
    };
    const [woodColor,woodNormal,woodRough,linenColor,linenNormal,linenRough]=await Promise.all([
      load('wood_table_001','diff_warm',true,[1.25,.7]),load('wood_table_001','nor_gl',false,[1.25,.7]),load('wood_table_001','rough',false,[1.25,.7]),
      load('rough_linen','diff_flax',true,[2.66,1.63]),load('rough_linen','nor_gl',false,[2.66,1.63]),load('rough_linen','rough',false,[2.66,1.63])
    ]);
    if(this.disposed)return;
    this.wood.color.set('#f7f0e7');this.wood.map=woodColor;this.wood.normalMap=woodNormal;this.wood.normalScale.set(.30,.30);this.wood.roughnessMap=woodRough;this.wood.needsUpdate=true;
    this.linen.color.set('#f5f0e8');this.linen.map=linenColor;this.linen.normalMap=linenNormal;this.linen.normalScale.set(.48,.48);this.linen.roughnessMap=linenRough;this.linen.needsUpdate=true;
  }

  private async loadDessert(base:string):Promise<void> {
    const gltf=await new GLTFLoader().loadAsync(base+'models/meal/carrot_cake/carrot_cake_1k.gltf');
    const cake=gltf.scene;
    if(this.disposed){disposeTree(cake,this.textures);return;}
    cake.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(cake),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
    const scale=.12/Math.max(size.x,size.z);
    const holder=new T.Group();holder.position.set(.294,.947,.438);holder.rotation.y=-.35;
    cake.scale.multiplyScalar(scale);cake.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    cake.traverse(o=>{if(o instanceof T.Mesh){
      o.castShadow=true;o.receiveShadow=true;
      for(const material of Array.isArray(o.material)?o.material:[o.material]) {
        if(material instanceof T.MeshStandardMaterial){material.envMapIntensity=.62;material.roughness=Math.max(.48,material.roughness);}
        for(const value of Object.values(material))if(value instanceof T.Texture){value.anisotropy=8;this.textures.add(value);}
      }
    }});
    holder.name='Poly Haven CC0 photogrammetry carrot cake';holder.add(cake);this.root.add(holder);
  }

  dispose():void {
    if(this.disposed)return;this.disposed=true;
    disposeTree(this.root,this.textures);this.steamMaterials=[];this.root.clear();
  }
}

function v2(x:number,y:number):T.Vector2{return new T.Vector2(x,y);}
function valueNoise(x:number,y:number,seed:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const h=(a:number,b:number)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return T.MathUtils.lerp(T.MathUtils.lerp(h(ix,iy),h(ix+1,iy),sx),T.MathUtils.lerp(h(ix,iy+1),h(ix+1,iy+1),sx),sy);
}
function seeded(seed:number):()=>number {
  return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
function disposeTree(root:T.Object3D,textures:Set<T.Texture>):void {
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());textures.clear();
}
