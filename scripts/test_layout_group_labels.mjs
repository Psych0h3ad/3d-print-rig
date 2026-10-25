// Group identity/schema regressions only. No UI, model or native jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),at=process.argv.indexOf('--site');
const dir=path.join(at<0?path.join(root,'site'):path.resolve(process.argv[at+1]),'layout');
const G=await import(pathToFileURL(path.join(dir,'layout-groups.mjs')));
const H=await import(pathToFileURL(path.join(dir,'layout-clipboard.mjs')));
const L=await import(pathToFileURL(path.join(dir,'layout-group-labels.mjs')));
const S=await import(pathToFileURL(path.join(dir,'layout-state.mjs')));
const files=['layout-group-labels.mjs','layout-state.mjs','layout-groups.mjs','layout-group-data.mjs','layout-clipboard.mjs'];
const hashes=()=>Object.fromEntries(files.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')]));
const before=hashes(),cases=[],C=S.createCatalog([{id:'small',widthMm:100,depthMm:60,heightMm:100}]);
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const room=()=>S.createRoomRect({widthMm:30000,depthMm:24000,wallHeightMm:10000});
const desk=(id,x,z=0)=>S.createDesk({id,widthMm:600,depthMm:400,pose:pose(x,z)});
const encode=state=>S.serializeLayout(state,C),copy=state=>JSON.parse(JSON.stringify(state));
function test(name,run){try{run();cases.push({name,passed:true});}catch(error){cases.push({name,passed:false,error:error.stack});}}
function base(n=3){return S.createDefaultLayout({room:room(),furniture:Array.from({length:n},(_,i)=>desk('d'+(i+1),-6000+i*1200))},C);}
function grouped(n=3){let s=base(n);for(let i=1;i<=n;i++)s=G.createGroup(s,{id:'g'+i,name:i===1?'Custom [literal] name':'Cell '+i,memberIds:['d'+i]},C);return s;}
function legacy(){const s=grouped(),raw=copy(s);raw.groups.forEach(g=>delete g.label);return S.parseLayout(JSON.stringify(raw),C);}
const labels=state=>state.groups.map(g=>L.groupLabel(state,g.id));
const bodies=state=>({furniture:state.furniture,printers:state.printers});
const rejected=(run,code)=>assert.throws(run,e=>e.name==='LayoutValidationError'&&e.errors?.some(issue=>issue.code===code));

test('new groups persist A/B/C separately from unchanged custom base names',()=>{
  const s=grouped();assert.deepEqual(labels(s),['A','B','C']);assert.deepEqual(s.groups.map(g=>g.label),labels(s));
  assert.equal(s.groups[0].name,'Custom [literal] name');assert.equal(L.groupLabel(s,'missing'),'');assert.equal(L.groupLabel({},'g1'),'');
});
test('v1 import, display reads, save and parse do not migrate legacy records',()=>{
  const s=legacy(),text=encode(s);assert.deepEqual(labels(s),['A','B','C']);
  assert.equal(encode(s),text);assert(s.groups.every(g=>!Object.hasOwn(g,'label')));
  assert.deepEqual(S.parseLayout(text,C),s);assert.equal(s.version,1);
  const materialized=L.materializeGroupLabels(s);assert.deepEqual(labels(materialized),['A','B','C']);
  assert.deepEqual(bodies(materialized),bodies(s));assert.equal(encode(s),text);
});
test('explicit labels are reserved before allocating legacy holes',()=>{
  const raw=copy(legacy());raw.groups[1].label='A';raw.groups[2].label='AA';
  const s=S.parseLayout(JSON.stringify(raw),C);assert.deepEqual(labels(s),['B','A','AA']);
  const renamed=G.renameGroup(s,'g1','Same identity',C);assert.deepEqual(labels(renamed),['B','A','AA']);
  assert.equal(renamed.groups[0].label,'B');assert.equal(renamed.groups[1].name,s.groups[1].name);
});
test('rename materializes legacy identity without renaming other units or moving anything',()=>{
  const s=legacy(),text=encode(s),r=G.renameGroup(s,'g2','My renamed cell',C);
  assert.deepEqual(labels(r),['A','B','C']);assert.equal(r.groups[1].name,'My renamed cell');
  assert.equal(r.groups[0].name,s.groups[0].name);assert.equal(r.groups[2].name,s.groups[2].name);
  assert.deepEqual(bodies(r),bodies(s));assert.deepEqual(r.groups.map(g=>g.pose),s.groups.map(g=>g.pose));assert.equal(encode(s),text);
});
test('ungroup/delete never renumber surviving legacy identities',()=>{
  const s=legacy(),ungrouped=G.ungroup(s,'g1',C),deleted=G.removeGroup(s,'g1',C);
  assert.deepEqual(labels(ungrouped),['B','C']);assert.deepEqual(labels(deleted),['B','C']);
  assert.deepEqual(bodies(ungrouped),bodies(s));assert.equal(deleted.furniture.some(f=>f.id==='d1'),false);
  const again=G.createGroup(ungrouped,{id:'new',name:'Fresh unit',memberIds:['d1']},C);
  assert.deepEqual(labels(again),['B','C','A']);assert.equal(again.groups[0].id,'g2');
});
test('ordinary applyAction entity deletion preserves inherited labels through rebase',()=>{
  const s=legacy(),r=S.applyAction(s,{type:'REMOVE_FURNITURE',id:'d1'},C);
  assert.deepEqual(labels(r),['B','C']);assert.deepEqual(r.groups.map(g=>g.label),['B','C']);
  assert.deepEqual(r.groups.map(g=>[g.id,g.name,g.pose]),s.groups.slice(1).map(g=>[g.id,g.name,g.pose]));
});
test('partial membership deletion keeps its group label and other group labels',()=>{
  let s=base(3);s=G.createGroup(s,{id:'pair',name:'Two benches',memberIds:['d1','d2']},C);
  s=G.createGroup(s,{id:'last',name:'Other custom',memberIds:['d3']},C);
  const raw=copy(s);raw.groups.forEach(g=>delete g.label);s=S.parseLayout(JSON.stringify(raw),C);
  const r=S.applyAction(s,{type:'REMOVE_FURNITURE',id:'d1'},C);
  assert.deepEqual(labels(r),['A','B']);assert.deepEqual(r.groups[0].memberIds,['d2']);assert.equal(r.groups[1].name,'Other custom');
});
test('floor-root attachment removes only that membership without relabeling survivors',()=>{
  const p={id:'p',machineId:'small',configurationId:'native-config',attachment:{parentId:null,surfaceId:'floor',...pose(2000,0)}};
  let s=S.createDefaultLayout({room:room(),furniture:[desk('d',0)],printers:[p]},C);
  s=G.createGroup(s,{id:'floor',name:'Floor printer',memberIds:['p']},C);
  s=G.createGroup(s,{id:'desk',name:'Bench',memberIds:['d']},C);
  const raw=copy(s);raw.groups.forEach(g=>delete g.label);s=S.parseLayout(JSON.stringify(raw),C);
  const r=S.applyAction(s,{type:'SET_ATTACHMENT',id:'p',attachment:{parentId:'d',surfaceId:'top',...pose()}},C);
  assert.deepEqual(labels(r),['B']);assert.equal(r.groups[0].id,'desk');assert.equal(r.printers[0].configurationId,'native-config');
});
test('ordinary pose edits and rigid group A/B/A retain legacy schema and anchors',()=>{
  const s=legacy(),text=encode(s),from=s.groups[0].pose;
  const moved=G.transformGroup(s,'g1',{xMm:from.xMm+100,zMm:from.zMm+50,yawDeg:37},C);
  assert(moved.groups.every(g=>!Object.hasOwn(g,'label')));assert.deepEqual(G.transformGroup(moved,'g1',from,C),s);
  const edited=S.applyAction(s,{type:'UPDATE_FURNITURE',id:'d2',patch:{pose:{xMm:s.furniture[1].pose.xMm+10}}},C);
  assert(edited.groups.every(g=>!Object.hasOwn(g,'label')));assert.deepEqual(labels(edited),['A','B','C']);assert.equal(encode(s),text);
});
test('capture/clipboard/library exclude unit label; each destination allocates independently',()=>{
  const s=legacy(),text=encode(s),t=G.captureGroupTemplate(s,'g1',C);
  assert.equal(t.name,'Custom [literal] name');assert(!Object.hasOwn(t,'label'));
  const clipped=H.captureLayoutClipboard(s,['g1'],C,{name:s.groups[0].name});assert(!Object.hasOwn(clipped,'label'));
  const decoded=H.decodeLayoutClipboard(H.encodeLayoutClipboard(clipped,C),C);assert.deepEqual(decoded,clipped);
  const a=G.instantiateGroupTemplate(s,t,{id:'copy1',xMm:0,zMm:3000},C);
  const b=G.instantiateGroupTemplate(a,decoded,{id:'copy2',xMm:2000,zMm:3000},C);
  assert.deepEqual(labels(b),['A','B','C','D','E']);assert.equal(b.groups[3].name,s.groups[0].name);assert.equal(b.groups[4].name,s.groups[0].name);
  assert.equal(encode(s),text);assert(s.groups.every(g=>!Object.hasOwn(g,'label')));
  assert.deepEqual(G.parseGroupLibrary(JSON.stringify([{id:'saved',template:t}]),C)[0].template,t);
  rejected(()=>G.validateGroupTemplate({...t,label:'A'},C),'GROUP_TEMPLATE');
  rejected(()=>H.decodeLayoutClipboard(JSON.stringify({...t,label:'A'}),C),'GROUP_TEMPLATE');
});
test('regroup materializes before filtering; existing reused ID retains its label',()=>{
  const s=legacy(),text=encode(s);
  const r=H.regroupLayoutSelection(s,{id:'new',name:'Regrouped',selectionIds:['g1']},C);
  assert.deepEqual(r.groups.map(g=>[g.id,g.label]),[['g2','B'],['g3','C'],['new','A']]);
  const reused=H.regroupLayoutSelection(s,{id:'g2',name:'Rebased identity',selectionIds:['g1','g2']},C);
  assert.equal(L.groupLabel(reused,'g2'),'B');assert.equal(L.groupLabel(reused,'g3'),'C');
  assert.equal(reused.groups.find(g=>g.id==='g2').name,'Rebased identity');assert.deepEqual(bodies(reused),bodies(s));assert.equal(encode(s),text);
});
test('all 64 units cover Z/AA and AZ/BA boundaries with persisted unique labels',()=>{
  let s=S.createDefaultLayout({room:room(),furniture:Array.from({length:64},(_,i)=>desk('d'+i,(i%8-3.5)*1200,(Math.floor(i/8)-3.5)*1000))},C);
  for(let i=0;i<64;i++)s=G.createGroup(s,{id:'g'+i,name:'Unchanged user name',memberIds:['d'+i]},C);
  const values=labels(s);assert.equal(new Set(values).size,64);assert.equal(values[25],'Z');assert.equal(values[26],'AA');assert.equal(values[51],'AZ');assert.equal(values[52],'BA');assert.equal(values[63],'BL');
  assert(s.groups.every((g,i)=>g.label===values[i]&&g.name==='Unchanged user name'));
  assert.deepEqual(S.parseLayout(encode(s),C),s);
});
test('explicit malformed and duplicate labels fail strict v1 validation',()=>{
  const s=grouped();
  for(const label of ['', 'a',' A','A ','A1','[A]','A\n','Ａ','ABCDEFG',null,0,{},[],undefined]){
    const raw=copy(s);raw.groups[0].label=label;
    assert(S.validateState(raw,C).errors.some(e=>e.code==='GROUP_LABEL'));
  }
  const duplicate=copy(s);duplicate.groups[2].label='A';rejected(()=>S.parseLayout(JSON.stringify(duplicate),C),'GROUP_LABEL_DUPLICATE');
  const explicit=copy(s);explicit.groups[0].label='ZZZZZZ';assert(S.validateState(explicit,C).ok);assert.equal(L.groupLabel(explicit,'g1'),'ZZZZZZ');
});
test('save/import and snapshot undo/redo preserve exact names, labels, IDs and poses',()=>{
  const a=legacy(),b=G.renameGroup(a,'g2','Custom rename',C),c=G.ungroup(b,'g1',C);
  const history=[a,b,c],encoded=history.map(encode),past=[a,b],future=[];
  let current=c;future.push(current);current=past.pop();assert.equal(encode(current),encoded[1]);
  future.push(current);current=past.pop();assert.equal(encode(current),encoded[0]);
  past.push(current);current=future.pop();assert.equal(encode(current),encoded[1]);
  past.push(current);current=future.pop();assert.equal(encode(current),encoded[2]);
  for(const s of history)assert.deepEqual(S.parseLayout(encode(s),C),s);
});
assert.deepEqual(hashes(),before,'model source changed while testing');
const report={passed:cases.every(c=>c.passed),cases,source_sha256:before,
  scope:'Group identity and strict native-v1 planning-data schema only; no UI/browser, actual model or native geometry evidence.'};
const reportAt=process.argv.indexOf('--report');
if(reportAt>=0)fs.writeFileSync(path.resolve(process.argv[reportAt+1]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
