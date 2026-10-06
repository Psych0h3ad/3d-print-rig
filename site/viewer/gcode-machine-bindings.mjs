import {virtualSettingsFromAdapter} from './virtual-printer-emulator.mjs?v=82f4d419283bf6313caf';

/** Native displacement axes stay displacement axes; never infer a nozzle datum. */
export function displacementGcodeSettings(profile,pose,ranges=profile.axes){
 const motion=profile.motion_preview!==false&&['x','y','z'].every(a=>Array.isArray(ranges[a]));
 if(!motion)return virtualSettingsFromAdapter({motionEnabled:false});
 const settings=virtualSettingsFromAdapter({profile,initial:['x','y','z'].map(a=>pose[a]),limits:Object.fromEntries(['x','y','z'].map(a=>[a.toUpperCase(),ranges[a]]))});
 settings.evidence.xyz='Native adapter displacement axes in mm; not nozzle or firmware coordinates';
 return settings;
}

/** Secondary carriage remains controlled by the existing adapter mode. */
export function ratRigGcodeSettings(profile,snapshot,ranges){
 const settings=virtualSettingsFromAdapter({profile,initial:[snapshot.pose.x0,snapshot.pose.y,snapshot.pose.z],limits:{X:ranges.x0,Y:ranges.y,Z:ranges.z}});
 settings.evidence.xyz='Viewer adapter primary X0 / Y / Z limits in current carriage mode; no firmware coordinate mapping';
 return settings;
}

export const displacementCoordinateNote='XYZはビューアのアダプター変位座標（mm）です。到達範囲は現在の構成から取得します。実機の原点・ノズル座標ではありません。ノズル基準の軌跡線は表示しません。';
export const viewerCoordinateNote='XYZはビューアの表示座標（mm）です。到達範囲は現在のアダプター設定です。実機の原点・接触位置や連続クリアランスを保証しません。';
export const ratRigCoordinateNote='Xは主キャリッジX0、Y/Zはビューア座標（mm）です。副キャリッジは既存の独立・コピー・ミラーモードに従います。仮想ツール切替ではキャリッジを切り替えません。ノズル基準の軌跡線は表示しません。';
export const unavailableCoordinateNote='このアダプターにはプリンターXYZの接続がありません。XYZ・ホーミング・プローブ移動は停止します。マクロとヒーター・押出し・ツールの仮想状態のみ確認できます。';
