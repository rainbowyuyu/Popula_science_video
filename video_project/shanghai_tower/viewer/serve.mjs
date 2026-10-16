import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=process.argv.find(a=>a.startsWith('--port='));
const port=argument?Number(argument.slice(7)):0;
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Port must be an integer from 0 to 65535.');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.glb':'model/gltf-binary','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(name==='/')name='/viewer/index.html';
  const file=path.resolve(root,'.'+name);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
    if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file).pipe(res);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`Shanghai Tower viewer: http://127.0.0.1:${server.address().port}/viewer/index.html`));
