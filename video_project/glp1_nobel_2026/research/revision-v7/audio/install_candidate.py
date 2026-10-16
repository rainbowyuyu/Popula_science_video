from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, shutil

ROOT=Path(__file__).resolve().parents[3]
CAND=ROOT/'research/revision-v7/audio/candidate-01'
OUT=ROOT/'research/revision-v7/audio/installation.json'
EXPECTED={'master.wav':'8de84673e1f74a0b485ac5f65f682dbb13f87ee6859ee7340ccfcf6336a08569','music.wav':'f652646eaa9f1358a2dd975bb4972b96dd3b68065e87c88f6996b0b8776059f6','audio-candidate-report.json':'3c61f4499d7dd0565f71dfd4d8f31333d24542ad3c0fb6b92c00f01e1d762a78'}
EXPECTED.update({'master-aac-check.m4a':'084386baef1b7cc511da7e444a729688a9f1a645eae8b49cdbd508f50c444695','verification.json':'ee15e498376741a9b7c256d1f0e4754dccdfe238ffc99b731c0fe2b48b022bbc'})
PROTECTED={'public/narration.wav':'0ca986da267aa53ad48edc8bba571856fc35d7a8138eb8ae5e2a052db1effdc0','src/timeline.json':'e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0','docs/story-v5.json':'39c22eb5847bb74690c1f0941f25fcfa41cc5eb32383e77e0b9fa15719bb2d1a'}
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
for name,expected in EXPECTED.items(): assert sha(CAND/name)==expected, name
before={p:sha(ROOT/p) for p in PROTECTED}
assert before==PROTECTED, 'Protected narration/story/timeline changed before installation'
frozen={};old={}
for name in ('master.wav','music.wav'):
    path=ROOT/'research/revision-v6/frozen-source/public'/name
    frozen[name]={'path':str(path),'sha256':sha(path)}
    old[name]=sha(ROOT/'public'/name)
    assert old[name]==frozen[name]['sha256'], 'Existing production audio differs from V6 frozen '+name
for name in ('master.wav','music.wav'):
    target=ROOT/'public'/name
    temporary=target.with_name(target.name+'.v7-install-tmp')
    shutil.copyfile(CAND/name,temporary)
    assert sha(temporary)==EXPECTED[name]
    os.replace(temporary,target)  # Break any snapshot hardlinks; never mutate the old inode.
    assert sha(target)==EXPECTED[name]
after={p:sha(ROOT/p) for p in PROTECTED}
assert after==before
for rec in frozen.values(): assert sha(Path(rec['path']))==rec['sha256']
record={'schema':'rainbow.v7-audio-install.v1','installedUTC':datetime.now(timezone.utc).isoformat(),'authorization':'Root accepted candidate-01 and explicitly requested installation.','filesInstalled':[{ 'candidate':str(CAND/n),'target':str(ROOT/'public'/n),'sha256':EXPECTED[n],'previousProductionSHA256':old[n]} for n in ('master.wav','music.wav')],'candidateIdentities':EXPECTED,'protectedFilesBefore':before,'protectedFilesAfter':after,'frozenV6AudioPreserved':frozen,'method':'Copy to sibling temporary file, verify SHA256, atomic replace. No voice, story, caption or timeline edit.','durationSamples48kHz':40993600,'durationSeconds':40993600/48000,'candidateVerification':str(CAND/'verification.json'),'subjectiveListeningCompleted':False,'finalMP4AudioVerificationRequired':True,'limits':['Candidate AAC measurements are not final MP4 measurements.','Final loudnorm uses dynamic peak control; no sample-identical narration claim.']}
OUT.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'installed':['public/master.wav','public/music.wav'],'narrationStoryTimelineUnchanged':True,'v6AudioPreserved':True,'record':str(OUT)}))
