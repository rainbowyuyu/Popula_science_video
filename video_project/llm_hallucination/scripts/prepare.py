"""Prepare a source-grounded Chinese explainer, narration and reproducible demo."""
import asyncio
import json
import math
import os
from pathlib import Path
import subprocess
import numpy as np
from scipy.special import ndtr
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
FPS = 30
SOURCE = 'https://chatgpt.com/share/6aaf67a6-20ec-83ea-a428-90c3f6ccb901'

# Each paragraph is separately synthesized, making sentence timing reproducible.
CHAPTERS = [
('问题', '幻觉，何时第一次发生？', '从答案评分，走向生成过程', [
'同一个问题，大语言模型可能生成不同的回答。有的始终可靠，有的说到一半，开始编造事实。',
'我们通常在回答结束以后判断对错。但这段讨论提出了另一个问题：事实可靠性，是怎样在生成过程中失去的？',
'能否把幻觉的首次发生，理解成一条随机轨迹越过事实边界？',
'接下来，我们从概率密度演化出发，建立事实状态、漂移、扩散和首次越界之间的联系。',
'这是一套有待真实数据检验的研究框架。画面里的轨迹和数值例子属于教学演示，不代表已经发现了大模型的普适定律。']),
('出发点', '概率守恒：追踪一群可能的回答', 'PDEM 的启发', [
'李杰、陈建兵等发展的概率密度演化方法，关注随机系统的响应概率，怎样随着状态演化而重新分布。',
'可以把每一次随机生成想成一个小点。很多次生成，就构成一团概率云。',
'如果问题、模型和解码规则固定，再给定完整的采样随机数，生成轨迹也就确定了。',
'我们把随机事件映射成文本，再把文本映射成事实状态。概率不会凭空增加，只是换了一个观察坐标。',
'这是连接概率密度演化与语言模型的起点。但连接成立，不代表一个事实分数已经足以描述全部生成动力学。']),
('离散基础', '先有离散生成，再谈连续方程', '一步转移 ≠ 自动满足马尔可夫性', [
'语言模型原生是离散的自回归过程。下一个词元的分布，取决于完整前缀以及实际提供给模型的上下文。',
'把生成内容按可核验命题分段，就得到一串事实状态，记为 Z 下标 k。',
'下一步的概率密度，可以用条件转移核对当前密度积分得到。这个一步关系来自全概率公式。',
'但如果想重复使用同一个低维转移模型来预测未来，就必须检验：给定当前 Z 以后，更早的历史是否还影响下一步。',
'因此，离散概率守恒是基础；连续扩散方程只是满足额外假设时的有效近似。']),
('状态定义', '把事实性变成可测量的坐标', '支持、反驳、未知：三者分开', [
'关键不是先写方程，而是先定义事实状态。我们把回答拆成原子命题，再用独立证据进行核验。',
'对每个命题，估计支持、反驳和未知三类概率。三者相加等于一，并且需要校准。',
'最简单的事实坐标，是支持概率减去反驳概率；证据可用度，则是支持与反驳概率之和。',
'例如，支持零点八、反驳零点一，对应 Z 为零点七，证据可用度为零点九。',
'但支持和反驳都很小，Z 也会接近零。这意味着证据不足，不能直接判定为幻觉。因此还要保留证据可用度，并独立标注错误事件。']),
('变量辨析', '不确定性，不等于事实错误', '语义熵 S · 事实性 Z · 证据 A', [
'语义熵衡量的是：多次回答在意义上有多分散。它不直接判断哪一种意义是真的。',
'一个模型每次都自信地给出同一个错误答案，语义熵可以很低，事实状态却很差。',
'反过来，同一个正确事实有多种合理表述，也可能产生不同程度的不确定性。',
'所以更完整的候选状态是 Z、A、S，分别表示事实方向、证据可用度和语义不确定性。',
'温度属于外部解码设置。它可能改变转移统计，但既不是事实状态，也不能直接等同于扩散系数。语义熵是否能预测扩散，同样要靠数据检验。']),
('局部动力学', '漂移告诉方向，扩散告诉离散程度', '从相同起点，观察下一步', [
'现在把许多当前 Z 相近的轨迹放进同一个小区间，观察它们下一步的变化量。',
'变化量的条件均值除以步长，近似给出漂移 a。它告诉我们，状态平均往哪里走。',
'变化量的条件方差除以步长，近似给出扩散 b。它告诉我们，相同起点的轨迹散开得有多快。',
'在连续扩散极限下，严格定义需要让步长趋近于零。真实命题步长有限，因此还必须检查不同步长下的偏差。',
'此外，核验器本身的评分噪声，也会抬高观测方差。若不校准测量误差，就可能把评分抖动误认为模型的随机扩散。']),
('密度演化', '从轨迹，走向概率云', 'Fokker–Planck 有效方程', [
'如果小增量、近似马尔可夫性和扩散近似成立，我们就可以用随机微分方程描述 Z。',
'其中，a 乘以语义步长，是平均变化；根号 b 乘以布朗增量，是随机波动。',
'对应的福克普朗克方程包含两部分。漂移项搬运概率质量，扩散项让概率质量分散。',
'同一条方程，也能写成密度变化加上概率流的散度等于零，这正是概率守恒。',
'这里的扩散方程，不应直接等同于经典的输运型广义概率密度演化方程。后者在给定随机事件且轨迹可微时描述输运；布朗轨迹则不能直接当作普通可微曲线。']),
('降维条件', '三维状态，何时能缩成一维？', '边缘化是恒等操作，闭合是额外条件', [
'在三维候选状态中，漂移是向量，扩散是矩阵，交叉项允许事实性、证据和语义不确定性相互耦合。',
'把联合密度对 A 和 S 积分，可以得到 Z 的边缘密度。但边缘化并不自动消除记忆。',
'要严格闭合，一种充分条件是：Z 的漂移和瞬时扩散只依赖 Z，并且消去方向没有净边界通量。',
'近似闭合的另一条路，是 A 和 S 比 Z 快得多地松弛，形成给定 Z 的稳定条件分布。',
'快变量消去也可能产生额外扩散或记忆效应。只有数据支持这些条件，才适合使用一维有效方程。']),
('可证伪性', '先检验模型，再用模型预测', '历史依赖 · 步长稳定 · 任务异质性', [
'第一项检验，是比较直接观察到的两步转移，与两个一步转移相乘后的结果。这是查普曼科尔莫戈罗夫一致性检验。',
'第二项检验，是在相同当前状态下，按照不同历史分组，看下一步分布是否仍然不同。',
'第三项检验，是改变语义步长，检查漂移和扩散是否稳定，并检查大跳跃和高阶矩。',
'这些检验通过，只能增加对近似模型的信心，不能单独证明马尔可夫性。不同问题混在一起，还可能制造虚假的记忆或扩散。',
'如果一维失败，就增加证据、语义熵或历史变量；如果跳跃显著，就回到离散转移模型。失败结果同样能揭示理论的边界。']),
('首次越界', '现在错误，与曾经错误，是两件事', '首次到达时间 τH', [
'看这条轨迹：它先进入错误区域，之后又回到事实区域。最终答案的状态可能改善了，但第一次错误已经发生。',
'因此，某一时刻位于错误区域的概率，不等于此前至少发生过一次错误的概率。',
'首次越界时间，定义为状态第一次到达预先校准的幻觉边界的生成位置。这里的时间，实际上可以按命题数计量。',
'计算首次越界时，我们在边界处吸收轨迹：一旦越界，就从尚未失败的集合中移除。',
'这只是统计首次错误的方法，不是在说模型无法纠正。边界是否真正对应事实错误，仍要用独立标注验证。']),
('风险统计', '用存活曲线描述可靠性', 'R：尚未越界 · f：首次越界 · λ：条件风险', [
'把所有尚未越界的概率质量加起来，就得到存活概率 R。它表示生成到当前位置，仍然一次都没有越界的概率。',
'一减 R，是至少越界一次的累计概率。R 下降得有多快，对应首次越界的位置分布。',
'首次越界密度再除以 R，就得到危险率：在此前一直安全的条件下，接下来发生首次错误的瞬时风险。',
'如果上端没有概率流出，那么下端吸收边界流失的概率，恰好等于首次越界密度。',
'危险率不一定是常数。只有在近似恒定危险率等条件下，存活曲线才接近指数衰减。']),
('平均首达', '从局部统计，预测平均安全长度', '后向方程 + 边界条件', [
'我们还想知道：从某个事实状态开始，平均还能生成多长，才首次越界？把这个平均长度记为 T。',
'先走一个很小的步长，再加上从新状态出发的剩余等待长度，就应该等于原来的 T。',
'对这个递推关系做泰勒展开，并代入漂移和扩散，就得到后向方程：a 乘 T 的一阶导数，加二分之一 b 乘二阶导数，等于负一。',
'在下端吸收边界，T 等于零。若上端设为反射边界，T 的一阶导数等于零。',
'解出这个边值问题，就建立了局部 a、b 与整体首达长度的联系。反射上界是一项建模选择，必须做敏感性分析，不能只写方程而忽略边界。']),
('无量纲化', '漂移和扩散，谁占主导？', '尺度选择必须写清楚', [
'选取事实状态的特征尺度 L，漂移尺度 a 零和扩散尺度 b 零。',
'用 L 缩放状态，用 L 除以 a 零缩放生成长度，方程中自然出现一个无量纲比值：a 零乘 L，除以 b 零。',
'它衡量漂移相对于随机扩散的强弱。如果把扩散常数定义成 b 的一半，那么通常的佩克莱数会多一个二。',
'比值大，只说明漂移相对强，并不自动代表安全。如果漂移朝向错误区域，强漂移反而意味着更快失败。',
'所以风险还取决于漂移方向、状态依赖、初始位置和边界，不能用一个人为指定的临界数字代替首达计算。']),
('势垒', '指数规律，有明确的适用条件', '稳定点 ZF · 不稳定点 ZC · 判定边界 ZH', [
'只有当实测漂移支持一个稳定事实点，以及它与错误区域之间的不稳定点时，我们才有理由讨论逃逸势垒。',
'稳定点会把小扰动拉回来；不稳定点的两侧，漂移会把轨迹推向不同方向。它不一定等于最终判定错误的边界。',
'在原对话修正后的定义里，势垒数是从不稳定点到稳定点，对二倍漂移除以扩散进行积分。',
'对于负势能梯度漂移和常数噪声，它等于势垒高度除以噪声强度。',
'在亚稳态、弱噪声和稀有逃逸条件下，平均首达长度才近似按势垒数的指数增长。前因子也有影响，不能把这条渐近规律宣称为所有模型都满足的普适定律。']),
('两条路径', '平均方向恶化，或随机波动增强', '两种候选机制，需要实测区分', [
'这个框架提出了两条可能的失败路径。第一条是漂移主导：平均变化本身就把事实状态推向错误边界。',
'这种情形即使随机波动很小，也可能持续产生稳定的错误。低语义熵不能排除它。',
'第二条是扩散主导：平均恢复方向还在，但随机波动让一部分轨迹越过边界。',
'语义熵与扩散强度是否相关，只能作为待检验假设。相关性即使存在，也不能直接推出因果关系。',
'这两条路径的价值，是把不同失败机制变成可比较的动力学量，而不是仅用一个置信分数解释所有幻觉。']),
('教学仿真', '让首达预测在一个已知系统里工作', '合成扩散数据，不是 LLM 实验结果', [
'为了看清计算过程，我们模拟一个已知的随机系统。初始状态为一，漂移为负零点零九，扩散系数为零点零九，下端零点吸收。',
'这里没有上端反射边界。这个常系数系统的平均首达时间，有精确结果：一除以零点零九，约为十一点一一。',
'我们独立模拟一万条轨迹，再把实际的存活比例与解析存活曲线比较。',
'两条曲线接近，说明在假设已知的教学系统中，局部动力学确实可以预测首次越界统计。有限时间步仍会带来小的离散误差。',
'这验证的是计算链条，不是大模型幻觉理论。真正困难的一步，是从真实文本中得到可靠的 Z，并证明这些有效假设适用。']),
('最小实验', '在 Qwen3-8B 上，完成预测闭环', '先固定协议，再采集轨迹', [
'原对话建议用开放权重的 Qwen 三，八十亿参数模型做最小实验，便于固定设置和访问生成概率。',
'一个起步规模是一百个问题，每题五十次生成，每条最多十个可核验命题，约得到五万个状态观测。',
'固定提示、解码方式和思考模式，记录随机种子、前缀、命题、证据以及独立核验结果。不能为了凑够命题数而强迫模型编造。',
'先按问题划分估计集、校准集和盲测集，避免同一个问题的不同生成泄漏到两边。',
'只在估计集学习漂移和扩散，在校准集确定边界，冻结全部设置后，再预测盲测集的首达分布。本视频没有运行这项真实模型实验。']),
('验证与收束', '真正的新意，要由盲预测证明', '定义可测量 · 假设可检验 · 预测可失败', [
'验证时，要比较完整存活曲线，并与离散转移、静态事实分数和语义熵等基线比较。',
'生成结束时还没有错误的轨迹，需要按预先声明的目标处理。若估计持续生成的潜在首达时间，要报告右删失及其假设；若研究完整回答，则还要考虑停止生成这一竞争事件。',
'从未失败的短轨迹，不能直接当作无限安全，也不能用已失败样本的平均值冒充整体平均首达时间。',
'论文叙事可以围绕五组图展开：状态轨迹、漂移扩散、盲测存活、势垒条件，以及跨模型验证。跨模型标度和提前预警都属于下一步假设。',
'这套思路的核心，是用可测量的局部变化，预测尚未发生的首次错误。能否成立、是否具有足够创新性，要由独立数据和对照实验回答。'])
]

def save_source():
    path = ROOT / 'content/source_messages.json'
    if not path.exists(): path = REPO / 'tmp/shared_messages.json'
    if not path.exists(): return
    raw = json.loads(path.read_text(encoding='utf-8'))
    unique, seen = [], set()
    for m in raw:
        key = (m['role'], m['text'])
        if key not in seen:
            seen.add(key); unique.append(m)
    unique.reverse()
    (ROOT/'content/source_conversation.md').write_text(
        f'# 原始分享对话（去重并按时间顺序整理）\n\n来源：{SOURCE}\n\n'+
        '\n\n'.join(f'## {i+1}. {m["role"]}\n\n{m["text"]}' for i,m in enumerate(unique)), encoding='utf-8')

def simulation():
    rng = np.random.default_rng(20260920)
    n, dt, end, mu, b, z0 = 10000, .005, 40., -.09, .09, 1.
    z = np.full(n,z0); hit = np.full(n,np.inf)
    times, survival, paths = [0.], [1.], [z[:14].tolist()]
    for k in range(1, round(end/dt)+1):
        z += mu*dt + np.sqrt(b*dt)*rng.normal(size=n)
        hit[(hit==np.inf)&(z<=0)] = k*dt
        if k%40==0:
            t=k*dt; times.append(t); survival.append(float(np.mean(hit>t))); paths.append(z[:14].tolist())
    ts=np.array(times[1:]); sd=np.sqrt(b*ts)
    exact=np.r_[1, ndtr((z0+mu*ts)/sd)-np.exp(-2*mu*z0/b)*ndtr((-z0+mu*ts)/sd)]
    data={'kind':'synthetic teaching simulation, not LLM observations','seed':20260920,'n':n,'dt':dt,'mu':mu,'b':b,'z0':z0,
          'times':times,'survival':survival,'exact':exact.tolist(),'paths':np.array(paths).T.tolist(),
          'max_survival_error':float(np.max(np.abs(exact-survival))),'exact_mfpt':z0/abs(mu),'censored_fraction':float(np.mean(hit>end))}
    assert data['max_survival_error']<.03, data['max_survival_error']
    (ROOT/'public/simulation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Simulation:',{k:v for k,v in data.items() if k not in ('times','survival','exact','paths')},flush=True)

async def narrate():
    semaphore=asyncio.Semaphore(3)
    async def one(i,j,txt):
        p=ROOT/f'public/audio/{i:02d}_{j:02d}.mp3'
        async with semaphore:
            if not p.exists() or p.stat().st_size<1000:
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(txt,'zh-CN-YunxiNeural',rate='-3%',proxy=os.getenv('VIDEO_TTS_PROXY')).save(str(p))
                        break
                    except Exception:
                        if attempt==3:raise
                        await asyncio.sleep(1+attempt)
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)],text=True).strip())
            return {'file':f'audio/{p.name}','text':txt,'duration':duration,'frames':math.ceil(duration*FPS)}
    jobs=[one(i,j,txt) for i,c in enumerate(CHAPTERS) for j,txt in enumerate(c[3])]
    values=iter(await asyncio.gather(*jobs))
    chapters=[]; global_frame=0; captions=[]; srt=[]
    for i,(tag,title,subtitle,paragraphs) in enumerate(CHAPTERS):
        cursor=24; segments=[]
        for j in range(len(paragraphs)):
            seg=next(values); seg['from']=cursor; segments.append(seg)
            # Split visual subtitles into short clauses. Clause durations are estimated
            # within an independently synthesized paragraph, not forced-aligned words.
            import re
            clauses=[x for x in re.split(r'(?<=[，。；：？！])',seg['text']) if x]
            chunks=[]
            for clause in clauses:
                while len(clause)>27:
                    chunks.append(clause[:24]); clause=clause[24:]
                if clause: chunks.append(clause)
            total=sum(len(x) for x in chunks); offset=0
            for chunk in chunks:
                start=(global_frame+cursor)/FPS+seg['duration']*offset/total
                offset+=len(chunk)
                stop=(global_frame+cursor)/FPS+seg['duration']*offset/total
                captions.append({'text':chunk,'startMs':round(start*1000),'endMs':round(stop*1000),'timestampMs':None,'confidence':None})
            cursor+=seg['frames']+10
        frames=cursor+24
        chapters.append({'id':i,'tag':tag,'title':title,'subtitle':subtitle,'start':global_frame,'frames':frames,'segments':segments,'clip':f'clips/Chapter{i:02d}.mp4'})
        global_frame+=frames
        print(f'{i:02d} {title}: {frames/FPS:.1f}s',flush=True)
    timeline={'fps':FPS,'width':1920,'height':1080,'frames':global_frame,'source':SOURCE,'chapters':chapters,'captions':captions}
    (ROOT/'src/timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    def stamp(ms):
        ms=round(ms); return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
    for i,c in enumerate(captions):srt.append(f'{i+1}\n{stamp(c["startMs"])} --> {stamp(c["endMs"])}\n{c["text"]}\n')
    (ROOT/'output/讲解字幕.srt').write_text('\n'.join(srt),encoding='utf-8')
    (ROOT/'content/讲解稿.md').write_text('# 从概率密度演化到大模型幻觉的首次越界\n\n'+
        f'来源：{SOURCE}\n\n中文旁白：zh-CN-YunxiNeural（合成语音）。字幕按独立语段时长分配，非逐字强制对齐。\n\n'+
        '\n\n'.join(f'## {c["start"]//FPS//60:02d}:{c["start"]//FPS%60:02d} {c["title"]}\n\n'+ '\n\n'.join(s['text'] for s in c['segments']) for c in chapters),encoding='utf-8')
    print(f'Total: {global_frame/FPS:.2f}s; {global_frame} frames',flush=True)

if __name__=='__main__':
    for p in ['content','output','public/audio','public/clips','scripts','manim']:(ROOT/p).mkdir(exist_ok=True,parents=True)
    save_source(); simulation(); asyncio.run(narrate())
