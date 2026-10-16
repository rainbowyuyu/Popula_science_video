"""One continuous cardiometabolic story. TTS timing replaces this preview timeline."""
from pathlib import Path
import json, re
R=Path(__file__).resolve().parents[1]

# view | short focus | narration. Identical view keys share anatomy, never new slides.
DATA='''
meal|科学减重，读懂三高|体检单上，血糖、血压、血脂一起亮了红灯，腰围也比去年大了一圈。先从哪里改起？
meal|从一顿饭说起|今天，就跟着一顿家常饭走进身体。看看这些数字怎样连在一起，再把能做的事，带回饭桌和日常生活。
torso|同一个身体|饭要送到全身，心脏负责推动，肝脏负责分配，肾脏调节水盐。它们天天一起工作，三高也常常互相牵动。
stomach|饭进了身体|米饭经过消化，变成可以吸收的糖；食物中的脂肪，也要拆开、重新包装，才能送往需要它的地方。
gut|从肠道出发|食物从胃来到小肠。这里的肠壁很薄，营养从这里进入身体。肠壁里的细胞，也会传出吃饭的消息。
liver|肝脏，分配营养|一部分糖马上供能，一部分存进肝脏和肌肉。饭后血糖上升，身体就得及时安排这批新到的营养。
torso|多出来的，存在哪里|如果吃进去的长期多于用掉的，身体会把多余能量存起来。腰围慢慢增加，内脏周围的脂肪也可能变多。
liver|信号开始不好使|脂肪堆积、遗传和生活习惯等因素，会让肝脏、肌肉对胰岛素的反应变弱。这就叫胰岛素抵抗。
pancreas|胰腺接到任务|胰岛素帮助细胞利用和储存糖，也提醒肝脏少向血里放糖。反应变弱时，胰腺往往要分泌得更多。
gut|一条吃饭的消息|研究者发现，同样把血糖升到相近水平，喝糖水引起的胰岛素反应，常比静脉输糖更强。肠道还传了什么消息？
lcell|找到发信的细胞|现在慢慢靠近肠壁。周围的组织变透明，原来位置上的细胞露了出来，其中一类，叫作L细胞。
lcell|GLP-1，从这里出发|吃饭以后，它们会释放一种信号，叫GLP-1。信号从朝向周围组织和血管的一侧释放，参与血糖和进食的调节。
pancreas|沿着身体，找接收处|把镜头拉回腹部。胃的后面，是胰腺。接收这条消息的细胞，就藏在这个器官里面。
islet|胰腺里的小岛|先看胰腺表面这一点，再慢慢走近。周围组织还留在原处，一小团细胞逐渐显出来，这就是胰岛。
islet|小岛有多小|眼前选取的示意胰岛，直径约零点一五毫米。真实胰岛有大有小，右边的尺子会一直告诉我们，现在看到多大的范围。
beta|从胰岛，走到细胞|我们再靠近胰岛边上的一颗细胞。邻居们慢慢变透明，眼前这一颗保留下来，它是分泌胰岛素的贝塔细胞。
beta|胰岛素，装在小泡里|这颗示意细胞直径约十五微米。里面有装着胰岛素的小泡，接到合适的信号，小泡会来到细胞膜边。
receptor|再看细胞膜上的接收器|继续靠近这颗细胞的表面，细胞膜变成眼前的一大片。再往前，才能看清纳米大小的GLP-1受体。
receptor|接上了，消息才传进去|GLP-1与受体结合，细胞里的传信过程得到加强。血糖升高时，细胞收到这条消息，就更容易释放胰岛素。
receptor|一个片段，改变了结果|一九八七年的研究，把长短不同的GLP-1片段放进实验。较短的活性片段，推动了胰岛素释放，这条线索才渐渐清楚。
secretion|从接收，到释放|镜头沿着同一片细胞膜退回来。小泡贴近细胞膜、与它融合，胰岛素释放到细胞外，再进入循环。
pancreas|饭后的一次协调|回到整个胰腺，这样的细小变化，在许多细胞中同时发生。肠道报信、胰腺响应，身体一起处理这顿饭。
liver|肝脏也在听消息|可在胰岛素抵抗时，肝脏收到的约束变弱。哪怕血里已经有不少糖，它仍可能继续往外放糖。
lipid_liver|糖和脂肪，在这里相遇|肝脏还处理脂肪。脂肪酸可以从脂肪组织送来，也能由肝脏合成，再做成甘油三酯，装进运输颗粒，送往全身。
lipid_liver|脂肪也要打包运输|这类从肝脏出发的颗粒，叫极低密度脂蛋白。它携带的甘油三酯，给肌肉供能，也能送到脂肪组织储存。
lipoprotein|靠近血液里的运输颗粒|我们跟着一颗运输颗粒走近，周围的血液结构逐层退远。脂蛋白只有几十纳米，肉眼看不到，绝不是一大滴油。
lipoprotein|货物卸下，颗粒改变|甘油三酯被逐步卸下，部分颗粒经过变化，形成低密度脂蛋白，简称LDL。化验单常测的，是它携带的胆固醇。
lipoprotein|胆固醇，要送也要收|胆固醇参与细胞膜和激素等的制造。LDL负责运送它，肝细胞表面的受体，也会把颗粒接回来清除。
liver|送得多，收得慢|当生成、转运和清除失去平衡，血里的这些颗粒就会增多。饮食、遗传、胰岛素抵抗，都可能参与其中。
pressure|同一条血流，还有压力|营养要送到远处，靠的是心脏一次次推动血液。现在沿着肝脏旁的大血管，回到心脏和主动脉。
pressure|一下推开，再慢慢回弹|心脏收缩，主动脉被血液撑开；心脏舒张，它弹回来，继续推动血流。血压，就是血液作用在管壁上的压力。
arteriole|越往末端，管子越细|顺着血流往组织里走，粗动脉逐渐分出细支。镜头停在一条小动脉，外面环绕着能收缩的平滑肌。
arteriole|小动脉，调节阻力|肌肉收紧，管腔变窄，血液通过更费力；舒展开来，阻力减小。很多这样的小动脉，一起影响全身血压。
arteriole|压力，怎样传向管壁|这里把管壁剖开一部分。脉动让管壁反复承受压力；如果阻力长期偏高，心脏和血管的负担都会增加。
kidney|水盐，也在改变压力|再把镜头拉回身体，来到后腰两侧的肾脏。血压还受体内水盐多少影响，肾脏就是重要的调节者。
nephron|走进肾脏的一小部分|在肾脏表面选一个位置，慢慢向里看。这里用一个肾单位的局部模型，说明过滤和回收是怎样发生的。
nephron|滤出去，还要收回来|血浆里的一部分水和小分子，先被滤入管腔。随后，身体又把需要的水和盐收回来，其余部分形成尿液。
nephron|盐和水，会一起牵动血量|如果钠排得少、留得多，水也可能跟着留在体内，循环里的液体增多。对盐敏感的人，血压更容易受影响。
kidney|肾脏还会发送调节信号|肾脏感到灌注不足时，会启动一套保盐、保水和收缩血管的调节。短时有用，长期失衡却可能推高血压。
autonomic|心脏、血管，都受神经调节|还有一条调节通路来自神经。紧张、运动时，交感活动增强，心跳加快，部分血管收缩，帮助身体应对需要。
autonomic|调节，牵动全身|肥胖、睡眠呼吸暂停等问题，可能让交感和水盐调节长期偏向升压。腰围、睡眠和血压，也就连在了一起。
torso|三高，开始互相牵动|同一个身体里，糖的利用不顺、脂肪运输失衡、压力长期偏高，常常一起出现，也会共同影响血管。
plaque|再回到一段动脉|我们回到这段动脉，沿着管壁慢慢靠近。血里的LDL颗粒，有一些会进入管壁内侧，并在那里滞留下来。
lipid_wall|留在管壁里的颗粒|继续放大原来这一小块管壁。滞留的颗粒发生变化，免疫细胞赶来处理，吃进去的脂质越来越多。
lipid_wall|处理不过来，就积在那里|这些细胞逐渐变成富含脂质的泡沫细胞。清理和修复反复发生，局部炎症持续，斑块便可能慢慢发展。
plaque|斑块，长在管壁里面|现在退回整段血管。刚才那一小块变化，就发生在管壁里；斑块长大以后，可能让管腔变窄。
plaque|血糖、血压，在这里汇合|长期高血糖会损害血管，高血压增加管壁负担，过多的致动脉粥样硬化颗粒提供沉积来源，吸烟也会添上一把火。
thrombus|表面破了，血小板赶来|有些斑块的表面会破裂或糜烂。血小板聚集、凝血发生，本来用来止血的过程，可能在血管里面形成血栓。
brainheart|危险，来自供血中断|如果血栓堵在冠状动脉，心肌会缺血；发生在供应大脑的动脉，也可能引起缺血性脑卒中。
torso|回到体检单，分别处理|所以，体重、血糖、血压、血脂，要放在一起看，也要分别测量和处理。不能只盯着体重秤上的一个数字。
action_meal|下一顿饭，怎样改|回到这顿饭。先从最容易坚持的一处改：把含糖饮料换成水，减少零食和夜宵，给蔬菜和优质蛋白留出位置。
action_meal|主食，换得粗一点|主食可以适量用全谷物、杂豆替换一部分精白米面。每餐有安排、总量适合自己，比今天饿一天更容易坚持。
action_meal|脂肪，注意来源|少一些肥肉、加工肉和反式脂肪，适量选择鱼、坚果和植物油。油换了种类，用量也得留心。
action_meal|盐，藏在许多调味里|一般成人每天食盐少于五克，是常用的建议。酱油、咸菜和加工食品里的盐，也要一起算进去。
kidney|替代品，也要看身体情况|低钠盐常用一部分钾替代钠。有肾病，或者正在用影响血钾的药，先问医生是否适合，别自行大量换用。
muscle|减重时，把肌肉留下|尤其对老年人，吃得过少，可能连肌肉一起丢。体重下降的同时，要保证合适的营养，关注力量和活动能力。
muscle|让肌肉，多用一点糖|肌肉活动起来，会增加能量和葡萄糖的利用。散步、骑车，再配合适合身体的力量练习，能从小量逐步开始。
muscle|动多久，按身体来安排|一般成人每周争取一百五十到三百分钟中等强度活动，至少两天力量练习；体弱或有心脏病，先评估，再逐渐增加。
torso|睡眠，也值得认真看|打鼾很响、夜里憋醒、白天困倦，可以把这些情况告诉医生。睡眠呼吸暂停，可能同时影响体重和血压管理。
homecheck|血压，要在安静时看|量血压时，先安静坐五分钟，背部有支撑，双脚落地。手臂有支撑，袖带中部与心脏同高，大小也要合适。
homecheck|看一段时间的记录|按医生建议在家规范测量，记录多天结果。一回紧张时的高读数，需要复测；已经确诊，也别凭感觉自行停药。
liver|血脂，不能靠感觉判断|血脂高常常没有明显感觉。医生会结合化验、既往心脑血管病和其他风险，判断需要怎样的控制目标和治疗。
pancreas|血糖，同样要有自己的目标|血糖管理也需要个体化。老年人尤其要留意低血糖，别为了追一个漂亮数字，让自己头晕、跌倒或吃不下饭。
pressure|需要用药时，针对问题处理|生活调整之外，医生可能用药帮助血管舒张，或者调整水盐和激素通路。具体选择，要看身体情况和其他用药。
liver|减少颗粒，也有不同办法|降低胆固醇的治疗，可以减少肝脏合成，或帮助清除血里的颗粒。选哪种、需不需要联合，依据的是个人风险和检查。
gut|吃不下与总想吃，都要问原因|再回到肠道和大脑的对话。饥饿、饱腹、食物诱惑，都参与进食；长期体重问题，值得得到系统的评估和帮助。
pancreas|GLP-1研究，带来了新工具|GLP-1研究提供了一类治疗工具。研究者改造这条容易降解的信号，让药物在体内停留更久，参与血糖和食欲调节。
autonomic|用药，需要和生活一起安排|这类药物有适用条件，也可能引起不适。是否使用、怎样调整，应由医生评估，同时兼顾营养、肌肉，以及已经患有的疾病。
torso|每个人，起点都不一样|体弱老人、正在减重的人、已有心脑血管病的人，安排不会完全相同。把自己的检查和用药带齐，和医生一起定计划。
brainheart|这些信号，要及时求助|如果突然一侧无力、口角歪斜、说话不清，或出现疑似心梗的胸痛、大汗等症状，立即拨打一二零，别等下一次体检。
action_meal|把计划，放回每天的生活|今天少一杯甜饮，明天多走一小段，把测量和复诊坚持下来。每一步都不大，合起来才是一份能过下去的计划。
meal|科学减重，照顾整个身体|从饭桌出发，我们走过肠道、肝脏、血管和肾脏。照顾好体重，也照顾血糖、血压和血脂，让身体的配合慢慢顺起来。
'''.strip()

SOURCE={
'meal':['who_healthy_diet'],'torso':['niddk_ir','who_hypertension'],
'stomach':['niddk_digestive'],'gut':['nauck1986','muller2019'],
'lcell':['muller2019','osinski2022'],'liver':['niddk_ir','endotext_lipoprotein'],
'pancreas':['niddk_ir','muller2019'],'islet':['huang2018','cabrera2006'],
'beta':['rorsman2018'],'receptor':['zhang2017','mojsov1987','drucker1987'],
'secretion':['rorsman2018'],'lipid_liver':['endotext_lipoprotein'],
'lipoprotein':['endotext_lipoprotein'],'pressure':['who_hypertension','nhlbi_bp'],
'arteriole':['nhlbi_bp'],'kidney':['niddk_kidneys','who_sodium'],
'nephron':['niddk_kidneys'],'autonomic':['nhlbi_bp','nhlbi_sleepapnea'],
'plaque':['aha_atherosclerosis'],'lipid_wall':['aha_atherosclerosis','endotext_atherogenesis'],
'thrombus':['aha_atherosclerosis'],'brainheart':['aha_stroke','aha_heartattack'],
'action_meal':['who_healthy_diet','who_sodium'],'muscle':['who_activity','espen_geriatric'],
'homecheck':['aha_home_bp']}

def main():
    shots=[]
    for i,line in enumerate(DATA.splitlines(),1):
        view,title,text=line.split('|')
        row=dict(id=f'g{i:03d}',section='journey',view=view,title=title,text=text,caption=text,sourceIds=SOURCE[view])
        spoken=text.replace('GLP-1','胰高血糖素样肽一').replace('LDL','低密度脂蛋白').replace('L细胞','艾勒细胞')
        if i==27:spoken=spoken.replace('，简称低密度脂蛋白','')
        if '量血压' in spoken: spoken=spoken.replace('量血压','测血压')
        row['ttsText']=spoken
        row['chapter']='科学减重 · 血糖 · 血压 · 血脂'
        shots.append(row)
    story=dict(title='科学减重，读懂三高',subtitle='从一顿饭看懂血糖、血压、血脂与心脑血管健康',revision='v4-integrated',status='ready-for-audio',shots=shots,
               durationNote='No fixed duration; measured original narration. No efficacy or benefits charts.',sources='research/revision-v4/evidence.md')
    (R/'docs/story.json').write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n','utf8')
    (R/'research/revision-v4/story.md').write_text('# 科学减重，读懂三高\n\n'+'\n\n'.join(f"**{s['id']} · {s['view']} · {s['title']}**\n\n{s['text']}" for s in shots),'utf8')
    clips=[];cursor=12
    for row in shots:
        frames=round(max(7,len(row['ttsText'])/4.2+1)*30)
        clips.append(dict(**row,start=cursor,end=cursor+frames,duration=frames));cursor+=frames
    tl=dict(fps=30,duration=cursor+300,clips=clips,sections=[dict(id='journey',start=12,end=cursor),dict(id='references',start=cursor,end=cursor+300)],captions=[],draft=True)
    (R/'src/timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2),'utf8')
    (R/'public/timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2),'utf8')
    print(len(shots),'clips',sum(len(s['text']) for s in shots),'characters',tl['duration']/30,'preview seconds')

if __name__=='__main__':main()
