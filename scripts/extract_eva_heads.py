"""Select a pinned public EVA assembly's leaves without altering mesh geometry.

The recipe supplies exact input hashes, original leaf keys and source companion
identities. No directory discovery, placement inference or substitute hardware.
"""
import argparse
import copy
import gzip
import hashlib
import json
import math
import re
import struct
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def numeric_array(value, rows, columns, label):
    if (not isinstance(value, list) or len(value) != rows
            or any(not isinstance(row, list) or len(row) != columns for row in value)
            or any(type(n) not in (int, float) or not math.isfinite(n)
                   for row in value for n in row)):
        raise ValueError('Invalid native bounds receipt ' + label)
    return value


def arrays_match(a, b, tolerance=1e-9):
    return all(abs(x-y) <= tolerance for ra, rb in zip(a, b) for x, y in zip(ra, rb))


def load_native_bounds(recipe, receipt_file, source_manifest):
    """Bind accepted native witnesses to the hash-pinned original public leaves.

    Older public models bake placements into their vertex buffers. Their original
    STEP transforms are therefore pinned explicitly in the accepted recipe, never
    inferred from GLB boxes or substituted with identity transforms.
    """
    pin = recipe.get('native_bounds')
    if pin is None and receipt_file is None:
        return {}, None
    if pin is None or receipt_file is None:
        raise ValueError('Pinned native bounds receipt input is required')
    raw = receipt_file.read_bytes()
    if sha(raw) != pin['receipt_sha256']:
        raise ValueError('Native bounds receipt hash changed')
    receipt = json.loads(raw)
    step_sha = recipe['source']['source_step_sha256']
    if (receipt['source_assembly_sha256'] != step_sha
            or source_manifest['source']['source_step_sha256'] != step_sha
            or receipt['source_revision'] != pin['source_revision']
            or receipt['source_head'] != pin['source_head']
            or receipt['eva_generation'] != recipe['generation']
            or receipt['eva_version'] != recipe['version']
            or receipt['version_scope'] != recipe['version_scope']
            or receipt['fixed_recipe_source_origin_mm'] != recipe.get('source_origin_mm', [0, 0, 0])
            or receipt['source_geometry_modified'] is not False
            or receipt['source_placements_modified'] is not False
            or receipt['retained_glb_modified'] is not False
            or receipt['tolerance_relaxed'] is not False):
        raise ValueError('Native bounds source revision, frame or provenance differs')
    version = re.search(r'\?version=(\d+)$', pin['source_revision'])
    if not version or int(version[1]) != recipe['source']['cad_revision']:
        raise ValueError('Native bounds CAD revision differs from the original source')
    records = {str(p['key']): p for p in source_manifest['parts']}
    patches = {}
    public_parts = []
    for part in receipt['parts']:
        key = part['source_leaf_key']
        if key in patches or key not in pin['leaves'] or key not in recipe['keys']:
            raise ValueError('Duplicate or unregistered native bounds leaf')
        row, accepted = records[key], pin['leaves'][key]
        if (part['key'] != recipe['id'] + '_' + key or row['source_valid'] is not True
                or part['definition'] != row['name'] or part['definition'] != accepted['definition']
                or part['name'] != accepted['name']
                or part['source_path'] != row['source_path'] or part['source_path'] != accepted['source_path']
                or part['source_revision'] != pin['source_revision']
                or part['source_assembly_sha256'] != step_sha
                or part['source_is_valid'] is not True
                or part['geometry_changed'] is not False or part['placement_changed'] is not False
                or row.get('native_adjustment_mm', [0, 0, 0]) != [0, 0, 0]):
            raise ValueError('Native bounds source identity or placement differs: ' + key)
        transform = numeric_array(part['native_transform'], 3, 4, 'transform')
        expected_transform = numeric_array(accepted['native_transform'], 3, 4, 'accepted transform')
        if (not arrays_match(transform, expected_transform, 1e-12)
                or ('native_transform' in row and not arrays_match(
                    transform, numeric_array(row['native_transform'], 3, 4, 'original transform'), 1e-12))):
            raise ValueError('Native bounds source transform differs: ' + key)
        old = numeric_array(part['source_conservative_bounds_native_zup_mm'], 2, 3, 'conservative bounds')
        original = numeric_array(row['native_bounds_mm'], 2, 3, 'original conservative bounds')
        if not arrays_match(old, original):
            raise ValueError('Native bounds original conservative bounds differ: ' + key)
        bounds = numeric_array(part['bounds_native_zup_mm'], 2, 3, 'trimmed bounds')
        if (any(bounds[0][axis] > bounds[1][axis] for axis in range(3))
                or any(bounds[0][axis] < old[0][axis]-1e-6
                       or bounds[1][axis] > old[1][axis]+1e-6 for axis in range(3))):
            raise ValueError('Native bounds exceed the original conservative envelope: ' + key)
        witnesses = part['native_bound_extrema']
        if len(witnesses) != 6:
            raise ValueError('Native bounds require all six native witnesses: ' + key)
        seen = set()
        for witness in witnesses:
            side, axis = witness['side'], witness['axis']
            if type(side) is not int or type(axis) is not int or side not in [0, 1] or axis not in [0, 1, 2] or (side, axis) in seen:
                raise ValueError('Duplicate or invalid native bound witness: ' + key)
            seen.add((side, axis))
            point = numeric_array([witness['point_native_zup_mm']], 1, 3, 'witness point')[0]
            plane = numeric_array([[witness['exterior_plane_coordinate_mm'], witness['native_distance_mm']]], 1, 2, 'witness distance')[0]
            if (abs(point[axis]-bounds[side][axis]) > 1e-9
                    or abs(abs(point[axis]-plane[0])-plane[1]) > 1e-5
                    or plane[1] < 0
                    or (side == 0 and plane[0] >= old[0][axis])
                    or (side == 1 and plane[0] <= old[1][axis])
                    or any(point[a] < bounds[0][a]-1e-6 or point[a] > bounds[1][a]+1e-6 for a in range(3))
                    or witness['operation'] != 'OpenCascade native BRepExtrema minimum distance to exterior plane'
                    or witness['deflection_mm'] != 1e-7):
                raise ValueError('Native bound witness does not correspond to the trimmed bounds: ' + key)
        patches[key] = part
        # Explicit field lists exclude local paths, unshipped diagnostic references,
        # wall-clock timings and independent worker workflow details.
        public_part = {k: copy.deepcopy(part[k]) for k in [
            'key', 'source_leaf_key', 'name', 'definition', 'source_path', 'source_label_path',
            'source_label_scope', 'definition_label', 'original_step_entities', 'native_transform',
            'brep_sha256', 'source_conservative_bounds_native_zup_mm',
            'source_addoptimal_bounds_native_zup_mm', 'bounds_native_zup_mm', 'bounds_method',
            'native_bound_extrema', 'source_is_valid']}
        public_parts.append(public_part)
    if set(patches) != set(pin['leaves']):
        raise ValueError('Missing pinned native bounds leaf')
    public_receipt = dict(schema='eva-native-bounds-v1', input_receipt_sha256=pin['receipt_sha256'],
        source_revision=pin['source_revision'], source_assembly_sha256=step_sha,
        subset_sha256=receipt['subset_sha256'], source_head=receipt['source_head'],
        eva_generation=recipe['generation'], eva_version=recipe['version'], version_scope=recipe['version_scope'],
        source_origin_mm=recipe.get('source_origin_mm', [0, 0, 0]),
        source_geometry_modified=False, source_placements_modified=False, retained_glb_modified=False,
        scope='Native source bounds and identity witnesses only; physical fit is not certified',
        parts=public_parts)
    return patches, public_receipt


def extract(recipe_file, model_file, manifest_file, output, profile_file=None, native_bounds_file=None):
    recipe = json.loads(recipe_file.read_text(encoding='utf8'))
    if recipe.get('source_origin_mm', [0, 0, 0]) != [0, 0, 0]:
        if profile_file is None:
            raise ValueError('A nonzero source origin requires its pinned original profile')
        profile_raw = profile_file.read_bytes()
        if sha(profile_raw) != recipe['source_profile_sha256']:
            raise ValueError('Original source profile changed')
        profile = json.loads(profile_raw)
        if (profile['origin_mm'] != recipe['source_origin_mm']
                or profile['basis'] != [[1, 0, 0], [0, 0, 1], [0, -1, 0]]
                or profile['source'] != recipe['source']):
            raise ValueError('Source profile frame or provenance differs from this assembly')
    raw = model_file.read_bytes()
    original_manifest = manifest_file.read_bytes()
    if sha(raw) != recipe['model_file_sha256'] or sha(original_manifest) != recipe['manifest_sha256']:
        raise ValueError('Public source identities changed')
    if model_file.name.endswith('.gz'):
        raw = gzip.decompress(raw)
    if sha(raw) != recipe['decoded_model_sha256']:
        raise ValueError('Decoded source model changed')
    magic, version, total, length, kind = struct.unpack_from('<IIIII', raw)
    if (magic, version, total, kind) != (0x46546c67, 2, len(raw), 0x4e4f534a):
        raise ValueError('Invalid source GLB')
    doc = json.loads(raw[20:20+length])
    binary_length, binary_kind = struct.unpack_from('<II', raw, 20+length)
    if binary_kind != 0x004e4942 or any(k in doc for k in ['skins', 'animations', 'textures', 'extensionsRequired']):
        raise ValueError('Unsupported source representation')
    binary = raw[28+length:28+length+binary_length]
    source_manifest = json.loads(original_manifest)
    records = {str(p['key']): p for p in source_manifest['parts']}
    bounds_patches, public_receipt = load_native_bounds(recipe, native_bounds_file, source_manifest)
    chosen = set(recipe['keys'])
    if not chosen or len(chosen) != len(recipe['keys']) or not chosen <= records.keys():
        raise ValueError('Unregistered EVA leaf')
    nodes, parts = [], []
    for node in doc['nodes']:
        match = re.fullmatch(r'part_(\d+)', node.get('name', ''))
        if not match or match[1] not in chosen:
            continue
        old = match[1]
        row = copy.deepcopy(records[old])
        if row.get('source_valid') is not True or node.get('children'):
            raise ValueError('Invalid or compound source leaf: ' + old)
        node = copy.deepcopy(node)
        key = recipe['id'] + '_' + old
        node.update(name=row['name'])
        node.setdefault('extras', {}).update(part_key=key, appearance_role=row['appearance_role'])
        row.update(key=key, source_leaf_key=old, source_commit=recipe['source_revision'],
                   source_assembly_sha256=recipe['decoded_model_sha256'],
                   eva_companions=[c for c, keys in recipe['companions'].items() if old in keys])
        if old in bounds_patches:
            patch = bounds_patches[old]
            row.update(native_bounds_mm=copy.deepcopy(patch['bounds_native_zup_mm']),
                       source_conservative_native_bounds_mm=copy.deepcopy(row['native_bounds_mm']),
                       native_transform=copy.deepcopy(patch['native_transform']),
                       native_bounds_method=patch['bounds_method'],
                       native_bound_extrema=copy.deepcopy(patch['native_bound_extrema']),
                       native_bounds_source_revision=patch['source_revision'],
                       native_bounds_source_step_sha256=patch['source_assembly_sha256'],
                       native_bounds_input_receipt_sha256=recipe['native_bounds']['receipt_sha256'])
        row['bounds_mm'] = [[n-recipe.get('source_origin_mm', [0, 0, 0])[i]
                             for i, n in enumerate(side)] for side in row['native_bounds_mm']]
        row['component'] = 'eva_native'
        row['supports_removed'] = False
        nodes.append(node)
        parts.append(row)
    if len(nodes) != len(chosen):
        raise ValueError('Source node/manifest mismatch')
    mesh_ids = sorted({n['mesh'] for n in nodes})
    mesh_map = {old: i for i, old in enumerate(mesh_ids)}
    meshes = copy.deepcopy([doc['meshes'][i] for i in mesh_ids])
    accessor_ids, material_ids = set(), set()
    for mesh in meshes:
        for primitive in mesh['primitives']:
            if any(k in primitive for k in ['targets', 'extensions']):
                raise ValueError('Unsupported source primitive')
            accessor_ids.update(primitive['attributes'].values())
            if 'indices' in primitive:
                accessor_ids.add(primitive['indices'])
            if 'material' in primitive:
                material_ids.add(primitive['material'])
    accessor_ids, material_ids = sorted(accessor_ids), sorted(material_ids)
    accessor_map = {old: i for i, old in enumerate(accessor_ids)}
    material_map = {old: i for i, old in enumerate(material_ids)}
    accessors = copy.deepcopy([doc['accessors'][i] for i in accessor_ids])
    if any('sparse' in a for a in accessors):
        raise ValueError('Sparse source accessor')
    view_ids = sorted({a['bufferView'] for a in accessors})
    view_map = {old: i for i, old in enumerate(view_ids)}
    views, compact = [], bytearray()
    for old in view_ids:
        view = copy.deepcopy(doc['bufferViews'][old])
        if view['buffer'] != 0:
            raise ValueError('External source buffer')
        offset, size = view.get('byteOffset', 0), view['byteLength']
        chunk = binary[offset:offset+size]
        if len(chunk) != size:
            raise ValueError('Truncated source buffer')
        compact.extend(b'\0' * (-len(compact) % 4))
        view.update(byteOffset=len(compact), buffer=0)
        compact.extend(chunk)
        views.append(view)
    for a in accessors:
        a['bufferView'] = view_map[a['bufferView']]
    for mesh in meshes:
        for primitive in mesh['primitives']:
            primitive['attributes'] = {k: accessor_map[v] for k, v in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] = accessor_map[primitive['indices']]
            if 'material' in primitive:
                primitive['material'] = material_map[primitive['material']]
    materials = [copy.deepcopy(doc['materials'][i]) for i in material_ids]
    for n, part in zip(nodes, parts):
        n['mesh'] = mesh_map[n['mesh']]
        override = recipe.get('hardware_material_overrides', {}).get(part['source_leaf_key'])
        if override:
            if part['appearance_role'] in ['base', 'accent']:
                raise ValueError('Hardware material override targets a printed part')
            for primitive in meshes[n['mesh']]['primitives']:
                material = copy.deepcopy(materials[primitive['material']])
                material['name'] = 'Purchased black polymer'
                material['pbrMetallicRoughness'].update(override)
                primitive['material'] = len(materials)
                materials.append(material)
            part['hardware_material_override'] = override
    compact.extend(b'\0' * (-len(compact) % 4))
    result = dict(asset={'version': '2.0'}, scene=0, scenes=[{'nodes': list(range(len(nodes)))}],
                  nodes=nodes, meshes=meshes, accessors=accessors, bufferViews=views,
                  buffers=[{'byteLength': len(compact)}], materials=materials)
    encoded = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    glb = struct.pack('<IIIII', magic, version, 28+len(encoded)+len(compact), len(encoded), kind)
    glb += encoded + struct.pack('<II', len(compact), binary_kind) + compact
    if recipe.get('expected_extracted_glb_sha256') and sha(glb) != recipe['expected_extracted_glb_sha256']:
        raise ValueError('Extracted GLB differs from the pinned geometry/material payload')
    metadata = dict(id=recipe['id'], parts=parts, source_commit=recipe['source_revision'],
                    eva_generation=recipe['generation'], eva_version=recipe['version'],
                    source_origin_mm=recipe.get('source_origin_mm', [0, 0, 0]),
                    source=recipe['source'], source_model_sha256=recipe['decoded_model_sha256'],
                    source_manifest_sha256=recipe['manifest_sha256'],
                    converter_sha256=sha(Path(__file__).read_bytes().replace(b'\r\n', b'\n')),
                    geometry_operation='Original geometry buffers and node matrices retained unchanged; purchased polymer material overrides recorded in source recipe',
                    complete_machine=False, native_single_sided=True,
                    supports_removed=False, support_isolation_verified=False)
    if public_receipt is not None:
        receipt_bytes = (json.dumps(public_receipt, ensure_ascii=False, indent=2)+'\n').encode('utf8')
        metadata['native_bounds_receipt'] = dict(file='NATIVE_BOUNDS_RECEIPT.json', sha256=sha(receipt_bytes),
            input_receipt_sha256=recipe['native_bounds']['receipt_sha256'],
            source_revision=public_receipt['source_revision'], source_step_sha256=public_receipt['source_assembly_sha256'],
            source_leaf_keys=sorted(bounds_patches))
    output.mkdir(parents=True, exist_ok=True)
    output.joinpath('model.glb.gz').write_bytes(gzip.compress(glb, compresslevel=9, mtime=0))
    output.joinpath('parts.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf8', newline='\n')
    output.joinpath('SOURCE_RECIPE.json').write_text(json.dumps(recipe, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    if public_receipt is not None:
        output.joinpath('NATIVE_BOUNDS_RECEIPT.json').write_bytes(receipt_bytes)
    print(json.dumps(dict(id=recipe['id'], parts=len(parts), glb_bytes=len(glb), glb_sha256=sha(glb))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['recipe', 'model', 'manifest', 'output']:
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--profile', type=Path)
    parser.add_argument('--native-bounds', type=Path)
    args = parser.parse_args()
    extract(args.recipe, args.model, args.manifest, args.output, args.profile, args.native_bounds)
