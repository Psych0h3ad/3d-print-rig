// Keep the view's scale relative to the shorter viewport dimension.
// This preserves the viewing direction and user zoom when a mobile panel folds.
export function setResponsiveAspect(camera, controls, width, height) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const previous = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 1;
  const scale = Math.min(1, previous) / Math.min(1, aspect);
  camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  controls.update();
}

// Preset views supply a distance designed for a landscape viewport.
export function frameResponsiveView(camera, controls) {
  // A preset is a new pose. Drain pending orbit/pan/dolly input without letting
  // its inertia change that requested pose or the following rendered frames.
  const position=camera.position.clone(),target=controls.target.clone(),up=camera.up.clone(),zoom=camera.zoom;
  const aspect=Number.isFinite(camera.aspect)&&camera.aspect>0?camera.aspect:1;
  const damping=controls.enableDamping,autoRotate=controls.autoRotate;
  try {
    controls.enableDamping=false;controls.autoRotate=false;controls.update();
    controls.target.copy(target);camera.up.copy(up);camera.zoom=zoom;
    camera.position.copy(position).sub(target).multiplyScalar(1 / Math.min(1, aspect)).add(target);
    camera.lookAt(target);camera.updateProjectionMatrix();controls.update();
  } finally {
    controls.enableDamping=damping;controls.autoRotate=autoRotate;
  }
}
