import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const code=await fs.readFile(new URL('../site/viewer/source-map-app.mjs',import.meta.url),'utf8');
const line=code.split(/\r?\n/).find(s=>s.includes("$('#mapExport').onclick=async()=>"));assert(line?.trim().endsWith(';'));
const expression=line.slice(line.indexOf('=async')+1).trim().replace(/;$/,'');
const make=new Function('fixture',`with(fixture){return (${expression})}`);
let cases=0;
for(const outcome of ['blob','empty','reject']){
 let disposed=false,release,reject,lateCalls=0,downloads=0;const output={disabled:false},status={hidden:true,textContent:''};
 const fixture={get disposed(){return disposed},stage:{getBoundingClientRect:()=>({width:1280,height:720})},camera:{aspect:1280/720},renderer:{getPixelRatio:()=>1,setPixelRatio(){if(disposed)lateCalls++},setSize(){if(disposed)lateCalls++},render(){if(disposed)lateCalls++},domElement:{toBlob:fn=>{release=fn}}},scene:{},index:{verifyLive(){}},download(){downloads++},id:'fixture',render(){if(disposed)lateCalls++},$:s=>s==='#mapExport'?output:status,Promise:class extends Promise{constructor(executor){super((yes,no)=>{reject=no;executor(yes,no)})}}};
 const pending=make(fixture)();assert.equal(output.disabled,true);assert.equal(typeof release,'function');disposed=true;
 if(outcome==='reject')reject(Error('Controlled late callback'));else release(outcome==='empty'?null:{type:'image/png'});
 await pending;assert.equal(downloads,0);assert.equal(lateCalls,0);assert.equal(status.hidden,true);assert.equal(output.disabled,true);cases++;
}
let touched=0;await make({disposed:true,$(){touched++;throw Error('Closed view')}})();assert.equal(touched,0);cases++;
console.log(JSON.stringify({cases,scope:'Exact source-app export handler with deferred canvas callback/renderer fixtures;no GPU toBlob or physical-fit claim'}));
