"""Check tracked publication scope and JavaScript syntax."""
import hashlib
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from check_machine_regressions import changed_inputs

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = {'.glb', '.gltf', '.bin', '.step', '.stp', '.ste', '.p21', '.stpz', '.brep', '.stl', '.xbf', '.f3d', '.zip', '.7z', '.gz', '.log', '.partial'}
SECRET = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
PRIVATE_PREFIXES = [str(p).replace('\\', '/').lower().encode() for p in (Path.home(), ROOT)]

def private_values(data):
    normalized = data.replace(b'\\\\', b'/').replace(b'\\', b'/').lower()
    return bool(SECRET.search(data)) or any(prefix+b'/' in normalized for prefix in PRIVATE_PREFIXES)

def canonical(data):
    return data.replace(b'\r\n', b'\n')

def history_blob_records(root, objects, size_limit=10 * 1024 * 1024):
    """Read exact Git blob bytes through one process, including binary/newlines."""
    with subprocess.Popen(['git', 'cat-file', '--batch'], cwd=root,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE) as batch:
        for name, oid in objects:
            batch.stdin.write((oid+'\n').encode('ascii'))
            batch.stdin.flush()
            header = batch.stdout.readline().split()
            if len(header) != 3 or header[0].decode('ascii') != oid or header[1] != b'blob':
                raise ValueError('Unexpected Git blob header (content withheld).')
            size = int(header[2])
            if size >= size_limit:
                remaining = size
                while remaining:
                    chunk = batch.stdout.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise ValueError('Truncated Git blob (content withheld).')
                    remaining -= len(chunk)
                data = None
            else:
                data = batch.stdout.read(size)
                if len(data) != size:
                    raise ValueError('Truncated Git blob (content withheld).')
            if batch.stdout.read(1) != b'\n':
                raise ValueError('Invalid Git blob boundary (content withheld).')
            yield name, size, data
        batch.stdin.close()
        if batch.wait(timeout=10):
            raise ValueError('Git blob inspection failed.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--regression-workers', type=int, choices=range(1, 9), default=4)
    args = parser.parse_args()
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    paths = [Path(name) for name in tracked if name]
    if not paths:
        raise SystemExit('No tracked files. Stage the source files before checking.')
    before = {p.as_posix(): hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
    errors = []
    for path in paths:
        if path.suffix.lower() in BLOCKED or path.name.startswith('.env'):
            errors.append(f'Excluded publication file is tracked: {path.as_posix()}')
        if (ROOT / path).stat().st_size >= 10 * 1024 * 1024:
            errors.append(f'Unexpected large source file: {path.as_posix()}')
        if private_values((ROOT / path).read_bytes()):
            errors.append(f'Private local path or credential signature found: {path.as_posix()} (value withheld)')
    catalog = json.loads((ROOT / 'site/PUBLIC_CATALOG.json').read_text(encoding='utf-8'))
    for item in catalog['defaults']:
        if any(key.startswith('local_') for key in item):
            errors.append(f'Local-only download entry: {item["id"]}')
        if item.get('url') and not item['url'].startswith('https://'):
            errors.append(f'Unexpected public download URL: {item["id"]}')
        if item.get('url') and not item.get('release_verified'):
            errors.append(f'Unverified download URL: {item["id"]}')
    for source in catalog['sources']:
        url = source.get('license_url', '')
        if url.startswith('../licenses/') and not (ROOT / 'site' / url[3:]).is_file():
            errors.append(f'Missing license for {source["id"]}')
    inventory = json.loads((ROOT / 'docs/SOURCE_INVENTORY.json').read_text(encoding='utf-8'))
    for record in inventory['files']:
        path = ROOT / record['path']
        if hashlib.sha256(canonical(path.read_bytes())).hexdigest() != record['sha256']:
            errors.append(f'Source snapshot mismatch: {record["path"]}')
    expected = {p.as_posix() for p in paths if p.as_posix() != 'docs/SOURCE_INVENTORY.json'}
    recorded = {r['path'] for r in inventory['files']}
    if recorded != expected:
        errors.append('Source inventory does not match all tracked publication files.')
    # Check every committed path, not just the current tree. Never log blob values.
    commits = subprocess.check_output(['git','rev-list','--all'],cwd=ROOT).decode().splitlines()
    seen_blobs = set()
    objects = []
    for commit in commits:
        tree = subprocess.check_output(['git','ls-tree','-r','-z',commit],cwd=ROOT).decode('utf-8').split('\0')
        for entry in filter(None,tree):
            metadata, name = entry.split('\t',1)
            _, kind, oid = metadata.split()
            if Path(name).suffix.lower() in BLOCKED or Path(name).name.startswith('.env'):
                errors.append(f'Excluded file exists in Git history: {name}')
            if kind == 'blob' and oid not in seen_blobs:
                seen_blobs.add(oid)
                objects.append((name, oid))
    for name, size, data in history_blob_records(ROOT, objects):
        if data is None:
            errors.append('Oversize Git history blob (content withheld).')
        elif private_values(data):
            errors.append(f'Private value signature in Git history: {name} (value withheld)')
    for path in paths:
        if path.suffix in ('.js', '.mjs'):
            result = subprocess.run(['node', '--check', str(ROOT / path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(result.stderr.strip())
    if errors:
        raise SystemExit('\n'.join(errors))
    subprocess.run([sys.executable, str(ROOT/'scripts/check_machine_regressions.py'),
                    '--workers', str(args.regression_workers)], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/build_locales.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/check_ui_catalog.mjs')], cwd=ROOT, check=True)
    current_names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    after = {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest()
             for n in current_names if n and (ROOT/n).is_file()}
    changed = changed_inputs(before, after)
    if changed:
        raise SystemExit('Publication inputs changed during checking: '+', '.join(changed))
    print(f'Publication check passed: {len(paths)} tracked files, {len(commits)} commits checked; no geometry/private-path/credential signatures; JS syntax valid.')

if __name__ == '__main__':
    main()
