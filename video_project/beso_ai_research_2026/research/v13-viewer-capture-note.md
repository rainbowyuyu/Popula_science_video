# v13 查看器标签调查

2026-10-12。仅只读产品源文件和现有保存画面；未改产品源码或影片组件，未开启新服务或提交求解。

当前检查 8000–8039 端口未发现监听服务。因此没有伪造“今天已采集”的截图。可核验来源、SHA-256 与路径见 `public/beso-research/web-live/v13/viewer-capture-source.json`。

## 为什么关闭尺寸按钮后仍然拥挤

`frontend_static/flow_main.resultsViewer.js:900` 的 `#rvBtnDim` 是“显示设计尺寸 / 水面 / 载荷圆”。`refreshDimOverlay()` 在关闭时仅移除 `rvDimOverlay`。

但加载 `parameters_summary.json` 会使用 `previewParametricNow()`，当 `parametric.showAnno` 为真时（默认及加载函数会设为真），直接附加 `buildTopologyAnnotationGroup()` 的 `rvTopoAnno`。查看工具栏和右键菜单没有发现控制 `parametric.showAnno` 的公开 UI 项。

已有 v5 manifest 写过 disabled dimensions，但**实际打开其保存图仍可见微型拓扑标注**；它不是合格的 clean screenshot，不直接复用成无标注图。

## 不改源码的实际采集备选

当主片需要新真实像素时，可启动一个独立本地服务；此前没有发现冲突服务，仍应在启动前确认端口。

```powershell
& 'D:/python_project/beso_ai/.venv/Scripts/python.exe' -m uvicorn backend.app:app --app-dir 'D:/python_project/beso_ai' --host 127.0.0.1 --port 8018
```

页面：`http://127.0.0.1:8018/ui/`。点击 `#resultsViewerBtn` → 使用 `#rvFilesInput` 导入：

```text
D:/python_project/beso_ai/runs/beso9_centered_seed_campaign_v4/mw_20/seed_17/beso_run/file043.vtk
```

这份 9.8 MB 的真实保存 BESO 四面体结果已核验存在。`previewVtk()` 会直接创建真实网格而不会创建 `rvTopoAnno`。然后使用 `#rvBtnFit`；`#rvBtnDim` 和 `#rvBtnBc` 都保持 `aria-pressed=false`。保存 `#rvCanvasWrap` 的真实像素，可作为 `assetOverrides.geometry`。

该图应标“真实查看器 · 保存的BESO结果”，而不是“完整浮式平台”“正在在线求解”或“实时装配”。与右侧原生模型不同对象时，不用同一零件的 match cut 冒充相同几何。

如果一定要保留原来的参数重建三柱画面，目前公开 UI 中没有可用的拓扑标注关闭项；需另行修复产品控件，或继续把旧保存截图明确作为短暂证据画面。不能通过修图删除标签后冒充原始截图。
