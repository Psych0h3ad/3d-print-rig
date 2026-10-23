"""Fetch exact external ELEGOO bodies outside the site, then audit real exports."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from build_approved_site import fetch_pinned_body, safe_path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-assets/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--assets', type=Path)
    args = parser.parse_args()
    site, out = args.site.resolve(), args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        'const {elegooAssetIndex:x}=await import('+json.dumps((site/'viewer/elegoo-catalog.mjs').as_uri())+');console.log(JSON.stringify(x));'], cwd=ROOT))
    if catalog['base_url'] != BASE or len(catalog['machines']) != 3:
        raise ValueError('Unexpected ELEGOO release catalog')
    with tempfile.TemporaryDirectory(prefix='elegoo-assets-') as folder:
        assets = args.assets.resolve() if args.assets else Path(folder)
        seen = set()
        for machine in catalog['machines']:
            if set(machine['files']) != {'assembly_manifest.json', 'machine_profile.json', 'model.glb'}:
                raise ValueError('Incomplete ELEGOO body registration')
            specs = list(machine['files'].values())+list(machine.get('zero_facet_source', {}).values())
            for spec in specs:
                relative = safe_path(spec['path'])
                if relative.as_posix() in seen:
                    raise ValueError('Duplicate ELEGOO body')
                seen.add(relative.as_posix())
                target = assets / relative
                if not args.assets:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    fetch_pinned_body(dict(spec, url=BASE+relative.as_posix()), target)
                if target.stat().st_size != spec['bytes'] or hashlib.sha256(target.read_bytes()).hexdigest() != spec['sha256']:
                    raise ValueError('Changed ELEGOO body')
        subprocess.run(['node', '--max-old-space-size=700', '--expose-gc',
            str(ROOT/'scripts/audit_elegoo_assets.mjs'), '--site', str(site),
            '--assets', str(assets), '--out', str(out)], cwd=ROOT, check=True,
            stdout=subprocess.DEVNULL)
    print('ELEGOO release actual-asset check passed: three static assemblies and all pinned original/filter inputs; no motion or physical-fit certification.')


if __name__ == '__main__':
    main()
