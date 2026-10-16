import * as T from 'three';

/** Sparse reconstruction of Lux3D 4040282; degree-zero SH colour. Covariance is
 * projected through the same perspective camera as the optical world. */
export class GaussianDropletV15 extends T.Group {
  material:T.ShaderMaterial;
  geometry:T.InstancedBufferGeometry;
  rows:number[][];
  attributes:Record<string,T.InstancedBufferAttribute>={};
  private scratch=new T.Vector3();
  constructor(rows:number[][]){
    super();this.rows=rows;this.name='Lux3D-4040282-anisotropic-splats';
    this.geometry=new T.InstancedBufferGeometry();
    this.geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    this.geometry.setIndex([0,1,2,0,2,3]);this.geometry.instanceCount=rows.length;
    for(const [name,size] of [['center',3],['colour',3],['alpha',1],['sigma',3],['rotation',4]] as [string,number][]){
      const a=new T.InstancedBufferAttribute(new Float32Array(rows.length*size),size).setUsage(T.DynamicDrawUsage);this.attributes[name]=a;this.geometry.setAttribute('a'+name,a);
    }
    this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
      uniforms:{uOpacity:{value:1},uGather:{value:0},uViewport:{value:new T.Vector2(1920,1080)}},
      vertexShader:`attribute vec3 acenter;attribute vec3 acolour;attribute float aalpha;attribute vec3 asigma;attribute vec4 arotation;
        uniform float uOpacity;uniform float uGather;uniform vec2 uViewport;varying vec2 vUv;varying vec3 vColour;varying float vAlpha;
        mat3 quat(vec4 q){vec3 v=q.xyz;float w=q.w;return mat3(1.-2.*(v.y*v.y+v.z*v.z),2.*(v.x*v.y+v.z*w),2.*(v.x*v.z-v.y*w),2.*(v.x*v.y-v.z*w),1.-2.*(v.x*v.x+v.z*v.z),2.*(v.y*v.z+v.x*w),2.*(v.x*v.z+v.y*w),2.*(v.y*v.z-v.x*w),1.-2.*(v.x*v.x+v.y*v.y));}
        void main(){
          float h=fract(sin(dot(acenter,vec3(13.31,71.17,37.7)))*31711.);
          vec3 p=acenter+normalize(acenter)*(.65+h*1.2)*(1.-uGather);
          vec4 v=modelViewMatrix*vec4(p,1.);vec4 clip=projectionMatrix*v;
          mat3 R=mat3(modelViewMatrix)*quat(arotation);mat3 S=R*mat3(asigma.x*.78,0.,0.,0.,asigma.y*.78,0.,0.,0.,asigma.z*.78);
          mat3 cov=S*transpose(S);float z=max(.01,-v.z);float fx=projectionMatrix[0][0]*uViewport.x*.5;float fy=projectionMatrix[1][1]*uViewport.y*.5;
          vec3 jx=vec3(fx/z,0.,fx*v.x/(z*z));vec3 jy=vec3(0.,fy/z,fy*v.y/(z*z));
          float a=dot(jx,cov*jx)+.45,b=dot(jx,cov*jy),c=dot(jy,cov*jy)+.45;
          float m=.5*(a+c),d=sqrt(max(.0001,.25*(a-c)*(a-c)+b*b));
          vec2 e=abs(b)>.00001?normalize(vec2(b,m+d-a)):vec2(1.,0.);
          vec2 f=vec2(-e.y,e.x);vec2 offset=3.*(e*sqrt(m+d)*position.x+f*sqrt(max(.01,m-d))*position.y);
          clip.xy+=offset/uViewport*2.*clip.w;gl_Position=clip;
          vUv=position.xy*3.;vColour=clamp(acolour,vec3(0.),vec3(1.));vAlpha=aalpha*uOpacity;
        }`,
      fragmentShader:`varying vec2 vUv;varying vec3 vColour;varying float vAlpha;void main(){float d=dot(vUv,vUv);if(d>9.)discard;float a=exp(-.5*d)*vAlpha;if(a<.002)discard;gl_FragColor=vec4(vColour,a);}`});
    const mesh=new T.Mesh(this.geometry,this.material);mesh.frustumCulled=false;this.add(mesh);
  }
  update(camera:T.Camera,opacity:number,gather:number){
    this.material.uniforms.uOpacity.value=opacity;this.material.uniforms.uGather.value=gather;
    this.visible=opacity>.002;if(!this.visible)return;
    this.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const m=new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse,this.matrixWorld);
    const ordered=this.rows.map((r,i)=>({i,z:this.scratch.set(r[0],r[1],r[2]).applyMatrix4(m).z})).sort((a,b)=>a.z-b.z||a.i-b.i);
    ordered.forEach((o,i)=>{const r=this.rows[o.i];this.attributes.center.setXYZ(i,r[0],r[1],r[2]);this.attributes.colour.setXYZ(i,r[3],r[4],r[5]);this.attributes.alpha.setX(i,r[6]);this.attributes.sigma.setXYZ(i,r[7],r[8],r[9]);this.attributes.rotation.setXYZW(i,r[10],r[11],r[12],r[13]);});
    Object.values(this.attributes).forEach(a=>a.needsUpdate=true);
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
