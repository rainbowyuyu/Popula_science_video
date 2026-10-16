"""Bind restricted educational acceptance to the final solved native field.

This is not an engineering-convergence certificate. Independent review and the
root task explicitly approved only the large-scale qualitative film use.
"""
from pathlib import Path
import json,hashlib,numpy as np
R=Path(__file__).resolve().parent;F=R/'foam-fine-final';C=R/'foam-coarse-final'
def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=sha(F/'internal.vtu');assert source==read(F/'checkpoint-provenance.json')['nativeVolumeSHA256']
integrity=read(F/'export-integrity-audit.json');geometry=read(F/'geometry-audit.json');native=read(F/'native-field-summary.json')
assert integrity['exportIntegrityPassed'] and geometry['geometryRegistrationPassed']
assert all(d['finite'] for d in native['nativeCellFieldRanges'].values())
assert all(native['nativeCellFieldRanges'][n]['min']>0 for n in ['k','omega','nut'])
pressure=read(F/'computed-pressure.json');slices=read(F/'computed-flow-slices.json')
assert min(pressure['cp'])>=-3 and max(pressure['cp'])<=1.25
assert max(v for s in slices['slices'] for v in s['speed_m_s'] if v is not None)<=50
scope='Qualitative film visualization only: broad flow deflection, side acceleration, downstream lower-speed region and relative mean pressure sign on an idealized isolated reconstruction.'
limitations=[
 'Normalized residuals did not all reach the original 1e-6 target. This target is explicitly not passed; finite-iteration approximate RANS fields are retained only for the independently reviewed qualitative scope.',
 'Two-resolution sensitivity is not grid independence or a calibrated absolute error bar. Exact wake-core length/area and local pressure peaks are not accepted.',
 'Uniform 30 m/s inlet, 5% turbulence intensity, slip ground, isolated smooth educational reconstruction and simplified closed crown; no atmospheric boundary layer, surrounding city or as-built openings.',
 'Streamline travel-time animation explains paths through a stationary modeled mean velocity field; it is not a resolved transient-vortex simulation.',
 'Structural demonstration uses independent prescribed educational forces; CFD-to-structure coupling and engineering design are not accepted.',
 '2.5 m display sampling interpolates native finite-volume cells and is not 2.5 m CFD mesh resolution; invalid and solid positions are masked without filling.',
 'Surface Cp uses native point interpolation for display; raw native cell extrema are retained separately. Values are not clipped to manufacture a result.',
 'Fine mesh has thin-wall-cell determinant/low-interpolation-weight advisories and 15 faces above 70-degree nonorthogonality; all volumes/face tetrahedra are positive, no unclassified boundary holes.',
]
quality={'acceptedForFilm':True,'acceptedForEngineeringDesign':False,'acceptedForCoupling':False,'acceptedForQuantitativeLocalPressure':False,'acceptedForResolvedTransientVortices':False,'strictResidualTargetPassed':False,'strictResidualTarget':1e-6,'gridIndependent':False,'acceptanceScope':scope,'displayCaption':'\u7406\u60f3\u5316\u5e73\u5747\u6d41\u573a','notes':'Accepted for the explicitly restricted qualitative film scope after native conservation, same-location sensitivity, export/geometry and independent topology review; not claimed converged or engineering-validated.','limitations':limitations}
review=R.parent.parent/'qa/v7-cfd-qualitative-scope-review.md'
if not review.exists():review=R.parent/'qa/v7-cfd-qualitative-scope-review.md'
assert review.exists()
report={'schema':'rainbow.educational-cfd-acceptance/1','sourceSHA256':source,'nativeSIMPLEIteration':2050,'foamToVTKTimeIndex':2205,'coarseNativeSIMPLEIteration':7083,'quality':quality,
 'solver':{'name':'Official OpenFOAM v1912 simpleFoam, incompressible kOmegaSST RANS','binarySHA256':'4925f14e60e59c6b6e82fe4c8bfa57987f3e076809c4cff82fcd079d52b7108e','velocity_m_s':30,'rho_kg_m3':1.225,'dynamicViscosity_Pa_s':1.81e-5,'momentumConvection':'bounded Gauss linearUpwindV grad(U)','pressureGradient':'Gauss linear, explicitly un-limited','turbulenceScalarConvection':'bounded Gauss upwind','wallFunction':'Native OpenFOAM kOmegaSST wall functions; y+ statistics retained'},
 'nativeFiles':{str(p.relative_to(R)):sha(p) for p in [F/'internal.vtu',F/'boundary/tower.vtp',F/'boundary/inlet.vtp',C/'internal.vtu',C/'boundary/tower.vtp']},
 'configurationSHA256':{p.name:sha(p) for p in (F/'system').iterdir() if p.is_file()},
 'mesh':{'fineCells':1243872,'coarseCells':589972,'fineSourceMeshSHA256':sha(R/'tower-only-prism-L9/tower.msh'),'coarseSourceMeshSHA256':sha(R/'tower-only-prism-L12-v2/tower.msh'),'fineCheckMeshSHA256':sha(F/'checkMesh.log'),'strictCheckMeshAllPassed':False,'advisoriesDisclosed':True},
 'nativeFieldSummary':native,'geometryRegistration':geometry,'exportIntegrity':integrity,
 'finalNativeConservation':{'fine':read(F/'integral-audit.json'),'coarse':read(C/'integral-audit.json')},
 'finiteIterationSensitivity':{'fine':read(R/'fine-final-iteration-sensitivity.json'),'coarse':read(R/'coarse-final-iteration-sensitivity.json')},
 'sameLocationMeshSensitivity':read(R/'coarse-fine-final-sensitivity.json'),
 'residualAndForceMonitors':{'fine':read(F/'monitor.json'),'coarse':read(C/'monitor.json')},
 'supportingPhysicalTimeURANS':{'exportedAsFilmField':False,'purpose':'Independent short-window pressure-gradient/conservation and time-step check only; no completed long-time average is claimed.','dt0_1':read(R/'pressure-gradient-audit/urans-dt0.1-window-80-86.json'),'dt0_05':read(R/'pressure-gradient-audit/urans-dt0.05-window-80-86.json'),'integrationNote':'Boundary/volume monitors sampled at 1 s; 80/86 endpoints linearly interpolated within actual logged intervals; no higher precision claim.'},
 'independentQualitativeReview':{'path':str(review),'SHA256':sha(review),'rootAcceptedScope':True},
 'displayRanges':{'speed_m_s':[0,50],'Cp':[-3,1.25],'pointCpActualRange':[min(pressure['cp']),max(pressure['cp'])],'maxDisplayedSpeed_m_s':max(v for s in slices['slices'] for v in s['speed_m_s'] if v is not None)},
 'narrationReview':{'source':'research/cfd-narration-draft.json','s029':'Mean pressure sign and broad relative pattern supported.','s030':'At100/300/500m, native field supports side deflection and lower-speed wake; no exact wake dimensions are narrated.','s031':'Vertical native slice supports crown bypass and lower-speed downstream region.','s032':'120-degree design choice is literature context, not inferred from single CFD case. Subsequent structural loading explicitly independent.','quantitativePressureWakeOrCouplingClaims':False}}
(R/'final-educational-cfd-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf8')
md=f'''# 上海中心流场：限定科普用途验收

采用真实 OpenFOAM 三维有限体积计算，最终展示源为细网格原生 SIMPLE Time **2050**（foamToVTK 索引 **2205**），1,243,872 单元。对照粗网格原生迭代 7083，589,972 单元。三份展示数据均从同一个最终原生体场导出。

**可用于影片中的宏观平均绕流、侧向加速、背风低速区与相对平均压力符号展示。不能称为网格无关、严格收敛或工程验证；不能用于精确尾流尺寸、局部压力峰值或结构耦合。** 归一残差 1e-6 目标未全部达到，记录为未通过，并未修改目标冒充收敛。独立定性复核和最终同位置敏感性共同支持此限定用途。

- 最终细网格全域质量相对余量：{report['finalNativeConservation']['fine']['results'][-1]['relativeMassImbalance']:.3g}；含原生表面力与边界动量通量的稳态动量余量：{report['finalNativeConservation']['fine']['results'][-1]['steadyMomentumImbalanceRelativeBodyForce']*100:.3f}%。
- 粗网格对应动量余量：{report['finalNativeConservation']['coarse']['results'][-1]['steadyMomentumImbalanceRelativeBodyForce']*100:.3f}%。
- 最终粗细网格在 100/300/500 m 同位置速度模 RMS 差：4.389% / 3.056% / 2.577% 来流速度；表面 Cp RMS 差 0.137。不是绝对误差标定。
- 细网格最后两检查点速度模 RMS 变化：1.386% / 0.138% / 0.983%；Cp RMS 变化 0.0222。残余迭代变化仍存在。
- 细网格 y+：99.16% 表面积在 30–300，0.84% 在 5–30，0% 低于 5。保留薄壁层网格质量提示及原生单元极值。
- 修正压力梯度后，独立物理时间 URANS 的 80–86 s 同窗动量闭合误差为 0.0058% / 0.0073%（时间步上限 0.1 / 0.05 s）；两步长平均轴向力差约 0.086%。这是支持性短窗检查，不是影片时间平均场来源。
- 21 条流线按原生速度积分；所有显示切片为 2.5 m 采样，保留真实固体/无效点掩码。逐段穿楼检查与当前 GLB 表皮空间注册通过。

固定展示色尺：速度 0–50 m/s，Cp −3–1.25，覆盖最终所有导出值，未裁剪数值。实际 Cp 点值范围为 −2.6382–0.9921，最大切片速度 48.425 m/s。

空气采用 30 m/s 均匀来流、ρ=1.225 kg/m³、μ=1.81e-5 Pa·s；地面滑移，建筑为孤立重建外形及简化封闭顶部。该算例不含上海真实大气边界层、周边城市与实际开口。轨迹动画表示稳态模型平均路径，不能解释为瞬态涡旋。

原生体场 SHA256：`{source}`。完整输入/软件/输出哈希、有限迭代和网格敏感性、原生守恒及独立复核绑定在 `final-educational-cfd-acceptance.json`。SIMPLE Time 为数值迭代标签，不是物理秒；VTK 索引另列，避免混淆。
'''
(R/'final-educational-cfd-acceptance.md').write_text(md,encoding='utf8')
print(json.dumps({'acceptedForFilm':True,'engineeringDesign':False,'coupling':False,'sourceSHA256':source,'nativeTime':2050,'report':str(R/'final-educational-cfd-acceptance.json')},ensure_ascii=False))
