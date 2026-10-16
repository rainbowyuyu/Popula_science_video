"""Sample textured, normal-oriented surface Gaussians from the authored GLB.

This is a 3-D artistic surface-splat conversion; never claim photographic
training or a measured Gaussian reconstruction. Input GLB remains unchanged.
"""
from pathlib import Path
import argparse, io, struct, json, hashlib, datetime
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--input',default='public/assets_v18/environment/rain_garden_v18.glb');parser.add_argument('--count',type=int,default=420000);args=parser.parse_args()
INPUT=ROOT/args.input;OUT=ROOT/'public/assets_v18/gaussian';OUT.mkdir(parents=True,exist_ok=True)
blob=INPUT.read_bytes();length,kind=struct.unpack_from('<II',blob,12);j=json.loads(blob[20:20+length]);at=20+length;bl,bt=struct.unpack_from('<II',blob,at);binary=blob[at+8:at+8+bl]
dtype={5120:'<i1',5121:'<u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'};dims={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def accessor(index):
    a=j['accessors'][index];v=j['bufferViews'][a['bufferView']];n=dims[a['type']];dt=np.dtype(dtype[a['componentType']]);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    stride=v.get('byteStride',n*dt.itemsize)
    result=np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=offset,strides=(stride,dt.itemsize)).copy()
    if a.get('normalized'):
        result=result.astype(np.float32)/(np.iinfo(dt).max)
    return result
def transform(node):
    if 'matrix' in node:return np.array(node['matrix'],dtype=np.float64).reshape(4,4).T
    x,y,z,w=node.get('rotation',[0,0,0,1]);r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m=np.eye(4);m[:3,:3]=r@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
images={}
def image_texture(index):
    if index in images:return images[index]
    image=j['images'][j['textures'][index]['source']];bv=j['bufferViews'][image['bufferView']];data=binary[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
    arr=np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'),dtype=np.float32)/255
    images[index]=arr;return arr
primitives={}
def geometry(mesh_index,primitive_index):
    key=(mesh_index,primitive_index)
    if key in primitives:return primitives[key]
    primitive=j['meshes'][mesh_index]['primitives'][primitive_index];attr=primitive['attributes']
    pos=accessor(attr['POSITION']);ix=accessor(primitive['indices']).reshape(-1,3).astype(np.int32)
    normals=accessor(attr['NORMAL']) if 'NORMAL' in attr else None;uv=accessor(attr['TEXCOORD_0']) if 'TEXCOORD_0' in attr else None
    triangle=pos[ix];areas=np.linalg.norm(np.cross(triangle[:,1]-triangle[:,0],triangle[:,2]-triangle[:,0]),axis=1)*.5
    mat=j.get('materials',[])[primitive.get('material',0)] if j.get('materials') else {};pbr=mat.get('pbrMetallicRoughness',{});factor=np.array(pbr.get('baseColorFactor',[1,1,1,1]),dtype=np.float32);tex=pbr.get('baseColorTexture',{}).get('index')
    result={'pos':pos,'ix':ix,'normal':normals,'uv':uv,'areas':areas,'factor':factor,'texture':image_texture(tex) if tex is not None else None,'material':mat.get('name',''),'alphaMode':mat.get('alphaMode','OPAQUE')};primitives[key]=result;return result
def category(name):
    if 'continuous_rain_meadow' in name:return 'terrain'
    if 'path_stone' in name or 'basin' in name or 'rim' in name:return 'stone_path'
    if 'creek' in name:return 'water'
    if 'pond_bed' in name or 'graded_shore' in name:return 'terrain'
    if 'real_tree' in name:return 'trees'
    if 'moss_stone' in name or 'shore_rock' in name or 'submerged_pebble' in name:return 'rocks'
    return 'foliage'
instances=[]
def visit(index,parent):
    node=j['nodes'][index];world=parent@transform(node)
    if 'mesh' in node:
        for pi,pr in enumerate(j['meshes'][node['mesh']]['primitives']):
            g=geometry(node['mesh'],pi);name=node.get('name','');cat=category(name)
            # Uniform scaled source instances preserve area exactly; irregular
            # authored meshes have their world vertices baked into the GLB.
            scale2=(abs(np.linalg.det(world[:3,:3]))**(2/3));area=float(g['areas'].sum()*scale2)
            centre=(g['pos'].mean(axis=0)@world[:3,:3].T)+world[:3,3]
            if abs(centre[0])>46 or centre[2]<-61 or centre[2]>34:return
            importance=(1 if centre[2]<17 else .35)*(1 if abs(centre[0])<30 else .35)
            instances.append({'name':name,'world':world,'geometry':g,'category':cat,'weight':area*importance,'area':area})
    for child in node.get('children',[]):visit(child,world)
for root in j['scenes'][j.get('scene',0)]['nodes']:visit(root,np.eye(4))
budgets={'terrain':.16,'stone_path':.08,'water':.02,'trees':.42,'rocks':.06,'foliage':.26}
rng=np.random.default_rng(184207);rows=[];groups=[]
sun=np.array([.20,.34,.92],dtype=np.float32);sun/=np.linalg.norm(sun)
def srgb_to_linear(x):return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
for ci,(cat,fraction) in enumerate(budgets.items()):
    subset=[x for x in instances if x['category']==cat];target=int(args.count*fraction);weights=np.array([x['weight'] for x in subset]);weights/=weights.sum()
    allocations=rng.multinomial(target,weights);accepted=0
    for obj,count in zip(subset,allocations):
        if count==0:continue
        g=obj['geometry'];world=obj['world'];areas=g['areas'].copy();ix=g['ix'];pos=g['pos']
        if cat=='terrain':
            centres=pos[ix].mean(axis=1)@world[:3,:3].T+world[:3,3]
            dist=np.linalg.norm(centres[:,[0,2]]-np.array([0,2]),axis=1)
            areas*=np.exp(-dist*.023)*((np.abs(centres[:,0])<42)&(centres[:,2]>-50)&(centres[:,2]<27))
        areas=np.maximum(areas,0);total=areas.sum()
        if total<=1e-8:continue
        # Oversampling permits alpha-mask rejection without coloured rectangles.
        samples=count*3 if g['alphaMode']!='OPAQUE' else count
        picks=rng.choice(len(ix),samples,p=areas/total);tri=ix[picks]
        u=np.sqrt(rng.random(samples));v=rng.random(samples);bc=np.stack([1-u,u*(1-v),u*v],axis=1)
        points=np.einsum('ni,nij->nj',bc,pos[tri]);points=points@world[:3,:3].T+world[:3,3]
        if g['normal'] is not None:normals=np.einsum('ni,nij->nj',bc,g['normal'][tri])@np.linalg.inv(world[:3,:3])
        else:
            t=pos[tri]@world[:3,:3].T;normals=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
        normals/=np.maximum(1e-9,np.linalg.norm(normals,axis=1,keepdims=True))
        rgba=np.broadcast_to(g['factor'],(samples,4)).copy()
        if g['texture'] is not None and g['uv'] is not None:
            coords=np.einsum('ni,nij->nj',bc,g['uv'][tri]);im=g['texture'];height,width=im.shape[:2]
            tx=(np.mod(coords[:,0],1)*width).astype(np.int32)%width;ty=(np.mod(coords[:,1],1)*height).astype(np.int32)%height
            # glTF embedded texture rows start at image top, GLTFLoader performs
            # flipY=false. UV v=0 addresses row zero in the converted sampler.
            rgba*=im[ty,tx]
        valid=rgba[:,3]>.42
        if cat=='terrain':valid&=(np.abs(points[:,0])<42)&(points[:,2]>-50)&(points[:,2]<27)
        points=points[valid][:count];normals=normals[valid][:count];rgba=rgba[valid][:count];n=len(points)
        if n==0:continue
        col=srgb_to_linear(rgba[:,:3])
        lighting=.70+.36*np.maximum(0,normals@sun)
        if cat in ['trees','foliage']:lighting=.66+.32*np.abs(normals@sun)
        col=np.clip(col*lighting[:,None]*np.array([1.035,1.028,.985]),0,1)
        if 'meadow_blades' in obj['name']:col*=.62
        spacing=np.sqrt(max(.00001,obj['area'])/max(count,1))*.62
        sigma=np.full((n,3),spacing,dtype=np.float32)
        if cat in ['trees','foliage']:
            sigma[:,0]=np.clip(spacing,.012,.072);sigma[:,1]=sigma[:,0]*rng.uniform(.78,1.08,n);sigma[:,2]=np.maximum(.006,sigma[:,0]*.46)
        elif cat=='stone_path':sigma[:,0]=np.clip(spacing,.024,.070);sigma[:,1]=sigma[:,0]*rng.uniform(.85,1.15,n);sigma[:,2]=sigma[:,0]*.40
        elif cat=='water':sigma[:,0]=np.clip(spacing,.045,.14);sigma[:,1]=sigma[:,0]*.85;sigma[:,2]=sigma[:,0]*.30
        elif cat=='terrain':sigma[:,0]=np.clip(spacing,.035,.18);sigma[:,1]=sigma[:,0]*rng.uniform(.90,1.10,n);sigma[:,2]=sigma[:,0]*.35
        else:sigma[:,0]=np.clip(spacing,.020,.10);sigma[:,1]=sigma[:,0]*rng.uniform(.88,1.10,n);sigma[:,2]=sigma[:,0]*.45
        # Quaternion rotates local z to the real interpolated surface normal.
        q=np.zeros((n,4),dtype=np.float32);q[:,0]=-normals[:,1];q[:,1]=normals[:,0];q[:,3]=1+normals[:,2]
        length=np.linalg.norm(q,axis=1,keepdims=True);fallback=length[:,0]<1e-6;q[fallback]=[1,0,0,0];length[fallback]=1;q/=length
        seeds=rng.random(n).astype(np.float32);alpha=np.full(n,.71,dtype=np.float32)
        if cat=='water':alpha[:]=.52
        row=np.zeros((n,16),dtype=np.float32);row[:,:3]=points;row[:,3:6]=col;row[:,6]=alpha;row[:,7:10]=sigma;row[:,10:14]=q;row[:,14]=seeds;row[:,15]=ci
        rows.append(row);accepted+=n
    groups.append({'category':cat,'requested':target,'accepted':accepted});print(json.dumps(groups[-1]),flush=True)
data=np.concatenate(rows,axis=0);assert np.isfinite(data).all();assert np.max(np.abs(np.linalg.norm(data[:,10:14],axis=1)-1))<1e-5
output=OUT/'rain-garden-v18.splats.bin';output.write_bytes(data.astype('<f4').tobytes())
meta={'version':'V18','count':len(data),'stride':16,'encoding':'float32-le','samplingSeed':184207,'sourceStyle':'hand-painted rain garden palette with physically based wet surfaces','record':'x,y,z,linear-r,g,b,alpha,sigma-x,y,z,quaternion-x,y,z,w,seed,category','representation':'Authored artistic volumetric covariance splats sampled from a three-dimensional Blender scene and rendered with mesh ground/tree support; not a trained photographic reconstruction','coordinates':'glTF Y-up metres; identity transform (scale=1). Optical hero [0,4,0], water [-3,.025,3]','sourceGLB':args.input,'sourceGLBSHA256':hashlib.sha256(blob).hexdigest(),'binarySHA256':hashlib.sha256(output.read_bytes()).hexdigest(),'bounds':{'min':data[:,:3].min(axis=0).tolist(),'max':data[:,:3].max(axis=0).tolist()},'groups':groups,'createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'licenses':'../environment/provenance-v18.json; original CC0 source-licenses-v15.json retained','physicalAuthority':False,'normalMaximumResidual':float(np.max(np.abs(np.linalg.norm(data[:,10:14],axis=1)-1)))}
(OUT/'rain-garden-v18.splats.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'file':str(output),'count':len(data),'bytes':output.stat().st_size,'sha256':meta['binarySHA256']}),flush=True)

