# V5Person 最终模块预览核验

核验日期：2026-10-09。范围是独立 Three.js 人物模块预览，不等同于 V5Film 整片或最终编码验收。

## 实际查看

已查看 contact-1.jpg 至 contact-6.jpg，覆盖全部 22 张最终静态预览：actual-182、actual-5413、blend-half、blend-quarter、blend-three-quarter、eat-back、eat-bowl、eat-close、eat-mouth、eat-rise、eat-side、neutral-body、resistance、stand-back、stand-front、stand-restored、stand-return、stand-side、waist-greater、waist-less、walk-front、walk-side。

- 站姿前/后/侧面、动作混合：四肢连续，衣物覆盖完整；站立复位图与初始站姿一致。
- 进餐前/后/侧面与近景：同一人体、同一餐桌坐标，脚落地；手掌接勺柄，动作是触饭与小幅舀取，没有声称完成吞咽。
- 坐站预览 actual-5413：双膝屈曲，双脚未沉地，人体与椅座关系比先前版本改善。
- 腰腹对照：改变表面轮廓，身高、肢体长度不变；不能把该轮廓示意解释为公斤数预测。
- neutral-body 是裸体中性化网格的诊断图，骨盆仍有局部折面；最终外部生活镜头需保留短裤。

## 数值检查

determinism.json 的非顺序定位最大顶点差为 0。22 个姿态的上臂骨段长度保持 0.2994027388 m，前臂骨段长度保持 0.2033961652 m（浮点误差量级）。这验证几何定位与 IK 骨段长度，不代替皮肤的视觉判断。

## 已知边界

坐姿短裤前缘仍呈弧形开口轮廓，覆盖敏感部位。原图谱不是制作级角色拓扑，没有经过真实手指骨骼绑定；手掌开合与服装均不适合超近特写。部分侧面预览有意裁掉头部，不能用这些测试构图证明最终主摄影机完整。

已有 person-dining-motion.mp4 生成期间经历衣物修订，未作为最后源码对应的连续动作验收。这里不声称看完该短片或 V5 最终影片。

## 对应源码 SHA256

- V5Person.ts：DA9CAF7EF35BBFA1CAAE8B3B0796BDCCA92656EA6AE20F2F69128F43AD8CDD71
- V5PersonWeights.json：FE5B0466E46DC28CCE56075BFCE40285D8F387FD309AC6999642F4DA0A333EE1
- V5Garment.json：46C4C59968077472F61E9D35C57485A800FF43A1686B4D4FD7848CECCA90E9F8

接入说明见 ../V5Person-integration.md。该文件记录 actionWeights、seatedWeight、外部人物与内部器官的责任边界，避免重复乘权重、强制覆盖坐姿或跨模块争用皮肤顶点。

## 后续测量服装修复

V5Person 新增 `measurementWeight`，仅对服装使用测量坐姿映射，含骨盆下移 0.45 m；测量期间 Person 自身道具渐退，Measure 继续独占测量家具。未修改 V5Measure。

新源码 SHA256：96A303F159F1E2196B05C1F82BA1292770371A579358BF4828E5F85BF7140B4E。npm run check 已通过。实际查看 measurement-quarter、measurement-half、measurement-full、measurement-side、measurement-front、measurement-detail 和 stand-restored，测量完成后衣物在骨盆，退出回站姿。也实际查看主 World F18950，确认集成后没有胸部青色硬领。

独立测量过渡 q=.25/.5 时曾观察到 Measure 袖带按最终坐姿位置淡入而身体尚在坐下，存在袖带临时悬空；已反馈主任务。父任务随后报告已修复袖带位置、旋转随姿态权重变化，软管端点逐帧绑定；该后续修复没有包含在本报告已查看的独立 JPG 中，需最终编码复查。坐姿前缘弧形开口及原图谱大腿折面仍保留。
