# v20 最新文档证据核验

原始文件：`C:\Users\zju\Desktop\Closed-loop_AI_1009.docx`
SHA-256：`2d6c177f8f7a29c73b77074336131e75d3a7f96013b425fc42fd781ce4160c9d`

只读提取。以下 P/T 定位为 OOXML 正文段落/表格单元格编号，不是页码。删除修订已排除，插入修订保留；文中批注/编辑指令仅作为内容记录。

## 立即替换的数值

|指标|图强号基线|本研究选定方案|变化|原文定位|
|---|---:|---:|---:|---|
|单位功率基础用钢量|278 t/MW|247.9 t/MW|-10.8%|P0021|
|运行工况纵荡最大值|6.92 m|5.1 m|-26.3%|P0023|
|运行工况纵摇最大值|2.47 deg|3.29 deg|+33.2%|P0023|
|运行工况塔顶加速度最大值|0.82 m/s²|1.1 m/s²|+34.1%|P0023|
|极端工况纵荡最大值|12.38 m|11.2 m|-9.5%|P0024|
|极端工况纵摇最大值|8.02 deg|9.56 deg|+19.2%|P0024|
|极端工况塔顶加速度最大值|3.44 m/s²|3.67 m/s²|+6.7%|P0024|
|运行工况系泊张力最大值|2840 kN|2788 kN|-1.8%|P0025|
|运行工况塔底弯矩My最大值|565.6 MN m|570.0 MN m|+0.8%|P0025|
|极端工况含安全系数系泊张力最大值|14185 kN|14041 kN|-1.0%|P0026|
|极端工况塔底弯矩My最大值|1074 MN m|1117 MN m|+4.0%|P0026|
|钢量同比例估算单位投资成本|19800 CNY/kW|17656 CNY/kW|-10.8%|P0021|

**同容量派生量：** 278×20=5560 t；247.9×20=4958 t；约少用602 t。602是按文中已四舍五入的单位功率钢量折算，不是文中直接报告的过磅结果。

## 闭环及人工角色

需求→已注册工具操作→确定性计算→数值/诊断回到任务状态→有边界的修正→重执行与后验检查→内部筛选→选定方案Zwind最终验证。

网格缺陷调整离散化；结构求解不收敛调整数值设置；记录触发诊断、修改、执行任务及post-check。只有重运行成功并复检原故障条件才记为恢复；不放松原始荷载/材料/接受限值。

重复规格、无效补丁、重试预算耗尽终止自动修改；未解决恢复/未完成计算/物理限值不通过禁止推进。

Zwind只做选定候选的最终耦合验证，不参与本轮优化修改/排序。

可在网格前检查中间结果、调整约束优先级或冻结子域；最终工程责任由人承担。人工决定版本/取舍不应替代系统的自动诊断修正循环。

User-requested framing, not an exact UI workflow specified in the document. Verify product support separately.

## 原句及定位

### P0010

Recent advances in agentic AI have demonstrated remarkable success in automating scientific discovery, including research-paper generation, expert-level code development, therapeutic-candidate proposal and autonomous experimentation. Complex physical engineering design remains a distinct challenge because candidate solutions must satisfy coupled constraints across geometry, structural mechanics, hydrodynamics, aerodynamics, stability, fatigue and manufacturability. Here we introduce The AI Engineer, an agentic framework that closes the engineering design loop between language-model reasoning and deterministic physics-based computation. Natural-language requirements are translated into structured design specifications, from which the system orchestrates topology optimization using bi-directional evolutionary structural optimization (BESO) coupled to CalculiX, size optimization using sequential quadratic programming (SQP), and final time-domain verification with Zwind subjected to offshore aero-hydro-servo-elastic load cases. Rather than treating language-model outputs as engineering results, the framework uses the large language model (LLM) to propose and revise engineering actions, while deterministic backends execute those actions and return numerical evidence that conditions subsequent decisions. An internal Automated Reviewer screens computed candidates across five engineering dimensions against a reference fleet, providing a termination and candidate-selection mechanism rather than a substitute for external certification. We demonstrate the framework through the design of a 20 MW floating offshore wind turbine foundation. The selected AI-generated candidate reduced steel intensity from 278 to 247.9 t MW⁻¹, a 10.8% reduction relative to the human-optimized “TuQiang” baseline, while satisfying the evaluated engineering constraints. The resulting technical dossier was subsequently submitted to the China Classification Society (CCS) and passed formal Approval in Principle (AIP), providing independent concept-level appraisal of the selected design. These results demonstrate end-to-end agentic orchestration from natural-language requirements to an externally appraised concept-level engineering design, while maintaining a clear separation between language-model decisions, deterministic physical verification and independent regulatory review.

### P0015

Here we introduce The AI Engineer, an end-to-end agentic framework that closes the engineering design loop between language-model reasoning and deterministic physics-based computation (Figure 1b). Rather than using an LLM to directly generate an engineering design, the framework assigns distinct roles to the language model and engineering backends: the LLM acts as an orchestrator that interprets requirements, selects engineering actions and responds to computational feedback, whereas deterministic tools execute and evaluate those actions. In essence, the LLM decides which engineering operation to attempt next, while deterministic physics-based computation determines its outcome and provides the evidence for the next decision. Starting from natural-language requirements, The AI Engineer converts design intent into structured specifications and progressively develops a candidate through topology optimization (BESO–CalculiX)[15,16], size optimization (SQP)[17], and final time-domain verification with Zwind under coupled aero-hydro-servo-elastic load cases[18], and automated generation of engineering drawings and reports. Crucially, these stages do not form a one-way pipeline. During topology and size optimization, solver outputs, constraint violations and diagnostic messages are returned to an explicit task state. The orchestrator then determines whether the candidate should proceed, be revised, or trigger a configured recovery action. The revised candidate is subsequently re-executed by the relevant engineering backend, such that a language-model decision becomes an engineering action whose consequence is quantitatively evaluated by deterministic computation. This repeated cycle of proposal, execution, diagnosis, revision and verification constitutes the closed loop of The AI Engineer. Zwind subsequently checks the selected design under the prescribed coupled load cases and is not used to propose or rank iterative modifications.

### P0021

We benchmarked the AI-generated foundation against the human-designed “TuQiang” baseline[20], a 20 MW floating wind demonstration unit developed by a consortium of universities and industry partners. Figure 2a compares the two configurations. The selected AI-generated candidate reduced steel intensity from 278 t MW⁻¹ to 247.9 t MW⁻¹, corresponding to a 10.8% reduction. Applying the same steel-proportional update to the previously reported cost gives an estimated unit capital cost of CNY 17,656 kW⁻¹, compared with CNY 19,800 kW⁻¹ for “TuQiang”, also corresponding to a 10.8% reduction under this proportional-cost assumption. Its steel intensity remained below the national demonstration target of 300 t MW⁻¹[21]. The reported tower natural frequencies lay outside the turbine’s 1P and 3P excitation bands[22] (Figure 2b-I). 

### P0023

The motion responses show a trade-off between lower surge and higher pitch and tower-top acceleration, while tower-base bending moments remain close to those of the baseline. Under power production (DLC 1.1), the time-history maximum surge was 5.10 m for the AI design and 6.92 m for TuQiang, a reduction of 26.3%. The corresponding maxima of pitch and tower-top acceleration were 3.29° versus 2.47° and 1.10 versus 0.82 m s⁻², increases of 33.2% and 34.1%, respectively (Figure 2c). Both pitch maxima were below the plotted 5° reference. The operational tilt criteria retain separate limits of 5° for the time-history mean and 10° for the maximum. Tower-top accelerations remained below 2.94 m s⁻² (0.3g), consistent with the indicative serviceability criteria in DNVGL-RP-0286, Section 5.5.1[24].

### P0024

Under the extreme condition (DLC 6.1), the time-history maximum surge was 11.20 versus 12.38 m, a reduction of 9.5%, whereas pitch reached 9.56° versus 8.02° and tower-top acceleration reached 3.67 versus 3.44 m s⁻², increases of 19.2% and 6.7% (Figure 2d). Both designs remained below the project’s plotted pitch threshold of 10° and the tower-top acceleration limit of 5.89 m s⁻² (0.6g), the latter corresponding to the indicative non-operational acceleration criterion in DNVGL-RP-0286[24].

### P0025

Structural loads showed a similar balance between response measures. Under DLC 1.1, the time-history maximum mooring tension was 2,788 kN for the AI design and 2,840 kN for TuQiang, a reduction of 1.8%. The maximum tower-base bending moment My was 570.00 versus 565.60 MN m, an increase of 0.8% (Figure 2e).

### P0026

Under DLC 6.1, the time-history maximum mooring tensions, after multiplication by a safety factor, were 14,041 versus 14,185 kN, a reduction of 1.0%. Both factored values were below the plotted project limit of 20,165.9 kN. This comparison distinguishes factored loads from unfactored responses, as described in DNVGL-RP-0286, Section 5.6[24]. The maximum tower-base bending moment was 1,117 versus 1,074 MN m, an increase of 4.0% (Figure 2f). Thus, the reported material and cost savings accompany lower surge and mooring tension, higher pitch and tower-top acceleration, and tower-base bending moments close to those of TuQiang.

### P0059

The framework provides intervention points, including review before meshing, allowing domain experts to inspect intermediate outputs and apply high-level adjustments—such as revising constraint priorities or freezing selected design subdomains—without breaking the closed-loop validation workflow. This interface serves scenarios where engineering judgement or project-specific requirements need to complement the optimization-driven search, preserving the human role as a high-level director rather than a low-level operator.

### P0063

The AI Engineer was designed around a strict separation between decision, execution and evidence. A language-model output can propose an engineering operation or a revision to an existing candidate, but it is not itself treated as an engineering result. Only execution by the corresponding engineering backend establishes the numerical consequence of that action. Returned outputs, diagnostics and constraint evaluations are then incorporated into the persistent task state and used to condition the next decision. This sequence—proposal, execution, evaluation and state-conditioned replanning—defines the closed loop used throughout the framework. Tool-augmented scientific systems provide relevant precedents for connecting language-model planning to external execution[46,51].

### P0070

Tool responses update both the assistant history and the execution trace, whereas the master graph tracks the state of long-running engineering jobs. For example, a running BESO calculation can suspend graph progression until completion feedback is returned. A separate interruption point permits human inspection before meshing when required. Persistent task state therefore connects language-level decisions to long-running computations and preserves the numerical context required for subsequent operations. When a task identifier is supplied, the web assistant also records a task-scoped execution trace containing model settings, prompt and response hashes, tool summaries and artifact references.

### P0071

Solver or workflow failures do not directly trigger acceptance of an LLM-generated correction. Instead, returned diagnostics are first classified and mapped to configured recovery policies. In the reported optimization workflow, diagnostics distinguish mesh-quality defects from structural solver non-convergence. The agent combines this failure class with the active task state to select a registered recovery operation. For diagnostic class dt, the proposed configuration update can be represented as

### P0073

The superscript p emphasizes that θt+1p is only a proposed recovery. The patch, its rationale and the pending-recovery status are recorded in the task state, but the recovery is not considered successful until the modified operation is executed and new numerical evidence is returned. The replan executor dispatches the proposed intervention to the corresponding meshing or structural solver backend, and the returned artifacts, job status or checks determine whether the intervention resolved the original failure.

### P0074

The record for each intervention links the triggering diagnostic to the proposed parameter change, the executed job and the post-check. A numerical recovery is counted only when the affected computation completes and the triggering failure criterion is re-evaluated. Engineering feasibility is assessed separately against the unchanged load cases, material assumptions and design limits. This prevents improved numerical convergence from being mistaken for an improvement obtained by relaxing the design requirements.

### P0077

The recommendation does not itself determine engineering validity. A numerical validation callback evaluates the candidate against the applicable computational and screening criteria, and the candidate service combines this result with the structured model review before selection.

### P0079

where Ωrev denotes the set of modifications permitted by the active adapter. For the prism adapter, for example, geometry variables can be modified only through an explicit revision contract, while loads, material properties and acceptance requirements remain outside the geometry patch.

### P0080

Repeated specifications, invalid patches and exhaustion of the configured retry budget terminate further autonomous revision. Each attempt is assigned an identifier and linked to its parent candidate, allowing a proposed modification to be associated with the calculation that subsequently evaluates it.

### P0081

Candidate screening uses a default composite-score threshold of S≥85, together with a minimum supplied sub-score of 60. A separate phase-transition guard prevents progression while a recovery operation remains unresolved. When artifact enforcement is enabled, the executor additionally checks the availability and readability of required topology and review records and examines score provenance before advancing a candidate. For engineering advancement, all five scoring inputs must be identified, every required analysis must have completed, and the applicable physical checks must be satisfied. The scalar score test is evaluated together with these completion and feasibility checks. It does not replace them.

### P0108

The optimized candidate is then verified with Zwind 2.5[18] under coupled aero-hydro-servo-elastic load cases. Zwind does not participate in the optimization loop and only returns verification metrics such as platform motions, tower-top acceleration, mooring tension, and tower-base loads, under power production load cases (i.e. DLC 1.1) and extreme load cases (i.e. DLC 6.1). The selected design is accepted only if these verification responses satisfy the applicable limits.

### P0121

The retained candidate score worksheet yields a composite score of 91.2, consistent with the rounded score reported in the main text. Its five sub-scores are 98, 92, 90, 88 and 88. Their weighted contributions are 14.70, 27.60, 22.50, 13.20 and 13.20. The minimum sub-score is 88, so both numerical screening conditions are satisfied. This retained worksheet is reported separately from the fleet-calibration scores and the updated steel-proportional cost estimate.

## 交叉核验及不可混用的内容

- **tracked_media**：Document preserves deleted figure binaries alongside current figures; old artwork must not be reused as latest data. 处理：Use active=false/deleted flags in manifest; active Fig2c–f are image15/18/21/24.png and SVG16/19/22/25.
- **aip_scope**：P0010/P0017/P0033/P0129 characterize AIP as selected-design concept approval. Previously inspected certificate originals name AI Engineer端对端浮式基础智能设计软件认证项目 and scope software functions/algorithms/parameters. No new certificate is embedded in this DOCX. 处理：Keep video approval claim bounded to the software certificate; do not imply this depicted hull or every generated design is approved.
- **figure1_review_arrow**：Active Fig1b image2.png visibly links S≥85 toward CCS AIP, which could imply automatic certification if copied without explanation. Text P0043/P0081/P0117 says score is internal selection and physical/completion checks plus external review remain separate. 处理：Redesign loop with internal review and external review separate; do not present score as guarantee.
- **figure3_score_channels**：Active Fig3b selected-design steel AI score is visually about45, while P0121 retained candidate worksheet lists steel score92 and overall91.2. P0121 explicitly says worksheet is separate from fleet-calibration scores. These are not interchangeable score records. 处理：Omit composite score/radar superiority from short promo unless source channel is explained.
- **human_version_choice**：Document supports optional human inspection before meshing, changes to priorities/frozen subdomains, candidate identifiers/lineage and human final accountability. It does not explicitly document a UI operation called manual version selection. 处理：User-directed narrative 人来选版本/定方向 is compatible with these roles, but should be treated as product/user framing and checked against live implementation; do not describe manual review as every automatic recovery step.
- **data_scope**：Latest DOCX reports selected research campaign values. This review has not rerun solvers nor bound the latest selected design to current three-column cinematic geometry. 处理：Use 本研究案例/同为20MW and separate geometry illustration from reported results.
- **cost_scope**：17,656 CNY/kW is explicitly proportional to steel update, not independent cost estimation. 处理：Focus material efficiency; omit investment saving claims.
- **multi_seeds**：The text mentions multiple random seeds but provides no seed count, task success rate, speedup factor or production ROI in this main document. 处理：Do not invent efficiency multipliers, success percentages or time-to-market savings.

## 图表核验

Direct visual inspection of all 11 active raster figure panels extracted from DOCX; SVG text labels also extracted. Current PNGs correlate with active SVG counterparts. No Word-page rendering or verified page numbering claimed.

- fig2c：5.10/6.92;3.29/2.47;1.10/.82 and −26.3/+33.2/+34.1 match P0023.
- fig2d：11.20/12.38;9.56/8.02;3.67/3.44 and −9.5/+19.2/+6.7 match P0024.
- fig2e：2788/2840 and570.00/565.60 match P0025.
- fig2f：14041/14185 factored tension;1117/1074 moment match P0026.
- fig1c：Six candidates differ support counts/load placement; no same-global-load claim is warranted.

Not performed. Runtime dependency loader on Windows supplied no bundled LibreOffice path; no installed desktop office app was invoked. Body/table locators are structural OOXML locators, not page numbers.

算术/来源检查：16/16通过。未重新运行工程求解，也未获得这篇稿件独立发表DOI。
