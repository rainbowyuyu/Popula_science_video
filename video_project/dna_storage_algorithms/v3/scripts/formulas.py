from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path(__file__).resolve().parents[1]
out=root/'public'/'formulas';out.mkdir(parents=True,exist_ok=True)
formulae={'gc':r'\mathrm{GC}=\frac{G+C}{L}','xor':r'B=A\oplus(A\oplus B)','consensus':r'\hat b_j=\arg\max_b\sum_i w_i\,\mathbf{1}(r_{ij}=b)'}
for name,formula in formulae.items():
    fig=plt.figure(figsize=(8,1.55),dpi=150);fig.patch.set_alpha(0)
    fig.text(.015,.45,'$'+formula+'$',color='#173e48',fontsize=30 if name=='consensus' else 34,ha='left',va='center')
    fig.savefig(out/(name+'.svg'),transparent=True,bbox_inches='tight',pad_inches=.08);plt.close(fig)
(out/'source.tex').write_text('\n'.join('\\['+f+'\\]' for f in formulae.values()),encoding='utf-8')
(out/'manifest.json').write_text(json.dumps({'sourceFormat':'LaTeX mathematics','renderer':'Matplotlib mathtext SVG paths','formulas':formulae,'interpretation':{'gc':'G,C counts; L sequence length','xor':'bitwise XOR; fixed teaching example','consensus':'illustrative weighted plurality at aligned column j; weights from read quality, not calibrated probability'}},indent=2),encoding='utf-8')
