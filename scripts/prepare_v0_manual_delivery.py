"""Generate exact gzip DATA bodies from tracked editable manual-reference JSON.

All source tables, full-phrase dictionaries and the stage catalog keep their
decoded byte identities. This module never opens CAD or changes site limits.
"""
from pathlib import Path
import gzip
import hashlib
import json
import re
import zlib

MODULE_PATH = 'viewer/v0-manual-data.mjs'
TABLE_NAMES = (
    'v0-fan-assembly', 'v0-enclosure-assembly', 'v0-panel-closure',
    'v0-panel-door', 'v0-tophat-assembly', 'v0-spool-assembly',
    'v0-assembly-stages', 'v0-fan-copy', 'v0-enclosure-copy',
    'v0-panel-closure-copy', 'v0-panel-door-copy', 'v0-tophat-copy',
    'v0-spool-copy',
)
SOURCE_PATHS = frozenset(
    'V0_ASSEMBLY_STAGES.json' if name == 'v0-assembly-stages'
    else 'viewer/data/' + name + '.source.json' for name in TABLE_NAMES)
PACKED_DELIVERY_RECIPE = "const delivery=Object.fromEntries(Object.entries(packedDelivery).map(([name,[bytes,sha256,encodedBytes,encodedSHA256]])=>[name,{sourcePath:name==='v0-assembly-stages'?'V0_ASSEMBLY_STAGES.json':'viewer/data/'+name+'.source.json',bytes,sha256,gzip:{path:'viewer/data/'+name+'.json.gz',bytes:encodedBytes,sha256:encodedSHA256}}]));"


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate manual data field')
        value[key] = item
    return value


def _invalid_number(value):
    raise ValueError('Non-finite manual data number: ' + value)


def delivery_pins(site_source):
    code = (Path(site_source) / MODULE_PATH).read_text(encoding='utf-8-sig')
    declarations = re.findall(r'^const packedDelivery=(\{[^\n]*\});$', code, re.M)
    if len(declarations) != 1 or code.splitlines().count(PACKED_DELIVERY_RECIPE) != 1:
        raise ValueError('One exact packed manual data declaration and path recipe required')
    packed = json.loads(declarations[0], object_pairs_hook=_unique,
                        parse_constant=_invalid_number)
    if set(packed) != set(TABLE_NAMES):
        raise ValueError('Incomplete or unknown manual data tables')
    pins = {}
    for name, row in packed.items():
        if not isinstance(row, list) or len(row) != 4:
            raise ValueError('Each packed manual pin requires exactly four fields')
        pins[name] = {
            'sourcePath': ('V0_ASSEMBLY_STAGES.json' if name == 'v0-assembly-stages'
                           else 'viewer/data/' + name + '.source.json'),
            'bytes': row[0], 'sha256': row[1],
            'gzip': {'path': 'viewer/data/' + name + '.json.gz',
                     'bytes': row[2], 'sha256': row[3]},
        }
    for name, pin in pins.items():
        source = ('V0_ASSEMBLY_STAGES.json' if name == 'v0-assembly-stages'
                  else 'viewer/data/' + name + '.source.json')
        encoded = 'viewer/data/' + name + '.json.gz'
        if (not isinstance(pin, dict) or set(pin) != {'sourcePath', 'bytes', 'sha256', 'gzip'}
                or pin['sourcePath'] != source or not isinstance(pin['gzip'], dict)
                or set(pin['gzip']) != {'path', 'bytes', 'sha256'}
                or pin['gzip']['path'] != encoded):
            raise ValueError('Changed exact manual data path or fields')
        for ref in (pin, pin['gzip']):
            if (type(ref['bytes']) is not int or not 0 < ref['bytes'] <= 2 * 1024 * 1024
                    or not isinstance(ref['sha256'], str)
                    or re.fullmatch('[a-f0-9]{64}', ref['sha256']) is None):
                raise ValueError('Invalid exact manual data identity')
    return pins


def build_v0_manual_delivery_bodies(site_source):
    site_source = Path(site_source)
    result = []
    for name, pin in delivery_pins(site_source).items():
        source = site_source / pin['sourcePath']
        if source.stat().st_size != pin['bytes']:
            raise ValueError('Changed manual source byte budget: ' + name)
        raw = source.read_bytes()
        if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
            raise ValueError('Changed exact manual source: ' + name)
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique,
                           parse_constant=_invalid_number)
        if not isinstance(value, dict):
            raise ValueError('Manual reference must be a JSON object')
        encoded = bytearray(gzip.compress(raw, compresslevel=9, mtime=0))
        encoded[9] = 255
        encoded = bytes(encoded)
        if (len(encoded) != pin['gzip']['bytes']
                or hashlib.sha256(encoded).hexdigest() != pin['gzip']['sha256']
                or gzip.decompress(encoded) != raw):
            raise ValueError('Manual compressor differs from the exact delivery pin')
        result.append((encoded, {
            'path': pin['gzip']['path'], 'bytes': len(encoded),
            'sha256': pin['gzip']['sha256'], 'source_path': pin['sourcePath'],
            'decoded_bytes': len(raw), 'decoded_sha256': pin['sha256'],
            'raw_source_delivered': False,
        }))
    return result


def write_v0_manual_delivery(site_source, output, bodies):
    expected = build_v0_manual_delivery_bodies(site_source)
    if bodies != expected:
        raise ValueError('Changed prepared manual data body or receipt')
    output = Path(output)
    if any((output / name).exists() for name in SOURCE_PATHS):
        raise ValueError('Raw build-only manual source was copied')
    targets = [output / receipt['path'] for _, receipt in bodies]
    if any(target.exists() for target in targets):
        raise ValueError('Generated manual data delivery collision')
    for target, (encoded, _) in zip(targets, bodies):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(encoded)


def read_built_v0_stages(site):
    """Read only the exact delivered gzip; no raw-source fallback in an audit."""
    site = Path(site)
    pin = delivery_pins(site)['v0-assembly-stages']
    source = site / pin['gzip']['path']
    if source.stat().st_size != pin['gzip']['bytes']:
        raise ValueError('Changed delivered manual stage byte budget')
    body = source.read_bytes()
    if len(body) != pin['gzip']['bytes'] or hashlib.sha256(body).hexdigest() != pin['gzip']['sha256']:
        raise ValueError('Changed delivered manual stage body')
    decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
    raw = decoder.decompress(body, pin['bytes'] + 1)
    if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise ValueError('Stage decompression exceeded its exact budget or stream')
    if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
        raise ValueError('Changed decoded manual stage source')
    json.loads(raw.decode('utf-8'), object_pairs_hook=_unique, parse_constant=_invalid_number)
    return raw, pin['gzip']
