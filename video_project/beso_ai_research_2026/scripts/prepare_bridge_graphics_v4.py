"""Editorial blueprint/evidence endpoint images; no fabricated engineering data."""
from pathlib import Path
from PIL import Image,ImageFilter,ImageDraw
import numpy as np, json,hashlib
R=Path(__file__).resolve().parents[1];O=R/'public/generated/v4'
a=np.asarray(Image.open(O/'studio-solid.png').convert('RGB'),dtype=float)
edge=np.asarray(Image.open(O/'studio-solid.png').convert('L').filter(ImageFilter.FIND_EDGES),dtype=float)/255
# Geometric silhouette derivatives of the native hull, explicitly not a drawing
# with invented dimensions or a recovered design CAD file.
paper=np.empty_like(a);paper[:]=[246,245,239]
edge=np.clip((edge-.018)*3.9,0,.87)
paper=paper*(1-edge[:,:,None])+np.array([28,99,117])*edge[:,:,None]
im=Image.fromarray(np.uint8(np.clip(paper,0,255)));d=ImageDraw.Draw(im)
for x in range(0,1920,60):d.line((x,0,x,1080),fill=(234,235,229),width=1)
for y in range(0,1080,60):d.line((0,y,1920,y),fill=(234,235,229),width=1)
# Reapply drawing over subdued grid, retaining model match-cut coordinates.
pa=np.asarray(im,dtype=float);pa=pa*(1-edge[:,:,None])+np.array([28,99,117])*edge[:,:,None]
im=Image.fromarray(np.uint8(np.clip(pa,0,255)));im.save(O/'blueprint.png')
# Evidence wire planes are conceptual geometry: deliberate absence of text,
# numbers, axes and result traces prevents Qwen hallucinations being evidence.
evidence=im.copy();d=ImageDraw.Draw(evidence)
for idx in range(3):
    dx=idx*20;dy=-idx*30
    d.line([(315+dx,790+dy),(690+dx,260+dy),(1550+dx,470+dy),(1175+dx,1000+dy),(315+dx,790+dy)],fill=(132,171,173),width=3)
for p in [(690,260),(1550,470),(1175,1000),(315,790)]:
    x,y=p;d.ellipse((x-6,y-6,x+6,y+6),fill=(169,133,69))
evidence.save(O/'evidence-plane.png')
report=im.copy();d=ImageDraw.Draw(report)
# A vellum-like outline around the *same* real-derived view. It is not a fake
# paper page and carries no author/title/solver report claims.
d.line([(375,255),(1300,175),(1615,870),(640,980),(375,255)],fill=(186,192,181),width=3)
report.save(O/'report-plane.png')
specs={
 'v4-ocean-arrival':{'first':'ocean-wide.png','last':'ocean-close.png','fromFrame':0,'role':'hero','prompt':'电影级工程软件发布片概念镜头。首尾帧是同一座三外倾浮筒半潜式风机，三根内斜撑、三个短径向箱梁、中央圆形连接盘、一根细长白色塔筒和三片叶片。完全保持几何构型和尺寸比例，不把外倾浮筒改直，不增加连接臂。无人机从首帧全景平滑前推下降，经过塔筒，终点精确匹配尾帧的浮体近景。增强海面为真实细浪与微小泡沫、柔和蓝灰天空和温暖晨光、海水反射和金属质感，修复环境不自然的水平色带。镜头连续、加减速轻柔、景深克制，浮筒与水接触真实。结构不融化不形变，叶片只可极轻微转动。无硬切、无文字、无数字、无logo、无水印、无人。这是外观概念镜头，不是求解结果。'},
 'v4-paper-emergence':{'first':'blueprint.png','last':'studio-solid.png','fromFrame':420,'role':'brief','prompt':'高级工程软件发布片，二维图纸长出同一座三维浮式风机基础。精准保持首尾图片的三座外倾圆筒、三根内斜撑、三个短径向箱梁和中心圆盘，不增加第四座浮筒或其他支臂。首帧纸面上的青蓝轮廓线沿纸面法线缓缓抬起，在共同空间原位生成尾帧的哑光青灰金属平台，网格纸逐渐展为同色柔和摄影棚地面。摄影机只有克制的侧向滑行和微小绕行，落点严格匹配尾帧机位，画面不液化不爆炸不融化，零件逐个有秩序形成。金属倒角、焊缝、接触阴影精细，背景象牙白，构图干净。无文字数字logo人员水印。这是二维三维概念桥接，不展示优化和计算结果。'},
 'v4-design-wire':{'first':'studio-solid.png','last':'studio-wire.png','fromFrame':1140,'role':'topology','prompt':'工程发布片的实体转几何设计域概念镜头。同一三外倾浮筒、三内斜撑、三短径向箱梁及中心盘的形状尺寸位置严格恒定。从首帧青灰金属实体开始，一条细金色高光沿钢构件表面穿行，实体表皮像精密技术展示逐步变为尾帧的真实几何线框，线框只保留既有模型的轮廓和网格，不变成其他拓扑结构。摄影机保持首尾机位的微小连续轨道滑行，柔和白色摄影棚，细腻金属反射，连续空间，没有硬切没有爆炸没有闪白，不额外创建结构。无文字、无公式、无数字、无应力图、无求解数据、无logo。这是几何表示方式的概念转换，不是实际BESO迭代。'},
 'v4-wire-ocean':{'first':'studio-wire.png','last':'ocean-close.png','fromFrame':2040,'role':'physics','prompt':'工程发布片连续镜头，由线框几何回到同一浮式风机海面实体。首帧三外倾浮筒、三内斜撑、三短径向箱梁、中心圆盘的数量比例与末帧一致，线框逐步沿既有表面包覆为哑光青灰钢结构，摄影机平滑降到尾帧相机视角，蓝灰海面细浪从地面自然铺展开，塔筒从中心盘延续向上并保持真实细长比例。同一模型有共同空间锚点。真实海面微小波浪、泡沫、接触阴影、柔和天空，去除不自然水平色带。无突现跳切、无熔化、无额外支臂。不要生成任何风压、位移、张力、应力颜色、数值、图表、文字或logo。这只是视觉波面与外观转换，不是物理求解。'},
 'v4-evidence-stream':{'first':'evidence-plane.png','last':'report-plane.png','fromFrame':3900,'role':'toolchain','prompt':'高级发布片的几何到证据概念桥接。首尾白纸上始终是同一座三外倾圆筒浮式风机基础线稿，绝不改变几何形状。首帧半透明的细线数据平面围绕线稿缓缓汇聚，摄影机沿纸面轻柔滑行，线稿和细线像精密工程文档的组织过程有序归位，最后同一线稿落在尾帧的象牙白技术资料平面中。纸面保持同一透视与空间锚点，不做硬切或翻页，不制造复杂卡片，不增加任何文字、图表、作者、论文标题、公式、数字、logo或软件界面。克制高级、微小纸张质感、自然接触阴影、轻柔景深，金色节点和青蓝细线保持稀疏。只是几何与资料形态的概念连接，不是假装工程师实际点击或求解完成。'},
 'v4-report-departure':{'first':'report-plane.png','last':'ocean-wide.png','fromFrame':5640,'role':'close','prompt':'工程软件宣传片的连贯终章镜头。首帧纸面上的同一三外倾圆筒半潜式平台线稿沿纸面法线抬升为同一结构，三根内斜撑、三个短径向箱梁及中央圆盘保持数量方向比例不变，中央白色塔筒和三叶片风机向上伸展完整出现，摄影机顺势上升拉远至尾帧全景，相同纸面无缝变成蓝灰色真实海面细浪，温暖晨光与柔和天空，金属外观精细，景深克制，海浪绕浮筒。修复尾帧环境中不自然的水平色带，保持完整风机比例，首尾锚点连续无跳切，不生成第四浮筒、不任意融化形变、不碎片爆炸。无文字logo数字水印人物，不生成数值和求解图。这是从几何文档到完整平台的外观概念桥接。'}
}
(R/'research/generation/qwen-v4-specs.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2),'utf8')
print('Prepared six bounded Qwen bridge specs and graphical endpoints')
