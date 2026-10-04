// Workspace appearance and room illumination are independent controls.
export function sceneLightingState({darkUI=false,roomDark=false,ledAvailable=false}={}) {
 const darkRoom=Boolean(roomDark&&ledAvailable);
 return {darkRoom,background:darkUI||darkRoom?'#101820':'#edf1f5',environmentIntensity:darkRoom?.006:.16,ambientIntensity:darkRoom?.008:.25,daylightScale:darkRoom?0:1,exposure:darkRoom?1.35:.9};
}
