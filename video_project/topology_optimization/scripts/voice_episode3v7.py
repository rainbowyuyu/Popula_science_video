"""Rainbow Qwen narration: preserve full takes, audit actual WAVs, never fit to old shots.

Commands:
  audit-v6 --asr --device cuda     # read-only v6 comparison, resumable ASR cache
  generate --story ...           # raw takes only; run prepare_episode3v7.py next
  audit --timeline ... --public-root ... --asr
No credentials, reference audio, or model files are copied into delivery folders.
"""
from pathlib import Path
import argparse, difflib, hashlib, json, math, os, re, shutil, time
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TTS = Path('D:/python_project/tts')
REPORTS = ROOT / 'research/episode3v7'
PUBLIC = ROOT / 'public/episode3v7'

# Spoken-only phonetic substitutions. Screen captions retain canonical characters.
# The clone API has no validated SSML/pinyin interface: do not feed romanized tokens.
PRONUNCIATION = {
    '闌额': {'spoken': '栏额', 'pinyin': 'lán é'},
    '闌額': {'spoken': '栏额', 'pinyin': 'lán é'},
    '檐栿': {'spoken': '檐伏', 'pinyin': 'yán fú'},
    '地栿': {'spoken': '地伏', 'pinyin': 'dì fú'},
    '櫨枓': {'spoken': '卢斗', 'pinyin': 'lú dǒu'},
    '櫨斗': {'spoken': '卢斗', 'pinyin': 'lú dǒu'},
    '枓栱': {'spoken': '斗拱', 'pinyin': 'dǒu gǒng'},
    '枓拱': {'spoken': '斗拱', 'pinyin': 'dǒu gǒng'},
    '泥道栱': {'spoken': '泥道拱', 'pinyin': 'ní dào gǒng'},
    '華栱': {'spoken': '华拱', 'pinyin': 'huá gǒng'},
    '令栱': {'spoken': '令拱', 'pinyin': 'lìng gǒng'},
    '棖': {'spoken': '成', 'pinyin': 'chéng'},
    '樑': {'spoken': '梁', 'pinyin': 'liáng'},
    '纵枋': {'spoken': '纵方', 'pinyin': 'zòng fāng'},
    '枋': {'spoken': '方', 'pinyin': 'fāng'},
    '榀': {'spoken': '品', 'pinyin': 'pǐn'},
    '櫍': {'spoken': '质', 'pinyin': 'zhì'},
    '橑檐方': {'spoken': '老檐方', 'pinyin': 'lǎo yán fāng'},
    '干燥': {'spoken': '干燥', 'pinyin': 'gān zào', 'note': 'Context only; verify gān by listening.'},
    'rainbow鱼': {'spoken': 'rainbow 鱼', 'pinyin': None},
}

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def dump(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    temp.replace(path)

def read_rows(path):
    data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    rows = data if isinstance(data, list) else data['clips']
    if not rows: raise ValueError('Story has no clips')
    ids = [str(r['id']) for r in rows]
    if len(set(ids)) != len(ids): raise ValueError('Duplicate clip IDs')
    for row in rows:
        if not re.fullmatch(r'[A-Za-z0-9_-]+', str(row['id'])): raise ValueError('Unsafe clip ID')
        if not row.get('text', '').strip(): raise ValueError(f"Empty text: {row['id']}")
    return data, rows

def spoken_text(row):
    text = row.get('spoken') or row['text']
    changes = []
    for original in sorted(PRONUNCIATION, key=len, reverse=True):
        entry = PRONUNCIATION[original]
        if original in text and original != entry['spoken']:
            text = text.replace(original, entry['spoken'])
            changes.append({'display': original, **entry})
    return text, changes

def audio_metrics(path):
    info = sf.info(path)
    wave, sr = sf.read(path, dtype='float64', always_2d=True)
    mono = wave.mean(axis=1)
    if not len(mono) or not np.isfinite(mono).all(): raise ValueError(f'Invalid WAV: {path}')
    hop = max(1, round(.01 * sr))
    frames = np.pad(mono, (0, (-len(mono)) % hop)).reshape(-1, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    threshold = max(10 ** (-50/20), float(rms.max()) * .025)
    active = np.flatnonzero(rms > threshold)
    onset = float(active[0] * hop / sr) if len(active) else None
    offset = float(min(len(mono), (active[-1] + 1) * hop) / sr) if len(active) else None
    return {'seconds': info.duration, 'frames': info.frames, 'sampleRate': info.samplerate,
            'channels': info.channels, 'subtype': info.subtype, 'fileBytes': Path(path).stat().st_size,
            'peakDbfs': float(20*np.log10(max(np.abs(mono).max(), 1e-12))),
            'activeStartSeconds': onset, 'activeEndSeconds': offset,
            'tailQuietSeconds': info.duration-offset if offset is not None else info.duration,
            'activeThresholdDbfs': float(20*np.log10(threshold)), 'sha256': sha(path)}

def clean(text):
    # Whisper alternates traditional/simplified even within one take. Windows supplies
    # a deterministic script conversion; homophones are NOT treated as correct words.
    if os.name == 'nt':
        import ctypes
        buf=ctypes.create_unicode_buffer(len(text)*2+8)
        size=ctypes.windll.kernel32.LCMapStringEx('zh-CN',0x02000000,text,len(text),buf,len(buf),None,None,0)
        if size: text=buf.value
    return re.sub(r'[^\u3400-\u9fff0-9a-z]', '', text.lower())

def comparison(expected, heard):
    ref, got = clean(expected), clean(heard)
    match = difflib.SequenceMatcher(None, ref, got, autojunk=False)
    count = sum(b.size for b in match.get_matching_blocks())
    tail = ref[-min(6, len(ref)):]
    tailmatch = difflib.SequenceMatcher(None, tail, got[-max(12, len(tail)):], autojunk=False)
    return {'characterCoverage': count/max(1,len(ref)), 'similarity': match.ratio(),
            'expectedTail': tail, 'recognizedTail': got[-12:],
            'tailCharacterCoverage': sum(b.size for b in tailmatch.get_matching_blocks())/max(1,len(tail)),
            'unmatchedReferenceRanges': [{'start':a,'end':b,'text':ref[a:b]} for tag,a,b,c,d in match.get_opcodes() if tag in ('delete','replace')]}

class Asr:
    def __init__(self, cache_path, device='cpu', threads=6):
        self.path=Path(cache_path); self.cache=json.loads(self.path.read_text('utf8')) if self.path.exists() else {}
        self.model=None; self.device=device; self.threads=threads
        self.model_path=TTS/'models/whisper-small'
        self.settings={'model':str(self.model_path),'language':'zh','beamSize':5,'vadFilter':False,
                       'wordTimestamps':True,'conditionOnPreviousText':False,'initialPrompt':None}

    def transcribe(self,path):
        key=sha(path); settinghash=hashlib.sha256(json.dumps(self.settings,sort_keys=True).encode()).hexdigest()
        entry=self.cache.get(key)
        if entry and entry.get('settingsHash')==settinghash: return entry
        if self.model is None:
            from faster_whisper import WhisperModel
            os.environ['HF_HUB_OFFLINE']='1'
            self.model=WhisperModel(str(self.model_path),device=self.device,
                compute_type='float16' if self.device=='cuda' else 'int8',cpu_threads=self.threads)
        segments,info=self.model.transcribe(str(path),language='zh',beam_size=5,vad_filter=False,
                                            word_timestamps=True,condition_on_previous_text=False)
        segments=list(segments)
        entry={'file':str(path),'sha256':key,'settingsHash':settinghash,'settings':self.settings,
               'actualDevice':self.device,'recognized':''.join(s.text for s in segments),
               'segments':[{'start':s.start,'end':s.end,'text':s.text,'avgLogprob':s.avg_logprob,
                 'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in (s.words or [])]} for s in segments]}
        self.cache[key]=entry;dump(self.path,self.cache);return entry

def audit(args, legacy=False):
    pub=ROOT/'public/episode3v6' if legacy else Path(args.public_root)
    timeline=pub/'timeline.json' if legacy else Path(args.timeline)
    data,rows=read_rows(timeline);fps=data.get('fps',30)
    report_dir=Path(args.report_dir);report_dir.mkdir(parents=True,exist_ok=True)
    asr=Asr(report_dir/'audio-asr-cache.json',args.device,args.threads) if args.asr else None
    result=[]
    for row in rows[:args.limit]:
        raw=pub/'voice-raw'/f"{row['id']}.wav";aligned=pub/'voice'/f"{row['id']}.wav"
        r={'id':row['id'],'scene':row.get('scene'),'text':row['text'],'spoken':row.get('spoken',row['text'])}
        r['raw']=audio_metrics(raw);r['aligned']=audio_metrics(aligned)
        target=row['duration']/fps;r['oldTargetSeconds']=target
        if legacy:
            # pcm_s24le mono means 3 bytes per frame, irrespective of a WAV header.
            # ffmpeg's v6 mid has 102 bytes of container metadata on this installation.
            midframes=round(max(target*1.3,.2)*48000)
            rate=max(.60,min(1.65,((midframes*3+102)/4/48000)/target))
            retained=min(r['raw']['seconds'], max(target*1.3,.2),r['aligned']['seconds']*rate)
            r['legacyTransformEstimate']={'midFrames':midframes,'assumedWavHeaderBytes':102,
                'incorrectTempo':rate,'retainedSourceSecondsUpperBound':retained,
                'discardedSourceSecondsLowerBound':max(0,r['raw']['seconds']-retained),
                'activeTailBeyondCutSeconds':max(0,(r['raw']['activeEndSeconds'] or 0)-retained),
                'coverageFractionUpperBound':retained/r['raw']['seconds'],
                'limitations':'Derived from executed v6 filter chain; buffering and 25ms end fade can remove additional content. ASR independently checks linguistic tail.'}
        if asr:
            for key,path in [('raw',raw),('aligned',aligned)]:
                rec=asr.transcribe(path);r[key]['asr']=rec;r[key]['asrComparison']=comparison(r['spoken'],rec['recognized'])
            r['tailLostInAlignedASR']=(r['raw']['asrComparison']['tailCharacterCoverage']>=.80 and r['aligned']['asrComparison']['tailCharacterCoverage']<.5)
        result.append(r)
        summary={'clipCount':len(result),'rawSeconds':sum(x['raw']['seconds'] for x in result),
                 'alignedSeconds':sum(x['aligned']['seconds'] for x in result),
                 'clipsWhoseRawExceedsAlignedByMoreThan100ms':sum(x['raw']['seconds']>x['aligned']['seconds']+.1 for x in result)}
        if legacy:
            summary.update({'estimatedDiscardedSourceSecondsLowerBound':sum(x['legacyTransformEstimate']['discardedSourceSecondsLowerBound'] for x in result),
                'clipsWithActiveTailBeyondEstimatedCut':sum(x['legacyTransformEstimate']['activeTailBeyondCutSeconds']>.1 for x in result)})
        if asr:
            summary.update({'meanRawAsrCharacterCoverage':float(np.mean([x['raw']['asrComparison']['characterCoverage'] for x in result])),
                'meanAlignedAsrCharacterCoverage':float(np.mean([x['aligned']['asrComparison']['characterCoverage'] for x in result])),
                'clipsWithStrongRawTailButMissingAlignedTail':sum(x['tailLostInAlignedASR'] for x in result)})
        payload={'status':'complete' if len(result)==min(len(rows),args.limit) else 'in-progress',
            'timeline':str(timeline),'timelineSha256':sha(timeline),'asrIsHumanListening':False,
            'limitations':'ASR can miss homophones/rare characters and cannot certify tone, pleasantness, or subjective delivery.',
            'summary':summary,'clips':result}
        dump(report_dir/('audio-v6-audit.json' if legacy else 'audio-v7-audit.json'),payload)
        print(row['id'],f"raw={r['raw']['seconds']:.2f}s aligned={r['aligned']['seconds']:.2f}s",
              f"ASR {r['raw'].get('asrComparison',{}).get('characterCoverage',0):.2f}/{r['aligned'].get('asrComparison',{}).get('characterCoverage',0):.2f}",flush=True)
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)

def generate(args):
    _,rows=read_rows(args.story);pub=Path(args.public_root);report_dir=Path(args.report_dir)
    rawdir=pub/'voice-raw';rawdir.mkdir(parents=True,exist_ok=True)
    ref=TTS/'work/clone-reference.wav';meta=json.loads((TTS/'work/clone-reference.json').read_text('utf8'))
    refhash=sha(ref);ledgerpath=report_dir/'audio-generation.json'
    ledger=json.loads(ledgerpath.read_text('utf8')) if ledgerpath.exists() else {}
    params={'temperature':.60,'top_p':.90,'repetition_penalty':1.08,'max_new_tokens':1024,'non_streaming_mode':True}
    todo=[];pronunciations=[]
    # A per-clip seed and batch size 1 make retries independent and cache identity truthful.
    for i,row in enumerate(rows):
        text,changes=spoken_text(row);pronunciations.append({'id':row['id'],'display':row['text'],'spoken':text,'replacements':changes})
        # A deleted earlier sentence must not change the identities/seeds of
        # approved later takes. Numeric IDs preserve the original v7 seeds.
        seed_offset=int(row['id']) if str(row['id']).isdigit() else int(hashlib.sha256(str(row['id']).encode()).hexdigest()[:8],16)
        spec={'text':text,'model':str(TTS/'models/Qwen3-TTS-0.6B'),'referenceSha256':refhash,
              'referenceTextSha256':hashlib.sha256(meta['text'].encode()).hexdigest(),'seed':args.seed+seed_offset,
              'batchSize':1,'parameters':params}
        h=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest();path=rawdir/f"{row['id']}.wav"
        cached=ledger.get(row['id'],{})
        same_take=cached.get('requestHash')==h or (cached.get('sourceKind')=='verified-v6-reuse' and cached.get('text')==text and cached.get('referenceSha256')==refhash)
        if not args.only and cached.get('acceptedCandidate') and cached.get('text')==text and cached.get('referenceSha256')==refhash:
            same_take=True
        if same_take and path.exists() and cached.get('sha256')==sha(path):continue
        if args.only and str(row['id']) not in args.only.split(','):continue
        if path.exists() and not args.replace_changed:raise RuntimeError(f'Changed take {row["id"]} exists; use a new output or explicit --replace-changed')
        todo.append((row,text,spec,h,path))
    dump(report_dir/'audio-pronunciation.json',{'substitutions':PRONUNCIATION,'clips':pronunciations,'humanPronunciationReview':False})
    if not todo:print('All raw takes match cache',flush=True);return
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(args.threads)
    model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=meta['text'])
    for row,text,spec,h,path in todo[:args.limit]:
        torch.manual_seed(spec['seed']);start=time.time()
        waves,sr=model.generate_voice_clone(text=[text],language='Chinese',voice_clone_prompt=prompt,**params)
        w=np.asarray(waves[0]);w=np.squeeze(w)
        if w.ndim!=1 or not np.isfinite(w).all() or not .5<len(w)/sr<50:raise ValueError(f'Invalid generated take {row["id"]}')
        if path.exists():
            archive=pub/'voice-raw-history'/f"{row['id']}-{sha(path)[:12]}.wav"
            archive.parent.mkdir(parents=True,exist_ok=True)
            if not archive.exists():shutil.copy2(path,archive)
            historypath=report_dir/'audio-generation-history.json'
            history=json.loads(historypath.read_text('utf8')) if historypath.exists() else []
            history.append({'id':row['id'],'archivedFile':archive.relative_to(ROOT).as_posix(),'previousManifest':ledger.get(row['id'],{}),'replacementRequestHash':h})
            dump(historypath,history)
        sf.write(path,w,sr,subtype='PCM_24')
        ledger[row['id']]={**spec,'requestHash':h,'file':path.relative_to(ROOT).as_posix(),
            'seconds':len(w)/sr,'frames':len(w),'sampleRate':sr,'sha256':sha(path),'elapsedSeconds':time.time()-start,
            'tailIntegrity':'requires-ASR-and-listening','subjectiveListeningChecked':False}
        dump(ledgerpath,ledger);print(row['id'],f'{len(w)/sr:.3f}s',flush=True)
    print('Raw takes only. No trimming, time stretching, camera fitting, or mastering performed.',flush=True)

def import_v6(args):
    """Reuse byte-identical, text-identical, reference-identical raw takes only."""
    _,rows=read_rows(args.story);pub=Path(args.public_root);reports=Path(args.report_dir)
    ledgerpath=reports/'audio-generation.json';ledger=json.loads(ledgerpath.read_text('utf8')) if ledgerpath.exists() else {}
    sourceledger=json.loads((ROOT/'research/episode3v6-voice.json').read_text('utf8'))
    cachepath=reports/'audio-asr-cache.json';cache=json.loads(cachepath.read_text('utf8')) if cachepath.exists() else {}
    refhash=sha(TTS/'work/clone-reference.wav');sourcepub=ROOT/'public/episode3v6'
    index={entry['text']:(clipid,entry) for clipid,entry in sourceledger.items()}
    result=[];copied=0
    for row in rows:
        text,_=spoken_text(row);candidate=index.get(text)
        item={'id':row['id'],'text':row['text'],'spoken':text,'status':'needs-generation'}
        if candidate:
            sourceid,entry=candidate;src=sourcepub/'voice-raw'/f'{sourceid}.wav'
            item['sourceClip']=sourceid
            valid=src.exists() and entry.get('referenceSha256')==refhash and entry.get('sha256')==sha(src)
            rec=cache.get(sha(src),{}) if valid else {};comp=comparison(text,rec.get('recognized',''))
            item['asrComparison']=comp
            if valid and comp['characterCoverage']>=args.minimum_coverage and comp['tailCharacterCoverage']>=.80:
                dst=pub/'voice-raw'/f"{row['id']}.wav";dst.parent.mkdir(parents=True,exist_ok=True)
                if dst.exists() and sha(dst)!=sha(src):
                    item['status']='existing-different-take-preserved'
                else:
                    if not dst.exists():shutil.copy2(src,dst)
                    ledger[row['id']]={**entry,'sourceKind':'verified-v6-reuse','sourceClip':sourceid,
                        'sourceFile':src.relative_to(ROOT).as_posix(),'file':dst.relative_to(ROOT).as_posix(),
                        'reuseCriteria':'Exact spoken text, reference SHA and source WAV SHA; ASR coverage/tail thresholds.',
                        'asrComparison':comp,'subjectiveListeningChecked':False}
                    item['status']='reused-byte-identical-raw';copied+=1
            elif not valid:item['status']='source-or-reference-hash-mismatch'
            else:item['status']='asr-review-or-regeneration-needed'
        result.append(item)
    dump(ledgerpath,ledger);dump(reports/'audio-reuse-v6.json',{'reused':copied,'total':len(rows),'clips':result})
    print(json.dumps({'reused':copied,'needsGenerationOrReview':len(rows)-copied},indent=2))

def audit_raw(args):
    """Transcribe every currently available raw take; supports partial/resumable batches."""
    _,rows=read_rows(args.story);pub=Path(args.public_root);reports=Path(args.report_dir)
    asr=Asr(reports/'audio-asr-cache.json',args.device,args.threads);out=[];missing=[]
    for row in rows[:args.limit]:
        path=pub/'voice-raw'/f"{row['id']}.wav"
        if not path.exists():missing.append(row['id']);continue
        rec=asr.transcribe(path);spoken,changes=spoken_text(row);comp=comparison(spoken,rec['recognized'])
        item={'id':row['id'],'scene':row['scene'],'text':row['text'],'spoken':spoken,
              'recognized':rec['recognized'],'asrComparison':comp,'audio':audio_metrics(path),'pronunciationChanges':changes,
              'needsReview':comp['characterCoverage']<.80 or comp['tailCharacterCoverage']<.80,'subjectiveListeningChecked':False}
        out.append(item)
        dump(reports/'audio-raw-check.json',{'status':'in-progress','clips':out,'missingClips':missing,
              'asrEvidenceOnly':True,'humanPronunciationReview':False})
        print(row['id'],f"coverage={comp['characterCoverage']:.2f} tail={comp['tailCharacterCoverage']:.2f}",flush=True)
    summary={'status':'complete' if not missing else 'partial','clips':out,'missingClips':missing,
        'asrEvidenceOnly':True,'humanPronunciationReview':False,'reviewIds':[x['id'] for x in out if x['needsReview']],
        'meanCharacterCoverage':float(np.mean([x['asrComparison']['characterCoverage'] for x in out])) if out else 0}
    dump(reports/'audio-raw-check.json',summary);print(json.dumps({k:v for k,v in summary.items() if k!='clips'},ensure_ascii=False,indent=2))

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    for name in ('audit-v6','audit'):
        p=sub.add_parser(name);p.add_argument('--asr',action='store_true');p.add_argument('--device',choices=['cpu','cuda'],default='cpu')
        p.add_argument('--threads',type=int,default=6);p.add_argument('--limit',type=int,default=9999)
        p.add_argument('--public-root',type=Path,default=PUBLIC);p.add_argument('--timeline',type=Path,default=PUBLIC/'timeline.json')
        p.add_argument('--report-dir',type=Path,default=REPORTS)
    for name in ('generate','import-v6','audit-raw'):
        p=sub.add_parser(name);p.add_argument('--story',type=Path,default=REPORTS/'story.json')
        p.add_argument('--public-root',type=Path,default=PUBLIC);p.add_argument('--report-dir',type=Path,default=REPORTS)
        p.add_argument('--seed',type=int,default=20261005);p.add_argument('--limit',type=int,default=9999)
        p.add_argument('--threads',type=int,default=4);p.add_argument('--replace-changed',action='store_true')
        p.add_argument('--only',help='Comma-separated IDs to regenerate; other raw takes remain unchanged')
        p.add_argument('--minimum-coverage',type=float,default=.80)
        p.add_argument('--device',choices=['cpu','cuda'],default='cpu')
    args=parser.parse_args()
    if args.command=='generate':generate(args)
    elif args.command=='import-v6':import_v6(args)
    elif args.command=='audit-raw':audit_raw(args)
    else:audit(args,legacy=args.command=='audit-v6')

if __name__=='__main__':main()
