// Scene tools reuse the application's normal placement transactions.
const tools=[
['select','layout.tools.select','M4 3v17l5-5 4 6 3-2-4-6h7Z'],
['printer','layout.printers','M5 3h14v18H5ZM5 7h14M8 17h8M12 7v6m-2 0h4l-2 3Z'],
['desk','layout.desk','M3 9h18M4 9V6h16v3M5 9v12M19 9v12'],
['shelf','layout.shelf','M4 3h16v18H4ZM4 9h16M4 15h16'],
['window','layout.openings.window','M4 4h16v16H4ZM12 4v16M4 12h16'],
['hinged','layout.openings.hinged','M5 21V3h14v18M5 3l10 3v15M11 12h1'],
['sliding','layout.openings.sliding','M3 4h18v16H3ZM12 4v16M5 12h5m-2-2 2 2-2 2M19 12h-5m2-2-2 2 2 2']
];
export function createLayoutBuildToolbar({container,onAction,t}){
if(!container?.ownerDocument||typeof onAction!=='function'||typeof t!=='function')throw TypeError('Layout build toolbar requires a container, actions and translations');
const doc=container.ownerDocument,buttons=[];let translate=t,disabled=false,disposed=false,active='select',tab=0;
const root=doc.createElement('div');root.className='layout-build-toolbar';root.setAttribute('role','toolbar');
const cleanups=[];
function listen(node,name,fn){node.addEventListener(name,fn);cleanups.push(()=>node.removeEventListener(name,fn));}
function run(kind){
if(disposed||disabled)return;
if(kind==='select')onAction({type:'select-tool'});
else if(kind==='printer')onAction({type:'open-printer-catalog'});
else if(kind==='desk'||kind==='shelf')onAction({type:'add',kind});
else onAction({type:'room-opening-place',kind:kind==='window'?'window':'door',...(kind==='window'?{}:{motion:kind})});
}
for(const [index,[kind,key,path]]of tools.entries()){
const button=doc.createElement('button');button.type='button';button.dataset.layoutBuild=kind;
const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
const line=doc.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);svg.append(line);
const label=doc.createElement('span');label.dataset.toolLabel=key;
const shortcut=doc.createElement('kbd');shortcut.textContent=String(index+1);shortcut.setAttribute('aria-hidden','true');
button.setAttribute('aria-keyshortcuts',String(index+1));button.append(svg,label,shortcut);root.append(button);buttons.push(button);
listen(button,'click',()=>{tab=index;refresh();run(kind);});
listen(button,'keydown',event=>{
if(disabled||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;
else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;
event.preventDefault();event.stopPropagation();tab=next;refresh();buttons[next].focus();
});
}
function refresh(){
root.setAttribute('aria-label',translate('layout.tools.title'));
for(const [index,button]of buttons.entries()){
const label=translate(tools[index][1]);button.querySelector('[data-tool-label]').textContent=label;
button.setAttribute('aria-label',label);button.title=`${label} (${index+1})`;button.disabled=disabled;
button.setAttribute('aria-pressed',String(tools[index][0]===active));button.tabIndex=index===tab?0:-1;
}
}
container.replaceChildren(root);container.hidden=false;refresh();
return Object.freeze({
setState({busy=false,roomEditing=false,placementKind=null,openingTool=null}={}){
if(disposed)return;
const nextDisabled=!!(busy||roomEditing),next=openingTool?(openingTool.kind==='window'?'window':openingTool.motion||'hinged'):placementKind||'select';
if(disabled===nextDisabled&&active===next)return;
disabled=nextDisabled;active=next;const index=tools.findIndex(row=>row[0]===active);if(index>=0)tab=index;refresh();
},
setLocale(t){if(disposed)return;translate=t;refresh();},
handleKey(event){
if(disposed||disabled||event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog'))return false;
const index=Number(event.key)-1;if(!/^[1-7]$/.test(event.key)||!tools[index])return false;
event.preventDefault();run(tools[index][0]);return true;
},
dispose(){if(disposed)return;disposed=true;for(const cleanup of cleanups)cleanup();root.remove();container.hidden=true;}
});
}
