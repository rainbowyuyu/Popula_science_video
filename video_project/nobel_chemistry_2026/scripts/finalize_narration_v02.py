"""Persist scientific corrections before the independent V02 audio build."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'docs/v02/narration-v02.json';d=json.loads(p.read_text('utf-8-sig'))
rows=d['clips']
by={r['id']:r for r in rows}
by['006']['spoken']='1986年，Kagan 团队发现，催化剂的左右比例，并不总会照搬到产物里。看这个双配体模型：在一大群配体里，右手占四分之三，左手占四分之一。随机两两围到金属旁边，会形成右右、左右、左左三种组合，大约占百分之五十六、三十八和六。'
by['007']['spoken']='在这个模型里，左右组合很少参与，右右和左左以相同效率，各做各的那一边。它们的数量比是九比一，产物便能接近九成对一成。把两边所占的百分比相减，就得到对映体过量：起始配体是百分之五十，产物变成百分之八十。曲线弯到直线上方，这就是正非线性效应。'
if '005b' not in by:
 rows.insert(next(i for i,r in enumerate(rows) if r['id']=='006'),{'id':'005b','scene':'catalyst','spoken':'催化剂，能让反应走一条更容易的路，完成一轮，还能继续工作。金属周围配位的分子或离子，叫作配体。有手性的配体，会在金属周围摆出有方向的环境。两种镜像产物生成的机会，就有可能拉开差别。','revision':'V02 bridge from Frank model to ligand catalyst; scientific audit accepted.'})
for row in rows:
 row['displayText']=row['spoken'];row['ttsText']=row['spoken'].replace('Henri B. Kagan','Henri B Kagan')
 row['subtitleTexts']=re.findall(r'[^，。！？；：]+[，。！？；：]?',row['spoken'])
d['version']='nobel-chemistry-2026-v02-corrected'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'docs/v02/story-v02.md').write_text('# 2026 诺贝尔化学奖 V02 口播\n\n'+ '\n\n'.join('## '+r['id']+' · '+r['scene']+'\n\n'+r['spoken'] for r in rows)+'\n',encoding='utf8')
print('V02 narration locked',len(rows),'clips')
