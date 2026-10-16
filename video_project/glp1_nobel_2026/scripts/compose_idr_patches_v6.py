"""Guarded IDR-only V6 repair: default read-only, isolated candidate, explicit install.

--archive-base archives only the exact c9 full-render baseline and its evidence.
--validate (default) checks a completed patch plan without modifying any file.
--candidate constructs and verifies an isolated film; never installs it.
--install installs an already verified candidate and its honest composite marker.
Source/public/story/renderer locks are never modified by this script.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import time

from verify_idr_splice_v6 import (require, sha, run, probe, video_stream, frame_hashes,
                                packet_timing, idr_at, verify_audio, loudness)

ROOT = Path(__file__).resolve().parents[1]
REPAIR = ROOT/'research/revision-v6/continuity-repair'
BASE = REPAIR/'base'
OUT = REPAIR/'candidate'
PLAN = REPAIR/'patch-plan.json'
DELIVERY = ROOT/'delivery/GLP1_V5_1080p.mp4'
FINAL_MARKER = ROOT/'tmp/final-render.json'
MASTER = ROOT/'public/master.wav'
TIMELINE = ROOT/'src/timeline.json'
BASE_SHA = 'c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4'
TIMELINE_SHA = 'e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0'
MASTER_SHA = 'dec0de170d5796dadad56323e11041195049e3c0e4c365e4ed50f17fa15b1146'
RANGES = [(12000,12249),(20250,20749)]
SUPPORTS = [(12071,12194),(20431,20534)]
CHANGED_SOURCES = {'src/V5World.ts','src/V5HandoffContext.ts'}
FULL = 25621
MODE = 'c9-full-base-with-idr-local-patches-video-stream-copy'


def now(): return datetime.now(timezone.utc).isoformat()
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def rel(p): return Path(p).relative_to(ROOT).as_posix()
def safe(value, exists=True):
    p=Path(os.path.abspath(ROOT/Path(value)))
    require(p!=ROOT and p.is_relative_to(ROOT) and p.resolve().is_relative_to(ROOT),'Path escapes project')
    for parent in [p,*p.parents]:
        if parent==ROOT:break
        if parent.exists():
            st=parent.lstat()
            require(not stat.S_ISLNK(st.st_mode) and not(getattr(st,'st_file_attributes',0)&0x400),'Linked path refused')
    if exists: require(p.is_file() and p.stat().st_size>0,'Missing input: '+str(p))
    return p


def write_new(path, value):
    safe(path,False);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x',encoding='utf8') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')


def verify_hash(p,value):
    require(sha(p)==value,'Hash changed: '+str(p));return value


def archive_base():
    require(sha(DELIVERY)==BASE_SHA,'Current delivery is not the expected c9 baseline')
    marker=read(FINAL_MARKER)
    require(marker.get('videoSHA256')==BASE_SHA and marker.get('singlePassRender') is True,'Expected full c9 marker')
    require(marker.get('timelineSHA256')==TIMELINE_SHA and marker.get('masterSHA256')==MASTER_SHA,'Baseline timing/audio differs')
    sources={
        'video.mp4':DELIVERY,'final-render.json':FINAL_MARKER,
        'source-lock.json':safe(marker['sourceLock']),
        'validation.json':safe(marker['validation']),
        'render_full_guarded_v6.mjs':safe(marker['runner']),
        'audio-mux.json':ROOT/'tmp/v6-full-final/audio-mux.json',
    }
    verify_hash(sources['source-lock.json'],marker['sourceLockSHA256'])
    verify_hash(sources['validation.json'],marker['validationSHA256'])
    verify_hash(sources['render_full_guarded_v6.mjs'],marker['runnerSHA256'])
    require(read(sources['validation.json'])['audioMux']==marker['audioMux'],'Baseline mux reports disagree')
    lock=read(sources['source-lock.json'])
    for item in lock['files']:verify_hash(safe(item['snapshot']),item['sha256'])
    BASE.mkdir(parents=True,exist_ok=True)
    archived=[]
    for name,source in sources.items():
        target=BASE/name;digest=sha(source)
        if target.exists():verify_hash(target,digest)
        else:
            with source.open('rb') as a,target.open('xb') as b:shutil.copyfileobj(a,b,4*1024*1024)
            verify_hash(target,digest)
        archived.append({'source':rel(source),'path':rel(target),'sha256':digest})
    manifest={'version':'v6-c9-full-baseline','createdUTC':now(),'videoSHA256':BASE_SHA,
        'timelineSHA256':TIMELINE_SHA,'masterSHA256':MASTER_SHA,'frames':FULL,'fps':30,'files':archived,
        'snapshotPolicy':'Original full source lock is immutable; all its retained snapshots were hash-verified.'}
    dest=BASE/'manifest.json'
    if dest.exists():
        old=read(dest);require(old['files']==archived,'Archived baseline manifest differs')
    else:write_new(dest,manifest)
    print(json.dumps({'archived':True,'manifest':rel(dest),'manifestSHA256':sha(dest),'baseVideoSHA256':BASE_SHA}))


def preflight(plan_path):
    manifest_path=safe(BASE/'manifest.json');manifest=read(manifest_path)
    require(manifest.get('version')=='v6-c9-full-baseline' and manifest.get('videoSHA256')==BASE_SHA,'Unknown baseline manifest')
    watched={manifest_path:sha(manifest_path),Path(__file__).resolve():sha(Path(__file__).resolve()),
             ROOT/'scripts/verify_idr_splice_v6.py':sha(ROOT/'scripts/verify_idr_splice_v6.py')}
    for item in manifest['files']:
        p=safe(item['path']);watched[p]=verify_hash(p,item['sha256'])
    base_marker=read(BASE/'final-render.json');base_lock=read(BASE/'source-lock.json')
    for item in base_lock['files']:
        p=safe(item['snapshot']);watched[p]=verify_hash(p,item['sha256'])
    verify_hash(DELIVERY,BASE_SHA);require(FINAL_MARKER.read_bytes()==(BASE/'final-render.json').read_bytes(),'Delivery marker changed')
    watched[DELIVERY]=BASE_SHA;watched[FINAL_MARKER]=sha(FINAL_MARKER)
    for p,h in [(TIMELINE,TIMELINE_SHA),(MASTER,MASTER_SHA),(ROOT/'public/timeline.json',TIMELINE_SHA)]:
        watched[p]=verify_hash(p,h)
    p=safe(plan_path);plan=read(p);watched[p]=sha(p)
    require(plan.get('version')=='v6-idr-patches' and plan.get('baseVideoSHA256')==BASE_SHA,'Plan does not identify c9 IDR repair')
    require(plan.get('timelineSHA256')==TIMELINE_SHA and plan.get('masterSHA256')==MASTER_SHA,'Plan audio/timeline differs')
    require([(x['start'],x['end']) for x in plan['patches']]==RANGES,'Unexpected patch ranges')
    require([tuple(x['supportFrames']) for x in plan['patches']]==SUPPORTS,'Unexpected scene support ranges')
    require(set(plan['allowedChangedSources'])==CHANGED_SOURCES,'Unexpected authorized changed source set')
    require(plan.get('baseManifestSHA256')==sha(manifest_path),'Plan base archive differs')
    lockpath=safe(plan['sourceLock']);lock=read(lockpath)
    require(plan['sourceLockSHA256']==sha(lockpath),'Plan patch source lock changed');watched[lockpath]=sha(lockpath)
    require(lock.get('timelineSHA256')==TIMELINE_SHA and lock.get('masterSHA256')==MASTER_SHA,'Patch lock audio/timeline differs')
    source_hashes={}
    for item in lock['files']:
        require(item['path'] not in source_hashes,'Duplicate source-lock entry')
        source_hashes[item['path']]=item['sha256']
        for path in [item['path'],item['snapshot']]:
            q=safe(path);watched[q]=verify_hash(q,item['sha256'])
    old_hashes={x['path']:x['sha256'] for x in base_lock['files']}
    require(set(source_hashes)==set(old_hashes),'Patch lock changed source/asset inventory')
    changed={k for k in source_hashes if source_hashes[k]!=old_hashes[k]}
    require(changed==set(plan['allowedChangedSources']) and changed,'Unreviewed changed source set')
    require(all(x.startswith('src/') and x not in {'src/timeline.json'} for x in changed),'Only frozen scene source changes allowed')
    patch_records=[]
    for row in plan['patches']:
        s,e=row['start'],row['end'];support=row['supportFrames']
        require(len(support)==2 and s<=support[0]<=support[1]<=e,'Support outside rendered GOP range')
        video,mp=safe(row['video']),safe(row['marker']);m=read(mp)
        require(m.get('success') is True and m.get('frames')==[s,e] and m.get('silent') is True,'Patch marker not successful/silent')
        require(m.get('audioIncluded') is False and m.get('timelineSHA256')==TIMELINE_SHA and m.get('masterSHA256')==MASTER_SHA,'Patch audio/timing differs')
        require(safe(m['outputLocation'])==video and m.get('baseVideoSHA256')==BASE_SHA,'Patch output/base differs')
        require(m.get('baseMarkerSHA256')==sha(BASE/'final-render.json'),'Patch original marker differs')
        require(m.get('sourceLock')==rel(lockpath) and m.get('sourceLockSHA256')==sha(lockpath),'Patch source lock differs')
        require(m.get('sourceHashes')==source_hashes,'Patch source inventory differs')
        watched[video]=verify_hash(video,m['videoSHA256']);watched[mp]=sha(mp)
        runner=safe(m['runner']);watched[runner]=verify_hash(runner,m['runnerSHA256'])
        video_stream(video,e-s+1,silent=True);packet_timing(video,e-s+1);idr_at(video,0)
        patch_records.append({**row,'markerData':m,'videoSHA256':sha(video),'markerSHA256':sha(mp)})
    base_video=safe(BASE/'video.mp4');video_stream(base_video,FULL);timing=packet_timing(base_video,FULL)
    for boundary in [12000,12250,20250,20750]:
        require(boundary in timing['keyframePresentationFrames'],'Splice boundary is not keyframe')
        idr_at(base_video,boundary)
    master_stream=probe(MASTER)['streams'][0]
    require(int(master_stream['sample_rate'])==48000 and master_stream['channels']==2,'Master format differs')
    require(Fraction(master_stream['duration_ts'])*Fraction(master_stream['time_base'])==Fraction(FULL,30),'Master duration differs')
    return {'plan':plan,'planPath':rel(p),'planSHA256':sha(p),'baseMarker':base_marker,'baseTiming':timing,
        'sourceLock':rel(lockpath),'sourceLockSHA256':sha(lockpath),'sourceHashes':source_hashes,
        'patches':patch_records,'watched':watched}


def unchanged(state):
    for p,h in state['watched'].items():verify_hash(p,h)


def build_candidate(state):
    require(not OUT.exists(),'Candidate directory exists; preserve it and choose a reviewed recovery, never overwrite')
    OUT.mkdir(parents=True);started=time.monotonic();commands=[]
    def command(args,label):
        commands.append({'label':label,'command':args});run(args,log=OUT/(label+'.stderr.log'))
    try:
        unchanged(state)
        bounds=[(0,11999),(12000,12249),(12250,20249),(20250,20749),(20750,FULL-1)]
        command(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-n','-i',str(BASE/'video.mp4'),
            '-map','0:v:0','-an','-c:v','copy','-avoid_negative_ts','disabled','-f','segment',
            '-segment_frames','12000,12250,20250,20750','-reset_timestamps','1','-segment_format','mp4',
            '-segment_format_options','movflags=+faststart+write_colr:video_track_timescale=15360:avoid_negative_ts=disabled',
            str(OUT/'base-%02d.mp4')],'split-base-idr')
        base_rows=frame_hashes(BASE/'video.mp4',OUT/'base-full.yuv.sha256',FULL)
        split_records=[]
        for index,(s,e) in enumerate(bounds):
            file=OUT/f'base-{index:02d}.mp4';video_stream(file,e-s+1,silent=True)
            timing=packet_timing(file,e-s+1)
            rows=frame_hashes(file,OUT/f'base-{index:02d}.yuv.sha256',e-s+1)
            require(rows==base_rows[s:e+1],f'IDR split changed pixels or indices at {s}:{e}')
            split_records.append({'start':s,'end':e,'file':rel(file),'sha256':sha(file),'timing':timing,'pixelsExact':True})
        segments=[OUT/'base-00.mp4',safe(state['patches'][0]['video']),OUT/'base-02.mp4',safe(state['patches'][1]['video']),OUT/'base-04.mp4']
        expected=base_rows.copy();patch_hashes={}
        for row in state['patches']:
            s,e=row['start'],row['end'];hp=OUT/f'patch-{s}-{e}.yuv.sha256'
            rows=frame_hashes(safe(row['video']),hp,e-s+1);expected[s:e+1]=rows
            patch_hashes[str(s)]={'path':rel(hp),'sha256':sha(hp)}
        # concat's explicit duration is rational at the exact 30 fps frame grid.
        lines=['ffconcat version 1.0']
        for file,(s,e) in zip(segments,bounds):
            posix=str(file.resolve()).replace('\\','/')
            require("'" not in posix,'Unexpected quote in local concat path')
            lines.extend(["file '"+posix+"'",f'duration {(e-s+1)/30:.12f}'])
        concat=OUT/'video.ffconcat';concat.write_text('\n'.join(lines)+'\n',encoding='utf8')
        silent=OUT/'silent-spliced.mp4'
        command(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-n','-f','concat','-safe','0',
            '-auto_convert','1','-i',str(concat),'-map','0:v:0','-an','-c:v','copy','-map_metadata','-1',
            '-avoid_negative_ts','disabled','-video_track_timescale','15360',
            '-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
            '-movflags','+faststart+write_colr',str(silent)],'concat-video-copy')
        video_stream(silent,FULL,silent=True);silent_timing=packet_timing(silent,FULL)
        silent_rows=frame_hashes(silent,OUT/'silent-composed.yuv.sha256',FULL)
        require(silent_rows==expected,'Spliced pixels differ from exact base/patch expected map')
        candidate=OUT/'GLP1_V5_1080p.candidate.mp4'
        mux=['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-n','-i',str(silent),'-i',str(MASTER),
            '-map','0:v:0','-map','1:a:0','-map_metadata','-1','-c:v','copy','-c:a','aac','-b:a','320k',
            '-ar','48000','-af','asetpts=PTS-STARTPTS','-color_range','tv','-color_primaries','bt709',
            '-color_trc','bt709','-colorspace','bt709','-movflags','+faststart+write_colr',str(candidate)]
        command(mux,'full-master-aac-mux')
        v=video_stream(candidate,FULL);packets=packet_timing(candidate,FULL)
        final_rows=frame_hashes(candidate,OUT/'final-composed.yuv.sha256',FULL)
        require(final_rows==expected,'Final MP4 decoded pixels differ from mapped base/patch frames')
        meta=probe(candidate);aud=[s for s in meta['streams'] if s['codec_type']=='audio']
        require(len(meta['streams'])==2 and len(aud)==1,'Final must have one video and one audio stream')
        a=aud[0]
        require(a['codec_name']=='aac' and int(a['sample_rate'])==48000 and a['channels']==2,'Final audio format differs')
        require(abs(float(a.get('start_time',0)))<=1/48000 and abs(float(a['duration'])-FULL/30)<=1024/48000,'Audio timing mismatch')
        audio_comparison=verify_audio(candidate,MASTER,MASTER_SHA);levels=loudness(candidate)
        require(float(levels['input_tp'])<=-1 and -16<=float(levels['input_i'])<=-14,'Final audio peak/loudness outside target')
        unchanged(state)
        patch_count=sum(e-s+1 for s,e in RANGES);digest=sha(candidate)
        correspondence={'allFramesMatched':True,'totalFrames':FULL,'baseFramesMatched':FULL-patch_count,
            'patchFramesMatched':patch_count,'PTSExact':True,'pixelFormat':'yuv420p','hash':'sha256',
            'method':'Each final decoded raw YUV420 frame matched the identical absolute base frame outside GOP patches, or identical patch-local frame inside them.',
            'hashReports':{'base':{'path':rel(OUT/'base-full.yuv.sha256'),'sha256':sha(OUT/'base-full.yuv.sha256')},
                'patches':patch_hashes,'final':{'path':rel(OUT/'final-composed.yuv.sha256'),'sha256':sha(OUT/'final-composed.yuv.sha256')}}}
        audio_mux={'method':'Complete locked master encoded once from zero after video-only IDR stream-copy splice',
            'command':mux,'masterSHA256':MASTER_SHA,'trimmed':False,'padded':False,'timeStretched':False,
            'videoCodec':'copy','audioCodec':'aac','audioBitrate':'320k','sampleRate':48000,
            'videoDecodedPixelsUnchangedFromSilentSplice':True}
        validation={'finishedUTC':now(),'automaticChecksPass':True,'fullDecodeSuccess':True,'decodedFrames':FULL,
            'videoSHA256':digest,'timelineSHA256':TIMELINE_SHA,'masterSHA256':MASTER_SHA,'video':v,'audio':a,
            'audioMux':audio_mux,'audioComparison':audio_comparison,'aacMeasurement':levels,
            'frameCorrespondence':correspondence,'packetTiming':packets,'baseSegmentValidation':split_records,
            'subjectiveVisualReviewCompleted':False,'subjectiveAudioReviewCompleted':False}
        write_new(OUT/'validation.json',validation)
        marker={'finished':now(),'frames':[0,FULL-1],'seconds':time.monotonic()-started,
            'outputLocation':str(DELIVERY),'success':True,'timelineSHA256':TIMELINE_SHA,'masterSHA256':MASTER_SHA,
            'videoSHA256':digest,'renderMode':MODE,'singlePassRender':False,'candidate':rel(candidate),
            'sourceLock':state['sourceLock'],'sourceLockSHA256':state['sourceLockSHA256'],'sourceHashes':state['sourceHashes'],
            'baseRender':{'videoSHA256':BASE_SHA,'video':rel(BASE/'video.mp4'),'marker':state['baseMarker'],
                'markerPath':rel(BASE/'final-render.json'),'markerSHA256':sha(BASE/'final-render.json'),
                'sourceLock':rel(BASE/'source-lock.json'),'sourceLockSHA256':sha(BASE/'source-lock.json'),
                'validation':rel(BASE/'validation.json'),'validationSHA256':sha(BASE/'validation.json'),
                'manifest':rel(BASE/'manifest.json'),'manifestSHA256':sha(BASE/'manifest.json')},
            'patches':state['patches'],'composition':{'method':'IDR segment replacement; video stream copy; full locked master AAC mux',
                'planPath':state['planPath'],'planSHA256':state['planSHA256'],'composer':rel(Path(__file__).resolve()),
                'composerSHA256':sha(Path(__file__).resolve()),'verifier':'scripts/verify_idr_splice_v6.py',
                'verifierSHA256':sha(ROOT/'scripts/verify_idr_splice_v6.py'),
                'validation':rel(OUT/'validation.json'),'validationSHA256':sha(OUT/'validation.json'),
                'sourceLock':state['sourceLock'],'sourceLockSHA256':state['sourceLockSHA256'],
                'totalPatchedFrames':patch_count,'untouchedFrameCount':FULL-patch_count,'audioMux':audio_mux},
            'validation':rel(OUT/'validation.json'),'validationSHA256':sha(OUT/'validation.json')}
        write_new(OUT/'final-render-staged.json',marker)
        write_new(OUT/'candidate-render.json',{**marker,'outputLocation':str(candidate),'installed':False})
        write_new(OUT/'commands.json',commands)
        write_new(OUT/'input-lock.json',{'files':[{ 'path':rel(p),'sha256':h} for p,h in state['watched'].items()]})
        print(json.dumps({'candidateReady':True,'candidate':rel(candidate),'videoSHA256':digest,
            'baseFramesMatched':FULL-patch_count,'patchFramesMatched':patch_count,'zeroLagVerified':True,'installed':False}))
    except BaseException as error:
        write_new(OUT/'failure.json',{'failedUTC':now(),'error':str(error),'commands':commands,'installed':False})
        raise


def install(state):
    candidate=safe(OUT/'GLP1_V5_1080p.candidate.mp4');marker=read(OUT/'final-render-staged.json')
    validation=read(OUT/'validation.json')
    verify_hash(candidate,marker['videoSHA256']);verify_hash(OUT/'validation.json',marker['validationSHA256'])
    require(marker['renderMode']==MODE and marker['singlePassRender'] is False,'Invalid composite marker')
    require(validation.get('automaticChecksPass') is True and validation['frameCorrespondence']['allFramesMatched']
            and validation['audioComparison']['zeroLagVerified'],'Candidate validation incomplete')
    require(marker['composition']['planSHA256']==state['planSHA256'],'Candidate plan changed')
    for item in read(OUT/'input-lock.json')['files']:verify_hash(safe(item['path']),item['sha256'])
    unchanged(state)
    stage=ROOT/'delivery/.v6-idr-candidate.installing.mp4';marker_stage=ROOT/'tmp/.v6-idr-marker.installing.json'
    require(not stage.exists() and not marker_stage.exists(),'Stale install staging exists')
    with candidate.open('rb') as a,stage.open('xb') as b:shutil.copyfileobj(a,b,4*1024*1024)
    verify_hash(stage,marker['videoSHA256']);write_new(marker_stage,marker)
    installed=False
    try:
        unchanged(state);os.replace(stage,DELIVERY);installed=True;os.replace(marker_stage,FINAL_MARKER)
        verify_hash(DELIVERY,marker['videoSHA256']);require(read(FINAL_MARKER)==marker,'Installed marker mismatch')
        write_new(OUT/'installed.json',{'installedUTC':now(),'videoSHA256':sha(DELIVERY),'markerSHA256':sha(FINAL_MARKER),
            'candidateValidated':True,'baseRetainedAt':rel(BASE/'video.mp4')})
        print(json.dumps({'installed':True,'videoSHA256':sha(DELIVERY),'markerSHA256':sha(FINAL_MARKER)}))
    except BaseException:
        if installed:
            restore=ROOT/'delivery/.v6-idr-restore.mp4'
            with (BASE/'video.mp4').open('rb') as a,restore.open('xb') as b:shutil.copyfileobj(a,b,4*1024*1024)
            os.replace(restore,DELIVERY)
            restore_marker=ROOT/'tmp/.v6-idr-restore.json';shutil.copyfile(BASE/'final-render.json',restore_marker);os.replace(restore_marker,FINAL_MARKER)
            verify_hash(DELIVERY,BASE_SHA)
        raise


def main():
    ap=argparse.ArgumentParser();group=ap.add_mutually_exclusive_group()
    group.add_argument('--archive-base',action='store_true');group.add_argument('--validate',action='store_true')
    group.add_argument('--candidate',action='store_true');group.add_argument('--install',action='store_true')
    ap.add_argument('--plan',type=Path,default=PLAN);args=ap.parse_args()
    if args.archive_base:archive_base();return
    state=preflight(args.plan)
    if args.candidate:build_candidate(state)
    elif args.install:install(state)
    else:print(json.dumps({'validation':'read-only-pass','plan':state['planPath'],'ranges':RANGES,'base':BASE_SHA}))


if __name__=='__main__':main()
