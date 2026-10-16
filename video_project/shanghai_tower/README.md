# 上海中心：高楼怎样站稳

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

保留 work/v16 中必要原创脚本和资产记录；商业 WaterPro vendor 不发布。V16 依赖先前物理数据与公共模型。

![项目封面](delivery/covers/%E4%B8%8A%E6%B5%B7%E4%B8%AD%E5%BF%83_%E5%B0%81%E9%9D%A2_16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/indexV16.tsx](src/indexV16.tsx) |
| 源码入口 | [scripts/render-v16.mjs](scripts/render-v16.mjs) |

## 使用方式

### `.`

```powershell
cd video_project/shanghai_tower
npm install
```

可用命令：`npm run check`、`npm run render`、`npm run stills`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "shanghai_tower"
python tools/assets.py download --project "shanghai_tower"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
