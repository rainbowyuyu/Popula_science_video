import * as T from 'three';
import {State,ramp} from './visual';
import {FlowBodyBoundary,buildSliceBodyMask,fluidCellTriangles,sampleSupportClearance,sampleValidTriangle,sectionBodyBoundary,sliceDisplayCrop,SliceDisplayCrop} from './FlowSliceGeometry';
import {findWakeSample,makeFlowSpatialWindow,makeFlowVelocityGlyphs,sectionRimGeometry,sliceWorldPoint,velocityGlyphGeometry,type FlowSpatialAnnotation,type FlowSpatialWindow,type FlowVelocityGlyph} from './FlowSliceSpatialDetail';

export type FlowSlice={
 id:string;kind:'horizontal'|'vertical';
 /** Lower-left grid sample. Coordinates and extents are solver metres. */
 origin_m:[number,number,number];uAxis:[number,number,number];vAxis:[number,number,number];
 width_m:number;height_m:number;nx:number;ny:number;
 /** Row-major, i fastest. Values at masked samples may be null. */
 speed_m_s:(number|null)[];velocity_m_s?:[number,number,number][];Cp?:number[];
 insideSolidMask:(0|1)[];validMask:(0|1)[];
 time_s:number|null;meaning:string;
};
export type ComputedFlowSlicesData={
 schema:'rainbow.computed-flow-slices/1';
 coordinates:'metres, Three.js XYZ, Y up';
 quality:{acceptedForFilm:boolean;acceptedForCoupling?:boolean;notes?:string};
 provenance:{solver:string;case:string;meaning:string;sourceSHA256:string};
 referenceVelocity_m_s:number;speedRange_m_s:[number,number];slices:FlowSlice[];
};
export type SliceWindow=readonly [enterStart:number,enterEnd:number,exitStart:number,exitEnd:number];
export type FlowSliceOptions={
 /** The main film uses 1 scene unit = 100 m. Never inferred from camera size. */
 worldUnitsPerMetre?:number;
 /** Map to narrative cue n+u, not elapsed time. Every interval is C2 eased. */
 windows?:Record<string,SliceWindow>;
 /** Default selects up to 3 height slices and 1 vertical slice. */
 sliceIds?:string[];
 opacity?:number;contourOpacity?:number;
 /** Optional physical contour values. Defaults to 20,40,60,80% of fixed range. */
 contourLevels_m_s?:number[];
 /** Composition fractions [left, top, right, bottom], origin top-left. */
 safeRects?:[number,number,number,number][];
 /** Native solved body skin; its source hash must match the accepted field. */
 boundary?:FlowBodyBoundary|null;
 /** Opacity-only coverage width, 0–0.25 display-grid cells, at least one
  * output pixel. Defaults to 0.06 cells. Never fills missing field data. */
 supportFeatherCells?:number;
};
export type FlowSliceLegend={
 quantity:'speed';label:'流速';unit:'m/s';range_m_s:[number,number];
 ticks_m_s:number[];contours_m_s:number[];
 palette:{at:number;color:string}[];
 referenceVelocity_m_s:number;solver:string;meaning:string;sourceSHA256:string;
 acceptedForFilm:true;clampedForDisplaySampleCount:number;
 slices:{id:string;kind:FlowSlice['kind'];origin_m:number[];time_s:number|null;meaning:string;visible:boolean;visibleFraction?:number;edgeTreatment?:{interpolation:string;supportFeather_m:number;supportInset_m:number;bodyAlignedSupportFade:boolean;bodyMask:string;bodyMaskErrorBound_m:number}}[];
};
type BuiltSlice={data:FlowSlice;root:T.Group;heat:T.Mesh;contours:T.LineSegments;arrows:T.Mesh;rim:T.Mesh;glyphs:FlowVelocityGlyph[];spatialWindow:FlowSpatialWindow;annotations:FlowSpatialAnnotation[];texture:T.DataTexture;bodyTexture:T.DataTexture;window:SliceWindow;uniforms:SliceUniforms;visible:boolean};
type SliceUniforms={field:{value:T.Texture};gridSize:{value:T.Vector2};planeExtent:{value:T.Vector2};supportFeather:{value:number};bodyField:{value:T.Texture};bodyGridSize:{value:T.Vector2};bodyBounds:{value:T.Vector4};bodyEnabled:{value:number};bodyError:{value:number};outputPixelScale:{value:number};enterFront:{value:number};exitFront:{value:number};baseOpacity:{value:number};screenSize:{value:T.Vector2};safeRects:{value:T.Vector4[]};safeCount:{value:number};spatialCenter:{value:T.Vector2};spatialRadii:{value:T.Vector4}};
// One fixed sequential physical scale for every height: the low-speed wake
// is blue, the high-speed region ochre. The broad 30 m/s reference field is
// pale, allowing the registered building and wake contours to remain clear.
const PALETTE=[{at:0,color:'#245e73'},{at:.26,color:'#438b9c'},{at:.52,color:'#a8cbd1'},{at:.76,color:'#e6e6d8'},{at:1,color:'#c88543'}];
const v=(p:readonly number[])=>new T.Vector3(p[0],p[1],p[2]);
const finite3=(p:unknown):p is [number,number,number]=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);

/** Fail closed. Missing, rejected or malformed exports produce an inert layer. */
export function validateComputedFlowSlices(data:unknown):string[]{
 const d=data as Partial<ComputedFlowSlicesData>|null,reasons:string[]=[];
 if(!d||typeof d!=='object')return ['No accepted CFD slice export'];
 if(d.schema!=='rainbow.computed-flow-slices/1')reasons.push('Unsupported CFD slice schema');
 if(d.coordinates!=='metres, Three.js XYZ, Y up')reasons.push('Unknown CFD slice coordinate convention');
 if(d.quality?.acceptedForFilm!==true)reasons.push('CFD slices are not accepted for film');
 if(!d.provenance||!/^([a-fA-F0-9]{64})$/.test(d.provenance.sourceSHA256??''))reasons.push('CFD slices lack a source SHA256');
 if(!d.provenance?.solver||!d.provenance?.case||!d.provenance?.meaning)reasons.push('CFD slices lack solver provenance');
 const range=d.speedRange_m_s;
 if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]<=range[0])reasons.push('Invalid fixed physical speed range');
 if(!Number.isFinite(d.referenceVelocity_m_s)||d.referenceVelocity_m_s!<0)reasons.push('Invalid reference speed');
 if(!Array.isArray(d.slices)||!d.slices.length)return [...reasons,'No CFD slices'];
 const ids=new Set<string>();
 for(const s of d.slices){
  if(!s||typeof s!=='object'){reasons.push('Invalid slice');continue;}
  if(!s.id||ids.has(s.id))reasons.push('Duplicate or missing slice id');ids.add(s.id);
  const prefix=`Slice ${s.id}: `;
  if(s.kind!=='horizontal'&&s.kind!=='vertical')reasons.push(prefix+'unsupported plane kind');
  if(!finite3(s.origin_m)||!finite3(s.uAxis)||!finite3(s.vAxis))reasons.push(prefix+'invalid plane basis');
  else if(Math.abs(v(s.uAxis).length()-1)>1e-4||Math.abs(v(s.vAxis).length()-1)>1e-4||Math.abs(v(s.uAxis).dot(v(s.vAxis)))>1e-4)reasons.push(prefix+'plane basis must be orthonormal');
  if(!Number.isFinite(s.width_m)||s.width_m<=0||!Number.isFinite(s.height_m)||s.height_m<=0)reasons.push(prefix+'invalid physical extent');
  if(!Number.isInteger(s.nx)||!Number.isInteger(s.ny)||s.nx<2||s.ny<2||s.nx*s.ny>1048576){reasons.push(prefix+'invalid grid dimensions');continue;}
  const n=s.nx*s.ny;
  if(![s.speed_m_s,s.insideSolidMask,s.validMask].every(a=>Array.isArray(a)&&a.length===n)){reasons.push(prefix+'grid array length mismatch');continue;}
  let live=0;
  for(let k=0;k<n;k++){
   if((s.insideSolidMask[k]!==0&&s.insideSolidMask[k]!==1)||(s.validMask[k]!==0&&s.validMask[k]!==1)){reasons.push(prefix+'invalid mask');break;}
   if(s.validMask[k]===1&&s.insideSolidMask[k]===0){live++;const speed=s.speed_m_s[k];if(typeof speed!=='number'||!Number.isFinite(speed)||speed<0){reasons.push(prefix+'nonphysical valid speed sample');break;}}
  }
  if(!live)reasons.push(prefix+'has no valid fluid samples');
  if(s.time_s!==null&&(!Number.isFinite(s.time_s)||s.time_s<0))reasons.push(prefix+'invalid solver time');
  if(!s.meaning)reasons.push(prefix+'missing field meaning');
 }
 return reasons;
}

/** Same piecewise-linear valid-triangle interpolation as GPU and contours.
 * Outside the convex support of three valid fluid samples returns null. */
export function sampleFlowSlice(slice:FlowSlice,u:number,w:number):number|null{
 return sampleValidTriangle(slice,u,w);
}

const fieldFragment=`
 uniform sampler2D field;uniform vec2 gridSize;uniform vec2 planeExtent;uniform float supportFeather;
 uniform sampler2D bodyField;uniform vec2 bodyGridSize;uniform vec4 bodyBounds;
 uniform float bodyEnabled;uniform float bodyError;uniform float outputPixelScale;
 vec4 atGrid(vec2 p){return texture2D(field,(p+vec2(.5))/gridSize);}
 vec4 sampleField(vec2 uv){
  vec2 p=uv*(gridSize-vec2(1.)),q=min(floor(p),gridSize-vec2(2.)),f=p-q;
  vec4 a=atGrid(q),b=atGrid(q+vec2(1.,0.)),c=atGrid(q+vec2(0.,1.)),d=atGrid(q+vec2(1.,1.));
  float count=a.a+b.a+c.a+d.a;if(count<2.5)discard;
  if(count>3.5)return f.x>=f.y?a*(1.-f.x)+b*(f.x-f.y)+d*f.y:a*(1.-f.y)+c*(f.y-f.x)+d*f.x;
  if(a.a<.5){if(f.x+f.y<1.)discard;return b*(1.-f.y)+c*(1.-f.x)+d*(f.x+f.y-1.);}
  if(b.a<.5){if(f.x>f.y)discard;return a*(1.-f.y)+c*(f.y-f.x)+d*f.x;}
  if(c.a<.5){if(f.y>f.x)discard;return a*(1.-f.x)+b*(f.x-f.y)+d*f.y;}
  if(f.x+f.y>1.)discard;return a*(1.-f.x-f.y)+b*f.x+c*f.y;
 }
 vec2 atBody(vec2 p){return texture2D(bodyField,(p+vec2(.5))/bodyGridSize).rg;}
 float supportAlpha(vec2 uv,float localClearance){
  float localFade=smoothstep(0.,supportFeather,localClearance);
  if(bodyEnabled<.5)return localFade;vec2 p=uv*planeExtent;
  vec2 t=(p-bodyBounds.xy)/(bodyBounds.zw-bodyBounds.xy);
  if(min(t.x,t.y)<0.||max(t.x,t.y)>1.)return localFade;
  vec2 grid=t*(bodyGridSize-vec2(1.)),q=min(floor(grid),bodyGridSize-vec2(2.)),f=grid-q;
  vec2 distances=mix(mix(atBody(q),atBody(q+vec2(1.,0.)),f.x),mix(atBody(q+vec2(0.,1.)),atBody(q+vec2(1.,1.)),f.x),f.y)-vec2(bodyError);
  float sd=distances.r;
  // One delivered-image pixel, wholly outside the conservative native skin.
  // This smooths coverage only; speed still comes from valid triangles.
  float width=max(fwidth(sd)*outputPixelScale,.0001);
  float coverage=smoothstep(0.,width,sd);
  // Use each location's actual valid-triangle edge, not the worst missing
  // sample distance around the entire tower. Only a sub-cell / one-pixel
  // coverage ramp is added. sampleField still rejects every invalid triangle.
  float supportWidth=max(max(fwidth(distances.g)*outputPixelScale,supportFeather),.0001);
  return coverage*smoothstep(0.,supportWidth,distances.g);
 }`;

const sharedFragment=`
 uniform vec2 screenSize;uniform vec4 safeRects[6];uniform int safeCount;
 uniform float enterFront;uniform float exitFront;uniform float baseOpacity;
 uniform vec2 spatialCenter;uniform vec4 spatialRadii;
 // World-metre window affects coverage only, never the sampled CFD value.
 float spatialAlpha(vec2 p){
  vec2 delta=p-spatialCenter;float radius=delta.x<0.?spatialRadii.x:spatialRadii.y;
  float width=spatialRadii.z+spatialRadii.w*clamp(delta.x/spatialRadii.y,0.,1.);
  return 1.-smoothstep(.72,1.,length(vec2(delta.x/radius,delta.y/width)));
 }
 float sweepAlpha(vec2 p){
  float enter=1.0-smoothstep(enterFront-.014,enterFront+.014,p.x);
  float leave=smoothstep(exitFront-.014,exitFront+.014,p.x);
  float edge=smoothstep(0.0,.018,p.y)*(1.0-smoothstep(.982,1.0,p.y));
  return enter*leave*edge;
 }
 float editorialAlpha(){
  vec2 p=vec2(gl_FragCoord.x/screenSize.x,1.0-gl_FragCoord.y/screenSize.y);
  float hidden=0.0;
  for(int i=0;i<6;i++){
   if(i>=safeCount)break;vec4 r=safeRects[i];
   // A rectangle touching the frame edge stays fully masked there. Applying
   // smoothstep at 0/1 would leak half-opacity lines around the whole frame.
   float a=(r.x<=0.0?1.0:smoothstep(r.x-.012,r.x+.012,p.x))*(r.z>=1.0?1.0:1.0-smoothstep(r.z-.012,r.z+.012,p.x));
   float b=(r.y<=0.0?1.0:smoothstep(r.y-.012,r.y+.012,p.y))*(r.w>=1.0?1.0:1.0-smoothstep(r.w-.012,r.w+.012,p.y));
   hidden=max(hidden,a*b);
  }
  return 1.0-hidden;
 }`;
const defaultWindows=(slices:FlowSlice[])=>{
 const windows:Record<string,SliceWindow>={},horizontal=slices.filter(s=>s.kind==='horizontal').slice(0,3),vertical=slices.find(s=>s.kind==='vertical');
 const slots=horizontal.length||1,span=1.72/slots;
 horizontal.forEach((s,i)=>{const a=28.95+i*span;windows[s.id]=[a,a+.22,a+span-.07,a+span+.19];});
 if(vertical)windows[vertical.id]=[30.77,31.10,31.75,32.14];
 return windows;
};

/** Data-only, deterministic CFD view. No analytical/synthetic fallback is built.
 * Multiple physical sections share one fixed m/s palette. Plane locations never
 * move: the reveal/exit front scans the registered grid instead of flying a
 * heatmap away from its geometry. Static RANS fields remain static; no animated
 * turbulence or interpolated solver time is invented. */
export class ComputedFlowSlices{
 readonly root=new T.Group();readonly accepted:boolean;readonly rejectionReasons:string[];
 readonly slices:BuiltSlice[]=[];readonly legend:FlowSliceLegend|null;
 private disposed=false;private readonly scale:number;
 private boundary:FlowBodyBoundary|null=null;private scanner:T.Mesh|null=null;private scanTemplate:FlowSlice|null=null;private lastScanHeight=NaN;private lastCue=-Infinity;
 constructor(scene:T.Scene,data:ComputedFlowSlicesData|null|undefined,options:FlowSliceOptions={}){
  this.root.name='accepted-computed-flow-slices';this.root.visible=false;
  this.rejectionReasons=validateComputedFlowSlices(data);
  if(options.boundary){const b=options.boundary;if(b.quality?.acceptedForFilm!==true||b.schema!=='rainbow.computed-pressure/1'||b.coordinates!==data?.coordinates||b.provenance?.sourceSHA256!==data?.provenance?.sourceSHA256||!Array.isArray(b.points_m)||!b.points_m.length||b.points_m.some(p=>!finite3(p))||!Array.isArray(b.triangles)||!b.triangles.length||b.triangles.some(t=>t.length!==3||t.some(i=>!Number.isInteger(i)||i<0||i>=b.points_m.length)))this.rejectionReasons.push('Native body boundary is invalid or does not match CFD field provenance');}
  this.accepted=this.rejectionReasons.length===0;
  this.scale=options.worldUnitsPerMetre??.01;
  if(!Number.isFinite(this.scale)||this.scale<=0)throw new Error('Slice worldUnitsPerMetre must be positive');
  if(!this.accepted||!data){this.legend=null;return;}
  const range=data.speedRange_m_s,levels=options.contourLevels_m_s??[.2,.4,.6,.8].map(f=>range[0]+f*(range[1]-range[0]));
  if(levels.some(x=>!Number.isFinite(x)||x<=range[0]||x>=range[1]))throw new Error('Contour levels must lie inside fixed speed range');
  const windows=options.windows??defaultWindows(data.slices);
  const selected=data.slices.filter(s=>(!options.sliceIds||options.sliceIds.includes(s.id))&&windows[s.id]);
  let clipped=0;
  for(const s of selected){for(let k=0;k<s.speed_m_s.length;k++)if(s.validMask[k]&&!s.insideSolidMask[k]&&((s.speed_m_s[k] as number)<range[0]||(s.speed_m_s[k] as number)>range[1]))clipped++;}
  this.legend={quantity:'speed',label:'流速',unit:'m/s',range_m_s:[...range],ticks_m_s:[range[0],(range[0]+range[1])*.5,range[1]],contours_m_s:[...levels],palette:PALETTE.map(c=>({...c})),referenceVelocity_m_s:data.referenceVelocity_m_s,solver:data.provenance.solver,meaning:data.provenance.meaning,sourceSHA256:data.provenance.sourceSHA256,acceptedForFilm:true,clampedForDisplaySampleCount:clipped,slices:selected.map(s=>({id:s.id,kind:s.kind,origin_m:[...s.origin_m],time_s:s.time_s,meaning:s.meaning,visible:false}))};
  for(const s of selected){
   const window=windows[s.id];
   if(window.length!==4||!window.every(Number.isFinite)||window[0]>=window[1]||window[1]>window[2]||window[2]>=window[3])throw new Error(`Invalid sweep window for ${s.id}`);
   this.slices.push(this.build(s,range,levels,window,options));
  }
  const horizontal=this.slices.filter(s=>s.data.kind==='horizontal');
  if(options.boundary&&horizontal.length){
   this.boundary=options.boundary;this.scanTemplate=horizontal[0].data;
   const uniforms={...horizontal[0].uniforms,baseOpacity:{value:0},contourColor:{value:new T.Color('#ca8a48')}};
   const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform vec3 contourColor;${sharedFragment}void main(){float alpha=baseOpacity*editorialAlpha();if(alpha<.001)discard;gl_FragColor=vec4(contourColor,alpha);\n#include <colorspace_fragment>}`});
   this.scanner=new T.Mesh(new T.BufferGeometry(),material);this.scanner.name='native-shell-geometric-height-scanner';this.scanner.renderOrder=5;this.scanner.frustumCulled=false;this.scanner.visible=false;
   this.scanner.onBeforeRender=(renderer:T.WebGLRenderer)=>renderer.getDrawingBufferSize(uniforms.screenSize.value);
   this.root.add(this.scanner);
  }
  scene.add(this.root);
 }
 private point(s:FlowSlice,u:number,w:number){return v(s.origin_m).addScaledVector(v(s.uAxis),u*s.width_m).addScaledVector(v(s.vAxis),w*s.height_m).multiplyScalar(this.scale);}
 private build(s:FlowSlice,range:[number,number],levels:number[],window:SliceWindow,options:FlowSliceOptions):BuiltSlice{
  const pixels=new Float32Array(s.nx*s.ny*4);
  const clearance=sampleSupportClearance(s),gridStep=Math.max(s.width_m/(s.nx-1),s.height_m/(s.ny-1)),supportFeather=(options.supportFeatherCells??.06)*gridStep;
  if(!Number.isFinite(supportFeather)||supportFeather<0||supportFeather>.25*gridStep)throw new Error('Slice support feather must be 0 to 0.25 display-grid cells');
  for(let k=0;k<s.nx*s.ny;k++){
   const valid=s.validMask[k]===1&&s.insideSolidMask[k]===0;
   // Preserve the scalar before interpolation. If the configured legend clips
   // a value, clamp the interpolated display colour, never the raw samples.
   pixels[k*4]=valid?((s.speed_m_s[k] as number)-range[0])/(range[1]-range[0]):0;
   pixels[k*4+1]=clearance[k];
   pixels[k*4+3]=valid?1:0;
  }
  const texture=new T.DataTexture(pixels,s.nx,s.ny,T.RGBAFormat,T.FloatType);
  texture.magFilter=T.NearestFilter;texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const body=options.boundary?buildSliceBodyMask(s,options.boundary):null;
  const spatialWindow=makeFlowSpatialWindow(s,body?.segments??[]);
  // Keep the registered section readable: the native CFD grid is much wider
  // than the tower, so rasterising its entire rectangle produced a broad
  // white/low-opacity halo around the building.  This crop is an editorial
  // viewport in the same solver coordinates; the shader still samples only
  // original valid triangles and therefore cannot invent near-wall speed.
  const crop:SliceDisplayCrop=body?.segments.length?sliceDisplayCrop(s,body.segments):{u0:0,u1:1,v0:0,v1:1,marginU_m:s.width_m,marginV_m:s.height_m};
  const bodyPixels=new Float32Array((body?.distance_m.length??4)*2);
  for(let k=0;k<bodyPixels.length/2;k++){bodyPixels[k*2]=body?.distance_m[k]??1;bodyPixels[k*2+1]=body?.supportDistance_m[k]??1;}
  const bodyTexture=new T.DataTexture(bodyPixels,body?.nx??2,body?.ny??2,T.RGFormat,T.FloatType);
  bodyTexture.magFilter=T.NearestFilter;bodyTexture.minFilter=T.NearestFilter;bodyTexture.generateMipmaps=false;bodyTexture.needsUpdate=true;
  const meta=this.legend?.slices.find(x=>x.id===s.id);if(meta)meta.edgeTreatment={interpolation:'piecewise-linear triangles of valid samples only; no extrapolation',supportFeather_m:supportFeather,supportInset_m:0,bodyAlignedSupportFade:false,bodyMask:body?'native solved body/plane intersection and local valid-triangle coverage; no global wall buffer':'valid sample support only',bodyMaskErrorBound_m:body?.interpolationErrorBound_m??0};
  // The vertical section explains flow over the crown: do not erase its
  // upper region with a full-width title mask. The left lane already keeps
  // the logo/readout clear, and the lower subtitle lane remains protected.
  const defaultSafe:[number,number,number,number][]=s.kind==='vertical'
   ?[[0,0,.34,.88],[0,.87,1,1]]
   :[[0,0,.34,.88],[0,0,1,.145],[0,.87,1,1]];
  const safe=options.safeRects??defaultSafe;
  if(safe.length>6)throw new Error('At most 6 screen safety rectangles are supported');
  const rects=Array.from({length:6},(_,i)=>new T.Vector4(...(safe[i]??[0,0,0,0])));
  const uniforms:SliceUniforms={field:{value:texture},gridSize:{value:new T.Vector2(s.nx,s.ny)},planeExtent:{value:new T.Vector2(s.width_m,s.height_m)},supportFeather:{value:supportFeather},bodyField:{value:bodyTexture},bodyGridSize:{value:new T.Vector2(body?.nx??2,body?.ny??2)},bodyBounds:{value:new T.Vector4(...(body?.bounds??[0,0,1,1]))},bodyEnabled:{value:body?1:0},bodyError:{value:body?.interpolationErrorBound_m??0},outputPixelScale:{value:1},enterFront:{value:-.025},exitFront:{value:-.025},baseOpacity:{value:options.opacity??.32},screenSize:{value:new T.Vector2(3840,2160)},safeRects:{value:rects},safeCount:{value:safe.length},spatialCenter:{value:new T.Vector2(...spatialWindow.center_m)},spatialRadii:{value:new T.Vector4(spatialWindow.upstream_m,spatialWindow.downstream_m,spatialWindow.halfWidth_m,spatialWindow.downstreamWidening_m)}};
  const colors=PALETTE.map(p=>new T.Color(p.color));
  const material=new T.ShaderMaterial({uniforms:{...uniforms,palette:{value:colors}},transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
   vertexShader:`varying vec2 planeUv;void main(){planeUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`uniform vec3 palette[5];varying vec2 planeUv;${sharedFragment}${fieldFragment}
    void main(){
     vec4 value=sampleField(planeUv);float speed=clamp(value.r,0.0,1.0);
     vec3 col=speed<.26?mix(palette[0],palette[1],speed/.26):speed<.52?mix(palette[1],palette[2],(speed-.26)/.26):speed<.76?mix(palette[2],palette[3],(speed-.52)/.24):mix(palette[3],palette[4],(speed-.76)/.24);
     float alpha=baseOpacity*sweepAlpha(planeUv)*spatialAlpha(planeUv*planeExtent)*editorialAlpha()*supportAlpha(planeUv,value.g);if(alpha<.001)discard;
     gl_FragColor=vec4(col,alpha);
     #include <colorspace_fragment>
    }`});
  const geometry=new T.BufferGeometry();
  const corners=[[crop.u0,crop.v0],[crop.u1,crop.v0],[crop.u0,crop.v1],[crop.u1,crop.v1]] as const;
  geometry.setAttribute('position',new T.Float32BufferAttribute(corners.flatMap(([u,w])=>this.point(s,u,w).toArray()),3));
  // UVs stay in the full field's normalised coordinates. This is crucial:
  // supportAlpha/spatialAlpha continue to use solver metres, while the mesh
  // itself is now tightly framed around the native body intersection.
  geometry.setAttribute('uv',new T.Float32BufferAttribute(corners.flatMap(([u,w])=>[u,w]),2));geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const heat=new T.Mesh(geometry,material);heat.name=`speed-section-${s.id}`;heat.renderOrder=3;heat.frustumCulled=false;
  const contourGeometry=this.makeContours(s,levels,crop);
  const lineUniforms={...uniforms,baseOpacity:{value:options.contourOpacity??.34},contourColor:{value:new T.Color('#295e70')}};
  const lineMaterial=new T.ShaderMaterial({uniforms:lineUniforms,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
   vertexShader:`attribute vec2 sliceUv;varying vec2 planeUv;void main(){planeUv=sliceUv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`uniform vec3 contourColor;varying vec2 planeUv;${sharedFragment}${fieldFragment}void main(){vec4 value=sampleField(planeUv);float alpha=baseOpacity*sweepAlpha(planeUv)*spatialAlpha(planeUv*planeExtent)*editorialAlpha()*supportAlpha(planeUv,value.g);if(alpha<.001)discard;gl_FragColor=vec4(contourColor,alpha);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  const contours=new T.LineSegments(contourGeometry,lineMaterial);contours.name=`speed-isolines-${s.id}`;contours.renderOrder=4;contours.frustumCulled=false;
  const insideCrop=(p:[number,number])=>p[0]>=crop.u0*s.width_m-.5&&p[0]<=crop.u1*s.width_m+.5&&p[1]>=crop.v0*s.height_m-.5&&p[1]<=crop.v1*s.height_m+.5;
  const glyphs=makeFlowVelocityGlyphs(s,body?.segments??[],spatialWindow).filter(g=>g.vertices_m.every(insideCrop));
  const arrowMaterial=new T.ShaderMaterial({uniforms:{...uniforms,baseOpacity:{value:.92},contourColor:{value:new T.Color('#194f63')}},transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
   vertexShader:lineMaterial.vertexShader,fragmentShader:lineMaterial.fragmentShader});
  const arrows=new T.Mesh(velocityGlyphGeometry(s,glyphs,this.scale),arrowMaterial);arrows.name=`projected-mean-velocity-${s.id}`;arrows.renderOrder=5;arrows.frustumCulled=false;
  const rimMaterial=new T.ShaderMaterial({uniforms:{...uniforms,baseOpacity:{value:.86},contourColor:{value:new T.Color('#bb8045')}},transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
   vertexShader:lineMaterial.vertexShader,fragmentShader:`uniform vec3 contourColor;uniform vec2 planeExtent;varying vec2 planeUv;${sharedFragment}void main(){float alpha=baseOpacity*sweepAlpha(planeUv)*spatialAlpha(planeUv*planeExtent)*editorialAlpha();if(alpha<.001)discard;gl_FragColor=vec4(contourColor,alpha);\n#include <colorspace_fragment>}`});
  const rim=new T.Mesh(sectionRimGeometry(s,body?.segments??[],this.scale),rimMaterial);rim.name=`native-shell-intersection-${s.id}`;rim.renderOrder=5;rim.frustumCulled=false;
  // Labels are handed to the film's shared world-space label renderer.
  const annotations:FlowSpatialAnnotation[]=[];
  if(body?.segments.length){const points=body.segments.flat(),left=points.reduce((a,p)=>p[0]<a[0]?p:a,points[0]);annotations.push({text:s.kind==='horizontal'?`${s.origin_m[1]} m 截面`:'建筑纵剖面',point:sliceWorldPoint(s,[left[0]-9,left[1]],this.scale),color:'#a36c37',weight:.95});}
  // The accepted scope is qualitative mean-flow explanation. Keep the actual
  // sample for anchor selection, without presenting a local value as a
  // validated engineering measurement. The global m/s legend remains fixed.
  const wake=findWakeSample(s,spatialWindow,body?.segments??[]);if(wake&&insideCrop(wake.point_m))annotations.push({text:wake.speed_m_s<(this.legend?.referenceVelocity_m_s??0)*.9?'背风低速区':'背风侧绕流',point:sliceWorldPoint(s,wake.point_m,this.scale),color:'#245e73',weight:.82});
  const size=(renderer:T.WebGLRenderer)=>{renderer.getDrawingBufferSize(uniforms.screenSize.value);uniforms.outputPixelScale.value=renderer.getPixelRatio();};
  heat.onBeforeRender=size;contours.onBeforeRender=size;arrows.onBeforeRender=size;rim.onBeforeRender=size;
  const root=new T.Group();root.name=s.id;root.add(heat,contours,arrows,rim);root.visible=false;this.root.add(root);
  return {data:s,root,heat,contours,arrows,rim,glyphs,spatialWindow,annotations,texture,bodyTexture,window,uniforms,visible:false};
 }
  private makeContours(s:FlowSlice,levels:number[],crop:SliceDisplayCrop={u0:0,u1:1,v0:0,v1:1,marginU_m:0,marginV_m:0}){
   // Liang–Barsky clipping keeps contour segments inside the same tight
   // viewport as the heat plane.  Without this, a contour crossing the crop
   // edge could protrude into the empty background for one or two pixels.
   const clip=(a:[number,number],b:[number,number]):[[number,number],[number,number]]|null=>{
    let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
    const tests:[[number,number],[number,number],[number,number],[number,number]]=[[-dx,a[0]-crop.u0], [dx,crop.u1-a[0]],[-dy,a[1]-crop.v0],[dy,crop.v1-a[1]]];
    for(const [p,q] of tests){if(Math.abs(p)<1e-12){if(q<0)return null;continue;}const r=q/p;if(p<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}}
    return t1<t0?null:[[a[0]+dx*t0,a[1]+dy*t0],[a[0]+dx*t1,a[1]+dy*t1]];
   };
  const pos:number[]=[],uv:number[]=[];
  // Contours use exactly the heatmap's valid triangle support and scalar field.
  for(let j=0;j<s.ny-1;j++)for(let i=0;i<s.nx-1;i++){
   const ids=[j*s.nx+i,j*s.nx+i+1,(j+1)*s.nx+i+1,(j+1)*s.nx+i];
   const pts=[[i/(s.nx-1),j/(s.ny-1)],[(i+1)/(s.nx-1),j/(s.ny-1)],[(i+1)/(s.nx-1),(j+1)/(s.ny-1)],[i/(s.nx-1),(j+1)/(s.ny-1)]];
   for(const level of levels)for(const triangle of fluidCellTriangles(s,i,j)){
    const hits:number[][]=[];
    for(let e=0;e<3;e++){
     const a=triangle[e],b=triangle[(e+1)%3],sa=s.speed_m_s[ids[a]] as number,sb=s.speed_m_s[ids[b]] as number;
     if((sa<=level&&sb>level)||(sb<=level&&sa>level)){const f=(level-sa)/(sb-sa);hits.push([pts[a][0]+(pts[b][0]-pts[a][0])*f,pts[a][1]+(pts[b][1]-pts[a][1])*f]);}
    }
     if(hits.length===2&&Math.hypot(hits[0][0]-hits[1][0],hits[0][1]-hits[1][1])>1e-8){
      const clipped=clip(hits[0] as [number,number],hits[1] as [number,number]);
      if(clipped)for(const h of clipped){pos.push(...this.point(s,h[0],h[1]).toArray());uv.push(...h);}
     }
   }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('sliceUv',new T.Float32BufferAttribute(uv,2));geometry.computeBoundingSphere();return geometry;
 }
 /** Optional cue permits a revised narration schedule without changing data.
  * update is seek-safe: no simulation accumulator or wall-clock dependency. */
 update(state:Pick<State,'n'|'u'|'time'>,camera:T.Camera,cue=state.n+state.u){
  if(this.disposed||!this.accepted)return;
  this.lastCue=cue;
  let any=false;
  this.slices.forEach((s,i)=>{
   const [a,b,c,d]=s.window;
   const enter=ramp(a,b,cue),exit=ramp(c,d,cue);
   s.uniforms.enterFront.value=-.025+1.05*enter;s.uniforms.exitFront.value=-.025+1.05*exit;
   // At both visibility boundaries the complete plane is already discarded
   // by the scan shader, so neither geometry nor contours can suddenly pop.
   s.visible=cue>a&&cue<d;s.root.visible=s.visible;any ||= s.visible;
   if(this.legend){this.legend.slices[i].visible=s.visible;this.legend.slices[i].visibleFraction=Math.max(0,enter-exit);}
  });
  if(this.scanner&&this.scanTemplate&&this.boundary){
   const horizontal=this.slices.filter(s=>s.data.kind==='horizontal'),start=horizontal[0].window[0]-.06,end=horizontal.at(-1)!.window[3]+.05;
   const fraction=ramp(start,start+.12,cue)*(1-ramp(end-.18,end,cue));
   this.scanner.visible=fraction>0;any ||= this.scanner.visible;
   (this.scanner.material as T.ShaderMaterial).uniforms.baseOpacity.value=.95*fraction;
   if(this.scanner.visible){const height=this.getScanHeight(cue);if(height!==this.lastScanHeight){
    const slice={...this.scanTemplate,origin_m:[this.scanTemplate.origin_m[0],height,this.scanTemplate.origin_m[2]] as [number,number,number]};
    const section=sectionBodyBoundary(slice,this.boundary);const geometry=sectionRimGeometry(slice,section.segments,this.scale,1.4);
    this.scanner.geometry.dispose();this.scanner.geometry=geometry;this.lastScanHeight=height;
   }}
  }
  this.root.visible=any;
  // Camera intentionally does not translate the data. Depth testing and each
  // fragment's screen mask remain valid under every continuous orbit.
  void camera;
 }
 getLegendMeta():FlowSliceLegend|null{return this.legend;}
 /** Geometric scanner height in solver metres. Intermediate heights contain
  * only the native shell intersection; the computed planes never move. */
 getScanHeight(cue=this.lastCue):number{
  const horizontal=this.slices.filter(s=>s.data.kind==='horizontal');if(!horizontal.length)return 0;
  for(let i=1;i<horizontal.length;i++){const previous=horizontal[i-1],next=horizontal[i];if(cue<=previous.window[2])return previous.data.origin_m[1];if(cue<next.window[0])return previous.data.origin_m[1]+(next.data.origin_m[1]-previous.data.origin_m[1])*ramp(previous.window[2],next.window[0],cue);}
  return horizontal.at(-1)!.data.origin_m[1];
 }
 getSpatialAnnotations():FlowSpatialAnnotation[]{
  if(this.disposed||!this.accepted)return [];
  const selected=this.slices.filter(s=>s.visible).sort((a,b)=>{const fraction=(s:BuiltSlice)=>ramp(s.window[0],s.window[1],this.lastCue)-ramp(s.window[2],s.window[3],this.lastCue);return fraction(b)-fraction(a);})[0];
  if(!selected)return [];
  const fraction=ramp(selected.window[0],selected.window[1],this.lastCue)*(1-ramp(selected.window[2],selected.window[3],this.lastCue));
  const opacity=ramp(.38,.78,fraction);if(opacity<=0)return [];
  return selected.annotations.map(a=>({...a,point:a.point.clone(),weight:(a.weight??1)*opacity}));
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.removeFromParent();
  for(const s of this.slices){for(const mesh of [s.heat,s.contours,s.arrows,s.rim]){mesh.geometry.dispose();(mesh.material as T.Material).dispose();}s.texture.dispose();s.bodyTexture.dispose();s.root.clear();}
  if(this.scanner){this.scanner.geometry.dispose();(this.scanner.material as T.Material).dispose();this.scanner=null;}this.boundary=null;this.scanTemplate=null;
  this.slices.length=0;this.root.clear();
 }
}
