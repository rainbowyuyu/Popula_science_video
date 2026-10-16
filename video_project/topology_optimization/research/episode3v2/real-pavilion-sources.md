# 四角攒尖木构亭：可装配重建研究说明

更新时间：2026-10-05  
机器可读证据：[`real-pavilion-sources.json`](./real-pavilion-sources.json)  
图纸素材：[`assets/yingzao-fashi/`](./assets/yingzao-fashi/)

## 先说清楚“真实”

本片使用的是**宋式材分制规则重建**，不是把现有玩具亭换一层木纹，也不是冒充某座名亭的测绘复原。平面、梁柱尺寸、四角斗尖屋顶坡度和枓栱节点均从《营造法式》可核验条文派生；16Cai 柱网、6.5Cai 出檐和部分节点的具体取值是为了构成一座可拆装、可仿真的四柱亭而做的工程化重建假设。片中应在来源卡片标注“宋式规则重建”，避免把参数化模型说成文物原貌。

## 可直接引用的原始条文

- [第四卷·大木作制度一](https://zh.wikisource.org/wiki/%E7%87%9F%E9%80%A0%E6%B3%95%E5%BC%8F/%E7%AC%AC%E5%9B%9B%E5%8D%B7)：第六等材“广六寸、厚四寸，亭榭或小厅堂皆用”；材广分十五分、厚十分；櫨枓、栱、铺作和柱头节点有具体分数。
- [第五卷·大木作制度二](https://zh.wikisource.org/wiki/%E7%87%9F%E9%80%A0%E6%B3%95%E5%BC%8F/%E7%AC%AC%E4%BA%94%E5%8D%B7)：梁、闌额、柱、椽、檐、举折条文。闌额“两头至柱心，入柱卯”；余屋柱径“一材一契至两材”；余屋椽径“六分至七分”；四角斗尖亭榭“自橑檐方背举至角梁底，五分中举一分”。
- [Yingzao Fashi 1.JPG](https://commons.wikimedia.org/wiki/File:Yingzao_Fashi_1.JPG)：Public domain，宋式柱、叠层枓栱、椽檐剖面图。
- [Yingzao Fashi 2.JPG](https://commons.wikimedia.org/wiki/File:Yingzao_Fashi_2.JPG)：Public domain，梁/枋的榫卯工作图，适合做梁端插入柱卯的镜头。
- [Yingzao Fashi 3/4/5](https://commons.wikimedia.org/wiki/Category:Yingzao_Fashi)：Public domain，枓栱悬臂及工作图组。
- [Cai-fèn representation](https://commons.wikimedia.org/wiki/File:Cai-f%C3%A8n_representation.png)：CC BY-SA 4.0，材分等级示意；视频中需署名 Matheus Rudo / Wikimedia Commons。
- [UNESCO：中国传统木构营造技艺](https://ich.unesco.org/en/RL/chinese-traditional-architectural-craftsmanship-for-timber-framed-structures-00256)：文化背景来源。页面使用 JavaScript 挑战，视频只引用项目名称，不复制页面图像。

## 参数化模型（Cai/Fen 优先）

《营造法式》原文按寸、分、材、契表达。建模不要把公制数值写死：默认 `1 Cai = 15 Fen`，第六等材截面为 `15 × 10 Fen`，契为 `6 × 4 Fen`。为了在 Blender/Three.js 中有可读尺寸，可以暂按 `1 Cai = 0.1872 m` 的宋营造尺换算；这只是工程别名，替换尺制时只改一个常量。

| 部位 | 规则/取值 | 说明 |
|---|---:|---|
| 柱网 | 16Cai × 16Cai | 四根柱中心形成方形；约 2.995 m（工程别名） |
| 柱径 | 1.4Cai（1材1契） | 依第五卷“余屋柱径一材一契至两材” |
| 侧脚 | 柱顶向中心约 0.08Cai | 依第五卷柱条文，避免四根垂直玩具杆 |
| 出檐 | 6.5Cai | 由第五卷“檐出随椽径”反推，外檐方形约 29Cai |
| 檐口高度 | 18Cai | 便于 1:12 模型和镜头拆解 |
| 屋顶第一段 | rise/run = 1/5 | 四角斗尖亭榭原文规则 |
| 顶部收束 | rise/run = 1/2 | 上簇角梁段原文规则 |
| 椽径 | 0.40–0.467Cai（六至七分） | 椽条用实例化阵列，完整结构约 48 根/面 |

四根柱脚先落到柱下櫍和础石；闌额从侧面沿梁轴滑入柱卯；檐栿落在枓栱上；四根大角樑从四角同步汇到中央棖杆；子角樑、隱角樑再补齐坡面；最后椽条按第五卷椽心距实例化，四块可拆屋面板只做风压载荷面。反向拆解必须严格沿这些允许自由度退出，不能让构件凭空后移或穿模。

## 构件命名（Blender/Three.js/Zwind 共用）

`PAV_BASE_STONE`（础石/柱下櫍）→ `PAV_COL`（梭柱）→ `PAV_LAN_E`（闌额）→ `PAV_EAVE_BEAM`（檐栿）→ `PAV_EAVE_RAIL`（橑檐方/槫）→ `PAV_BRACKET`（枓栱）→ `PAV_HIP_MAIN`（大角樑）→ `PAV_HIP_SUB`（子角樑/隱角樑）→ `PAV_RAFTER`（椽）→ `PAV_HUB`（中央棖杆）→ `PAV_ROOF_PANEL`（可拆屋面板）。

这些组名已经写入 JSON，Zwind 的压力、剪切、位移和基底反力结果按同名组回写。四个 `PAV_BASE_STONE` 底面固定；风压施加在 `PAV_ROOF_PANEL`，沿椽—檐方—枓栱—闌额—柱—础石的路径回溯。20 m/s 只用于视频演示工况，不得当成建筑设计荷载。

“扩散”若只是把离散 Zwind 采样平滑到各部件表面，片中应写成“可视化扩散代理”；只有真正运行结构/流体求解后，才可称为反算结果。热力图表示压力/位移代理时要在角落标注变量名和工况，不能把颜色直接称为材料应力。

## 建模验收

1. 四个闌额端头全部与柱卯相交，沿梁轴可拆，装配时不穿模。
2. 檐栿端部只落在枓口/柱心，不能悬空。
3. 四根大角樑在中央棖杆同一点汇交，中心键先拆再拔梁。
4. 侧脚可见但不夸张；柱顶向中心收，柱脚外撇。
5. 椽条坡向一致，屋面板压在椽上，不反过来承重。
6. 正向装配与逆向拆解都能逐件完成；每一件都有来源组名和允许退出轴。
7. 风力热力图贴在真实亭体表面，随镜头移动，不出现旁侧漂浮色块。
