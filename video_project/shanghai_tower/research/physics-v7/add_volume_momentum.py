from pathlib import Path
import sys
for arg in sys.argv[1:]:
 p=Path(arg)/'system/controlDict';s=p.read_text()
 if 'volumeMomentum' in s:continue
 i=s.rfind('}')
 s=s[:i]+'''
    volumeMomentum
    {
        type volFieldValue; libs ("libfieldFunctionObjects.so");
        regionType all; operation volIntegrate; fields (U);
        writeFields false; writeControl adjustableRunTime; writeInterval 1; log false;
    }
'''+s[i:]
 p.write_text(s)
