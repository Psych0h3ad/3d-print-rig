import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from build_site import validate_mounting_evidence


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
