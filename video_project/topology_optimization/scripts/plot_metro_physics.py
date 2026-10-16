"""Static audit plot for the metro numerical teaching model; not a film overlay."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).resolve().parents[1]
flow=json.loads((root/'public/metro/physics/flow.json').read_text())
audit=json.loads((root/'research/metro/physics-audit.json').read_text())
passage=json.loads((root/'public/metro/physics/passage.json').read_text())
x=flow['x0']+np.arange(flow['nx'])*flow['dx']
z=flow['z0']+np.arange(flow['nz'])*flow['dz']
shape=(flow['nz'],flow['nx'])
f=flow['frames'][-1]
u=np.array(f['u']).reshape(shape);v=np.array(f['v']).reshape(shape)
cp=np.array(f['cp']).reshape(shape)
solid=np.array(flow['solid']).reshape(shape).astype(bool)
cp=np.ma.masked_where(solid,cp)
fig=plt.figure(figsize=(13,9),layout='constrained',facecolor='#f5f3ed')
grid=fig.add_gridspec(2,2,height_ratios=[1.1,1])
ax=fig.add_subplot(grid[0,:]);ax.set_facecolor('#f5f3ed')
im=ax.pcolormesh(x,z,cp,cmap='RdBu_r',vmin=-1.2,vmax=1.2,shading='nearest')
ax.contourf(x,z,solid,levels=[.5,1.5],colors=['#233a46'])
ax.streamplot(x,z,u,v,density=[1.4,.65],linewidth=.7,color='#294754',arrowsize=.7)
ax.set(xlim=(-10,13),ylim=(-4.8,4.8),aspect='equal',xlabel='x (model units)',ylabel='z (model units)',title='Computed train-frame flow, Re = 20 | nose at x = -4, tail at x = +4')
fig.colorbar(im,ax=ax,label='Pressure coefficient Cp',shrink=.9)
ax=fig.add_subplot(grid[1,0]);ax.set_facecolor('#f5f3ed')
for p,c in zip(passage['passages'],['#ae664c','#318d96','#426b8b','#8b7494']):
    seq=p['sequence'];ax.plot([s['xRelative'] for s in seq],[s['speedLab'] for s in seq],color=c,label=f"clearance {p['clearanceModelUnits']} model units")
ax.axvline(-4,c='#999999',ls='--',lw=.7);ax.axvline(4,c='#999999',ls='--',lw=.7)
ax.set(xlabel='Observer position relative to train x',ylabel='Laboratory-frame speed / U_inf',title='Derived fixed-observer passage | no safety-distance inference')
ax.legend(fontsize=8);ax.grid(alpha=.15)
ax=fig.add_subplot(grid[1,1]);ax.set_facecolor('#f5f3ed')
h=audit['production']['history'];steps=np.array([v['step'] for v in h]);qin=np.array([v['fluxIn'] for v in h]);qout=np.array([v['fluxOut'] for v in h])
ax.semilogy(steps,np.maximum(abs(qin-qout)/qin,1e-12),c='#318d96',label='inlet/outlet relative flux difference')
ax.axhline(.01,c='#ae664c',ls='--',label='declared 1% check')
ax.set(xlabel='LBM time steps',ylabel='Relative difference',title='Conservation stabilizes after startup')
ax.legend(fontsize=8);ax.grid(alpha=.15)
fig.suptitle('Metro airflow teaching model — numerical audit, not full-scale station CFD',fontsize=16)
fig.savefig(root/'research/metro/physics-overview.png',dpi=170)
print(root/'research/metro/physics-overview.png')
