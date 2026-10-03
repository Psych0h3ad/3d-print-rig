import {headWitnessCheck}from './head-validation.mjs?v=head-witness-33';
export function createHeadInspection(target,{setPose}={}){
 const panel=document.createElement('details');panel.id='headTravelInspection';panel.hidden=true;panel.innerHTML='<summary>ヘッドと機体の干渉</summary><p class="foot" data-scope></p><ol data-findings class="foot"></ol>';
 target.after(panel);
 function update(variant){
  const check=headWitnessCheck(variant);panel.hidden=!check;if(!check)return;const list=panel.querySelector('[data-findings]');list.replaceChildren();
  panel.open=check.intersections.length>0;panel.querySelector('[data-scope]').textContent=check.lines.join(' ');panel.classList.toggle('notice',check.intersections.length>0);
  for(const hit of check.intersections){
   const li=document.createElement('li'),caption=document.createElement('p');caption.dataset.part=hit.head_part;caption.textContent=`${hit.head_name} / ${hit.fixture_name} · ${hit.overlap_mm3.toFixed(3)} mm³`;li.append(caption);
   const pose=document.createElement('p');pose.textContent='XYZ (mm) '+hit.display_xyz_mm.map(n=>n.toFixed(3)).join(' / ');li.append(pose);
   if(setPose){const button=document.createElement('button');button.type='button';button.textContent='干渉姿勢を見る';button.onclick=()=>setPose([...hit.display_xyz_mm],hit);li.append(button)}
   list.append(li);
  }
  if(check.interfaces.length){const li=document.createElement('li');li.textContent='締結部・接点・参考配線の交差候補は別扱いです。機体全体の適合判定には使いません。';list.append(li)}
 }
 return {update,panel};
}
