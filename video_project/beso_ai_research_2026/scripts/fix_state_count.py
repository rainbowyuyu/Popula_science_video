from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
old='这组研究算例走过四十四轮，最终保留大约四分之一的初始质量。'
new='这组研究算例留下四十四个状态，最终保留大约四分之一的初始质量。'
for p in [R/'research/story.json',R/'research/voice-story.json',R/'scripts/write_story.py']:
    text=p.read_text('utf8');assert old in text;p.write_text(text.replace(old,new),'utf8')
print('Count clarified: initial state + 43 updates.')
