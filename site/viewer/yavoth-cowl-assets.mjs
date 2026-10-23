// The source-authored UHF rear-offset cowls have independent model revisions.
// Keep their transport identity separate from the unchanged baseline archive.
const cowls = {
  "modules/head_print_yavoth_orbiter2_rapido2_uhf_rear5.glb": {
    "bytes": 228419,
    "sha256": "37ecbc875af6000c435971ef846d695f41d503b3a8b9c1bebe608d0ab8245ec2",
    "decoded_bytes": 789020,
    "decoded_sha256": "32e998d30de1ade52cb50d474c1ce2962f616dd4049bf75d855939d0303f1789"
  },
  "modules/head_print_yavoth_sherpa_mini_rapido2_uhf_rear5.glb": {
    "bytes": 211344,
    "sha256": "bf5dbbd24b284f5053b3cb23d769f14d9fcc7ca5c58c0aa217f30c09e9ca43c3",
    "decoded_bytes": 789052,
    "decoded_sha256": "41731f49e46d96cb47145200ba1f6c5d26cc8a9174fa45c89df00996456b949d"
  },
  "modules/head_print_yavoth_sherpa_micro_rapido2_uhf_rear5.glb": {
    "bytes": 222566,
    "sha256": "5516f29cc2fc761750db1d34e1274b5bc0452fc57d47bc4c7b7c8d03e6d2adf0",
    "decoded_bytes": 789060,
    "decoded_sha256": "890171a9dbaae00ad238e35be7991c5d05c5a8c2d513157a1a1bda3613699ded"
  }
};
for (const pin of Object.values(cowls)) Object.freeze(pin);
export const yavothCowlAssets = Object.freeze(cowls);
export const yavothCarriageAsset=Object.freeze({bytes:69734,sha256:'0302e84c88b33b9aca8b92ffd477ba33a8864f7247e02a5423c9bdcf1827e2b7',decoded_bytes:232908,decoded_sha256:'b13853310f19da814cb4ec9e97ae4d88bda34d7a27a7e094043d1fd1f7077eed'});
export function currentYavothCorrection(input,base,siteRoot){
 const cowl=currentYavothCowl(input,base,siteRoot);if(cowl)return cowl;
 const url=new URL(input,base),root=new URL(siteRoot);
 if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return null;
 return decodeURIComponent(url.pathname.slice(root.pathname.length))==='modules/yavoth59_carriage_9.glb'?yavothCarriageAsset:null;
}
export function currentYavothCowl(input, base, siteRoot) {
 const url=new URL(input,base),root=new URL(siteRoot);
 if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return null;
 const name=decodeURIComponent(url.pathname.slice(root.pathname.length));
 return Object.hasOwn(yavothCowlAssets,name) ? yavothCowlAssets[name] : null;
}
