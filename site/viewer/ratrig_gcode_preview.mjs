// Motion/lighting replay for expanded test traces; deliberately fails on
// firmware macros, homing, temperatures and Jinja instead of guessing them.
export function createRatRigGcodePreview(adapter,profile){
  let absolute=true,tool=0,carriage=0,offset={X:0,Y:0,Z:0},feedrate=null;
  const saved=new Map(),history=[];
  const snapshot=()=>({absolute,tool,carriage,offset:{...offset},feedrate,rig:adapter.getSnapshot()});
  function executeLine(line){
    const clean=line.replace(/\([^)]*\)/g,'').split(';')[0].trim();if(!clean)return snapshot();
    if(/[{}]/.test(clean))throw new Error('Expand Jinja/firmware macros before replay');
    const [raw,...args]=clean.split(/\s+/),cmd=raw.toUpperCase(),before=snapshot();
    const kv=()=>{const d={};for(const a of args){const m=/^([A-Z_]+)=([^\s]+)$/i.exec(a);if(!m||Object.hasOwn(d,m[1].toUpperCase()))throw new Error('Invalid command parameter');d[m[1].toUpperCase()]=m[2];}return d;};
    const allowed=(d,keys)=>{if(Object.keys(d).some(k=>!keys.includes(k)))throw new Error('Unsupported parameter');};
    if(['G90','G91','G21'].includes(cmd)){
      if(args.length)throw new Error('Unexpected coordinate-mode arguments');if(cmd!=='G21')absolute=cmd==='G90';
    }else if(['G0','G1','G92'].includes(cmd)){
      const values={};for(const a of args){const m=/^([XYZFE])([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i.exec(a);if(!m||Object.hasOwn(values,m[1].toUpperCase()))throw new Error('Unsupported/repeated motion argument');values[m[1].toUpperCase()]=Number(m[2]);}
      if(Object.hasOwn(values,'E'))throw new Error('Extrusion is outside motion-only replay');
      if(values.F!==undefined&&(!Number.isFinite(values.F)||values.F<=0||cmd==='G92'))throw new Error('Invalid feedrate');
      const axis={X:'x'+carriage,Y:'y',Z:'z'},pose=adapter.getSnapshot().pose;
      if(cmd==='G92'){for(const a of ['X','Y','Z'])if(values[a]!==undefined)offset[a]=pose[axis[a]]-values[a];}
      else{const next={};for(const a of ['X','Y','Z'])if(values[a]!==undefined)next[axis[a]]=absolute?values[a]+offset[a]:pose[axis[a]]+values[a];adapter.setPose(next);if(values.F!==undefined)feedrate=values.F;}
    }else if(cmd==='ACTIVATE_EXTRUDER'){
      const d=kv();allowed(d,['EXTRUDER']);const next=d.EXTRUDER==='extruder'?0:d.EXTRUDER==='extruder1'?1:-1;if(next<0||next===1&&profile.mode!=='idex')throw new Error('Unknown extruder');tool=next;
    }else if(cmd==='SET_DUAL_CARRIAGE'){
      const d=kv();allowed(d,['CARRIAGE','MODE']);if(profile.mode!=='idex'||!['0','1'].includes(d.CARRIAGE))throw new Error('Invalid dual carriage');const next=Number(d.CARRIAGE),mode=(d.MODE??'PRIMARY').toUpperCase(),pose=adapter.getSnapshot().pose;
      if(mode==='PRIMARY'){adapter.setMode('independent',{pose:{}});carriage=next;}
      else if(['COPY','MIRROR'].includes(mode)&&carriage===0&&next===1){adapter.setMode(mode.toLowerCase(),{pose:{},copy_offset_mm:pose.x1-pose.x0,mirror_sum_mm:pose.x0+pose.x1});}
      else throw new Error('Unsupported dual-carriage mode/primary combination');
    }else if(cmd==='SET_LED'){
      const d=kv();allowed(d,['LED','WHITE']);if(!['chamber','vaoc'].includes(d.LED)||d.WHITE===undefined)throw new Error('Unknown light channel');adapter.setLight(d.LED,Number(d.WHITE));
    }else if(cmd==='SAVE_GCODE_STATE'){
      const d=kv();allowed(d,['NAME']);saved.set(d.NAME??'default',snapshot());
    }else if(cmd==='RESTORE_GCODE_STATE'){
      const d=kv();allowed(d,['NAME','MOVE','MOVE_SPEED']);const name=d.NAME??'default';if(!saved.has(name)||!['0','1'].includes(d.MOVE??'0'))throw new Error('Invalid/missing saved state');if(d.MOVE_SPEED!==undefined&&(!Number.isFinite(Number(d.MOVE_SPEED))||!(Number(d.MOVE_SPEED)>0)))throw new Error('Invalid MOVE_SPEED');
      const s=saved.get(name);if(d.MOVE==='1')adapter.setPose({['x'+carriage]:s.rig.pose['x'+s.carriage],y:s.rig.pose.y,z:s.rig.pose.z});absolute=s.absolute;offset={...s.offset};feedrate=s.feedrate;
    }else throw new Error('Unsupported firmware command: '+cmd);
    const after=snapshot();history.push({line:clean,before,after});return after;
  }
  return {executeLine,execute(text){return text.split(/\r?\n/).filter(x=>x.trim()).map(executeLine);},snapshot,getHistory:()=>structuredClone(history),capabilities:{motion:true,lighting:true,expanded_trace:true,firmware_macro_execution:false,homing:false,extrusion:false,thermal:false}};
}
