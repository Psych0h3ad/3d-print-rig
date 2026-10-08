"""Build the static viewer with its pinned model bundle."""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from merge_component_library import merge_components
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
# Retain a 20 MB margin below the published GitHub Pages 1 GB limit.
MAX_SITE_BYTES = 980_000_000


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


def validate_mounting_evidence(target):
    bundle = json.loads((target / 'ASSET_BUNDLE.json').read_text(encoding='utf-8'))
    evidence_bundle, before_deck, after_deck = validate_trident_deck_repair(target, bundle)
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
                if actual != expected:
                    raise ValueError(f'{name}: shipped input changed: {relative}')
    print('Mounting evidence verified against the shipped files.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--assets', type=Path)
    args = parser.parse_args()
    target = args.output.resolve()
    if target == ROOT or target == ROOT / 'site' or target.exists():
        raise ValueError('Use a new build output directory.')
    target.mkdir(parents=True)
    tracked = subprocess.check_output(['git', 'ls-files', '-z', 'site'], cwd=ROOT).decode().split('\0')
    for name in filter(None, tracked):
        path = Path(name)
        relative = path.relative_to('site')
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if relative.as_posix() == 'SIBOOR_TRIDENT_ASSETS.json':
            copy_siboor_author_index(ROOT / path, destination)
        else:
            shutil.copyfile(ROOT / path, destination)
    if args.assets:
        info = json.loads((target / 'ASSET_BUNDLE.json').read_text(encoding='utf-8'))
        validate_local_archive(args.assets, info)
        unpack_assets(args.assets, target)
    else:
        info = json.loads((ROOT / 'site/ASSET_BUNDLE.json').read_text(encoding='utf-8'))
        url = info['url']
        if not url.startswith('https://github.com/Psych0h3ad/3d-print-rig/releases/download/'):
            raise ValueError('Unexpected model bundle URL.')
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'viewer-models.zip'
            request = urllib.request.Request(url, headers={'User-Agent': '3D-Print-Rig'})
            digest = hashlib.sha256()
            size = 0
            with urllib.request.urlopen(request, timeout=60) as response, archive.open('wb') as output:
                for chunk in iter(lambda: response.read(1024 * 1024), b''):
                    size += len(chunk)
                    if size > MAX_SITE_BYTES:
                        raise ValueError('Model bundle is too large.')
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != info['sha256'] or size != info['bytes']:
                raise ValueError('Model bundle does not match its pinned checksum.')
            unpack_assets(archive, target)
    validate_mounting_evidence(target)
    merge_components(target)
    subprocess.run(['node', '--experimental-loader', './scripts/three-test-loader.mjs',
                    'scripts/build_support_catalog.mjs', str(target)], cwd=ROOT, check=True)
    (target / '.nojekyll').touch()
    size = sum(path.stat().st_size for path in target.rglob('*') if path.is_file())
    if size > MAX_SITE_BYTES:
        raise ValueError('Site exceeds the deployment size budget.')
    print(f'Static viewer built ({size:,} bytes).')


if __name__ == '__main__':
    main()
