# 2026 年诺贝尔生理学或医学奖：检索与制作记录

## 官方事实（访问：2026-10-05）

- 官方获奖页：https://www.nobelprize.org/prizes/medicine/2026/
- 新闻稿：https://www.nobelprize.org/prizes/medicine/2026/press-release/
- 科普页：https://www.nobelprize.org/prizes/medicine/2026/popular-information/
- 科学背景：https://www.nobelprize.org/prizes/medicine/2026/advanced-information/
- 科普 PDF：https://www.nobelprize.org/uploads/2026/10/popular-medicineprize2026.pdf

获奖者：Karl Deisseroth、Peter Hegemann、Georg Nagel。获奖理由原文：
“for their discoveries concerning light-gated ion channels and optogenetics”。

视频中的科学链路按官方资料整理：衣藻趋光 → channelrhodopsin 光控阳离子通道 → 正离子流入并改变膜电位 → 神经元动作电位 → 光纤在活体小鼠脑内刺激特定细胞群。关键节点包括 2002/2003 年 channelrhodopsin、2005 年神经元实验、2007 年活体小鼠实验和 2006 年 optogenetics 命名。

临床边界：视网膜色素变性等方向属于早期探索和部分视觉恢复案例，视频没有写成完全治愈，也没有暗示普通蓝光可以直接控制人脑。

## 公开检索到的相关生物医学绘图工具

- BioRender：https://www.biorender.com/ —— 生物医学示意图与细胞/通路图的图形化工具，本片用作构图语言参考。
- UCSF ChimeraX：https://www.cgl.ucsf.edu/chimerax/ —— 分子结构可视化与分析工具，可用于通道蛋白结构的进一步镜头设计。
- Mol*： https://molstar.org/ —— 浏览器端分子结构可视化框架，可用于交互式结构浏览。
- Three.js：https://threejs.org/ —— 本片的细胞、膜通道、神经元、脑和光纤动态图形由此实现。
- Remotion：https://www.remotion.dev/ —— 本片的 1920×1080、30 fps 时间线、音画合成和渲染流程。

本片的医学图形为教学重构：Three.js 负责动态几何；官方 Nobel 插图用于来源卡与片尾引用；BioRender、ChimeraX、Mol* 作为医学可视化构图和后续分子结构扩展的工具参考，并非把重构画面冒充实验显微图。

## 官方图片署名

片中使用的 NobelPrize.org 科普插图署名：
© The Nobel Committee for Physiology or Medicine. Ill. Mattias Karlén

发布时保留片尾署名，并按官方页面的非商业使用说明核对具体授权范围。

## 关键论文线索

- Nagel et al. (2002), Channelrhodopsin-1
- Nagel et al. (2003), Channelrhodopsin-2
- Boyden et al. (2005), millisecond-timescale, genetically targeted optical control of neural activity
- Aravanis et al. (2007), temporally precise, cell-specific, spatially targeted optical control of neural activity in freely moving mammals

论文标题和年份只用于片尾索引，视频不把示意重构当成论文原图。

## 检索验证

2026-10-05 使用 `Invoke-WebRequest` 直接读取 NobelPrize.org 新闻稿页面，检查到获奖者三人姓名、授奖理由 `light-gated ion channels and optogenetics`，以及“Light-seeking algae gave us a switch for nerve cells”的官方叙述。BioRender、UCSF ChimeraX、Mol*、Three.js 官方主页均返回 HTTP 200；工具名称和用途按各自主页的公开说明记录。
