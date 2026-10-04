export const affiliateProducts=[
 {id:'siboor_trident',label:'SIBOOR Trident',url:'https://s.click.aliexpress.com/e/_c2zpigGp',machines:['siboor_trident_350']},
 {id:'fysetc_v24_pro',label:'FYSETC V2.4 Pro',url:'https://s.click.aliexpress.com/e/_c4UEOUOH',machines:['fysetc_v24_250_pro','fysetc_v24_300_pro','fysetc_v24_350_pro']},
 {id:'siboor_v24_aug',label:'SIBOOR V2.4 R2 AUG',url:'https://s.click.aliexpress.com/e/_c3CPCViD',machines:['siboor_v24_aug_350']},
 {id:'rapido_ace_uhf',label:'Rapido Ace UHF · PT1000',url:'https://s.click.aliexpress.com/e/_c4D7f7kz',components:['rapido_ace_uhf'],hotends:['rapido_ace_uhf'],sensor:'PT1000'},
 {id:'rapido_ace_hf',label:'Rapido Ace HF · PT1000',url:'https://s.click.aliexpress.com/e/_c45h6LPL',components:['rapido_ace_hf'],hotends:['rapido_ace_hf'],sensor:'PT1000'},
 {id:'chc_xl',label:'CHC XL · Air / WC',url:'https://s.click.aliexpress.com/e/_c4qTFxgd',hotends:['goliath_chcxl']},
 {id:'a4t_kit',label:'A4T ツールヘッドキット',url:'https://s.click.aliexpress.com/e/_c2xgq2gp',toolheads:['a4t']},
 {id:'orbiter2_5',label:'Orbiter V2.5',url:'https://s.click.aliexpress.com/e/_c3oH1VAD',components:['orbiter2_5'],extruders:['orbiter2_5']},
 {id:'mellow_led_bars',label:'Mellow LEDバー · RGB / 白色 · 370 / 270 / 158 mm',url:'https://s.click.aliexpress.com/e/_c4rVd33L'},
 {id:'klicky_probe',label:'Klicky Probe',url:'https://s.click.aliexpress.com/e/_c3W9lGa5',components:['klicky_probe']},
];
export function productsFor({machine,component,hotend,toolhead,extruder}={}){
 return affiliateProducts.filter(p=>p.machines?.includes(machine)||p.components?.includes(component)||p.hotends?.includes(hotend)||p.toolheads?.includes(toolhead)||p.extruders?.includes(extruder));
}
export function setupProductDirectory(){
 if(document.querySelector('#productDirectory'))return;const actions=document.querySelector('.header-actions');if(!actions)return;
 const button=document.createElement('button');button.textContent='関連製品';button.id='openProducts';actions.append(button);
 const dialog=document.createElement('dialog');dialog.id='productDirectory';const head=document.createElement('div');head.className='dialog-head';const title=document.createElement('h2');title.textContent='関連製品';const close=document.createElement('button');close.className='close';close.textContent='';close.setAttribute('aria-label','閉じる');head.append(title,close);
 const body=document.createElement('div');body.className='dialog-body';for(const product of affiliateProducts){const group=document.createElement('div');group.className='purchase-link';const a=document.createElement('a');a.textContent=product.label;a.href=product.url;a.target='_blank';a.rel='sponsored noopener noreferrer';const note=document.createElement('small');note.textContent='アフィリエイトリンク';group.append(a,note);body.append(group)}dialog.append(head,body);document.body.append(dialog);button.onclick=()=>dialog.showModal();close.onclick=()=>dialog.close();
}
export function renderProductLinks(target,context){
 if(!target)return;const products=productsFor(context);target.replaceChildren();target.hidden=!products.length;
 for(const product of products){const row=document.createElement('div');row.className='purchase-link';const a=document.createElement('a');a.textContent=product.label+'を見る';a.href=product.url;a.target='_blank';a.rel='sponsored noopener noreferrer';const disclosure=document.createElement('small');disclosure.textContent='アフィリエイトリンク';row.append(a,disclosure);target.append(row)}
}
