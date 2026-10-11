"""Check all EVA native-host options from pinned public artifacts and production code."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'psych0h3ad.github.io'}
MAX_BYTES = 180_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_hash(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def checked_descriptor(record):
    name = record.get('path', '')
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
        raise ValueError('Invalid EVA option artifact path')
    if not valid_hash(record.get('sha256')) or type(record.get('bytes')) is not int or not 0 < record['bytes'] <= MAX_BYTES:
        raise ValueError('Invalid EVA option artifact size/checksum')
    if record.get('encoding') not in (None, 'identity', 'gzip'):
        raise ValueError('Unsupported EVA option artifact encoding')
    if record.get('encoding') == 'gzip':
        if not valid_hash(record.get('decoded_sha256')) or type(record.get('decoded_bytes')) is not int or not 0 < record['decoded_bytes'] <= MAX_BYTES:
            raise ValueError('Invalid decoded EVA option artifact size/checksum')
    elif record.get('decoded_sha256', record['sha256']) != record['sha256'] or record.get('decoded_bytes', record['bytes']) != record['bytes']:
        raise ValueError('Contradictory identity artifact descriptor')


def checked_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Unexpected public EVA artifact origin')
    return url


def identity_bridge_descriptors(metadata):
    """Require a pinned receipt for every declared rendering/source BRep alias."""
    parts = metadata.get('parts')
    if not isinstance(parts, list) or not parts or any(not isinstance(p, dict) or not isinstance(p.get('key'), str) or not p['key'] for p in parts) or \
       len({p['key'] for p in parts}) != len(parts):
        raise ValueError('Invalid EVA bridge source metadata')
    result = {}
    for part in parts:
        rendered, native = part.get('brep_sha256'), part.get('source_brep_sha256')
        bridge = part.get('source_brep_identity_bridge')
        if rendered and native and rendered != native and bridge is None:
            raise ValueError('Unproved EVA BRep serialization namespace mismatch')
        if bridge is None:
            continue
        if not isinstance(bridge, dict) or not valid_hash(rendered) or not valid_hash(native) or rendered == native:
            raise ValueError('Invalid EVA BRep identity bridge')
        if bridge.get('baseline_brep_sha256') != rendered or bridge.get('host_brep_sha256') != native or \
           not valid_hash(bridge.get('native_definition_brep_sha256')):
            raise ValueError('EVA BRep bridge differs from actual source metadata')
        if bridge.get('encoding') not in (None, 'identity'):
            raise ValueError('Unsupported EVA identity bridge encoding')
        url = checked_url(bridge.get('url', ''))
        if urlsplit(url).query:
            raise ValueError('Unstable EVA identity bridge URL')
        descriptor = {'path': urlsplit(url).path.rsplit('/', 1)[-1],
                      'bytes': bridge.get('bytes'), 'sha256': bridge.get('sha256')}
        checked_descriptor(descriptor)
        result[part['key']] = {'url': url, 'descriptor': descriptor}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path)
    parser.add_argument('--source-cache', type=Path, help='Explicit approved host-source directory; no fallback discovery')
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    cache = (args.cache or out / 'cache').resolve()
    cache.mkdir(parents=True, exist_ok=True)
    local = {}
    objects = {}
    for key, name in [('registry', 'EVA_OPTIONS.json'), ('heads', 'HEAD_ADDITIONS.json'),
                      ('community', 'COMMUNITY_MACHINES_ASSETS.json'), ('installations', 'EVA_INSTALLATIONS.json'),
                      ('front', 'EVA_FRONT_SURFACES.json')]:
        file = ROOT / 'site' / name
        raw = file.read_bytes()
        objects[key] = json.loads(raw)
        local[key] = {'path': str(file.resolve()), 'sha256': digest(raw), 'bytes': len(raw)}
    registry, heads = objects['registry'], objects['heads']
    community, installations, front = objects['community'], objects['installations'], objects['front']
    if registry.get('schema') != '3d-print-rig-eva-options-v1' or not registry.get('variants') or not registry.get('hosts'):
        raise ValueError('Missing EVA installed option registry')
    ids = [v['id'] for v in registry['variants']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate EVA installed option')
    specs = dict(community['machines'])
    for id, installation in installations['machines'].items():
        if installation.get('asset'):
            if id in specs:
                raise ValueError('Duplicate native EVA source-host asset')
            specs[id] = installation['asset']
    requests = {}

    def schedule(base, descriptor, seed=None):
        checked_descriptor(descriptor)
        url = checked_url(urljoin(base, descriptor['path']))
        record = {'url': url, 'descriptor': descriptor, 'path': str(cache / (descriptor['sha256'] + '.asset'))}
        old = requests.get(url)
        if old and old['descriptor'] != descriptor:
            raise ValueError('Conflicting descriptors for public EVA artifact')
        requests[url] = old or record
        if seed is not None:
            requests[url]['seed'] = seed
        return record

    hosts, assets, reviews = {}, {}, {}
    for id, host in registry['hosts'].items():
        spec = specs.get(id)
        if not spec or id not in installations['machines'] or spec.get('machine_id') != id:
            raise ValueError('Unregistered or missing native EVA source host')
        base = spec.get('base_url', community['base_url'])
        required = ['assembly_manifest.json', 'machine_profile.json', 'model.glb', *spec.get('additional_models', [])]
        if len(required) != len(set(required)) or not all(name in spec['files'] for name in required):
            raise ValueError('Incomplete native EVA model resources')
        hosts[id] = {}
        for name, descriptor in spec['files'].items():
            seed = args.source_cache / id / name if args.source_cache else None
            hosts[id][name] = schedule(base, descriptor, seed)
        if spec['files']['model.glb'].get('decoded_sha256', spec['files']['model.glb']['sha256']) != host['model_sha256'] or \
           spec['files']['assembly_manifest.json']['sha256'] != host['manifest_sha256'] or \
           spec['files']['machine_profile.json']['sha256'] != host['profile_sha256']:
            raise ValueError('EVA source-host pins differ from production registry')
        if set(host['configurations']) != {v['id'] for v in registry['variants'] if v['machine_id'] == id}:
            raise ValueError('Incomplete installed option coverage')
    for id, asset in registry['assets'].items():
        source_asset = heads['assets'].get(id)
        if asset != source_asset:
            raise ValueError('EVA option asset differs from pinned head catalog')
        assets[id] = {name: schedule(asset['external']['base_url'], descriptor) for name, descriptor in asset['files'].items()}
    for variant in registry['variants']:
        installation = variant['installation']
        review = installation.get('native_review')
        if not isinstance(review, dict) or review.get('sha256') != installation['native_review_sha256']:
            raise ValueError('Missing checksum-addressed native EVA option review')
        url = checked_url(review['url'])
        descriptor = {'path': urlsplit(url).path.rsplit('/', 1)[-1], 'bytes': review['bytes'], 'sha256': review['sha256']}
        seed = args.source_cache / variant['machine_id'] / 'native_review.json' if args.source_cache and \
            variant['id'] == registry['hosts'][variant['machine_id']]['default_configuration'] else None
        reviews[variant['id']] = schedule(urljoin(url, './'), descriptor, seed)
    patch = {name: schedule(front['asset']['external']['base_url'], descriptor) for name, descriptor in front['asset']['files'].items()}

    def acquire(record):
        descriptor = record['descriptor']
        file = Path(record['path'])
        raw = file.read_bytes() if file.is_file() else None
        seed = record.get('seed')
        if raw is None and seed is not None and seed.is_file():
            raw = seed.read_bytes()
        if raw is None or len(raw) != descriptor['bytes'] or digest(raw) != descriptor['sha256']:
            request = urllib.request.Request(record['url'], headers={'User-Agent': '3D-Print-Rig-EVA-Options-Release-Audit'})
            with urllib.request.urlopen(request, timeout=60) as response:
                checked_url(response.geturl())
                raw = response.read(descriptor['bytes'] + 1)
            if len(raw) != descriptor['bytes'] or digest(raw) != descriptor['sha256']:
                raise ValueError('Public EVA option artifact checksum mismatch')
        decoded = gzip.decompress(raw) if descriptor.get('encoding') == 'gzip' else raw
        if len(decoded) != descriptor.get('decoded_bytes', descriptor['bytes']) or digest(decoded) != descriptor.get('decoded_sha256', descriptor['sha256']):
            raise ValueError('Decoded public EVA option artifact checksum mismatch')
        file.write_bytes(raw)
        record.pop('seed', None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(acquire, requests.values()))
    # Bridge declarations live in the immutable checksum-pinned part manifest.
    # Discover them only after acquiring that manifest, then pin their receipts.
    bridges = {}
    for id, files in assets.items():
        record = files['parts.json']
        raw = Path(record['path']).read_bytes()
        metadata = json.loads(gzip.decompress(raw) if record['descriptor'].get('encoding') == 'gzip' else raw)
        if metadata.get('id') != registry['assets'][id]['component_id']:
            raise ValueError('EVA bridge metadata asset identity changed')
        bridges[id] = {}
        for key, bridge in identity_bridge_descriptors(metadata).items():
            bridges[id][key] = schedule(urljoin(bridge['url'], './'), bridge['descriptor'])
    bridge_requests = {row['url']: row for rows in bridges.values() for row in rows.values()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(acquire, bridge_requests.values()))
    for record in local.values():
        if digest(Path(record['path']).read_bytes()) != record['sha256']:
            raise ValueError('EVA catalog changed during input preparation; rerun')
    inputs = {'schema': '3d-print-rig-eva-options-audit-inputs-v1', **local,
              'hosts': hosts, 'assets': assets, 'native_reviews': reviews, 'identity_bridges': bridges, 'patch': patch}
    file = out / 'inputs.json'
    file.write_text(json.dumps(inputs, indent=2) + '\n', encoding='utf8')
    if args.prepare_only:
        print(f"Prepared {len(ids)} installed options, {len(hosts)} hosts and {len(requests)} pinned public files.")
        return
    subprocess.run(['node', str(ROOT / 'scripts/audit_eva_options.mjs'), '--inputs', str(file),
                    '--report', str(out / 'actual-options.json')], cwd=ROOT, check=True)
    print(f"EVA options release gate passed: all {len(ids)} installed configurations on {len(hosts)} source hosts.")


if __name__ == '__main__':
    main()
