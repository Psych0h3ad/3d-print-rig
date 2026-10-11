"""Export pinned, current CocobustorZero STL parts without inventing assembly poses.

Inputs are the exact public files listed in a receipt containing path, bytes,
git_blob_sha1 and sha256. NumPy is required. Surface geometry and winding are
preserved; unit face normals are recomputed. Exactly zero-area triangles are
omitted and identified. No supports are silently removed.
"""
import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

REVISION = '052e6c321a7e3fffad5057ce1e9f87de38f0e867'
COMPONENT = 'v0mod_cocobustorzero'
SOURCE = 'https://github.com/CoconutDevelopment/CocobustorZero'
HELD = {
    'STLs/Coconut Air Ducts/[a]_Right_Duct_x1.stl': 'Degenerate seam with nonmanifold boundary cycles',
    'STLs/Thick Belted z/Belted_Z_BedMount_x1.stl': 'Nonmanifold point contacts; auxiliary shell function unresolved',
}
GROUPS = [
    ('awd-coconut-v2', 'Coconut V2 AWD', 'STLs/V0 4WD/CoconutAWD/v2AWD (Latest)/'),
    ('ulw-x', 'ULW X gantry', 'STLs/ULW X Gantry/'),
    ('belted-z', 'Thick belted Z', 'STLs/Thick Belted z/'),
    ('m4max', 'M4max', 'STLs/M4max/'),
    ('air-ducts', 'Coconut air ducts', 'STLs/Coconut Air Ducts/'),
    ('accessories', 'Mounts, front idlers and spool holder', None),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def color_factor(hex_color):
    """glTF base colors are linear; the viewer's printed palette is sRGB."""
    values = [int(hex_color[i:i+2], 16)/255 for i in [0, 2, 4]]
    return [v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4 for v in values] + [1]


def export(source_root, receipt, output):
    source_root = Path(source_root).resolve()
    rows = json.loads(Path(receipt).read_text(encoding='utf-8'))
    if len(rows) != 37 or len({r['path'] for r in rows}) != 37:
        raise ValueError('Expected every one of the 37 current public STL exports')
    reports, all_keys = [], set()
    for gid, label, prefix in GROUPS:
        doc = dict(asset=dict(version='2.0', generator='3D Print Rig pinned STL exporter'),
                   scene=0, scenes=[dict(nodes=[])], nodes=[], meshes=[], materials=[
                       dict(name='Printed base', pbrMetallicRoughness=dict(
                           baseColorFactor=color_factor('24272c'), metallicFactor=0, roughnessFactor=0.7)),
                       dict(name='Printed accent', pbrMetallicRoughness=dict(
                           baseColorFactor=color_factor('e32636'), metallicFactor=0, roughnessFactor=0.7)),
                   ], accessors=[], bufferViews=[], buffers=[])
        binary = bytearray()
        parts, views, triangle_count = [], [], 0
        selected = [r for r in rows if r['path'].startswith(prefix)] if prefix else [
            r for r in rows if not any(r['path'].startswith(g[2]) for g in GROUPS if g[2])]
        views.append(dict(id=gid, label=label, parts=[], assembly=False))
        for row in sorted(selected, key=lambda r: r['path']):
            relative = row['path']
            file = (source_root / relative).resolve()
            if (not file.is_relative_to(source_root) or row.get('revision') != REVISION
                    or not relative.endswith('.stl') or any(s in relative for s in
                        ['Archived', 'Superwide Stance', 'TimTimAWD'])):
                raise ValueError('Unpinned, archived or alternative source')
            raw = file.read_bytes()
            blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if (len(raw) != row['bytes'] or sha(raw) != row['sha256']
                    or blob != row['git_blob_sha1']):
                raise ValueError('Source receipt mismatch: ' + relative)
            if relative in HELD:
                continue
            count = struct.unpack_from('<I', raw, 80)[0]
            if len(raw) != 84 + 50 * count or count == 0:
                raise ValueError('Invalid binary STL: ' + relative)
            dtype = np.dtype([('normal', '<f4', (3,)), ('v', '<f4', (3, 3)), ('attr', '<u2')])
            triangles = np.frombuffer(raw, dtype=dtype, count=count, offset=84)['v'].copy()
            precise = triangles.astype(np.float64)
            cross = np.cross(precise[:, 1] - precise[:, 0], precise[:, 2] - precise[:, 0])
            length = np.linalg.norm(cross, axis=1)
            if not np.isfinite(triangles).all() or not np.isfinite(length).all():
                raise ValueError('Nonfinite source triangles: ' + relative)
            zero_area = np.flatnonzero(length == 0).tolist()
            triangles = triangles[length > 0]
            cross, length = cross[length > 0], length[length > 0]
            if not len(triangles):
                raise ValueError('Empty source surface: ' + relative)
            normals = (cross / length[:, None]).astype('<f4')
            # Native CAD [x,y,z] millimetres to glTF [x,z,-y] metres.
            positions = triangles.reshape(-1, 3)[:, [0, 2, 1]] * np.array([0.001, 0.001, -0.001])
            normals = normals[:, [0, 2, 1]] * np.array([1, 1, -1])
            complete = np.concatenate([positions, np.repeat(normals, 3, axis=0)], axis=1).astype('<f4')
            unique, inverse = np.unique(complete, axis=0, return_inverse=True)

            def attribute(array, component_type, typ, target, bounds=False):
                while len(binary) % 4:
                    binary.append(0)
                offset = len(binary)
                data = array.tobytes()
                binary.extend(data)
                view = len(doc['bufferViews'])
                doc['bufferViews'].append(dict(buffer=0, byteOffset=offset, byteLength=len(data), target=target))
                record = dict(bufferView=view, componentType=component_type, count=len(array), type=typ)
                if bounds:
                    record.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
                accessor = len(doc['accessors'])
                doc['accessors'].append(record)
                return accessor

            p = attribute(unique[:, :3].copy(), 5126, 'VEC3', 34962, True)
            n = attribute(unique[:, 3:].copy(), 5126, 'VEC3', 34962)
            i = attribute(inverse.astype('<u4'), 5125, 'SCALAR', 34963)
            key = 'cocobustor_' + row['git_blob_sha1'][:16]
            name = Path(relative).stem
            role = 'accent' if name.startswith('[a]_') else 'base'
            node_index = len(doc['nodes'])
            doc['nodes'].append(dict(name=name, mesh=len(doc['meshes']), extras=dict(
                part_key=key, source_file=relative, appearance_role=role, printed=True)))
            doc['scenes'][0]['nodes'].append(node_index)
            doc['meshes'].append(dict(name=name, primitives=[dict(attributes=dict(
                POSITION=p, NORMAL=n), indices=i, material=1 if role == 'accent' else 0)]))
            box = np.array([triangles.reshape(-1, 3).min(axis=0), triangles.reshape(-1, 3).max(axis=0)])
            parts.append(dict(key=key, name=name, source_path=['CocobustorZero', gid, name],
                              source_file=relative, source_sha256=row['sha256'], source_git_blob_sha1=blob,
                              source_commit=REVISION, source_triangles=count,
                              triangles=len(triangles), vertices=len(unique),
                              zero_area_triangles_removed=zero_area,
                              bbox_mm=box.tolist(), extents_mm=(box[1]-box[0]).tolist(),
                              appearance_role=role, material='printed', supports_removed=False,
                              support_review='Original source geometry; embedded support identity unresolved'))
            views[-1]['parts'].append(key)
            triangle_count += len(triangles)

        selected = [r for r in selected if r['path'] not in HELD]
        if len(parts) != len(selected) or len({p['key'] for p in parts}) != len(selected) or any(not v['parts'] for v in views):
            raise ValueError('Incomplete component groups')
        doc['buffers'] = [dict(byteLength=len(binary))]
        j = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
        j += b' ' * (-len(j) % 4)
        binary += b'\0' * (-len(binary) % 4)
        glb = struct.pack('<III', 0x46546c67, 2, 12+8+len(j)+8+len(binary))
        glb += struct.pack('<II', len(j), 0x4e4f534a) + j
        glb += struct.pack('<II', len(binary), 0x004e4942) + binary
        metadata = dict(id=COMPONENT+'_'+gid.replace('-', '_'), representation='STL', parts=parts, source_url=SOURCE,
                        source_commit=REVISION, license='GPL-3.0', machine_installation_verified=False,
                        complete_machine=False, assembly_poses_verified=False, views=views,
                        triangles=triangle_count, source_units='mm', gltf_units='m',
                        converter_sha256=sha(Path(__file__).read_bytes().replace(b'\r\n', b'\n')),
                        conversion='Original nonzero-area triangles and winding retained; unit face normals recomputed; exactly zero-area source triangles identified and omitted; supports unchanged')
        destination = Path(output) / (COMPONENT+'_'+gid.replace('-', '_'))
        destination.mkdir(parents=True, exist_ok=True)
        destination.joinpath('model.glb.gz').write_bytes(gzip.compress(glb, compresslevel=9, mtime=0))
        destination.joinpath('parts.json').write_text(json.dumps(metadata, ensure_ascii=False,
            separators=(',', ':'))+'\n', encoding='utf-8', newline='\n')
        destination.joinpath('SOURCE_FILES.json').write_text(json.dumps(selected, indent=2)+'\n', encoding='utf-8', newline='\n')
        reports.append(dict(id=metadata['id'], parts=len(parts), triangles=triangle_count, glb_bytes=len(glb), glb_sha256=sha(glb)))
        all_keys.update(p['key'] for p in parts)
    if len(all_keys) != 35:
        raise ValueError('Incomplete public source coverage')
    print(json.dumps(dict(parts=len(all_keys), payloads=reports, complete_machine=False)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    export(args.source_root, args.receipt, args.output)
