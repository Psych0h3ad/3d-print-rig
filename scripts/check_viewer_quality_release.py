"""Gate current public viewer exports before the normal Pages artifact.

Only catalog/delivery-pinned web models and JSON metadata are read. Optional
--inputs accepts an explicit binding list, {"bindings": [...]}, or the normal
delivery {"files": {logical_path: absolute_cache_file}} map. Cache hints never
replace current descriptors. Reports/bindings stay outside the served site.
"""
import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit

from fetch_pinned_source import fetch_pinned_source

ROOT = Path(__file__).resolve().parents[1]
HOSTS = {'psych0h3ad.github.io', 'github.com', 'objects.githubusercontent.com',
         'release-assets.githubusercontent.com', 'raw.githubusercontent.com'}
SITE_URL = 'https://psych0h3ad.github.io/3d-print-rig/'
COLORS = ('crossant_235_v06_leadscrew', 'vzbot_330_printed')
SOURCE_PRINTED_KEYS = {
    COLORS[0]: {'crossant_01030', 'crossant_01040', 'crossant_01042', 'crossant_01043', 'crossant_01044'},
    COLORS[1]: {'00229', '00230', '00231', '00232', '00233', '00234', '00235', '00236', '00250', '00253'},
}
HALF = 'voron_trident_350_half_z'
ROUTES = ('mercury_one1_235', 'mercury_one1_370', 'lh_stinger_200')
CATALOGS = ('CROSSANT_ASSETS.json', 'COMMUNITY_MACHINES_ASSETS.json', 'CUSTOM_VORON_ASSETS.json')
AUDITS = ('audit_source_printed_colors.mjs', 'audit_trident_half_ptfe.mjs',
          'audit_flexible_family_routes.mjs')
MAX_STORED = 180_000_000
MAX_DECODED = 240_000_000
GATE_SECONDS = 900
JOB_SECONDS = 240


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read(file):
    return json.loads(file.read_bytes())


def write(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def checksum(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def relative(value):
    if (not isinstance(value, str) or not value or PurePosixPath(value).is_absolute()
            or any(p in ('', '.', '..') for p in value.split('/'))
            or any(c in value for c in '\\:#?%')):
        raise ValueError('Unsafe public artifact path')
    return value


def descriptor(pin):
    if not isinstance(pin, dict):
        raise ValueError('Missing exact public descriptor')
    name = relative(pin.get('path'))
    if not name.endswith(('.json', '.glb', '.glb.gz', '.gltf', '.bin')):
        raise ValueError('Only public web models and JSON metadata are allowed')
    if (not checksum(pin.get('sha256')) or type(pin.get('bytes')) is not int
            or not 0 < pin['bytes'] <= MAX_STORED):
        raise ValueError('Invalid public checksum/size')
    if pin.get('encoding') not in (None, 'identity', 'gzip'):
        raise ValueError('Unsupported public encoding')
    compressed = pin.get('encoding') == 'gzip' or name.endswith('.gz')
    if compressed and pin.get('encoding') == 'identity':
        raise ValueError('Contradictory public encoding')
    if ('decoded_sha256' in pin) != ('decoded_bytes' in pin):
        raise ValueError('Incomplete decoded descriptor')
    if 'decoded_sha256' in pin:
        if (not checksum(pin['decoded_sha256']) or type(pin['decoded_bytes']) is not int
                or not 0 < pin['decoded_bytes'] <= MAX_DECODED):
            raise ValueError('Invalid decoded checksum/size')
        if not compressed and (pin['decoded_sha256'] != pin['sha256'] or pin['decoded_bytes'] != pin['bytes']):
            raise ValueError('Contradictory identity pins')
    return compressed


def public_url(value):
    u = urlsplit(value)
    if (u.scheme != 'https' or u.hostname not in HOSTS or u.username or u.password
            or u.query or u.fragment or u.port not in (None, 443)):
        raise ValueError('Unexpected exact public artifact origin')
    if not unquote(u.path).lower().endswith(('.json', '.glb', '.glb.gz', '.gltf', '.bin')):
        raise ValueError('Only exact public web model/metadata URLs are allowed')
    return value


def verify(file, pin):
    compressed = descriptor(pin)
    if not file.is_file() or file.stat().st_size != pin['bytes'] or digest(file) != pin['sha256']:
        raise ValueError('Missing or changed public cache body: ' + pin['path'])
    if not compressed:
        return pin['sha256']
    h, count = hashlib.sha256(), 0
    with gzip.open(file, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            count += len(block)
            if count > pin.get('decoded_bytes', MAX_DECODED):
                raise ValueError('Decoded public body exceeded its limit')
            h.update(block)
    if not count or count > MAX_DECODED:
        raise ValueError('Invalid decoded public body size')
    result = h.hexdigest()
    if 'decoded_sha256' in pin and (result != pin['decoded_sha256'] or count != pin['decoded_bytes']):
        raise ValueError('Decoded public checksum/size mismatch')
    return result


def unique(rows, key, label):
    if not isinstance(rows, list) or any(not isinstance(r, dict) or not r.get(key) for r in rows):
        raise ValueError('Missing ' + label)
    result = {r[key]: r for r in rows}
    if len(result) != len(rows):
        raise ValueError('Duplicate ' + label)
    return result


class Assets:
    def __init__(self, site, output, inputs, deadline):
        self.site, self.output, self.deadline = site, output, deadline
        self.hints = read(inputs) if inputs else None
        self.inputs = inputs
        self.inputs_hash = digest(inputs) if inputs else None
        self.rows, self.verified = {}, {}

    def remaining(self):
        left = int(self.deadline - time.monotonic())
        if left <= 0:
            raise TimeoutError('Viewer quality release gate exceeded its 15-minute budget')
        return left

    def hint(self, catalog, pin, directory):
        value = self.hints
        if value is None:
            return None
        rows = value if isinstance(value, list) else value.get('bindings') if isinstance(value, dict) else None
        if rows is not None:
            if not isinstance(rows, list):
                raise ValueError('Invalid public binding map')
            candidates = [r for r in rows if r.get('catalog') == catalog and r.get('path') == pin['path']]
            if not candidates:
                return None
            exact = [r for r in candidates if r.get('sha256') == pin['sha256'] and r.get('bytes', pin['bytes']) == pin['bytes']]
            if not exact:
                raise ValueError('Cache map differs from current catalog: ' + pin['path'])
            file = Path(exact[0].get('actual_path', ''))
        elif isinstance(value, dict) and isinstance(value.get('files'), dict):
            keys = ([directory + '/' + pin['path']] if directory else []) + [pin['path']]
            found = next((value['files'][k] for k in keys if k in value['files']), None)
            if found is None:
                return None
            if not isinstance(found, str):
                raise ValueError('Explicit cache filename required')
            file = Path(found)
        else:
            raise ValueError('Unsupported explicit public cache map')
        if not file.is_absolute():
            raise ValueError('Explicit absolute cache filename required')
        return file

    def acquire(self, catalog, pin, base=None, directory=None):
        self.remaining()
        compressed = descriptor(pin)
        if directory:
            relative(directory)
        url = public_url(pin.get('url') or urljoin(base or SITE_URL, pin['path']))
        key = (catalog, pin['path'])
        if key in self.rows:
            if self.rows[key]['sha256'] != pin['sha256']:
                raise ValueError('Conflicting current public descriptor')
            return self.rows[key]
        source = self.hint(catalog, pin, directory)
        if source is None:
            local = self.site / (directory or '') / pin['path']
            if local.is_file():
                source = local
        name = PurePosixPath(pin['path']).name
        if compressed and not name.endswith('.gz'):
            name += '.gz'
        cached = self.output / 'public-cache' / pin['sha256'] / name
        if source is None and cached.exists():
            source = cached
        if source is None:
            cached.parent.mkdir(parents=True, exist_ok=True)
            fetch_pinned_source(dict(pin, url=url), cached, allowed_hosts=HOSTS,
                                timeout=max(1, min(45, self.remaining() // 3)),
                                user_agent='3D-Print-Rig-Viewer-Quality-Release')
            source = cached
        decoded = verify(source, pin)
        # Audit GLTF buffer keys and gzip parsing depend on canonical basenames.
        if source.name != name:
            cached.parent.mkdir(parents=True, exist_ok=True)
            if not cached.exists():
                shutil.copyfile(source, cached)
            verify(cached, pin)
            source = cached
        row = dict(pin, catalog=catalog, local_directory=directory, actual_path=str(source.resolve()),
                   decoded_sha256=decoded, url=url)
        self.rows[key] = row
        self.verified[str(source.resolve())] = pin
        self.remaining()
        return row

    def stable(self):
        for file, pin in self.verified.items():
            if Path(file).stat().st_size != pin['bytes'] or digest(Path(file)) != pin['sha256']:
                raise ValueError('Actual public input changed during audit: ' + pin['path'])
        if self.inputs and digest(self.inputs) != self.inputs_hash:
            raise ValueError('Explicit cache map changed during audit')


def input_pin(row):
    return {'path': row['actual_path'], 'sha256': row['sha256']}


def source_snapshot():
    """Current checkout import closure, including both supported three loaders."""
    pending = [ROOT / 'scripts' / n for n in AUDITS] + [Path(__file__), ROOT / 'scripts/build_site.py',
        ROOT / 'scripts/three-test-loader.mjs', ROOT / 'scripts/source-assembly-test-loader.mjs',
        ROOT / 'site/viewer/vendor/three.module.js', ROOT / 'site/viewer/vendor-r180/three.module.js',
        ROOT / 'scripts/fixtures/trident-half-z-ptfe.json', ROOT / 'site/COMMUNITY_MACHINES_ASSETS.json']
    result = {}
    pattern = re.compile(r'''\b(?:from\s*|import\s*\(\s*|import\s*)(['"])(\.[^'"]+)\1''')
    while pending:
        file = pending.pop().resolve()
        if not file.is_relative_to(ROOT.resolve()):
            raise ValueError('Audit import escaped the current checkout')
        key = file.relative_to(ROOT).as_posix()
        if key in result:
            continue
        result[key] = digest(file)
        if file.suffix in ('.mjs', '.js'):
            for match in pattern.finditer(file.read_text(encoding='utf-8')):
                pending.append(file.parent / match[2].split('?', 1)[0].split('#', 1)[0])
    return result


def prepare(site, output, assets):
    delivery = read(site / 'APPROVED_DELIVERY.json')
    files = unique(delivery.get('files'), 'path', 'delivery file')
    ids = delivery.get('machine_ids', [])
    if not isinstance(ids, list) or len(set(ids)) != len(ids) or not set((*COLORS, HALF, *ROUTES)) <= set(ids):
        raise ValueError('Missing or duplicate current release machine IDs')
    catalogs, receipts = {}, [{'path': str(site / 'APPROVED_DELIVERY.json'), 'sha256': digest(site / 'APPROVED_DELIVERY.json')}]
    for name in CATALOGS:
        # Provider indexes are copied source-inventory inputs, not necessarily
        # individual delivery.files entries. Their artifact descriptors remain
        # exact public stored/decoded pins in either delivery format.
        if name in files:
            verify(site / name, files[name])
        source = ROOT / 'site' / name
        if not source.is_file() or (site / name).read_bytes() != source.read_bytes():
            raise ValueError('Current checkout/assembled catalog differs: ' + name)
        catalogs[name] = read(site / name)
        receipts.append({'path': str(site / name), 'sha256': digest(site / name)})
    community, crossant, custom = (catalogs[n] for n in ('COMMUNITY_MACHINES_ASSETS.json', 'CROSSANT_ASSETS.json', 'CUSTOM_VORON_ASSETS.json'))
    custom_rows = unique(custom.get('machines'), 'id', 'custom VORON machine')
    source_community = read(ROOT / 'site/COMMUNITY_MACHINES_ASSETS.json')
    for mid in (*ROUTES, 'vzbot_330_printed'):
        spec = community.get('machines', {}).get(mid)
        if not spec or spec.get('machine_id') != mid or source_community.get('machines', {}).get(mid) != spec:
            raise ValueError('Current checkout/assembled community source differs: ' + mid)
    if crossant.get('machine_id') != COLORS[0] or HALF not in custom_rows:
        raise ValueError('Missing required Crossant/half-height source registration')

    def machine(mid, kind, catalog, spec, container):
        if mid not in ids:
            raise ValueError('Unregistered selected machine: ' + mid)
        if not spec or spec.get('id', spec.get('machine_id')) != mid:
            raise ValueError('Catalog machine identity differs: ' + mid)
        chosen = {}
        names = ['assembly_manifest.json', 'machine_profile.json', 'model.gltf' if kind == 'crossant' else 'model.glb']
        if kind == 'crossant':
            names += [f'geometry_{i:02}.bin' for i in range(7)] + ['belt_bindings.json']
        for name in names:
            pin = spec.get('files', {}).get(name)
            if not pin or not PurePosixPath(pin.get('path', '')).name == ('model.glb.gz' if name == 'model.glb' and pin.get('path', '').endswith('.gz') else name):
                raise ValueError('Missing/wrong logical public artifact: ' + mid + '/' + name)
            chosen[name] = assets.acquire(catalog, pin, spec.get('base_url', container.get('base_url')), spec.get('local_directory', container.get('local_directory')))
            owner = {'machine': mid, 'name': name}
            owners = chosen[name].setdefault('logical_owners', [])
            if owner not in owners:
                owners.append(owner)
        manifest = read(Path(chosen['assembly_manifest.json']['actual_path']))
        profile = read(Path(chosen['machine_profile.json']['actual_path']))
        parts = unique(manifest.get('parts'), 'key', 'actual source leaf')
        if (manifest.get('machine_id') != mid or profile.get('machine_id') != mid
                or (spec.get('parts') is not None and len(parts) != spec['parts'])):
            raise ValueError('Actual source metadata/census differs: ' + mid)
        result = {'id': mid, 'kind': kind, 'manifest': input_pin(chosen[names[0]]), 'profile': input_pin(chosen[names[1]]),
                  'model': dict(input_pin(chosen[names[2]]), decoded_sha256=chosen[names[2]]['decoded_sha256'])}
        if kind == 'crossant':
            gltf = read(Path(chosen['model.gltf']['actual_path']))
            expected = [f'geometry_{i:02}.bin' for i in range(7)]
            if ([b.get('uri') for b in gltf.get('buffers', [])] != expected or gltf.get('images')
                    or any(b.get('byteLength') != chosen[n]['bytes'] for b, n in zip(gltf['buffers'], expected))):
                raise ValueError('Crossant public buffer logical names/lengths changed')
            result.update(buffers=[input_pin(chosen[n]) for n in expected], belt_bindings=input_pin(chosen['belt_bindings.json']))
        return result

    color = [machine(COLORS[0], 'crossant', 'CROSSANT_ASSETS.json', crossant, crossant),
             machine(COLORS[1], 'community', 'COMMUNITY_MACHINES_ASSETS.json', community['machines'][COLORS[1]], community)]
    # Reuse the original 17-model role audit coverage, derived from delivered
    # registrations rather than any local historical audit plan.
    stock = [(f'voron_trident_{s}', 'trident') for s in (250, 300, 350)]
    stock += [(f'voron_v24_{s}_{v}', 'v24') for s in (250, 300, 350) for v in ('printed', 'ldo_cnc')]
    stock += [(m, 'micron') for m in ('micron_r1_120', 'micron_plus_r1_180')]
    for mid, kind in stock:
        spec = {'id': mid, 'files': {}}
        for name in ('assembly_manifest.json', 'machine_profile.json', 'model.glb'):
            logical = f'machines/{mid}/' + ('model.glb.gz' if name == 'model.glb' else name)
            if logical not in files:
                raise ValueError('Missing delivered selected stock artifact: ' + logical)
            spec['files'][name] = files[logical]
        color.append(machine(mid, kind, 'APPROVED_DELIVERY.json', spec, {}))
    if len(custom_rows) != 6:
        raise ValueError('Changed custom VORON registrations require color gate review')
    for mid, spec in custom_rows.items():
        if spec.get('family') not in ('trident', 'v24'):
            raise ValueError('Unreviewed custom VORON family')
        color.append(machine(mid, 'trident_custom' if spec['family'] == 'trident' else 'v24', 'CUSTOM_VORON_ASSETS.json', spec, custom))
    for mid in ROUTES:
        machine(mid, 'community', 'COMMUNITY_MACHINES_ASSETS.json', community['machines'][mid], community)
    if len(color) != 19 or len({a['id'] for a in color}) != 19:
        raise ValueError('Incomplete actual color model coverage')
    plan = {'catalogs': receipts, 'assets': color}
    bindings = list(assets.rows.values())
    write(output / 'color-plan.json', plan)
    write(output / 'bindings.json', bindings)
    return plan, bindings, receipts


def validate_report(kind, report, plan, bindings, machine=None):
    if report.get('passed') is not True:
        raise ValueError('Actual viewer quality audit did not pass: ' + kind)
    if kind == 'colors':
        rows = unique(report.get('results'), 'id', 'actual color result')
        if set(rows) != {a['id'] for a in plan['assets']}:
            raise ValueError('Missing/unregistered actual color result')
        for mid, row in rows.items():
            if row.get('passed') is not True or row.get('classification_misses') or row.get('material_slots', 0) <= 0 or row.get('attached_color_checks', 0) <= 0:
                raise ValueError('Incomplete actual color evidence: ' + mid)
            if mid in COLORS:
                expected_keys = SOURCE_PRINTED_KEYS[mid]
                checks = row.get('reviewed_printed_palette_checks', [])
                if (row.get('independently_expected_printed_leaves') != len(expected_keys)
                        or {c.get('key') for c in checks} != expected_keys
                        or any(sum(c.get('key') == key for c in checks) < 7 for key in expected_keys)):
                    raise ValueError('Missing source-bound printed leaf/palette evidence')
                for check in checks:
                    if not check.get('slots') or any(s['expected_color'] != s['actual_color'] for s in check['slots']):
                        raise ValueError('Actual printed material slot failed')
        handles = report.get('source_handle_materials', {})
        if (report.get('source_printed_leaf_count') != 15 or handles.get('passed') is not True
                or set(handles.get('printed_keys', [])) != {'00250', '00253'}
                or set(handles.get('purchased_keys', [])) != {'00251', '00252'}
                or handles.get('negative_assertions', 0) < 4 or handles.get('attached_material_checks', 0) <= 0
                or handles.get('purchased_PBR_preserved') is not True or handles.get('exact_source_color_reset') is not True):
            raise ValueError('Missing actual purchased-bolt negative assertions for the 15-leaf color gate')
    elif kind == 'half-z':
        if (not report.get('rows') or report.get('triangle_tests', 0) <= 0 or report.get('findings')
                or report.get('inputs_stable_during_audit') is not True
                or report.get('continuous_native_clearance_certified') is not False
                or report.get('physical_fit_certified') is not False):
            raise ValueError('Incomplete half-height actual surface/route evidence')
    else:
        if (report.get('machine') != machine or not report.get('poses') or not report.get('actual_mesh_snapshots')
                or report.get('adaptive_actual_mesh_poses', 0) <= 0 or report.get('triangle_tests', 0) <= 0
                or report.get('findings') or report.get('body_contacts') or report.get('native_solid_clearance_verified') is not False):
            raise ValueError('Incomplete flexible-family actual surface/route evidence: ' + str(machine))
    if kind != 'colors':
        catalog = 'CUSTOM_VORON_ASSETS.json' if kind == 'half-z' else 'COMMUNITY_MACHINES_ASSETS.json'
        mid = HALF if kind == 'half-z' else machine
        source = next(a for a in plan['assets'] if a['id'] == mid) if kind == 'half-z' else None
        expected = {n: source[r]['sha256'] for n, r in [('assembly_manifest.json', 'manifest'), ('machine_profile.json', 'profile'), ('model.glb', 'model')]} if source else {}
        if not source:
            for name in ('assembly_manifest.json', 'machine_profile.json', 'model.glb'):
                matched = [b for b in bindings if b['catalog'] == catalog and {'machine': mid, 'name': name} in b.get('logical_owners', [])]
                if len(matched) != 1:
                    raise ValueError('Missing/ambiguous current logical route binding')
                expected[name] = matched[0]['sha256']
        if any(report.get('inputs', {}).get(n, {}).get('sha256') != h for n, h in expected.items()):
            raise ValueError('Actual report refers to another public source input')


def run(site, output, inputs=None):
    site, output = Path(site).resolve(), Path(output).resolve()
    if output.is_relative_to(site):
        raise ValueError('Detailed quality maps/reports must stay outside the served site')
    output.mkdir(parents=True, exist_ok=True)
    summary = {'schema': 'viewer-quality-release-v1', 'passed': False, 'jobs': [],
               'scope': 'Pinned actual material slots and sampled exported route/triangle checks; no browser or continuous native-solid fit claim.',
               'optional_monolith_combinations': 'Not included here: the separate head-composition gate requires its full current registration/module input plan.'}
    start = time.monotonic()
    try:
        before = source_snapshot()
        assets = Assets(site, output, Path(inputs).resolve() if inputs else None, start + GATE_SECONDS)
        plan, bindings, receipts = prepare(site, output, assets)
        summary.update(source_sha256=before, catalogs=receipts, color_model_ids=[a['id'] for a in plan['assets']],
                       required_route_ids=[HALF, *ROUTES], inputs_sha256=assets.inputs_hash)
        node = shutil.which('node')
        if not node:
            raise ValueError('Node runtime is required for actual viewer quality audits')
        jobs = [('colors', AUDITS[0], None, 384), ('half-z', AUDITS[1], None, 384)]
        jobs += [('flex-' + mid, AUDITS[2], mid, 512) for mid in ROUTES]
        for name, script, mid, heap in jobs:
            report_path = output / (name + '.json')
            # Never accept a successful prior report if a child fails to write.
            if report_path.exists():
                report_path.unlink()
            loader = 'source-assembly-test-loader.mjs' if mid else 'three-test-loader.mjs'
            command = [node, f'--max-old-space-size={heap}', '--v8-pool-size=1', '--expose-gc',
                       '--loader', './scripts/' + loader, str(ROOT / 'scripts' / script)]
            if name == 'colors':
                command += [str(output / 'color-plan.json'), str(report_path)]
            elif name == 'half-z':
                command += ['--site', str(site), '--pins', str(output / 'bindings.json'), '--report', str(report_path)]
            else:
                command += ['--site', str(site), '--bindings', str(output / 'bindings.json'), '--machine', mid, '--report', str(report_path)]
            print('Viewer quality actual audit: ' + name, flush=True)
            row = {'name': name, 'command': command, 'passed': False}
            summary['jobs'].append(row)
            started = time.monotonic()
            try:
                with (output / (name + '.stdout.txt')).open('w', encoding='utf-8') as stdout, (output / (name + '.stderr.txt')).open('w', encoding='utf-8') as stderr:
                    subprocess.run(command, cwd=ROOT, check=True, timeout=min(JOB_SECONDS, assets.remaining()), stdout=stdout, stderr=stderr)
            except subprocess.SubprocessError:
                # build_site's temporary folder disappears on failure. Preserve
                # a bounded diagnostic in the normal CI console before cleanup.
                for suffix in ('stdout.txt', 'stderr.txt'):
                    tail = (output / (name + '.' + suffix)).read_text(encoding='utf-8', errors='replace')[-6000:]
                    if tail:
                        print(name + ' ' + suffix + ':\n' + tail, file=sys.stderr, flush=True)
                raise
            finally:
                row['seconds'] = round(time.monotonic() - started, 3)
            result = read(report_path)
            validate_report('flex' if mid else name, result, plan, bindings, mid)
            row.update(passed=True, seconds=round(time.monotonic() - started, 3), report_sha256=digest(report_path))
        assets.stable()
        if source_snapshot() != before or any(digest(Path(c['path'])) != c['sha256'] for c in receipts):
            raise ValueError('Current source/catalog changed during actual release gate')
        summary['passed'] = True
    except Exception as error:
        summary['error'] = str(error)
        raise
    finally:
        summary['seconds'] = round(time.monotonic() - start, 3)
        write(output / 'viewer-quality-release.json', summary)
    print('Viewer quality release passed: 15 source color leaves, 17 baseline color models, half-Z and all three changed family routes.', flush=True)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--inputs', type=Path, help='Optional explicit public asset cache map')
    args = parser.parse_args()
    run(args.site, args.output, args.inputs)


if __name__ == '__main__':
    main()
