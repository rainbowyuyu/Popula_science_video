from pathlib import Path
import json, shutil

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'docs/story.json'
story = json.loads(p.read_text(encoding='utf-8'))
backup = ROOT / 'audio/upgrade-v2-baseline'
backup.mkdir(exist_ok=True)
if not (backup / 'story.json').exists():
    shutil.copy2(p, backup / 'story.json')

changes = {
    's001': '六百三十二米的上海中心，高得像要伸进云里。风一来，这么细长的一栋楼，靠什么站得住？',
    's002': '把玻璃外衣轻轻揭开，里面远比想象中热闹。楼板、钢梁和粗壮的柱子，一层接着一层。',
    's004': '高处的风会推着楼走，脚下的土又偏软。整座楼从头到脚，都得一起接住这些力。',
    's009': '这块厚底盘把桩和大楼连在一起。顺着它往上，是楼中央最结实的一根硬骨头。',
    's011': '从上面看，底部排着九个筒格，像一个九宫格。内部的墙和外围的墙连在一起，让它更难被推弯。',
    's014': '只靠中间这根硬骨头，离六百多米的目标还差一把力。帮手就在钢梁另一头，大楼的外圈。',
    's028': '这一扭，改变了风撞上大楼的方式。楼越往上长，迎着风的轮廓就越不一样。',
    's032': '风洞里，工程师反复比较不同的外形。外衣先减轻风的影响，剩下的推力，还要交给里面的骨架。',
    's033': '看两侧柱子的颜色：风一推，一边压得更多，另一边压得更少。力顺着相连的构件，一路传回基础。',
    's035': '它叫调谐质量阻尼器。上海中心楼顶，悬着一块约一千吨的重物，可以相对大楼来回运动。',
    's036': '风推着大楼左右摇，重物跟着相对摆动。经过调校的节奏，让它在运动中牵住大楼，减轻晃动。',
    's044': '连伸臂也要等合适时机再锁定。核心筒和巨柱收缩的步调不同，连接太早，就会给骨架增加额外的力。',
    's048': '每天五分钟，认识生活里的新知识。脚下的桩、身边的梁，和云里的那块重物，共同撑起了这座城的天际线。',
}
for row in story['shots']:
    if row['id'] not in changes:
        continue
    old_take = ROOT / 'audio/takes' / (row['id'] + '.json')
    if old_take.exists() and not (backup / old_take.name).exists():
        shutil.copy2(old_take, backup / old_take.name)
    row['text'] = row['caption'] = changes[row['id']]
    row['ttsText'] = row['text'].replace('桁架', '横架')
    if row['id'] == 's011':
        row['focus'] = '俯看同一核心筒九个筒格，内外墙连通关系清楚；沿真实空间慢慢绕到斜上方。'
    elif row['id'] == 's032':
        row['focus'] = '保持成塔、风流、顶部阻尼器在同一空间；先读外形绕流，再揭示骨架传力。'
    elif row['id'] == 's035':
        row['sourceIds'] = ['wu2021', 'tmd_mechanism']
    elif row['id'] == 's036':
        row['focus'] = '全塔迎风摆动与顶部重物相对运动同场，镜头连续推近悬挂块体，挂点连接不丢失。'
    elif row['id'] == 's044':
        row['sourceIds'] = ['ding2013']
        row['focus'] = '施工末段聚焦一处伸臂与巨柱、核心筒的连接，再回到整体；仅示意择时锁定，不冒充复现徐变内力。'
assert len(story['shots']) == 48
assert [r['id'] for r in story['shots']] == [f's{i:03d}' for i in range(1,49)]
p.write_text(json.dumps(story, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(ROOT/'audio/rewrite-v2-manifest.json').write_text(json.dumps({'changedIds':list(changes),'count':len(changes),'keptShots':48,'keepOriginalDurations':False,'ttsVoice':'local rainbow fish reference','productionLanguageRemoved':['s032','s044'],'engineeringAdded':'s044: delayed outrigger locking; Ding 2013'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Changed', ','.join(changes))
