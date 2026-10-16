# DNA 存储封面

封面按 rainbow 鱼系列规则制作：无字机制底图后期合成中文，左上使用项目中的 `public/brand/logo.png`，系列胶囊写作“每天5分钟科普 · DNA存储”，主标题只有一个问题，画面用文件块流向 DNA 双螺旋表达“编码 → 分子 → 读回”。背景为程序化矢量与渐变，不冒充真实实验照片。

## 生成

```powershell
cd D:\python_project\manim_extend_rainbow\video_project\dna_storage_algorithms
python scripts\render_covers.py
```

输出在 `cover/output/`：

- `dna_storage_16x9.jpg` / `.png`：1920×1080
- `dna_storage_4x3.jpg` / `.png`：1440×1080
- `dna_storage_3x4.jpg` / `.png`：1080×1440
- `dna_storage_9x16.jpg` / `.png`：1080×1920
- `dna_storage_cover_contact.jpg`：四比例联系表
- 每张封面的 `-layout-report.json`：尺寸、Logo 哈希、主体文字框和人工检查提示

缩略图和原图均需人工检查；脚本只检查 RGB、尺寸和文字／Logo 是否越界。输出 JPG 为质量 95、RGB；PNG 为 RGB 无透明背景。

