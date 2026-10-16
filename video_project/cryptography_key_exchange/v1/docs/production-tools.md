# 本片实际制作与证据记录

本记录对应“咖啡店订生日蛋糕 → 公开线路如何约定秘密 → 身份核验 → 订单回到生活”的密码学科普片。当前声音时间线为 **310.133333 秒、36 句原速旁白**；1920×1080、30 fps，总计 9304 帧。最终编码文件及完整检查状态以 delivery 和 work/qa 中实际结果为准。

## 实际采用的制作工具

| 环节 | 实际执行 | 采用范围与边界 |
| --- | --- | --- |
| 三维建模 | 本地 Blender 5.1.2；`D:/blender/blender.exe --background --factory-startup --python scripts/build_props.py` | 程序化原创 9 件道具，默认 glTF Y-up、米单位，48,668 三角面，GLB 约1.1 MB，无外部贴图。源 `.blend` 与生成脚本保留。 |
| 已入片 Blender 模型 | `src/Assets.ts` 从 `public/models/crypto_props.glb` 加载 `Cake` 与 `CoffeeCup` | 分别在开场及结尾放置，共4处；细蜡烛、烛芯及暖焰由 Three.js 增补。实际屏幕截图已确认两层蛋糕、奶油、樱桃、陶瓷杯口与杯柄可见。 |
| 已生成但未入片模型 | `Phone / Laptop / Gateway / LockBody / LockShackle / Capsule / CafeTable` | 位于同一 GLB 作为可复用资源；不能声称它们已用于本片。片中手机、锁、身份印章、传输装置由 Three.js 程序化构建。 |
| 三维机制与相机 | Three.js、`@react-three/fiber`、`@remotion/three` | 同一连续横向空间；PerspectiveCamera；按时间键点作三次 Hermite 插值，位置与目标在内部键点一阶连续。对象依 cue 时间运动，可乱序重渲染。 |
| 材质与灯光 | 原创 PMREM 摄影棚环境、暖主光/冷补光/轮廓光、ACES 色调映射、VSM 阴影 | PMREM 使用程序化灯箱生成，无下载HDRI。地板接触暗影为视觉辅助，非光线追踪/物理解算结果。透明玻璃和反射仅用于展示层次。 |
| 排版与输出 | React / Remotion；Chromium Vulkan；FFmpeg | 标签与字幕由程序生成；字体为 Microsoft YaHei/Arial 回退。声音最终由 FFmpeg 直接与画面合并，避免反复有损转码。 |
| 标志 | `C:/Users/zju/Desktop/logo` 的用户原有 rainbow鱼 标志 | 左上角品牌；原件保留。 |

本轮没有执行 Claude 外部代码生成、Lux3D计费建模、Qwen/Wan视频生成、WaterPro商业水面、真实高斯扫描、真实流体求解。使用了**本地 Qwen3-TTS 语音模型**，应与云端 Qwen 图片/视频服务区分。

## 算法与科学内容的证据边界

- 小数 DH 示例来自 `research/toy-dh-calculation.json` / `src/math-evidence.json`：p=23、g=5、私数6/15、公开值8/19，双方共享2。逐次余数、指数90、穷举到6均保存为可复核数值；这些小数字不具有实际保密性。
- 主动替换示例使用已计算的中间人公开值21（发给用户）及17（发给网站）。中间人与左端共享18，与右端共享15。影片以绿/蓝两套钥匙表示两份不同秘密，不把额外数字挤进旁白。
- 混色是交换流程的直觉类比。液体颜色插值、透明杯、传输路径、金属钥匙和印章都是教学模型，不证明实际密码安全性，不声称执行颜料混合/流体仿真。
- 证书、域名、公钥及签名的动画展示身份认证关系；签名跟随同一握手记录，修改记录后红×拒绝。这里没有执行浏览器证书链、CA签名验证或完整TLS握手；不能把动画印章写成实测密码签名。
- `research/authenticated-encryption-demo.json` 来自本地 Python `cryptography 49.0.0` 实际计算：X25519 → HKDF-SHA256 → AES-256-GCM。保存原文“蛋糕少放糖”、真实密文/认证标签、nonce、AAD、单比特篡改后的拒绝结果。采用公开教学种子，不能用作生产密钥；它是原语演示，未实现完整TLS协议。
- 片尾论文与资料包括 Diffie & Hellman（1976）《New Directions in Cryptography》和 RFC 8446（TLS 1.3，2018）。保存的论文页及研究记录用于出处核对，不宣称本片得到作者或机构认可。

## 配音与配乐

- 采用用户现有 `D:/python_project/tts` 工作流及 `models/Qwen3-TTS-0.6B`，本地CUDA推理；既有个人rainbow鱼音色参考。
- `work/audio/voice-generation.json` 保存逐句模型参数、随机种子、参考音色哈希、权重哈希、源文本、实际时长与音频哈希。展示文字与读音文本分开。最终36句，未整体变速、未截断字尾。
- 配乐源为用户指定的 `D:/CloudMusic/华尔街Thirteend - Claude小曲2.0(Remix版).mp3`。源 SHA-256：`cdc5638dbee9550cc827bb43b37acb9b0aac7ac51e79131e0a691f986d8ded4b`。使用用户提供文件不等于获得对外平台发布许可；本项目未另行取得音乐版权许可。
- 保存 beat/乐句分析，估计速度120.19 BPM。选择原曲21.3159—117.8413秒约48小节段；在总片117.8413与214.3666秒处接回，约2.0201秒等功率交叉过渡。音乐在旁白处平滑降低约4.4 dB；保留独立旁白/音乐声部。
- 当前音频数值报告：48 kHz双声道，−16.04 LUFS，WAV真峰值−1.50 dBTP；AAC预编码测得−1.35 dBTP。`work/audio/audio-qa.json` 标明尚未完成主观全片听审，数值通过不等于主观听感已经全部确认。

## 本次完成的检查

1. Blender实际生成GLB与源Blend；解析glTF记录9个根对象、面数、大小、无外部纹理；查看Cycles代表帧。
2. 实际加载GLB，检查两处Cake和两处CoffeeCup均替换，镜头代表帧确认已显示。修复异步加载后未显式绘制导致旧Primitive残留的情况。
3. `npm run check` 类型检查；相机由实际源码编译，每帧采样位置/目标/FOV，数值及内部节点C1检查见 `work/qa/camera-audit.json`。
4. `scripts/qa_culling.mjs` 在独立Node几何环境中加载真实World/Camera/机制模块和GLB，检查当前14次站点可见性开关各前后1帧，共42个时点。按实际mesh变换后的AABB测试主相机视锥，排除被不透明地板遮住的几何。修复身份印章/编辑块退场后撞入下一站，最终零可见交叉，见 `work/qa/station-culling-audit.json`。
5. 上述几何检查不代替正常速度播放、文字遮挡和主观音频检查；最终交付前的代表帧/转场/编码验收由主制作流程记录。

## 重建与保留

保留 `scripts/build_props.py`、`work/models/crypto_props.blend`、`public/models/crypto_props.glb`、`docs/asset_provenance.json`、逐句源WAV及实际句时间线、音乐源哈希与循环点、论文资料、算法计算记录、源码与锁文件。无需复制用户私有TTS权重或参考音色到交付包。生成的临时bundle可重建；最终验收前不清理当前依赖。
