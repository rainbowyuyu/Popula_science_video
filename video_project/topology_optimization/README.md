# 拓扑优化、榫卯、高血压与专题合集

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

目录实含书架拓扑、旧彩虹、榫卯、高血压、地铁、诺奖生理专题，不能用单片名称盲目裁剪。

![项目封面](delivery/episode3/covers_v6/%E6%A6%AB%E5%8D%AF_%E7%88%86%E7%82%B8%E4%BA%AD%E5%B0%81%E9%9D%A2_16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index-v3.tsx](src/index-v3.tsx) |
| 源码入口 | [src/index-episode3v8.tsx](src/index-episode3v8.tsx) |
| 源码入口 | [src/index-hypertension.tsx](src/index-hypertension.tsx) |
| 源码入口 | [src/index-metro.tsx](src/index-metro.tsx) |
| 源码入口 | [src/index-nobel2026-v51.tsx](src/index-nobel2026-v51.tsx) |
| 原制作说明 | [README.legacy.md](README.legacy.md) |

## 使用方式

### `delivery/episode3v5`

```powershell
cd video_project/topology_optimization/delivery/episode3v5
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`、`npm run audit`。

### `delivery/metro`

```powershell
cd video_project/topology_optimization/delivery/metro
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`、`npm run qa`、`npm run cleanup`。

### `.`

```powershell
cd video_project/topology_optimization
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run render:nobel:v5`、`npm run stills:nobel:v5`、`npm run render:nobel:v51`、`npm run stills:nobel:v51`、`npm run render:episode2`、`npm run stills:episode2`、`npm run stills`、`npm run web`、`npm run qa`、`npm run cleanup`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "topology_optimization"
python tools/assets.py download --project "topology_optimization"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
