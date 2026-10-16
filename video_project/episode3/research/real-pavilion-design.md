# 可装配榫卯亭：设计依据与模型边界

这版模型把上一版“展示用玩具”改成四柱、三米开间的可拆装木构亭。它用于视频中的构造和受力可视化，按公制参数建立了独立的柱、地栿、穿插枋、檩、椽、斗栱、望板和栏杆；不是施工图，也没有替代地方规范、木材含水率检查或结构工程师复核。

## 参考资料

1. Liang Sicheng, *A Pictorial History of Chinese Architecture* (MIT Press, 1984)。书中把中国木构的柱网、梁架、斗栱和屋面层次作为可读的构造系统，模型采用“四柱方亭”的教学化简化。
2. 中国古代建筑术语中的“斗栱、檩、椽、穿枋、榫卯”定义，参照中国建筑工业出版社《古建筑木作营造技术》（ISBN 9787112143821，章节：木构架与榫卯）。
3. *Yingzao Fashi* (《营造法式》, 1103) 的材份模数思想：模型以 0.30 m 作为叙事模块，柱截面 0.30 m，开间 3.00 m，梁端榫长 0.15 m。这里是动画比例基准，不是对古制材份的逐条复原。
4. Dougong overview（结构关系与名词）：<https://en.wikipedia.org/wiki/Dougong>。
5. Mortise-and-tenon overview（榫头、榫眼、木销的基本关系）：<https://en.wikipedia.org/wiki/Mortise_and_tenon>。
6. 《营造法式》条目（版本、年代和材份制度概览）：<https://en.wikipedia.org/wiki/Yingzao_Fashi>。
7. Wikimedia Commons 的 Chinese pavilions 图像分类，用于屋顶轮廓、檐口与栏杆比例的视觉比对：<https://commons.wikimedia.org/wiki/Category:Chinese_pavilions>。

## 构造假设

- 四根 0.30 × 0.30 × 3.20 m 立柱固定在四块石础上；每根柱在地栿、穿插枋、檐枋三个高度分别向 X/Y 两个开间方向各开一枚 0.18 × 0.18 × 0.14 m 榫眼（每柱六枚）。
- 每根地栿、穿插枋、檐枋的净跨为 2.70 m，两端各保留 0.15 m 榫头；榫头作为独立网格输出，镜头可以先抽出再水平插入。
- 每个柱头有三层交错的栌斗—拱—昂，随后安装四道檩和 28 根独立椽条；屋面分为四块可移除望板，瓦条保持独立。
- 栏杆使用上下两道横枋和 24 根望柱，先水平插入，再落位，避免把栏杆误画成竖直“插入”。
- 动画阶段顺序记录在 `real-pavilion-components.json`，GLB 带有 280 帧的装配关键帧；Three.js 可按 `assembly_step` 或 `part_type` 筛选部件。

## 文件

- `../build_real_assembly_pavilion.py`：从零重建 Blender 场景、真实榫眼布尔切割、独立榫头与装配动画。
- `../blender/real_assembly_pavilion.blend`：可编辑源场景。
- `../blender/real-assembly-pavilion.png`：当前审美检查帧。
- `../blender/real-pavilion-audit.json`：对象、榫眼、榫头和帧数审计。
- `real-pavilion-components.json`：面向 Remotion/Three.js 的部件目录和尺寸。
- `../../topology_optimization/public/episode3/models/real-assembly-pavilion.glb`：带部件层级与装配动画的交付 GLB。

## 使用限制

该模型刻意保留“可拆解、可讲解”的榫眼和榫头，材料强度、节点摩擦、木材各向异性和风荷载计算需要另行在 Zwind/结构有限元中设置；视频中应把仿真结果标为“按此几何的演示性反算”。
