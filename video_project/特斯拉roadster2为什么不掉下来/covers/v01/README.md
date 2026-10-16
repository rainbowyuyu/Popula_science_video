# Roadster 四比例封面

本版采用用户图一的 V05 第6453帧翻转姿态，叠合图二的透明机制呈现。使用 Three.js 原工程模型重新渲染，Pillow 合成准确中文、品牌和栏目；未调用生图服务。

- 文案：5分钟科普·特斯拉Roadster / Roadster怎么实现倒挂和翻滚。
- 比例：16:9 1920×1080；4:3 1920×1440；3:4 1440×1920；9:16 1080×1920。
- JPG，RGB，sRGB ICC，质量95，4:4:4。
- source/v05 保持不变；scene.ts 只读引用原模型与第6453帧的姿态。
- node render.mjs 重新生成透明主体；使用带 Pillow 的 Python 执行 compose.py 重排四版。共享依赖通过原 source/v05 解析，无需复制。
- layouts.json 可编辑排版；assets/render.json 保留源帧、尺度、锚点和来源哈希；layout-report.json 保存实测边界与结果。
- 车体和内部配置为原影片教学模型，非官方 CAD、非实测流场。轨迹和喷气作为机制图示。

输出在项目 output/covers/v01。所有原图、320/160px 缩图已经视觉检查，文字没有压住主体。
