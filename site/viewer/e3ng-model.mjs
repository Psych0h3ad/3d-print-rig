export const e3ngOptions={view:['assembly','head','dock','gantry'],board:['ebb42','ebb36'],extruder:['pin','bolt'],arm:['arm','sleeve'],gantry:['v12','beta'],tools:[1,2,3,4,5,6]};
export const e3ngDefaults={view:'head',board:'ebb42',extruder:'pin',arm:'arm',gantry:'v12',tools:5,nudge:false,wiper:false,routing:false};
export function e3ngSelection(input={}){
 const out={...e3ngDefaults};
 for(const [key,values] of Object.entries(e3ngOptions)){
  if(input[key]===undefined)continue;const value=key==='tools'?Number(input[key]):input[key];
  if(!values.includes(value))throw Error('Invalid E3NG selection: '+key);out[key]=value;
 }
 for(const key of ['nudge','wiper','routing'])if(input[key]!==undefined){
  if(![true,false,'true','false'].includes(input[key]))throw Error('Invalid E3NG selection: '+key);out[key]=input[key]===true||input[key]==='true';
 }
 return out;
}
export function e3ngPartVisible(part,selection){
 const s=e3ngSelection(selection),g=part.group;
 if(!g)return false;
 const head=new Set(['head','tool_1',s.board,s.extruder,s.arm]);
 if(s.view==='head')return head.has(g);
 const gantry=new Set(['gantry_common','gantry_'+s.gantry]);
 if(s.view==='gantry')return gantry.has(g);
 const dock=g==='dock_beam'||/^dock_\d$/.test(g)&&Number(g.slice(5))<=s.tools||/^tool_[2-6]$/.test(g)&&Number(g.slice(5))<=s.tools;
 if(s.view==='dock')return dock;
 return head.has(g)||gantry.has(g)||dock||(g==='nudge'&&s.nudge)||(g==='wiper'&&s.wiper)||(g==='routing'&&s.routing);
}
export function e3ngURL(href,selection){const u=new URL(href),s=e3ngSelection(selection);u.searchParams.delete('machine');for(const [key,value] of Object.entries(s))u.searchParams.set(key,String(value));return u.href}
