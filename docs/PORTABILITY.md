# 换一台电脑：可移植性清单

[返回首页](../README.md) · [快速开始](QUICKSTART.md) · [素材恢复](ASSETS.md)

## 源码整理与完整复现的区别

本仓库保留原项目的相对目录，提供统一导航和素材清单。编辑器已增加本机工具路径配置；历史视频脚本仍可能含原工作站的绝对路径、共享依赖、特定 GPU 编码器或本地资产。**源码可以阅读与继续开发，不代表每一期都能在全新机器直接完整渲染。**

`project.json` 指向实际源码入口；`assets.manifest.json` 记录需要恢复的媒体。本地制作文档保存的是当时的环境与验收记录，里面的绝对路径和已有输出说明不表示它们已包含在本次 Git 导出中。

## 编辑器的环境配置

可用配置与优先级详见 [编辑器可移植运行说明](../video_project/creator_workbench/docs/PORTABLE_SETUP.md)。常用项如下：

| 变量 | 用途 | 示例 / 未设置时 |
|---|---|---|
| `RAINBOW_VIDEO_ROOT` | 视频工程根目录 | 可自动发现仓库的 `video_project/`；启动参数 `--video-root` 优先 |
| `BLENDER_PATH` | Blender 可执行文件 | 本机安装路径；未配置时查 PATH，再兼容原工作站路径 |
| `RAINBOW_TTS_ROOT` | 本人已有 TTS 工程 | 原环境为 `D:/python_project/tts`，不随库分发 |
| `RAINBOW_PYTHON` | 媒体处理子进程的 Python | 配好的本机 Python / 虚拟环境 |
| `RAINBOW_MUSIC_ROOT` | 音乐库 | 默认当前用户 `Music/`，也可在界面导入 |
| `RAINBOW_LOGO_ROOT` | 品牌资源目录 | 默认编辑器 `web/assets/` |
| `RAINBOW_LOGO_SOURCE` | 重新绘制图标的源 SVG | 默认随源码保留的 `web/assets/rainbow-source.svg` |

这些变量调整编辑器的相应入口，**不会自动改写所有历史视频脚本**。修改环境变量后重启本地服务；一般界面和业务代码迭代仍可刷新加载。

```powershell
# 以下仅为原工作站的示例；换机器请填实际位置。
$env:BLENDER_PATH = 'D:/blender/blender.exe'
$env:RAINBOW_TTS_ROOT = 'D:/python_project/tts'
$env:RAINBOW_MUSIC_ROOT = 'D:/CloudMusic'
python video_project/creator_workbench/launcher.py --video-root ./video_project
```

## 按依赖逐项准备

| 依赖 | 首次运行前核对 |
|---|---|
| Node / Remotion / Three.js | 在项目实际 package 根目录安装依赖；不要复制原电脑的 `node_modules` 目录联接 |
| Python / Manim | 按所需项目建立环境；旧 Python 项目与编辑器可能需要不同版本或包 |
| FFmpeg / FFprobe | 确认 PATH 与所需编码器；NVENC 路线需要合适的 NVIDIA GPU，改用 CPU 编码需调整参数 |
| Chromium / Headless Shell | 依照该 Remotion 版本准备浏览器；不依赖原机器的下载缓存 |
| Blender | 检查版本、插件、单位、材质及导出脚本；安装 exe 不代表 MCP 服务已连接 |
| LaTeX / dvisvgm | 公式重新生成时需要；已有 SVG 可用与否以具体入口为准 |
| 字体 | 使用有权安装的字体，复核中文覆盖、字形、换行和布局 |
| 个人 TTS | 本人授权的音色环境与入口；仅改画面时可恢复已有选定旁白，不必重录 |
| 第三方商业插件 | 独立取得授权并安装；仓库不提供 WaterPro 等商业源码的替代下载 |
| 外部模型服务 | 本机配置接口与凭据，实际调用前检查可用性；克隆仓库不会获得原作者账号权限 |

## 先看缺口，再渲染

```powershell
python tools/assets.py check --project dna_storage_algorithms
python tools/assets.py download --project dna_storage_algorithms
# 有原始工作区备份时，可按工具帮助恢复未入库的普通素材。
python tools/assets.py restore --source-root 'D:/python_project/manim_extend_rainbow'
```

`download` 仅恢复已有 Release 成片，不能补齐完整渲染所需的一切原始资产。标为私有音色、商业插件或授权受限的内容需要单独处理，不能根据清单自动假定可复制 / 再分发。

对原始脚本的路径修改应限制在选定项目内。可以先搜索：

```powershell
rg -n 'D:/|D:\\|C:/Users/|C:\\Users\\' video_project/<工程ID>
```

搜索结果中有文档和引用，也有真正执行路径；逐项核对，不做全仓库替换。先生成代表帧和短样片，检查模型、字幕、音频与转场，再进行完整渲染。

## 特别需要保留的历史入口

上海中心等工程的 `work/` 中保存了原始建模、运镜或收尾脚本；海洋工程的 `work/v8/recovery/` 保存隔离恢复用的依赖描述；Roadster 新版可能以此前完整视频为组装底片。它们是有效作者源文件，不能把所有名为 `work` 的文件一概当缓存删除。

相反，`creator_workbench/work/` 保存编辑器运行会话与个人任务，不随 Git 分发。项目规范区分目录的实际用途；清理和同步必须依据当前源码、清单和路径范围。

## 如何记录一次迁移

记录工具版本、调整过的路径、恢复的资产与哈希、已运行命令、实际查看过的帧 / 区间，以及尚缺的内容。只完成语法检查时写“语法检查通过”，不能写“全片复现成功”；已有成片可播放也不表示全部源资产已恢复。
