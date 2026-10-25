"""A valid model must not hide a missing/corrupt corresponding-source archive."""
import json
from pathlib import Path
import tempfile
from check_trinity_beacon_release import verify_supplement, ROOT

fixture = json.loads((ROOT/'docs/TRINITY_BEACON_HELPER_REGRESSION.json').read_bytes())
pin = fixture['current_files']['source-supplement.zip']
with tempfile.TemporaryDirectory() as directory:
    file = Path(directory)/'source-supplement.zip'
    for payload in (None, b'wrong size', bytes(pin['bytes'])):
        if payload is not None:
            file.write_bytes(payload)
        try:
            verify_supplement(file, pin)
        except ValueError:
            pass
        else:
            raise AssertionError('Missing/corrupt corresponding source was accepted')
print('Beacon missing, truncated and same-size corrupt source supplements are rejected.')
