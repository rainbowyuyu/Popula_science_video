from pathlib import Path
import argparse,json,numpy as np,matplotlib.pyplot as plt
ap=argparse.ArgumentParser();ap.add_argument('case',type=Path);a=ap.parse_args();p=a.case
d=json.loads((p/'computed-flow-slices.json').read_text(encoding='utf8'))
fig,axs=plt.subplots(2,2,figsize=(14,9),layout='constrained')
for ax,s in zip(axs.ravel(),d['slices']):
 v=np.array([np.nan if x is None else x for x in s['speed_m_s']]).reshape(s['ny'],s['nx'])
 im=ax.imshow(v,origin='lower',extent=[s['origin_m'][0],s['origin_m'][0]+s['width_m'],0,s['height_m']],vmin=0,vmax=d['speedRange_m_s'][1],cmap='turbo',aspect='equal')
 ax.set_title(s['id']+' (m/s)');ax.set_xlabel('solver x, m');ax.set_ylabel('slice distance, m')
fig.colorbar(im,ax=axs.ravel().tolist(),label='Native interpolated velocity (m/s)')
accepted=d['quality']['acceptedForFilm'];fig.suptitle(('ACCEPTED' if accepted else 'REJECTED CANDIDATE')+' / '+p.name,fontsize=15)
fig.savefig(p/'candidate-slices.png',dpi=160)
