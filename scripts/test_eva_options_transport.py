"""Transport fixtures for the actual EVA option input consumer; no fit claim."""
import gzip
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
from check_eva_options_release import acquire


class EVAOptionTransport(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.file = self.root / 'cache.asset'
        self.seed = self.root / 'seed.asset'
        self.decoded = b'{"exact":"EVA source fixture"}\n'
        self.raw = gzip.compress(self.decoded, mtime=0)
        self.descriptor = self.pin(self.raw, self.decoded)
        self.record = {'url': 'https://psych0h3ad.github.io/eva-options/model.glb.gz',
                       'descriptor': self.descriptor, 'path': str(self.file)}

    @staticmethod
    def pin(raw, decoded):
        return {'path': 'model.glb.gz', 'encoding': 'gzip', 'bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest(), 'decoded_bytes': len(decoded),
                'decoded_sha256': hashlib.sha256(decoded).hexdigest()}

    def response(self, raw=None, url=None):
        response = io.BytesIO(self.raw if raw is None else raw)
        response.url = url or self.record['url']
        return response

    def error(self, status):
        return urllib.error.HTTPError(self.record['url'], status, 'fixture status', {}, io.BytesIO())

    def assert_no_staging(self):
        self.assertFalse(list(self.root.glob('eva-options-fetch-*')))

    def test_actual_consumer_recovers_503_and_timeout_then_pins_raw_and_decoded(self):
        with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=[
                self.error(503), TimeoutError('response timeout'), self.response()]) as fetch, \
             patch('fetch_pinned_source.time.sleep') as sleep:
            acquire(self.record)
        self.assertEqual(self.file.read_bytes(), self.raw)
        self.assertEqual(gzip.decompress(self.file.read_bytes()), self.decoded)
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual([call.args for call in sleep.call_args_list], [(1,), (3,)])
        for call in fetch.call_args_list:
            self.assertEqual(call.args[0].full_url, self.record['url'])
            self.assertEqual(call.kwargs, {'timeout': 60})
            self.assertEqual(call.args[0].get_header('User-agent'), '3D-Print-Rig-EVA-Options-Release-Audit')
        self.assert_no_staging()

    def test_verified_cache_and_explicit_seed_do_not_use_network(self):
        for use_seed in (False, True):
            with self.subTest(seed=use_seed):
                target = self.seed if use_seed else self.file
                target.write_bytes(self.raw)
                record = dict(self.record, seed=self.seed) if use_seed else dict(self.record)
                with patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                    acquire(record)
                fetch.assert_not_called()
                self.assertEqual(self.file.read_bytes(), self.raw)
                self.assertNotIn('seed', record)
                self.file.unlink()
        self.assert_no_staging()

    def test_corrupt_cache_keeps_existing_refresh_policy_only_with_verified_replacement(self):
        self.file.write_bytes(b'corrupt cache')
        with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=[self.error(503), self.response()]) as fetch, \
             patch('fetch_pinned_source.time.sleep'):
            acquire(self.record)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(self.file.read_bytes(), self.raw)
        self.assert_no_staging()

    def test_exhaustion_never_qualifies_or_overwrites_corrupt_cache_or_seed(self):
        for prior in ('missing', 'cache', 'seed'):
            with self.subTest(prior=prior):
                record = dict(self.record)
                if prior == 'cache':
                    self.file.write_bytes(b'keep corrupt cache for diagnosis')
                if prior == 'seed':
                    self.seed.write_bytes(b'keep corrupt seed for diagnosis')
                    record['seed'] = self.seed
                with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=[self.error(503) for _ in range(3)]) as fetch, \
                     patch('fetch_pinned_source.time.sleep') as sleep:
                    with self.assertRaises(urllib.error.HTTPError):
                        acquire(record)
                self.assertEqual(fetch.call_count, 3)
                self.assertEqual(sleep.call_count, 2)
                if prior == 'cache':
                    self.assertEqual(self.file.read_bytes(), b'keep corrupt cache for diagnosis')
                    self.file.unlink()
                else:
                    self.assertFalse(self.file.exists())
                if prior == 'seed':
                    self.assertEqual(self.seed.read_bytes(), b'keep corrupt seed for diagnosis')
                    self.assertIn('seed', record)
                self.assert_no_staging()

    def test_bad_raw_hash_short_overflow_and_unapproved_redirect_never_retry_or_install(self):
        for response in [self.response(b'x' * len(self.raw)), self.response(self.raw[:-1]),
                         self.response(self.raw + b'x'), self.response(url='https://github.com/unapproved-for-eva')]:
            self.file.write_bytes(b'original bad cache must stay')
            with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=[response, self.response()]) as fetch, \
                 patch('fetch_pinned_source.time.sleep') as sleep:
                with self.assertRaises(ValueError):
                    acquire(self.record)
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()
            self.assertEqual(self.file.read_bytes(), b'original bad cache must stay')
            self.assert_no_staging()

    def test_decoded_hash_size_and_invalid_gzip_never_retry_or_poison_cache(self):
        records = [dict(self.record, descriptor=dict(self.descriptor, decoded_sha256='0' * 64)),
                   dict(self.record, descriptor=dict(self.descriptor, decoded_bytes=len(self.decoded) + 1))]
        invalid_gzip = b'not a gzip body'
        records.append(dict(self.record, descriptor=self.pin(invalid_gzip, self.decoded)))
        for record in records:
            raw = invalid_gzip if record is records[-1] else self.raw
            with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=[self.response(raw), self.response()]) as fetch, \
                 patch('fetch_pinned_source.time.sleep') as sleep:
                with self.assertRaises((ValueError, gzip.BadGzipFile)):
                    acquire(record)
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()
            self.assertFalse(self.file.exists())
            self.assert_no_staging()

    def test_404_and_500_do_not_retry(self):
        for status in (404, 500):
            with patch('fetch_pinned_source.urllib.request.urlopen', side_effect=self.error(status)) as fetch, \
                 patch('fetch_pinned_source.time.sleep') as sleep:
                with self.assertRaises(urllib.error.HTTPError):
                    acquire(self.record)
            self.assertEqual(fetch.call_count, 1)
            sleep.assert_not_called()
            self.assertFalse(self.file.exists())
            self.assert_no_staging()

    def test_nonfinite_or_unpinned_descriptors_and_wrong_origin_fail_before_cache_or_network(self):
        self.file.write_bytes(self.raw)
        bad_records = []
        for field in ('bytes', 'decoded_bytes'):
            for value in (float('nan'), float('inf'), -1, 0, True, 180_000_001):
                bad_records.append(dict(self.record, descriptor=dict(self.descriptor, **{field: value})))
        bad_records += [dict(self.record, descriptor=dict(self.descriptor, sha256='x' * 64)),
                        dict(self.record, url='https://github.com/wrong-eva-origin')]
        for record in bad_records:
            with patch('fetch_pinned_source.urllib.request.urlopen') as fetch:
                with self.assertRaises(ValueError):
                    acquire(record)
                fetch.assert_not_called()
            self.assertEqual(self.file.read_bytes(), self.raw)
        self.assert_no_staging()


if __name__ == '__main__':
    unittest.main()
