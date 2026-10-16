"""Plot actual solved arrays, with fixed physical axes and honest model scope."""
from pathlib import Path
import json,numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

OUT=Path(__file__).resolve().parent
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'axes.unicode_minus':False,'font.size':12,'axes.spines.top':False,'axes.spines.right':False,
 'axes.labelcolor':'#284254','text.color':'#284254','xtick.color':'#526473','ytick.color':'#526473','axes.edgecolor':'#c7d0d6','savefig.facecolor':'#f4f5f4','axes.facecolor':'#fafbf9'})
data=np.load(OUT/'dt0.01_mesh0.125.npz');case=json.loads((OUT/'case.json').read_text('utf8'))
t=data['time_s'];z=data['depth_m'];u=data['nodeDisp'];peak=int(np.argmax(u[:,0,0]));zm=(z[:-1]+z[1:])/2
colors=['#356e83','#d57552','#748357'];fig,ax=plt.subplots(2,3,figsize=(18,10),layout='constrained');fig.set_facecolor('#f4f5f4')
fig.suptitle('单桩传力与动力响应｜Zwind / OpenSees 实际计算',fontsize=23,fontweight='bold')
ax[0,0].plot(-data['axialTensionPositive_N'][0].mean(axis=1)/1e6,zm,color=colors[0],lw=2.5)
ax[0,0].set(xlabel='静态轴向压力 / MN',ylabel='桩头以下深度 / m',title='重量逐段传给桩侧，余量抵达桩端');ax[0,0].invert_yaxis()
for layer in case['soilLayers']:
 y=layer['top_m']-case['parameters']['head_depth_below_grade_m']
 if 0<y<52:
  for pane in [ax[0,0],ax[0,1],ax[0,2],ax[1,1]]:pane.axhline(y,color='#c7d0d6',lw=.8,ls=':')
stress=data['sideReactionOnPile_N'][0,:,1]/(np.pi*np.array([s['tributary_m'] for s in case['springs']]))/1000
ax[0,1].plot(stress,z,color=colors[1],lw=2.5);ax[0,1].set(xlabel='桩侧界面剪应力 / kPa',title='这是界面牵引，不是连续土体应力');ax[0,1].invert_yaxis()
for ti,color in zip([peak,int(25/.01),int(29/.01)],colors):ax[0,2].plot(u[ti,:,0]*1000,z,label=f'{t[ti]:.2f} s',lw=2,color=color)
ax[0,2].set(xlabel='桩身侧移 / mm',title='侧移来自梁—土弹簧动力解');ax[0,2].invert_yaxis();ax[0,2].legend(frameon=False)
ax[1,0].plot(t,u[:,0,0]*1000,color=colors[0],lw=2,label='桩头侧移')
ax[1,0].set(xlabel='时间 / s',ylabel='桩头侧移 / mm',title='24 s 卸载后，振动逐步衰减');ax[1,0].axvline(24,color=colors[1],lw=1.3,ls='--')
ax[1,1].plot(data['moment_Nm'][peak].mean(axis=1)/1000,zm,color=colors[1],lw=2.5)
ax[1,1].set(xlabel='截面弯矩 / kN·m',title=f'最大侧移时的桩身弯矩（{t[peak]:.2f} s）');ax[1,1].invert_yaxis()
for key,label,color in [('externalWork_J','输入功',colors[0]),('dissipatedEnergy_J','耗散能',colors[1])]:ax[1,2].plot(t,data[key]/1000,color=color,lw=2,label=label)
ax[1,2].plot(t,(data['strainEnergy_J']+data['kineticEnergy_J']+data['dissipatedEnergy_J'])/1000,color=colors[2],ls='--',lw=1.5,label='应变能 + 动能 + 耗散能')
ax[1,2].set(xlabel='时间 / s',ylabel='增量能量 / kJ',title='离散能量平衡（重力平衡态为零点）');ax[1,2].legend(frameon=False,fontsize=10)
for a in ax.flat:a.grid(alpha=.16)
fig.text(.5,-.018,'独立单桩机制案例；刚度、阻尼、荷载为明确假设；不代表上海中心 947 根群桩的真实沉降或承载力。',ha='center',fontsize=12)
fig.savefig(OUT/'pile-analysis.png',dpi=150,bbox_inches='tight');fig.savefig(OUT/'pile-analysis.svg',bbox_inches='tight')
print('PLOT',OUT/'pile-analysis.png')
