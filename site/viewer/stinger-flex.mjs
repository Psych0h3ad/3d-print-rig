const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const tent=(v,a,l,h,b)=>v<=a||v>=b?0:v<l?(v-a)/(l-a):v<=h?1:(b-v)/(b-h);
// Native clamp and fitting coordinates, in the author's millimetre frame.
// Belts keep fixed pulley endpoints; cables retain their fixed frame ends.
export function stingerFlexWeights([x,y,z],key){
 switch(String(key)){
  case '550':return [tent(x,-135.553216,-1,52,203.855102),0,1];
  case '708':return [0,tent(y,38.054404,254.719242,259.719242,476.384080),0];
  // Keep the upper reverse-Bowden arch above the crossbar as the head drops.
  // The straight section at the moving fitting follows X/Z completely.
  case '332':{const w=smooth((230-x)/200);return [w,0,w*smooth((310-z)/140)]}
  case '333':{const w=smooth((z+25)/135);return [w,0,w]}
  case '338':return [0,0,smooth((z+60)/140)];
  case '343':return [0,smooth((x+179)/114),0];
  // This source leaf contains five separate printed cable clips. Only its
  // upper clip is mounted on the X beam; the four base clips remain fixed.
  case '345':return [0,0,z>50?1:0];
  default:throw Error('Unknown LH Stinger flexible part');
 }
}
