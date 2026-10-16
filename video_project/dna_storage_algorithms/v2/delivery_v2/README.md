# DNA 存储与生信算法 V2 交付包

## 这是什么

V2 是一条约 5 分钟（1920×1080、30 fps、9000 帧）的电影纪录片式科普片。故事从一段家庭视频开始，沿同一颗数据粒子的轨迹走过：

`家庭视频 → 数据颗粒 → DNA 编码 → 地址与约束 → DNA Fountain → 合成/保存/测序 → 分桶/局部比对/共识 → 大模型辅助 → 文件读回`

画面由 PerspectiveCamera 连续推进、环绕和穿越；同一液滴、读段或分子链负责镜头接力。机制示意使用固定种子的 Three.js / Blender 程序化资产，示意数据不会冒充真实实验结果。

## 交付内容

- `v2/delivery/DNA存储与生信算法_V2_1080p.mp4`：最终母版。
- `v2/delivery/s01-hook.jpg` … `s09-evidence.jpg`：9 个镜头中心帧，便于审片。
- `assets-manifest.json`：资产路径、来源、许可、哈希和缺失状态。
- `source-record.json`：时间线、工具、证据、音频和可复现命令的来源台账。
- `QA.md`：自动检查与人工验收记录。
- `publish-copy.md`：抖音、小红书、B 站、微信视频号发布文案。

最终母版已重新渲染并复制到 v2/delivery_v2；PCM master/narration 为 300.000 秒，AAC 容器尾帧为 300.011 秒（约 11ms 编码容差，小于一帧），并通过视频/音频完整解码、黑帧、静音和镜头抽查。最终 MP4 SHA256 为 a6cc0cf389b99d49305a6634c733ad2af8d5330bbed69a604b9890b3ce070210。

## 重新渲染

在项目根目录 `D:\python_project\manim_extend_rainbow\video_project\dna_storage_algorithms` 执行：

```powershell
# 1. 完整性与类型检查
npx tsc --noEmit -p v2\tsconfig.json
node v2\scripts\qa_timeline_v2.mjs --strict-delivery
node v2\scripts\qa_motion_v2.mjs

# 2. 音频（已生成 36 条 raw/*.wav；需要重算时执行）
& 'D:\python_project\tts\.venv\Scripts\python.exe' v2\scripts\mix_v2.py

# 3. 中心帧审片
node v2\scripts\render_v2.mjs --stills

# 4. 完整母版（包含 Qwen TTS 与环境音乐混音）
node v2\scripts\render_v2.mjs --audio

# 5. 编码核验
ffprobe -hide_banner v2\delivery\DNA存储与生信算法_V2_1080p.mp4
```

`render_v2.mjs` 使用 `v2/public` 作为静态目录。渲染前须确认 `v2/public/brand/logo.png`、`v2/public/audio/master.wav` 与 3D 资产均已就位。来源和哈希记录在 `assets-manifest.json`。

## 资产路线

Blender 资产由 `D:\blender\blender.exe`（5.1.2）程序化生成，统一以米为单位、Blender Z-up 右手坐标；`v2/public/3d/manifest.json` 记录对象数量、边界和角色。Three.js 场景在 GLB 不可用时提供确定性替代。Qwen/Wan 在本轮 GET 探针返回 401，未提交计费生成；Lux3D 报价项不可计价，未提交任务，因此不把外部生成结果写成证据。

## 证据口径

片尾引用 Goldman et al. (2013)、Erlich & Zielinski (2017)、Organick et al. (2018)、Smith & Waterman (1981) 和 Dalla-Torre et al. (2024)。正文使用 `GC = (G + C) / L`、异或恢复关系和质量加权共识等教学公式。论文标题、作者、年份与 DOI 只来自 `v2/src/timeline.json` 和 `v2/research/story-v2.md`，红色替换/插入/缺失是固定教学样本。

## 版本与清理

旧版 src/、scripts/、public/ 和 delivery_v2/DNA存储与生信算法_V2_rollback_previous.mp4 保留作为回退版本。V2 已清理不再被入口引用的旧渲染、损坏并发产物和可重建 tmp-bundle；重渲染脚本会在需要时重新生成临时 bundle。没有执行根仓库级 git clean。
