# rainbow鱼 · AI 视频编辑器

**从故事、镜头到封面，一张工作台串起视频创作。**

<p align="center"><img src="web/assets/editor-wordmark.png" alt="rainbow鱼 AI 视频编辑" width="460"></p>

工作台以工程为单位管理视频、封面文案、旁白音乐、字幕、运镜和学习参考。GPT 与 Claude 共用任务资料，按具体问题分工、交接与复核；用户可以边看片边标记，把修改清单统一交给主智能体。

| 创作 | 编排 | 复用 |
|---|---|---|
| 双模型协作 · 任务检查点 · 选段意见 | 封面与文案 · TTS/BGM · 字幕与镜头 | 系列风格 · 参考学习 · 创作记忆 |

## 从源码启动

需要 **Python 3.11+（带 SQLite）**。网页为本地静态资源，启动服务无需 npm 或第三方 Python 依赖。

```powershell
cd video_project/creator_workbench
python launcher.py
```

请通过启动器打开带本地会话的网页；服务只监听 `127.0.0.1`。工作台自动发现相邻的 `video_project/`，不会连接原始电脑上的仓库。

```powershell
python launcher.py --video-root ../ --port 8765
```

可用 `--no-browser` 仅启动服务，`--no-reuse` 创建独立实例。应用代码与页面保存后刷新加载；启动器、底层依赖或 EXE 内嵌图标变化才需要重新构建。

## 首次配置

1. 在自己的 CC Switch 中配置 OpenAI/ChatGPT 与 Claude 的 API 提供商。工作台按请求读取当前用户 `.codex/config.toml`、`.codex/auth.json` 和 `.claude/settings.json`；仓库不携带凭据。
2. 安装需要的本地工具：Node.js、FFmpeg/FFprobe、Blender。每个视频的依赖与渲染入口见该工程 README。
3. 可选：`python -m pip install -r requirements-optional.txt`，启用封面绘制与品牌图生成。
4. 个人 TTS、音色和音乐库由用户单独配置；既有可选工具路径见 [本机配置](docs/PORTABLE_SETUP.md)。

## 界面与交付

- 左侧按系列浏览工程，右侧直接预览成片和标记区间。
- 封面保留各比例独立布局、系列规范与可编辑记录。
- 学习页可独立接收参考视频或链接，保存样片、复核与提炼规则。
- 任务进度与创作记忆留在本机；媒体生成依赖实际配置的模型、工具和素材。

## 检查与打包

```powershell
python -m unittest discover -s tests -p "test_*.py"
node --test tests/app_navigation.test.cjs tests/agent_workspace.test.cjs tests/learning_independent.test.cjs
python -m pip install -r requirements-build.txt
python scripts/build_exe.py
```

生成的 `output/RainbowVideoWorkbench.exe` 不纳入 Git；需与本工程的 `app/`、`web/`、`skills/` 保持目录关系，或使用源码入口。

## 目录导航

```text
creator_workbench/
├── app/                 Python 服务、模型适配、媒体和任务执行
├── web/                 网页、交互和品牌素材
├── skills/              工程内的创作协议与参考
├── scripts/             封面工具、可选编辑器安装和 EXE 构建
├── tests/               离线回归测试
├── docs/                功能说明与配置指南
├── launcher.py          启动入口
├── runtime_loader.py    保留会话的代码刷新
├── work/                本机状态、日志、记忆（忽略）
├── tools/               可选第三方编辑器（忽略）
└── output/              EXE、构建结果（忽略）
```

[完整使用指南](docs/README.md) · [工程规范](docs/PROJECT_STRUCTURE.md) · [协作流程](docs/PROJECT_FLOW.md) · [独立学习](docs/INDEPENDENT_LEARNING.md) · [创作记忆](docs/CREATIVE_MEMORY.md)

品牌图片为 rainbow鱼 自有素材；第三方工具与各视频引用素材的授权分别遵循其来源说明。
