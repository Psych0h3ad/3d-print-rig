// The original Xol/Sherpa assembly embeds SHT-36v2 electronics. Identify them
// from the source assembly hierarchy, not part names or bounding-box guesses.
export function xolEmbeddedBoard(meta){
 const keys=meta.parts.filter(p=>p.source?.path?.some(segment=>/^SHT-36v2(?:\s|$)/.test(segment))).map(p=>String(p.key));
 if(!keys.length)throw Error('Xolの原本内蔵基板を特定できません');
 return {id:'sht36_stock',base:'xol',mask:'hidden_xol_keys',suffix:'without_sht36',label:'Mellow SHT36 V2 · 原本内蔵',keys};
}
export function sbEmbeddedBoard(meta){
 const keys=meta.parts.filter(p=>['EBB 2209 CAN','BTT CAN接头'].includes(p.name)).map(p=>String(p.key));
 if(keys.length!==2)throw Error('SBの原本内蔵基板を特定できません');
 return {id:'ebb2209_stock',base:'stealthburner',mask:'removed_stock_keys',suffix:'without_ebb2209',label:'BTT EBB2209 · 原本内蔵',keys};
}
export function withEmbeddedBoards(catalog,board){
 if(!board)return catalog;
 if(Array.isArray(board)){const result=board.reduce((c,b)=>withEmbeddedBoards(c,b),catalog);return {...result,embedded_board:board}}
 const variants=[],ids=new Set(catalog.variants.map(v=>v.id));let used=false;
 for(const source of catalog.variants){
  const hidden=source.base_hidden_keys||source[board.mask]||[];
  if((source.base_asset||source.toolhead)!==board.base||source.board&&source.board!=='none'||board.keys.every(k=>hidden.includes(k))){variants.push(source);continue}
  used=true;const v={...source,board:board.id};variants.push(v);
  const id=v.id+'__'+board.suffix;if(ids.has(id))continue;
  const mask=[...new Set([...hidden,...board.keys])];
  const bare={...v,id,board:'none',[board.mask]:mask,notes:[...v.notes,board.label+'の基板を非表示。基板マウントと締結部品は原本のまま。']};
  if(v.base_hidden_keys)bare.base_hidden_keys=mask;
  variants.push(bare);
 }
 const boards=[...(catalog.boards||[{id:'none',label:'基板なし'}])];
 if(used&&!boards.some(b=>b.id===board.id))boards.push({id:board.id,label:board.label});
 return {...catalog,variants,boards,embedded_board:board};
}
