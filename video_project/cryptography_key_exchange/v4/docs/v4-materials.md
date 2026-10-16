# V4 材质、纸面排版与退场检查

记录日期：2026-10-15。此文档记录实际读取/查看的参考与本轮实现，最终成片仍以主流程的代表帧和连续片段验收为准。

## 实际参考

- Matthew Butterick, Practical Typography — [Research papers](https://practicaltypography.com/research-papers.html)
- Matthew Butterick, Practical Typography — [Page margins](https://practicaltypography.com/page-margins.html)
- 实际参考图：[research-paper-after.png](https://practicaltypography.com/samples/research-paper-after.png)

通过 HTTPS 读取了上述网页。再次读取 research-papers 页确认其 img 元素实际指向 `samples/research-paper-before.png` 与 `samples/research-paper-after.png`，未猜测图片地址。浏览器启动工具当时不可用，因此网页读取用 Python urllib；未声称成功在浏览器中打开。

原图存于 `work/paper-reference/research-paper-after.png`，612×792。SHA-256：`a03ef84ed82412b76debbf0a5834dfa4ea5e72692f16079459a56ab2f9b4c1af`。

由于原图有透明底，先以 Pillow 合成白底参考图 `work/paper-reference/research-paper-after-white.jpg`，随后使用图像查看工具实际查看。看到的布局是：较宽的四边留白、窄而完整的正文栏、统一左对齐、衬线正文与加粗小节标题、少量段间空隙、底部细规则线和对齐的页码。页面没有卡片容器、投影或装饰色块；层级通过字体、间隔、位置建立。

这张图片仅作排版研究，未放入成片、贴图、封面或公开交付资源。其许可未独立核实，不将它记作 CC0，也不复用其中的文字或版面作为影片资产。

## 转化为影片的具体决定

- 采用约 7% 的纸内边距，统一左侧对齐；此比例是本片设计选择，不是照搬参考图的数值。
- 中文纸面采用 Noto Serif SC，辅助说明与画外字幕采用 Noto Sans SC；十六进制字节采用等宽字体。
- 影片观看距离不同于书页：保留主问题、必要字节和认证标记，舍去参考图那样的小字号正文。1200px 纹理中的核心文字约 78–101px，认证标记 88px。
- 用一条细线与克制的深青色墨色分层，避免有圆角和大阴影的 UI 卡片感。
- 所有文字由本地 Canvas 绘制；没有把参考图当作底图，也没有用图片生成模型生成可读文字。

## 实际实现

`src/Paper.ts`：

- 固定种子的纸纹与暖白纸色；不使用实时随机数。
- 36×24 分段纸面，宽幅轻弯加局部角卷，厚度为场景单位 0.006；没有圆角厚板。
- `PaperStock` 为双面粗糙纸背，投影开启但不接收阴影。
- `PrintedFace` 改为 MeshStandardMaterial，roughness 1、metalness 0、envMapIntensity 0.3，使卷曲法线能在光照下读出来；不开清漆，不接收/投射阴影，避免 VSM 将印刷面变成矩形投影。
- 保持 `children[1].material.map` 为动态印刷接口；未添加依赖旧纹理的 emissiveMap。
- 薄边单独建模，接斜光但不投影。

`src/Design.ts`：

- 订单、密文、拒收纸页使用上述纸面系统。
- 文字平面同时关闭 castShadow 与 receiveShadow。
- 芯片主体为深青或共享棕陶瓷感，roughness 0.45；引脚与中心焊盘 metalness 0.75、roughness 0.28。仅调整物理材质，没有增加伪造小字、无意义凹槽或细密装饰。

`src/Mixing.ts`：

- 瓶签为印刷平面，关闭双阴影标志。
- 碟子改为薄型 LatheGeometry，保留浅凹与边缘厚度。
- 杯、碟、私色瓶随结果揭示退场，不再缩成残余小点；共享密钥保持原处作为视觉接力对象。

## 检查与限制

- 本轮 `npm run check` 已通过。
- 实际查看 `work/review-v4-paper/frame-01130.jpg` 与 `frame-06250.jpg`：衬线排版和薄边比旧版清楚，纸面不再有厚塑料壳；当时的 MeshBasic 印刷面明暗过于均匀，因此随后改为上述 Standard 材质。
- 新的 Standard 材质需要主流程继续检验墨色对比与过曝；不把材质代码检查当作最终视觉验收。

### 发现并交由主流程修复的退场问题

根据 `Camera.ts` 的时间感知 Hermite 轨迹、`word-events.json` 的“两端”定位及透视投影，检查 s22 退场段。此计算是保守包围框核查，不冒充渲染检查。

旧路径：公开瓶从 z=-4 后移 28，样品盘从 z=3.8 后移 28。退场窗口约 181.36–186.16 秒。

- 183.76 秒，公开瓶投影约 x916–967、y89–182；样品盘约 x844–1052、y175–331。
- 标题区约 y116–264，因此它们会穿过标题。
- 186.16 秒，公开瓶和样品盘仍残留画面顶部，并未完全离开视野。
- 完整计算记录：`work/paper-reference/mixing-retire-projection.json`。

已通知主流程。主流程确认实际 frame-05590 / frame-05700 中也看到同样问题，并决定改为公开瓶 x=34×retire、样品盘 x=-34×retire，保持各自原 z 值。此改动由主流程执行；本记录作者未越界改动已冻结主体。修复后还需抽查整段，确认侧向越出画框后才隐藏，且不掠过旁边的共享芯片或字幕。
