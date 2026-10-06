/** Independently written, bounded template parser. Input never becomes JS. */
const UNDEFINED=Symbol('undefined'), forbidden=new Set(['__proto__','prototype','constructor']);
const identifier=/^[A-Za-z_][A-Za-z0-9_]*$/;
const safeKey=k=>{if(typeof k!=='string'&&typeof k!=='number'||forbidden.has(String(k))||String(k).startsWith('_'))throw Error('Unsupported template property: '+String(k));return k};
const numeric=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Template arithmetic requires finite numbers; convert params with float/int');return v};
const truth=v=>v!==UNDEFINED&&v!==null&&v!==false&&v!==0&&v!==''&&(typeof v!=='object'||Object.keys(v).length>0);
function lex(source){
 if(source.length>2048)throw Error('Template expression exceeds 2048 characters');
 const tokens=[];let i=0;
 while(i<source.length){
  if(/\s/.test(source[i])){i++;continue}
  const rest=source.slice(i),m=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest)||/^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
  if(m){tokens.push({type:/^\d|^\./.test(m[0])?'number':'name',value:m[0]});i+=m[0].length;continue}
  if(source[i]==='"'||source[i]==="'"){
   const quote=source[i++];let value='',closed=false;
   while(i<source.length){const c=source[i++];if(c===quote){closed=true;break}if(c==='\\'){const next=source[i++];if(!['\\',quote].includes(next))throw Error('Unsupported template string escape');value+=next}else value+=c}
   if(!closed)throw Error('Unclosed template string');tokens.push({type:'string',value});continue;
  }
  const op=/^(==|!=|<=|>=|[+*/%<>().,\[\]|=-])/.exec(rest);
  if(!op)throw Error('Unsupported template syntax near '+rest.slice(0,40));tokens.push({type:'op',value:op[0]});i+=op[0].length;
 }
 if(tokens.length>512)throw Error('Template expression exceeds 512 tokens');tokens.push({type:'end',value:'<end>'});return tokens;
}
function expression(source){
 const tokens=lex(source);let i=0,depth=0;
 const at=v=>tokens[i].value===v, take=v=>{if(at(v)){i++;return true}return false},expect=v=>{if(!take(v))throw Error('Expected template token '+v)};
 function primary(){
  if(++depth>32)throw Error('Template expression nesting exceeds 32');
  let node,t=tokens[i++];
  if(t.type==='number')node={type:'literal',value:Number(t.value)};
  else if(t.type==='string')node={type:'literal',value:t.value};
  else if(t.value==='('){node=logical();expect(')')}
  else if(t.value==='['){const items=[];if(!at(']'))do{items.push(logical())}while(take(','));expect(']');node={type:'list',items}}
  else if(t.type==='name'){
   safeKey(t.value);const literals={true:true,True:true,false:false,False:false,none:null,None:null};
   node=Object.hasOwn(literals,t.value)?{type:'literal',value:literals[t.value]}:{type:'name',name:t.value};
   if(take('(')){if(t.value!=='range')throw Error('Only range() is supported; template actions and arbitrary calls are unavailable');const args=[];if(!at(')'))do{args.push(logical())}while(take(','));expect(')');if(args.length<1||args.length>3)throw Error('range requires 1–3 arguments');node={type:'range',args}}
  }else throw Error('Unsupported template expression');
  while(true){
   if(take('.')){const key=tokens[i++];if(key.type!=='name')throw Error('Expected property name');safeKey(key.value);node={type:'get',object:node,key:{type:'literal',value:key.value}}}
   else if(take('[')){const key=logical();expect(']');node={type:'get',object:node,key}}
   else if(take('|')){const filter=tokens[i++].value;if(!['default','float','int'].includes(filter))throw Error('Unsupported template filter: '+filter);let arg=null;if(take('(')){arg=logical();expect(')')}if(filter!=='default'&&arg!==null)throw Error('Conversion filter arguments are unsupported');node={type:'filter',filter,node,arg}}
   else break;
  }
  depth--;return node;
 }
 function unary(){if(take('-'))return {type:'unary',op:'-',node:unaryBounded()};if(take('+'))return {type:'unary',op:'+',node:unaryBounded()};return primary()}
 function unaryBounded(){if(++depth>32)throw Error('Template expression nesting exceeds 32');const n=unary();depth--;return n}
 const binary=(lower,ops)=>()=>{let node=lower();while(ops.includes(tokens[i].value)){const op=tokens[i++].value;node={type:'binary',op,left:node,right:lower()}}return node};
 const product=binary(unary,['*','/','%']),sum=binary(product,['+','-']);
 function comparison(){let node=sum();if(['==','!=','<','>','<=','>=','in'].includes(tokens[i].value)){const op=tokens[i++].value;node={type:'binary',op,left:node,right:sum()}}if(take('is')){const negate=take('not');expect('defined');node={type:'defined',node,negate}}return node}
 function negate(){if(take('not')){if(++depth>32)throw Error('Template expression nesting exceeds 32');const n={type:'unary',op:'not',node:negate()};depth--;return n}return comparison()}
 const conjunction=binary(negate,['and']),logical=binary(conjunction,['or']);
 const root=logical();if(tokens[i].type!=='end')throw Error('Unsupported template syntax near '+tokens[i].value);return root;
}
function evaluate(n,scope,budget){
 if(--budget.operations<0)throw Error('Template operation budget exhausted');
 const ev=x=>evaluate(x,scope,budget);
 switch(n.type){
  case 'literal':return n.value;
  case 'name':return Object.hasOwn(scope,n.name)?scope[n.name]:UNDEFINED;
  case 'list':return n.items.map(ev);
  case 'get':{const obj=ev(n.object);let k=safeKey(ev(n.key));if(obj===UNDEFINED)throw Error('Undefined template parent');if(Array.isArray(obj)||typeof obj==='string'){if(!Number.isInteger(k))return UNDEFINED;if(k<0)k+=obj.length;return k>=0&&k<obj.length?obj[k]:UNDEFINED}return obj!==null&&typeof obj==='object'&&Object.hasOwn(obj,k)?obj[k]:UNDEFINED}
  case 'defined':return (ev(n.node)!==UNDEFINED)!==n.negate;
  case 'filter':{
   const v=ev(n.node);if(n.filter==='default')return v===UNDEFINED?(n.arg?ev(n.arg):''):v;
   if(v===UNDEFINED||v===null||typeof v==='object'||typeof v==='boolean'||typeof v==='string'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim()))throw Error('Invalid template numeric conversion');
   const number=numeric(Number(v));return n.filter==='int'?Math.trunc(number):number;
  }
  case 'range':{
   const args=n.args.map(ev);if(args.some(v=>!Number.isSafeInteger(v)))throw Error('range requires safe integers');
   const [start,stop,step]=args.length===1?[0,args[0],1]:[args[0],args[1],args[2]??1];if(!step)throw Error('range step cannot be zero');
   const count=Math.max(0,Math.ceil((stop-start)/step));if(count>256)throw Error('range exceeds 256 iterations');return Array.from({length:count},(_,i)=>start+i*step);
  }
  case 'unary':{const v=ev(n.node);return n.op==='not'?!truth(v):n.op==='-'?-numeric(v):numeric(v)}
  case 'binary':{
   const a=ev(n.left);if(n.op==='and')return truth(a)?ev(n.right):a;if(n.op==='or')return truth(a)?a:ev(n.right);
   const b=ev(n.right);if(a===UNDEFINED||b===UNDEFINED)throw Error('Undefined template value; use default or is defined');
   if(n.op==='=='||n.op==='!='){if(a!==null&&typeof a==='object'||b!==null&&typeof b==='object'||typeof a==='boolean'&&typeof b==='number'||typeof b==='boolean'&&typeof a==='number')throw Error('Object and mixed boolean/numeric equality are unsupported');return n.op==='=='?a===b:a!==b}
   if(n.op==='in'){if(typeof b==='string'&&typeof a==='string')return b.includes(a);if(Array.isArray(b))return b.includes(a);throw Error('in supports strings/lists only')}
   if(['<','>','<=','>='].includes(n.op)){if(typeof a!==typeof b||!['number','string'].includes(typeof a))throw Error('Unsupported comparison operands');return n.op==='<'?a<b:n.op==='>'?a>b:n.op==='<='?a<=b:a>=b}
   numeric(a);numeric(b);const result=n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:n.op==='/'?a/b:a%b;return numeric(result);
  }
 }
 throw Error('Unsupported template expression node');
}
export function evaluateMacroValue(source,scope={}){const v=evaluate(expression(source),scope,{operations:10000});if(v===UNDEFINED)throw Error('Undefined template value');return v}
function template(source){
 const root=[],stack=[];let body=root,line=1,i=0;
 const push=node=>{body.push(node);if(++nodes>4096)throw Error('Template exceeds 4096 nodes')};let nodes=0;
 while(i<source.length){
  const start=source.indexOf('{',i),end=start<0?source.length:start;
  if(end>i){const value=source.slice(i,end);push({type:'text',value,line});line+=(value.match(/\n/g)||[]).length;i=end}
  if(start<0)break;
  const control=source.startsWith('{%',i),close=source.indexOf(control?'%}':'}',i+1);if(close<0)throw Error('Unclosed template delimiter at line '+line);
  const value=source.slice(i+(control?2:1),close).trim(),atLine=line;
  line+=(source.slice(i,close+(control?2:1)).match(/\n/g)||[]).length;i=close+(control?2:1);
  if(!control){push({type:'output',expression:expression(value),line:atLine});continue}
  let m;
  if((m=/^set ([a-z][a-z0-9_]*)\s*=\s*(.+)$/s.exec(value))){if(['params','printer','rawparams','range'].includes(m[1]))throw Error('Reserved template variable');push({type:'set',name:m[1],expression:expression(m[2]),line:atLine})}
  else if(value.startsWith('if ')){const node={type:'if',branches:[{condition:expression(value.slice(3)),body:[]}],line:atLine};push(node);stack.push({node,parent:body});body=node.branches[0].body}
  else if(value.startsWith('elif ')||value==='else'){const s=stack.at(-1);if(s?.node.type!=='if'||s.node.branches.at(-1).condition===null)throw Error('Unexpected '+value);const branch={condition:value==='else'?null:expression(value.slice(5)),body:[]};s.node.branches.push(branch);body=branch.body}
  else if((m=/^for ([a-z][a-z0-9_]*) in (.+)$/s.exec(value))){if(['params','printer','rawparams','range'].includes(m[1]))throw Error('Reserved loop variable');const node={type:'for',name:m[1],expression:expression(m[2]),body:[],line:atLine};push(node);stack.push({node,parent:body});body=node.body}
  else if(value==='endif'||value==='endfor'){const s=stack.pop();if(!s||s.node.type!==(value==='endif'?'if':'for'))throw Error('Mismatched template block');body=s.parent}
  else throw Error('Unsupported template directive: '+value);
  if(stack.length>16)throw Error('Template block nesting exceeds 16');
 }
 if(stack.length)throw Error('Unclosed template block');return root;
}
const macroName=/^[A-Za-z_]+\d*$/;
/** Config comments end at an unquoted #; quoted escapes retain their source text. */
function withoutConfigComment(line){
 let quote=null,escaped=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null}
  else if(c==='"'||c==="'")quote=c;
  else if(c==='#')return line.slice(0,i).trimEnd();
 }
 return line.trimEnd();
}
export function compileMacroLibrary(config=''){
 if(typeof config!=='string'||config.length>128000)throw Error('Macro configuration must be text within 128000 characters');
 const definitions=Object.create(null);let current=null,inGcode=false;
 for(const [i,raw] of config.split(/\r?\n/).entries()){
  const line=withoutConfigComment(raw);
  const header=/^\[gcode_macro ([A-Za-z_]+\d*)\]\s*$/.exec(line);
  if(header){const name=header[1].toUpperCase();if(Object.hasOwn(definitions,name))throw Error('Duplicate macro '+name);if(Object.keys(definitions).length>=128)throw Error('At most 128 macros');current={name,gcode:'',variables:Object.create(null),line:i+1};definitions[name]=current;inGcode=false;continue}
  if(!line.trim()||/^\s*;/.test(line)){if(current&&inGcode)current.gcode+='\n';continue}
  if(!current)throw Error('Only [gcode_macro NAME] sections are supported (configuration line '+(i+1)+')');
  if(/^\s/.test(line)&&inGcode){current.gcode+=line.trimStart()+'\n';continue}
  if(line==='gcode:'){if(inGcode||current.gcode)throw Error('Duplicate gcode field');inGcode=true;current.gcode_line=i+2;continue}
  if(/^rename_existing\s*:/.test(line))throw Error('Unsupported macro option rename_existing (configuration line '+(i+1)+')');
  const variable=/^variable_([a-z][a-z0-9_]*):\s*(.+)$/.exec(line);
  if(variable){safeKey(variable[1]);if(Object.hasOwn(current.variables,variable[1]))throw Error('Duplicate macro variable');const v=evaluateMacroValue(variable[2]);if(v!==null&&!['number','boolean','string'].includes(typeof v))throw Error('Macro variables must be scalar');current.variables[variable[1]]=v;inGcode=false;continue}
  if(/^description:/.test(line)){inGcode=false;continue}
  throw Error('Unsupported macro configuration at line '+(i+1)+': '+line.slice(0,80));
 }
 for(const d of Object.values(definitions)){
  if(!macroName.test(d.name)||!d.gcode.trim())throw Error('Macro requires a gcode body: '+d.name);
  try{d.ast=template(d.gcode)}catch(e){throw Error(d.name+': '+e.message)}
 }
 return definitions;
}
export function renderMacro(definition,params,printer,budget={operations:100000,characters:2000000}){
 const scope=Object.assign(Object.create(null),{params,printer});let chunks=[],characters=0;
 function emit(value,line){characters+=value.length;budget.characters-=value.length;if(budget.characters<0||characters>128000)throw Error('Macro output budget exhausted');chunks.push({value,line})}
 function walk(nodes,local){for(const n of nodes){
  if(--budget.operations<0)throw Error('Template operation budget exhausted');
  const ev=ast=>evaluate(ast,local,budget);
  if(n.type==='text')emit(n.value,n.line);
  else if(n.type==='output'){const v=ev(n.expression);if(v===UNDEFINED||v===null||typeof v==='object')throw Error('Template output requires a defined scalar');const value=typeof v==='boolean'?(v?'True':'False'):String(v);if(/[\r\n{}]/.test(value))throw Error('Template output cannot inject new lines or templates');emit(value,n.line)}
  else if(n.type==='set')local[n.name]=ev(n.expression);
  else if(n.type==='if'){for(const b of n.branches)if(b.condition===null||truth(ev(b.condition))){walk(b.body,local);break}}
  else if(n.type==='for'){const values=ev(n.expression);if(!Array.isArray(values)||values.length>256)throw Error('for requires a list/range within 256 iterations');for(const value of values)walk(n.body,Object.assign(Object.create(null),local,{[n.name]:value}))}
 }}
 walk(definition.ast,scope);
 const lines=[];let text='',origin=1;
 for(const chunk of chunks){let sourceLine=chunk.line;for(const part of chunk.value.split(/(\n)/)){if(part==='\n'){lines.push({text,macro_line:origin,configuration_line:(definition.gcode_line||1)+origin-1});text='';sourceLine++}else if(part){if(!text)origin=sourceLine;text+=part}}}
 if(text)lines.push({text,macro_line:origin,configuration_line:(definition.gcode_line||1)+origin-1});return lines;
}
