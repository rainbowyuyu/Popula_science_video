from pathlib import Path
p=Path('src/FilmV16.tsx');s=p.read_text(encoding='utf-8')
s=s.replace('AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,staticFile','AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,Freeze,staticFile')
a=s.index('   {!vertical&&frame>=qwenStart');b=s.index('\n   {!coda&&',a)
s=s[:a]+'''   {!vertical&&frame>=qwenStart&&<Sequence from={qwenStart} durationInFrames={325}><div style={{position:'absolute',inset:0,zIndex:4,maskImage:`radial-gradient(circle at 68% 59%,black ${Math.max(0,2500*ramp(qwenStart,qwenStart+32,frame)-100)}px,transparent ${2500*ramp(qwenStart,qwenStart+32,frame)}px)`}}><Freeze frame={Math.min(149,frame-qwenStart)}><OffthreadVideo src={staticFile('v16/qwen-river-rise.mp4')} muted style={{width:W,height:H,objectFit:'cover'}}/></Freeze><div style={{position:'absolute',right:72,top:58,fontSize:36,color:'#fff',textShadow:'0 2px 8px #123'}}>城市环境示意</div></div></Sequence>}
   {s.n+s.u>5.3&&s.n+s.u<9.2&&<div style={{position:'absolute',right:vertical?60:72,top:vertical?195:64,fontSize:36,color:C.muted,zIndex:7}}>土层纹理示意</div>}'''+s[b:]
p.write_text(s,encoding='utf-8')
