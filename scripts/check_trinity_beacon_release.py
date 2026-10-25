"""Require the source-derived Beacon display against both complete web models."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urljoin
import zipfile
from check_viewer_quality_release import Assets, digest, HOSTS
from fetch_pinned_source import fetch_pinned_source

ROOT = Path(__file__).resolve().parents[1]


def verify_supplement(file, pin):
    if not file.is_file() or file.stat().st_size != pin['bytes'] or digest(file) != pin['sha256']:
        raise ValueError('Missing or changed Beacon corresponding-source supplement')
    with zipfile.ZipFile(file) as archive:
        required = {'source-coil.brep', 'physical-coil.brep', 'derive_coil.py',
                    'SOURCE.json', 'NOTICE.txt', 'BEACON_LICENSE.txt', 'COPYING'}
        if set(archive.namelist()) != required or len(archive.infolist()) != len(required):
            raise ValueError('Beacon source supplement is incomplete')
        if any(row.file_size > 1_000_000 for row in archive.infolist()) or archive.testzip():
            raise ValueError('Invalid Beacon source supplement')
        record = json.loads(archive.read('SOURCE.json'))
        if record.get('source_part') != 'n19_65' or record.get('coordinate_transform') != 'None; original source position is preserved':
            raise ValueError('Beacon corresponding source identity differs')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--inputs', type=Path)
    args = parser.parse_args()
    site, output = args.site.resolve(), args.output.resolve()
    if output.is_relative_to(site):
        raise ValueError('Keep detailed inspection output outside the served site')
    output.mkdir(parents=True, exist_ok=True)
    fixture_path = ROOT/'docs/TRINITY_BEACON_HELPER_REGRESSION.json'
    catalogs = [site/name for name in ('HEAD_ADDITIONS.json', 'COMPONENT_ADDITIONS.json')]
    scripts = [Path(__file__), ROOT/'scripts/audit_trinity_beacon_helpers.mjs',
               ROOT/'scripts/audit_trinity_beacon_controller.mjs',
               ROOT/'scripts/check_viewer_quality_release.py', ROOT/'scripts/fetch_pinned_source.py']
    pinned = {p: digest(p) for p in [fixture_path, *catalogs, *scripts]}
    fixture = json.loads(fixture_path.read_bytes())
    specs = [json.loads(p.read_bytes())['assets'][fixture['asset']] for p in catalogs]
    if specs[0] != specs[1] or specs[0]['files'] != fixture['current_files']:
        raise ValueError('Head/library Beacon asset descriptor differs')
    spec = specs[0]
    assets = Assets(site, output, args.inputs, time.monotonic()+240)
    supplement_pin = spec['files']['source-supplement.zip']
    supplement = assets.hint('HEAD_ADDITIONS.json', supplement_pin, spec['external']['local_directory'])
    if supplement is None:
        supplement = output/'public-cache'/supplement_pin['sha256']/'source-supplement.zip'
        if not supplement.is_file():
            supplement.parent.mkdir(parents=True, exist_ok=True)
            fetch_pinned_source(dict(supplement_pin, url=urljoin(spec['external']['base_url'], supplement_pin['path'])),
                                supplement, allowed_hosts=HOSTS, timeout=45)
    verify_supplement(supplement, supplement_pin)
    assets.verified[str(supplement.resolve())] = supplement_pin
    resolved = []
    for catalog, files in [('TRINITY_BEACON_HELPER_REGRESSION.json', fixture['original_files']),
                           ('HEAD_ADDITIONS.json', spec['files'])]:
        for name in ('parts.json', 'model.glb'):
            row = assets.acquire(catalog, files[name], spec['external']['base_url'],
                                 spec['external']['local_directory'])
            resolved.append(row['actual_path'])
    report = output/'actual-beacon-helpers.json'
    env = dict(os.environ, UV_THREADPOOL_SIZE='1')
    env.pop('NODE_OPTIONS', None)
    subprocess.run(['node', '--max-old-space-size=192', '--max-semi-space-size=4',
                    '--v8-pool-size=1', str(ROOT/'scripts/audit_trinity_beacon_helpers.mjs'),
                    str(site), *resolved, str(report)], cwd=ROOT, env=env, check=True, timeout=120)
    flags = ['--max-old-space-size=192', '--max-semi-space-size=4', '--v8-pool-size=1', '--expose-gc']
    controller = ROOT/'scripts/audit_trinity_beacon_controller.mjs'
    planned = subprocess.run(['node', *flags, str(controller), '--plan', str(site)],
                             cwd=ROOT, env=env, check=True, capture_output=True, text=True,
                             encoding='utf-8', timeout=120)
    plan = json.loads(planned.stdout)
    delivery = {row['path']: row for row in json.loads((site/'APPROVED_DELIVERY.json').read_bytes())['files']}
    resources = []
    for item in plan['assets']:
        part = item['spec']
        if part.get('external'):
            for name in ('parts.json', 'model.glb'):
                resources.append(assets.acquire('HEAD_ADDITIONS.json', part['files'][name],
                                               part['external']['base_url'], part['external']['local_directory']))
        else:
            for name in (part['meta'], part['glb']+'.gz'):
                resources.append(assets.acquire('APPROVED_DELIVERY.json', delivery[name]))
    controller_inputs = output/'controller-inputs.json'
    controller_inputs.write_text(json.dumps({'site': str(site), 'plan': plan, 'resources': resources}, indent=2)+'\n', encoding='utf-8')
    subprocess.run(['node', *flags, str(controller), '--inputs', str(controller_inputs),
                    '--report', str(output/'actual-beacon-controller.json')], cwd=ROOT, env=env,
                   check=True, timeout=120)
    assets.stable()
    if any(digest(p) != value for p, value in pinned.items()):
        raise ValueError('Beacon release inputs changed during inspection')
    print('Trinity n19 Beacon helper release check passed: 95 actual parts; 94 preserved.')


if __name__ == '__main__':
    main()
