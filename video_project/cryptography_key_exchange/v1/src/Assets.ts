import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export type CafeAssetReport={
  url:string;
  replaced:{station:string;slot:string;asset:string;meshCount:number;scale:number;dimensions:T.Vector3}[];
  update:(seconds:number)=>void;
};

/** Import actual Blender meshes; leave errors visible to the caller's load gate. */
export async function loadCafeAssets(
  stations:T.Group[],
  url:(relative:string)=>string,
  prepareModels:(root:T.Object3D)=>void,
):Promise<CafeAssetReport>{
  const assetUrl=url('models/crypto_props.glb');
  const asset=await new GLTFLoader().loadAsync(assetUrl);
  const flames:{outer:T.Mesh;inner:T.Mesh;light:T.PointLight;phase:number}[]=[];
  const report:CafeAssetReport={url:assetUrl,replaced:[],update:(t:number)=>{
    for(const f of flames){
      const s=1+.045*Math.sin(t*5.8+f.phase)+.025*Math.sin(t*9.3+f.phase);
      f.outer.scale.set(1-.035*Math.sin(t*5.8+f.phase),s,1);
      f.outer.rotation.z=.035*Math.sin(t*4.3+f.phase);
      f.inner.scale.y=1+.025*Math.sin(t*6.5+f.phase);
      f.light.intensity=.07+.006*Math.sin(t*5.8+f.phase);
    }
  }};

  for(const station of stations.filter(s=>s.name==='hook'||s.name==='coda')){
    for(const spec of [{asset:'Cake',slot:'cake-slot',width:2.5},{asset:'CoffeeCup',slot:'cup-slot',width:1.6}]){
      const source=asset.scene.getObjectByName(spec.asset),slot=station.getObjectByName(spec.slot);
      if(!source||!slot)throw new Error(`Required cafe asset/slot missing: ${station.name}/${spec.asset}/${spec.slot}`);
      const clone=source.clone(true);
      clone.name=`Blender-${spec.asset}`;
      clone.position.set(0,0,0);clone.quaternion.identity();clone.scale.setScalar(1);
      let meshCount=0;
      clone.traverse(o=>{
        if(!(o instanceof T.Mesh))return;
        meshCount++;
        o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
        o.castShadow=true;o.receiveShadow=true;
        if(o.name==='Coffee_surface'||o.name==='Coffee_meniscus'){
          const m=o.material as T.MeshStandardMaterial;m.color.set('#35251b');m.roughness=.27;
        }
      });
      clone.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(clone);
      const dimensions=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
      const denominator=Math.max(dimensions.x,dimensions.z);
      if(!Number.isFinite(denominator)||denominator<=0||meshCount<4)throw new Error(`Invalid Blender geometry: ${spec.asset}`);
      const normalizedScale=spec.width/denominator;
      const wrapper=new T.Group();wrapper.name=`Blender-normalized-${spec.asset}`;
      clone.position.sub(center);wrapper.add(clone);wrapper.scale.setScalar(normalizedScale);
      wrapper.userData={source:'models/crypto_props.glb',sourceAsset:spec.asset,normalization:'horizontal width',originalDimensions:dimensions.toArray(),geometryVerified:true};

      if(spec.asset==='Cake'){
        // The candle is in original metre coordinates, so it follows the cake
        // normalization and rotation exactly. Shift cherry away from the wick.
        for(const name of ['Cherry','Cherry_stem']){
          const part=clone.getObjectByName(name);if(part){part.position.x+=.015;part.position.z-=.010;}
        }
        const wax=new T.MeshPhysicalMaterial({color:'#378b85',roughness:.40,clearcoat:.12});
        const candle=new T.Mesh(new T.CylinderGeometry(.00225,.0025,.030,24),wax);
        candle.name='birthday-candle';candle.position.set(0,.0715,.009);clone.add(candle);
        const wick=new T.Mesh(new T.CylinderGeometry(.00034,.00034,.0035,10),new T.MeshStandardMaterial({color:'#392a23',roughness:.9}));
        wick.name='birthday-wick';wick.position.set(0,.0880,.009);clone.add(wick);
        const flameGeo=new T.SphereGeometry(1,20,16);
        // Alter geometry once; runtime scale is only a small deterministic flicker.
        flameGeo.scale(.0032,.0078,.0028);
        const outer=new T.Mesh(flameGeo,new T.MeshBasicMaterial({color:'#e9a647',transparent:true,opacity:.84,depthWrite:false,toneMapped:false}));
        outer.name='birthday-warm-flame';outer.position.set(0,.0940,.009);outer.castShadow=false;clone.add(outer);
        const coreGeo=new T.SphereGeometry(1,16,12);coreGeo.scale(.0015,.0044,.0014);
        const inner=new T.Mesh(coreGeo,new T.MeshBasicMaterial({color:'#fff0bc',transparent:true,opacity:.96,depthWrite:false,toneMapped:false}));
        inner.name='birthday-flame-core';inner.position.set(0,.0928,.0105);clone.add(inner);
        const light=new T.PointLight('#efbc76',.07,.16,2);light.name='birthday-flame-light';light.position.copy(outer.position);clone.add(light);
        flames.push({outer,inner,light,phase:station.name==='hook'?0:1.4});
      }
      // Replace only after the full clone validates, so an error cannot leave a blank slot.
      slot.clear();slot.add(wrapper);slot.userData.assetLoaded=spec.asset;
      prepareModels(wrapper);
      report.replaced.push({station:station.name,slot:spec.slot,asset:spec.asset,meshCount,scale:normalizedScale,dimensions});
    }
  }
  if(report.replaced.length!==4)throw new Error(`Expected four Blender cafe placements, loaded ${report.replaced.length}`);
  report.update(0);
  console.info('CAFE_GLB_READY',JSON.stringify(report.replaced.map(({station,asset,meshCount,scale})=>({station,asset,meshCount,scale}))));
  return report;
}
