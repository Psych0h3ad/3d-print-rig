/** Offline logical printer. No transports, devices, firmware code or JS execution. */
import {supportedCommands,parseCoordinateCommand,createCoordinateState,copyCoordinateState,coordinateSnapshot,executeCoordinateCommand} from './gcode-preview.mjs?v=b286fb69d375531c6e91';
import {compileMacroLibrary,renderMacro,evaluateMacroValue} from './klipper-macro-subset.mjs?v=99f089a84c395186fe57';
import {sampleGcode} from './gcode-timeline.mjs?v=a07bc2dcf7216407fe8c';
const axes=['X','Y','Z'],extensions=['G28','PROBE','M104','M109','M140','M190','M106','M107','M400','TURN_OFF_HEATERS','SET_HEATER_TEMPERATURE','TEMPERATURE_WAIT','ACTIVATE_EXTRUDER','SET_GCODE_VARIABLE'];
const scalar=v=>v===null||['string','boolean','number'].includes(typeof v)&&(!(typeof v==='number')||Number.isFinite(v));
const safeName=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const clone=v=>structuredClone(v);
const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(label+' must be finite');return v};
const own=(obj,key)=>Object.hasOwn(obj,key);
function keys(obj,allowed,label){if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))throw Error('Unsupported '+label+' setting or parameter')}
const fingerprint=value=>{let n=2166136261;for(const c of JSON.stringify(value))n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n.toString(16).padStart(8,'0')};
/** Only measured XYZ datums/limits are inherited. Endstops are never inferred. */
export function virtualSettingsFromAdapter({profile,initial,limits,motionEnabled=true}={}){
 if(!motionEnabled)return {initial:[0,0,0],limits:{X:[0,0],Y:[0,0],Z:[0,0]},motion_enabled:false,homing:{},probe:null,heaters:{},tools:['extruder'],active_tool:'extruder',evidence:{xyz:'Unavailable: internal logical origin only; no model XYZ binding',contacts:'not supplied'}};
 const ranges=limits??profile?.display_limits_mm,raw=initial??profile?.display_reference_xyz_mm;
 // DOM serialization can round a boundary datum by a few ulps. Never extend travel.
 const xyz=raw?.map((v,i)=>{const r=ranges?.[axes[i]];return Array.isArray(r)&&v<r[0]&&v>=r[0]-1e-7?r[0]:Array.isArray(r)&&v>r[1]&&v<=r[1]+1e-7?r[1]:v});
 createCoordinateState({initial:xyz,limits:ranges});
 const result={initial:[...xyz],limits:clone(ranges),homing:{},probe:null,initial_homed_axes:[],require_homing:false,extrusion_mode:'counter',heaters:{},tools:['extruder'],active_tool:'extruder',evidence:{xyz:'adapter display datums and limits',contacts:'not supplied'}};
 // This optional contract must be populated by the adapter owner from measured data.
 if(profile?.virtual_firmware){keys(profile.virtual_firmware,['homing','probe','initial_homed_axes','require_homing','extrusion_mode','heaters','tools','active_tool','evidence'],'adapter virtual firmware');Object.assign(result,clone(profile.virtual_firmware))}
 return result;
}
function normalizeSettings(input){
 keys(input,['initial','limits','motion_enabled','homing','probe','initial_homed_axes','require_homing','extrusion_mode','heaters','tools','active_tool','evidence'],'virtual printer');
 if(new TextEncoder().encode(JSON.stringify(input)).length>128000)throw Error('Virtual settings exceed 128 KB');
 const settings=clone(input);createCoordinateState(settings);
 settings.motion_enabled??=true;if(typeof settings.motion_enabled!=='boolean')throw Error('motion_enabled must be boolean');
 if(!settings.motion_enabled&&(Object.keys(settings.homing??{}).length||settings.probe))throw Error('Contacts require an XYZ adapter binding');
 settings.homing??={};keys(settings.homing,axes,'homing');
 for(const [axis,h] of Object.entries(settings.homing)){keys(h,['position_mm','evidence'],'homing '+axis);finite(h.position_mm,'Homing contact');if(h.position_mm<settings.limits[axis][0]||h.position_mm>settings.limits[axis][1]||typeof h.evidence!=='string'||!h.evidence.trim())throw Error('Homing '+axis+' requires an in-range contact and evidence')}
 settings.probe??=null;if(settings.probe){
  const p=settings.probe;keys(p,['contact_nozzle_z_mm','offset_xy_mm','xy_limits_mm','evidence'],'probe');finite(p.contact_nozzle_z_mm,'Probe contact');
  if(p.contact_nozzle_z_mm<settings.limits.Z[0]||p.contact_nozzle_z_mm>settings.limits.Z[1]||!Array.isArray(p.offset_xy_mm)||p.offset_xy_mm.length!==2||p.offset_xy_mm.some(v=>!Number.isFinite(v))||!Array.isArray(p.xy_limits_mm)||p.xy_limits_mm.length!==2||p.xy_limits_mm.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>!Number.isFinite(v))||r[0]>r[1])||typeof p.evidence!=='string'||!p.evidence.trim())throw Error('Probe requires measured contact, offset, XY contact region and evidence');
 }
 settings.initial_homed_axes??=[];if(!Array.isArray(settings.initial_homed_axes)||new Set(settings.initial_homed_axes).size!==settings.initial_homed_axes.length||settings.initial_homed_axes.some(a=>!axes.includes(a)))throw Error('Invalid initial homed axes');
 settings.require_homing??=false;if(typeof settings.require_homing!=='boolean')throw Error('require_homing must be boolean');
 settings.extrusion_mode??='counter';if(!['counter','temperature_guard'].includes(settings.extrusion_mode))throw Error('Unknown extrusion mode');
 settings.heaters??={};if(!settings.heaters||typeof settings.heaters!=='object'||Array.isArray(settings.heaters)||Object.keys(settings.heaters).length>16)throw Error('At most 16 virtual heaters');
 for(const [name,h] of Object.entries(settings.heaters)){
  if(!safeName(name))throw Error('Invalid heater name');keys(h,['temperature_c','target_c','min_c','max_c','min_extrude_c'],'heater '+name);
  for(const key of ['temperature_c','min_c','max_c'])finite(h[key],'Heater '+key);h.target_c??=0;finite(h.target_c,'Heater target');
  if(h.min_c>h.max_c||h.temperature_c<h.min_c||h.temperature_c>h.max_c||h.target_c!==0&&(h.target_c<h.min_c||h.target_c>h.max_c))throw Error('Invalid virtual heater range');
  if(h.min_extrude_c!==undefined&&(finite(h.min_extrude_c,'Extrusion threshold')<h.min_c||h.min_extrude_c>h.max_c))throw Error('Extrusion threshold outside heater range');
 }
 settings.tools??=['extruder'];if(!Array.isArray(settings.tools)||!settings.tools.length||settings.tools.length>16||new Set(settings.tools).size!==settings.tools.length||settings.tools.some(t=>!safeName(t)))throw Error('Specify 1–16 unique virtual tool names');
 settings.active_tool??=settings.tools[0];if(!settings.tools.includes(settings.active_tool))throw Error('Unknown initial virtual tool');
 if(settings.extrusion_mode==='temperature_guard'&&settings.tools.some(t=>settings.heaters[t]?.min_extrude_c===undefined))throw Error('Temperature guard requires a heater and extrusion threshold for every virtual tool');
 if(settings.evidence!==undefined&&(!settings.evidence||typeof settings.evidence!=='object'||Array.isArray(settings.evidence)||Object.values(settings.evidence).some(v=>typeof v!=='string')))throw Error('Evidence must contain text labels');
 return settings;
}
function snapshot(s){return {...coordinateSnapshot(s.coordinate),homed_axes:[...s.homed],heaters:clone(s.heaters),active_tool:s.active_tool,fan:s.fan,macro_variables:clone(s.variables),probe_result:clone(s.probe_result),extrusion_by_tool:clone(s.extrusion_by_tool)}}
function status(s,settings){
 const c=s.coordinate,result={toolhead:{position:[...c.position],homed_axes:s.homed.map(a=>a.toLowerCase()).join(''),axis_minimum:axes.map(a=>settings.limits[a][0]),axis_maximum:axes.map(a=>settings.limits[a][1]),extruder:s.active_tool},gcode_move:{gcode_position:c.position.map((v,i)=>(v-c.base[i])/(i===3?c.extrudeFactor:1)),position:[...c.position],absolute_coordinates:c.absolute,absolute_extrude:c.absoluteE,speed:c.speed/c.speedFactor,speed_factor:c.speedFactor*60,extrude_factor:c.extrudeFactor,homing_origin:[...c.offset]},fan:{speed:s.fan},probe:{last_z_result:s.probe_result?.contact_nozzle_z_mm??null}};
 for(const [name,h] of Object.entries(s.heaters))result[name]={temperature:h.temperature_c,target:h.target_c,can_extrude:h.min_extrude_c!==undefined&&h.temperature_c>=h.min_extrude_c};
 for(const [name,values] of Object.entries(s.variables))result['gcode_macro '+name]=clone(values);return result;
}
function extendedParse(text,command){
 const params=Object.create(null);let rest=text.slice(command.length).trim();
 if(command==='G28'){
  while(rest){const m=/^([XYZ])(?:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?/i.exec(rest);if(!m||own(params,m[1].toUpperCase()))throw Error('G28 supports X/Y/Z selectors only');params[m[1].toUpperCase()]=m[2]??'0';rest=rest.slice(m[0].length).trim()}
 }else if(/^M\d+$/.test(command)){
  while(rest){const m=/^([A-Za-z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/.exec(rest);if(!m||own(params,m[1].toUpperCase()))throw Error('Invalid/repeated '+command+' parameter');params[m[1].toUpperCase()]=m[2];rest=rest.slice(m[0].length).trim()}
 }else while(rest){
  const m=/^([A-Za-z_][A-Za-z0-9_]*)=("(?:[^"\\]|\\["\\])*"|'(?:[^'\\]|\\['\\])*'|[^\s]+)/.exec(rest);
  if(!m||own(params,m[1].toUpperCase()))throw Error('Invalid/repeated '+command+' parameter');params[m[1].toUpperCase()]=m[2];rest=rest.slice(m[0].length).trim();
 }
 return {command,params,text};
}
function extension(s,parsed,settings){
 const {command:c,params:p}=parsed,allowed={G28:axes,PROBE:[],M104:['S','T'],M109:['S','T'],M140:['S'],M190:['S'],M106:['S'],M107:[],M400:[],TURN_OFF_HEATERS:[],SET_HEATER_TEMPERATURE:['HEATER','TARGET'],TEMPERATURE_WAIT:['SENSOR','MINIMUM','MAXIMUM'],ACTIVATE_EXTRUDER:['EXTRUDER'],SET_GCODE_VARIABLE:['MACRO','VARIABLE','VALUE']}[c];keys(p,allowed,c);
 const num=(key,fallback)=>{if(!own(p,key)){if(fallback===undefined)throw Error('Missing '+key);return fallback}if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(p[key]))throw Error(key+' requires a finite decimal');return finite(Number(p[key]),key)};
 const heater=name=>{if(!own(s.heaters,name))throw Error('Virtual heater is not configured: '+name);return s.heaters[name]};
 const target=(name,value)=>{const h=heater(name);if(value!==0&&(value<h.min_c||value>h.max_c))throw Error('Target outside configured virtual heater range');h.target_c=value};
 let kind='state',data={},uncertain=false;
 if(c==='G28'){
  const selected=Object.keys(p).length?Object.keys(p):axes;
  for(const axis of selected)if(!settings.homing[axis])throw Error('G28 '+axis+' requires a measured contact; no endstop path is inferred');
  for(const axis of selected){const i=axes.indexOf(axis);s.coordinate.position[i]=settings.homing[axis].position_mm;s.coordinate.base[i]=s.coordinate.offset[i];if(!s.homed.includes(axis))s.homed.push(axis)}
  s.homed.sort();kind='home_contact';data={axes:selected,contact_only:true,trajectory_verified:false,evidence:selected.map(a=>settings.homing[a].evidence)};
 }else if(c==='PROBE'){
  const p=settings.probe;if(!p)throw Error('PROBE requires measured contact data; no probing path is inferred');if(axes.some(a=>!s.homed.includes(a)))throw Error('PROBE requires virtual XYZ homing');
  const xy=s.coordinate.position.slice(0,2).map((v,i)=>v+p.offset_xy_mm[i]);if(xy.some((v,i)=>v<p.xy_limits_mm[i][0]||v>p.xy_limits_mm[i][1]))throw Error('Probe contact is outside the measured XY region');
  if(s.coordinate.position[2]<p.contact_nozzle_z_mm)throw Error('Probe starts below its configured contact');s.coordinate.position[2]=p.contact_nozzle_z_mm;s.probe_result={contact_nozzle_z_mm:p.contact_nozzle_z_mm,probe_xy_mm:xy};kind='probe_contact';data={...s.probe_result,contact_only:true,trajectory_verified:false,evidence:p.evidence};
 }else if(c==='ACTIVATE_EXTRUDER'){
  if(!settings.tools.includes(p.EXTRUDER))throw Error('Unknown virtual extruder');const previous=s.active_tool;s.active_tool=p.EXTRUDER;kind=previous===s.active_tool?'tool_activation':'tool_exchange';data={from_tool:previous,to_tool:s.active_tool,logical_only:true,trajectory_verified:false,installed_geometry_changed:false};
 }else if(c==='SET_GCODE_VARIABLE'){
  const name=p.MACRO?.toUpperCase(),variable=p.VARIABLE;if(!own(s.variables,name??'')||!own(s.variables[name],variable??''))throw Error('Unknown macro variable');const value=evaluateMacroValue(p.VALUE??'');if(!scalar(value))throw Error('Macro variable requires a scalar');s.variables[name][variable]=value;kind='macro_variable';data={macro:name,variable,value};
 }else if(c==='M106'||c==='M107'){
  const value=c==='M107'?0:num('S',255);if(value<0||value>255)throw Error('Fan S must be within 0–255');s.fan=value/255;kind='fan';
 }else if(c==='TURN_OFF_HEATERS'){
  for(const h of Object.values(s.heaters))h.target_c=0;kind='heater';
 }else if(c==='M400'){kind='synchronize';
 }else if(c==='TEMPERATURE_WAIT'){
  const h=heater(p.SENSOR),lo=num('MINIMUM',h.min_c),hi=num('MAXIMUM',h.max_c);if(!own(p,'MINIMUM')&&!own(p,'MAXIMUM')||lo>hi||lo<h.min_c||hi>h.max_c)throw Error('Invalid temperature wait window');
  if(h.temperature_c<lo||h.temperature_c>hi){if(h.target_c<lo||h.target_c>hi)throw Error('Virtual heater target cannot satisfy the wait window');h.temperature_c=h.target_c;uncertain=true}kind='heater_wait';data={heater:p.SENSOR,logical_settle:true};
 }else{
  let name;
  if(c==='SET_HEATER_TEMPERATURE'){name=p.HEATER;target(name,num('TARGET'))}
  else{const bed=c==='M140'||c==='M190',tool=num('T',settings.tools.indexOf(s.active_tool));if(!Number.isInteger(tool)||tool<0||tool>=settings.tools.length)throw Error('Invalid virtual heater tool index');name=bed?'heater_bed':settings.tools[tool];target(name,num('S',0))}
  const wait=c==='M109'||c==='M190';if(wait){const h=heater(name);if(h.target_c!==0&&h.temperature_c!==h.target_c){h.temperature_c=h.target_c;uncertain=true}}
  kind=wait?'heater_wait':'heater';data={heater:name,target_c:heater(name).target_c,logical_settle:wait};
 }
 return {kind,data,thermal_time_unmodelled:uncertain,distance_mm:0,extrusion_mm:0,speed_mm_s:0,duration_s:0,draw_path:false};
}
export function compileVirtualPrinter(text,{settings,macros='',maxLines=30000,sourceMetadata={}}={}){
 keys(sourceMetadata,['repository','revision','files','coordinate_mapping','purpose'],'source metadata');
 if(new TextEncoder().encode(JSON.stringify(sourceMetadata)).length>8192)throw Error('Source metadata exceeds 8 KB');
 for(const [k,v]of Object.entries(sourceMetadata))if(k!=='files'&&(typeof v!=='string'||v.length>2048))throw Error('Source metadata labels must be text within 2048 characters');
 if(sourceMetadata.files!==undefined){if(!Array.isArray(sourceMetadata.files)||sourceMetadata.files.length>32)throw Error('At most 32 source metadata files');for(const f of sourceMetadata.files){keys(f,['path','sha256'],'source file metadata');if(typeof f.path!=='string'||!f.path||f.path.length>2048||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Source file metadata requires a path and SHA-256')}}
 const metadata=clone(sourceMetadata);let config,library;
 try{config=normalizeSettings(settings);library=compileMacroLibrary(macros)}catch(e){e.source_metadata=metadata;e.phase='settings_or_macro_config';throw e}
 for(const name of Object.keys(library))if(supportedCommands.includes(name)||extensions.includes(name))throw Error('Built-in command override/rename_existing is unsupported: '+name);
 if(typeof text!=='string'||text.length>2000000)throw Error('G-code must be text within 2 MB');if(!Number.isInteger(maxLines)||maxLines<1||maxLines>30000)throw Error('Command budget must be within 1–30000');
 const lines=text.split(/\r?\n/);if(lines.length>maxLines)throw Error('Input exceeds '+maxLines+' lines');
 let s={coordinate:createCoordinateState(config),homed:[...config.initial_homed_axes],heaters:clone(config.heaters),active_tool:config.active_tool,fan:0,variables:Object.fromEntries(Object.values(library).map(d=>[d.name,clone(d.variables)])),probe_result:null,extrusion_by_tool:Object.fromEntries(config.tools.map(t=>[t,0]))};
 const initialState=snapshot(s),events=[],budget={operations:100000,characters:2000000};let error=null,elapsed=0,expanded=0,thermalUnknown=false,stateCharacters=0;
 function event(parsed,source,next,result){
  const before=snapshot(s),after=snapshot(next),size=JSON.stringify(before).length+JSON.stringify(after).length;
  if(stateCharacters+size>32000000)throw Error('Replay state budget exceeds 32 million characters');
  const nextTime=elapsed+result.duration_s;if(!Number.isFinite(nextTime)||nextTime>31536000)throw Error('Preview exceeds the one-year time budget');elapsed=nextTime;stateCharacters+=size;
  thermalUnknown||=!!result.thermal_time_unmodelled;
  events.push({...result,from:[...s.coordinate.position],to:[...next.coordinate.position],start_state:before,state:after,line:source.line,source:clone(source),command:parsed.command,text:parsed.text,elapsed_s:elapsed});s=next;
 }
 function execute(line,source){
  const clean=line.split(';')[0].trim();if(!clean)return;if(++expanded>maxLines)throw Error('Expanded command budget exceeds '+maxLines);
  if(/[{}*]/.test(clean))throw Error('Templates must be inside configured macros; checksums are unsupported');
  const match=/^([A-Za-z_]+\d*)(?=\s|[A-Za-z]|$)/.exec(clean);if(!match)throw Error('Cannot read virtual printer command');const command=match[1].toUpperCase();
  if(own(library,command)){
   if(source.stack.length>=8)throw Error('Macro call depth exceeds 8');
   const parsed=extendedParse(clean,command),params=Object.fromEntries(Object.entries(parsed.params).map(([key,v])=>[key,v[0]==='"'||v[0]==="'"?evaluateMacroValue(v):v]));
   // Complete render precedes execution. Called macros render only when reached.
   const generated=renderMacro(library[command],params,status(s,config),budget);
   event(parsed,source,s,{kind:'macro',data:{macro:command,expanded_lines:generated.length},distance_mm:0,extrusion_mm:0,speed_mm_s:0,duration_s:0,draw_path:false});
   for(const row of generated){const child={...row,line:source.line,macro:command,stack:[...source.stack,command]};try{execute(row.text,child)}catch(e){e.source??=child;throw e}}return;
  }
  const next={...s,coordinate:copyCoordinateState(s.coordinate),homed:[...s.homed],heaters:clone(s.heaters),variables:clone(s.variables),probe_result:clone(s.probe_result),extrusion_by_tool:clone(s.extrusion_by_tool)};
  let parsed,result;
  if(supportedCommands.includes(command)){
   parsed=parseCoordinateCommand(clean);if(!config.motion_enabled&&axes.some(a=>own(parsed.params,a)))throw Error('XYZ preview unavailable: this adapter has no printer XYZ binding');
   result=executeCoordinateCommand(next.coordinate,parsed,config.limits);result.draw_path=result.kind==='move';
   if(config.require_homing&&result.kind==='move')for(const [i,a] of axes.entries())if(result.to[i]!==result.from[i]&&!s.homed.includes(a))throw Error('Virtual '+a+' must be homed before motion');
   if(result.extrusion_mm!==0){const h=s.heaters[s.active_tool];if(config.extrusion_mode==='temperature_guard'&&h.temperature_c<h.min_extrude_c)throw Error('Virtual extrusion below the configured minimum temperature');next.extrusion_by_tool[s.active_tool]+=result.extrusion_mm}
  }else if(extensions.includes(command)){parsed=extendedParse(clean,command);result=extension(next,parsed,config)}
  else throw Error('Unsupported virtual printer command: '+command);
  event(parsed,source,next,result);
 }
 for(const [i,line] of lines.entries())try{execute(line,{line:i+1,stack:[]})}catch(e){error={line:i+1,message:e.message,source:e.source??{line:i+1,stack:[]}};break}
 const capabilities={rigid_xyz:config.motion_enabled,extrusion_counter:true,feed_time_estimate:true,bounded_klipper_subset:true,klipper_jinja:false,homing:Object.keys(config.homing),probe_contact:!!config.probe,heaters:Object.keys(config.heaters),tool_activation:true,tool_exchange_events:true,physical_tool_exchange:false,collision:false,continuous_clearance:false,thermal_dynamics:false,acceleration:false,hardware_io:false};
 return {initial:[...initialState.position],initial_state:initialState,events,error,complete:error===null,duration_s:elapsed,final:snapshot(s),physical_machine_connected:false,capabilities,time_excludes_thermal_waits:thermalUnknown,settings:config,macro_config:macros,source_text:text,source_metadata:metadata,program_id:fingerprint({text,config,macros,metadata}),evidence_scope:'Logical state and bounded coordinate replay; no native continuous clearance or physical operation'};
}
/** Replay cursor preserves event order even when multiple events share time zero. */
export function createVirtualPlayback(program){
 if(!program?.complete)throw Error('A complete virtual printer program is required');
 let index=0,time=0,playing=false,last=null;
 const read=()=>{
  const previous=program.events[index-1],next=program.events[index];
  if(next&&next.duration_s>0&&time>next.elapsed_s-next.duration_s){const sampled=sampleGcode(program,time);return {...sampled,playing,state:sampled.state}}
  return {time_s:time,index,position:[...(previous?.to??program.initial)],state:clone(previous?.state??program.initial_state),event:previous??null,done:index===program.events.length,playing};
 };
 const pause=()=>{playing=false;last=null;return read()};
 function seekEvent(n){if(!Number.isInteger(n)||n<0||n>program.events.length)throw Error('Invalid replay event');pause();index=n;time=program.events[index-1]?.elapsed_s??0;return read()}
 function seekTime(seconds){const value=sampleGcode(program,seconds);index=value.index;time=value.time_s;if(value.done)pause();return {...value,playing,state:value.state}}
 const reset=()=>seekEvent(0);
 function save(){return {schema:'offline-virtual-printer-replay/1',program_id:program.program_id,time_s:time,event_index:index}}
 function restore(value){keys(value,['schema','program_id','time_s','event_index'],'replay');if(value.schema!=='offline-virtual-printer-replay/1'||value.program_id!==program.program_id||!Number.isInteger(value.event_index)||value.event_index<0||value.event_index>program.events.length||!Number.isFinite(value.time_s))throw Error('Replay belongs to a different or invalid program');
  const start=program.events[value.event_index-1]?.elapsed_s??0,end=program.events[value.event_index]?.elapsed_s??program.duration_s;if(value.time_s<start||value.time_s>end||value.time_s!==start&&(value.time_s===end||end===start||!program.events[value.event_index]?.duration_s))throw Error('Inconsistent replay time and event index');pause();index=value.event_index;time=value.time_s;return read();
 }
 return {read,pause,reset,seekEvent,seekTime,step:()=>seekEvent(Math.min(index+1,program.events.length)),save,restore,
  play(now){finite(now,'Replay clock');playing=true;last=now;return read()},
  advance(now,speed=1){finite(now,'Replay clock');if(![1,4,10].includes(speed))throw Error('Invalid replay speed');if(!playing)return read();if(now<last)throw Error('Replay clock reversed');const next=time+(now-last)/1000*speed;last=now;return seekTime(next)},
  get playing(){return playing},get index(){return index},get time(){return time}
 };
}
