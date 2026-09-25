from rembg import remove, new_session
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
sess = new_session('isnet-general-use')
BOX = {'front':(30,40,195,358),'threequarter':(205,40,365,358),'side':(385,40,520,358),
       'happy':(30,370,190,570),'excited':(195,370,355,570),'worried':(360,370,520,570),'cross':(525,370,665,570)}
BG=np.array([247,244,240])
for name in ['zoey','liam','mia','noah']:
    im = Image.open(f'charTurnaround_{name.capitalize()}.png').convert('RGB'); W,H=im.size
    sx,sy=W/900,H/600
    for k,(x0,y0,x1,y1) in BOX.items():
        box=(int(x0*sx),int(y0*sy),int(x1*sx),int(y1*sy)); crop=im.crop(box)
        ra=np.array(remove(crop,session=sess))[:,:,3].astype(float)
        px=np.array(crop).astype(int); bgc=np.median(np.concatenate([px[:4].reshape(-1,3),px[:, :4].reshape(-1,3)]),axis=0)
        dist=np.abs(px-bgc).sum(2)
        fg=(ra>60)|(dist>28)
        fg=ndimage.binary_closing(fg,iterations=3); fg=ndimage.binary_fill_holes(fg); fg=ndimage.binary_opening(fg,structure=np.ones((7,7)))
        lab,n=ndimage.label(fg)
        if n==0: continue
        sizes=ndimage.sum(fg,lab,range(1,n+1)); keep=(lab==int(np.argmax(sizes))+1)
        # keep components near the biggest (drop stray text/lines)
        alpha=Image.fromarray((keep*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        a=np.minimum(np.array(alpha).astype(float), np.where(keep, 255, np.maximum(ra,0)))
        a=np.maximum(a*(keep|(ra>10)), ra*keep)
        out=np.dstack([np.array(crop),a.clip(0,255).astype(np.uint8)])
        t=Image.fromarray(out,'RGBA'); t=t.crop(t.getbbox())
        t.thumbnail((720 if k in('front','threequarter','side') else 400,)*2,Image.LANCZOS)
        t.save(f'out/chars/{name}-{k}.png',optimize=True)
