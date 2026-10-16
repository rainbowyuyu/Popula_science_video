# 诺贝尔物理学奖：一束蓝光穿过南极冰

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

README 当前版本称 V11，但 V12 入口与交付目录实际存在。

![项目封面](delivery/physics2026_cover_v02/covers/physics2026-cover-16x9.jpg)

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index-physics2026-v12.tsx](src/index-physics2026-v12.tsx) |
| 源码入口 | [scripts/render_physics2026_v12.mjs](scripts/render_physics2026_v12.mjs) |
| 原制作说明 | [README.legacy.md](README.legacy.md) |

## 使用方式

### `.`

```powershell
cd video_project/nobel_physics_2026
npm install
```

可用命令：`npm run check`、`npm run audio`、`npm run audio:v03`、`npm run audio:v03:mix`、`npm run render`、`npm run stills`、`npm run render:v02`、`npm run render:v09`、`npm run stills:v09`、`npm run render:v10`、`npm run stills:v10`、`npm run render:v02:single`、`npm run stills:v02`、`npm run qa:v02`、`npm run qa`、`npm run render:v11`、`npm run stills:v11`、`npm run render:v12`、`npm run stills:v12`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "nobel_physics_2026"
python tools/assets.py download --project "nobel_physics_2026"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
