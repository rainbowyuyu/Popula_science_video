import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
r=json.load(open('research/revision-v8/person/posed-hand-points.json'))
p=np.array([v['local'] for v in r])
fig,ax=plt.subplots(1,2,figsize=(11,9))
ax[0].scatter(p[:,0]*1000,p[:,1]*1000,c=p[:,2],s=5,cmap='coolwarm');ax[0].set_aspect('equal');ax[0].grid();ax[0].set_xlabel('width mm');ax[0].set_ylabel('wrist to fingers mm')
ax[1].scatter(p[:,2]*1000,p[:,1]*1000,c=p[:,0],s=5,cmap='coolwarm');ax[1].set_aspect('equal');ax[1].grid();ax[1].set_xlabel('dorsal mm');
fig.savefig('research/revision-v8/person/posed-hand-points.png',dpi=170)

