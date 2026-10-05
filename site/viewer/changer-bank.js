import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=5c6f4dcd051bb1336e43';
import {workspaceTask} from './workspace-lifecycle.mjs';
import {bankChoices,bankCapacity,bankDockUnavailable,normalizeBank,initialBank,readBankURL,bankBedReferenceDrop,bankSystem,bankSource,bankSpec,variantBankSystem,bankStateForVariant,bankPlan} from './changer-bank-model.mjs?v=024cc52a5bbc61da7506';
import {bankWitnessCheck}from './head-validation.mjs?v=trident-clearance-35';

export function setupChangerBank({catalog,rig,data,extras={},before=document.querySelector('#configurationControls'),inspectPose}={}){
 if(!before)throw Error('ツールバンクの表示先がありません');
 let controller,state=initialBank(catalog,data,catalog.variants[0]?.gantry),busy=false,previousGantry=catalog.variants[0]?.gantry,urlState,urlError,wasMonolith=false;
 try{urlState=readBankURL(location.search)}catch(e){urlError=e}
 const panel=document.createElement('details');panel.id='changerBank';panel.open=false;
 panel.innerHTML='<summary id="bankTitle">ツールバンク</summary><label class="bank-toggle"><input id="bankEnabled" type="checkbox"><span id="bankToggleLabel">機体にドックと複数ヘッドを取り付ける</span></label><div id="bankFields"></div><p id="bankStatus" class="foot" aria-live="polite"></p><p id="bankHelp" class="foot"></p><button id="bankAlternative" type="button" hidden>MadMax / Xolに切り替える</button><details><summary>ドックの確認範囲</summary><p id="bankScope" class="foot"></p></details>';
 before.before(panel);
 const bankError=document.createElement('p');bankError.id='changerBankError';bankError.className='foot notice';bankError.hidden=true;bankError.setAttribute('role','alert');before.before(bankError);
 const enabled=panel.querySelector('#bankEnabled'),fields=panel.querySelector('#bankFields'),status=panel.querySelector('#bankStatus');
 const label=v=>v?.toolhead==='indx'?catalog.hotends.find(r=>r.id===v.hotend)?.label:[v?.toolhead==='xol'?'Xol':v?.toolhead==='stealthburner'?'Stealthburner':'JabberWocky',catalog.extruders.find(r=>r.id===v?.extruder)?.label,catalog.hotends.find(r=>r.id===v?.hotend)?.label].join(' / ');
 function choices(variant=controller?.current){return bankChoices(catalog,data,variant?.gantry||previousGantry,bankSystem(state),variant?.toolhead==='indx'?variant.cooling:'4010')}
 function menus(){
  const system=bankSystem(state),indx=system==='indx',madmax=system==='madmax',opts=choices(),spec=bankSpec(data,system),mount=spec.machines[catalog.machine_id],monolith=!!controller?.current?.machine_gantry;
  panel.dataset.system=system;
  panel.hidden=bankDockUnavailable(catalog,data,system);
  if(panel.hidden){fields.replaceChildren();enabled.checked=false;enabled.disabled=true;panel.open=false;return}
  fields.replaceChildren();fields.hidden=!state.enabled;enabled.checked=state.enabled;enabled.disabled=!controller||busy||controller.busy||!opts.length||mount?.bank_permitted===false;
  panel.querySelector('#bankTitle').textContent=indx?'INDX・受動ツール':madmax?'MadMax・XY交換':'StealthChanger・ツールバンク';
  panel.querySelector('#bankToggleLabel').textContent=indx?'受動ツールとドックを取り付ける':madmax?'XY交換用ドックを取り付ける':'機体にドックと複数ヘッドを取り付ける';
  panel.querySelector('#bankHelp').textContent=indx?'Smart Headは1台。選択中の工具はSmart Headに装着し、残りは専用ドックで待機します。各ノズルの外形はBondtechの共通参照モデルです。':'待機姿勢の登録済み構成：Xol / Sherpa Mini / Rapido 2 UHF、JabberWocky / Conch。同じヘッドも複数配置できます。SBは原本ドックに干渉するため、単独の装着表示で選べます。';
  panel.querySelector('#bankScope').textContent=indx?'原本の2020用ドック・磁石・バネ・受動ツール。41 mm間隔。追加の前面2020クロスバーが必要です。端部締結・外装・全可動域・自動ドッキング経路は未検証。':'元作者のModularDockを上部2020フレームに配置。待機ヘッドとドック本体の交差を検査。追加補強・締結部品・ドア・全可動域・自動ドッキング経路は未検証。実機の製作保証ではありません。';
  if(madmax){panel.querySelector('#bankHelp').textContent='MadMaxはXY移動だけで交換するため、Tridentでも使える設計です。現在の装着構成はXol / Sherpa Mini / Rapido 2 UHF、MGN12H・6 mmベルトです。';panel.querySelector('#bankScope').textContent='専用キャリッジ・Maxwell結合・Xolプレートを原本CADの取付穴軸で配置。Trident用のドック支持部・待機ヘッド・交換経路は未登録です。9 mm用の保持具はこの6 mm構成に流用しません。'}
  const alternative=panel.querySelector('#bankAlternative'),madmaxVariant=bankChoices(catalog,data,controller?.current?.gantry||previousGantry,'madmax')[0];
  alternative.hidden=system!=='stealthchanger'||mount?.bank_permitted!==false||!madmaxVariant;alternative.disabled=!controller||busy||controller.busy;
  alternative.onclick=async()=>{return workspaceTask(async()=>{if(alternative.disabled||!madmaxVariant)return;await controller.selectVariant(madmaxVariant.id)});};
  const add=(caption,id,options,value,change)=>{const l=document.createElement('label'),s=document.createElement('select');l.htmlFor=id;l.textContent=caption;s.id=id;for(const [id,text]of options){const o=document.createElement('option');o.value=String(id);o.textContent=String(text);s.append(o)}s.value=String(value);s.disabled=busy||controller?.busy||!state.enabled;s.onchange=change;fields.append(l,s);return s};
  add(indx?'工具数':'設置する台数','bankCount',Array.from({length:bankCapacity(data,catalog.machine_id,system)},(_,i)=>[i+1,String(i+1)]),state.tools.length,e=>{const n=Number(e.target.value),tools=state.tools.slice(0,n);while(tools.length<n)tools.push(bankSource(opts[tools.length%opts.length],system));return select({...state,tools,active:Math.min(state.active,n-1)})});
  state.tools.forEach((value,i)=>add((indx?'工具 T':'ドック ')+(indx?i:i+1),'bankTool'+i,opts.map(v=>[bankSource(v,system),label(v)]),value,e=>{const tools=[...state.tools];tools[i]=e.target.value;return select({...state,tools})}));
  add(indx?'装着中の工具':'使用中のヘッド','bankActive',state.tools.map((id,i)=>[i,'T'+i+' · '+label(opts.find(v=>bankSource(v,system)===id))]),state.active,e=>select({...state,active:Number(e.target.value)}));
  status.textContent=madmax?'MadMaxヘッド装着中。XY交換用ドックは機体に未登録です。':state.enabled?`ドック ${state.tools.length}基 · T${state.active}をガントリーに装着。残りは固定ドックで待機。`:'ツールバンクはオフです。通常のヘッド構成を選べます。';
  if(monolith){panel.querySelector('#bankTitle').textContent='Monolith・ヘッド交換';panel.querySelector('#bankHelp').textContent='固定式はSphinx、交換式はMonolith専用StealthChangerを選択できます。機体側のドックと交換動作は未登録です。';panel.querySelector('#bankScope').textContent='選択したMonolithガントリーと専用キャリッジを機体に配置。通常ガントリー用のドックは表示しません。';status.textContent='ヘッド装着とXYベルトの動きを表示中。Monolith用ドックは未登録です。'}
  const unregistered=monolith||mount?.docking_registered===false,blocked=!unregistered&&(mount?.bank_permitted===false||state.enabled&&mount?.print_setup_verified===false);status.classList.toggle('notice',blocked||unregistered);if(blocked)status.append(Object.assign(document.createElement('span'),{textContent:' '+mount.printing_blocked_reason}));
  const down=bankBedReferenceDrop(catalog,data,state,controller?.current),top=data.machines[catalog.machine_id]?.bed_reference_top_mm,nozzle=controller?.current?.fit?.nozzle_mm?.[2],gap=nozzle-(top-down);
  if(Number.isFinite(gap)&&gap>.01)status.append(Object.assign(document.createElement('span'),{textContent:` Zガイド上端で停止。ノズルまで ${gap.toFixed(2)} mm残るため、この取付位置では印刷できません。`}));
  else if(Number.isFinite(down)&&Math.abs(down)>.001)status.append(Object.assign(document.createElement('span'),{textContent:` ノズル接触面へのベッド移動 ${(-down).toFixed(2)} mm。`}));
  if(monolith&&!wasMonolith&&!(gap>.01))panel.open=false;if(state.enabled||gap>.01)panel.open=true;wasMonolith=monolith;
  panel.dataset.system=system;panel.dataset.printingSetup=unregistered?'unregistered':blocked?'blocked':'unverified';
  panel.querySelector('[data-bank-intersection]')?.remove();
  const installed=rig.active||controller?.current;
  if(state.enabled&&installed){
   const hit=bankWitnessCheck(catalog.head_witness_validation,bankPlan(state,catalog,data,installed),installed);
   if(hit){const detail=document.createElement('div');detail.dataset.bankIntersection='true';detail.className='foot notice';detail.textContent='待機ヘッドと可動ガントリーの体積交差あり。交換経路・全可動域の適合は未確認。';const part=document.createElement('p');part.dataset.part=hit.head_part;part.textContent=`${hit.head_name} / ${hit.fixture_name} · ${hit.overlap_mm3.toFixed(3)} mm³`;detail.append(part);if(inspectPose){const button=document.createElement('button');button.type='button';button.textContent='干渉姿勢を見る';button.onclick=()=>inspectPose(hit.display_xyz_mm,hit);detail.append(button)}status.after(detail)}
  }
 }
 async function select(next){return workspaceTask(async()=>{
  if(!controller||busy||controller.busy)return;busy=true;bankError.hidden=true;menus();let error;
  try{next=bankStateForVariant(next,controller.current,catalog,data);next=normalizeBank(next,catalog,data,controller.current.gantry);const system=bankSystem(next),v=bankChoices(catalog,data,controller.current.gantry,system,controller.current.toolhead==='indx'?controller.current.cooling:'4010').find(v=>bankSource(v,system)===next.tools[next.active]);const applied=await controller.selectVariant(next.enabled?v.id:controller.current.id,{...extras.getExtras?.(),tool_bank:next});if(applied===false)throw Error('ヘッドを切り替えられませんでした。')}catch(e){error=e}finally{busy=false;menus();if(error){status.textContent=error.message;bankError.textContent=error.message;bankError.hidden=false}}
 });}
 enabled.onchange=e=>select({...state,enabled:e.target.checked});
 async function install(variant){return workspaceTask(async()=>{
  const system=variantBankSystem(variant),oldSystem=bankSystem(state),opts=bankChoices(catalog,data,variant.gantry,system,variant.toolhead==='indx'?variant.cooling:'4010');let next=state;
  bankError.hidden=true;
  if(bankDockUnavailable(catalog,data,system))next=initialBank(catalog,data,variant.gantry,system);
  else if(system!==oldSystem){next=initialBank(catalog,data,variant.gantry,system);next.enabled=system==='indx'}
  else if(!opts.length)next={...state,enabled:false};
  else if(variant.gantry!==previousGantry){
   const fresh=initialBank(catalog,data,variant.gantry,system),old=bankChoices(catalog,data,previousGantry,system);fresh.tools=state.tools.slice(0,bankCapacity(data,catalog.machine_id,system)).map(id=>{const previous=old.find(v=>bankSource(v,system)===id);return bankSource(opts.find(v=>system==='indx'?v.hotend===previous?.hotend:v.toolhead===previous?.toolhead)||opts[0],system)});fresh.active=Math.min(state.active,fresh.tools.length-1);fresh.enabled=state.enabled;next=fresh;
  }
  const match=opts.find(v=>v.id===variant.id);if(next.enabled){next={...next,enabled:!!match,tools:[...next.tools]};if(match)next.tools[next.active]=bankSource(match,system)}
  if(bankSpec(data,system)?.machines[catalog.machine_id]?.bank_permitted===false)next={...next,enabled:false};
  await rig.install(variant,next);state=next;previousGantry=variant.gantry;menus();
 });}
 const options={...extras,getExtras:()=>({...extras.getExtras?.(),tool_bank:JSON.parse(JSON.stringify(state))}),validateExtras:value=>{extras.validateExtras?.(value);if(value.tool_bank){const variant=catalog.variants.find(v=>v.id===value.configuration)||controller?.current;normalizeBank(bankStateForVariant(value.tool_bank,variant,catalog,data),catalog,data,variant?.gantry||previousGantry)}},applyExtras:async value=>{return workspaceTask(async()=>{await extras.applyExtras?.(value);if(value.tool_bank){const next=normalizeBank(bankStateForVariant(value.tool_bank,rig.active,catalog,data),catalog,data,rig.active?.gantry);await rig.setBank(next);state=next;menus()}});},onSettled:v=>{extras.onSettled?.(v);menus();if(!v)return;const u=new URL(location.href);if(state.enabled)u.searchParams.set('tools',JSON.stringify(state));else u.searchParams.delete('tools');replaceWorkspaceURL(null,'',u)}};
 return {install,options,async bind(value){return workspaceTask(async()=>{controller=value;menus();if(urlError){status.textContent=urlError.message;bankError.textContent=urlError.message;bankError.hidden=false}else if(urlState)await select(urlState)});},get state(){return state}};
}
