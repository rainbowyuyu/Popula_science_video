# 本机配置与可移植运行

本仓库保存源码和可复用素材。API 凭据、模型历史、会话、私有音色、商业音乐和本机工具安装不随仓库分发。

## 配置路径

| 配置 | 用途 | 未设置时 |
|---|---|---|
| `RAINBOW_VIDEO_ROOT` | 项目根目录 | 从启动器父级发现 `video_project/`；命令行 `--video-root` 优先 |
| `BLENDER_PATH` | Blender 可执行文件 | PATH，其次兼容原工作站 `D:/blender/blender.exe` |
| `RAINBOW_TTS_ROOT` | 既有 TTS 工程 | 兼容 `D:/python_project/tts`；未安装时相应功能不可用 |
| `RAINBOW_PYTHON` | 媒体/脚本子进程 Python | TTS 虚拟环境，其次 PATH/Python 当前解释器 |
| `RAINBOW_LOGO_ROOT` | 品牌素材目录 | `creator_workbench/web/assets/` |
| `RAINBOW_LOGO_SOURCE` | 重新生成品牌图所用 SVG | `web/assets/rainbow-source.svg` |
| `RAINBOW_MUSIC_ROOT` | 音乐库默认位置 | 当前用户 `Music/`，也可在界面导入其他目录 |

设置后重新启动服务，使环境变量生效。代码和网页的一般修改仍可刷新加载。

```powershell
$env:BLENDER_PATH = 'D:/blender/blender.exe'
$env:RAINBOW_TTS_ROOT = 'D:/python_project/tts'
$env:RAINBOW_MUSIC_ROOT = 'D:/CloudMusic'
python launcher.py
```

TTS 适配器沿用既有个人 TTS 工程接口，运行前读取该工程 `RAINBOW_AUDIO_WORKFLOW.md` 和 `BROADCAST_NARRATION.md`；这不是随仓库附带的通用语音服务。

## 模型与生成服务

- OpenAI/ChatGPT 与 Claude：通过本机 CC Switch 当前提供商配置，不复制配置文件入仓库。
- Wan/Qwen：使用 `QWEN_API_KEY_PRIMARY` / `QWEN_API_KEY` / `DASHSCOPE_API_KEY` / `QWEN_API_KEY_BACKUP` 环境配置。不要把实际值写进脚本、命令历史或提交。
- 模型请求、TTS、云端图片/视频生成可能计费；离线单元测试不发起这些调用。
- Blender MCP、Lux3D 及独立 Claude 工具需要各自安装和连接；工具被发现不代表服务已连接。

## 不随 Git 分发的内容

`work/`（会话、任务、记忆）、`.studio/`（工程私人状态）、`tools/`（下载的第三方程序）、`runtime_deps/`（本地 Python 补充库）、`output/`（构建结果）均在本机生成。可选编辑器可自行运行 `python scripts/install_editors.py` 下载，需网络及对应许可证。

从官方 Python 启动时自带 SQLite。只有旧稳定 EXE 缺少 SQLite 时才需要 `python scripts/prepare_sqlite_runtime.py`，该运行库与本机 Python ABI 匹配，不应复制到其他 Python 版本。

## 记录与测试边界

本仓库不含原作者对话和迭代数据。创作记忆只能在用户手动同步后读取该电脑上可用的历史。通用回归用例可能包含已排除系列的虚拟目录名；这些是匹配测试数据，不包含该系列作品素材。

Python 全量离线测试和 Node 前端测试可以在未配置模型 API 时运行。付费连接检查脚本须在自行配置后明确调用，不作为初次安装步骤。
