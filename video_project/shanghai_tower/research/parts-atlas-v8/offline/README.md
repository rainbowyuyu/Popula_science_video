# 上海中心完整离线构件图册

交付文件：`delivery/构件图册.html`。将这个文件复制到其他电脑后，用支持 WebGL 的 Chrome 或 Edge 直接打开即可。Three.js、模型、完整名称和原 Logo 均内嵌，不需要启动服务器、不需要联网，也不依赖旁边的文件夹。首次读取 57 MB 文件时会显示加载提示。

## 已实现

- 原始 GLB 的 987 个语义部件完整收录，中文名与 `naming.json` 一一对应；部件名称、位置和模型 ID 均可检索。
- 10 大构件类别与高度分区交叉筛选；列表与实际三维模型同步选中。
- 整体、保持原始尺度的拆解、按独立尺度展示的可翻页平铺。
- 拖动旋转、滚轮缩放、右键平移、自动环绕、复位、近看构件、单独查看、幕墙透视。
- 选中后显示中文名称、部位、模型中心高度、米制坐标、模型表示方式和限制。
- 左上原始 Logo 与 rainbow鱼；电脑和窄屏布局分别处理，平铺为电脑 12 件/页、窄屏 8 件/页。

页面明确标注：987 个语义部件含合并组、设备组和环境示意，不等于 987 个独立制造单件。它是教学重建，不是竣工 BIM 或施工加工图。平铺部件间不保持真实比例；没有把分类色/选中色冒充应力云图。

## 输入与构建

输入全部只读：`public/models/shanghai-tower.glb`、`public/models/shanghai-tower-manifest.json`、`research/parts-atlas-v8/naming.json`、`public/brand/logo.png`。

`build.mjs` 验证命名清单的 manifest 哈希和 987 唯一 ID 后，使用本地 esbuild 将 Three.js、GLTFLoader、OrbitControls 与 RoomEnvironment 打为内联脚本，再内嵌 GLB。原始几何用于所有视图；本任务未修改 `src` 或 `public`，未复制大型计算场数据。Three.js MIT 许可内嵌于 HTML。

在项目根目录执行：

```powershell
node research/parts-atlas-v8/offline/build.mjs
python research/parts-atlas-v8/offline/qa.py
```

`build-manifest.json` 记录交付 HTML 与所有输入的 SHA256。`qa/interaction-qa.json` 必须与交付 HTML 的哈希一致，且 `allPassed=true` 才表示这份最终文件通过。

## 验证范围

使用 Playwright 在断网的 `file://` 环境打开交付文件，验证 987 个真实模型节点、987 个名称及检索、名称定位、交叉筛选、环绕相机确实移动、拆解、复位、隔离、平铺翻页、空结果，以及手机布局和标签避开翻页控件。采集浏览器错误和外部请求，确认没有 JavaScript 错误及 HTTP/HTTPS 请求。

截图位于 `qa/`：整体、拆解、铜板特写、伸臂平铺、全构件平铺、手机平铺与手机选中。所有截图均来自本 HTML 的真实浏览器渲染。

本文件是完整名称与模型的补充查看器，不替代影片中的构件平铺运镜。
