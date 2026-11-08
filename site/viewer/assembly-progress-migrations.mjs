import {tridentRailProgressNeedsMigration,previousTridentRailProgressStorageKeys,tridentRailProgressStageCorrection} from './trident-rail-progress-migrations.mjs?v=9d88bd9a8a1b347faad1';
// Exact V0 manual-stage corrections. Original models, manuals and source keys
// are unchanged. New manual operations do not inherit completion marks.
// Retained source revisions are listed newest first: the first saved record wins.
const oldStageSHA256=Object.freeze(["7cb12de4b91de4fa4b77c8479ab30eed7eef9cc4cfe108f2601bd2d003d6f7f6","26c6c7295ebcdf701719b6dad76ee3c4f83ebc268c45b86bb461a120530f98a1","2b8f0d90936c85014900f9de026addcbf0c338cf10e72939142f3c2b65539195","ec0981b7f877eeb77d819cb483c0678e80d9829efe09a9e06f216dae0574da99","27928f876b6e05a46227c0e7f7e07b3513a55e8fec375f546c2c594068baa059","64ffe3c0359d11e1c1ff523cfc8eda6b63fb51a5ce7cba3b6c857112c2fcc3e8","30115ff48261cbbdcb53c49a2e9b51d8c660a6554eed43ec305870ffe1739c8a","689e54096b54f6eeaaa9d5d96c6a735a8fc43391e6477ab0115bc9aeb8ba2a4e","1a72f36890af24c6f61f8ec86843bf77406ec2b5a13a207a7bc357ca8c7edc37","5b88dcdf6ca7690a9737781ce0f09f0aeb8405ea534a1701c37084797c11612e","2baa9a7d9ea85ec661d6d9b59055a4a68b0ec436e54f96ab7d7019ef17dafaa5","50a7f0e504fa3a013607cc4e0bc8cb4ff49dc442cb2a5b16a5ac70d17e0c67dd","cac666a318dc56cdae843f4464e1cb63f33663002c93b4ebedaf6abb97f6e810"]);
const currentIdentities=Object.freeze({"voron_v02_120":{"machine":"voron_v02_120","model_sha256":"da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9","manifest_sha256":"16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c","stages_sha256":"cbcdeba5d465a35dd1787c2f6064595d24e215b97601fc71ca8f450c7e3c6205","manual_sha256":"69f989092ea63b60a15407ce1c4b4f9e260702330ae00416a059eb705d5170fe","manual_revision":"2023-03-03 @ a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8"},"voron_v02r1_120":{"machine":"voron_v02r1_120","model_sha256":"d89064824fa67ed6e7c78e90c642620afe62c3b4520255f6c626181754b7d29d","manifest_sha256":"3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea","stages_sha256":"cbcdeba5d465a35dd1787c2f6064595d24e215b97601fc71ca8f450c7e3c6205","manual_sha256":"5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f","manual_revision":"2024-05-07 @ a53fc87562fd630c846af38d7de850c894dc3d85"}});
const same=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);
function currentIdentity(index){const expected=currentIdentities[index?.identity?.machine];return same(index?.identity,expected)?expected:null}
export function assemblyProgressNeedsMigration(index,identity){
 if(tridentRailProgressNeedsMigration(index,identity))return true;
 const current=currentIdentity(index);return Boolean(current&&oldStageSHA256.some(stages_sha256=>same(identity,{...current,stages_sha256})));
}
export function previousAssemblyProgressStorageKeys(index){
 const tridentKeys=previousTridentRailProgressStorageKeys(index);if(tridentKeys.length)return tridentKeys;
 const current=currentIdentity(index);return current?oldStageSHA256.flatMap(hash=>[2,1].map(v=>'3d-print-rig-assembly-progress-v'+v+':'+current.machine+':'+hash)):[];
}

// The immediate public predecessor already has the corrected head/XY guide.
// Recheck only changed rail rows for it; older identities retain both corrections.
const priorPublicOrderIdentityHash="64ffe3c0359d11e1c1ff523cfc8eda6b63fb51a5ce7cba3b6c857112c2fcc3e8";
const priorPublicRailIdentityHash="30115ff48261cbbdcb53c49a2e9b51d8c660a6554eed43ec305870ffe1739c8a";
const railCurrent={"y-rails":"y-rail-lubrication","z-rails":"z-rails","z-crossmembers":"z-crossmembers","z-stops":"z-stops"},railRecheck=["y-rails","z-rails","z-crossmembers","z-stops"];
const earlierCurrent={"xy-left":"xy-left-inserts","xy-right":"xy-right-inserts","head-prep":"head-prep","head-guidler":"head-guidler","head-extruder":"head-motorplate-prep","head-tension":"head-tension","head-fans":"head-fan-first","head-led-supplement":"head-led-supplement","head-motor":"head-motor","head-hotend":"head-hotend-choice","head-close":"head-close","head-install":"head-install","head-strain-relief":"head-strain-relief","head-adxl-supplement":"head-adxl-supplement"},earlierRecheck=["xy-left","xy-right","head-prep","head-guidler","head-extruder","head-tension","head-fans","head-led-supplement","head-motor","head-hotend","head-close","head-install","head-strain-relief","head-adxl-supplement"];
const electronicsCurrent={"mid-panel":"mid-panel-alignment","electronics-boards":"electronics-control-board"},electronicsRecheck=["mid-panel","electronics-mounts","electronics-boards","electronics-fan"];
const powerCurrent={"electronics-psu":"electronics-psu-voltage"},powerRecheck=["electronics-psu","electronics-mains","electronics-dc","electronics-guard"];
function earlierAssemblyProgressStageCorrection(index,identity){
 if(!assemblyProgressNeedsMigration(index,identity))return null;
 if(identity.stages_sha256==="ec0981b7f877eeb77d819cb483c0678e80d9829efe09a9e06f216dae0574da99")return Object.freeze({current:Object.freeze({...powerCurrent}),recheck:Object.freeze([...powerRecheck])});
 if(identity.stages_sha256==="27928f876b6e05a46227c0e7f7e07b3513a55e8fec375f546c2c594068baa059")return Object.freeze({current:Object.freeze({...electronicsCurrent,...powerCurrent}),recheck:Object.freeze([...electronicsRecheck,...powerRecheck])});
 const orderRecheck=index.identity.machine==='voron_v02r1_120'?['z-motor-center']:[];
 if(identity.stages_sha256===priorPublicOrderIdentityHash)return Object.freeze({current:Object.freeze({...electronicsCurrent,...powerCurrent}),recheck:Object.freeze([...orderRecheck,...electronicsRecheck,...powerRecheck])});
 const immediate=identity.stages_sha256===priorPublicRailIdentityHash;
 return Object.freeze({current:Object.freeze({...(!immediate?earlierCurrent:{}),...railCurrent,...electronicsCurrent,...powerCurrent}),recheck:Object.freeze([...electronicsRecheck,...(!immediate?earlierRecheck:[]),...railRecheck,...orderRecheck,...powerRecheck])});
}

const currentManualFrom="2b8f0d90936c85014900f9de026addcbf0c338cf10e72939142f3c2b65539195";
const currentManualAliases={"electronics-fan":"electronics-fan-upper","skirt-right":"skirt-right-position","skirt-left":"skirt-left-position","skirt-rear":"skirt-rear-position","skirt-front":"skirt-front-left-prep","display":"display-faceplate-prep","bottom-panel":"bottom-feet-remove","motor-panel":"motor-strain-relief","spool-holder":"spool-upper-liner","reverse-bowden":"reverse-bowden","rear-panels":"rear-panel-position","panel-right":"panel-right-position","panel-left":"panel-left-position","door-panel":"door-panel-vhb","door-latches":"door-latch-magnets","door-handle":"door-handle-magnets","tophat-frame":"tophat-long-front-prep","tophat-nut-check":"tophat-nuts-front","tophat-top":"tophat-top-position","tophat-sides":"tophat-front-position","tophat-rear":"tophat-rear-position","tophat-attach":"tophat-hinge-washers","tophat-check":"tophat-locks-open"};
const currentManualRecheck={"voron_v02_120":["frame-front","electronics-fan-inserts","electronics-fan","skirt-right","skirt-left","skirt-rear","skirt-front","display","bottom-panel","motor-panel","spool-holder","reverse-bowden","rear-panels","panel-right","panel-left","door-panel","door-latches","door-handle","tophat-frame","tophat-nut-check","tophat-top","tophat-sides","tophat-rear","tophat-attach","tophat-check"],"voron_v02r1_120":["frame-front","electronics-fan-inserts","electronics-fan","skirt-right","skirt-left","skirt-rear","skirt-front","display","bottom-panel","motor-panel","spool-holder","reverse-bowden","rear-panels","panel-right","panel-left","door-latches","door-panel","door-handle","tophat-frame","tophat-nut-check","tophat-top","tophat-sides","tophat-rear","tophat-attach","tophat-check"]};
export function assemblyProgressStageCorrection(index,identity){
 if(identity?.stages_sha256==="7cb12de4b91de4fa4b77c8479ab30eed7eef9cc4cfe108f2601bd2d003d6f7f6"&&assemblyProgressNeedsMigration(index,identity))return Object.freeze({current:Object.freeze({}),recheck:Object.freeze(["reference-printed-parts","reference-fasteners","reference-blind-joints","reference-tools","reference-drilling","reference-frame-profiles","reference-belt-paths","reference-tophat-profiles","reference-startup-docs"])});
 const tridentCorrection=tridentRailProgressStageCorrection(index,identity);if(tridentCorrection)return tridentCorrection;
 if(!assemblyProgressNeedsMigration(index,identity))return null;
 // Identical JSON values and operation IDs; only the terminal source newline changed.
 if(identity.stages_sha256==="26c6c7295ebcdf701719b6dad76ee3c4f83ebc268c45b86bb461a120530f98a1")return Object.freeze({current:Object.freeze({}),recheck:Object.freeze([])});
 const now={current:currentManualAliases,recheck:currentManualRecheck[index.identity.machine]};
 if(identity.stages_sha256===currentManualFrom)return Object.freeze({current:Object.freeze({...now.current}),recheck:Object.freeze([...now.recheck])});
 const previous=earlierAssemblyProgressStageCorrection(index,identity);if(!previous)return null;
 return Object.freeze({current:Object.freeze({...previous.current,...now.current}),recheck:Object.freeze([...new Set([...previous.recheck,...now.recheck])])});
}
