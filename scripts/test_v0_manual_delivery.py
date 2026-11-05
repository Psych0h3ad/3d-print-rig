"""Exact editable-source/gzip generation and approved build-only boundaries."""
from pathlib import Path
import copy
import hashlib
import json
import re
import shutil
import tempfile
import unittest
import build_approved_site as approved
import prepare_v0_manual_delivery as manual

ROOT = Path(__file__).resolve().parents[1]


class ManualDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='manual-data-delivery-')
        self.root = Path(self.temp.name)
        self.site = self.root / 'site'
        for name in (*manual.SOURCE_PATHS, manual.MODULE_PATH):
            target = self.site / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'site' / name, target)
        self.pins = manual.delivery_pins(self.site)
        self.original_module = (self.site / manual.MODULE_PATH).read_text(encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def module(self, pins):
        packed = {name: [p['bytes'], p['sha256'], p['gzip']['bytes'], p['gzip']['sha256']]
                  for name, p in pins.items()}
        for name, pin in pins.items():
            if set(pin) != {'sourcePath', 'bytes', 'sha256', 'gzip'}:
                packed[name].append('unexpected-fields')
        text = re.sub(r'^const packedDelivery=\{[^\n]*\};$',
                      lambda _: 'const packedDelivery=' + json.dumps(packed, separators=(',', ':')) + ';',
                      self.original_module, flags=re.M)
        if any(p['sourcePath'] != self.pins[name]['sourcePath'] for name, p in pins.items()):
            text = text.replace('sourcePath:name===', "sourcePath:'../private.json',unused:name===")
        if any(p['gzip']['path'] != self.pins[name]['gzip']['path'] for name, p in pins.items()):
            text = text.replace("path:'viewer/data/'+name+'.json.gz'", "path:'/wrong.json.gz'")
        (self.site / manual.MODULE_PATH).write_text(text, encoding='utf-8')

    def test_packed_metadata_roundtrip_and_recipe_guards(self):
        self.module(self.pins)
        self.assertEqual(manual.delivery_pins(self.site), self.pins)
        target = self.site / manual.MODULE_PATH
        for mutate in (
            lambda s: s.replace(manual.PACKED_DELIVERY_RECIPE, manual.PACKED_DELIVERY_RECIPE + '\n' + manual.PACKED_DELIVERY_RECIPE),
            lambda s: s.replace("name==='v0-assembly-stages'", "name==='wrong-stage'"),
            lambda s: s.replace('encodedBytes,sha256:encodedSHA256', 'bytes,sha256:encodedSHA256'),
        ):
            target.write_text(mutate(self.original_module), encoding='utf8')
            with self.assertRaises(ValueError):
                manual.delivery_pins(self.site)
        original = json.loads(re.search(r'^const packedDelivery=(.*);$', self.original_module, re.M)[1])
        for row in [[], [1, '0' * 64], [1, '0' * 64, 1, '0' * 64, 'extra'], {'bytes': 1}]:
            packed = copy.deepcopy(original)
            packed['v0-fan-copy'] = row
            text = re.sub(r'^const packedDelivery=.*;$', lambda _: 'const packedDelivery=' + json.dumps(packed) + ';', self.original_module, flags=re.M)
            target.write_text(text, encoding='utf8')
            with self.assertRaises(ValueError):
                manual.delivery_pins(self.site)

    def test_exact_bodies_and_no_raw_delivery(self):
        bodies = manual.build_v0_manual_delivery_bodies(self.site)
        self.assertEqual(len(bodies), 13)
        output = self.root / 'out'
        manual.write_v0_manual_delivery(self.site, output, bodies)
        self.assertEqual(len([p for p in output.rglob('*') if p.is_file()]), 13)
        for body, receipt in bodies:
            self.assertEqual((output / receipt['path']).read_bytes(), body)
        for source in manual.SOURCE_PATHS:
            self.assertFalse((output / source).exists())
        with self.assertRaises(ValueError):
            manual.write_v0_manual_delivery(self.site, output, bodies)

    def test_missing_changed_or_collision(self):
        bodies = manual.build_v0_manual_delivery_bodies(self.site)
        source = self.site / self.pins['v0-fan-assembly']['sourcePath']
        raw = source.read_bytes()
        source.write_bytes(raw + b' ')
        with self.assertRaises(ValueError):
            manual.build_v0_manual_delivery_bodies(self.site)
        source.write_bytes(raw)
        source.unlink()
        with self.assertRaises(FileNotFoundError):
            manual.build_v0_manual_delivery_bodies(self.site)
        source.write_bytes(raw)
        output = self.root / 'raw-collision'
        raw_target = output / next(iter(manual.SOURCE_PATHS))
        raw_target.parent.mkdir(parents=True, exist_ok=True)
        raw_target.write_bytes(b'not-runtime-data')
        with self.assertRaises(ValueError):
            manual.write_v0_manual_delivery(self.site, output, bodies)
        corrupt = copy.deepcopy(bodies)
        corrupt[0] = (corrupt[0][0] + b' ', corrupt[0][1])
        with self.assertRaises(ValueError):
            manual.write_v0_manual_delivery(self.site, self.root / 'corrupt', corrupt)

    def test_exact_paths_and_pin_fields(self):
        for change in (
            lambda p: p.pop('v0-fan-copy'),
            lambda p: p['v0-fan-copy'].update(sourcePath='../private.json'),
            lambda p: p['v0-fan-copy']['gzip'].update(path='/wrong.json.gz'),
            lambda p: p['v0-fan-copy'].update(bytes=True),
            lambda p: p['v0-fan-copy'].update(sha256='0' * 64),
            lambda p: p['v0-fan-copy']['gzip'].update(sha256='0' * 64),
            lambda p: p['v0-fan-copy'].update(extra=True),
        ):
            with self.subTest(change=change):
                pins = copy.deepcopy(self.pins)
                change(pins)
                self.module(pins)
                with self.assertRaises(ValueError):
                    manual.build_v0_manual_delivery_bodies(self.site)

    def test_inventory_approval_and_runtime_collision_guards(self):
        paths = (*manual.SOURCE_PATHS, manual.MODULE_PATH)
        pins = {name: hashlib.sha256((self.site / name).read_bytes()).hexdigest()
                for name in paths}
        inventory = {'files': [{'path': 'site/' + name, 'sha256': digest}
                               for name, digest in pins.items()]}
        docs = self.root / 'docs'
        docs.mkdir()
        inventory_path = docs / 'SOURCE_INVENTORY.json'
        inventory_path.write_text(json.dumps(inventory), encoding='utf-8')
        contract = {'source_catalog_sha256': pins}
        sources = {manual.MODULE_PATH: self.site / manual.MODULE_PATH}
        self.assertEqual(len(approved.approved_manual_delivery(
            self.root, contract, sources, [])), 13)
        self.assertTrue(manual.SOURCE_PATHS <= approved.BUILD_ONLY_SOURCE_PATHS)
        for mutate in (
            lambda c: c['source_catalog_sha256'].pop('V0_ASSEMBLY_STAGES.json'),
            lambda c: c['source_catalog_sha256'].update({manual.MODULE_PATH: '0' * 64}),
        ):
            changed = copy.deepcopy(contract)
            mutate(changed)
            with self.assertRaises(ValueError):
                approved.approved_manual_delivery(self.root, changed, sources, [])
        changed = copy.deepcopy(inventory)
        changed['files'].append(changed['files'][0])
        inventory_path.write_text(json.dumps(changed), encoding='utf-8')
        with self.assertRaises(ValueError):
            approved.approved_manual_delivery(self.root, contract, sources, [])
        inventory_path.write_text(json.dumps(inventory), encoding='utf-8')
        target = self.pins['v0-fan-copy']['gzip']['path']
        with self.assertRaises(ValueError):
            approved.approved_manual_delivery(self.root, contract, sources, [{'path': target}])


if __name__ == '__main__':
    unittest.main()
