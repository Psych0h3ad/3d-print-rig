"""Fail-closed orchestration/transport fixtures; these do not load actual CAD."""
import ast
import gzip
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import check_viewer_quality_release as gate


class ViewerQualityRelease(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.site, self.out, self.repo = self.root / 'site', self.root / 'reports', self.root / 'checkout'
        self.site.mkdir()
        self.rows, self.delivery_files = [], []
        community = {'base_url': 'https://psych0h3ad.github.io/public-community/', 'local_directory': 'community', 'machines': {}}
        for mid in ('vzbot_330_printed', *gate.ROUTES):
            community['machines'][mid] = self.machine(mid, 'COMMUNITY_MACHINES_ASSETS.json', 'community')
        crossant = self.machine(gate.COLORS[0], 'CROSSANT_ASSETS.json', 'crossant', crossant=True)
        crossant.update(base_url='https://psych0h3ad.github.io/public-crossant/', local_directory='crossant')
        custom = {'base_url': 'https://psych0h3ad.github.io/public-custom/', 'local_directory': 'custom', 'machines': []}
        for family in ('trident', 'v24'):
            for suffix in ('500_custom', '1000_custom', '350_half_z'):
                mid = f'voron_{family}_{suffix}'
                spec = self.machine(mid, 'CUSTOM_VORON_ASSETS.json', 'custom')
                spec.update(id=mid, family=family)
                custom['machines'].append(spec)
        stock = [f'voron_trident_{s}' for s in (250, 300, 350)]
        stock += [f'voron_v24_{s}_{v}' for s in (250, 300, 350) for v in ('printed', 'ldo_cnc')]
        stock += ['micron_r1_120', 'micron_plus_r1_180']
        for mid in stock:
            self.machine(mid, 'APPROVED_DELIVERY.json', '')
        self.catalogs = {'COMMUNITY_MACHINES_ASSETS.json': community, 'CROSSANT_ASSETS.json': crossant, 'CUSTOM_VORON_ASSETS.json': custom}
        self.ids = [gate.COLORS[0], *community['machines'], *[s['id'] for s in custom['machines']], *stock]
        self.refresh_catalogs()
        self.map = self.root / 'map.json'
        gate.write(self.map, self.rows)

    def artifact(self, catalog, directory, name, raw, decoded=None):
        file = self.site / directory / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(raw)
        pin = {'path': name, 'bytes': len(raw), 'sha256': gate.sha(raw)}
        if decoded is not None:
            pin.update(encoding='gzip', decoded_bytes=len(decoded), decoded_sha256=gate.sha(decoded))
        row = dict(pin, actual_path=str(file), catalog=catalog, local_directory=directory)
        self.rows.append(row)
        if catalog == 'APPROVED_DELIVERY.json':
            self.delivery_files.append(dict(pin, url='https://psych0h3ad.github.io/3d-print-rig/' + name))
        return pin

    def machine(self, mid, catalog, directory, crossant=False):
        manifest = {'machine_id': mid, 'parts': [{'key': 'source-leaf', 'name': 'Source fixture'}], 'native_leaf_count': 1}
        spec = {'machine_id': mid, 'parts': 1, 'files': {}}
        for name, value in [('assembly_manifest.json', manifest), ('machine_profile.json', {'machine_id': mid})]:
            spec['files'][name] = self.artifact(catalog, directory, f'machines/{mid}/{name}', json.dumps(value).encode())
        if crossant:
            buffers = []
            for i in range(7):
                name = f'geometry_{i:02}.bin'
                body = bytes([i, 42])
                spec['files'][name] = self.artifact(catalog, directory, f'machines/{mid}/{name}', body)
                buffers.append({'uri': name, 'byteLength': len(body)})
            spec['files']['model.gltf'] = self.artifact(catalog, directory, f'machines/{mid}/model.gltf', json.dumps({'buffers': buffers}).encode())
            spec['files']['belt_bindings.json'] = self.artifact(catalog, directory, f'machines/{mid}/belt_bindings.json', b'{}')
        else:
            body = ('public web model fixture ' + mid).encode()
            spec['files']['model.glb'] = self.artifact(catalog, directory, f'machines/{mid}/model.glb.gz', gzip.compress(body, mtime=0), body)
        return spec

    def refresh_catalogs(self):
        pins = []
        for name, value in self.catalogs.items():
            raw = json.dumps(value).encode()
            (self.site / name).write_bytes(raw)
            source = self.repo / 'site' / name
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(raw)
            pins.append({'path': name, 'bytes': len(raw), 'sha256': gate.sha(raw)})
        gate.write(self.site / 'APPROVED_DELIVERY.json', {'machine_ids': self.ids, 'files': self.delivery_files + pins})

    def fake_node(self, command, **kwargs):
        self.assertTrue(kwargs['check'])
        self.assertGreater(kwargs['timeout'], 0)
        self.assertLessEqual(kwargs['timeout'], gate.JOB_SECONDS)
        self.assertIn('--v8-pool-size=1', command)
        self.assertTrue(any(s in command for s in ('--max-old-space-size=384', '--max-old-space-size=512')))
        if any(s.endswith('/audit_source_printed_colors.mjs') or s.endswith('\\audit_source_printed_colors.mjs') for s in command):
            plan = gate.read(Path(command[-2]))
            rows = []
            for spec in plan['assets']:
                keys = gate.SOURCE_PRINTED_KEYS.get(spec['id'], set())
                count = len(keys)
                rows.append({'id': spec['id'], 'passed': True, 'material_slots': 1, 'attached_color_checks': 1,
                             'independently_expected_printed_leaves': count,
                             'reviewed_printed_palette_checks': [{'key': key, 'slots': [{'expected_color': '#112233', 'actual_color': '#112233'}]} for key in keys for _ in range(7)]})
            report = {'passed': True, 'results': rows, 'source_printed_leaf_count': 15,
                      'source_handle_materials': {'passed': True, 'printed_keys': ['00250', '00253'], 'purchased_keys': ['00251', '00252'],
                                                 'negative_assertions': 4, 'attached_material_checks': 588,
                                                 'purchased_PBR_preserved': True, 'exact_source_color_reset': True}}
            destination = Path(command[-1])
        else:
            mid = command[command.index('--machine') + 1] if '--machine' in command else gate.HALF
            bindings = gate.read(Path(command[command.index('--bindings' if '--machine' in command else '--pins') + 1]))
            inputs = {owner['name']: {'sha256': b['sha256']} for b in bindings for owner in b['logical_owners'] if owner['machine'] == mid}
            report = {'passed': True, 'inputs': inputs, 'rows': [{}], 'triangle_tests': 1, 'inputs_stable_during_audit': True,
                      'continuous_native_clearance_certified': False, 'physical_fit_certified': False,
                      'machine': mid, 'poses': [{}], 'actual_mesh_snapshots': [{}], 'adaptive_actual_mesh_poses': 1,
                      'native_solid_clearance_verified': False}
            destination = Path(command[command.index('--report') + 1])
        gate.write(destination, report)

    def invoke(self, runner=None, snapshots=None):
        with patch.object(gate, 'ROOT', self.repo), patch.object(gate, 'source_snapshot', side_effect=snapshots or [{'controller': 'a'}, {'controller': 'a'}]), \
                patch.object(gate.shutil, 'which', return_value='node'), patch.object(gate.subprocess, 'run', side_effect=runner or self.fake_node) as node, \
                patch.object(gate, 'fetch_pinned_source', side_effect=AssertionError('Unexpected public download')):
            result = gate.run(self.site, self.out, self.map)
        return result, node

    def test_current_maps_and_five_sequential_actual_commands(self):
        result, node = self.invoke()
        self.assertTrue(result['passed'])
        self.assertEqual(len(node.call_args_list), 5)
        self.assertEqual([j['name'] for j in result['jobs']], ['colors', 'half-z', *['flex-' + m for m in gate.ROUTES]])
        self.assertEqual(len(gate.read(self.out / 'color-plan.json')['assets']), 19)
        self.assertFalse((self.site / 'bindings.json').exists())

    def test_source_inventory_catalogs_need_not_be_delivery_file_entries(self):
        delivery = gate.read(self.site / 'APPROVED_DELIVERY.json')
        delivery['files'] = [r for r in delivery['files'] if r['path'] not in gate.CATALOGS]
        gate.write(self.site / 'APPROVED_DELIVERY.json', delivery)
        result, _ = self.invoke()
        self.assertTrue(result['passed'])

    def test_normal_delivery_file_cache_map(self):
        gate.write(self.map, {'files': {((r['local_directory'] + '/') if r['local_directory'] else '') + r['path']: r['actual_path'] for r in self.rows}})
        result, _ = self.invoke()
        self.assertTrue(result['passed'])

    def test_stale_current_binding_fails_without_fallback(self):
        rows = gate.read(self.map)
        rows[0]['sha256'] = '0' * 64
        gate.write(self.map, rows)
        with self.assertRaisesRegex(ValueError, 'Cache map differs from current catalog'):
            self.invoke()

    def test_missing_current_id_fails_before_any_child(self):
        delivery = gate.read(self.site / 'APPROVED_DELIVERY.json')
        delivery['machine_ids'].remove(gate.HALF)
        gate.write(self.site / 'APPROVED_DELIVERY.json', delivery)
        with self.assertRaisesRegex(ValueError, 'machine IDs'):
            self.invoke()
        self.assertFalse(gate.read(self.out / 'viewer-quality-release.json')['passed'])

    def test_missing_logical_asset_is_not_skipped(self):
        del self.catalogs['COMMUNITY_MACHINES_ASSETS.json']['machines'][gate.ROUTES[0]]['files']['model.glb']
        self.refresh_catalogs()
        with self.assertRaisesRegex(ValueError, 'logical public artifact'):
            self.invoke()

    def test_missing_explicit_cache_is_a_failure_without_network_fallback(self):
        row = next(r for r in self.rows if gate.ROUTES[1] in r['path'] and r['path'].endswith('.gz'))
        Path(row['actual_path']).unlink()
        with self.assertRaisesRegex(ValueError, 'Missing or changed public cache body'):
            self.invoke()

    def test_changed_current_source_catalog_fails(self):
        source = gate.read(self.repo / 'site/COMMUNITY_MACHINES_ASSETS.json')
        source['machines'][gate.ROUTES[0]]['files']['model.glb']['sha256'] = '0' * 64
        gate.write(self.repo / 'site/COMMUNITY_MACHINES_ASSETS.json', source)
        with self.assertRaisesRegex(ValueError, 'checkout/assembled catalog differs'):
            self.invoke()

    def test_changed_source_during_child_execution_fails_final_report(self):
        with self.assertRaisesRegex(ValueError, 'source/catalog changed'):
            self.invoke(snapshots=[{'controller': 'before'}, {'controller': 'after'}])
        self.assertFalse(gate.read(self.out / 'viewer-quality-release.json')['passed'])

    def test_success_exit_without_full_current_results_fails(self):
        def incomplete(command, **kwargs):
            gate.write(Path(command[-1]), {'passed': True, 'results': []})
        with self.assertRaisesRegex(ValueError, 'actual color result'):
            self.invoke(incomplete)

    def test_old_thirteen_leaf_report_is_rejected(self):
        def old_report(command, **kwargs):
            self.fake_node(command, **kwargs)
            p = Path(command[-1])
            r = gate.read(p)
            row = next(x for x in r['results'] if x['id'] == gate.COLORS[1])
            row['independently_expected_printed_leaves'] = 8
            row['reviewed_printed_palette_checks'] = [c for c in row['reviewed_printed_palette_checks'] if c['key'] not in ('00250', '00253')]
            gate.write(p, r)
        with self.assertRaisesRegex(ValueError, 'source-bound printed leaf'):
            self.invoke(old_report)

    def test_actual_bolt_negative_witness_is_required(self):
        def no_bolts(command, **kwargs):
            self.fake_node(command, **kwargs)
            p = Path(command[-1])
            r = gate.read(p)
            r['source_handle_materials']['negative_assertions'] = 0
            gate.write(p, r)
        with self.assertRaisesRegex(ValueError, 'purchased-bolt negative assertions'):
            self.invoke(no_bolts)

    def test_nonzero_child_cannot_reuse_prior_success(self):
        gate.write(self.out / 'colors.json', {'passed': True, 'results': []})
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke(lambda command, **kw: (_ for _ in ()).throw(subprocess.CalledProcessError(1, command)))
        self.assertFalse((self.out / 'colors.json').exists())
        self.assertFalse(gate.read(self.out / 'viewer-quality-release.json')['passed'])

    def test_decoded_checksum_and_native_file_types_fail_closed(self):
        raw = b'original public web bytes'
        file = self.root / 'model.glb.gz'
        encoded = gzip.compress(raw, mtime=0)
        file.write_bytes(encoded)
        pin = {'path': 'model.glb.gz', 'bytes': len(encoded), 'sha256': gate.sha(encoded), 'encoding': 'gzip', 'decoded_sha256': gate.sha(raw), 'decoded_bytes': len(raw)}
        self.assertEqual(gate.verify(file, pin), gate.sha(raw))
        with self.assertRaisesRegex(ValueError, 'Decoded public checksum'):
            gate.verify(file, dict(pin, decoded_sha256='0' * 64))
        for name in ('original.step', '../model.glb', 'C:/private.glb'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                gate.descriptor(dict(pin, path=name))

    def test_public_fetch_uses_existing_pinned_helper_and_canonical_gzip_name(self):
        body = b'exact public transfer'
        raw = gzip.compress(body, mtime=0)
        pin = {'path': 'public/model.glb', 'bytes': len(raw), 'sha256': gate.sha(raw), 'encoding': 'gzip', 'decoded_sha256': gate.sha(body), 'decoded_bytes': len(body)}
        assets = gate.Assets(self.site, self.out, None, gate.time.monotonic() + 30)
        with patch.object(gate, 'fetch_pinned_source', side_effect=lambda row, file, **kw: file.write_bytes(raw)) as fetch:
            row = assets.acquire('CATALOG.json', pin, 'https://psych0h3ad.github.io/models/')
        self.assertEqual(Path(row['actual_path']).name, 'model.glb.gz')
        self.assertEqual(fetch.call_args.kwargs['allowed_hosts'], gate.HOSTS)
        with self.assertRaisesRegex(ValueError, 'origin'):
            assets.acquire('OTHER.json', dict(pin, url='https://unregistered.invalid/model.glb'))
        for url in ('https://psych0h3ad.github.io/CAD/original.step', 'https://psych0h3ad.github.io/CAD/source.zip'):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, 'web model/metadata URLs'):
                assets.acquire('ORIGINAL.json', dict(pin, url=url))

    def test_reports_cannot_enter_served_site(self):
        with self.assertRaisesRegex(ValueError, 'outside the served site'):
            gate.run(self.site, self.site / 'review/new-quality')
        self.assertFalse((self.site / 'review/new-quality').exists())

    def test_normal_build_has_exactly_one_mandatory_hook_after_assembly(self):
        tree = ast.parse((Path(gate.__file__).parent / 'build_site.py').read_text(encoding='utf-8'))
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        calls = [n for n in ast.walk(main) if isinstance(n, ast.Call)]
        hooks = [n for n in calls if any(isinstance(x, ast.Constant) and x.value == 'scripts/check_viewer_quality_release.py' for x in ast.walk(n))]
        runs = [n for n in hooks if isinstance(n.func, ast.Attribute) and n.func.attr == 'run']
        self.assertEqual(len(runs), 1)
        self.assertTrue(any(k.arg == 'check' and isinstance(k.value, ast.Constant) and k.value.value is True for k in runs[0].keywords))
        assembled = next(n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'build_approved')
        mounting = next(n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'validate_mounting_evidence')
        self.assertLess(assembled.lineno, runs[0].lineno)
        self.assertLess(runs[0].lineno, mounting.lineno)


if __name__ == '__main__':
    unittest.main()
