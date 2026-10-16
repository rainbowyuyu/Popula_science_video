import pathlib,re,fitz
p=pathlib.Path('research/structural')
for f in p.glob('*.pdf'):
 if f.name.startswith('su2013'):continue
 print('\nFILE',f.name)
 d=fitz.open(f)
 for i,x in enumerate(d):
  t=x.get_text()
  if any(k in t.lower() for k in ['natural frequenc','table 3','table 4','outrigger','modulus','elastic mod','0.1 hz','0.12']):
   print('PAGE',i+1); print(t[:13000])
