# AI Engineer v13 · 网页动作镜头设计

访问与核验日期：2026-10-12（Asia/Shanghai）。本次仅修改影片中的独立组件，未修改 `D:/python_project/beso_ai` 的产品源码。

## 借鉴来源与观察边界

- Google 官方 [Gemini Deep Research](https://gemini.google/overview/deep-research/)：通过浏览器实际读取页面并查看主视觉与计划界面画面。页面把能力组织为 Planning → Searching → Reasoning → Reporting，以用户目标、计划编辑、Start research 和报告衔接能力。观察到浅底、高对比大标题、单个计划操作、宽工作面与充足的间距。页面中部分媒体报告无法播放，因此**未完成其完整产品视频的实时观看**，不把静帧观察写成完整视频研究。
- Google 官方 [Gemini overview](https://gemini.google/overview/)：实际阅读有关提示词、生产力、用户反馈和输出限制的说明。借鉴“先展示用户能完成什么”的信息顺序，不把 Gemini 产品能力移植为 AI Engineer 的已验证能力，也不复制 Google 标志、产品界面或视频素材。

落到本片的设计原则：一个动作说明一项收益；需求输入后看参数写回，文件沿上一环流向下一环，失败记录变成下一轮输入，报告与输入/日志同处一条任务。浅白蓝承担选择状态，深蓝灰承担正文。用同一工作面内的平移接力，不轮播许多悬浮卡片。

## 已核验的真实产品材料

1. `D:/python_project/beso_ai/README-ch.md`：需求 → 设计清单 → 几何/网格 → BESO/CalculiX → Zwind → 图纸/报告与评审；其中九步文件列表是说明示意，不把这些名称当成本轮已生成交付物。
2. `D:/python_project/beso_ai/frontend_static/index.html`：真实页面提供 INP/IGES/STEP、工程工作台、暂停、执行计划、几何与预览，以及尺寸时域分析入口。页面明确“重启运行”从保存请求重新执行，**不是 solver checkpoint resume**。
3. `frontend_static/flow_main.designDomainIde.js`：实际 STEP、OBJ 与 INP 查看分支及文件会话提示。
4. `public/beso-research/web-live/v7/visual-data.json` 与 `capture-manifest.json`：真实本地 API 记录，20 MW，钢耗目标 300 → 280 t/MW，水深 45 → 55 m；解析器为 `rule_fallback`，云模型调用和求解器启动均为零。
5. `public/beso-research/web-live/v7/replan-visual.json`：保存的静力求解失败记录，残差 `1.2e−3`，迭代上限 100 → 300，记录状态 `awaiting_post_check`。不表示本轮求解，也不表示成功恢复。
6. `public/beso-research/web-live/v12/crop-source.json`：真实截图的裁剪来源、像素尺寸与 SHA-256。默认查看器素材包含微型尺寸标签，影片中的主动作文字由组件大字重排；不声称原始标签可在手机屏幕中清晰阅读。建议使用真实查看器关闭尺寸标签后的新采集像素作为 `geometry` override。

## 组件约定

实现：`src/beso/ProductWebV13.tsx`。纯帧驱动，不请求网络、不运行求解器、不使用时间随机数。全画幅 1920×1080，工作面 `left=88, top=354, width=1080, height=550`，为右侧原生世界与主片标题/字幕留空间。浙江大学 Logo、字幕、音乐和原生模型由主片控制。

```tsx
<ProductWebV13
  frame={globalFrame}
  fps={60}
  section="auto"
  mode="film"
  assetOverrides={{geometry: 'beso-research/web-live/v13/clean-viewer.png'}}
/>
```

- `section`：`demand | handoff | feedback | review | delivery | auto`。
- `frame`：全片帧；`localSeconds` 可显式覆写局部时间，供主片调整桥接窗口。
- `mode=film`：有离屏入场/离场与光标；`mode=plain`：固定工作面与状态，隐藏光标，供首尾帧素材；`mode=withoutBrand`：同 film，本组件本身不绘 Logo/字幕，保留接口方便主片使用。
- `assetOverrides.demand/geometry/report`：静态目录相对路径；仅替换实际保存像素，不生成新产品按钮或数值。
- 无 override 时，需求和文件工作流采用真实材料的内容重排并在屏显说明；查看器使用原始保存像素。

推荐窗口（秒 / 60fps 帧）：

| 镜头 | 秒 | 帧范围 | 一个操作焦点 |
| --- | --- | --- | --- |
| demand | 11–23 | 660–1379 | 编辑需求 → 同一份参数写回 |
| handoff | 23–31.5 | 1380–1889 | STEP → INP → VTK 文件接力 |
| feedback | 53–65 | 3180–3899 | 日志原因 → 改迭代上限 → 等待复查 |
| review | 65–79 | 3900–4739 | 查看几何 → 截面修改示意 → 旧网格/载荷失效 |
| delivery | 79–85.65 | 4740–5138 | 从模型、输入、日志选择报告 |

“STEP → INP → VTK”是项目 README 与文件查看分支支持的**工作流示意**。残差曲线只展示“停滞”形态，屏显“曲线形态示意”；不是求解采样曲线。梁截面变化同样是几何修改流程示意，不赋予虚构尺寸或新计算值。稿件的 8.1% 指标继续由主片保留独立案例来源，不放入网页交付镜头冒充同一次回放。

## Qwen 首尾帧

导出 `PRODUCT_WEB_V13_ENDPOINTS` 与 `ProductWebEndpointV13`；10 个清晰端点可复用为需求、几何文件、网格、BESO、日志、重规划、人工查看器、截面示意和交付物的首尾帧。

```tsx
<ProductWebEndpointV13 section="demand" localSeconds={2.5}/>
```

生成工具只处理空间、工作面和镜头的桥接。最终数字、中文与真实网页像素由主片后合成，不能让视频生成工具生成残差、响应、单位、成功状态或不可核验的在线操作。首尾 UI 图无字幕、Logo、原生模型；主片可把此层叠到对应世界帧再生成。

## 本地验证

- `npm run typecheck`：通过。
- 独立端点验证入口：`work/v13-product-motion/index.tsx`。
- 独立渲染：`node work/v13-product-motion/render.mjs`。
- 端点输出：`research/qa/v13-product-motion/`，包含 12 个局部状态；全片集成后仍须由主片检查模型遮挡、桥接速度和字幕安全区。
