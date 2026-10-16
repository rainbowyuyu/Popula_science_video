import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
export const BACKGROUND=0xf1f5f4;
const mat=(color:number,roughness=.8)=>new T.MeshStandardMaterial({color,roughness});
export class CinematicEnvironment{
 group=new T.Group();environment:T.WebGLRenderTarget;floor:T.Mesh;rain:T.Points;rainMaterial:T.ShaderMaterial;
 constructor(renderer:T.WebGLRenderer,scene:T.Scene){
  const pmrem=new T.PMREMGenerator(renderer);const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);scene.environment=this.environment.texture;pmrem.dispose();room.dispose();
  scene.background=new T.Color(BACKGROUND);scene.fog=new T.Fog(BACKGROUND,48,115);
  scene.add(new T.HemisphereLight(0xffffff,0x92aaa6,1.8));
  const key=new T.DirectionalLight(0xfff0d9,3.6);key.position.set(-10,16,12);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-30;key.shadow.camera.right=30;key.shadow.camera.top=28;key.shadow.camera.bottom=-25;key.shadow.normalBias=.04;key.shadow.bias=-.0001;scene.add(key);
  const fill=new T.DirectionalLight(0xd0ecf4,1.3);fill.position.set(15,7,-12);scene.add(fill);
  const floorMat=new T.MeshStandardMaterial({color:0xe9eee6,roughness:.3,metalness:.08});
  floorMat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;').replace('#include <color_fragment>','#include <color_fragment>\nfloat g=sin(vGround.x*1.7)*sin(vGround.y*1.3);diffuseColor.rgb*=.99+.01*g;');};
  this.floor=new T.Mesh(new T.PlaneGeometry(300,300),floorMat);this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.04;this.floor.receiveShadow=true;this.group.add(this.floor);
  // Far hills sit behind the teaching geometry. Soft pale material preserves
  // foreground contrast and supplies an understandable horizon.
  for(let i=0;i<9;i++){const hill=new T.Mesh(new T.SphereGeometry(1,28,16),mat(i%2?0xdce7df:0xd6e4df));hill.position.set(-48+i*12,-1.4,-36-(i%3)*9);hill.scale.set(10+i%3*2,3+i%4*.45,8);this.group.add(hill)}
  for(const [x,z,s] of [[-13,-13,1.8],[-16,-17,1.5],[12,-18,1.4],[-11,-21,1.1],[15,-25,1.3]] as [number,number,number][]){
   const tree=new T.Group();const trunk=new T.Mesh(new T.CylinderGeometry(.06,.1,1.2,10),mat(0x8b9686));trunk.position.y=.6;tree.add(trunk);
   for(let j=0;j<3;j++){const top=new T.Mesh(new T.SphereGeometry(.55,16,12),mat(j%2?0x9eb4a8:0xa7bbae));top.scale.set(1,.9,.8);top.position.set((j-1)*.26,1.2+j*.18,0);tree.add(top)}tree.position.set(x,0,z);tree.scale.setScalar(s);this.group.add(tree);
  }
  // A thin path and shallow puddles connect the opening and closing shot.
  const path=new T.Mesh(new T.PlaneGeometry(2.4,40),mat(0xf1efe8,.55));path.rotation.x=-Math.PI/2;path.position.set(0,-.015,6);this.group.add(path);
  for(let i=0;i<8;i++){const puddle=new T.Mesh(new T.CircleGeometry(.25+(i%3)*.12,36),new T.MeshPhysicalMaterial({color:0xb7d6d4,roughness:.08,metalness:.22,transparent:true,opacity:.65,clearcoat:1}));puddle.rotation.x=-Math.PI/2;puddle.position.set(((i*37)%11)/10-.6,.003,2+i*1.35);puddle.scale.y=.5;this.group.add(puddle)}
  const pos=[],seeds=[];for(let i=0;i<220;i++){pos.push(((i*73)%239)/239*18-9,((i*31)%251)/251*9,((i*61)%227)/227*20-13);seeds.push((i*0.6180339887)%1);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));
  this.rainMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'attribute float seed;uniform float time;varying float a;void main(){vec3 p=position;p.y=mod(position.y-time*.28+100.,9.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(20./(-mv.z),1.5,3.0);a=.12+.08*seed;}',fragmentShader:'varying float a;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.36,.61,.66,a*smoothstep(.5,.12,d));}'});
  this.rain=new T.Points(geo,this.rainMaterial);this.group.add(this.rain);scene.add(this.group);
 }
 update(time:number){this.rainMaterial.uniforms.time.value=time}
 dispose(){this.group.traverse(o=>{const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(a=>a.dispose())});this.environment.dispose()}
}
