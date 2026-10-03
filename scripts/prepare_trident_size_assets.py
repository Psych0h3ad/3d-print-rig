"""Generate independent 250/300/350 Trident CAD from the pinned native 250 assembly.
Requires CadQuery and a preparation workspace containing module_cad/cad_utils and native BREP files.
All writes go to --output; the preparation workspace is read-only.
"""
import argparse,sys,json,re,shutil,gzip,math
from pathlib import Path
import numpy as np
import cadquery as cq
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cad-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--size',type=int,choices=[250,300,350],required=True)
args=parser.parse_args();R=args.cad_root.resolve();O=args.output.resolve();size=args.size
if O==R or O.is_relative_to(R):raise ValueError('Output must be outside the source workspace')
if (O/'machines'/f'voron_trident_{size}').exists():raise ValueError('Size output already exists')
sys.path.insert(0,str(R/'scripts'))
import module_cad
module_cad.O=O
from module_cad import Module,tile_rail
from cad_utils import bounds,extend_center,expand_edges
from verify_r2_rail_pitch import hole_axes
sys.stdout.reconfigure(encoding='utf8')

def rail(s,axis,center,pitch):
    if not amount:return s
    # 350 mm MGN9 rail has a 20 mm pitch and 5 mm end margins.
    # Insert whole hole periods, then trim both ends equally. Never stretch holes.
    extension=math.ceil(amount/pitch)*pitch
    result=tile_rail(s,axis,center,extension=extension,pitch=pitch)
    trim=(extension-amount)/2
    if trim:
        b=np.array(bounds(result));lo=b[0]-1;hi=b[1]+1
        lo[axis]=b[0,axis]+trim;hi[axis]=b[1,axis]-trim
        result=result.intersect(cq.Solid.makeBox(*(hi-lo),pnt=tuple(lo))).clean()
    return result

amount=size-250;half=amount/2
def bore(s,radius):
    result=[]
    for face in s.Faces():
        if face.geomType()!='CYLINDER':continue
        c=face._geomAdaptor().Cylinder()
        if abs(c.Radius()-radius)<.0001:result.append((np.array(c.Location().Coord()),np.array(c.Axis().Direction().Coord())))
    assert result,(radius,'Missing native bore')
    return result[0]
bed_bolts={1126:676,1127:675,1128:586,1129:587,1130:554,1131:555,1132:623,1133:622,1134:640,1135:667,1136:644,1137:669,1138:668}
D=R/'output/received_sources/vanilla_trident'
rows=json.loads((D/'inventory.json').read_text(encoding='utf8'))
m=Module('voron_trident_'+str(size)+'_base')
skip={569,659,866,373,375,379,380}
skirt_selected={823+(size-250)//50,850+(size-250)//50,857+(size-250)//50,
                888+(size-250)//50,906+(size-250)//50,919+(size-250)//50,928+(size-250)//50}
for row in rows:
 k=int(row['key']);path=row['path'];name=row['name'];top=path[1]
 if top in ['Gantry:1','Tools:1'] or k in skip:continue
 if re.search(r'_skirt_.*_(250|300|350)(?:_|$)',name) and k not in skirt_selected:continue
 s=cq.Shape.importBrep(str(D/(row['key']+'.brep')))
 b=np.array(bounds(s));c=b.mean(axis=0);extent=b[1]-b[0];delta=np.zeros(3);motion='fixed';method='rigid_source'
 def outer(axis,center):
  return -half if c[axis]<center-100 else half if c[axis]>center+100 else 0
 if top=='Z Assembly:1':
  group=path[2]
  if group in ['Z_Left:1','Z_Right:1','Z_Rear:1']:
   motion='z';delta[:2]=[-half,-half] if group=='Z_Left:1' else [half,-half] if group=='Z_Right:1' else [0,half]
  elif group in ['Bed Components:1','Z Endstop Assembly:1','3x Wago 221-412 Mount:1']:
   motion='z'
   if k in [660,661,662,665] and amount:
    s=expand_edges(expand_edges(s,0,amount,(-285,-105)),1,amount,(65,245));method='sheet_sections_extended'
   else:delta[:2]=[outer(0,-195),-half if c[1]<156 else half]
  elif 'Chain Z' in group:motion='reference_flexible';delta[1]=half
  else:delta[:2]=[outer(0,-195),outer(1,195)]
 elif top=='Frame:1':
  if path[2]=='Bed Extrusions:1':
   motion='z'
   if amount:
    axis=0 if k==1038 else 1;s=extend_center(s,axis,amount,cut=-195 if axis==0 else 195);method='extrusion_section_extended'
   if k==1038:delta[1]=-half
  elif extent[0]>300 or extent[1]>300:
   axis=int(np.argmax(extent[:2]))
   if amount:s=extend_center(s,axis,amount,cut=-195 if axis==0 else 195);method='extrusion_section_extended'
   delta[1-axis]=outer(1-axis,-195 if 1-axis==0 else 195)
  else:delta[:2]=[outer(0,-195),outer(1,195)]
 elif top=='Panels:1':
  if max(extent[:2])>300:
   for axis in [0,1]:
    if extent[axis]>300 and amount:s=extend_center(s,axis,amount,cut=-195 if axis==0 else 195);method='panel_section_extended'
   delta[:2]=[outer(0,-195) if extent[0]<100 else 0,outer(1,195) if extent[1]<100 else 0]
  elif extent[0]>150 and extent[1]<10:
   if amount:s=extend_center(s,0,half,cut=float(c[0]));method='half_door_section_extended'
   delta[:2]=[-half/2 if c[0]<-195 else half/2,-half]
  else:delta[:2]=[outer(0,-195),outer(1,195)]
 elif top=='Skirt:1':
  if k in [857,858,859]:delta[1]=half
  elif 'Front:' in path[2] or 'Rear:' in path[2]:delta[:2]=[outer(0,-195),-half if 'Front:' in path[2] else half]
  elif 'Side_' in path[2]:delta[:2]=[outer(0,-195),outer(1,195)]
  else:delta[:2]=[outer(0,-195),outer(1,195)]
 elif top=='Electronics:1':
  if 'DIN3 Rail' in name and amount:s=extend_center(s,0,amount,cut=-195);method='DIN_rail_section_extended'
  elif c[0]<-350 or c[0]>-40:delta[0]=outer(0,-195)
 elif top=='Filament_Path:1':
  delta[1]=half
  if 'PTFE_Tube' in name:motion='reference_flexible'
 shift=tuple(delta+np.array([195,-195,520]))
 if k in bed_bolts:
  bolt_key=bed_bolts[k];source_bolt=cq.Shape.importBrep(str(D/(str(bolt_key)+'.brep')));bolt=m.shapes[m.id+'_'+str(bolt_key)]
  shift=tuple(np.array(bounds(bolt)).mean(axis=0)-np.array(bounds(source_bolt)).mean(axis=0));placed=s.translate(shift)
  n,axis=bore(placed,1.543 if 'M3'in name else 2.1);q,_=bore(bolt,1.5 if bolt_key in [640,667,644,669,668]else 2.5);difference=q-n;correction=difference-axis*np.dot(difference,axis)
  shift=tuple(np.array(shift)+correction);motion='z';method='native_bed_nut_registered_to_paired_screw'
 role='accent' if name.startswith('[a]') else 'frame' if 'Extrusion' in name else 'base' if re.search(r'(?:z_carriage|z_bed|z_chain|skirt|mount|bracket|brace|clip|hinge|ExhaustCover|spool_holder)',name,re.I) else None
 color=row['color'] or [.52,.55,.59]
 if re.search(r'(?i)NEMA|fan|stepper',name):color=[.035,.04,.048]
 if re.search(r'(?i)lead.?screw|MGN|rail',name):color=[.65,.68,.71]
 foam='Foam' in name or 'Foam' in '/'.join(path)
 transparent=not foam and top=='Panels:1' and 'Transparent Panels' in path[2] and min(extent)<4 and max(extent)>150
 if foam:color=[.025,.028,.03];role=None
 if transparent:color=[.80,.88,.93,.12]
 key=m.id+'_'+str(k)
 m.add(k,name,s.translate(shift),role,color,motion,group=top.replace(':1',''),
  motion_axes=['Z'] if motion=='z' else [],panel_surface=bool(not foam and (transparent or top=='Panels:1' and min(extent)<5 and max(extent)>300)),
  source_leaf=str(k),source_component='/'.join(path[1:]),method=method,rigid_translation_mm=list(shift))
 if k%100==0:print('Placed independent Trident base',size,k,flush=True)
meta=m.save(machine_id='voron_trident_'+str(size),geometry_revision='2026-10-01-vanilla-trident-1',
 source_repository='https://github.com/VoronDesign/Voron-Trident',source_commit='a8628f48546948ce1fc15511b7765b7f31f80722',
 size_mm=size,belt_width_mm=6,source_size_mm=250,excluded_source_leaves=sorted(skip),
 limitations=['Base assembly; the registered 6 mm VORON gantry and toolhead are separate modules.'])
target=O/'machines'/('voron_trident_'+str(size));target.mkdir(parents=True,exist_ok=True)
shutil.copy2(O/'modules'/(m.id+'.glb'),target/'model.glb')
shutil.copy2(O/'modules'/(m.id+'.step'),target/'assembly.step')
(target/'assembly_manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')

I=R/'references/mods/Voron-Trident/CAD/exported/full_parts'
inv=json.loads((I/'inventory.json').read_text(encoding='utf8'))
m=Module('trident_r2_gantry_'+str(size));car=Module('trident_r2_sb_carriage')
skip=set(range(48,53))|{45,55,319,321,320,371,372,374,375,379,380,524,525}|set(range(448,456))|set(range(461,467))|set(range(526,534))|set(range(508,514))
# Chain assemblies and the old full toolhead are not part of the replacement.
# The dual D2F endstop PCB remains on the right XY joint; the rear bumper is fixed.
shift=np.array([195.,-195.,520.]);rail_screws=[]
for p in inv:
    k=int(p['key'])
    if not p['path'][1].startswith('Gantry'):continue
    if k in skip or 153<=k<=258 or 392<=k<=445:continue
    s=cq.Shape.importBrep(str(I/(str(k)+'.brep')));b=np.array(bounds(s));c=b.mean(axis=0);delta=np.zeros(3);method='rigid placement'
    motion='fixed'
    if 259<=k<=276:
        role='base' if k in [259,260] else None
        if k in [259,260]:
            s=cq.Shape.importBrep(str(R/f'references/mods/Voron-Stealthburner/extracted/assembly/{98 if k==259 else 99}.brep')).translate((0,-36.1,309.0936))
            x=9.2004445 if k==259 else -9.1995458
            s=s.cut(cq.Solid.makeBox(.002,21.51,28.32,pnt=(x-.001,-23.6003,318.8946))).clean()
        else:s=s.translate(tuple(shift))
        if k in [271,275]:s=s.translate((0,-2.00029441,-.00065465))
        car.add(k,p['name'],s,role,p['color'] or [.5,.52,.55],source_key=str(k));continue
    if 277<=k<=380:
        delta[0]=-half if k<317 else half;motion='y'
    elif 381<=k<=389:motion='xy'
    elif k in [390,391]:
        s=rail(s,0,-195,25) if k==390 else (extend_center(s,0,amount,-195) if amount else s);motion='y';method=f'{size+50} mm periodic rail' if k==390 else f'{size+80} mm extrusion; rigid ends retained'
    elif k in [446,523]:
        s=extend_center(s,1,amount,195) if amount else s;delta[0]=half if c[0]>-195 else -half;method=f'{size+120} mm gantry extrusion'
    elif k==447:
        s=(extend_center(s,0,amount,-195) if amount else s);delta[1]=half;method=f'{size-10} mm rear gantry extrusion'
    elif k in [456,534]:
        s=rail(s,1,195.5,20);delta[0]=half if c[0]>-195 else -half;method=f'{size+50} mm periodic rail'
    elif k in [535,536]:
        s=expand_edges(expand_edges(s,0,amount,(-300,-90)),1,amount,(100,300)) if amount else s;method='6 mm belt: straight sections inserted; centre clamps retained'
    elif 514<=k<=520:
        delta[0]=-half if c[0]<-195 else half;motion='y';method='native_X_joint_nut_in_X_beam_slot'
    else:
        delta[:2]=[-half if c[0]<-195 else half,-half if c[1]<195 else half]
    role='accent' if p['name'].startswith('[a]') else 'base' if any(v in p['name'].lower() for v in ['stepper_lower','stepper_upper','idler_housing','xy_left_lower','xy_left_upper','xy_right_lower','xy_right_upper','circlip']) else 'frame' if 'HFSB5' in p['name'] else None
    color=p['color'] or [.52,.55,.59]
    if 'NEMA17' in p['name']:color=[.035,.04,.048,1]
    if k in [390,456,534]:color=[.68,.70,.73,1]
    if k in [535,536]:color=[.028,.034,.04,1]
    if k in [324,328,327,331]:color=[.035,.04,.045,1]
    mech={325:'X_Lever',327:'X_Plunger',329:'Y_Lever',331:'Y_Plunger'}.get(k)
    m.add(k,p['name'],s.translate(tuple(shift+delta)),role,color,motion,source_key=str(k),method=method,mechanism=mech,flex_belt=k in [535,536])
    if k%60==0:print('R2 placed',k,flush=True)
# Measure actual analytic hole axes, then place the unscaled source fasteners.
checks=[]
for key,axis,pitch,template,prefix in [(390,0,25,461,'X'),(456,1,20,448,'Y1'),(534,1,20,526,'Y-1')]:
    row=next(p for p in m.rows if p.get('source_key')==str(key))
    shape=m.shapes[row['key']];axes=hole_axes(shape,axis)
    p=inv[template];bolt=cq.Shape.importBrep(str(I/(str(template)+'.brep')));bc=np.array(bounds(bolt)).mean(axis=0)+shift
    for j,(point,direction) in enumerate(axes):
        target=bc.copy()
        for a in range(3):
            if abs(direction[a])<.001:target[a]=point[a]
        placed=m.add(f'{prefix}_bolt_{j}',p['name'],bolt.translate(tuple(target-(bc-shift))),color=[.52,.55,.59],motion='y' if axis==0 else 'fixed',source_key=str(template))
        error=float(np.linalg.norm(np.cross(np.array(bounds(placed)).mean(axis=0)-point,direction)))
        assert error<.001
        if axis==0:
            nut=cq.Shape.importBrep(str(I/'508.brep'));n,_=bore(nut,1.543);q,_=bore(placed,1.5)
            frame=m.shapes[m.id+'_391'];t=np.array([q[0]-n[0],bounds(frame)[0][1]+1.4-bounds(nut)[0][1],q[2]-n[2]])
            suffix=str(508+j)if j<6 else f'X_tnut_{j:02d}'
            m.add(suffix,'2020 Drop-in T-nut, M3',nut.translate(tuple(t)),color=inv[508]['color'],motion='y',source_key='508',
                rail_mount=dict(rail_key=m.id+'_390',frame_key=m.id+'_391',bolt_key=m.id+f'_X_bolt_{j}',thread='M3'))
    positions=[p[axis] for p,d in axes];length=row['bounds_mm'][1][axis]-row['bounds_mm'][0][axis]
    assert abs(length-(size+50))<.001 and all(abs(x-pitch)<.001 for x in np.diff(positions))
    checks.append(dict(part=row['key'],length_mm=length,pitch_mm=pitch,holes=len(axes),max_bolt_axis_error_mm=error))
d=m.save(source_commit='a8628f48546948ce1fc15511b7765b7f31f80722',source_native='CAD/Trident_Assembly.f3d',source_size_mm=250,target_size_mm=size,belt_width_mm=6,xy_motors=2,geometry_revision='trident-sizes-v1',removed_stock_keys=[],xol_translation_from_awd_mm=[0,-7.24,0],sb_translation_from_awd_mm=[0,-7.34,-3.0064],limitations=['Smooth routing preview; full travel contact, teeth and tension are not simulated.'])
# The carriage is size-independent; use the already published native module.
report=dict(size_mm=size,passed=d['valid'] and meta['valid'],base_parts=len(meta['parts']),gantry_parts=len(d['parts']),rail_checks=checks,rigid_hardware_scaled=False)
(O/f'TRIDENT_{size}_GEOMETRY_QA.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
for file in [O/'machines'/f'voron_trident_{size}'/'model.glb',O/'modules'/(m.id+'.glb')]:file.with_suffix('.glb.gz').write_bytes(gzip.compress(file.read_bytes(),mtime=0))
print(json.dumps(report),flush=True)
