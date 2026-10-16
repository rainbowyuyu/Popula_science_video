from PIL import Image,ImageDraw
fs=[4280,4300,4400,6660,6800,7254,7400]
ims=[Image.open(f'output/metro/frame-{f}.jpg').convert('RGB').resize((480,270)) for f in fs]
out=Image.new('RGB',(480*4,300*2),(10,20,30)); d=ImageDraw.Draw(out)
for i,(im,f) in enumerate(zip(ims,fs)):
 x=(i%4)*480; y=(i//4)*300; out.paste(im,(x,y)); d.text((x+10,y+275),str(f),fill='white')
out.save('tmp_stills_contact.jpg')
