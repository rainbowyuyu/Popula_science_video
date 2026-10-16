"""Produce tower-only wall-layer hex-dominant meshes using official OpenFOAM."""
from pathlib import Path
import argparse, shutil
from prepare_foam_case import OUT as BASE
HERE=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--level',type=int,default=4);args=ap.parse_args()
OUT=HERE/f'foam-wall-L{args.level}';OUT.mkdir(exist_ok=True)
for name in ['0','system','constant']:
    shutil.copytree(BASE/name,OUT/name,dirs_exist_ok=True)
(OUT/'constant/triSurface').mkdir(exist_ok=True)
shutil.copy2(HERE/'tower-closed.stl',OUT/'constant/triSurface/tower.stl')


def foam(path,text):
    p=OUT/path;p.write_bytes((f'FoamFile\n{{ version 2.0; format ascii; class dictionary; object {p.name}; }}\n'+text+'\n').encode())


foam(Path('system/blockMeshDict'),'''
convertToMeters 1;
vertices
(
    (-3160 -3160 0) (9480 -3160 0) (9480 3160 0) (-3160 3160 0)
    (-3160 -3160 3792) (9480 -3160 3792) (9480 3160 3792) (-3160 3160 3792)
);
blocks (hex (0 1 2 3 4 5 6 7) (80 40 24) simpleGrading (1 1 1));
edges ();
boundary
(
    inlet { type patch; faces ((0 4 7 3)); }
    outlet { type patch; faces ((1 2 6 5)); }
    ground { type symmetry; faces ((0 3 2 1)); }
    ceiling { type symmetry; faces ((4 5 6 7)); }
    sides { type symmetry; faces ((0 1 5 4) (3 7 6 2)); }
);
mergePatchPairs ();
''')
foam(Path('system/snappyHexMeshDict'),'''
castellatedMesh true;
snap true;
addLayers true;
geometry
{
    tower.stl { type triSurfaceMesh; name tower; }
    nearTower { type searchableBox; min (-190 -170 0); max (450 170 750); }
    wake { type searchableBox; min (-190 -300 0); max (2400 300 850); }
}
castellatedMeshControls
{
    maxLocalCells 1500000;
    maxGlobalCells 5000000;
    minRefinementCells 0;
    maxLoadUnbalance 0.1;
    nCellsBetweenLevels 3;
    features ();
    refinementSurfaces { tower { level (SURFACE_LEVEL SURFACE_LEVEL); patchInfo { type wall; } } }
    resolveFeatureAngle 30;
    refinementRegions
    {
        nearTower { mode inside; levels ((1e15 SURFACE_LEVEL)); }
        wake { mode inside; levels ((1e15 2)); }
    }
    locationInMesh (-2000 0 300);
    allowFreeStandingZoneFaces true;
}
snapControls
{
    nSmoothPatch 5; tolerance 2.0; nSolveIter 60; nRelaxIter 8;
    nFeatureSnapIter 15; implicitFeatureSnap true; explicitFeatureSnap false; multiRegionFeatureSnap false;
}
addLayersControls
{
    relativeSizes false;
    layers { tower { nSurfaceLayers 17; } }
    expansionRatio 1.3;
    firstLayerThickness FIRST_THICKNESS;
    minThickness 0.001;
    nGrow 0;
    featureAngle 65;
    nRelaxIter 8;
    nSmoothSurfaceNormals 3;
    nSmoothNormals 5;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter 60;
    nRelaxedIter 30;
}
meshQualityControls
{
    maxNonOrtho 65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave 80;
    minVol 1e-9;
    minTetQuality 1e-14;
    minArea -1;
    minTwist 0.02;
    minDeterminant 1e-9;
    minFaceWeight 0.02;
    minVolRatio 0.01;
    minTriangleTwist -1;
    nSmoothScale 4;
    errorReduction 0.75;
    relaxed { maxNonOrtho 75; }
}
writeFlags (scalarLevels layerSets layerFields);
mergeTolerance 1e-9;
'''.replace('SURFACE_LEVEL',str(args.level)).replace('FIRST_THICKNESS',str(.008/2**(args.level-4))))
print(OUT)
