import {frameResponsiveView} from './responsive-camera.mjs?v=149a79a654914b2af652';

const views={iso:[1.05,.78,1.18],front:[0,.24,1.65],top:[0,1.8,0]};

export function framePrinterView(camera,controls,kind){
  const position=Object.hasOwn(views,kind)?views[kind]:null;
  if(!position)throw Error('Unknown printer camera view');
  // Keep the orbit's world-up axis fixed. A vertical position has zero azimuth;
  // OrbitControls supplies its tiny pole guard in +Z, keeping X horizontal.
  // Equal nonzero X/Z offsets instead roll the whole grid by45 degrees.
  camera.up.set(0,1,0);
  camera.position.set(...position);controls.target.set(0,.22,0);
  frameResponsiveView(camera,controls);
}
