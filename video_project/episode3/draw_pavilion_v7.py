"""Generate model-linked engineering diagrams and a complete dimensional list."""
from pathlib import Path
import json,csv,html

R=Path(__file__).resolve().parent.parent/'topology_optimization/research/episode3v7'
M=json.loads((R/'pavilion-manifest.json').read_text(encoding='utf8'))
D=R/'drawings';D.mkdir(exist_ok=True)
def esc(x):return html.escape(str(x))
def start(title):
 return [f'<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1300" viewBox="0 0 1800 1300"><rect width="1800" height="1300" fill="#f8f5ec"/><style>text{{font-family:"Microsoft YaHei",sans-serif;fill:#35291f}} .line{{stroke:#654832;stroke-width:3;fill:none}} .dim{{stroke:#9a8270;stroke-width:1.4;fill:none}} .t{{font-size:21px}} .small{{font-size:17px}}</style><text x="70" y="72" font-size="40" font-weight="700">{title}</text><text x="70" y="111" class="t">V7 · 原攒尖亭可装配节点加固｜单位 mm｜模型坐标 X / Y 水平，Z 竖直</text>']
def text(s,x,y,t,size=21,col='#35291f'):s.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{col}">{esc(t)}</text>')
def line(s,x1,y1,x2,y2,klass='line'):s.append(f'<path d="M{x1} {y1}L{x2} {y2}" class="{klass}"/>')
def rect(s,x,y,w,h,fill='#ba8a57'):s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#654832" stroke-width="2"/>')
def dim(s,x1,y1,x2,y2,label):
 line(s,x1,y1,x2,y2,'dim');line(s,x1-6,y1-6,x1+6,y1+6,'dim');line(s,x2-6,y2-6,x2+6,y2+6,'dim');text(s,(x1+x2)/2-30,(y1+y2)/2-10,label,18)
def footer(s):
 text(s,70,1208,'图纸由 pavilion-manifest.json 生成；具体零件外包尺寸见完整 cut-list.csv。',20)
 text(s,70,1242,'公开节点原则 + 本模型自定尺寸；为教育性可装配设计，不是经审图的现场施工文件。',19)
 text(s,70,1273,'参考：Joint and Peg / Timber Frame Pavilions、Standard Timber Frame Joints；《营造法式》图样仅作传统木构视觉参考。',17)
 s.append('</svg>')

s=start('01 / 平面、立面与结构层次')
text(s,90,170,'平面：3000 × 3000 柱网；4600 × 4600 檐口',27)
# Plan: 100 px/m, front at negative Y.
cx,cy,scale=370,510,110
rect(s,cx-2.3*scale,cy-2.3*scale,4.6*scale,4.6*scale,'#e9e4d6')
for a in [-1.5,1.5]:
 rect(s,cx-1.69*scale,cy+a*scale-.09*scale,3.38*scale,.18*scale)
 rect(s,cx+a*scale-.09*scale,cy-1.69*scale,.18*scale,3.38*scale)
for code,x,y in [('FL',-1.5,-1.5),('FR',1.5,-1.5),('BL',-1.5,1.5),('BR',1.5,1.5)]:
 rect(s,cx+x*scale-.14*scale,cy+y*scale-.14*scale,.28*scale,.28*scale,'#8b603b');text(s,cx+x*scale-55,cy+y*scale-26,'POST_'+code,17)
 line(s,cx+x/1.5*2.3*scale,cy+y/1.5*2.3*scale,cx,cy)
rect(s,cx-.32*scale,cy-.32*scale,.64*scale,.64*scale,'#cda86f');text(s,cx-30,cy+5,'HUB',17)
dim(s,cx-1.5*scale,820,cx+1.5*scale,820,'3000')
dim(s,cx-2.3*scale,866,cx+2.3*scale,866,'4600')
text(s,140,928,'前侧为入口；后栏杆随 BENT_BACK 成榀。',20)
text(s,140,970,'X 梁位于 z=3000；Y 枋位于 z=3420。',20)
text(s,140,1006,'错层榫眼避免两向卯口交叉削弱柱芯。',20)
text(s,140,1064,'中央荷载路径：攒尖座 → 短柱 → 十字托梁',20)
text(s,140,1098,'→ 檐檩 → 承檩斗 / 栱 / 栌斗 → 四柱 → 石础',20)
# elevation
ox,oy,ss=1210,1020,128
text(s,870,170,'前立面 / 侧剖：有真实承托的攒尖骨架',27)
Z=lambda z:oy-z*ss
for x in [-1.5,1.5]:
 rect(s,ox+x*ss-.14*ss,Z(3.63),.28*ss,3.23*ss)
 rect(s,ox+x*ss-.26*ss,Z(.4),.52*ss,.32*ss,'#c8c4bb')
rect(s,ox-1.64*ss,Z(3.15),3.28*ss,.30*ss)
rect(s,ox-.08*ss,Z(4.77),.16*ss,.63*ss)
rect(s,ox-1.59*ss,Z(4.14),3.18*ss,.14*ss)
rect(s,ox-.32*ss,Z(5.17),.64*ss,.4*ss)
for x in [-1.5,1.5]:
 for z,w,h in [(3.63,.34,.12),(3.75,.64,.12),(3.87,.38,.13)]:rect(s,ox+x*ss-w/2*ss,Z(z+h),w*ss,h*ss)
line(s,ox-2.3*ss,Z(3.78),ox-.34*ss,Z(4.956));line(s,ox+.34*ss,Z(4.956),ox+2.3*ss,Z(3.78))
line(s,ox-.33*ss,Z(5.24),ox,Z(5.57));line(s,ox,Z(5.57),ox+.33*ss,Z(5.24))
for sx in [-1,1]:line(s,ox+sx*1.36*ss,Z(2.10),ox+sx*.78*ss,Z(2.85))
for z,label in [(.4,'柱底 400'),(3,'X 梁心 3000'),(3.42,'Y 枋心 3420'),(3.63,'柱顶 3630'),(4.07,'檩 / 托梁心 4070'),(4.77,'短柱顶 4770'),(5.17,'攒尖座顶 5170'),(5.57,'宝顶 5570')]:
 line(s,ox+2.4*ss,Z(z),1640,Z(z),'dim');text(s,1647,Z(z)+5,label,16)
text(s,874,1125,'主屋面：z = 5160 − 0.60 × max(|x|, |y|)',21)
text(s,874,1156,'坡望板厚 30；灰瓦基面厚 18；椽截面 75 × 140。',20)
footer(s);(D/'01-plan-elevation.svg').write_text('\n'.join(s),encoding='utf8')

s=start('02 / 真实节点尺寸与装配方向')
text(s,85,185,'A  横梁—柱贯穿榫销',28)
rect(s,130,255,140,350,'#bf915e');rect(s,270,365,310,150,'#d3ac7d');rect(s,130,405,141,70,'#8a6846')
rect(s,128,404,144,72,'none');s.append('<circle cx="200" cy="440" r="14" fill="#9a5c2b" stroke="#59371d" stroke-width="2"/>')
dim(s,130,646,270,646,'柱 280');dim(s,309,550,540,550,'净梁长 2720')
text(s,85,715,'CROSS_FRONT / BACK：220 × 300；两端榫 280 × 100 × 140',21)
text(s,85,753,'POST 卯口：贯穿柱宽；侧隙 0.8 / 面；销 Ø28，孔 Ø29.6',21)
text(s,85,799,'正确顺序：梁与斜撑先成组 → 两柱沿 X 套入 → 横销锁定',20)
text(s,85,835,'随后两榀沿 Y 合拢套入 LONG_LEFT / RIGHT，再插 Y 向节点销。',20)
text(s,930,185,'B  柱头坐榫 / 栱口 / 承檩',28)
rect(s,1090,526,160,120);rect(s,1050,445,240,80);rect(s,980,365,380,80);rect(s,1055,285,230,80);rect(s,950,225,440,60,'#816747')
for y,label in [(634,'POST 柱顶 z3630'),(511,'DOU 340×340×120 + 140×140×74 坐榫'),(417,'GONG_X / Y 640×160×120 交搭口'),(336,'CAP 380×380×130'),(258,'PURLIN 3380×180×140；四角错口')]:text(s,1398,y,label,17)
text(s,930,715,'每层由下层实面承托；拆时先卸屋面和檩，再抬起栱口。',20)
text(s,930,753,'不存在装饰“昂”的虚假受力叙述；镜头只展示实际建成的构件。',20)
text(s,85,914,'C  攒尖座 / 中央短柱 / 十字托梁',28)
text(s,85,964,'HUB 640×640×400；CENTRE_POST 160×160×630；SUPPORT_X/Y 3180×160×140',21)
text(s,85,1006,'四个角梁榫分别落入上开口座；先上方对准，再垂直下落，宝顶最后封口。',21)
text(s,85,1048,'角梁沿真实屋面斜坡，檐部开鸟嘴；44 根椽分别坐在檐檩与角梁 / 攒尖座槽内。',21)
text(s,85,1090,'中间 4 根椽伸入 HUB，十字托梁坐入檐檩，完整的承托路径连续到地面。',21)
text(s,85,1132,'装配检查：assembly-path-qa.json；几何配合：geometry-qa.json；逐件尺寸：cut-list.csv。',21)
footer(s);(D/'02-joints-assembly.svg').write_text('\n'.join(s),encoding='utf8')

with (D/'cut-list.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['part_id','role','label','parent','min_x_mm','min_y_mm','min_z_mm','max_x_mm','max_y_mm','max_z_mm','extent_x_mm','extent_y_mm','extent_z_mm'])
 for p in M['parts']:
  lo,hi=p['bbox_blender'];w.writerow([p['id'],p['role'],p['label_zh'],p['parent']]+[round(x*1000,3) for x in lo+hi]+[round((hi[i]-lo[i])*1000,3) for i in range(3)])
(D/'README.md').write_text('''# V7 模型对应工程参数图

这两张 SVG 和全量零件表直接对应 V7 GLB 的唯一 part_id。单位均为毫米；斜梁的 CSV 包围盒不是开料长度，准确轮廓须使用 Blender 实体几何。每根穿梁的榫头与梁身是一块实体，孔与销为真实几何。

- 01-plan-elevation.svg：平面、立面、支承层次和统一标高。
- 02-joints-assembly.svg：柱梁贯穿榫销、柱头承托、攒尖座装配节点。
- cut-list.csv：每一件实际几何的 ID、角色、父组及三维外包尺寸。

现代木构节点原则参考：
- https://jointandpeg.com/timber-frame-planning/timber-frame-pavilions/
- https://jointandpeg.com/standard-timber-frame-joints/

亭子的柱网、标高、节点间隙及尺寸是本模型自定值；保持原攒尖亭的外观，不冒称宋代名亭的测绘复原。没有把参考图纸当成认证的施工方案。原《营造法式》的图样见 ../real-pavilion-sources.json 所述来源（如文件未同包，参见 research/episode3v2）。
''',encoding='utf8')
print('DRAWINGS',D,'parts',len(M['parts']))
