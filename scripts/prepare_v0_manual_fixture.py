"""Emit exact public manual DATA bodies for Node's source-only stream fixture."""
from pathlib import Path
import base64
import json
from prepare_v0_manual_delivery import build_v0_manual_delivery_bodies

root = Path(__file__).resolve().parents[1]
bodies = build_v0_manual_delivery_bodies(root / 'site')
print(json.dumps({Path(receipt['path']).name.removesuffix('.json.gz'):
                  base64.b64encode(body).decode('ascii')
                  for body, receipt in bodies}, separators=(',', ':')))
