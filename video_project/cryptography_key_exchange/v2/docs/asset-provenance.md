# 让小偷送秘密 · V2 实际制作资产

生成时间：2026-10-14T14:26:01.312Z。本表记录实际输入，源码哈希是此时快照；主制作端若继续修镜头，请重新运行 `node scripts/build_asset_manifest.mjs`。完整 SHA-256、尺寸、来源和版本见 `asset-provenance.json`。

## 实际进入画面的模型

| 画面 | 实际来源 | 使用状态 |
|---|---|---|
| 钴蓝夜城、路灯、邮筒、目标窗和门 | Blender 5.1.2 程序化原创建模；night_city.glb | Environment 加载 City / PostBox / WindowFrame / DeliveryDoor |
| 主角信封、纸、信使无人机、钥匙 | Three.js / Courier.ts | 实际动画主体；没有用 GLB 的 Envelope 模板 |
| 模幂齿轮与中间人交换 | Three.js / ExchangeRoom.ts | 原创机制示意；数字来自已计算数据 |
| 证书、身份公钥、签名和拒绝轨道 | Three.js / IdentityRoom.ts | 原创机制示意；没有进行真实网站证书验证 |
| 密文通道、标签、核验门和恢复文字 | Three.js / DeliveryFlow.ts | 字节与验证结果读取本地实际密码实验输出 |
| 光照、反射、雾、颗粒、连接走道与镜头 | Three.js / Lighting、World、Camera | 固定帧驱动的程序化设计 |

Blender GLB 共 180,787 个三角形、4,272,148 字节，米制、glTF Y-up；没有外部贴图。GLB 内 Envelope、CipherWheel、Certificate 三个库根节点被隐藏，当前 World 未调用 cloneAsset，不把它们计为已采用的成片模型。湿地反光和发光窗是材质效果；没有真实雨水、流体或扫描高斯资产。

## 图像、字体与参考

- Logo 使用用户 `C:/Users/zju/Desktop/logo/logo.png`，复制文件 SHA 与原件一致：true。片中仅施加CSS反色/混合，旁边 rainbow鱼 为独立排字。
- 实际纸页是 Diffie 与 Hellman（1976）《New Directions in Cryptography》第一页，从旧版保留的PDF渲染图逐字节复用。V2另有一张重新渲染的同一页，两者不是同一个PNG；清单区分实际显示文件与备查文件。作者与年份写在图像外。原文：https://ee.stanford.edu/~hellman/publications/24.pdf 。论文权利归相应权利人，按有署名引用记载，不声明开放素材授权。
- 系统字体请求 Microsoft YaHei / Arial；未复制或分发字体二进制。所有标注、标题、字幕和公式由本地DOM或Canvas排版。
- Ordinary Folk / Nightdrive仅作静态审美参考；没有复制其素材。详见 `research/visual-reference-v2.md`。

## 声音

32句旁白采用用户本地 Qwen3-TTS-0.6B 与既有 rainbow鱼 参考音色重新生成，私人参考文件未复制进项目；每句参数、种子、源长和哈希见 `work/audio/voice-generation.json`。母带304.3秒、48kHz、双声道，技术结果见 `docs/audio-production.md`；未声称已经人工逐句听审。

音乐为用户指定《华尔街Thirteend - Claude小曲2.0(Remix版)》，保留原开场，使用乐句对齐的两处循环交叠与旁白避让。原录音的公开发布/商业许可本轮未核验，不写为原创、CC0或免版税音乐。

## 外部工具实际采用情况

- Blender、Three.js、Remotion、本地Qwen TTS：实际使用。
- Claude Opus 5.5：原生组件委托尝试超时；没有完成输出，partial未采用。保留调用report，不标为成功协作生成。
- Qwen/Wan生成视频、Lux3D、WaterPro、真实高斯扫描：V2未采用。

## 核心文件哈希

```text
public/models/night_city.glb: a2acb960c474739090c4d06fb4e74b0172af961a787afd04edf38a54bc8e622f
public/brand/logo.png: d06cdbd8377a82513ba4a4f5172defb6eccfb5e3f17f4ddebe2af2a9bfb9637a
public/papers/diffie-hellman-1976.png: 6883dcec1b89bad97f7e51fbc136ead8f2a97edc257f1911f07128b6e1a56600
public/audio/master.wav: 8459a2feb9f62c1926d98932d42e945204e12db6ce4762c61020a47432a6cb6a
D:/CloudMusic/华尔街Thirteend - Claude小曲2.0(Remix版).mp3: cdc5638dbee9550cc827bb43b37acb9b0aac7ac51e79131e0a691f986d8ded4b
```

全量源码、Blend、论文、品牌、逐句raw/clean音频的哈希在JSON中；最终MP4的编码/时长/音画检查由独立成片QA负责。
