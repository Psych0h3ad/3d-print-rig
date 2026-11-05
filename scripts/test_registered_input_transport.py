"""Registered URL queries keep the actual repository fetcher's exact body gate."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from prepare_repository_inputs import fetch_registered_input

ROOT = Path(__file__).resolve().parents[1]


class Reply(io.BytesIO):
    def __init__(self, body, url):
        super().__init__(body)
        self.url = url
        self.headers = {'Content-Length': str(len(body))}


class RegisteredTransport(unittest.TestCase):
    def test_registered_query_and_unchanged_full_body_gate(self):
        contract = json.loads((ROOT / 'site/APPROVED_DELIVERY.json').read_bytes())
        row = next(r for r in contract['files'] if r['path'] == 'R2_ENDSTOP_REGISTRATION.json')
        receipt = json.loads((ROOT / 'docs/R2_INPUT_TRANSPORT.json').read_bytes())
        self.assertEqual(row['url'], receipt['registeredURL'])
        self.assertEqual(row['url'], receipt['originalURL'] + '?v=' + row['sha256'])
        self.assertEqual((row['bytes'], row['sha256']), (receipt['bytes'], receipt['sha256']))
        actual = (ROOT / 'site' / row['path']).read_bytes()
        self.assertEqual((len(actual), hashlib.sha256(actual).hexdigest()), (row['bytes'], row['sha256']))
        with tempfile.TemporaryDirectory(prefix='rig-registered-query-') as directory:
            target = Path(directory) / 'input.json'
            with patch('fetch_pinned_source.urllib.request.urlopen', return_value=Reply(actual, row['url'])) as get:
                fetch_registered_input(row, target)
                self.assertEqual(get.call_args.args[0].full_url, row['url'])
                self.assertEqual(target.read_bytes(), actual)
                self.assertEqual(get.call_count, 1)
            target.unlink()
            changed = bytes([actual[0] ^ 1]) + actual[1:]
            with patch('fetch_pinned_source.urllib.request.urlopen', return_value=Reply(changed, row['url'])) as get:
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    fetch_registered_input(row, target)
                self.assertEqual(get.call_count, 1)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_name(target.name + '.download').exists())


if __name__ == '__main__':
    unittest.main()
