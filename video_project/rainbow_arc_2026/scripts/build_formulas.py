from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BIN = Path('C:/Users/zju/AppData/Local/Programs/MiKTeX/miktex/bin/x64')
WORK = ROOT / 'research/formulas'
WORK.mkdir(parents=True, exist_ok=True)
FORMULAS = {
    'formula-snell': r'n_{\mathrm{air}}\sin i = n_{\mathrm{water}}(\lambda)\sin r',
    'formula-angle': r'\begin{aligned} D_1 &= \pi+2i-4r \\ \theta_1 &= \pi-D_1 \approx 42^\circ \end{aligned}',
}
for name, formula in FORMULAS.items():
    tex = WORK / (name + '.tex')
    tex.write_text(r'\documentclass[border=2pt]{standalone}'+'\n'+r'\usepackage{amsmath,xcolor}'+'\n'+r'\definecolor{ink}{HTML}{193C43}'+'\n'+r'\begin{document}\color{ink}$\displaystyle '+formula+r'$\end{document}', encoding='utf8')
    subprocess.run([str(BIN/'latex.exe'), '-interaction=nonstopmode', '-halt-on-error', tex.name], cwd=WORK, check=True, stdout=subprocess.PIPE)
    subprocess.run([str(BIN/'dvisvgm.exe'), '--no-fonts', '--exact', '-o', str(ROOT/'public/sources'/f'{name}.svg'), name+'.dvi'], cwd=WORK, check=True)
print('Both LaTeX formulas compiled to vector paths.')
