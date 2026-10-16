"""Authored Chinese narration; timing is rebuilt from actual un-stretched Qwen clips."""
import json,re
from pathlib import Path
V3=Path(__file__).resolve().parents[1]
GROUPS=[
('hook',0,18,[
'手机里那段舍不得删的家庭视频，换过几次硬盘以后，还能留住多久？',
'如果把它存进一小滴液体，许多年后，再完整地放出来呢？科学家已经在试这件事。']),
('encode',18,44,[
'视频在电脑里，就是一串零和一。先切成小段，给每段留一个位置编号。',
'两个二进制位一组：零零、零一、一零、一一，正好四种组合。',
'它们可以对应四种碱基，也就是脱氧核糖核酸里的四个字母。字母的顺序，开始替文件记事。']),
('constraints',44,75,[
'可分子会挑食。相同字母连续太多，合成和读回时，就容易数错。',
'四个字母的比例也得照顾。画面上这两种字母，合起来的占比，不能太偏。',
'编码器像道质检口：重复太长、比例不合适，退回重编；合格的，往前走。',
'位置编号也带上。将来分子全混在一起，还能找到它属于哪一段。']),
('fountain',75,118,[
'假如有几段彻底读不到了，视频会不会少掉几秒？',
'喷泉码会从原文件里挑几块，混成新数据，再换个组合，继续生成。',
'这里的液滴，是数据包的比喻。每滴带着种子编号，用来找回它混入了哪些块。',
'混合用到异或：两位一样得零，不同得一。再异或一次，能消掉已知部分。',
'先找到甲，就能从甲乙组合里解出乙。再用乙，从乙丙组合里解出丙。',
'收到足够合适的组合，即使丢了几滴，也有机会找回文件。冗余藏在这些关系里。']),
('wetlab',118,160,[
'编码准备好了。合成仪按照序列，把碱基接起来，做成许多短分子链。',
'纯化后妥善保存，信息留在分子的排列里，无需持续供电，却仍然怕损伤。',
'想再看视频，就取出样本，交给测序设备，把分子上的信号翻译回字母。',
'麻烦也来了：一个字母认成另一个，叫替换；多一个，叫插入；少一个，叫缺失。',
'还有些链，整条没读到。同一段往往会读出许多副本，各自带着不同的小错误。']),
('consensus',160,216,[
'几个人抄同一张字条，各有错漏。合起来看，线索就更多了。',
'先检查编号，同一段分到一组。质量太差或归属不明的，先放一旁。',
'接下来对齐字母。两行直接贴住，漏掉一个字母，后面就全错位了。',
'算法允许留空位。相同字母加分，不同字母扣分，空位也有代价。',
'方格表记录每一步的最好分数。沿高分路径往回走，找出最像的局部片段。',
'这叫局部比对。这里用史密斯沃特曼算法，把缺口放到合理的位置。',
'对齐后逐列看证据。可靠的副本权重更高；信息太弱，保留疑问。',
'得到共识序列后，纠错、解码，补回缺片，再用校验值检查文件。']),
('model',216,262,[
'有些排列总是难处理，下一轮写入，能不能提前避开？',
'大模型可以帮忙。先把序列切成小片段，好比拆成模型认识的小词块。',
'有的固定每块几个碱基；有的合并常见组合，叫字节对编码。分词办法可以选择。',
'模型学习片段的联系。配合这台设备的实验数据，才能给候选打分，预测出错风险。',
'再做约束检查，结合论文和读回结果，挑出值得下一轮试验的序列。',
'大语言模型协助查资料、调用工具。读写仍靠编码器、合成仪和测序仪接力。']),
('return',262,290,[
'四个字母变回零和一，家庭视频又亮了。藏进小瓶子的，是一套能够来回翻译的规则。',
'科学家已经把文字、图片和声音存进合成的分子。写入成本和读取速度，还在继续改进。',
'今天它更接近一座长期档案馆。或许未来，留给下一代的记忆，真的能装进这样一只小瓶子。'])]

def main():
 cues=[]
 for shot,start,end,lines in GROUPS:
  weights=[len(re.sub(r'[^\w\u4e00-\u9fff]','',t)) for t in lines]
  at=start+.25
  for j,(text,w) in enumerate(zip(lines,weights)):
   length=(end-start-.6)*w/sum(weights)
   cues.append({'id':f'n{len(cues)+1:02d}','shotId':shot,'startSec':round(at,4),'endSec':round(at+length,4),'text':text,'spokenText':text,'timingStatus':'estimate-pending-actual-voice'})
   at+=length
 data={'version':3,'durationSec':300,'fps':30,'title':'文件能写进一滴 DNA 吗？','cues':cues,'groups':[{'id':i,'startSec':s,'endSec':e}for i,s,e,_ in GROUPS], 'timeStretch':False}
 (V3/'src').mkdir(exist_ok=True)
 (V3/'src/narration.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
 print('characters',sum(len(x['text'])for x in cues),'cues',len(cues))
 for shot,s,e,lines in GROUPS:print(shot,e-s,sum(len(x)for x in lines))
if __name__=='__main__':main()
