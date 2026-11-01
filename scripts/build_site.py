"""Build the static viewer from its exact approved per-file delivery."""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from merge_component_library import merge_components
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
# Retain a 10 MB margin below the published GitHub Pages 1 GB limit.
MAX_SITE_BYTES = 990_000_000


# Deliver this original author index as the exact bytes pinned by Trinity.
# A stale CRLF checkout may be accepted only when it is byte-identical to the
# pinned Git blob after removing CRLF. No JSON reserialization or SHA waiver.
SIBOOR_AUTHOR_INDEX_SHA256 = '9b10bebcaa3b326532fdac5ecc435c6414cf3d0402967ebc99944130b8a8f3b0'

# Exact private bundle delta: only Trident300/350 leaf1188 geometry and its
# manifest rows. Historical witnesses keep their original bytes and scopes.
TRIDENT_DECK_BASELINE_BUNDLE = 'a79fe940bf766ba2323dc96defc4e1970e2722a8cc3ace381d66929449a1dee8'
TRIDENT_DECK_REPAIRED_BUNDLE = '8bdbf3d8573dbcfd15ba5fd24d8d796562e266ebb8d2003e9754377856e8affa'
TRIDENT_DECK_REPAIRED_BUNDLE_BYTES = 851019084
TRIDENT_DECK_REPAIR_PROOF_SHA256 = '1043f2cc82a369e5c81ea0017ad743a032a84f2445b92ad89dd10ad619f3b28e'
TRIDENT_DECK_RETAINED_PROOFS = {
    'HEAD_VALIDATION.json': '307de76ad2fa77fd9f41c62269d8103aa760467f5651cc20a7a71438e99036ec',
    'MOUNT_VALIDATION.json': '7abe5612128bafc9840587769556f26639b42334002da3906987cf5ec9d179d7',
    'REAR_ENCLOSURE_QA.json': '6173dc68d5a22fd08fa179797698687e74e8afbe9680e8428053bca24f843f0f',
    'STOCK_SKIRT_RETENTION_QA_92.json': '2265d22011d7cc08211292f775f56f88bc30888701df6b9a12a2d0f69b491505',
}


HEAD_CATALOG_DELTA_FILE = 'HEAD_CATALOG_DELTA_ACE_HF_20261020.json'
HEAD_CATALOG_DELTA_SHA256 = '0995df8a20b9bcbd44856da8f1d5253a285a1f0dbee81222f32677cae7dc32ca'
HEAD_CATALOG_BASELINE_SHA256 = '910890df1868584a5aef27d39653d2cb124bbeef4cac576703df715a7052e463'
HEAD_CATALOG_CURRENT_SHA256 = 'c95523f09e893ed2b4a7603a3e3c74aa39aa0c97508f00b2d60202e26b33afbf'


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_dimension(value, expected):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and abs(value - expected) <= 1e-7)


def validate_local_archive(archive, info):
    size = archive.stat().st_size
    if size > MAX_SITE_BYTES or size != info['bytes'] or file_sha256(archive) != info['sha256']:
        raise ValueError('Local model bundle does not match its pinned checksum.')


def validate_trident_deck_repair(target, bundle):
    file = target / 'TRIDENT_DECK_REPAIR_103.json'
    if bundle['sha256'] != TRIDENT_DECK_REPAIRED_BUNDLE:
        if file.exists():
            raise ValueError('Trident deck repair belongs to another model bundle.')
        return bundle['sha256'], {}, {}
    if (bundle.get('bytes') != TRIDENT_DECK_REPAIRED_BUNDLE_BYTES or not file.is_file()
            or file_sha256(file) != TRIDENT_DECK_REPAIR_PROOF_SHA256):
        raise ValueError('Missing or changed pinned Trident deck repair proof.')
    proof = json.loads(file.read_text(encoding='utf-8'))
    changed = {f'machines/voron_trident_{s}/{n}' for s in [300, 350]
               for n in ['model.glb.gz', 'assembly_manifest.json']}
    inputs = changed | {f'machines/voron_trident_{s}/machine_profile.json' for s in [300, 350]}
    if (proof.get('schema') != 'trident-source-aperture-deck-103'
            or proof.get('baseline_bundle_sha256') != TRIDENT_DECK_BASELINE_BUNDLE
            or proof.get('baseline_bundle_bytes') != 851010521
            or proof.get('model_bundle_sha256') != bundle['sha256']
            or proof.get('model_bundle_bytes') != bundle['bytes']
            or set(proof.get('bundle_changed_paths', [])) != changed
            or len(proof.get('bundle_changed_paths', [])) != len(changed)
            or set(proof.get('baseline_input_sha256', {})) != inputs
            or set(proof.get('input_sha256', {})) != inputs
            or proof.get('retained_proof_sha256') != TRIDENT_DECK_RETAINED_PROOFS
            or proof.get('bundle_unchanged_members') != 1200
            or proof.get('all_other_bundle_members_byte_identical') is not True
            or proof.get('all_original_proof_bytes_preserved') is not True
            or proof.get('whole_machine_certified') is not False
            or proof.get('source_revision') != 'a8628f48546948ce1fc15511b7765b7f31f80722'
            or proof.get('canonical_source_native_sha256') != 'be460563ea7c44bbae51931b107658312165a975c8d442be5a295694f6d45613'):
        raise ValueError('Trident deck repair is stale, failed or exceeds its scope.')
    notch = proof.get('canonical_notch', {})
    if (any(not source_dimension(notch.get(k), v) for k, v in
            [('width_mm', 52), ('depth_mm', 51.5), ('sheet_thickness_mm', 3)])
            or len(notch.get('radii_mm', [])) != 2
            or any(not source_dimension(r, 3) for r in notch['radii_mm'])):
        raise ValueError('Trident deck repair differs from the original source aperture.')
    rows = proof.get('machines', [])
    byid = {row['machine_id']: row for row in rows}
    allowed = {'voron_trident_300', 'voron_trident_350', 'voron_trident_500_custom',
               'voron_trident_1000_custom', 'voron_trident_350_half_z'}
    if len(byid) != len(rows) or not {'voron_trident_300', 'voron_trident_350'} <= set(byid) <= allowed:
        raise ValueError('Trident deck repair contains unregistered or duplicate machines.')
    for size, before_width, after_native in [
            (300, 102, '499eb3a15a85d05e719aec548771b4d431a2e041edff2d3724bf716003c9d9e6'),
            (350, 152, '4e29878180cd5f56e8895516aafaa7a42086585875f56cd5ca43014965e52198')]:
        mid = f'voron_trident_{size}'
        row = byid[mid]
        flags = ['native_valid', 'all_original_binary_bytes_preserved',
                 'only_deck_primitive_and_appended_views_accessors_changed',
                 'all_nodes_materials_and_other_manifest_rows_preserved']
        if (row.get('part_key') != mid + '_base_1188'
                or not source_dimension(row.get('before_width_mm'), before_width)
                or not source_dimension(row.get('after_width_mm'), 52)
                or row.get('after_native_sha256') != after_native
                or not all(row.get(k) is True for k in flags)
                or any(row.get(k) != 0 for k in ['removed_material_mm3',
                       'outside_repair_region_symmetric_difference_mm3',
                       'canonical_source_aperture_symmetric_difference_mm3'])):
            raise ValueError('Trident deck repair does not preserve its single-leaf scope.')
        for name in ['model.glb', 'assembly_manifest.json', 'machine_profile.json']:
            path = f'machines/{mid}/' + ('model.glb.gz' if name == 'model.glb' else name)
            before, after = row['before_files'][name], row['after_files'][name]
            if (before['sha256'] != proof['baseline_input_sha256'][path]
                    or after['sha256'] != proof['input_sha256'][path]
                    or (name == 'machine_profile.json' and before != after)
                    or (target / path).stat().st_size != after['bytes']
                    or file_sha256(target / path) != after['sha256']):
                raise ValueError('Trident deck repair shipped input changed: ' + path)
    for name, expected in TRIDENT_DECK_RETAINED_PROOFS.items():
        if file_sha256(target / name) != expected:
            raise ValueError('Retained original proof bytes changed: ' + name)
    print('Pinned source-aperture repair verified; original mounting witness scopes retained.')
    return TRIDENT_DECK_BASELINE_BUNDLE, proof['baseline_input_sha256'], proof['input_sha256']


def copy_siboor_author_index(source, destination):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != SIBOOR_AUTHOR_INDEX_SHA256:
        original = subprocess.check_output(
            ['git', 'show', 'HEAD:site/SIBOOR_TRIDENT_ASSETS.json'], cwd=ROOT)
        if (hashlib.sha256(original).hexdigest() != SIBOOR_AUTHOR_INDEX_SHA256
                or data.replace(b'\r\n', b'\n') != original):
            raise ValueError('Original SIBOOR author index bytes changed.')
        data = original
    destination.write_bytes(data)


def unpack_assets(archive, target):
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read('VIEWER_ASSETS.json'))
        expected = {row['path']: row for row in manifest['files']}
        names = bundle.namelist()
        if len(names) != len(set(names)) or set(names) != set(expected) | {'VIEWER_ASSETS.json'}:
            raise ValueError('Model bundle file list differs from its manifest.')
        total = 0
        for name, row in expected.items():
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
                raise ValueError('Invalid model path.')
            if path.suffix != '.json' and not name.endswith('.glb.gz'):
                raise ValueError('Unsupported model file.')
            total += row['bytes']
            if total > MAX_SITE_BYTES or bundle.getinfo(name).file_size != row['bytes']:
                raise ValueError('Unexpected model bundle size.')
            destination = (target / path).resolve()
            if not destination.is_relative_to(target.resolve()) or destination.exists():
                raise ValueError('Model path collides with viewer source.')
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with bundle.open(name) as source, destination.open('wb') as output:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != row['sha256']:
                raise ValueError('Model file checksum differs from its manifest.')
        print(f'Loaded {len(expected)} model files ({total:,} bytes).')



def validate_head_catalog_delta(target):
    """Retain old mounting witnesses only across this exact appended pilot.

    This does not give the new ACE configuration any historical native-head or
    probe-travel certificate. Every original witness file remains byte-pinned.
    """
    file = target / HEAD_CATALOG_DELTA_FILE
    if not file.exists():
        return {}
    if file_sha256(file) != HEAD_CATALOG_DELTA_SHA256:
        raise ValueError('Head catalog delta proof bytes changed.')
    proof = json.loads(file.read_bytes())
    catalog_path = target / 'TOOLHEAD_CONFIGURATIONS.json'
    if (catalog_path.stat().st_size != 8916573
            or file_sha256(catalog_path) != HEAD_CATALOG_CURRENT_SHA256
            or proof['schema'] != 'ace-hf-append-only-mounting-catalog-delta-v1'
            or proof['baseline_catalog'] != {'bytes': 8912023, 'sha256': HEAD_CATALOG_BASELINE_SHA256}
            or proof['current_catalog'] != {'bytes': 8916573, 'sha256': HEAD_CATALOG_CURRENT_SHA256}
            or proof['retained_original_witnesses'] != {
                name: TRIDENT_DECK_RETAINED_PROOFS[name]
                for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']}
            or proof['new_pilot']['whole_head_fit_certified'] is not False
            or proof['new_pilot']['whole_machine_fit_certified'] is not False
            or proof['new_pilot']['printing_Z0_qualified'] is not False
            or proof['new_pilot']['historical_native_witness_scope_includes_new_variant'] is not False):
        raise ValueError('Head catalog delta proof is stale or exceeds its scope.')
    for name, expected in proof['retained_original_witnesses'].items():
        if file_sha256(target / name) != expected:
            raise ValueError('Original head catalog witness changed: ' + name)
    catalog = json.loads(catalog_path.read_bytes())
    added = proof['added_records']
    asset_id = 'sb_rapido_ace_hf_complete'
    hotend_id = 'rapido_ace_hf'
    variant_id = 'ace_hf__siboor_awd__stealthburner__cw2__fixed__none'
    if (set(added) != {'assets', 'hotends', 'variants'}
            or added['assets']['id'] != asset_id
            or added['hotends']['id'] != hotend_id
            or added['variants']['id'] != variant_id
            or len(catalog['assets']) != 275
            or len(catalog['hotends']) != 34
            or len(catalog['variants']) != 1292):
        raise ValueError('Head catalog delta has unexpected added records.')
    rows = {'assets': catalog['assets'].get(asset_id)}
    for key, identity in [('hotends', hotend_id), ('variants', variant_id)]:
        found = [row for row in catalog[key] if row.get('id') == identity]
        if len(found) != 1:
            raise ValueError('Duplicate or missing appended head catalog record.')
        rows[key] = found[0]
    for key, row in rows.items():
        encoded = json.dumps(row, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        if hashlib.sha256(encoded).hexdigest() != added[key]['canonical_sha256']:
            raise ValueError('Appended head catalog record changed: ' + key)
    asset, variant = rows['assets'], rows['variants']
    if (asset['sha256'] != proof['new_pilot']['decoded_model_sha256']
            or asset['metadata_sha256'] != proof['new_pilot']['parts_metadata_sha256']
            or asset['parts'] != 40
            or variant['source_evidence']['native_fit_qualified'] is not False
            or variant['fit']['physical_print_Z0_qualified'] is not False
            or variant['source_evidence']['finite_cold_seat_report_sha256'] != proof['new_pilot']['selected_native_cold_seat']['report_sha256']
            or variant['registration_constraints']['machines'] != ['siboor_trident_350']
            or variant['registration_constraints']['gantries'] != ['siboor_awd']
            or variant['registration_constraints']['belt_width_mm'] != 9
            or variant['probe'] != 'none'
            or variant['board'] != 'ebb2209_stock'):
        raise ValueError('Appended ACE pilot differs from its narrow source scope.')
    del catalog['assets'][asset_id]
    catalog['hotends'] = [row for row in catalog['hotends'] if row['id'] != hotend_id]
    catalog['variants'] = [row for row in catalog['variants'] if row['id'] != variant_id]
    # Reconstruct the exact historical document, including its recorded final
    # CRLF. No shipped file is normalized or rewritten. This verifies all old
    # rows, root fields, arrays, values and order against the original raw SHA.
    baseline = (json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\r\n').encode('utf-8')
    if (len(baseline) != 8912023
            or hashlib.sha256(baseline).hexdigest() != HEAD_CATALOG_BASELINE_SHA256):
        raise ValueError('Head catalog delta changes the historical catalog.')
    return {'TOOLHEAD_CONFIGURATIONS.json': (
        HEAD_CATALOG_BASELINE_SHA256, HEAD_CATALOG_CURRENT_SHA256)}

def validate_mounting_evidence(target):
    bundle = json.loads((target / 'ASSET_BUNDLE.json').read_text(encoding='utf-8'))
    evidence_bundle, before_deck, after_deck = validate_trident_deck_repair(target, bundle)
    catalog_delta = validate_head_catalog_delta(target)
    for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
        evidence = json.loads((target / name).read_text(encoding='utf-8'))
        if evidence['model_bundle_sha256'] != evidence_bundle:
            raise ValueError(f'{name} belongs to another model bundle.')
        stock_inputs = {}
        if evidence.get('stock_skirt_delta_proof'):
            relative = evidence['stock_skirt_delta_proof']
            proof_path = PurePosixPath(relative)
            if proof_path.is_absolute() or '..' in proof_path.parts or '\\' in relative or ':' in relative:
                raise ValueError('Invalid stock skirt proof path.')
            file = target / proof_path
            if not file.is_file():
                raise ValueError('Missing stock skirt delta proof in built assets.')
            if evidence['input_sha256'].get(relative) != hashlib.sha256(file.read_bytes()).hexdigest():
                raise ValueError('Stock skirt delta proof byte identity changed.')
            proof = json.loads(file.read_text(encoding='utf-8'))
            machines = {f'voron_v24_{size}_{kind}' for size in [250, 300, 350] for kind in ['printed', 'ldo_cnc']}
            required = ['all_passed', 'all_six_host_blocks_rails_native_context_and_profiles_unchanged',
                        'all_GLb_topology_materials_and_binary_unchanged', 'old_selected_native_execution_unchanged',
                        'all128_scope_not_promoted', 'source_insert_invalid_Common_and_both_IN_findings_unresolved']
            if (proof.get('schema') != 'stock-v24-rigid-skirt-logical-delta-v1'
                    or proof.get('model_bundle_sha256') != evidence_bundle
                    or proof.get('baseline_bundle_sha256') != evidence.get('stock_skirt_retained_from_model_bundle_sha256')
                    or not all(proof.get(key) is True for key in required)
                    or proof.get('whole_machine_clearance_certified') is not False
                    or proof.get('old_selected_native_axes') != 120
                    or set(proof.get('changed_keys', {})) != machines):
                raise ValueError('Stock skirt delta proof is stale, failed or exceeds its scope.')
            stock_inputs = proof.get('input_sha256', {})
            expected_paths = {f'machines/{machine}/{filename}' for machine in machines
                              for filename in ['model.glb.gz', 'assembly_manifest.json', 'machine_profile.json']}
            if set(stock_inputs) != expected_paths:
                raise ValueError('Stock skirt proof must bind all six actual models, manifests and profiles.')
        if evidence.get('enclosure_delta_proof'):
            proof_path = PurePosixPath(evidence['enclosure_delta_proof'])
            if proof_path.is_absolute() or '..' in proof_path.parts or '\\' in str(proof_path) or ':' in str(proof_path):
                raise ValueError('Invalid enclosure delta proof path.')
            file = target / proof_path
            if not file.is_file():
                raise ValueError('Missing enclosure delta proof in built assets.')
            proof = json.loads(file.read_text(encoding='utf-8'))
            if proof.get('model_bundle_sha256') != evidence_bundle or not all(proof.get(key, {}).get('all_passed') for key in ['trident', 'v24', 'retention']):
                raise ValueError('Enclosure delta proof is stale or failed.')
        for pins in [evidence['input_sha256'], stock_inputs, *[m['input_sha256'] for m in evidence['machines'].values()]]:
            for relative, expected in pins.items():
                path = PurePosixPath(relative)
                if path.is_absolute() or '..' in path.parts or '\\' in relative or ':' in relative:
                    raise ValueError('Invalid mounting evidence input path.')
                # Match Response.text()/TextEncoder in the viewer. Model data
                # can retain CRLF; source-inventory newline rules do not apply.
                # Only the four exactly pinned deck files may supersede an old
                # witness input. Profiles and every unrelated input stay exact.
                if relative in after_deck and not relative.endswith('machine_profile.json'):
                    if expected != before_deck[relative]:
                        raise ValueError('Deck bridge does not match original witness input: ' + relative)
                    expected = after_deck[relative]
                actual = hashlib.sha256((target / path).read_bytes()).hexdigest()
                if (pins is evidence['input_sha256']
                        and relative == 'TOOLHEAD_CONFIGURATIONS.json'
                        and (expected, actual) == (
                            HEAD_CATALOG_BASELINE_SHA256, HEAD_CATALOG_CURRENT_SHA256)):
                    if catalog_delta.get(relative) != (expected, actual):
                        raise ValueError('Missing exact head catalog delta proof.')
                    if file_sha256(target / name) != TRIDENT_DECK_RETAINED_PROOFS[name]:
                        raise ValueError('Historical head mounting witness changed: ' + name)
                    expected = catalog_delta[relative][1]
                if actual != expected:
                    raise ValueError(f'{name}: shipped input changed: {relative}')
    print('Mounting evidence verified against the shipped files.')


def _audit_built_runtime(target):
    # Selected-surface STEP is independently audited against the admitted real
    # delivered head meshes. It never qualifies the unfinished native producer.
    subprocess.run(['node', '--max-old-space-size=384',
                    '--experimental-loader', './scripts/three-test-loader.mjs',
                    str(ROOT/'scripts/audit_step_surface_assets.mjs'), str(target)],
                   cwd=ROOT, check=True, timeout=120)
    # These aliases have their own bounded actual-asset process.
    subprocess.run(['node', '--max-old-space-size=256', '--expose-gc',
                    '--experimental-loader', './scripts/three-test-loader.mjs',
                    str(ROOT/'scripts/audit_step_surface_common.mjs'), str(target)],
                   cwd=ROOT, check=True, timeout=120)
    # Require genuine UHF rear5 author geometry and every current Yavoth
    # consumer. Internal diagnostic reports are temporary, never site payload.
    with tempfile.TemporaryDirectory(prefix='yavoth-source-release-') as folder:
        subprocess.run(['node', '--max-old-space-size=384', '--expose-gc',
                        '--experimental-loader', './scripts/three-test-loader.mjs',
                        str(ROOT/'scripts/audit_yavoth_source_assets.mjs'),
                        '--site', str(target), '--source-cache', folder,
                        '--report', str(Path(folder)/'yavoth-source-assets.json')],
                       cwd=ROOT, check=True)
    from check_entrypoint_delivery import verify as verify_entrypoints
    inputs_arg = argparse.ArgumentParser(add_help=False)
    inputs_arg.add_argument('--inputs', type=Path)
    input_options, _ = inputs_arg.parse_known_args()
    input_map = json.loads(input_options.inputs.read_bytes()) if input_options.inputs else None
    # A source map must include every admitted size and all separately loaded
    # default companions. Missing meshes/receipts are failures, not skipped rows.
    with tempfile.TemporaryDirectory(prefix='source-part-map-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_source_parts_map_release.py'),
                        '--site', str(target), '--output', folder,
                        *(['--inputs', str(input_options.inputs)] if input_options.inputs else [])],
                       cwd=ROOT, check=True)
        (target/'review').mkdir(exist_ok=True)
        shutil.copyfile(Path(folder)/'summary.json', target/'review/source-part-maps.json')
    # Sensor CAD includes design reference volumes as well as physical parts.
    # Audit the corrected actual export and retained source parts before deploy.
    with tempfile.TemporaryDirectory(prefix='trinity-beacon-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_trinity_beacon_release.py'),
                        '--site', str(target), '--output', folder,
                        *(['--inputs', str(input_options.inputs)] if input_options.inputs else [])],
                       cwd=ROOT, check=True)
    # Mandatory actual color/route checks; maps and detailed evidence are temporary.
    with tempfile.TemporaryDirectory(prefix='viewer-quality-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_viewer_quality_release.py'),
                        '--site', str(target), '--output', folder,
                        *(['--inputs', str(input_options.inputs)] if input_options.inputs else [])],
                       cwd=ROOT, check=True)
    validate_mounting_evidence(target)
    # Dependency ledgers alone do not exercise the browser's composition of
    # retained witnesses. Run the production loader against the built bytes.
    (target/'review').mkdir(exist_ok=True)
    subprocess.run(['node', '--max-old-space-size=256', '--expose-gc',
                    str(ROOT/'scripts/test_native_baseline_bootstrap.mjs'),
                    '--site', str(target), '--report',
                    str(target/'review/native-baseline-bootstrap.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--max-old-space-size=256', '--expose-gc',
                    str(ROOT/'scripts/test_v24_exact_native_reset.mjs'),
                    '--assets', str(target), '--report',
                    str(target/'review/v24-native-reset.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--experimental-loader', './scripts/three-test-loader.mjs',
                    'scripts/build_support_catalog.mjs', str(target)], cwd=ROOT, check=True)
    # A native mounting/parts-inventory pass does not prove that front apertures
    # render correctly. Audit every registered consumer before the Pages artifact.
    with tempfile.TemporaryDirectory(prefix='eva-front-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_eva_front_release.py'),
                        '--output', folder], cwd=ROOT, check=True)
        (target/'review').mkdir(exist_ok=True)
        shutil.copyfile(Path(folder)/'actual-fronts.json', target/'review/eva-fronts.json')
    with tempfile.TemporaryDirectory(prefix='eva-options-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_eva_options_release.py'),
                        '--output', folder], cwd=ROOT, check=True)
        shutil.copyfile(Path(folder)/'actual-options.json', target/'review/eva-options.json')
    with tempfile.TemporaryDirectory(prefix='v0-native-release-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_v0_native_assets_release.py'),
                        '--site', str(target), '--output', folder], cwd=ROOT, check=True)
        shutil.copyfile(Path(folder)/'actual-v0-native-installation.json',
                        target/'review/v0-native-installation.json')
    (target / '.nojekyll').touch()
    # Manual stages must exercise decoded stock assets, including the existing
    # support-omitted carriage, before publishing the viewer.
    subprocess.run(['node', '--experimental-vm-modules', str(ROOT/'scripts/audit_v0_assembly_assets.mjs'),
                    '--site', str(target), '--report',
                    str(target/'review/v0-assembly-stages.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--experimental-vm-modules', '--experimental-loader', './scripts/three-test-loader.mjs',
                    str(ROOT/'scripts/audit_toolchanger_assets.mjs'), '--site', str(target),
                    '--report', str(target/'review/toolchangers.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--experimental-loader', './scripts/three-test-loader.mjs',
                    str(ROOT/'scripts/audit_microswiss_source_shrouds.mjs'), '--site', str(target),
                    '--report', str(target/'review/microswiss-source-shrouds.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--experimental-loader', './scripts/source-assembly-test-loader.mjs',
                    str(ROOT/'scripts/audit_virtu_may_role.mjs'), '--site', str(target),
                    '--report', str(target/'review/virtu-may-source-role.json')], cwd=ROOT, check=True)
    # Require the exact Switchwire display selection against the built assets.
    # Keep the broader existing release stages; this reads only this machine.
    subprocess.run(['node', '--max-old-space-size=128',
                    str(ROOT/'scripts/test_switchwire_catalog.mjs'),
                    '--site', str(target)], cwd=ROOT, check=True)
    # Require the selected FOX V1 exported topology and original hardware.
    subprocess.run(['node', '--max-old-space-size=256',
                    str(ROOT/'scripts/audit_fox_ab_fan_assets.mjs'),
                    str(target), str(target/'review/fox-ab-fan-assets.json')], cwd=ROOT, check=True)
    subprocess.run(['node', '--max-old-space-size=384', '--expose-gc',
                    '--experimental-loader', './scripts/source-assembly-test-loader.mjs',
                    str(ROOT/'scripts/audit_ender_bowden.mjs'), '--site', str(target),
                    '--report', str(target/'review/ender-bowden.json')], cwd=ROOT, check=True)
    # Verify E3NG installed interfaces from the actual checksum-pinned source
    # triangles, not only the source ledger or a visibility fixture.
    with tempfile.TemporaryDirectory(prefix='e3ng-installation-review-') as folder:
        subprocess.run(['node', '--max-old-space-size=192',
                        '--experimental-loader', './scripts/source-assembly-test-loader.mjs',
                        str(ROOT/'scripts/audit_e3ng_routes.mjs'),
                        str(target/'source-assembly-assets/packet-rh3d_e3ng_v12_235.json'),
                        '--origin', 'https://psych0h3ad.github.io',
                        '--out', str(Path(folder)/'actual-installed-interfaces.json')],
                       cwd=ROOT, check=True, timeout=120)
    # Public E3NG replacements keep their own source identities and original hosts.
    with tempfile.TemporaryDirectory(prefix='e3ng-mod-review-') as folder:
        subprocess.run(['node', str(ROOT/'scripts/audit_e3ng_mod_assets.mjs'),
                        '--out', str(Path(folder)/'actual-e3ng-mods.json')],
                       cwd=ROOT, check=True, timeout=120)
    # Static ELEGOO assemblies retain source geometry; no motion/palette claim.
    # Keep detailed inspection artifacts outside the public site.
    with tempfile.TemporaryDirectory(prefix='elegoo-review-') as folder:
        subprocess.run([sys.executable, str(ROOT/'scripts/check_elegoo_assets_release.py'),
                        '--site', str(target), '--output', folder], cwd=ROOT, check=True)
    # Recheck every offered planner machine with its exact delivered footprint.
    # Keep detailed transaction evidence outside the served site.
    with tempfile.TemporaryDirectory(prefix='layout-farm-review-') as folder:
        subprocess.run(['node', '--max-old-space-size=256',
                        str(ROOT/'scripts/test_layout_clipboard.mjs'), '--suite', 'catalog',
                        '--site', str(target), '--report', str(Path(folder)/'planner-transactions.json')],
                       cwd=ROOT, check=True)
    # Audit the supplied BIQU cabinet and its shared preview against exact Web assets.
    # Reports stay outside the served site; the original STEP is never an input here.
    with tempfile.TemporaryDirectory(prefix='layout-biqu-review-') as folder:
        subprocess.run(['node', '--max-old-space-size=384',
                        str(ROOT/'scripts/audit_layout_biqu_assets.mjs'), '--site', str(target),
                        '--report', str(Path(folder)/'biqu-assets.json')], cwd=ROOT, check=True, timeout=120)
        subprocess.run(['node', '--max-old-space-size=384', '--experimental-loader', './scripts/layout-built-three-loader.mjs',
                        str(ROOT/'scripts/audit_layout_biqu_display.mjs'), '--site', str(target),
                        '--report', str(Path(folder)/'biqu-display.json')], cwd=ROOT, check=True, timeout=120)
        subprocess.run(['node', '--max-old-space-size=384',
                        str(ROOT/'scripts/test_layout_popstation_feet.mjs'), '--site', str(target)],
                       cwd=ROOT, check=True, timeout=120)
    # Check the complete page graph after generated inputs (including support
    # data) exist, before the artifact can be uploaded.
    print(json.dumps(verify_entrypoints(target, input_map)))


def main():
    # Build runtime files only from the exact current per-file approved contract.
    # The historical archive helpers below are fixture APIs, never this entry path.
    if '--plan-only' in sys.argv or '--verify-inputs' in sys.argv:
        raise ValueError('Use build_approved_site.py for a non-deploying input plan.')
    from build_approved_site import main as build_approved
    from delivery_audit_context import audit_delivery_contract
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--delivery', type=Path, default=ROOT/'site/APPROVED_DELIVERY.json')
    args, _ = parser.parse_known_args()
    target = args.output.resolve()
    contract_sha256 = hashlib.sha256(args.delivery.read_bytes()).hexdigest()
    build_approved()
    with audit_delivery_contract(args.delivery, target, contract_sha256):
        _audit_built_runtime(target)
    size = sum(path.stat().st_size for path in target.rglob('*') if path.is_file())
    if size >= MAX_SITE_BYTES:
        raise ValueError('Site exceeds the deployment size budget.')
    print(f'Static viewer built ({size:,} bytes).')


if __name__ == '__main__':
    main()
