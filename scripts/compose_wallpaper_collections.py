"""Compose wallpaper collections from the reviewed native-CAD SVG projections.

python scripts/compose_wallpaper_collections.py --collection /path/to/technical-wallpapers --output /path/to/new-wallpapers
Only the M/L paths exported by the CAD renderer are accepted. No geometry is
invented, mirrored or distorted. Repeated patterns use the same source views.
"""
import argparse
import hashlib
import json
import math
import re
from functools import lru_cache
from pathlib import Path
import defusedxml.ElementTree as ET

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
from PIL.PngImagePlugin import PngInfo

FORMATS = {'phone': (1440, 3120), 'desktop': (3840, 2160), 'ultrawide': (5120, 2160)}
PALETTES = {
    'paper': ('#eeece5', '#26363d', '#9a5e3e', '#657276'),
    'blueprint': ('#092538', '#cbe7ed', '#82d4e2', '#93b5c3'),
    'graphite': ('#171b20', '#d1d3d2', '#d5a57b', '#a09f9c'),
}
MACHINES = ['v0-iso', 'v24-iso', 'trident-iso', 'micron-iso', 'crossant-assembly', 'ratrig-assembly']
HEADS = ['head-iso', 'xol-assembly', 'a4t-assembly', 'anthead-assembly', 'jabberwocky-assembly', 'sphinx-assembly', 'yudx-assembly', 'stealthchanger-assembly']
EXPLODED = ['a4t', 'stealthchanger', 'yudx', 'sherpa', 'galileo', 'sphinx', 'monolith-drive', 'v24-expanded']
SECTIONS = [s+'-section' for s in ['a4t', 'yudx', 'sherpa', 'galileo', 'sphinx']]
MOTION = ['gantry-iso', 'gantry-top', 'monolith-assembly', 'monolith-drive-assembly', 'monolith-drive-exploded', 'e3ng-assembly']
FAMILY = [s+'-'+v for s in ['v0', 'v24', 'trident', 'micron'] for v in ['iso', 'front', 'side' if s=='trident' else 'top']]
STUDIES = [
    ('machine-cabinet', 'MACHINE CABINET', 'SIX MACHINES / ONE COLLECTION', MACHINES, 'grid', (2, 3, 6)),
    ('toolhead-cabinet', 'TOOLHEAD CABINET', 'EIGHT HEADS & INTERFACES', HEADS, 'grid', (2, 4, 4)),
    ('drive-matrix', 'DRIVE MATRIX', 'ASSEMBLED / EXPLODED / SECTION', [s+'-'+v for s in ['sherpa', 'galileo', 'yudx'] for v in ['assembly', 'exploded', 'section']], 'matrix', (3, 3, 3)),
    ('exploded-atlas', 'EXPLODED ATLAS', 'EIGHT ASSEMBLIES / RIGID GROUP OFFSETS', [s+'-exploded' for s in EXPLODED], 'grid', (2, 4, 4)),
    ('section-library', 'SECTION LIBRARY', 'FIVE STUDIES / THROUGH THE FILAMENT AXIS', SECTIONS, 'grid', (2, 5, 5)),
    ('motion-systems', 'MOTION SYSTEMS', 'GANTRIES / DRIVES / TOOL DOCKS', MOTION, 'grid', (2, 3, 3)),
    ('workshop-index', 'WORKSHOP INDEX', 'TWENTY-ONE VIEWS / THE CAD COLLECTION', MACHINES+HEADS[:6]+SECTIONS+MOTION[:4], 'index', (3, 7, 7)),
    ('printer-field', 'PRINTER FIELD', 'THE MACHINE COLLECTION / REPEATING STUDY', MACHINES, 'pattern', (2, 6, 8)),
    ('toolhead-field', 'TOOLHEAD FIELD', 'THE TOOLHEAD COLLECTION / REPEATING STUDY', HEADS, 'pattern', (3, 7, 9)),
    ('cutaway-field', 'CUTAWAY FIELD', 'FILAMENT-PATH SECTIONS / REPEATING STUDY', SECTIONS, 'pattern', (2, 6, 8)),
    ('assembly-pairs', 'ASSEMBLY / EXPLODED', 'EIGHT PAIRS / TWO STATES OF THE SAME CAD', [s+'-'+v for s in EXPLODED for v in ['assembly', 'exploded']], 'pairs', (2, 4, 8)),
    ('voron-family', 'VORON / MULTIVIEW', 'FOUR MACHINES / THREE PROJECTIONS', FAMILY, 'matrix', (3, 4, 4)),
]
LABELS = {'v0':'V0.2r1', 'v24':'V2.4', 'trident':'TRIDENT', 'micron':'MICRON', 'head':'STEALTHBURNER', 'gantry':'V2.4 GANTRY', 'crossant':'CROSSANT 235', 'ratrig':'V-CORE 4.1', 'monolith-drive':'MONOLITH DRIVE', 'v24-expanded':'V2.4', 'e3ng':'E3NG CHANGER'}
VIEWS = {'iso':'ISO', 'front':'FRONT', 'side':'SIDE', 'top':'TOP', 'assembly':'ASSEMBLY', 'exploded':'EXPLODED', 'section':'SECTION'}

def split_key(key):
    return key.rsplit('-', 1)

@lru_cache(maxsize=80)
def font(size, mono=False):
    return ImageFont.truetype(str(Path('C:/Windows/Fonts')/('consola.ttf' if mono else 'bahnschrift.ttf')), size)

def mix(bg, fg, alpha):
    a=bytes.fromhex(bg[1:]); b=bytes.fromhex(fg[1:])
    return tuple(round(x*(1-alpha)+y*alpha) for x,y in zip(a,b))

class Collection:
    def __init__(self, root):
        self.root=root
        self.paths={p.stem:p for d in [root/'renders', root/'vol-02/renders'] for p in d.glob('*.svg')}
        rows=json.loads((root/'collection-manifest.json').read_text(encoding='utf8'))['wallpapers']
        self.sources={r['subject']:r['sources'] for r in rows}
        self.sources['v24-expanded']=self.sources['v24']
        self.sources['gantry']=self.sources['v24']
        self.audit={}

    @lru_cache(maxsize=64)
    def vectors(self, key):
        path=self.paths[key]; meta=json.loads(path.with_suffix('.json').read_text(encoding='utf8'))
        assert hashlib.sha256(path.with_suffix('.png').read_bytes()).hexdigest()==meta['render_sha256'], key
        assert 'native BREP topology' in meta['renderer'], key
        doc=ET.fromstring(path.read_text(encoding='utf8'))
        paths=[]; size=float(doc.attrib['width'])
        for el in doc.iter('{http://www.w3.org/2000/svg}path'):
            value=el.attrib['d']
            assert not re.sub(r'[ML\s\d.,+\-]', '', value), 'Unexpected SVG command'
            pts=np.array(re.findall(r'[-+]?\d+(?:\.\d+)?', value), dtype=np.float32).reshape(-1,2)
            paths.append((pts,float(el.attrib['stroke-width'])))
        assert paths
        points=np.concatenate([p for p,_ in paths]); low=points.min(axis=0); high=points.max(axis=0)
        self.audit[key]={'projection':path.relative_to(self.root).as_posix(),'svg_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'reviewed_render_sha256':meta['render_sha256'],'curve_paths':len(paths),'renderer':meta['renderer']}
        return paths,low,high,size,meta

    @lru_cache(maxsize=160)
    def ink(self, key, width, height):
        paths,low,high,source_size,meta=self.vectors(key)
        scale=min((width-8)/(high-low)[0],(height-8)/(high-low)[1])
        dim=np.ceil((high-low)*scale).astype(int)+8
        ss=3
        image=Image.new('L',(int(dim[0])*ss,int(dim[1])*ss)); draw=ImageDraw.Draw(image)
        for points,source_width in paths:
            native=source_width*2600/source_size
            minimum=.66 if native<1.6 else .86 if native<2.2 else 1.12 if native<3 else 1.65
            stroke=max(minimum,source_width*scale)
            coords=np.rint(((points-low)*scale+4)*ss).astype(int)
            draw.line([tuple(p) for p in coords],fill=255,width=max(1,round(stroke*ss)),joint='curve')
        # Reinforce the outside perimeter without discarding internal detail.
        barrier=image.point(lambda n:255 if n else 0)
        ImageDraw.floodfill(barrier,(0,0),128)
        body=barrier.point(lambda n:0 if n==128 else 255)
        exterior=ImageChops.subtract(body.filter(ImageFilter.MaxFilter(5)),body)
        image=ImageChops.lighter(image,exterior)
        image=image.resize(tuple(map(int,dim)),Image.Resampling.LANCZOS)
        return image,scale,low,source_size,meta

class Sheet:
    def __init__(self, collection, spec, no, fmt, palette):
        self.c=collection; self.spec=spec; self.no=no; self.fmt=fmt; self.palette=palette
        self.w,self.h=FORMATS[fmt]; self.phone=fmt=='phone'
        self.bg,self.ink,self.accent,self.muted=PALETTES[palette]
        self.image=Image.new('RGB',(self.w,self.h),self.bg); self.d=ImageDraw.Draw(self.image)
        self.placements=[]; self.text_boxes=[]

    def text(self,x,y,value,size=28,color=None,max_width=None):
        face=font(size,True)
        while max_width and self.d.textlength(value,font=face)>max_width:
            size-=1; face=font(size,True)
        box=self.d.textbbox((round(x),round(y)),value,font=face)
        assert min(box)>=0 and box[2]<=self.w and box[3]<=self.h, (value,box)
        self.d.text((round(x),round(y)),value,font=face,fill=color or self.muted)
        self.text_boxes.append({'text':value,'bounds':box})

    def picture(self,key,box):
        x,y,w,h=map(round,box)
        mask,scale,low,source_size,meta=self.c.ink(key,w,h)
        px=x+(w-mask.width)//2; py=y+(h-mask.height)//2
        assert px>=0 and py>=0 and px+mask.width<=self.w and py+mask.height<=self.h
        self.image.paste(Image.new('RGB',mask.size,self.ink),(px,py),mask)
        datum=(meta.get('cut') or {}).get('filament_axis')
        if datum:
            pts=[np.array([px,py])+(np.array(p)*source_size-low)*scale+4 for p in datum['endpoints_uv']]
            delta=pts[1]-pts[0]; length=float(np.linalg.norm(delta)); period=24
            for offset in range(0,math.ceil(length),period):
                for start,end in [(0,13),(18,20)]:
                    a=(offset+start)/length; b=min(1,(offset+end)/length)
                    if a<1:self.d.line([tuple(pts[0]+a*delta),tuple(pts[0]+b*delta)],fill=self.accent,width=1)
        self.placements.append({'drawing':key,'bounds':[px,py,px+mask.width,py+mask.height],'scale':float(scale)})

    def compose(self):
        key,title,subtitle,drawings,layout,columns=self.spec
        pattern=layout=='pattern'
        margin=round(self.w*(.055 if self.phone else .045))
        # Subtle registration grid; no fictitious dimensions or resolution label.
        step=120
        for x in range(0,self.w,step):self.d.line([(x,0),(x,self.h)],fill=mix(self.bg,self.ink,.025))
        for y in range(0,self.h,step):self.d.line([(0,y),(self.w,y)],fill=mix(self.bg,self.ink,.025))
        top=round(self.h*(.25 if self.phone else .165))
        bottom=round(self.h*.90)
        hy=round(self.h*(.17 if self.phone else .047))
        self.text(margin,hy,f'TECHNICAL STUDIES / {self.no:02d}',24 if self.phone else 25,self.accent)
        self.text(margin,hy+43,title,51 if self.phone else 68,self.ink,self.w-2*margin)
        self.text(margin,hy+(111 if self.phone else 132),subtitle,19 if self.phone else 25,max_width=self.w-2*margin)
        cols=columns[['phone','desktop','ultrawide'].index(self.fmt)]
        rows=math.ceil(len(drawings)/cols)
        if pattern:
            rows=7 if key=='toolhead-field' and self.phone else 6 if self.phone else 4 if key=='toolhead-field' else 3
            count=rows*cols
            drawings=[drawings[(i+(i//cols)*2)%len(drawings)] for i in range(count)]
        gap=28 if self.phone else 48
        cellw=(self.w-2*margin)/cols; cellh=(bottom-top)/rows
        label_size=18 if self.phone and cols>=3 else 22 if self.phone else 24
        for i,drawing in enumerate(drawings):
            col=i%cols; row=i//cols
            row_count=min(cols,len(drawings)-row*cols)
            shift=(cols-row_count)/2 if row_count<cols else 0
            x=margin+(col+shift)*cellw; y=top+row*cellh
            if pattern:
                dx=cellw*.06*(-1 if row%2 else 1)
                box=(x+gap/2+abs(dx)+dx,y+gap/2,cellw-gap-2*abs(dx),cellh-gap)
            else:
                label_h=label_size*2+26
                box=(x+gap/2,y+gap/2,cellw-gap,cellh-gap-label_h)
            self.picture(drawing,box)
            if not pattern:
                subject,view=split_key(drawing)
                label=LABELS.get(subject,subject.upper())+' / '+VIEWS[view]
                self.text(x+gap/2,y+cellh-label_h,label,label_size,self.ink,cellw-gap)
                owner=self.c.sources[subject][0][1].split('/')[0]
                self.text(x+gap/2,y+cellh-label_h+label_size+10,owner,max(15,label_size-4),max_width=cellw-gap)
                self.d.line([(round(x+gap/2),round(y+cellh-7)),(round(x+cellw-gap/2),round(y+cellh-7))],fill=mix(self.bg,self.ink,.16))
        sources=[]
        for d in drawings:
            for pair in self.c.sources[split_key(d)[0]]:
                if pair not in sources:sources.append(pair)
        owners=list(dict.fromkeys(p[1].split('/')[0] for p in sources))
        self.d.line([(margin,round(self.h*.923)),(self.w-margin,round(self.h*.923))],fill=mix(self.bg,self.ink,.35),width=1)
        self.text(margin,self.h*.932,f'{len(drawings):02d} VIEWS / ORIGINAL CAD',21 if self.phone else 24,self.accent)
        maxw=self.w-2*margin
        lines=[]; line=''
        for owner in owners:
            next_line=(line+' / ' if line else '')+owner
            if self.d.textlength(next_line,font=font(18 if self.phone else 24,True))>maxw:
                lines.append(line);line=owner
            else:line=next_line
        if line:lines.append(line)
        for i,line in enumerate(lines):self.text(margin,self.h*.950+i*(24 if self.phone else 31),line,18 if self.phone else 24,max_width=maxw)
        return sources

    def save(self,out):
        sources=self.compose();key,title,subtitle,drawings,layout,_=self.spec
        name=f'{self.no:02d}-{key}-{self.palette}-{self.w}x{self.h}'
        folder=out/'wallpapers'/self.fmt;folder.mkdir(parents=True,exist_ok=True)
        path=folder/(name+'.png');info=PngInfo()
        info.add_text('Title',title)
        info.add_text('Sources','\n'.join(p[0] for p in sources))
        info.add_text('Derivation','Layout of native BREP hidden-line projections. Uniform scaling; no mirrored geometry. Exterior contours and interior edges preserved. Exploded spacing is illustrative. Sections pass through the measured filament axis. Repeated fields reuse the same original views.')
        info.add_text('Rights','Original author and component terms apply separately. Keep credits.html and licenses/ with redistributed files.')
        self.image.save(path,pnginfo=info,compress_level=6)
        preview=out/'previews'/(name+'.webp');preview.parent.mkdir(parents=True,exist_ok=True)
        thumb=self.image.copy();thumb.thumbnail((850,850),Image.Resampling.LANCZOS);thumb.save(preview,'WEBP',quality=84,method=6)
        return {'id':name,'series':key,'subject':key,'no':self.no,'title':title,'kind':'pattern' if layout=='pattern' else 'collection','palette':self.palette,'format':self.fmt,'width':self.w,'height':self.h,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sources':sources,'file':path.relative_to(out).as_posix(),'preview':preview.relative_to(out).as_posix(),'view_count':len(self.placements),'placements':self.placements,'text_boxes':self.text_boxes}

def main():
    p=argparse.ArgumentParser();p.add_argument('--collection',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--only',nargs='+');p.add_argument('--palettes',nargs='+',default=list(PALETTES));p.add_argument('--formats',nargs='+',default=list(FORMATS));a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True);collection=Collection(a.collection);records=[]
    for no,spec in enumerate(STUDIES,28):
        if a.only and spec[0] not in a.only:continue
        for fmt in a.formats:
            for palette in a.palettes:
                records.append(Sheet(collection,spec,no,fmt,palette).save(a.output))
        print('Composed',spec[0],len(records),flush=True)
    (a.output/'manifest.json').write_text(json.dumps({'wallpapers':records,'inputs':collection.audit},ensure_ascii=False,indent=2),encoding='utf8')
    print('Saved',len(records),'wallpapers',flush=True)

if __name__=='__main__':main()
