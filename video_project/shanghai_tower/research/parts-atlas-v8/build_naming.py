"""Create Chinese atlas names from actual 987-part model and FE endpoints.

Read-only input; writes only this research folder. No narration generation.
"""
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import re

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
MANIFEST = ROOT / 'public/models/shanghai-tower-manifest.json'
GRAPH = ROOT / 'public/physics/structural-graph.json'
model = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
graph = json.loads(GRAPH.read_text(encoding='utf-8-sig'))
members = {m['id']: m for m in graph['members']}
nodes = {n['id']: n for n in graph['nodes']}
CN = dict(enumerate(['零','一','二','三','四','五','六','七','八','九','十','十一','十二']))
COL = {1:'右侧后柱',2:'后侧右柱',3:'后侧左柱',4:'左侧后柱',5:'左侧前柱',6:'前侧左柱',7:'前侧右柱',8:'右侧前柱'}
CORNER = {1:'右后',2:'左后',3:'左前',4:'右前'}
CATEGORIES = {
    'foundation': ('地下基础', 0, '桩群、筏板、地下连续墙和地下承重组'),
    'core': ('核心筒', 1, '各高度分区的墙片和内墙分格'),
    'columns': ('巨柱与角柱', 2, '四对巨柱，以及到第五区的辅助角柱'),
    'outriggers': ('伸臂桁架', 3, '六处关键高度的上下弦与交叉斜腹杆'),
    'belts': ('环带桁架', 4, '沿周边连接巨柱和转角节点的杆件'),
    'floors': ('楼面与钢梁', 5, '按高度和前后半幅分组的楼板与径向梁'),
    'facades': ('双层幕墙', 6, '内外玻璃面组、边框、旋转棱线和径向支承'),
    'crown_damper': ('塔冠与阻尼器', 7, '塔冠钢架、承挂架、十二根悬索组与质量箱'),
    'atriums': ('中庭与公共空间', 8, '空中大堂、栏杆、座椅和绿植示意'),
    'context': ('场地与土层示意', 9, '解释场景用的土层和广场，不是建筑结构零件'),
}


def zone_of(pid):
    match = re.search(r'_Z(\d\d)(?:_|$)', pid)
    return int(match.group(1)) if match else None


def zone_name(z):
    return f'第{CN[z]}区' if z else '塔冠'


def node_location(nid):
    if nid.startswith('N_BELT_CORNER_'):
        return CORNER[int(re.search(r'_K(\d\d)_', nid).group(1))] + '环带转角'
    match = re.match(r'N_K(\d\d)_', nid)
    if match:
        return CORNER[int(match.group(1))] + '角柱'
    match = re.match(r'N_C(\d\d)_', nid)
    if match:
        return COL[int(match.group(1))].replace('柱','巨柱')
    if nid.startswith('N_ANCHOR_'):
        return '核心筒锚点'
    raise ValueError(f'Unrecognized truss node {nid}')


def build(part):
    pid, role = part['id'], part['role']
    z = zone_of(pid)
    zn = zone_name(z)
    qualifier = zn
    category = None
    label = ''
    representation = '多构件合并展示组'
    caveat = '依据公开资料制作的教学几何；不是制造单件或施工详图。'
    metadata = {}
    env = False
    physical_structure = False

    if role == 'piles':
        category = 'foundation'
        k = int(pid[-1])
        count = len(range(k-1, model['parameters']['pile_count'], 4))
        label, qualifier = f'第{CN[k]}组灌注桩群', '地下基础'
        representation = '多根桩合并网格'
        caveat = f'本组{count}根，共四组947根；按生成次序间隔分组，不是第{CN[k]}象限，也不是单根桩。桩位为均布教学近似。'
        physical_structure = True
        metadata = {'modeledPileCount':count,'partitionRule':'sorted plan coordinate index modulo 4','isGeographicQuadrant':False}
        assert part['vertices'] == count * 20
        assert part['polygons'] == count * 12
    elif role == 'raft':
        category, label, qualifier = 'foundation', '六米厚筏板', '地下基础'
        representation = '整体筏板教学外形'
        caveat = '厚度有公开依据；当前圆形轮廓为教学简化，单个mesh不是一块可吊装预制板。'
        physical_structure = True
    elif role == 'diaphragm_wall':
        category, label, qualifier = 'foundation', '地下连续墙·后半剖面', '基坑围护'
        representation = '连续墙组合剖切几何'
        caveat = '前半被剖去用于看清地下；不是单幅槽段，也不是完整围护施工图。'
        physical_structure = True
    elif role == 'basement':
        category, label, qualifier = 'foundation', '地下五层·楼板与柱墙组', '地下承重结构'
        caveat = '同一网格合并五层地下楼板、地下柱段与核心筒墙段，不能称为单层楼板。'
        physical_structure = True
    elif role == 'core':
        category, physical_structure = 'core', True
        token = pid.rsplit('_',1)[1]
        label = {'W1':'核心筒·右侧墙组','W2':'核心筒·后侧墙组','W3':'核心筒·左侧墙组','W4':'核心筒·前侧墙组','CELLS':'核心筒·内墙分格组'}[token]
        representation = '跨多楼层墙片及连梁组合'
        caveat = '分区内多层墙肢、洞口边和连梁合并显示；不是一片完整预制剪力墙。前后左右按模型固定坐标，不是地理方位。'
    elif role in ('megacolumn','cornercolumn'):
        category, physical_structure = 'columns', True
        k = int(re.search(r'_C(\d\d)$',pid).group(1))
        label = (COL[k].replace('柱','巨柱') if role == 'megacolumn' else CORNER[k]+'辅助角柱') + '段'
        representation = '一个高度分区内的连续柱段'
        caveat = '按高度分区拆出的柱段，不是工厂单节柱；位置按固定模型坐标定义。'
        metadata = {'columnPositionChinese':COL[k] if role=='megacolumn' else CORNER[k]+'角位'}
    elif role in ('outrigger','belt'):
        category, physical_structure = ('outriggers' if role=='outrigger' else 'belts'), True
        assert len(part['structuralMemberIds']) == 1
        member = members[part['structuralMemberIds'][0]]
        n0,n1 = member['nodeIds']
        xyz0,xyz1 = nodes[n0]['xyz'],nodes[n1]['xyz']
        suffix = pid.rsplit('_',1)[1]
        if role == 'outrigger':
            col = int(re.search(r'_C(\d\d)_',pid).group(1))
            qualifier = f'{zn}·{COL[col]}位'
            label = {'OB':'伸臂·下弦杆','OT':'伸臂·上弦杆','OX1':'伸臂·外升斜腹杆','OX2':'伸臂·内升斜腹杆'}[suffix]
            metadata['localDiagram'] = {
                'screenLeftMeaning':'核心筒端', 'screenRightMeaning':'外柱端',
                'diagonalAppearance':'右升斜杆' if suffix=='OX1' else '左升斜杆' if suffix=='OX2' else None,
                'warning':'左右只对左内右外的局部视图成立；自由运镜时用内升/外升主名。',
            }
        else:
            link = node_location(n0)+'—'+node_location(n1)
            qualifier = f'{zn}·{link}'
            label = ('环带·下弦杆' if suffix.startswith('BB') else
                     '环带·上弦杆' if suffix.startswith('BT') else
                     '环带·顺向上升斜腹杆' if suffix.startswith('BX1') else
                     '环带·逆向上升斜腹杆')
            metadata['localDiagram'] = {
                'screenLeftMeaning':node_location(n0),'screenRightMeaning':node_location(n1),
                'diagonalAppearance':'右升斜杆' if suffix.startswith('BX1') else '左升斜杆' if suffix.startswith('BX2') else None,
                'warning':'顺向/逆向指本条连接从首端到末端，旋转镜头时不能当作绝对屏幕左右。',
            }
        is_rising = suffix in ('OX1',) or suffix.startswith('BX1')
        is_falling = suffix in ('OX2',) or suffix.startswith('BX2')
        if is_rising: assert xyz1[1] > xyz0[1]
        if is_falling: assert xyz1[1] < xyz0[1]
        if not is_rising and not is_falling: assert abs(xyz1[1]-xyz0[1]) < 1e-5
        representation = '一根等效桁架杆件的可视网格'
        caveat = '与一根等效计算杆件直接映射；展示截面和连接细节仍为教学重建，不是完整加工件。'
        metadata.update({'memberId':member['id'],'nodeIds':[n0,n1], 'endpointPositionsThree':[xyz0,xyz1], 'endpointNamesChinese':[node_location(n0),node_location(n1)]})
    elif role == 'connection':
        category, label, physical_structure = 'belts', '桁架节点板与加劲板组', True
        caveat = '一整层示意连接板组；没有焊缝、螺栓或实际板件清单，不能逐片当成正式加工件。'
    elif role == 'floors':
        category, physical_structure = 'floors', True
        label = '楼板·后半组' if pid.endswith('_BACK') else '楼板·前半组'
        representation = '同一区间多楼层半幅楼板组'
        caveat = '为剖开讲解而合并的多层半幅楼板；不能称为单层或整块预制板。'
    elif role == 'floorbeams':
        category,label,physical_structure = 'floors','径向楼面钢梁组',True
        caveat = '本分区多楼层的代表性径向钢梁组，非一根钢梁或实际钢梁加工排料图。'
    elif role == 'inspectionfloor':
        category,label,physical_structure = 'floors','特写楼板·原楼层分离件',True
        representation = '原楼层语义拆分'
        caveat = '为近景透视从第四区楼板组中单独取出；不是新增一层，也不是实际检修平台。'
    elif role in ('outerglass','mullions'):
        category = 'facades'
        sector = int(re.search(r'_S(\d\d)_',pid).group(1))
        qualifier = f'{zn}·第{CN[sector]}扇区'
        label = '外幕墙·玻璃面组' if role=='outerglass' else '外幕墙·竖梃横梁组'
        representation = '跨楼层周向幕墙分组'
        caveat = '一段高度、一个周向扇区的幕墙面/框架组合；不是单块玻璃，也非实际制造分格。扇区随立面旋转，不使用未经核实的东南西北。'
        metadata['facadeSector']=sector
    elif role in ('innerfacade','innerframe'):
        category = 'facades'
        half = '后半' if '_1_' in pid else '前半'
        label = ('内幕墙·玻璃' if role=='innerfacade' else '内幕墙·分格框架')+half+'组'
        representation = '同高度分区内半周幕墙组'
    elif role == 'spiralrib':
        category,label = 'facades','外立面旋转棱线组'
        representation = '轮廓辅助几何'
        caveat = '外观辨识用的旋转棱线；无独立求解应力，不称为确定的主要承重钢柱。'
    elif role == 'facadesupport':
        category,label,physical_structure = 'facades','幕墙径向支承桁架组',True
        caveat = '该高度整圈代表性支承桁架组；24组布置为重建假设，无对应独立受力求解。'
        metadata['modeledSupportTrussCount']=24
    elif role == 'sky_lobby':
        category,label = 'atriums','空中大堂·中庭楼面'
        representation = '公共空间楼面教学几何'
    elif role == 'garden':
        category = 'atriums'
        if pid.startswith('GARDEN_TREES_'):
            label,env='中庭树冠组',True
        elif pid.startswith('GARDEN_TRUNKS_'):
            label,env='中庭树干组',True
        elif pid.startswith('GARDEN_RAILS_'):
            label='中庭栏杆组'
        elif pid.startswith('GARDEN_SEATS_'):
            label='中庭座椅组'
        else:
            label,env='中庭花池与绿植示意组',True
        representation='公共空间陈设或景观组'
        caveat='用于表达空中公共空间，非原建筑精确景观布置；不显示结构应力。'
    elif role == 'soil':
        category,env='context',True
        k = 1 if pid=='SOIL_CUTAWAY' else int(pid[-2:])
        soil={1:'浅表土',2:'上部软黏土',3:'粉砂土',4:'下部软黏土',5:'深部砂土'}[k]
        label,qualifier = f'{soil}·地层示意',f'场地第{CN[k]}层'
        representation='环境剖面，不是结构零件'
        caveat='通用土层材质示意，不是场地钻孔记录或已恢复的真实层界。不要归入建筑制造件。'
    elif role == 'plaza':
        category,label,qualifier,env='context','地面广场·场景底座','场地环境',True
        representation='场景环境几何，不是主要结构构件'
    elif role in ('crown','damper','damper_support','damper_cables','damper_plate','damper_magnets'):
        category,qualifier='crown_damper','塔冠设备层'
        labels={
            'CROWN_FRAME':'塔冠钢结构组',
            'TMD_MASS':'阻尼器·千吨质量箱',
            'TMD_MASS_BANDS':'质量箱·上盖与加强边组',
            'TMD_MASS_ANCHORS':'质量箱·四组悬挂耳板',
            'TMD_MASS_FASTENERS':'质量箱·悬挂连接细节组',
            'TMD_TOP_ANCHORS':'上部悬索锚具组',
            'TMD_SUPPORT_FRAME':'阻尼器·承挂钢架组',
            'TMD_BASE_FRAME':'涡流系统·楼层支座组',
            'TMD_CABLES':'阻尼器·十二根悬索组',
            'TMD_DAMPER_PLATE':'涡流阻尼·固定铜板',
            'TMD_MAGNET_ARRAY':'涡流阻尼·随动圆盘磁阵',
        }
        label=labels[pid]
        caveat='装置机制的教学重建；公开质量、索数与索长有依据，局部尺寸、锚具、磁极排布不是制造图。'
        if role=='damper_cables':
            metadata={'modeledCableCount':12,'publishedCableLengthMetres':25,'isSingleCable':False}
        if pid=='TMD_MASS': representation='一个质量箱的概念外形'
        elif pid=='TMD_DAMPER_PLATE': representation='固定导体板概念外形'
        else: representation='多设备构件合并组'
        physical_structure = role in ('crown','damper_support','damper_cables')
    else:
        raise ValueError(f'Unhandled role {role}: {pid}')

    name=qualifier+'｜'+label
    short_qualifier=qualifier
    if role == 'belt':
        col=int(re.search(r'_C(\d\d)_',pid).group(1))
        suffix=pid.rsplit('_',1)[1]
        if col % 2:
            corner,first_side,second_side={1:('右后角','右侧跨','后侧跨'),3:('左后角','后侧跨','左侧跨'),5:('左前角','左侧跨','前侧跨'),7:('右前角','前侧跨','右侧跨')}[col]
            side=first_side if suffix.endswith('A') else second_side
            short_qualifier=f'{zn}·{corner}·{side}'
        else:
            short_qualifier=f"{zn}·{ {2:'后侧',4:'左侧',6:'前侧',8:'右侧'}[col]}双柱间"
    lines = [short_qualifier,label]
    return {
        'id':pid,'meshName':part['mesh_name'],'role':role,
        'nameChinese':name,'labelChinese':label,'locationChinese':qualifier,
        'shortLocationChinese':short_qualifier,
        'displayLines':lines,'farLabelChinese':CATEGORIES[category][0],
        'category':category,'categoryChinese':CATEGORIES[category][0],
        'categoryOrder':CATEGORIES[category][1], 'zone':z,
        'heightBandMetres':model['parameters']['zone_boundaries'][z-1:z+1] if z else None,
        'centerThree':part['groupCenterThree'],'bboxThree':part['bboxThree'],
        'representationChinese':representation,'manufacturingSinglePart':False,
        'environmentalOrLandscape':env,'structuralFunction':physical_structure,
        'hasMappedStructuralResult':bool(part['structuralMemberIds']),
        'structuralMemberIds':part['structuralMemberIds'],
        'caveatChinese':caveat, **metadata,
    }


parts=[build(p) for p in model['parts']]
assert len(parts)==987
assert len({x['id'] for x in parts})==987
assert len({x['nameChinese'] for x in parts})==987
assert len({'｜'.join(x['displayLines']) for x in parts})==987
assert not any(re.search('[A-Za-z]',p['nameChinese']) for p in parts)
assert sum(p.get('modeledPileCount',0) for p in parts)==947
assert sum(p['hasMappedStructuralResult'] for p in parts)==705
assert all(not p['structuralFunction'] for p in parts if p['role']=='soil')
counts=Counter(p['category'] for p in parts)
data={
    'schema':'rainbow.parts-atlas-naming/1',
    'createdAtUTC':datetime.now(timezone.utc).isoformat(),
    'sourceManifestSHA256':hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
    'sourceGraphSHA256':hashlib.sha256(GRAPH.read_bytes()).hexdigest(),
    'titleChinese':'上海中心·构件图谱',
    'count':987,
    'countMeaningChinese':'987个教学模型语义部件；含合并构件组、设备组和环境示意，不等于987个制造单件。',
    'directionConventionChinese':'前为模型Three.js坐标+Z，后为−Z，右为+X，左为−X；是固定模型图谱方位，不是实楼东南西北或当前镜头屏幕方向。',
    'trussDirectionConventionChinese':'伸臂从核心筒端指向外柱端：外升斜杆下内上外，内升斜杆上内下外。环带按该条记录两个端点的先后定义顺向/逆向。左右显示仅用于对应局部正视图。',
    'labelPolicy':{
        'overview':'只显示十个大类名和987部件图谱标题，部件名称全部生成但按屏幕可读尺寸显示。',
        'middle':'显示当前区域的分区与构件种类，保持邻近模型名称空间一致。',
        'close':'一到四个主标签为宜；主行为类型，次行为区位，极长连接位置允许拆两行，避免密集小字。',
        'minimumReadablePixelsAt1080p':32,
        'note':'完整987个名称可以供交互或高分辨率总览查看；30—60秒视频无法让观众逐个读完，不能同时缩小塞进一帧。',
    },
    'categories':[{'id':key,'nameChinese':v[0],'order':v[1],'descriptionChinese':v[2],'count':counts[key]} for key,v in CATEGORIES.items()],
    'parts':parts,
    'byId':{p['id']:p['nameChinese'] for p in parts},
    'checks':{'all987IdsCovered':True,'all987NamesUnique':True,'all987CompactLabelsUnique':True,'displayNamesContainNoLatinIds':True,'pileCount947':True,'mappedStructuralParts705':True,'trussEndpointSlopeChecksPassed':True},
}
(OUT/'naming.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'naming-audit.json').write_text(json.dumps({
    'passed':True,'count':987,'categories':data['categories'],
    'sourceManifestSHA256':data['sourceManifestSHA256'],'sourceGraphSHA256':data['sourceGraphSHA256'],
    'criticalFindings':[
        '四个PILES_Q网格是交错索引桩群，237/237/237/236根；不是四象限。',
        '第六至八区的环带转角节点没有辅助角柱，名称使用转角而不误称角柱。',
        '核心筒墙、楼板、幕墙、园林和多数设备mesh均为构件组。',
        'FLOOR_INSPECTION_Z04为原楼板语义分离件，并非新增楼层或实物检修平台。',
        'TMD_CABLES为12根索的合并网格，绝非一根悬索。',
        '五层土为环境教学示意，不是结构零件或真实场地勘探层界。',
    ],'checks':data['checks']},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'parts':len(parts),'categories':dict(counts),'output':str(OUT/'naming.json')},ensure_ascii=False))
