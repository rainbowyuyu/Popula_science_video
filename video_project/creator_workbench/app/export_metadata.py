"""Read only shareable project labels; never import runtime/session state."""
import json
from pathlib import Path

def exported_defaults(root):
    result = {'seriesId':'rainbow-science','references':[],'covers':[],'cameraPresets':[],'edits':[]}
    source = Path(root) / 'project.json'
    try:
        if source.stat().st_size > 1_000_000:
            return result
        body = json.loads(source.read_text(encoding='utf8'))
        raw = body.get('workbench') if isinstance(body,dict) else None
    except (OSError,ValueError):
        return result
    if not isinstance(raw,dict):
        return result
    title = raw.get('title')
    sid = raw.get('seriesId')
    episode = raw.get('episode')
    if not isinstance(title,str) or not 1 <= len(title.strip()) <= 100:
        return result
    if sid not in {'rainbow-science','independent'}:
        return result
    if episode is not None and (isinstance(episode,bool) or not isinstance(episode,int) or not 0 <= episode <= 9999):
        return result
    title = title.strip()
    result.update(metadataVersion=1,title=title,seriesId=sid,episode=episode,
                  displayName=f'E{episode:02d} · {title}' if episode is not None else title,
                  useSeriesStyle=raw.get('useSeriesStyle',sid!='independent') is True)
    return result
