"""Materialize exact registered inputs required by source/metadata regressions."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
from urllib.parse import urlsplit
from build_approved_site import validate_contract

ROOT = Path(__file__).resolve().parents[1]

def selected(row):
    name = row['path']
    return ('/' not in name and name.endswith('.json')
            or name.startswith('source-assembly-assets/') and name.endswith('.json')
            or name.startswith('assets/machines/') and name.endswith('.json')
            or name.startswith('community-machines-assets/switchwire/'))

def digest(file):
    h=hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''): h.update(block)
    return h.hexdigest()

def prepare(root, contract, mapping=None):
    rows=[row for row in validate_contract(contract) if selected(row)]
    verified=[]
    for row in rows:
        target=root/'site'/row['path']
        if target.is_file():
            if target.stat().st_size!=row['bytes'] or digest(target)!=row['sha256']:
                raise ValueError('Changed registered input; no overwrite: '+row['path'])
        else:
            local=(mapping or {}).get('files',{}).get(row['path'])
            target.parent.mkdir(parents=True,exist_ok=True)
            if local:
                source=Path(local)
                if not source.is_absolute() or not source.is_file() or source.stat().st_size!=row['bytes'] or digest(source)!=row['sha256']:
                    raise ValueError('Changed exact source-check body: '+row['path'])
                shutil.copyfile(source,target)
            elif mapping is not None:
                raise ValueError('Missing source-check input mapping: '+row['path'])
            else:
                request=urllib.request.Request(row['url'],headers={'Accept-Encoding':'identity','User-Agent':'3D-Print-Rig-Repository-Inputs'})
                temporary=target.with_name(target.name+'.download')
                try:
                    with urllib.request.urlopen(request,timeout=60) as response,temporary.open('wb') as output:
                        final=urlsplit(response.url)
                        if final.scheme!='https' or final.hostname not in {'github.com','objects.githubusercontent.com','release-assets.githubusercontent.com','psych0h3ad.github.io'}:
                            raise ValueError('Unexpected registered input origin')
                        total=0
                        for block in iter(lambda:response.read(1024*1024),b''):
                            total+=len(block)
                            if total>row['bytes']: raise ValueError('Registered body exceeded its size')
                            output.write(block)
                    if temporary.stat().st_size!=row['bytes'] or digest(temporary)!=row['sha256']:
                        raise ValueError('Registered body checksum mismatch')
                    temporary.replace(target)
                finally:
                    if temporary.exists():temporary.unlink()
        verified.append(row['path'])
    return {'passed':True,'verified_source_check_inputs':len(verified),'paths':verified,
            'archive_accessed':False,'scope':'Exact source-regression input preparation; no geometry result.'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs',type=Path)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    contract=json.loads((ROOT/'site/APPROVED_DELIVERY.json').read_bytes())
    result=prepare(ROOT,contract,json.loads(args.inputs.read_bytes()) if args.inputs else None)
    if args.report:args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':True,'verified_source_check_inputs':result['verified_source_check_inputs'],'archive_accessed':False}))

if __name__=='__main__':main()
