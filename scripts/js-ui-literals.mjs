/** Extract UI string literals, respecting regexes and nested templates. */
const regexWords=new Set(['return','throw','case','delete','void','typeof','instanceof','in','of','yield','await','else']);
export function javascriptLiterals(text){
 const values=[];let i=0;
 function quoted(quote){let value='';i++;while(i<text.length){const c=text[i++];if(c==='\\'){value+=c+(text[i++]||'');continue}if(c===quote)break;value+=c}values.push(value)}
 function regexp(){i++;let inClass=false;while(i<text.length){const c=text[i++];if(c==='\\'){i++;continue}if(c==='[')inClass=true;else if(c===']')inClass=false;else if(c==='/'&&!inClass)break}while(/[a-z]/iu.test(text[i]||''))i++}
 function template(){
  i++;let value='',parameter=0;
  while(i<text.length){const c=text[i++];if(c==='\\'){value+=c+(text[i++]||'');continue}if(c==='`'){values.push(value);return}if(c==='$'&&text[i]==='{'){value+='{'+parameter+++'}';i++;code(true);continue}value+=c}
 }
 function code(interpolation=false){
  let canRegex=true,braces=0;
  while(i<text.length){
   const c=text[i],next=text[i+1];
   if(/\s/u.test(c)){i++;continue}
   if(c==='/'&&next==='/'){i=text.indexOf('\n',i+2);if(i<0){i=text.length;return}continue}
   if(c==='/'&&next==='*'){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+2;continue}
   if(c==='"'||c==="'"){quoted(c);canRegex=false;continue}
   if(c==='`'){template();canRegex=false;continue}
   if(c==='/'&&canRegex){regexp();canRegex=false;continue}
   if(/[a-z_$]/iu.test(c)){let word='';while(i<text.length&&/[\w$]/u.test(text[i]))word+=text[i++];canRegex=regexWords.has(word);continue}
   if(/\d/u.test(c)){i++;while(i<text.length&&/[\w.]/u.test(text[i]))i++;canRegex=false;continue}
   if(c==='{')braces++;
   if(c==='}'){if(interpolation&&braces===0){i++;return}braces--}
   canRegex=!/[)\]}]/u.test(c);i++;
  }
 }
 code();return values;
}
