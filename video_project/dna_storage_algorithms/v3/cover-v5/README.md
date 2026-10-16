# DNA 存储 V5 · 四比例封面

主标题：**弄丢几块，还能找回？**

栏目：**每天5分钟科普 · DNA存储**

画面以影片中的虚构家庭影像作为生活入口，少量边缘图块连接到双螺旋，呼应编码、冗余和恢复的主题。Blender 重新搭建场景，Pillow 后期合成准确中文与用户原始透明 Logo。横竖版本分别调整主体和标题位置，没有裁切带字横版充当竖版。

## 成品

`covers/` 内提供 RGB/sRGB、质量95、4:4:4 JPG 和同尺寸 PNG：

| 比例 | 尺寸 |
|---|---|
| 16:9 | 1920 × 1080 |
| 4:3 | 1920 × 1440 |
| 3:4 | 1440 × 1920 |
| 9:16 | 1080 × 1920 |

`四比例预览.jpg` 为排版联系表；`手机缩略图检查.jpg` 保留长边320和160像素的实际小图。

## 可编辑材料与复现

`artwork/` 保存四版带打包纹理的 `.blend`、无字渲染和物体投影保护区。`layout-config.json` 与 `covers/layout-*.json` 保存排版、文字边界和品牌参数。`source-record.json` 记录来源、哈希、实际工具及检查结果。

在 DNA 项目 v3 目录运行：

```powershell
& 'D:\blender\blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/build_cover_v5_blender.py
python scripts/compose_cover_v5.py
```

低成本预览分别追加 `-- --preview` 和 `--preview`。字体使用本机 Noto Sans SC。原始 Logo 与视频源码未修改。

家庭影像复用本片此前 Qwen 生成素材，身份为虚构示意；新封面没有新增付费生成调用。DNA 为概念建模，不是实验显微照片。素材来源详情见 `source-record.json` 与项目的 `research/tool-family-memory.json`。

四版实际尺寸、色彩模式、ICC、JPG采样和文字/物体保护区均检查通过；已逐版检查预览，并检查正式联系表、手机小图及横竖单图。旧封面保留。
