"""Write an isolated OpenFOAM k-omega SST case in SI metres / seconds.

These are defined uniform-inlet educational conditions, not Shanghai code wind.
The native mesh is shared with the SU2 route for solver comparison.
"""
from pathlib import Path
import json, math
HERE=Path(__file__).resolve().parent
OUT=HERE/'foam-prism-coarse'


def foam(path,cls,text):
    p=OUT/path;p.parent.mkdir(parents=True,exist_ok=True)
    header=f'FoamFile\n{{ version 2.0; format ascii; class {cls}; object {p.name}; }}\n'
    p.write_bytes((header+text+'\n').encode())


foam(Path('system/controlDict'),'dictionary','''
application simpleFoam;
startFrom latestTime;
startTime 0;
stopAt endTime;
endTime 4000;
deltaT 1;
writeControl timeStep;
writeInterval 250;
purgeWrite 3;
writeFormat binary;
writePrecision 12;
writeCompression off;
timeFormat general;
timePrecision 10;
runTimeModifiable true;
functions
{
    forceCoefficients
    {
        type forceCoeffs;
        libs ("libforces.so");
        writeControl timeStep; writeInterval 1;
        patches (tower);
        rho rhoInf; rhoInf 1.225;
        liftDir (0 1 0); dragDir (1 0 0); pitchAxis (0 0 1);
        CofR (0 0 0);
        magUInf 30; lRef 632; Aref 61936;
    }
    wallYPlus
    {
        type yPlus; libs ("libfieldFunctionObjects.so");
        writeControl writeTime;
        log true;
    }
}
''')
foam(Path('system/fvSchemes'),'dictionary','''
ddtSchemes { default steadyState; }
gradSchemes { default cellLimited Gauss linear 1; }
divSchemes
{
    default none;
    div(phi,U) bounded Gauss upwind;
    div(phi,k) bounded Gauss upwind;
    div(phi,omega) bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear limited 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited 0.5; }
wallDist { method meshWave; }
''')
foam(Path('system/fvSolution'),'dictionary','''
solvers
{
    p
    {
        solver GAMG; tolerance 1e-9; relTol 0.02;
        smoother DICGaussSeidel; cacheAgglomeration true;
        nCellsInCoarsestLevel 20; agglomerator faceAreaPair; mergeLevels 1;
    }
    "(U|k|omega)"
    {
        solver smoothSolver; smoother symGaussSeidel;
        tolerance 1e-10; relTol 0.02;
    }
}
SIMPLE
{
    nNonOrthogonalCorrectors 2;
    consistent yes;
    residualControl { p 1e-6; U 1e-6; k 1e-6; omega 1e-6; }
}
relaxationFactors
{
    fields { p 0.25; }
    equations { U 0.6; k 0.6; omega 0.6; }
}
''')
foam(Path('system/decomposeParDict'),'dictionary','''
numberOfSubdomains 12;
method scotch;
distributed no;
roots ();
''')
foam(Path('constant/transportProperties'),'dictionary','''
transportModel Newtonian;
nu [0 2 -1 0 0 0 0] 1.4775510204081633e-5;
''')
foam(Path('constant/turbulenceProperties'),'dictionary','''
simulationType RAS;
RAS { RASModel kOmegaSST; turbulence on; printCoeffs on; }
''')
shared='''
    ground { type symmetry; }
    sides { type symmetry; }
    ceiling { type symmetry; }
'''
foam(Path('0/U'),'volVectorField','''
dimensions [0 1 -1 0 0 0 0];
internalField uniform (30 0 0);
boundaryField
{
    inlet { type fixedValue; value uniform (30 0 0); }
    outlet { type inletOutlet; inletValue uniform (30 0 0); value uniform (30 0 0); }
    tower { type noSlip; }
'''+shared+'}\n')
foam(Path('0/p'),'volScalarField','''
dimensions [0 2 -2 0 0 0 0];
internalField uniform 0;
boundaryField
{
    inlet { type zeroGradient; }
    outlet { type fixedValue; value uniform 0; }
    tower { type zeroGradient; }
'''+shared+'}\n')
foam(Path('0/k'),'volScalarField','''
dimensions [0 2 -2 0 0 0 0];
internalField uniform 3.375;
boundaryField
{
    inlet { type fixedValue; value uniform 3.375; }
    outlet { type inletOutlet; inletValue uniform 3.375; value uniform 3.375; }
    tower { type kqRWallFunction; value uniform 3.375; }
'''+shared+'}\n')
omega=3.375/(300000.*1.81e-5/1.225)
foam(Path('0/omega'),'volScalarField',f'''
dimensions [0 0 -1 0 0 0 0];
internalField uniform {omega};
boundaryField
{{
    inlet {{ type fixedValue; value uniform {omega}; }}
    outlet {{ type inletOutlet; inletValue uniform {omega}; value uniform {omega}; }}
    tower {{ type omegaWallFunction; value uniform {omega}; }}
'''+shared+'}\n')
nut=300000.*1.81e-5/1.225
foam(Path('0/nut'),'volScalarField',f'''
dimensions [0 2 -1 0 0 0 0];
internalField uniform {nut};
boundaryField
{{
    inlet {{ type calculated; value uniform {nut}; }}
    outlet {{ type calculated; value uniform {nut}; }}
    tower {{ type nutkWallFunction; value uniform 0; }}
'''+shared+'}\n')
(OUT/'input-manifest.json').write_text(json.dumps({'solver':'OpenFOAM v1912 simpleFoam, kOmegaSST','referenceVelocity_m_s':30,'referenceDensity_kg_m3':1.225,'dynamicViscosity_Pa_s':1.81e-5,'inletTurbulenceIntensity':.05,'inletTurbulentViscosityRatio':300000,'inletK_m2_s2':3.375,'inletOmega_s-1':omega,'ground':'slip symmetry','geometry':'same reconstructed isolated tower as SU2 wallfn-coarse','schemeStage':'first-order stabilization only; not final film field','acceptedForFilm':False},indent=2))
print(OUT)
