# 大模型幻觉：从概率流到动力学

[← 工程总览](../../docs/PROJECTS.md) · [统一结构](../../docs/PROJECT_STRUCTURE.md) · [素材与成片](../../docs/ASSETS.md)

需要 Manim/LaTeX/FFmpeg/Remotion；compose_fast 使用 NVIDIA NVENC，可改为 libx264；Chromium 的本机 junction 不应复制。

## 从哪里开始

| 内容 | 入口 |
| :--- | :--- |
| 工程元信息 | [project.json](project.json) |
| 素材与成片清单 | [assets.manifest.json](assets.manifest.json) |
| 源码入口 | [src/index.ts](src/index.ts) |
| 源码入口 | [scripts/prepare.py](scripts/prepare.py) |
| 源码入口 | [scripts/render_manim.py](scripts/render_manim.py) |
| 源码入口 | [scripts/compose_fast.py](scripts/compose_fast.py) |
| 源码入口 | [scripts/finalize.py](scripts/finalize.py) |
| 原制作说明 | [README.legacy.md](README.legacy.md) |

## 使用方式

### `.`

```powershell
cd video_project/llm_hallucination
npm ci
```

可用命令：`npm run dev`、`npm run build`、`npm run upgrade`、`npm run lint`。

首次渲染前，在仓库根目录运行：

```powershell
python tools/assets.py check --project "llm_hallucination"
python tools/assets.py download --project "llm_hallucination"
```

`download` 仅恢复已发布的成片，渲染使用的本地素材通过 `restore --source-root <原仓库>` 恢复；不包括商业插件、音色参考、API 凭据与字体。部分历史脚本保留本机路径，请参照 [可移植性清单](../../docs/PORTABILITY.md) 配置后使用。
