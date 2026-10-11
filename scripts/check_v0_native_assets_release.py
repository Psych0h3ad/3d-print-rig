"""Run the mandatory V0 native installation audit from current site catalogs.

Fetches only exact registered public HTTPS artifacts, or accepts an explicit
public-asset cache map/fully pinned input receipt. One Node audit runs at a time;
no CAD reconstruction or source-solid clearance certification is performed.
"""
import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
AUDITOR = ROOT / 'scripts/audit_v0_native_installation_assets.mjs'
DEFAULT_SITE_URL = 'https://psych0h3ad.github.io/3d-print-rig/'
INPUT_SCHEMA = '3d-print-rig-v0-native-assets-inputs-v1'
MAP_SCHEMA = '3d-print-rig-v0-public-asset-map-v1'
ALLOWED_HOSTS = {'psych0h3ad.github.io'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(file):
    return json.loads(file.read_bytes())


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def checked_descriptor(record):
    if not isinstance(record, dict):
        raise ValueError('Missing public artifact descriptor')
    path = record.get('path')
    if (not isinstance(path, str) or not path or PurePosixPath(path).is_absolute()
            or any(v in ('', '.', '..') for v in path.split('/'))
            or any(v in path for v in '\\:#?%')):
        raise ValueError('Unsafe public artifact path')
    def checksum(value):
        return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)
    if not checksum(record.get('sha256')):
        raise ValueError('Invalid public artifact SHA')
    if type(record.get('bytes')) is not int or not 0 < record['bytes'] <= 180_000_000:
        raise ValueError('Invalid public artifact size')
    if record.get('encoding') not in (None, 'gzip'):
        raise ValueError('Unknown public artifact encoding')
    encoding = record.get('encoding') or ('gzip' if path.endswith('.gz') else None)
    if encoding:
        if not checksum(record.get('decoded_sha256')):
            raise ValueError('Missing decoded public SHA')
        if type(record.get('decoded_bytes')) is not int or not 0 < record['decoded_bytes'] <= 240_000_000:
            raise ValueError('Invalid decoded public size')
    elif 'decoded_sha256' in record or 'decoded_bytes' in record:
        raise ValueError('Unexpected decoded public pins')
    return encoding


def checked_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port not in (None, 443)):
        raise ValueError('URL is not an approved exact public artifact origin')
    return url


def check_file(file, descriptor):
    encoding = checked_descriptor(descriptor)
    if file.stat().st_size != descriptor['bytes']:
        raise ValueError('Stored public artifact size mismatch')
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != descriptor['sha256']:
        raise ValueError('Stored public artifact SHA mismatch')
    if encoding:
        digest = hashlib.sha256()
        size = 0
        with gzip.open(file, 'rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                size += len(block)
                if size > descriptor['decoded_bytes']:
                    raise ValueError('Decoded public artifact exceeded registered size')
                digest.update(block)
        if size != descriptor['decoded_bytes'] or digest.hexdigest() != descriptor['decoded_sha256']:
            raise ValueError('Decoded public artifact SHA/size mismatch')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Registered public artifact unexpectedly redirected')


def fetch_artifact(cache, expected):
    descriptor = expected['descriptor']
    checked_descriptor(descriptor)
    url = checked_url(expected['source_url'])
    file = cache / (descriptor['sha256'] + '.asset')
    if file.is_file():
        # A stale cache is a failure, not an implicit replacement/fallback.
        check_file(file, descriptor)
        return file.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={
        'User-Agent': '3D-Print-Rig-V0-Native-Release-Check', 'Accept-Encoding': 'identity'})
    temporary = cache / (descriptor['sha256'] + '.download')
    try:
        with opener.open(request, timeout=45) as response, temporary.open('wb') as stream:
            if response.geturl() != url or response.status != 200:
                raise ValueError('Public artifact response differs from registered URL')
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise ValueError('Unexpected HTTP artifact encoding')
            size = 0
            while True:
                block = response.read(min(1024 * 1024, descriptor['bytes'] + 1 - size))
                if not block:
                    break
                size += len(block)
                if size > descriptor['bytes']:
                    raise ValueError('Public artifact exceeded registered size')
                stream.write(block)
        check_file(temporary, descriptor)
        temporary.replace(file)
    finally:
        if temporary.exists():
            temporary.unlink()
    return file.resolve()


def checked_inputs(value, contract):
    if (value.get('schema') != INPUT_SCHEMA or value.get('machine_id') != contract['machine_id']
            or value.get('option_id') != contract['option_id'] or value.get('catalogs') != contract['catalogs']):
        raise ValueError('Stale input/catalog receipts')
    if set(value.get('assets', {})) != set(contract['assets']):
        raise ValueError('Missing or unregistered cached asset')
    for role, expected in contract['assets'].items():
        row = value['assets'][role]
        if row.get('descriptor') != expected['descriptor'] or row.get('source_url') != expected['source_url']:
            raise ValueError('Stale public source descriptor: ' + role)
        file = Path(row.get('file', ''))
        if not file.is_absolute():
            raise ValueError('Explicit absolute public cache file required')
        checked_url(row['source_url'])
        check_file(file, row['descriptor'])
    return value


def self_test():
    data = b'public source fixture\n'
    encoded = gzip.compress(data, mtime=0)
    descriptor = {'path': 'public/fixture.glb.gz', 'encoding': 'gzip', 'bytes': len(encoded),
                  'sha256': sha(encoded), 'decoded_bytes': len(data), 'decoded_sha256': sha(data)}
    negatives = 0
    with tempfile.TemporaryDirectory(prefix='v0-release-fixture-') as directory:
        file = Path(directory) / 'public.asset'
        file.write_bytes(encoded)
        check_file(file, descriptor)
        for mutation in [{'encoding': 'zip'}, {'path': '../private'}, {'path': '/private'},
                         {'bytes': 0}, {'sha256': 'x' * 64}, {'decoded_bytes': 0},
                         {'decoded_sha256': '0' * 64}]:
            try:
                check_file(file, {**descriptor, **mutation})
            except (ValueError, OSError):
                negatives += 1
            else:
                raise AssertionError('Invalid pinned artifact accepted')
        for url in ['http://psych0h3ad.github.io/file', 'https://example.test/file',
                    'https://user:secret@psych0h3ad.github.io/file', 'https://psych0h3ad.github.io/file?q=1']:
            try:
                checked_url(url)
            except ValueError:
                negatives += 1
            else:
                raise AssertionError('Unregistered artifact URL accepted')
        checked_url(DEFAULT_SITE_URL)
        contract = {'machine_id': 'fixture-machine', 'option_id': 'fixture-option',
                    'catalogs': {'public.json': {'bytes': len(data), 'sha256': sha(data)}},
                    'assets': {'fixture': {'descriptor': descriptor,
                                          'source_url': DEFAULT_SITE_URL + descriptor['path']}}}
        receipt = {'schema': INPUT_SCHEMA, 'machine_id': contract['machine_id'],
                   'option_id': contract['option_id'], 'catalogs': contract['catalogs'],
                   'assets': {'fixture': {**contract['assets']['fixture'], 'file': str(file)}}}
        checked_inputs(receipt, contract)
        for change in ['catalog', 'option', 'asset', 'url', 'descriptor', 'relative']:
            value = json.loads(json.dumps(receipt))
            if change == 'catalog': value['catalogs'] = {}
            if change == 'option': value['option_id'] = 'stale'
            if change == 'asset': value['assets'] = {}
            if change == 'url': value['assets']['fixture']['source_url'] += '.stale'
            if change == 'descriptor': value['assets']['fixture']['descriptor']['sha256'] = '0' * 64
            if change == 'relative': value['assets']['fixture']['file'] = 'relative'
            try:
                checked_inputs(value, contract)
            except (ValueError, OSError):
                negatives += 1
            else:
                raise AssertionError('Stale/ambiguous receipt accepted')
        # The decoded checksum remains mandatory even if stored gzip is valid.
        file.write_bytes(encoded + b'x')
        try:
            check_file(file, descriptor)
        except ValueError:
            negatives += 1
        else:
            raise AssertionError('Changed cache accepted')
    print(json.dumps({'passed': True, 'negative_cases': negatives,
                      'scope': 'Portable download/cache/encoding fixtures; no actual models loaded'}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, help='Current built or production site, required except self-test')
    parser.add_argument('--site-url', default=DEFAULT_SITE_URL)
    parser.add_argument('--cache', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--node', default='node')
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--inputs', type=Path, help='Exact pinned input receipt; no network/fallback')
    source.add_argument('--asset-map', type=Path, help='Explicit public cache paths, verified against current catalog')
    parser.add_argument('--prepare-only', action='store_true', help='Verify/fetch receipts only, do not parse assemblies')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.site or not args.output:
        parser.error('--site and --output are required')
    site, output = args.site.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    checked_url(args.site_url)
    contract_file = output / 'current-public-contract.json'
    subprocess.run([args.node, '--experimental-vm-modules', str(AUDITOR), '--site', str(site), '--site-url', args.site_url,
                    '--emit-contract', str(contract_file)], check=True)
    contract = read_json(contract_file)
    original_catalogs = contract['catalogs']
    if args.inputs:
        inputs = checked_inputs(read_json(args.inputs), contract)
    else:
        mapping = None
        if args.asset_map:
            mapping = read_json(args.asset_map)
            if mapping.get('schema') != MAP_SCHEMA or set(mapping.get('assets', {})) != set(contract['assets']):
                raise ValueError('Public cache map must include every exact registered artifact')
        inputs = {'schema': INPUT_SCHEMA, 'machine_id': contract['machine_id'],
                  'option_id': contract['option_id'], 'catalogs': original_catalogs, 'assets': {}}
        cache = (args.cache or output / 'public-cache').resolve()
        for role, expected in contract['assets'].items():
            if mapping:
                file = Path(mapping['assets'][role])
                if not file.is_absolute():
                    raise ValueError('Explicit absolute public cache path required: ' + role)
                file = file.resolve()
                checked_url(expected['source_url'])
                check_file(file, expected['descriptor'])
            else:
                file = fetch_artifact(cache, expected)
            inputs['assets'][role] = {**expected, 'file': str(file)}
    for name, pin in original_catalogs.items():
        data = (site / name).read_bytes()
        if len(data) != pin['bytes'] or sha(data) != pin['sha256']:
            raise ValueError('Catalog changed while preparing actual asset job')
    receipt = output / 'actual-inputs.json'
    write_json(receipt, inputs)
    if args.prepare_only:
        print('V0 public receipts ready; actual exported-model audit has not run.')
        return
    subprocess.run([args.node, '--experimental-vm-modules', str(AUDITOR), '--site', str(site), '--site-url', args.site_url,
                    '--inputs', str(receipt), '--report', str(output / 'actual-v0-native-installation.json')], check=True)
    report = read_json(output / 'actual-v0-native-installation.json')
    if not report.get('passed') or not report.get('source_endcheck') or not report.get('artifact_endcheck'):
        raise ValueError('V0 actual native installation job incomplete')
    print('V0 actual installation release check passed; sampled geometry only, physical use remains gated.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, AssertionError, OSError, subprocess.CalledProcessError) as error:
        print('V0 native release check failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
