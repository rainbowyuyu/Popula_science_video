# AI Engineer 科学素材库

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

用于 BESO/风力研究的素材与事实台账，无独立影片入口。

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [research_assets_v1/README.md](research_assets_v1/README.md) |

## 使用方式

这是 Python / Blender / 素材工程，请先检查上述入口文件与原制作说明。没有独立成片的工程会保留为素材库，不会伪造渲染命令。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "ai_engineer_science"
python tools/assets.py download --project "ai_engineer_science"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
