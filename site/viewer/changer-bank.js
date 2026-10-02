import {bankChoices,bankCapacity,normalizeBank,initialBank,readBankURL,bankBedReferenceDrop} from './changer-bank-model.mjs?v=public-v21';

export function setupChangerBank({catalog,rig,data,extras={}}){
 let controller,state=initialBank(catalog,data,catalog.variants[0]?.gantry),busy=false,previousGantry=catalog.variants[0]?.gantry,urlState,urlError;try{urlState=readBankURL(location.search)}catch(e){urlError=e}
 const panel=document.createElement('details');panel.id='changerBank';panel.open=true;
 panel.innerHTML='<summary>StealthChanger・ツールバンク</summary><label class="bank-toggle"><input id="bankEnabled" type="checkbox">機体にドックと複数ヘッドを取り付ける</label><div id="bankFields"></div><p id="bankStatus" class="foot" aria-live="polite"></p><p class="foot">待機姿勢の登録済み構成：Xol / Sherpa Mini / Rapido 2 UHF、JabberWocky / Conch。同じヘッドも複数配置できます。SBは原本ドックに干渉するため、単独の装着表示で選べます。</p><details><summary>ドックの確認範囲</summary><p class="foot">元作者のModularDockを上部2020フレームに配置。待機ヘッドとドック本体の交差を検査。追加補強・締結部品・ドア・全可動域・自動ドッキング経路は未検証。実機の製作保証ではありません。</p></details>';
 document.querySelector('#configurationControls').before(panel);
 const enabled=panel.querySelector('#bankEnabled'),fields=panel.querySelector('#bankFields'),status=panel.querySelector('#bankStatus');
 const label=v=>[v.toolhead==='stealthburner'?'Stealthburner':v.toolhead==='xol'?'Xol':'JabberWocky',catalog.extruders.find(r=>r.id===v.extruder)?.label,catalog.hotends.find(r=>r.id===v.hotend)?.label].join(' / ');
 const source=v=>v.source_head_configuration||v.id;
 function menus(){
  fields.replaceChildren();fields.hidden=!state.enabled;enabled.checked=state.enabled;enabled.disabled=!controller||busy||controller.busy;const gantry=controller?.current?.gantry||previousGantry,choices=bankChoices(catalog,data,gantry);
  const add=(caption,id,options,value,change)=>{const l=document.createElement('label'),s=document.createElement('select');l.htmlFor=id;l.textContent=caption;s.id=id;for(const [id,text]of options){const o=document.createElement('option');o.value=String(id);o.textContent=String(text);s.append(o)}s.value=String(value);s.disabled=busy||controller?.busy||!state.enabled;s.onchange=change;fields.append(l,s);return s};
  add('設置する台数','bankCount',Array.from({length:bankCapacity(data,catalog.machine_id)},(_,i)=>[i+1,String(i+1)]),state.tools.length,e=>{const n=Number(e.target.value),tools=state.tools.slice(0,n);while(tools.length<n)tools.push(source(choices[tools.length%choices.length]));return select({...state,tools,active:Math.min(state.active,n-1)})});
  state.tools.forEach((value,i)=>add('ドック '+(i+1),'bankTool'+i,choices.map(v=>[source(v),label(v)]),value,e=>{const tools=[...state.tools];tools[i]=e.target.value;return select({...state,tools})}));
  add('使用中のヘッド','bankActive',state.tools.map((id,i)=>[i,'T'+i+' · '+label(choices.find(v=>source(v)===id))]),state.active,e=>select({...state,active:Number(e.target.value)}));
  status.textContent=state.enabled?'ドック '+state.tools.length+'基 · T'+state.active+'をガントリーに装着。残りは固定ドックで待機。':'ツールバンクはオフです。通常のヘッド構成を選べます。';
  const down=bankBedReferenceDrop(catalog,data,state,controller?.current);if(state.enabled&&down>0)status.append(Object.assign(document.createElement('span'),{textContent:` ベッド表示補正 ${down.toFixed(2)} mm。ドッキング動作は未検証。`}));
 }
 async function select(next){if(!controller||busy||controller.busy)return;busy=true;menus();let error;try{next=normalizeBank(next,catalog,data,controller.current.gantry);const v=bankChoices(catalog,data,controller.current.gantry).find(v=>source(v)===next.tools[next.active]);const applied=await controller.selectVariant(next.enabled?v.id:controller.current.id,{...extras.getExtras?.(),tool_bank:next});if(applied===false)throw Error('ヘッドを切り替えられませんでした。')}catch(e){error=e}finally{busy=false;menus();if(error)status.textContent=error.message}}
 enabled.onchange=e=>select({...state,enabled:e.target.checked});
 async function install(variant){
  const choices=bankChoices(catalog,data,variant.gantry);let next=state;
  if(variant.gantry!==previousGantry){const fresh=initialBank(catalog,data,variant.gantry),oldChoices=bankChoices(catalog,data,previousGantry);fresh.tools=state.tools.map(id=>{const family=oldChoices.find(v=>source(v)===id)?.toolhead;return source(choices.find(v=>v.toolhead===family)||choices[0])});fresh.active=state.active;fresh.enabled=state.enabled;next=fresh}
  const match=choices.find(v=>v.id===variant.id);if(next.enabled){next={...next,enabled:!!match,tools:[...next.tools]};if(match)next.tools[next.active]=source(match)}
  // Stage both active and parked geometry before either visible assembly changes.
  await rig.install(variant,next);state=next;previousGantry=variant.gantry;menus();
 }
 const options={...extras,getExtras:()=>({...extras.getExtras?.(),tool_bank:JSON.parse(JSON.stringify(state))}),validateExtras:value=>{extras.validateExtras?.(value);if(value.tool_bank)normalizeBank(value.tool_bank,catalog,data,catalog.variants.find(v=>v.id===value.configuration)?.gantry||previousGantry)},applyExtras:async value=>{await extras.applyExtras?.(value);if(value.tool_bank){const next=normalizeBank(value.tool_bank,catalog,data,rig.active?.gantry);await rig.setBank(next);state=next;menus()}},onSettled:v=>{extras.onSettled?.(v);menus();if(!v)return;const u=new URL(location.href);if(state.enabled)u.searchParams.set('tools',JSON.stringify(state));else u.searchParams.delete('tools');history.replaceState(null,'',u)}};
 return {install,options,async bind(value){controller=value;menus();if(urlError)status.textContent=urlError.message;else if(urlState)await select(urlState)},get state(){return state}};
}
