import assert from 'node:assert/strict';
import {configurationById,resolveVariant,choicesFor,choiceOptions,configurationOptions,choiceChanges,importedVariant} from '../site/viewer/configuration-model.js';

const dimensions=['gantry','toolhead','mount','extruder','hotend','carriage','probe','board','cooling'];
const stock={id:'stock',gantry:'r2',toolhead:'sb',mount:'fixed',extruder:'cw2',hotend:'hf',carriage:'stock',probe:'none',board:'stock',cooling:'air'};
const uhf={...stock,id:'uhf',hotend:'uhf'},coil={...stock,id:'coil',probe:'coil'};
const other={...stock,id:'other',gantry:'awd',toolhead:'xol',extruder:'sherpa'};
const archive={...stock,id:'archive',hotend:'print',base_asset:'head_print_sb',head_only:true,fit:{complete_head_native:{state:'reference'}}};
const duplicate={...stock,id:'duplicate'},sourceAlias={...stock,id:'installed__source',source_head_configuration:'source'};
const list=ids=>ids.map(id=>({id,label:id}));
const catalog={machine_id:'fixture',dimensions,variants:[stock,uhf,coil,other,archive,duplicate,sourceAlias],
 gantries:list(['r2','awd']),toolheads:list(['sb','xol','missing']),mounts:list(['fixed']),extruders:list(['cw2','sherpa']),hotends:list(['hf','uhf','print']),carriages:list(['stock']),probes:list(['none','coil']),boards:list(['stock']),cooling_options:list(['air']),configuration_aliases:{legacy:'uhf'}};

assert.equal(configurationById(catalog,'legacy'),uhf);
assert.equal(configurationById(catalog,'source'),sourceAlias);
assert.equal(configurationById(catalog,'unknown'),undefined);
assert.equal(importedVariant(catalog,{machine:'fixture',id:'legacy'}),uhf);
assert.throws(()=>importedVariant(catalog,{machine:'other',id:'legacy'}));
assert.throws(()=>importedVariant(catalog,{id:'unknown'}));
assert.deepEqual(choicesFor(catalog,stock,'toolhead').map(r=>r.id),['sb','xol']);
assert.equal(resolveVariant(catalog,{...stock,toolhead:'xol'},'toolhead'),other);
assert.deepEqual(choicesFor(catalog,stock,'hotend').map(r=>r.id),['hf','uhf']);
assert(choicesFor(catalog,archive,'hotend').some(r=>r.id==='print'));
assert.equal(resolveVariant(catalog,{...stock,hotend:'print'},'hotend'),null);
assert.equal(resolveVariant(catalog,coil,'toolhead'),coil);
// First tuple wins, even when a later row shares all dimensions.
assert.equal(resolveVariant(catalog,duplicate),stock);
for(const v of catalog.variants)for(const dimension of dimensions){
 const plans=choiceOptions(catalog,v,dimension);
 assert.deepEqual(configurationOptions(catalog,v).get(dimension),plans);
 assert.deepEqual(plans.map(p=>p.row),choicesFor(catalog,v,dimension));
 for(const {row,candidate,changes} of plans){
  assert.equal(candidate,resolveVariant(catalog,{...v,[dimension]:row.id},dimension));
  assert.deepEqual(changes,choiceChanges(catalog,v,dimension,row.id));
 }
}

// Catalog composition replaces arrays; invalidate on replacement and growth.
const changed={...catalog,variants:[stock]};
assert.equal(configurationById(changed,'stock'),stock);
changed.variants=[uhf];
assert.equal(configurationById(changed,'stock'),undefined);
assert.equal(configurationById(changed,'uhf'),uhf);
changed.variants.push(coil);
assert.equal(configurationById(changed,'coil'),coil);
const sourceFirst={...sourceAlias,id:'source'},sourceSecond={...sourceAlias,id:'source'};
changed.variants=[sourceAlias,sourceFirst,sourceSecond];
assert.equal(configurationById(changed,'source'),sourceFirst,'Exact IDs precede source aliases, and duplicate IDs keep their first row');
changed.variants.reverse();
assert.equal(configurationById(changed,'source'),sourceSecond);
assert.equal(resolveVariant(changed,stock),sourceSecond);
const replacement={...stock,id:'replacement',hotend:'new'};
changed.variants[0]=replacement;
assert.equal(configurationById(changed,'replacement'),replacement);
assert.equal(importedVariant(changed,{machine:'fixture',id:'replacement'}),replacement);
replacement.id='renamed';replacement.hotend='renamed-hotend';
assert.equal(configurationById(changed,'replacement'),undefined);
assert.equal(resolveVariant(changed,replacement),replacement);
assert.equal(configurationById(changed,'renamed'),replacement);
sourceAlias.source_head_configuration='new-source';
assert.equal(configurationById(changed,'new-source'),sourceAlias);
assert.equal(configurationById(changed,'source'),sourceFirst);

// Adding a dimension after composition must not reuse an incomplete index.
const a={id:'a',toolhead:'sb',new_dimension:'a'},b={id:'b',toolhead:'sb',new_dimension:'b'};
const dynamic={dimensions:['toolhead'],variants:[a,b]};
assert.equal(resolveVariant(dynamic,b),a);
dynamic.dimensions.push('new_dimension');
assert.equal(resolveVariant(dynamic,b),b);
const unusual={dimensions:['toolhead'],toolheads:list([null,undefined,NaN,'x__y']),variants:[{id:'x',toolhead:null},{id:'y'},{id:NaN,toolhead:NaN},{id:'x__y',toolhead:'x__y'}]};
assert.equal(configurationById(unusual,NaN),undefined);
assert.throws(()=>importedVariant(unusual,{id:NaN}));
assert.deepEqual(choicesFor(unusual,unusual.variants[0],'toolhead').map(r=>r.id),[null,undefined,'x__y']);
console.log('Indexed configuration menus: first-match IDs and tuples, aliases, dependent hardware, cross-gantry choices, plans, rejected imports, array replacement/growth and dimension changes passed.');
