import hashlib
import gzip
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
from prepare_repository_inputs import fetch_registered_input,prepare,selected
import prepare_repository_inputs
from layout_equipment_inputs import (CACHE_RELATIVE, PAYLOAD_NAME, EQUIPMENT_PREFIX,
                                     prepare_equipment_inputs, load_exact_input_map, run_node)

class RepositoryInputs(unittest.TestCase):
    def test_source_checks_receive_only_exact_registered_inputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'site').mkdir();body=root/'pinned.asset';body.write_bytes(b'{"schema":"source input fixture"}\n')
            rows=[]
            for name in ['TOOLCHANGER_CONFIGURATIONS.json','source-assembly-assets/packet.json','assets/machines/source-projection.json','community-machines-assets/switchwire/revision/model.glb.gz','modules/not-needed-by-source-check.glb.gz']:
                rows.append({'path':name,'url':'https://psych0h3ad.github.io/3d-print-rig/'+name,'bytes':body.stat().st_size,'sha256':hashlib.sha256(body.read_bytes()).hexdigest(),'approval_receipt_sha256':'a'*64})
            contract={'schema':'approved-static-delivery-v1','files':rows}
            mapping={'files':{r['path']:str(body.resolve()) for r in rows}}
            result=prepare(root,contract,mapping)
            self.assertEqual(result['verified_source_check_inputs'],4)
            self.assertFalse((root/'site/modules/not-needed-by-source-check.glb.gz').exists())
            self.assertTrue((root/'site/source-assembly-assets/packet.json').is_file())
            self.assertEqual(prepare(root,contract,mapping)['verified_source_check_inputs'],4)
            (root/'site/TOOLCHANGER_CONFIGURATIONS.json').write_bytes(b'wrong source')
            with self.assertRaisesRegex(ValueError,'no overwrite'):prepare(root,contract,mapping)
            self.assertEqual((root/'site/TOOLCHANGER_CONFIGURATIONS.json').read_bytes(),b'wrong source')

    def test_missing_map_is_not_a_download_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'site').mkdir()
            row={'path':'SOURCE.json','url':'https://psych0h3ad.github.io/3d-print-rig/SOURCE.json','bytes':1,'sha256':'a'*64,'approval_receipt_sha256':'b'*64}
            with self.assertRaisesRegex(ValueError,'Missing source-check input mapping'):prepare(root,{'schema':'approved-static-delivery-v1','files':[row]},{'files':{}})


class EquipmentInputOrchestration(unittest.TestCase):
    """Tiny synthetic bodies only. No actual model fetch or source/geometry pass."""
    def setUp(self):
        # Keep every fixture within this checkout's ignored private area.
        self.source_root = Path(__file__).resolve().parents[1]
        fixture_parent = self.source_root / '__pycache__'
        fixture_parent.mkdir(exist_ok=True)
        folder = tempfile.TemporaryDirectory(prefix='equipment-ci-fixture-', dir=fixture_parent)
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'site/layout').mkdir(parents=True)
        for name in ['scripts/prepare_layout_equipment_inputs.mjs',
                     'site/layout/layout-equipment-transfer.mjs']:
            shutil.copyfile(self.source_root / name, self.root / name)
        self.names = [str(EQUIPMENT_PREFIX / name).replace('\\', '/') for name in [
            'U1_exterior_standalone_loaded.glb', 'U1_exterior_docked.glb',
            'PopStationMini_empty.glb', 'PopStationMini_loaded.glb', 'U1_preview_geometry.json']]
        self.pins, self.mapping = [], {'files': {}}
        for index, name in enumerate(self.names):
            text = json.dumps({'asset': {'version': '2.0'}, 'scenes': [{'nodes': []}],
                               'fixtureOnly': True, 'case': index}).encode()
            text += b' ' * (-len(text) % 4)
            raw = (struct.pack('<4sIIII', b'glTF', 2, 20 + len(text), len(text), 0x4e4f534a)
                   + text) if index < 4 else b' {"fixtureOnly": true, "noActualGeometry": true}\n'
            wire = gzip.compress(raw, mtime=123 + index)
            self.pins.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                              'transfer': {'path': name + '.gz', 'bytes': len(wire),
                                           'sha256': hashlib.sha256(wire).hexdigest(), 'encoding': 'gzip',
                                           'baseURL': 'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/'}})
            for key, body in [(name, raw), (name + '.gz', wire)]:
                file = self.root / 'exact-prepared-fixtures' / Path(key).name
                file.parent.mkdir(exist_ok=True)
                file.write_bytes(body)
                self.mapping['files'][key] = str(file)
        self.write_catalog()
        source = self.root / 'exact-source.json'
        source.write_bytes(b'{"syntheticSourceFixture":true}\n')
        self.contract = {'schema': 'approved-static-delivery-v1', 'files': [{
            'path': 'SOURCE.json', 'url': 'https://psych0h3ad.github.io/3d-print-rig/SOURCE.json',
            'bytes': source.stat().st_size, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'approval_receipt_sha256': 'a' * 64}]}
        self.source_mapping = {'files': {'SOURCE.json': str(source)}}
        self.cache = self.root / CACHE_RELATIVE
        self.payload = self.cache / PAYLOAD_NAME
        # No Python download may escape any orchestration case.
        self.addCleanup(patch.stopall)
        patch('fetch_pinned_source.urllib.request.urlopen',
              side_effect=AssertionError('Fixture attempted live source request')).start()

    def write_catalog(self):
        rows = [('snapmaker_u1_layout_reference', 'standalone'),
                ('snapmaker_u1_layout_reference', 'docked'),
                ('biqu_pop_station_mini_layout_reference', 'empty'),
                ('biqu_pop_station_mini_layout_reference', 'loaded')]
        code = 'const pins=' + json.dumps(self.pins) + ';\nconst rows=' + json.dumps(rows) + ';\n'
        code += ('export const LAYOUT_EQUIPMENT_PREVIEW_MODEL=pins[4];\n'
                 'export const getLayoutEquipment=(id,variant)=>{const i=rows.findIndex(r=>r[0]===id&&r[1]===variant);'
                 'return i<0?null:{id,equipmentVariant:variant,model:pins[i]};};\n')
        (self.root / 'site/layout/layout-equipment.mjs').write_text(code, encoding='utf-8')

    def prepare(self):
        return prepare(self.root, self.contract, self.source_mapping, equipment_input_map=self.mapping)

    def test_explicit_ten_body_map_drives_unchanged_cli_and_retains_four_model_map(self):
        result = self.prepare()['layout_equipment_inputs']
        report = json.loads(Path(result['report_path']).read_bytes())
        self.assertEqual((result['requests'], result['cached_body_count']), (0, 10))
        self.assertEqual(result['mode'], 'exact-input-map')
        self.assertEqual(set(result['files']), set(self.names[:4]))
        self.assertEqual(Path(result['prepared_dir']), self.payload / EQUIPMENT_PREFIX)
        self.assertEqual(report['limits']['concurrency'], 1)
        self.assertLessEqual(report['limits']['timeoutMs'], 120000)
        self.assertFalse(report['actualSourceGateRun'])
        self.assertFalse(report['metadataCopied'])
        for name, original in self.mapping['files'].items():
            self.assertEqual((self.payload / name).read_bytes(), Path(original).read_bytes())
        self.assertFalse((self.root / 'site' / EQUIPMENT_PREFIX).exists())
        self.assertEqual(list((self.root / 'site').glob('*.json')), [self.root / 'site/SOURCE.json'])

    def test_normal_source_preparation_automatically_invokes_cli_using_private_cache(self):
        self.prepare()
        with patch('layout_equipment_inputs.run_node', wraps=run_node) as child:
            result = prepare(self.root, self.contract)['layout_equipment_inputs']
        self.assertEqual(child.call_count, 1)
        self.assertEqual(child.call_args.args[1][0], 'scripts/prepare_layout_equipment_inputs.mjs')
        self.assertEqual(result['mode'], 'cache-or-fetch')
        self.assertEqual(result['requests'], 0)  # Fixture cache hit, never a real host fetch.

    def test_offline_source_map_requires_explicit_equipment_map(self):
        with patch('layout_equipment_inputs.run_node') as child:
            with self.assertRaisesRegex(ValueError, '--equipment-input-map'):
                prepare(self.root, self.contract, self.source_mapping)
            child.assert_not_called()

    def test_missing_unused_and_wrong_map_shapes_fail_before_cache_creation(self):
        missing = {'files': {k: v for k, v in self.mapping['files'].items() if k != self.names[4] + '.gz'}}
        unused = {'files': dict(self.mapping['files'], **{'other.glb': 'must never be read'})}
        for value in [None, [], {}, {'files': []}, {'files': {}, 'extra': True}, missing, unused]:
            with self.subTest(value=value):
                # None denotes normal fetching in the API, so use a malformed
                # files value to exercise the explicit map's null form.
                value = {'files': None} if value is None else value
                with self.assertRaisesRegex(ValueError, '(Invalid exact|missing or unused)'):
                    prepare_equipment_inputs(self.root, exact_input_map=value)
                self.assertFalse(self.cache.exists())

    def test_missing_changed_and_relative_mapped_bodies_do_not_fetch_or_install(self):
        name = self.names[0]
        for file in [str(self.root / 'absent.glb'), 'relative.glb', 42, '']:
            mapping = {'files': dict(self.mapping['files'], **{name: file})}
            with self.subTest(file=file), self.assertRaises(ValueError):
                prepare_equipment_inputs(self.root, exact_input_map=mapping)
        source = Path(self.mapping['files'][name])
        source.write_bytes(b'x' * source.stat().st_size)
        with self.assertRaisesRegex(ValueError, 'Changed exact equipment body'):
            self.prepare()
        self.assertFalse(self.cache.exists())

    def test_supplied_bad_map_is_not_hidden_by_valid_cache(self):
        self.prepare()
        self.mapping['files']['unused.json'] = str(self.root / 'never-read.json')
        with self.assertRaisesRegex(ValueError, 'unused'):
            self.prepare()

    def test_offline_mode_cannot_fetch_if_seeded_cache_is_absent_at_cli_start(self):
        # Simulate a cache disappearing before the unchanged CLI starts. Its
        # default fetch must be replaced by the explicit offline hard failure.
        with patch('layout_equipment_inputs.import_exact_map'):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.prepare()
        self.assertIn('Offline equipment transport forbidden', caught.exception.stderr)
        self.assertFalse((self.cache.parent / 'inputs.private.json').exists())
        self.assertFalse(self.payload.exists())

    def test_public_site_and_parent_traversal_map_paths_are_rejected(self):
        name = self.names[0]
        for file in [self.root / 'site/forbidden.glb', self.root / 'site/../escape.glb']:
            mapping = {'files': dict(self.mapping['files'], **{name: str(file)})}
            with self.subTest(file=file), self.assertRaisesRegex(ValueError, 'outside site'):
                prepare_equipment_inputs(self.root, exact_input_map=mapping)
        self.assertFalse(self.cache.exists())

    def test_incomplete_changed_and_extra_cached_bodies_fail_not_skip_or_repair(self):
        result = self.prepare()['layout_equipment_inputs']
        cached = self.payload / self.names[0]
        original = cached.read_bytes()
        cached.unlink()
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertFalse(cached.exists())
        cached.write_bytes(b'x' * len(original))
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertEqual(cached.read_bytes(), b'x' * len(original))
        cached.write_bytes(original)
        extra = self.payload / 'unregistered.json'
        extra.write_bytes(b'{}')
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertTrue(extra.is_file())
        self.assertEqual(result['requests'], 0)

    def test_individually_pinned_but_inconsistent_gzip_pair_is_rejected_by_original_cli(self):
        # Tiny intentionally inconsistent catalog: valid individual hashes do
        # not prove the decoded gzip matches its companion raw body.
        name = self.names[4] + '.gz'
        wire = gzip.compress(b'{"differentFixture":true}', mtime=999)
        Path(self.mapping['files'][name]).write_bytes(wire)
        self.pins[4]['transfer'].update(bytes=len(wire), sha256=hashlib.sha256(wire).hexdigest())
        self.write_catalog()
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertFalse((self.cache.parent / 'inputs.private.json').exists())
        self.assertFalse((self.cache.parent / 'preparation.private.json').exists())

    def test_cache_reservation_is_preserved(self):
        self.cache.mkdir(parents=True)
        lock = self.cache / '.layout-equipment-input-preparation.lock'
        lock.mkdir()
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertTrue(lock.is_dir())
        self.assertFalse(self.payload.exists())

    def test_map_duplicate_keys_and_explicit_missing_file_fail(self):
        file = self.root / 'map.private.json'
        file.write_text('{"files":{},"files":{}}')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            load_exact_input_map(file)
        file.write_text('{"files":{"duplicate":"a","duplicate":"b"}}')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            load_exact_input_map(file)
        with self.assertRaises(FileNotFoundError):
            load_exact_input_map(self.root / 'missing.private.json')
        for invalid in ['null', '[]', '{}', '{"files":null}', '{"files":{},"extra":true}']:
            file.write_text(invalid)
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, 'Invalid exact'):
                load_exact_input_map(file)

    def test_main_explicit_map_option_writes_private_preparation_report(self):
        files = {'source.private.json': self.source_mapping, 'equipment.private.json': self.mapping}
        for name, value in files.items():
            (self.root / name).write_text(json.dumps(value), encoding='utf-8')
        (self.root / 'site/APPROVED_DELIVERY.json').write_text(json.dumps(self.contract), encoding='utf-8')
        report = self.root / 'result.private.json'
        arguments = ['prepare_repository_inputs.py', '--inputs', str(self.root / 'source.private.json'),
                     '--equipment-input-map', str(self.root / 'equipment.private.json'), '--report', str(report)]
        with patch.object(prepare_repository_inputs, 'ROOT', self.root), patch.object(sys, 'argv', arguments), \
                patch('sys.stdout', new_callable=io.StringIO):
            prepare_repository_inputs.main()
        self.assertEqual(json.loads(report.read_bytes())['layout_equipment_inputs']['cached_body_count'], 10)

    def test_legacy_root_with_no_feature_needs_no_node_and_rejects_unused_equipment_map(self):
        (self.root / 'site/layout/layout-equipment.mjs').unlink()
        with patch('layout_equipment_inputs.run_node') as child:
            result = prepare(self.root, self.contract, self.source_mapping)
            self.assertNotIn('layout_equipment_inputs', result)
            self.assertEqual(result['verified_source_check_inputs'], 1)
            with self.assertRaisesRegex(ValueError, 'Unused exact equipment input map'):
                self.prepare()
            child.assert_not_called()

    def test_preview_default_missing_private_body_fails_and_explicit_folder_is_exact(self):
        # Actual metadata-only registration, but no actual bodies. Both runs
        # must fail; this is not an actual preview/mesh/host success certificate.
        shutil.copyfile(self.source_root / 'scripts/test_layout_equipment_preview.mjs',
                        self.root / 'scripts/test_layout_equipment_preview.mjs')
        for name in ['layout-equipment.mjs', 'layout-equipment-preview.mjs']:
            shutil.copyfile(self.source_root / 'site/layout' / name, self.root / 'site/layout' / name)
        for arguments, folder in [([], self.payload / EQUIPMENT_PREFIX),
                                  (['--prepared-dir', str(self.root / 'explicit-prepared')],
                                   self.root / 'explicit-prepared')]:
            with self.subTest(arguments=arguments), self.assertRaises(subprocess.CalledProcessError) as caught:
                run_node(self.root, ['scripts/test_layout_equipment_preview.mjs', *arguments])
            self.assertIn('Required prepared asset missing: ' + str(folder / 'U1_preview_geometry.json'),
                          caught.exception.stderr)


class FreshMountingInputs(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        (self.root / 'site').mkdir()
        (self.root / 'docs').mkdir()
        self.bodies = {}
        self.tracked = {}
        self.gz = [f'machines/trident_{size}/model.glb.gz' for size in [300, 350]]
        self.gz += [f'machines/v24_{size}_{kind}/model.glb.gz'
                    for size in [250, 300, 350] for kind in ['printed', 'ldo']]
        self.nested = ['machines/trident_350/machine_profile.json',
                       'machines/trident_350/assembly_manifest.json',
                       'machines/trident_350/assembly_configurations.json',
                       'modules/trident_r2_gantry_350.json']
        for name in self.gz + self.nested:
            self.bodies[name] = b'finite pinned fixture\r\n' if name.endswith('.gz') else b'{"fixture":true}\r\n'
        pins = {name: hashlib.sha256(self.bodies[name]).hexdigest() for name in self.nested}
        ledger = {'input_sha256': pins, 'machines': {}, 'stock_skirt_delta_proof': 'RETENTION.json'}
        self.source('HEAD_VALIDATION.json', ledger)
        self.source('MOUNT_VALIDATION.json', ledger)
        self.source('ASSET_BUNDLE.json', {'sha256': 'fixture-bundle'})
        self.bootstrap_meta = 'toolheads/sb_stock.json'
        self.bodies[self.bootstrap_meta] = b'{"parts":[]}\n'
        self.source('XOL_MOD.json', {'parts': []})
        self.source('TOOLHEAD_CONFIGURATIONS.json', {'base_assets': {
            'xol': {'meta': 'XOL_MOD.json'},
            'stealthburner': {'meta': self.bootstrap_meta}}})
        self.source('RETENTION.json', {'input_sha256': {
            name: hashlib.sha256(self.bodies[name]).hexdigest() for name in self.gz[2:]}})
        self.source('TRIDENT_DECK_REPAIR_103.json', {
            'input_sha256': {name: hashlib.sha256(self.bodies[name]).hexdigest() for name in self.gz[:2]},
            'retained_proof_sha256': {'HEAD_VALIDATION.json': 'a' * 64, 'MOUNT_VALIDATION.json': 'b' * 64},
        })
        self.bodies['modules/unrelated-model.glb.gz'] = b'unrelated model must not be fetched'
        self.rows = [{'path': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(),
                      'approval_receipt_sha256': 'c' * 64,
                      'url': 'https://psych0h3ad.github.io/3d-print-rig/' + name}
                     for name, body in self.bodies.items()]
        self.contract = {'schema': 'approved-static-delivery-v1', 'files': self.rows}
        self.mapping = {'files': {}}
        for index, (name, body) in enumerate(self.bodies.items()):
            file = self.root / ('input-' + str(index))
            file.write_bytes(body)
            self.mapping['files'][name] = str(file.resolve())
        self.save_inventory()

    def source(self, name, value):
        body = (json.dumps(value) + '\n').encode()
        (self.root / 'site' / name).write_bytes(body)
        self.tracked[name] = body

    def save_inventory(self):
        (self.root / 'docs/SOURCE_INVENTORY.json').write_text(json.dumps({'files': [
            {'path': 'site/' + name, 'sha256': hashlib.sha256(body).hexdigest()}
            for name, body in self.tracked.items()]}))

    def test_fresh_checkout_fetches_exact_nested_json_and_eight_required_models(self):
        self.assertFalse((self.root / 'site/machines').exists())
        self.assertFalse((self.root / 'site/modules').exists())
        requested = []
        def fetch(request, timeout):
            name = request.full_url.split('/3d-print-rig/', 1)[1]
            requested.append(name)
            response = io.BytesIO(self.bodies[name])
            response.url = request.full_url
            return response
        # Exercise the real no-mapping download path; transport bodies are small
        # unit fixtures. The source-owner clean-checkout audit uses real assets.
        with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=fetch):
            result = prepare(self.root, self.contract)
        self.assertEqual(set(requested), set(self.gz + self.nested + [self.bootstrap_meta]))
        self.assertEqual(result['verified_source_check_inputs'], 13)
        self.assertEqual(json.loads((self.root / 'site' / self.bootstrap_meta).read_bytes()), {'parts': []})
        self.assertFalse((self.root / 'site/modules/unrelated-model.glb.gz').exists())
        for name in requested:
            self.assertEqual((self.root / 'site' / name).read_bytes(), self.bodies[name])

    def test_dependency_missing_from_approved_delivery_is_rejected(self):
        self.contract['files'] = [r for r in self.rows if r['path'] != self.nested[0]]
        with self.assertRaisesRegex(ValueError, 'Unregistered mounting dependency'):
            prepare(self.root, self.contract, self.mapping)

    def test_runtime_base_metadata_must_be_registered(self):
        self.contract['files'] = [r for r in self.rows if r['path'] != self.bootstrap_meta]
        with self.assertRaisesRegex(ValueError, 'Unregistered mounting dependency: toolheads/sb_stock.json'):
            prepare(self.root, self.contract, self.mapping)

    def test_changed_runtime_base_metadata_is_not_overwritten(self):
        target = self.root / 'site' / self.bootstrap_meta
        target.parent.mkdir(parents=True)
        target.write_bytes(b'{"changed":true}')
        with self.assertRaisesRegex(ValueError, 'no overwrite: toolheads/sb_stock.json'):
            prepare(self.root, self.contract, self.mapping)
        self.assertEqual(target.read_bytes(), b'{"changed":true}')

    def test_unmapped_nested_dependency_is_not_silently_skipped(self):
        with self.assertRaisesRegex(ValueError, 'Missing source-check input mapping'):
            prepare(self.root, self.contract, {'files': {}})

    def test_changed_tracked_ledger_is_rejected_before_dependency_traversal(self):
        (self.root / 'site/HEAD_VALIDATION.json').write_bytes(b'{}\n')
        with self.assertRaisesRegex(ValueError, 'Changed tracked mounting input'):
            prepare(self.root, self.contract, {'files': {}})

    def test_unregistered_retained_proof_is_rejected(self):
        self.source('HEAD_VALIDATION.json', {'stock_skirt_delta_proof': 'MISSING.json'})
        self.save_inventory()
        with self.assertRaisesRegex(ValueError, 'Unregistered mounting dependency: MISSING.json'):
            prepare(self.root, self.contract, self.mapping)

    def test_unsafe_dependency_is_rejected(self):
        self.source('HEAD_VALIDATION.json', {'input_sha256': {'../outside.json': 'a' * 64}})
        self.save_inventory()
        with self.assertRaisesRegex(ValueError, 'Invalid static delivery path'):
            prepare(self.root, self.contract, {'files': {}})

class SourceFetchTransport(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.target = Path(folder.name) / 'SOURCE.json'
        self.body = b'{"source":"exact public fixture"}\n'
        self.row = {'path': 'SOURCE.json', 'url': 'https://psych0h3ad.github.io/source.json',
                    'bytes': len(self.body), 'sha256': hashlib.sha256(self.body).hexdigest()}

    def response(self, body=None, *, url=None, headers=None):
        response = io.BytesIO(self.body if body is None else body)
        response.url = url or self.row['url']
        response.headers = headers or {}
        return response

    def http_error(self, status):
        return urllib.error.HTTPError(self.row['url'], status, 'source status', {}, io.BytesIO())

    def exercise(self, sequence, *, row=None, timeout=60):
        self.urlopen = patch('fetch_pinned_source.urllib.request.urlopen', side_effect=sequence).start()
        self.sleep = patch('fetch_pinned_source.time.sleep').start()
        self.addCleanup(patch.stopall)
        fetch_registered_input(row or self.row, self.target, timeout=timeout)

    def assert_no_install(self):
        self.assertFalse(self.target.exists())
        self.assertFalse(self.target.with_name(self.target.name + '.download').exists())

    def test_first_attempt_preserves_exact_body(self):
        self.exercise([self.response(headers={'Content-Length': str(len(self.body))})])
        self.assertEqual(self.target.read_bytes(), self.body)
        self.assertEqual(self.urlopen.call_count, 1)
        self.sleep.assert_not_called()

    def test_each_allowed_status_and_timeout_recovers_at_same_url_on_third_attempt(self):
        errors = [lambda s=s: self.http_error(s) for s in (429, 502, 503, 504)]
        errors += [lambda: TimeoutError('response timeout'),
                   lambda: urllib.error.URLError(TimeoutError('connect timeout'))]
        for make_error in errors:
            with self.subTest(error=type(make_error()).__name__):
                self.exercise([make_error(), make_error(), self.response()])
                self.assertEqual(self.target.read_bytes(), self.body)
                self.assertEqual(self.urlopen.call_count, 3)
                self.assertEqual([call.args for call in self.sleep.call_args_list], [(1,), (3,)])
                for call in self.urlopen.call_args_list:
                    self.assertEqual(call.args[0].full_url, self.row['url'])
                    self.assertEqual(call.kwargs, {'timeout': 60})
                self.target.unlink()
                patch.stopall()

    def test_persistent_transient_stops_after_three_and_cleans_partial_output(self):
        for status in (429, 502, 503, 504):
            with self.subTest(status=status):
                with self.assertRaises(urllib.error.HTTPError):
                    self.exercise([self.http_error(status) for _ in range(3)] + [self.response()])
                self.assertEqual(self.urlopen.call_count, 3)
                self.assertEqual(self.sleep.call_count, 2)
                self.assert_no_install()
                patch.stopall()

    def test_invalid_bodies_origins_and_nontransient_errors_never_retry(self):
        cases = [self.response(b'x' * len(self.body)), self.response(self.body[:-1]),
                 self.response(self.body + b'x'), self.response(headers={'Content-Length': 'NaN'}),
                 self.response(headers={'Content-Length': str(len(self.body) + 1)}),
                 self.response(url='https://unapproved.example/source.json')]
        cases += [self.http_error(status) for status in (404, 408, 425, 500)]
        cases += [urllib.error.URLError('unclassified transport failure')]
        for result in cases:
            with self.subTest(result=type(result).__name__):
                with self.assertRaises((ValueError, urllib.error.URLError)):
                    self.exercise([result, self.response()])
                self.assertEqual(self.urlopen.call_count, 1)
                self.sleep.assert_not_called()
                self.assert_no_install()
                patch.stopall()

    def test_midbody_timeout_restarts_from_zero_not_partial_append(self):
        first = self.response()
        reads = iter([self.body[:5], TimeoutError('body timeout')])
        def read1(size):
            value = next(reads)
            if isinstance(value, Exception):
                raise value
            return value
        first.read1 = read1
        self.exercise([first, self.http_error(503), self.response()])
        self.assertEqual(self.urlopen.call_count, 3)
        self.assertEqual(self.target.read_bytes(), self.body)
        self.assertFalse(self.target.with_name(self.target.name + '.download').exists())

    def test_elapsed_attempt_budget_exhausts_after_three(self):
        clock = iter(range(0, 1000, 31))
        with patch('fetch_pinned_source.time.monotonic', side_effect=lambda: next(clock)):
            with self.assertRaises(TimeoutError):
                self.exercise([self.response() for _ in range(4)])
        self.assertEqual(self.urlopen.call_count, 3)
        self.assert_no_install()

    def test_nonfinite_and_invalid_pins_or_timeouts_reject_before_transport(self):
        for size in (float('nan'), float('inf'), -float('inf'), 0, -1, 2.5, True):
            with self.subTest(size=size), patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                with self.assertRaises(ValueError):
                    fetch_registered_input(dict(self.row, bytes=size), self.target)
                fetch.assert_not_called()
                self.assert_no_install()
        for timeout in (float('nan'), float('inf'), 0, -1, 61, True):
            with self.subTest(timeout=timeout), patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                with self.assertRaises(ValueError):
                    fetch_registered_input(self.row, self.target, timeout=timeout)
                fetch.assert_not_called()
        for checksum in (None, 'x' * 64, 'A' * 64, '0' * 63):
            with self.subTest(checksum=checksum), patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                with self.assertRaises(ValueError):
                    fetch_registered_input(dict(self.row, sha256=checksum), self.target)
                fetch.assert_not_called()

    def test_existing_target_or_unapproved_source_has_no_fetch_or_overwrite(self):
        for url in ('http://psych0h3ad.github.io/source.json', 'https://unapproved.example/source.json',
                    'https://user:password@github.com/source.json', 'https://github.com/source.json#fragment'):
            with patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                with self.assertRaisesRegex(ValueError, 'origin'):
                    fetch_registered_input(dict(self.row, url=url), self.target)
                fetch.assert_not_called()
        self.target.write_bytes(b'existing source must stay')
        with patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
            with self.assertRaisesRegex(ValueError, 'no overwrite'):
                fetch_registered_input(self.row, self.target)
            fetch.assert_not_called()
        self.assertEqual(self.target.read_bytes(), b'existing source must stay')


if __name__=='__main__':unittest.main()
