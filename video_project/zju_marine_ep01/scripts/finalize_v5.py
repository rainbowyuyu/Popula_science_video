from pathlib import Path
import argparse,json,subprocess,re,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'rainbow-marine-ep01-v5'
def run(args,path=None):
 p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace')
 if path: Path(path).write_text(p.stdout+'\n'+p.stderr,encoding='utf-8')
 if p.returncode: raise RuntimeError(p.stderr[-3000:])
 return p.stdout,p.stderr

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',default=str(OUT/'marine_energy_episode01_v5_raw.mp4'));ap.add_argument('--output',default=str(OUT/'marine_energy_episode01_v5.mp4'));a=ap.parse_args()
 raw=Path(a.source);final=Path(a.output);qa=OUT/'qa';qa.mkdir(parents=True,exist_ok=True)
 raw_probe=json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',str(raw)])[0]);video_duration=float(next(s for s in raw_probe['streams'] if s['codec_type']=='video')['duration']);target_samples=round(video_duration*48000)
 _,log=run(['ffmpeg','-hide_banner','-nostdin','-i',str(raw),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-'],qa/'loudnorm-analysis.log')
 m=json.loads(re.findall(r'\{\s*"input_i".*?\}',log,re.S)[-1]);flt=f"loudnorm=I=-16:TP=-1.5:LRA=7:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json"
 # loudnorm's final dynamic block can carry a discontinuous timestamp.
 # Rebuild timestamps from the preserved sample sequence after the exact trim.
 flt+=f',aresample=48000,apad,atrim=end_sample={target_samples},asetpts=N/SR/TB'
 run(['ffmpeg','-hide_banner','-nostdin','-y','-i',str(raw),'-map','0:v:0','-map','0:a:0','-c:v','copy','-af',flt,'-ar','48000','-c:a','aac','-b:a','256k','-movflags','+faststart',str(final)],qa/'final-mux.log')
 out,_=run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(final)],qa/'ffprobe.json');probe=json.loads(out)
 packet_out,_=run(['ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts,duration','-of','json',str(final)])
 packets=json.loads(packet_out)['packets']
 pts_steps=[{'packet':i,'pts':int(packets[i]['pts']),'step':int(packets[i]['pts'])-int(packets[i-1]['pts'])} for i in range(1,len(packets)) if int(packets[i]['pts'])-int(packets[i-1]['pts'])!=1024]
 duration_errors=[{'packet':i,'duration':int(p['duration'])} for i,p in enumerate(packets[:-1]) if int(p['duration'])!=1024]
 packet_report={'codec':'AAC-LC','frameSamples':1024,'packetCount':len(packets),'nonuniformPtsSteps':pts_steps,'interiorDurationErrors':duration_errors,'lastDurationSamples':int(packets[-1]['duration'])}
 (qa/'audio-packet-timing.json').write_text(json.dumps(packet_report,indent=2),encoding='utf-8')
 _,metrics=run(['ffmpeg','-hide_banner','-nostdin','-i',str(final),'-vf','blackdetect=d=0.15:pix_th=0.03:pic_th=0.985','-af','silencedetect=n=-55dB:d=1.25,ebur128=peak=true','-f','null','-'],qa/'decode-av-detection.log')
 vids=[s for s in probe['streams'] if s['codec_type']=='video'];aud=[s for s in probe['streams'] if s['codec_type']=='audio'];v=vids[0];au=aud[0]
 summary=metrics.split('Summary:')[-1];lm=re.search(r'I:\s*(-?[\d.]+) LUFS',summary);tp=re.search(r'Peak:\s*(-?[\d.]+) dBFS',summary)
 blacks=re.findall(r'black_start:([^\n]+)',metrics);silences=re.findall(r'silence_start:\s*([\d.]+)',metrics)
 checks={'resolution':(v['width'],v['height'])==(1920,1080),'fps':v['r_frame_rate']=='30/1','avDurationDeltaSec':abs(float(v['duration'])-float(au['duration'])),'audioPacketTimingContinuous':not pts_steps and not duration_errors,'fullDecode':True,'blackIntervals':blacks,'silenceStartsOver1_25Sec':silences,'integratedLUFS':float(lm.group(1)) if lm else None,'truePeakDbTP':float(tp.group(1)) if tp else None}
 report={'created':datetime.datetime.now().isoformat(),'file':str(final),'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'bytes':final.stat().st_size,'checks':checks,'actualFullNormalSpeedViewing':False,'subjectiveListeningChecked':False,'scope':'Complete decoder/audio measurements; separate representative-frame visual review required'}
 (qa/'final-encoding-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
 if not checks['resolution'] or not checks['fps'] or checks['avDurationDeltaSec']>1/30 or not checks['audioPacketTimingContinuous'] or blacks:raise SystemExit('Encoding checks need review')
if __name__=='__main__':main()
