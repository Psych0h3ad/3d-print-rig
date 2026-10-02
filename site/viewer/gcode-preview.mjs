/** Offline, independently written coordinate preview. No firmware or hardware I/O. */
export const supportedCommands=['G0','G1','G4','G21','G90','G91','G92','M82','M83','M220','M221','SET_GCODE_OFFSET','SAVE_GCODE_STATE','RESTORE_GCODE_STATE'];
const axes=['X','Y','Z','E'],number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
function parse(line){
 const text=line.split(';')[0].trim();if(!text)return null;
 if(/[{}()[\]*]/.test(text))throw Error('テンプレート・丸括弧コメント・チェックサムは未対応です');
 const match=/^([GM]\d+|[A-Za-z_]+)(?=\s|[A-Za-z]|$)/i.exec(text);if(!match)throw Error('コマンドを読み取れません');
 const command=match[1].toUpperCase(),params={};let rest=text.slice(match[0].length).trim();
 if(!supportedCommands.includes(command))throw Error(command+' は未対応です');
 while(rest){
  const p=command.startsWith('G')||/^M\d+$/.test(command)?/^([A-Za-z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/.exec(rest):/^([A-Za-z_]+)=([^\s]+)/.exec(rest);
  if(!p)throw Error('パラメーターを読み取れません: '+rest.slice(0,40));
  const key=p[1].toUpperCase();if(Object.hasOwn(params,key))throw Error(key+' が重複しています');params[key]=p[2];rest=rest.slice(p[0].length).trim();
 }
 return {command,params,text};
}
const view=s=>({position:[...s.position],base:[...s.base],offset:[...s.offset],absolute:s.absolute,absoluteE:s.absoluteE,speed:s.speed,speedFactor:s.speedFactor,extrudeFactor:s.extrudeFactor});
const copy=s=>({...view(s),saved:new Map(s.saved)});
function execute(s,{command:c,params:p},limits){
 const allowed={G0:axes.concat('F'),G1:axes.concat('F'),G4:['P'],G21:[],G90:[],G91:[],G92:axes,M82:[],M83:[],M220:['S'],M221:['S'],SET_GCODE_OFFSET:axes.concat(axes.map(a=>a+'_ADJUST'),'MOVE','MOVE_SPEED'),SAVE_GCODE_STATE:['NAME'],RESTORE_GCODE_STATE:['NAME','MOVE','MOVE_SPEED']}[c];
 for(const k of Object.keys(p))if(!allowed.includes(k))throw Error(c+' の '+k+' は未対応です');
 const n=(k,fallback)=>{if(!Object.hasOwn(p,k))return fallback;if(!number.test(p[k]))throw Error(k+' は数値が必要です');const v=Number(p[k]);if(!Number.isFinite(v))throw Error(k+' が有限値ではありません');return v};
 const positive=(k,fallback)=>{const v=n(k,fallback);if(!(v>0))throw Error(k+' は0より大きい値が必要です');return v};
 const move=()=>{const v=n('MOVE',0);if(!Number.isInteger(v)||v<0||v>1)throw Error('MOVE は0または1です');return v===1};
 const name=()=>{const v=p.NAME||'default';if(!/^[A-Za-z0-9_.-]{1,80}$/.test(v))throw Error('NAME の形式が未対応です');return v};
 let kind='state',moveSpeed=s.speed,dwell=0;const before=[...s.position];
 switch(c){
  case 'G0':case 'G1':
   axes.forEach((a,i)=>{if(!Object.hasOwn(p,a))return;const value=n(a)*(i===3?s.extrudeFactor:1);s.position[i]=s.absolute&&(i!==3||s.absoluteE)?value+s.base[i]:s.position[i]+value});
   if(Object.hasOwn(p,'F'))s.speed=positive('F')*s.speedFactor;moveSpeed=s.speed;kind='move';break;
  case 'G4':dwell=n('P',0)/1000;if(dwell<0)throw Error('P は0以上です');kind='dwell';break;
  case 'G90':s.absolute=true;break;case 'G91':s.absolute=false;break;
  case 'M82':s.absoluteE=true;break;case 'M83':s.absoluteE=false;break;
  case 'G21':break;
  case 'G92':if(!Object.keys(p).length)s.base=[...s.position];else axes.forEach((a,i)=>{if(Object.hasOwn(p,a))s.base[i]=s.position[i]-n(a)*(i===3?s.extrudeFactor:1)});break;
  case 'M220':{const factor=positive('S',100)/6000;s.speed=s.speed/s.speedFactor*factor;s.speedFactor=factor;break}
  case 'M221':{const factor=positive('S',100)/100;const e=(s.position[3]-s.base[3])/s.extrudeFactor;s.base[3]=s.position[3]-e*factor;s.extrudeFactor=factor;break}
  case 'SET_GCODE_OFFSET':{
   const delta=axes.map((a,i)=>{if(Object.hasOwn(p,a)&&Object.hasOwn(p,a+'_ADJUST'))throw Error(a+' と '+a+'_ADJUST は同時指定できません');const value=n(a,n(a+'_ADJUST',0)+s.offset[i]);const d=value-s.offset[i];s.offset[i]=value;s.base[i]+=d;return d});
   if(move()){moveSpeed=positive('MOVE_SPEED',s.speed);s.position=s.position.map((v,i)=>v+delta[i]);kind='move'}else if(Object.hasOwn(p,'MOVE_SPEED'))positive('MOVE_SPEED',s.speed);break;
  }
  case 'SAVE_GCODE_STATE':{if(s.saved.size>=64&&!s.saved.has(name()))throw Error('保存状態は64個までです');s.saved.set(name(),view(s));break}
  case 'RESTORE_GCODE_STATE':{const saved=s.saved.get(name());if(!saved)throw Error('保存状態がありません: '+name());const current=[...s.position];Object.assign(s,structuredClone(saved));s.position=current;s.base[3]+=current[3]-saved.position[3];if(move()){moveSpeed=positive('MOVE_SPEED',s.speed);s.position.splice(0,3,...saved.position.slice(0,3));kind='move'}else if(Object.hasOwn(p,'MOVE_SPEED'))positive('MOVE_SPEED',s.speed);break}
 }
 if([...s.position,...s.base,...s.offset,s.speed,s.speedFactor,s.extrudeFactor,moveSpeed,dwell].some(v=>!Number.isFinite(v)))throw Error('計算結果が有限値ではありません');
 for(let i=0;i<3;i++){const [lo,hi]=limits[axes[i]];if(s.position[i]<lo-1e-8||s.position[i]>hi+1e-8)throw Error(`${axes[i]}=${s.position[i].toFixed(3)} は表示範囲 ${lo}–${hi} mm 外です`)}
 const distance=Math.hypot(...s.position.slice(0,3).map((v,i)=>v-before[i])),extrusion=s.position[3]-before[3];
 const duration=dwell+(kind==='move'?(distance||Math.abs(extrusion))/moveSpeed:0);if(!Number.isFinite(duration))throw Error('移動時間が有限値ではありません');
 return {kind,from:before,to:[...s.position],distance_mm:distance,extrusion_mm:extrusion,speed_mm_s:moveSpeed,duration_s:duration,state:view(s)};
}
export function compileGcode(text,{initial,limits,maxLines=30000}={}){
 if(!Array.isArray(initial)||initial.length!==3||initial.some(v=>!Number.isFinite(v)))throw Error('開始XYZが必要です');
 for(let i=0;i<3;i++){const range=limits?.[axes[i]];if(!Array.isArray(range)||range.length!==2||range.some(v=>!Number.isFinite(v))||range[0]>range[1]||initial[i]<range[0]||initial[i]>range[1])throw Error('開始位置または表示範囲が不正です')}
 if(typeof text!=='string'||text.length>2000000)throw Error('G-codeは2 MB以内です');const lines=text.split(/\r?\n/);if(lines.length>maxLines)throw Error('G-codeは'+maxLines+'行までです');
 let state={position:[...initial,0],base:[0,0,0,0],offset:[0,0,0,0],absolute:true,absoluteE:true,speed:25,speedFactor:1/60,extrudeFactor:1,saved:new Map()},elapsed=0,error=null;const events=[];
 for(let i=0;i<lines.length;i++)try{const parsed=parse(lines[i]);if(!parsed)continue;const candidate=copy(state),event=execute(candidate,parsed,limits);elapsed+=event.duration_s;events.push({...event,line:i+1,command:parsed.command,text:parsed.text,elapsed_s:elapsed});state=candidate}catch(e){error={line:i+1,message:e.message};break}
 return {initial:[...initial,0],events,error,complete:error===null,duration_s:elapsed,final:view(state),physical_machine_connected:false,capabilities:{rigid_xyz:true,extrusion_counter:true,feed_time_estimate:true,homing:false,klipper_jinja:false,collision:false,heaters:false,acceleration:false}};
}
export function nozzlePoint(profile,xyz){return xyz.map((v,i)=>profile.nozzle_tip_mm[i]+v-profile.display_reference_xyz_mm[i])}
