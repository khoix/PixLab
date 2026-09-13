"""Build read-only baseline analysis sheets from captured composites and source PNGs.
Requires Pillow and NumPy. Run after operator-art-baseline.mjs; no production writes.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path('docs/operator-art-baseline')
ROOT = Path('client/public/imgs/compendium/ops')
m = json.loads((OUT / 'measurements.json').read_text())
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 14)
    small = ImageFont.truetype('DejaVuSans.ttf', 12)
except OSError:
    font = small = ImageFont.load_default()

def checker(w, h):
    im = Image.new('RGBA', (w, h), '#202630'); d = ImageDraw.Draw(im)
    for y in range(0, h, 16):
        for x in range(0, w, 16):
            if (x//16+y//16)%2: d.rectangle((x,y,x+15,y+15),fill='#303946')
    return im

def box(mask):
    y,x=np.where(mask)
    return dict(x0=int(x.min()),y0=int(y.min()),x1=int(x.max()),y1=int(y.max()),pixels=int(mask.sum())) if len(x) else None

# Full-frame source registration is more useful than independently centred crops.
sheet=Image.new('RGB',(5*272,4*302),'#10151c'); d=ImageDraw.Draw(sheet)
for i,a in enumerate(m['assets']):
    x=(i%5)*272+8; y=(i//5)*302+24
    im=checker(256,256); im.alpha_composite(Image.open(ROOT/a['file']).convert('RGBA'))
    sheet.paste(im.convert('RGB'),(x,y)); d.text((x,y-19),a['file'],font=small,fill='white')
    b=a['alphaSolid']; d.rectangle((x+b['x0'],y+b['y0'],x+b['x1'],y+b['y1']),outline='#4fcbd1')
    d.text((x,y+260),f"solid [{b['x0']},{b['y0']}] - [{b['x1']},{b['y1']}]",font=small,fill='#adc2d5')
sheet.save(OUT/'source-registration.png',optimize=True)

# Real component composites, exactly 320x320, not a substitute renderer.
sheet=Image.new('RGB',(5*336,3*354),'#10151c'); d=ImageDraw.Draw(sheet)
for i,c in enumerate(m['composites']):
    x=(i%5)*336+8; y=(i//5)*354+26
    sheet.paste(Image.open(OUT/(c['name']+'.png')).convert('RGB'),(x,y))
    d.text((x,y-20),c['name'],font=small,fill='white')
sheet.save(OUT/'loadouts-320.png',optimize=True)

# Utility details shown as nearest-neighbour enlargement; no invented detail.
sheet=Image.new('RGB',(4*320,330),'#10151c'); d=ImageDraw.Draw(sheet)
for i,a in enumerate([a for a in m['assets'] if a['file'].startswith('utility/')]):
    b=a['alphaSolid']; crop=(max(0,b['x0']-3),max(0,b['y0']-3),min(256,b['x1']+4),min(256,b['y1']+4))
    im=Image.open(ROOT/a['file']).convert('RGBA').crop(crop)
    factor=min(8,280//im.width,250//im.height)
    im=im.resize((im.width*factor,im.height*factor),Image.Resampling.NEAREST)
    bg=checker(im.width,im.height); bg.alpha_composite(im)
    sheet.paste(bg.convert('RGB'),(i*320+16,38)); d.text((i*320+16,12),a['file'].split('/')[-1],font=font,fill='white')
    d.text((i*320+16,296),f"{factor}x detail; origin ({crop[0]},{crop[1]})",font=small,fill='#adc2d5')
sheet.save(OUT/'utility-details.png',optimize=True)

hand=np.array(Image.open(ROOT/'operator-hand.png').convert('RGBA'))[:,:,3]>=128
sleeve=np.array(Image.open(ROOT/'armor/gauntlets-sleeve.png').convert('RGBA'))[:,:,3]>=128
m['gripIntersections']=[]
for a in m['assets']:
    if not a['file'].startswith('weapons/'): continue
    weapon=np.array(Image.open(ROOT/a['file']).convert('RGBA'))[:,:,3]>=128
    overlap=weapon&hand; y,x=np.where(overlap)
    wy,wx=np.where(weapon); _,vectors=np.linalg.eigh(np.cov(np.column_stack((wx,wy)).T))
    axis=vectors[:,-1]; axis=axis if axis[0]>0 else -axis
    angle=round(float(np.degrees(np.arctan2(axis[1],axis[0]))),1)
    m['gripIntersections'].append(dict(file=a['file'],solidAlphaPrincipalAxisDegrees=angle,handOverlap=box(overlap),
      handOverlapCentroid=[round(float(x.mean()),2),round(float(y.mean()),2)] if len(x) else None,
      sleeveOverlap=box(weapon&sleeve)))
m['armorUtilityOverlaps']=[]
for armor in ['armor','shield','helmet','boots','gauntlets']:
    aa=np.array(Image.open(ROOT/f'armor/{armor}.png').convert('RGBA'))[:,:,3]>=128
    for utility in ['scope','thruster','scanner','amplifier']:
        uu=np.array(Image.open(ROOT/f'utility/{utility}.png').convert('RGBA'))[:,:,3]>=128
        overlap=box(aa&uu)
        if overlap: m['armorUtilityOverlaps'].append(dict(armor=armor,utility=utility,overlap=overlap))
(OUT/'measurements.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'grip':m['gripIntersections'],'armorUtilityOverlaps':m['armorUtilityOverlaps']},indent=2))
