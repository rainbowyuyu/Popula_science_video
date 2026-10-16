"""Create physical-time URANS cases without repurposing SIMPLE iterations as seconds."""
from pathlib import Path
import argparse,shutil,re,json

ap=argparse.ArgumentParser();ap.add_argument('source',type=Path);ap.add_argument('target',type=Path);ap.add_argument('--initial',default='0');ap.add_argument('--ranks',type=int,default=12);a=ap.parse_args()
src=a.source;dst=a.target;dst.mkdir(exist_ok=True)
for sub in ['system','constant']:
    shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
shutil.copytree(src/a.initial,dst/'0',dirs_exist_ok=True)
for f in (dst/'0').iterdir():
    if f.is_file() and (f.name.endswith('Mean') or f.name=='yPlus'): f.unlink()
    if f.is_dir() and f.name=='uniform': shutil.rmtree(f)
header=lambda obj:f'FoamFile\n{{ version 2.0; format ascii; class dictionary; object {obj}; }}\n'
(dst/'system/fvSchemes').write_text(header('fvSchemes')+'''
ddtSchemes { default backward; }
gradSchemes { default cellLimited Gauss linear 1; grad(p) Gauss linear; }
divSchemes
{
 default none;
 div(phi,U) Gauss linearUpwindV grad(U);
 div(phi,k) Gauss upwind;
 div(phi,omega) Gauss upwind;
 div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear limited corrected 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited corrected 0.5; }
wallDist { method meshWave; }
fluxRequired { default no; p; }
''')
(dst/'system/fvSolution').write_text(header('fvSolution')+'''
solvers
{
 p { solver GAMG; tolerance 1e-8; relTol 0.02; smoother GaussSeidel; cacheAgglomeration true; nCellsInCoarsestLevel 30; agglomerator faceAreaPair; mergeLevels 1; }
 pFinal { $p; relTol 0; }
 "(U|k|omega)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.05; }
 "(U|k|omega)Final" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0; }
}
PIMPLE
{
 momentumPredictor yes;
 nOuterCorrectors 2;
 nCorrectors 2;
 nNonOrthogonalCorrectors 1;
 pRefCell 0; pRefValue 0;
}
relaxationFactors { equations { ".*" 1; } }
''')
functions=(src/'system/controlDict').read_text().split('functions',1)[1]
functions=functions.rsplit('}',1)[0]
functions=re.sub(r'writeControl\s+timeStep;\s*writeInterval\s+\d+;', 'writeControl adjustableRunTime; writeInterval 1;', functions)
functions=functions.replace('log true;','log false;')
functions+='''
    forcesBody
    {
        type forces; libs ("libforces.so");
        patches (tower); rho rhoInf; rhoInf 1.225; CofR (0 0 0);
        writeControl adjustableRunTime; writeInterval 1; log false;
    }
    physicalExtrema
    {
        type fieldMinMax; libs ("libfieldFunctionObjects.so");
        fields (k omega U p nut); mode magnitude;
        writeControl adjustableRunTime; writeInterval 1; log false;
    }
    meanFields
    {
        type fieldAverage; libs ("libfieldFunctionObjects.so");
        timeStart 200;
        writeControl writeTime;
        fields
        (
            U { mean on; prime2Mean on; base time; }
            p { mean on; prime2Mean on; base time; }
            k { mean on; prime2Mean off; base time; }
            omega { mean on; prime2Mean off; base time; }
        );
    }
}
'''
(dst/'system/controlDict').write_text(header('controlDict')+'''
application pimpleFoam;
startFrom latestTime; startTime 0;
stopAt endTime; endTime 600;
deltaT 0.05;
adjustTimeStep yes; maxCo 0.8; maxDeltaT 0.25;
writeControl adjustableRunTime; writeInterval 100;
purgeWrite 0; writeFormat binary; writePrecision 12;
writeCompression off; timeFormat general; timePrecision 10;
runTimeModifiable true;
functions
'''+functions)
decomp=(dst/'system/decomposeParDict').read_text()
decomp=re.sub(r'numberOfSubdomains \d+;',f'numberOfSubdomains {a.ranks};',decomp)
divs={12:'3 2 2',24:'4 3 2',48:'4 4 3'}[a.ranks]
decomp=re.sub(r'n\s*\([0-9 ]+\);',f'n ({divs});',decomp)
(dst/'system/decomposeParDict').write_text(decomp)
(dst/'initialization-provenance.json').write_text(json.dumps({'sourceCase':str(src),'sourceCheckpoint':a.initial,'physicalStart_s':0,'sourceCheckpointIsPhysicalTime':False,'scheme':'URANS kOmegaSST; second-order momentum and backward time; bounded upwind turbulence scalar convection','inlet_m_s':30,'initialDevelopment_s':200,'plannedAverage_s':[200,600],'maxCourant':.8,'maxDeltaT_s':.25,'quality':{'acceptedForFilm':False}},indent=2)+'\n')
print(dst)
