"""Uniformly refine every native coarse element, preserving the same exterior."""
from pathlib import Path
import gmsh,numpy as np,json,hashlib,time
p=Path(__file__).resolve().parent;src=p/'tower-only-prism-L12-v2/tower.msh';dst=p/'tower-only-refined2-L12';dst.mkdir(exist_ok=True)
gmsh.initialize();gmsh.option.setNumber('General.NumThreads',8);gmsh.open(str(src));start=time.time()
gmsh.model.mesh.refine()
et,ets,con=gmsh.model.mesh.getElements(3);quality={}
for typ,tags in zip(et,ets):
 q=gmsh.model.mesh.getElementQualities(tags,'minSICN');quality[gmsh.model.mesh.getElementProperties(typ)[0]]={'count':len(tags),'minSICN':float(q.min()),'nonpositive':int(np.sum(q<=0))}
 assert np.all(q>0)
gmsh.option.setNumber('Mesh.MshFileVersion',2.2);gmsh.option.setNumber('Mesh.Binary',0);gmsh.write(str(dst/'tower.msh'));gmsh.finalize()
(dst/'mesh-report.json').write_text(json.dumps({'source':str(src),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'method':'Uniform one-to-eight tetrahedron and prism refinement of existing native mesh; same piecewise-linear exterior','elementQuality':quality,'seconds':time.time()-start,'quality':{'acceptedForFilm':False}},indent=2)+'\n');print(quality)
