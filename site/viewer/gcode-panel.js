import * as THREE from 'three';
import {compileGcode,nozzlePoint} from './gcode-preview.mjs?v=head-witness-33';
import {sampleGcode} from './gcode-timeline.mjs?v=head-witness-33';

export function displayedMachineLimits(){
 return Object.fromEntries(['X','Y','Z'].map(a=>{const input=document.querySelector('#'+a.toLowerCase());return [a,[Number(input.min),Number(input.max)]]}));
}

/** A program owns the pose only during playback. Machine geometry owns limits/datums. */
export function setupGcodePanel({container,profile,adapter,scene,setPose,render,getPose=()=>adapter.getPose(),getLimits=()=>profile.display_limits_mm,toNozzle=xyz=>nozzlePoint(profile,xyz),pathOffset=()=>[0,0,0],getContext=()=>null,beforePlayback=()=>{}}){
 const panel=document.createElement('details');panel.id='gcodePanel';panel.innerHTML='<summary>G-codeの再生</summary><p class="foot">現在の構成とXYZから、移動を3Dで再生。</p><label for="gcodeText">G-code</label><textarea id="gcodeText" rows="9" spellcheck="false" aria-label="G-code"></textarea><div class="buttons"><button id="gcodeExample">矩形の例</button><button id="gcodeFile">ファイルを開く</button><button id="gcodeCompile" class="primary">軌跡を確認</button></div><input id="gcodeFileInput" type="file" accept=".gcode,.gco,.gc,.txt" hidden><div class="buttons"><button id="gcodePlay" disabled>再生</button><button id="gcodeStep" disabled>1行進む</button><button id="gcodeStart" disabled>開始位置</button></div><label for="gcodeSpeed">再生速度</label><select id="gcodeSpeed"><option value="1" selected>1×</option><option value="4">4×</option><option value="10">10×</option></select><label for="gcodeFrame">再生位置</label><input id="gcodeFrame" type="range" min="0" max="0" value="0" step="0.01" disabled aria-label="G-codeの再生時刻"><p id="gcodeTime" class="foot"></p><p id="gcodeLine" class="foot"></p><p id="gcodeStatus" class="status" aria-live="polite"></p><details><summary>対応する命令</summary><p class="foot">G0/G1、G21、G90/G91、G92、M82/M83、G4 P、M220/M221、座標オフセットと状態保存に対応。未対応の命令で停止。G28・Jinjaマクロ・温度制御・接触判定・加速度は未対応です。</p><a href="https://www.klipper3d.org/G-Codes.html" target="_blank" rel="noopener">KlipperのG-code仕様</a></details>';
 container.append(panel);const $=id=>panel.querySelector('#'+id),path=new THREE.Group();path.name='Offline_Gcode_Path';scene.add(path);
 let result=null,index=0,playing=false,time=0,last=0,request=0,context=null;
 const signature=()=>JSON.stringify({limits:getLimits(),frame:result?toNozzle(result.initial.slice(0,3)):null,context:getContext()});
 function pause(){playing=false;if(request)cancelAnimationFrame(request);request=0;$('gcodePlay').textContent='再生';document.body.dataset.gcodePlaying='false'}
 function clearPath(){for(const o of [...path.children]){path.remove(o);o.geometry.dispose();o.material.dispose()}render()}
 function invalidate(){pause();result=null;context=null;clearPath();for(const id of ['gcodePlay','gcodeStep','gcodeStart','gcodeFrame'])$(id).disabled=true;$('gcodeStatus').textContent='現在の構成と位置から軌跡を再計算してください';$('gcodeLine').textContent='';$('gcodeTime').textContent='';document.body.dataset.gcodeComplete='false'}
 function valid(){if(!result?.complete)return false;if(signature()!==context){invalidate();return false}return true}
 function updatePath(pose=getPose()){const p=pathOffset(pose);path.position.set(p[0]/1000,p[2]/1000,-p[1]/1000)}
 function present(position,event){
  const pose=position.slice(0,3);setPose(pose);const actual=getPose();if(actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-pose[i])>1e-5))throw Error('機体の可動範囲が変わりました。軌跡を再計算してください');
  updatePath(actual);$('gcodeFrame').value=time;$('gcodeTime').textContent=time.toFixed(2)+' / '+result.duration_s.toFixed(2)+' s';
  $('gcodeLine').textContent=event?`${event.line}行目 · ${event.text} · E ${position[3].toFixed(3)} mm`:'開始位置';document.body.dataset.gcodeTime=time.toFixed(6);render();
 }
 function fail(e){invalidate();$('gcodeStatus').textContent=e.message;$('gcodeStatus').classList.add('notice')}
 function seekEvent(n){if(!valid())return;try{index=Math.max(0,Math.min(result.events.length,n));const e=result.events[index-1];time=e?.elapsed_s||0;present(e?.to||result.initial,e)}catch(e){fail(e)}}
 function seekTime(seconds){if(!valid())return;try{const s=sampleGcode(result,seconds);time=s.time_s;index=s.index;present(s.position,s.event);if(s.done)pause()}catch(e){fail(e)}}
 function draw(){clearPath();path.position.set(0,0,0);for(const extrude of [false,true]){const points=[];for(const e of result.events)if(e.distance_mm>0&&(e.extrusion_mm>0)===extrude)for(const xyz of [e.from,e.to]){const p=toNozzle(xyz.slice(0,3));if(p.some(v=>!Number.isFinite(v)))throw Error('ノズルの座標が不正です');points.push(new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000))}if(points.length)path.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:extrude?'#d95142':'#278eb0'})))}updatePath();render()}
 function tick(now){request=0;if(!playing||!valid())return;if(document.hidden){pause();return}const speed=Number($('gcodeSpeed').value);if(![1,4,10].includes(speed)){fail(Error('再生速度が不正です'));return}const next=time+Math.max(0,(now-last)/1000)*speed;last=now;seekTime(next);if(playing)request=requestAnimationFrame(tick)}
 $('gcodePlay').onclick=()=>{if(playing){pause();return}if(!valid())return;beforePlayback();if(index===result.events.length)seekEvent(0);if(!result?.complete)return;playing=true;last=performance.now();$('gcodePlay').textContent='一時停止';document.body.dataset.gcodePlaying='true';request=requestAnimationFrame(tick)};
 $('gcodeStep').onclick=()=>{pause();if(!valid())return;beforePlayback();seekEvent(index+1)};$('gcodeStart').onclick=()=>{pause();if(!valid())return;beforePlayback();seekEvent(0)};$('gcodeFrame').oninput=()=>{pause();if(!valid())return;beforePlayback();seekTime(Number($('gcodeFrame').value))};
 $('gcodeText').oninput=invalidate;
 $('gcodeExample').onclick=()=>{invalidate();const {X,Y,Z}=getLimits(),pose=getPose(),z=Math.max(Z[0],Math.min(Z[1],Math.max(10,pose[2]))),x1=X[0]+(X[1]-X[0])*.25,x2=X[0]+(X[1]-X[0])*.75,y1=Y[0]+(Y[1]-Y[0])*.25,y2=Y[0]+(Y[1]-Y[0])*.75,f=v=>v.toFixed(3);$('gcodeText').value=`G21\nG90\nM83\nG1 Z${f(z)} F600\nG1 X${f(x1)} Y${f(y1)} F3000\nG1 X${f(x2)} E2\nG1 Y${f(y2)} E2\nG1 X${f(x1)} E2\nG1 Y${f(y1)} E2\nG4 P500`};
 $('gcodeCompile').onclick=()=>{pause();clearPath();beforePlayback();try{result=compileGcode($('gcodeText').value,{initial:getPose(),limits:getLimits()});index=0;time=0;context=signature();$('gcodeFrame').max=result.duration_s;$('gcodeFrame').value=0;const enabled=result.complete&&result.events.length>0;for(const id of ['gcodePlay','gcodeStep','gcodeStart','gcodeFrame'])$(id).disabled=!enabled;draw();$('gcodeStatus').classList.toggle('notice',!!result.error);$('gcodeStatus').textContent=result.error?`${result.error.line}行目で停止：${result.error.message}。修正後に再計算してください。`:`${result.events.length}命令 · 送り速度による概算 ${result.duration_s.toFixed(1)}秒`;document.body.dataset.gcodeComplete=String(result.complete);if(enabled)seekEvent(0)}catch(e){fail(e)}};
 $('gcodeFile').onclick=()=>$('gcodeFileInput').click();$('gcodeFileInput').onchange=async()=>{const f=$('gcodeFileInput').files[0];$('gcodeFileInput').value='';if(!f)return;try{if(f.size>2000000)throw Error('ファイルは2 MB以内です');const text=await f.text();invalidate();$('gcodeText').value=text}catch(e){$('gcodeStatus').textContent=e.message}};
 for(const axis of ['x','y','z'])document.querySelector('#'+axis)?.addEventListener('input',invalidate);document.querySelector('#reset')?.addEventListener('click',invalidate);
 document.addEventListener('change',e=>{if(e.target.closest?.('#configurationControls,#changerBank')||e.target.matches?.('[data-mod]'))invalidate()},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('pagehide',pause);
 return {invalidate,pause,updatePath,seekTime,get result(){return result},get playing(){return playing}};
}
