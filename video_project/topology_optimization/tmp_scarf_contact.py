from PIL import Image,ImageDraw
fs=[4400,4709,7254,7400]
ims=[Image.open(f'output/metro/frame-{f}.jpg').convert('RGB').resize((640,360)) for f in fs]
out=Image.new('RGB',(1280,720),(10,20,30)); d=ImageDraw.Draw(out)
for i,(im,f) in enumerate(zip(ims,fs)):
 x=(i%2)*640; y=(i//2)*360; out.paste(im,(x,y)); d.text((x+12,y+335),str(f),fill='white')
out.save('tmp_scarf_contact.jpg')
