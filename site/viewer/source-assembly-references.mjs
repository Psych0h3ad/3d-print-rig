// Keep the source section after its legacy anchor is replaced or moved by the
// shared workspace. Credits must remain in the common References tab.
import {groupedSourceCredits} from './source-credit-format.mjs';
export function sourceReferencePanel(document) {
 const panel=document.getElementById('panel-reference');
 let section=document.getElementById('nativeSource')?.closest('details')??document.getElementById('sourceReferences');
 if(!section){
  if(!panel)throw Error('Missing source References panel');
  section=document.createElement('details');
  section.classList.add('panel-section');
 }
 section.id='sourceReferences';section.dataset.i18n='off';
 if(panel&&!panel.contains(section))panel.append(section);
 return section;
}

export function sourceCreditRecords(packet) {
 const seen=new Set(),rows=[];
 for(const source of [packet.public_author_source,...packet.public_sources]){
  if(typeof source?.url!=='string'||!source.url.startsWith('https://'))throw Error('Missing public source URL');
  const url=new URL(source.url);if(url.username||url.password)throw Error('Invalid public source URL');
  const key=[source.url,source.revision??source.source_revision,source.license].join();
  if(!seen.has(key)){seen.add(key);rows.push(source);}
 }
 return groupedSourceCredits(rows);
}
