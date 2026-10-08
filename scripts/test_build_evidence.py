import hashlib
import json
import tempfile
import subprocess
import unittest
from unittest.mock import patch
from pathlib import Path
import build_site
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


class TridentDeckBridgeTest(unittest.TestCase):
    """The new bridge cannot rewrite historical witnesses or waive other inputs."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.before, self.after, self.rows = {}, {}, []
        self.native = {300: '499eb3a15a85d05e719aec548771b4d431a2e041edff2d3724bf716003c9d9e6',
                       350: '4e29878180cd5f56e8895516aafaa7a42086585875f56cd5ca43014965e52198'}
        digest = lambda b: hashlib.sha256(b).hexdigest()
        for size in [300, 350]:
            mid = f'voron_trident_{size}'
            oldfiles, newfiles = {}, {}
            for name in ['model.glb', 'assembly_manifest.json', 'machine_profile.json']:
                path = f'machines/{mid}/' + ('model.glb.gz' if name == 'model.glb' else name)
                old = ('original-' + path).encode()
                new = old if name == 'machine_profile.json' else ('repaired-' + path).encode()
                file = self.root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(new)
                self.before[path], self.after[path] = digest(old), digest(new)
                oldfiles[name] = {'sha256': digest(old), 'bytes': len(old)}
                newfiles[name] = {'sha256': digest(new), 'bytes': len(new)}
            self.rows.append(dict(machine_id=mid, part_key=mid+'_base_1188',
                                 before_width_mm=size-198, after_width_mm=52,
                                 after_native_sha256=self.native[size], native_valid=True,
                                 all_original_binary_bytes_preserved=True,
                                 only_deck_primitive_and_appended_views_accessors_changed=True,
                                 all_nodes_materials_and_other_manifest_rows_preserved=True,
                                 removed_material_mm3=0, outside_repair_region_symmetric_difference_mm3=0,
                                 canonical_source_aperture_symmetric_difference_mm3=0,
                                 before_files=oldfiles, after_files=newfiles))
        other = self.root / 'unrelated.json'
        other.write_bytes(b'unchanged unrelated input\r\n')
        self.evidence = dict(model_bundle_sha256=build_site.TRIDENT_DECK_BASELINE_BUNDLE,
                             enclosure_delta_proof='REAR_ENCLOSURE_QA.json',
                             input_sha256={'unrelated.json': digest(other.read_bytes())},
                             machines={'trident': {'input_sha256': self.before.copy()}})
        for name in ['HEAD_VALIDATION.json', 'MOUNT_VALIDATION.json']:
            (self.root / name).write_text(json.dumps(self.evidence))
        enclosure = dict(model_bundle_sha256=build_site.TRIDENT_DECK_BASELINE_BUNDLE,
                         **{k: {'all_passed': True} for k in ['trident', 'v24', 'retention']})
        (self.root / 'REAR_ENCLOSURE_QA.json').write_text(json.dumps(enclosure))
        (self.root / 'STOCK_SKIRT_RETENTION_QA_92.json').write_bytes(b'original stock scope bytes\r\n')
        self.retained = {n: digest((self.root/n).read_bytes()) for n in build_site.TRIDENT_DECK_RETAINED_PROOFS}
        patches = patch.object(build_site, 'TRIDENT_DECK_RETAINED_PROOFS', self.retained)
        patches.start(); self.addCleanup(patches.stop)
        self.proof_patch = patch.object(build_site, 'TRIDENT_DECK_REPAIR_PROOF_SHA256', '')
        self.proof_patch.start(); self.addCleanup(self.proof_patch.stop)
        self.proof = dict(schema='trident-source-aperture-deck-103', whole_machine_certified=False,
                          baseline_bundle_sha256=build_site.TRIDENT_DECK_BASELINE_BUNDLE,
                          baseline_bundle_bytes=851010521,
                          model_bundle_sha256=build_site.TRIDENT_DECK_REPAIRED_BUNDLE,
                          model_bundle_bytes=build_site.TRIDENT_DECK_REPAIRED_BUNDLE_BYTES,
                          bundle_changed_paths=sorted(p for p in self.after if not p.endswith('machine_profile.json')),
                          baseline_input_sha256=self.before.copy(), input_sha256=self.after.copy(),
                          retained_proof_sha256=self.retained.copy(), bundle_unchanged_members=1200,
                          all_other_bundle_members_byte_identical=True, all_original_proof_bytes_preserved=True,
                          source_revision='a8628f48546948ce1fc15511b7765b7f31f80722',
                          canonical_source_native_sha256='be460563ea7c44bbae51931b107658312165a975c8d442be5a295694f6d45613',
                          canonical_notch=dict(width_mm=52, depth_mm=51.5, sheet_thickness_mm=3, radii_mm=[3,3]),
                          machines=self.rows)
        (self.root/'ASSET_BUNDLE.json').write_text(json.dumps(dict(sha256=build_site.TRIDENT_DECK_REPAIRED_BUNDLE,
                                                     bytes=build_site.TRIDENT_DECK_REPAIRED_BUNDLE_BYTES)))
        self.save_proof()

    def save_proof(self, repin=True):
        file = self.root/'TRIDENT_DECK_REPAIR_103.json'
        file.write_text(json.dumps(self.proof))
        if repin:
            build_site.TRIDENT_DECK_REPAIR_PROOF_SHA256 = hashlib.sha256(file.read_bytes()).hexdigest()

    def test_exact_new_inputs_keep_historical_proofs_and_profile_bytes(self):
        before = {n: (self.root/n).read_bytes() for n in self.retained}
        validate_mounting_evidence(self.root)
        self.assertEqual(before, {n: (self.root/n).read_bytes() for n in self.retained})

    def test_missing_or_modified_bridge_is_rejected(self):
        file = self.root/'TRIDENT_DECK_REPAIR_103.json'
        file.unlink()
        with self.assertRaisesRegex(ValueError, 'pinned Trident'):
            validate_mounting_evidence(self.root)
        self.save_proof()
        file.write_bytes(file.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError, 'pinned Trident'):
            validate_mounting_evidence(self.root)

    def test_original_proof_cannot_be_rewritten_for_new_bundle(self):
        self.evidence['model_bundle_sha256'] = build_site.TRIDENT_DECK_REPAIRED_BUNDLE
        (self.root/'HEAD_VALIDATION.json').write_text(json.dumps(self.evidence))
        with self.assertRaisesRegex(ValueError, 'Retained original proof bytes'):
            validate_mounting_evidence(self.root)

    def test_unrelated_input_has_no_bridge_exception(self):
        (self.root/'unrelated.json').write_bytes(b'changed unrelated input')
        with self.assertRaisesRegex(ValueError, 'shipped input changed: unrelated.json'):
            validate_mounting_evidence(self.root)

    def test_repaired_file_or_unchanged_profile_drift_is_rejected(self):
        for path in ['machines/voron_trident_300/model.glb.gz',
                     'machines/voron_trident_350/machine_profile.json']:
            original = (self.root/path).read_bytes()
            (self.root/path).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'deck repair shipped input changed'):
                validate_mounting_evidence(self.root)
            (self.root/path).write_bytes(original)

    def test_scope_and_allowlist_fail_even_if_candidate_is_repinned(self):
        self.proof['whole_machine_certified'] = True
        self.save_proof()
        with self.assertRaisesRegex(ValueError, 'exceeds its scope'):
            validate_mounting_evidence(self.root)
        self.proof['whole_machine_certified'] = False
        self.proof['bundle_changed_paths'].append('machines/voron_trident_250/model.glb.gz')
        self.save_proof()
        with self.assertRaisesRegex(ValueError, 'exceeds its scope'):
            validate_mounting_evidence(self.root)

    def test_non_source_dimensions_and_false_retention_are_rejected(self):
        self.proof['canonical_notch']['width_mm'] = float('nan')
        self.save_proof()
        with self.assertRaisesRegex(ValueError, 'source aperture'):
            validate_mounting_evidence(self.root)
        self.proof['canonical_notch']['width_mm'] = 52
        self.rows[0]['all_original_binary_bytes_preserved'] = False
        self.save_proof()
        with self.assertRaisesRegex(ValueError, 'single-leaf scope'):
            validate_mounting_evidence(self.root)

    def test_legacy_witness_pin_must_match_exact_before_hash(self):
        path = 'machines/voron_trident_300/model.glb.gz'
        self.evidence['machines']['trident']['input_sha256'][path] = '0'*64
        name = 'HEAD_VALIDATION.json'
        (self.root/name).write_text(json.dumps(self.evidence))
        self.retained[name] = hashlib.sha256((self.root/name).read_bytes()).hexdigest()
        self.proof['retained_proof_sha256'] = self.retained.copy()
        self.save_proof()
        with self.assertRaisesRegex(ValueError, 'match original witness input'):
            validate_mounting_evidence(self.root)

    def test_bridge_cannot_apply_to_arbitrary_bundle(self):
        (self.root/'ASSET_BUNDLE.json').write_text(json.dumps({'sha256':'another-bundle'}))
        with self.assertRaisesRegex(ValueError, 'another model bundle'):
            validate_mounting_evidence(self.root)

    def test_local_archive_outer_pin_is_required_before_unpacking(self):
        file = self.root/'viewer-models.zip'
        file.write_bytes(b'archive fixture')
        info = {'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
        build_site.validate_local_archive(file, info)
        file.write_bytes(b'archive changed')
        with self.assertRaisesRegex(ValueError, 'pinned checksum'):
            build_site.validate_local_archive(file, info)
        file.write_bytes(b'archive fixture')
        info['bytes'] += 1
        with self.assertRaisesRegex(ValueError, 'pinned checksum'):
            build_site.validate_local_archive(file, info)


if __name__ == '__main__':
    unittest.main()
