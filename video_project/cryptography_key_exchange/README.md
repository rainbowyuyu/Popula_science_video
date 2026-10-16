# 密码学：公开传话怎样保密

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

v4 为当前纸张/故事修订；不要只上传空顶层 source。

![项目封面](v4/delivery/covers/%E5%AF%86%E7%A0%81%E5%AD%A6_%E5%B0%81%E9%9D%A2_16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [v4/src/index.tsx](v4/src/index.tsx) |
| 源码入口 | [v4/scripts/render.mjs](v4/scripts/render.mjs) |

## 使用方式

### `v1`

```powershell
cd video_project/cryptography_key_exchange/v1
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run timeline`、`npm run qa`。

### `v1/work/qa/camera-compiled`

```powershell
cd video_project/cryptography_key_exchange/v1/work/qa/camera-compiled
npm install
```

### `v2`

```powershell
cd video_project/cryptography_key_exchange/v2
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run timeline`、`npm run qa`。

### `v2/work/qa/motion-compiled`

```powershell
cd video_project/cryptography_key_exchange/v2/work/qa/motion-compiled
npm install
```

### `v3`

```powershell
cd video_project/cryptography_key_exchange/v3
npm ci
```

可用命令：`npm run check`、`npm run stills`、`npm run render`、`npm run timeline`、`npm run qa`。

### `v3/work/qa/motion-compiled`

```powershell
cd video_project/cryptography_key_exchange/v3/work/qa/motion-compiled
npm install
```

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "cryptography_key_exchange"
python tools/assets.py download --project "cryptography_key_exchange"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
