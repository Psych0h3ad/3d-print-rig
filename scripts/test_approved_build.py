import hashlib,json,pathlib,tempfile,unittest,sys,io,urllib.error,subprocess
import contextlib
from unittest.mock import patch
import build_site,build_approved_site
import delivery_audit_context
from build_approved_site import run,validate_contract,safe_path

class ApprovedBuild(unittest.TestCase):
    def test_transient_acquisition_retries_same_pinned_body(self):
        data = b'approved body'
        row = {'url': 'https://psych0h3ad.github.io/model.bin', 'path': 'model.bin', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        response = io.BytesIO(data);response.url = row['url']
        failures = [urllib.error.HTTPError(row['url'], 503, 'Unavailable', {}, None), TimeoutError('read timeout'), response]
        with tempfile.TemporaryDirectory() as folder, patch.object(build_approved_site.urllib.request, 'urlopen', side_effect=failures) as opened, patch.object(build_approved_site.time, 'sleep') as slept:
            dest = pathlib.Path(folder)/'model.bin'
            build_approved_site.fetch_pinned_body(row, dest)
            self.assertEqual(dest.read_bytes(), data)
            self.assertEqual(opened.call_count, 3)
            self.assertEqual([call.args[0] for call in slept.call_args_list], [1, 3])
            self.assertEqual({call.args[0].full_url for call in opened.call_args_list}, {row['url']})

    def test_acquisition_does_not_retry_bad_pins_redirects_or_permanent_errors(self):
        row = {'url': 'https://psych0h3ad.github.io/model.bin', 'path': 'model.bin', 'bytes': 4, 'sha256': hashlib.sha256(b'good').hexdigest()}
        for data, url in [(b'evil', row['url']), (b'too long', row['url']), (b'good', 'https://unapproved.example/model.bin')]:
            response = io.BytesIO(data);response.url = url
            with tempfile.TemporaryDirectory() as folder, patch.object(build_approved_site.urllib.request, 'urlopen', return_value=response) as opened, patch.object(build_approved_site.time, 'sleep') as slept:
                with self.assertRaises(ValueError):build_approved_site.fetch_pinned_body(row, pathlib.Path(folder)/'model.bin')
                self.assertEqual(opened.call_count, 1);slept.assert_not_called()
        for code, attempts in [(404, 1), (503, 3)]:
            error = urllib.error.HTTPError(row['url'], code, 'Unavailable', {}, None)
            with tempfile.TemporaryDirectory() as folder, patch.object(build_approved_site.urllib.request, 'urlopen', side_effect=error) as opened, patch.object(build_approved_site.time, 'sleep'):
                with self.assertRaises(urllib.error.HTTPError):build_approved_site.fetch_pinned_body(row, pathlib.Path(folder)/'model.bin')
                self.assertEqual(opened.call_count, attempts)

    def test_actual_file_transport_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);(root/'site').mkdir();(root/'docs').mkdir()
            source=root/'site/index.html';source.write_bytes(b'<html>Viewer</html>')
            (root/'docs/SOURCE_INVENTORY.json').write_text(json.dumps({'files':[{'path':'site/index.html','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}]}))
            coverage=root/'docs/MACHINE_REVIEW_COVERAGE.json';coverage.write_text(json.dumps({'machines':[{'id':'machine','known_required_companion_failures':[]}]}))
            data=root/'actual.bin';data.write_bytes(bytes(range(256))*8192)
            record={'path':'models/model.bin','url':'https://psych0h3ad.github.io/3d-print-rig/models/model.bin','bytes':data.stat().st_size,'sha256':hashlib.sha256(data.read_bytes()).hexdigest(),'approval_receipt_sha256':'1'*64}
            contract={'schema':'approved-static-delivery-v1','machine_ids':['machine'],'files':[record]};inputs={'files':{record['path']:str(data)}}
            result=run(root,contract,root/'built',inputs);self.assertTrue(result['deployment_ready']);self.assertEqual((root/'built/models/model.bin').read_bytes(),data.read_bytes())
            self.assertLess(result['planned_site_bytes'],result['site_limit_bytes']);self.assertFalse(result['legacy_archive_opened'])
            broken=json.loads(json.dumps(contract));broken['files'][0]['sha256']='0'*64
            with self.assertRaisesRegex(ValueError,'Missing exact approved inputs'):run(root,broken,root/'wrong',inputs,True,True)
            with self.assertRaisesRegex(ValueError,'Missing exact approved inputs'):run(root,contract,root/'missing',{'files':{}},True,True)
            coverage.write_text(json.dumps({'machines':[{'id':'machine','known_required_companion_failures':['Missing genuine fan']}]}))
            plan=run(root,contract,root/'held',inputs,True,True);self.assertFalse(plan['deployment_ready']);self.assertEqual(len(plan['release_failures']),1)
            with self.assertRaisesRegex(ValueError,'Required release findings'):run(root,contract,root/'held',inputs)
    def test_normal_entry_stops_at_approved_failure_without_archive_or_mirror_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            target=pathlib.Path(folder)/'site'
            with patch.object(sys,'argv',['build_site.py','--output',str(target)]), patch.object(build_approved_site,'main',side_effect=ValueError('Required release findings remain')) as approved, patch.object(build_site,'unpack_assets',side_effect=AssertionError('Archive path reached')) as archive, patch.object(build_site.urllib.request,'urlopen',side_effect=AssertionError('Mirror retry reached')) as network:
                with self.assertRaisesRegex(ValueError,'Required release findings'):build_site.main()
                approved.assert_called_once();archive.assert_not_called();network.assert_not_called();self.assertFalse(target.exists())
    def test_archives_traversal_duplicates_and_omissions_rejected(self):
        for name in ['../model.bin','C:/model.bin','model.zip','model.7z','model.step','a\\model.bin','a//model.bin','.','a/./model.bin',None]:
            with self.subTest(name=name),self.assertRaises(ValueError):safe_path(name)
        row={'path':'model.bin','bytes':10,'sha256':'0'*64,'url':'https://github.com/project/release/archive.zip','approval_receipt_sha256':'1'*64}
        with self.assertRaises(ValueError):validate_contract({'schema':'approved-static-delivery-v1','files':[row]})
        row['url']='https://psych0h3ad.github.io/model.bin'
        with self.assertRaisesRegex(ValueError,'Duplicate'):validate_contract({'schema':'approved-static-delivery-v1','files':[row,row]})

class ApprovedBuildOnlySources(unittest.TestCase):
    """Build authentication and served bytes, using tiny local bodies only."""

    def setUp(self):
        network = patch.object(build_approved_site.urllib.request, 'urlopen',
                               side_effect=AssertionError('No live fixture requests'))
        self.urlopen = network.start(); self.addCleanup(network.stop)

    def fixture(self, nested=False, inventory_manifest=True):
        folder = tempfile.TemporaryDirectory(); self.addCleanup(folder.cleanup)
        root = pathlib.Path(folder.name)
        (root/'site').mkdir(); (root/'docs').mkdir()
        source_bodies = {'index.html': b'<html>Tiny approved build</html>',
                         'APPROVED_DELIVERY.json': b'{"build_only":true}\n'}
        runtime_name = 'runtime/APPROVED_DELIVERY.json' if nested else 'runtime/body.bin'
        if nested:
            source_bodies['static/APPROVED_DELIVERY.json'] = b'{"static":true}\n'
        inventory = []
        for name, data in source_bodies.items():
            file = root/'site'/name; file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
            if inventory_manifest or name != 'APPROVED_DELIVERY.json':
                inventory.append({'path': 'site/'+name, 'sha256': hashlib.sha256(data).hexdigest()})
        (root/'docs/SOURCE_INVENTORY.json').write_text(json.dumps({'files': inventory}))
        (root/'docs/MACHINE_REVIEW_COVERAGE.json').write_text(json.dumps({'machines': [{'id': 'fixture'}]}))
        body = root/'private-runtime'; body.write_bytes(b'{"runtime":"exact pinned body"}\n')
        row = {'path': runtime_name, 'bytes': body.stat().st_size,
               'sha256': build_approved_site.digest(body),
               'url': 'https://psych0h3ad.github.io/'+runtime_name, 'approval_receipt_sha256': '1'*64}
        contract = {'schema': 'approved-static-delivery-v1', 'machine_ids': ['fixture'], 'files': [row]}
        return root, contract, {'files': {runtime_name: str(body)}}, source_bodies

    def test_root_manifest_not_copied_or_counted_in_plan_and_build(self):
        root, contract, inputs, sources = self.fixture()
        expected = len(sources['index.html']) + contract['files'][0]['bytes']
        self.assertEqual(set(build_approved_site.source_files(root)), {'index.html'})
        for plan_only in [True, False]:
            with self.subTest(plan_only=plan_only):
                output = root/('plan' if plan_only else 'built')
                result = run(root, contract, output, inputs, plan_only=plan_only, verify_inputs=True)
                self.assertEqual(result['planned_site_bytes'], expected)
                self.assertEqual(result['site_limit_bytes'], 990_000_000)
                self.assertEqual(result['source_files'], 1)
                self.assertEqual(result['runtime_files'], 1)
                self.assertEqual(result['verified_exact_bodies'], 1)
                self.assertFalse((output/'APPROVED_DELIVERY.json').exists())
                if plan_only:
                    self.assertFalse(output.exists())
                else:
                    self.assertTrue(result['deployment_ready'])
                    self.assertEqual({p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()},
                                     {'index.html', contract['files'][0]['path'], '.nojekyll'})
                    self.assertEqual(sum(p.stat().st_size for p in output.rglob('*') if p.is_file()), expected)
                    row = contract['files'][0]
                    self.assertEqual(build_approved_site.digest(output/row['path']), row['sha256'])
        self.assertEqual((root/'site/APPROVED_DELIVERY.json').read_bytes(), sources['APPROVED_DELIVERY.json'])
        self.urlopen.assert_not_called()

    def test_nested_same_basename_static_and_runtime_retained(self):
        root, contract, inputs, sources = self.fixture(nested=True)
        expected_sources = {'index.html', 'static/APPROVED_DELIVERY.json'}
        self.assertEqual(set(build_approved_site.source_files(root)), expected_sources)
        expected = sum(len(sources[name]) for name in expected_sources) + contract['files'][0]['bytes']
        for plan_only in [True, False]:
            with self.subTest(plan_only=plan_only):
                output = root/('plan' if plan_only else 'built')
                result = run(root, contract, output, inputs, plan_only=plan_only, verify_inputs=True)
                self.assertEqual(result['planned_site_bytes'], expected)
                self.assertEqual(result['source_files'], 2)
                self.assertEqual(result['verified_exact_bodies'], 1)
                if not plan_only:
                    self.assertEqual((output/'static/APPROVED_DELIVERY.json').read_bytes(),
                                     sources['static/APPROVED_DELIVERY.json'])
                    row = contract['files'][0]
                    self.assertEqual((output/row['path']).read_bytes(), pathlib.Path(inputs['files'][row['path']]).read_bytes())
                    self.assertEqual(build_approved_site.digest(output/row['path']), row['sha256'])
                    self.assertFalse((output/'APPROVED_DELIVERY.json').exists())

    def test_excluded_manifest_checksum_still_enforced_in_plan_and_build(self):
        root, contract, inputs, _ = self.fixture()
        (root/'site/APPROVED_DELIVERY.json').write_bytes(b'{"build_only":evil}\n')
        for plan_only in [True, False]:
            with self.subTest(plan_only=plan_only):
                output = root/('plan' if plan_only else 'built')
                with self.assertRaisesRegex(ValueError, r'Changed source snapshot: APPROVED_DELIVERY\.json'):
                    run(root, contract, output, inputs, plan_only=plan_only)
                self.assertFalse(output.exists())
        self.urlopen.assert_not_called()

    def test_missing_excluded_manifest_still_rejected(self):
        root, contract, inputs, _ = self.fixture()
        (root/'site/APPROVED_DELIVERY.json').unlink()
        for plan_only in [True, False]:
            with self.subTest(plan_only=plan_only):
                output = root/('plan' if plan_only else 'built')
                with self.assertRaises(FileNotFoundError):
                    run(root, contract, output, inputs, plan_only=plan_only)
                self.assertFalse(output.exists())

    def test_runtime_cannot_reintroduce_root_manifest_even_without_inventory_row(self):
        for inventoried in [True, False]:
            root, contract, inputs, sources = self.fixture(inventory_manifest=inventoried)
            name = 'APPROVED_DELIVERY.json'; data = sources[name]
            contract['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                'url': 'https://psych0h3ad.github.io/'+name, 'approval_receipt_sha256': '1'*64})
            inputs['files'][name] = str(root/'site'/name)
            # Both rows are valid pins; rejection must not rely on a source collision.
            validate_contract(contract)
            for plan_only in [True, False]:
                with self.subTest(inventoried=inventoried, plan_only=plan_only):
                    output = root/('plan' if plan_only else 'built')
                    with self.assertRaisesRegex(ValueError, 'Build-only source path cannot be an approved runtime body'):
                        run(root, contract, output, inputs, plan_only=plan_only)
                    self.assertFalse(output.exists())
        self.urlopen.assert_not_called()

    def test_nested_same_basename_runtime_checksum_still_enforced(self):
        root, contract, inputs, _ = self.fixture(nested=True)
        row = contract['files'][0]; body = pathlib.Path(inputs['files'][row['path']])
        body.write_bytes(b'X'*row['bytes'])
        for plan_only in [True, False]:
            with self.subTest(plan_only=plan_only):
                output = root/('plan' if plan_only else 'built')
                with self.assertRaisesRegex(ValueError, 'Missing exact approved inputs'):
                    run(root, contract, output, inputs, plan_only=plan_only, verify_inputs=True)
                self.assertFalse((output/'.nojekyll').exists())
        self.urlopen.assert_not_called()


class ApprovedDeliveryAuditContext(unittest.TestCase):
    """Exact audit metadata lifecycle; all audits and builds are tiny mocks."""

    def setUp(self):
        for owner, name in [(build_approved_site.urllib.request, 'urlopen'),
                            (delivery_audit_context.subprocess, 'run')]:
            guard = patch.object(owner, name, side_effect=AssertionError('No live audit or asset requests'))
            guard.start(); self.addCleanup(guard.stop)

    def fixture(self, existing_site=True):
        folder = tempfile.TemporaryDirectory(); self.addCleanup(folder.cleanup)
        root = pathlib.Path(folder.name); site = root/'assembled'
        # Deliberate CRLF/whitespace: raw pinned bytes must not be reserialized.
        body = b'{\r\n  "fixture": "exact audit contract"\r\n}\r\n'
        source = root/'custom-delivery.json'; source.write_bytes(body)
        if existing_site:
            site.mkdir(); (site/'runtime.bin').write_bytes(b'tiny runtime')
        return root, source, site, body, hashlib.sha256(body).hexdigest()

    def test_context_exposes_exact_contract_only_during_successful_audit(self):
        _, source, site, body, pin = self.fixture()
        target = site/'APPROVED_DELIVERY.json'
        self.assertFalse(target.exists())
        with delivery_audit_context.audit_delivery_contract(source, site, pin) as staged:
            self.assertEqual(staged, target)
            self.assertEqual(target.read_bytes(), body)
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), pin)
        self.assertFalse(target.exists())
        self.assertEqual(source.read_bytes(), body)
        self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')

    def test_failed_audit_cleans_unchanged_contract_and_preserves_failure(self):
        _, source, site, body, pin = self.fixture()
        failure = subprocess.CalledProcessError(9, ['fixture-audit'])
        with self.assertRaises(subprocess.CalledProcessError) as raised:
            with delivery_audit_context.audit_delivery_contract(source, site, pin):
                self.assertEqual((site/'APPROVED_DELIVERY.json').read_bytes(), body)
                raise failure
        self.assertIs(raised.exception, failure)
        self.assertFalse((site/'APPROVED_DELIVERY.json').exists())
        self.assertEqual(source.read_bytes(), body)
        self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')

    def test_changed_source_pin_rejected_before_audit_metadata_is_created(self):
        _, source, site, body, pin = self.fixture()
        source.write_bytes(body.replace(b'exact', b'other'))
        with self.assertRaisesRegex(ValueError, 'Delivery contract changed'):
            with delivery_audit_context.audit_delivery_contract(source, site, pin):
                self.fail('An unpinned source must never reach the audit')
        self.assertFalse((site/'APPROVED_DELIVERY.json').exists())
        self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')

    def test_preexisting_manifest_rejected_and_preserved_even_if_byte_identical(self):
        for identical in [True, False]:
            with self.subTest(identical=identical):
                _, source, site, body, pin = self.fixture()
                target = site/'APPROVED_DELIVERY.json'
                previous = body if identical else b'preexisting unrelated metadata'
                target.write_bytes(previous)
                with self.assertRaises(FileExistsError):
                    with delivery_audit_context.audit_delivery_contract(source, site, pin):
                        self.fail('A preexisting manifest must never be borrowed or overwritten')
                self.assertEqual(target.read_bytes(), previous)
                self.assertEqual(source.read_bytes(), body)

    def test_changed_staged_contract_fails_closed_and_is_preserved_on_any_exit(self):
        for audit_fails in [False, True]:
            with self.subTest(audit_fails=audit_fails):
                _, source, site, body, pin = self.fixture()
                target = site/'APPROVED_DELIVERY.json'; changed = body.replace(b'exact', b'other')
                with self.assertRaisesRegex(ValueError, 'Temporary audit contract changed'):
                    with delivery_audit_context.audit_delivery_contract(source, site, pin):
                        target.write_bytes(changed)
                        if audit_fails:
                            raise subprocess.CalledProcessError(9, ['fixture-audit'])
                self.assertEqual(target.read_bytes(), changed)
                self.assertEqual(source.read_bytes(), body)
                self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')

    def normal_build(self, audit_fails=False, change_source=False):
        root, source, site, body, _ = self.fixture(existing_site=False)
        target = site/'APPROVED_DELIVERY.json'; events = []
        failure = subprocess.CalledProcessError(9, ['mandatory-fixture-audit'])
        def approved_build():
            events.append('build')
            self.assertFalse(site.exists())
            site.mkdir(); (site/'runtime.bin').write_bytes(b'tiny runtime')
            self.assertFalse(target.exists())
            if change_source: source.write_bytes(body.replace(b'exact', b'other'))
        def actual_audit(output):
            events.append('audit')
            self.assertEqual(output, site.resolve())
            self.assertEqual(target.read_bytes(), body)
            self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')
            if audit_fails: raise failure
        argv = ['build_site.py', '--output', str(site), '--delivery', str(source)]
        with patch.object(sys, 'argv', argv), patch.object(build_site, 'ROOT', root), \
                patch.object(build_approved_site, 'main', side_effect=approved_build) as approved, \
                patch.object(build_site, '_audit_built_runtime', side_effect=actual_audit) as audit, \
                patch.object(build_site, 'compact_generated_reviews', side_effect=lambda _: events.append('compact')) as compact, \
                patch.object(build_site, 'MAX_SITE_BYTES', len(b'tiny runtime')+1), \
                patch('sys.stdout', new_callable=io.StringIO) as stdout:
            if change_source:
                with self.assertRaisesRegex(ValueError, 'Delivery contract changed'):
                    build_site.main()
                audit.assert_not_called()
            elif audit_fails:
                with self.assertRaises(subprocess.CalledProcessError) as raised:
                    build_site.main()
                self.assertIs(raised.exception, failure)
            else:
                build_site.main()
                self.assertIn('Static viewer built (12 bytes).', stdout.getvalue())
            approved.assert_called_once_with()
            if not change_source: audit.assert_called_once_with(site.resolve())
            if change_source or audit_fails: self.assertEqual(stdout.getvalue(), '')
            if change_source or audit_fails: compact.assert_not_called()
            else: compact.assert_called_once_with(site.resolve())
        self.assertEqual(events, ['build'] if change_source else ['build', 'audit'] if audit_fails else ['build', 'audit', 'compact'])
        self.assertFalse(target.exists())
        self.assertEqual({p.name for p in site.iterdir()}, {'runtime.bin'})
        self.assertEqual((site/'runtime.bin').read_bytes(), b'tiny runtime')
        if not change_source: self.assertEqual(source.read_bytes(), body)

    def test_normal_build_audit_sees_exact_custom_delivery_and_final_size_excludes_it(self):
        self.normal_build()

    def test_normal_build_audit_failure_propagates_without_final_root_manifest(self):
        self.normal_build(audit_fails=True)

    def test_normal_build_pins_source_before_build_and_rejects_changed_delivery(self):
        self.normal_build(change_source=True)

    def test_cli_wraps_exact_command_and_cleans_on_success_or_failed_audit(self):
        for audit_fails in [False, True]:
            with self.subTest(audit_fails=audit_fails):
                _, source, site, body, pin = self.fixture()
                command = ['fixture-audit', '--site', str(site), '--strict-pins']
                failure = subprocess.CalledProcessError(9, command)
                def audit(command_args, **kwargs):
                    self.assertEqual(command_args, command)
                    self.assertEqual(kwargs, {'check': True})
                    self.assertEqual((site/'APPROVED_DELIVERY.json').read_bytes(), body)
                    if audit_fails: raise failure
                    return subprocess.CompletedProcess(command_args, 0)
                argv = ['delivery_audit_context.py', '--delivery', str(source), '--site', str(site),
                        '--expected-sha256', pin, '--', *command]
                with patch.object(sys, 'argv', argv), \
                        patch.object(delivery_audit_context.subprocess, 'run', side_effect=audit) as invoked:
                    if audit_fails:
                        with self.assertRaises(subprocess.CalledProcessError) as raised:
                            delivery_audit_context.main()
                        self.assertIs(raised.exception, failure)
                    else:
                        delivery_audit_context.main()
                    invoked.assert_called_once_with(command, check=True)
                self.assertFalse((site/'APPROVED_DELIVERY.json').exists())
                self.assertEqual(source.read_bytes(), body)


class ApprovedEquipmentBuildGates(unittest.TestCase):
    """Tiny exact-body fixtures only: mocked plan, preparer and audit subprocess.

    These tests exercise orchestration/evidence rejection, never certify actual
    exported geometry or turn a synthetic catalog into release evidence.
    """

    def setUp(self):
        self.plans = {}; self.prepared = {}
        for obj, name, kwargs in [
            (build_approved_site.shutil, 'which', {'return_value': 'node'}),
            (build_approved_site.layout_equipment_inputs, 'checked_plan',
             {'side_effect': lambda root: self.plans[root]}),
            (build_approved_site.layout_equipment_inputs, 'prepare_equipment_inputs',
             {'side_effect': lambda root: self.prepared[root]}),
            (build_approved_site.urllib.request, 'urlopen',
             {'side_effect': AssertionError('No live fixture requests')}),
        ]:
            mock = patch.object(obj, name, **kwargs)
            setattr(self, name, mock.start()); self.addCleanup(mock.stop)

    def fixture(self, equipment=True, external=False):
        import gzip
        folder = tempfile.TemporaryDirectory(); self.addCleanup(folder.cleanup)
        root = pathlib.Path(folder.name)
        for name in ['docs', 'site', 'scripts']: (root/name).mkdir()
        source = root/'site/index.html'; source.write_bytes(b'<html>Tiny build fixture</html>')
        sources = [source]
        if equipment:
            names = set().union(*map(set, build_approved_site.EQUIPMENT_AUDIT_SOURCES.values()))
            for name in sorted(names):
                source = root/'site'/name; source.parent.mkdir(parents=True, exist_ok=True)
                source.write_bytes(('Tiny source fixture, not a release: '+name).encode()); sources.append(source)
        inventory = [{'path': p.relative_to(root).as_posix(), 'sha256': build_approved_site.digest(p)} for p in sources]
        (root/'docs/SOURCE_INVENTORY.json').write_text(json.dumps({'files': inventory}))
        (root/'docs/MACHINE_REVIEW_COVERAGE.json').write_text(json.dumps({'machines': [{'id': 'fixture'}]}))
        for name in build_approved_site.LAYOUT_EQUIPMENT_AUDITS:
            (root/'scripts'/name).write_text('// Mocked audit boundary: '+name)
        (root/build_approved_site.U1_BOTTOM_AUDIT).write_text('// Mocked nested actual U1 audit boundary')
        runtime = root/'runtime-input'; runtime.write_bytes(b'Ordinary approved runtime fixture')
        row = {'path': 'runtime/fixture.bin', 'bytes': runtime.stat().st_size,
               'sha256': build_approved_site.digest(runtime), 'url': 'https://psych0h3ad.github.io/runtime/fixture.bin',
               'approval_receipt_sha256': '1'*64}
        contract = {'schema': 'approved-static-delivery-v1', 'machine_ids': ['fixture'], 'files': [row]}
        if external:
            external_folder = tempfile.TemporaryDirectory(); self.addCleanup(external_folder.cleanup)
            cache = pathlib.Path(external_folder.name)/'private-prepared'
        else:
            cache = root/'private-tiny-fixture-cache'
        cache.mkdir(); entries = []; mapping = {}; decoded = {}
        for i, name in enumerate((*build_approved_site.EQUIPMENT_MODELS, build_approved_site.EQUIPMENT_PREVIEW)):
            raw = ('Tiny decoded fixture '+str(i)).encode()
            wire = gzip.compress(raw, mtime=0)
            file = cache/pathlib.PurePosixPath(name).name; file.write_bytes(raw)
            pathlib.Path(str(file)+'.gz').write_bytes(wire)
            transfer = {'path': name+'.gz', 'bytes': len(wire), 'sha256': hashlib.sha256(wire).hexdigest(),
                        'encoding': 'gzip', 'baseURL': 'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/'}
            pin = {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'transfer': transfer}
            kind = 'model' if name in build_approved_site.EQUIPMENT_MODELS else 'preview'
            entries.append({'kind': kind, 'pin': pin})
            if kind == 'model':
                mapping[name] = str(file.resolve()); decoded[name] = {'bytes': len(raw), 'sha256': pin['sha256']}
        self.plans[root] = {'entries': entries, 'fixtureOnly': False,
                            'totalBytes': sum(e['pin']['bytes']+e['pin']['transfer']['bytes'] for e in entries)}
        # Only the checked_plan boundary is mocked. Production rejects a plan
        # marked fixtureOnly; these deliberately tiny pins are not real models.
        map_file = root/'four-models.private.json'; map_file.write_text(json.dumps({'files': mapping}))
        self.prepared[root] = {'passed': True, 'cached_body_count': 10, 'files': mapping,
                               'map_path': str(map_file), 'prepared_dir': str(cache.resolve())}
        return root, root/'assembled', contract, {'files': {row['path']: str(runtime)}}, decoded

    def external_fixture(self):
        values = self.fixture(external=True)
        return (*values, {'files': dict(self.prepared[values[0]]['files'])})

    def test_normalized_current_u1_model_and_wire_pins_are_frozen(self):
        # Read metadata only. Tiny orchestration bodies above keep their own
        # honest hashes; they never masquerade as these real exported models.
        import re
        source = (pathlib.Path(__file__).resolve().parents[1]/'site/layout/layout-equipment.mjs').read_text(encoding='utf-8')
        match = re.search(r'^const U1 = freeze\(([^\r\n]+)\);', source, re.MULTILINE)
        self.assertIsNotNone(match, 'Current U1 metadata declaration missing')
        variants = json.loads(match.group(1))['variants']
        expected = {
            'standalone': (5751820, '10fea968e60fd90fe3ac7652a71a35795b949584477d32c9c514c6b325e67768',
                           2502888, 'bed023a588dd32d046666b395268c05e191d21cf2601431c54e8dbb3a3e0ecb5'),
            'docked': (5262896, 'ab0aaaa9adc6aabaca1a45000902a97f1a9a9fc80db8f3807d3a7cf3c3880fe5',
                       2371206, '81b3fc16f87b82d2c5b9a2d94a7958e0f6f2dd87280d286cc9c122224ade4934'),
        }
        for variant, identity in expected.items():
            model = variants[variant]['model']; transfer = model['transfer']
            self.assertEqual((model['bytes'], model['sha256'], transfer['bytes'], transfer['sha256']), identity)
            self.assertEqual(transfer['path'], model['path']+'.gz')
            self.assertEqual(transfer['encoding'], 'gzip')
            self.assertEqual(transfer['baseURL'], 'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/')

    def test_equipment_catalog_rejects_legacy_other_prefix_and_unknown_host(self):
        for base in ['https://psych0h3ad.github.io/3d-print-rig-extra-models/',
                     'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/00000000000000000000/',
                     'https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/other/',
                     'https://unapproved.example/layout-references/da1f857f0c48606ed818/']:
            with self.subTest(base=base):
                root, output, _, _, _ = self.fixture()
                self.plans[root]['entries'][0]['pin']['transfer']['baseURL'] = base
                with self.assertRaisesRegex(ValueError, 'canonical exact gzip transfers'):
                    build_approved_site.equipment_catalog_plan(root)
                self.assertFalse(output.exists())

    def runner(self, root, output, contract, decoded, mutate=None, equipment_inputs=None, prepared_dir=None):
        calls = []
        def invoke(command, **kwargs):
            calls.append(command)
            script = pathlib.Path(command[4]); self.assertEqual(script.parent, root/'scripts')
            self.assertEqual(command[1:4], ['--max-old-space-size=384', '--max-semi-space-size=4', '--v8-pool-size=1'])
            opts = dict(zip(command[5::2], command[6::2]))
            self.assertEqual(set(opts), {'--site', '--report', '--equipment-inputs', '--prepared-dir'})
            self.assertEqual(opts['--site'], str(output.resolve())); self.assertNotIn('--raw', command)
            mapping = equipment_inputs or {'files': self.prepared[root]['files']}
            snapshot = pathlib.Path(opts['--equipment-inputs']); self.assertFalse(snapshot.is_relative_to(output))
            self.assertEqual(json.loads(snapshot.read_text()), mapping)
            expected_dir = prepared_dir or self.prepared[root]['prepared_dir']
            self.assertEqual(pathlib.Path(opts['--prepared-dir']), pathlib.Path(expected_dir).resolve())
            self.assertFalse((output/'.nojekyll').exists(), 'No readiness marker before both audit passes')
            self.assertEqual(kwargs['cwd'], root); self.assertEqual(kwargs['timeout'], 120)
            self.assertEqual(kwargs['env']['UV_THREADPOOL_SIZE'], '1'); self.assertFalse(kwargs['shell'])
            self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
            if hasattr(__import__('os'), 'sched_getaffinity'):
                self.assertLessEqual(len(__import__('os').sched_getaffinity(0)), 2)
            for row in contract['files']:
                self.assertEqual(build_approved_site.digest(output/row['path']), row['sha256'])
            report_path = pathlib.Path(opts['--report']); self.assertFalse(report_path.is_relative_to(output))
            self.assertFalse(report_path.exists(), 'Reports must be newly generated')
            kwargs['stdout'].write(b'Complete private audit stdout\n'); kwargs['stderr'].write(b'Private stderr fixture\n')
            report = {'passed': True, 'transportMode': 'registered-exact-body', 'auditInputFiles': {},
                      'sourceInputs': {name: build_approved_site.digest(output/name)
                                       for name in build_approved_site.EQUIPMENT_AUDIT_SOURCES[script.name]},
                      'auditScriptSHA256': build_approved_site.digest(script),
                      'auditDependencies': {name: build_approved_site.digest(root/name)
                                            for name in build_approved_site.EQUIPMENT_AUDIT_DEPENDENCIES[script.name]}}
            receipts = {}
            for entry in self.plans[root]['entries']:
                pin = entry['pin']; name = pin['path']
                if entry['kind'] == 'model':
                    file = pathlib.Path(mapping['files'][name]); receipts[name] = dict(pin)
                else:
                    file = pathlib.Path(opts['--prepared-dir'])/pathlib.PurePosixPath(name).name
                    report['preview'] = {'model': dict(pin),
                        'body': {key: pin[key] for key in ['bytes', 'sha256']},
                        'gzip': {key: pin['transfer'][key] for key in ['bytes', 'sha256']}}
                for key, body, body_file in [(name, pin, file), (name+'.gz', pin['transfer'], pathlib.Path(str(file)+'.gz'))]:
                    report['auditInputFiles'][key] = {'file': str(body_file.resolve()), 'bytes': body['bytes'], 'sha256': body['sha256']}
            if script.name == build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0]:
                report.update(schema='layout-equipment-geometry-audit-v2', status='PASS', assets=list(receipts.values()))
            else:
                report.update(schema='layout-equipment-actual-asset-audit-v2', assets=receipts)
                # Synthetic closed-box report shape only. The current real
                # helper/source hashes and all body pins remain mandatory.
                witness = {'kind': 'intrinsic-bottom-closure', 'vertices': 24, 'triangles': 12,
                           'closedManifoldEdges': 18, 'signedVolumeM3': 0.000238,
                           'measuredOpeningContained': True, 'sourceArraysUnchanged': True,
                           'topologyUsesWeldedIdsOnly': True, 'geometryUsesRawSourceVertices': True,
                           'topologyWeldToleranceM': 1e-7,
                           'rayMethod': ('Raw triangle XZ barycentric vertical intersection, including interpolated raw Y; '
                                         'no welded/flattened triangle coordinates'),
                           'rimPlanesM': [0.0056, 0.0124], 'verticalRayChecks': 800,
                           'planes': [{'yM': y, 'areaM2': 0.14, 'boundaryVertices': 4,
                                       'triangles': 2, 'verticalRayChecks': 400}
                                      for y in [0.006, 0.0077]]}
                variants = ['standalone', 'docked', 'standalone']
                names = (*build_approved_site.EQUIPMENT_MODELS[:2], build_approved_site.EQUIPMENT_PREVIEW)
                nested_bodies = {name+suffix: report['auditInputFiles'][name+suffix]
                                 for name in names for suffix in ('', '.gz')}
                nested = {'schema': 'u1-measured-lower-shell-closure-audit-v1', 'passed': True,
                          'closureMode': 'intrinsic-v6', 'originalAssetsModified': False,
                          'auditScriptSHA256': build_approved_site.digest(root/build_approved_site.U1_BOTTOM_AUDIT),
                          'auditDependencies': {'scripts/'+build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0]:
                              build_approved_site.digest(root/'scripts'/build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0])},
                          'sourceInputs': {name: report['sourceInputs'][name] for name in build_approved_site.U1_BOTTOM_SOURCES},
                          'auditInputFiles': nested_bodies, 'sourcePreviewGeometries': 29, 'sourcePreviewReceipts': 87,
                          'loads': [{'variant': variant, 'model': dict(receipts[build_approved_site.EQUIPMENT_MODELS[1 if i == 1 else 0]], unit='m', up='+Y', front='+Z'),
                                     'serializedClosurePreserved': True, 'transformedPlacements': 5,
                                     'runtimeDerivedCaps': 0, 'unchangedSourceMeshes': 8, 'disposedGeometries': 8,
                                     'closure': dict(witness), 'sourceResetHash': '1'*64} for i, variant in enumerate(variants)],
                          'preview': [dict(witness, variant=variant, runtimeDerivedCaps=0) for variant in variants]}
                report['u1Bottom'] = json.loads(json.dumps(nested))
            if mutate:
                special = mutate(script.name, report, report_path)
                if special is not None: return special
            report_path.write_text(json.dumps(report))
            return subprocess.CompletedProcess(command, 0)
        return invoke, calls

    def test_normal_preparation_runs_before_sequential_audits_without_public_cache_copy(self):
        root, output, contract, inputs, decoded = self.fixture()
        invoke, calls = self.runner(root, output, contract, decoded)
        def prepared_before_audit(command, **kwargs):
            self.prepare_equipment_inputs.assert_called_once_with(root)
            return invoke(command, **kwargs)
        with patch.object(build_approved_site.subprocess, 'run', side_effect=prepared_before_audit):
            result = run(root, contract, output, inputs)
        self.assertEqual([pathlib.Path(c[4]).name for c in calls], list(build_approved_site.LAYOUT_EQUIPMENT_AUDITS))
        self.assertTrue(result['deployment_ready']); self.assertTrue((output/'.nojekyll').exists())
        gate = result['layout_equipment_audits']; self.assertTrue(gate['passed'])
        self.assertEqual(gate['decoded_assets'], decoded); self.assertEqual(len(gate['audit_input_files']), 10)
        for name in build_approved_site.EQUIPMENT_BODIES: self.assertFalse((output/name).exists())
        self.assertFalse((output/'__pycache__').exists())
        self.assertEqual(result['planned_site_bytes'], sum(p.stat().st_size for p in output.rglob('*') if p.is_file()))
        for audit in gate['audits']:
            self.assertEqual(audit['report_sha256'], build_approved_site.digest(audit['report']))
            self.assertEqual(pathlib.Path(audit['stdout']).read_bytes(), b'Complete private audit stdout\n')
            self.assertFalse(pathlib.Path(audit['report']).is_relative_to(output))

    def test_normal_without_runtime_input_flag_reuses_exact_prepared_runtime(self):
        root, output, contract, inputs, decoded = self.fixture()
        row = contract['files'][0]; dest = root/'site'/row['path']; dest.parent.mkdir(parents=True)
        dest.write_bytes(pathlib.Path(inputs['files'][row['path']]).read_bytes())
        invoke, _ = self.runner(root, output, contract, decoded)
        with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
            self.assertTrue(run(root, contract, output)['deployment_ready'])
        self.prepare_equipment_inputs.assert_called_once_with(root); self.urlopen.assert_not_called()

    def test_external_four_map_infers_all_ten_private_siblings(self):
        root, output, contract, inputs, decoded, mapping = self.external_fixture()
        invoke, calls = self.runner(root, output, contract, decoded, equipment_inputs=mapping)
        with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
            result = run(root, contract, output, inputs, equipment_inputs=mapping)
        self.prepare_equipment_inputs.assert_not_called(); self.assertEqual(len(calls), 2)
        self.assertEqual(len(result['layout_equipment_audits']['audit_input_files']), 10)
        snapshot = pathlib.Path(result['layout_equipment_audits']['input_map'])
        self.assertEqual(json.loads(snapshot.read_text()), mapping)
        for name in build_approved_site.EQUIPMENT_BODIES: self.assertFalse((output/name).exists())

    def test_explicit_preview_directory_does_not_override_model_gzip_siblings(self):
        import shutil
        root, output, contract, inputs, decoded, mapping = self.external_fixture()
        preview_dir = root/'preview-only'; preview_dir.mkdir()
        for name in [build_approved_site.EQUIPMENT_PREVIEW, build_approved_site.EQUIPMENT_PREVIEW+'.gz']:
            file = pathlib.Path(self.prepared[root]['prepared_dir'])/pathlib.PurePosixPath(name).name
            shutil.move(str(file), preview_dir/file.name)
        invoke, _ = self.runner(root, output, contract, decoded, equipment_inputs=mapping, prepared_dir=preview_dir)
        with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
            result = run(root, contract, output, inputs, equipment_inputs=mapping, equipment_prepared_dir=preview_dir)
        self.assertEqual(result['layout_equipment_audits']['prepared_dir'], str(preview_dir.resolve()))

    def test_inventory_absence_keeps_legacy_behavior_even_with_untracked_module(self):
        root, output, contract, inputs, _ = self.fixture(equipment=False)
        untracked = root/'site'/build_approved_site.LAYOUT_EQUIPMENT_SOURCE
        untracked.parent.mkdir(parents=True); untracked.write_text('// Not inventoried')
        with patch.object(build_approved_site.subprocess, 'run') as audit:
            result = run(root, contract, output, inputs)
        self.assertTrue(result['deployment_ready']); self.assertNotIn('layout_equipment_audits', result)
        audit.assert_not_called(); self.which.assert_not_called(); self.prepare_equipment_inputs.assert_not_called()
        self.checked_plan.assert_not_called()

    def test_plan_only_never_prepares_checks_catalog_or_certifies_bodies(self):
        for explicit in [False, True]:
            for verify in [False, True]:
                with self.subTest(explicit=explicit, verify=verify):
                    root, output, contract, inputs, _, mapping = self.external_fixture()
                    with patch.object(build_approved_site.subprocess, 'run') as audit:
                        result = run(root, contract, output, inputs, plan_only=True, verify_inputs=verify,
                                     equipment_inputs=mapping if explicit else None)
                    self.assertFalse(output.exists()); self.assertFalse(result['deployment_ready'])
                    self.assertFalse(result['layout_equipment_audits']['passed'])
                    self.assertEqual(result['layout_equipment_audits']['status'], 'not-run-plan-only')
                    audit.assert_not_called(); self.checked_plan.assert_not_called()
                    self.prepare_equipment_inputs.assert_not_called()

    def test_failed_or_incomplete_producer_cannot_reuse_passing_audits(self):
        for case in ['raises', 'none', 'failed', 'eight-bodies', 'missing-map', 'wrong-map', 'wrong-dir']:
            with self.subTest(case=case):
                root, output, contract, inputs, _ = self.fixture(); prepared = self.prepared[root]
                if case == 'raises': self.prepare_equipment_inputs.side_effect = ValueError('Producer failed')
                if case == 'none': self.prepared[root] = None
                if case == 'failed': prepared['passed'] = False
                if case == 'eight-bodies': prepared['cached_body_count'] = 8
                if case == 'missing-map': pathlib.Path(prepared['map_path']).unlink()
                if case == 'wrong-map': prepared['files'] = {}
                if case == 'wrong-dir': prepared['prepared_dir'] = str(root/'other-private')
                with patch.object(build_approved_site.subprocess, 'run') as audit:
                    with self.assertRaises((ValueError, OSError)): run(root, contract, output, inputs)
                audit.assert_not_called(); self.assertFalse((output/'.nojekyll').exists())
                self.prepare_equipment_inputs.side_effect = lambda root: self.prepared[root]

    def test_input_map_rejects_old_eight_entry_contract_extra_json_and_bad_paths(self):
        for case in ['empty', 'list', 'extra-key', 'eight', 'preview', 'relative', 'renamed', 'split-dir']:
            with self.subTest(case=case):
                root, output, contract, inputs, _, mapping = self.external_fixture()
                first = next(iter(mapping['files']))
                if case == 'empty': mapping = {'files': {}}
                if case == 'list': mapping = {'files': []}
                if case == 'extra-key': mapping['baseURL'] = 'https://outside.invalid/'
                if case == 'eight': mapping['files'].update({k+'.gz': v+'.gz' for k, v in list(mapping['files'].items())})
                if case == 'preview': mapping['files'][build_approved_site.EQUIPMENT_PREVIEW] = str(root/'preview')
                if case == 'relative': mapping['files'][first] = 'relative.glb'
                if case == 'renamed': mapping['files'][first] = str(root/'renamed.glb')
                if case == 'split-dir': mapping['files'][first] = str(root/pathlib.PurePosixPath(first).name)
                with patch.object(build_approved_site.subprocess, 'run') as audit:
                    with self.assertRaises(ValueError): run(root, contract, output, inputs, equipment_inputs=mapping)
                audit.assert_not_called(); self.assertFalse(output.exists())
        root, output, contract, inputs, _ = self.fixture(equipment=False)
        with self.assertRaisesRegex(ValueError, 'inventoried equipment registration'):
            run(root, contract, output, inputs, equipment_inputs={'files': {}})

    def test_all_ten_actual_files_checked_against_plan_before_audits(self):
        for name in sorted(build_approved_site.EQUIPMENT_BODIES):
            for missing in [False, True]:
                with self.subTest(name=name, missing=missing):
                    root, output, contract, inputs, _, mapping = self.external_fixture()
                    file = pathlib.Path(self.prepared[root]['prepared_dir'])/pathlib.PurePosixPath(name).name
                    if missing: file.unlink()
                    else: file.write_bytes(b'X'*file.stat().st_size)
                    with patch.object(build_approved_site.subprocess, 'run') as audit:
                        with self.assertRaisesRegex(ValueError, 'exact equipment body'):
                            run(root, contract, output, inputs, equipment_inputs=mapping)
                    audit.assert_not_called(); self.assertFalse((output/'.nojekyll').exists())

    def test_public_bodies_rejected_in_delivery_and_inventory(self):
        for source in [False, True]:
            root, output, contract, inputs, _ = self.fixture()
            name = build_approved_site.EQUIPMENT_PREVIEW
            if source:
                file = root/'site'/name; file.write_bytes(b'Public cache fixture')
                inventory = root/'docs/SOURCE_INVENTORY.json'; data = json.loads(inventory.read_text())
                data['files'].append({'path': 'site/'+name, 'sha256': build_approved_site.digest(file)})
                inventory.write_text(json.dumps(data))
            else: contract['files'][0]['path'] = name
            with self.assertRaisesRegex(ValueError, 'cache bodies must not be copied'):
                run(root, contract, output, inputs)
            self.assertFalse(output.exists())

    def test_public_input_files_and_nonabsolute_preview_dir_rejected(self):
        import shutil
        for case in ['source-site', 'output-site', 'relative-preview', 'no-map-preview']:
            root, output, contract, inputs, _, mapping = self.external_fixture()
            kwargs = {'equipment_inputs': mapping}
            if case in ['relative-preview', 'no-map-preview']:
                kwargs['equipment_prepared_dir'] = 'relative' if case == 'relative-preview' else str(root/'preview')
                if case == 'no-map-preview': kwargs.pop('equipment_inputs')
            else:
                directory = (root/'site' if case == 'source-site' else output)/'private-cache'
                directory.mkdir(parents=True)
                for name, old in list(mapping['files'].items()):
                    new = directory/pathlib.Path(old).name; shutil.copyfile(old, new); mapping['files'][name] = str(new)
                # Existing output is also rejected before attempting an audit.
            with patch.object(build_approved_site.subprocess, 'run') as audit:
                with self.assertRaises(ValueError): run(root, contract, output, inputs, **kwargs)
            audit.assert_not_called(); self.assertFalse((output/'.nojekyll').exists())

    def test_zero_exit_requires_current_complete_evidence(self):
        cases = ['missing-report', 'malformed-json', 'wrong-schema', 'failed-geometry', 'geometry-passed-false',
                 'missing-model', 'duplicate-model', 'stale-source', 'omitted-source', 'stale-script',
                 'failed-loader', 'missing-dependencies', 'wrong-dependency', 'extra-dependency',
                 'mutated-dependency', 'mutated-source', 'raw-mode', 'eight-bodies', 'extra-body',
                 'wrong-body-pin', 'wrong-cache-path', 'relative-cache-path', 'wrong-model-pin',
                 'wrong-wire-pin', 'preview-body', 'preview-gzip', 'preview-model', 'changed-cache',
                 'self-consistent-forgery']
        for case in cases:
            with self.subTest(case=case):
                root, output, contract, inputs, decoded = self.fixture()
                def mutate(name, report, target):
                    geometry = name == build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0]
                    if geometry:
                        if case == 'missing-report': return subprocess.CompletedProcess([], 0)
                        if case == 'malformed-json': target.write_text('{broken'); return subprocess.CompletedProcess([], 0)
                        if case == 'wrong-schema': report['schema'] = 'old'
                        if case == 'failed-geometry': report['status'] = 'FAIL'
                        if case == 'geometry-passed-false': report['passed'] = False
                        if case == 'missing-model': report['assets'].pop()
                        if case == 'duplicate-model': report['assets'][-1] = report['assets'][0]
                        return
                    key = next(iter(report['auditInputFiles']))
                    row = report['assets'][next(iter(decoded))]
                    dependency = 'scripts/'+build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0]
                    if case == 'stale-source': report['sourceInputs'][build_approved_site.LAYOUT_EQUIPMENT_SOURCE] = '0'*64
                    if case == 'omitted-source': report['sourceInputs'].pop('layout/layout-renderer.mjs')
                    if case == 'stale-script': report['auditScriptSHA256'] = '0'*64
                    if case == 'failed-loader': report['passed'] = False
                    if case == 'missing-dependencies': report.pop('auditDependencies')
                    if case == 'wrong-dependency': report['auditDependencies'][dependency] = '0'*64
                    if case == 'extra-dependency': report['auditDependencies']['scripts/extra.mjs'] = '0'*64
                    if case == 'mutated-dependency':
                        (root/dependency).write_text('// Changed helper during assets audit')
                        report['auditDependencies'][dependency] = build_approved_site.digest(root/dependency)
                    if case == 'mutated-source':
                        path = output/'layout/layout-renderer.mjs'; path.write_text('// Changed renderer')
                        report['sourceInputs']['layout/layout-renderer.mjs'] = build_approved_site.digest(path)
                    if case == 'raw-mode': report['transportMode'] = 'explicit-original-raw'
                    if case == 'eight-bodies':
                        report['auditInputFiles'].pop(build_approved_site.EQUIPMENT_PREVIEW)
                        report['auditInputFiles'].pop(build_approved_site.EQUIPMENT_PREVIEW+'.gz')
                    if case == 'extra-body': report['auditInputFiles']['extra.glb'] = dict(report['auditInputFiles'][key])
                    if case == 'wrong-body-pin': report['auditInputFiles'][key]['sha256'] = '0'*64
                    if case == 'wrong-cache-path': report['auditInputFiles'][key]['file'] = str(root/'other-cache')
                    if case == 'relative-cache-path': report['auditInputFiles'][key]['file'] = 'relative'
                    if case == 'wrong-model-pin': row['sha256'] = '0'*64
                    if case == 'wrong-wire-pin': row['transfer'] = dict(row['transfer'], sha256='0'*64)
                    if case == 'preview-body': report['preview']['body']['sha256'] = '0'*64
                    if case == 'preview-gzip': report['preview']['gzip']['sha256'] = '0'*64
                    if case == 'preview-model': report['preview']['model'] = dict(report['preview']['model'], bytes=1)
                    if case == 'changed-cache': pathlib.Path(report['auditInputFiles'][key]['file']).write_bytes(b'Changed')
                    if case == 'self-consistent-forgery':
                        name = next(iter(decoded)); body = report['auditInputFiles'][name]
                        file = pathlib.Path(body['file']); file.write_bytes(b'F'*body['bytes'])
                        fake = build_approved_site.digest(file); body['sha256'] = fake; report['assets'][name]['sha256'] = fake
                invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                    with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                        run(root, contract, output, inputs)
                self.assertFalse((output/'.nojekyll').exists())

    def test_either_nonzero_audit_aborts_with_private_diagnostics(self):
        for failed in build_approved_site.LAYOUT_EQUIPMENT_AUDITS:
            root, output, contract, inputs, decoded = self.fixture()
            def fail(name, report, target):
                if name == failed: return subprocess.CompletedProcess([], 7)
            invoke, calls = self.runner(root, output, contract, decoded, mutate=fail)
            with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                with self.assertRaisesRegex(ValueError, 'Layout equipment audit failed.*private diagnostics:'):
                    run(root, contract, output, inputs)
            self.assertEqual(len(calls), list(build_approved_site.LAYOUT_EQUIPMENT_AUDITS).index(failed)+1)
            self.assertFalse((output/'.nojekyll').exists())

    def test_helper_pin_required_in_each_report_and_unchanged_during_each_child(self):
        for script in build_approved_site.LAYOUT_EQUIPMENT_AUDITS:
            for case in ['omitted-hash', 'changed-hash', 'changed-file', 'changed-file-and-reported-hash']:
                with self.subTest(script=script, case=case):
                    root, output, contract, inputs, decoded = self.fixture()
                    helper = build_approved_site.U1_BOTTOM_AUDIT
                    def mutate(name, report, target):
                        if name != script: return
                        if case == 'omitted-hash': report['auditDependencies'].pop(helper)
                        if case == 'changed-hash': report['auditDependencies'][helper] = '0'*64
                        if case.startswith('changed-file'):
                            (root/helper).write_text('// Helper changed during current child')
                        if case == 'changed-file-and-reported-hash':
                            report['auditDependencies'][helper] = build_approved_site.digest(root/helper)
                    invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                    with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                        with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                            run(root, contract, output, inputs)
                    self.assertFalse((output/'.nojekyll').exists())

    def test_nested_u1_report_cannot_be_missing_stale_or_partial(self):
        cases = ['missing', 'passed-stub', 'failed', 'schema', 'omitted-helper-hash', 'changed-helper-hash',
                 'omitted-geometry-hash', 'changed-geometry-hash', 'extra-dependency', 'stale-source',
                 'omitted-source', 'missing-body', 'extra-body', 'wrong-body-hash', 'wrong-body-path',
                 'missing-variant', 'wrong-order', 'changed-model', 'wrong-model-datum', 'missing-serialization',
                 'missing-transform', 'missing-boundary-witness', 'missing-preview-witness',
                 'missing-receipts', 'wrong-reset', 'missing-mode', 'unknown-mode', 'legacy-mode',
                 'legacy-witness-only', 'legacy-receipt-count', 'assets-modified', 'changed-transfer',
                 'missing-source-reset', 'invalid-source-reset', 'missing-disposal', 'missing-unchanged-source',
                 'reset-count-changed', 'missing-full-cap-count', 'missing-preview-cap-count',
                 'full-runtime-cap', 'preview-runtime-cap', 'boolean-cap-count']
        for case in cases:
            with self.subTest(case=case):
                root, output, contract, inputs, decoded = self.fixture()
                def mutate(name, report, target):
                    if name != build_approved_site.LAYOUT_EQUIPMENT_AUDITS[1]: return
                    nested = report['u1Bottom']
                    if case == 'missing': report.pop('u1Bottom'); return
                    if case == 'passed-stub': report['u1Bottom'] = {'passed': True}; return
                    if case == 'failed': nested['passed'] = False
                    if case == 'schema': nested['schema'] = 'old'
                    if case == 'missing-mode': nested.pop('closureMode')
                    if case == 'unknown-mode': nested['closureMode'] = 'unknown'
                    if case == 'legacy-mode': nested['closureMode'] = 'derived-v4'
                    if case == 'legacy-witness-only':
                        nested['loads'][0]['closure'] = {'onlyMeasuredLowerRimPlanes': True,
                                                         'independentBoundaryAndAreaWitnesses': True}
                    if case == 'legacy-receipt-count':
                        nested['sourcePreviewGeometries'], nested['sourcePreviewReceipts'] = 22, 66
                    if case == 'assets-modified': nested['originalAssetsModified'] = True
                    if case == 'omitted-helper-hash': nested.pop('auditScriptSHA256')
                    if case == 'changed-helper-hash': nested['auditScriptSHA256'] = '0'*64
                    geometry = 'scripts/'+build_approved_site.LAYOUT_EQUIPMENT_AUDITS[0]
                    if case == 'omitted-geometry-hash': nested['auditDependencies'].pop(geometry)
                    if case == 'changed-geometry-hash': nested['auditDependencies'][geometry] = '0'*64
                    if case == 'extra-dependency': nested['auditDependencies']['scripts/other.mjs'] = '0'*64
                    source = build_approved_site.U1_BOTTOM_SOURCES[0]
                    if case == 'stale-source': nested['sourceInputs'][source] = '0'*64
                    if case == 'omitted-source': nested['sourceInputs'].pop(source)
                    key = next(iter(nested['auditInputFiles']))
                    if case == 'missing-body': nested['auditInputFiles'].pop(key)
                    if case == 'extra-body': nested['auditInputFiles']['other.glb'] = dict(nested['auditInputFiles'][key])
                    if case == 'wrong-body-hash': nested['auditInputFiles'][key]['sha256'] = '0'*64
                    if case == 'wrong-body-path': nested['auditInputFiles'][key]['file'] = str(root/'other-cache')
                    if case == 'missing-variant': nested['loads'].pop()
                    if case == 'wrong-order': nested['preview'].reverse(); nested['preview'][0]['variant'] = 'docked'
                    if case == 'changed-model': nested['loads'][0]['model']['sha256'] = '0'*64
                    if case == 'changed-transfer': nested['loads'][0]['model']['transfer']['sha256'] = '0'*64
                    if case == 'wrong-model-datum': nested['loads'][0]['model']['up'] = '+Z'
                    if case == 'missing-serialization': nested['loads'][0].pop('serializedClosurePreserved')
                    if case == 'missing-transform': nested['loads'][0].pop('transformedPlacements')
                    if case == 'missing-boundary-witness': nested['loads'][0]['closure'].pop('measuredOpeningContained')
                    if case == 'missing-preview-witness': nested['preview'][0].pop('sourceArraysUnchanged')
                    if case == 'missing-receipts': nested.pop('sourcePreviewReceipts')
                    if case == 'wrong-reset': nested['loads'][2]['sourceResetHash'] = '2'*64
                    if case == 'missing-source-reset': nested['loads'][1].pop('sourceResetHash')
                    if case == 'invalid-source-reset': nested['loads'][1]['sourceResetHash'] = 'q'*64
                    if case == 'missing-disposal': nested['loads'][0].pop('disposedGeometries')
                    if case == 'missing-unchanged-source': nested['loads'][0].pop('unchangedSourceMeshes')
                    if case == 'reset-count-changed': nested['loads'][2]['unchangedSourceMeshes'] += 1
                    if case == 'missing-full-cap-count': nested['loads'][0].pop('runtimeDerivedCaps')
                    if case == 'missing-preview-cap-count': nested['preview'][0].pop('runtimeDerivedCaps')
                    if case == 'full-runtime-cap': nested['loads'][0]['runtimeDerivedCaps'] = 1
                    if case == 'preview-runtime-cap': nested['preview'][0]['runtimeDerivedCaps'] = 1
                    if case == 'boolean-cap-count': nested['loads'][0]['runtimeDerivedCaps'] = False
                invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                    with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                        run(root, contract, output, inputs)
                self.assertFalse((output/'.nojekyll').exists())

    def test_intrinsic_geometry_witness_is_required_for_every_load_and_preview(self):
        cases = ['missing-kind', 'wrong-kind', 'missing-topology', 'zero-topology', 'fractional-topology',
                 'boolean-topology', 'inconsistent-topology', 'missing-volume', 'zero-volume',
                 'negative-volume', 'nan-volume', 'infinite-volume', 'boolean-volume', 'missing-opening',
                 'changed-arrays', 'missing-rays', 'zero-rays', 'boolean-rays', 'missing-planes',
                 'missing-plane-ray', 'zero-plane-ray', 'ray-total-mismatch', 'zero-face-area',
                 'nonfinite-face-area', 'nonfinite-plate-plane', 'reversed-planes', 'outside-rim',
                 'missing-rim', 'missing-side-topology', 'missing-raw-geometry', 'welded-geometry',
                 'missing-topology-basis', 'wrong-ray-method', 'missing-ray-method',
                 'missing-topology-tolerance', 'expanded-topology-tolerance']
        for section in ['loads', 'preview']:
            for index in range(3):
                for case in cases:
                    with self.subTest(section=section, index=index, case=case):
                        root, output, contract, inputs, decoded = self.fixture()
                        def mutate(name, report, target):
                            if name != build_approved_site.LAYOUT_EQUIPMENT_AUDITS[1]: return
                            row = report['u1Bottom'][section][index]
                            witness = row['closure'] if section == 'loads' else row
                            if case == 'missing-kind': witness.pop('kind')
                            if case == 'wrong-kind': witness['kind'] = 'derived-cap'
                            if case == 'missing-topology': witness.pop('closedManifoldEdges')
                            if case == 'zero-topology': witness['closedManifoldEdges'] = 0
                            if case == 'fractional-topology': witness['closedManifoldEdges'] = 18.0
                            if case == 'boolean-topology': witness['closedManifoldEdges'] = True
                            if case == 'inconsistent-topology': witness['closedManifoldEdges'] += 1
                            if case == 'missing-volume': witness.pop('signedVolumeM3')
                            if case == 'zero-volume': witness['signedVolumeM3'] = 0
                            if case == 'negative-volume': witness['signedVolumeM3'] = -0.000238
                            if case == 'nan-volume': witness['signedVolumeM3'] = float('nan')
                            if case == 'infinite-volume': witness['signedVolumeM3'] = float('inf')
                            if case == 'boolean-volume': witness['signedVolumeM3'] = True
                            if case == 'missing-opening': witness.pop('measuredOpeningContained')
                            if case == 'changed-arrays': witness['sourceArraysUnchanged'] = False
                            if case == 'missing-rays': witness.pop('verticalRayChecks')
                            if case == 'zero-rays': witness['verticalRayChecks'] = 0
                            if case == 'boolean-rays': witness['verticalRayChecks'] = True
                            if case == 'missing-planes': witness.pop('planes')
                            if case == 'missing-plane-ray': witness['planes'][0].pop('verticalRayChecks')
                            if case == 'zero-plane-ray': witness['planes'][0]['verticalRayChecks'] = 0
                            if case == 'ray-total-mismatch': witness['verticalRayChecks'] += 1
                            if case == 'zero-face-area': witness['planes'][0]['areaM2'] = 0
                            if case == 'nonfinite-face-area': witness['planes'][0]['areaM2'] = float('nan')
                            if case == 'nonfinite-plate-plane': witness['planes'][0]['yM'] = float('inf')
                            if case == 'reversed-planes': witness['planes'].reverse()
                            if case == 'outside-rim': witness['planes'][1]['yM'] = 0.2
                            if case == 'missing-rim': witness.pop('rimPlanesM')
                            if case == 'missing-side-topology':
                                witness['planes'][0]['triangles'] = witness['triangles']
                            if case == 'missing-raw-geometry': witness.pop('geometryUsesRawSourceVertices')
                            if case == 'welded-geometry': witness['geometryUsesRawSourceVertices'] = False
                            if case == 'missing-topology-basis': witness.pop('topologyUsesWeldedIdsOnly')
                            if case == 'wrong-ray-method': witness['rayMethod'] = 'welded vertices'
                            if case == 'missing-ray-method': witness.pop('rayMethod')
                            if case == 'missing-topology-tolerance': witness.pop('topologyWeldToleranceM')
                            if case == 'expanded-topology-tolerance': witness['topologyWeldToleranceM'] = 0.01
                        invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                        with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                            with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                                run(root, contract, output, inputs)
                        self.assertFalse((output/'.nojekyll').exists())

    def test_nested_u1_authenticates_each_of_six_raw_and_gzip_receipts(self):
        names = (*build_approved_site.EQUIPMENT_MODELS[:2], build_approved_site.EQUIPMENT_PREVIEW)
        for body in [name+suffix for name in names for suffix in ('', '.gz')]:
            for case in ['missing', 'hash', 'bytes', 'path']:
                with self.subTest(body=body, case=case):
                    root, output, contract, inputs, decoded = self.fixture()
                    def mutate(name, report, target):
                        if name != build_approved_site.LAYOUT_EQUIPMENT_AUDITS[1]: return
                        receipts = report['u1Bottom']['auditInputFiles']
                        if case == 'missing': receipts.pop(body)
                        if case == 'hash': receipts[body]['sha256'] = '0'*64
                        if case == 'bytes': receipts[body]['bytes'] += 1
                        if case == 'path': receipts[body]['file'] = str(root/'other-private-body')
                    invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                    with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                        with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                            run(root, contract, output, inputs)
                    self.assertFalse((output/'.nojekyll').exists())

    def test_missing_node_timeout_spawn_or_affinity_failure_never_marks_ready(self):
        for case in ['node', 'timeout', 'spawn', 'affinity']:
            root, output, contract, inputs, _ = self.fixture()
            self.which.return_value = None if case == 'node' else 'node'
            error = subprocess.TimeoutExpired('node', 120) if case == 'timeout' else OSError('Cannot spawn')
            affinity = patch.object(build_approved_site, 'equipment_audit_affinity', side_effect=OSError('Cannot bound affinity')) if case == 'affinity' else contextlib.nullcontext()
            with affinity, patch.object(build_approved_site.subprocess, 'run', side_effect=error) as audit:
                with self.assertRaisesRegex(ValueError, 'Node is required|could not complete'):
                    run(root, contract, output, inputs)
            if case in ['node', 'affinity']: audit.assert_not_called()
            else: self.assertEqual(audit.call_args.kwargs['timeout'], 120)
            self.assertFalse((output/'.nojekyll').exists())

    def test_missing_audit_script_and_runtime_fail_before_preparation(self):
        for case in [*build_approved_site.LAYOUT_EQUIPMENT_AUDITS, build_approved_site.U1_BOTTOM_AUDIT, 'runtime']:
            root, output, contract, inputs, _ = self.fixture()
            if case == 'runtime': inputs['files'].clear()
            else: (root/case if case.startswith('scripts/') else root/'scripts'/case).unlink()
            with patch.object(build_approved_site.subprocess, 'run') as audit:
                with self.assertRaises(ValueError): run(root, contract, output, inputs)
            audit.assert_not_called(); self.prepare_equipment_inputs.assert_not_called()
            self.assertFalse((output/'.nojekyll').exists())

    def test_plan_only_still_checks_source_snapshot(self):
        root, output, contract, inputs, _ = self.fixture()
        (root/'site'/build_approved_site.LAYOUT_EQUIPMENT_SOURCE).write_text('// Changed registration')
        with self.assertRaisesRegex(ValueError, 'Changed source snapshot'):
            run(root, contract, output, inputs, plan_only=True)
        self.prepare_equipment_inputs.assert_not_called(); self.assertFalse(output.exists())

    def test_each_report_body_requires_its_exact_path_and_unchanged_current_bytes(self):
        for key in sorted(build_approved_site.EQUIPMENT_BODIES):
            for case in ['identical-other-file', 'changed-after-audit', 'omitted-receipt']:
                with self.subTest(body=key, case=case):
                    root, output, contract, inputs, decoded = self.fixture()
                    def mutate(name, report, target):
                        if name != build_approved_site.LAYOUT_EQUIPMENT_AUDITS[1]: return
                        body = report['auditInputFiles'][key]; file = pathlib.Path(body['file'])
                        if case == 'identical-other-file':
                            other = root/'identical-private-copy'; other.write_bytes(file.read_bytes())
                            body['file'] = str(other.resolve())
                        if case == 'changed-after-audit': file.write_bytes(b'X'*file.stat().st_size)
                        if case == 'omitted-receipt': report['auditInputFiles'].pop(key)
                    invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
                    with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                        with self.assertRaisesRegex(ValueError, 'Invalid layout equipment audit evidence'):
                            run(root, contract, output, inputs)
                    self.assertFalse((output/'.nojekyll').exists())

    def test_checked_plan_rejects_fixture_unregistered_missing_and_unpinned_catalogs(self):
        for case in ['fixture', 'missing-preview', 'duplicate-model', 'host', 'encoded-path', 'boolean-budget', 'total']:
            with self.subTest(case=case):
                root, output, contract, inputs, _ = self.fixture(); plan = self.plans[root]
                if case == 'fixture': plan['fixtureOnly'] = True
                if case == 'missing-preview': plan['entries'].pop()
                if case == 'duplicate-model': plan['entries'][1] = plan['entries'][0]
                if case == 'host': plan['entries'][0]['pin']['transfer']['baseURL'] = 'https://outside.invalid/'
                if case == 'encoded-path': plan['entries'][0]['pin']['transfer']['path'] += '.other'
                if case == 'boolean-budget': plan['entries'][0]['pin']['bytes'] = True
                if case == 'total': plan['totalBytes'] += 1
                with patch.object(build_approved_site.subprocess, 'run') as audit:
                    with self.assertRaises(ValueError): run(root, contract, output, inputs)
                audit.assert_not_called(); self.assertFalse((output/'.nojekyll').exists())

    def test_earlier_geometry_source_and_private_map_cannot_change_during_assets_audit(self):
        for case in ['geometry-source', 'input-map']:
            root, output, contract, inputs, decoded = self.fixture()
            def mutate(name, report, target):
                if name != build_approved_site.LAYOUT_EQUIPMENT_AUDITS[1]: return
                if case == 'geometry-source': (output/'layout/layout-geometry.mjs').write_text('// Late change')
                else: (target.parent/'equipment-inputs.json').write_text('{"files": {}}')
            invoke, _ = self.runner(root, output, contract, decoded, mutate=mutate)
            with patch.object(build_approved_site.subprocess, 'run', side_effect=invoke):
                with self.assertRaisesRegex(ValueError, 'changed during inspection|Invalid layout equipment audit evidence'):
                    run(root, contract, output, inputs)
            self.assertFalse((output/'.nojekyll').exists())

    def test_audit_cpu_limit_restores_parent_affinity_on_success_and_error(self):
        import os
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes
            api = ctypes.WinDLL('kernel32', use_last_error=True)
            api.GetCurrentProcess.restype = wintypes.HANDLE
            api.GetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_size_t), ctypes.POINTER(ctypes.c_size_t)]
            def affinity():
                mask = ctypes.c_size_t(); system = ctypes.c_size_t()
                self.assertTrue(api.GetProcessAffinityMask(api.GetCurrentProcess(), ctypes.byref(mask), ctypes.byref(system)))
                return mask.value
            cpu_count = lambda mask: mask.bit_count()
        elif hasattr(os, 'sched_getaffinity'):
            affinity = lambda: os.sched_getaffinity(0)
            cpu_count = len
        else: self.skipTest('Platform cannot bound audit affinity')
        original = affinity()
        for fail in [False, True]:
            try:
                with build_approved_site.equipment_audit_affinity():
                    self.assertLessEqual(cpu_count(affinity()), 2)
                    if fail: raise OSError('Fixture child failure')
            except OSError:
                if not fail: raise
            self.assertEqual(affinity(), original)

    def test_cli_keeps_explicit_four_map_and_prepared_directory_private(self):
        root, output, contract, inputs, decoded, mapping = self.external_fixture()
        paths = {'--delivery': contract, '--inputs': inputs, '--equipment-inputs': mapping}
        argv = ['build_approved_site.py', '--output', str(output)]
        for option, data in paths.items():
            file = root/(option[2:]+'.json'); file.write_text(json.dumps(data)); argv += [option, str(file)]
        prepared_dir = self.prepared[root]['prepared_dir']
        argv += ['--equipment-prepared-dir', prepared_dir]
        invoke, _ = self.runner(root, output, contract, decoded, equipment_inputs=mapping)
        with patch.object(sys, 'argv', argv), patch.object(build_approved_site, 'ROOT', root), patch.object(build_approved_site.subprocess, 'run', side_effect=invoke), patch('sys.stdout', new_callable=io.StringIO):
            result = build_approved_site.main()
        self.assertTrue(result['deployment_ready']); self.prepare_equipment_inputs.assert_not_called()
        self.assertEqual(len(result['layout_equipment_audits']['audit_input_files']), 10)


class GeneratedReviewCompaction(unittest.TestCase):
    def reports(self, root, body):
        for name in build_site.COMPACT_REVIEW_REPORTS:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)

    def test_preserves_literal_numbers_escapes_unicode_and_asset_pins(self):
        # Do not round a long coefficient, rewrite its exponent or touch string whitespace.
        body = ('{\r\n "pin": "' + 'a'*64 + '", "n": [1.2300000000000000000e-101,9007199254740993,-0.0],'
                ' "text": "日本語  a \\\" b \\\\ c", "nested": { "ok": true }\r\n}\r\n').encode()
        expected = ('{"pin":"' + 'a'*64 + '","n":[1.2300000000000000000e-101,9007199254740993,-0.0],'
                    '"text":"日本語  a \\\" b \\\\ c","nested":{"ok":true}}\n').encode()
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder); self.reports(root, body)
            unrelated = root/'review/other.json'; unrelated.write_bytes(body)
            contract = root/'APPROVED_DELIVERY.json'; contract.write_bytes(body)
            build_site.compact_generated_reviews(root)
            for name in build_site.COMPACT_REVIEW_REPORTS:
                self.assertEqual((root/name).read_bytes(), expected)
            self.assertEqual(unrelated.read_bytes(), body)
            self.assertEqual(contract.read_bytes(), body)

    def test_missing_or_invalid_report_stops_before_any_report_rewrite(self):
        body = b'{\r\n "pin": "original", "all_fields": [1, 2, 3]\r\n}\r\n'
        for invalid in [None, b'{"broken":', b'{"non_json": NaN}']:
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as folder:
                root = pathlib.Path(folder); self.reports(root, body)
                last = root/build_site.COMPACT_REVIEW_REPORTS[-1]
                if invalid is None: last.unlink()
                else: last.write_bytes(invalid)
                with self.assertRaises((FileNotFoundError, ValueError)):
                    build_site.compact_generated_reviews(root)
                for name in build_site.COMPACT_REVIEW_REPORTS[:-1]:
                    self.assertEqual((root/name).read_bytes(), body)


if __name__ == '__main__': unittest.main()
