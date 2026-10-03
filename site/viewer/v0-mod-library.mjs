// Source-CAD browsing only. These choices do not register mounts on the machine.
export const v0ModCategories = [
  {id:'v0-head',label:'V0 · ツールヘッド',mods:['dragon_burner_v8','rapid_burner_v8','mailbox_v5','official_bowden']},
  {id:'v0-mount',label:'V0 · マウント・センサー',mods:['official_hotend_mounts','official_adxl_mounts','xcarriage_inserts','zeroclick']},
  {id:'v0-enclosure',label:'V0 · 外装・ドア',mods:['stealth_handles','lift_off_tophat','tip_tophat','tophat_cat_flap','mini_fridge']},
  {id:'v0-wiring',label:'V0 · 配線・基板',mods:['umbilical','picobilical']},
  {id:'v0-motion',label:'V0 · ベッド・ガントリー',mods:['kirigami','tulip_standard']},
  {id:'v0-cleaning',label:'V0 · ノズル清掃',mods:['nozzle_wiper_v2']},
];
export function componentCategory(item){return v0ModCategories.find(c=>c.mods.some(id=>'v0mod_'+id===item.id))?.id||item.kind}
export const componentCategories = [
  {id:'hotend',label:'ホットエンド'},{id:'extruder',label:'押出機'},
  {id:'electronics',label:'基板'},{id:'carriage',label:'キャリッジ / ベルトクランプ'},
  {id:'gantry',label:'ガントリー'},...v0ModCategories,{id:'mod',label:'その他のMod'},
];
const clean=s=>s.replace(/(?::\d+)+$/,'').replace(/\s+v\d+$/i,'').replace(/_/g,' ');
const filename=p=>p.source_file?.split(/[\\/]/).at(-1).replace(/\.step$/i,'')||'原本';
const generic=s=>/^(?:SOLID|COMPOUND|Component\d+|\(Unsaved\)|temp_import|=>)/i.test(s);
export function partLabel(part){
  const path=(part.source_path||[]).slice(1).filter(s=>!generic(s)).map(clean);
  return generic(part.name)?path.at(-1)||clean(filename(part)):clean(part.name);
}
function uniqueLabels(parts){
  const labels=parts.map(partLabel);
  return parts.map((p,i)=>({...p,label:labels.filter(l=>l===labels[i]).length>1?`${labels[i]} · ${p.key.split('_').slice(-2).join('-')}`:labels[i]}));
}
function group(id,label,parts,assembly=false){return {id,label,parts:uniqueLabels(parts),assembly}}

// CAD files can contain mutually exclusive variants despite source_assembly.
export function componentViews(item,parts){
  if(!parts?.length)throw Error('原本の部品がありません');
  if(item.id==='rapido_x'){
    const body=parts.filter(p=>p.source_solid===1),adapter=parts.filter(p=>p.source_solid===0);
    if(body.length!==1||adapter.length!==1)throw Error('Rapido X source body / adapter mismatch');
    return [group('four-bolt','4本ねじ取付',body,true),group('groove','GrooveMountアダプター付き',parts,true)];
  }
  if(['goliath_air','goliath_water','goliath_short_wc'].includes(item.id))return [group('assembly','原本アセンブリ',parts,true)];
  if(item.id==='v0mod_official_bowden'){
    const variants=[['ecas04','ECAS04',/Cowling_ECAS04/,/ECAS Bowden Collet/],['pc4-m6','PC4-M6',/Cowling_PC4_M6/,/PC4_M6_Collet/],['pc4-m10','PC4-M10',/Cowling_PC4_M10/,/M10 Pneumatic Coupler/]];
    const alternative=p=>/Cowling_|ECAS Bowden Collet|PC4_M6_Collet|M10 Pneumatic Coupler/.test((p.source_path||[]).join('/'));
    return variants.map(([id,label,cowl,coupler])=>{
      const selected=parts.filter(p=>!alternative(p)||cowl.test(p.name)||coupler.test((p.source_path||[]).join('/')));
      if(selected.filter(p=>cowl.test(p.name)).length!==1||!selected.some(p=>coupler.test((p.source_path||[]).join('/'))))throw Error('Bowdenのカウルと継手を対応できません');
      return group(id,label,selected,true);
    });
  }
  if(item.id==='v0mod_tip_tophat')return [
    group('quartered','4分割ボディ',parts.filter(p=>p.name!=='Unibody'),true),
    group('unibody','一体ボディ',parts.filter(p=>!/^Body_Q[1-4]$/.test(p.name)),true),
  ];
  const files=[...new Set(parts.map(p=>p.source_file))];
  // Each STEP is one variant. Preserve its PCB, fasteners and reference carriage.
  if(files.length>1)return files.map(file=>{
    const rows=parts.filter(p=>p.source_file===file);
    return group('file:'+file,clean(filename(rows[0])),rows,true);
  });
  if(!item.select_parts)return [group('assembly','原本アセンブリ',parts,true)];
  const groups=new Map();
  for(const p of parts){
    const fullPath=(p.source_path||[]).slice(1,-1).filter(s=>!generic(s));
    const path=item.id==='v0mod_tulip_standard'?fullPath.slice(0,2):fullPath;
    const id=path.join('/')||'parts';
    if(!groups.has(id))groups.set(id,group(id,path.map(clean).join(' / ')||'本体・独立部品',[]));
    groups.get(id).parts.push(p);
  }
  for(const g of groups.values())g.parts=uniqueLabels(g.parts);
  return [...groups.values()];
}
export function resolveComponentView(views,{view,part}={}){
  const preferred=views.find(g=>g.parts.some(p=>/^main.?body$/i.test(p.name)))||views[0];
  const selected=views.find(g=>g.id===view)||views.find(g=>g.parts.some(p=>p.key===part))||preferred;
  const chosen=selected.parts.find(p=>p.key===part);
  return {view:selected,part:chosen?.key||(selected.assembly?'all':selected.parts.find(p=>/^main.?body$/i.test(p.name))?.key||selected.parts[0].key)};
}
export function componentViewKeys(view,part){
  if(part==='all'&&view.assembly)return view.parts.map(p=>p.key);
  if(!view.parts.some(p=>p.key===part))throw Error('このバリエーションに部品がありません');
  return [part];
}
