from PIL import Image,ImageOps
from pathlib import Path
src=Path(r'C:\Users\zju\Documents\xwechat_files\wxid_jdc2tzsjmvqc12_b63e\temp\RWTemp\2026-10\9e20f478899dc29eb19741386f9343c8\6af9614113bc47d529da17e5390a003b.jpg')
out=Path(r'D:\python_project\manim_extend_rainbow\video_project\rainbow_arc_2026_v16\output-v20\work\qwen-art-v20\generated\identity_input\keyframe-1920x1080.png')
im=Image.open(src).convert('RGB')
# Preserve head/shoulders with a gentle 16:9 letterbox; no face warping.
canvas=Image.new('RGB',(1920,1080),(238,244,240)); fit=ImageOps.contain(im,(1440,960),Image.Resampling.LANCZOS); canvas.paste(fit,((1920-fit.width)//2,80+(960-fit.height)//2)); canvas.save(out)
print(out,canvas.size)
