# v17 产品网页、传播参考与渲染接口

## 真实网页

项目 `D:/python_project/beso_ai`。本轮已实际启动并 HTTP 200 验证：`http://127.0.0.1:8017/ui/`。

```powershell
$env:RUNS_CLEANUP_ENABLED='false'
$env:PYTHONPATH='D:\python_project\beso_ai'
& 'D:/python_project/beso_ai/.venv/Scripts/python.exe' -m uvicorn backend.app:app --app-dir 'D:/python_project/beso_ai' --host 127.0.0.1 --port 8017
```

该环境仅本次进程，关闭启动后的自动历史清理。未修改软件功能、账号、求解参数或全局环境。服务器进程 24772 / tool session 41851。主任务浏览器能访问该页；子代理 CUA 返回空 browser 库存，所以子代理没有截图、录制或假装运行交互。主任务负责新 CUA 采集。

实际入口可读：主页工程需求输入、`landingEnterDesignDomainBtn` 设计域、`landingEnterRestructionBtn` 尺寸时域分析、`resultsViewerBtn` 结果查看器。独立页面 `/ui/validation.html` 为 AI Review，`/ui/cad_design_studio.html` 为 CAD。设计域 `ddIdePlanBuildBtn` 会执行构建任务，不用它伪造截图操作。

最有意义的三个真实状态：完整自然语言需求及工具选择；设计域模型和右侧执行计划；同一运行册中的结果/验证证据。仅界面导航、输入未发送文本和历史结果查看不需要新求解。若没有真实发送和求解，片中不要将它说成“刚完成了计算”。

## 产品贡献的来源

`README-ch.md` 与当前 `frontend_static/index.html` 支持：需求 → 结构化设计清单 → 几何/网格 → BESO/CalculiX → 尺寸/PSO → Zwind → 图纸/报告 → Automated Reviewer。失败日志和指标可反馈重规划；人工可在网格前修改几何并写回会话；运行册保存真实适配器、AI Review 与人工决策。

讲清三件事即可：把要求变成可执行任务；把已有工程工具接在同一条工作流；让每一轮有结果、日志、检查和下一步。避免用制作工具（Blender、Three.js、WaterPro）冒充 AI Engineer 产品能力。

真实保存的参数演示 `public/beso-research/web-live/v7/visual-data.json`：20 MW，钢耗目标 300→280 t/MW，水深 45→55 m，持久化回读。记录明确为规则解析，不能说该次已调用大模型。

真实重规划 `public/beso-research/web-live/v7/replan-visual.json`：非收敛残差日志 → max_iterations 100→300、mass_goal_ratio 0.15→0.25；状态 `awaiting_post_check`。可说明“生成下一轮调整，等待复查”，不能说明“已经成功恢复”。

## 已有真实 UI 资产

- `public/beso-research/web-live/v12/demand-input.png`：需求输入与真实工具按钮；1080p 可放大局部。
- `public/beso-research/web-live/v12/checklist-main.png`：需求修改后清单。不要将截图中的规则解析提示盖掉后称 LLM 已执行。
- `public/beso-research/web-live/v12/execution-plan.png`：真实五步执行计划。
- `public/beso-research/web-live/v12/geometry-model.png`：原设计域单构件局部；不是本次新造型浮体，不可无缝冒充同一几何。
- `public/screens/evolution-2.png`：真实历史 BESO 查看器及曲线；保留“历史结果”语义。
- `public/screens/review.png`：AI Review 入口；只显示入口，不代表当前新模型通过验证。

来源：`public/beso-research/web-live/capture-evidence.json`、`v12/crop-source.json`；本轮联系图 `real-ui-contact.jpg`。

## 官方产品参考

2026-10-14 只读取得 Linear `https://linear.app/`、Google Vids `https://workspace.google.com/products/vids/` 官方 HTML，哈希及状态见 `sources.json`。Autodesk Fusion 返回 403，未绕过。随后主任务通过 CUA 实际查看了两者官方首屏截图：Linear 使用大留白、大字与单任务焦点；Google Vids 突出一个主 UI，再展示局部操作。`linear-viewed.png` 保存于本目录。子代理本人没有浏览器视觉/动作检查；这里明确区分主任务视觉观察与本代理 HTML 内容研究，不声称已观看页面完整动画。

Linear 首屏把定位与一条具体 agent 任务、状态变化、等待 review 放在一起；后续按 Intake → Planning → AI/automation → Build/review/ship 组织。可借鉴：一段只聚焦一个用户动作和一个结果，用同一需求标记串联；正文不要散落多个等权小标签。

Google Vids 从“工作中的故事”落到具体创建/生成/协作流程，每段用简短收益句配一个可理解动作。可借鉴：需求句收束成参数、参数推动几何、失败日志定位到一个参数变更，最后文件/报告接回同一平台；先看清再运动，不叠加多个并行信息焦点。

v17 推荐以真实物体/空间为主：开场海面和完整浮体；一束追踪线引导到需求输入；转入桌面工作区时 UI 保持同一视角和中心；需求 → 任务 → 证据逐步展开。单个大字短句保持读得清，真实网页截取只在需要证据时出现。

主任务实际首屏观察应用到这次影片：每个段落只保留一个主 UI 或一个模型，单句大字留在负空间；网页不是多窗口拼贴，而是先显示 composer，再沿同一方向推动到执行计划；局部手势/按钮最多一个焦点，避免所有标签同时出现。本轮不使用 Qwen 片段，真实网页内容只做精确裁切，不重绘文字或数据。

本轮 CUA 原始截图在 `public/beso-research/web-live/v17/`。`demand-composer-crop.png` 是完整 composer 的无损裁切；`plan-start.png` 来自主任务补拍的 `execution-plan-top.png`，保留真实页头、步骤1—3及步骤4开头，保持原生滚动裁断；介绍使用计划开始部分，不拼接或伪造全四步截图。`execution-plan-visible-crop.png` 保留先前可见步骤3/4，仅为证据备存。原图 SHA、裁切区域与输出 SHA 在同目录 `crop-source.json`。主任务 Google 首屏截图也已保存为 `google-vids-viewed.png`，两张官方首屏均在 `sources.json` 绑定 SHA。

## v17 渲染与 QA

入口 `scripts/render_launch_v17.mjs`，合成 ID `AIEngineerLaunchFilmV17`，105 秒、6300 帧、1920×1080、60fps。独立 WebGPU Chromium `work/browser-webgpu/chrome-headless-shell.exe`。

```powershell
node scripts/render_launch_v17.mjs --check-inputs
node scripts/render_launch_v17.mjs --stills --frames=0,180,630,1500,2700,3600,4800,6000
node scripts/render_launch_v17.mjs --clip=1440-1679 --no-mux
node scripts/render_launch_v17.mjs --chunk=900 --segments=0,1 --no-mux
node scripts/render_launch_v17.mjs --chunk=900 --concurrency=2
python -X utf8 scripts/verify_launch_v17.py
python -X utf8 scripts/review_launch_v17_final.py
```

自动依赖扫描从 v17 index 沿相对 imports 递归，包含 type-only 依赖及直接 import 的 public JSON。`staticFile('...')` 自动加入精确素材清单。动态 fetch 或 script 注入的文件须在 `research/launch-v17-runtime.json` 列入具体路径；不允许整个目录。相机/世界是运行时编译模块，所以此清单还显式列入 `LaunchWorldV17Runtime.ts` 及递归来源。

源文件先快照到本 revision 的 source 目录，再从快照打包；public 素材单独冻结并校验 SHA。旧 src 不参与哈希。正式、静帧、短片 manifest 分开；分段文件以起止帧命名并校验 SHA，可续渲染，不会因 chunk 变化复用错误片段。源或音频变化产生新 revision。

`verify_launch_v17.py` 只检验技术：完整解码、6300帧、音画时长、最终 AAC 响度/真峰、黑帧、静音、字幕时间与文本。`review_launch_v17_final.py` 从本次真实 story 抽取场景与边界前中后帧，不复用旧片采样点。均不声称人工看完全片或听审。
