"""Preflight every shipped HEAD/MOUNT ledger with the original builder guard."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
import unittest

from build_site import validate_mounting_evidence


def input_maps(value, location=()):
    if isinstance(value, dict):
        for key, child in value.items():
            here = location + (key,)
            if key == 'input_sha256':
                yield here, child
            else:
                yield from input_maps(child, here)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from input_maps(child, location + (index,))


def preflight_mounting_release(root):
    """Inventory maps first, then run the unchanged actual-byte validation."""
    root = Path(root)
    summary = {}
    for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
        evidence = json.loads((root / name).read_bytes())
        maps = dict(input_maps(evidence))
        expected = {('input_sha256',)} | {
            ('machines', machine, 'input_sha256') for machine in evidence['machines']
        }
        if set(maps) != expected:
            raise ValueError(name + ': unhandled or missing mounting input map')
        for location, pins in maps.items():
            if not isinstance(pins, dict):
                raise ValueError(name + ': mounting input map must be an object')
            for relative, digest in pins.items():
                path = PurePosixPath(relative)
                if (path.is_absolute() or '..' in path.parts or '\\' in relative
                        or ':' in relative or not isinstance(digest, str)
                        or re.fullmatch('[a-f0-9]{64}', digest) is None):
                    raise ValueError(name + ': malformed mounting dependency')
        summary[name] = {
            'input_maps': len(maps),
            'input_entries': sum(len(pins) for pins in maps.values()),
        }
    # This retains deck/skirt/native-source bridge interpretation and exact
    # historical pins. No ledger hash, geometry or fit flag is rewritten here.
    validate_mounting_evidence(root)
    return summary


class CurrentShippedMountingLedgerTest(unittest.TestCase):
    def test_current_shipped_inputs_pass_original_builder_preflight(self):
        root = Path(__file__).resolve().parents[1] / 'site'
        result = preflight_mounting_release(root)
        self.assertEqual(set(result), {'HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json'})


class MountingLedgerControlsTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.catalog = b'{"head":"current"}\r\n'
        self.machine = b'{"axis":"source"}\n'
        (self.root / 'catalog.json').write_bytes(self.catalog)
        (self.root / 'machine.json').write_bytes(self.machine)
        (self.root / 'ASSET_BUNDLE.json').write_text(json.dumps({'sha256': 'fixture-bundle'}))
        self.evidence = {
            'model_bundle_sha256': 'fixture-bundle',
            'input_sha256': {'catalog.json': hashlib.sha256(self.catalog).hexdigest()},
            'machines': {'fixture-machine': {'input_sha256': {
                'machine.json': hashlib.sha256(self.machine).hexdigest(),
            }}},
        }
        self.save()

    def save(self):
        for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
            (self.root / name).write_text(json.dumps(self.evidence))

    def test_exact_current_inputs_are_accepted(self):
        result = preflight_mounting_release(self.root)
        self.assertEqual(result['HEAD_VALIDATION.json'], {'input_maps': 2, 'input_entries': 2})

    def test_stale_catalog_pin_in_either_ledger_is_rejected(self):
        for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
            with self.subTest(ledger=name):
                self.save()
                changed = json.loads((self.root / name).read_bytes())
                changed['input_sha256']['catalog.json'] = hashlib.sha256(b'old catalog').hexdigest()
                (self.root / name).write_text(json.dumps(changed))
                with self.assertRaisesRegex(ValueError, name + ': shipped input changed: catalog.json'):
                    preflight_mounting_release(self.root)

    def test_stale_per_machine_pin_in_either_ledger_is_rejected(self):
        for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
            with self.subTest(ledger=name):
                self.save()
                changed = json.loads((self.root / name).read_bytes())
                changed['machines']['fixture-machine']['input_sha256']['machine.json'] = '0' * 64
                (self.root / name).write_text(json.dumps(changed))
                with self.assertRaisesRegex(ValueError, name + ': shipped input changed: machine.json'):
                    preflight_mounting_release(self.root)

    def test_extra_nested_dependency_map_is_not_silently_ignored(self):
        self.evidence['extra'] = {'input_sha256': {'catalog.json': '0' * 64}}
        self.save()
        with self.assertRaisesRegex(ValueError, 'unhandled or missing mounting input map'):
            preflight_mounting_release(self.root)

    def test_missing_per_machine_map_is_rejected(self):
        del self.evidence['machines']['fixture-machine']['input_sha256']
        self.save()
        with self.assertRaisesRegex(ValueError, 'unhandled or missing mounting input map'):
            preflight_mounting_release(self.root)

    def test_missing_dependency_file_is_a_failure(self):
        (self.root / 'machine.json').unlink()
        with self.assertRaises(FileNotFoundError):
            preflight_mounting_release(self.root)

    def test_actual_raw_newlines_are_required(self):
        self.evidence['input_sha256']['catalog.json'] = hashlib.sha256(self.catalog.replace(b'\r\n', b'\n')).hexdigest()
        self.save()
        with self.assertRaisesRegex(ValueError, 'shipped input changed: catalog.json'):
            preflight_mounting_release(self.root)


if __name__ == '__main__':
    unittest.main()
