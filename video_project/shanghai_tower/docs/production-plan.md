# 上海中心 · 当前制作状态

本页记录 v7 final3 的制作输入状态，不代表最终 MP4 已验收。最新运行状态与后续验收入口以 `docs/UPGRADE_V7_STATE.md` 为准。

1920×1080、30 fps；14909 帧，496.966667 秒；48 句 rainbow鱼旁白，236 条短字幕。系列名称为“每天5分钟科普”；用户已取消本集时长限制，保留完整结构、受力与施工解释，不加速人声。片尾含入场共 9 秒，标题为“结构搭建与计算工作流”，组合标识为“Zwind + Diffusion + Iwind → AI engineer”。

当前目标：`delivery/ShanghaiTower_1080p_v7.mp4`。本轮渲染输入为 `research/visual/v7-final-production-lock3.json`，运行目录为 `tmp/render-runs/v7-final3-35140-1791520780575/`。完整渲染及新编码文件验收仍待完成。修复前 v7 的 `research/qa/v7-final/` 仅用于历史比较，不可迁作本轮验收；v3 的 381.9333 秒 / 194 条字幕、v6 的 394.833333 秒 / 195 条字幕均为历史版本数据。

画面从上海中心直接进入，以同一座 987 部件模型完成幕墙展开、基础剖面、九格核心筒、巨柱和伸臂、双层幕墙、风致响应、TMD 与施工过程。Sky、CC0 天空 HDRI、连续幕墙组开合与镜头路径共同组织空间。final3 已修复玻璃深度遮挡、投影透明切换、斜腹杆交接、流场换层及结构荷载展开；源代码审查见 `research/qa/v7-final3-source-transition-review.md`，仍需核对本轮实际编码画面。

结构求解使用本地 Zwind/OpenSees 等效模型：冻结主楼响应、连续 TMD 与核心筒弯曲截面应力，以及独立单桩静力和动力例题。`public/physics/component-response.json` 将 705 个可拆分结构件关联到 1984 个等效杆件，保留应力、位移和固定色标；282 个幕墙、连接、楼板和设备件属于教学几何，没有独立求解应力。主楼位移显示 ×48；当前独立单桩位移 ×300；TMD 相对承挂点运动 ×1。完整接口与适用边界见 `docs/environment-physics-interface.md`。

当前单桩近景读取 `public/physics/pile-dynamics.json` 与对应 provenance：桩长 52 m、直径 1 m，桩头深度 31.4 m 来自 Zhu 稿筏顶 −25.4 m 加 6 m 厚度的推导，展示独立静力加载及 40 秒动力响应。现有主 GLB 的筏底 / 桩头仍为历史重建的 −33 m，没有被改成整楼桩土耦合模型；两种标高及工况分别说明。旧 `environment-response.json` 内 33 m 桩头、×80 的静力例题只保留为历史基线。

生产流场来自实际运行的 OpenFOAM v1912 simpleFoam / kOmegaSST，细网格 1243872 单元，均匀 30 m/s 入口、滑移地面。它已获限定科普画面使用许可，显示“理想化平均流场”，用于解释宏观绕行、侧方加速、尾流减速和相对平均压力符号；严格残差目标、网格无关性、工程设计及流固耦合均未获通过。它与结构预设风载、独立单桩是分开的工况。当前权威证据为 `research/physics-v7/final-educational-cfd-acceptance.json`、`research/qa/v7-cfd-scientific-review.md` 和 `research/qa/v7-cfd-production-binding-review.md`。旧 SU2 失败候选和二维截面例题不再作为当前生产流场。已有 Diffusion 检查点不适用于本建筑或单桩，片尾组合标识不能代替实际求解来源。

背景音乐已按用户后续选择改为本地聲無哀樂SWAL《飞升》，源文件 `D:/CloudMusic/聲無哀樂SWAL - 飞升.mp3`；覆盖此前抖音参考及工作预览音乐。rainbow鱼 Qwen3-TTS 声音、全部 48 句旁白、字幕与母带已锁定，377 个强拍用于镜头节奏同步。音频依据为 `research/v7-final-audio-lock.json`、`research/v7-voice-promotion.json`、`research/audio-validation.json` 及 `docs/audio-production.md`；最终编码 AAC 仍须随 final3 重新检查。

缓存清理仅完成审计与执行脚本准备，本轮尚未执行。固定 22 项候选及门禁见 `research/qa/cache-cleanup-v7/`；须待新 MP4、自动 QA、视觉报告和交付清单绑定同一哈希且验收通过后才可清理。源模型、论文、求解输入输出、声音句源、可复现源码、最终 bundle、v6 回退与本轮验收证据均需保留。目前没有完成最终 MP4 的整片人工听审或逐帧人工观看。
