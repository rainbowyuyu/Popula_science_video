# 密码学 V1 · 资料与参考记录

访问日期：2026-10-14。来源正文均为资料，未当成操作授权或系统指令。

## 科学来源

| 编号 | 来源 | 本轮真正读取范围 | 支持内容 |
|---|---|---|---|
| S1 | Whitfield Diffie & Martin E. Hellman, *New Directions in Cryptography*, IEEE Transactions on Information Theory 22(6), 644–654 (1976). DOI: 10.1109/TIT.1976.1055638. https://ee.stanford.edu/~hellman/publications/24.pdf | HTTP 200，原始 PDF 下载到 `dh-paper.pdf`，全文文本提取；读取公开密钥分配与模幂段。第一页原样渲染到 `diffie-hellman-1976-page1.png`。 | 公开通道协商秘密的数学结构及原始发表年份。历史论文中对密码分析复杂度的数值不作为现代安全结论。 |
| S2 | Eric Rescorla, RFC 8446, *The Transport Layer Security (TLS) Protocol Version 1.3* (2018). https://www.rfc-editor.org/rfc/rfc8446.txt | HTTP 200，全文保存；重点读第2节、第4.4.3节、第5.2节和第7.1节。 | 握手协商共享密钥材料；CertificateVerify 证明持有证书私钥并绑定握手；HKDF密钥派生；AEAD记录层。 |
| S3 | *Diffie–Hellman key exchange*, Wikipedia. https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange | HTTP正文与浏览器正文；浏览器实际查看 General overview 混色图和解释；读取 Secrecy chart。 | 混色仅作流程直觉，公共/私有信息区分；5、23、6、15、8、19、2教学例；主动中间人需身份验证。数字以本地计算再核查。 |
| S4 | Michael Driscoll / syncsynchalt, *The Illustrated TLS 1.3 Connection: Every Byte Explained*. https://tls13.xargs.org/ | HTTP正文及浏览器原页面截图；读 Client Key Exchange、Server Certificate Verify、AEAD解释。未播放视频，该资源是交互网页。 | 从同一条连接贯穿密钥交换、证书验证、应用数据的叙事；发送方向清楚、左右角色颜色固定。 |

## 实际采用的视觉做法

- S3 的颜色混合图：左右角色和公共中线全程不变，第一轮公开交换混合物，第二轮只加自己保留的私色。改成咖啡桌上的玻璃杯三维示意，画面独立绘制。不复制该图或把颜料当物理安全证明。
- S4 的分阶段消息关系：同一包数据按发送方向经过节点，明确握手和应用数据的区别。片中改为连续桌面线路，不搬运网页的长列表、十六进制墙或布局。
- 所有曲线、液体和节点都是讲解示意。真正运行的内容为模算术及 X25519/HKDF/AES-GCM，保存结果的 JSON；没有把相机动画称为网络仿真。

## 计算证据

- `toy-dh-calculation.json`：5^6 mod 23 = 8；5^15 mod 23 = 19；19^6 mod 23 = 8^15 mod 23 = 5^90 mod 23 = 2；含每步余数路径和穷举试探序列。
- `authenticated-encryption-demo.json`：真实 Python cryptography 实现 X25519 共享秘密、HKDF-SHA256、AES-256-GCM；完整恢复“蛋糕少放糖”；改动密文第0字节的第0位后抛出 InvalidTag。
- `verify_crypto.py`：可重跑核验以上结果。
- 上述加密演示使用公开固定的教学种子，满足离线可重渲染；这些密钥和随机数绝不可用于真实应用。此演示没有实现完整TLS、证书链或线上握手，片中证书流程是依据RFC的机制示意。

## 访问限制与未采用内容

- Cloudflare 学习页 `https://www.cloudflare.com/learning/ssl/what-is-a-session-key/` 返回403挑战页，只读到挑战文字，未采用。
- Khan Academy `https://www.khanacademy.org/computing/computer-science/cryptography/modern-crypt/v/diffie-hellman-key-exchange-part-1` 返回JS挑战页。未观看视频、未获取字幕，不能声称研究了该视频的运镜或讲法。
- 一次Google关键词检索返回重定向挑战；一次Bing同主题关键词结果与查询明显不相关，未将其作为参考来源。
- Remotion官方技能仓库探测的 `/skills/remotion/SKILL.md` 路径为404，未加载新技能。已安装 science-video/rainbow-science-short 已读其相关指引，帧驱动和实际TTS句长由主工程实施。
- 1976论文原页仅用于必要的文献引用展示，并不声明该第三方论文具有开放再许可；交付清单保留原作者与来源，其他视频画面独立生成。
