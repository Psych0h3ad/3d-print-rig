import {workspaceFrame,workspaceTask,workspaceListen,onWorkspaceDispose} from './workspace-lifecycle.mjs';
import * as THREE from 'three';
import {nozzlePoint} from './gcode-preview.mjs?v=b286fb69d375531c6e91';
import {compileVirtualPrinter,createVirtualPlayback,virtualSettingsFromAdapter} from './virtual-printer-emulator.mjs?v=82f4d419283bf6313caf';

export function displayedMachineLimits(){
 return Object.fromEntries(['X','Y','Z'].map(a=>{const input=document.querySelector('#'+a.toLowerCase());return [a,[Number(input.min),Number(input.max)]]}));
}

/** The renderer receives XYZ only. Tools/heaters/contacts remain offline logical state. */
export function setupGcodePanel({container,profile,adapter,scene,setPose,render,getPose=()=>adapter.getPose(),getLimits=()=>profile.display_limits_mm,toNozzle=xyz=>nozzlePoint(profile,xyz),pathOffset=()=>[0,0,0],getContext=()=>null,beforePlayback=()=>{},drawPath=true,idPrefix='',coordinateNote='XYZはビューアの表示座標（mm）です。到達範囲は現在のアダプター設定です。実機の原点・接触位置や連続クリアランスを保証しません。',getFirmwareSettings=()=>virtualSettingsFromAdapter({profile,initial:getPose(),limits:getLimits()})}){
 const panel=document.createElement('details');panel.id='gcodePanel';panel.innerHTML='<summary>G-code · オフライン仮想プリンター</summary><p class="foot">入力から移動と仮想状態を確認するプレビューです。実機には接続しません。</p><label for="gcodeText">G-code</label><textarea id="gcodeText" rows="9" spellcheck="false" aria-label="G-code"></textarea><div class="buttons"><button id="gcodeExample">矩形の例</button><button id="gcodeFile">ファイルを開く</button><button id="gcodeCompile" class="primary">軌跡を確認</button></div><input id="gcodeFileInput" type="file" accept=".gcode,.gco,.gc,.txt" hidden><details><summary>マクロと仮想設定</summary><label for="gcodeMacros">Klipperマクロ設定</label><textarea id="gcodeMacros" rows="8" spellcheck="false"></textarea><label for="gcodeSettings">開始位置・範囲・接触・ヒーター設定（JSON）</label><textarea id="gcodeSettings" rows="12" spellcheck="false"></textarea><button id="gcodeMeasured">ビューアの軸設定を読み直す</button><p class="foot">接触位置は根拠付きの設定が必要です。接触は位置の記録のみで、ホーミング・プローブ・ドックの経路を生成しません。温度待ちは仮想温度を目標値に合わせます。加熱時間と温度変化は再現しません。</p></details><div class="buttons"><button id="gcodePlay" disabled>再生</button><button id="gcodeStep" disabled>1行進む</button><button id="gcodeStart" disabled>開始位置</button><button id="gcodeSave" disabled>仮想状態を保存</button><button id="gcodeLoad">仮想状態を読み込む</button></div><input id="gcodeReplayFile" type="file" accept=".json" hidden><label for="gcodeSpeed">再生速度</label><select id="gcodeSpeed"><option value="1" selected>1×</option><option value="4">4×</option><option value="10">10×</option></select><label for="gcodeFrame">再生位置</label><input id="gcodeFrame" type="range" min="0" max="0" value="0" step="0.01" disabled aria-label="G-codeの再生時刻"><p id="gcodeTime" class="foot"></p><p id="gcodeLine" class="foot"></p><p id="gcodeVirtualState" class="foot" aria-live="polite"></p><p id="gcodeStatus" class="status" aria-live="polite"></p><details><summary>イベントの記録</summary><ol id="gcodeEvents"></ol></details><details><summary>対応する命令</summary><p class="foot">座標プレビューの命令、設定付きG28/PROBE、ヒーター・ファンの仮想状態、ACTIVATE_EXTRUDER、SET_GCODE_VARIABLE、制限付きJinja式・if・for・setに対応。未対応の構文・命令で停止します。T番号は登録したマクロのみ。ツール切替は仮想イベントで、取り付けや交換経路の検証を意味しません。</p><pre id="gcodeCapabilities"></pre><a href="https://www.klipper3d.org/Command_Templates.html" target="_blank" rel="noopener">Klipperのマクロ仕様</a></details>';
 if(!/^[A-Za-z0-9_]*$/.test(idPrefix))throw Error('Invalid G-code panel ID prefix');
 if(idPrefix){panel.id=idPrefix+'gcodePanel';panel.innerHTML=panel.innerHTML.replace(/(id|for)="(gcode[^"]*)"/g,(_,a,id)=>a+'="'+idPrefix+id+'"')}
 const metadataLabel=document.createElement('label');metadataLabel.htmlFor=idPrefix+'gcodeMetadata';metadataLabel.textContent='入力の出典・座標系（JSON）';
 const metadataInput=document.createElement('textarea');metadataInput.id=idPrefix+'gcodeMetadata';metadataInput.rows=4;metadataInput.spellcheck=false;metadataInput.value='{}';panel.querySelector('#'+idPrefix+'gcodeSettings').after(metadataLabel,metadataInput);
 const note=document.createElement('p');note.id=idPrefix+'gcodeAxisNotice';note.className='foot';note.textContent=coordinateNote+(!drawPath&&!coordinateNote.includes('ノズル基準の軌跡線')&&measured().motion_enabled!==false?' ノズル基準の軌跡線は表示しません。':'');panel.querySelector('summary').after(note);
 container.append(panel);const $=id=>panel.querySelector('#'+idPrefix+id),path=new THREE.Group();path.name='Offline_Gcode_Path';scene.add(path);
 let result=null,replay=null,request=0,context=null,settingsEdited=false,generation=0,disposed=false;
 const controls=['gcodePlay','gcodeStep','gcodeStart','gcodeFrame','gcodeSave'];
 function measured(){return getFirmwareSettings()}
 function signature(initial=result?.initial.slice(0,3)){
  const firmware=structuredClone(measured());delete firmware.initial;
  return JSON.stringify({limits:getLimits(),frame:drawPath&&initial?toNozzle(initial):null,context:getContext(),firmware});
 }
 function pause(){replay?.pause();if(request)cancelAnimationFrame(request);request=0;$('gcodePlay').textContent='再生';document.body.dataset.gcodePlaying='false'}
 function clearPath(){for(const o of [...path.children]){path.remove(o);o.geometry.dispose();o.material.dispose()}render()}
 function invalidate(){generation++;pause();result=null;replay=null;context=null;clearPath();for(const id of controls)$(id).disabled=true;$('gcodeStatus').textContent='現在の構成と位置から軌跡を再計算してください';for(const id of ['gcodeLine','gcodeTime','gcodeVirtualState','gcodeCapabilities','gcodeEvents'])$(id).textContent='';document.body.dataset.gcodeComplete='false'}
 function valid(){if(!result?.complete||!replay)return false;if(signature()!==context||measured().motion_enabled!==false&&getPose().some((v,i)=>!Number.isFinite(v)||Math.abs(v-replay.read().position[i])>1e-5)){invalidate();return false}return true}
 function updatePath(pose=getPose()){if(!drawPath)return;const p=pathOffset(pose);path.position.set(p[0]/1000,p[2]/1000,-p[1]/1000)}
 function present(sample){
  const {position,event,state,time_s}=sample,pose=position.slice(0,3);setPose(pose);const actual=getPose();if(actual.some((v,i)=>!Number.isFinite(v)||Math.abs(v-pose[i])>1e-5))throw Error('機体の可動範囲が変わりました。軌跡を再計算してください');
  updatePath(actual);$('gcodeFrame').value=time_s;$('gcodeTime').textContent=time_s.toFixed(2)+' / '+result.duration_s.toFixed(2)+' s';
  $('gcodeLine').textContent=event?`${event.line}行目 · ${event.source?.macro?event.source.macro+':'+event.source.macro_line+' · ':''}${event.text} · E ${position[3].toFixed(3)} mm`:'開始位置';
  $('gcodeVirtualState').textContent=`仮想ツール: ${state.active_tool} · ホーム済み: ${state.homed_axes.join('')||'—'} · ファン: ${(state.fan*100).toFixed(0)}%`+Object.entries(state.heaters).map(([name,h])=>` · ${name}: ${h.temperature_c.toFixed(1)} / ${h.target_c.toFixed(1)} °C`).join('');
  document.body.dataset.gcodeTime=time_s.toFixed(6);render();
 }
 function fail(e){invalidate();$('gcodeStatus').textContent=e.message;$('gcodeStatus').classList.add('notice')}
 function seekEvent(n){if(!valid())return;try{present(replay.seekEvent(n))}catch(e){fail(e)}}
 function seekTime(seconds){if(!valid())return;try{present(replay.seekTime(seconds));if(!replay.playing)pause()}catch(e){fail(e)}}
 function draw(){clearPath();if(!drawPath)return;path.position.set(0,0,0);for(const extrude of [false,true]){const points=[];for(const e of result.events)if(e.draw_path!==false&&e.distance_mm>0&&(e.extrusion_mm>0)===extrude)for(const xyz of [e.from,e.to]){const p=toNozzle(xyz.slice(0,3));if(p.some(v=>!Number.isFinite(v)))throw Error('ノズルの座標が不正です');points.push(new THREE.Vector3(p[0]/1000,p[2]/1000,-p[1]/1000))}if(points.length)path.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:extrude?'#d95142':'#278eb0'})))}updatePath();render()}
 function install(program,cursor=null){
  result=program;replay=program.complete?createVirtualPlayback(program):null;context=signature();$('gcodeFrame').max=Math.ceil(program.duration_s*100)/100;$('gcodeFrame').value=0;const enabled=program.complete&&program.events.length>0;for(const id of controls)$(id).disabled=!enabled;draw();
  $('gcodeCapabilities').textContent=JSON.stringify({...program.capabilities,nozzle_path:drawPath,renderer_xyz:measured().motion_enabled!==false},null,2);$('gcodeEvents').textContent='';
  const records=program.events.filter(e=>!['move','state','dwell'].includes(e.kind));for(const e of records.slice(0,200)){const li=document.createElement('li');li.textContent=`${e.line} · ${e.kind} · ${e.text}`;$('gcodeEvents').append(li)}
  if(records.length>200){const li=document.createElement('li');li.textContent='イベント一覧は先頭200件を表示します。再生には全件を含みます。';$('gcodeEvents').append(li)}
  $('gcodeStatus').classList.toggle('notice',!!program.error);$('gcodeStatus').textContent=program.error?`${program.error.line}行目で停止：${program.error.source?.macro?program.error.source.macro+':'+program.error.source.macro_line+' · ':''}${program.error.message}。修正後に再計算してください。`:`${program.events.length}命令 · 送り速度による概算 ${program.duration_s.toFixed(1)}秒`+(program.time_excludes_thermal_waits?' · 温度待ちの時間は含みません':'');document.body.dataset.gcodeComplete=String(program.complete);
  if(replay)present(cursor?replay.restore(cursor):replay.reset());
 }
 function checkedSettings(value){
  const limits=getLimits();if((value?.motion_enabled??true)!==(measured().motion_enabled??true))throw Error('XYZ binding capability cannot be changed in virtual settings');if(!value?.limits||['X','Y','Z'].some(a=>!Array.isArray(value.limits[a])||value.limits[a][0]<limits[a][0]||value.limits[a][1]>limits[a][1]))throw Error('仮想範囲は現在のビューア軸範囲内に設定してください');return value;
 }
 function capture(){if(!valid())throw Error('再計算が必要です');return {schema:'offline-virtual-printer-file/1',context,settings:structuredClone(result.settings),macros:result.macro_config,gcode:result.source_text,source_metadata:structuredClone(result.source_metadata),cursor:replay.save()}}
 function restore(data){
  if(!data||data.schema!=='offline-virtual-printer-file/1'||typeof data.context!=='string'||typeof data.gcode!=='string'||typeof data.macros!=='string')throw Error('仮想状態ファイルが不正です');
  const settings=checkedSettings(data.settings);if(signature(settings.initial)!==data.context)throw Error('保存時の機体構成・測定設定と一致しません');
  const program=compileVirtualPrinter(data.gcode,{settings,macros:data.macros,sourceMetadata:data.source_metadata??{}});if(!program.complete)throw Error(program.error.message);
  createVirtualPlayback(program).restore(data.cursor);if(!prepare())return;generation++;pause();$('gcodeText').value=data.gcode;$('gcodeMacros').value=data.macros;$('gcodeMetadata').value=JSON.stringify(program.source_metadata,null,2);$('gcodeSettings').value=JSON.stringify(settings,null,2);settingsEdited=true;install(program,data.cursor);
 }
 function prepare(){try{beforePlayback();return true}catch(e){fail(e);return false}}
 function tick(now){request=0;if(!replay?.playing||!valid())return;if(document.hidden){pause();return}try{present(replay.advance(now,Number($('gcodeSpeed').value)));if(replay.playing)request=workspaceFrame(tick);else pause()}catch(e){fail(e)}}
 $('gcodePlay').onclick=()=>{if(replay?.playing){pause();return}if(!valid()||!prepare())return;if(replay.index===result.events.length)seekEvent(0);if(!replay)return;replay.play(performance.now());$('gcodePlay').textContent='一時停止';document.body.dataset.gcodePlaying='true';request=workspaceFrame(tick)};
 $('gcodeStep').onclick=()=>{pause();if(!valid()||!prepare())return;seekEvent(Math.min(replay.index+1,result.events.length))};$('gcodeStart').onclick=()=>{pause();if(!valid()||!prepare())return;seekEvent(0)};$('gcodeFrame').oninput=()=>{pause();if(!valid()||!prepare())return;seekTime(Number($('gcodeFrame').value))};
 $('gcodeText').oninput=invalidate;$('gcodeMacros').oninput=invalidate;$('gcodeMetadata').oninput=invalidate;$('gcodeSettings').oninput=()=>{settingsEdited=true;invalidate()};
 function refreshSettings(){settingsEdited=false;$('gcodeExample').disabled=measured().motion_enabled===false;$('gcodeSettings').value=JSON.stringify(measured(),null,2)}
 refreshSettings();$('gcodeMeasured').onclick=()=>{invalidate();refreshSettings()};
 $('gcodeExample').onclick=()=>{invalidate();const {X,Y,Z}=getLimits(),pose=getPose(),z=Math.max(Z[0],Math.min(Z[1],Math.max(10,pose[2]))),x1=X[0]+(X[1]-X[0])*.25,x2=X[0]+(X[1]-X[0])*.75,y1=Y[0]+(Y[1]-Y[0])*.25,y2=Y[0]+(Y[1]-Y[0])*.75,f=v=>v.toFixed(3);$('gcodeText').value=`G21\nG90\nM83\nG1 Z${f(z)} F600\nG1 X${f(x1)} Y${f(y1)} F3000\nG1 X${f(x2)} E2\nG1 Y${f(y2)} E2\nG1 X${f(x1)} E2\nG1 Y${f(y1)} E2\nG4 P500`};
 $('gcodeCompile').onclick=()=>{generation++;pause();clearPath();if(!prepare())return;try{if(!settingsEdited)refreshSettings();const settings=checkedSettings(JSON.parse($('gcodeSettings').value));install(compileVirtualPrinter($('gcodeText').value,{settings,macros:$('gcodeMacros').value,sourceMetadata:JSON.parse($('gcodeMetadata').value)}))}catch(e){fail(e)}};
 $('gcodeSave').onclick=()=>{try{pause();const url=URL.createObjectURL(new Blob([JSON.stringify(capture(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='offline-virtual-printer.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('gcodeStatus').textContent='仮想状態を保存しました。'}catch(e){fail(e)}};
 $('gcodeLoad').onclick=()=>$('gcodeReplayFile').click();$('gcodeReplayFile').onchange=()=>workspaceTask(async()=>{const file=$('gcodeReplayFile').files[0],token=generation;$('gcodeReplayFile').value='';if(!file)return;try{if(file.size>3000000)throw Error('仮想状態ファイルは3 MB以内です');const text=await file.text();if(disposed||token!==generation)return;restore(JSON.parse(text))}catch(e){if(!disposed&&token===generation)$('gcodeStatus').textContent=e.message}});
 $('gcodeFile').onclick=()=>$('gcodeFileInput').click();$('gcodeFileInput').onchange=()=>workspaceTask(async()=>{const file=$('gcodeFileInput').files[0],token=generation;$('gcodeFileInput').value='';if(!file)return;try{if(file.size>2000000)throw Error('ファイルは2 MB以内です');const text=await file.text();if(disposed||token!==generation)return;invalidate();$('gcodeText').value=text}catch(e){if(!disposed&&token===generation)$('gcodeStatus').textContent=e.message}});
 const nativeInputs='#x,#y,#z,#x0,#x1,#x2,#nominal,#fold,#carriageMode,#copyOffset,#mirrorSum,#configurationFile,#headInstallation,#zInstallation,#probeInstallation';
 const nativeButtons='#reset,#resetPose,#minPose,#maxPose,#motionPlay,#animatePose,#foldPlay,#unfoldPlay,#applyMode,#runGcode,#resetGcode,#contacts button';
 function externalChange(e){if(e.target.closest?.('#'+panel.id))return;invalidate();if(!settingsEdited)refreshSettings()}
 workspaceListen(document,'input',e=>{if(e.target.matches?.(nativeInputs))externalChange(e)});
 workspaceListen(document,'click',e=>{if(e.target.closest?.('[role="tab"]'))pause();if(e.target.closest?.(nativeButtons))externalChange(e)});
 workspaceListen(document,'change',e=>{if(e.target.matches?.(nativeInputs)||e.target.closest?.('#configurationControls,#changerBank')||e.target.matches?.('[data-mod]'))externalChange(e)});
 workspaceListen(panel,'toggle',()=>{if(!panel.open)pause()});workspaceListen(document,'visibilitychange',()=>{if(document.hidden)pause()});workspaceListen(window,'pagehide',pause);onWorkspaceDispose(()=>{disposed=true;generation++;pause();clearPath();scene.remove(path)});
 return {invalidate,pause,updatePath,seekTime,capture,restore,get result(){return result},get playing(){return replay?.playing??false}};
}
