export async function setupConfigurations(catalog,install){
 const $=s=>document.querySelector(s),ids=['gantry','toolhead','hotend','extruder'];
 const add=(id,rows,previous)=>{const select=$('#'+id+'Config');select.replaceChildren(...rows.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.label;return o}));if(rows.some(r=>r.id===previous))select.value=previous};
 const selection=()=>Object.fromEntries(ids.map(k=>[k,$('#'+k+'Config').value]));
 let actual;
 const initial=catalog.variants.find(v=>v.id===new URLSearchParams(location.search).get('configuration'));
 add('gantry',catalog.gantries,initial?.gantry);add('toolhead',catalog.toolheads,initial?.toolhead);
 function choices(){const s=selection(),candidates=catalog.variants.filter(v=>v.toolhead===s.toolhead);add('hotend',catalog.hotends.filter(h=>candidates.some(v=>v.hotend===h.id)),s.hotend);add('extruder',catalog.extruders.filter(e=>candidates.some(v=>v.extruder===e.id)),s.extruder)}
 function commit(v){actual=v;const url=new URL(location.href);url.searchParams.set('configuration',v.id);history.replaceState(null,'',url);$('#configSummary').textContent=[catalog.gantries.find(x=>x.id===v.gantry).label,catalog.toolheads.find(x=>x.id===v.toolhead).label,catalog.hotends.find(x=>x.id===v.hotend).label,catalog.extruders.find(x=>x.id===v.extruder).label].join(' ／ ');$('#configRequirements').replaceChildren(...v.notes.map(s=>{const li=document.createElement('li');li.textContent=s;return li}));$('#configStatus').textContent=`3D切替済み · ${v.xy_motors}モーター · ${v.belt_width_mm} mmベルト`;$('#configStatus').dataset.variant=v.id}
 async function refresh(){choices();const s=selection(),v=catalog.variants.find(v=>ids.every(k=>v[k]===s[k]));if(!v)return;for(const k of ids)$('#'+k+'Config').disabled=true;$('#configStatus').textContent='選択したCADを読み込み中…';try{await install(v);commit(v)}catch(e){if(actual){for(const k of ids)$('#'+k+'Config').value=actual[k];choices()}$('#configStatus').textContent='切替に失敗しました。直前の構成を表示中。';console.error(e)}finally{for(const k of ids)$('#'+k+'Config').disabled=false}}
 for(const k of ids)$('#'+k+'Config').onchange=refresh;
 for(const row of catalog.sources){const a=document.createElement('a');a.href=row.url;a.textContent=row.label;a.target='_blank';a.rel='noopener';$('#modSources').append(a,document.createTextNode('　'))}
 $('#saveConfiguration').onclick=()=>{if(!actual)return;const url=URL.createObjectURL(new Blob([JSON.stringify(actual,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=actual.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 choices();if(initial){$('#hotendConfig').value=initial.hotend;$('#extruderConfig').value=initial.extruder}await refresh();
}
