# DNA 存储与生信算法 5 分钟科普

项目入口是 `src/index.tsx`，渲染命令是：

```powershell
npm run check
npm run stills
npm run render
```

完整成片输出到 `delivery/DNA存储与生信算法_1080p.mp4`。旁白使用本地 Qwen3-TTS 彩虹鱼音色克隆，混音脚本为 `scripts/mix_dna.py`；背景音乐为本地程序化氛围音乐，旁白区间自动 duck。

## 画面说明

- `hook`：文件方块和存储介质缩成一滴液体。
- `encode`：二进制方块转成 A/T/C/G 双螺旋。
- `constraint`：GC 比例与连续同聚物长度检查。
- `fountain`：编码液滴的随机异或关系。
- `read`：测序读段和固定教学错误样本。
- `decode`：地址聚类、局部比对与质量加权共识。
- `llm`：候选设计、约束检查、读回、修复、验收闭环。
- `references`：三张论文书目信息卡与三条关系公式。

动画中的错误和数据是可复现的教学示意，不是一次真实测序实验的报告。
