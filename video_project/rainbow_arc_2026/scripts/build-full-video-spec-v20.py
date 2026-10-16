"""Materialize a Qwen first/last-frame video spec for the accepted full-art plates."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
img=json.loads((ROOT/'research/qwen-v20-full-art-image-specs.json').read_text('utf8'))
by={x['id']:x for x in img['shots']}
segments=[
 ('a01',0,300,'低空沿雨后街道前推，人物由近处向远处彩虹走去'),('a02',300,600,'摄影机越过人物肩膀并平滑前推，太阳始终在背后'),('a03',600,900,'从人物右后方缓慢环绕，雨幕和前景树叶产生视差'),('a04',900,1018,'穿入水雾，中心一滴水接住镜头'),
 ('d01',5018,5318,'从42度出射光回到湿草地，人物抬头，弧线沿光路出现'),('d02',5318,5618,'摄影机升高，出射光铺成天空圆弧'),('d03',5618,5918,'升到地平线，完整圆逐渐被地面遮住下半部'),('d04',5918,6218,'侧向dolly，人物和圆弧产生真实空间视差'),('d05',6218,6518,'由弧线近景拉到开阔地平线，保持连续切线'),('d06',6518,6818,'观察者横移，雨幕中的有效水滴换了一批'),('d07',6818,7118,'靠近雨帘，圆弧随观察位置向侧面滑动'),('d08',7118,7418,'镜头下降，人物轮廓与弧形前景重合'),('d09',7418,7718,'人物抬手指向雨幕，镜头从侧后方前推'),('d10',7718,8018,'沿人物横移，树叶和水雾形成前景遮挡'),('d11',8018,8318,'第二道虹和暗带从雾中显现，保持双虹层次'),('d12',8318,8448,'靠近双虹，弧线切向下一段光学回扣'),
 ('f01',9006,9306,'副虹结束，暗带回到雨幕，人物回头'),('f02',9306,9606,'穿过水雾向喷泉下降，彩虹映在湿石'),('f03',9606,9906,'喷泉水雾近景，人物伸手接水滴'),('f04',9906,10206,'绕喷泉左前方移动，水滴和手产生遮挡'),('f05',10206,10506,'沿水雾升起，弧形匹配回到雨后花园'),('f06',10506,10552,'雾气推向中央留白，接片尾工作台')]
base=('连续水彩电影镜头，统一真人年轻男性黑色蓬松短发、圆框眼镜、浅蓝上衣；动作遵循真实人体，手脚完整，人物身份和方向稳定。'
 '太阳在人物和摄影机背后，前方是雨幕；只允许一个人物，禁止鱼、第二人物、镜像、文字、Logo、水印、畸形。'
 '使用前景遮挡、空间视差、焦点转移和摄影机运动完成首尾接力，禁止淡入淡出、硬切、静止画面或重复帧。')
out={'version':'V20-full-art-video','model':'wan2.7-i2v-2026-04-25','apiProtocol':'wan27-first-last-media','output':{'resolution':'1080P','fps':30},'shots':[]}
for sid,start,end,action in segments:
 a=by[f'full_{sid}_start'];b=by[f'full_{sid}_end']
 out['shots'].append({'id':f'full_{sid}_bridge','segment':sid,'firstFile':f'full_{sid}_start/keyframe-1920x1080.png','lastFile':f'full_{sid}_end/keyframe-1920x1080.png','duration':max(5,round((end-start)/30)),'purpose':action,'plannedTimeline':{'firstFrame':start,'lastFrame':end-1},'prompt':base+action+'。严格使用指定首尾帧，不改变地平线和空间关系；镜头持续移动，保持水彩纸张纹理和湿地反光。无物理角度数字和公式，几何标记由确定性图层叠加。','references':{'firstImage':a['id'],'lastImage':b['id']}})
(ROOT/'research/qwen-v20-full-art-video-specs.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),'utf8')
print('wrote',len(out['shots']),'video shots')
