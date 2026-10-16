# 本地能力与调用边界

工作台索引动态查询实际路径。下列入口来自用户已明确的配置，不把路径存在当作远端可用证明。

| 能力 | 入口 | 使用前检查 |
|---|---|---|
| 视频工程 | 当前仓库的 `video_project/`（或 `--video-root`） | 选定工程的说明、入口、锁文件、当前成片；版本目录独立 |
| Blender | `BLENDER_PATH` 或 PATH 中的 Blender | 运行版本；用后台脚本时先做代表帧；MCP 需单独确认服务 |
| 用户 TTS | `RAINBOW_TTS_ROOT` | 读 `RAINBOW_AUDIO_WORKFLOW.md` 与 `BROADCAST_NARRATION.md`，验证脚本参数 |
| 品牌素材 | `RAINBOW_LOGO_ROOT` 或 `web/assets/` | 查看变体、透明底和适用背景，不改原文件 |
| Claude 协作 | 当前用户目录的 `.codex/tools/claude/README.md` | 阅读最新用法；每次独立 `work/opus-runs/` 输出，查完成状态再集成 |
| 技能 | `.codex/skills`、`.agents/skills`、插件各自 `skills` | 按任务读取，保留来源路径；同名不同实现不混为一谈 |
| Node / FFmpeg / FFprobe | 工作台运行时 PATH 检测 | 在目标工程记录版本；不复用其他工程的猜测命令 |
| Qwen / Wan | 已有工程脚本与使用说明 | API 状态、计费范围、输出限制按本次任务确认；不用历史成功假定当前可用 |

CC Switch 是供应商来源。OpenAI/ChatGPT 和 Claude 的认证交给工作台服务端或已配置的独立运行器；不得把密钥写入前端、项目源码、提示词、命令参数、日志或生成文档。DeepSeek 不在本工作台默认路线中。

工作台2.1的主智能体先调用 `project_state`，按返回路径读取当前文案、相机、参考与源片。创造阶段的 `project_action` 复用工作台真实模块，不自行伪造“已配音”“已保存”结果。工具参数中的工程ID不能覆盖当前工程；选段任务不能通过模块工具写回原工程。文案接口平台标识为 `douyin`、`xiaohongshu`、`bilibili`、`wechat`。

视频帧截图保存到当前工程 `references/frames/`，附源片与秒数。封面批量任务由本机脚本取现有作品帧并渲染固定版式；需要AI生成新画面时必须明确另选工具与相应范围。学习流程使用可访问参考、实际样片、解码和抽帧对照，最多两次试做；不把参考链接登记等同于实际观看。

原工程的 WaterPro、付费模型、音色参考和商业音乐按引用使用；注册路径不意味着复制、重分发或重新授权。工具不可用时明确说明，并选用可运行的本地方法。

远端 GPU 仅在用户任务授权使用 GPU 时通过既有 `ssh fusion-gpu` 连接；启动前检查空闲卡、环境和项目目录，不复制私钥。与当前创作无关时不主动调用。
