# 彩虹为什么是弧形

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

STORAGE_LAYOUT.md 指定 V20；旧版本命名源码仍被当前入口使用，不得按文件名 Vxx 删除。

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index-v20.tsx](src/index-v20.tsx) |
| 源码入口 | [scripts/render-v20.mjs](scripts/render-v20.mjs) |
| 源码入口 | [src/index-warm-creek.tsx](src/index-warm-creek.tsx) |

## 使用方式

### `.`

```powershell
cd video_project/rainbow_arc_2026
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`、`npm run audit`、`npm run render:warm-creek`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "rainbow_arc_2026"
python tools/assets.py download --project "rainbow_arc_2026"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
