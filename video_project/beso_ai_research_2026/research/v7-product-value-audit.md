# AI Engineer v7 产品价值与证据审计

审计日期：2026-10-11。只读检查 `D:/python_project/beso_ai` 产品代码、保存算例与投稿文件；本轮未启动工程求解、未调用云语言模型。功能 API 操作使用原生产路由和原工具函数，写入视频工程的独立工作区。机器可读证据见 `v7-product-evidence.json`。

发布片最有说服力的重点是：**需求修改能写回参数，工具能接着执行，人能介入模型，结果能追溯到文件。** 将这些具体动作拍出来，比反复展示任务图或口号更能体现 AI Engineer 的贡献。

## 五个可用卖点

| 工程师得到什么 | 能力证据 | 本片应展示的动作 | 措辞边界 |
|---|---|---|---|
| 需求修改直接进入同一份设计清单 | `backend/routes/design_requirements_api.py:81`；`backend/design_requirements/clarifications.py:186`；`backend/pipeline/steps.py:51` | 20 MW 工程需求解析；钢耗目标从 300 改为 280 t/MW；水深从 45 改为 55 m；读取同一 checklist ID 的结果 | 本轮真实解析是 `rule_fallback`，不能称本轮 Qwen 理解成功。产品有 Qwen 解析路径，见 `nl_parser.py:43` |
| 需求、几何、网格和 BESO 共用任务上下文 | `backend/agents/assistant_graph.py:136`；`backend/agents/tools.py:68`；`backend/pipeline/steps.py:461` | 由输入、载荷、网格到保存迭代，路径/数据包跟随同一任务；以真实状态 0→10→26→43 展示材料变化 | `start_beso_job` 在 Preview 下拒绝启动；有输入文件不等于已完成。不要把动画当计算结果 |
| 网格前允许人检查和改模型，随后继续 | `backend/pipeline/steps.py:252`、`:315`、`:421`；`backend/oc4_design_domain_service.py:126` | 暂停；看参数化模型；提交改过的几何；显示旧网格和载荷失效，新任务等待继续 | 本轮没有实际重跑此链路，可以作为已实现能力说明，不说本片现场算完 |
| 日志能进入下一步的失败反馈 | `backend/replan/engine.py:13`、`:59`；`backend/replan/executor.py:32`；`backend/orchestrator/gates.py:16` | 真实失败日志→有记录的参数调整→下一轮任务状态；保留未恢复提示 | 真实事件存在，但所抽查重试仍 `awaiting_post_check`，且新任务再次失败。不能宣称自动修复成功；`simulate_cases.py` 的 case1/2/3 success 是教学 fixture |
| 保存结果、输入和输出能被复查/交付 | `backend/jobs/manager.py:262`；`backend/tools/inp_design_deliverables.py:122`；`backend/tools/cad_drawing_pack.py:1335` | 真实结果查看器导入保存参数；切换同编号 state1/VTK/日志；打开已有四件套与图纸 | 实存四件套是 Plane_mesh INP 示例，实存图纸是 mounting plate 示例。不可当浮式平台已通过审图的施工文件 |

## 真实保存证据

- BESO 静力算例：`runs/beso9_centered_seed_campaign_v4/mw_20/seed_17/` 与 `seed_89/`。两者都有 `review.json`、`evidence_manifest.json`、最后已求解的 `beso_run/file043_state1.inp`、`file043.vtk`、`parameters_summary.json`。共 44 个保存状态（0–43），目标保留体积比为 0.25。数值审核状态 passed，不等于认证。
- seed_17 与既有视频素材关系更直接：`public/beso-research/geometry/manifest.json` 和既有网页录制选用此种子。最后保留比为 0.249989600959；seed_89 为 0.249994689673。两个种子的荷载不同，箭头与数值不能混用。
- v4 `README.md` 明确写：六个案例均通过该研究设定下的静力 FE/拓扑数值门；**这些 v4 solids 尚未送入 ZWIND 或外部 LLM review**。其中 1000 MPa 许用应力属于继承研究假设；不作为认证材料强度。
- 重规划真实事件：`runs/_replan/a8fae827515c40b38fbfc7cfe92dc8de/replan_event.json`、`runs/_replan/1287428badb845fc947dc3f1097874d9/replan_event.json`。执行器为实际 BESO 启动，记录了实际应用字段与 deferred 字段；`rho_after=1`。后者的新任务 `runs/408a7edf5714438c9a6bb82990646d54/failure.json` 明确为 failed。
- 交付四件套：`runs/_deliverables/fde4c2ef05c947fe840f2e6b68824270/` 的 manifest、PNG、nodes CSV、elements CSV、STL 确实存在。其源为 `beso/wiki_files/example_1/Plane_mesh.inp`。
- 图纸：`runs/_cad_drawings/fe9f44ba53a2406fac25b169347f5cfe/` 中 PNG、PDF、四视角 SVG 确实存在。源为 `third_party/text-to-cad/STEP/demo_mounting_plate.step`；manifest 自身标为工程图预览，非船级社审图出图。
- 稿件 8.1%：`rules/ai_vs_tuqiang_comparison.yaml:25` 给 AI 钢量 5110 t、图强号 5560 t，容量均 20 MW；255.5 对 278 t/MW，差值 8.0935%。应屏显“论文案例”，不能将其归于本轮真实 API 操作或 v4 静力算例。
- 保存 Z-wind：视频 `public/beso-research/physics/zwind-response.json` 与 `paper-metrics.json` 可作为保存响应回放。波面/尾流是视觉演示；不宣称本轮完成新的全耦合求解。

## 本轮真实 API 操作

`public/beso-research/web-live/v7/capture-manifest.json` 保存源码 SHA-256、请求、HTTP 状态、耗时和产物 SHA-256。原生产 `design_requirements_api.router` 经 FastAPI ASGI TestClient 执行，未改实现。

1. POST `/api/design-requirements/parse`：明确输入 20 MW、300 t/MW、45 m 等约束；返回 `parser=rule_fallback`。
2. POST 同一清单的 `/clarify`，`mode=edit`：写入 280 t/MW 和 55 m。
3. GET 同一清单：确认参数已持久化，容量仍 20 MW。
4. 调用原生产 `step_apply_turbine_preset(preset_id='20', checklist_id=...)`。
5. GET 复查预设写回。**预设会重新写入默认钢耗 300 t/MW；不要把应用预设后的状态继续标成 280。**

产物 `visual-data.json` 可用于简洁的真实数据可视化，不能伪装成浏览器录屏。所有 API 写入 `work/v7-product-api-workspace`，原产品源码与旧 runs 保持不改。

## 新网页录制情况

`cua.createBrowserTab('iab')` 返回 Browser is not available；`cua.getState()` 返回 `apps=[] / browsers=[]`。本轮未创建新网页视频。可继续用 `interaction-focused-v5.mp4`：它确实导入 seed_17 的保存 `parameters_summary.json`、适配模型、旋转视角；`focused-record-manifest-v5.json` 记录动作与来源。旧 `brief-focused-v5.mp4` 只输入草稿、未提交，不能用它证明需求已解析。

网页在发布片里应保留一次明确动作和结果：输入目标→参数变更，或导入结果→旋转查看→打开来源。短促地扫过主页、很多小按钮、静止卡片，无法体现产品贡献。

## 对 105 秒 v7 草稿的审计

`work/v7-script-draft.json` 的主线可用，以下是需要制作画面配合的细节：

- 0–10 秒：改尺寸带来的重复配置是工程痛点。“时间常常花在这些反复操作里”是定性描述，不配虚构节省小时数。
- 10–23 秒：设计清单与本轮 API 动作相符。本轮规则解析应在证据说明中保留；不要把实际数据面板称云模型作答。
- 23–40 秒：“省下反复导出、转格式和重新配置”只能作为工作流收益，不写量化提速。尺寸优化确有工具接口，但与 seed_17 静力 BESO 是不同步骤/示例。
- 40–55 秒：“Z-wind 检查”属于产品能力/保存响应。需要就近标“保存响应”；BESO 结果与响应片段不能暗示同次 v4 验证成功。
- 55–69 秒：可展示真实失败和参数变化，保留后续等待/失败状态，避免由错误日志直接变绿勾。
- 69–82 秒：网格前人改模型、下游失效逻辑可支撑。过期产物应沿镜头方向离场，而不是用绿色成功状态遮过去。
- 82–96 秒：论文案例单位功率用钢量减少约 8.1% 有稿件 YAML 支撑。结果与输入/日志可复查，工程图仍是预览，避免说成“已认证交付”。
- 96–105 秒：CTA“带着你的设计目标，让工程任务真正跑起来”与产品定位相符，不需要重复保密、认证、工具品牌列表。

## 一段更具体的自然叙述建议

“改一个尺寸，几何、网格、强度、风浪响应，都要跟着调整。很多时候，工程师忙的正是这些反复配置。AI Engineer，把它们接到同一个任务里。说清容量、用钢目标和海况，系统先写成设计清单。需求变了，直接改这份清单。从几何和网格，到贝索优化，计算决定材料留在哪里；再检查平台运动和系泊张力。算不下去，就读取日志，把原因和改动记录下来，安排下一轮。你可以在网格前停下来，亲手改模型，再把它提交回任务。旧结果失效，新几何继续。论文案例里，单位功率用钢量减少约百分之八点一。每个结果，都要回到模型、输入和日志里复查。AI Engineer，把重复操作接起来，让工程师把精力放在设计判断上。”

该叙述是备选，不自行修改父任务的脚本；实际时长由重新合成的语音确定。
