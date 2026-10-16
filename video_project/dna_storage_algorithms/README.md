# DNA存储：把文件写进分子

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

v3 子工程内持续迭代到 V6；顶层 npm 仍指向旧版，v3 README 首段也只描述 V3。

![项目封面](v3/cover-v5/covers/DNA%E5%AD%98%E5%82%A8_V5%E5%B0%81%E9%9D%A2_16x9.png)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [v3/src/indexV6.tsx](v3/src/indexV6.tsx) |
| 源码入口 | [v3/scripts/render_v6.mjs](v3/scripts/render_v6.mjs) |
| 源码入口 | [v3/scripts/render_v5.mjs](v3/scripts/render_v5.mjs) |

## 使用方式

### `.`

```powershell
cd video_project/dna_storage_algorithms
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `v3`

```powershell
cd video_project/dna_storage_algorithms/v3
npm install
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run qa:motion`、`npm run stills:v4`、`npm run render:v4`、`npm run qa:camera:v4`、`npm run qa:motion:v4`、`npm run stills:v5`、`npm run render:v5`、`npm run qa:camera:v5`、`npm run qa:motion:v5`、`npm run qa:timeline:v5`、`npm run stills:v6`、`npm run render:v6`、`npm run qa:camera:v6`、`npm run qa:motion:v6`、`npm run qa:timeline:v6`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "dna_storage_algorithms"
python tools/assets.py download --project "dna_storage_algorithms"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
