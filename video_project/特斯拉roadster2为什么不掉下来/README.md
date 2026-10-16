# Roadster：倒挂与空中翻滚

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

V06 合成实际复用 V05 master；若上传源码不上传视频，必须写明先渲染 V05；Qwen桥接在 work/v06 需作为外部素材台账保留。

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [source/v05/src/index.tsx](source/v05/src/index.tsx) |
| 源码入口 | [source/v05/scripts/render.mjs](source/v05/scripts/render.mjs) |
| 源码入口 | [source/v06/scripts/assemble.py](source/v06/scripts/assemble.py) |
| 原制作说明 | [README.legacy.md](README.legacy.md) |

## 使用方式

### `source/v01`

```powershell
cd video_project/特斯拉roadster2为什么不掉下来/source/v01
npm ci
```

可用命令：`npm run studio`、`npm run check`、`npm run stills`、`npm run preview`。

### `source/v04`

```powershell
cd video_project/特斯拉roadster2为什么不掉下来/source/v04
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run qa`。

### `source/v05`

```powershell
cd video_project/特斯拉roadster2为什么不掉下来/source/v05
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run qa`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "特斯拉roadster2为什么不掉下来"
python tools/assets.py download --project "特斯拉roadster2为什么不掉下来"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
