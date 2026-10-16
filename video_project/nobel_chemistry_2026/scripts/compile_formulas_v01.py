"""Compile the film's chemistry equations to self-contained LaTeX SVG paths."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'research/latex-build-v01'
OUTPUT = ROOT / 'public/formulas'
FORMULAS = [
    {'id': 'ee', 'tex': r'\mathrm{ee}=\frac{\lvert n_R-n_S\rvert}{n_R+n_S}\times100\%',
     'meaning': 'Absolute enantiomeric excess; n_R and n_S are amounts of the two enantiomers.'},
    {'id': 'ee-75-25', 'tex': r'75\%-25\%=50\%\ \mathrm{ee}',
     'meaning': '75 percent R plus 25 percent S corresponds to 50 percent ee.'},
    {'id': 'ee-90-10', 'tex': r'90\%-10\%=80\%\ \mathrm{ee}',
     'meaning': '90 percent R plus 10 percent S corresponds to 80 percent ee.'},
    {'id': 'ee-examples', 'tex': r'\begin{aligned}75\%-25\%&=50\%\ \mathrm{ee}\\[5pt]90\%-10\%&=80\%\ \mathrm{ee}\end{aligned}',
     'meaning': 'Two composition examples, not a claim that every catalytic system has this amplification.'},
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    executables = {name: shutil.which(name) for name in ('latex', 'dvisvgm')}
    if not all(executables.values()):
        raise RuntimeError(f'Missing TeX programs: {executables}')
    compiled = []
    for item in FORMULAS:
        key = item['id']
        source = WORK / f'{key}.tex'
        source.write_text(r'\documentclass{article}\usepackage{amsmath,amssymb,xcolor}\pagestyle{empty}\begin{document}\noindent{\color[HTML]{EDF7F5}$\displaystyle ' + item['tex'] + r'$}\end{document}', encoding='utf-8')
        target = OUTPUT / f'{key}.svg'
        commands = [
            [executables['latex'], '--disable-installer', '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', f'-output-directory={WORK}', str(source)],
            [executables['dvisvgm'], '--no-fonts', '--exact', '--bbox=min', f'--output={target}', str(source.with_suffix('.dvi'))],
        ]
        for index, command in enumerate(commands):
            process = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
            (WORK / f'{key}-{index}.log').write_text(process.stdout + '\n' + process.stderr, encoding='utf-8')
            if process.returncode:
                raise RuntimeError(f'LaTeX formula {key}, step {index} failed; inspect research/latex-build-v01 logs')
        svg = target.read_text(encoding='utf-8')
        root = ET.fromstring(svg)
        box = list(map(float, root.attrib['viewBox'].split()))
        if min(box[2:]) <= 0 or re.search(r'<(?:text|image|script|foreignObject)\b', svg):
            raise RuntimeError(f'Formula {key} is not a valid path-only SVG')
        compiled.append({**item, 'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': sha(source),
                         'file': target.relative_to(ROOT).as_posix(), 'sha256': sha(target), 'viewBox': box, 'compiled': True})
        print(f'LATEX {key}', flush=True)
    report = {'version': 'chemistry-v01', 'engine': executables, 'allCompiled': True,
              'checks': {'pathOnlySVG': True, 'positiveViewBox': True, 'exampleArithmetic': (75-25 == 50 and 90-10 == 80)},
              'formulas': compiled}
    (ROOT / 'docs/v01/latex-validation-v01.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
