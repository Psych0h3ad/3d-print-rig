// XY belts travel with the gantry in Z. Z belt loops stay on frame pulleys;
// moving their clamps does not change the loop geometry.
export function v24FlexibleState(row,delta,enabled) {
  if(/^Z Belt(?: \(\d+\))?$/.test(row.name||''))return {visible:Boolean(enabled),z:0};
  if(/^[AB] Belt$/.test(row.name||''))return {visible:Boolean(enabled),z:delta[2]};
  return {visible:Boolean(enabled),z:0};
}
