# Crypto V3 产品资产

2026-10-14 原创建模。以米为单位，Blender Z-up，GLB 自动转换为 Three.js 的 Y-up。全部纹理嵌入 GLB，外发模型无需读取外部贴图路径。

## 接口

| 文件 / 根节点 | 默认尺度与原点 | 用法 |
|---|---|---|
| `phone.glb` / `Phone` | 宽 .075 m，长 .155 m，厚约 .0092 m；底部 Y=0；长边沿 Z，屏幕朝 +Y | `Screen` 为独立网格，可替换 CanvasTexture。GLTF原始 UV，设置 `texture.flipY=false`，画布顶端对应手机的 -Z 端。其他边框/喇叭/摄像孔不改材质。 |
| `router.glb` / `Router` | 宽 .182 m，深 .124 m，含天线高 .126 m | 独立金属端口框、8芯触点、指示灯、天线转轴和散热槽。指示灯节点名以 `StatusLED` 开头，可按帧调发光。 |
| `server.glb` / `Server` | 宽 .22 m，深 .318 m，高 .366 m | `PerforatedAluminum` 为真实开孔网格；后方风扇与孔洞同坐标，不能用不透明面盖住。 |
| `cup.glb` / `Cup` | 杯碟直径 .14 m，高 .085 m | 有真实杯壁/内腔/杯把，CoffeeSurface 为独立顶面。杯碟最低 Y=-.003 m，摆桌时提升 .003 m。 |
| `table.glb` / `Table` | 1.25×.72 m，顶面Y=0 | 实际橡木颜色/粗糙度/法线贴图，约 .5 m 纹理尺度。含桌腿，近景可仅显示 `SolidOakTop`。 |
| `cafebackground.glb` / `CafeBackground` | 背景墙窗，无相机灯光 | 可选；片中需要清爽桌面时不强制使用。 |

各资产导出时均位于原点。建议将整个物理世界等比放大40倍以方便现有镜头；若为示意分开缩放物件，应在电影说明中写明构图尺度而非实测同尺度。

## 材质与光照

- 手机不是倒角立方体：采用平面圆角与独立细小厚度倒角构成，侧边独立金属按键、USB-C 插口、扬声孔和天线隔断。
- 木纹来自 Poly Haven 的 `white_oak_veneer` 2K；作者 Jenelle van Heerden，CC0。下载文件逐一校验官方 MD5，来源/哈希见 `models-textures.json`。
- 陶瓷、拉丝金属、细砂塑料使用本项目固定种子生成的 PNG 粗糙度和法线图；不把大颗粒噪声当真实材质。屏幕是无可读文字的自制示意 UI，占位后由影片动态替换。
- 代表帧采用面积灯、暖白主光和冷白填充；Cycles CPU 24 samples，AgX，1280×800。未使用GPU，避免与TTS抢显存。
- Three 最终可见效果仍取决于环境反射、主光和色调映射。推荐浅米灰背景、柔和面积感主光、少量冷色轮廓，不用全屏霓虹高发光掩盖网格。

## 本轮实际查看的审美资料

1. Apple iPhone 页面 https://www.apple.com/iphone/ 。实际浏览了产品英雄区和浅灰底实物画面。借鉴：细窄金属边缘、克制颜色、玻璃正面与侧边高光分离、主体与留白有明确层级。没有复制网页图片/模型或品牌标志。
2. Fellow Monty Milk Art Cups https://fellowproducts.com/products/monty-milk-art-cups 。实际查看白底双杯摄影。借鉴：奶油陶瓷漫反射、细金属底座、白底接触阴影、产品摄影式柔和光照。模型是原创带把杯，未复制产品几何或图片。

## 检查与局限

已人工看低成本代表帧：咖啡桌、手机近景、路由器端口、服务器。初版服务器镜头过近，改用43mm和更远距离，减弱拉丝法线/粗糙度差异以避免条纹显脏。

这些是通用教学道具，并非任何具体厂商的CAD。端口、内部风扇和手机微结构为合理形状的视觉演示，不能作为工程设计数据。模型不含角色、动作、故事时间线；整片的最终机位、屏幕可读性和字幕遮挡必须由主影片验收。

重建：先用有 Pillow / Numpy 的 Python 执行 `scripts/build_textures.py`，再用 `D:/blender/blender.exe --background --factory-startup --python scripts/build_product_assets.py`。最后运行 `scripts/build_assets_check.py` 校验节点、单位、嵌入资源和GLB边界。
