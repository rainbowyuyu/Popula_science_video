# V01 · CS:GO 从点击到击杀｜实现入口

## 当前范围
本阶段制作本地可重渲染的三维机制样片，不冒充正式成片。真实 Danking / ZywOo 片段尚未提供，版本、武器、POV、时间码均未验证。场景为原创几何示意，不是 Dust II 精确重建，不显示真实选手身份。

## 工具与入口
- Python 3.12.10（标准库 + requests + numpy 可用；Pillow 不可用）。
- Blender 5.1.2：`D:/blender/blender.exe`，直接运行本工程已阅读的 Python，不使用 MCP。
- FFmpeg：本机 PATH 可用，libx264/libass 可用。
- 当前工程 Node 无 three/remotion/puppeteer；本阶段不安装、不借用其他工程。
- 原有 README/project.json 不变。所有新产物独立版本，不覆盖已验收片。

拟执行命令（运行结果另见 work/v01 日志）：
```
python source/v01/prepare.py
python source/v01/mechanism.py
blender --background --factory-startup --python-exit-code 1 --python source/v01/scene.py -- --stills
python source/v01/render.py
python source/v01/verify.py
```

## 坐标与时间
三维世界 Z 向上；客户端中心 x=-5，服务器中心 x=5。帧率24，视觉样片暂定24秒/576帧；这是无旁白动效测试，不是实测链路时延。正式版以实际个人TTS重建时间线。
原片接点信息见 source/v01/edit_contract.json。没有 source 路径与真实接点时拒绝生成伪比赛首尾。
标签与字幕由 ASS 屏幕空间叠加，避免三维字体透视影响中文阅读；品牌使用用户原始PNG，并排文字 rainbow鱼。三维模型与路径由确定帧号驱动。

## 输出与限制
- `output/v01/mechanism_preview_v01.mp4`：已生成24秒无声三维机制预览，非全片；自动解码/帧数/时长/黑帧检查通过，未连续观看。
- `output/v01/preview.html`：本地预览入口；`source/v01/HANDOFF.md`：详细进度与限制。
- `assets/v01/mechanism_scene_r2.blend`：当前可编辑场景，所有几何原创程序建模；首版mechanism_scene.blend保留。
- `source/v01/narration.md`：全片口播草稿，原片锁定前不生成全片音频。
- `work/v01/`：帧序列、探测、射线测试、自动验收。
- 未提供原片前，片头/片尾和真实点击时刻不能验收。抽帧、自动解码、连续观看、实际听审分开记录。

## 安全与复用
不读凭据或音色原始数据，不修改TTS工程，不发布，不清理旧目录。无付费生成。脚本仅写当前工程的上述目录；同名已有输出先保留版本备份。真实输入素材后续只读引用。
