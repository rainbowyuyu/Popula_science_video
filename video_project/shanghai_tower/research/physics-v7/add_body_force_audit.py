from pathlib import Path
import sys
for arg in sys.argv[1:]:
 p=Path(arg)/'system/controlDict';s=p.read_text()
 if 'forcesBody' in s:continue
 i=s.rfind('}')
 s=s[:i]+'''
    forcesBody
    {
        type forces; libs ("libforces.so");
        patches (tower); rho rhoInf; rhoInf 1.225; CofR (0 0 0);
        writeControl timeStep; writeInterval 25; log false;
    }
'''+s[i:]
 p.write_text(s)
