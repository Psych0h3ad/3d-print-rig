"""Build the static viewer with its pinned model bundle."""
import argparse
import hashlib
import json
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
    for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
        evidence = json.loads((target / name).read_text(encoding='utf-8'))
        if evidence['model_bundle_sha256'] != bundle['sha256']:
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
                    or proof.get('model_bundle_sha256') != bundle['sha256']
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
            if proof.get('model_bundle_sha256') != bundle['sha256'] or not all(proof.get(key, {}).get('all_passed') for key in ['trident', 'v24', 'retention']):
                raise ValueError('Enclosure delta proof is stale or failed.')
        for pins in [evidence['input_sha256'], stock_inputs, *[m['input_sha256'] for m in evidence['machines'].values()]]:
            for relative, expected in pins.items():
                path = PurePosixPath(relative)
                if path.is_absolute() or '..' in path.parts or '\\' in relative or ':' in relative:
                    raise ValueError('Invalid mounting evidence input path.')
                # Match Response.text()/TextEncoder in the viewer. Model data
                # can retain CRLF; source-inventory newline rules do not apply.
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
