"""Build only the exact per-file approved static delivery. No archive input."""
import argparse
import contextlib
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import urllib.request
import urllib.parse
import urllib.error
import time

import layout_equipment_inputs

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAX_SITE_BYTES = 990_000_000
LAYOUT_EQUIPMENT_SOURCE = 'layout/layout-equipment.mjs'
LAYOUT_EQUIPMENT_AUDITS = ('audit_layout_equipment_geometry.mjs', 'audit_layout_equipment_assets.mjs')
U1_BOTTOM_AUDIT = 'scripts/audit_u1_bottom.mjs'
EQUIPMENT_AUDIT_DEPENDENCIES = {
    LAYOUT_EQUIPMENT_AUDITS[0]: (U1_BOTTOM_AUDIT,),
    LAYOUT_EQUIPMENT_AUDITS[1]: ('scripts/'+LAYOUT_EQUIPMENT_AUDITS[0], U1_BOTTOM_AUDIT),
}
U1_BOTTOM_SOURCES = ('layout/layout-equipment.mjs', 'layout/layout-equipment-mesh.mjs',
                     'layout/layout-machine-loader.mjs')
EQUIPMENT_PREFIX = 'layout/assets/equipment/u1-exterior/'
EQUIPMENT_MODELS = tuple(EQUIPMENT_PREFIX + name for name in (
    'U1_exterior_standalone_loaded.glb', 'U1_exterior_docked.glb',
    'PopStationMini_empty.glb', 'PopStationMini_loaded.glb'))
EQUIPMENT_PREVIEW = EQUIPMENT_PREFIX + 'U1_preview_geometry.json'
EQUIPMENT_BODIES = frozenset(name + suffix for name in (*EQUIPMENT_MODELS, EQUIPMENT_PREVIEW)
                             for suffix in ('', '.gz'))
# Required inputs of the v2 audit schemas. An omitted receipt must not turn an
# unchecked assembled module/metadata file into a successful audit.
EQUIPMENT_METADATA = tuple(EQUIPMENT_PREFIX + name for name in (
    'MOUNT_SPEC.json', 'POPSTATION_PUBLIC_MANUAL_RECEIPTS.json',
    'POPSTATION_PUBLIC_MOUNT_RECEIPTS.json', 'U1_BED_OUTLINE.json',
    'U1_exterior_notices.json', 'U1_preview_geometry_index.json',
    'U1_BED_SOURCE_RECEIPT.json', 'Snapmaker_OrcaSlicer_LICENSE.txt'))
EQUIPMENT_COMMON_SOURCES = (*EQUIPMENT_METADATA, LAYOUT_EQUIPMENT_SOURCE,
    'layout/layout-equipment-transfer.mjs', 'layout/layout-equipment-mesh.mjs',
    'layout/layout-renderer.mjs', 'viewer/vendor-r180/three.module.js',
    'viewer/vendor-r180/three.core.js')
EQUIPMENT_AUDIT_SOURCES = {
    LAYOUT_EQUIPMENT_AUDITS[0]: (*EQUIPMENT_COMMON_SOURCES, 'layout/layout-geometry.mjs'),
    LAYOUT_EQUIPMENT_AUDITS[1]: (*EQUIPMENT_COMMON_SOURCES, 'layout/layout-machine-loader.mjs',
                              'viewer/vendor-r180/GLTFLoader.js'),
}


@contextlib.contextmanager
def equipment_audit_affinity():
    """Children inherit at most two CPUs; restore this build process afterwards."""
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        api = ctypes.WinDLL('kernel32', use_last_error=True)
        api.GetCurrentProcess.restype = wintypes.HANDLE
        api.GetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_size_t),
                                               ctypes.POINTER(ctypes.c_size_t)]
        api.SetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.c_size_t]
        handle = api.GetCurrentProcess(); old = ctypes.c_size_t(); system = ctypes.c_size_t()
        if not api.GetProcessAffinityMask(handle, ctypes.byref(old), ctypes.byref(system)):
            raise OSError(ctypes.get_last_error(), 'Cannot read equipment audit CPU affinity')
        bits = [1 << i for i in range(old.value.bit_length()) if old.value & (1 << i)]
        if not api.SetProcessAffinityMask(handle, sum(bits[:2])):
            raise OSError(ctypes.get_last_error(), 'Cannot bound equipment audit CPU affinity')
        try:
            yield
        finally:
            if not api.SetProcessAffinityMask(handle, old.value):
                raise OSError(ctypes.get_last_error(), 'Cannot restore build CPU affinity')
    elif hasattr(os, 'sched_getaffinity'):
        old = os.sched_getaffinity(0)
        os.sched_setaffinity(0, set(sorted(old)[:2]))
        try:
            yield
        finally:
            os.sched_setaffinity(0, old)
    else:
        raise OSError('Equipment audit CPU affinity is unsupported on this platform')


def equipment_input_map(value):
    """The audit interface accepts four decoded models, never transport/JSON keys."""
    if (not isinstance(value, dict) or set(value) != {'files'}
            or not isinstance(value['files'], dict) or set(value['files']) != set(EQUIPMENT_MODELS)):
        raise ValueError('Equipment inputs must be an exact four-decoded-GLB files map')
    parents = set()
    for name, file in value['files'].items():
        if (not isinstance(file, str) or not pathlib.Path(file).is_absolute()
                or '..' in pathlib.Path(file).parts or pathlib.Path(file).name != pathlib.PurePosixPath(name).name):
            raise ValueError('Equipment cache paths must be absolute with canonical prepared basenames')
        parents.add(pathlib.Path(file).parent.resolve())
    if len(parents) != 1:
        raise ValueError('Equipment decoded GLBs must share one prepared directory')
    return value


def equipment_catalog_plan(root):
    """Read the checked production planner, independently of any audit report."""
    plan = layout_equipment_inputs.checked_plan(root)
    if not isinstance(plan, dict) or plan.get('fixtureOnly') is not False:
        raise ValueError('Equipment build requires the checked production catalog plan')
    entries = plan.get('entries')
    if not isinstance(entries, list) or len(entries) != 5:
        raise ValueError('Equipment catalog plan must contain four models and one preview')
    pins = {}; models = {}; preview = None
    for entry in entries:
        pin = entry['pin']; name = pin['path']; safe_path(name)
        if name in pins or name not in (*EQUIPMENT_MODELS, EQUIPMENT_PREVIEW):
            raise ValueError('Unexpected equipment catalog identity')
        transfer = pin['transfer']
        if (transfer.get('path') != name+'.gz' or transfer.get('encoding') != 'gzip'
                or transfer.get('baseURL') != 'https://psych0h3ad.github.io/3d-print-rig-extra-models/'):
            raise ValueError('Equipment catalog requires canonical exact gzip transfers')
        for body in (pin, transfer):
            if (type(body.get('bytes')) is not int or not 0 < body['bytes'] <= 16*1024*1024
                    or not isinstance(body.get('sha256'), str) or len(body['sha256']) != 64
                    or any(c not in '0123456789abcdef' for c in body['sha256'])):
                raise ValueError('Invalid checked equipment body pin')
            pins[body['path']] = {'bytes': body['bytes'], 'sha256': body['sha256']}
        if name == EQUIPMENT_PREVIEW and entry.get('kind') == 'preview':
            preview = pin
        elif name in EQUIPMENT_MODELS and entry.get('kind') == 'model':
            models[name] = pin
        else:
            raise ValueError('Equipment catalog body kind changed')
    if (set(pins) != EQUIPMENT_BODIES or set(models) != set(EQUIPMENT_MODELS) or preview is None
            or plan.get('totalBytes') != sum(p['bytes'] for p in pins.values())
            or plan['totalBytes'] > 64*1024*1024):
        raise ValueError('Incomplete or over-budget checked equipment catalog')
    return pins, models, preview


def equipment_private_inputs(root, output, mapping, prepared_dir, pins):
    equipment_input_map(mapping)
    files = {}
    for name, value in mapping['files'].items():
        files[name] = pathlib.Path(value)
        files[name+'.gz'] = pathlib.Path(value+'.gz')
    model_dir = pathlib.Path(next(iter(mapping['files'].values()))).parent
    prepared_dir = pathlib.Path(prepared_dir) if prepared_dir is not None else model_dir
    for name in (EQUIPMENT_PREVIEW, EQUIPMENT_PREVIEW+'.gz'):
        files[name] = prepared_dir/pathlib.PurePosixPath(name).name
    for name, file in files.items():
        # Includes links/junctions and both source and assembled public roots.
        layout_equipment_inputs.private_path(file, root/'site')
        layout_equipment_inputs.private_path(file, output)
        layout_equipment_inputs.verify_file(file, pins[name])
    return {name: dict(pin, file=str(files[name].resolve())) for name, pin in pins.items()}, prepared_dir.resolve()


def layout_equipment_scripts(root):
    scripts = [root/'scripts'/name for name in LAYOUT_EQUIPMENT_AUDITS]
    for script in scripts:
        if not script.is_file():
            raise ValueError('Required layout equipment audit missing: '+str(script))
    if not (root/U1_BOTTOM_AUDIT).is_file():
        raise ValueError('Required layout equipment audit helper missing: '+U1_BOTTOM_AUDIT)
    return scripts


def validate_u1_bottom_report(report, models, expected_bodies, source_hashes, dependency_hashes):
    """Require the nested actual placement/serialization job, not a passed stub."""
    if (not isinstance(report, dict) or report.get('schema') != 'u1-measured-lower-shell-closure-audit-v1'
            or report.get('passed') is not True):
        raise ValueError('Missing or failed nested U1 bottom audit')
    geometry = 'scripts/'+LAYOUT_EQUIPMENT_AUDITS[0]
    if (report.get('auditScriptSHA256') != dependency_hashes[U1_BOTTOM_AUDIT]
            or report.get('auditDependencies') != {geometry: dependency_hashes[geometry]}):
        raise ValueError('Nested U1 audit/helper dependency revision differs')
    if report.get('sourceInputs') != {name: source_hashes[name] for name in U1_BOTTOM_SOURCES}:
        raise ValueError('Nested U1 source inputs differ from assembled output')
    names = (*EQUIPMENT_MODELS[:2], EQUIPMENT_PREVIEW)
    required = {name+suffix: expected_bodies[name+suffix] for name in names for suffix in ('', '.gz')}
    if report.get('auditInputFiles') != required:
        raise ValueError('Nested U1 actual bodies differ from registered exact inputs')
    if report.get('sourcePreviewGeometries') != 22 or report.get('sourcePreviewReceipts') != 66:
        raise ValueError('Nested U1 prepared source receipts missing')
    loads, previews = report.get('loads'), report.get('preview')
    variants = ['standalone', 'docked', 'standalone']
    if (not isinstance(loads, list) or not isinstance(previews, list) or len(loads) != 3 or len(previews) != 3
            or [row.get('variant') for row in loads] != variants
            or [row.get('variant') for row in previews] != variants):
        raise ValueError('Nested U1 requires standalone/docked/standalone evidence')
    for i, load in enumerate(loads):
        model = models[EQUIPMENT_MODELS[1 if i == 1 else 0]]
        actual_model = load.get('model', {})
        identity = ('path', 'bytes', 'sha256', 'transfer')
        closure = load.get('closure', {})
        if ({key: actual_model.get(key) for key in identity} != {key: model[key] for key in identity}
                or [actual_model.get(key) for key in ('unit', 'up', 'front')] != ['m', '+Y', '+Z']
                or load.get('serializedClosurePreserved') is not True
                or load.get('transformedPlacements') != 5
                or closure.get('onlyMeasuredLowerRimPlanes') is not True
                or closure.get('independentBoundaryAndAreaWitnesses') is not True
                or previews[i].get('onlyMeasuredLowerRimPlanes') is not True
                or previews[i].get('independentBoundaryAndAreaWitnesses') is not True):
            raise ValueError('Nested U1 source/closure/placement/serialization evidence incomplete')
    if (not isinstance(loads[0].get('sourceResetHash'), str) or len(loads[0]['sourceResetHash']) != 64
            or loads[0]['sourceResetHash'] != loads[2].get('sourceResetHash')):
        raise ValueError('Nested U1 A-B-A source reset evidence differs')


def audit_layout_equipment(root, output, scripts, equipment_inputs, prepared_dir=None):
    """Gate the assembled four-equipment delivery; no fixture or raw fallback."""
    node = shutil.which('node')
    if not node:
        raise ValueError('Node is required for actual layout equipment audits')
    pins, models, preview = equipment_catalog_plan(root)
    expected_bodies, prepared_dir = equipment_private_inputs(root, output, equipment_inputs, prepared_dir, pins)
    script_hashes = {script.name: digest(script) for script in scripts}
    source_hashes = {script.name: {name: digest(output/name) for name in EQUIPMENT_AUDIT_SOURCES[script.name]}
                     for script in scripts}
    dependency_hashes = {name: digest(root/name) for names in EQUIPMENT_AUDIT_DEPENDENCIES.values() for name in names}
    dependencies = {script.name: {name: dependency_hashes[name] for name in EQUIPMENT_AUDIT_DEPENDENCIES[script.name]}
                    for script in scripts}
    # Keep complete diagnostics outside the served output, including on failure.
    private = pathlib.Path(tempfile.mkdtemp(prefix='layout-equipment-audits-', dir=output.parent))
    input_path = private/'equipment-inputs.json'
    input_path.write_text(json.dumps(equipment_inputs, indent=2)+'\n', encoding='utf-8')
    input_hash = digest(input_path)
    env = dict(os.environ, UV_THREADPOOL_SIZE='1')
    audited = []; identities = None; bodies = None
    for script in scripts:  # Deliberately sequential, at most one Node audit.
        for name, pin in dependency_hashes.items():
            if digest(root/name) != pin: raise ValueError('Audit dependency changed before inspection')
        report_path = private/(script.stem+'.json')
        stdout_path = private/(script.stem+'.stdout.log')
        stderr_path = private/(script.stem+'.stderr.log')
        command = [node, '--max-old-space-size=384', '--max-semi-space-size=4', '--v8-pool-size=1',
                   str(script.resolve()), '--site', str(output.resolve()), '--report', str(report_path.resolve()),
                   '--equipment-inputs', str(input_path.resolve()), '--prepared-dir', str(prepared_dir)]
        try:
            with equipment_audit_affinity(), stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
                completed = subprocess.run(command, cwd=root, env=env, stdin=subprocess.DEVNULL,
                                           stdout=stdout, stderr=stderr, shell=False, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ValueError('Layout equipment audit could not complete: '+script.name+
                             '; private diagnostics: '+str(private)) from error
        if completed.returncode != 0:
            raise ValueError('Layout equipment audit failed: '+script.name+
                             '; private diagnostics: '+str(private))
        try:
            report = json.loads(report_path.read_text(encoding='utf-8'))
            if digest(input_path) != input_hash:
                raise ValueError('Private audit input map changed during inspection')
            if report.get('passed') is not True:
                raise ValueError('Actual equipment audit did not pass')
            if script.name == 'audit_layout_equipment_geometry.mjs':
                if (report.get('schema') != 'layout-equipment-geometry-audit-v2'
                        or report.get('status') != 'PASS'): raise ValueError('Geometry audit did not pass')
                assets = report['assets']
                if not isinstance(assets, list): raise ValueError('Missing geometry receipts')
                receipts = {row['path']: row for row in assets}
                if len(assets) != 4: raise ValueError('Geometry audit must cover four actual models')
            else:
                if (report.get('schema') != 'layout-equipment-actual-asset-audit-v2'
                        or report.get('passed') is not True):
                    raise ValueError('Production-loader audit did not pass')
                receipts = report['assets']
                if not isinstance(receipts, dict): raise ValueError('Missing production-loader receipts')
            if set(receipts) != set(models): raise ValueError('Audit must cover the four registered actual models')
            if report.get('transportMode') != 'registered-exact-body':
                raise ValueError('Audit must verify registered transport bodies, without raw substitution')
            current = {}
            for name, row in receipts.items():
                if ({'bytes': row['bytes'], 'sha256': row['sha256']} != pins[name]
                        or row.get('transfer') != models[name]['transfer']):
                    raise ValueError('Model/encoded receipt differs from checked catalog')
                current[name] = {'bytes': row['bytes'], 'sha256': row['sha256']}
            if report.get('sourceInputs') != source_hashes[script.name]:
                raise ValueError('Audit source inputs differ from required assembled output')
            if (report['auditScriptSHA256'] != script_hashes[script.name]
                    or digest(script) != script_hashes[script.name]):
                raise ValueError('Audit script revision differs from its report')
            if report.get('auditDependencies') != dependencies[script.name]:
                raise ValueError('Audit dependency revisions differ from required current scripts')
            for name, pin in dependency_hashes.items():
                if digest(root/name) != pin: raise ValueError('Audit dependency changed during inspection')
            if script.name == LAYOUT_EQUIPMENT_AUDITS[1]:
                validate_u1_bottom_report(report.get('u1Bottom'), models, expected_bodies,
                                         source_hashes[script.name], dependency_hashes)
            for name, pin in source_hashes[script.name].items():
                if digest(output/name) != pin: raise ValueError('Assembled source changed during inspection')
            if (report['preview']['model'] != preview or report['preview']['body'] != pins[EQUIPMENT_PREVIEW]
                    or report['preview']['gzip'] != pins[EQUIPMENT_PREVIEW+'.gz']):
                raise ValueError('Preview/encoded receipt differs from checked catalog')
            if identities is not None and current != identities:
                raise ValueError('Geometry and production-loader decoded identities disagree')
            identities = current
            # Both audits must read the same actual bodies. Explicit cache paths
            # are verified privately and never copied into the served output.
            actual = report['auditInputFiles']
            if not isinstance(actual, dict) or set(actual) != set(expected_bodies):
                raise ValueError('Missing or unexpected actual audit bodies')
            for name, ref in expected_bodies.items():
                body = actual[name]
                if (type(body['bytes']) is not int or body['bytes'] != ref['bytes'] or body['sha256'] != ref['sha256']
                        or not isinstance(body['file'], str) or not pathlib.Path(body['file']).is_absolute()
                        or pathlib.Path(body['file']).resolve() != pathlib.Path(ref['file'])):
                    raise ValueError('Actual audit body differs from registered identity or exact input mapping')
            fresh_bodies, _ = equipment_private_inputs(root, output, equipment_inputs, prepared_dir, pins)
            if fresh_bodies != expected_bodies:
                raise ValueError('Exact equipment input mapping changed during inspection')
            if bodies is not None and actual != bodies:
                raise ValueError('Geometry and production-loader transport inputs disagree')
            bodies = actual
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise ValueError('Invalid layout equipment audit evidence: '+script.name+
                             '; private diagnostics: '+str(private)) from error
        audited.append({'script': script.name, 'passed': True, 'report': str(report_path),
                        'report_sha256': digest(report_path), 'script_sha256': digest(script),
                        'stdout': str(stdout_path), 'stderr': str(stderr_path)})
    # A later child must not invalidate the earlier child's inspected revision.
    for name, pin in script_hashes.items():
        if digest(root/'scripts'/name) != pin: raise ValueError('Equipment audit script changed during inspection')
    for name, pin in dependency_hashes.items():
        if digest(root/name) != pin: raise ValueError('Audit dependency changed during inspection')
    for hashes in source_hashes.values():
        for name, pin in hashes.items():
            if digest(output/name) != pin: raise ValueError('Assembled audit source changed during inspection')
    return {'required': True, 'status': 'passed', 'passed': True, 'actual_models': 4,
            'decoded_assets': identities, 'audit_input_files': bodies, 'audits': audited,
            'input_map': str(input_path), 'input_map_sha256': input_hash, 'prepared_dir': str(prepared_dir),
            'scope': 'Four layout equipment models registered in this assembled output; exact local/cache bodies, geometry and production-loader '
                     'audits. Browser review, native-solid clearance and other machines are separate.'}


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

def run(root, contract, output, inputs=None, plan_only=False, verify_inputs=False, equipment_inputs=None,
        equipment_prepared_dir=None):
    rows = validate_contract(contract); sources = source_files(root)
    equipment_scripts = layout_equipment_scripts(root) if LAYOUT_EQUIPMENT_SOURCE in sources else None
    if equipment_inputs is not None:
        if not equipment_scripts:
            raise ValueError('Equipment inputs require an inventoried equipment registration')
        equipment_input_map(equipment_inputs)
    if equipment_prepared_dir is not None:
        if equipment_inputs is None or not pathlib.Path(equipment_prepared_dir).is_absolute():
            raise ValueError('Equipment prepared directory requires an explicit model map and absolute path')
    if equipment_scripts and EQUIPMENT_BODIES.intersection({r['path'] for r in rows} | set(sources)):
        raise ValueError('Private equipment cache bodies must not be copied into the approved site')
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
    equipment_audits = None
    if equipment_scripts:
        if plan_only:
            equipment_audits = {'required': True, 'status': 'not-run-plan-only', 'passed': False,
                                'audits': [], 'scope': 'Actual assembled layout equipment not audited in plan-only mode.'}
        else:
            if equipment_inputs is None:
                prepared = layout_equipment_inputs.prepare_equipment_inputs(root)
                if (not isinstance(prepared, dict) or prepared.get('passed') is not True
                        or prepared.get('cached_body_count') != 10):
                    raise ValueError('Equipment preparation did not produce all ten authenticated bodies')
                equipment_inputs = equipment_input_map(layout_equipment_inputs.load_exact_input_map(prepared['map_path']))
                if equipment_inputs['files'] != prepared.get('files'):
                    raise ValueError('Equipment preparation map differs from producer output')
                equipment_prepared_dir = prepared['prepared_dir']
                if pathlib.Path(equipment_prepared_dir).resolve() != pathlib.Path(next(iter(equipment_inputs['files'].values()))).parent.resolve():
                    raise ValueError('Equipment preparation directory differs from its decoded model map')
            equipment_audits = audit_layout_equipment(root, output, equipment_scripts, equipment_inputs,
                                                      equipment_prepared_dir)
    if not plan_only: (output/'.nojekyll').touch()
    result = {'schema':'approved-static-build-check-v1','planned_site_bytes':size,'site_limit_bytes':MAX_SITE_BYTES,
            'runtime_files':len(rows),'source_files':len(sources),'verified_exact_bodies':len(verified),
            'plan_only':plan_only,'release_failures':failures,'deployment_ready':not failures and not plan_only,
            'legacy_archive_opened':False,'raw_model_substitution':False}
    if equipment_audits is not None: result['layout_equipment_audits'] = equipment_audits
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=pathlib.Path,required=True)
    parser.add_argument('--delivery',type=pathlib.Path,default=ROOT/'site/APPROVED_DELIVERY.json')
    parser.add_argument('--inputs',type=pathlib.Path);parser.add_argument('--plan-only',action='store_true');parser.add_argument('--verify-inputs',action='store_true');parser.add_argument('--report',type=pathlib.Path)
    parser.add_argument('--equipment-inputs',type=pathlib.Path,help='Exactly four decoded GLBs mapped to absolute private cache paths; audit only, never shipped')
    parser.add_argument('--equipment-prepared-dir',type=pathlib.Path,help='Optional absolute private preview JSON/gzip directory with --equipment-inputs; defaults to the common GLB directory')
    args=parser.parse_args();contract=json.loads(args.delivery.read_text(encoding='utf-8'))
    inputs=json.loads(args.inputs.read_text(encoding='utf-8')) if args.inputs else None
    equipment_inputs=layout_equipment_inputs.load_exact_input_map(args.equipment_inputs) if args.equipment_inputs else None
    result=run(ROOT,contract,args.output.resolve(),inputs,args.plan_only,args.verify_inputs,equipment_inputs,args.equipment_prepared_dir)
    if args.report: args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result));return result

if __name__=='__main__': main()
