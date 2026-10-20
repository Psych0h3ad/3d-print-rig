import {polygonProblems,polygonContains,polygonAreaSign,orient,onSegment,segmentsIntersect} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

export const SVG_LIMITS=Object.freeze({bytes:2097152,elements:2000,depth:64,pathChars:65536,totalPathChars:262144,
  segments:2048,totalSegments:8192,flattenedPoints:2048,totalPoints:16384,inputVertices:32768,work:2000000,candidates:256,vertices:32,coordinate:1e9});
export class FloorplanSVGError extends Error{
  constructor(code,details={}){super(code);this.name='FloorplanSVGError';this.code=code;this.details=details;}
}
const fail=(code,details)=>{throw new FloorplanSVGError(code,details)};
const NS='http://www.w3.org/2000/svg',I=[1,0,0,1,0,0],TAU=2*Math.PI;
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const tick=(budget,count=1)=>{if((budget.work+=count)>SVG_LIMITS.work)fail('SVG_WORK_LIMIT');};
const checked=n=>{if(!Number.isFinite(n)||Math.abs(n)>SVG_LIMITS.coordinate)fail('SVG_NONFINITE_OR_RANGE');return n};
function matrix(a,b){const r=[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];r.forEach(checked);return r;}
const point=(m,p)=>[checked(m[0]*p[0]+m[2]*p[1]+m[4]),checked(m[1]*p[0]+m[3]*p[1]+m[5])];
const vector=(m,p)=>[checked(m[0]*p[0]+m[2]*p[1]),checked(m[1]*p[0]+m[3]*p[1])];
const translate=(x,y)=>[1,0,0,1,x,y];
const NUM=/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
class Numbers{
  constructor(text){this.text=text;this.at=0;}
  ws(){while(/[\x20\t\r\n]/.test(this.text[this.at]||'!'))this.at++;}
  separator(first=false){this.ws();if(this.text[this.at]===','){if(first)fail('SVG_BAD_NUMBER_LIST');this.at++;this.ws();if(this.text[this.at]===',')fail('SVG_BAD_NUMBER_LIST');}}
  number(first=false){this.separator(first);NUM.lastIndex=this.at;const match=NUM.exec(this.text);if(!match)fail('SVG_BAD_NUMBER_LIST');this.at=NUM.lastIndex;return checked(Number(match[0]));}
  flag(first=false){this.separator(first);const c=this.text[this.at++];if(c!=='0'&&c!=='1')fail('SVG_BAD_ARC_FLAG');return Number(c);}
  end(){this.ws();return this.at===this.text.length;}
}
function list(text,max=4096){const n=new Numbers(text),out=[];while(!n.end()){if(out.length>=max)fail('SVG_NUMBER_LIMIT');out.push(n.number(out.length===0));}return out;}
function transform(text){
  if(!text?.trim())return I;
  if(text.length>4096)fail('SVG_TRANSFORM_LIMIT');if(text.trim().endsWith(','))fail('SVG_BAD_TRANSFORM');let at=0,m=I,count=0;
  const re=/\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?/y;
  while(at<text.length){if(!text.slice(at).trim())break;re.lastIndex=at;const match=re.exec(text);if(!match||++count>64)fail('SVG_BAD_TRANSFORM');at=re.lastIndex;
    const a=list(match[2],6),name=match[1];let t;
    if(name==='matrix'&&a.length===6)t=a;
    else if(name==='translate'&&(a.length===1||a.length===2))t=translate(a[0],a[1]||0);
    else if(name==='scale'&&(a.length===1||a.length===2))t=[a[0],0,0,a[1]??a[0],0,0];
    else if(name==='rotate'&&(a.length===1||a.length===3)){
      const r=a[0]*Math.PI/180,c=Math.cos(r),s=Math.sin(r),rotation=[c,s,-s,c,0,0];
      t=a.length===1?rotation:matrix(matrix(translate(a[1],a[2]),rotation),translate(-a[1],-a[2]));
    }else if((name==='skewX'||name==='skewY')&&a.length===1){const tangent=checked(Math.tan(a[0]*Math.PI/180));t=name==='skewX'?[1,0,tangent,1,0,0]:[1,tangent,0,1,0,0];}
    else fail('SVG_BAD_TRANSFORM');
    m=matrix(m,t);
  }
  if(!Number.isFinite(m[0]*m[3]-m[1]*m[2])||m[0]*m[3]-m[1]*m[2]===0)fail('SVG_SINGULAR_TRANSFORM');return m;
}
const units={px:1,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6,pt:96/72,pc:16};
function length(text,basis,fallback=0){
  if(text===null||text===undefined||text==='')return fallback;
  const n=new Numbers(text);const value=n.number(true),unit=text.slice(n.at).trim().toLowerCase();
  if(!unit)return value;if(unit==='%'){if(basis===null)fail('SVG_AMBIGUOUS_ROOT_PERCENT');return checked(value*basis/100);}
  if(!Object.hasOwn(units,unit))fail('SVG_UNSUPPORTED_LENGTH_UNIT',{unit});return checked(value*units[unit]);
}
function viewBox(node){const text=node.getAttribute('viewBox');if(text===null)return null;const a=list(text,4);if(a.length!==4||a[2]<=0||a[3]<=0)fail('SVG_BAD_VIEWBOX');return {minX:a[0],minY:a[1],width:a[2],height:a[3]};}
function viewport(node,parent,isRoot){
  const vb=viewBox(node),aw=node.getAttribute('width'),ah=node.getAttribute('height');let w,h,source='explicit';
  if(isRoot){
    w=length(aw,null,vb?.width??300);h=length(ah,null,vb?.height??150);
    if(aw===null&&ah!==null&&vb)w=h*vb.width/vb.height;
    if(ah===null&&aw!==null&&vb)h=w*vb.height/vb.width;
    if(aw===null||ah===null)source=vb?'intrinsic-viewBox-frame':'default-300x150';
  }else{w=length(aw,parent.width,parent.width);h=length(ah,parent.height,parent.height);}
  if(!(w>0&&h>0))fail('SVG_BAD_VIEWPORT');checked(w);checked(h);
  const x=isRoot?0:length(node.getAttribute('x'),parent.width),y=isRoot?0:length(node.getAttribute('y'),parent.height);
  let sx=vb?w/vb.width:1,sy=vb?h/vb.height:1,tx=x-(vb?.minX||0)*sx,ty=y-(vb?.minY||0)*sy;
  const par=(node.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim().split(/\s+/);
  if(par[0]==='defer')par.shift();
  if(par.length>2||!(/^(none|x(Min|Mid|Max)Y(Min|Mid|Max))$/.test(par[0]))||par[1]&&!['meet','slice'].includes(par[1]))fail('SVG_BAD_ASPECT_RATIO');
  if(vb&&par[0]!=='none'){
    sx=sy=par[1]==='slice'?Math.max(sx,sy):Math.min(sx,sy);tx=x-vb.minX*sx;ty=y-vb.minY*sy;
    if(par[0].includes('xMid'))tx+=(w-vb.width*sx)/2;if(par[0].includes('xMax'))tx+=w-vb.width*sx;
    if(par[0].includes('YMid'))ty+=(h-vb.height*sy)/2;if(par[0].includes('YMax'))ty+=h-vb.height*sy;
  }
  return {matrix:[sx,0,0,sy,tx,ty],viewport:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],width:vb?.width??w,height:vb?.height??h,vb,w,h,source};
}
function box(points){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);return {minX,minZ,maxX,maxZ,width:maxX-minX,depth:maxZ-minZ};}
const distance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],den=x*x+y*y,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/den)):0;return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y)};
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
function arc(start,end,rx,ry,rotation,large,sweep,m){
  rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry||same(start,end))return {type:'L',p:[point(m,start),point(m,end)]};
  const phi=rotation*Math.PI/180,c=Math.cos(phi),s=Math.sin(phi),dx=(start[0]-end[0])/2,dy=(start[1]-end[1])/2;
  const xp=c*dx+s*dy,yp=-s*dx+c*dy,lambda=(xp/rx)**2+(yp/ry)**2;
  if(lambda>1){const correction=Math.sqrt(lambda);rx*=correction;ry*=correction;}
  const denominator=(rx*yp)**2+(ry*xp)**2;
  const factor=(large===sweep?-1:1)*Math.sqrt(Math.max(0,((rx*ry)**2-denominator)/denominator));
  const cxp=factor*rx*yp/ry,cyp=-factor*ry*xp/rx,cx=c*cxp-s*cyp+(start[0]+end[0])/2,cy=s*cxp+c*cyp+(start[1]+end[1])/2;
  const u=[(xp-cxp)/rx,(yp-cyp)/ry],v=[(-xp-cxp)/rx,(-yp-cyp)/ry];let delta=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
  if(!sweep&&delta>0)delta-=TAU;if(sweep&&delta<0)delta+=TAU;
  const segment={type:'A',p:[point(m,start),point(m,end)],center:point(m,[cx,cy]),a:vector(m,[rx*c,rx*s]),b:vector(m,[-ry*s,ry*c]),theta:Math.atan2(u[1],u[0]),delta};
  if(![...segment.center,...segment.a,...segment.b,segment.theta,delta].every(Number.isFinite))fail('SVG_BAD_ARC');return segment;
}
function pathData(text,m,budget){
  if(text.length>SVG_LIMITS.pathChars||(budget.pathChars+=text.length)>SVG_LIMITS.totalPathChars)fail('SVG_PATH_LIMIT');
  const n=new Numbers(text),subpaths=[];let current=[0,0],sub=null,command=null,prior=null,control=null,count=0;
  const arities={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  while(!n.end()){
    const c=n.text[n.at];let explicit=false;
    if(/[A-Za-z]/.test(c)){command=c;n.at++;explicit=true;}else if(!command)fail('SVG_BAD_PATH');
    const op=command.toUpperCase(),relative=command!==op;
    if(op==='Z'){
      if(!sub||sub.closed)fail('SVG_BAD_PATH');sub.segments.push({type:'L',p:[point(m,current),point(m,sub.start)]});sub.closed=true;current=sub.start.slice();command=null;prior='Z';control=null;continue;
    }
    if(!Object.hasOwn(arities,op)||!sub&&op!=='M'||sub?.closed&&op!=='M')fail('SVG_BAD_PATH');
    if(++count>SVG_LIMITS.segments||++budget.segments>SVG_LIMITS.totalSegments)fail('SVG_SEGMENT_LIMIT');
    const args=[];for(let i=0;i<arities[op];i++)args.push(op==='A'&&(i===3||i===4)?n.flag(explicit&&i===0):n.number(explicit&&i===0));tick(budget,args.length);
    if((budget.inputVertices+=Math.ceil(args.length/2))>SVG_LIMITS.inputVertices)fail('SVG_INPUT_VERTEX_LIMIT');
    const base=current,xy=(i)=>[checked(args[i]+(relative?base[0]:0)),checked(args[i+1]+(relative?base[1]:0))];
    let end,segment,newControl=null;
    if(op==='M'){end=xy(0);sub={start:end.slice(),segments:[],closed:false};subpaths.push(sub);command=relative?'l':'L';}
    else if(op==='L'){end=xy(0);segment={type:'L',p:[point(m,base),point(m,end)]};}
    else if(op==='H'){end=[checked(args[0]+(relative?base[0]:0)),base[1]];segment={type:'L',p:[point(m,base),point(m,end)]};}
    else if(op==='V'){end=[base[0],checked(args[0]+(relative?base[1]:0))];segment={type:'L',p:[point(m,base),point(m,end)]};}
    else if(op==='C'||op==='S'){
      const a=op==='C'?xy(0):prior==='C'||prior==='S'?[2*base[0]-control[0],2*base[1]-control[1]]:base,b=xy(op==='C'?2:0);end=xy(op==='C'?4:2);newControl=b;
      segment={type:'C',p:[base,a,b,end].map(p=>point(m,p))};
    }else if(op==='Q'||op==='T'){
      const a=op==='Q'?xy(0):prior==='Q'||prior==='T'?[2*base[0]-control[0],2*base[1]-control[1]]:base;end=xy(op==='Q'?2:0);newControl=a;
      segment={type:'Q',p:[base,a,end].map(p=>point(m,p))};
    }else if(op==='A'){end=xy(5);segment=arc(base,end,args[0],args[1],args[2],args[3],args[4],m);}
    if(segment)sub.segments.push(segment);current=end;control=newControl;prior=op;
  }
  return subpaths;
}
function sourceBounds(segments){
  const p=[];
  for(const s of segments){p.push(...s.p);if(s.type==='A'){
    const inSweep=t=>{const d=s.delta>0?((t-s.theta)%TAU+TAU)%TAU:((s.theta-t)%TAU+TAU)%TAU;return d<=Math.abs(s.delta)};
    for(const i of [0,1]){const t=Math.atan2(s.b[i],s.a[i]);for(const q of [t,t+Math.PI])if(inSweep(q))p.push([s.center[0]+s.a[0]*Math.cos(q)+s.b[0]*Math.sin(q),s.center[1]+s.a[1]*Math.cos(q)+s.b[1]*Math.sin(q)]);}
  }}return box(p);
}
function flatten(segments,tolerance,budget){
  const out=[];let bound=0;
  const emit=p=>{if(!out.length||!same(p,out.at(-1))){out.push(p);if(out.length>SVG_LIMITS.flattenedPoints||++budget.points>SVG_LIMITS.totalPoints)fail('SVG_POINT_LIMIT');}};
  const bezier=(p,depth=0)=>{
    tick(budget);
    const error=Math.max(...p.slice(1,-1).map(q=>distance(q,p[0],p.at(-1))));
    if(error<=tolerance){bound=Math.max(bound,error);emit(p.at(-1));return;}
    if(depth>=24)fail('SVG_FLATTEN_LIMIT');
    const levels=[p];while(levels.at(-1).length>1)levels.push(levels.at(-1).slice(1).map((q,i)=>midpoint(levels.at(-1)[i],q)));
    bezier(levels.map(l=>l[0]),depth+1);bezier(levels.map(l=>l.at(-1)).reverse(),depth+1);
  };
  for(const s of segments){emit(s.p[0]);
    if(s.type==='L')emit(s.p.at(-1));
    else if(s.type==='C'||s.type==='Q')bezier(s.p);
    else{
      const norm=Math.hypot(...s.a,...s.b),step=Math.min(Math.PI/2,Math.sqrt(8*tolerance/norm)),count=Math.max(1,Math.ceil(Math.abs(s.delta)/step));
      if(!Number.isFinite(count)||count>SVG_LIMITS.flattenedPoints)fail('SVG_FLATTEN_LIMIT');
      bound=Math.max(bound,norm*(s.delta/count)**2/8);
      for(let i=1;i<count;i++){const t=s.theta+s.delta*i/count;emit([checked(s.center[0]+s.a[0]*Math.cos(t)+s.b[0]*Math.sin(t)),checked(s.center[1]+s.a[1]*Math.cos(t)+s.b[1]*Math.sin(t))]);}emit(s.p[1]);
    }
  }
  if(out.length>1&&same(out[0],out.at(-1)))out.pop();return {points:out,bound};
}
function simple(poly,budget){
  if(poly.length<3||polygonAreaSign(poly)===0)return false;
  const seen=new Set();
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],c=poly[(i+2)%poly.length],key=JSON.stringify(a);
    if(seen.has(key)||same(a,b)||orient(a,b,c)===0&&(onSegment(c,a,b)||onSegment(a,b,c)))return false;seen.add(key);
    for(let j=i+2;j<poly.length;j++){tick(budget);if(i===0&&j===poly.length-1)continue;const c=poly[j],d=poly[(j+1)%poly.length];
      if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))continue;
      if(segmentsIntersect(a,b,c,d))return false;
    }
  }return true;
}
function simplify(poly,tolerance,budget){
  if(poly.length<=32)return {points:poly,error:0};
  let far=1;for(let i=2;i<poly.length;i++)if(Math.hypot(poly[i][0]-poly[0][0],poly[i][1]-poly[0][1])>Math.hypot(poly[far][0]-poly[0][0],poly[far][1]-poly[0][1]))far=i;
  const kept=new Set([0,far]),walk=(start,end)=>{const stack=[[start,end]];while(stack.length){const [a,b]=stack.pop();let best=-1,index=-1;for(let i=a+1;i<b;i++){tick(budget);const d=distance(poly[i%poly.length],poly[a%poly.length],poly[b%poly.length]);if(d>best){best=d;index=i;}}if(best>tolerance){kept.add(index%poly.length);stack.push([a,index],[index,b]);}}};
  walk(0,far);walk(far,poly.length);const indices=[...kept].sort((a,b)=>a-b);let error=0;
  for(let j=0;j<indices.length;j++){const a=indices[j],b=indices[(j+1)%indices.length]+(j===indices.length-1?poly.length:0);for(let i=a+1;i<b;i++)error=Math.max(error,distance(poly[i%poly.length],poly[a],poly[b%poly.length]));}
  return {points:indices.map(i=>poly[i]),error};
}
const safeStyle=new Set(['fill','stroke','fill-opacity','stroke-opacity','opacity','display','visibility','fill-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','vector-effect','color','font-family','font-size','font-weight','font-style','text-anchor','overflow','enable-background']);
function style(node){const result={};for(const declaration of (node.getAttribute('style')||'').split(';')){if(!declaration.trim())continue;const colon=declaration.indexOf(':');if(colon<0)fail('SVG_UNSUPPORTED_STYLE');const name=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim();if(!safeStyle.has(name)||/[{}@\\!]/.test(value))fail('SVG_UNSUPPORTED_STYLE',{property:name});result[name]=value;}return result;}
function security(doc){
  const root=doc.documentElement;if(!root||root.localName!=='svg'||root.namespaceURI&&root.namespaceURI!==NS||doc.getElementsByTagName('parsererror').length)fail('SVG_XML_ERROR');
  const all=[root,...root.getElementsByTagName('*')];if(all.length>SVG_LIMITS.elements)fail('SVG_ELEMENT_LIMIT');let allPathChars=0;
  const denied=new Set(['script','foreignobject','image','feimage','style','iframe','object','embed','audio','video','animate','animatetransform','animatemotion','set','discard','a']);
  for(const node of all){if(denied.has(node.localName.toLowerCase()))fail('SVG_FORBIDDEN_ELEMENT',{element:node.localName});
    for(const a of node.attributes){const name=a.localName.toLowerCase();if(a.name==='xmlns'||a.prefix==='xmlns')continue;
      if(name.startsWith('on'))fail('SVG_EVENT_HANDLER');
      if(['href','src','base'].includes(name)||/[\\]/.test(a.value)||/url\s*\(|(?:javascript|data|https?|file|ftp|blob)\s*:/i.test(a.value))fail('SVG_REFERENCE_FORBIDDEN');
      if(name==='style'&&/[\\@{}]/.test(a.value))fail('SVG_UNSUPPORTED_STYLE');
      if(name==='d'&&(a.value.length>SVG_LIMITS.pathChars||(allPathChars+=a.value.length)>SVG_LIMITS.totalPathChars))fail('SVG_PATH_LIMIT');
      if(a.value.length>SVG_LIMITS.pathChars&&name!=='d')fail('SVG_ATTRIBUTE_LIMIT');
    }style(node);
  }
  for(const node of doc.childNodes)if(node.nodeType===7||node.nodeType===10)fail('SVG_PROCESSING_INSTRUCTION');return root;
}
function rectangleSegments(node,ctx){
  const x=length(node.getAttribute('x'),ctx.width),y=length(node.getAttribute('y'),ctx.height),w=length(node.getAttribute('width'),ctx.width),h=length(node.getAttribute('height'),ctx.height);
  if(w<0||h<0)fail('SVG_BAD_RECT');if(!w||!h)return [];
  let rx=length(node.getAttribute('rx'),ctx.width),ry=length(node.getAttribute('ry'),ctx.height);
  if(rx<0||ry<0)fail('SVG_BAD_RECT');if(node.getAttribute('rx')===null)rx=ry;if(node.getAttribute('ry')===null)ry=rx;rx=Math.min(rx,w/2);ry=Math.min(ry,h/2);
  if(!rx||!ry)return [{start:[x,y],closed:true,segments:[[[x,y],[x+w,y]],[[x+w,y],[x+w,y+h]],[[x+w,y+h],[x,y+h]],[[x,y+h],[x,y]]].map(p=>({type:'L',p:p.map(p=>point(ctx.matrix,p))}))}];
  const points=[[x+rx,y],[x+w-rx,y],[x+w,y+ry],[x+w,y+h-ry],[x+w-rx,y+h],[x+rx,y+h],[x,y+h-ry],[x,y+ry]],segments=[];
  for(let i=0;i<8;i++)segments.push(i%2?arc(points[i],points[(i+1)%8],rx,ry,0,0,1,ctx.matrix):{type:'L',p:[point(ctx.matrix,points[i]),point(ctx.matrix,points[(i+1)%8])]});
  return [{start:points[0],closed:true,segments}];
}

export function parseFloorplanSVG(text){
  if(typeof text!=='string'||text.length>SVG_LIMITS.bytes||new TextEncoder().encode(text).length>SVG_LIMITS.bytes)fail('SVG_SIZE_LIMIT');
  if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)||text.includes('&'))fail('SVG_DTD_OR_ENTITY_FORBIDDEN');
  if(/<\?(?!xml\s)[^>]*\?>/i.test(text))fail('SVG_PROCESSING_INSTRUCTION');
  if(typeof DOMParser==='undefined')fail('SVG_DOMPARSER_REQUIRED');
  const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=security(doc),candidates=[],ignored=[],warnings=[],budget={pathChars:0,segments:0,points:0,inputVertices:0,work:0};
  const top=viewport(root,null,true);
  const record=(node,sub,ctx,index,total)=>{
    if(!sub.closed){ignored.push({element:node.localName,reason:'OPEN_REFERENCE'});return;}
    if(!sub.segments.length){ignored.push({element:node.localName,reason:'EMPTY_OUTLINE'});return;}
    const source=sourceBounds(sub.segments),span=Math.hypot(source.width,source.depth);
    if(!span){ignored.push({element:node.localName,reason:'ZERO_AREA'});return;}
    const curveTolerance=span*1e-4,flat=flatten(sub.segments,curveTolerance,budget);
    if(!simple(flat.points,budget)){ignored.push({element:node.localName,reason:'NOT_SIMPLE_POLYGON'});return;}
    if(ctx.clips.some(clip=>!polygonContains(clip,flat.points))){ignored.push({element:node.localName,reason:'CLIPPED_OUTLINE_REQUIRES_MANUAL_EDIT'});return;}
    let reduced={points:flat.points,error:0},tolerance=0;
    if(flat.points.length>32){
      for(tolerance=curveTolerance;tolerance<=span*.005001;tolerance=Math.min(tolerance*2,span*.005)){
        reduced=simplify(flat.points,tolerance,budget);if(reduced.points.length<=32)break;if(tolerance===span*.005)break;
      }
      if(reduced.points.length>32){ignored.push({element:node.localName,reason:'OUTLINE_TOO_COMPLEX_FOR_32_POINTS'});return;}
    }
    if(polygonProblems(reduced.points,{maxVertices:32,maxCoordinateMm:SVG_LIMITS.coordinate}).length){ignored.push({element:node.localName,reason:'SIMPLIFICATION_NOT_SIMPLE'});return;}
    if(candidates.length>=SVG_LIMITS.candidates)fail('SVG_CANDIDATE_LIMIT');
    const title=[...node.children].find(n=>n.localName==='title')?.textContent;
    const label=(node.getAttribute('aria-label')||node.getAttribute('id')||title||`${node.localName} ${candidates.length+1}`).slice(0,120);
    const applied=flat.bound>0||reduced.error>0,approximation={applied,method:'adaptive source Bezier convex-hull / ellipse second-derivative bound + closed RDP',
      tolerance:Math.max(curveTolerance,tolerance),curveErrorBound:flat.bound,simplificationErrorBound:reduced.error,maxDeviationBound:flat.bound+reduced.error,
      errorUnits:'root SVG viewport units, convert with the same explicit width scale',inputVertices:flat.points.length,outputVertices:reduced.points.length,requiresReview:true,
      floatingArithmetic:'binary64; geometric flatten/simplification bound, not a physical survey accuracy claim'};
    if(total>1)warnings.push({code:'SVG_COMPOUND_SUBPATH_REVIEW',candidateId:`svg-room-${candidates.length+1}`});
    candidates.push({id:`svg-room-${candidates.length+1}`,label:total>1?`${label} (${index+1}/${total})`:label,points:reduced.points,bounds:box(reduced.points),approximation,approximated:applied,source:{element:node.localName,subpath:index+1,subpathCount:total,compoundFillRuleApplied:false}});
  };
  const walk=(node,parent,depth,isRoot=false)=>{
    if(depth>SVG_LIMITS.depth)fail('SVG_DEPTH_LIMIT');
    if(node.namespaceURI&&node.namespaceURI!==NS){ignored.push({element:node.localName,reason:'NON_SVG_METADATA'});return;}
    const css=style(node),property=name=>css[name]??node.getAttribute(name),alpha=property('opacity'),hidden=parent.hidden||property('display')==='none'||property('visibility')==='hidden'||property('visibility')==='collapse'||alpha!==null&&alpha.trim()!==''&&Number(alpha)<=0;
    if(hidden){ignored.push({element:node.localName,reason:'HIDDEN_REFERENCE'});return;}
    if(['defs','metadata','symbol','clipPath','mask','pattern','marker','linearGradient','radialGradient','filter'].includes(node.localName)){ignored.push({element:node.localName,reason:'DEFINITION_NOT_RENDERED'});return;}
    if(!['svg','g','rect','polygon','polyline','path'].includes(node.localName)){if(!['title','desc'].includes(node.localName))ignored.push({element:node.localName,reason:'UNSUPPORTED_OR_OPEN_REFERENCE'});return;}
    let ctx={...parent,hidden:false,matrix:matrix(parent.matrix,transform(node.getAttribute('transform'))),clips:parent.clips.slice()};
    if(node.localName==='svg'){
      const vp=isRoot?top:viewport(node,parent,false),outer=ctx.matrix;
      if(property('overflow')!=='visible')ctx.clips.push(vp.viewport.map(p=>point(outer,p)));
      ctx={...ctx,matrix:matrix(outer,vp.matrix),width:vp.width,height:vp.height};
    }
    let paths=[];
    if(node.localName==='rect')paths=rectangleSegments(node,ctx);
    else if(node.localName==='polygon'||node.localName==='polyline'){
      const coords=list(node.getAttribute('points')||'',SVG_LIMITS.flattenedPoints*2);if(coords.length%2)fail('SVG_BAD_POINTS');
      if((budget.inputVertices+=coords.length/2)>SVG_LIMITS.inputVertices)fail('SVG_INPUT_VERTEX_LIMIT');tick(budget,coords.length/2);
      const p=[];for(let i=0;i<coords.length;i+=2)p.push(point(ctx.matrix,[coords[i],coords[i+1]]));
      const closed=node.localName==='polygon'||p.length>1&&same(p[0],p.at(-1));if(p.length>1&&same(p[0],p.at(-1)))p.pop();
      paths=[{start:p[0],closed,segments:p.map((a,i)=>({type:'L',p:[a,p[(i+1)%p.length]]}))}];
    }else if(node.localName==='path')paths=pathData(node.getAttribute('d')||'',ctx.matrix,budget);
    else if(['line','text','tspan','circle','ellipse','use'].includes(node.localName)){ignored.push({element:node.localName,reason:'UNSUPPORTED_OR_OPEN_REFERENCE'});return;}
    paths.forEach((sub,i)=>record(node,sub,ctx,i,paths.length));
    for(const child of node.children)walk(child,ctx,depth+1);
  };
  walk(root,{matrix:I,width:top.width,height:top.height,clips:[],hidden:false},0,true);
  if(top.source!=='explicit')warnings.push({code:'SVG_INTRINSIC_VIEWPORT_FRAME',source:top.source});
  return {candidates,viewBox:top.vb,units:{coordinates:'root SVG viewport units (CSS reference px), not room millimetres',
    xTo:'world X/right',yTo:'world Z/SVG downward',declaredWidth:root.getAttribute('width'),declaredHeight:root.getAttribute('height'),
    viewportWidth:top.w,viewportHeight:top.h,viewportSource:top.source,actualRoomScaleApplied:false,requiresExplicitUserWidthMm:true},ignored,warnings,work:{...budget,limits:SVG_LIMITS}};
}
