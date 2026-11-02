"""Audit each complete V0 in a fresh serial process, retaining every row."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--map',type=Path);a=p.parse_args()
    a.site=a.site.resolve();a.report=a.report.resolve();a.map=a.map.resolve()if a.map else None
    stages=a.site/'V0_ASSEMBLY_STAGES.json';source=stages.read_bytes();machines=json.loads(source)['machines']
    if set(machines)!={'voron_v02_120','voron_v02r1_120'}:raise ValueError('Both registered V0 assemblies required')
    rows=[]
    with tempfile.TemporaryDirectory(prefix='v0-manual-release-')as folder:
        for mid in machines:
            report=Path(folder)/(mid+'.json')
            subprocess.run(['node','--max-old-space-size=176','--max-semi-space-size=1','--v8-pool-size=1','--experimental-vm-modules',str(ROOT/'scripts/audit_v0_assembly_assets.mjs'),'--site',str(a.site),'--machine',mid,'--report',str(report),*(['--map',str(a.map)]if a.map else[])],cwd=ROOT,check=True,timeout=120)
            row=json.loads(report.read_bytes())
            if not row.get('passed')or len(row['machines'])!=1 or row['machines'][0]['machine_id']!=mid:raise ValueError('Missing exact V0 assembly: '+mid)
            proof=row['machines'][0].get('manualFasteners',{})
            if proof.get('sourceFasteners')!=8 or not all(proof.get(k)for k in ['controlledEarlierPartDisplayLease','currentFastenersOriginalHardwareMaterial','foreignDisplayReplacementRejected','originalTransformsMaterialsGeometryVisibilityRestored']):raise ValueError('Missing actual source fastener/display audit: '+mid)
            head=row['machines'][0].get('headOwnership',{});display=row['machines'][0].get('headDisplay',{})
            if head.get('operations')!=41 or head.get('originalHeadOperationLeaves')!=86 or head.get('originalSourceCohort')!=(100 if mid=='voron_v02r1_120'else 99):raise ValueError('Missing exact original head/companion operation audit: '+mid)
            if len(display.get('visits',[]))!=3 or display.get('separatePalettes')!=3 or not all(display.get(k)for k in ['originalRestored','originalSourceMaterialsRetained','fullGeometryContentRetained']):raise ValueError('Missing actual current head display/material restoration: '+mid)
            rows.append(row)
    if stages.read_bytes()!=source:raise ValueError('Stage source changed between machines')
    result={k:v for k,v in rows[0].items()if k not in {'machines','source_sha256'}};result['machines']=[m for row in rows for m in row['machines']];pins={}
    for row in rows:
        for name,pin in row['source_sha256'].items():
            if name in pins and pins[name]!=pin:raise ValueError('Shared actual audit input changed')
            pins[name]=pin
    result['source_sha256']=pins;result['fresh_serial_machine_processes']=len(rows);result['source_sha256']['V0_ASSEMBLY_STAGES.json']=hashlib.sha256(source).hexdigest()
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf8')
    print('V0 assembly release: both complete stock revisions passed in fresh serial processes; sampled source references, not physical fit.')

if __name__=='__main__':main()
