# 榫卯：木头怎样咬住木头

成片：`joinery_v5_1080p.mp4`。1920×1080、30 fps，8840 帧，约 4 分 55 秒（294.667 秒）。片尾论文与公式停留 8 秒。

## 本次修订

- 所有章节以相机和模型移动衔接，旧结构越过相机边界后才隐藏；共享亭子保持同一模型。
- 燕尾、半搭接和插销按独立父节点装配；保留建模时的局部坐标，避免穿模与错位。
- 力传导依次经过屋面、椽梁、柱、柱础，镜头跟随承力部位；梁弯曲、局部承压、风压和吸湿过程增加动态可视化。
- 文字放大、减少堆叠；标题移出画面，论文原页占满卡片，作者与年份放在下面。
- 旁白使用 rainbow鱼参考音色，歧义句改为“等它干燥”；配乐为原创程序配乐《竹影行》94 BPM，成片只有一条音乐床。

## 文件与复现

- `src/`：Three.js 场景、Remotion 合成与时间轴。
- `public/episode3v2/`：完整模型、仿真数据、论文页、母带、旁白、逐句原始/处理音频和配乐。备选配乐是独立试听。
- `blender/`：两份实际 Blender 源工程、Lux3D 原始 GLB、路径适配后的构建脚本；`original-scripts/` 保留原脚本。
- `research/`：论文 PDF、来源、音频/物理记录；`qa/`：最终媒体检测、转场/几何证据和 `video-review/` 抽样拼图/转场连片。
- `subtitles.srt`：与当前时间轴一致的 101 条字幕。

在本目录执行 `npm ci`，再执行 `node scripts/render_episode3v2.mjs`。首次运行会按需下载 Remotion Chrome；不包含 node_modules。`npm run check` 检查 TypeScript。最终重建输出为 `output/episode3/joinery_v5_1080p.mp4`。Windows 的 Microsoft YaHei / SimSun 字体用于原始成片，在其他平台可能有字体差异。

重算物理数据运行 `python scripts/physics_episode3v2.py`；重新混音运行 `python scripts/score_episode3v2_options.py`，需 NumPy、SciPy、SoundFile 与 FFmpeg。Blender 中先运行 `blender/build_crafted_scene.py`，再运行 `blender/build_joinery_v2.py` 可重建教学几何（会更新包内模型）；成片直接使用随包提供的已核验 GLB。无需重新调用生图、Lux3D 或 TTS API。

## 核查记录

以 `qa-report.json` 内嵌的最终媒体报告和 `qa/final-media-qa.json` 为准。视频 SHA256：`14c7acf3e48f092f560c28a25ef20d095d9fc9385460816763a4984b6f5b305d`。

64 帧全场转场报告是风线修复前记录，包含 10 个像素探针差异；后续 10 帧 × 3 顺序风场复验为 0 差异，离屏报告覆盖 12 次退出。像素探针为 160×90，渲染为 1920×1080；不将这些抽样称为逐帧全片人工观看或听音。原渲染脚本保存在 `research/render-script-used.mjs`。打包脚本只核验复制完整性；未宣称在全新安装环境中完整重渲染。

## 仿真范围

梁采用正交各向异性平面应力三角形有限元，637 节点 / 1152 单元 / 3000 N，显示形变放大。亭子和接头力线用于说明受力传递，不是全亭接触有限元结果。风是 D2Q9 BGK 二维压力场（200×110 格点），白模摆动是响应示意，不能称作结构应力；湿度是二维各向异性 Fick 扩散，时间和胀缩经过演示性放大。几何是教学模型，不能直接用作施工图。片尾技术路线已将 Zwind 列为流场软件第一位，写作“流场｜Zwind · D2Q9”；本片动态风场仍采用 D2Q9 教学求解，后续由 Blender、Three.js、扩散模型与 Remotion 完成可视化与合成。

论文来源：Sha、Wang、Li（2019），DOI `10.3390/app9163429`；Huan 等（2024），DOI `10.15376/biores.19.1.478-499`。

