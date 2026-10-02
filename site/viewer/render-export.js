import * as THREE from 'three';
import {cameraAngles,createExportCamera} from './export-camera.mjs?v=public-v22';

// Render the existing scene to an offscreen target: no server, no screenshot
// of HTML controls, and no change to the interactive canvas resolution.
export function setupRenderExport({renderer,scene,camera,controls,beforeRender=()=>{},afterRender=()=>{},name='VORON'}){
 const $=s=>document.querySelector(s);
 const dialog=document.createElement('dialog');dialog.id='renderDialog';
 dialog.innerHTML=`<div class="dialog-head"><h2>画像を書き出す</h2><button class="close" aria-label="閉じる">×</button></div><div class="dialog-body"><p>現在の視点・構成・配色・照明をPNGに保存します。</p><div class="render-options"><div><label for="renderResolution">長辺の解像度</label><select id="renderResolution"><option value="1920">1920 px</option><option value="2560" selected>2560 px</option><option value="3840">3840 px</option></select></div><div><label for="renderBackground">背景</label><select id="renderBackground"><option value="scene">現在の背景</option><option value="transparent">透明</option></select></div></div><p class="foot">画面と同じ縦横比。ブラウザーの3D描画を高解像度化します。光線追跡・実写レンダリングは含みません。</p><button id="saveRender" class="primary">PNGを保存</button><p id="renderStatus" aria-live="polite"></p></div>`;
 const angleOptions=document.createElement('div');angleOptions.innerHTML='<label for="renderView">視点</label><select id="renderView"><option value="current">現在の視点（ドラッグで自由に設定）</option><option value="custom">角度・距離を指定</option></select><div id="renderAngles" class="render-options" hidden><div><label for="renderAzimuth">水平角度 / °</label><input id="renderAzimuth" type="number" step="any" value="0"></div><div><label for="renderElevation">仰角 / °</label><input id="renderElevation" type="number" min="-90" max="90" step="any" value="0"></div><div><label for="renderRoll">傾き / °</label><input id="renderRoll" type="number" step="any" value="0"></div><div><label for="renderDistance">注視点までの距離 / mm</label><input id="renderDistance" type="number" min="0.1" max="20000" step="any" value="1000"></div></div><p class="foot">注視点は現在の画面と共通。書き出し専用の視点なので、表示中の角度は変わりません。</p>';
 dialog.querySelector('#saveRender').before(angleOptions);
 const preview=document.createElement('img');preview.id='renderPreview';preview.alt='書き出し画像のプレビュー';preview.style.cssText='display:none;max-width:100%;max-height:45vh;margin:12px auto;background:repeating-conic-gradient(#dae0dc 0% 25%,#f3f5f3 0% 50%) 0 0/16px 16px';
 const download=document.createElement('a');download.id='downloadRender';download.textContent='PNGをダウンロード';download.hidden=true;dialog.querySelector('.dialog-body').append(preview,download);
 let imageUrl;document.body.append(dialog);dialog.querySelector('.close').onclick=()=>dialog.close();
 const getTarget=()=>controls?.target?.clone()||camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()));
 $('#renderView').onchange=()=>{$('#renderAngles').hidden=$('#renderView').value!=='custom'};
 $('#openRender').disabled=false;$('#openRender').onclick=()=>{const angles=cameraAngles(camera,getTarget());$('#renderAzimuth').value=angles.azimuth.toFixed(2);$('#renderElevation').value=angles.elevation.toFixed(2);$('#renderRoll').value=0;$('#renderDistance').value=angles.distanceMm.toFixed(2);dialog.showModal()};
 const exportImage=async()=>{
  const button=$('#saveRender'),status=$('#renderStatus');button.disabled=true;status.textContent='描画中…';
  let target;const oldTarget=renderer.getRenderTarget(),background=scene.background,oldAlpha=renderer.getClearAlpha(),oldColor=renderer.getClearColor(new THREE.Color());
  try{
   beforeRender();
   const rect=renderer.domElement.getBoundingClientRect(),ratio=rect.width/rect.height;
   const requested=+$('#renderResolution').value,limit=Math.min(renderer.capabilities.maxTextureSize,4096);
   const long=Math.min(requested,limit),width=Math.round(ratio>=1?long:long*ratio),height=Math.round(ratio>=1?long/ratio:long);
   if(width<1||height<1)throw Error('表示領域がありません');
   target=new THREE.WebGLRenderTarget(width,height,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,samples:Math.min(4,renderer.capabilities.maxSamples)});
   target.texture.colorSpace=THREE.SRGBColorSpace;
   const exportCamera=createExportCamera(camera,{mode:$('#renderView').value,target:getTarget(),azimuth:Number($('#renderAzimuth').value),elevation:Number($('#renderElevation').value),roll:Number($('#renderRoll').value),distanceMm:Number($('#renderDistance').value),aspect:ratio});
   if($('#renderBackground').value==='transparent'){scene.background=null;renderer.setClearColor(0x000000,0)}
   renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,exportCamera);
   const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
   renderer.setRenderTarget(oldTarget);scene.background=background;renderer.setClearColor(oldColor,oldAlpha);
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const context=canvas.getContext('2d'),data=context.createImageData(width,height),row=width*4;
   for(let y=0;y<height;y++)data.data.set(pixels.subarray((height-y-1)*row,(height-y)*row),y*row);
   context.putImageData(data,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNGを作成できませんでした');
   if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);download.href=imageUrl;download.download=`${name}_${width}x${height}.png`;download.hidden=false;
   preview.src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});preview.style.display='block';download.click();
   status.textContent=`PNG作成済み · ${width} × ${height} px`;status.dataset.width=width;status.dataset.height=height;status.dataset.bytes=blob.size;status.dataset.background=$('#renderBackground').value;
  }catch(e){status.textContent='書出エラー: '+e.message;status.dataset.error=e.message;console.error(e)}
  finally{renderer.setRenderTarget(oldTarget);scene.background=background;renderer.setClearColor(oldColor,oldAlpha);target?.dispose();button.disabled=false;afterRender()}
 };
 $('#saveRender').onclick=exportImage;
 return {exportImage};
}
