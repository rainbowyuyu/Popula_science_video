"""Verify every transferred wave before adding same-user remote takes to project ledger."""
import json,shutil
from audio_common import ROOT,OUT,sha,save,story
def main():
    folder=OUT/'remote-return';incoming=json.loads((folder/'voice-generation-remote.json').read_text(encoding='utf8'))
    completed=json.loads((folder/'completed.json').read_text(encoding='utf8'));assert completed['completed']
    s=story();byid={c['id']:c for c in s['cues']}
    ledgerpath=OUT/'voice-generation.json';ledger=json.loads(ledgerpath.read_text(encoding='utf8'))
    accepted=[];retained=[]
    for ident,row in incoming.items():
        assert row['text']==byid[ident]['spokenText']
        source=folder/'raw'/f'{ident}.wav'
        assert source.exists() and sha(source)==row['sha256']
        if ident in ledger and ledger[ident]['text']==row['text']:
            retained.append(ident);continue
        dest=OUT/'raw'/source.name
        assert not dest.exists(),'Unexpected existing source; retain old before replacement'
        shutil.copy2(source,dest);assert sha(dest)==row['sha256']
        ledger[ident]={**row,'transferVerified':True,'transferredRawSha256':sha(source)};accepted.append(ident)
    ledger=dict(sorted(ledger.items()));save(ledgerpath,ledger)
    save(OUT/'remote-transfer-verification.json',{'verified':True,'accepted':accepted,'retainedLocal':retained,
        'referenceAndModelHashesVerified':True,'referenceUploadedThisTask':False,
        'sourceJob':'/home/fusion/c-pointers-v1-audio-20261015','remoteComplete':completed})
    print('Imported',len(accepted),'retained local',retained,'total',len(ledger))
if __name__=='__main__':main()
