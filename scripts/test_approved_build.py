import hashlib,json,pathlib,tempfile,unittest,sys,io,urllib.error
from unittest.mock import patch
import build_site,build_approved_site
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

if __name__=='__main__':unittest.main()
