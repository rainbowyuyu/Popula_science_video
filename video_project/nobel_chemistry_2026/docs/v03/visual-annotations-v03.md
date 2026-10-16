# V03 动态标注层

`src/chemistry2026v03/InfoAnnotationsV03.ts` 是叠加在机制绘制之后的帧驱动标注层。它只在对应讲解窗口短暂出现，用一条细引线、一个呼吸锚点和一个半透明标签说明当前对象，避免字幕卡片覆盖主体。

覆盖的关键概念：

- 催化剂：过渡态、较低能垒、配体环境、催化剂回到原位。
- Kagan 配体组合：R 配体池、R–R、R–S 近乎失活、S–S，以及组合筛选关系。
- 非线性效应：16 种等可能组合、RS 通路关闭、9 R + 1 S 活性池、`ee` 与非线性曲线。
- Soai：平面羰基碳、四面体手性中心、锌醇盐中间体、水解后得到醇、催化剂继续工作。
- 自催化与实验结果：新产物、加入下一轮、优势逐轮积累、独立补料、三轮和 `ee > 99.5%`。

标注层使用 `progress` 的平滑窗口和固定坐标，不使用随机数或实时重挂载；其绘制区域限定在 `y=332..884`，避开顶部来源、底部字幕和固定标题。Soai 的“水解后得到醇”位于 `y=748`，不会压住下方的四面体说明。

代表样帧：

- `delivery/chemistry2026_v03/targeted/frame-4300.jpg`：Kagan 组合与 `R–R / R–S / S–S`。
- `delivery/chemistry2026_v03/targeted/frame-5740.jpg`：锌醇盐、OH 和水解标注。
- `delivery/chemistry2026_v03/targeted/frame-6140.jpg`：自催化产物回流。
- `delivery/chemistry2026_v03/targeted/frame-7180.jpg`：独立补料与第 1 轮标注。

抽样命令：

```powershell
node scripts/render_chemistry2026_v03.mjs --sample-frames=3450,3620,3730,4010,4300,4680,4920,5380,5740,6140,6620,7180
```
