# 视频工程文件结构规范

每个视频工程保留一个稳定目录和工程 ID。系列名、集数、主题名在工作台中修改；不批量改名物理目录，以免破坏 Remotion、Blender、Python 和历史媒体链接。

| 目录 | 作用 |
|---|---|
| `source/` | 新场景、镜头表、时间线、构建脚本 |
| `assets/` | 稳定模型、贴图、图片、字体、来源许可 |
| `audio/` | `narration/`、`bgm/`、`master/` |
| `subtitles/` | 源句、SRT/VTT 与时间码 |
| `covers/` | 分版本封面、可编辑布局、`copy/` 平台文案 |
| `output/` | 完整成片及发布文件 |
| `work/` | 抽帧、试渲染、缓存、试验和临时工具输出 |
| `references/` | 论文、参考片、风格分析与授权记录 |
| `.studio/` | 工程设置、标记、目录映射和当前版本清单 |

已存在的 `src/public/scripts`、`v1`、`v4`、`delivery`、`publish` 等引擎路径纳入 `.studio/structure-v2.json` 的真实路径映射。它们保留原位，不复制大型文件、不猜测硬编码依赖。`.studio/PROJECT_STRUCTURE.md` 是每个工程对应的中文导航。智能体修改前应读该导航，改已有文件继续使用真实原路径，新独立文件保存到规范目录。

新版本示例：

```text
output/v003/密码学_v003_1080p.mp4
covers/v003/密码学_v003_16x9.jpg
covers/v003/密码学_v003_3x4.jpg
covers/copy/bilibili.md
audio/narration/003.wav
audio/master/v003.wav
source/cameras/shot-003.json
work/v003/qa/contact-sheet.jpg
```

版本使用 `v001` 等递增编号，画幅为 `16x9`、`3x4`、`4x3`、`9x16`、`1x1`；不以“最终2”“最终最终”命名。系列标题由系列设置统一控制，不依赖物理目录重命名。

扫描：

```powershell
python scripts/organize_legacy_projects.py
python scripts/organize_legacy_projects.py --apply
```

扫描只枚举登记的构建入口和目录级信息，有数量上限，跳过依赖、私有配置、符号链接和 Windows 目录联接。全工程结果保存到 `video_project/_catalog/project-structure-v2-*.json` 和 `.md`。应用建立缺失目录和工作台拥有的两份导航文件，可重复执行。用户同名文件、规范位置被普通文件占用或遇到链接时会保留原文件并报告冲突。

本操作不会释放磁盘空间。保留最新已验收成片、可重渲染依赖和一个回退版本；清理需通过单独的 `cleanup.scan` / `cleanup.apply` 清单和依赖检查。当前媒体索引“最新”不等于验收合格，不会自动覆盖 `.studio/current-release.json`。

API 约定：`ProjectStructure(library).scan(project_id)` 返回实际路径、缺失目录、兼容路径、散落根文件和冲突；`.apply(project_id)` 建立规范；`.context(project_id)` 提供小型任务上下文，按需读取导航，不在页面初载遍历所有旧文件。
