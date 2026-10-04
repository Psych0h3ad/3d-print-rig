"""Build the static viewer with its pinned model bundle."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
# Retain a 30 MB margin below the published GitHub Pages 1 GB limit.
MAX_SITE_BYTES = 970_000_000


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
    (target / '.nojekyll').touch()
    size = sum(path.stat().st_size for path in target.rglob('*') if path.is_file())
    if size > MAX_SITE_BYTES:
        raise ValueError('Site exceeds the deployment size budget.')
    print(f'Static viewer built ({size:,} bytes).')


if __name__ == '__main__':
    main()
