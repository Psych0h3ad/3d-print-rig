"""Check tracked publication scope and JavaScript syntax."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = {'.glb', '.gltf', '.bin', '.step', '.stp', '.ste', '.p21', '.stpz', '.brep', '.stl', '.xbf', '.f3d', '.zip', '.7z', '.gz', '.log', '.partial'}
SECRET = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
PRIVATE_PREFIXES = [str(p).replace('\\', '/').lower().encode() for p in (Path.home(), ROOT)]

def private_values(data):
    normalized = data.replace(b'\\\\', b'/').replace(b'\\', b'/').lower()
    return bool(SECRET.search(data)) or any(prefix+b'/' in normalized for prefix in PRIVATE_PREFIXES)

def canonical(data):
    return data.replace(b'\r\n', b'\n')

def main():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    paths = [Path(name) for name in tracked if name]
    if not paths:
        raise SystemExit('No tracked files. Stage the source files before checking.')
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
    for commit in commits:
        tree = subprocess.check_output(['git','ls-tree','-r','-z',commit],cwd=ROOT).decode('utf-8').split('\0')
        for entry in filter(None,tree):
            metadata, name = entry.split('\t',1)
            _, kind, oid = metadata.split()
            if Path(name).suffix.lower() in BLOCKED or Path(name).name.startswith('.env'):
                errors.append(f'Excluded file exists in Git history: {name}')
            if kind == 'blob' and oid not in seen_blobs:
                seen_blobs.add(oid)
                size = int(subprocess.check_output(['git','cat-file','-s',oid],cwd=ROOT))
                if size >= 10*1024*1024:
                    errors.append('Oversize Git history blob (content withheld).')
                elif private_values(subprocess.check_output(['git','cat-file','blob',oid],cwd=ROOT)):
                    errors.append(f'Private value signature in Git history: {name} (value withheld)')
    for path in paths:
        if path.suffix in ('.js', '.mjs'):
            result = subprocess.run(['node', '--check', str(ROOT / path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(result.stderr.strip())
    if errors:
        raise SystemExit('\n'.join(errors))
    subprocess.run(['node', str(ROOT/'scripts/test_configurations.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_v24_adapter.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_v0_belts.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_accessories.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_trident_motion.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_bed_chain.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_frame_mods.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_probe_mounts.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_probe_clearance.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_workbenches.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_toolchangers.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_machine_selection.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_product_links.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_machine_navigation.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_appearance_roles.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_export_camera.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_responsive_camera.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_gcode_preview.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_machine_heads.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_head_builder.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_monolith_heads.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_i18n.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_selection_regressions.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_v0_mod_selection.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_changer_bank.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_changer_bank_ui.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_cutters_madmax.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_indx_bank.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_micron_adapter.mjs')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT/'scripts/test_micron_belts.mjs')], cwd=ROOT, check=True)
    print(f'Publication check passed: {len(paths)} tracked files, {len(commits)} commits checked; no geometry/private-path/credential signatures; JS syntax valid.')

if __name__ == '__main__':
    main()
