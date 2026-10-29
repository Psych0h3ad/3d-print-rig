// Every Float32 is an integer multiple of 2^-149. Integer cross products give
// an exact zero-area decision; no epsilon, weld, repair or simplification.
export async function removeExactZeroArea(positions,index,{signal}={}){
 if(!(positions instanceof Float32Array)||!(index instanceof Uint32Array||index instanceof Uint16Array)||positions.length%3||index.length%3)throw Error('Invalid triangle buffers');
 const bits=new Uint32Array(positions.buffer,positions.byteOffset,positions.length),integer=new Map();
 const value=i=>{if(integer.has(i))return integer.get(i);const b=bits[i],exponent=(b>>>23)&255;if(exponent===255)throw Error('Non-finite source position');const fraction=b&0x7fffff;let n=BigInt(exponent?fraction+0x800000:fraction);if(exponent)n<<=BigInt(exponent-1);if(b>>>31)n=-n;integer.set(i,n);return n};
 const keep=[],removed=[];
 for(let t=0;t<index.length/3;t++){
  if(t%2048===0){if(signal?.aborted)throw new DOMException('Export canceled','AbortError');await new Promise(r=>setTimeout(r,0))}
  const ids=[index[t*3],index[t*3+1],index[t*3+2]];if(ids.some(i=>i*3+2>=positions.length))throw Error('Invalid source index');
  const [a,b,c]=ids.map(i=>[value(i*3),value(i*3+1),value(i*3+2)]),u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]);
  const zero=u[1]*v[2]===u[2]*v[1]&&u[2]*v[0]===u[0]*v[2]&&u[0]*v[1]===u[1]*v[0];
  if(zero)removed.push(t);else keep.push(...ids);
 }
 if(signal?.aborted)throw new DOMException('Export canceled','AbortError');
 return {index:removed.length?new index.constructor(keep):index,removed};
}
