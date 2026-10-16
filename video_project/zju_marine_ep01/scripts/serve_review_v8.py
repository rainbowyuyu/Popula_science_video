"""Local, read-only single-video player for playback QA (not a subjective audit).

Only the selected file and a small review page are served, on loopback.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re

PAGE = r'''<!doctype html><meta charset="utf-8"><title>V8 playback review</title>
<style>body{background:#071e29;color:#eef7f7;font:18px system-ui;margin:20px}video{width:min(100%,1280px);max-height:78vh;display:block;background:#000}button{font:inherit;margin:14px 10px 14px 0;padding:8px 18px}pre{white-space:pre-wrap;font-size:15px}</style>
<h1>V8 encoded playback review</h1><video id="film" src="/video" muted playsinline preload="auto"></video>
<button id="play">Play from start</button><button id="pause">Pause</button><button id="resume">Resume</button>
<p>Muted browser playback. Frame delivery statistics do not certify aesthetics or speech quality.</p><pre id="status">Loading</pre>
<script>
const video=document.querySelector('video'),status=document.querySelector('#status');
let observed=0,gaps=[],reversals=[],last=null,started=null,ended=false;
function sample(now,meta){
 observed++;
 if(last!==null){const step=meta.mediaTime-last;if(step<-.0001)reversals.push([last,meta.mediaTime]);if(step>.051)gaps.push([last,meta.mediaTime]);}
 last=meta.mediaTime;video.requestVideoFrameCallback(sample);
}
video.requestVideoFrameCallback(sample);
function show(){const q=video.getVideoPlaybackQuality();status.textContent=JSON.stringify({file:__NAME__,currentTime:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,readyState:video.readyState,playbackRate:video.playbackRate,decoded:q.totalVideoFrames,dropped:q.droppedVideoFrames,observedCallbacks:observed,callbackGaps:gaps,callbackReversals:reversals,started,endedRecorded:ended,muted:video.muted},null,2);}
document.querySelector('#play').onclick=()=>{video.currentTime=0;observed=0;gaps=[];reversals=[];last=null;ended=false;started=new Date().toISOString();video.play();};
document.querySelector('#pause').onclick=()=>video.pause();document.querySelector('#resume').onclick=()=>video.play();
video.onended=()=>{ended=true;show();};setInterval(show,250);
</script>'''


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('video',type=Path)
    ap.add_argument('--port',type=int,default=8798)
    args=ap.parse_args()
    video=args.video.resolve()
    if not video.is_file():raise FileNotFoundError(video)
    page=PAGE.replace('__NAME__',json.dumps(video.name)).encode('utf8')
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):
            if self.path=='/':
                self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(page)));self.end_headers();self.wfile.write(page);return
            if self.path!='/video':self.send_error(404);return
            size=video.stat().st_size;start,end=0,size-1;partial=False
            h=self.headers.get('Range')
            if h:
                m=re.fullmatch(r'bytes=(\d+)-(\d*)',h)
                if not m:self.send_error(416);return
                start=int(m[1]);end=min(int(m[2]) if m[2] else end,end);partial=True
                if start>end:self.send_error(416);return
            self.send_response(206 if partial else 200)
            self.send_header('Content-Type','video/mp4');self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Length',str(end-start+1))
            if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            try:
                with video.open('rb') as f:
                    f.seek(start);remaining=end-start+1
                    while remaining:
                        chunk=f.read(min(1024*1024,remaining))
                        if not chunk:break
                        self.wfile.write(chunk);remaining-=len(chunk)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
    print(f'Reviewing {video.name} at http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()


if __name__=='__main__':main()
