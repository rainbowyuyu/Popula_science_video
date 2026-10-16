"""Reuse full-take mastering, with this episode's original score and real durations."""
from pathlib import Path
import sys, json, hashlib
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
import prepare_episode3v7 as pipeline
from score import circulation_score

args=SimpleNamespace(story=ROOT/'research/hypertension/story.json',
    public_root=ROOT/'public/hypertension',report_dir=ROOT/'research/hypertension',
    src_timeline=ROOT/'src/hypertension/timeline.json',fps=30,intro_seconds=.6,
    head_guard=.02,tail_guard=.18,sentence_gap=.10,scene_gap=.18,scene_lead=.30,
    coda_seconds=12,caption_chars=18,target_seconds=300)
mode=sys.argv[1] if len(sys.argv)>1 else 'prepare'
if mode=='prepare':
    pipeline.prepare(args)
    for p in [args.public_root/'timeline.json',args.src_timeline]:
        d=json.loads(p.read_text('utf8'));d['scenes'][-1]['title']='身体、模型与证据'
        p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
    p=args.report_dir/'audio-timing-summary.json'
    d=json.loads(p.read_text('utf8'))
    d['timelineSha256']=hashlib.sha256((args.public_root/'timeline.json').read_bytes()).hexdigest()
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
elif mode=='mix':
    pipeline.woodwork_score=circulation_score
    pipeline.mix_and_check(args)
    p=args.report_dir/'audio-mix.json';d=json.loads(p.read_text('utf8'))
    d.update(trackTitle='脉流之间',sameEpisodeRearrangement=False,tempoBpm=88,
        source='Original deterministic circulation score; soft lub-dub heartbeat, modal plucks, warm pads and continuous flow motif; seed 20261007',
        reusedPreviousEpisodeMusic=False)
    p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
    # The shared pipeline prints its legacy woodwork metadata before this
    # episode-specific override. Print the final record too so a build log is
    # unambiguous about which score was actually mixed.
    print(json.dumps(d, ensure_ascii=False, indent=2))
elif mode=='qa':
    pipeline.final_qa(args)
else:raise ValueError(mode)
