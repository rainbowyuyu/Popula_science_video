nx,ny=80,40; hx=hy=5.; E=70000.; nu=.3; thick=8.; vol=.35; penal=3.; emin=1e-6
D=E/(1-nu*nu)*np.array([[1,nu,0],[nu,1,0],[0,0,(1-nu)/2]])

ke=np.zeros((8,8))
for xi in [-1/np.sqrt(3),1/np.sqrt(3)]:
    for eta in [-1/np.sqrt(3),1/np.sqrt(3)]:
        b=bmatrix(xi,eta); ke+=b.T@D@b*thick*hx*hy/4

nodes=np.arange((nx+1)*(ny+1)).reshape(ny+1,nx+1)
en=np.stack([nodes[:-1,:-1].ravel(),nodes[:-1,1:].ravel(),
             nodes[1:,1:].ravel(),nodes[1:,:-1].ravel()],axis=1)
edof=np.empty((nx*ny,8),dtype=int); edof[:,0::2]=en*2; edof[:,1::2]=en*2+1
fixed=np.ravel(np.column_stack([2*nodes[:,0],2*nodes[:,0]+1]))
free=np.setdiff1d(np.arange(ndof),fixed)
force=np.zeros(ndof); force[2*nodes[-3:,-1]+1]=-100/3

def solve(rho,load=force):
    fac=emin+(1-emin)*rho**penal
    K=coo_matrix((np.outer(fac,ke.ravel()).ravel(),(ir,jc)),
                 shape=(ndof,ndof)).tocsc()
    u=np.zeros(ndof); u[free]=spsolve(K[free,:][:,free],load[free])
    ce=np.einsum("ij,jk,ik->i",u[edof],ke,u[edof])
    res=K@u-load
    return u,ce,float(load@u),
        float(np.linalg.norm(res[free])/np.linalg.norm(load)),
        float(res[fixed[1::2]].sum())

H=coo_matrix((hv,(hr,hc)),shape=(nx*ny,nx*ny)).tocsr()
hs=np.asarray(H.sum(axis=1)).ravel()

x=np.full(nx*ny,vol); history=[]
for it in range(101):
    u,ce,c,res,react=solve(x)
    dc=-penal*(1-emin)*x**(penal-1)*ce
    dc=np.asarray(H@(x*dc))/hs/np.maximum(.001,x)
    lo,hi=0.,1e9
    while (hi-lo)/(hi+lo+1e-15)>1e-5:
        mid=(lo+hi)/2
        new=np.maximum(.001,np.maximum(x-.15,np.minimum(1,
             np.minimum(x+.15,x*np.sqrt(-dc/mid)))))
        if new.mean()>vol: lo=mid
        else: hi=mid
    x=new

data=dict(history=history,displacement=np.round(u.reshape(-1,2),8).tolist(),
           vonMisesMPa=np.round(vm,6).tolist(),checks=checks)
(OUT/"simulation.json").write_text(json.dumps(data,separators=(",",":")))