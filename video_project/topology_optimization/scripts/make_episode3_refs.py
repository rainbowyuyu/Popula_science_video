from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
R=Path(__file__).resolve().parents[1];O=R/'public/episode3/references'
for name,tex in [('bearing',r'$\bar{\sigma}=\frac{N}{A}$'),('friction',r'$|T|\leq\mu N$')]:
 fig=plt.figure(figsize=(4,1.25),dpi=240);fig.text(.5,.5,tex,color='#293a32',fontsize=36,ha='center',va='center');fig.savefig(O/f'formula-{name}.png',transparent=True,bbox_inches='tight',pad_inches=.12);plt.close(fig)
(O/'formulas.tex').write_text(r"\[\bar{\sigma}=\frac{N}{A}\]"+'\n'+r"\[|T|\leq\mu N\]",encoding='utf8')
