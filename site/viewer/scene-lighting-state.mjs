// Workspace appearance and room illumination are independent controls.
// RectAreaLight uses surface luminance; tiny LED strips need more than a room lamp.
export const discoLightLuminance=1400;
export function sceneLightingState({darkUI=false,roomDark=false,ledAvailable=false}={}) {
 const darkRoom=Boolean(roomDark&&ledAvailable);
 return {darkRoom,background:darkUI||darkRoom?'#101820':'#edf1f5',environmentIntensity:darkRoom?.025:.16,ambientIntensity:darkRoom?.04:.25,daylightScale:darkRoom?0:1,exposure:darkRoom?1.35:.9};
}
