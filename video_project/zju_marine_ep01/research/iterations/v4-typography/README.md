# V4 世界文字与36期展廊

访问日期：2026-10-13。实现文件 `src/WorldTypography.ts`，条目 `data/series36.json`。

## 实际参考与采用

- Three.js 官方 `webgl_geometry_text.html`（HTTP 200；读取源码并实际查看官方 JPG 预览）：https://threejs.org/examples/webgl_geometry_text.html 。采用真实 TextGeometry 挤出、正面/侧面分材质、侧光刻画厚度；字属于主场景，因此能参与水面反射。没有使用示例中的实时动画循环与交互随机。
- TextGeometry 官方文档：https://threejs.org/docs/#examples/en/geometries/TextGeometry （HTTP 200）。用 FontLoader 字形轮廓生成实体，标题 depth 为字高5.5%，轻微倒角；非Canvas贴图、非CSS透视、非屏幕HUD。
- Adobe 3D camera tracker 旧链接返回404，不把它计为已看案例。网上 Remotion 3D rule 旧链接亦为404，改为读取已安装 Remotion 路由说明；本轮无需安装额外依赖。浏览器IAB不可用，网页参考访问范围限源码、文档和官方静态预览，未虚构已看视频。

## 设计与约束

- 0.1–8.7秒片头、第一期问题、片尾用无底板的场景字。品牌区域由主合成统一处理。
- 36.04–62.96秒6组，每组2列×3行，均为独立世界锚定对象。标题约40px、简介约28px，组标题约58px（1920×1080参考中帧）。简介最长10个汉字，均不超过18字。
- 每组参考相机只采样一次，位置与朝向固定，不在update中看向相机。相机掠过时字产生视差；入出场由实体沿局部水平轨道移动，完全离开主视锥之后才停用。无全场淡黑，无逐帧跟随相机的billboard。
- 展廊最终为薄墨蓝陶瓷板、浅色挤出字、黄铜编号。片头和片尾不设背板；展廊背板采用 opaque/depthWrite=true，解决与海水透明排序造成的截断。它有真实厚度、可受光和参与反射，不宣称是物理建筑物。
- 字体为本机 Noto Sans SC Variable 的wght=680轮廓子集，OFL随附。字幕仍由主合成统一，字体家族同为无衬线中文；挤出几何来自字形曲线，未嵌入有额外许可的系统微软雅黑。
- 第02/03集顺序与原V3规划存在冲突：当前片尾旁白下一期讲叶片。已按主任务决策交换02（叶片升力）/03（尾流），其他编号与主题不动，修订清单在 `research/iterations/v4/series36-revised.md`。没有修改旧V3交付包。
- 没有经核查的具体团队成果本轮不列。软件只列实际使用的 Blender、Three.js、Remotion。

## Opus状态

调用 `work/opus-runs/typography-498c51e9383a4e029e0f22243cdfa75e`，native、claude-opus-5-5、low、5000tokens、300秒。报告为 `total_timeout`、completionReceived=false、returnedModel=null；仅23字符残稿，没有采用。保留report.json与response.partial.md，没有切换供应商/HTTP重试。全部正式几何与排版由Codex本地实现。

## 已检查和待集成

- `npm run check`：通过。
- `node work/typography/render-qa.mjs`：7张独立场景静帧生成成功。实际查看片头、第1组、组末相机视差、片尾。字体无缺字，无遮挡，文字布局底端约800px，字幕保留900px以下空间。
- 这是隔离的文字材质/布局检查，不是主成片海水反射或场景遮挡最终验收。主成片集成后仍需查看海面反射、机舱/叶片是否进入文字前景以及字幕与Logo关系。

## 集成

在MarineWorld完成Scene/Camera创建后：

```ts
const typography=createWorldTypography(scene,camera);
// 每帧，更新相机后、renderer.render之前
 typography.update(t,camera);
// dispose时
 typography.dispose();
```

主合成移除overview大标题/底部黑条、hook问题、ending文字的旧HUD，保留统一字幕与品牌。不要每帧重新创建或重算文字锚点。

## 主场景第二轮修复（2026-10-13）

主场景帧1148显示水面覆盖了半透明展板下半部：文字为opaque仍可见，玻璃板transparent/depthWrite=false在水面之后排序，造成视觉截断。改为不透明、depthWrite=true的薄墨蓝陶瓷板，保持真实几何边缘与反射；展板整体抬高2.65m。新主场景1148、1675、1772抽帧确认整板连续，不再被海水从中间截开，实际文字与反射分别位于水面上下，不交叠。没有使用renderOrder强行压水的屏幕层补丁。

片头改为左侧二级布局：小号浙江大学、大号海洋新能源、第一期 海洋风电总览；无悬空中点。主轮毂保留在右半画面。片头/问题/片尾正面改深墨蓝，侧边浅金，厚度从10.5%降为5.5%，避免浅色字被海天反光吞没。

实际主场景QA脚本：`node work/typography/render-main-qa.mjs`。输出在`work/typography/main-qa/`。查看了72、132、210、1148、1485、1675、1772、10873帧：片头文字随相机掠过左侧自然离开视野；片尾墨蓝字在浅海上清楚；所有展廊字在字幕区上方。`npm run check`通过。主场景渲染会提示上游RGBELoader弃用提示，不影响渲染完成。

## 最终文字入場复查（2026-10-13）

- 首帧开场字原先在右边缘露出，已延长入场离屏距离至290世界单位；0秒完整帧确认侧边无残字。
- 片尾原来的局部横滑方向与入场时镜头不一致，会穿越近面导致字号扑面；改为初始化时采样入场相机的世界右向并冻结为滑轨，保留真实世界位置与透视。
- 片尾入场现在从字幕“下一集”的时间自动计算，在该字幕前0.80秒开始滑动。当前首次字形进入画面为360.60秒，“下一集”字幕从360.69秒开始，避免提前约5秒预告。
- 片尾字以180米参考距离、按比例字号锚定，screenY=22×(180/104)抬高实际世界坐标。软件行已脱离前景建筑屋顶，标题与副行均在浅海/天空负空间内。
- 深度密集检查104帧：最近顶点119.90米、入场可见字组最大高度246.22像素，无近面穿越。
- 主场景最终抽帧0、60、10831、10863（0、2、361.03、362.10秒），实际看过四张。水shader正常，无编译错误，品牌、文字与字幕互不遮挡。片尾软件行未被建筑裁断；三维实体允许对远处风机产生正常前后遮挡。
- 4张结果：`C:/Users/zju/Videos/rainbow-marine-ep01-v4/work/typography/`。渲染脚本：`work/typography/render-entry-qa-c.mjs`；复用C盘同一bundle，未删除D盘历史bundle。
- 前一轮18张因上游水shader保留字patch失败，不计完整画面验收，只用来定位文字入场问题；已修复水shader后重新打包并复查上述4张。
- 最后 `npm run check`通过；`scripts/audit-v4-motion.mjs`的11,015帧数值审计无硬失败、乱序seek确定性通过，状态仍为NUMERIC_VALID_WITH_REVIEW。速度/安全区的5类提示需由主任务结合整片检查，并不等同于全片视觉通过。

完整审计输出与每份源码SHA256在`work/qa-v4/motion-audit.json`；所有大型新增QA使用C盘，保留可恢复源文件和原始资产。
