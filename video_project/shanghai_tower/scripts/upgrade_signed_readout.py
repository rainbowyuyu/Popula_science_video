from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'src/Film.tsx'
s = p.read_text(encoding='utf-8')
start = s.index("import componentData from")
end = s.index('type Mark=', start)
s = s[:start] + "const tl=tlData as Timeline;\ntype ComponentValue={name:string;stressMPa:number;reveal:number};\n\n" + s[end:]
s = s.replace('onSlices,onPile}:{frame:', 'onSlices,onPile,onComponent}:{frame:')
s = s.replace('onPile:(value:PileLegend|null)=>void})', 'onPile:(value:PileLegend|null)=>void;onComponent:(value:ComponentValue|null)=>void})')
needle = 'const labels:Mark[]=[];'
assert s.count(needle) == 1
s = s.replace(needle, '''const labels:Mark[]=[];
  // Read from the exact high-resolution sample already driving the mesh and
  // force glyphs. Never substitute an unsigned, lower-rate history envelope.
  const selected=world.memberForces?.getReadout(),cue=s.n+s.u;
  let component:ComponentValue|null=selected?{name:selected.name,stressMPa:selected.stressMPa,reveal:selected.reveal}:null;
  if(cue>=32.98&&cue<33.95&&world.physics){
   const axes=world.physics.byMesh.get('MEGACOL_Z04_C03')??[];
   const values=axes.map(a=>world.physics!.currentStress[a.index]).filter(Number.isFinite);
   if(values.length)component={name:'近侧巨柱 · 极值',stressMPa:values.reduce((a,b)=>Math.abs(a)>=Math.abs(b)?a:b),reveal:pulse(32.98,33.08,33.75,33.95,cue)};
  }
  onComponent(component);''')
s = s.replace('gl,onMarks,onRange,onFlow,onPressure,onSlices,onPile]);','gl,onMarks,onRange,onFlow,onPressure,onSlices,onPile,onComponent]);')
s = '\n'.join(line for line in s.split('\n') if "value='两侧一起工作'" not in line and "value='两侧柱，接住风'" not in line)
s = s.replace("'核心筒弯曲应力'", "'核心筒截面应力'")
s = s.replace('>截面上界 · MPa</div>', '>轴力 + 弯曲 · 上界 · MPa</div>')
s = s.replace('>MPa · 色彩增强</div>', '>MPa · 色彩增强</div>\n   <div style={{fontSize:36,color:C.muted,marginTop:15}}>位移显示 ×{WIND_MAGNIFICATION}</div>')
start = s.index('/** A small, physical-value readout')
end = s.index('/** A compact visual key',start)
s = s[:start] + '''/** One signed reading, in the existing clear left margin. The value and
 * colour share the same computed sample as the force arrows and mesh. */
function ComponentReadout({value}:{value:ComponentValue|null}){
 if(!value||value.reveal<=.001)return null;
 const rounded=Number(value.stressMPa.toFixed(2)),ink=rounded>0?'#087d9b':rounded<0?'#d75d37':C.muted;
 return <div style={{position:'absolute',left:80,top:258,width:460,transform:`translateX(${-650*(1-value.reveal)}px)`,zIndex:6,color:C.ink,fontVariantNumeric:'tabular-nums',textShadow:'0 2px 12px #f3f1ec88'}}>
  <div style={{fontSize:40,fontWeight:600}}>{value.name}</div>
  <div style={{fontSize:72,fontWeight:650,marginTop:13,lineHeight:1.25,color:ink}}>{rounded>0?'+':''}{rounded.toFixed(2)}<span style={{fontSize:36,fontWeight:500,marginLeft:16}}>MPa</span></div>
 </div>;
}
''' + s[end:]
s = s.replace('export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){', '''export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const [component,setComponent]=useState<ComponentValue|null>(null);const onComponent=useCallback((value:ComponentValue|null)=>setComponent(value?{...value}:null),[]);''')
s = s.replace('onPile={onPile}/>', 'onPile={onPile} onComponent={onComponent}/>')
s = s.replace('<ComponentReadout s={s}/>', '<ComponentReadout value={component}/>')
# A loaded pile data set must suppress only its own legacy overlay, not every
# subsequent concept throughout the film.
s = s.replace('{!pile&&<Concept ', '{(!pile||s.n+s.u<5.6||s.n+s.u>=9)&&<Concept ')
p.write_text(s,encoding='utf-8')

p=root/'src/World.ts'
s=p.read_text(encoding='utf-8')
s='\n'.join(line for line in s.split('\n') if "list.push({text:'轴力一增一减'" not in line)
s=s.replace("'轴力一增一减':[19.8,20.7],",'')
p.write_text(s,encoding='utf-8')
print('Signed component readouts, clear left composition, and section-stress wording updated.')
