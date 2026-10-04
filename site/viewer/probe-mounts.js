import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=extra-machines-55';
import {workspaceTask} from './workspace-lifecycle.mjs';
import {probeCheck,probeOptionSuffix} from './probe-checks.js?v=sphinx-report-45';
export function stockProbeFit(row){return row.module?{...row,id:row.id,physical_passed:row.physical_passed??null,height_passed:row.height_passed??null,metal_keepout_verified:row.metal_keepout_verified??false}:null}
export function probeMountSummary(row){
 if(!row.module){const check=probeCheck({probe:row.id});return {text:row.label+(check.warning?' ／ '+check.label:''),warning:check.warning}}
 const check=probeCheck({probe:row.id,fit:{probe:stockProbeFit(row)}}),lines=[row.label];
 if(Number.isFinite(row.coil_nozzle_gap_mm))lines.push(`ノズルより ${row.coil_nozzle_gap_mm.toFixed(2)} mm上`);
 if(Number.isFinite(row.spacer_mm)&&row.spacer_mm>0)lines.push(`絶縁スペーサー ${row.spacer_mm.toFixed(1)} mm × 2`);
 if(Number.isFinite(row.minimum_probe_bed_clearance_at_nozzle_contact_mm))lines.push(`ノズル接触時の最下部／ベッド間隔 ${row.minimum_probe_bed_clearance_at_nozzle_contact_mm.toFixed(3)} mm`);
 return {text:lines.join(' · ')+' ／ '+check.label+(check.lines.length?'。'+check.lines.join(' '):''),warning:check.warning};
}
// Probe assemblies move with the toolhead, independently of fixed frame mods.
export class ProbeMountSelection{
 constructor(catalog,load,setHidden){this.catalog=catalog;this.load=load;this.setHidden=setHidden;this.assets=new Map();this.id=catalog.probes[0].id;this.delta=[0,0,0]}
 async apply(id){return workspaceTask(async()=>{
  const row=this.catalog.probes.find(p=>p.id===id);if(!row)throw Error('未登録のプローブです。');
  let asset;if(row.module){asset=await this.load(row.module);this.assets.set(row.module,asset)}
  for(const a of this.assets.values())a.root.visible=false;
  const all=[...new Set(this.catalog.probes.flatMap(p=>p.hidden_stock_keys||[]))];
  this.setHidden(all,false);this.setHidden(row.hidden_stock_keys||[],true);
  this.id=id;if(asset)asset.root.visible=true;this.setPose(this.delta);return row;
 });}
 setPose(delta){
  if(!Array.isArray(delta)||delta.length!==3||delta.some(v=>!Number.isFinite(v)))throw Error('無効なヘッド位置です。');
  this.delta=delta.slice();const row=this.catalog.probes.find(p=>p.id===this.id),a=this.assets.get(row.module);
  if(!a)return;const p=row.translation_mm.map((v,i)=>v+delta[i]);a.root.position.set(p[0]/1000,p[2]/1000,-p[1]/1000);
 }
 partDelta(){const row=this.catalog.probes.find(p=>p.id===this.id);return (this.assets.get(row.module)?.meta.parts.length||0)-(row.hidden_stock_keys?.length||0)}
}
export async function setupProbeMounts(catalog,{load,setHidden,update,selectId='probeConfig'}){return workspaceTask(async()=>{
 const select=document.querySelector('#'+selectId),status=document.querySelector('#probeStatus');
 const state=new ProbeMountSelection(catalog,load,setHidden);let busy=false;
 select.replaceChildren(...catalog.probes.map(row=>{const o=document.createElement('option');o.value=row.id;o.textContent=row.label+probeOptionSuffix({probe:row.id,fit:{probe:stockProbeFit(row)}});return o}));
 async function apply(id){return workspaceTask(async()=>{
  if(busy)return;busy=true;select.disabled=true;
  try{
   const row=await state.apply(id);select.value=id;
   const summary=probeMountSummary(row);status.textContent=summary.text;status.classList.toggle('notice',summary.warning);
   const url=new URL(location.href);url.searchParams.set('probe',id);replaceWorkspaceURL(null,'',url);update();
  }catch(e){select.value=state.id;status.textContent='プローブを読み込めませんでした。直前の構成を表示中。';console.error(e)}
  finally{busy=false;select.disabled=false}
 });}
 select.onchange=()=>apply(select.value);
 const requested=new URLSearchParams(location.search).get('probe');await apply(catalog.probes.some(p=>p.id===requested)?requested:state.id);
 return state;
});}
