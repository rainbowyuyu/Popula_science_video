from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'src/Film.tsx'
s=p.read_text(encoding='utf8')
s=s.replace("import {RealSceneIntro} from './RealSceneIntro';", "import {InventoryMark} from './PartsInventory';")
s=s.replace('onPile,onComponent}:{frame:number;', 'onPile,onComponent,onInventory}:{frame:number;onInventory:(x:InventoryMark[])=>void;')
s=s.replace('onMarks(labels);gl.render(scene,camera);','onMarks(labels);onInventory(world.inventory?.marks(camera as T.PerspectiveCamera,cue)??[]);gl.render(scene,camera);')
s=s.replace('onPressure,onSlices,onPile,onComponent]);','onPressure,onSlices,onPile,onComponent,onInventory]);')
s=s.replace('export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){','export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){\n const [inventory,setInventory]=useState<InventoryMark[]>([]);const onInventory=useCallback((x:InventoryMark[])=>setInventory(x),[]);')
s=s.replace('onPile={onPile} onComponent={onComponent}/>','onPile={onPile} onComponent={onComponent} onInventory={onInventory}/>')
s=s.replace('  <RealSceneIntro frame={frame}/>','  {!clean&&<InventoryOverlay marks={inventory}/>}')
p.write_text(s,encoding='utf8')
