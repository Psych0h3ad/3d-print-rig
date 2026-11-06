from pathlib import Path
import copy
import hashlib
import json
import shutil
import tempfile
import unittest
import build_approved_site as approved
import prepare_source47_delivery as packed

ROOT = Path(__file__).resolve().parents[1]


class Source47DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='source47-delivery-')
        self.root = Path(self.temp.name)
        self.site = self.root / 'site'
        for name in packed.SOURCE_PATHS | {packed.MODULE_PATH}:
            target = self.site / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'site' / name, target)
        self.refresh_inventory()
        self.sources = approved.source_files(self.root)
        self.contract = {'schema': 'approved-static-delivery-v1', 'machine_ids': ['fixture'],
                         'source_catalog_sha256': {}, 'files': [{'path': 'unrelated.dat', 'bytes': 1,
                         'sha256': '1' * 64, 'url': 'https://example.invalid/allowed.dat',
                         'approval_receipt_sha256': '2' * 64}]}
        (self.root / 'docs/MACHINE_REVIEW_COVERAGE.json').write_text(json.dumps(
            {'machines': [{'id': 'fixture'}]}), encoding='utf-8')

    def refresh_inventory(self):
        rows = [{'path': 'site/' + p.relative_to(self.site).as_posix(),
                 'sha256': hashlib.sha256(p.read_bytes().replace(b'\r\n', b'\n')).hexdigest()}
                for p in self.site.rglob('*') if p.is_file()]
        doc = self.root / 'docs/SOURCE_INVENTORY.json'
        doc.parent.mkdir(parents=True, exist_ok=True)
        doc.write_text(json.dumps({'files': rows}), encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_exact_three_generated_bodies_and_raw_exclusion(self):
        self.assertEqual(set(self.sources), {packed.MODULE_PATH})
        bodies = approved.approved_source47_delivery(self.root, self.sources, [])
        self.assertEqual(len(bodies), 3)
        out = self.root / 'out'
        packed.write_source47_delivery(self.site, out, bodies)
        self.assertEqual(len([p for p in out.rglob('*') if p.is_file()]), 3)
        self.assertFalse(any((out / name).exists() for name in packed.SOURCE_PATHS))
        for body, receipt in bodies:
            self.assertEqual((out / receipt['path']).read_bytes(), body)
        with self.assertRaises(ValueError):
            packed.write_source47_delivery(self.site, out, bodies)

    def test_real_builder_plan_includes_exact_gzip_size(self):
        report = approved.run(self.root, self.contract, self.root / 'unused', plan_only=True)
        expected = sum(len(b) for b, _ in packed.build_source47_delivery(self.site))
        expected += (self.site / packed.MODULE_PATH).stat().st_size + 1
        self.assertEqual(report['planned_site_bytes'], expected)
        self.assertEqual(len(report['generated_source47_references']), 3)

    def test_raw_bytes_and_crlf_are_not_reserialized_or_normalized(self):
        p = self.site / 'viewer/source47/data/ROUTE350_CAPTURE_BINDINGS_V2.json'
        original = p.read_bytes()
        for changed in [original + b' ', original.replace(b'\r\n', b'\n')]:
            p.write_bytes(changed)
            self.refresh_inventory()  # Updating inventory cannot bypass fixed original identity.
            with self.assertRaises(ValueError):
                approved.approved_source47_delivery(self.root, approved.source_files(self.root), [])
        p.write_bytes(original)

    def test_partial_source_and_inventory_fail(self):
        p = self.site / next(iter(packed.SOURCE_PATHS))
        p.unlink()
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, self.sources, [])
        shutil.copyfile(ROOT / 'site' / p.relative_to(self.site), p)
        doc = self.root / 'docs/SOURCE_INVENTORY.json'
        value = json.loads(doc.read_bytes())
        value['files'].pop()
        doc.write_text(json.dumps(value), encoding='utf-8')
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, self.sources, [])

    def test_runtime_rows_and_source_collisions_fail(self):
        bodies = packed.build_source47_delivery(self.site)
        name = bodies[0][1]['path']
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, self.sources, [{'path': name}])
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, {**self.sources, name: self.site / 'dummy'}, [])
        contract = copy.deepcopy(self.contract)
        contract['files'][0]['path'] = next(iter(packed.SOURCE_PATHS))
        with self.assertRaises(ValueError):
            approved.run(self.root, contract, self.root / 'unused', plan_only=True)

    def test_changed_bodies_and_raw_output_collisions_fail(self):
        bodies = packed.build_source47_delivery(self.site)
        bad = copy.deepcopy(bodies)
        bad[0] = (bad[0][0] + b'x', bad[0][1])
        with self.assertRaises(ValueError):
            packed.write_source47_delivery(self.site, self.root / 'out', bad)
        raw = self.root / 'out' / next(iter(packed.SOURCE_PATHS))
        raw.parent.mkdir(parents=True, exist_ok=True)
        raw.write_bytes(b'not a runtime body')
        with self.assertRaises(ValueError):
            packed.write_source47_delivery(self.site, self.root / 'out', bodies)

    def test_missing_module_and_changed_inventory_fail(self):
        p = self.site / packed.MODULE_PATH
        original = p.read_bytes()
        p.write_bytes(original + b' ')
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, self.sources, [])
        p.unlink()
        with self.assertRaises(ValueError):
            approved.approved_source47_delivery(self.root, self.sources, [])

    def test_exact_original_and_generated_pin_types(self):
        p = self.site / packed.MODULE_PATH
        text = p.read_text(encoding='utf-8')
        for changed in [text.replace('54606,', 'true,', 1),
                        text.replace('9703,', '0,', 1),
                        text.replace('"79275f6caac624778ad869fa261c88ddc62bc7c0fdb64f0a4d274e8d8a04d439"', 'false', 1),
                        text.replace('7d12e0537458abe969e8c97f461189fbe27f928030d2ca54a45b7aabd8757e81', '0' * 64, 1)]:
            self.assertNotEqual(changed, text)
            p.write_text(changed, encoding='utf-8')
            with self.assertRaises(ValueError):
                packed.delivery_pins(self.site)
        p.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    unittest.main()
