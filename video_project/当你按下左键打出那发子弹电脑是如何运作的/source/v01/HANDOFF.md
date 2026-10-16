# V01 主导实现交接

## 实际完成，不要重复生成
- `output/v01/mechanism_preview_v01.mp4`：24.000秒，1280×720，24fps，576帧，H.264，刻意无音轨。
- SHA256：`bb6078aa4614cd311436cf0b680e7fcae4717f72eea569f09b8adae2090b8534`。
- `output/v01/local_branch_8s.mp4`：前8秒较短预览。
- `output/v01/preview.html`：本地播放器和分段跳转入口，不依赖外网。
- `assets/v01/mechanism_scene_r2.blend`：142个登记的几何/路径/文本对象（另有相机与灯光），可在Blender直接打开。首版 `mechanism_scene.blend` 保留。
- `work/v01/frames_r2/0001.png` 至 `0576.png`：当前版完整帧；首版仅6个代表帧也保留。
- `source/v01/narration.md`：全片口播草稿，未做TTS、未锁定语速/时长。
- `source/v01/edit_contract.json`：真实片段接点契约，原片/时间码为null，禁止伪造填写。
- `source/v01/shot_timing.json` 和 `subtitles/v01/preview.ass`：仅无声样片时间线，不得当作TTS对齐字幕。
- `references/v01/ledger.json`：原图品牌来源哈希和已访问公开资料状态。

## 已运行与验证
1. Windows Python 3.12.10，Blender 5.1.2、FFmpeg运行成功。当前工程无three/remotion/puppeteer依赖，因此采用本地Blender+FFmpeg；未安装软件。
2. `mechanism.py` 的六项ray/AABB测试通过；origin、door、history/current、hit的数据由scene.py直接读取。门在简化测试中不透射线，不模拟穿透、伤害、后坐/散布、真实引擎与服务器时序。
3. 六张第一版代表帧已生成；实际查看其中0001/0218/0385。发现裁切显示器、交点被门遮挡，R2修正。实际又查看合成review_0001/review_0385，显示器与交点可见。
4. 原始品牌PNG是透明黑线图，深背景对比不足；最终视频给原图加白底托片，不重绘轮廓。托片修订后未再目视检查，inspect_frame达到本轮6张限制。
5. `verify.py` 实测尺寸/帧率/帧数/时长，全片解码退出0，blackdetect阈值：pic_th=.98、pix_th=.1、d=.1；未报黑场。详见work/v01/verification.json及probe/full_decode/blackdetect.log。
6. 没有实际连续观看、没有音轨、没有实际听审、没有音画同步验收。静帧修订检查不能等同最终编码视频全段目视验收。

## 资料事实分层
- Microsoft Raw Input正文已获取，WM_INPUT及应用注册/读取输入相关内容实际读到。
- Valve Source SDK 2013的player_lagcompensation.cpp与baseentity_shared.cpp公开文件已获取。实际读取了位置/动画历史、命令tick与插值/延迟修正、BacktrackPlayer等代码，检索到射线调用。
- Source SDK 2013不是CS:GO源码；不可将其参数或某段条件直接说成CS:GO比赛的具体规则。
- Valve Developer Wiki Source_Multiplayer_Networking与Lag_Compensation返回HTTP200验证页，并没有正文。未绕过；台账标记challenge_not_content。
- 本次击杀的身份、版本、武器、赛事、tickrate、延迟、点击时刻均未验证。不采纳前次协作中无证据的武器与赛事描述、引用编号和检索说法。

## 当前镜头与坐标
Z向上；客户端以x=-5为中心，服务器平台右侧；射线数据原点[2.5,-2.8,1.1]、方向[0,1,0]。相机与动画按24fps确定帧号驱动。
- F001—096：鼠标输入与本地游戏状态。
- F097—240：本地表现与网络命令分支（本地闪光F133开始，命令球仍在途）。
- F241—312：服务器空间与当前位置。
- F313—360：历史位置显示；F289起门实体转为碰撞轮廓，是透视示意，不是门消失。
- F361—432：全条射线同帧显示，与实际简化求交点重合，无实体子弹飞行。
- F433—504：结果路径回到客户端。
- F505—576：客户端结果表现。绿色条是抽象反馈，不是比赛击杀栏。
本阶段无GPU/display/audio详细模型，不能声称已覆盖最终机制全貌。

## 后续最短路径
1. 用户提供准确原片文件/链接和大致时间码，确认是否CS:GO、本人POV/观战/demo及引用范围。未到素材前不要重复做假片头/片尾。
2. 用ffprobe建立原片元数据，检查开火前/开火时/击杀后的真实画面；音频接点需听审。填写edit_contract的source与PTS锚点。没有物理点击证据时clickPhysicalTime保持null。
3. 正式事实核查聚焦CS:GO预测、延迟补偿、武器射线/穿透与死亡事件；按实际片段决定穿门是否为主讲点。
4. 在现有场景上补输入接收、GPU渲染/显示刷新和音频支路；不要推翻有效模型与射线测试。
5. 在读取TTS工作流基础上先做术语与姓名短试音，再生成全片个人声音。当前只读了TTS文档，未调用TTS、未读私有参考音频。
6. 用实际句源时长重建场景/字幕，先输出原片—冻结—示意—原片续播短片，再完整渲染。
7. 最终编码帧需抽查所有段落与转场，补连续观看与听审；当前无音样片技术检查不能替代全片验收。

## 运行与保留策略
```
# 无需重复prepare/mechanism：已存在成功产物。
python source/v01/render.py --chunk 1 192
python source/v01/render.py --chunk 193 384
python source/v01/render.py --chunk 385 576
python source/v01/render.py --compose
python source/v01/verify.py
```
render会复用已存在PNG与最终MP4。若改动scene参数必须升新的revision目录和.blend文件名，不能静默复用旧帧。scene中的.blend/anchors已存在时不会覆盖。无需改全局设置。
Blender子进程统一 `--background --factory-startup --python-exit-code 1`；首次未带factory曾加载用户现有插件，后续已避免，未调用这些插件服务。第一次引擎枚举报错已修为5.1的BLENDER_EEVEE，不把进程exit0但脚本报错视为成功。

本轮无付费生成、无云端上传、无对外发布、无其他工程修改。当前没有由本轮启动仍在运行的后台任务，三个帧批次及合成/检查均已返回exit0。原片缺失仍是成片的主要阻塞。
