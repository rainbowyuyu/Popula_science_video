import fitz,pathlib
p=pathlib.Path('research/structural')
for fn, pages in [('wu2021-typhoons',[3,4,9,10,11,16,17]),('ou2013-fe',[1,2,3]),('zhang2016-bayesian',[2,3,4,5])]:
 d=fitz.open(p/(fn+'.pdf'))
 for n in pages:
  print('\nFILE',fn,'PAGE',n,'\n',d[n-1].get_text())
