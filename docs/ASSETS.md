# 素材、成片与恢复

[返回首页](../README.md) · [目录规范](PROJECT_STRUCTURE.md) · [快速开始](QUICKSTART.md)

## 三种内容，三种保存方式

| 内容 | 推荐保存位置 | 说明 |
|---|---|---|
| 源码与制作依据 | Git 仓库 | 场景、脚本、配置示例、讲稿、字幕源、镜头表、事实台账、许可证、适合入库的小型素材 |
| 大型可用素材与成片 | 独立媒体包 / 私有交付存储 | MP4、WAV、GLB、Blend、贴图等按实际体积与许可管理；通过清单对应原路径 |
| 可再生中间文件 | 本地 `work/` 等缓存目录 | 抽帧、逐帧渲染、依赖、临时 bundle、测试下载与工具缓存；不进入源码历史 |

不是所有扩展名都能简单归为“可删除”：有的 PNG 是唯一贴图，有的 JSON 是实际仿真数据，有的 WAV 是不可替代的选定旁白。判断依据是**当前版本的真实引用与来源**。

## 本库不提供的个人环境

- API 密钥、会话 token、CC Switch 的个人配置与访问凭据。
- 私人 TTS 模型、声音参考、音色克隆所需个人录音。
- 本机音乐库、没有明确再分发依据的配乐与字体原件。
- `node_modules`、Python 虚拟环境、浏览器运行时、工具安装包与模型权重。
- 工作台的私人对话、运行日志、学习任务缓存及其他运行会话。

部分项目文档会提到这些本地位置，这是复现前需要恢复或替换的依赖，不代表文件已经随仓库交付。涉及第三方插图、论文页、模型和字体时，以逐项来源台账及授权为准。

## 查询与下载

仓库媒体工具为 `tools/assets.py`，在仓库根目录使用：

```powershell
python tools/assets.py --help
python tools/assets.py list
python tools/assets.py check
python tools/assets.py download --project dna_storage_algorithms
```

最新成片的私有归档为 [library-2026-10-17](https://github.com/rainbowyuyu/Popula_science_video/releases/tag/library-2026-10-17)。下载需要当前 GitHub 账号拥有仓库访问权；附件使用稳定的 ASCII 工程标识，恢复后的项目路径由 manifest 决定。Release 不包含所有模型、原始音频或历史版本；工具列出的缺失项需要自己的原始工作区 / 备份。

若仍保存原工作区，可以按工具帮助执行恢复：

```powershell
python tools/assets.py restore --source-root 'D:/python_project/manim_extend_rainbow'
```

以工具实际输出为准，核对目标和缺失项；恢复不等于重新生成。各项目统一清单位于 `video_project/<id>/assets.manifest.json`，更详细的第三方出处继续保留在原工程台账中。

## 恢复一个版本

1. 打开项目导航，确认选定版本的源码、媒体位置与构建入口。
2. 阅读该版本的资产清单 / 来源台账；检查每项的路径、来源、大小与 SHA-256（若已记录）。
3. 从自己的备份或仓库交付记录指定的私有媒体位置取得文件，恢复到清单声明的项目相对路径。
4. 对缺失的授权音乐、个人音色或字体作明确替换；替换后重新测时、对齐字幕并检查排版。
5. 执行项目检查和低成本代表帧，再生成短片段，最后进行完整渲染。

不要把一个陌生媒体包直接覆盖整个项目，也不要把旧文件清单里的本机绝对路径当作恢复目标。媒体恢复工具的可用参数以仓库实际工具说明为准；未提供媒体包的项目不承诺下载即渲染。

## 建议资产清单字段

```json
{
  "path": "assets/models/example.glb",
  "kind": "model",
  "source": "procedural-original",
  "license": "owner-retained",
  "sha256": "<实际文件 SHA-256>",
  "requiredBy": ["source/scenes/example.ts"],
  "availability": "local-backup"
}
```

以上为格式示例，不是现有文件或许可声明。优先沿用项目已有的 manifest schema，保持来源、哈希和引用字段能够对应实际文件。

## 发布与归档

成片发布包应包含选定 MP4、字幕、各画幅封面、平台文案、来源 / 署名说明和实际验收记录。若使用 GitHub Releases 存放大文件，只有实际上传完成并记录下载位置后，才能把状态写为“已上传”；没有 Release 时从本地备份恢复。

清理前保留当前可用版本与一个回退入口。不得通过删除共享目录、符号链接目标或重新生成代价高的唯一源资产来压缩仓库。Git `.gitignore` 只控制后续跟踪，不能从已有历史中撤回已提交的凭据或大文件。

已在 Git Credential Manager 配置 GitHub、但未登录 gh 时，可显式使用 `python tools/assets.py download --project dna_storage_algorithms --use-git-credentials`。凭据仅用于子进程，不写入项目。
