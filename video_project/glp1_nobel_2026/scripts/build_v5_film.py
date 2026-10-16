from pathlib import Path
import re
P=Path(__file__).resolve().parents[1]
s=(P/'src/V4Film.tsx').read_text(encoding='utf-8-sig').replace('V4','V5')
s=s.replace("{V5View,viewOf}","{V5View,V5Clip,viewOf}")
s=re.sub(r'const titles:\[number,number,string\]\[\]=\[.*?\];', '', s, flags=re.S)
start=s.index('function DetailNote(');end=s.index('function Coda(',start)
s=s[:start]+'''function DetailNote({s,distance}:{s:FrameState;distance:number}){
 const clip=s.clip as V5Clip;let text=clip.note??'';
 if(!text)return null;
 return <div style={{position:'absolute',left:90,top:524,width:590,color:'#52716b',fontSize:40,lineHeight:1.60,fontWeight:500,whiteSpace:'pre-line'}}>{text}</div>;
}

'''+s[end:]
s=s.replace('从原理，走回生活','理解调节，让改变更容易')
s=s.replace("const frame=useCurrentFrame(),s=stateAt(frame,timeline),n=Number(s.clip.id.slice(1));", "const frame=useCurrentFrame(),s=stateAt(frame,timeline),clip=s.clip as V5Clip;")
s=s.replace("const group=titles.find(t=>n>=t[0]&&n<=t[1])??titles.at(-1)!;const groupStart=timeline.clips[group[0]-1].start;", "const heading=clip.heading??'看懂身体调节\\n科学减重';let groupIndex=timeline.clips.findIndex(c=>c.id===clip.id);while(groupIndex>0&&(timeline.clips[groupIndex-1] as V5Clip).heading===clip.heading)groupIndex--;const groupStart=timeline.clips[groupIndex].start;")
s=s.replace('opacity:.25+.75*reveal','opacity:.88+.12*reveal')
s=s.replace('{group[2]}','{heading}')
s=re.sub(r'\{n<=3\?<div.*?:<DetailNote s=\{s\} distance=\{distance\}/>\}', '<DetailNote s={s} distance={distance}/>',s,flags=re.S)
s=s.replace('<Experiment s={s}/>','')
(P/'src/V5Film.tsx').write_text(s,encoding='utf-8')
