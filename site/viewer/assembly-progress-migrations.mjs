// Exact V0 manual-stage corrections. Original models, manuals and source keys
// are unchanged. New manual operations do not inherit completion marks.
const oldStageSHA256=Object.freeze(['5b88dcdf6ca7690a9737781ce0f09f0aeb8405ea534a1701c37084797c11612e','2baa9a7d9ea85ec661d6d9b59055a4a68b0ec436e54f96ab7d7019ef17dafaa5','50a7f0e504fa3a013607cc4e0bc8cb4ff49dc442cb2a5b16a5ac70d17e0c67dd','cac666a318dc56cdae843f4464e1cb63f33663002c93b4ebedaf6abb97f6e810']);
const currentIdentities=Object.freeze({"voron_v02_120":{"machine":"voron_v02_120","model_sha256":"da642150957fa38289499bd1c1586737f4f970968c3b32b3f7b81d76bef05ea9","manifest_sha256":"16b195acbaf4e74ea8b68f629aacf17066c0151fc7c4910647a71cd52ef9c23c","stages_sha256":"1a72f36890af24c6f61f8ec86843bf77406ec2b5a13a207a7bc357ca8c7edc37","manual_sha256":"69f989092ea63b60a15407ce1c4b4f9e260702330ae00416a059eb705d5170fe","manual_revision":"2023-03-03 @ a4d02db92a7dd71e8f2c72d6f74f6bc3b9d020c8"},"voron_v02r1_120":{"machine":"voron_v02r1_120","model_sha256":"d89064824fa67ed6e7c78e90c642620afe62c3b4520255f6c626181754b7d29d","manifest_sha256":"3bc45717c986aea14895e52532d76284c7d084740dd19c4dea09dc104ff847ea","stages_sha256":"1a72f36890af24c6f61f8ec86843bf77406ec2b5a13a207a7bc357ca8c7edc37","manual_sha256":"5d9af5a34304c751799c4ab71d9d42ed0c3ebc20b14df4b612d332ce1cb44b6f","manual_revision":"2024-05-07 @ a53fc87562fd630c846af38d7de850c894dc3d85"}});
const same=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);
function currentIdentity(index){const expected=currentIdentities[index?.identity?.machine];return same(index?.identity,expected)?expected:null}
export function assemblyProgressNeedsMigration(index,identity){
 const current=currentIdentity(index);return Boolean(current&&oldStageSHA256.some(stages_sha256=>same(identity,{...current,stages_sha256})));
}
export function previousAssemblyProgressStorageKeys(index){
 const current=currentIdentity(index);return current?oldStageSHA256.flatMap(hash=>[2,1].map(v=>'3d-print-rig-assembly-progress-v'+v+':'+current.machine+':'+hash)):[];
}
