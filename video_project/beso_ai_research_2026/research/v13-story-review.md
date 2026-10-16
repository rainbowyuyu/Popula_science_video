# AI Engineer v13 故事与主张核验

AI Engineer把需求、工具调用和计算反馈放进同一项工程任务，减少重复衔接软件，让工程师保留设计判断和复查依据。

保留当前16句 rainbow鱼个人 TTS。当前开场已明确重复衔接软件的问题；本轮的关键是把这句话变成观众看得见的具体操作。无需整段重录，也没有发现必须重录才能避免事实错误的句子。

## 可直接采用的105秒动作结构

| 秒 | 屏显 | 一个可见动作 | 产品价值 |
|---|---|---|---|
|0–11|让设计往前走 / 少些重复操作|一座真实比例风机，镜头接近塔底；工程目标“少用钢”变成同一张需求输入面的内容。|开场先说工程师为什么想用：改模型后软件不必逐个重新衔接。|
|11–23|改需求 / 更新同一份清单|真实输入框中仅改两个数；45→55m和300→280t/MW从原字段原位变化。|需求变化留在同一checklist版本链。|
|23–40|文件接力 / 工具继续|相同文件锚点交给几何/网格/BESO；真实保存迭代只作为一段独立证据。|减少重复导出、转换和配置。|
|40–53|响应回读 / 约束复查|从平台纵荡沿真实fairlead到缆绳；一个响应点与数字同步，只一次切换关注物理量。|结果能回到方案的限制条件。|
|53–65|计算卡住 / 下一步有依据|日志同一行残差标明问题；迭代100→300；任务停在等待复查。|失败不丢失，修改有依据。|
|65–79|你来判断 / 后续重新生成|镜头聚焦可编辑梁的局部；人工介入；旧网格/旧载荷变为失效状态，新文件沿同一路线继续。|控制权与后续版本一致性。|
|79–95|模型与依据 / 一起带走|真实交付目录保留四类文件；随后独立论文案例的278→255.5t/MW逐字、原位呈现。|别人能复查，不只带走渲染图。|
|95–105|AI Engineer|报告中的模型轮廓与完整平台match cut，完整风机至少保留到103.5秒，最后才离镜。|把时间用在设计判断上。|

## 对网页表现的具体要求

- 11–23秒：真实需求输入和同一清单的字段更新是主体；只改45→55m、300→280t/MW两个已验证字段，避免把所有参数同时变色。
- 23–40秒：沿同一文件路径看几何、网格、BESO接力；工具名不是卖点，手动衔接减少才是。保持“工具流程示意”“独立BESO回放”属性。
- 53–65秒：先读未收敛的真实日志，再显示100→300，最后停在“等待复查”。不做失败一秒后全绿。
- 65–79秒：先人工介入，再旧网格/旧载荷失效，再继续。真实保存查看器可以回放，示意动画不写成现场完成修改。
-79–95秒：真实文件组先展示，独立论文数据后展示；两者不能同时塞进多个浮窗。

## 逐句核验

| 原旁白片段 | 结论 | 边界 |
|---|---|---|
|让这台海上风机，少用一点钢。|engineering_context|Contextual design goal; no new calculated saving claimed.|
|真正费时间的，是改完模型，还得把每个软件重新接一遍。|benefit_framing|Specific repetitive workflow pain; qualitative benefit, no measured time saving.|
|AI Engineer，把这串操作接成一个任务。|source_supported_capability|Tool registry/event trace connects operations. The recorded capture is not a completed new full pipeline.|
|你改一句需求，功率、用钢量和水深，就写回同一份设计清单。|source_plus_actual_ui|Same checklist ID edit with explicit numerics; local rule parser in saved capture, not a new cloud reasoning call.|
|清单往下走：建立几何，划分网格，调用贝索优化。|source_supported_capability|Registered CAD/mesh/BESO functions and bounded pipeline dispatch. Use workflow illustration plus separately identified saved BESO.|
|每个工具接着上一环的文件工作，省下手动导出、转格式，和反复配置输入。|source_supported_qualitative_benefit|File handoff/tool trace supports avoiding repeated export/configuration. No quantified speedup.|
|减下来的钢，还要经得起风浪。Zwind 检查平台运动，和系泊缆绳张力。|source_plus_saved_response|Zwind adapter/checks and saved native six-DOF/tensions support this. Visual wave not a computed CFD field; this is not the BESO specimen in a newly coupled solve.|
|AI Engineer，把响应带回约束，检查方案能不能继续。|source_supported_workflow|Readback/check gates are implemented; do not show all checks passed or declare the saved independent BESO+Zwind pair accepted.|
|计算卡住，日志里有下一步的线索。|source_plus_saved_log|Recorded residual plateau establishes a diagnosable log clue.|
|系统读出未收敛的原因，调整迭代上限，安排下一轮，并留下修改记录。|source_plus_saved_replan|Failure classified from logs; max_iterations100→300 persists. Outcome awaiting_post_check, not recovered success. Retained mass0.15→0.25 also changed in saved record.|
|需要你判断的地方，可以停下来。比如网格生成前，亲手改梁的截面。|source_supported_capability|before_mesh HITL gate; editable/replaced CAD. Current saved viewer clip is not live geometry modification; label saved view / flow illustration as appropriate.|
|交回任务后，旧网格和旧载荷失效，后续按新模型继续。|source_supported_capability|step_replace_geometry invalidates downstream mesh/load artifacts. Do not imply this entire update was performed in captured UI.|
|最后交付模型、计算输入、日志和报告，每个结果都能回头查。|source_plus_artifacts|Job manifests, logs, input/artifact recovery and exports exist. Generic report not certified construction documentation.|
|论文案例的单位功率用钢量减少约百分之八点一，强度和运动响应也要一起检查。|manuscript_case|278→255.5t/MW =8.093525%≈8.1%; separately attribute to manuscript, not current native replay. Strength/motion are checks not guarantee.|
|把重复操作交给工具，把时间用在设计判断上。|qualitative_product_positioning|Reasonable benefit grounded in tool handoff and human gates; no measured saving asserted.|
|AI Engineer。从你的工程目标，开始下一项任务。|call_to_action|CTA, no new factual performance claim.|

## Google 实际参考与采用范围

- https://gemini.google/overview/gemini-in-chrome/
  - 实查：White hero, large two-line title, single blue product accent, pale-blue rounded demo stage. One actual30.6s browser demo visible and playing; sampled ~1.63s logo state and ~27.17s sleeping-bag prompt/side panel state. Not a complete timeline review or audio review.
  - 本片可采用：Benefit first, specific one-step prompt/action/outcome, browser context retained, one input field magnified; human control after usefulness.
- https://gemini.google/overview/video-generation/
  - 实查：Speak it. See it. Share it. Large headline and one action CTA. Video items initially reported unavailable; not reviewed as played footage.
  - 本片可采用：Short concrete verbs and visible examples, not technical noun pile-ups.

参考页面的视频只做了实际播放状态和几帧视觉抽查，并未声称全片逐秒看完。参考其层级和动作表达，保留 AI Engineer 自己的颜色、ZJU标识与真实操作。

## 不改变的科学与数据边界

- 论文案例278→255.5t/MW，约−8.1%，明确为稿件案例；本轮保存BESO/Zwind是独立证据。
-保存Zwind响应与视觉波面分开；不宣称本轮重新完成全耦合求解或流场仿真。
- 失败重规划尚在awaiting_post_check；仅支持安排下一轮和留痕。
- 当前需求演示为本地规则解析，不能说此操作调用云端Qwen。
- Qwen的首尾帧桥接只改空间/材质/运镜表达；网页文字、参数、数值、日志以及力学曲线仍由原生层绘制。

详细路径、行号、代码摘录及SHA-256见同目录v13-story-review.json。

## 外部 Opus5.5受控审阅

一次native调用完整返回，105.277秒，服务报告requested/returned均为claude-opus-5-5，stopReason=end_turn。模型名是服务报告，未独立证明底层权重。记录位于work/opus-runs/v13-product-story-20261012-161533-9565347c。

采用其“单主角、可见摩擦、互斥状态”方向；不采用其要求重新录制的四条文字，因为部分过长、将调用改为登记不更准确、对图强号案例的表述会弱化独立论文比较归属。Codex保留现有16句，事实边界由原生屏显和制作记录继续保证。详细采纳/拒绝条目见v13-opus-story-review.json。
