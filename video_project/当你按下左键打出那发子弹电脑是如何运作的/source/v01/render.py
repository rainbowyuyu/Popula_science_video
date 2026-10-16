"""Render wrappers and screen-space labels. No installers, no outside writes.
python source/v01/render.py --stills | --chunk 1 192 | --compose
Default: resume missing frames in factory Blender, then compose a silent MP4.
"""
from pathlib import Path
import argparse, subprocess, json, hashlib
from prepare import write
import revision
ROOT=revision.ROOT
FPS=revision.FPS;N=revision.FRAME_COUNT
BLENDER='D:/blender/blender.exe'
FRAMES=revision.FRAMES
FINAL=revision.VIDEO
SUB=revision.SUBTITLES

def run(cmd,name):
    log=ROOT/f'work/v01/{name}.log';log.parent.mkdir(parents=True,exist_ok=True)
    with log.open('ab') as fh:
        fh.write(('\nCOMMAND '+json.dumps(cmd,ensure_ascii=False)+'\n').encode('utf-8'))
        p=subprocess.run(cmd,cwd=ROOT,stdout=fh,stderr=subprocess.STDOUT)
    print(name,'exit',p.returncode,flush=True)
    if p.returncode:raise RuntimeError(f'{name} failed; see {log}')

def timestamp(sec):
    cent=round(sec*100);return f'{cent//360000}:{cent//6000%60:02}:{cent//100%60:02}.{cent%100:02}'

def subtitles():
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Microsoft YaHei,42,&H00F4F2EE,&H00FFFFFF,&H0023180C,&H8023180C,-1,0,0,0,100,100,0,0,1,1.4,0,7,40,40,40,1
Style: Caption,Microsoft YaHei,30,&H00F4F2EE,&H00FFFFFF,&H0023180C,&H8023180C,0,0,0,0,100,100,0,0,3,8,0,2,50,50,32,1
Style: Tag,Microsoft YaHei,26,&H00F4F2EE,&H00FFFFFF,&H0023180C,&H8023180C,-1,0,0,0,100,100,0,0,3,4,0,2,10,10,10,1
Style: Small,Microsoft YaHei,22,&H00D7D0C4,&H00FFFFFF,&H0023180C,&H8023180C,0,0,0,0,100,100,0,0,1,1,0,7,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    rows=[]
    def event(start,end,style,body,layer=0):rows.append(f'Dialogue: {layer},{timestamp(start)},{timestamp(end)},{style},,0,0,0,,{body}')
    event(0,24,'Small',r'{\pos(103,34)\fs27\b1}rainbow鱼')
    event(0,24,'Small',r'{\an9\pos(1240,32)}机制样片 · 无声')
    event(0,24,'Small',r'{\an9\pos(1240,65)}原理示意｜非比赛复现')
    heads=[(0,4,'按下左键，只是起点'),(4,10,'一次输入，两条路径'),(10,13,'服务器保存位置历史'),(13,15,'判定时，参考历史碰撞信息'),(15,18,'射线求交，不是慢速飞弹'),(18,21,'权威结果沿网络返回'),(21,24,'客户端更新反馈')]
    for a,b,s in heads:event(a,b,'Main',r'{\pos(40,98)\fad(120,100)}'+s)
    caps=[(0,2,'鼠标把按键状态交给电脑'),(2,4,'CPU运行游戏，读取内存中的状态'),(4,7,'本机先表现开火，命令同时发往服务器'),(7,10,'本地响应，不等于服务器已确认击杀'),(10,13,'当前位置与历史位置，不是同一件事'),(13,15,'透视碰撞结构，不是门消失了'),(15,18,'门缝与碰撞盒：简化几何求交'),(18,21,'命中与伤害等规则处理后，下发结果'),(21,24,'画面与声音，让你感知游戏结果')]
    for a,b,s in caps:event(a,b,'Caption',s)
    event(0,10,'Small',r'{\an1\pos(40,602)}演示时长已放慢，不代表实测延迟')
    event(10,18,'Small',r'{\an1\pos(40,602)}简化测试：未模拟散布、穿透与伤害')
    event(18,24,'Small',r'{\an1\pos(40,602)}本样片未制作声音，不是比赛结果记录')
    anchors=json.loads(revision.ANCHORS.read_text(encoding='utf-8'))
    for row in anchors:
        f=row['frame'];a=(f-1)/FPS;b=f/FPS
        labels=[]
        if f<=240:labels.append(('client','本地表现','F1D24E'))
        if 145<=f<=288 or 433<=f<=480:labels.append(('server','服务器','6DBFFF'))
        if 313<=f<=432:labels.extend([('history','历史位置','F1D24E'),('current','当前位置','93B3D7')])
        if f>=493:labels.append(('client','结果到达','A6F88A'))
        for key,txt,col in labels:
            x,y=row['anchors'][key]
            if key=='history':x-=58;y-=22
            if key=='current':x+=55;y-=22
            x=max(90,min(1180,x));y=max(190,min(550,y-14))
            event(a,b,'Tag',f'{{\\pos({x:.1f},{y:.1f})\\c&H{col}&}}{txt}',1)
    path=SUB;write(path,(header+'\n'.join(rows)+'\n').encode('utf-8'))
    timeline=[{'startFrame':round(a*24)+1,'endFrame':round(b*24),'title':s,'timingBasis':'editorial silent motion test, NOT TTS or measured latency'} for a,b,s in heads]
    write(ROOT/'source/v01/shot_timing.json',json.dumps(timeline,ensure_ascii=False,indent=2).encode('utf-8'))

def filters(offset=None):
    sub_rel=SUB.relative_to(ROOT).as_posix()
    # Original logo ratio is preserved, no redrawing; the plain PNG needs a white backing.
    base='[0:v]'
    graph='[1:v]scale=45:54,format=rgba,pad=57:66:6:6:color=white[brand];'
    if offset is not None:
        graph+=f'[0:v]setpts=PTS+{offset}/TB[shifted];';base='[shifted]'
    graph+=base+'drawbox=x=40:y=24:w=57:h=66:color=white:t=fill[canvas];[canvas][brand]overlay=40:24,ass='+sub_rel
    if offset is not None:graph+=',setpts=PTS-STARTPTS'
    graph+='[v]';return graph

def stills():
    subtitles()
    for f in [1,133,218,337,385,520]:
        dest=ROOT/f'output/v01/review_{revision.REV}_{f:04d}.png'
        if dest.exists():continue
        run(['ffmpeg','-n','-i',str(FRAMES/f'{f:04d}.png'),'-i','assets/brand/logo.png','-filter_complex',filters((f-1)/FPS),'-map','[v]','-frames:v','1',str(dest)],f'compose_still_{f}')

def chunk(a,b):
    if all((FRAMES/f'{f:04d}.png').exists() for f in range(a,b+1)):
        print('reuse frames',a,b);return
    run([BLENDER,'--background','--factory-startup','--python-exit-code','1','--python','source/v01/scene.py','--','--frames',str(a),str(b)],f'render_{a}_{b}')

def compose():
    if FINAL.exists():print('existing preview preserved',FINAL);return
    missing=[f for f in range(1,N+1) if not (FRAMES/f'{f:04d}.png').exists()]
    if missing:raise RuntimeError(f'{len(missing)} missing frames; first {missing[:5]}')
    subtitles()
    run(['ffmpeg','-n','-framerate',str(FPS),'-start_number','1','-i',FRAMES.relative_to(ROOT).as_posix()+'/%04d.png','-i','assets/brand/logo.png','-filter_complex',filters(),'-map','[v]','-an','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-frames:v',str(N),'-movflags','+faststart',str(FINAL)],'compose')
    print('PREVIEW',FINAL,'sha256',hashlib.sha256(FINAL.read_bytes()).hexdigest())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stills',action='store_true');p.add_argument('--chunk',nargs=2,type=int);p.add_argument('--compose',action='store_true');a=p.parse_args()
    if a.stills:stills()
    elif a.chunk:chunk(*a.chunk)
    elif a.compose:compose()
    else:
        for start in [1,193,385]:chunk(start,start+191)
        compose()
