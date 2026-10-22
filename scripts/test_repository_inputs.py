import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
from prepare_repository_inputs import fetch_registered_input,prepare,selected

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
