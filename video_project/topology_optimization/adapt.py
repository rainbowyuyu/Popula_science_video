from pathlib import Path
p=Path('scripts/voice_episode2.py');s=p.read_text(encoding='utf8');s=s.replace('episode 2','episode 3').replace("episode2","episode3");Path('scripts/voice_episode3.py').write_text(s,encoding='utf8')
