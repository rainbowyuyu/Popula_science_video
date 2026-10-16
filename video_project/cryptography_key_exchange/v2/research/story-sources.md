# V2 故事与科学依据

联网读取日期：2026-10-14。本轮实际通过 HTTPS 获取并阅读下列文本，没有声称看过未打开的视频，也没有把搜索摘要当作论文结论。

## 已实际获取和阅读

1. **Diffie–Hellman key exchange**，Wikipedia，访问日期 2026-10-14。<https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange>
   - 本地：`dh-explanation.html`、`dh-explanation.txt`。
   - 读取了原理、含 `g=5,p=23,a=6,b=15` 的谁知道什么示例、主动中间人攻击说明。
   - 用于解释路径与小参数示例核对，不作为“参数达到安全级别”的依据。解释页明确指出未认证DH可被主动调包者拆成两次交换。
   - 页面内容受 Wikipedia 对应许可约束；影片旁白为重新组织的表达，不整段复制文章。

2. **Whitfield Diffie & Martin E. Hellman, “New Directions in Cryptography”**, IEEE Transactions on Information Theory 22(6), 644–654 (1976). DOI: **10.1109/TIT.1976.1055638**。
   - 原始PDF：<https://ee.stanford.edu/~hellman/publications/24.pdf>
   - 本地：`diffie-hellman-1976.pdf`、经 PyMuPDF 提取的 `diffie-hellman-1976.txt`。
   - 阅读 public-key distribution 与模幂/离散对数讨论，重点是公开交流后两端得到相同值，以及数字签名与身份认证问题。
   - 扫描版 OCR 有字母/指数识别错误，片内所有小例公式均重新用 Python `pow(base, exponent, modulus)` 计算，没有抄 OCR 数字。
   - 论文年代和作者供片尾引用。原论文版权归相应权利人；纸页截图仅作有署名的论文引用展示，不标为自制论文或开放授权模型资产。

3. **Eric Rescorla, RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3**，August 2018。
   - <https://www.rfc-editor.org/rfc/rfc8446.txt>
   - 本地：`rfc8446.txt`。
   - 实际阅读 §2 握手概览，§4.4.3 Certificate Verify、§5.2 Record Payload Protection、§7.1 Key Schedule，并查看信任锚相关文本。
   - §4.4.3：CertificateVerify 证明端点拥有与证书对应的私钥，并保护此前握手内容完整性；签名输入包含握手记录的哈希。
   - §5.2：TLS 1.3 记录保护统一采用 AEAD，包含 key、nonce、plaintext 与 additional data；解密验证失败须终止连接并报 `bad_record_mac`。
   - §7.1：从共享秘密等输入经 HKDF 派生不同用途的密钥，支持“共同秘密要加工成会话钥匙”的解释。
   - 本片讲首次使用证书的常见服务器认证路径，不声称所有 TLS 连接都必须重新传证书；预共享密钥和恢复连接等分支不在五分钟主线内。

## 主张对应

| 句段 | 可核对内容 | 依据 / 证据 |
|---|---|---|
| s04—s07 | 预共享钥匙难以扩展；公开交换结果后各自得到共同秘密 | Diffie–Hellman 1976；解释页 |
| s08—s11 | `5⁶ mod23=8`，`5¹⁵ mod23=19`，`19⁶ mod23=8¹⁵ mod23=5⁹⁰ mod23=2` | `toy-dh-calculation.json`；`verify_crypto.py` 实际断言 |
| s12 | 小数示例不安全，实际需经过研究的参数与数学结构 | 解释页及 RFC 8446 对标准组的规定；不在片内编造破解时间 |
| s13—s16 | 未认证交换可遭主动中间人攻击，分别建立两份秘密 | 解释页中 man-in-the-middle 段；原论文认证问题讨论 |
| s17—s21 | 证书关联服务身份与公钥；签名绑定本次握手；信誉不由证书担保 | RFC 8446 §2、§4.4.2—§4.4.3；应用层域名匹配由浏览器执行 |
| s22 | 共享秘密经过密钥派生后保护应用数据 | RFC 8446 §7.1 |
| s23—s28 | 认证加密同时保护内容与完整性；篡改导致拒绝 | RFC 8446 §5.2；本地 X25519→HKDF-SHA256→AES-256-GCM 实验 |
| s29—s32 | 加密不能迫使中间人转发消息；身份与机密性的直觉回收 | TLS保护目标与通信模型；送信人物和地点是原创叙事类比 |

## 实验的真实范围

运行：`python research/verify_crypto.py`。

本轮实际输出：`PASS: DH toy arithmetic; X25519 agreement; HKDF-SHA256; AES-256-GCM exact roundtrip; 1-bit tamper -> InvalidTag`。

- 原文：**今晚八点，老地方。**
- 两端 X25519 共享秘密相同，HKDF-SHA256 派生的 256-bit 密钥相同。
- 正常密文解密后逐字节恢复同一原文。
- 将密文首字节 **E6 改为 E7**，只翻转最低一位，保留原认证标签；实际收到 `InvalidTag`，不返回明文。
- 结果同时保存到 `authenticated-encryption-demo.json` 与 `../src/crypto-evidence.json`，供画面直接读取，禁止动画临时随机产生密文字节。
- 固定种子和 nonce 都是公开教学输入，以便重新渲染时可复核；不得用于真实业务。本实验没有执行网站证书链检查，也不是完整 TLS 抓包记录。

## 故事与证据分界

信使、路、封口、钥匙、建筑和纸面文字变形是艺术化解释，允许改变尺度。模运算数字、真实实验字节、验证成败、作者年份和协议职责必须来自以上台账。开场“八改九”为威胁想象；实际加密实验只翻密文比特，绝不暗示可以把任意密文精准改成想要的明文字句。
