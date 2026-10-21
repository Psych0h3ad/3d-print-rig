"""Receipt/serialization regressions only; these fixtures do not certify fit."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / 'scripts/generate_ender_bowden_shapes.py'
JAVASCRIPT = ROOT / 'site/viewer/ender-bowden-shapes.mjs'
spec = importlib.util.spec_from_file_location('ender_bowden_generator', GENERATOR)
generator = importlib.util.module_from_spec(spec)
# Importing and combining must work on CI without scientific packages.
with patch.dict(sys.modules, {'numpy': None, 'scipy': None}):
    spec.loader.exec_module(generator)


class BowdenProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.javascript = JAVASCRIPT.read_bytes()
        data = json.loads(self.javascript.decode('utf8').split('=', 1)[1].rstrip(';\r\n'))
        self.receipts = []
        for fitting in ('stock', 'belted'):
            receipt = {k: copy.deepcopy(v) for k, v in data.items() if k not in ('stock', 'belted', 'harmonics')}
            receipt.update(fitting=fitting, parameters=data[fitting],
                           # Synthetic observations isolate packaging validation.
                           observations=[{'endpoint_error_mm': 0, 'minimum_constraint': 0}
                                         for _ in range(len(data['x_mm'])*len(data['z_mm']))])
            self.receipts.append(receipt)

    def test_valid_pack_preserves_exact_existing_bytes_and_inputs(self):
        before = copy.deepcopy(self.receipts)
        with patch.dict(sys.modules, {'numpy': None, 'scipy': None}):
            result = generator.combine_receipts(*self.receipts)
        self.assertEqual(result.encode('utf8'), self.javascript)
        self.assertEqual(self.receipts, before)

    def test_missing_stale_and_contradictory_pins_on_either_fitting(self):
        for key in ('source_manifest_sha256', 'source_profile_sha256', 'source_model_sha256'):
            for changed in ((0,), (1,), (0, 1)):
                for replacement in (None, '0'*64):
                    with self.subTest(pin=key, fittings=changed, replacement=replacement):
                        receipts = copy.deepcopy(self.receipts)
                        for i in changed:
                            if replacement is None:
                                receipts[i].pop(key)
                            else:
                                receipts[i][key] = replacement
                        with self.assertRaisesRegex(ValueError, key):
                            generator.combine_receipts(*receipts)

    def test_swapped_and_duplicate_fittings_rejected(self):
        stock, belted = self.receipts
        for receipts in ((belted, stock), (stock, stock), (belted, belted)):
            with self.subTest(fittings=[r['fitting'] for r in receipts]):
                with self.assertRaisesRegex(ValueError, 'wrong fitting'):
                    generator.combine_receipts(*receipts)

    def test_invalid_grid_coefficients_neck_and_observations_rejected(self):
        for defect in ('grid', 'coefficient', 'neck', 'observation'):
            with self.subTest(defect=defect):
                receipts = copy.deepcopy(self.receipts)
                if defect == 'grid':
                    for receipt in receipts:
                        receipt['x_mm'][0] += 1
                elif defect == 'coefficient':
                    receipts[1]['parameters'][0][0][0] = float('nan')
                elif defect == 'neck':
                    receipts[1]['parameters'][0][0][0] += 1
                else:
                    receipts[1]['observations'][0]['minimum_constraint'] = -1
                with self.assertRaises(ValueError):
                    generator.combine_receipts(*receipts)

    def test_new_fit_receipt_records_the_actual_input_pins(self):
        # Exercise the actual receipt constructor without invoking the solver.
        # Distinct fixture pins reveal accidental substitution of constants.
        tree = ast.parse(GENERATOR.read_text('utf8'))
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        constructor = next(n for n in main.body if isinstance(n, ast.Assign)
                           and any(isinstance(t, ast.Name) and t.id == 'data' for t in n.targets))
        scope = dict(args=SimpleNamespace(fitting='stock'), LENGTH=450, X=[0], Z=[0],
                     pin={'sha256': 'recorded-manifest'}, profile_pin={'sha256': 'recorded-profile'},
                     spec={'files': {'model.glb': {'decoded_sha256': 'recorded-model'}}},
                     values=[], observations=[])
        exec(compile(ast.Module(body=[constructor], type_ignores=[]), str(GENERATOR), 'exec'), scope)
        self.assertEqual(scope['data']['source_manifest_sha256'], 'recorded-manifest')
        self.assertEqual(scope['data']['source_profile_sha256'], 'recorded-profile')
        self.assertEqual(scope['data']['source_model_sha256'], 'recorded-model')

    def test_cli_rejects_before_writing_and_valid_pack_is_byte_identical(self):
        # Run actual main with site packages disabled and assertions optimized
        # away: provenance checks must still execute, without NumPy or SciPy.
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            inputs = [directory / 'stock.json', directory / 'belted.json']
            output = directory / 'shapes.mjs'
            command = [sys.executable, '-B', '-S', '-O', str(GENERATOR), '--combine',
                       *(str(p) for p in inputs), '--output', str(output)]
            for key in ('source_profile_sha256', 'source_model_sha256'):
                for missing in (True, False):
                    receipts = copy.deepcopy(self.receipts)
                    if missing:
                        receipts[1].pop(key)
                    else:
                        receipts[1][key] = '0'*64
                    for p, receipt in zip(inputs, receipts):
                        p.write_text(json.dumps(receipt), encoding='utf8')
                    with self.subTest(pin=key, missing=missing):
                        result = subprocess.run(command, capture_output=True, text=True, timeout=15)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn(key, result.stderr)
                        self.assertFalse(output.exists())
                        output.write_bytes(b'keep existing output\n')
                        result = subprocess.run(command, capture_output=True, text=True, timeout=15)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertEqual(output.read_bytes(), b'keep existing output\n')
                        output.unlink()
            for p, receipt in zip(inputs, self.receipts):
                p.write_text(json.dumps(receipt), encoding='utf8')
            result = subprocess.run(command, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(output.read_bytes(), self.javascript)


if __name__ == '__main__':
    unittest.main()
