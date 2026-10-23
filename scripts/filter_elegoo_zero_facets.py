"""Omit only exactly collinear indexed triangles from a pinned ELEGOO GLB.

No weld, remesh, position/normal/color edit, repair tolerance or native-CAD
equivalence is involved. Requires NumPy. The manifest records original counts
and the zero-based omitted facet IDs so an independent audit can replay it.
"""
import argparse
import copy
from fractions import Fraction
import gzip
import hashlib
import json
from pathlib import Path
import struct

import numpy as np


def digest(data):
    return hashlib.sha256(data).hexdigest()


def filtered_notices(notices):
    return [s.replace('Degenerate source triangles are retained and reported in mesh_qa.json.',
        'Exactly zero-area indexed triangles are omitted; IDs and original counts are recorded in the assembly manifest mesh_export_filter. All nonzero source facets are retained.')
        .replace('Not registered or published in the 3DPRIG viewer. Integration and applicable release QA remain outstanding.',
        'Static source-assembly preview. Mod installation, axis motion and physical fit are not certified.') for s in notices]


def exact_zero(triangle):
    points = [[Fraction(float(x)) for x in p] for p in triangle]
    u = [points[1][j]-points[0][j] for j in range(3)]
    v = [points[2][j]-points[0][j] for j in range(3)]
    return all(u[j]*v[(j+1)%3] == u[(j+1)%3]*v[j] for j in range(3))


def zero_ids(positions, faces):
    """Conservative outward intervals screen; exact dyadic arithmetic decides.

    A rounded float64 cross product alone is not a reliable zero predicate.
    Even the smallest nonzero float32-input triangle must be retained.
    """
    result = []
    down = lambda a: np.nextafter(a, -np.inf)
    up = lambda a: np.nextafter(a, np.inf)

    def mul(a, b):
        products = np.stack([a[0]*b[0], a[0]*b[1], a[1]*b[0], a[1]*b[1]])
        return down(products.min(axis=0)), up(products.max(axis=0))

    for start in range(0, len(faces), 65536):
        triangles = positions[faces[start:start+65536]].astype(np.float64)
        if not np.isfinite(triangles).all():
            raise ValueError('Nonfinite source position')
        u = triangles[:, 1]-triangles[:, 0]
        v = triangles[:, 2]-triangles[:, 0]
        ulo, uhi, vlo, vhi = down(u), up(u), down(v), up(v)
        candidates = np.ones(len(triangles), dtype=bool)
        for j in range(3):
            k = (j+1)%3
            a = mul((ulo[:, j], uhi[:, j]), (vlo[:, k], vhi[:, k]))
            b = mul((ulo[:, k], uhi[:, k]), (vlo[:, j], vhi[:, j]))
            candidates &= (down(a[0]-b[1]) <= 0) & (up(a[1]-b[0]) >= 0)
        result.extend(start+int(i) for i in np.flatnonzero(candidates) if exact_zero(triangles[i]))
    return result


def parse_glb(raw):
    if struct.unpack_from('<III', raw) != (0x46546c67, 2, len(raw)):
        raise ValueError('Invalid GLB header')
    jl, jt = struct.unpack_from('<II', raw, 12)
    if jt != 0x4e4f534a:
        raise ValueError('Missing GLB JSON')
    g = json.loads(raw[20:20+jl])
    bl, bt = struct.unpack_from('<II', raw, 20+jl)
    if bt != 0x004e4942 or 28+jl+bl != len(raw):
        raise ValueError('Invalid GLB BIN')
    if len(g['buffers']) != 1 or 'uri' in g['buffers'][0] or g.get('extensionsUsed') or g.get('images'):
        raise ValueError('Unsupported external, extended or image storage')
    binary = raw[28+jl:]
    if not 0 <= len(binary)-g['buffers'][0]['byteLength'] <= 3:
        raise ValueError('Invalid buffer length')
    return g, binary


def accessor(g, binary, aid):
    a = g['accessors'][aid]
    b = g['bufferViews'][a['bufferView']]
    dtypes = {5121:'u1', 5123:'<u2', 5125:'<u4', 5126:'<f4'}
    widths = {'SCALAR':1, 'VEC3':3, 'VEC4':4}
    if a.get('sparse') or b.get('buffer', 0) != 0:
        raise ValueError('Unsupported accessor')
    dt = np.dtype(dtypes[a['componentType']])
    width = widths[a['type']]
    if b.get('byteStride', width*dt.itemsize) != width*dt.itemsize:
        raise ValueError('Interleaved source is not supported')
    offset = a.get('byteOffset', 0)
    if offset+a['count']*width*dt.itemsize > b['byteLength']:
        raise ValueError('Accessor exceeds view')
    return np.ndarray((a['count'], width), dtype=dt, buffer=binary,
                      offset=b.get('byteOffset', 0)+offset).copy()


def filter_model(raw, manifest):
    g, binary = parse_glb(raw)
    original = copy.deepcopy(g)
    manifest = copy.deepcopy(manifest)
    if manifest.get('mesh_export_filter'):
        raise ValueError('Already filtered source')
    replacements, index_results, rows, removed_by_node = {}, {}, [], {}
    for mid, mesh in enumerate(g['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            if p.get('mode', 4) != 4 or 'indices' not in p:
                raise ValueError('Only indexed TRIANGLES are supported')
            pa = g['accessors'][p['attributes']['POSITION']]
            if pa['componentType'] != 5126 or pa['type'] != 'VEC3':
                raise ValueError('Expected Float32 source positions')
            positions = accessor(g, binary, p['attributes']['POSITION'])
            aid = p['indices']
            indices = accessor(original, binary, aid)
            if indices.shape[1] != 1 or len(indices)%3:
                raise ValueError('Invalid triangle indices')
            faces = indices.reshape(-1, 3)
            omitted = zero_ids(positions, faces)
            if not omitted:
                continue
            keep = np.ones(len(faces), dtype=bool)
            keep[omitted] = False
            retained = faces[keep].reshape(-1, 1)
            if not len(retained):
                raise ValueError('Refuse to erase a whole source primitive')
            a = g['accessors'][aid]
            bv = a['bufferView']
            b = g['bufferViews'][bv]
            users = [i for i, v in enumerate(g['accessors']) if v['bufferView'] == bv]
            if users != [aid] or a.get('byteOffset', 0) or b.get('byteStride'):
                raise ValueError('Shared/subrange index buffer view')
            if original['accessors'][aid]['count']*indices.dtype.itemsize != b['byteLength'] and aid not in index_results:
                raise ValueError('Index view contains other storage')
            if aid in index_results and index_results[aid] != omitted:
                raise ValueError('Shared index accessor requires incompatible masks')
            index_results[aid] = omitted
            replacements[bv] = retained.tobytes()
            a['count'] = len(retained)
            if 'min' in a: a['min'] = [int(retained.min())]
            if 'max' in a: a['max'] = [int(retained.max())]
            nodes = [n['name'] for n in g['nodes'] if n.get('mesh') == mid]
            if not nodes:
                raise ValueError('Unreferenced source mesh')
            for name in nodes:
                removed_by_node[name] = removed_by_node.get(name, 0)+len(omitted)
            rows.append({'mesh':mid, 'primitive':pi, 'nodes':nodes,
                         'source_triangles':len(faces), 'triangles':int(keep.sum()),
                         'omitted_exact_zero_facet_ids':omitted})
    compact = bytearray()
    for i, view in enumerate(g['bufferViews']):
        old = original['bufferViews'][i]
        if old.get('buffer', 0) != 0:
            raise ValueError('Multiple source buffers')
        data = replacements.get(i, binary[old.get('byteOffset', 0):old.get('byteOffset', 0)+old['byteLength']])
        compact.extend(b'\0'*((-len(compact))%4))
        view['byteOffset'], view['byteLength'] = len(compact), len(data)
        compact.extend(data)
    g['buffers'][0]['byteLength'] = len(compact)
    compact.extend(b'\0'*((-len(compact))%4))
    j = json.dumps(g, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    j += b' '*((-len(j))%4)
    output = (struct.pack('<III', 0x46546c67, 2, 28+len(j)+len(compact))
              +struct.pack('<II', len(j), 0x4e4f534a)+j
              +struct.pack('<II', len(compact), 0x004e4942)+compact)
    source_total = manifest['triangles']
    part_names = {p['node'] for p in manifest['parts']}
    if set(removed_by_node)-part_names:
        raise ValueError('Missing manifest source identity')
    for part in manifest['parts']:
        if part['node'] in removed_by_node:
            part['source_triangle_count'] = part['triangle_count']
            part['triangle_count'] -= removed_by_node[part['node']]
            if 'triangles' in part:
                if part['triangles'] != part['source_triangle_count']:
                    raise ValueError('Inconsistent original triangle counts')
                part['triangles'] = part['triangle_count']
    manifest['triangles'] = sum(p['triangle_count'] for p in manifest['parts'])
    manifest['mesh_export_filter'] = {
        'schema':'exact-zero-index-omission-v1', 'source_model_sha256':digest(raw),
        'source_triangles':source_total, 'omitted_triangles':source_total-manifest['triangles'],
        'predicate':'Exact rational cross product of original Float32 local positions equals zero.',
        'positions_normals_colors_materials_source_nodes_transforms':'unchanged',
        'primitives':rows,
        'scope':'Indexed tessellation only; no nonzero source facet removed, no CAD repair or fit certification.'}
    manifest['notices'] = filtered_notices(manifest.get('notices', []))
    return output, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--profile', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Output directory must not exist')
    packed = args.model.read_bytes()
    raw = gzip.decompress(packed) if args.model.suffix == '.gz' else packed
    output, manifest = filter_model(raw, json.loads(args.manifest.read_text(encoding='utf-8')))
    args.output.mkdir(parents=True)
    compressed = gzip.compress(output, compresslevel=7, mtime=0)
    (args.output/'model.glb.gz').write_bytes(compressed)
    (args.output/'assembly_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    if args.profile:
        profile = json.loads(args.profile.read_text(encoding='utf-8'))
        profile['notices'] = filtered_notices(profile.get('notices', []))
        (args.output/'machine_profile.json').write_text(json.dumps(profile, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'source_model_sha256':digest(raw), 'model_sha256':digest(output),
        'gzip_sha256':digest(compressed), 'parts':len(manifest['parts']),
        'omitted_triangles':manifest['mesh_export_filter']['omitted_triangles']}))


if __name__ == '__main__':
    main()
