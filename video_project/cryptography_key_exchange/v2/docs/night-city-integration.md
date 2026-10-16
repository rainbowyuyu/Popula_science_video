# V2 午夜城市资产接入

## 实际产物

- `public/models/night_city.glb`：Blender 5.1.2 实际导出，180,787 三角面，约4.27 MB；无外部纹理。
- `work/models/night_city.blend`：可重渲染源模型。
- `work/models/night_city_preview.png`：实际 Cycles 32-sample 代表图，已查看。
- `scripts/build_night_city.py`：全部原创程序化建模代码。
- `src/Environment.ts`：Three.js 独立加载类，无 Remotion/camera 依赖。
- `docs/night-city-assets.json`：各根对象、尺寸、位置、来源、哈希。

## 坐标

使用米单位、glTF默认Y-up、右手坐标。城市范围x±20、z±25；建筑顶端23.77m，街道基础向下延至−0.28m。中央通道x±3.5沿Z轴延伸。

| 根节点/锚点 | xyz | 用途 |
| --- | --- | --- |
| City | 0,0,0 | 蓝色街道、建筑、固定暖窗、路灯 |
| PostBox | −5,0,0 | 珊瑚色珐琅邮筒 |
| 投信口 | −5,1.88,0.45 | 主信封对接点，朝+Z |
| WindowFrame | 7,8,−10 | 暖色目标大窗，朝+Z |
| DeliveryDoor | 7,0,−10 | 公寓门口 |
| Envelope | 模板根，加载时隐藏 | 0.240×0.158m折纸信封，正面+Z；由主世界clone、运动 |
| CipherWheel | 模板根，加载时隐藏 | 直径2.70m金属转轮，23刻度，正面+Z |
| Certificate | 模板根，加载时隐藏 | 2.30×3.05m暖纸证书，无文字，正面+Z |

## 环境接口

```ts
const environment = new Environment();
scene.add(environment.root);
await environment.load(actualGlbUrl);
const envelope = environment.cloneAsset('Envelope');
// cloneAsset resets translation/quaternion, clones materials and sets visible=true.
// Choose its teaching scale and animate it in the owning world.
environment.update(seconds);
```

默认显示 City/PostBox/WindowFrame/DeliveryDoor；Envelope/CipherWheel/Certificate为隐藏库。主模型可通过 `cloneAsset()` 或root中同名节点获取，不会被环境update控制。root可整体淡出、移场或更换可见性，主摄影机完全由调用者负责。

环境自带蓝色月光、低强度蓝色半球光、目标窗暖色溢光、邮筒暖边光、4盏路灯及150颗固定种子的低亮浮尘。更新使用绝对秒数，不使用真实时间或随机采样。调用者应设置深蓝场景背景、适当ACES曝光；环境没有覆盖renderer或scene的全局设置。

## 已完成的检查与修正

1. 实际GLTFLoader解析7个独立根，确认Y-up、位置和尺寸。
2. Environment单独TypeScript严格检查通过；实际加载、update、cloneAsset及dispose运行通过。
3. 三次Cycles代表帧制作，实际查看最终图。将挡住邮筒的路灯移到左侧；给目标窗留出建筑凹口，避免邻楼覆盖；修复灰色默认世界为深蓝夜空；地面收至z±25。
4. 最终代表图里邮筒和大窗均无遮挡，街道有连续纵深、冷暖灯光与材质层次。

## 边界

这是艺术化三维模型场景，不是城市扫描或真实高斯泼溅；湿润感来自材质粗糙度与环境光，不代表雨水/流体仿真。字体、数字、加密机制由主场景后期添加。GLB无文字，避免生成文字错误。WebGL里的反射、阴影及机位仍需实际影片代表帧验证，Cycles代表图不能代替最终镜头验收。
