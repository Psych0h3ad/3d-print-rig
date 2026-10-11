"""Audit the four production EVA fronts from checksum-pinned public artifacts."""
import argparse, gzip, hashlib, json, subprocess, urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin, urlsplit

ROOT=Path(__file__).resolve().parents[1]
SHA=lambda data:hashlib.sha256(data).hexdigest()
READ=lambda file:json.loads(file.read_bytes())
ALLOWED={'psych0h3ad.github.io'}

def checked_descriptor(record):
    path=record.get('path','')
    p=PurePosixPath(path)
    if not path or p.is_absolute() or '..' in p.parts or '\\' in path or ':' in path:
        raise ValueError('Invalid EVA release artifact path')
    if len(record.get('sha256',''))!=64 or any(c not in '0123456789abcdef' for c in record['sha256']):
        raise ValueError('Invalid EVA release artifact checksum')
    if not isinstance(record.get('bytes'),int) or not 0<record['bytes']<=180_000_000:
        raise ValueError('Invalid EVA release artifact size')
    if record.get('encoding') not in (None, 'gzip'):
        raise ValueError('Unsupported EVA release artifact encoding')
    if record.get('encoding')=='gzip':
        decoded_sha=record.get('decoded_sha256','')
        if len(decoded_sha)!=64 or any(c not in '0123456789abcdef' for c in decoded_sha):
            raise ValueError('Invalid decoded EVA release artifact checksum')
        if not isinstance(record.get('decoded_bytes'),int) or not 0<record['decoded_bytes']<=240_000_000:
            raise ValueError('Invalid decoded EVA release artifact size')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--cache',type=Path)
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    cache=(args.cache or out/'cache').resolve();cache.mkdir(parents=True,exist_ok=True)
    registry=READ(ROOT/'site/EVA_FRONT_SURFACES.json')
    heads=READ(ROOT/'site/HEAD_ADDITIONS.json')
    installations=READ(ROOT/'site/EVA_INSTALLATIONS.json')
    community=READ(ROOT/'site/COMMUNITY_MACHINES_ASSETS.json')
    def pinned_local(file):
        file=file.resolve();return {'path':str(file),'sha256':SHA(file.read_bytes())}
    def artifact(base,record):
        checked_descriptor(record)
        url=urljoin(base,record['path']);parsed=urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password:
            raise ValueError('Unexpected EVA release artifact origin')
        file=cache/(record['sha256']+'.asset')
        data=file.read_bytes() if file.is_file() else None
        if data is None or len(data)!=record['bytes'] or SHA(data)!=record['sha256']:
            request=urllib.request.Request(url,headers={'User-Agent':'3D-Print-Rig-EVA-Release-Check'})
            with urllib.request.urlopen(request,timeout=60) as response:
                data=response.read(record['bytes']+1)
            if len(data)!=record['bytes'] or SHA(data)!=record['sha256']:
                raise ValueError('EVA release artifact checksum mismatch')
            file.write_bytes(data)
        pin={'path':str(file),'sha256':record['sha256']}
        if record.get('encoding')=='gzip':
            decoded=gzip.decompress(data)
            if len(decoded)!=record['decoded_bytes'] or SHA(decoded)!=record['decoded_sha256']:
                raise ValueError('EVA decoded artifact checksum mismatch')
            pin.update(encoding='gzip',decoded_sha256=record['decoded_sha256'])
        return pin
    patch=registry['asset'];base=patch['external']['base_url']
    inputs={'schema':'3d-print-rig-eva-front-audit-inputs-v1',
        'registry':pinned_local(ROOT/'site/EVA_FRONT_SURFACES.json'),
        'adapter':pinned_local(ROOT/'site/viewer/eva-front-surfaces.mjs'),
        'patch':artifact(base,patch['files']['model.glb']),
        'patch_metadata':artifact(base,patch['files']['parts.json']),
        'heads':pinned_local(ROOT/'site/HEAD_ADDITIONS.json'),
        'community':pinned_local(ROOT/'site/COMMUNITY_MACHINES_ASSETS.json'),
        'installations':pinned_local(ROOT/'site/EVA_INSTALLATIONS.json'),'assets':[]}
    for owner,row in registry['owners'].items():
        installed=owner in installations['machines']
        installation=installations['machines'].get(owner)
        variant=next(v for v in heads['variants'] if (v['id']==installation['configuration'] if installed else v.get('base_asset')==owner))
        generation=variant['eva']['generation']
        if installed:
            spec=installation.get('asset') or community['machines'][owner]
            source=spec.get('base_url',community['base_url'])
            model=artifact(source,spec['files']['model.glb'])
            metadata=artifact(source,spec['files']['assembly_manifest.json'])
            profile=artifact(source,spec['files']['machine_profile.json'])
            keys=list(installation['head_keys'].values())
        else:
            spec=heads['assets'][owner];source=spec['external']['base_url']
            model=artifact(source,spec['files']['model.glb']);metadata=artifact(source,spec['files']['parts.json'])
            keys=[p['key'] for p in READ(Path(metadata['path']))['parts']]
        companions=variant['eva']['companions']
        fans=companions['hotend_fan']+companions['part_fan']
        if installed:fans=[installation['head_keys'][k] for k in fans]
        item={'owner':owner,'generation':generation,'kind':'installed' if installed else 'standalone',
              'source_origin_mm':row['source_origin_mm'],'model':model,'metadata':metadata,
              'head_keys':keys,'fan_keys':fans,'bindings':{json.dumps(t['source_path'],ensure_ascii=False,separators=(',',':')):t['part_key'] for t in row['targets']},
              'evidence':artifact(base,registry['witnesses'][str(generation)])}
        if installed:item['profile']=profile
        inputs['assets'].append(item)
    if len(inputs['assets'])!=4:raise ValueError('Missing EVA production owner')
    file=out/'inputs.json';file.write_text(json.dumps(inputs,indent=2)+'\n',encoding='utf8')
    subprocess.run(['node',str(ROOT/'scripts/audit_eva_front_surfaces.mjs'),'--inputs',str(file),
                    '--report',str(out/'actual-fronts.json')],cwd=ROOT,check=True)
    print('EVA release gate passed: both generations, standalone and installed actual fronts.')

if __name__=='__main__':main()
