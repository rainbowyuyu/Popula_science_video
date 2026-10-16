from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/qwen-v20-full-art-image-specs.json'

# Every dynamic bridge is a native first/last-frame video.  These keys are
# deliberately split at narration-scale boundaries so a generated shot never
# has to fake a physical jump in the optical core.
segments=[
 ('a01',0,300,'street','雨后街道，人物从左下向彩虹远处走'),
 ('a02',300,600,'street','摄影机越过人物肩膀，沿湿路低空前推'),
 ('a03',600,900,'street','从人物右后方环绕，前方雨幕与远虹'),
 ('a04',900,1018,'mist','镜头穿入前景水雾，一滴水在画面中心形成'),
 ('d01',5018,5318,'cone','从约42度出射光回到湿草地，人物抬头'),
 ('d02',5318,5618,'cone','镜头升高，出射光铺成天空圆弧'),
 ('d03',5618,5918,'circle','升到地平线，完整圆被地面遮去下半部'),
 ('d04',5918,6218,'circle','沿地面侧向移动，圆弧与人物产生视差'),
 ('d05',6218,6518,'circle','由近景弧线拉到开阔地平线，弧线切线'),
 ('d06',6518,6818,'observer','观察者横移，参与成虹的雨滴换了一批'),
 ('d07',6818,7118,'observer','摄影机靠近雨幕，弧线随观察位置滑动'),
 ('d08',7118,7418,'observer','镜头下降，人物轮廓与弧形前景重合'),
 ('d09',7418,7718,'observer','人物抬手指向雨幕，镜头从侧后方前推'),
 ('d10',7718,8018,'observer','沿人物横移，树叶和水雾形成前景遮挡'),
 ('d11',8018,8318,'secondary','第二道虹与暗带从雾气中慢慢显现'),
 ('d12',8318,8448,'secondary','镜头靠近双虹，保持两条弧的空间层次'),
 ('f01',9006,9306,'secondary_exit','副虹段结束，暗带淡入雨幕，人物回头'),
 ('f02',9306,9606,'mist','穿过水雾向喷泉方向下降，虹弧映在湿石'),
 ('f03',9606,9906,'fountain','喷泉水雾近景，人物伸手感受水滴'),
 ('f04',9906,10206,'fountain','摄影机绕喷泉左前方，手和水滴有真实遮挡'),
 ('f05',10206,10506,'return','镜头沿水雾升起，弧形匹配回到雨后花园'),
 ('f06',10506,10552,'return','最后的雾气和留白交给片尾工作台')
]

base=(
 '统一清透水彩纸张手绘电影质感，细腻湿画法、柔和体积光、真实空间透视。'
 '唯一角色是一位真人年轻男性，黑色蓬松短发、圆框眼镜、浅蓝色上衣，和参考身份保持一致；'
 '动作遵循真实人体，手指完整、脚与地面接触正确，禁止鱼、第二人物、镜像、畸形、文字、Logo、水印。'
 '太阳始终在摄影机和人物背后，彩虹位于前方雨幕；主虹外侧红、内侧紫，副虹颜色反序。'
 '不要生成角度数字、公式或标签，数据由后续确定性图层叠加；使用连续摄影机运动、遮挡和景深完成首尾接力，禁止淡入淡出和硬切。'
)

# Endpoints use clean deterministic frames as composition anchors. The Qwen
# image edit is used for appearance/style only; the final video still receives
# geometry overlays from the Three.js world.
frame_for={0:'00000',300:'00300',600:'00600',900:'00900',1018:'01017',5018:'05018',5318:'05318',5618:'05618',5918:'05918',6218:'06218',6518:'06518',6818:'06818',7118:'07118',7418:'07418',7718:'07718',8018:'08018',8318:'08318',8448:'08448',9006:'09006',9306:'09306',9606:'09606',9906:'09906',10206:'10206',10506:'10506',10552:'10551'}
for idx,(sid,start,end,kind,action) in enumerate(segments,1):
    for side,frame in [('start',start),('end',end-1)]:
        fid=f'full_{sid}_{side}'
        scene=f'output-v20/work/qwen-full-art/refs/frame-{frame_for.get(frame,frame):0>5}.png'
        # Existing identity keyframe is itself a clean RGB output of the
        # approved Qwen image edit. Keeping the path in the spec lets the
        # generation script record exact hashes without persisting credentials.
        prompt=(base+f'当前镜头类型：{kind}。{action}。'
                f'这是{side}端点，严格保留参考图中的镜头构图、地平线、人物朝向和空间关系；'
                '将白模/旧角色统一重绘为上述真人水彩人物，保留前景叶片、水雾、湿地反光和远处虹弧。'
                '人物只占画面约八分之一到四分之一，不要每帧近距离人像；镜头要有可读的前进、环绕或升降方向。')
        OUT.parent.mkdir(parents=True,exist_ok=True)
        data=json.loads(OUT.read_text('utf8'))
        data['shots'].append({'id':fid,'segment':sid,'side':side,'frame':frame,'kind':kind,
          'purpose':action,'seed':220000+idx*2+(0 if side=='start' else 1),
          'referenceFiles':[scene,'output-v20/work/qwen-art-v20/generated/human_identity_v20/keyframe-1920x1080.png'],
          'prompt':prompt})
        OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8')
print(f'wrote {len(segments)*2} endpoint shots to {OUT}')
