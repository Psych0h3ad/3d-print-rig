export function lightingState({installed,power,night,level,ready,failed=false}){
 const value=Math.max(0,Math.min(100,Number(level)||0))/100,on=Boolean(installed&&power&&ready&&!failed&&value>0);
 return {installed:Boolean(installed&&ready&&!failed),on,night:Boolean(night),value,status:failed?'Disco Modの読込に失敗しました':installed&&!ready?'Discoを読み込み中…':`${night?'暗室':'昼間'} ／ ${!installed?'LED Modなし':on?'庫内LED点灯':'庫内LED消灯'}`,powerDisabled:!installed||!ready||failed,adjustDisabled:!installed||!power||!ready||failed};
}
