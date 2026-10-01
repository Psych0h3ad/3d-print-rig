import json,itertools,argparse
from pathlib import Path
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Build the registered Trident CAD combinations from a local module directory.')
parser.add_argument('output',type=Path)
O=parser.parse_args().output.resolve()
read=lambda n:json.loads((O/n).read_text(encoding='utf8'))
stock=read('assembly_manifest.json');xol=read('XOL_MOD.json');r2=read('modules/trident_r2_gantry_350.json')
registry=json.loads((R/'site/MOD_REGISTRY.json').read_text(encoding='utf8'))
headgroup='03_Stock_Stealthburner_CW2_Rapido2_UHF'
mods=['trident_r2_gantry_350','trident_r2_sb_carriage','xol_clips_6mm','xol_revo_voron','sb_revo_voron','xol_orbiter2','xol_rapido2_hf','sb_rapido2_hf','xol_standard_probe','sb_cartographer_short','trident_bedfans']
mods=sorted(set(mods)|{m['asset'] for h in registry['hotends'] for m in h['mounts'].values() if m['asset']})
catalog=dict(schema='siboor-configurations-v2',model=stock.get('model','SIBOOR Trident 350'),
 gantries=[dict(id='siboor_awd',label='SIBOOR CNC AWD · 9 mm',belt_width_mm=9,xy_motors=4),dict(id='trident_r2',label='VORON Trident R2 · 6 mm',belt_width_mm=6,xy_motors=2)],
 toolheads=[dict(id='stealthburner',label='Stealthburner (SB)'),dict(id='xol',label='Xol')],
 hotends=[dict(id=h['id'],label=h['label']) for h in registry['hotends']],
 extruders=[dict(id='cw2',label='Clockwork 2'),dict(id='sherpa_mini',label='Sherpa Mini'),dict(id='orbiter2',label='Orbiter 2.0')],
 accessories=[dict(id='trident_bedfans',label='ベッドファン · 5015 × 2',module='trident_bedfans',notes='ベッド側フレームに固定。Z移動に追従します。')],
 assets={m:dict(meta='modules/'+m+'.json',glb='modules/'+m+'.glb',step='modules/'+m+'.step') for m in mods},variants=[],
 sources=[dict(label='Trident R2',url='https://github.com/VoronDesign/Voron-Trident'),dict(label='Stealthburner',url='https://github.com/VoronDesign/Voron-Stealthburner'),dict(label='Xol',url='https://github.com/Armchair-Heavy-Industries/Xol-Toolhead'),dict(label='Rapido 2',url='https://github.com/Phaetus/Rapido-2'),dict(label='Orbiter 2',url='https://www.orbiterprojects.com/orbiter-v2-0/'),dict(label='Trident Bed Fans',url='https://github.com/VoronDesign/VoronUsers/tree/8e5067f4f6457da8a552983dd210ec48c40be2ca/printer_mods/CannedBass/Trident_Bed_Fans')])
for g,t,hotend in itertools.product(['siboor_awd','trident_r2'],['stealthburner','xol'],registry['hotends']):
 if t not in hotend['mounts']:continue
 h=hotend['id'];mount=hotend['mounts'][t]
 for e in registry['toolhead_extruders'][t]:
  rule=registry.get('extruder_compatibility',{}).get(e,{})
  if g not in rule.get('gantries',[g]) or t not in rule.get('toolheads',[t]) or h not in rule.get('hotends',[h]):continue
  remove=set();xhide=set();modules=[];offset=[0,0,0]
  def add(m,shift=None):modules.append(dict(id=m,translation_mm=shift or [0,0,0]))
  if g=='trident_r2':
   remove.update(r2['removed_stock_keys']);add('trident_r2_gantry_350')
   offset=r2['xol_translation_from_awd_mm'] if t=='xol' else r2['sb_translation_from_awd_mm']
  notes=['SIBOORのZ・ベッド・筐体に組み合わせた350 mm構成です。']
  if t=='xol':
   remove.update(p['key'] for p in stock['parts'] if p['group']==headgroup)
   if g=='trident_r2':
    xhide.update(['xol_22','xol_62','xol_64','xol_66','Xol_X_Switch_Housing','Xol_X_Switch_Lever','Xol_X_Switch_Plunger']);add('xol_clips_6mm',offset)
   if h!='rapido2_uhf':
    xhide.update(p['key'] for p in xol['parts'] if p['key'].startswith('xol_rapido_') or p['key'] in ['xol_Rapido2UHF_Mount','xol_probe_module','xol_224','xol_232','xol_233','xol_234'])
    add(mount['asset'],offset);add('xol_standard_probe',offset)
   if e=='orbiter2':
    xhide.update(p['key'] for p in xol['parts'] if p['key'].startswith('xol_') and p['key'][4:].isdigit() and 298<=int(p['key'][4:])<=1156)
    add('xol_orbiter2',offset);notes.append('Orbiter用CAN基板と専用ブラケットは未取付です。')
   notes.append('プローブは対応する印刷ブラケットまで。付属Cartographer基板は専用アダプター待ちです。')
   if g=='trident_r2':notes.append('Xol公式は標準フロントアイドラーとの前隅での干渉を案内しています。BFI等への交換を検討してください。')
   if g=='siboor_awd':notes.append('9 mmベルト端部の最終位置調整と全域干渉確認は残っています。')
  else:
   if h!='rapido2_uhf':
    remove.update(p['key'] for p in stock['parts'] if p['key']=='surface_422' or p['key'].isdigit() and 412<=int(p['key'])<=468)
    remove.update(str(k) for k in range(483,519));add(mount['asset'],offset)
    if g=='siboor_awd':
     remove.update(['470','471','472','473']);add('sb_cartographer_short',offset)
     notes.append('UHF延長ブロックを外し、CartographerをCNCキャリッジへM3×6で直接固定しています。')
   if g=='trident_r2':
    remove.update(str(k) for k in range(469,523));add('trident_r2_sb_carriage')
    notes.append('R2公式の6 mmベルト用SBキャリッジに交換しています。プローブは未取付です。')
  if t=='xol' or g=='trident_r2':
   remove.update(p['key'] for p in stock['parts'] if p['key'] in ['PTFE_tube','CAN_cable'] or p['key'].startswith('chain_') or 'chain_link_index' in p)
  notes.append('ベルト・PTFEは経路表示です。全域の衝突・電気配線・Z原点の校正は含みません。')
  ident='__'.join([g,t,h,e])
  geometry=read('modules/'+mount['asset']+'.json') if mount['asset'] else {}
  nozzle=geometry.get('nozzle_mm')
  if nozzle is None and 'nozzle_z_mm' in geometry:nozzle=[-.09999426211 if t=='xol' else 0,-24.11 if t=='xol' else -28.76,geometry['nozzle_z_mm']]
  probe=read('modules/sb_cartographer_short.json') if t=='stealthburner' and g=='siboor_awd' and h!='rapido2_uhf' else None
  catalog['variants'].append(dict(id=ident,gantry=g,toolhead=t,hotend=h,extruder=e,belt_width_mm=9 if g=='siboor_awd' else 6,xy_motors=4 if g=='siboor_awd' else 2,
   removed_stock_keys=sorted(remove),hidden_xol_keys=sorted(xhide),head_translation_mm=offset,modules=modules,notes=notes,
   fit=dict(mount=mount['label'],interface=hotend['interface'],nozzle_mm=[n+offset[i] for i,n in enumerate(nozzle)] if nozzle else None,
    mount_hotend_overlap_mm3=geometry.get('mount_hotend_overlap_mm3'),
    probe=dict(id='cartographer_standard',mount='CNC direct / M3x6',coil_nozzle_gap_mm=probe['coil_bottom_z_mm']-nozzle[2],geometry_revision=probe['geometry_revision']) if probe and nozzle else None,
    scope=registry['validation_scope'],not_simulated=registry['not_simulated'])))
(O/'ASSEMBLY_CONFIGURATIONS.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf8')
print('Catalog:',len(catalog['variants']),'actual configurations')
