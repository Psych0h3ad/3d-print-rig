"""Fail closed when existing normal pages lose required catalogs or model leaves."""
import argparse
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import unquote, urlsplit

CATALOGS = ['ASSEMBLY_CONFIGURATIONS.json', 'TOOLHEAD_CONFIGURATIONS.json',
            'GANTRY_CONFIGURATIONS.json', 'COMPONENT_LIBRARY.json', 'MACHINE_MODS.json',
            'TOOLCHANGER_BANK.json', 'MACHINE_HEAD_REGISTRATIONS.json',
            'TOOLCHANGER_CONFIGURATIONS.json', 'V24_PROBES.json']

def read_delivery(site):
    file = site / 'viewer/model-delivery.mjs'
    if not file.is_file(): return {'files': {}}
    text = file.read_text(encoding='utf-8')
    prefix = 'export const externalModelDelivery = '
    if not text.startswith(prefix) or not text.endswith(';\n'):
        raise ValueError('Unexpected model delivery source format')
    data = json.loads(text[len(prefix):-2])
    if data.get('schema') != 'pinned-model-delivery-v1' or not re.fullmatch('[0-9a-f]{40}', data.get('commit', '')):
        raise ValueError('Invalid immutable model delivery')
    return data

def checked_external(name, row, delivery, mapping=None):
    prefix = 'https://raw.githubusercontent.com/Psych0h3ad/3d-print-rig-large-voron-models/' + delivery['commit'] + '/'
    if (row.get('url') != prefix + name + '.gz'
            or any(not re.fullmatch('[0-9a-f]{64}', row.get(key, '')) for key in ['sha256', 'decoded_sha256'])
            or any(type(row.get(key)) is not int or not 0 < row[key] < 180_000_000 for key in ['bytes', 'decoded_bytes'])):
        raise ValueError('Unpinned external model: ' + name)
    if mapping is not None:
        file = Path(mapping['files'].get(name + '.gz', ''))
        if not file.is_absolute() or not file.is_file(): raise ValueError('Missing exact external input: ' + name)
        raw = file.read_bytes()
    else:
        request = urllib.request.Request(row['url'], headers={'Accept-Encoding': 'identity', 'User-Agent': '3D-Print-Rig-Delivery-Check'})
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.url != row['url'] or response.status != 200: raise ValueError('External model origin changed')
            raw = response.read(row['bytes'] + 1)
    if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
        raise ValueError('External model stored bytes changed: ' + name)
    decoded = gzip.decompress(raw)
    if len(decoded) != row['decoded_bytes'] or hashlib.sha256(decoded).hexdigest() != row['decoded_sha256']:
        raise ValueError('External model decoded bytes changed: ' + name)

def verify(site, mapping=None):
    site = Path(site)
    required = {}
    required_models = set()
    class PageReferences(HTMLParser):
        def handle_starttag(self, tag, attributes):
            for key, value in attributes:
                if key not in {'href', 'src'} or not value: continue
                url = urlsplit(value)
                if url.scheme or url.netloc or not url.path.endswith('.json'): continue
                target = (site / unquote(url.path).lstrip('/') if url.path.startswith('/')
                          else self.page.parent / unquote(url.path)).resolve()
                if target.is_relative_to(site.resolve()):
                    required.setdefault(target.relative_to(site.resolve()).as_posix(), []).append(
                        self.page.relative_to(site).as_posix())
    for page in site.rglob('*.html'):
        references = PageReferences()
        references.page = page
        references.feed(page.read_text(encoding='utf-8'))
    for file in (site / 'viewer').rglob('*'):
        if file.suffix not in {'.js', '.mjs'} or file.name.startswith('messages-'): continue
        source = file.read_text(encoding='utf-8')
        for match in re.finditer(r'''fetch\(\s*(?:new URL\(\s*)?['"]\.\./([^'"?]+\.json)(?:\?[^'"\n]*)?['"]''', source):
            required.setdefault(match[1], []).append(file.relative_to(site).as_posix())
        required_models.update(re.findall(r'''loadModel\([^,]+,\s*['"]\.\./([^'"?]+\.glb)['"]''', source))
    for consumer, name in [('lighting.js', 'DISCO_MOD.json'), ('monolith-machine.js', 'MONOLITH_BELT_ROUTES.json')]:
        if (site / 'viewer' / consumer).is_file(): required.setdefault(name, []).append('viewer/' + consumer)
    if (site / 'viewer/lighting.js').is_file(): required_models.add('Disco_on_a_Stick_XXL_350.glb')
    failures = [{'path': name, 'consumers': consumers, 'kind': 'missing required catalog'}
                for name, consumers in required.items() if not (site / name).is_file()]
    delivery = read_delivery(site)
    seen = set()
    external = set()
    for relative in sorted(required_models):
        seen.add(relative)
        if (site/relative).is_file() or (site/(relative+'.gz')).is_file(): continue
        if relative in delivery['files']:
            checked_external(relative, delivery['files'][relative], delivery, mapping)
            external.add(relative)
        else: failures.append({'kind':'missing required default model','path':relative})
    for name in CATALOGS:
        file = site / name
        if not file.is_file(): continue
        obj = json.loads(file.read_bytes())
        for field in ['assets', 'base_assets']:
            for identifier, asset in obj.get(field, {}).items():
                if not isinstance(asset, dict) or asset.get('external') or asset.get('base_url'): continue
                for kind in ['meta', 'glb']:
                    relative = asset.get(kind)
                    if relative is None: continue
                    if not isinstance(relative, str) or '..' in Path(relative).parts or any(c in relative for c in ':\\'):
                        raise ValueError('Unsafe registered model path')
                    if relative in seen: continue
                    seen.add(relative)
                    if (site / relative).is_file() or kind == 'glb' and (site / (relative + '.gz')).is_file(): continue
                    if kind == 'glb' and relative in delivery['files']:
                        checked_external(relative, delivery['files'][relative], delivery, mapping)
                        external.add(relative)
                    else:
                        failures.append({'catalog': name, 'id': identifier, 'kind': 'missing registered ' + kind, 'path': relative})
    if set(delivery['files']) != external:
        failures.append({'kind': 'Unconsumed or shadowed external model mapping', 'paths': sorted(set(delivery['files']) - external)})
    if failures: raise ValueError('Required page delivery incomplete: ' + json.dumps(failures))
    return {'passed': True, 'required_root_catalogs': len(required), 'registered_local_leaves': len(seen),
            'exact_external_models_verified': len(external),
            'scope': 'Required HTTP inputs, exact exported bytes and registered path closure; not native fit or browser rendering.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--inputs', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = verify(args.site, json.loads(args.inputs.read_bytes()) if args.inputs else None)
    if args.report: args.report.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__': main()
