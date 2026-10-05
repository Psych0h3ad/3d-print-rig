"""Check each generated wallpaper and create contact sheets for visual review."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def overlap(a,b):
    return min(a[2],b[2])>max(a[0],b[0]) and min(a[3],b[3])>max(a[1],b[1])

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args()
    catalog=json.loads((a.directory/'manifest.json').read_text(encoding='utf8'));rows=catalog['wallpapers']
    assert len(rows)==108 and len({r['id'] for r in rows})==108
    for row in rows:
        path=a.directory/row['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
        with Image.open(path) as im:
            assert im.size==(row['width'],row['height']);im.verify()
        assert row['view_count']==len(row['placements'])
        for text in row['text_boxes']:
            assert not re.search(r'1440|3120|3840|5120|2160',text['text']), 'Resolution in artwork'
            for pic in row['placements']:assert not overlap(text['bounds'],pic['bounds']), (row['id'],text['text'],pic['drawing'])
        for i,pic in enumerate(row['placements']):
            for other in row['placements'][i+1:]:assert not overlap(pic['bounds'],other['bounds']),row['id']
    face=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',18)
    for fmt,cols,tw,th in [('desktop',3,520,293),('phone',6,240,520),('ultrawide',3,520,220)]:
        palette=['paper','blueprint','graphite'];selected=[]
        for no in range(28,40):selected.append(next(r for r in rows if r['no']==no and r['format']==fmt and r['palette']==palette[(no-28)%3]))
        gap=20;top=45;cellh=th+32;out=Image.new('RGB',(cols*(tw+gap)+gap,top+math_ceil(len(selected),cols)*cellh+gap),'#101a20');draw=ImageDraw.Draw(out)
        draw.text((gap,12),'COLLECTIONS / '+fmt.upper(),font=face,fill='#dfebea')
        for i,row in enumerate(selected):
            x=gap+(i%cols)*(tw+gap);y=top+(i//cols)*cellh
            with Image.open(a.directory/row['preview']) as im:
                im=im.resize((tw,th),Image.Resampling.LANCZOS);out.paste(im,(x,y))
            draw.text((x,y+th+5),f"{row['no']} / {row['title']}",font=face,fill='#dfebea')
        out.save(a.directory/('contact-'+fmt+'.jpg'),quality=93)
    result={'wallpapers':len(rows),'designs':12,'native_projection_inputs':len(catalog['inputs']),'dimensions_hashes_and_pngs_valid':True,'no_resolution_labels':True,'no_artwork_text_collisions':True,'no_overlapping_drawings':True}
    (a.directory/'QA.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))

def math_ceil(n,d):return (n+d-1)//d

if __name__=='__main__':main()
