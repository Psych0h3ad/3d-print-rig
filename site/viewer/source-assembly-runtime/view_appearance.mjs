// Transfer display settings only between views of the identical source model.
const identity=p=>({packet:p.id,model_sha256:p.model.sha256,inventory_sha256:p.inventory.sha256});
const same=(a,b)=>['packet','model_sha256','inventory_sha256'].every(k=>a?.[k]===b?.[k]);
function appearance(s){
 if(!/^#[a-f\d]{6}$/i.test(s.palette?.M)||!/^#[a-f\d]{6}$/i.test(s.palette?.A)||!['light','dark'].includes(s.theme)||!['studio','white','rgb','off'].includes(s.lighting)||typeof s.grid!=='boolean'||!Number.isFinite(s.lightIntensity)||s.lightIntensity<0||s.lightIntensity>2)throw Error('Invalid source view appearance');
 const out={palette:{M:s.palette.M,A:s.palette.A},theme:s.theme,lighting:s.lighting,lightIntensity:s.lightIntensity,grid:s.grid};
 if(s.purchased_appearance!==undefined){if(!['physical','cad'].includes(s.purchased_appearance))throw Error('Invalid purchased appearance');out.purchased_appearance=s.purchased_appearance;}
 if(Object.hasOwn(s,'source_material_display')){if(!['source','palette'].includes(s.source_material_display))throw Error('Invalid source material display mode');out.source_material_display=s.source_material_display;}
 return out;
}
export function captureViewAppearance(state,packet){const id=identity(packet);if(!same(state,id))throw Error('Source view appearance revision mismatch');return {...id,appearance:appearance(state)};}
export function transferViewAppearance(nextState,nextPacket,captured){if(!captured)return nextState;const id=identity(nextPacket);if(!same(nextState,id)||!same(captured,id))throw Error('Source view appearance revision mismatch');return {...nextState,...appearance(captured.appearance)};}
