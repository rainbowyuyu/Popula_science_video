from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib import rcParams
rcParams['mathtext.fontset']='stix'; rcParams['font.family']='STIXGeneral'
out=Path('public/episode2/formula-rainbow.png');fig=plt.figure(figsize=(8,1.8),dpi=180);fig.patch.set_alpha(0);ax=fig.add_axes([0,0,1,1]);ax.axis('off');ax.text(0.02,.65,r'$D(i)=\pi+2i-4r$',fontsize=40,color='#193643');ax.text(.02,.16,r'$n(\lambda)\sin i=\sin r$',fontsize=26,color='#087f85');fig.savefig(out,transparent=True,bbox_inches='tight',pad_inches=.08);plt.close(fig);print(out)
