import * as T from 'three';

/** Camera-relative directional atmospheric glare. The 0.53-degree solar disc
 * lies on the same ground-to-sun direction as the actual optical light. */
export class SunlightV16 {
  readonly group=new T.Group();
  private readonly direction=new T.Vector3(0,.208,.978).normalize();
  private readonly glow:T.Sprite;
  private readonly disc:T.Sprite;
  private readonly texture:T.DataTexture;
  private disposed=false;
  constructor(scene:T.Scene){
    this.group.name='v16-atmospheric-sunlight-actual-solar-direction';scene.add(this.group);
    const side=128,data=new Uint8Array(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){
      const r=Math.hypot((x+.5)/side*2-1,(y+.5)/side*2-1),k=(y*side+x)*4;
      const alpha=Math.exp(-r*r*6.7)*(1-T.MathUtils.smoothstep(r,.75,1));
      data[k]=255;data[k+1]=249;data[k+2]=224;data[k+3]=Math.round(255*alpha);
    }
    this.texture=new T.DataTexture(data,side,side,T.RGBAFormat);this.texture.colorSpace=T.SRGBColorSpace;this.texture.needsUpdate=true;
    this.glow=new T.Sprite(new T.SpriteMaterial({map:this.texture,color:'#ffdfb5',transparent:true,opacity:.2,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
    this.disc=new T.Sprite(new T.SpriteMaterial({map:this.texture,color:'#fffae8',transparent:true,opacity:.8,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
    this.glow.scale.setScalar(7.2);this.disc.scale.setScalar(1.02);this.group.add(this.glow,this.disc);
    // Retain normal depth occlusion and an outdoor render order so both water
    // reflection passes see the same physical sun, never a grass-level icon.
    this.group.renderOrder=1;this.glow.renderOrder=1;this.disc.renderOrder=1;
  }
  setSolarDirection(direction:T.Vector3){
    if(direction.lengthSq()<1e-10||![direction.x,direction.y,direction.z].every(Number.isFinite))throw new Error('Sun direction must be finite');
    this.direction.copy(direction).normalize();
  }
  update(frame:number,camera:T.Camera,strength=1){
    if(this.disposed)return;
    if(!Number.isFinite(frame))throw new Error('Sunlight frame must be finite');
    const level=T.MathUtils.clamp(strength,0,1),facing=camera.getWorldDirection(new T.Vector3()).dot(this.direction);
    this.group.position.copy(camera.position).addScaledVector(this.direction,110);
    this.group.visible=level>.001&&facing>.08;
    this.glow.material.opacity=.26*level;this.disc.material.opacity=.96*level;
    this.group.updateMatrixWorld(true);
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.glow.material.dispose();this.disc.material.dispose();this.texture.dispose();}
}
