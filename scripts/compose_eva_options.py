"""Compose explicit, hash-pinned public CAD leaves in one native source frame.

Inputs must already have their native mating transforms baked by their source
preparer. This tool copies geometry and placements; it does not infer a mount,
fit hardware, resize a part, or manufacture missing components.
"""
import argparse
import copy
import gzip
import hashlib
import json
import math
import struct
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked(record):
    raw = Path(record['file']).read_bytes()
    if len(raw) != record['bytes'] or sha(raw) != record['sha256']:
        raise ValueError('Composition input differs from its pinned public artifact')
    if record.get('encoding') not in (None, 'gzip'):
        raise ValueError('Unsupported composition input encoding')
    data = gzip.decompress(raw) if record.get('encoding') == 'gzip' else raw
    if record.get('encoding') == 'gzip' and (
            len(data) != record['decoded_bytes'] or sha(data) != record['decoded_sha256']):
        raise ValueError('Decoded composition input differs from its pin')
    return data


def glb(data):
    magic, version, size = struct.unpack_from('<III', data)
    if (magic, version, size) != (0x46546C67, 2, len(data)):
        raise ValueError('Invalid composition GLB')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or length % 4:
        raise ValueError('Invalid GLB JSON chunk')
    doc = json.loads(data[20:20+length])
    n, kind = struct.unpack_from('<II', data, 20+length)
    binary = data[28+length:28+length+n]
    if kind != 0x004E4942 or len(binary) != n or len(data) != 28+length+n:
        raise ValueError('Invalid GLB binary chunk')
    if any(doc.get(k) for k in ('skins', 'animations', 'textures', 'images', 'extensionsRequired')):
        raise ValueError('Extended composition GLB needs a separate exporter')
    if len(doc['buffers']) != 1 or doc['buffers'][0].get('uri'):
        raise ValueError('Composition requires a self-contained native GLB')
    return doc, binary


IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def multiply(left, right):
    return [sum(left[k*4+r]*right[c*4+k] for k in range(4))
            for c in range(4) for r in range(4)]


def rigid_matrix(node):
    """Preserve a source render gauge without baking local Float32 vertices."""
    if 'matrix' in node:
        if any(k in node for k in ('translation', 'rotation', 'scale')):
            raise ValueError('Ambiguous native node transform')
        matrix = node['matrix']
    else:
        translation = node.get('translation', [0, 0, 0])
        rotation = node.get('rotation', [0, 0, 0, 1])
        scale = node.get('scale', [1, 1, 1])
        if (len(translation) != 3 or len(rotation) != 4 or len(scale) != 3
                or not all(type(v) in (int, float) and math.isfinite(v)
                           for v in [*translation, *rotation, *scale])
                or any(abs(v-1) > 1e-9 for v in scale)
                or abs(sum(v*v for v in rotation)-1) > 1e-9):
            raise ValueError('Native occurrence transform must be finite and rigid')
        x, y, z, w = rotation
        matrix = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,
                  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
                  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,
                  *translation, 1]
    if (len(matrix) != 16 or not all(type(v) in (int, float) and math.isfinite(v) for v in matrix)
            or any(abs(matrix[i]-expected) > 1e-9 for i, expected in ((3, 0), (7, 0), (11, 0), (15, 1)))):
        raise ValueError('Invalid affine native occurrence matrix')
    axes = [matrix[i:i+3] for i in (0, 4, 8)]
    if any(abs(sum(a*b for a, b in zip(axes[i], axes[j]))-(1 if i == j else 0)) > 1e-9
           for i in range(3) for j in range(3)):
        raise ValueError('Native occurrence matrix changes source dimensions')
    a, b, c = axes
    det = (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0])
           + a[2]*(b[0]*c[1]-b[1]*c[0]))
    if abs(det-1) > 1e-9:
        raise ValueError('Native occurrence matrix changes source handedness')
    return list(matrix)


def compose(recipe_file, destination):
    recipe_raw = recipe_file.read_bytes()
    recipe = json.loads(recipe_raw)
    if recipe['schema'] != '3d-print-rig-eva-composition-v1':
        raise ValueError('Invalid composition recipe')
    origin = recipe['source_origin_mm']
    if len(origin) != 3 or not all(type(v) in (int, float) and math.isfinite(v) for v in origin):
        raise ValueError('Invalid explicit source origin')
    result = dict(asset={'version': '2.0'}, scene=0, scenes=[{'nodes': []}],
                  nodes=[], meshes=[], accessors=[], bufferViews=[], materials=[])
    binary = bytearray()
    parts, identities, used_keys, inputs = [], set(), set(), []
    for source in recipe['inputs']:
        model_data, meta_data = checked(source['model']), checked(source['metadata'])
        native_data = checked(source['native_source'])
        revision = source['source_revision']
        if not isinstance(revision, str) or not revision:
            raise ValueError('Missing pinned native source revision')
        metadata = json.loads(meta_data)
        if metadata.get('source_origin_mm', metadata.get('source_origin_native_zup_mm', [0, 0, 0])) != origin:
            raise ValueError('Native composition frames differ')
        doc, source_binary = glb(model_data)
        records = {p['key']: p for p in metadata['parts']}
        keys = source['keys']
        if len(records) != len(metadata['parts']) or not keys or len(set(keys)) != len(keys) or not set(keys) <= records.keys():
            raise ValueError('Incomplete explicit native leaf selection')
        if used_keys.intersection(keys):
            raise ValueError('Composition repeats a native occurrence key')
        used_keys.update(keys)
        parents = {}
        for i, node in enumerate(doc['nodes']):
            rigid_matrix(node)
            for child in node.get('children', []):
                if type(child) is not int or child < 0 or child >= len(doc['nodes']) or child in parents:
                    raise ValueError('Invalid/shared native occurrence graph')
                parents[child] = i
        for i in range(len(doc['nodes'])):
            visited, current = set(), i
            while current is not None:
                if current in visited:
                    raise ValueError('Cyclic native occurrence graph')
                visited.add(current)
                current = parents.get(current)
        owners = {}
        owner_matrices = {}
        for i, node in enumerate(doc['nodes']):
            key = node.get('extras', {}).get('part_key')
            if key not in keys:
                continue
            parent = parents.get(i)
            matrix = rigid_matrix(node)
            while parent is not None:
                ancestor = doc['nodes'][parent]
                if ancestor.get('extras', {}).get('part_key') == key:
                    break
                if ancestor.get('extras', {}).get('part_key') is not None:
                    raise ValueError('Native occurrence is nested under another part identity')
                matrix = multiply(rigid_matrix(ancestor), matrix)
                parent = parents.get(parent)
            else:
                if key in owners:
                    raise ValueError('Duplicate native source occurrence')
                owners[key] = i
                owner_matrices[i] = matrix
        if set(owners) != set(keys):
            raise ValueError('Selected native source occurrences missing in actual GLB')
        node_ids = set()
        def visit(index):
            if index in node_ids:
                raise ValueError('Repeated/cyclic native occurrence graph')
            node_ids.add(index)
            for child in doc['nodes'][index].get('children', []):
                visit(child)
        for index in owners.values():
            visit(index)
        node_ids = sorted(node_ids)
        mesh_ids = sorted({doc['nodes'][i]['mesh'] for i in node_ids if 'mesh' in doc['nodes'][i]})
        accessor_ids, material_ids = set(), set()
        for i in mesh_ids:
            for primitive in doc['meshes'][i]['primitives']:
                if primitive.get('targets') or primitive.get('extensions') or primitive.get('mode', 4) != 4:
                    raise ValueError('Unsupported native mesh primitive')
                accessor_ids.update(primitive['attributes'].values())
                accessor_ids.add(primitive['indices'])
                if 'material' in primitive:
                    material_ids.add(primitive['material'])
        accessor_ids, material_ids = sorted(accessor_ids), sorted(material_ids)
        if any('sparse' in doc['accessors'][i] for i in accessor_ids):
            raise ValueError('Sparse native composition input')
        view_ids = sorted({doc['accessors'][i]['bufferView'] for i in accessor_ids})
        node_map = {old: len(result['nodes'])+i for i, old in enumerate(node_ids)}
        mesh_map = {old: len(result['meshes'])+i for i, old in enumerate(mesh_ids)}
        accessor_map = {old: len(result['accessors'])+i for i, old in enumerate(accessor_ids)}
        material_map = {old: len(result['materials'])+i for i, old in enumerate(material_ids)}
        view_map = {old: len(result['bufferViews'])+i for i, old in enumerate(view_ids)}
        for old in view_ids:
            view = copy.deepcopy(doc['bufferViews'][old])
            if view['buffer'] != 0:
                raise ValueError('External native buffer view')
            start, count = view.get('byteOffset', 0), view['byteLength']
            payload = source_binary[start:start+count]
            if len(payload) != count:
                raise ValueError('Truncated native mesh buffer')
            binary.extend(b'\0' * (-len(binary) % 4))
            view.update(buffer=0, byteOffset=len(binary))
            binary.extend(payload)
            result['bufferViews'].append(view)
        for old in accessor_ids:
            row = copy.deepcopy(doc['accessors'][old])
            row['bufferView'] = view_map[row['bufferView']]
            result['accessors'].append(row)
        for old in mesh_ids:
            mesh = copy.deepcopy(doc['meshes'][old])
            for primitive in mesh['primitives']:
                primitive['attributes'] = {k: accessor_map[v] for k, v in primitive['attributes'].items()}
                primitive['indices'] = accessor_map[primitive['indices']]
                if 'material' in primitive:
                    primitive['material'] = material_map[primitive['material']]
            result['meshes'].append(mesh)
        result['materials'].extend(copy.deepcopy([doc['materials'][i] for i in material_ids]))
        for old in node_ids:
            node = copy.deepcopy(doc['nodes'][old])
            if old in owner_matrices:
                for key in ('translation', 'rotation', 'scale'):
                    node.pop(key, None)
                node['matrix'] = owner_matrices[old]
            if 'mesh' in node:
                node['mesh'] = mesh_map[node['mesh']]
            if 'children' in node:
                node['children'] = [node_map[i] for i in node['children']]
            result['nodes'].append(node)
        result['scenes'][0]['nodes'].extend(node_map[i] for i in owners.values())
        for key in keys:
            part = copy.deepcopy(records[key])
            identity = part.get('source_path')
            labels, definition = part.get('source_label_path'), part.get('definition_label')
            if labels is not None or definition is not None:
                if (not isinstance(labels, list) or len(labels) != len(identity)
                        or any(not isinstance(label, str) or not label for label in labels)
                        or not isinstance(definition, str) or not definition):
                    raise ValueError('Incomplete native source occurrence labels')
            token = json.dumps([sha(native_data), identity, labels, definition], sort_keys=True)
            if (not isinstance(identity, list) or not identity
                    or any(not isinstance(p, str) or not p for p in identity)
                    or token in identities):
                raise ValueError('Missing or repeated native source identity')
            existing_revision = part.get('source_revision', part.get('source_commit'))
            if existing_revision is not None and existing_revision != revision:
                raise ValueError('Source preparation revision differs from native pin')
            if part.get('source_sha256') not in (None, sha(native_data)):
                raise ValueError('Source preparation CAD hash differs from native pin')
            part['source_revision'], part['source_sha256'] = revision, sha(native_data)
            override = recipe.get('companion_membership', {}).get(key)
            if override is not None:
                if (not isinstance(override, list) or len(override) != len(set(override))
                        or any(not isinstance(p, str) or not p for p in override)):
                    raise ValueError('Invalid explicit companion membership')
                part['eva_companions'] = override
            identities.add(token)
            parts.append(part)
        inputs.append({'model_sha256': sha(model_data), 'metadata_sha256': sha(meta_data),
                       'native_source_sha256': sha(native_data), 'source_revision': revision, 'keys': keys})
    meta = copy.deepcopy(recipe['metadata'])
    if meta['id'] != recipe['id'] or meta['source_origin_mm'] != origin:
        raise ValueError('Composition result frame/ID differs from recipe')
    meta['parts'] = parts
    meta['eva_composition'] = {'recipe_sha256': sha(recipe_raw),
                             'part_sources': {p['key']: {k: p[k] for k in (
                                 'source_revision', 'source_sha256', 'source_path',
                                 'source_label_path', 'definition_label') if k in p} for p in parts}}
    binary.extend(b'\0' * (-len(binary) % 4))
    result['buffers'] = [{'byteLength': len(binary)}]
    body = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    body += b' ' * (-len(body) % 4)
    data = struct.pack('<IIIII', 0x46546C67, 2, 28+len(body)+len(binary), len(body), 0x4E4F534A)+body+struct.pack('<II', len(binary), 0x004E4942)+binary
    destination.mkdir(parents=True, exist_ok=False)
    (destination/'model.glb.gz').write_bytes(gzip.compress(data, mtime=0))
    (destination/'parts.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    receipt = {'schema': '3d-print-rig-eva-composition-receipt-v1', 'recipe_sha256': sha(recipe_raw),
               'id': recipe['id'], 'inputs': inputs, 'parts': len(parts), 'decoded_model_sha256': sha(data),
               'geometry_operation': 'Copy explicitly selected source geometry and native occurrence transforms unchanged',
               'geometry_scaled': False, 'mount_inferred': False, 'physical_fit_certified': False}
    (destination/'COMPOSITION_RECEIPT.json').write_text(json.dumps(receipt, indent=2)+'\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recipe', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(compose(args.recipe, args.output)))
