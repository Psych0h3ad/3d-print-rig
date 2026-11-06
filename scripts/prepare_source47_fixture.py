"""Emit the exact three public data bodies for bounded transport regressions."""
from pathlib import Path
import base64
import json
from prepare_source47_delivery import ORIGINALS, build_source47_delivery

if __name__ == '__main__':
    site = Path(__file__).resolve().parents[1] / 'site'
    bodies = build_source47_delivery(site)
    print(json.dumps({key: base64.b64encode(body).decode('ascii')
                      for key, (body, _) in zip(ORIGINALS, bodies)}))
