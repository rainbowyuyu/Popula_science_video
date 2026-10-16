"""Local-only project preview server with byte-range video seeking."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, re

class Handler(SimpleHTTPRequestHandler):
 def send_head(self):
  self._byte_count=None
  path=Path(self.translate_path(self.path))
  header=self.headers.get('Range')
  if not header or not path.is_file():return super().send_head()
  m=re.fullmatch(r'bytes=(\d*)-(\d*)',header.strip())
  size=path.stat().st_size
  if not m or not size:
   self.send_error(416);return None
  if m[1]:
   start=int(m[1]);end=min(int(m[2]) if m[2] else size-1,size-1)
  elif m[2]:
   start=max(0,size-int(m[2]));end=size-1
  else:
   self.send_error(416);return None
  if start>=size or start>end:
   self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.end_headers();return None
  stream=path.open('rb');stream.seek(start)
  self._byte_count=end-start+1
  self.send_response(206);self.send_header('Content-Type',self.guess_type(str(path)))
  self.send_header('Accept-Ranges','bytes');self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
  self.send_header('Content-Length',str(self._byte_count));self.send_header('Last-Modified',self.date_time_string(path.stat().st_mtime));self.end_headers()
  return stream
 def end_headers(self):
  self.send_header('Accept-Ranges','bytes')
  super().end_headers()
 def copyfile(self,source,outputfile):
  remaining=self._byte_count
  if remaining is None:return super().copyfile(source,outputfile)
  try:
   while remaining>0:
    data=source.read(min(1024*1024,remaining))
    if not data:break
    outputfile.write(data);remaining-=len(data)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass

class Server(ThreadingHTTPServer):
 allow_reuse_address=False

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8783)
 args=parser.parse_args();project=Path(__file__).resolve().parents[3]
 server=Server(('127.0.0.1',args.port),partial(Handler,directory=str(project)))
 print(f'Preview: http://127.0.0.1:{args.port}/output/v05/preview.html',flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:server.server_close()
