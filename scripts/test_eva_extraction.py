"""Reject mismatched native receipts and preserve the extraction payload.

The small triangle inputs are parser fixtures, not substitute CAD or hardware.
The actual pinned EVA2 asset is regenerated separately by the release workflow.
"""
import copy
import gzip
import hashlib
import json
import os
import struct
import tempfile
import unittest
from pathlib import Path

from extract_eva_heads import extract, load_native_bounds


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fixture():
    source = dict(source_step_sha256='1'*64, cad_revision=7, repository='https://example.org/public-fixture')
    revision = 'urn:adsk.wipprod:fs.file:vf.fixture?version=7'
    transform = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]
    old, trimmed = [[0, 0, 0], [10, 10, 10]], [[1, 2, 3], [8, 9, 9]]
    records, accepted, parts = [], {}, []
    for key, name in [('328', 'bmo_face v2'), ('332', 'trihorn_duct v2')]:
        path = ['Official fixture', 'EVA Assembly v5:1', name+':1']
        records.append(dict(key=key, name=name, source_path=path, source_valid=True,
                            native_bounds_mm=copy.deepcopy(old), appearance_role='accent', native_adjustment_mm=[0, 0, 0]))
        accepted[key] = dict(name=name+':1', definition=name, source_path=path, native_transform=copy.deepcopy(transform))
        witnesses = []
        for side in range(2):
            for axis in range(3):
                p = [5, 5, 5]
                p[axis] = trimmed[side][axis]
                plane = -10 if side == 0 else 20
                witnesses.append(dict(side=side, axis=axis, point_native_zup_mm=p,
                    exterior_plane_coordinate_mm=plane, native_distance_mm=abs(p[axis]-plane),
                    operation='OpenCascade native BRepExtrema minimum distance to exterior plane', deflection_mm=1e-7))
        parts.append(dict(key='fixture_'+key, source_leaf_key=key, name=name+':1', definition=name,
            source_path=path, source_label_path=['0:1'], source_label_scope='Fixture only', definition_label='0:1',
            original_step_entities=dict(product=1, product_definition=2, next_assembly_usage_occurrence=3),
            native_transform=copy.deepcopy(transform), brep_sha256='2'*64,
            source_revision=revision, source_assembly_sha256='1'*64,
            source_conservative_bounds_native_zup_mm=copy.deepcopy(old),
            source_addoptimal_bounds_native_zup_mm=copy.deepcopy(old), bounds_native_zup_mm=copy.deepcopy(trimmed),
            bounds_method='Six native trimmed BRepExtrema exterior-plane witnesses; no mesh substitution',
            native_bound_extrema=witnesses, source_is_valid=True, geometry_changed=False, placement_changed=False,
            private_debug_path='D:/unpublished/diagnostic.json', elapsed_seconds=42))
    records.append(dict(key='333', name='Unchanged fixture', source_path=['Official fixture', 'Other leaf'],
                        source_valid=True, native_bounds_mm=copy.deepcopy(old), appearance_role='base'))
    recipe = dict(id='fixture', source=source, source_revision='fixture-git-revision', keys=['328', '332', '333'],
        companions={'hotend_mount': ['328'], 'duct': ['332'], 'core': ['333']}, generation=2, version=None,
        version_scope='source_assembly', source_origin_mm=[70, 0, 0],
        native_bounds=dict(source_revision=revision, source_head='EVA Assembly v5', leaves=accepted))
    receipt = dict(source_assembly_sha256='1'*64, source_revision=revision, source_head='EVA Assembly v5',
        eva_generation=2, eva_version=None, version_scope='source_assembly',
        fixed_recipe_source_origin_mm=[70, 0, 0], source_geometry_modified=False,
        source_placements_modified=False, retained_glb_modified=False, tolerance_relaxed=False,
        subset_sha256='3'*64, parts=parts, private_local_file='D:/unpublished/source.step')
    return recipe, receipt, dict(source=source, parts=records)


class NativeBoundsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('EVA_EXTRACTION_TEST_TMP'))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.recipe, self.receipt, self.manifest = fixture()
        self.receipt_file = self.root/'receipt.json'
        self.seal_receipt()

    def seal_receipt(self):
        raw = (json.dumps(self.receipt)+'\n').encode()
        self.receipt_file.write_bytes(raw)
        self.recipe['native_bounds']['receipt_sha256'] = digest(raw)

    def read(self):
        return load_native_bounds(self.recipe, self.receipt_file, self.manifest)

    def test_accepts_two_source_identical_leaves_and_sanitizes(self):
        patches, public = self.read()
        self.assertEqual(set(patches), {'328', '332'})
        text = json.dumps(public)
        self.assertNotIn('unpublished', text)
        self.assertNotIn('elapsed_seconds', text)
        self.assertEqual(public['parts'][0]['source_conservative_bounds_native_zup_mm'], [[0, 0, 0], [10, 10, 10]])

    def test_rejects_tampered_receipt_hash(self):
        self.receipt_file.write_bytes(self.receipt_file.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError, 'receipt hash'):
            self.read()

    def test_rejects_wrong_source_step_even_if_resealed(self):
        self.receipt['source_assembly_sha256'] = '9'*64
        self.seal_receipt()
        with self.assertRaisesRegex(ValueError, 'provenance'):
            self.read()

    def test_rejects_wrong_source_revision_even_if_resealed(self):
        self.receipt['source_revision'] = self.receipt['source_revision'].replace('version=7', 'version=8')
        self.seal_receipt()
        with self.assertRaisesRegex(ValueError, 'provenance'):
            self.read()

    def test_rejects_wrong_leaf_name_or_path_even_if_resealed(self):
        for field, value in [('definition', 'Different source'), ('name', 'Wrong occurrence'), ('source_path', ['Other assembly'])]:
            with self.subTest(field=field):
                original = self.receipt['parts'][0][field]
                self.receipt['parts'][0][field] = value
                self.seal_receipt()
                with self.assertRaisesRegex(ValueError, 'source identity'):
                    self.read()
                self.receipt['parts'][0][field] = original
        self.seal_receipt()

    def test_rejects_wrong_native_transform_even_if_resealed(self):
        self.receipt['parts'][0]['native_transform'][0][3] = .001
        self.seal_receipt()
        with self.assertRaisesRegex(ValueError, 'source transform'):
            self.read()

    def test_rejects_nonfinite_transform(self):
        self.receipt['parts'][0]['native_transform'][0][0] = float('nan')
        self.seal_receipt()
        with self.assertRaisesRegex(ValueError, 'transform'):
            self.read()

    def test_rejects_original_conservative_bounds_mismatch(self):
        self.manifest['parts'][0]['native_bounds_mm'][0][1] = .01
        with self.assertRaisesRegex(ValueError, 'conservative bounds differ'):
            self.read()

    def test_rejects_missing_or_duplicate_source_leaf(self):
        original = copy.deepcopy(self.receipt['parts'])
        for parts in [original[:1], [original[0], original[0]]]:
            with self.subTest(count=len(parts)):
                self.receipt['parts'] = parts
                self.seal_receipt()
                with self.assertRaises(ValueError):
                    self.read()

    def test_rejects_unwitnessed_trimmed_bounds(self):
        self.receipt['parts'][0]['bounds_native_zup_mm'][0][1] += .01
        self.seal_receipt()
        with self.assertRaisesRegex(ValueError, 'witness'):
            self.read()

    def test_requires_pinned_input(self):
        with self.assertRaisesRegex(ValueError, 'input is required'):
            load_native_bounds(self.recipe, None, self.manifest)

    def test_metadata_correction_keeps_decoded_glb_byte_identical(self):
        vertices = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
        doc = dict(asset={'version': '2.0'}, scene=0, scenes=[{'nodes': [0, 1, 2]}],
            nodes=[{'name': 'part_'+key, 'mesh': 0} for key in ['328', '332', '333']],
            meshes=[{'primitives': [{'attributes': {'POSITION': 0}}]}],
            accessors=[{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'}],
            bufferViews=[{'buffer': 0, 'byteOffset': 0, 'byteLength': len(vertices)}],
            buffers=[{'byteLength': len(vertices)}], materials=[])
        encoded = json.dumps(doc).encode()
        encoded += b' '*(-len(encoded)%4)
        glb = struct.pack('<IIIII', 0x46546c67, 2, 28+len(encoded)+len(vertices), len(encoded), 0x4e4f534a)
        glb += encoded+struct.pack('<II', len(vertices), 0x004e4942)+vertices
        profile = dict(origin_mm=[70, 0, 0], basis=[[1, 0, 0], [0, 0, 1], [0, -1, 0]], source=self.recipe['source'])
        model_file, manifest_file, profile_file, recipe_file = [self.root/name for name in ['model.glb', 'manifest.json', 'profile.json', 'recipe.json']]
        model_file.write_bytes(glb)
        manifest_file.write_text(json.dumps(self.manifest))
        profile_file.write_text(json.dumps(profile))
        self.recipe.update(model_file_sha256=digest(glb), decoded_model_sha256=digest(glb),
            manifest_sha256=digest(manifest_file.read_bytes()), source_profile_sha256=digest(profile_file.read_bytes()))
        baseline = copy.deepcopy(self.recipe)
        del baseline['native_bounds']
        recipe_file.write_text(json.dumps(baseline))
        extract(recipe_file, model_file, manifest_file, self.root/'baseline', profile_file)
        before = gzip.decompress((self.root/'baseline/model.glb.gz').read_bytes())
        self.recipe['expected_extracted_glb_sha256'] = digest(before)
        recipe_file.write_text(json.dumps(self.recipe))
        extract(recipe_file, model_file, manifest_file, self.root/'corrected', profile_file, self.receipt_file)
        after = gzip.decompress((self.root/'corrected/model.glb.gz').read_bytes())
        self.assertEqual(before, after)
        old_parts = json.loads((self.root/'baseline/parts.json').read_text())['parts']
        new_parts = json.loads((self.root/'corrected/parts.json').read_text())['parts']
        self.assertEqual(old_parts[2], new_parts[2])
        self.assertEqual(new_parts[0]['native_bounds_mm'], [[1, 2, 3], [8, 9, 9]])
        self.assertEqual(new_parts[0]['source_conservative_native_bounds_mm'], [[0, 0, 0], [10, 10, 10]])
        self.assertEqual(new_parts[0]['bounds_mm'], [[-69, 2, 3], [-62, 9, 9]])


if __name__ == '__main__':
    unittest.main()
