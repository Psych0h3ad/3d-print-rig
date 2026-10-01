"""Record the canonical-LF hashes of every tracked publication file."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode('utf-8').split('\0')
rows = []
for name in sorted(filter(None, NAMES)):
    if name == 'docs/SOURCE_INVENTORY.json':
        continue
    data = (ROOT / name).read_bytes().replace(b'\r\n', b'\n')
    rows.append(dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
inventory = dict(scope='All tracked source and license files; CAD, mesh, private inputs and execution reports excluded.',
    newline_policy='Hashes use canonical LF, matching Git blobs.', upstream_viewer_version='public-v9', files=rows)
(ROOT/'docs/SOURCE_INVENTORY.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')
print(f'Source inventory updated: {len(rows)} files.')
