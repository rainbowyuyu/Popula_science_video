"""Engineering narration revisions; stable semantic shot IDs and sections."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
source=ROOT/'docs/story.json';story=read(source)
revisions={
's001':'上海中心，六百三十二米。把这座楼拆开，你会看到一套从云端一直连到地下的骨架。',
's002':'先把外层玻璃分区移开，再看楼面和钢架。按原来的层次展开，里面的连接就露出来了。',
's003':'从外到内，先是幕墙，再是梁柱，中心是核心筒。镜头顺着这些构件往下，地下还有另一半答案。',
's006':'桩伸进更深的土层，楼的重量沿着桩身向下传。周围的土贴着桩身，从侧面提供向上的阻力；桩底的土，再托住一部分。这两条传力路线，一起接住上面的重量。',
's007':'再看一根独立的桩模型，给它一段变化的侧向推力。桩头先移动，桩身跟着弯曲，周围的土沿着深度抵住它。颜色把桩身的受力标出来，哪一段更吃力，就更容易看清。推力撤掉以后，桩还会轻轻摆几下，能量逐渐耗散。这是一根桩的计算例子，用来读懂桩和土怎样配合。',
's012':'钢材和混凝土，一起承担楼层的重量，也抵抗从侧面吹来的风。',
's013':'风把楼顶推向一边，核心筒会像竖起的尺子那样弯曲，越高的位置移动越明显。画面放大了位移，旁边的直线保留原来的位置，两相对照，就能看清它怎样变形。',
's018':'把两边接起来的，是伸臂钢架。先拆开看：上下两条横杆，叫上弦和下弦；中间的斜杆，把它们连成一个个三角形。上下弦连住两端，斜杆撑在中间。楼一弯，这些连接就把力传到外圈。合起来以后，这座小钢桥就能把核心筒和外圈柱连在一起。上海中心的六处关键高度，都有这种钢架。',
's019':'核心筒向一边弯，就会带着伸臂一起转动。伸臂的一头向下压，另一头向上提，这个动作把外圈的巨型柱也调动起来。看这两根斜杆的颜色，就能看见这一刻的受力变化。',
's020':'橙色，表示向受压方向变化；蓝色，表示向受拉方向变化。这张色图，读的是风带来的增量。再看外圈的柱子，它原本还压着整栋楼的重量。压力减小的一边，也可能仍然在受压。',
's021':'伸臂把力带到外圈，环带钢架再沿着周边，把这份力分给更多柱子。中间、外圈和上下楼层相互连接，大楼就能借整个宽度，抵抗侧面的推力。',
's034':'楼站得稳，人坐在高处，却仍然可能觉得晃。到了这里，工程师还要照顾另一件事：让人的感觉也稳下来。',
's040':'这栋楼又是怎么造起来的？施工时，核心筒先向上爬升，后面的工序接着跟上。',
's043':'主体升到大约三分之一高度，外层玻璃才开始跟进。一块块玻璃装上去，连接处还要给结构变形留出空间。',
's046':'这些结构藏进了曲线里，却还在一刻不停地接力。楼层的重量向下走，风的推力沿框架散开，最后都交到脚下的土地。',
's047':'六百三十二米的高度，靠的是每一处连接，都能把力送到下一站。外形越轻盈，里面的配合越精细。',
's048':'每天五分钟，认识生活里的新知识。我们下次见。'
}
cfd_draft=read(ROOT/'research/cfd-narration-draft.json')
revisions.update({sid:cfd_draft[sid] for sid in ['s029','s031','s032']})
revisions['s030']=''.join(cfd_draft['s030Segments'])
cfd_files=['computed-wind-paths.json','computed-pressure.json','computed-flow-slices.json']
cfd_accepted=all(read(ROOT/'public/physics'/name).get('quality',{}).get('acceptedForFilm') is True for name in cfd_files)
focus={
's006':'真实独立单桩静态加载，沿桩侧向上反力与桩端支承接力；土层深度与源资料对齐。',
's007':'回放40秒独立单桩动力计算，随计算位移和弯矩/轴力/土反力显示；变形放大标倍率，非947根群桩实楼结论。',
's013':'等效结构实际计算位移与直立参考线对照，显示放大倍率；不把教学模型响应当实楼预测。',
's018':'上、下弦先上下分离，斜腹杆横向外移，再沿原连接合回。解说拆开三类杆件，讲清弦杆和腹杆作用。',
's019':'镜头沿伸臂显示两根实际斜腹杆的轴力增量，周边巨柱和环带保留普通材质，箭头绑定变形后的受力点。',
's020':'固定正拉负压的风致应力增量色标，同时保留重力原有受压；正增量表示减压、负增量表示增压，正增量不等于净拉应力。',
's021':'沿外圈环带慢移，从伸臂端节点经过相邻巨柱，再缓慢拉开看整体宽度。',
's029':'显示同一3D原生场的平均表面压力系数，颜色映射实际塔面；不能混成材料应力。',
's030':'连续抬升相机依次看100、300、500米三个水平平均速度切片；按三段实际语音时间对齐切片。',
's031':'沿来流方向通过塔轴的纵向平均速度切片，镜头从楼底沿塔身上移，展示塔顶绕行和低速尾流。',
's032':'风洞与120度扭转设计依据后，过渡到独立结构处方荷载的响应；不宣称CFD压力已经耦合结构。'
}
manifest=[]
for row in story['shots']:
 sid=row['id']
 if sid in revisions:
  manifest.append(dict(id=sid,section=row['section'],before=row.get('ttsText',row['text']),after=revisions[sid]))
  row['text']=row['caption']=row['ttsText']=revisions[sid]
 if sid in focus:row['focus']=focus[sid]
story['voiceRevision']='v7-engineering-flow'
story['notes']=[
 '教学性分层重建，不是施工图或真实整区预制安装方案。',
 '整楼线性结构模型和单桩动力模型均保存实际求解证据，但二者采用独立教学荷载，未进行整楼—群桩—土耦合。',
 '一拉一压描述风致轴力或应力增量；减压构件可能仍受重力压应力。变形必须标明显示倍率。当前等效FE楼面横向约束使伸臂上下弦风致轴力增量为零，定量着色只显示实际非零的斜腹杆和巨柱响应，不声称该简化模型分辨了真实弦杆内力。',
 '单桩数据仅含弹性梁和土弹簧/阻尼器结果，桩土界面牵引不等于连续土体应力。',
 '风段展示理想化平均流场的宏观绕行、平均压力和速度剖面，仅用于有限网格误差下的定性科普，不声称严格收敛或工程预测；平均场回放不表示交替脱落的瞬态涡。',
 '旁白保留完整字头字尾，不拉伸；ASR和波形边界检查不能替代人工听审。'
]
story['voiceNotes']=[
 'Stable s001-s048 semantic IDs and sections. Measured source duration sets clip duration; no stretching.',
 'Plain speech keeps engineering labels in the visualization. No unverified pronunciation claim is inferred from ASR spelling.',
 's029-s032 describe idealized mean fields and macro-scale qualitative flow features only; no engineering accuracy, strict convergence or transient shedding is claimed.',
 'Single-pile dynamics uses an independent illustrative load, not actual tower pile-group reactions; wind structural input is also an independent teaching case.'
]
story['cfdNarrationCandidateStatus']='Accepted for limited qualitative film use after root and independent review; actual production gates true.' if cfd_accepted else 'Candidates held pending production CFD gates.'
save(ROOT/'docs/story-v7.json',story)
save(ROOT/'audio/v7-rewrite-manifest.json',dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),changes=manifest,pendingCFD=[] if cfd_accepted else ['s029','s030','s031','s032']))
print('Prepared',len(manifest),'revisions; CFD accepted for limited film scope',cfd_accepted)
