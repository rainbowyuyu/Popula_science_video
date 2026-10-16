from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]; (R/'research/episode3').mkdir(parents=True,exist_ok=True); (R/'public/episode3/voice-raw').mkdir(parents=True,exist_ok=True); (R/'public/episode3/voice').mkdir(parents=True,exist_ok=True); (R/'output/episode3').mkdir(parents=True,exist_ok=True); (R/'delivery/episode3').mkdir(parents=True,exist_ok=True)
scenes=[
('rain','雨里的亭子',['雨下得很细，园子里的小亭子却稳稳站着。','没有一根外露的钉子，屋檐、柱子和横梁像是彼此扣住。','如果把它拆开，里面到底藏着什么？']),
('question','一个看不见的连接',['很多人第一次听到榫卯，会把它想成木头版的积木。','可真正的难点不是拼起来，而是受力以后还不松。','柱子把重量往下传，横梁又会把柱子向外推。']),
('parts','先看两块木头',['我们先把亭子缩小，只留下最基本的一根柱和一根梁。','柱端凸出来的部分叫榫，梁里挖出的槽叫卯。','榫伸进去，卯把它包住，连接就不只靠一颗钉子。']),
('joint','榫卯的三维剖面',['镜头沿着木纹切开，连接处其实有三个方向的约束。','上下方向，它承受压紧；左右方向，肩部限制滑动。','横向的剪力，则由榫头和卯壁共同传递。','所以它看起来只是一个缺口，实际上是一组几何锁。']),
('fit','为什么不能太紧',['但榫卯不是越紧越好。','木头会吸湿、干燥、收缩，尺寸一直在季节里变化。','匠人会给它留下很小的余量，让木头有呼吸的空间。','太松会晃，太紧又可能把木纤维挤裂。']),
('assembly','把亭子拼起来',['现在从底座开始，四根柱子先落在石台上。','横梁沿着木柱的卯口滑入，动作不是硬撞，而是顺着木纹推进。','斗拱和檐下的短构件逐层接力，把屋顶的重量分散开。']),
('load','让力走一遍',['我们给屋顶加上同样的竖向荷载，再看力线怎么走。','重量从瓦面到檩条，从檩条到梁，再沿柱脚进入石台。','每一个榫肩都在阻止构件继续滑开。','这就是榫卯最朴素的逻辑：让力沿着木头可以承受的方向走。']),
('compare','和钉子有什么不同',['钉子把两块木头拉在一起，榫卯则把接触面做大。','木材顺纹和横纹的强弱不同，接头形状也不能随便画。','它不是天然比现代连接件更强，而是把材料特性变成了结构的一部分。']),
('repair','为什么老建筑能修',['如果某一根构件受潮或损坏，工匠可以沿连接方向把它抽出。','换掉一根，再按原来的顺序装回去，整体关系还在。','可拆、可换、可继续使用，是它能够陪建筑走很久的原因。']),
('return','回到雨里的亭子',['再看那座雨里的亭子，屋檐的重量已经被分成许多小段。','你看见的是一座安静的木屋，里面却有一条清楚的受力路径。','榫卯不是神秘机关，而是把木头的形状、方向和时间放在一起。','下一次经过古建筑，可以找一找那些藏在阴影里的接头。'])]
rows=[]
for scene,title,texts in scenes:
 for t in texts: rows.append({'id':f'{len(rows):03d}','scene':scene,'title':title,'text':t,'spoken':t})
(R/'research/episode3/story.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print('clips',len(rows))
