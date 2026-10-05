"""Reproduce rear panel/gasket CAD from the pinned enclosure source archive.
Requires CadQuery. Writes only to a separate output directory.
"""
import argparse,json,hashlib
from pathlib import Path
import cadquery as cq
from cad_section_insert import expand_edges,extend_center
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();S=args.sources.resolve();O=args.output.resolve()
if O==S or O.is_relative_to(S)or O.exists():raise ValueError('Use a new output directory outside the source archive.')
O.mkdir(parents=True);pins=[]
for family,leaves in [('trident',['1189','1219']),('v24',['01206','01207'])]:
 for size in [250,300,350]:
  amount=size-250;dest=O/f'{family}_{size}';dest.mkdir()
  for leaf in leaves:
   src=S/family/(leaf+'.brep');native=cq.Shape.importBrep(str(src))
   if family=='trident':
    shape=(expand_edges(native,0,amount,cuts=(-315,-75))if amount else native).translate((195,-195+amount/2,520))
   else:
    shape=native.translate((-127,-167,58.0960000001))
    if amount:shape=extend_center(expand_edges(shape,0,amount,cuts=(-120,120)),2,amount,cut=200).translate((0,amount/2,amount/2))
   assert shape.isValid()and len(shape.Solids())==1
   target=dest/(leaf+'.brep');shape.exportBrep(str(target));pins.append(dict(family=family,size_mm=size,source_leaf=leaf,source_sha256=hashlib.sha256(src.read_bytes()).hexdigest(),output_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),volume_mm3=shape.Volume()))
(O/'PARTS.json').write_text(json.dumps(pins,indent=2)+'\n',encoding='utf8')
print('Reproduced native rear panels and gaskets for all three sizes.')
