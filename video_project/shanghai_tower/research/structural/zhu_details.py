import fitz,pathlib
p=pathlib.Path('research/structural');d=fitz.open(p/'zhu2012-http.pdf')
for n in [6,9,10,11,12]:
 print('PAGE',n,'\n',d[n-1].get_text());d[n-1].get_pixmap(matrix=fitz.Matrix(2.5,2.5)).save(p/f'zhu2012-p{n:02}.png')
