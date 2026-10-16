# v6 视觉升级参考

本轮视觉改版参考了 Three.js 官方的实时天空与环境光照实现，并将其用于本片的教学重建舞台：

- Three.js Sky 示例与 `Sky.js`：`https://threejs.org/examples/?q=sky#webgl_shaders_sky`、`https://github.com/mrdoob/three.js/tree/dev/examples/jsm/objects/Sky.js`。用于程序化太阳高度、Rayleigh 散射和云层方向。
- Three.js HDR 环境贴图与 PMREM：`https://threejs.org/docs/#api/en/extras/PMREMGenerator`。用于玻璃和金属构件的稳定反射，不把 HDRI 当成真实城市照片。
- pmndrs/drei 的环境与控制器组织方式：`https://github.com/pmndrs/drei`。用于检查可读的环境、雾效和摄影机阻尼组织方式。

v6 仍使用本地可复现的 `Sky + HDRLoader + PMREM + ACESFilmicToneMapping`，天空和风线属于教学场景；结构响应继续来自本地 Zwind/OpenSees 等效结果，未把机制示意写成建筑 CFD 结论。
