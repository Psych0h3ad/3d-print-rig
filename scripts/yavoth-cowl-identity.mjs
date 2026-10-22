// Source identity only. No bounding-box, physical-fit or manufacturing claim.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';

export const yavothRevision='cc2e749d09d7f24418f9f8c73c90bcefb1e29584';
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix='head_print_yavoth_';
export const yavothCowls=Object.freeze({
 [prefix+'orbiter2_rapido2_uhf_rear5']:{alias:'13',source:'12',name:'Yavoth_Cowl_UHF_5mm:1',path:'V0/Yavoth/STLs/Orbiter_v2_Spacing/Cowl_Dragon_OB2_UHF_5mm.stl',blob:'81c778cfcd04b4d6c02e99b51b712f48480a735d',sha256:'b4256d38e842f315bea70d9c69ec3dfee2984d7a6234208a9a1894e64b250cea'},
 [prefix+'sherpa_mini_rapido2_uhf_rear5']:{alias:'23',source:'22',name:'Yavoth_Cowl_UHF_5mm (1):1',path:'V0/Yavoth/STLs/Sherpa_Mini_Spacing/Cowl_Dragon_SM_UHF_5mm.stl',blob:'b367b71feee39583746b94c65e36f0cfc51491ee',sha256:'60d914e3a333b8a0843d7c4738cd61d5d7bd70243e501e9c465da1571fa0c6b9'},
 [prefix+'sherpa_micro_rapido2_uhf_rear5']:{alias:'33',source:'32',name:'Yavoth_Cowl_UHF_5mm (2):1',path:'V0/Yavoth/STLs/Sherpa_Micro_Spacing/Cowl_Dragon_Micro_UHF_5mm.stl',blob:'03e23a1cb289d0bb3d3c82bbca609a2cf11a6203',sha256:'9951840e8815f0ca24af51306571d50f211834122b0f215598fc3563917dbd31'}
});

export function readAuthorSTL(bytes,expected){
 const b=Buffer.from(bytes);
 if(expected){
  assert.equal(b.length,460784,'Yavoth author STL byte count');
  assert.equal(sha256(b),expected.sha256,'Yavoth author STL SHA256');
  const blob=crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
  assert.equal(blob,expected.blob,'Yavoth author STL Git blob');
 }
 assert(b.length>=84,'Incomplete binary author STL');
 const count=b.readUInt32LE(80);assert(count>0&&count<=1000000,'Invalid author STL triangle count');
 assert.equal(b.length,84+50*count,'Incomplete/trailing author STL data');
 const p=new Float32Array(count*9);
 for(let t=0;t<count;t++)for(let i=0;i<9;i++){
  const v=b.readFloatLE(84+t*50+12+i*4);assert(Number.isFinite(v),'Nonfinite author STL');p[t*9+i]=v;
 }
 return {positions:p,triangles:count,sha256:sha256(b)};
}

export function assertExportMatrix(m){
 assert(Array.isArray(m)&&m.length===16&&m.every(Number.isFinite),'Missing/invalid author STL export matrix');
 assert.deepEqual([m[3],m[7],m[11],m[15]],[0,0,0,1],'Author STL export must be affine');
 const cols=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
 const scale=Math.hypot(...cols[0]);
 assert([1,.001].some(s=>Math.abs(scale-s)<=s*1e-10),'Author STL export must retain mm or convert mm to metres');
 for(const c of cols)assert(Math.abs(Math.hypot(...c)-scale)<=scale*1e-10,'Nonrigid author STL export scale');
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert(Math.abs(cols[i].reduce((v,n,k)=>v+n*cols[j][k],0))<=scale*scale*1e-10,'Nonrigid author STL export shear');
 const [a,b,c]=cols,det=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);
 assert(det>0,'Reflected author STL export');
 return m;
}

export function projectAuthorSTL(stl,matrix){
 const m=assertExportMatrix(matrix),p=stl.positions,out=new Float32Array(p.length);
 for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2];
  out[i]=Math.fround(m[0]*x+m[4]*y+m[8]*z+m[12]);
  out[i+1]=Math.fround(m[1]*x+m[5]*y+m[9]*z+m[13]);
  out[i+2]=Math.fround(m[2]*x+m[6]*y+m[10]*z+m[14]);
 }
 return out;
}

export function projectRegisteredAuthorSTL(stl,registration){
 const r=registration?.rotation,t=registration?.translation;
 assert(Array.isArray(r)&&r.length===3&&r.every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)),'Missing author registration rotation');
 assert(Array.isArray(t)&&t.length===3&&t.every(Number.isFinite)&&registration.scale===1,'Invalid author native-mm registration');
 assertExportMatrix([r[0][0],r[1][0],r[2][0],0,r[0][1],r[1][1],r[2][1],0,r[0][2],r[1][2],r[2][2],0,...t,1]);
 const p=stl.positions,out=new Float32Array(p.length);
 for(let i=0;i<p.length;i+=3){const v=[p[i],p[i+1],p[i+2]],q=r.map((row,j)=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]+t[j]);
  out[i]=Math.fround(q[0]*.001);out[i+1]=Math.fround(q[2]*.001);out[i+2]=Math.fround(-q[1]*.001);
 }
 return out;
}

const attrBytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
export function geometryBufferIdentity(g,validateFinite=true){
 const result={draw_range:{start:g.drawRange?.start??0,count:Number.isFinite(g.drawRange?.count)?g.drawRange.count:'full'},groups:(g.groups||[]).map(({start,count,materialIndex})=>({start,count,materialIndex}))};
 for(const [name,attr]of Object.entries(g.attributes||{}).sort(([a],[b])=>a.localeCompare(b))){
  assert(attr.array&&!attr.isInterleavedBufferAttribute,'Unsupported interleaved export attribute');
  if(validateFinite)for(const n of attr.array)assert(Number.isFinite(n),'Nonfinite exported '+name);
  result[name]={type:attr.array.constructor.name,itemSize:attr.itemSize,count:attr.count,sha256:sha256(attrBytes(attr.array))};
 }
 if(g.index)result.index={type:g.index.array.constructor.name,count:g.index.count,sha256:sha256(attrBytes(g.index.array))};
 return result;
}

function orientedTriangles(positions,index){
 const n=index?index.length:positions.length/3;assert(n>0&&n%3===0,'Incomplete exported triangle list');
 const point=i=>{
  assert(Number.isInteger(i)&&i>=0&&i<positions.length/3,'Invalid exported triangle index');
  const b=Buffer.allocUnsafe(12);
  for(let k=0;k<3;k++){const v=positions[i*3+k];assert(Number.isFinite(v),'Nonfinite cowl triangle');b.writeFloatLE(v===0?0:v,k*4);}
  return b.toString('hex');
 };
 const keys=[];
 for(let i=0;i<n;i+=3){const v=[0,1,2].map(k=>point(index?index[i+k]:i+k));keys.push([v.join(''),[v[1],v[2],v[0]].join(''),[v[2],v[0],v[1]].join('')].sort()[0]);}
 return {triangles:n/3,sha256:sha256(keys.sort().join('\n'))};
}

function assertProjectedTriangles(stl,geometry,projection){
 const p=geometry?.attributes?.position;
 assert(p?.array instanceof Float32Array&&p.itemSize===3&&!p.isInterleavedBufferAttribute,'Missing complete Float32 cowl positions');
 assert.equal(p.count,p.array.length/3,'Cowl position accessor size');
 const index=geometry.index?.array,count=index?.length||p.count;
 assert.equal(geometry.drawRange?.start??0,0,'Cowl triangle prefix clipped');
 const draw=geometry.drawRange?.count??Infinity;assert(draw===Infinity||draw===count,'Cowl triangle range clipped');
 const groups=[...(geometry.groups||[])].sort((a,b)=>a.start-b.start);
 if(groups.length){let cursor=0;for(const group of groups){
  assert(Number.isInteger(group.start)&&Number.isInteger(group.count)&&group.count>0&&group.start%3===0&&group.count%3===0,'Invalid cowl material triangle group');
  assert.equal(group.start,cursor,'Cowl material groups omit/overlap author triangles');cursor+=group.count;
 }assert.equal(cursor,count,'Cowl material groups clip author triangles');}
 if(index){assert.equal(geometry.index.count,index.length,'Cowl index accessor size');assert.equal(new Set(index).size,p.count,'Unused cowl positions');}
 const actual=orientedTriangles(p.array,index),expected=orientedTriangles(projection);
 assert.equal(actual.triangles,expected.triangles,'Yavoth incomplete or wrong author cowl triangle count');
 assert.equal(actual.sha256,expected.sha256,'Yavoth cowl differs from complete oriented author STL triangles');
 return {author_stl_sha256:stl.sha256,triangles:actual.triangles,oriented_triangles_sha256:actual.sha256,complete_buffers:geometryBufferIdentity(geometry)};
}

export function assertAuthorTriangles(stl,geometry,matrix){return assertProjectedTriangles(stl,geometry,projectAuthorSTL(stl,matrix));}
export function assertRegisteredAuthorTriangles(stl,geometry,registration){return assertProjectedTriangles(stl,geometry,projectRegisteredAuthorSTL(stl,registration));}

export function assertCowlMetadata(id,asset){
 const rule=yavothCowls[id];if(!rule)return null;
 const rows=asset.meta?.parts?.filter(p=>p.name?.startsWith('Yavoth_Cowl'))||[];
 assert.equal(rows.length,1,'Yavoth missing/duplicate cowl metadata');
 const p=rows[0];
 assert.equal(String(p.key),id+'_'+rule.alias,'Yavoth changed stable public cowl leaf ID');
 assert.equal(String(p.source_key),rule.source,'Yavoth wrong original cowl occurrence');
 assert.equal(p.name,rule.name,'Yavoth wrong source-specific cowl');
 assert.equal(asset.meta.source_commit,yavothRevision,'Yavoth cowl source revision');
 const preferred=asset.meta.source_files?.filter(f=>f.path===rule.path)||[];
 assert.equal(preferred.length,1,'Yavoth missing/duplicate preferred author STL source');
 assert.equal(preferred[0].sha256,rule.sha256,'Yavoth preferred author STL source hash');
 assert.deepEqual((asset.meta.selected_source_keys||[]).map(String).sort(),asset.meta.parts.map(p=>String(p.source_key)).sort(),'Yavoth selected original source occurrences disagree with parts');
 return {part:p,rule};
}

function bindReviewedBuffers(id,repair,proof){
 const witness=JSON.parse(readFileSync(new URL('./fixtures/yavoth-author-cowls.json',import.meta.url),'utf8'));
 assert.equal(witness.schema,'yavoth-reviewed-author-cowls-v2','Missing reviewed Yavoth source witness');
 assert.equal(witness.source_revision,yavothRevision,'Reviewed Yavoth source revision');
 const expected=witness.modules[id];assert(expected,'Unreviewed Yavoth cowl export');
 assert.equal(expected.author_stl_sha256,proof.author_stl_sha256,'Reviewed Yavoth author STL changed');
 if(repair)assert.deepEqual(repair.source_print_mm_to_native_mm,expected.source_print_mm_to_native_mm,'Reviewed author/native registration changed');
 assert.equal(proof.triangles,expected.triangles,'Reviewed Yavoth author surface count');
 assert.equal(proof.oriented_triangles_sha256,expected.oriented_triangles_sha256,'Reviewed full author/native surface changed');
 assert.deepEqual(proof.complete_buffers,expected.complete_buffers,'Reviewed complete cowl buffers or draw state changed');
 return proof;
}

export function assertSourceCowl(id,asset,sourceBytes){
 const binding=assertCowlMetadata(id,asset);if(!binding)return null;
 const {part,rule}=binding,repair=asset.meta.source_cowl_repair,w=part.author_stl;
 const rows=asset.entries.filter(e=>String(e.key)===part.key);assert.equal(rows.length,1,'Yavoth missing/duplicate cowl mesh');
 const stl=readAuthorSTL(sourceBytes,rule);
 if(w){
  assert(w.schema==='author-stl-float32-v1','Yavoth unsupported author STL witness');
  assert.equal(w.path,rule.path,'Yavoth wrong author STL path');assert.equal(w.git_blob_sha1,rule.blob,'Yavoth wrong author STL blob');
  assert.equal(w.sha256,rule.sha256,'Yavoth wrong author STL hash');assert.equal(w.bytes,460784,'Yavoth wrong author STL size');
  return bindReviewedBuffers(id,null,assertAuthorTriangles(stl,rows[0].mesh.geometry,w.stl_to_position));
 }
 assert(repair,'Yavoth missing replayable author STL witness');
 assert.equal(repair.author_revision,yavothRevision,'Yavoth author registration revision');
 assert.equal(repair.author_STL_path,rule.path,'Yavoth wrong author STL path');assert.equal(repair.author_STL_git_blob_sha1,rule.blob,'Yavoth wrong author STL blob');
 assert.equal(repair.author_STL_sha256,rule.sha256,'Yavoth wrong author STL hash');assert.equal(repair.author_STL_bytes,460784,'Yavoth wrong author STL size');
 assert.equal(String(repair.source_occurrence_key),rule.source,'Yavoth registration occurrence');assert.equal(repair.original_author_name,rule.name,'Yavoth registration author name');
 assert.equal(repair.public_node_id,part.key,'Yavoth registration public alias');
 return bindReviewedBuffers(id,repair,assertRegisteredAuthorTriangles(stl,rows[0].mesh.geometry,repair.source_print_mm_to_native_mm));
}
