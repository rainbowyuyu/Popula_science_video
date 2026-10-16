# 科学减重：从身体调节说起

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

当前发布资料已移动 publish；仍需保留 V5/V6/V7/V8 命名的跨版依赖。

![项目封面](delivery/%E5%B0%81%E9%9D%A2-V18/%E5%A6%82%E4%BD%95%E7%A7%91%E5%AD%A6%E5%87%8F%E8%82%A5_%E8%BA%AB%E4%BD%93%E8%B0%83%E8%8A%82_16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index.tsx](src/index.tsx) |
| 源码入口 | [scripts/render.mjs](scripts/render.mjs) |
| 原制作说明 | [README.legacy.md](README.legacy.md) |

## 使用方式

### `.`

```powershell
cd video_project/glp1_nobel_2026
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `research/revision-v5/dining-return-patches/source`

```powershell
cd video_project/glp1_nobel_2026/research/revision-v5/dining-return-patches/source
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `research/revision-v5/final-boundary-repair/frozen-source`

```powershell
cd video_project/glp1_nobel_2026/research/revision-v5/final-boundary-repair/frozen-source
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `research/revision-v5/final-motion-source`

```powershell
cd video_project/glp1_nobel_2026/research/revision-v5/final-motion-source
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `research/revision-v5/full-transparent-source`

```powershell
cd video_project/glp1_nobel_2026/research/revision-v5/full-transparent-source
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `research/revision-v5/h005-fix/current-source`

```powershell
cd video_project/glp1_nobel_2026/research/revision-v5/h005-fix/current-source
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "glp1_nobel_2026"
python tools/assets.py download --project "glp1_nobel_2026"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
