# 快速开始

[返回首页](../README.md) · [工程总览](PROJECTS.md) · [素材指引](ASSETS.md)

## 获取源码

仓库为私有，需要具有访问权限的 GitHub 账号。

```powershell
git clone https://github.com/rainbowyuyu/Popula_science_video.git
Set-Location Popula_science_video
```

先查看所需项目的 `README.md` 和 `project.json`。本库包含不同年代、不同渲染方式的工程，没有一个可替代所有项目说明的“全部渲染”命令。

## 启动视频编辑器

Windows 可先下载 [便携版](https://github.com/rainbowyuyu/Popula_science_video/releases/download/library-2026-10-17/RainbowVideoEditor-Windows.zip)，解压到仓库根目录，运行 `video_project/creator_workbench/output/RainbowVideoWorkbench.exe`。压缩包含配套源码与 SQLite，不带个人配置或媒体。修改配套源码后刷新即可。


工作台服务使用 Python 标准库；源码启动需要 Python 3.11 或更新版本。视频制作所需的 Node、FFmpeg、Blender、TTS 等另行准备。

在仓库根目录运行：

```powershell
python video_project/creator_workbench/launcher.py --video-root ./video_project --port 8765
```

启动器会打开带本地会话的网页；默认仅监听本机。若 8765 已被占用，去掉 `--port 8765`，由启动器选择空闲端口。不要把 `work/runtime.json` 中的会话信息加入版本控制。

模型配置按 [工作台说明](../video_project/creator_workbench/docs/README.md) 连接本机 CC Switch 等已配置接口；仓库不提供 API 密钥，也不会自动获得 Codex 或第三方工具的登录权限。未配置模型时，可以先检查界面与本地工程结构。

常用路径：

| 操作 | 位置 |
|---|---|
| 修改界面 | `video_project/creator_workbench/web/` |
| 修改后端与协作逻辑 | `video_project/creator_workbench/app/` |
| 修改创作规范 | `video_project/creator_workbench/skills/` |
| 查操作与验收边界 | `video_project/creator_workbench/docs/` |
| 查测试 | `video_project/creator_workbench/tests/` |

普通页面、技能及外部后端迭代可以刷新加载；修改启动器、内嵌资源或底层运行依赖才需要重新打包 EXE。Git 只保存源码；预编译 Windows 启动器通过上面的 Release 附件提供。

## 准备一个视频工程

1. **找入口**：通过 [工程总览](PROJECTS.md) 确认当前源码位置，不按目录名猜版本。
2. **恢复素材**：检查模型、图片、旁白、字体、音乐与字幕是否齐全，见 [素材指引](ASSETS.md)。
3. **安装依赖**：进入实际包含 `package.json` 的目录。存在锁文件时运行 `npm ci`；没有锁文件时先核对项目依赖，不借用原作者电脑的目录联接。
4. **检查环境**：按照项目要求准备 Python、Node、FFmpeg / FFprobe；Manim 项目可能需要 LaTeX / dvisvgm，Blender 项目需要匹配版本。
5. **先检查再渲染**：执行项目现有类型检查与代表帧命令，确认素材、文字、镜头与音频，再输出完整视频。

例如 C 指针项目具有独立的依赖声明与检查入口：

```powershell
Set-Location video_project/c_pointers/v1
# 有 package-lock.json 时使用 npm ci，否则按该项目依赖说明安装。
npm run check
npm run stills
# 素材与代表帧确认后：
npm run render
```

以上是工程中已有的命令，不表示缺少本地资产时也能成功。DNA 等项目某些子版本继承父目录依赖；先读其版本文档，不在每个子目录盲目安装同一套包。

## 本机工具与跨机器路径

| 工具 | 原创作机器的位置 / 方式 | 迁移时怎么做 |
|---|---|---|
| Blender | `D:/blender/blender.exe`，或 `BLENDER_PATH` | 安装后在所需脚本中配置本机路径 |
| 个人 TTS | `D:/python_project/tts` | 使用本人授权的音色环境；或先恢复已选定的旁白文件 |
| BGM | 本机音乐库 | 恢复具有使用权限的曲目，不能仅凭相同文件名替代 |
| 模型接口 | 本机 CC Switch 配置 | 各机器单独配置，凭据不写进项目 |
| 字体 | 本机字体 / 项目字体子集 | 按许可证安装，并检查中文缺字与字形变化 |

历史脚本中仍可能存在绝对路径。换机器前搜索并逐项替换，不做跨全库的无差别文本替换；共享资产与导入关系应在代表帧中验证。

## 第一次修改建议

选一段 10–20 秒的小片段，记录保留项、改动点、时间范围和验收画面。先确认旁白与机制正确、主体不穿模、字幕无遮挡、转场连续，再渲染全片。最后更新该项目的版本说明、资产清单和封面文案。
