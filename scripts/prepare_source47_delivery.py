"""Preserve the exact original source47 JSON and its saved-state identities."""
from pathlib import Path
import gzip
import hashlib
import json
import re

MODULE_PATH = 'viewer/source47/source47-data.mjs'
ORIGINALS = {
    'input': ('ROUTE350_CAPTURE_BINDINGS_V2', 54606, '7d12e0537458abe969e8c97f461189fbe27f928030d2ca54a45b7aabd8757e81'),
    'reference': ('FULL350_SOURCE_REFERENCE', 50952, '5be74e659c3d88f619fdbb83e50797e6aaaa35a8dd8cab79dd43c853bbcee5d1'),
    'serviceInput': ('SOURCE_SERVICE_ROUTE_BINDINGS', 23155, '37cd0f66c83c104561d37897a34e2d1df92fd64b79502b5fe3dac6a33404042e'),
}
SOURCE_PATHS = frozenset('viewer/source47/data/' + row[0] + '.json' for row in ORIGINALS.values())


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate source47 data field')
        value[key] = item
    return value


def delivery_pins(site):
    code = (Path(site) / MODULE_PATH).read_text(encoding='utf-8-sig')
    declarations = re.findall(r'^const packedDelivery=(\{[^\n]*\});$', code, re.M)
    if len(declarations) != 1:
        raise ValueError('Exactly one source47 packed declaration required')
    packed = json.loads(declarations[0], object_pairs_hook=_unique)
    if set(packed) != set(ORIGINALS):
        raise ValueError('Missing or unknown source47 table')
    result = {}
    for key, expected in ORIGINALS.items():
        row = packed[key]
        if (not isinstance(row, list) or len(row) != 5 or tuple(row[:3]) != expected
                or type(row[1]) is not int or type(row[3]) is not int
                or not 0 < row[3] < 65536 or not isinstance(row[4], str)
                or re.fullmatch('[a-f0-9]{64}', row[4]) is None):
            raise ValueError('Changed original source47 byte identity: ' + key)
        prefix = 'viewer/source47/data/' + expected[0]
        result[key] = {'sourcePath': prefix + '.json', 'bytes': row[1], 'sha256': row[2],
                       'gzip': {'path': prefix + '.json.gz', 'bytes': row[3], 'sha256': row[4]}}
    return result


def build_source47_delivery(site):
    site = Path(site)
    bodies = []
    decoded = {}
    for key, pin in delivery_pins(site).items():
        raw = (site / pin['sourcePath']).read_bytes()
        if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
            raise ValueError('Changed exact original source47 bytes: ' + key)
        decoded[key] = json.loads(raw, object_pairs_hook=_unique)
        body = bytearray(gzip.compress(raw, compresslevel=9, mtime=0))
        body[9] = 255  # Same deterministic header convention as current manual data.
        body = bytes(body)
        if (len(body) != pin['gzip']['bytes'] or hashlib.sha256(body).hexdigest() != pin['gzip']['sha256']
                or gzip.decompress(body) != raw):
            raise ValueError('Source47 compressor differs from exact encoded pin')
        bodies.append((body, {'path': pin['gzip']['path'], 'bytes': len(body),
                             'sha256': pin['gzip']['sha256'], 'source_path': pin['sourcePath'],
                             'decoded_bytes': len(raw), 'decoded_sha256': pin['sha256']}))
    if decoded['reference']['binding']['v14_bindings_sha256'] != ORIGINALS['input'][2]:
        raise ValueError('Source47 original saved binding changed')
    return bodies


def write_source47_delivery(site, output, bodies):
    if bodies != build_source47_delivery(site):
        raise ValueError('Changed prepared source47 delivery')
    output = Path(output)
    targets = [output / receipt['path'] for _, receipt in bodies]
    if any((output / name).exists() for name in SOURCE_PATHS) or any(p.exists() for p in targets):
        raise ValueError('Source47 build-only or generated-body collision')
    for target, (body, _) in zip(targets, bodies):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
