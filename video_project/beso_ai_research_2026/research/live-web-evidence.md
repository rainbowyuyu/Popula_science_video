# AI Engineer 产品网页演示证据

## 采集方式

`scripts/capture-live-web.cjs` 使用 Playwright 连接本机 AI Engineer FastAPI 服务：

```text
http://127.0.0.1:8018/ui/
```

采集窗口为 1920×1080，浏览器为本机 Chrome。脚本只执行页面内的导航、输入和开关切换，不发送 Qwen 请求，也不启动求解器；因此素材可作为真实产品 UI 演示，片中不把它写成一次新计算。

## 证据帧

| 文件 | 页面状态 | 用途 |
| --- | --- | --- |
| `public/beso-research/web-live/01-home.png` | 主工作台 | 产品开场、导航结构 |
| `public/beso-research/web-live/02-prompt.png` | 已输入工程需求，深度思考和 CAD 工具打开 | 自然语言入口、交互感 |
| `public/screens/domain.png` | 设计域与三维预览 | 文件树、源码/预览、Agent 记录 |
| `public/screens/evolution-2.png` | BESO 历史结果查看器 | 迭代几何、质量曲线与失效指标 |
| `public/screens/analysis.png` | 尺寸时域分析 | 静力 / Zwind 时域入口 |
| `public/screens/review.png` | AI Review | 规则校核和验证入口 |

`web-live/capture-evidence.json` 保存了采集时间、URL 和每一帧的本地路径。

## 片中措辞边界

- “真实网页界面回放”或“本地产品界面”可以使用。
- 若只展示截图与光标，使用“保存结果回放”“历史迭代查看器”，不要说成正在现场跑完了新一轮 BESO。
- 页面上的计算按钮可作为产品能力提示；旁白若没有实际调用，应使用“可启动”“可查看”“可追溯”。
