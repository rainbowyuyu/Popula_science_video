# 本地资源与能力索引

`app/library.py` 用只读路径注册替代复制插件、模型、商业资源与私人音色。工作台首次载入/手动刷新时重新扫描，之后使用 60 秒内存缓存；请求者得到独立副本。

工程以 `video_project` 下的主题目录分组，例如 `c_pointers`、`cryptography_key_exchange`、`dna_storage_algorithms`。其版本目录保留在 `sourceRoots`，依赖于 `project.json`、`package.json`、Python 脚本、Blender 文件或已有视频判定。新建工程的 `README.md`、`project.json` 与空 `output/` 足以立即收录。维护目录、共享依赖、研究缓存不误列为单独工程。`output`、`outputs`、`delivery` 等媒体单独扫描，供右侧预览；图片与音频不会从私人引用库批量收集。

技能来源为 `~/.codex/skills`、`~/.agents/skills`、`~/.codex/plugins/cache`、工作台自己的 `skills` 与 `video_project/shared/skills`。同名同内容的技能只显示一次，并保留别名路径；同名不同内容保留为不同条目。正文按 ID 按需读取。插件读取已安装的 `plugin.json` 名称、版本与描述，**不读取认证配置**，不声称 MCP 已连接。

已核对旧视频主题：拓扑优化、彩虹、榫卯/亭子（`episode3`）、GLP-1/人体调节（`glp1_nobel_2026`）、DNA 存储、密码学、C 指针均已收录。两个旧路径 `ai_evolution_ch05_reasoning_agents_v06`、`rainbow_arc_2026_v16` 是分别指向现有同主题目录的 Windows junction，因此不重复登记。`custom_maps` 只有地图 `.npy`/`meta.json`/参考图，没有视频入口或成片，不作为视频工程；它是既有 `cs2_c4` 等工程可按任务引用的资源。`shared` 仅作为共享技能来源，`maintenance`、`_catalog`、`_history` 是维护/索引目录，`.ipynb_checkpoints` 是笔记本缓存，均不当作创作项目。

| 状态 | 含义 |
|---|---|
| available | 本地可执行程序文件已发现；具体命令与运行环境仍需任务内检查 |
| configured | 路径、脚本或工程依赖声明存在；没有验证远端连接/模型是否可用 |
| unverified | 仅有插件清单、未发现本地入口或服务连接尚未验证 |
| registered | 技能文本已登记，可以按需读取，不代表能执行任意工具 |

已知入口包括 Blender、TTS、Logo、全局 Claude 运行器、PATH 的 Node/FFmpeg/FFprobe/Python，以及工程声明的 Remotion/Three.js。Qwen/Wan 仅登记已有脚本路径，不执行计费请求。不扫描或显示 CC Switch、Claude、OpenAI 的凭据内容。

ID 由规范化路径 SHA-256 的前 24 位组成。`project(id)` 与 `skill(id)` 只接受已登记 ID；`media(project_id)` 重新确认实际路径属于该工程，拒绝兄弟目录前缀伪装、符号链接和 Windows junction。扫描不跟随链接，最大深度与条目数量有界，截断信息公开于 `snapshot.scan.truncated`。环境变量 `CREATOR_SCAN_MAX_FILES` 与 `CREATOR_SCAN_MAX_MEDIA` 可调整限制。

接口：

```python
library = Library(Path(video_root))
snapshot = library.snapshot(refresh=False)
project = library.project(snapshot["projects"][0]["id"])
media = library.media(project["id"])
skill_text = library.skill(snapshot["skills"][0]["id"])
```

索引提供资源发现。实际生成/修改、外部接口调用与视频输出仍由工作台任务执行层控制在选定工程内。索引本身不安装全局技能、不改配置、不删除内容、不启动外部进程。
