"""Replace the old generic joinery narration with the real pavilion story.

Frame boundaries stay intact so the camera choreography remains reviewable;
the voice pass below uses the same clip durations when aligning new speech.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
timeline_path = ROOT / "public/episode3v6/timeline.json"
t = json.loads(timeline_path.read_text(encoding="utf-8"))
titles = {
    "intro":"一座亭子，怎样站住", "straight":"闌额：梁端怎样入柱",
    "dovetail":"枓栱：一层层把檐托出去", "lap":"攒尖：四根大角樑汇到中心",
    "pin":"木销：给节点最后一道锁", "assembly":"按顺序，把亭子装起来",
    "load":"重量，沿哪条路走", "stress":"构件里面，也在受力",
    "wind":"Zwind：风从屋面绕过", "moisture":"雨水，怎样进入木材",
    "repair":"可拆，才有修缮余地", "return":"再看一遍这座亭子",
    "references":"图纸、模型与工况"
}
lines = {
"intro":[
"公园里一阵风过去，亭子没有一根钉子，却稳稳站着。",
"我们把它拆开：屋面板、椽条、大角樑、枓栱，按装配顺序退到镜头外。",
"留下的不是玩具骨架，而是一套按宋式材分制重建的可拆构件。",
"今天只看一件事：每个接头怎样让木头互相托住，又保留拆修的路。"],
"straight":[
"先看闌额。梁端故意做窄，像一只伸进柱身的舌头。",
"柱子里对应的空腔叫卯，梁端凸出的部分叫榫。",
"装配时梁从侧面水平滑入，榫肩贴住柱面，位置就被定住。",
"屋檐的重量压下来，先碰到榫肩，再传到柱壁，不靠一颗钉子。",
"镜头穿进柱身，你能看到六个不同高度的卯口，分别接住地栿、穿枋和檐栿。",
"拆解也有方向：沿梁轴退出来，其他方向被木料本身挡住。"],
"dovetail":[
"抬高镜头到柱头，真正复杂的不是一条燕尾，而是一组枓栱。",
"最下面的櫨枓坐在柱头，泥道栱、華栱、令栱一层层交错。",
"每一层都有自己的口，下一层托住上一层，力就沿着悬臂向外走。",
"把其中一组透明化，能看见昂的斜向伸出，以及檐栿落下的位置。",
"它限制的是侧滑和下沉；要拆时，先取上层，再按相反顺序退出。",
"所以枓栱看起来层层叠叠，其实每一块都保留了可追溯的装配自由度。"],
"lap":[
"屋顶四个角的力，最后要在中心碰面。",
"四根大角樑从檐角向中央棖杆收拢，子角樑随后补上连续的坡面。",
"我们把它们分开：先看斜梁的端部如何找到中心，再看棖杆怎样锁住汇交。"],
"pin":[
"节点还要防止木料在反复风振里慢慢拔出。",
"这里用的是亭子梁端的木销位置：销子从孔洞横向穿过梁和柱，方向和受力路径一致。",
"镜头切到剖面，先退销，再沿梁轴退榫；拆卸顺序就是维修顺序。",
"销子管住拔出，榫肩管住下压，两个动作分开承担，接头才不会互相打架。",
"同一套顺序会在后面的整亭装配里再次出现。"],
"assembly":[
"现在按真实装配顺序把它装回去：先是四块础石。",
"柱脚沿竖直方向落入柱下櫍，四根柱子的侧脚向中心轻轻收。",
"闌额、檐栿和橑檐方从屏幕外水平滑入，闭合成方。",
"柱头的枓栱逐级向外，接住檩条、椽条和四块可拆屋面板。",
"栏杆最后水平插入；没有突然生成，每个构件都沿自己的进入轴到位。"],
"load":[
"亭子站稳以后，重量沿一条很具体的路往下走。",
"屋面板把面荷载交给椽条，椽条再交给檩和橑檐方。",
"檐栿、枓栱、闌额把力送进四根柱子，最后落到础石。",
"红色路径是屋面到地面的压缩传力，青色回路是节点提供的反向约束。"],
"stress":[
"把一根檐栿单独拿出来，先看它弯，再看节点贴合。",
"下压时梁腹受弯，一侧压缩，另一侧拉伸；颜色只是响应量的可视化。",
"镜头聚焦到柱卯边缘，孔边剩余木料越薄，局部反力越集中。",
"这不是把颜色当成材料应力，而是把部件载荷和反力沿真实构造路径标出来。",
"接下来把同一套构件放回风场，看看外力从哪里来。"],
"wind":[
"这里运行的是 Zwind / ZDyn 的 12 米每秒基准工况，先看流场怎样绕过亭子。",
"气流沿屋脊上翻，穿过敞开的柱间，再在背风面回流。",
"热力图绑定到真实屋面板、椽条和柱头，亮色表示映射到的峰值载荷。",
"我们用 Zwind 基底反力校准面积和高度权重，再把力反算回 171 个命名部件。",
"它是透明的后处理桥接，用来讲清传力方向，不等同建筑规范荷载或全尺寸 CFD。"],
"moisture":[
"风过去了，雨水却会慢慢改变接头。",
"水分先从屋面和梁端表面进入，再沿木纹和横纹以不同速度扩散。",
"截面颜色由浅变深，表示各向异性扩散的可视化代理，不冒充含水率实测。",
"当榫头吸湿膨胀，卯口会更紧；干燥以后，间隙又可能回来。",
"所以选料、干燥和试装，都是在给未来的季节留余量。",
"我们把扩散场叠回梁端，能看到最先变化的是接触面，而不是整根木头同时变形。",
"这正是可拆结构的优势：需要调整时，可以沿原来的装配路径退出来。"],
"repair":[
"多年以后，如果某根檐栿受损，修缮先用支撑接住上面的重量。",
"再按节点图反向拆解：先退屋面板和椽条，再松开枓栱和梁端。",
"换木、修补、复测卯口，最后把原来的受力路径接回去。",
"可拆不是为了把亭子变成玩具，而是把维护变成可记录、可复核的工程流程。"],
"return":[
"镜头退回完整亭子，刚才的每一条线都回到自己的位置。",
"你现在能认出：梁端入柱，枓栱托檐，大角樑把四角收向中心。",
"Zwind 的风、反力映射和扩散代理，都只是为了让看不见的过程变得可读。",
"真正可靠的地方，是每个零件都能沿清楚的方向装上，也能沿清楚的方向拆下。",
"下次经过一座木亭，抬头看一眼；你看到的将不只是屋檐，而是一条藏起来的力路。"],
}
for scene in t["scenes"]:
    if scene["id"] in titles: scene["title"] = titles[scene["id"]]
for scene_id, texts in lines.items():
    clips = [c for c in t["clips"] if c["scene"] == scene_id]
    if len(clips) != len(texts): raise SystemExit(f"{scene_id}: {len(clips)} clips vs {len(texts)} texts")
    for c, text in zip(clips, texts):
        c["title"] = titles[scene_id]; c["text"] = text; c["spoken"] = text
        c.pop("line", None)
        c["line"] = texts.index(text)
for c in t["captions"]:
    clip = next((x for x in t["clips"] if x["id"] == c["clip"]), None)
    if clip: c["text"] = clip["text"]
for scene in t["scenes"]:
    if scene["id"] == "references": scene["title"] = titles["references"]
timeline_path.write_text(json.dumps(t, ensure_ascii=False, indent=2), encoding="utf-8")
(ROOT / "src/episode3v6/timeline.json").write_text(json.dumps(t, ensure_ascii=False, indent=2), encoding="utf-8")
(ROOT / "research/episode3v6-story.json").write_text(json.dumps(lines, ensure_ascii=False, indent=2), encoding="utf-8")
print("rewrote", len(t["clips"]), "clips", "duration", t["duration"] / t["fps"])
