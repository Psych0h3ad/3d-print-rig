// Sphinx tLW, revision 74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180.
// The four finite belt backing faces end at these X coordinates. The body
// bounding box also includes the fan housing and is not a clamp datum.
export const sphinxBeltInterface={
 source_url:'https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180',
 source_bodies_sha256:{
  head_sphinx_monolith_tricorn:'be0e04eb0510452dca127f7f19fa183f701a9db28d2fad356c6b8536079cf08f',
  head_sphinx_monolith_rapido_x_uhf:'d22c5c4adf45c1c2619cfd59b45f3e5a80690e2db05b25d4c229fcda18fe536b',
  head_sphinx_monolith_goliath_chcxl:'3e1a6c7744fa7a729eabe93eecf6e639f9db8cc2ef500ab55085335c6b167e65'
 },
 source_origin_mm:[0,-7.5,0],
 entrance_x_mm:[-25.201504661873933,25.2015046618742],
 // Tricorn's four finite backing lands continue from the mouth to the
 // literal plane/cylindrical-channel boundary. A cut at the mouth alone has
 // zero supported area. These are source edges, not a whole-body extent.
 tricorn_support_end_x_mm:[-22.7409998177714,22.7409998177714],
 backing_y_mm:-9.74,
 channel_z_mm:[[-12,-1.5],[1.5,12]]
};

export function sphinxBeltPreviewCut(asset,registration,translation){
 const original=registration?.belt_preview_cut;
 if(!Object.hasOwn(sphinxBeltInterface.source_bodies_sha256,asset))return original;
 if(!registration.origin_mm?.every((v,i)=>Math.abs(v-sphinxBeltInterface.source_origin_mm[i])<.001)
  ||!translation?.every(Number.isFinite)||translation.length!==3)
  throw Error('Sphinx belt interface datum changed');
 const finiteLand=asset==='head_sphinx_monolith_tricorn';
 return {...original,x_mm:(finiteLand?sphinxBeltInterface.tricorn_support_end_x_mm:sphinxBeltInterface.entrance_x_mm).map(x=>x+translation[0]),y_mm:[-35,35],
  ...(finiteLand?{source_attachment:{schema:'sphinx-tricorn-finite-belt-land-v1',source_body_sha256:sphinxBeltInterface.source_bodies_sha256[asset],
   finite_support_faces:[7904,7908,8095,8099],mouth_x_mm:sphinxBeltInterface.entrance_x_mm.map(x=>x+translation[0]),
   support_backing_y_mm:sphinxBeltInterface.backing_y_mm+translation[1],source_translation_mm:[...translation],
   support_length_mm:25.201504661873933-22.7409998177714,internal_return_path_registered:false}}:{})};
}
