import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path('C:/Users/zju/Videos/rainbow-marine-ep01-v8/release/qa-final-review')
p=out/'waterline-motion-review.json';r=json.loads(p.read_text(encoding='utf8'))
notes={
'entry-1':'实际查看424–432连续帧。导管架、塔筒与水纹沿同一方向连续投影；428开始水线经过镜头，429后转为水下吸收。428可见薄带状界面。没有观察到回退或模型瞬移，但界面折射/吸收变化集中于1–2帧，不能称完全无痕。',
'exit-1':'实际查看707–715连续帧。水线向下离开视野，710–712逐渐露出同一浮式风机；浮筒和水纹位置持续变化。高变化来自出水的光学/遮挡状态变化，未观察到时间回退或结构瞬移。',
'entry-2':'实际查看8422–8430连续帧。岸线连续被水面遮挡，8425为近水线，8426进入水下并继续前行。没有重复上一景或对象瞬移；出入介质的颜色/折射变化较集中。',
'exit-2':'实际查看9067–9075连续帧。水下海缆沿视角连续移动，9071露出相同岸线和建筑，9072后水面反射连续恢复。9071存在薄带状光学界面；高变化与出水一致，没有观察到回退。',
'browser-drop-check':'实际查看7343–7348连续六帧。塔筒、远岸和升压站逐步移动，水纹持续变化；解码PTS对应244.766667–244.933333秒，按1/30秒连续。六帧主体图像SHA各不相同，无缺号、无精确重复或回返。该文件检查不撤销浏览器曾掉2帧的事实。'
}
for g in r['groups']:
 g['visualReviewed']=True;g['visualReviewMethod']='Opened the complete consecutive-frame contactsheet in the image viewer.';g['visualConclusion']=notes[g['group']]
 g['reviewOutcome']='consistent-water-surface-crossing-with-visible-optical-boundary' if g['group']!='browser-drop-check' else 'encoded-frames-continuous-browser-drop-record-retained'
r['reviewSummary']={'reviewedDecodedFrames':42,'allContactSheetsOpened':True,'observedTemporalRegression':False,'observedObjectTeleportation':False,'waterlineBoundaryVisible':True,'waterlineBoundaryNote':'Native refraction/absorption changes are concentrated in 1–2 frames at the medium boundary. Thin interface bands remain visible at 428 and 9071. This review does not certify an imperceptible transition.','browserIntervalEncodedFramesPresent':True,'browserIntervalNoExactDuplicates':True,'browserDroppedFrameRecordRetained':True,'normalSpeedFullPlaybackClaimed':False}
# Four representative frames from each crossing, preserving chronological order.
board=Image.new('RGB',(1920,1200),'#e6eeef');draw=ImageDraw.Draw(board);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
for y,g in enumerate(r['groups'][:4]):
 for x,idx in enumerate([0,3,4,8]):
  f=g['frames'][idx];im=Image.open(f['file']).convert('RGB').resize((480,270));board.paste(im,(x*480,y*300));draw.text((x*480+10,y*300+274),f"{g['group']} | {f['frame']} | {f['expectedSeconds']:.4f}s",font=font,fill='#173c4b')
sheet=out/'waterline-motion-review.jpg';board.save(sheet,quality=95);r['overviewContactsheet']=str(sheet)
p.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(p)
