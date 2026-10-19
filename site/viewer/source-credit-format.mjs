// Repository terms below are bound to the exact pinned source and retained
// license bytes in PUBLIC_CATALOG. They do not replace component exceptions.
export const sourceRepositoryTerms=[
 {owner:'VoronDesign',repo:'Voron-Trident',commit:'a8628f48546948ce1fc15511b7765b7f31f80722',license:'GPL-3.0',license_sha256:'3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'},
 {owner:'Armchair-Heavy-Industries',repo:'Archetype',commit:'152709791048d67aab45ea7b774cc16c2a25efd0',license:'CC-BY-NC-SA-4.0',license_sha256:'019cf2317db286f24a9f0494cbdbb5c491292f6d2ac7d59c94ae0f78e4964df0'}
];
export function sourceCreditPresentation(source){
 const url=new URL(source.url),parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent),github=['github.com','raw.githubusercontent.com'].includes(url.hostname);
 const commit=parts.find(p=>/^[a-f0-9]{40}$/i.test(p));
 let label=source.author;
 if(github&&parts.length>=2){label=parts.slice(0,2).join('/');if(url.hostname==='raw.githubusercontent.com'||parts.length>4)label+=' / '+parts.at(-1);}
 else if(!label){label=url.hostname;if(url.hostname.includes('printables.com'))label+=' / '+(parts.find(p=>/^\d+-/.test(p))??parts.at(-1)??'');else if(parts.at(-1)&&/\.[a-z0-9]{2,5}$/i.test(parts.at(-1)))label+=' / '+parts.at(-1);}
 const raw=source.revision??source.source_revision??'',pin=commit??raw.match(/\b[a-f0-9]{40}\b/i)?.[0],version=raw.match(/(?:^|\s)(v\d+\.\d+(?:\.\d+){0,2}(?:[-+][\w.-]+)?)\b/i)?.[1];
 const repository=github?sourceRepositoryTerms.find(r=>parts[0]===r.owner&&parts[1]===r.repo&&commit===r.commit):null;
 return {label,revision:pin??version??null,repository_license:repository?.license??null};
}

export function groupedSourceCredits(sources){
 const groups=new Map();
 for(const source of sources){
  const p=sourceCreditPresentation(source),key=[source.url,p.revision].join();
  if(!groups.has(key))groups.set(key,{...source,license_variants:[]});
  const group=groups.get(key);if(!group.license_variants.includes(source.license))group.license_variants.push(source.license);
 }
 return [...groups.values()];
}
