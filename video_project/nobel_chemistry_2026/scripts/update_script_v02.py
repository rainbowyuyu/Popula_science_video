from pathlib import Path
import json,re
p=Path('docs/v02/narration-v02.json');d=json.loads(p.read_text('utf8'));rs={r['id']:r for r in d['clips']}
changes={
'006':'1986年，Kagan 团队发现，催化剂的左右比例，并不总会照搬到产物里。看这个双配体模型：在一大群配体里，右手占四分之三，左手占四分之一。两两围到金属旁边，会形成右右、左右、左左三种组合，比例大约是百分之五十六、三十八和六。',
'007':'如果左右组合很少参与反应，真正工作的主要就是右右和左左。它们的数量比是九比一，产物便能接近九成对一成。把两边所占的百分比相减，就得到对映体过量：催化剂是百分之五十，产物变成百分之八十。曲线弯到直线上方，这就是正非线性效应。',
'008':'接下来，Kenso Soai 团队把放大器接成了回路。二异丙基锌，和带着醛基的嘧啶反应，先得到手性的锌醇盐，处理后得到醇。锌醇盐还能催化下一轮加成。1995年的工作，把大约百分之二的初始对映体过量，放大到了百分之八十七。产物开始参与制造自己。',
'011':'2003年，Soai 团队又把起点推到极限：初始对映体过量，只有百分之零点零零零零五。补加原料，连续三轮，升到百分之五十七、百分之九十九，最后超过百分之九十九点五。注意，这个数衡量的是两边的差，超过百分之九十九点五的过量，对应优势一边超过百分之九十九点七五。'}
for rid,text in changes.items():
 r=rs[rid];r['spoken']=text;r['displayText']=text;r['ttsText']=text;r['subtitleTexts']=re.findall(r'[^，。！？；：]+[，。！？；：]?',text);r['revision']='Science audit: clarified sampling population, ee percent difference, zinc alkoxide vs workup, named Soai team.'
for r in d['clips']:
 r['ttsText']=r['spoken'].replace('Henri B. Kagan','Henri B Kagan')
 r['ttsPronunciationMap']=[{'display':n,'method':'same-reference native-language carrier substitution; exact word times; candidates pending'} for n in ['Henri B. Kagan','Kenso Soai','Louis Pasteur','Charles Frank','Kagan','Soai'] if n in r['spoken']]
d['version']='nobel-chemistry-2026-v02-corrected';p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
Path('docs/v02/story-v02.md').write_text('# 2026诺贝尔化学奖 V02 讲稿\n\n显示文本保留官方姓名拼写；朗读实现与候选存于 pronunciation 文件，不把音标或假名显示到画面。\n\n'+'\n\n'.join('## '+r['id']+' · '+r['scene']+'\n\n'+r['spoken'] for r in d['clips'])+'\n',encoding='utf8')
