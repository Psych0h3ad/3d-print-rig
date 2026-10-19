// Exact clipping of each frozen binary64 source halfplane on 0<=t<=1.
// No EPS, geometry shift, source-face omission or whole-head clearance claim.
const bits=new DataView(new ArrayBuffer(8));
const abs=x=>x<0n?-x:x;
const gcd=(a,b)=>{a=abs(a);b=abs(b);while(b){const r=a%b;a=b;b=r;}return a||1n;};
const q=(n,d=1n)=>{if(d===0n)throw Error('Zero exact denominator');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};};
function exact(value){
 if(value&&typeof value==='object'&&'n'in value&&'d'in value)return q(BigInt(value.n),BigInt(value.d));
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('Nonfinite source pose/halfplane');
 if(value===0)return q(0n);
 bits.setFloat64(0,value,false);const word=bits.getBigUint64(0,false),negative=(word>>63n)!==0n;
 const e=Number((word>>52n)&2047n);let n=word&((1n<<52n)-1n);if(e)n+=1n<<52n;
 const power=(e?e-1023:-1022)-52;if(negative)n=-n;
 return power>=0?q(n<<BigInt(power)):q(n,1n<<BigInt(-power));
}
const add=(a,b)=>q(a.n*b.d+b.n*a.d,a.d*b.d);
const sub=(a,b)=>q(a.n*b.d-b.n*a.d,a.d*b.d);
const mul=(a,b)=>q(a.n*b.n,a.d*b.d);
const div=(a,b)=>q(a.n*b.d,a.d*b.n);
const compare=(a,b)=>{const n=a.n*b.d-b.n*a.d;return n<0n?-1:n>0n?1:0;};
const serialize=a=>({numerator:a.n.toString(),denominator:a.d.toString()});
export function clipExactSourceHalfplanesSegment(halfplanes,start,end){
 const p=[exact(start.x),exact(start.y)],d=[sub(exact(end.x),p[0]),sub(exact(end.y),p[1])];
 let lo=q(0n),hi=q(1n);
 for(const h of halfplanes){
  const c=[exact(h.c[0]),exact(h.c[1])],available=sub(exact(h.upper_mm),add(mul(c[0],p[0]),mul(c[1],p[1])));
  const speed=add(mul(c[0],d[0]),mul(c[1],d[1]));
  if(speed.n===0n){if(available.n<0n)return {intersects:false};continue;}
  const bound=div(available,speed);
  if(speed.n>0n){if(compare(bound,hi)<0)hi=bound;}
  else if(compare(bound,lo)>0)lo=bound;
  if(compare(lo,hi)>0)return {intersects:false};
 }
 return {intersects:true,enter:serialize(lo),exit:serialize(hi),tangent:compare(lo,hi)===0};
}
function binding(packet,data){
 if(packet.model.sha256!==data.model.sha256||packet.inventory.sha256!==data.inventory.sha256)
  throw Error('Fixed-source path guard needs fresh selected source-body rebind');
 const hosts=packet.private_source_motion172.target_axes_by_key;
 for(const row of data.domains){
  const head=packet.parts.find(p=>p.key===row.head_key),target=packet.parts.find(p=>p.key===row.target_key);
  if(head?.source_id!==row.head_source_id||target?.source_id!==row.target_source_id)
   throw Error('Retained source triangle identity changed');
  if((hosts[row.head_key]||[]).slice().sort().join()!=='x,y'||(hosts[row.target_key]||[]).length)
   throw Error('Original head/fixed receiver movement hosts changed');
 }
}
export function validateSelectedFixedSourceXYMotion(packet,pose,data){
 binding(packet,data);
 for(const row of data.domains)if(clipExactSourceHalfplanesSegment(row.halfplanes,pose,pose).intersects)
  throw Error('Source head contacts fixed structure: '+row.head_key+' / '+row.target_key);
 return pose;
}
export function validateSelectedFixedSourceXYTransition(packet,start,end,data){
 binding(packet,data);
 for(const row of data.domains){const hit=clipExactSourceHalfplanesSegment(row.halfplanes,start,end);if(hit.intersects)
  throw Error('Source XY transition crosses/touches fixed structure: '+row.head_key+' / '+row.target_key);}
 return end;
}
