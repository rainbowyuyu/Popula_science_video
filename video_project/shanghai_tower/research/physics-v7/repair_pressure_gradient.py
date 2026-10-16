"""Restore conservative Gauss pressure gradient; preserve all prior diagnostics."""
from pathlib import Path
import re,json,sys,hashlib
for arg in sys.argv[1:]:
 case=Path(arg);p=case/'system/fvSchemes';s=p.read_text()
 if 'grad(p)' in s:raise ValueError('Already configured explicitly: '+str(p))
 (case/'fvSchemes-before-pressure-gradient-fix').write_text(s)
 before=hashlib.sha256(s.encode()).hexdigest()
 s=re.sub(r'(gradSchemes\s*\{)',r'\1\n    grad(p) Gauss linear;\n',s,count=1);p.write_text(s)
 times=re.findall(r'\nTime = ([^\n]+)',(case/'run.log').read_text(errors='replace')) if (case/'run.log').exists() else []
 (case/'pressure-gradient-repair.json').write_text(json.dumps({'change':'Pressure gradient explicitly Gauss linear. Retain limited gradients for velocity/turbulence.','reason':'Native fixed-field Gauss theorem audit found >3.6 MN difference caused by pressure gradient limiter; previous fields unaccepted.','lastLoggedTimeOrIterationBeforeChange':times[-1] if times else None,'beforeSHA256':before,'afterSHA256':hashlib.sha256(s.encode()).hexdigest(),'preChangeFieldAccepted':False,'quality':{'acceptedForFilm':False}},indent=2)+'\n')
 print(case)
