from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]/'work'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def send_head(self):
        self.byte_range=None
        path=Path(self.translate_path(self.path))
        rng=self.headers.get('Range')
        if rng and path.is_file():
            size=path.stat().st_size;m=re.fullmatch(r'bytes=(\d+)-(\d*)',rng.strip())
            if m:
                start=int(m.group(1));end=min(int(m.group(2)) if m.group(2) else size-1,size-1)
                if start>=size:self.send_error(416);return None
                f=path.open('rb');f.seek(start);self.byte_range=(start,end)
                self.send_response(206);self.send_header('Content-Type',self.guess_type(str(path)));self.send_header('Accept-Ranges','bytes');self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Content-Length',str(end-start+1));self.end_headers();return f
        return super().send_head()
    def end_headers(self):self.send_header('Accept-Ranges','bytes');super().end_headers()
    def copyfile(self,source,outputfile):
        if self.byte_range:
            remain=self.byte_range[1]-self.byte_range[0]+1
            while remain:
                b=source.read(min(1024*1024,remain))
                if not b:break
                outputfile.write(b);remain-=len(b)
        else:super().copyfile(source,outputfile)
ThreadingHTTPServer(('127.0.0.1',8143),Handler).serve_forever()

