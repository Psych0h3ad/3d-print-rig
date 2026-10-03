"""Pack the Blender CAD renders into one transparent, repeating background.

Requires Pillow. Usage: python scripts/pack_cad_background.py /path/to/rendered-outlines
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ORDER = ["v0", "v24-head", "trident", "v24", "v24-gantry", "micron"]


def pack(directory):
    size = 600
    tile = Image.new("RGBA", (size * 3, size * 2))
    drawings = []
    for index, key in enumerate(ORDER):
        path = directory / f"{key}.png"
        record = json.loads((directory / f"{key}.json").read_text(encoding="utf-8"))
        with Image.open(path) as image:
            # Remove display-transform dithering in the nominally white paper.
            alpha = ImageOps.invert(image.convert("L")).point(lambda value: max(0, round((value - 5) * 255 / 250)))
            alpha = alpha.resize((size, size), Image.Resampling.LANCZOS)
        drawing = Image.new("RGBA", (size, size), (75, 99, 112, 0))
        drawing.putalpha(alpha)
        tile.alpha_composite(drawing, ((index % 3) * size, (index // 3) * size))
        record["visible_meshes"] = len(record.pop("visible_part_keys"))
        record["hidden_meshes"] = len(record.pop("hidden_part_keys"))
        record["render_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        drawings.append({"id": key, "tile_cell": [index % 3, index // 3], **record})
    output = ROOT / "site/viewer/art"
    output.mkdir(parents=True, exist_ok=True)
    tile.save(output / "cad-background.png", optimize=True)
    metadata = {
        "method": "Orthographic Freestyle hidden-line render of the registered CAD meshes; no synthesized geometry",
        "license": "GPL-3.0; original CAD and embedded component credits apply",
        "bundle": json.loads((ROOT / "site/ASSET_BUNDLE.json").read_text(encoding="utf-8")),
        "render_script": "scripts/render_cad_background.py",
        "packing_script": "scripts/pack_cad_background.py",
        "image_sha256": hashlib.sha256((output / "cad-background.png").read_bytes()).hexdigest(),
        "drawings": drawings,
    }
    (output / "cad-background.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Packed {len(drawings)} CAD renders: {(output / 'cad-background.png').stat().st_size:,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    pack(parser.parse_args().directory)
