"""Author v8 narration against the real, shared pavilion parts before audio."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Display text always keeps the proper architectural terms. Homophones are
# confined to the speech input; they are not subtitles or on-screen labels.
PRONUNCIATION = {
    '榀': {'spoken': '品', 'pinyin': 'pǐn'},
    '枋': {'spoken': '方', 'pinyin': 'fāng'},
    '椽': {'spoken': '传', 'pinyin': 'chuán'},
    '檩': {'spoken': '凛', 'pinyin': 'lǐn'},
    '石础': {'spoken': '石楚', 'pinyin': 'shí chǔ'},
    '斗栱': {'spoken': '斗拱', 'pinyin': 'dǒu gǒng'},
    '栱': {'spoken': '拱', 'pinyin': 'gǒng'},
}

# text, actual focus part IDs, visible action, newly introduced annotation terms
SECTIONS = [
('intro', '一座亭子，怎样站住', [
('下雨时，我们总往亭子里躲。这么大一片屋顶，怎么靠几根木头托住？', ['TILE_FRONT','POST_FL'], 'Open the assembled pavilion into its actual subassemblies.', []),
('把屋面拿开，再把梁柱拆开。藏在里面的接头，比外面的花纹更有意思。', ['CROSS_FRONT','POST_FL'], 'Move the camera through the open roof to the front beam joint.', []),
('每根木头都留着凸起和缺口。接起来要稳，还得真的装得进去。', ['CROSS_FRONT','POST_FL'], 'Hold on the matching solid tenon and mortise.', []),
('今天就跟着这座亭子，从一根横梁开始，看看它怎样撑起头顶的屋檐。', ['CROSS_FRONT'], 'Track the same beam toward the first close-up.', []),
]),
('straight', '先留一条装进去的路', [
('看横梁这一端，凸出来的叫榫头，柱子里挖出的口叫卯口。', ['CROSS_FRONT','POST_FL'], 'Separate the actual beam end and its mortise; label each after its shape is visible.', ['榫头','卯口']),
('榫头旁边留下的台阶，叫榫肩。插到这里，梁端就贴住柱子。', ['CROSS_FRONT','POST_FL'], 'Show the shoulder reaching its stop without pushing through the column.', ['榫肩']),
('卯口的侧壁限制它左右晃动，里面相贴的木面，接住传来的压力。', ['CROSS_FRONT','POST_FL'], 'Reveal side walls and actual bearing faces with selective transparency.', []),
('可要是两根柱子先固定好了，两头都有榫的梁，怎么塞进去？', ['POST_FL','POST_FR','CROSS_FRONT'], 'Show both tenoned ends constrained by the two posts, without clipping.', []),
('所以先把横梁和斜撑接成一组，再让两根柱子从两边合拢。', ['CROSS_FRONT','BRACE_X_FL','BRACE_X_FR','POST_FL','POST_FR'], 'Brace-and-beam subassembly first; move posts inward along X.', ['斜撑']),
('再穿上这根木销。它横着通过对齐的孔，拦住榫头退出的方向。', ['PEG_X_FL','POST_FL','CROSS_FRONT'], 'Insert the actual transverse peg along its hole axis.', ['木销']),
('想拆开，就倒着走：先退销，再分开柱子，横梁才有退出的路。', ['PEG_X_FL','POST_FL','POST_FR','CROSS_FRONT'], 'Reverse the unloaded isolated subassembly, with peg removal first.', []),
]),
('frame', '两榀，合成一个空间', [
('这样一排梁柱架，叫一榀。做出前后两榀，亭子还缺纵向的连接。', ['CROSS_FRONT','CROSS_BACK','POST_FL','POST_BL'], 'Pull back to reveal the two complete bents.', ['榀']),
('中间放上纵向枋和斜撑，让前后两榀沿着榫头合拢。', ['LONG_LEFT','LONG_RIGHT','BRACE_Y_FL','BRACE_Y_BL'], 'Bring the two bents inward over the stationary longitudinal tenons.', ['纵向枋']),
('绕到柱头看，两个方向的榫头错开了高度，才不会挤在一起。', ['POST_FL','CROSS_FRONT','LONG_LEFT'], 'Orbit the same post and reveal its two orthogonal mortises.', []),
('孔开得多，未必牢。孔与孔之间，还得留下能接住压力的木料。', ['POST_FL'], 'Keep the solid web between mortises visible and readable.', []),
('最后穿好木销。前后左右连起来，四根柱子才成了一个空间骨架。', ['PEG_Y_FL','PEG_Y_FR','PEG_Y_BL','PEG_Y_BR'], 'Insert remaining transverse pins and pull back along the assembled frame.', []),
]),
('bracket', '柱头，怎样接住屋檐', [
('再往柱头看，这组层层交叠的构件叫斗栱，上面宽，下面落在柱子上。', ['DOU_FL','GONG_X_FL','GONG_Y_FL','CAP_FL'], 'Rise along the same column and show the bracket silhouette.', ['斗栱']),
('方块一样的是斗，伸出去的是栱。开口朝上，上面的木件就从上方落座。', ['DOU_FL','GONG_X_FL','GONG_Y_FL'], 'Separate the housed block and arms, then lower through their upward-open slots.', ['斗','栱']),
('抬开这一层，看交叉的地方。两根木头各让出位置，合起来才不会顶住。', ['GONG_X_FL','GONG_Y_FL'], 'Lift the upper crossing arm and orbit to reveal the complementary cutouts.', []),
('它把承托的位置向外伸，再把上面传来的重量，收回到柱头。', ['CAP_FL','GONG_X_FL','DOU_FL','POST_FL'], 'Follow the bracket from its outer support to the column.', []),
('沿着这几处相贴的木面看，每一层的下面，都要有东西接着。', ['CAP_FL','GONG_Y_FL','GONG_X_FL','DOU_FL'], 'Trace the actual stacked bearing surfaces in sequence.', []),
]),
('hip', '四个角，托起一个尖顶', [
('四根角梁往中心聚拢，屋顶的轮廓出来了。它们的端头，各有自己的座口。', ['HIP_FL','HIP_FR','HIP_BL','HIP_BR','HUB'], 'Move upward into the hip frame and reveal the four separate upward-open seats.', ['角梁']),
('拆一根看看：先抬离座口，再往外移。装回时，对准上方，再慢慢落下。', ['HIP_FL','HUB'], 'Lift clear, translate outward; reverse by aligning above the seat and lowering.', []),
('中心这根短柱也有落脚处。下面交叉的托梁，把它接住，重量再送向四周。', ['CENTRE_POST','SUPPORT_X','SUPPORT_Y'], 'Orbit down the central post to its crossing supporting beams.', ['短柱','托梁']),
('细长的木条一根根排上去，每根都对准下面的支承，屋面就分成了小跨。', ['RAF_3_03','RAF_3_04','PURLIN_Y_LEFT'], 'Lower actual rafters onto the modeled seats and purlin birdsmouths.', []),
('最后铺板、盖瓦。刚才透风的木架，变成了我们可以站进去躲雨的亭子。', ['DECK_LEFT','TILE_LEFT','DECK_FRONT','TILE_FRONT'], 'Close the roof along its real panel trajectories while descending to a sheltered view.', []),
]),
('gravity', '重量，沿着木头往下走', [
('屋面合上了，开头那个问题也该有答案了：这么多重量，怎么落到地上？', ['TILE_LEFT','DECK_LEFT'], 'Establish the gravity load on the complete roof before following one connected route.', []),
('先看瓦下面。这层板叫望板，它把上面的重量，分给下面一根根木条。', ['TILE_LEFT','DECK_LEFT','RAF_3_03'], 'Open the left roof layer and show board-to-rafter bearing.', ['望板']),
('这些斜木条叫椽子。沿左边这一根走，到落脚处，重量就交给横向的木头。', ['RAF_3_03','PURLIN_Y_LEFT'], 'Follow RAF_3_03 to its real purlin support at Three [-1.5,4.14,0.528].', ['椽子']),
('这根横木叫檩。它接住好几根椽子，跨过中间这段，再把重量送向柱头。', ['PURLIN_Y_LEFT','RAF_3_03','CAP_FL'], 'Move along PURLIN_Y_LEFT toward the front-left support, keeping continuity.', ['檩']),
('看檩条的这一小段：上面被挤紧，下面被拉开，两边一起抵住向下的弯曲。', ['PURLIN_Y_LEFT'], 'Enlarge signed fibers only at verified element 177 midpoint: top compression, bottom tension.', ['受压','受拉']),
('沿着檩再往前，就到了斗栱。先压住最上面的承托面，再一级一级交给柱头。', ['PURLIN_Y_LEFT','CAP_FL','GONG_Y_FL','GONG_X_FL','DOU_FL'], 'Trace the actual corner bearing stack, showing one interface at a time.', []),
('柱子接到重量，主要沿着身子往下压。脚下垫着的这块石头，叫石础。', ['POST_FL','STONE_FL'], 'Descend the column with the compressive response into its stone base.', ['柱','石础']),
('石础把柱脚托住，再把力交给下面的基础。落脚的面积大，压力就能摊开。', ['STONE_FL','PLINTH'], 'Show actual support reaction and geometric bearing area; do not invent stone stress.', []),
('回头看看伸出去的屋檐，那里的重量也得沿着木件，回到里面的支点。', ['RAF_3_03','PURLIN_Y_LEFT','HIP_FL'], 'Track the loaded eave back to its real rafter and hip support.', []),
('从瓦下面一直追到柱脚，每个接头都接上下一段。可风一来，又是另一回事。', ['DECK_LEFT','RAF_3_03','PURLIN_Y_LEFT','POST_FL','STONE_FL'], 'Pull back along the continuous load route and turn into the wind direction.', []),
]),
('wind', '侧面来的力，走哪条路', [
('风从侧面过来，先碰上屋檐，也从柱子中间穿过去，横着推这座亭子。', ['TILE_LEFT','POST_FL','POST_BL'], 'Enter the two actual computed flow slices and establish lateral wind.', []),
('顺着这两片气流看，屋檐把流向拨开；屋面上方和亭子里面，走着不同的路。', ['TILE_LEFT','TILE_RIGHT'], 'Show the two independent computed 2D LBM slice fields, correctly labeled.', []),
('屋顶有的地方受推，有的地方被往上掀，接头面对的力，也换了方向。', ['TILE_LEFT','TILE_RIGHT'], 'Display imposed engineering roof pressure signs from boundary-conditions.json.', []),
('侧推沿着屋面的支承传下来，梁柱接头跟着吃力，方正的木架想要歪过去。', ['PURLIN_Y_LEFT','LONG_LEFT','CROSS_FRONT','POST_FL'], 'Apply the native Zwind gravity-plus-wind response and follow roof-to-frame force.', []),
('再看斜撑：这边受挤压，那边被拉扯，侧面的推力沿着这些木件，传到了柱子上。', ['BRACE_X_FL','BRACE_X_FR','POST_FL','POST_FR'], 'Show front brace pair with verified native signs: FL tension, FR compression. Do not imply guaranteed tensile capacity of unpegged joints.', []),
('贴合的木面接住挤压，木销守住退出的方向，接头才不容易被来回推散。', ['PEG_X_FL','PEG_Y_FL','POST_FL','CROSS_FRONT','LONG_LEFT'], 'Reveal bearing contact directions and calculated nominal peg demand, not contact FE stress.', []),
('木头偏开原来位置的距离，叫位移。把它放大，再用颜色标出应力大小，就能看清哪里更吃力。', ['PURLIN_Y_LEFT','CROSS_FRONT','POST_FL'], 'Show amplified native displacement and absolute gross-section stress envelope on the same meshes; do not use this envelope to label signed tension or compression.', ['位移','应力']),
('风小下来，亭子又安静了。刚才那些接头，把一根根木头留在了同一条传力的路上。', ['POST_FL','CROSS_FRONT','LONG_LEFT'], 'Ease the physical excitation down and orbit back to the assembled wood pavilion.', []),
]),
('return', '每一块，都有它的位置', [
('再看这座亭子，接头的凹凸就有了意思：它决定怎么装，也决定力往哪里走。', ['CROSS_FRONT','POST_FL','DOU_FL'], 'Revisit three previously explained real interfaces without a second full assembly recap.', []),
('日后修理，也要先把上面的重量托住，再顺着装配的次序，一步步退出来。', ['CROSS_FRONT','POST_FL'], 'Keep the model supported; show only the unloaded joint withdrawal principle.', []),
('下次等雨停的时候，抬头多看一眼。那些不起眼的接头，正一起托着这一小片屋檐。', ['TILE_FRONT','POST_FL'], 'Finish at human eye height under the complete pavilion and drift into references.', []),
]),
]

clips = []
for scene, title, lines in SECTIONS:
    for line, (text, parts, action, terms) in enumerate(lines):
        spoken = text
        for term, pronunciation in PRONUNCIATION.items():
            spoken = spoken.replace(term, pronunciation['spoken'])
        clips.append({
            'id': f'v8_{len(clips):03d}', 'scene': scene, 'title': title,
            'text': text, 'spoken': spoken, 'line': line, 'pauseAfterSeconds': .28,
            'focus': {'parts': parts, 'action': action}, 'annotation_terms': terms,
        })

manifest = json.loads((ROOT/'research/episode3v7/pavilion-manifest.json').read_text(encoding='utf-8'))
part_ids = {p['id'] for p in manifest['parts']}
assert len(clips) == 47
assert len({c['id'] for c in clips}) == len(clips)
for clip in clips:
    assert set(clip['focus']['parts']) <= part_ids, clip
assert 'inverse' not in {c['scene'] for c in clips}
han_count = sum(len(re.findall(r'[\u3400-\u9fff]', c['text'])) for c in clips)
out = ROOT/'research/episode3v8/story.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({
    'schema': 'rainbow.story.v8/1', 'clips': clips,
    'referencesHoldSeconds': 12,
    'pronunciation_overrides': PRONUNCIATION,
    'hanCharacterCount': han_count,
    'note': 'Speech-driven timing. Never truncate or time-compress narration. Display text retains architectural spelling; spoken only contains deliberate pronunciation substitutions. Shared v7 real assembly and native physics assets remain the source of truth. References hold for 12 seconds.',
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(clips)} clips; {han_count} Han characters; {out}')
