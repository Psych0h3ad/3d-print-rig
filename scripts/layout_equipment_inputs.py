"""Private equipment input hook shared by source preparation and release builds.

The ignored cache is checkout-local, outside site, and shared with the preview
regression. An offline map must explicitly name all ten exact prepared bodies;
it is never inferred from public files, model directories or a prior report.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import hashlib

CACHE_RELATIVE = Path('__pycache__') / 'layout-equipment-inputs' / 'cache'
PAYLOAD_NAME = 'layout-equipment-inputs-v1'
EQUIPMENT_PREFIX = Path('layout/assets/equipment/u1-exterior')
NODE_FLAGS = ['--max-old-space-size=192', '--max-semi-space-size=4', '--v8-pool-size=1']


def private_path(value, site):
    """Reject public destinations and links, including Windows junctions."""
    p = Path(value)
    if (not p.is_absolute() or '..' in p.parts
            or p.is_relative_to(site) or site.is_relative_to(p)):
        raise ValueError('Equipment input path must be absolute and outside site: ' + str(p))
    for parent in [*reversed(p.parents), p]:
        if parent.is_symlink() or getattr(parent, 'is_junction', lambda: False)():
            raise ValueError('Equipment input path traverses a link or junction: ' + str(p))
    return p


def no_duplicate_keys(pairs):
    value = {}
    for key, child in pairs:
        if key in value:
            raise ValueError('Duplicate equipment input map key: ' + key)
        value[key] = child
    return value


def load_exact_input_map(file):
    """An explicit map file, with no implicit directory lookup or URL support."""
    value = json.loads(Path(file).read_bytes(), object_pairs_hook=no_duplicate_keys)
    if not isinstance(value, dict) or set(value) != {'files'} or not isinstance(value['files'], dict):
        raise ValueError('Invalid exact equipment input map; expected {files: {path: absolute_file}}')
    return value


def run_node(root, arguments):
    # One bounded child at a time; neither fixtures nor builds spawn workers.
    env = dict(os.environ, UV_THREADPOOL_SIZE='1')
    try:
        return subprocess.run(['node', *NODE_FLAGS, *arguments], cwd=root, env=env,
                              check=True, capture_output=True, text=True, timeout=135)
    except subprocess.CalledProcessError as error:
        error.add_note(error.stderr.strip())
        raise


def checked_plan(root):
    # The existing preparer owns the registration allowlist, canonical host,
    # transport pins and aggregate budget. Import/plan perform no network I/O.
    code = ("import {layoutEquipmentInputPlan} from './scripts/prepare_layout_equipment_inputs.mjs';"
            "console.log(JSON.stringify(layoutEquipmentInputPlan()));")
    return json.loads(run_node(root, ['--input-type=module', '--eval', code]).stdout)


def verify_file(file, pin):
    if not file.is_file() or file.stat().st_size != pin['bytes']:
        raise ValueError('Missing or changed exact equipment body: ' + str(file))
    h = hashlib.sha256()
    with file.open('rb') as stream:
        remaining = pin['bytes']
        while remaining:
            block = stream.read(min(65536, remaining))
            if not block:
                raise ValueError('Truncated exact equipment body: ' + str(file))
            h.update(block)
            remaining -= len(block)
        if stream.read(1) or h.hexdigest() != pin['sha256']:
            raise ValueError('Changed exact equipment body: ' + str(file))


def import_exact_map(root, cache, plan, mapping):
    """Seed only a new complete cache; the original CLI then checks every pair."""
    pins = {pin['path']: pin for entry in plan['entries']
            for pin in [entry['pin'], entry['pin']['transfer']]}
    if (not isinstance(mapping, dict) or set(mapping) != {'files'}
            or not isinstance(mapping['files'], dict)):
        raise ValueError('Invalid exact equipment input map; expected {files: {path: absolute_file}}')
    files = mapping['files']
    missing, unused = sorted(set(pins) - set(files)), sorted(set(files) - set(pins))
    if missing or unused:
        raise ValueError('Exact equipment input map missing or unused paths: ' +
                         json.dumps({'missing': missing, 'unused': unused}))
    sources = {}
    # Validate the whole map even on a cache hit. A bad/unused supplied map is
    # never hidden by a previous cache or replaced by a live fetch.
    for name, pin in pins.items():
        if not isinstance(files[name], str) or not files[name]:
            raise ValueError('Invalid exact equipment body path: ' + name)
        sources[name] = private_path(files[name], root / 'site')
        verify_file(sources[name], pin)
    cache.mkdir(parents=True, exist_ok=True)
    lock = cache / '.layout-equipment-input-preparation.lock'
    lock.mkdir()  # Never remove another preparer's reservation.
    try:
        payload = cache / PAYLOAD_NAME
        if payload.exists():
            return  # CLI rejects incomplete, linked, extra or changed cache entries.
        with tempfile.TemporaryDirectory(prefix='.layout-equipment-map-', dir=cache) as folder:
            staging = Path(folder)
            for name, source in sources.items():
                dest = staging / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, dest)
                verify_file(dest, pins[name])
            # Publish the complete generation; TemporaryDirectory also handles
            # cleanup when its original staging path has already been renamed.
            staging.rename(payload)
    finally:
        lock.rmdir()


def prepare_equipment_inputs(root, *, exact_input_map=None):
    """Return private map/report/prepared_dir for audits, or None for legacy roots.

    Without a map the checked CLI may fetch only its fixed public host. With a
    map all ten bodies must be supplied, and the CLI must report a zero-request
    cache hit. Call before actual equipment audits; do not copy this cache into
    source/site or a public build. The returned files map contains four GLBs.
    """
    root = Path(root).absolute()
    registration = root / 'site/layout/layout-equipment.mjs'
    if not registration.exists():
        if exact_input_map is not None:
            raise ValueError('Unused exact equipment input map: no equipment registration')
        return None
    if not registration.is_file():
        raise ValueError('Equipment registration is not a regular file')
    cache = private_path(root / CACHE_RELATIVE, root / 'site')
    if exact_input_map is not None:
        import_exact_map(root, cache, checked_plan(root), exact_input_map)
    map_path = cache.parent / 'inputs.private.json'
    report_path = cache.parent / 'preparation.private.json'
    arguments = ['--cache-dir', str(cache), '--map', str(map_path),
                 '--report', str(report_path), '--timeout-ms', '120000']
    if exact_input_map is not None:
        # Fail closed even if the seeded cache disappears before CLI startup.
        # The checked CLI has no map/URL overrides; use its unchanged main API
        # with a transport that cannot issue an offline network request.
        code = ("globalThis.fetch=async()=>{throw new Error('Offline equipment transport forbidden');};"
                "const {main}=await import('./scripts/prepare_layout_equipment_inputs.mjs');"
                "await main(process.argv.slice(1));")
        run_node(root, ['--input-type=module', '--eval', code, '--', *arguments])
    else:
        run_node(root, ['scripts/prepare_layout_equipment_inputs.mjs', *arguments])
    report = json.loads(report_path.read_bytes())
    if not report.get('passed') or (exact_input_map is not None and
                                   (report.get('requests') != 0 or report.get('cache') != 'hit')):
        raise ValueError('Equipment preparation failed or offline run attempted transport')
    return {'passed': True, 'map_path': str(map_path), 'report_path': str(report_path),
            'prepared_dir': report['preparedDir'], 'payload_dir': report['payloadDir'],
            'files': json.loads(map_path.read_bytes())['files'], 'requests': report['requests'],
            'cached_body_count': report['cachedBodyCount'],
            'mode': 'exact-input-map' if exact_input_map is not None else 'cache-or-fetch',
            'scope': report['scope']}
