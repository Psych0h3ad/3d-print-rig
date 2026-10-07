import hashlib
import json
import tempfile
import subprocess
import unittest
from pathlib import Path
from build_site import validate_mounting_evidence
from check_repository import history_blob_records, private_values, PRIVATE_PREFIXES


class HistoryBlobTest(unittest.TestCase):
    def test_binary_boundaries_private_signatures_and_oversize_drain(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            subprocess.run(['git', 'init', '--quiet'], cwd=root, check=True)
            values = [b'\x00\xff\nblob 12\n', PRIVATE_PREFIXES[0]+b'/fixture.json',
                      b'x'*4096, b'trailing blob\n']
            objects = [('fixture-'+str(i), subprocess.check_output(
                ['git', 'hash-object', '-w', '--stdin'], cwd=root, input=data
            ).decode().strip()) for i, data in enumerate(values)]
            records = list(history_blob_records(root, objects, size_limit=4096))
            self.assertEqual([r[1] for r in records], [len(v) for v in values])
            self.assertEqual(records[0][2], values[0])
            self.assertTrue(private_values(records[1][2]))
            self.assertIsNone(records[2][2])
            self.assertEqual(records[3][2], values[3])


class EvidenceDeliveryTest(unittest.TestCase):
    def test_native_datum_is_delivered_without_newline_conversion(self):
        root = Path(__file__).resolve().parents[1]
        name = 'site/TRIDENT_SB_NATIVE_DATUM.json'
        indexed = subprocess.check_output(['git', 'show', ':' + name], cwd=root)
        self.assertEqual(indexed, (root / name).read_bytes())
        self.assertEqual(hashlib.sha256(indexed).hexdigest(),
                         'c567548b21ed8b6675fd0b54d5b984fd61526babdb9845c074c814a0967cb441')

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.cad = b'{\r\n  "revision": "current"\r\n}\r\n'
        (self.root / 'catalog.json').write_bytes(self.cad)
        (self.root / 'fixture.json').write_bytes(b'{"motion":"Z"}\n')
        (self.root / 'ASSET_BUNDLE.json').write_text(json.dumps({'sha256': 'bundle-current'}))
        self.evidence = {
            'model_bundle_sha256': 'bundle-current',
            'input_sha256': {'catalog.json': hashlib.sha256(self.cad).hexdigest()},
            'machines': {'printer': {'input_sha256': {
                'fixture.json': hashlib.sha256((self.root / 'fixture.json').read_bytes()).hexdigest()
            }}}
        }
        self.save()

    def save(self):
        for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
            (self.root / name).write_text(json.dumps(self.evidence))

    def test_actual_crlf_payload_is_accepted(self):
        validate_mounting_evidence(self.root)

    def test_source_style_newline_digest_is_rejected(self):
        self.evidence['input_sha256']['catalog.json'] = hashlib.sha256(self.cad.replace(b'\r\n', b'\n')).hexdigest()
        self.save()
        with self.assertRaisesRegex(ValueError, 'shipped input changed: catalog.json'):
            validate_mounting_evidence(self.root)

    def test_changed_fixture_is_rejected(self):
        (self.root / 'fixture.json').write_bytes(b'{"motion":"fixed"}\n')
        with self.assertRaisesRegex(ValueError, 'shipped input changed: fixture.json'):
            validate_mounting_evidence(self.root)

    def test_other_bundle_is_rejected(self):
        self.evidence['model_bundle_sha256'] = 'bundle-old'
        self.save()
        with self.assertRaisesRegex(ValueError, 'another model bundle'):
            validate_mounting_evidence(self.root)

    def test_enclosure_delta_must_be_delivered_and_current(self):
        self.evidence['enclosure_delta_proof'] = 'REAR_ENCLOSURE_QA.json'
        self.save()
        with self.assertRaisesRegex(ValueError, 'Missing enclosure delta proof'):
            validate_mounting_evidence(self.root)
        file = self.root / 'REAR_ENCLOSURE_QA.json'
        proof = {'model_bundle_sha256': 'bundle-current', **{key: {'all_passed': True} for key in ['trident', 'v24', 'retention']}}
        file.write_text(json.dumps(proof))
        validate_mounting_evidence(self.root)
        proof['model_bundle_sha256'] = 'old'
        file.write_text(json.dumps(proof))
        with self.assertRaisesRegex(ValueError, 'stale or failed'):
            validate_mounting_evidence(self.root)

        proof['model_bundle_sha256'] = 'bundle-current'
        proof['retention']['all_passed'] = False
        file.write_text(json.dumps(proof))
        with self.assertRaisesRegex(ValueError, 'stale or failed'):
            validate_mounting_evidence(self.root)

    def test_stock_delta_requires_current_actual_assets_and_preserves_unqualified_scope(self):
        file = self.root / 'STOCK_SKIRT_RETENTION_QA_92.json'
        self.evidence.update(stock_skirt_delta_proof=file.name,
                             stock_skirt_retained_from_model_bundle_sha256='baseline')
        self.save()
        with self.assertRaisesRegex(ValueError, 'Missing stock skirt'):
            validate_mounting_evidence(self.root)
        machines = {f'voron_v24_{size}_{kind}' for size in [250, 300, 350] for kind in ['printed','ldo_cnc']}
        inputs = {}
        for machine in machines:
            for name in ['model.glb.gz','assembly_manifest.json','machine_profile.json']:
                path = self.root / 'machines' / machine / name
                path.parent.mkdir(parents=True, exist_ok=True)
                data = ('independent delivery fixture ' + machine + name).encode()
                path.write_bytes(data)
                inputs[path.relative_to(self.root).as_posix()] = hashlib.sha256(data).hexdigest()
        proof = dict(schema='stock-v24-rigid-skirt-logical-delta-v1', model_bundle_sha256='bundle-current',
                     baseline_bundle_sha256='baseline', all_passed=True,
                     all_six_host_blocks_rails_native_context_and_profiles_unchanged=True,
                     all_GLb_topology_materials_and_binary_unchanged=True,
                     old_selected_native_execution_unchanged=True, old_selected_native_axes=120,
                     all128_scope_not_promoted=True, source_insert_invalid_Common_and_both_IN_findings_unresolved=True,
                     whole_machine_clearance_certified=False, changed_keys={m:['fixture'] for m in machines},
                     input_sha256=inputs)
        def save_proof():
            file.write_text(json.dumps(proof))
            self.evidence['input_sha256'][file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
            self.save()
        save_proof()
        validate_mounting_evidence(self.root)
        file.write_bytes(file.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'byte identity changed'):
            validate_mounting_evidence(self.root)
        save_proof()
        proof['whole_machine_clearance_certified'] = True
        save_proof()
        with self.assertRaisesRegex(ValueError, 'exceeds its scope'):
            validate_mounting_evidence(self.root)
        proof['whole_machine_clearance_certified'] = False
        save_proof()
        first = next(iter(inputs))
        (self.root / first).write_bytes(b'changed actual model')
        with self.assertRaisesRegex(ValueError, 'shipped input changed'):
            validate_mounting_evidence(self.root)


if __name__ == '__main__':
    unittest.main()
