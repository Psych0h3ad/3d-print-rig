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


if __name__ == '__main__':
    unittest.main()
