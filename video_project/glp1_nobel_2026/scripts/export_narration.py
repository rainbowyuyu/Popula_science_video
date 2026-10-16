"""Export the current measured narration script without changing source wording."""
from voice import ROOT,read,sha

TITLES={'news':'新闻引子','meal':'一顿晚饭','gut':'肠道发出信号','pancreas':'胰腺接收信号',
        'brain':'食欲与大脑','drug':'把天然信号变成药物','trial':'临床试验与长期管理',
        'daily':'长期管理','award':'发现的价值','outro':'回到那顿晚饭','references':'参考文献','journey':'同一个身体里的连续故事'}

def stamp(frame,fps):
    seconds=frame/fps
    return f'{int(seconds//60):02d}:{seconds%60:04.1f}'

def main():
    story=read(ROOT/'docs/story.json');timeline=read(ROOT/'public/timeline.json');fps=timeline['fps']
    originals={row['id']:row for row in story['shots'] if row.get('text','').strip()}
    for clip in timeline['clips']:
        take=read(ROOT/'audio/takes'/f"{clip['id']}.json")
        if clip['text']!=originals[clip['id']]['text'] or clip['audioSHA256']!=take['sha256']:
            raise ValueError('Timeline does not describe current narration: '+clip['id'])
        if sha(ROOT/take['processed'])!=take['sha256']:
            raise ValueError('Narration audio changed: '+clip['id'])
    lines=[f'# {story["title"]}','','rainbow鱼 · 每天5分钟科普','',
        f'影片总时长 {stamp(timeline["duration"],fps)}；解说段至 {stamp(timeline["outro"]["start"],fps)}，随后为9秒无旁白参考文献片尾。',
        '',f'以下为本轮{len(timeline["clips"])}句解说定稿，时间来自逐句实测音频。','']
    for section in timeline['sections']:
        clips=[clip for clip in timeline['clips'] if section['start']<=clip['start']<section['end']]
        if not clips:continue
        lines.extend([f'## {stamp(section["start"],fps)}—{stamp(section["end"],fps)} {TITLES.get(section["id"],section["id"])}',''])
        for clip in clips:lines.extend([originals[clip['id']]['text'],''])
    path=ROOT/'delivery/解说稿.md';path.write_text('\n'.join(lines),encoding='utf-8')
    print(f'Exported {path}; {len(timeline["clips"])} measured clips.')

if __name__=='__main__':main()
