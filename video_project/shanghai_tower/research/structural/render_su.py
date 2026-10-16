import fitz,pathlib
p=pathlib.Path('research/structural');d=fitz.open(p/'su2013-monitoring-accepted.pdf')
for n in [6,7,8,9,12,17,24]:
 d[n-1].get_pixmap(matrix=fitz.Matrix(2.5,2.5)).save(p/f'su2013-p{n:02}.png')
print('Rendered pages 6,7,8,9,12,17,24')
