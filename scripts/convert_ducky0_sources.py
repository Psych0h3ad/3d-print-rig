"""Convert six Ducky0 STL exports from the exact seven-file public receipt.

Keeps original surfaces, winding and print coordinates. No guessed assembly,
hardware, supports, colors or installed motion are introduced.
The bottom-panel remix is withheld because its cited original carries separate
Attribution-NonCommercial terms; it is never emitted by this exporter.
"""
import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

REVISION = 'a831046bed5624bc98ab2a42843d2d5ae851755a'
SOURCE = 'https://github.com/Ducky28/Ducky0'
EXPECTED = {
    'STLs/12032 Motor cooling bracket top left.stl': 'bbb1313d1626101037740b52980bdb10200f2398',
    'STLs/12032 motor cooling bracket bottom left.stl': '76e27bf45b91d0b994d0d2fb718434eaf1f0ffda',
    'STLs/12032 motor cooling bracket.stl': 'b980707db08a4bf321208fe732739117a456b526',
    'STLs/12032 motor cooling top bracket.stl': 'dc62d923a72ae323fb01647d99447973c0ae84f9',
    'STLs/FT BTT Pi TFT70 Screen enclosure mount.stl': '0081531781738e282ac505224b3db345bcec1876',
    'STLs/USB Hub Mount.stl': 'ca104bbaa7d1a4a6577b6ff3f21ee15b2bdac39f',
    'STLs/v0.2 bottom panel.stl': 'c12c510ae5922791d42b8db7ec1962690db9779a',
}
GROUPS = [
    ('motor-cooling', '12032 motor cooling brackets', list(EXPECTED)[:4]),
    ('electronics-mounts', 'Screen and USB hub mounts', list(EXPECTED)[4:6]),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def color_factor(hex_color):
    colors = [int(hex_color[i:i+2], 16)/255 for i in [0, 2, 4]]
    return [v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4 for v in colors] + [1]


def export(source_root, receipt, output):
    source_root = Path(source_root).resolve()
    rows = json.loads(Path(receipt).read_text(encoding='utf8'))
    if len(rows) != 7 or {r['path'] for r in rows} != set(EXPECTED):
        raise ValueError('Expected exactly the seven public Ducky0 STL identities')
    records = {r['path']: r for r in rows}
    reports = []
    for gid, label, paths in GROUPS:
        identifier = 'v0mod_ducky0_' + gid.replace('-', '_')
        doc = dict(asset=dict(version='2.0', generator='3D Print Rig pinned Ducky0 STL exporter'),
                   scene=0, scenes=[dict(nodes=[])], nodes=[], meshes=[], accessors=[], bufferViews=[],
                   materials=[dict(name='Printed base', pbrMetallicRoughness=dict(
                       baseColorFactor=color_factor('24272c'), metallicFactor=0, roughnessFactor=0.7))])
        binary = bytearray()
        parts = []

        def attribute(array, component_type, typ, target, bounds=False):
            binary.extend(b'\0' * (-len(binary) % 4))
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

        for relative in paths:
            row = records[relative]
            file = (source_root / relative).resolve()
            if not file.is_relative_to(source_root) or row['revision'] != REVISION:
                raise ValueError('Unpinned or outside source root')
            raw = file.read_bytes()
            blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if (len(raw) != row['bytes'] or sha(raw) != row['sha256']
                    or blob != row['git_blob_sha1'] or blob != EXPECTED[relative]):
                raise ValueError('Pinned source mismatch: ' + relative)
            count = struct.unpack_from('<I', raw, 80)[0]
            if not count or len(raw) != 84 + 50*count:
                raise ValueError('Invalid binary STL: ' + relative)
            dtype = np.dtype([('normal', '<f4', (3,)), ('v', '<f4', (3, 3)), ('attr', '<u2')])
            triangles = np.frombuffer(raw, dtype=dtype, count=count, offset=84)['v'].copy()
            precise = triangles.astype(np.float64)
            cross = np.cross(precise[:, 1]-precise[:, 0], precise[:, 2]-precise[:, 0])
            length = np.linalg.norm(cross, axis=1)
            if not np.isfinite(precise).all() or not np.isfinite(length).all() or (length == 0).any():
                raise ValueError('Nonfinite or zero-area source facets: ' + relative)
            # Native source millimetres [x,y,z] to glTF metres [x,z,-y].
            positions = precise.reshape(-1, 3)[:, [0, 2, 1]] * [0.001, 0.001, -0.001]
            normals = (cross/length[:, None])[:, [0, 2, 1]] * [1, 1, -1]
            complete = np.concatenate([positions, np.repeat(normals, 3, axis=0)], axis=1).astype('<f4')
            unique, inverse = np.unique(complete, axis=0, return_inverse=True)
            p = attribute(unique[:, :3].copy(), 5126, 'VEC3', 34962, True)
            n = attribute(unique[:, 3:].copy(), 5126, 'VEC3', 34962)
            i = attribute(inverse.astype('<u4'), 5125, 'SCALAR', 34963)
            key = 'ducky0_' + blob[:16]
            name = Path(relative).stem
            doc['scenes'][0]['nodes'].append(len(doc['nodes']))
            doc['nodes'].append(dict(name=name, mesh=len(doc['meshes']), extras=dict(
                part_key=key, source_file=relative, appearance_role='base', printed=True)))
            doc['meshes'].append(dict(name=name, primitives=[dict(attributes=dict(
                POSITION=p, NORMAL=n), indices=i, material=0)]))
            box = np.array([precise.reshape(-1, 3).min(axis=0), precise.reshape(-1, 3).max(axis=0)])
            parts.append(dict(key=key, name=name, source_path=['Ducky0', gid, name], source_file=relative,
                source_sha256=row['sha256'], source_git_blob_sha1=blob, source_commit=REVISION,
                source_triangles=count, triangles=count, vertices=len(unique), bbox_mm=box.tolist(),
                extents_mm=(box[1]-box[0]).tolist(), appearance_role='base', material='printed',
                palette_source='Viewer base palette; source STL has no authored material or accent designation',
                supports_removed=False, support_isolation_verified=False,
                support_review='Original source geometry; embedded support identity unresolved'))

        views = [dict(id=gid, label=label, parts=[p['key'] for p in parts], assembly=False)]
        doc['buffers'] = [dict(byteLength=len(binary))]
        encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        binary.extend(b'\0' * (-len(binary) % 4))
        glb = struct.pack('<III', 0x46546c67, 2, 12+8+len(encoded)+8+len(binary))
        glb += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
        glb += struct.pack('<II', len(binary), 0x004e4942) + binary
        metadata = dict(id=identifier, representation='STL', parts=parts, views=views, source_url=SOURCE,
            source_commit=REVISION, license='GPL-3.0', complete_machine=False,
            machine_installation_verified=False, assembly_poses_verified=False, triangles=sum(p['triangles'] for p in parts),
            source_units='mm', gltf_units='m', converter_sha256=sha(Path(__file__).read_bytes().replace(b'\r\n', b'\n')),
            conversion='All original triangles and winding retained; unit face normals recomputed; supports unchanged')
        target = Path(output) / identifier
        target.mkdir(parents=True, exist_ok=True)
        target.joinpath('model.glb.gz').write_bytes(gzip.compress(glb, compresslevel=9, mtime=0))
        target.joinpath('parts.json').write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf8', newline='\n')
        target.joinpath('SOURCE_FILES.json').write_text(json.dumps([records[p] for p in paths], indent=2)+'\n', encoding='utf8', newline='\n')
        reports.append(dict(id=identifier, parts=len(parts), triangles=metadata['triangles'], glb_bytes=len(glb), glb_sha256=sha(glb)))
    print(json.dumps(dict(parts=6, withheld_parts=1, payloads=reports, complete_machine=False)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    export(args.source_root, args.receipt, args.output)
