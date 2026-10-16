"""DNA V6 local product modelling: optical cartridge and hollow synthesis head.

The established V3 helper definitions are reused, never the V3 assets/outputs.
All geometry below is original procedural educational geometry, not a claimed
manufacturer CAD reconstruction. SI units; exported GLB is Y-up.
"""
from pathlib import Path
import hashlib, json, math
SOURCE=Path(__file__).with_name('assets_blender_v3.py')
exec(compile(SOURCE.read_text(encoding='utf8').split("new_asset('phone_landscape')")[0],str(SOURCE),'exec'))
OUT=ROOT/'public/3d/v6'; OUT.mkdir(parents=True,exist_ok=True)
M['pearl'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.32
M['graphite'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.39
M['clear'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.075
M['clear'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.22
M['glass'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.12
M['light'].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.2
M['sapphire']=material('MAT_V6_optical_lane_sapphire',(.44,.66,.65),.14,.2,.76,.1)
M['rubber']=material('MAT_V6_fluoroelastomer_seal',(.037,.052,.052),.02,.62)
M['brushed']=material('MAT_V6_brushed_titanium',(.32,.40,.40),.80,.34)

new_asset('sequencing_flowcell')
cube('FLOWCELL_V6_ceramic_carrier',(0,0,.005),(.210,.126,.010),'white',.004)
cube('FLOWCELL_V6_recessed_optical_bed',(0,0,.0107),(.193,.111,.0014),'graphite',.004)
# A real perimeter gasket and thin cover; the ports remain open and readable.
for y in [-.055,.055]:cube('FLOWCELL_V6_gasket_long',(0,y,.0125),(.188,.0012,.0012),'rubber',.00045)
for x in [-.094,.094]:cube('FLOWCELL_V6_gasket_end',(x,0,.0125),(.0012,.110,.0012),'rubber',.00045)
cube('FLOWCELL_V6_optical_lid',(0,0,.0179),(.160,.098,.0016),'clear',.00065)
for lane,y in enumerate([-.033,-.011,.011,.033]):
    # Slightly tapered sample paths open into a broader reaction chamber.
    pts=[(-.087,y,.0137),(-.075,y,.0137),(-.067,y-.0004,.0137),(-.058,y,.0137),(.058,y,.0137),(.071,y+.0004,.0137),(.087,y,.0137)]
    cube(f'FLOWCELL_V6_lane_{lane}_optical_reaction_bed',(0,y,.0122),(.130,.0148,.0012),'sapphire',.004)
    for sign in [-1,1]:
        curve(f'FLOWCELL_V6_lane_{lane}_etched_wall_{sign}',[(x,y+sign*(.0015 if abs(x)>.072 else .0062),.0134) for x in [-.087,-.075,-.061,0,.061,.075,.087]],.0005,'pearl')
    curve(f'FLOWCELL_V6_lane_{lane}_fluid_lumen',pts,.00062,'teal')
    # The reaction spots are microarray-like schematic locations, not claimed
    # commercial flow-cell densities or layout.
    for row in [-1,0,1]:
        for col in range(28):
            cyl(f'FLOWCELL_V6_lane_{lane}_reaction_site_{row}_{col}',(-.052+col*.00386,y+row*.0034,.01313),.00030,.00014,'light' if (col+lane+row)%4 else 'gold',12)
    for x in [-.087,.087]:
        # Hollow machining is explicit, with black optical lumen and sealing lip.
        port=lathe(f'FLOWCELL_V6_lane_{lane}_hollow_port_{x}',[(.0028,.010),(.0042,.010),(.0047,.012),(.0047,.016),(.0042,.017),(.0028,.017),(.0028,.010)],'brushed')
        port.location.x=x;port.location.y=y
        torus(f'FLOWCELL_V6_lane_{lane}_port_seal',(x,y,.0169),.0031,.00032,'gold')
        cyl(f'FLOWCELL_V6_lane_{lane}_dark_bore',(x,y,.0105),.00265,.0003,'dark',48)
for x in [-.098,.098]:
    for y in [-.053,.053]:
        cyl('FLOWCELL_V6_captive_fastener',(x,y,.012),.0020,.0012,'brushed',48)
        cube('FLOWCELL_V6_fastener_slot',(x,y,.01267),(.0023,.00035,.00013),'dark',.0001)
for x in [-.079,.079]:
    cube('FLOWCELL_V6_recess_alignment_mark',(x,.057,.011),(.008,.00055,.0003),'gold',.00014)
for x in [-.082,.082]:
    for y in [-.044,.044]:cube('FLOWCELL_V6_isolation_foot',(x,y,-.0015),(.012,.012,.003),'rubber',.0014)

new_asset('synthesis_nozzle')
lathe('NOZZLE_V6_ceramic_body',[(0,.044),(.010,.044),(.0118,.052),(.0130,.072),(.0153,.092),(.0162,.139),(.0158,.151),(.0130,.161),(0,.161)],'pearl')
# Hollow precision tip, with a continuous bore; no overlapping solid cone.
lathe('NOZZLE_V6_hollow_optical_tip',[(.00175,0),(.0025,.013),(.0049,.031),(.0095,.047),(.0095,.054),(.0078,.054),(.0078,.047),(.0038,.031),(.0015,.013),(.0007,0),(.00175,0)],'glass')
torus('NOZZLE_V6_open_tip_lip',(0,0,.00045),.0012,.00045,'clear')
lathe('NOZZLE_V6_luer_lock_collar',[(.0090,.046),(.0118,.046),(.0124,.049),(.0124,.055),(.0115,.058),(.0090,.058),(.0090,.046)],'brushed')
for z in [.0485,.051,.0535]:torus('NOZZLE_V6_lock_thread',(0,0,z),.0125,.00036,'gold')
lathe('NOZZLE_V6_non_slip_grip',[(.016,.111),(.0173,.111),(.0178,.114),(.0178,.131),(.0173,.134),(.016,.134),(.016,.111)],'rubber')
for n in range(32):
    a=n*math.tau/32
    ridge=cube('NOZZLE_V6_axial_grip_rib',(.01775*math.cos(a),.01775*math.sin(a),.1225),(.0007,.0007,.017),'graphite',.00024)
    ridge.rotation_euler.z=a
for z in [.111,.134]:torus('NOZZLE_V6_grip_metal_trim',(0,0,z),.0169,.0005,'gold')
cyl('NOZZLE_V6_plunger_stem',(0,0,.167),.0039,.014,'brushed')
cyl('NOZZLE_V6_plunger_button',(0,0,.1775),.0106,.0058,'graphite')
torus('NOZZLE_V6_plunger_milled_edge',(0,0,.1805),.0092,.00065,'gold')
cyl('NOZZLE_V6_plunger_inset',(0,0,.181),.0073,.0004,'pearl')
# A calibrated viewing recess and a fluid core make the functional axis legible.
window=cube('NOZZLE_V6_dose_window',(0,-.0155,.091),(.0056,.0007,.020),'dark',.0016)
for i in range(4):cube('NOZZLE_V6_dose_tick',(0,-.01591,.085+i*.0038),(.0023,.0002,.00032),'pearl',.00008)
cyl('NOZZLE_V6_internal_fluid_capillary',(0,0,.027),.0010,.040,'liquid',32)

# Export each asset before arranging a separate contact sheet stage.
# Reaction spots are static. Batch by lane/material to keep browser draw calls
# small while preserving the CAD-level inlet/lid/body component separation.
flowcol=ASSETS['sequencing_flowcell']
for lane in range(4):
    for material_name in ['MAT_ice_indicator','MAT_satin_champagne']:
        candidates=[o for o in flowcol.objects if f'FLOWCELL_V6_lane_{lane}_reaction_site_' in o.name and o.data.materials[0].name==material_name]
        if not candidates:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in candidates:obj.select_set(True)
        bpy.context.view_layer.objects.active=candidates[0]
        bpy.ops.object.convert(target='MESH')
        bpy.ops.object.join()
        bpy.context.object.name=f'FLOWCELL_V6_lane_{lane}_reaction_array_{material_name}'
manifest={'schema':'rainbow.dna.assets/v6','source':'Original local Blender procedural modelling; no downloaded CAD','license':'Original project geometry','representation':'Educational equipment schematic; no manufacturer-specific flow-cell claims','units':'meter','coordinates':'GLB Y-up; Blender Z becomes GLB Y','blenderVersion':bpy.app.version_string,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'helperSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'assets':{}}
for name,col in ASSETS.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:
        o.select_set(True);o['source']='original local Blender DNA V6';o['units']='meter'
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    bpy.context.view_layer.update();pts=[]
    for o in col.objects:
        pts.extend(o.matrix_world@Vector(p) for p in o.bound_box)
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    manifest['assets'][name]={'path':path.name,'sizeMeters':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'objects':len(col.objects),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
(OUT/'assets-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'dna_lab_assets_v6.blend'))
print('V6_ASSETS_COMPLETE '+json.dumps(manifest['assets']))
