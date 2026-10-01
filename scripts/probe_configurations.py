"""Add mounted probes and explicitly marked metal-keepout conflict previews."""
import copy
import json

PROBES=[
 dict(id='none',label='プローブなし'),
 dict(id='kit_cartographer',label='SIBOOR付属 Cartographer'),
 dict(id='cartographer_v1_v3',label='Cartographer V1–V3 · Standard'),
 dict(id='cartographer_v4',label='Cartographer V4 · Standard'),
 dict(id='beacon_revd',label='Beacon RevD · Normal'),
 dict(id='beacon_revh',label='Beacon RevH · Normal'),
]

def expand_probes(catalog,output):
 read=lambda n:json.loads((output/n).read_text(encoding='utf8'))
 xfit=read('XOL_PROBE_FIT_QA.json')['records']
 sbfit=read('SB_PROBE_FIT_QA.json')['records']
 kitfit=read('KIT_PROBE_HOTEND_QA.json')['records']
 inspection=read('PROBE_INSPECTION.json')
 catalog['bed_reference_top_mm']=next(p for p in read('assembly_manifest.json')['parts'] if p['key']=='968')['bounds_mm'][1][2]
 catalog['probes']=copy.deepcopy(PROBES)
 variants=[]
 for base in catalog['variants']:
  kit=next((r for r in kitfit if r['hotend']==base['hotend']),None) if base['toolhead']=='stealthburner' and base['gantry']=='siboor_awd' else None
  default=kit['default_probe'] if kit else 'none'
  fits=[]
  if base['toolhead']=='xol':
   template='__'.join(['siboor_awd',base['toolhead'],base['hotend'],base['extruder']])
   fits=[r for r in xfit if r['configuration']==template and r.get('geometry_passed',r['passed'])]
  elif base['gantry']=='trident_r2' and base['hotend']=='revo_voron':
   fits=[r for r in sbfit if r.get('geometry_passed',r['passed'])]
  choices=[default]+(['none' if default=='kit_cartographer' else 'kit_cartographer'] if kit else [])+[r['probe'] for r in fits]
  for pid in choices:
   v=copy.deepcopy(base);v['probe']=pid;v['base_configuration']=base['id']
   if kit:
    v['fit']['nozzle_mm']=kit['nozzle_mm']
    v['fit']['probe_candidates']=[dict(id='kit_cartographer',height_passed=kit['height_passed'],coil_nozzle_gap_mm=kit['coil_nozzle_gap_mm'],required_coil_gap_mm=kit['required_coil_gap_mm'])]
   if v['toolhead']=='xol' and v['hotend']=='rapido2_uhf':
    nozzle=next(p for p in read('XOL_MOD.json')['parts'] if p['key']=='xol_rapido_457')['bounds_mm']
    v['fit']['nozzle_mm']=[(nozzle[0][i]+nozzle[1][i])/2+v['head_translation_mm'][i] for i in [0,1]]+[nozzle[0][2]+v['head_translation_mm'][2]]
   v['fit']['bed_reference_drop_mm']=max(0,catalog['bed_reference_top_mm']-v['fit']['nozzle_mm'][2]+.2) if v['fit']['nozzle_mm'] else 0
   v['id']=base['id'] if pid==default else base['id']+'__'+pid
   v['notes']=[n for n in v['notes'] if 'プローブ' not in n or '全域' in n]
   if pid!='kit_cartographer':v['fit'].pop('probe',None)
   if v['toolhead']=='xol':
    v['hidden_xol_keys']=sorted(set(v['hidden_xol_keys'])|{'xol_probe_module'})
    v['modules']=[m for m in v['modules'] if m['id']!='xol_standard_probe']
    if pid=='none':v['hidden_xol_keys']=sorted(set(v['hidden_xol_keys'])|{'xol_41','xol_42'})
   if pid=='none' and v['toolhead']=='stealthburner' and v['gantry']=='siboor_awd':
    v['removed_stock_keys']=sorted(set(v['removed_stock_keys'])|{str(k) for k in range(483,519)}|{'470','471','472','473'})
    v['modules']=[m for m in v['modules'] if m['id']!='sb_cartographer_short']
    v['notes']=[n for n in v['notes'] if 'Cartographer' not in n]
   if pid not in ['none','kit_cartographer']:
    fit=next(r for r in fits if r['probe']==pid);id=fit.get('module',fit.get('id'));meta=read('modules/'+id+'.json')
    catalog['assets'][id]=dict(meta='modules/'+id+'.json',glb='modules/'+id+'.glb',step='modules/'+id+'.step')
    shift=v['head_translation_mm'] if v['toolhead']=='xol' else [0,0,0]
    v['modules'].append(dict(id=id,translation_mm=shift))
    if v['toolhead']=='stealthburner':
     carriage=next(m for m in v['modules'] if m['id']=='trident_r2_sb_carriage')
     carriage['hidden_keys']=meta['hidden_carriage_keys']
    v['fit']['probe']=dict(id=pid,label=next(p['label'] for p in PROBES if p['id']==pid),
      mount=id,coil_nozzle_gap_mm=fit['coil_nozzle_gap_mm'],offset_xy_mm=fit['probe_offset_xy_mm'],
      spacer_mm=meta['spacer_mm'],geometry_revision=meta['geometry_revision'],
      metal_keepout_collisions=fit['metal_keepout_collisions'],
      coil_bottom_mm=[n+shift[i] for i,n in enumerate(inspection[id]['coil_bottom_mm'])],
      minimum_probe_bed_clearance_at_nozzle_contact_mm=inspection[id]['minimum_part_z_mm']+shift[2]-v['fit']['nozzle_mm'][2],
      metal_keepout_bounds_mm=[[n+shift[i] for i,n in enumerate(p)] for p in inspection[id]['metal_keepout_bounds_mm']],
      geometry_passed=True,physical_passed=True,height_passed=True,metal_keepout_verified=True,
      validation='Native CAD body/spacing checks at registered mounting pose; metal keepout results are reported separately. Whole travel and electrical calibration are not simulated.')
    if fit['metal_keepout_collisions']:v['notes'].append('金属除外領域に'+('ホットエンドのヒートシンク' if v['toolhead']=='xol' else '下側のベルト固定ねじ')+'が入っています。取付対応を保証する構成ではありません。干渉を確認するためのプレビューです。')
    v['notes'].append('プローブは専用マウント・基板・固定具を含むCADです。'+(f" 絶縁スペーサー {meta['spacer_mm']:.1f} mm × 2が必要です。" if meta['spacer_mm'] else ''))
   elif pid=='none':v['notes'].append('プローブ未取付。')
   else:
    v['fit']['nozzle_mm']=kit['nozzle_mm']
    v['fit']['bed_reference_drop_mm']=max(0,catalog['bed_reference_top_mm']-kit['nozzle_mm'][2]+.2)
    v['fit']['probe']=dict(id=pid,label='SIBOOR付属 Cartographer',mount=kit['mount'],
      coil_bottom_mm=kit['coil_bottom_mm'],coil_nozzle_gap_mm=kit['coil_nozzle_gap_mm'],required_coil_gap_mm=kit['required_coil_gap_mm'],
      minimum_probe_bed_clearance_at_nozzle_contact_mm=kit['minimum_probe_bed_clearance_at_nozzle_contact_mm'],
      native_body_collisions=kit['native_body_collisions'],geometry_passed=kit['geometry_passed'],physical_passed=kit['physical_passed'],
      height_passed=kit['height_passed'],metal_keepout_verified=False,nearest_hotend_to_board=kit['nearest_hotend_to_board'])
    if not kit['height_passed']:v['notes'].append(f"コイル高さ {kit['coil_nozzle_gap_mm']:.3f} mmは指定範囲2.6〜3.0 mm外です。現マウントでの取付対応を保証しません。高さ不足／超過を確認するプレビューです。")
    v['notes'].append('SIBOOR付属基板を使用。Cartographerの世代と金属除外領域は未確認です。')
   variants.append(v)
 catalog['variants']=variants
 catalog['sources']+= [dict(label='Cartographer',url='https://github.com/Cartographer3D/cartographer-probe/tree/bf01749f16f239b5310aaf03e96b18e9dfb9b832'),
  dict(label='Beacon',url='https://github.com/beacon3d/docs/tree/bb8e34c6fd7fb3b200c3a2688fee9f4ce8c76278'),
  dict(label='Annex SB Beacon carriage',url='https://github.com/Annex-Engineering/Annex-Engineering_User_Mods/tree/c73acdda56535898fb3aef6b62998388e0c51670/Printers/Non_Annex_Printers/VORON_Printers/VORON_V2dot4/annex_dev-stealthburner_beacon_x_carriage')]
 return catalog
