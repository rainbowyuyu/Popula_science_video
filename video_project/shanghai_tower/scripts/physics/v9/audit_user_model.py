"""Read-only static identity audit. Never sources Tcl or loads downloaded DLLs."""
from pathlib import Path
from datetime import datetime,timezone
from collections import Counter
import hashlib,json,re,zipfile

ROOT=Path(__file__).resolve().parents[3]
TARGET=Path('C:/Users/zju/Downloads/Model1/Model1')
ARCHIVE=ROOT/'research/physics-v8/recompute/discovery/lu-megatall-benchmark.zip'
OUT=ROOT/'research/physics-v9/local-model-audit'
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
    OUT.mkdir(parents=True,exist_ok=True);rows=[];nodes={};types=Counter();tags=[];levels=set();materials=Counter();diaphragms=[]
    with zipfile.ZipFile(ARCHIVE) as archive:
        for path in sorted(TARGET.iterdir()):
            if not path.is_file():continue
            data=path.read_bytes();name='OpenSees_Model/Model1/'+path.name
            same=name in archive.namelist() and data==archive.read(name)
            rows.append(dict(name=path.name,bytes=len(data),sha256=sha(data),matchesAuthorBenchmarkModel1ByteForByte=same))
            if path.suffix.lower()!='.tcl':continue
            text=data.decode('utf-8-sig')
            for line in text.splitlines():
                words=line.strip().rstrip(';').split()
                if not words or words[0].startswith('#'):continue
                if words[0]=='node':
                    tag=int(words[1]);xyz=list(map(float,words[2:5]));assert tag not in nodes
                    nodes[tag]=xyz;levels.add(xyz[2])
                elif words[0]=='element':types[words[1]]+=1;tags.append(int(words[2]))
                elif words[0] in ['uniaxialMaterial','nDMaterial']:materials[words[1]]+=1
                elif words[0]=='rigidDiaphragm':diaphragms.append(dict(axis=int(words[1]),retained=int(words[2]),constrained=len(words)-3))
    assert len(tags)==len(set(tags))
    bounds=[[min(v[i] for v in nodes.values()),max(v[i] for v in nodes.values())] for i in range(3)]
    story_ids=[]
    for line in (TARGET/'dynamiccpu.tcl').read_text('utf-8-sig').splitlines():
        if line.startswith('recorder Node -file storyx.txt'):
            story_ids=list(map(int,line.split('-node',1)[1].split('-dof',1)[0].split()))
    report=dict(recordedAtUTC=datetime.now(timezone.utc).isoformat(),inputDirectory=str(TARGET),readOnly=True,
        tclExecuted=False,downloadedBinaryExecuted=False,files=rows,allTenFilesByteIdenticalToAuthor606mBenchmark=all(r['matchesAuthorBenchmarkModel1ByteForByte'] for r in rows) and len(rows)==10,
        referenceArchive=str(ARCHIVE),referenceArchiveSHA256=sha(ARCHIVE.read_bytes()),
        nodeCount=len(nodes),elementCount=len(tags),elementTypes=dict(types),materialTypes=dict(materials),
        coordinateBounds_m=dict(x=bounds[0],y=bounds[1],z=bounds[2]),coordinateSystem='Original OpenSees Z-up',
        totalHeight_m=bounds[2][1]-bounds[2][0],distinctMeshZLevels=len(levels),rigidDiaphragmCount=len(diaphragms),
        storyRecorderNodeCount=len(story_ids),storyRecorderElevations_m=[nodes[i][2] for i in story_ids],
        sourceIdentity='Tian/Xie/Lu OpenSees Mega-tall Building Benchmark Model1, 606 m, 27220 nodes',
        isShanghaiTowerOriginalInput=False,
        shanghaiReference=dict(source='Lu et al. 2015 paper and author slides',height_m=632,nodeCount=53006,fiberBeamElements=48774,shellElements=39315),
        conclusion='This user-provided directory is byte-for-byte the previously audited 606 m benchmark Model1; it is not the 632 m Shanghai Tower original input. Do not copy or compute it under a Shanghai Tower identity.')
    (OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf-8')
    lines=['# 用户本地 Model1 身份核验','',f'只读检查：`{TARGET}`。未执行 Tcl 或 DLL。','',
      '**结论：不是上海中心原始模型。目录内 10 个文件与作者公开的 606 m Mega-tall Building Benchmark Model1 逐字节完全一致。**','',
      f'- 节点：{len(nodes):,}；单元：{len(tags):,}，其中 '+', '.join(f'{k} {v:,}' for k,v in types.items())+'。',
      f'- 原模型为 Z 轴向上，Z 范围 {bounds[2][0]}–{bounds[2][1]} m，总高 {bounds[2][1]-bounds[2][0]} m。',
      f'- {len(diaphragms)} 组刚性楼板；{len(story_ids)} 个 storyx 记录节点；{len(levels)} 个有限元网格标高。网格标高数量不冒称建筑楼层数。',
      '- 入口为 dynamiccpu.tcl / dynamicgpu.tcl，定义重力和 El Centro 地震时程；本目录不带说明文档。',
      '- 上海中心原作者模型文献规模是 632 m、53,006 节点、48,774 纤维梁与39,315 壳；本目录与其不符。',
      '- 依据用户“是上海中心才复制并计算”的条件，本目录保持原地只读，没有复制为上海中心，也没有计算该基准。','',
      '精确文件SHA256、节点/单元统计、参考ZIP哈希见 `audit.json`。官方来源：',
      'https://opensees.berkeley.edu/wiki/index.php?title=Mega-Tall_Building_Benchmark_Models','',
      '原作者下载包：http://www.thu-civil.net/download/OpenSees-Mega-tall-Building.zip']
    (OUT/'README.md').write_text('\n'.join(lines)+'\n','utf-8')
    print(json.dumps({k:report[k] for k in ['nodeCount','elementCount','elementTypes','coordinateBounds_m','totalHeight_m','rigidDiaphragmCount','storyRecorderNodeCount','allTenFilesByteIdenticalToAuthor606mBenchmark','isShanghaiTowerOriginalInput']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
