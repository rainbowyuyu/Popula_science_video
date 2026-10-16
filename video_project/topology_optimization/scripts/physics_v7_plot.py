"""Scientific diagnostic plots for the computed v7 physics; no invented data."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/episode3v7/physics'
def draw_flow(path,label):
    d=np.load(path/'lbm-raw.npz')
    flow=json.loads((path/'flow.json').read_text(encoding='utf-8'))
    x,z=d['x_m'],d['z_m'];speed=np.hypot(d['u_lattice'],d['w_lattice'])/.035
    fig,ax=plt.subplots(figsize=(12,6.2),facecolor='#f5f1e9')
    ax.set_facecolor('#f5f1e9')
    im=ax.pcolormesh(x,z,np.ma.masked_where(d['solid'],speed),cmap='PuBuGn',vmin=0,vmax=2,shading='nearest')
    ax.contourf(x,z,d['solid'],levels=[.5,1.5],colors=['#675549'])
    for line in flow['streamlines']:
        q=np.asarray(line);ax.plot(q[:,0],q[:,1],color='white',alpha=.62,lw=.65)
    ax.set_xlim(-5.5,7);ax.set_ylim(0,8);ax.set_aspect('equal')
    ax.set_xlabel('x [m]');ax.set_ylabel('height z [m]')
    ax.set_title(f"Computed {label} section — y={flow['plane_y_m']:g} m, D2Q9, Re={flow['Reynolds_span']:.1f}")
    fig.colorbar(im,ax=ax,pad=.02,label='velocity / inlet velocity')
    fig.text(.12,.01,'Low-Re vertical slice, independent LBM. This is not atmospheric CFD or the structural pressure load.',fontsize=9,color='#6b5f52')
    fig.tight_layout(rect=[0,.025,1,1])
    fig.savefig(path/'flow-diagnostic.png',dpi=160)
    plt.close(fig)

draw_flow(OUT,'front-column')
draw_flow(OUT/'central','central')

inv=json.loads((OUT/'inverse-diffusion.json').read_text(encoding='utf-8'))
fig,axs=plt.subplots(1,2,figsize=(11,4.3),facecolor='#f5f1e9')
ids=inv['panel_ids'];a=np.arange(len(ids))
axs[0].bar(a-.16,inv['pressure_truth_Cp'],.32,label='Known synthetic pressure',color='#577f87')
axs[0].bar(a+.16,inv['pressure_recovered_Cp'],.32,label='Recovered through native FE',color='#b27b55')
axs[0].set_xticks(a,ids,rotation=15,fontsize=8);axs[0].set_ylabel('Pressure coefficient Cp');axs[0].legend(fontsize=8)
errors=inv['member_response_errors'];truth=[v['truth_sigma_max_Pa']/1e6 for v in errors.values()];rec=[v['recovered_sigma_max_Pa']/1e6 for v in errors.values()]
axs[1].scatter(truth,rec,s=14,color='#577f87');mx=max(truth+rec)*1.02
axs[1].plot([0,mx],[0,mx],color='#b27b55',lw=1)
axs[1].set_xlabel('Known-load section envelope [MPa]');axs[1].set_ylabel('Recovered-load section envelope [MPa]')
fig.suptitle('Synthetic pressure inversion + native ZDyn member response')
fig.tight_layout();fig.savefig(OUT/'inverse-diagnostic.png',dpi=160);plt.close(fig)
