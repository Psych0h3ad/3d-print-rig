// Gantry-source belt ends belong to a different clamp. For fixed Sphinx,
// stop the preview at the native head entrance; do not draw through its body.
// Clamp-internal return loops are intentionally not invented.
export function monolithBeltClip(variant){
 const cut=variant?.fit?.machine_mount?.belt_preview_cut;
 if(!cut)return [];
 const [xmin,xmax]=cut.x_mm.map(v=>v*.001),[ymin,ymax]=cut.y_mm.map(v=>v*.001);
 // CAD (X,Y,Z) -> viewer (X,Z,-Y); intersection of four negative half spaces.
 return [[[1,0,0],-xmax],[[-1,0,0],xmin],[[0,0,1],ymin],[[0,0,-1],-ymax]];
}
