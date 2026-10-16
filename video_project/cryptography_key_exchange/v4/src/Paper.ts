import * as T from 'three';

export const PAPER_FONT='"Noto Serif SC", "SimSun", serif';
export const PAPER_SANS='"Noto Sans SC", "Microsoft YaHei", sans-serif';
export const PAPER_MONO='"Consolas", "Courier New", monospace';
const PAPER='#faf8f0', INK='#193d43', MUTED='#637871';

function seededRandom(seed:number){
  return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

/** Deterministic uncoated paper stock. Content callback must not paint over it. */
export function paperTexture(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d')!;
  // Clean, uncoated stock, like the cover render. Grain is part of the blank
  // paper only: laying it over the finished print would grey out the letters.
  const rand=seededRandom(20261015),pixels=ctx.createImageData(w,h);
  for(let i=0;i<pixels.data.length;i+=4){
    const grain=(rand()+rand()+rand()-1.5)*1.1;
    pixels.data[i]=250+grain;pixels.data[i+1]=248+grain;
    pixels.data[i+2]=240+grain;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  ctx.lineWidth=.55;
  for(let i=0;i<w*h/310;i++){
    const x=rand()*w,y=rand()*h,len=.8+rand()*2.5;
    ctx.strokeStyle=i%2?'rgba(129,126,113,.025)':'rgba(255,255,255,.10)';
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y+(rand()-.5)*.8);ctx.stroke();
  }
  ctx.save();ctx.fillStyle=INK;ctx.textAlign='left';ctx.textBaseline='alphabetic';draw(ctx);ctx.restore();
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;
}

/** Header baseline 116px at 1200px width; consistent 7% print margins. */
export function drawPrintHeader(ctx:CanvasRenderingContext2D,w:number,title:string,eyebrow?:string){
  const s=w/1200,m=w*.07;ctx.save();ctx.fillStyle=INK;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font=`600 ${78*s}px ${PAPER_FONT}`;
  ctx.fillText(title,m,116*s,w-2*m);
  if(eyebrow){ctx.fillStyle=MUTED;ctx.font=`500 ${60*s}px ${PAPER_SANS}`;ctx.fillText(eyebrow,m,202*s,w-2*m);}
  ctx.restore();
}
export function drawPrintRule(ctx:CanvasRenderingContext2D,y:number,w:number){ctx.save();ctx.strokeStyle='rgba(153,122,70,.42)';ctx.lineWidth=Math.max(1.1,w/850);ctx.beginPath();ctx.moveTo(w*.07,y);ctx.lineTo(w*.93,y);ctx.stroke();ctx.restore();}

function paperZ(x:number,y:number,w:number,h:number){
  const u=x/w+.5,v=y/h+.5;
  // A continuous gentle arch and a lifted free edge, matching the cover's
  // bent sheet. No hard corner fold or corrugated displacement under the ink.
  return w*(.045*Math.sin(v*Math.PI)+.022*Math.pow(2*u-1,2)
    +.036*Math.pow(v,8)+.010*Math.pow(u*v,6)
    +.006*(2*u-1)*(2*v-1)+.006*(u-.5)*Math.sin(v*Math.PI));
}
const SEGMENTS_X=48,SEGMENTS_Y=40;
function faceGeometry(w:number,h:number){
  const g=new T.PlaneGeometry(w,h,SEGMENTS_X,SEGMENTS_Y),p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,paperZ(p.getX(i),p.getY(i),w,h));
  p.needsUpdate=true;g.computeVertexNormals();return g;
}
function offsetFace(source:T.BufferGeometry,distance:number){
  const g=source.clone(),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+distance*n.getX(i),p.getY(i)+distance*n.getY(i),p.getZ(i)+distance*n.getZ(i));
  p.needsUpdate=true;g.computeVertexNormals();return g;
}

/** Physical micrograin stays independent from the replaceable printed map. */
function stockGrain(w:number,h:number){
  const size=128,data=new Uint8Array(size*size*4),rand=seededRandom(17621);
  for(let i=0;i<size*size;i++){
    const value=Math.round(128+(rand()+rand()+rand()-1.5)*28);
    data[4*i]=data[4*i+1]=data[4*i+2]=value;data[4*i+3]=255;
  }
  const map=new T.DataTexture(data,size,size,T.RGBAFormat);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(w*1.6,h*1.6);
  map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.anisotropy=8;map.needsUpdate=true;
  return map;
}

/** children[1].material.map is stable for the existing dynamic-print interface. */
export function paperPanel(parent:T.Object3D,w:number,h:number,tex:T.Texture){
  const group=new T.Group();group.name='PrintedPaper';
  const thickness=T.MathUtils.clamp(Math.min(w,h)/420,.004,.009);
  const surface=faceGeometry(w,h),grain=stockGrain(w,h);
  const backGeometry=offsetFace(surface,-thickness/2),frontGeometry=offsetFace(surface,thickness/2);
  surface.dispose();
  const stock=new T.Mesh(backGeometry,new T.MeshPhysicalMaterial({color:PAPER,roughness:.92,metalness:0,clearcoat:0,specularIntensity:.16,ior:1.45,envMapIntensity:.26,bumpMap:grain,bumpScale:thickness*.12,side:T.BackSide,shadowSide:T.DoubleSide}));
  stock.name='PaperStock';stock.castShadow=true;stock.receiveShadow=false;group.add(stock);
  // The front/back share exactly the same dimensions and curvature, offset
  // along their normals. Unlike two independently bent planes, they cannot
  // cross at a curled edge. No emissiveMap retains a discarded printed texture.
  const front=new T.Mesh(frontGeometry,new T.MeshPhysicalMaterial({map:tex,roughness:.91,metalness:0,clearcoat:0,specularIntensity:.14,ior:1.45,envMapIntensity:.26,bumpMap:grain,bumpScale:thickness*.12,side:T.FrontSide}));
  front.name='PrintedFace';front.castShadow=false;front.receiveShadow=false;group.add(front);
  // A real thin perimeter catches glancing light; there is no rounded plastic slab.
  const vertices:number[]=[],indices:number[]=[],boundary:number[]=[];
  for(let x=0;x<=SEGMENTS_X;x++)boundary.push(x);
  for(let y=1;y<=SEGMENTS_Y;y++)boundary.push(y*(SEGMENTS_X+1)+SEGMENTS_X);
  for(let x=SEGMENTS_X-1;x>=0;x--)boundary.push(SEGMENTS_Y*(SEGMENTS_X+1)+x);
  for(let y=SEGMENTS_Y-1;y>0;y--)boundary.push(y*(SEGMENTS_X+1));
  const back=backGeometry.attributes.position,face=frontGeometry.attributes.position;
  boundary.forEach(i=>vertices.push(back.getX(i),back.getY(i),back.getZ(i),face.getX(i),face.getY(i),face.getZ(i)));
  for(let i=0;i<boundary.length;i++){const a=i*2,b=((i+1)%boundary.length)*2;indices.push(a,b,a+1,b,b+1,a+1);}
  const edgeGeo=new T.BufferGeometry();edgeGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));edgeGeo.setIndex(indices);edgeGeo.computeVertexNormals();
  const edge=new T.Mesh(edgeGeo,new T.MeshStandardMaterial({color:'#e8e2d2',roughness:.97,metalness:0,envMapIntensity:.22,side:T.DoubleSide}));
  edge.name='PaperCutEdge';edge.castShadow=false;edge.receiveShadow=false;group.add(edge);
  group.userData.paper={width:w,height:h,thickness,deterministic:true,stock:'warm-white-uncoated',geometry:'normal-offset-watertight-shell',version:2};
  parent.add(group);return group;
}
