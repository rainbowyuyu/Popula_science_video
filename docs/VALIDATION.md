# 本次整理的验证范围

[返回首页](../README.md) · [工程总览](PROJECTS.md)

本次是独立仓库整理与发布，原始创作工作区和正在运行的编辑器保持原位。没有重新渲染全部影片，也不把源码检查视为视觉、事实或声音审核。

| 检查 | 结果 |
|---|---|
| 工程入口、元信息、素材清单与主指引链接 | `python tools/check_library.py` 验证 |
| 素材工具 | 16 项测试，15 通过；1 项文件符号链接测试受 Windows 权限限制跳过，目录 junction 测试已通过 |
| 编辑器前端交互 | 40 项测试通过 |
| 编辑器 Python | 隔离副本全量 530 项：初次 523 通过、4 跳过，3 个失败随后修复；相关 21 项复测通过 |
| Windows 便携 EXE | 新 Logo、SQLite 内置，健康检查、主页、学习页、鉴权工程列表均通过；ZIP CRC 与逐文件 SHA 校验通过 |
| 新目录启动 | 编辑器健康检查、独立 video_root 与统一项目元信息导入通过 |
| 媒体交付 | 20 个选定 MP4 记录体积和 SHA-256，按 Release 清单管理 |
| 私人状态 | `.studio`、会话、运行日志、音色参考、凭据不入库 |
| 原创作目录 | 未搬移、未删除；新仓库独立保存 |

编辑器回归中修复了过时的 64k 默认值断言，并让封面脚本使用可配置的通用 Python，避免误用缺少 Pillow 的 TTS 专用解释器。新导出支持从 `project.json.workbench` 读取安全的标题与系列字段，不导入私人会话。

## 持续验证

```powershell
python tools/check_library.py
python -m unittest discover -s tests -p test_assets.py -v
```

GitHub Actions 只做离线源码与元信息检查，不调用付费模型、不下载整套媒体、不渲染影片。
