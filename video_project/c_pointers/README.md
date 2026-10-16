# C语言指针：地址里藏着什么

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

实际 npm 工程在 v1；顶层 source/output 为空的编辑器结构占位。

![项目封面](v1/output/covers/C%E8%AF%AD%E8%A8%80%E6%8C%87%E9%92%88_%E5%B0%81%E9%9D%A2_16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [v1/src/index.tsx](v1/src/index.tsx) |
| 源码入口 | [v1/scripts/render.mjs](v1/scripts/render.mjs) |

## 使用方式

### `v1`

```powershell
cd video_project/c_pointers/v1
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run qa`。

### `v1/work/qa/camera-compiled`

```powershell
cd video_project/c_pointers/v1/work/qa/camera-compiled
npm install
```

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "c_pointers"
python tools/assets.py download --project "c_pointers"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
