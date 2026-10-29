// SHA-256 over an existing buffer without copying a large model into Web Crypto.
// Working storage is one 64-word schedule, eight state words and 128 pad bytes.
const K=new Uint32Array([
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
const rotate=(n,b)=>(n>>>b)|(n<<(32-b));
// Blob export receipts use fixed 256 KiB reads, never another full STEP buffer.
export async function boundedBlobSha256(blob,{signal}={}){
 if(!(blob instanceof Blob))throw Error('Invalid Blob digest input');
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
 const check=()=>{if(signal?.aborted)throw new DOMException('Export canceled','AbortError')};
 function block(view,offset){
  for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4,false);
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));}
  let [a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+K[i]+words[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}
  state[0]+=a;state[1]+=b;state[2]+=c;state[3]+=d;state[4]+=e;state[5]+=f;state[6]+=g;state[7]+=h;
 }
 const end=blob.size-blob.size%64;
 for(let offset=0;offset<end;offset+=262144){check();const b=await blob.slice(offset,Math.min(end,offset+262144)).arrayBuffer(),view=new DataView(b);for(let at=0;at<b.byteLength;at+=64)block(view,at);await new Promise(r=>setTimeout(r,0))}
 check();const tail=new Uint8Array(await blob.slice(end).arrayBuffer()),pad=new Uint8Array(128);pad.set(tail);pad[tail.length]=0x80;const length=tail.length<56?64:128,view=new DataView(pad.buffer);view.setUint32(length-8,Math.floor(blob.size/0x20000000),false);view.setUint32(length-4,(blob.size*8)>>>0,false);block(view,0);if(length===128)block(view,64);check();return [...state].map(n=>n.toString(16).padStart(8,'0')).join('');
}
export async function boundedSha256(input,{yieldBytes=1048576,onProgress}={}){
 if(!(input instanceof ArrayBuffer||ArrayBuffer.isView(input))||!Number.isSafeInteger(yieldBytes)||yieldBytes<64||yieldBytes>1048576)throw Error('Invalid bounded SHA-256 input');
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
 function block(data,offset){
  for(let i=0;i<16;i++)words[i]=data.getUint32(offset+i*4,false);
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));}
  let a=state[0],b=state[1],c=state[2],d=state[3],e=state[4],f=state[5],g=state[6],h=state[7];
  for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+K[i]+words[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  state[0]+=a;state[1]+=b;state[2]+=c;state[3]+=d;state[4]+=e;state[5]+=f;state[6]+=g;state[7]+=h;
 }
 const end=bytes.length-bytes.length%64;let nextYield=yieldBytes;
 for(let offset=0;offset<end;offset+=64){block(view,offset);if(offset+64>=nextYield){onProgress?.({loaded:offset+64,total:bytes.length});await new Promise(resolve=>setTimeout(resolve,0));nextYield=offset+64+yieldBytes;}}
 const pad=new Uint8Array(128),remaining=bytes.length-end;pad.set(bytes.subarray(end));pad[remaining]=0x80;const padLength=remaining<56?64:128,padding=new DataView(pad.buffer);
 padding.setUint32(padLength-8,Math.floor(bytes.length/0x20000000),false);padding.setUint32(padLength-4,(bytes.length*8)>>>0,false);block(padding,0);if(padLength===128)block(padding,64);
 onProgress?.({loaded:bytes.length,total:bytes.length});return [...state].map(n=>n.toString(16).padStart(8,'0')).join('');
}
