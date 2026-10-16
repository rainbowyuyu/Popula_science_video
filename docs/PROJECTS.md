# 工程总览

[返回首页](../README.md) · [启动工作台](QUICKSTART.md) · [素材恢复](ASSETS.md)

每个工程都有相同的 `README.md`、`project.json`、`assets.manifest.json` 入口。实际源码位置写入元信息，保留旧路径以兼容跨版本依赖。

| 工程 | 类型 / 当前源码 | 入口 | 已选成片 |
| :--- | :--- | :--- | :--- |
| [AI Engineer 科学素材库](../video_project/ai_engineer_science/README.md) | research-assets · assets-only | `research_assets_v1/README.md` | 0 |
| [BESO 与 AI Engineer](../video_project/beso_ai_research_2026/README.md) | engineering · V20 launch + research film | `src/index-beso.tsx` · `src/index-launch-v20.tsx` | 2 |
| [C语言指针：地址里藏着什么](../video_project/c_pointers/README.md) | computer-science · V1 | `v1/src/index.tsx` · `v1/scripts/render.mjs` | 1 |
| [密码学：公开传话怎样保密](../video_project/cryptography_key_exchange/README.md) | computer-science · V4 | `v4/src/index.tsx` · `v4/scripts/render.mjs` | 1 |
| [CS2 C4：冲击波与寻路](../video_project/cs2_c4/README.md) | computer-science · Manim notebook/edit pipeline | `manim/shockwave.py` · `cs2_c4_shockwave.ipynb` | 0 |
| [可编辑地图与CS2场景数据](../video_project/custom_maps/README.md) | shared-assets · assets | 素材 / 脚本 | 0 |
| [DNA存储：把文件写进分子](../video_project/dna_storage_algorithms/README.md) | computer-science · V6 source; V5 selected delivery | `v3/src/indexV6.tsx` · `v3/scripts/render_v6.mjs` | 1 |
| [榫卯：一座亭子怎样拼起来](../video_project/episode3/README.md) | engineering · pavilion model assets | `build_pavilion_v7.py` · `build_real_assembly_pavilion.py` | 0 |
| [科学减重：从身体调节说起](../video_project/glp1_nobel_2026/README.md) | life-science · publish current + V8 source | `src/index.tsx` · `scripts/render.mjs` | 1 |
| [大模型幻觉：从概率流到动力学](../video_project/llm_hallucination/README.md) | computer-science · 18 chapters | `src/index.ts` · `scripts/prepare.py` | 1 |
| [数学演示集](../video_project/math_demos/README.md) | mathematics · Manim | `sqrt_near_6.py` | 0 |
| [诺贝尔化学奖：让化学选择同一只手](../video_project/nobel_chemistry_2026/README.md) | science-awards · V03 explanation + V04 rap | `src/index-chemistry2026-v03.tsx` · `src/index-chemistry2026-v04.tsx` | 1 |
| [诺贝尔物理学奖：一束蓝光穿过南极冰](../video_project/nobel_physics_2026/README.md) | science-awards · V12 source/delivery | `src/index-physics2026-v12.tsx` · `scripts/render_physics2026_v12.mjs` | 1 |
| [彩虹为什么是弧形](../video_project/rainbow_arc_2026/README.md) | natural-science · V20 + warm-creek independent demo | `src/index-v20.tsx` · `scripts/render-v20.mjs` | 1 |
| [上海中心：高楼怎样站稳](../video_project/shanghai_tower/README.md) | engineering · V16 horizontal + vertical | `src/indexV16.tsx` · `scripts/render-v16.mjs` | 2 |
| [拓扑优化、榫卯、高血压与专题合集](../video_project/topology_optimization/README.md) | multi-episode · multiple current compositions | `src/index-v3.tsx` · `src/index-episode3v8.tsx` | 5 |
| [知我 · 视觉叙事](../video_project/zhiwo/README.md) | visual-story · render-only local collection | 成片归档 | 1 |
| [海洋能源：从风浪到发电](../video_project/zju_marine_ep01/README.md) | engineering · V8 | `src/index.tsx` · `scripts/render_server_final_v8.mjs` | 1 |
| [Roadster：倒挂与空中翻滚](../video_project/%E7%89%B9%E6%96%AF%E6%8B%89roadster2%E4%B8%BA%E4%BB%80%E4%B9%88%E4%B8%8D%E6%8E%89%E4%B8%8B%E6%9D%A5/README.md) | engineering · V06 over V05 body | `source/v05/src/index.tsx` · `source/v05/scripts/render.mjs` | 1 |
| [按下鼠标之后：电脑如何运作](../video_project/%E5%BD%93%E4%BD%A0%E6%8C%89%E4%B8%8B%E5%B7%A6%E9%94%AE%E6%89%93%E5%87%BA%E9%82%A3%E5%8F%91%E5%AD%90%E5%BC%B9%E7%94%B5%E8%84%91%E6%98%AF%E5%A6%82%E4%BD%95%E8%BF%90%E4%BD%9C%E7%9A%84/README.md) | computer-science · V01 | `source/v01/render.py` | 0 |
| [rainbow鱼 · AI 视频编辑器](../video_project/creator_workbench/README.md) | application · 2.8.1 | `app/server.py` · `Start-Workbench.ps1` | 0 |

## 使用须知

- `topology_optimization` 是历史合并工程，含拓扑优化、榫卯、高血压、地铁与神经光学等多个主题，不能只看文件夹名称。
- DNA 当前正式成片 V5，源码包含 V6 的后续迭代；密码学 v4 工程交付文件标为 V5，均如实保留。
- `zhiwo` 仅找到成片，未找到可复现制作源码。
- AI 进化系列、其预告、发布包与目录别名均未纳入此次仓库。
- 软件与源代码测试结果见 [验证报告](VALIDATION.md)，视频未在新目录中全部重新渲染。
