import assert from 'node:assert/strict';
import {choicesFor,resolveVariant,choiceChanges,headBuilderDimensions} from '../site/viewer/configuration-model.js';
import {translate} from '../site/viewer/i18n.mjs';
const row=(id,extruder,hotend,cooling,mount,gantry,probe='none',board='none')=>({id,toolhead:'sb',extruder,hotend,cooling,mount,gantry,probe,board,carriage:'standard'});
const variants=[row('cw-revo','cw','revo','source','fixed','r2'),row('g2-revo','g2','revo','source','fixed','r2'),row('chube','cw','chube','source','fixed','r2'),row('g2-cpap','g2','revo','cpap','fixed','r2'),row('sc','g2','revo','source','changer','sc'),row('probe','g2','revo','source','fixed','r2','beacon'),row('board','g2','revo','source','fixed','r2','none','can'),{...row('other','orbiter','dragon','source','fixed','r2'),toolhead:'xol'}];
const collections={toolhead:'toolheads',extruder:'extruders',hotend:'hotends',cooling:'cooling_options',mount:'mounts',gantry:'gantries',probe:'probes',board:'boards',carriage:'carriages'};
const c={variants,dimensions:headBuilderDimensions};for(const[k,v]of Object.entries(collections))c[v]=[...new Set(variants.map(r=>r[k]))].map(id=>({id}));
const g2=variants[1];assert(choicesFor(c,g2,'hotend').some(r=>r.id==='chube'));assert.deepEqual(choiceChanges(c,g2,'hotend','chube'),['extruder']);assert.equal(resolveVariant(c,{...g2,hotend:'chube'},'hotend').id,'chube');
assert(choicesFor(c,g2,'mount').some(r=>r.id==='changer'));assert.deepEqual(choiceChanges(c,g2,'mount','changer'),['gantry']);
assert(!choicesFor(c,g2,'hotend').some(r=>r.id==='dragon'),'Another head must not leak into this component menu');
assert.equal(resolveVariant(c,{...g2,hotend:'unknown'},'hotend'),null);
assert(!choicesFor(c,variants[2],'probe').some(r=>r.id==='beacon'),'Do not swap a hotend just to fit a probe');
assert(!choicesFor(c,variants[2],'board').some(r=>r.id==='can'),'Do not swap an extruder just to fit a board');
const printer={...c,dimensions:['gantry',...headBuilderDimensions.filter(k=>k!=='gantry')]};
assert(!choicesFor(printer,g2,'mount').some(r=>r.id==='changer'),'Machine gantry stays fixed during component browsing');
assert.equal(resolveVariant(printer,{...g2,mount:'changer'},'mount'),null);
for(const v of variants)for(const d of c.dimensions)for(const option of choicesFor(c,v,d)){
 const next=resolveVariant(c,{...v,[d]:option.id},d);assert(variants.includes(next));assert.equal(next[d],option.id);if(!['toolhead','mount'].includes(d))assert.equal(next.toolhead,v.toolhead);
}
const monolith={...c,dimensions:printer.dimensions,variants:[{...variants[4],gantry:'monolith'},{...g2,id:'fixed-sphinx',toolhead:'sphinx',gantry:'monolith'}]};
const sc=monolith.variants[0];assert(choicesFor(monolith,sc,'mount').some(r=>r.id==='fixed'));assert.equal(resolveVariant(monolith,{...sc,mount:'fixed'},'mount').toolhead,'sphinx');assert(choiceChanges(monolith,sc,'mount','fixed').includes('toolhead'));
assert.equal(translate('Chube Compact · 組み合わせ変更あり'),'Chube Compact · Companion changes required');
console.log('Component choices: registered companion changes remain discoverable; head/gantry context and probe/board mounting stay bound.');

const installed={...printer,variants:[{...g2,id:'stock-nine',gantry:'awd'},{...g2,id:'sphinx-six',toolhead:'sphinx',gantry:'r2'}],toolheads:[{id:'sb'},{id:'sphinx'}]};
const kit=installed.variants[0];assert(choicesFor(installed,kit,'toolhead').some(r=>r.id==='sphinx'));
assert.equal(resolveVariant(installed,{...kit,toolhead:'sphinx'},'toolhead').gantry,'r2');
assert.deepEqual(choiceChanges(installed,kit,'toolhead','sphinx'),['gantry']);
const withNine={...installed,variants:[...installed.variants,{...installed.variants[1],id:'sphinx-nine',gantry:'awd'}]};
assert.equal(resolveVariant(withNine,{...kit,toolhead:'sphinx'},'toolhead').gantry,'awd');
console.log('Installed heads requiring another registered gantry stay discoverable; a fitting current gantry takes precedence.');
