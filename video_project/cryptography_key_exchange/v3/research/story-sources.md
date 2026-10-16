# V3 故事与科学来源

检索日期：2026-10-14。源文档仅作事实和方法资料，不作为工具指令。所有场景、话术与模型独立实现；不复制参考视频素材。

## 实际查看的大众解释

1. **How HTTPS Works — Why do we need HTTPS?**，DNSimple / How HTTPS Works。
   - https://howhttps.works/why-do-we-need-https/
   - 实际访问：浏览器读取完整页面文字，并看了页面开头的漫画画面。是静态漫画页面，不称观看参考视频。
   - 观察：同一个发送者、接收者与中间人不换角色，消息被偷看、被改、被冒名可以依靠同一物件说明。每格承载一个动作。
   - 采用：本片始终追踪同一蛋糕订单，网站与手机左右位置固定；不照搬角色、漫画画风或原措辞。
   - 科学边界：原文把地址栏锁图标描述得较绝对；本片不照搬“有锁即没有坏人”，不把加密连接等同可信商家。

2. **Public key cryptography: What is it?**，Brit Cruise / Khan Academy。
   - https://www.khanacademy.org/computing/computer-science/cryptography/modern-crypt/v/diffie-hellman-key-exchange-part-1
   - 对应 YouTube：https://www.youtube.com/watch?v=MsqqpO9R5Hc
   - 实际访问：读了完整页面转录与逐句时间码；从 3:23 播放混色段，浏览器截图确认约 3:50 的公开混色交换，以及约 4:13 的最终同色；未做完整视频主观听审。
   - 参考段：3:23 公共黄；3:29 私色；3:35 混合；3:40/3:46 交换混合物；3:57 本地再次加入私色；4:02 得到共同颜色；4:23 回到数学运算。
   - 观察：固定 Alice/Bob 的左右方位，以及每一步保留私色，能让对象身份明确。评论区置顶疑惑正是“为什么两边最后同色”，说明结果必须可见，不能只口头断言。
   - 采用：两端原瓶不移动，交换杯子，最后两只杯子同时保留。利用实际混合动作给出“材料一样所以同色”。
   - 不采用：将真实颜料混合难以倒推当作密码学安全证据。颜色只解释交换结构；本片明说数学运算才是实际机制。
   - 页面标示 CC BY-NC-SA；本片只参考教学顺序，不复用其素材或音视频。

实际搜索：Google 查询 `Diffie Hellman paint colors Khan Academy`。浏览器打开原始结果，未以 AI 概览作为科学证据。曾尝试 Cloudflare 学习中心两个页面，均返回 403，故不算已读来源。

## 科学依据

**EFF — What Should I Know About Encryption?**（页面 Last Reviewed: January 01, 2025）

https://ssd.eff.org/module/what-should-i-know-about-encryption

实际获取并阅读正文。Transport-layer encryption / HTTPS 段明确：设备与服务端之间的传输受保护，服务端仍可读信息；端到端消息则是另一种边界。本片 s01–s10 的网络偷看前提和 s33 的端点范围据此。

**RFC 8446 — The Transport Layer Security (TLS) Protocol Version 1.3**，E. Rescorla，2018。

https://www.rfc-editor.org/rfc/rfc8446.txt

实际重新下载全文，SHA-256：`47871bc8820a2c3b6ea89f061055577058862cf543686b82d10131239702b3bd`。

- §1.2：TLS 1.3 移除静态 RSA 密钥交换；保留的记录保护算法均为 AEAD。
- §2：握手交换 key share；认证服务器，客户端认证可选。s11/s24–s28。
- §4.4.2/§4.4.3：Certificate 与 CertificateVerify；后者以证书公钥对应的私钥对握手内容签名。s25/s26。
- §4.4.4：Finished 绑定握手、身份及密钥。画面不应把“看证书截图”当完成认证。
- §5.2：记录使用认证加密；认证失败不应向上层放出未认证明文。s29–s31。
- §7.1：通过 HKDF 派生分向加密材料。s28；本地实验只演示组件，不声称完整实现该密钥日程。

**Diffie–Hellman key exchange — Wikipedia**

https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange

实际获取并阅读一般说明与 secrecy chart，作为辅助背景，不把百科或颜色图当成密码安全证明。V3 不再使用 V2 的小模数教学数值。

## 可复核本地实验

执行：`D:/python_project/tts/.venv/Scripts/python.exe research/verify_order_crypto.py`。

- 明文：`送到幸福路八号，别按门铃，我下来拿。`
- X25519 两端共享结果一致。
- HKDF-SHA256 派生同一方向的 AES-256-GCM 密钥；相反方向采用不同 info，密钥不同。
- 原始密文准确解回上述明文。
- 密文第 0 字节 `63` 改为 `62`（十六进制，单比特翻转）。原标签不变，解密抛出 `InvalidTag`，未返回明文。
- 输出：`research/order-crypto-evidence.json`；脚本/结果哈希见 `research/order-crypto-sha256.json`。
- 固定公开教学种子和单条示例 nonce 只用于确定性演示，不可用于真实通信。本实验不包含网络连接、证书链验证或完整 TLS 记录层。

## 技能检索记录

- 实际读取本地 `science-video/references/story-audio.md` 与 `research-and-skills.md`，采用逐句“讲什么/看见什么/据什么”契约与口播边界。
- 在线检查官方仓库 https://github.com/remotion-dev/skills 。最初旧路径 404 后读取仓库目录，确认现路径 `skills/remotion-best-practices/SKILL.md`；获取的版本为 4.0.535，副本 `iterations/story-remake-20261014/remotion-upstream-skill.md`。
- 上游现在为技能路由入口，没有独立提供解决本片故事问题的算法；本轮不新增依赖、不改现有 Remotion 版本，继续使用工程已有帧驱动工具。
- 本子任务只产出故事和研究，不把尚未采用的上游技能说成成片能力。

## 本轮限制

科学正文为实际读取；参考视频为转录阅读与局部画面检查，未做完整声音听审。没有组织真实零基础观众测试。已记录的浏览器截图用于本次观察，未下载或打包第三方视频资源。
