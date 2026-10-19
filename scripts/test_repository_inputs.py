import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from prepare_repository_inputs import prepare,selected

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
        with patch('prepare_repository_inputs.urllib.request.urlopen', side_effect=fetch):
            result = prepare(self.root, self.contract)
        self.assertEqual(set(requested), set(self.gz + self.nested))
        self.assertEqual(result['verified_source_check_inputs'], 12)
        self.assertFalse((self.root / 'site/modules/unrelated-model.glb.gz').exists())
        for name in requested:
            self.assertEqual((self.root / 'site' / name).read_bytes(), self.bodies[name])

    def test_dependency_missing_from_approved_delivery_is_rejected(self):
        self.contract['files'] = [r for r in self.rows if r['path'] != self.nested[0]]
        with self.assertRaisesRegex(ValueError, 'Unregistered mounting dependency'):
            prepare(self.root, self.contract, self.mapping)

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

if __name__=='__main__':unittest.main()
