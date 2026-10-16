# 彩虹形成与弧形：研究笔记（2026-10-10）

更新时间：2026-10-10（Asia/Shanghai）。

用途：5 分钟中文科普片的事实底稿与可视化镜头规划。物理画面建议全部用 Three.js/Blender 自建，实拍图片只作片头/转场氛围，避免把示意图误当真实摄影。

## 可核查事实

1. **形成条件**：太阳光在空中水滴中发生折射、色散、一次内反射，再从水滴出射并再次折射。观察者必须让太阳在身后、含水滴的雨幕/喷雾在前方。来源：[Met Office, Rainbows: optical wonders](https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows)；[Atmospheric Optics, Primary Rainbow](https://www.atoptics.co.uk/blog/primary-rainbow/)。
2. **主虹颜色与角度**：主虹红色在外、紫色在内；相对反太阳点的半径约 42°（红光约 42.5°、蓝光约 40.6°，颜色是连续光谱而非七条硬线）。来源：[Atmospheric Optics, Primary Rainbow](https://www.atoptics.co.uk/blog/primary-rainbow/)；[Wikipedia, Rainbow](https://en.wikipedia.org/wiki/Rainbow)（数学补充）。
3. **为什么是弧形**：满足约 40–42°出射方向的水滴围绕“观察者—反太阳方向”组成一个圆锥；圆锥与天空方向的交集是圆。地面遮住下半圆，所以地面观察通常只看到弧；在飞机、高处或瀑布喷雾上方可能看到整圆。来源：[Met Office](https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows)；[Wikipedia, Rainbow](https://en.wikipedia.org/wiki/Rainbow)。
4. **彩虹没有固定地点**：不同观察者收到的是不同水滴射来的光；移动观察者时，满足角度的水滴集合也随之改变，所以每个人看到的是自己的彩虹。来源：[Wikipedia, Rainbow](https://en.wikipedia.org/wiki/Rainbow)（“all rainbows exist according to observer viewpoint”段）。
5. **太阳高度**：反太阳点在地平线下、与太阳高度相反；太阳越低，主虹在天空越高。太阳高度超过约 42°时，主虹的最高点也可能落到地平线以下。来源：[Atmospheric Optics](https://www.atoptics.co.uk/blog/primary-rainbow/)；角度关系可由反太阳点和 42°半径在镜头中直接作几何演示。
6. **副虹**：阳光在水滴内发生两次内反射，出射方向约 50–53°，通常在主虹外约 9–10°；颜色顺序反向，亮度更低，主副虹之间是 Alexander 暗带。来源：[Met Office](https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows)；[Atmospheric Optics, Secondary Rainbow](https://www.atoptics.co.uk/blog/secondary-rainbow/)。
7. **小水滴与其他现象**：雾虹由更小的雾滴形成，衍射和波动效应抹平颜色，因而宽而发白；小水滴还可能在主虹内侧出现淡淡的超数弧。来源：[Met Office](https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows)；[Atmospheric Optics, Primary Rainbow](https://www.atoptics.co.uk/blog/primary-rainbow/)。
8. **颜色的表达**：白光包含连续波长；水的折射率随波长变化，红光出射角略大、在外侧，蓝/紫更靠内。Newton 的“七色”是帮助记忆的分段，并非自然的七条边界。来源：[Met Office](https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows)；[Wikipedia, Rainbow](https://en.wikipedia.org/wiki/Rainbow)。

## 5 分钟镜头与叙事骨架

- **00:00–00:25 生活钩子**：雨停、太阳从身后照来；镜头沿雨滴前移，一条弧从画面外滑入。旁白问“它为什么总像一座桥，却永远走不到？”只留标题，不堆文字。
- **00:25–00:55 条件与方向**：从观察者肩后环绕，太阳、观察者、雨幕形成一条轴；把“反太阳点”作为唯一关键标记，配一条柔和指示线。
- **00:55–01:45 单滴光路**：真实球形水滴微距。白色平行光束入射；用渐变色拆成连续谱，显示入射折射→后壁内反射→出射折射。用两条轨迹同时追踪红/紫，屏幕角落只显示“42°”。
- **01:45–02:35 圆锥到圆弧**：镜头从单滴拉远，复制少量水滴成雨幕；只高亮满足角度的环带。让圆锥旋转半圈，地平线作为遮挡裁掉下半圆，再从地面视角恢复弧形。
- **02:35–03:05 观察者移动/整圆**：相机平移，上一组高亮水滴沿屏幕外移出，另一组平滑接管；切换到飞机高度，地面遮挡下移，完整圆环出现。
- **03:05–03:55 副虹**：同一水滴保留主虹光线，增加第二次内反射；主虹与副虹分别渐亮，颜色顺序反向，中间暗带自然留下，不做硬切换。
- **03:55–04:25 水滴大小**：大雨滴→饱和主虹；小雾滴→宽而发白的雾虹；喷泉/瀑布喷雾用局部粒子场重现。
- **04:25–04:50 七色疑问**：将连续光谱沿弧展开，七色文字只在最后短暂浮现并合回一条渐变带；说明“七色是人类的分段方式”。
- **04:50–05:00 收束**：镜头沿反太阳轴回到人物背后，留一句“下次看到彩虹，先找太阳，再看自己站在哪里”。Logo/署名随环境光出现。

## 视觉与技术实现提示

- 世界单位固定为米，水滴直径和粒子间距不随镜头缩放；使用物理相机路径和对数 dolly，避免“模型突然变大”。
- 主/副虹用角度参数生成环面或粒子圆锥交线；不要把彩带贴在远景天空上。用真实光线方向和 camera forward 计算高亮水滴。
- 连续转场沿同一条“观察者→反太阳点”轴运动：单滴特写 → 水滴阵列 → 圆锥 → 地面弧；透明度缓慢变化，不使用整页淡入淡出。
- 关键标记不超过 5 个：`反太阳点`、`折射`、`色散`、`内反射`、`42°`；中文大字、统一字体和安全区。
- 实拍可选素材只作氛围/验证：Wikimedia Commons `A rainbow at sunset after rain in Gaziantep, Turkey.IMG 2448.jpg`（CC BY 4.0）、`Rainbow created by Dettifoss Waterfall spray, Iceland, 20240716 1459 1523.jpg`（CC BY 4.0）、`Double rainbow, Graz, Austria, 2020-04-27.jpg`（CC BY-SA 3.0）。片尾写作者、来源和许可证。

## 本地工程复用点

- `src/V5CameraPath.ts`：物理锚点、`opticalEase`、对数距离插值和跨尺度 handoff 可直接移植为彩虹镜头路径。
- `src/V5World.ts`、`src/V5Film.tsx`：ThreeCanvas、透明/剖切材质、标签投影和固定标尺的实现模式可复用；不要复用人体坐标。
- `public/brand/logo.png`、`public/fonts/{sans,serif,unified}.woff2`：品牌与统一字体。
- `public/models/` 是人体模型库，与彩虹片无关；不应在彩虹片中展示，除非作为系列统一片尾的极短幕后技术路线。

## 资料使用边界

Met Office 和 Atmospheric Optics 页面用于事实核对和文案改写，非直接搬运。Atmospheric Optics 的照片有各自作者/许可，若使用原图需逐张核对版权；本片优先程序化 3D 重建。Wikipedia 只作为公式与几何的二次核对，不作为唯一事实来源。
