"""Create measured Chinese narration and a single clean WAV master."""
from __future__ import annotations
import asyncio, json, subprocess, shutil, re
from pathlib import Path
import edge_tts

ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'audio/v01'; A.mkdir(parents=True,exist_ok=True)
clips=[
('000','hook','想象一颗粒子，几乎不和任何东西碰撞。它穿过地球，也穿过我们，而我们通常连它来过都不知道。可是，在南极两公里深的冰里，偶尔会亮起一束蓝光。2026年的诺贝尔物理学奖，表彰的正是把这种几乎看不见的来客，变成可读证据的长期工作。'),
('001','award','今年的奖项授予 Francis Halzen，威斯康星大学麦迪逊分校的物理学家。授奖理由是：他对 IceCube 中微子观测站作出了决定性贡献，并推动发现了具有天体物理起源的高能中微子。这里要分清一件事：获奖者是一人，IceCube 却是一支来自十四个国家的国际合作。'),
('002','question','故事要从一个小问题开始：我们为什么还要费力寻找中微子？因为宇宙里的带电粒子会被磁场拐弯，伽马射线也可能在路上被吸收。中微子不带电，只通过极其微弱的相互作用，反而能把遥远源头的方向和能量带到地球。'),
('003','messengers','把三种宇宙信使放在同一张图上，路径立刻不同。质子像被风吹偏的纸屑，伽马射线在尘埃里逐渐消失，而中微子沿着近乎笔直的路线穿过宇宙。它难以捕获，却因此保留了更干净的线索。'),
('004','idea','1988年，Halzen 和 John G. Learned 提出：与其把探测器做成一座小房子，不如把南极冰本身变成一座望远镜。这个想法听起来反直觉，却正好回答了两个条件：介质要足够大，也要足够安静、透明。'),
('005','ice','IceCube最终把八十六条探测器串放进冰层，每串六十个光学模块，深度大约一千四百五十到两千四百五十米，总体积接近一立方公里。镜头沿着一条串下潜，白色的冰把每个传感器隔开，也把宇宙的噪声尽量挡在外面。'),
('006','interaction','但中微子本身不会在镜头里留下轨迹。它必须偶然撞上冰里的原子核，产生带电粒子；这些粒子在冰中飞行时，速度超过了冰中光的相速度，于是拉出一圈短暂的 Cherenkov 蓝光。探测器真正记录的，是这圈光到达各个模块的时间。'),
('007','formula','这个阈值可以用一个很简单的关系表示：粒子速度大于光速除以折射率。公式里的 n 是冰的折射率，决定光在介质里变慢多少。我们不需要把它背下来，只要记住：速度够快，光就不再向四面八方散开，而会集中成一个可追踪的圆锥。'),
('008','track','如果相互作用产生的是能跑很远的 μ 子，模块会依次亮起，排成一条长长的时间线，这叫 track，径迹事件。它的方向分辨率更好，像一支在冰里划过的探针，告诉我们来时的大致方向。'),
('009','cascade','另一种情况是 cascade，簇射事件。能量在局部释放，许多粒子一起产生光，模块看到的是一团扩散的亮斑。它的方向没有径迹那么锐利，却能把能量收得更完整。两种形状，像两种不同的读法。'),
('010','background','真正困难的是背景。大气宇宙线会制造大量 μ 子和中微子，像雨一样落下来。IceCube用地球当屏蔽，优先看从下方穿来的径迹，再用能量和时间把稀有的天体物理成分筛出来。不是一颗漂亮的光点就算发现，而是要让整组事件超过背景。'),
('011','discovery','2013年，1.04和1.14拍电子伏特的两个事件，给出了高能天体物理中微子的第一个证据。之后，三年数据里的统计分析达到5.7个标准差，纯粹由大气背景解释的可能性被排除。发现从一闪蓝光，变成了一条可靠的证据链。'),
('012','sources','当方向和能量都被保留下来，中微子就成了新的宇宙信使。2017年，一个约290 TeV的事件指向耀变体 TXS 0506+056，方向关联约为0.06度；2022年，NGC 1068方向出现了1到10 TeV的中微子过量，显著性约4.2个标准差。这些是重要候选源和方向关联，还不是把所有宇宙中微子都归给同一个天体。'),
('013','team','Halzen的贡献并不是独自完成一次实验，而是把一个很早的设想，变成了可以持续运行的观测站。冰层、钻孔、光学模块、数据筛选和全球合作，每一环都在回答同一个问题：一次极少见的相互作用，能不能被可靠地还原出来。'),
('014','meaning','这项工作的意义，也不只是多找到几颗粒子。传统天文学主要看光，宇宙线会被磁场改变方向；中微子则提供了一条新的直达通道。我们开始同时比较光、引力波、宇宙线和中微子，让同一个天体故事拥有不同的叙述者。'),
('015','limits','当然，探测到中微子不等于已经看清它的源头。样本稀少、背景复杂，方向分辨率也因径迹和簇射而不同。科学的进步，常常来自把“我看见了什么”和“我还不能断言什么”同时写在结果旁边。'),
('016','coda','回到开头：那束蓝光不是中微子本身，而是它在冰里留下的间接回应。Halzen和IceCube把一块南极冰，变成了一座向宇宙倾听的望远镜。下一次，当我们看到一条亮起的轨迹，真正被看见的，是一次穿越亿万光年的相遇。'),
]

async def make():
    rows=[]
    for i,(cid,scene,text) in enumerate(clips):
        out=A/f'{cid}.mp3'
        if not out.exists(): await edge_tts.Communicate(text,'zh-CN-YunxiNeural',rate='-3%').save(str(out))
        dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(out)],text=True))
        rows.append({'id':cid,'scene':scene,'spoken':text,'audio':str(out.relative_to(ROOT)).replace('\\','/'),'audioSeconds':dur})
    # Normalize each generated MP3 before concatenation.  Edge TTS MP3s may
    # carry encoder delay/stream metadata that makes the concat demuxer drop
    # the explicit rest segments.  A common PCM format keeps the measured
    # timeline and the rendered audio on the same clock.
    silence=A/'silence.wav'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','0.72','-c:a','pcm_s24le',str(silence)],check=True)
    normalized=[]
    for r in rows:
        wav=A/f"{r['id']}-normalized.wav"
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(ROOT/r['audio']),'-ar','48000','-ac','2','-c:a','pcm_s24le',str(wav)],check=True)
        normalized.append(wav)
    concat=A/'concat.txt'
    concat.write_text('\n'.join([f"file '{wav.as_posix()}'\nfile '{silence.as_posix()}'" for wav in normalized]),encoding='utf8')
    wav=A/'narration.wav'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c:a','pcm_s24le','-ar','48000',str(wav)],check=True)
    # Calm, low-level electronic bed made from a deterministic harmonic pad.
    # It is intentionally instrumental and noise-free so the Mandarin voice
    # remains intelligible; the slow tremolo and short echo add movement
    # without introducing a chapter cue or a hard restart.
    music=A/'music.wav'
    dur=sum(r['audioSeconds']+.72 for r in rows)
    pad=("aevalsrc='0.028*sin(2*PI*110*t)+0.020*sin(2*PI*164.81*t+0.18*sin(2*PI*0.035*t))+"
         "0.014*sin(2*PI*220*t)+0.009*sin(2*PI*329.63*t+0.12*sin(2*PI*0.021*t))':"
         f"s=48000:c=stereo:d={dur}")
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i',pad,
                    '-af',f'lowpass=f=1800,tremolo=f=0.1:d=0.18,aecho=0.8:0.88:700|1100:0.16|0.10,afade=t=in:st=0:d=5,afade=t=out:st={max(0,dur-10)}:d=10',
                    '-ar','48000','-ac','2',str(music)],check=True)
    premaster=A/'premaster.wav'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-i',str(music),'-filter_complex','[0:a]volume=0.86[v];[1:a]volume=0.55[m];[v][m]amix=inputs=2:duration=first:dropout_transition=2[a]','-map','[a]','-ar','48000','-ac','2','-c:a','pcm_s24le',str(premaster)],check=True)
    master=A/'master.wav'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(premaster),'-af','loudnorm=I=-15:TP=-1.5:LRA=8','-ar','48000','-c:a','pcm_s24le',str(master)],check=True)
    def make_subtitle_parts(text: str, duration: float, source: str):
        # Keep captions attached to complete spoken clauses.  A long clause
        # is split at Chinese punctuation, then times are allocated by text
        # length so the renderer never lays out a multi-line wall of text.
        raw = [x.strip() for x in re.split(r'(?<=[。！？；])', text) if x.strip()]
        expanded=[]
        for chunk in raw:
            if len(chunk) <= 24:
                expanded.append(chunk); continue
            pieces=[x.strip() for x in re.split(r'(?<=[，、：])', chunk) if x.strip()]
            buf=''
            for piece in pieces:
                if buf and len(buf)+len(piece)>24:
                    expanded.append(buf); buf=piece
                else:
                    buf += piece
            if buf: expanded.append(buf)
        # A final clause can contain no comma but still be too long for a
        # single caption.  Split it at a readable character boundary rather
        # than allowing a tiny type size or a wrapped wall of text.
        compact=[]
        for chunk in expanded:
            while len(chunk)>20:
                compact.append(chunk[:20]); chunk=chunk[20:]
            if chunk: compact.append(chunk)
        expanded=compact
        if not expanded: expanded=[text]
        total=max(1,sum(len(x) for x in expanded)); cursor=0.0; out=[]
        for idx,chunk in enumerate(expanded):
            end=duration if idx==len(expanded)-1 else cursor+duration*len(chunk)/total
            out.append({'start':round(cursor,3),'end':round(end,3),'text':chunk,'source':f'{source}-{idx:02d}'})
            cursor=end
        return out

    t=0; fps=30; timeline=[]
    for r in rows:
        start=round(t*fps); end=round((t+r['audioSeconds']+.72)*fps)
        timeline.append({**r,'start':start,'end':end,'subtitleParts':make_subtitle_parts(r['spoken'],r['audioSeconds'],r['id'])})
        t+=r['audioSeconds']+.72
    data={'version':'nobel-physics-2026-v01','fps':fps,'duration':round(t*fps),'seconds':round(t,3),'clips':timeline,'scenes':[]}
    for r in timeline:
        if not data['scenes'] or data['scenes'][-1]['id']!=r['scene']: data['scenes'].append({'id':r['scene'],'start':r['start'],'end':r['end']})
        else: data['scenes'][-1]['end']=r['end']
    (ROOT/'src/physics2026').mkdir(parents=True,exist_ok=True)
    (ROOT/'src/physics2026/timeline-v01.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    (ROOT/'docs/narration-v01.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    (ROOT/'delivery/physics2026_v01/旁白.txt').write_text('\n\n'.join(f'{r["id"]} {r["spoken"]}' for r in rows),encoding='utf8')
    print(json.dumps({'duration':t,'frames':round(t*fps),'clips':len(rows)},ensure_ascii=False))
if __name__=='__main__': asyncio.run(make())
