"""Copy only viewer assets from a user's existing local CAD output. No upload."""
import argparse
import json
import shutil
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'

def safe_source(base, name):
    relative = PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts or '\\' in name or ':' in name:
        raise ValueError(f'Unsafe asset path: {name}')
    path = (base / relative).resolve()
    if not path.is_relative_to(base):
        raise ValueError(f'Asset escapes source directory: {name}')
    if not path.is_file():
        raise FileNotFoundError(path)
    return path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    source = parser.parse_args().output.resolve()
    catalog_path = safe_source(source, 'ASSEMBLY_CONFIGURATIONS.json')
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    names = {
        'assembly_manifest.json', 'flexible_routes.json', 'SIBOOR_Trident_350.glb',
        'Endstop_Mechanisms.glb', 'COLOR_OPTIONS.json', 'ASSEMBLY_CONFIGURATIONS.json',
        'R2_ENDSTOP_REGISTRATION.json', 'DISCO_MOD.json', 'Disco_on_a_Stick_XXL_350.glb',
        'TOOLHEAD_CONFIGURATIONS.json', 'toolheads/sb_stock.glb', 'toolheads/sb_stock.json',
        'XOL_MOD.json', 'Xol_SherpaMini_Rapido2UHF_AWD9.glb',
        'machines/siboor_v24_350/assembly_manifest.json',
        'machines/siboor_v24_350/machine_profile.json', 'machines/siboor_v24_350/model.glb',
        'machines/voron_trident_350/assembly_manifest.json', 'machines/voron_trident_350/model.glb',
        'machines/voron_trident_350/machine_profile.json', 'machines/voron_trident_350/configurations.json',
        'COMPONENT_LIBRARY.json', 'MACHINE_MODS.json',
    }
    library=json.loads(safe_source(source,'COMPONENT_LIBRARY.json').read_text(encoding='utf8'))
    frame_mods=json.loads(safe_source(source,'MACHINE_MODS.json').read_text(encoding='utf8'))
    for asset in list(catalog['assets'].values())+list(library['assets'].values())+list(frame_mods['assets'].values()):
        for key in ('meta', 'glb'):
            name = asset[key]
            expected = '.json' if key == 'meta' else '.glb'
            if not name.startswith('modules/') or PurePosixPath(name).suffix != expected:
                raise ValueError(f'Unexpected module file: {name}')
            names.add(name)
    # Validate every source before copying anything.
    files = [(name, safe_source(source, name)) for name in sorted(names)]
    for name, path in files:
        destination = SITE / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    print(f'Imported {len(files)} local viewer files. No STEP files or uploads.')

if __name__ == '__main__':
    main()
