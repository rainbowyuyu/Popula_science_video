from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pygments import lex
from pygments.lexers import PythonLexer
from pygments.token import Token
R=Path('delivery/v3'); R.mkdir(parents=True,exist_ok=True)
lines=[
'# 1. 材料、网格与边界条件',
'nx,ny=80,40; hx=hy=5.; E=70000.; nu=.3; thick=8.; vol=.35; penal=3.; emin=1e-6',
'D=E/(1-nu*nu)*np.array([[1,nu,0],[nu,1,0],[0,0,(1-nu)/2]])',
'',
'# 2. Q4 单元刚度：2×2 Gauss 积分',
'ke=np.zeros((8,8))',
'for xi in [-1/np.sqrt(3),1/np.sqrt(3)]:',
'    for eta in [-1/np.sqrt(3),1/np.sqrt(3)]:',
'        b=bmatrix(xi,eta); ke+=b.T@D@b*thick*hx*hy/4',
'',
'# 3. 组装全局自由度、固定左边、施加右上向下载荷',
'nodes=np.arange((nx+1)*(ny+1)).reshape(ny+1,nx+1)',
'en=np.stack([nodes[:-1,:-1].ravel(),nodes[:-1,1:].ravel(),',
'             nodes[1:,1:].ravel(),nodes[1:,:-1].ravel()],axis=1)',
'edof=np.empty((nx*ny,8),dtype=int); edof[:,0::2]=en*2; edof[:,1::2]=en*2+1',
'fixed=np.ravel(np.column_stack([2*nodes[:,0],2*nodes[:,0]+1]))',
'free=np.setdiff1d(np.arange(ndof),fixed)',
'force=np.zeros(ndof); force[2*nodes[-3:,-1]+1]=-100/3',
'',
'# 4. 给定密度 rho，求位移、柔度和残差',
'def solve(rho,load=force):',
'    fac=emin+(1-emin)*rho**penal',
'    K=coo_matrix((np.outer(fac,ke.ravel()).ravel(),(ir,jc)),',
'                 shape=(ndof,ndof)).tocsc()',
'    u=np.zeros(ndof); u[free]=spsolve(K[free,:][:,free],load[free])',
'    ce=np.einsum("ij,jk,ik->i",u[edof],ke,u[edof])',
'    res=K@u-load',
'    return u,ce,float(load@u),',
'        float(np.linalg.norm(res[free])/np.linalg.norm(load)),',
'        float(res[fixed[1::2]].sum())',
'',
'# 5. 过滤灵敏度，避免棋盘格',
'H=coo_matrix((hv,(hr,hc)),shape=(nx*ny,nx*ny)).tocsr()',
'hs=np.asarray(H.sum(axis=1)).ravel()',
'',
'# 6. SIMP + OC：反复求解并更新材料密度',
'x=np.full(nx*ny,vol); history=[]',
'for it in range(101):',
'    u,ce,c,res,react=solve(x)',
'    dc=-penal*(1-emin)*x**(penal-1)*ce',
'    dc=np.asarray(H@(x*dc))/hs/np.maximum(.001,x)',
'    lo,hi=0.,1e9',
'    while (hi-lo)/(hi+lo+1e-15)>1e-5:',
'        mid=(lo+hi)/2',
'        new=np.maximum(.001,np.maximum(x-.15,np.minimum(1,',
'             np.minimum(x+.15,x*np.sqrt(-dc/mid)))))',
'        if new.mean()>vol: lo=mid',
'        else: hi=mid',
'    x=new',
'',
'# 7. 保存每轮密度、位移、应力和校验结果',
'data=dict(history=history,displacement=np.round(u.reshape(-1,2),8).tolist(),',
'           vonMisesMPa=np.round(vm,6).tolist(),checks=checks)',
'(OUT/"simulation.json").write_text(json.dumps(data,separators=(",",":")))',
]
lines=[x for x in lines if not x.strip().startswith('#')]
W,H=1800,1700
bg=(19,28,38); im=Image.new('RGB',(W,H),bg); d=ImageDraw.Draw(im)
try:
 fnt=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',21); title=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',34); sub=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',20)
except: fnt=ImageFont.load_default();title=fnt;sub=fnt
# top bar
d.rounded_rectangle((48,36,W-48,118),radius=18,fill=(30,45,58)); d.ellipse((78,66,94,82),fill=(240,100,94)); d.ellipse((104,66,120,82),fill=(240,190,80)); d.ellipse((130,66,146,82),fill=(90,200,140)); d.text((180,58),'simulate.py  ·  topology optimization solver',font=title,fill=(232,242,244)); d.text((52,132),'Python + NumPy + SciPy sparse FEM | core excerpt from the executed solver',font=sub,fill=(150,180,188))
colors={Token.Keyword:(244,151,112),Token.Name.Builtin:(120,204,214),Token.Name.Function:(135,205,150),Token.Literal.Number:(220,190,112),Token.Operator:(215,220,225),Token.Comment:(112,145,150),Token.String:(210,165,220),Token.Punctuation:(195,205,212),Token.Name:(220,225,228)}
y=188; line_h=26
for no,line in enumerate(lines,1):
 d.text((58,y),f'{no:02}',font=fnt,fill=(80,110,120)); x=112
 for typ,val in lex(line+'\n',PythonLexer()):
  col=colors.get(typ,(220,225,228)); d.text((x,y),val.rstrip('\n'),font=fnt,fill=col); x+=d.textlength(val.rstrip('\n'),font=fnt)
 y+=line_h
# footer
d.rounded_rectangle((48,H-110,W-48,H-42),radius=14,fill=(30,45,58));d.text((76,H-91),'rho -> stiffness -> displacement -> sensitivity -> update -> convergence',font=sub,fill=(175,220,216))
out=R/'核心仿真代码截图.png'; im.save(out,quality=95); print(out)
# excerpt text
(R/'核心仿真代码摘录.py').write_text('\n'.join(lines),encoding='utf8')




