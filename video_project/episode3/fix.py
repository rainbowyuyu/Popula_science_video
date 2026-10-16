from pathlib import Path
p=Path('assembly_episode3.py');s=p.read_text(encoding='utf8',errors='ignore');lines=s.splitlines();lines[-1]="bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'joinery_pavilion_assembly.blend'))";p.write_text('\n'.join(lines)+'\n',encoding='utf8')
