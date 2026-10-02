"""Register newly generated Trident sizes against a published asset bundle.

Requires trimesh. Pass --assets SITE --geometry SIZE_OUTPUT (repeat) --output NEW_DIR.
Geometry is generated independently with prepare_trident_size_assets.py.
TRIDENT_SIZE_REGISTRATIONS.json is a merge patch; do not replace newer registrations.
"""
import argparse,copy,gzip,json,io
from pathlib import Path
import trimesh

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--assets',type=Path,required=True)
parser.add_argument('--geometry',type=Path,action='append',required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
read=lambda p:json.loads(p.read_text(encoding='utf8'))
out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
def save(name,data):
    p=out/name;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

heads=read(args.assets/'MACHINE_HEAD_REGISTRATIONS.json')
mods=read(args.assets/'MACHINE_MODS.json')
bank=read(args.assets/'TOOLCHANGER_BANK.json')
patch={'heads':{},'mods':{},'mod_assets':{},'bank':{},'indx_bank':{}}
for geometry in args.geometry:
    bases=list((geometry/'machines').glob('*/assembly_manifest.json'))
    assert len(bases)==1
    base=read(bases[0]);size=base['size_mm'];machine=f'voron_trident_{size}'
    assert size in [250,300]
    offset=(size-350)/2;gantry=f'trident_r2_gantry_{size}'
    g=read(geometry/'modules'/(gantry+'.json'))
    c=read(args.assets/'machines/voron_trident_350/configurations.json')
    c['machine_id']=machine;c['model']=f'VORON Trident {size} / standard printed structure'
    sheet=next(p for p in base['parts'] if p['name']=='Flex Sheet')
    c['bed_reference_top_mm']=sheet['bounds_mm'][1][2]
    c['assets'][gantry]={'meta':f'modules/{gantry}.json','glb':f'modules/{gantry}.glb'}
    for v in c['variants']:
        for m in v['modules']:
            if m['id']=='trident_r2_gantry_350':m['id']=gantry
        v['fit']['bed_reference_drop_mm']=max(0,c['bed_reference_top_mm']-v['fit']['nozzle_mm'][2]+.2) if v['fit'].get('nozzle_mm') else 0
    beam=next(p for p in base['parts'] if p['source_leaf']=='1038')
    fans=read(args.assets/'modules/trident_bedfans.json')
    fan=next(a for a in c['accessories'] if a['id']=='trident_bedfans')
    fan['translation_mm']=[0,beam['bounds_mm'][1][1]-fans['mount_axes_mm'][0][1],sum(p[2] for p in beam['bounds_mm'])/2-fans['mount_axes_mm'][0][2]]
    profile=read(args.assets/'machines/voron_trident_350/machine_profile.json')
    profile.update(machine_id=machine,label=f'VORON Trident {size}',size_mm=size,frame_outer_xy_mm=size+160,
                   geometry_revision='trident-sizes-v1',gantry_asset=gantry,
                   base_assets={'meta':f'machines/{machine}/assembly_manifest.json','glb':f'machines/{machine}/model.glb'})
    profile['display_limits_mm'].update(X=[0,size],Y=[0,size])
    profile['display_reference_xyz_mm']=[v+offset if i<2 else v for i,v in enumerate(profile['display_reference_xyz_mm'])]
    profile['z_guide_block_keys']=[p['key'] for p in base['parts'] if p['motion']=='z' and 'MGN9H' in p['name']]
    profile['bed_keys']=[p['key'] for p in base['parts'] if p['motion']=='z']
    save(f'machines/{machine}/machine_profile.json',profile);save(f'machines/{machine}/configurations.json',c)
    binding=copy.deepcopy(heads['machines']['voron_trident_350'])
    binding['part_key']=gantry+'_381'
    # The rail block at reference XY is identical in all sizes. Rigid ends move.
    original=read(args.assets/'modules/trident_r2_gantry_350.json')
    block=lambda rows:next(p['bounds_mm'] for p in rows if p.get('source_key')=='381')
    assert block(g['parts'])==block(original['parts'])
    heads['machines'][machine]=binding;patch['heads'][machine]=binding
    mod=copy.deepcopy(mods['machines']['voron_trident_350'])
    mod['disco']['side_translation_mm']={'left':[-offset,0,0],'right':[offset,0,0]}
    # Preserve the author's handle geometry, translating each side to its frame.
    handle=read(args.assets/'modules/sturdy_handles_m5.json')
    raw_path=args.assets/'modules/sturdy_handles_m5.glb'
    data=raw_path.read_bytes() if raw_path.exists() else gzip.decompress(raw_path.with_suffix('.glb.gz').read_bytes())
    scene=trimesh.load(io.BytesIO(data),file_type='glb',force='scene',process=False)
    ident=f'sturdy_handles_m5_trident_{size}'
    for row in handle['parts']:
        dx=offset if row['bounds_mm'][0][0]>0 else -offset
        for b in row['bounds_mm']:b[0]+=dx
        mesh=scene.geometry[row['key']];mesh.apply_translation([dx/1000,0,0])
    handle.update(id=ident,glb=f'modules/{ident}.glb',geometry_revision='trident-sizes-v1')
    # No separate STEP is advertised for this browser-only rigid placement.
    handle.pop('step',None)
    save(f'modules/{ident}.json',handle)
    raw=out/'modules'/f'{ident}.glb';scene.export(raw)
    raw.with_suffix('.glb.gz').write_bytes(gzip.compress(raw.read_bytes(),mtime=0))
    for a in mod['accessories']:
        if a['module']=='sturdy_handles_m5':a['module']=ident
    spec={'meta':f'modules/{ident}.json','glb':f'modules/{ident}.glb'}
    mods['assets'][ident]=spec;patch['mod_assets'][ident]=spec
    mods['machines'][machine]=mod;patch['mods'][machine]=mod
    front=next(p for p in base['parts'] if p['source_leaf']=='1033')
    for system,dest in [(bank,'bank'),(bank['indx'],'indx_bank')]:
        mount=copy.deepcopy(system['machines']['voron_trident_350'])
        mount.update(frame_part_key=front['key'],frame_meta=f'machines/{machine}/assembly_manifest.json',frame_bounds_mm=front['bounds_mm'])
        mount['translation_mm'][1]-=offset
        mount['capacity']=system['machines'][f'voron_v24_{size}_printed']['capacity']
        if dest=='bank':mount['bed_reference_top_mm']=c['bed_reference_top_mm']
        else:mount['fixture_asset']=f'indx_crossbar_{size}'
        system['machines'][machine]=mount;patch[dest][machine]=mount
save('MACHINE_HEAD_REGISTRATIONS.json',heads);save('MACHINE_MODS.json',mods)
save('TOOLCHANGER_BANK.json',bank)
save('TRIDENT_SIZE_REGISTRATIONS.json',patch)
print('Registered',list(patch['heads']))
