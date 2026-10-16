# 外部运行依赖

源代码不包含已安装的第三方包或商业库。

- SU2 8.5.0：上海中心历史物理试验依赖，可从 https://github.com/su2code/SU2 的 v8.5.0 版本恢复；保留本工程仿真配置与脚本，发行包遵循上游许可证。
- VTK：部分流场后处理依赖，安装到独立 Python 环境；不要复制旧机 `_deps`。
- OpenCC：DNA 语音辅助脚本使用 `opencc-python-reimplemented==0.1.7`；建议在工程虚拟环境安装，并按脚本需要配置导入路径。
- WaterPro：授权用户从自己的合法安装恢复，原商业源码、打包代码和已移植的完整 shader 均未放入仓库。原创调用封装保留，因此没有该依赖的场景需要自行替代或恢复。
- 相邻工程中已有 node_modules junction 不入库。Node 项目按 package-lock.json 安装。

历史绝对路径见 [可移植性说明](PORTABILITY.md)；本次没有重新运行所有仿真。
