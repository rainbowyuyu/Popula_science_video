"""Original Manim visuals. All illustrative trajectories are synthetic."""
from pathlib import Path
import json
import numpy as np
from manim import *

ROOT=Path(__file__).resolve().parents[1]
TL=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf-8'))
SIM=json.loads((ROOT/'public/simulation.json').read_text(encoding='utf-8'))
BG='#0B1220'; FG='#E9F1FF'; MUTED='#94A9C4'; CYAN='#56DDD3'; BLUE='#75A7FF'; RED='#FF7E8B'; GOLD='#F8C978'
config.background_color=BG
config.frame_width=16
config.frame_height=8

def txt(s,size=32,color=FG):
    return Text(s,font='Microsoft YaHei',font_size=size,color=color)

def eq(s,size=44,color=FG):
    m=MathTex(s,font_size=size,color=color)
    if m.width>14.4:m.scale_to_fit_width(14.4)
    return m

def card(label,sub='',color=CYAN,width=4.25,height=1.6):
    box=RoundedRectangle(width=width,height=height,corner_radius=.18,stroke_color=color,stroke_width=1.5,fill_color=color,fill_opacity=.065)
    a=txt(label,32,color).move_to(box.get_center()+UP*(.23 if sub else 0))
    if a.width>width-.3:a.scale_to_fit_width(width-.3)
    items=[box,a]
    if sub:
        b=txt(sub,22,MUTED).move_to(box.get_center()+DOWN*.4)
        if b.width>width-.3:b.scale_to_fit_width(width-.3)
        items.append(b)
    return VGroup(*items)

def line_graph(ax,x,y,color=CYAN,width=3):
    return VMobject(stroke_color=color,stroke_width=width).set_points_as_corners([ax.c2p(float(a),float(b)) for a,b in zip(x,y)])

def axes(x=(0,10,2),y=(-1,1,1),width=11,height=4):
    return Axes(x_range=x,y_range=y,x_length=width,y_length=height,axis_config={'color':MUTED,'stroke_width':1.5,'include_tip':False},tips=False)

class Base(Scene):
    chapter=0
    def setup(self):
        self.meta=TL['chapters'][self.chapter]
    def beat(self,j,*animations,run_time=1.1):
        target=self.meta['segments'][j]['from']/TL['fps']
        if target>self.time:self.wait(target-self.time)
        if animations:self.play(*animations,run_time=run_time)
    def finish(self):
        target=self.meta['frames']/TL['fps']
        if target>self.time:self.wait(target-self.time)
    def note(self,s,color=MUTED):
        return txt(s,25,color).move_to(DOWN*3.28)

class Chapter00(Base):
    chapter=0
    def construct(self):
        ax=axes(width=12,height=3.8).shift(DOWN*.2)
        threshold=DashedLine(ax.c2p(0,0),ax.c2p(10,0),color=RED)
        label=txt('事实边界',24,RED).next_to(threshold,RIGHT,buff=.16)
        rng=np.random.default_rng(20); x=np.linspace(0,10,81)
        curves=VGroup()
        for i in range(8):
            y=.65-.065*x+np.cumsum(rng.normal(0,.04,len(x)))
            curves.add(line_graph(ax,x,y,CYAN if i%2 else BLUE,2.5))
        top=txt('同一个问题，很多条可能的生成轨迹',36).move_to(UP*2.75)
        self.beat(0,FadeIn(top),Create(ax),LaggedStart(*[Create(c) for c in curves],lag_ratio=.1),run_time=6)
        self.beat(1,Indicate(curves[-1],color=GOLD),run_time=2)
        self.beat(2,Create(threshold),FadeIn(label))
        chain=txt('随机生成  →  事实状态  →  概率演化  →  首次越界',28,CYAN).move_to(DOWN*2.7)
        self.beat(3,FadeIn(chain))
        self.beat(4,FadeIn(self.note('研究框架与教学示意 · 尚需真实模型验证',GOLD)))
        self.finish()

class Chapter01(Base):
    chapter=1
    def construct(self):
        cards=VGroup(card('随机事件 Ξ','完整的采样随机数'),card('生成文本 X','固定模型与上下文',BLUE),card('事实状态 Z','相对于证据的可测坐标',GOLD)).arrange(RIGHT,buff=.85).shift(UP*.8)
        arrows=VGroup(*[Arrow(cards[i].get_right(),cards[i+1].get_left(),buff=.13,color=MUTED) for i in range(2)])
        rng=np.random.default_rng(2)
        cloud=VGroup(*[Dot([x,y,0],radius=.04,color=CYAN) for x,y in rng.normal(size=(100,2))*[1.25,.55]+[-4.9,-1.75]])
        target=cloud.copy().shift(RIGHT*9.8)
        self.beat(0,FadeIn(cards[0]))
        self.beat(1,LaggedStart(*[FadeIn(d) for d in cloud],lag_ratio=.005),run_time=2)
        self.beat(2,FadeIn(cards[1]),Create(arrows[0]))
        self.beat(3,FadeIn(cards[2]),Create(arrows[1]),Transform(cloud,target),run_time=3)
        formula=eq(r'\mathbb P(Z\in B)=\mathbb P\{\Xi:Z(\Xi)\in B\}',38).move_to(DOWN*1.5)
        self.beat(4,FadeOut(cloud),Write(formula),FadeIn(self.note('概率保持是起点；低维动力学仍需额外假设')))
        self.finish()

class Chapter02(Base):
    chapter=2
    def construct(self):
        f=eq(r'X_{k+1}\sim\pi_\theta(\cdot\mid X_{\leq k},Q,\mathrm{context})',44).move_to(UP*2.4)
        nodes=VGroup(*[card(f'命题 {i+1}',f'Z{i+1}',CYAN if i<3 else BLUE,width=2.4,height=1.25) for i in range(5)]).arrange(RIGHT,buff=.52)
        kernel=eq(r'p_{k+1}(z^{\prime})=\int K_k(z^{\prime}\mid z)\,p_k(z)\,dz',44).move_to(DOWN*1.8)
        self.beat(0,Write(f))
        self.beat(1,LaggedStart(*[FadeIn(n,shift=UP*.15) for n in nodes],lag_ratio=.2),run_time=2.5)
        self.beat(2,Write(kernel))
        hist=CurvedArrow(nodes[0].get_top(),nodes[4].get_top(),angle=-TAU/8,color=GOLD).shift(UP*.12)
        self.beat(3,Create(hist),FadeIn(txt('历史还会影响下一步吗？',26,GOLD).move_to(UP*1.1)))
        self.beat(4,FadeIn(self.note('一步边缘分布关系成立 ≠ 低维齐次马尔可夫模型成立',GOLD)))
        self.finish()

class Chapter03(Base):
    chapter=3
    def construct(self):
        names=['支持 P⁺','反驳 P⁻','未知 P⁰']; colors=[CYAN,RED,MUTED]
        boxes=VGroup(*[card(a,'核验器输出，需校准',c,width=4.2) for a,c in zip(names,colors)]).arrange(RIGHT,buff=.6).shift(UP*1.9)
        formulas=VGroup(eq(r'Z=P^{+}-P^{-}',48,CYAN),eq(r'A=P^{+}+P^{-}',48,GOLD)).arrange(RIGHT,buff=1.8).move_to(UP*.1)
        bars=VGroup()
        for k,(a,b) in enumerate([(.8,.1),(.05,.05)]):
            y=-1.35-k*1.05
            left=txt('证据充分' if k==0 else '证据不足',25).move_to([-5.7,y,0])
            bar=VGroup(Rectangle(width=a*7,height=.4,color=CYAN,fill_opacity=.8),Rectangle(width=b*7,height=.4,color=RED,fill_opacity=.8),Rectangle(width=(1-a-b)*7,height=.4,color=MUTED,fill_opacity=.3)).arrange(RIGHT,buff=0).move_to([-.4,y,0])
            val=txt('Z = 0.7   A = 0.9' if k==0 else 'Z = 0     A = 0.1',25,GOLD).move_to([5.5,y,0])
            bars.add(VGroup(left,bar,val))
        self.beat(0,FadeIn(txt('回答 → 原子命题 → 独立证据核验',32).move_to(UP*3.25)))
        self.beat(1,LaggedStart(*[FadeIn(b) for b in boxes],lag_ratio=.2))
        self.beat(2,Write(formulas))
        self.beat(3,FadeIn(bars[0]))
        self.beat(4,FadeIn(bars[1]),FadeIn(self.note('未知不能直接记作错误；阈值由独立标签校准',GOLD)))
        self.finish()

class Chapter04(Base):
    chapter=4
    def construct(self):
        ax=axes(x=(-1,1,1),y=(0,1,1),width=9,height=3.5).shift(LEFT*.7+UP*.4)
        labs=VGroup(txt('事实方向 Z →',25).next_to(ax,DOWN),txt('语义熵 S',25).next_to(ax,UP))
        point=Dot(ax.c2p(-.7,.12),radius=.12,color=RED)
        label=txt('稳定地回答错误',29,RED).next_to(point,UP,buff=.35)
        p2=Dot(ax.c2p(.65,.65),radius=.12,color=CYAN)
        y=eq(r'\mathbf{Y}=(Z,A,S)',52).move_to(DOWN*2.65)
        self.beat(0,Create(ax),FadeIn(labs),FadeIn(eq(r'S=-\sum_j p_j\log p_j',36).move_to([3.5,2.5,0])))
        self.beat(1,FadeIn(point),FadeIn(label))
        self.beat(2,FadeIn(p2),FadeIn(txt('事实支持与不确定性可并存',25,CYAN).next_to(p2,UP)))
        self.beat(3,Write(y))
        self.beat(4,FadeIn(self.note('temperature 是外部设置；S 与 b 的关系是经验问题',GOLD)))
        self.finish()

class Chapter05(Base):
    chapter=5
    def construct(self):
        start=np.array([-5.4,0.,0]); rng=np.random.default_rng(11)
        pts=[np.array([-1.,float(y),0]) for y in rng.normal(.5,.8,16)]
        lines=VGroup(*[Line(start,p,color=BLUE,stroke_opacity=.45,stroke_width=2) for p in pts])
        dots=VGroup(*[Dot(p,radius=.055,color=CYAN) for p in pts])
        mean=Arrow(start,[-1,.5,0],color=GOLD,buff=0,stroke_width=6)
        f1=eq(r'a(z)=\lim_{\Delta s\to0}\frac{\mathbb E[\Delta Z\mid z]}{\Delta s}',36,CYAN).move_to([3.2,1.4,0])
        f2=eq(r'b(z)=\lim_{\Delta s\to0}\frac{\mathrm{Var}[\Delta Z\mid z]}{\Delta s}',36,BLUE).move_to([3.2,-.45,0])
        self.beat(0,FadeIn(Dot(start,color=FG)),FadeIn(txt('相同当前状态',27).move_to([-5.1,-2,0])),Create(lines),FadeIn(dots),run_time=3)
        self.beat(1,GrowArrow(mean),Write(f1))
        spread=BraceBetweenPoints([-0.5,-1.1,0],[-.5,1.9,0],direction=RIGHT,color=BLUE)
        self.beat(2,Create(spread),Write(f2))
        self.beat(3,FadeIn(txt('有限步长估计 ≈ 连续极限系数',29,GOLD).move_to(DOWN*2.25)))
        self.beat(4,FadeIn(self.note('观测方差 = 动力学波动 + 可能的测量误差',GOLD)))
        self.finish()

class Chapter06(Base):
    chapter=6
    def construct(self):
        sde=eq(r'dZ=a(Z)\,ds+\sqrt{b(Z)}\,dW_s',50).move_to(UP*2.8)
        fp=eq(r'\partial_s p=-\partial_z(ap)+\frac12\partial_z^2(bp)',46).move_to(UP*1.35)
        ax=axes(x=(-4,4,2),y=(0,.7,.35),width=11,height=2.1).move_to(DOWN*.65)
        x=np.linspace(-4,4,150)
        def g(m,s):return np.exp(-.5*((x-m)/s)**2)/(s*np.sqrt(2*np.pi))
        curve=line_graph(ax,x,g(-1,.65),CYAN,4)
        self.beat(0,Write(sde))
        self.beat(1,Create(ax),Create(curve))
        self.beat(2,Write(fp),Transform(curve,line_graph(ax,x,g(1,1.1),CYAN,4)),run_time=4)
        self.beat(3,Write(eq(r'\partial_s p+\partial_z J=0,\quad J=ap-\frac12\partial_z(bp)',35,GOLD).move_to(DOWN*2.5)))
        self.beat(4,FadeIn(self.note('输运型 GPDEE 与扩散型 Fokker–Planck：假设与层次不同')))
        self.finish()

class Chapter07(Base):
    chapter=7
    def construct(self):
        full=eq(r'\partial_s p=-\sum_i\partial_{y_i}(\mu_i p)+\frac12\sum_{i,j}\partial_{y_i}\partial_{y_j}(D_{ij}p)',37).move_to(UP*2.7)
        joint=card('(Z, A, S)','联合密度与交叉扩散',BLUE,width=4.7).move_to([-4.5,.8,0])
        single=card('Z','一维有效过程',CYAN,width=4.7).move_to([4.5,.8,0])
        arrow=Arrow(joint.get_right(),single.get_left(),color=MUTED,buff=.15)
        marginal=eq(r'p_Z(z,s)=\iint p(z,A,S;s)\,dA\,dS',37).move_to(DOWN*.9)
        cond=txt('充分条件：系数仅依赖 Z，且边界通量消失',29,CYAN).move_to(DOWN*2)
        approx=txt('近似条件：快变量条件平衡 + 尺度分离',29,GOLD).move_to(DOWN*2.75)
        self.beat(0,Write(full),FadeIn(joint))
        self.beat(1,Write(marginal),GrowArrow(arrow),FadeIn(single))
        self.beat(2,FadeIn(cond))
        self.beat(3,FadeIn(approx))
        self.beat(4,Indicate(arrow,color=RED),FadeIn(self.note('边缘化不等于马尔可夫闭合',RED)))
        self.finish()

class Chapter08(Base):
    chapter=8
    def construct(self):
        a=card('一步 × 一步','预测的两步转移',CYAN,width=5).move_to([-3.3,1.7,0])
        b=card('直接观测两步','独立转移统计',BLUE,width=5).move_to([3.3,1.7,0])
        self.beat(0,FadeIn(a),FadeIn(b),Write(eq(r'\stackrel{?}{\simeq}',48,GOLD).move_to(UP*1.7)))
        c=card('历史分组检验','相同 Z，不同前缀',GOLD,width=5).move_to([-3.3,-.4,0])
        d=card('改变语义步长','估计稳定性与大跳跃',CYAN,width=5).move_to([3.3,-.4,0])
        self.beat(1,FadeIn(c))
        self.beat(2,FadeIn(d))
        self.beat(3,FadeIn(txt('按问题分层，避免异质性制造假象',30,GOLD).move_to(DOWN*2)))
        self.beat(4,FadeIn(self.note('检验失败 → 扩充状态，或保留离散模型',CYAN)))
        self.finish()

class Chapter09(Base):
    chapter=9
    def construct(self):
        ax=axes(x=(0,10,2),y=(-1,1,1),width=12,height=3.6).shift(UP*.5)
        x=np.array([0,1,2,3,4,5,6,7,8,9,10]); y=np.array([.7,.6,.72,.33,-.3,-.45,-.1,.25,.3,.65,.7])
        graph=line_graph(ax,x,y,CYAN,4)
        bound=DashedLine(ax.c2p(0,0),ax.c2p(10,0),color=RED)
        self.beat(0,Create(ax),Create(bound),Create(graph),run_time=5)
        self.beat(1,FadeIn(txt('最终恢复 ≠ 从未发生错误',34,GOLD).move_to(DOWN*2.1)))
        tau=3+.33/(.33+.3)
        mark=Dot(ax.c2p(tau,0),color=RED,radius=.12)
        self.beat(2,FadeIn(mark),Write(eq(r'\tau_H=\inf\{s:Z(s)\leq Z_H\}',38).move_to(UP*3.05)))
        killed=line_graph(ax,list(x[:4])+[tau],list(y[:4])+[0],RED,5)
        self.beat(3,graph.animate.set_stroke(opacity=.2),Create(killed),FadeIn(txt('首次到达即从存活集合移除',28,RED).move_to(DOWN*2.8)))
        self.beat(4,Indicate(mark,color=GOLD))
        self.finish()

class Chapter10(Base):
    chapter=10
    def construct(self):
        ax=axes(x=(0,40,10),y=(0,1,.5),width=8,height=4).shift(LEFT*2.5)
        ax.add_coordinates(font_size=20)
        graph=line_graph(ax,SIM['times'],SIM['exact'],CYAN,4)
        f1=eq(r'R(s)=\mathbb P(\tau_H>s)',34,CYAN).move_to([4.4,2.1,0])
        f2=eq(r'F_H=1-R,\quad f_H=-R^{\prime}',31).move_to([4.4,.65,0])
        f3=eq(r'\lambda_H(s)=\frac{f_H(s)}{R(s)}',36,GOLD).move_to([4.4,-.8,0])
        self.beat(0,Create(ax),Create(graph),Write(f1),run_time=3)
        self.beat(1,Write(f2))
        self.beat(2,Write(f3))
        self.beat(3,Write(eq(r'f_H(s)=-J(Z_H,s)\quad[J(Z_U,s)=0]',35).move_to(DOWN*2.7)))
        self.beat(4,FadeIn(self.note('恒定危险率时：R(s) = exp(−λs)；一般情形并非指数曲线',GOLD)))
        self.finish()

class Chapter11(Base):
    chapter=11
    def construct(self):
        f1=eq(r'T(z)=\mathbb E[\tau_H\mid Z_0=z]',43).move_to(UP*2.7)
        f2=eq(r'T(z)=\Delta s+\mathbb E[T(z+\Delta Z)\mid z]',41).move_to(UP*1.3)
        f3=eq(r'a(z)T^{\prime}(z)+\frac12b(z)T^{\prime\prime}(z)=-1',51,CYAN).move_to(DOWN*.2)
        bounds=VGroup(card('下端吸收','T(ZH) = 0',RED,width=5),card('上端反射','T′(ZU) = 0',BLUE,width=5)).arrange(RIGHT,buff=1).move_to(DOWN*2)
        self.beat(0,Write(f1))
        self.beat(1,Write(f2))
        self.beat(2,Write(f3),run_time=2)
        self.beat(3,FadeIn(bounds))
        self.beat(4,FadeIn(self.note('边界是模型的一部分；上界选择应做敏感性分析',GOLD)))
        self.finish()

class Chapter12(Base):
    chapter=12
    def construct(self):
        f1=eq(r'x=\frac{Z-Z_H}{L},\qquad t=\frac{a_0}{L}s',45).move_to(UP*2.6)
        f2=eq(r'dx=\widetilde a(x)\,dt+\frac{1}{\sqrt{\mathrm{Pe}_b}}\sqrt{\widetilde b(x)}\,dW_t',43).move_to(UP*.8)
        pe=eq(r'\mathrm{Pe}_b=\frac{a_0 L}{b_0}',60,CYAN).move_to([-3.8,-1.4,0])
        convention=eq(r'D_0=b_0/2\ \Rightarrow\ \mathrm{Pe}=2\mathrm{Pe}_b',33).move_to([3.5,-1.4,0])
        self.beat(0,Write(f1))
        self.beat(1,Write(f2),Write(pe))
        self.beat(2,Write(convention))
        self.beat(3,FadeIn(txt('漂移很强，也可能是更快地走向错误',34,RED).move_to(DOWN*2.6)))
        self.beat(4,FadeIn(self.note('比值需要尺度定义；方向、初态与边界同样决定风险')))
        self.finish()

class Chapter13(Base):
    chapter=13
    def construct(self):
        ax=axes(x=(-1.5,1.5,1),y=(0,.6,.2),width=9,height=3).shift(LEFT*2+UP*.8)
        x=np.linspace(-1.4,1.4,130); v=(x*x-1)**2/4
        curve=line_graph(ax,x,v,BLUE,4)
        zc=Dot(ax.c2p(0,.25),color=GOLD,radius=.095); zf=Dot(ax.c2p(1,0),color=CYAN,radius=.095)
        self.beat(0,Create(ax),Create(curve),FadeIn(zf),FadeIn(txt('ZF 稳定点',24,CYAN).next_to(zf,UP,buff=.3)))
        self.beat(1,FadeIn(zc),FadeIn(txt('ZC 不稳定点',24,GOLD).next_to(zc,UP)))
        barrier=eq(r'\mathcal B_H=\int_{Z_C}^{Z_F}\frac{2a(z)}{b(z)}\,dz',41,CYAN).move_to(DOWN*1.6)
        self.beat(2,Write(barrier))
        special=eq(r'\mathcal B_H=\frac{\Delta V}{D}',40).move_to([4.5,1,0])
        self.beat(3,Write(special))
        law=eq(r'T_H\sim\tau_0 e^{\mathcal B_H}',45,GOLD).move_to(DOWN*2.65)
        self.beat(4,Write(law),FadeIn(self.note('仅限亚稳态、弱噪声、稀有逃逸条件；势能图是示意',GOLD)))
        self.finish()

class Chapter14(Base):
    chapter=14
    def construct(self):
        left=card('漂移主导','平均方向朝向错误',RED,width=6,height=1.35).move_to([-3.8,2.4,0])
        right=card('扩散主导','恢复仍在，波动越界',BLUE,width=6,height=1.35).move_to([3.8,2.4,0])
        rng=np.random.default_rng(15); xs=np.linspace(0,8,60)
        axs=[axes(x=(0,8,2),y=(-1.1,1.8,1),width=5.6,height=2.7).move_to([a,-.15,0]) for a in [-3.8,3.8]]
        curves=[]
        for j,ax in enumerate(axs):
            group=VGroup()
            for _ in range(7):
                yy=[.7]
                for k in range(59):yy.append(yy[-1]+(-.022 if j==0 else .075*(.55-yy[-1]))+rng.normal(0,.012 if j==0 else .15))
                group.add(line_graph(ax,xs,yy,RED if j==0 else BLUE,2))
            curves.append(group)
        self.beat(0,FadeIn(left),Create(axs[0]),Create(curves[0]),run_time=4)
        self.beat(1,FadeIn(txt('随机性低，仍可系统性失败',25,RED).move_to([-3.8,-2.2,0])))
        self.beat(2,FadeIn(right),Create(axs[1]),Create(curves[1]),run_time=4)
        self.beat(3,FadeIn(txt('S ↑ 是否意味着 b ↑？需检验',25,GOLD).move_to([3.8,-2.2,0])))
        self.beat(4,FadeIn(self.note('两种候选动力学机制；曲线均为教学示意')))
        self.finish()

class Chapter15(Base):
    chapter=15
    def construct(self):
        params=eq(r'Z_0=1,\quad a=-0.09,\quad b=0.09,\quad Z_H=0',38).move_to(UP*2.95)
        ax=axes(x=(0,40,10),y=(0,1,.5),width=9,height=4.1).shift(LEFT*2.1+DOWN*.15)
        ax.add_coordinates(font_size=20)
        labels=VGroup(txt('存活比例',24).next_to(ax,UP),txt('语义长度 s',23).move_to([4.8,-1.85,0]))
        theory=line_graph(ax,SIM['times'],SIM['exact'],CYAN,4)
        empirical=line_graph(ax,SIM['times'],SIM['survival'],GOLD,2.4)
        legend=VGroup(txt('— 解析预测',28,CYAN),txt('— 10,000 条模拟',28,GOLD),txt('最大曲线偏差',24,MUTED),txt(f'{100*SIM["max_survival_error"]:.2f} 个百分点',31,FG)).arrange(DOWN,buff=.35).move_to([4.8,.25,0])
        self.beat(0,Write(params),Create(ax),FadeIn(labels))
        self.beat(1,Write(eq(r'\mathbb E[\tau_H]=\frac{1}{0.09}\approx11.11',35).move_to([4.4,2.15,0])))
        self.beat(2,Create(theory),Create(empirical),FadeIn(legend),run_time=5)
        self.beat(3,FadeIn(txt('步长 0.005  ·  随机种子 20260920',25,MUTED).move_to(DOWN*2.8)))
        self.beat(4,FadeIn(self.note('仅验证已知扩散系统的计算链条；不是 LLM 实测证据',GOLD)))
        self.finish()

class Chapter16(Base):
    chapter=16
    def construct(self):
        model=txt('Qwen3-8B',57,CYAN).move_to(UP*2.8)
        scale=eq(r'100\times50\times10\ \approx\ 50{,}000',56).move_to(UP*1.3)
        scale_note=txt('问题数 × 每题轨迹数 × 每条命题上限',28,MUTED).move_to(UP*.35)
        split=VGroup(card('估计集','学习 a(z)、b(z)',CYAN,width=4.2),card('校准集','独立确定边界',GOLD,width=4.2),card('盲测集','冻结后预测首达',BLUE,width=4.2)).arrange(RIGHT,buff=.65).move_to(DOWN*1.5)
        self.beat(0,Write(model))
        self.beat(1,Write(scale),FadeIn(scale_note))
        self.beat(2,FadeIn(txt('固定提示、解码、思考模式；记录完整生成与证据',27).move_to(DOWN*.4)))
        self.beat(3,LaggedStart(*[FadeIn(c) for c in split],lag_ratio=.2))
        self.beat(4,FadeIn(self.note('按问题划分，防止数据泄漏 · 本视频未运行真实模型实验',GOLD)))
        self.finish()

class Chapter17(Base):
    chapter=17
    def construct(self):
        cards=VGroup(*[card(a,b,c,width=4.2,height=1.45) for a,b,c in [('局部识别','Z → a, b',CYAN),('盲测预测','a, b → R, T',BLUE),('跨模型验证','标度关系是否复现？',GOLD)]]).arrange(RIGHT,buff=.65).shift(UP*1.5)
        self.beat(0,LaggedStart(*[FadeIn(c) for c in cards],lag_ratio=.15))
        caution=txt('生成停止：区分右删失与竞争事件',31,GOLD).move_to(DOWN*.15)
        self.beat(1,FadeIn(caution))
        self.beat(2,FadeIn(txt('只平均已失败样本，会产生选择偏差',28,RED).move_to(DOWN*1)))
        self.beat(3,FadeIn(txt('轨迹  /  漂移扩散  /  盲测存活  /  势垒  /  泛化',26,MUTED).move_to(DOWN*1.95)))
        self.beat(4,FadeIn(txt('用局部变化，预测尚未发生的首次错误',38,CYAN).move_to(DOWN*2.9)))
        self.finish()
