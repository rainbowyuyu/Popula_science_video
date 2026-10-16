# 海洋能源：从风浪到发电

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

服务器渲染脚本和 WaterPro 适配依赖需外置说明；存在 output 与 outputs 两代目录。

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index.tsx](src/index.tsx) |
| 源码入口 | [scripts/render_server_final_v8.mjs](scripts/render_server_final_v8.mjs) |
| 源码入口 | [scripts/finalize_v8.py](scripts/finalize_v8.py) |

## 使用方式

### `outputs/zju-marine-episode01-20261013-v3`

```powershell
cd video_project/zju_marine_ep01/outputs/zju-marine-episode01-20261013-v3
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `.`

```powershell
cd video_project/zju_marine_ep01
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `work/v7-baseline`

```powershell
cd video_project/zju_marine_ep01/work/v7-baseline
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `work/v8/recovery`

```powershell
cd video_project/zju_marine_ep01/work/v8/recovery
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `work/v8-recovery-check`

```powershell
cd video_project/zju_marine_ep01/work/v8-recovery-check
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

### `work/v8-recovery-check/work/v8/recovery`

```powershell
cd video_project/zju_marine_ep01/work/v8-recovery-check/work/v8/recovery
npm ci
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "zju_marine_ep01"
python tools/assets.py download --project "zju_marine_ep01"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
