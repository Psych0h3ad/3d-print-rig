"""Exact public reference DATA for the source-only Node stream regression."""
import base64,json
from pathlib import Path
from prepare_trident_manual_delivery import build_trident_manual_delivery_bodies

root=Path(__file__).resolve().parents[1]
print(json.dumps({Path(row['path']).name.removesuffix('.json.gz'):base64.b64encode(body).decode('ascii') for body,row in build_trident_manual_delivery_bodies(root/'site')},separators=(',',':')))
