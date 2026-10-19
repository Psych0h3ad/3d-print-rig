"""Materialize exact registered inputs required by source/metadata regressions."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
from urllib.parse import urlsplit
from build_approved_site import safe_path, validate_contract

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


def mounting_dependencies(root, rows, materialize):
    """Resolve the original mounting validator's finite delivery dependencies.

    Historical hashes remain the validator's responsibility, including the
    exact deck/catalog bridges. Preparation authenticates each current body
    against either tracked source or its approved per-file delivery row.
    """
    site = root / 'site'
    ledgers = ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']
    if not any((site / name).exists() for name in ledgers):
        return []
    inventory = json.loads((root / 'docs/SOURCE_INVENTORY.json').read_bytes())
    source = {row['path'][5:]: row for row in inventory['files']
              if row['path'].startswith('site/')}
    delivered = {row['path']: row for row in rows}
    required = set()

    def require(name):
        safe_path(name)
        if name in required:
            return site / name
        if name in source:
            body = (site / name).read_bytes().replace(b'\r\n', b'\n')
            if hashlib.sha256(body).hexdigest() != source[name]['sha256']:
                raise ValueError('Changed tracked mounting input: ' + name)
        elif name in delivered:
            materialize(delivered[name])
        else:
            raise ValueError('Unregistered mounting dependency: ' + name)
        required.add(name)
        return site / name

    def maps(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == 'input_sha256':
                    if not isinstance(child, dict):
                        raise ValueError('Invalid mounting input map')
                    yield child
                else:
                    yield from maps(child)
        elif isinstance(value, list):
            for child in value:
                yield from maps(child)

    # These are proof documents actually interpreted by the original builder.
    # A referenced profile/manifest is materialized, not treated as a new proof.
    pending = list(ledgers)
    if 'TRIDENT_DECK_REPAIR_103.json' in source:
        pending.append('TRIDENT_DECK_REPAIR_103.json')
    scanned = set()
    while pending:
        name = pending.pop(0)
        if name in scanned:
            continue
        scanned.add(name)
        proof = json.loads(require(name).read_bytes())
        for pins in maps(proof):
            for relative in pins:
                require(relative)
        for key in ['stock_skirt_delta_proof', 'enclosure_delta_proof']:
            if proof.get(key):
                pending.append(proof[key])
        retained = proof.get('retained_proof_sha256', {})
        if not isinstance(retained, dict):
            raise ValueError('Invalid retained mounting proofs')
        pending.extend(retained)
    require('ASSET_BUNDLE.json')
    # The production head loader reads both base metadata documents before
    # returning its witness bindings, including native baseline startup.
    catalog = json.loads(require('TOOLHEAD_CONFIGURATIONS.json').read_bytes())
    for family in ['xol', 'stealthburner']:
        require(catalog['base_assets'][family]['meta'])
    return sorted(required)


def prepare(root, contract, mapping=None):
    rows=validate_contract(contract)
    verified=[]
    def materialize(row):
        if row['path'] in verified:
            return
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
    for row in rows:
        if selected(row):
            materialize(row)
    mounting = mounting_dependencies(root, rows, materialize)
    return {'passed':True,'verified_source_check_inputs':len(verified),'paths':verified,
            'mounting_dependency_paths':mounting,
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
