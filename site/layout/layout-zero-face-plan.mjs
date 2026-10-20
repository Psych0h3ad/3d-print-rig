// Pure indexed triangle compaction. It never constructs or substitutes normals.
const fail=message=>{throw new Error('Layout zero-face cleanup: '+message);};
const bytes=array=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
const validArray=array=>ArrayBuffer.isView(array)&&!(array instanceof DataView);
function equalBytes(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
export function positionBounds(array,matrix){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<array.length;i+=3){let x=array[i],y=array[i+1],z=array[i+2];
  if(matrix){const xx=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],yy=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],zz=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];x=xx;y=yy;z=zz;}
  for(const [axis,value]of [x,y,z].entries()){if(!Number.isFinite(value))fail('nonfinite position');min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}
 }
 return {min,max};
}
function sameBounds(a,b){for(let axis=0;axis<3;axis++)if(!Object.is(a.min[axis],b.min[axis])||!Object.is(a.max[axis],b.max[axis]))return false;return true;}
function exactCoordinates(position){
 const words=new Uint32Array(position.buffer,position.byteOffset,position.length),cache=new Array(position.length);
 return i=>{
  if(cache[i]!==undefined)return cache[i];const bits=words[i],e=(bits>>>23)&255,m=(bits&0x7fffff)+(e?0x800000:0);if(e===255)fail('nonfinite Float32 position');
  // Every finite Float32 is this exact integer times 2^-149.
  const value=BigInt(m)<<BigInt(e?e-1:0);return cache[i]=(bits>>>31)?-value:value;
 };
}
function exactZeroFace(index,offset,coordinate){
 const a=index[offset]*3,b=index[offset+1]*3,c=index[offset+2]*3;
 const ux=coordinate(b)-coordinate(a),uy=coordinate(b+1)-coordinate(a+1),uz=coordinate(b+2)-coordinate(a+2);
 const vx=coordinate(c)-coordinate(a),vy=coordinate(c+1)-coordinate(a+1),vz=coordinate(c+2)-coordinate(a+2);
 return uy*vz-uz*vy===0n&&uz*vx-ux*vz===0n&&ux*vy-uy*vx===0n;
}
const membership=(groups,offset)=>groups.flatMap((g,i)=>offset>=g.start&&offset<g.start+g.count?[[i,g.materialIndex]]:[]);
export function planExactZeroFaceCompaction(geometry){
 const source=geometry.attributes,index=geometry.index?.array;
 if(!source?.position||!(source.position.array instanceof Float32Array)||source.position.itemSize!==3||source.position.normalized)fail('requires original Float32 POSITION');
 if(!(index instanceof Uint16Array||index instanceof Uint32Array)||index.length%3)fail('requires complete unsigned indexed triangles');
 const count=source.position.count??source.position.array.length/3,names=Object.keys(source).sort();
 for(const name of names){const a=source[name];if(a.isInterleavedBufferAttribute||!validArray(a.array)||!Number.isInteger(a.itemSize)||a.itemSize<1||a.array.length!==count*a.itemSize)fail('unsupported/inconsistent attribute '+name);}
 for(const value of index)if(value>=count)fail('out-of-range index');
 if(geometry.morphAttributes&&Object.keys(geometry.morphAttributes).length)fail('morph attributes require a separate source audit');
 const groups=(geometry.groups??[]).map(g=>({...g}));
 const draw={start:geometry.drawRange?.start??0,count:geometry.drawRange?.count??Infinity};
 function aligned(start,length){return Number.isInteger(start)&&start>=0&&start<=index.length&&start%3===0&&(length===Infinity||Number.isInteger(length)&&length>=0&&length%3===0&&start+length<=index.length);}
 for(const g of groups)if(g.count===Infinity||!aligned(g.start,g.count))fail('unaligned material group');
 if(!aligned(draw.start,draw.count))fail('unaligned draw range');
 const triangles=index.length/3,prefix=new Uint32Array(triangles+1),removed=[],kept=[],referenced=new Uint8Array(count),coordinate=exactCoordinates(source.position.array);
 for(let face=0;face<triangles;face++){
  const zero=exactZeroFace(index,face*3,coordinate);prefix[face+1]=prefix[face]+(zero?0:1);
  if(zero)removed.push(face);else{kept.push(face);for(let c=0;c<3;c++)referenced[index[face*3+c]]=1;}
 }
 if(!removed.length)fail('no exact-zero faces');if(!kept.length)fail('would empty the geometry');
 const oldToNew=new Int32Array(count).fill(-1),retainedVertices=[],removedVertices=[];
 for(let i=0;i<count;i++)if(referenced[i]){oldToNew[i]=retainedVertices.length;retainedVertices.push(i);}else removedVertices.push(i);
 const attributes={};
 for(const name of names){const original=source[name],array=new original.array.constructor(retainedVertices.length*original.itemSize),input=bytes(original.array),output=bytes(array),tuple=original.itemSize*original.array.BYTES_PER_ELEMENT;
  for(const [next,old]of retainedVertices.entries())output.set(input.subarray(old*tuple,(old+1)*tuple),next*tuple);
  attributes[name]={array,itemSize:original.itemSize,normalized:original.normalized??false,count:retainedVertices.length};
 }
 const nextIndex=new index.constructor(kept.length*3);
 for(const [next,old]of kept.entries())for(let c=0;c<3;c++)nextIndex[next*3+c]=oldToNew[index[old*3+c]];
 const nextGroups=groups.map(g=>({...g,start:prefix[g.start/3]*3,count:(prefix[(g.start+g.count)/3]-prefix[g.start/3])*3}));
 const drawEnd=draw.count===Infinity?triangles:(draw.start+draw.count)/3;
 const nextDraw={start:prefix[draw.start/3]*3,count:draw.count===Infinity?Infinity:(prefix[drawEnd]-prefix[draw.start/3])*3};
 // Every retained corner is copied byte-for-byte, including UV/color/custom tuples.
 for(const [next,old]of kept.entries()){
  for(const name of names){const original=source[name],tuple=original.itemSize*original.array.BYTES_PER_ELEMENT,input=bytes(original.array),output=bytes(attributes[name].array);
   for(let c=0;c<3;c++){const before=index[old*3+c]*tuple,after=nextIndex[next*3+c]*tuple;if(!equalBytes(input.subarray(before,before+tuple),output.subarray(after,after+tuple)))fail('retained tuple changed');}
  }
  if(JSON.stringify(membership(groups,old*3))!==JSON.stringify(membership(nextGroups,next*3)))fail('retained material group changed');
  const wasDrawn=old*3>=draw.start&&old*3<draw.start+(draw.count===Infinity?index.length:draw.count);
  const isDrawn=next*3>=nextDraw.start&&next*3<nextDraw.start+(nextDraw.count===Infinity?nextIndex.length:nextDraw.count);
  if(wasDrawn!==isDrawn)fail('retained draw membership changed');
 }
 const beforeBounds=positionBounds(source.position.array),afterBounds=positionBounds(attributes.position.array);
 if(!sameBounds(beforeBounds,afterBounds))fail('position bounding box would change');
 let retainedZeroNormals=0;
 if(attributes.normal){const n=attributes.normal;if(n.itemSize!==3)fail('invalid normal size');for(let i=0;i<n.array.length;i+=3){if(!Number.isFinite(n.array[i])||!Number.isFinite(n.array[i+1])||!Number.isFinite(n.array[i+2]))fail('nonfinite retained normal');if(n.array[i]===0&&n.array[i+1]===0&&n.array[i+2]===0)retainedZeroNormals++;}}
 if(retainedZeroNormals)fail('a zero normal is referenced by a positive-area triangle');
 return {attributes,index:nextIndex,groups:nextGroups,drawRange:nextDraw,removedTriangles:removed,keptTriangles:kept,removedVertices,retainedVertices,bounds:{before:beforeBounds,after:afterBounds},retainedZeroNormals,
  proof:{exactFloat32DyadicZeroTest:true,epsilonUsed:false,positiveTriangleOrderPreserved:true,allRetainedAttributeTupleBytesUnchanged:true,retainedMaterialMembershipUnchanged:true,retainedDrawMembershipUnchanged:true,boundingBoxUnchanged:true}};
}
