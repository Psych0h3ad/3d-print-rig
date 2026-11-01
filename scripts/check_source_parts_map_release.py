"""Audit each admitted source-map assembly in a fresh, finite Node process.

Only the normal approved Web asset graph and explicit delivery map are inputs.
No native CAD, source-model mutation, or physical-fit qualification occurs here.
"""
from pathlib import Path
import argparse,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
MACHINES=[f'voron_trident_{n}'for n in [250,300,350]]+[f'voron_v24_{n}_{t}'for n in [250,300,350]for t in ['printed','ldo_cnc']]
def main():
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--inputs',type=Path);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True);rows=[]
 for mid in MACHINES:
  report=a.output/(mid+'.json')
  subprocess.run(['node','--max-old-space-size=96','--max-semi-space-size=1',str(ROOT/'scripts/audit_source_parts_map.mjs'),'--site',str(a.site),'--machine',mid,'--report',str(report),*(['--inputs',str(a.inputs)]if a.inputs else [])],cwd=ROOT,check=True,timeout=120)
  r=json.loads(report.read_bytes())
  if r.get('passed')is not True or r.get('machine')!=mid or not r.get('sourceUnchanged')or not r.get('retiredRejected'):raise ValueError('Missing or unqualified source-map assembly: '+mid)
  if not r.get('partReview',{}).get('sourceIdentityBound') or not r['partReview'].get('legacyMigration') or r['partReview'].get('parts')!=r['sourceItems']:raise ValueError('Missing source part checklist: '+mid)
  if mid.endswith('_ldo_cnc'):
   if r.get('assembly')is not None or r.get('assemblyUnsupportedExplicitly')is not True:raise ValueError('CNC source lacks a reviewed assembly plan')
  elif not r.get('assembly')or not all(r['assembly'].get(k)for k in ['beltReceiversBeforeBelts','reverseAndPreview','restoredUnchanged','wrongViewProgressRejected']):raise ValueError('Missing actual interactive assembly: '+mid)
  rows.append({k:r[k]for k in ['machine','sourceItems','meshes','classifications','identity','sourceUnchanged','retiredRejected','assembly','assemblyUnsupportedExplicitly','partReview']})
 (a.output/'summary.json').write_text(json.dumps({'passed':True,'machines':rows,'scope':'Nine default source maps; live ownership, progress, unchanged source buffers/matrices/materials. No insertion/mating/continuous-motion certification.'},indent=2)+'\n',encoding='utf-8')
 print(f'Source part maps: {len(rows)} actual assemblies passed in fresh serial processes.')
 print('Interactive assembly: 6 actual defaults passed cumulative/reverse/compare/restore; 3 CNC defaults remain part-map-only.')
if __name__=='__main__':main()
