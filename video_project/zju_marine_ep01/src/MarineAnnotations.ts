import * as T from 'three';

const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

type MovingParticle={mesh:T.Mesh;phase:number;speed:number;curve:T.CatmullRomCurve3};

function setOpacity(root:T.Object3D,value:number){
  root.traverse(o=>{
    const m=(o as T.Mesh).material;
    if(!m)return;
    for(const x of (Array.isArray(m)?m:[m])){
      const mat=x as T.Material & {opacity?:number;transparent?:boolean};
      if(typeof mat.opacity==='number')mat.opacity=value;
    }
  });
}

/**
 * World-space teaching marks for the first episode. These are physical lines and
 * particles, never DOM/HUD elements, so they remain in the same perspective and
 * depth relationship as the turbine. All motion is derived from seconds, making
 * headless Remotion renders deterministic.
 */
export function createMarineAnnotations(scene:T.Scene){
  const root=new T.Group();root.name='MarineWorld_Annotations';scene.add(root);
  const wind=new T.Group();wind.name='WindRoute_Mist';root.add(wind);
  const windCurves:T.CatmullRomCurve3[]=[];
  const particles:MovingParticle[]=[];
  const windLineMat=(color:string,opacity:number)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});
  for(let i=0;i<7;i++){
    const y=105+(i%4)*18;
    const z=-42+Math.floor(i/4)*28;
    const bend=(i-3)*2.2;
    const curve=new T.CatmullRomCurve3([
      v(235,y+14*Math.sin(i*.8),z-15),v(155,y+7,z+bend),
      v(72,y+2*Math.sin(i),z+bend*.55),v(-18,y-4,z)
    ],false,'centripetal');
    windCurves.push(curve);
    const ribbon=new T.Mesh(new T.TubeGeometry(curve,46,.22+(i%3)*.045,6,false),windLineMat(i%2?'#a8e5e1':'#d5f5ef',.0));
    ribbon.name='WindMistRibbon';ribbon.renderOrder=11;wind.add(ribbon);
    const particle=new T.Mesh(new T.SphereGeometry(.78+(i%2)*.18,8,6),windLineMat('#eefef7',0));
    particle.name='WindMistParticle';particle.renderOrder=12;wind.add(particle);
    particles.push({mesh:particle,phase:i/7,speed:.052+(i%3)*.009,curve});
  }

  const rotor=new T.Group();rotor.name='RotorDirection_Arc';rotor.position.set(16,150,0);root.add(rotor);
  const arcPoints:T.Vector3[]=[];const start=-Math.PI*.22;const arc=Math.PI*1.42;
  for(let i=0;i<=72;i++){
    const a=start+arc*i/72;
    arcPoints.push(v(0,Math.cos(a)*12.5,Math.sin(a)*12.5));
  }
  const arcCurve=new T.CatmullRomCurve3(arcPoints,false,'centripetal');
  const arcMat=new T.MeshBasicMaterial({color:'#f2c66e',transparent:true,opacity:0,depthWrite:false});
  const arcMesh=new T.Mesh(new T.TubeGeometry(arcCurve,80,.22,7,false),arcMat);arcMesh.name='RotorDirection_ArcLine';arcMesh.renderOrder=13;rotor.add(arcMesh);
  const tip=arcPoints[arcPoints.length-1].clone();
  const prev=arcPoints[arcPoints.length-5].clone();
  const tangent=tip.clone().sub(prev).normalize();
  const arrow=new T.Mesh(new T.ConeGeometry(.80,2.5,7),new T.MeshBasicMaterial({color:'#f6d992',transparent:true,opacity:0,depthWrite:false}));
  arrow.name='RotorDirection_Arrow';arrow.position.copy(tip).addScaledVector(tangent,.7);arrow.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),tangent);arrow.renderOrder=13;rotor.add(arrow);
  const hubDot=new T.Mesh(new T.SphereGeometry(.38,10,8),new T.MeshBasicMaterial({color:'#ffe4a0',transparent:true,opacity:0,depthWrite:false}));
  hubDot.position.set(0,0,0);hubDot.renderOrder=13;rotor.add(hubDot);

  const update=(seconds:number,windVisibility:number,rotorVisibility:number)=>{
    const windA=smooth(windVisibility)*.72;const rotorA=smooth(rotorVisibility)*.92;
    setOpacity(wind,windA);setOpacity(rotor,rotorA);
    particles.forEach((p,i)=>{
      const u=(p.phase+seconds*p.speed)%1;
      p.mesh.position.copy(p.curve.getPointAt(u));
      const pulse=.55+.45*Math.sin(seconds*4.2+i*1.7);
      const mat=p.mesh.material as T.MeshBasicMaterial;mat.opacity=windA*(.34+.36*pulse);
      p.mesh.scale.setScalar(.75+.35*pulse);
    });
    // A very slow authored roll keeps the mark alive while preserving the
    // physical hub anchor; it never jumps when the chapter changes.
    rotor.rotation.x=seconds*.045;
    (arcMat as T.MeshBasicMaterial).opacity=rotorA;
    (arrow.material as T.MeshBasicMaterial).opacity=rotorA;
    (hubDot.material as T.MeshBasicMaterial).opacity=rotorA*.9;
  };
  const dispose=()=>{root.traverse(o=>{const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();if(m.material)for(const x of (Array.isArray(m.material)?m.material:[m.material]))x.dispose();});scene.remove(root);};
  update(0,0,0);
  return {update,dispose};
}
