"""Review completed clean sentences on CPU while later local TTS runs on GPU."""
import json
from audio_v6_common import OUT, TTS, load_story, sha, save
from asr_captions_v6 import content_review, write_readback, norm
import difflib


def main():
    story=load_story();path=OUT/'asr-preflight-v6.json'
    old=json.loads(path.read_text(encoding='utf8')).get('cues',[]) if path.exists() else []
    cache={r['id']:r for r in old};rows=[];model=None
    for cue in story['cues']:
        clip=OUT/'clean'/f"{cue['id']}.wav"
        if not clip.exists():continue
        h=sha(clip)
        if cache.get(cue['id'],{}).get('sha256')==h:row=cache[cue['id']]
        else:
            if model is None:
                from faster_whisper import WhisperModel
                model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3,num_workers=1,local_files_only=True)
            segments,_=model.transcribe(str(clip),language='zh',beam_size=3,condition_on_previous_text=False,word_timestamps=True,vad_filter=False)
            segments=list(segments)
            row={'id':cue['id'],'sha256':h,'asr':''.join(s.text for s in segments),
                'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in s.words],
                'subjectiveListeningChecked':False}
        row.update(target=cue['text'],spokenText=cue['spokenText'],
                   similarity=difflib.SequenceMatcher(None,norm(cue['spokenText']),norm(row['asr'])).ratio())
        row['contentReview']=content_review(row);rows.append(row)
        save(path,{'status':'preflight-completed-sources-only','model':'local Whisper-small','device':'CPU int8',
            'initialPrompt':None,'vadFilter':False,'subjectiveListeningChecked':False,'cues':rows})
        print(cue['id'],round(row['similarity'],3),row['asr'],flush=True)
    write_readback(rows,OUT/'readback-preflight.md')


if __name__=='__main__':main()
