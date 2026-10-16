"""Reproducible atlas exports and constrained educational route extraction.

Copies original mesh positions unchanged. Blood centerlines come from closed
mesh cross sections, checked against triangle surfaces. Neural reference paths
are authored from atlas landmarks and cited anatomy; they are NOT atlas nerves.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from scipy.interpolate import PchipInterpolator
import trimesh

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parents[1] / 'human-atlas-audit/ashemag-human-atlas-1c38bf3/public/models'
OUT = ROOT / 'public/models'
DOC = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare_assets', ROOT / 'scripts/prepare_assets.py')
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)
atlas = json.loads((SOURCE / 'atlas.json').read_text(encoding='utf-8'))
parts = {p['id']: p for p in atlas['parts']}
chunks = {i: (SOURCE / Path(c['url']).name).read_bytes() for i, c in enumerate(atlas['chunks'])}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def mesh(part_id):
    p = parts[part_id]
    v = np.frombuffer(chunks[p['chunk']], dtype='<f4', count=p['vertexCount']*3,
                      offset=p['positions']).reshape(-1, 3).astype(float)
    f = np.frombuffer(chunks[p['chunk']], dtype='<u4', count=p['indexCount'],
                      offset=p['indices']).reshape(-1, 3)
    return trimesh.Trimesh(v, f, process=False)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_asset(name, ids, color):
    glb = export.GLB(name, color)
    for part_id in ids:
        glb.part(parts[part_id], chunks[parts[part_id]['chunk']])
    metadata = glb.save(OUT / f'{name}.glb')
    points = [b for node in glb.doc['nodes'] if 'extras' in node for b in node['extras']['bounds']]
    return {'path': f'models/{name}.glb', **metadata, **export.summary(points),
            'sourceIDs': ids, 'parts': [{'id': i, 'name': parts[i]['name']} for i in ids],
            'meshCount': len(ids), 'sourceRepository': 'https://github.com/ashemag/human-atlas',
            'sourceCommit': export.SOURCE_COMMIT, 'license': 'CC BY 4.0',
            'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
            'sourcePositionBytesPreserved': True, 'sharedWorldCoordinates': True}


def inside(point, triangles):
    """Odd ray parity with unique intersection distances, no rtree dependency."""
    direction = np.array([.811, .333, .479]); direction /= np.linalg.norm(direction)
    a, b, c = triangles[:, 0], triangles[:, 1], triangles[:, 2]
    e1, e2 = b-a, c-a
    h = np.cross(np.broadcast_to(direction, e2.shape), e2)
    determinant = np.einsum('ij,ij->i', e1, h)
    safe = abs(determinant) > 1e-13
    inv = np.divide(1., determinant, out=np.zeros_like(determinant), where=safe)
    s = point-a
    u = inv*np.einsum('ij,ij->i', s, h)
    q = np.cross(s, e1)
    v = inv*np.dot(q, direction)
    distance = inv*np.einsum('ij,ij->i', e2, q)
    hits = np.sort(distance[safe & (u >= -1e-8) & (v >= -1e-8) & (u+v <= 1+1e-8) & (distance > 1e-8)])
    return len(hits[np.r_[True, np.diff(hits) > 1e-7]]) % 2 == 1 if len(hits) else False


def clearance(m, points):
    result = []
    for start in range(0, len(points), 20):
        _, distances, _ = trimesh.proximity.closest_point_naive(m, points[start:start+20])
        result.extend(distances)
    return np.asarray(result)


def section_center(m, axis, value, previous=None):
    origin = np.zeros(3); origin[axis] = value
    normal = np.zeros(3); normal[axis] = 1
    cut = m.section(plane_origin=origin, plane_normal=normal)
    if cut is None:
        raise ValueError(f'No closed section at {value}')
    candidates = []
    for path in cut.discrete:
        if np.linalg.norm(path[0]-path[-1]) > 1e-6 or len(path) < 4:
            continue
        midpoint = path[:-1].mean(0)
        if inside(midpoint, m.triangles):
            candidates.append(midpoint)
        else:
            # A tortuous/branching tube can have a concave cross section whose
            # vertex centroid is outside. Search that actual section interior.
            axes = [i for i in range(3) if i != axis]
            interior = []
            for u in np.linspace(path[:,axes[0]].min(),path[:,axes[0]].max(),9)[1:-1]:
                for v in np.linspace(path[:,axes[1]].min(),path[:,axes[1]].max(),9)[1:-1]:
                    p = midpoint.copy(); p[axes] = [u,v]
                    if inside(p,m.triangles): interior.append(p)
            if interior:
                candidates.append(interior[int(np.argmax(clearance(m,np.asarray(interior))))])
    if not candidates:
        raise ValueError(f'No interior cross-section centroid at {value}')
    if previous is None:
        distances = clearance(m, np.asarray(candidates))
        return candidates[int(np.argmax(distances))]
    return min(candidates, key=lambda p: np.linalg.norm(p-previous))


def blood_route(route_id, part_id, axis, start, end, stage, asset):
    m = mesh(part_id)
    count = max(18, int(abs(end-start)/.00045)+1)
    points = []
    for value in np.linspace(start, end, count):
        points.append(section_center(m, axis, value, points[-1] if points else None))
    points = np.asarray(points)
    # Validate the actual linear playback, not a smooth curve that could escape.
    sampled = []
    for a, b in zip(points, points[1:]):
        divisions = max(1, int(np.ceil(np.linalg.norm(b-a)/.00008)))
        sampled.extend(a+(b-a)*t for t in np.linspace(0, 1, divisions, endpoint=False))
    sampled.append(points[-1]); sampled = np.asarray(sampled)
    all_inside = all(inside(p, m.triangles) for p in sampled)
    distances = clearance(m, sampled)
    gap = float(np.linalg.norm(np.diff(sampled, axis=0), axis=1).max())
    continuous_clearance = float(distances.min())-gap/2
    if not all_inside or continuous_clearance <= .00002:
        raise ValueError(f'{route_id}: path left mesh or insufficient clearance; inside={all_inside}, clearance={continuous_clearance}')
    radius = min(.00025, continuous_clearance*.4)
    lengths = np.r_[0., np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    return {'id': route_id, 'type': 'blood', 'provenanceKind': 'atlas-mesh-cross-section-centerline',
            'label': parts[part_id]['name'], 'sourceIDs': [part_id], 'meshAsset': asset,
            'stage': stage, 'direction': 'physiological-blood-flow', 'points': points.tolist(),
            'arcLengthMeters': float(lengths[-1]), 'particleRadiusMeters': radius,
            'display': {'renderNewTube': False, 'preferSourceMeshPulse': True, 'markerIsSignalNotMolecule': True},
            'samplingMethod': 'Closed triangle-mesh cross-section interior centroids; linear playback only.',
            'validation': {'samples': len(sampled), 'allSamplesInsideSourceMesh': all_inside,
                           'minimumSampleClearanceMeters': float(distances.min()),
                           'maximumSampleGapMeters': gap, 'continuousCenterClearanceLowerBoundMeters': continuous_clearance,
                           'particleWallClearanceLowerBoundMeters': continuous_clearance-radius,
                           'meshWatertightAfterVertexMerge': bool(trimesh.Trimesh(m.vertices,m.faces,process=True).is_watertight)},
            'limitations': ['A derived centerline for educational signal highlighting, not measured blood flow.',
                           'Separate vessel routes are never connected by a fabricated tube.']}


def neck_landmark(side, height):
    artery = mesh('FJ3483' if side == 1 else 'FJ3564')
    vein = mesh('FJ3485' if side == 1 else 'FJ3585')
    a = section_center(artery, 1, height)
    v = section_center(vein, 1, height)
    point = (a+v)/2
    point[2] = min(a[2], v[2])-.003
    return point


def neural_route(side):
    """A constrained reference centerline, explicitly not a real nerve mesh."""
    medulla = mesh('FJ1769' if side == 1 else 'FJ1831')
    vertices = medulla.vertices
    candidates = vertices[(vertices[:,1] > 1.558) & (vertices[:,1] < 1.573)]
    root = candidates[np.argmax(candidates[:,0]*side)]
    esophagus = mesh('FJ2563')
    bronchus = mesh('FJ2450' if side == 1 else 'FJ2539')
    anchors = [root, np.array([side*.024,1.535,-.023]), np.array([side*.029,1.495,-.008]),
               neck_landmark(side,1.447), neck_landmark(side,1.429),
               np.array([side*.024,1.404,-.009]),
               np.array([side*(.039 if side==1 else .030),1.381,-.028]),
               np.array([side*.026,1.351,float(bronchus.bounds[0,2]-.004)]),
               np.array([side*.017,1.325,float(bronchus.bounds[0,2]-.004)])]
    if side == 1:
        # Wrap around the left esophageal surface before joining the anterior
        # plexus; a straight posterior-to-anterior chord would cross the lumen.
        for height,direction in [(1.319,np.array([1.,0.,0.])),(1.313,np.array([.7,0.,.7]))]:
            section=esophagus.section(plane_origin=[0,height,0],plane_normal=[0,1,0])
            loop=max(section.discrete,key=len); direction/=np.linalg.norm(direction)
            point=loop[np.argmax(loop@direction)]+direction*.003
            anchors.append(point)
    for height in [1.307,1.285,1.26,1.235,1.208]:
        section = esophagus.section(plane_origin=[0,height,0],plane_normal=[0,1,0])
        loop = max(section.discrete, key=len)
        center = loop[:-1].mean(0)
        center[0] += side*.0015
        # Left-to-anterior and right-to-posterior are conventional trunks;
        # the real esophageal plexus mixes fibers, so no individual axon claim.
        center[2] = float(loop[:,2].max()+.002) if side==1 else float(loop[:,2].min()-.002)
        anchors.append(center)
    stomach = mesh('FJ2564')
    for target in ([.012,1.19,.032],[0.,1.174,.034]) if side==1 else ([.010,1.189,.003],[.007,1.165,.009]):
        # Gastric anterior surface or posterior celiac-region approach. These
        # are illustrative local branches, never a direct strand to intestine.
        point,_,_ = trimesh.proximity.closest_point_naive(stomach,np.asarray([target]))
        p = point[0] if side==1 else np.asarray(target,dtype=float)
        p[2] += .0015 if side==1 else -.002
        anchors.append(p)
    anchors = np.asarray(anchors)
    # Interpolation by height avoids Catmull–Rom loops. Store final samples and
    # use linear playback; no runtime smoothing can create a lateral detour.
    order = np.argsort(anchors[:,1]); asc = anchors[order]
    heights = np.linspace(anchors[0,1], anchors[-1,1], 650)
    points = np.column_stack([PchipInterpolator(asc[:,1],asc[:,0])(heights), heights,
                             PchipInterpolator(asc[:,1],asc[:,2])(heights)])
    obstacles = ['FJ2563','FJ2450','FJ2539','FJ3483','FJ3485','FJ3564','FJ3585']
    # Keep the complete 1 mm-radius reference strand outside lumen/airway
    # meshes. Small outward corrections are a display constraint, not measured
    # nerve coordinates. Preserve the original landmarks for provenance.
    for part_id in obstacles:
        obstacle=mesh(part_id)
        mask=np.all((points>=obstacle.bounds[0]-.006)&(points<=obstacle.bounds[1]+.006),axis=1)
        for index in np.flatnonzero(mask):
            closest,distance,_=trimesh.proximity.closest_point_naive(obstacle,points[index:index+1])
            if distance[0] < .0022:
                direction=points[index]-closest[0]
                direction/=np.linalg.norm(direction)
                if inside(points[index],obstacle.triangles): direction*=-1
                points[index]=closest[0]+direction*.0022
    body = mesh('FJ2810')
    def within_body_envelope(p):
        # Skin FJ2810 is a thin double surface, not a filled body volume: ray
        # parity counts both skin layers. Test the outer closed horizontal
        # contour instead, preserving its actual concave boundary.
        cut = body.section(plane_origin=[0,p[1],0],plane_normal=[0,1,0])
        for path in cut.discrete:
            if np.linalg.norm(path[0]-path[-1]) > 1e-6: continue
            polygon = path[:,[0,2]]; crossings=0
            for a,b in zip(polygon,polygon[1:]):
                if (a[1]>p[2]) != (b[1]>p[2]) and p[0] < (b[0]-a[0])*(p[2]-a[1])/(b[1]-a[1])+a[0]: crossings+=1
            if crossings%2: return True
        return False
    flags = [within_body_envelope(p) for p in points]
    if not all(flags):
        raise ValueError(f'Neural reference path outside parity check: {points[np.logical_not(flags)][::10].tolist()}')
    obstacle_checks=[]
    dense=[]
    for a,b in zip(points,points[1:]):
        count=max(1,int(np.ceil(np.linalg.norm(b-a)/.00015)))
        dense.extend(a+(b-a)*t for t in np.linspace(0,1,count,endpoint=False))
    dense.append(points[-1]); dense=np.asarray(dense)
    maximum_gap=float(np.linalg.norm(np.diff(dense,axis=0),axis=1).max())
    for part_id in obstacles:
        obstacle=mesh(part_id)
        mask=np.all((dense>=obstacle.bounds[0]-.01)&(dense<=obstacle.bounds[1]+.01),axis=1)
        near=dense[mask]
        if not len(near): continue
        all_outside=all(not inside(p,obstacle.triangles) for p in near)
        bound=float(clearance(obstacle,near).min())-maximum_gap/2-.001
        if not all_outside or bound<=0: raise ValueError(f'Neural strand intersects {part_id}: {bound}')
        obstacle_checks.append({'sourceID':part_id,'denseSamplesOutside':all_outside,
                                'minimumFullStrandClearanceBoundMeters':bound})
    return {'id': 'vagus_left_reference' if side==1 else 'vagus_right_reference', 'type': 'nerve',
            'label': '左迷走神经参考路径' if side==1 else '右迷走神经参考路径',
            'provenanceKind': 'anatomically-constrained-reference-not-atlas-nerve', 'sourceIDs': [],
            'landmarkSourceIDs': ['FJ1769' if side==1 else 'FJ1831','FJ3483' if side==1 else 'FJ3564',
                                  'FJ3485' if side==1 else 'FJ3585','FJ2450' if side==1 else 'FJ2539','FJ2563'],
            'stage': 'gut-brain-neural-reference', 'points': points.tolist(),
            'landmarkControlPoints': anchors.tolist(), 'direction': 'afferent-toward-medulla',
            'pointOrder': 'medulla-to-gastric-or-celiac-reference-region', 'radiusMeters': .001,
            'arcLengthMeters': float(np.linalg.norm(np.diff(points,axis=0),axis=1).sum()),
            'display': {'renderNewTube': True, 'tubeIsReferenceNerveNotBloodVessel': True,
                        'labelRequired': '迷走神经路径示意 · 非个体重建', 'signalIsElectricalNotHormoneTransport': True},
            'referenceIDs': ['hammer2018','mediastinal2021'],
            'validation': {'centerSamplesWithinBody': all(flags), 'sampleCount': len(points),
                           'bodyContainmentMethod': 'Actual closed horizontal skin contour containment; double skin shell is not treated as a solid volume.',
                           'maximumAbsoluteLateralDistanceMeters': float(np.abs(points[:,0]).max()),
                           'referenceDiameterMeters': .002,'adjacentMeshChecks':obstacle_checks},
            'limitations': ['The source atlas contains no vagus nerve mesh; these points are not patient anatomy.',
                           'Cervical positions vary; the carotid-sheath reference is not universal.',
                           'Branching, nodose ganglia and microscopic gut terminals are not resolved.',
                           'Distal gastric/celiac branches are landmark references; gut microterminals are unresolved and no direct intestinal shortcut is appended.',
                           'Left/right fibers mix in the esophageal plexus; lines do not trace individual axons.',
                           'Displayed 2 mm diameter is an illustrative millimeter-scale caliber, not a uniform measured diameter.']}


def sources():
    configs = [('hammer2018','PMC5964190','10.1038/s41598-018-26135-8',['carotid','diameter']),
               ('mediastinal2021','PMC10226887','10.21037/med-20-65',['vagus','esophageal']),
               ('glp1review2019','PMC6812410','10.1016/j.molmet.2019.09.010',['systemic circulation'])]
    result=[]
    for key,pmc,doi,terms in configs:
        url=f'https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML'
        raw=urllib.request.urlopen(url,timeout=40).read(); doc=ET.fromstring(raw)
        paragraphs=[' '.join(''.join(p.itertext()).split()) for p in doc.iter('p')]
        selected=list(dict.fromkeys(p for term in terms for p in paragraphs if term in p.lower()))
        result.append({'id':key,'doi':doi,'pmcid':pmc,'url':url,
                       'title':' '.join(''.join(doc.find('.//article-title').itertext()).split()),
                       'retrievedFullTextSHA256':hashlib.sha256(raw).hexdigest(),
                       'evidenceParagraphs':selected[:8]})
    write(DOC/'anatomy-sources.json',result)
    return [{k:v for k,v in item.items() if k!='evidenceParagraphs'} for item in result]


def main():
    configs = [
      ('ileal_tributary','FJ3438',0,-.0325,-.0535,'intestinal-venous-drainage','models/portal_tributaries.glb'),
      ('superior_mesenteric_vein','FJ3647',1,1.017,1.1415,'portal-inflow','models/veins.glb'),
      ('hepatic_portal_vein','FJ1853',1,1.145,1.1865,'portal-inflow','models/veins.glb'),
      ('middle_hepatic_vein','FJ2414',1,1.231,1.239,'hepatic-outflow','models/veins.glb'),
      ('inferior_vena_cava','FJ3441',1,1.243,1.265,'systemic-venous-return','models/veins.glb'),
      ('ascending_aorta','FJ3413',1,1.315,1.357,'systemic-arterial-outflow','models/aorta.glb'),
      ('aortic_arch','FJ3411',2,.030,-.043,'systemic-arterial-outflow','models/aorta.glb'),
      ('descending_aorta','FJ3427',1,1.354,1.165,'systemic-arterial-outflow','models/aorta.glb'),
      ('celiac_trunk','FJ3421',2,.012,.028,'pancreatic-arterial-supply','models/pancreatic_arteries.glb'),
      ('splenic_artery','FJ3640',0,.014,.043,'pancreatic-arterial-supply','models/pancreatic_arteries.glb'),
      ('great_pancreatic_artery','FJ3433',1,1.152,1.1455,'pancreatic-arterial-supply','models/pancreatic_arteries.glb')]
    routes=[]
    for config in configs:
        route=blood_route(*config); routes.append(route)
        print(config[0],len(route['points']),route['validation']['particleWallClearanceLowerBoundMeters'],flush=True)
    routes.extend([neural_route(1),neural_route(-1)])
    brainstem=next(c['elements'] for c in atlas['concepts'] if c['id']=='FMA79876')
    assets={'brainstem':export_asset('brainstem',brainstem,[.78,.7,.63]),
            'pancreatic_arteries':export_asset('pancreatic_arteries',['FJ3421','FJ3640','FJ3433','FJ3430','FJ3444'],[.74,.3,.3]),
            'portal_tributaries':export_asset('portal_tributaries',['FJ3438'],[.3,.52,.63])}
    references=sources()
    result={'schemaVersion':1,'dataset':'BodyParts3D 4.0 reference anatomy plus explicitly authored neural references',
            'coordinates':{'units':'meters','up':'+Y','subjectLeft':'+X','anterior':'+Z','sharedWorldCoordinates':True},
            'sourceRepository':'https://github.com/ashemag/human-atlas','sourceCommit':export.SOURCE_COMMIT,
            'atlasSHA256':sha(SOURCE/'atlas.json'),'atlasVagusMeshAvailable':False,
            'routes':routes,'references':references,
            'circulation':{'sequence':['ileal_tributary','superior_mesenteric_vein','hepatic_portal_vein',
                                       'UNRESOLVED_liver_sinusoids','middle_hepatic_vein','inferior_vena_cava',
                                       'UNRESOLVED_right_heart_pulmonary_circulation_left_heart',
                                       'ascending_aorta','aortic_arch','descending_aorta','celiac_trunk',
                                       'splenic_artery','great_pancreatic_artery','UNRESOLVED_islet_microcirculation'],
                           'interSegmentPolicy':'Hide moving markers between source vessels. Never draw bridging lines/tubes or interpolate unresolved steps.',
                           'hormoneSurvival':'Only a fraction of endogenous active GLP-1 reaches systemic circulation; tracer quantity is not concentration or mass conservation.',
                           'forbiddenShortcut':'No direct intestinal-to-pancreas blood vessel; no hormone particles moving inside nerves.'},
            'displayContract':{'blood':'Highlight existing source mesh with a travelling emissive patch, optionally add <=0.25 mm-radius lumen marker.',
                               'nerve':'Reference nerve diameter 2 mm at world scale, afferent light travelling toward medulla; no centimetre-scale enlargement.',
                               'noWholeBodyOverlayDuringMicro':True,'noPatientSpecificClaim':True}}
    write(OUT/'anatomical-routes.json',result)
    manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
    manifest['assets'].update(assets)
    manifest['routeData']={'path':'models/anatomical-routes.json','sha256':sha(OUT/'anatomical-routes.json'),
                           'bloodRouteCount':len(configs),'referenceNerveRouteCount':2,'atlasVagusMeshAvailable':False}
    write(OUT/'manifest.json',manifest)
    write(DOC/'anatomy-validation.json',{'sourceCommit':export.SOURCE_COMMIT,'assets':assets,
          'routes':[{'id':r['id'],'provenanceKind':r['provenanceKind'],'validation':r['validation']} for r in routes],
          'sourcePositionBytesPreserved':True,'sourceTriangleIndicesPreserved':True,
          'newBloodTubeMeshesCreated':False,'limitations':result['circulation']})
    print('Wrote',len(routes),'routes and',len(assets),'source GLBs',flush=True)


if __name__=='__main__':
    main()
