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
  camera.position.sub(controls.target).multiplyScalar(1 / Math.min(1, camera.aspect)).add(controls.target);
  controls.update();
}
