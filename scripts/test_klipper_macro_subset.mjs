import assert from 'node:assert/strict';
import {compileMacroLibrary,renderMacro,evaluateMacroValue} from '../site/viewer/klipper-macro-subset.mjs';
const render=(body,params={},printer={})=>renderMacro(compileMacroLibrary('[gcode_macro TEST]\ngcode:\n'+body.split('\n').map(l=>'  '+l).join('\n')).TEST,params,printer).map(r=>r.text.trim()).filter(Boolean);
assert.deepEqual(render('{% set n = params.N|default(3)|int %}\n{% for i in range(n) %}\n{% if i == 1 %}\nG1 X{i + 2}\n{% else %}\nG4 P10\n{% endif %}\n{% endfor %}'),['G4 P10','G1 X3','G4 P10']);
assert.deepEqual(render('{% if params.X is defined %}\nG1 X{params.X|float}\n{% elif printer.toolhead.homed_axes == "xyz" %}\nG1 Z{printer["gcode_macro A"].height}\n{% else %}\nG4 P5\n{% endif %}',{}, {toolhead:{homed_axes:'xyz'},'gcode_macro A':{height:2}}),['G1 Z2']);
assert.equal(evaluateMacroValue('not false and 2 in [1, 2, 3]'),true);
assert.equal(evaluateMacroValue('-2 + 3 * 4'),10);
assert.equal(evaluateMacroValue('params.X|default(2)|float / 2',{params:{}}),1);
assert.equal(evaluateMacroValue('params.X is not defined',{params:{}}),true);
assert.deepEqual(render('{% for i in range(3, 0, -1) %}\nG1 X{i}\n{% endfor %}'),['G1 X3','G1 X2','G1 X1']);
for(const expression of ['printer.constructor','printer["__proto__"]','printer.__class__','action_call_remote_method("x")','eval("x")','range(1).constructor','params.X|random','1/0','params.X + 1','range(257)','range(0, 1, 0)','true + 2'])assert.throws(()=>evaluateMacroValue(expression,{params:{X:'2'},printer:{}}),undefined,expression);
for(const body of ['{% import "x" %}','{% if true %}x','{% endif %}','{% set printer = 1 %}','{% for printer in range(1) %}x{% endfor %}','{% if false %}{action_emergency_stop()}{% endif %}','{{ params.X }}'])assert.throws(()=>render(body,{X:'1'}),undefined,body);
assert.throws(()=>render('G1 X{params.X}',{X:'1\nM112'}),/inject/);
assert.throws(()=>render('G1 X{params.X}',{X:'1{bad}'}),/inject/);
assert.throws(()=>render('{% for i in range(256) %}{% for j in range(256) %}G4 P1\n{% endfor %}{% endfor %}'),/budget/);
assert.throws(()=>compileMacroLibrary('[include other.cfg]'),/Only/);
assert.throws(()=>compileMacroLibrary('[gcode_macro TEST] # valid header comment\nrename_existing: BASE # unsupported option\ngcode:\n  G21'),/Unsupported macro option rename_existing \(configuration line 2\)/);
assert.throws(()=>compileMacroLibrary('[gcode_macro TEST]\ngcode:\n  G21\n[gcode_macro test]\ngcode:\n  G21'),/Duplicate/);
assert.throws(()=>compileMacroLibrary('[gcode_macro BAD1NAME]\ngcode:\n  G21'));
assert.throws(()=>evaluateMacroValue('('.repeat(40)+'1'+')'.repeat(40)),/nesting/);
assert.throws(()=>evaluateMacroValue('not '.repeat(40)+'true'),/nesting/);
const defs=compileMacroLibrary('[gcode_macro T1]\nvariable_temperature: 200\nvariable_label: "virtual"\ngcode:\n  ACTIVATE_EXTRUDER EXTRUDER=extruder1');
assert.equal(defs.T1.variables.temperature,200);assert.equal(defs.T1.variables.label,'virtual');
const commented=compileMacroLibrary(`# leading configuration comment
[gcode_macro HASH] # header comment {action_call_remote_method("unused")}
description: "quoted#description" # trailing comment
variable_label: "double#literal" # ignored
variable_single: 'single#literal' # ignored
variable_escaped: "quote\\\"#literal" # ignored
variable_slash: 'slash\\\\' # ignored after escaped backslash
variable_temperature: 200 # scalar comment
gcode: # body field comment
  # whole body comment

  {% set label = '#template' %} # trailing template comment
  SET_GCODE_VARIABLE MACRO=HASH VARIABLE=label VALUE="{label}" # command comment
  G4 P10# no whitespace required
`);
assert.equal(commented.HASH.variables.label,'double#literal');assert.equal(commented.HASH.variables.single,'single#literal');
assert.equal(commented.HASH.variables.escaped,'quote"#literal');assert.equal(commented.HASH.variables.slash,'slash\\');assert.equal(commented.HASH.variables.temperature,200);
const hashRows=renderMacro(commented.HASH,{},{}).filter(r=>r.text.trim());
assert.equal(hashRows[0].text,'SET_GCODE_VARIABLE MACRO=HASH VARIABLE=label VALUE="#template"');
assert.equal(hashRows[0].macro_line,4);assert.equal(hashRows[0].configuration_line,13);assert.equal(hashRows[1].text,'G4 P10');
assert.throws(()=>compileMacroLibrary('[gcode_macro HASH] # header\nvariable_bad: "unclosed#literal\ngcode:\n  G21'),/Unclosed template string/);
assert.throws(()=>compileMacroLibrary('[gcode_macro HASH] # header\ngcode: # field\n  {% if false %}\n  {action_emergency_stop()} # still parsed\n  {% endif %}'),/arbitrary calls/);
console.log('Klipper subset: grammar, conversion, conditions, lists, bounded loops, scalar config, injection/property/call rejection passed.');
