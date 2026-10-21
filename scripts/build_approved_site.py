"""Build only the exact per-file approved static delivery. No archive input."""
import argparse
import hashlib
import json
import pathlib
import shutil
import urllib.request
import urllib.parse
import urllib.error
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAX_SITE_BYTES = 990_000_000


def fetch_pinned_body(row, dest):
    """Retry transient transport failures at the same approved URL only."""
    request = urllib.request.Request(row['url'], headers={'User-Agent': '3D-Print-Rig', 'Accept-Encoding': 'identity'})
    for attempt in range(3):
        try:
            h = hashlib.sha256()
            received = 0
            with urllib.request.urlopen(request, timeout=60) as response, dest.open('wb') as target:
                final = urllib.parse.urlparse(response.url)
                if final.scheme != 'https' or final.hostname not in {'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'psych0h3ad.github.io'}:
                    raise ValueError('Unapproved delivery redirect: '+row['path'])
                for b in iter(lambda: response.read(1024*1024), b''):
                    received += len(b)
                    if received > row['bytes']:
                        raise ValueError('Delivery exceeds pinned bytes')
                    h.update(b)
                    target.write(b)
            if received != row['bytes'] or h.hexdigest() != row['sha256']:
                raise ValueError('Delivery checksum changed: '+row['path'])
            return
        except (urllib.error.HTTPError, TimeoutError, ConnectionError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            if attempt == 2:
                raise
            time.sleep((1, 3)[attempt])

def digest(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def safe_path(name):
    if not isinstance(name, str): raise ValueError('Invalid static delivery path')
    p = pathlib.PurePosixPath(name)
    if (not isinstance(name, str) or not name or p.is_absolute() or '..' in p.parts
            or str(p)!=name or name=='.' or '\\' in name or ':' in name or p.suffix.lower() in {'.zip','.7z','.step','.stp','.brep'}):
        raise ValueError('Invalid static delivery path')
    return p

def validate_contract(contract):
    if contract.get('schema') != 'approved-static-delivery-v1': raise ValueError('Missing approved per-file delivery contract')
    rows = contract.get('files', []); seen = set()
    for row in rows:
        name = str(safe_path(row['path']))
        if name in seen: raise ValueError('Duplicate delivery path: '+name)
        seen.add(name)
        if (not isinstance(row.get('bytes'), int) or row['bytes'] <= 0
                or len(row.get('sha256','')) != 64
                or any(c not in '0123456789abcdef' for c in row['sha256'])
                or not row.get('url','').startswith('https://')
                or '.zip' in urllib.parse.urlparse(row['url']).path.lower()
                or len(row.get('approval_receipt_sha256','')) != 64
                or any(c not in '0123456789abcdef' for c in row.get('approval_receipt_sha256',''))):
            raise ValueError('Unpinned approved body: '+name)
    if not rows: raise ValueError('Empty approved delivery')
    return rows

def source_files(root):
    inventory = json.loads((root/'docs/SOURCE_INVENTORY.json').read_text(encoding='utf-8'))
    files = {}
    for row in inventory['files']:
        if not row['path'].startswith('site/'): continue
        name = row['path'][5:]; safe_path(name); p = root/row['path']; data = p.read_bytes()
        if hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest() != row['sha256']:
            raise ValueError('Changed source snapshot: '+name)
        files[name] = p
    return files

def release_failures(root, contract):
    coverage = json.loads((root/'docs/MACHINE_REVIEW_COVERAGE.json').read_text(encoding='utf-8'))
    if set(contract['machine_ids']) != {r['id'] for r in coverage['machines']}:
        raise ValueError('Delivery omits a selectable machine')
    failures = [dict(machine=r['id'], finding=f) for r in coverage['machines']
                for f in r.get('known_required_companion_failures', [])]
    failures += contract.get('unresolved_release_findings', [])
    return failures

def run(root, contract, output, inputs=None, plan_only=False, verify_inputs=False):
    rows = validate_contract(contract); sources = source_files(root)
    for name,pin in contract.get('source_catalog_sha256',{}).items():
        safe_path(name)
        if digest(root/'site'/name)!=pin: raise ValueError('Source catalog changed after delivery approval: '+name)
    if any(r['path'] in sources for r in rows): raise ValueError('Runtime body collides with tracked source')
    size = sum(p.stat().st_size for p in sources.values()) + sum(r['bytes'] for r in rows)
    if size >= MAX_SITE_BYTES: raise ValueError('Approved site reaches/exceeds 990000000 bytes: '+str(size))
    failures = release_failures(root, contract); verified = []; missing = []
    mapping = (inputs or {}).get('files', {})
    if not plan_only:
        if failures: raise ValueError('Required release findings remain; deployment rejected')
        if output.exists(): raise ValueError('Use a new build output directory')
        output.mkdir(parents=True)
        for name,p in sources.items():
            dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
    for row in rows:
        if plan_only and not verify_inputs: continue
        local = mapping.get(row['path'])
        if not local and inputs is None and (root/'site'/row['path']).is_file():
            # The source-check preparation stage pins this body too. Reuse only
            # its exact bytes; a stale file is rejected, never silently replaced.
            local = str(root/'site'/row['path'])
        if local:
            p=pathlib.Path(local)
            if not p.is_file() or p.stat().st_size!=row['bytes'] or digest(p)!=row['sha256']:
                missing.append({'path':row['path'],'reason':'Missing or changed exact local body'});continue
            if not plan_only:
                dest=output/row['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
        elif inputs is not None:
            missing.append({'path':row['path'],'reason':'No exact approved input mapping'});continue
        else:
            if plan_only: continue
            dest=output/row['path'];dest.parent.mkdir(parents=True,exist_ok=True)
            fetch_pinned_body(row, dest)
        verified.append(row['path'])
    if missing: raise ValueError('Missing exact approved inputs: '+json.dumps(missing))
    if not plan_only: (output/'.nojekyll').touch()
    return {'schema':'approved-static-build-check-v1','planned_site_bytes':size,'site_limit_bytes':MAX_SITE_BYTES,
            'runtime_files':len(rows),'source_files':len(sources),'verified_exact_bodies':len(verified),
            'plan_only':plan_only,'release_failures':failures,'deployment_ready':not failures and not plan_only,
            'legacy_archive_opened':False,'raw_model_substitution':False}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=pathlib.Path,required=True)
    parser.add_argument('--delivery',type=pathlib.Path,default=ROOT/'site/APPROVED_DELIVERY.json')
    parser.add_argument('--inputs',type=pathlib.Path);parser.add_argument('--plan-only',action='store_true');parser.add_argument('--verify-inputs',action='store_true');parser.add_argument('--report',type=pathlib.Path)
    args=parser.parse_args();contract=json.loads(args.delivery.read_text(encoding='utf-8'))
    inputs=json.loads(args.inputs.read_text(encoding='utf-8')) if args.inputs else None
    result=run(ROOT,contract,args.output.resolve(),inputs,args.plan_only,args.verify_inputs)
    if args.report: args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result));return result

if __name__=='__main__': main()
