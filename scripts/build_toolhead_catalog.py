"""Extract the stock head without retessellating CAD; reuse registered head modules."""
import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path

HEAD_GROUP = '03_Stock_Stealthburner_CW2_Rapido2_UHF'


def subset_glb(source, group, roles):
    blob = source.read_bytes()
    magic, version, total, length, kind = struct.unpack_from('<IIIII', blob)
    assert (magic, version, total, kind) == (0x46546C67, 2, len(blob), 0x4E4F534A)
    original = json.loads(blob[20:20+length])
    assert not any(k in original for k in ['skins', 'animations', 'textures', 'extensionsRequired'])
    binary_length, binary_kind = struct.unpack_from('<II', blob, 20+length)
    assert binary_kind == 0x004E4942
    binary = blob[28+length:28+length+binary_length]
    root = next(i for i, node in enumerate(original['nodes']) if node.get('name') == group)
    kept = set()

    def walk(i):
        kept.add(i)
        for child in original['nodes'][i].get('children', []):
            walk(child)
    walk(root)
    node_ids = sorted(kept)
    node_map = {old: new for new, old in enumerate(node_ids)}
    mesh_ids = sorted({original['nodes'][i]['mesh'] for i in kept if 'mesh' in original['nodes'][i]})
    mesh_map = {old: new for new, old in enumerate(mesh_ids)}
    meshes = copy.deepcopy([original['meshes'][i] for i in mesh_ids])
    accessor_ids, material_ids = set(), set()
    for mesh in meshes:
        for primitive in mesh['primitives']:
            assert not any(k in primitive for k in ['targets', 'extensions'])
            accessor_ids.update(primitive['attributes'].values())
            if 'indices' in primitive:
                accessor_ids.add(primitive['indices'])
            if 'material' in primitive:
                material_ids.add(primitive['material'])
    accessor_ids, material_ids = sorted(accessor_ids), sorted(material_ids)
    accessor_map = {old: new for new, old in enumerate(accessor_ids)}
    material_map = {old: new for new, old in enumerate(material_ids)}
    accessors = copy.deepcopy([original['accessors'][i] for i in accessor_ids])
    assert all('sparse' not in a for a in accessors)
    view_ids = sorted({a['bufferView'] for a in accessors})
    view_map = {old: new for new, old in enumerate(view_ids)}
    views, compact = [], bytearray()
    for old in view_ids:
        view = copy.deepcopy(original['bufferViews'][old])
        assert view['buffer'] == 0
        start, size = view.get('byteOffset', 0), view['byteLength']
        data = binary[start:start+size]
        assert len(data) == size
        compact.extend(b'\0' * (-len(compact) % 4))
        view['byteOffset'], view['buffer'] = len(compact), 0
        compact.extend(data)
        # Geometry arrays are copied byte-for-byte, never scaled or remeshed.
        assert compact[view['byteOffset']:view['byteOffset']+size] == data
        views.append(view)
    for accessor in accessors:
        accessor['bufferView'] = view_map[accessor['bufferView']]
    for mesh in meshes:
        for primitive in mesh['primitives']:
            primitive['attributes'] = {k: accessor_map[v] for k, v in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] = accessor_map[primitive['indices']]
            if 'material' in primitive:
                primitive['material'] = material_map[primitive['material']]
    nodes = copy.deepcopy([original['nodes'][i] for i in node_ids])
    for node in nodes:
        if 'children' in node:
            node['children'] = [node_map[i] for i in node['children']]
        if 'mesh' in node:
            node['mesh'] = mesh_map[node['mesh']]
            key = node.get('extras', {}).get('part_key')
            if key in roles:
                node.setdefault('extras', {})['appearance_role'] = roles[key]
    compact.extend(b'\0' * (-len(compact) % 4))
    result = dict(asset={'version': '2.0'}, scene=0, scenes=[{'nodes': [node_map[root]]}],
                  nodes=nodes, meshes=meshes, materials=[original['materials'][i] for i in material_ids],
                  accessors=accessors, bufferViews=views, buffers=[{'byteLength': len(compact)}])
    body = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    body += b' ' * (-len(body) % 4)
    return struct.pack('<IIIII', magic, version, 28+len(body)+len(compact), len(body), kind) + body + struct.pack('<II', len(compact), binary_kind) + compact


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    output = parser.parse_args().output.resolve()
    read = lambda name: json.loads((output/name).read_text(encoding='utf8'))
    stock, palette, catalog = read('assembly_manifest.json'), read('COLOR_OPTIONS.json'), read('ASSEMBLY_CONFIGURATIONS.json')
    parts = [p for p in stock['parts'] if p['group'] == HEAD_GROUP]
    roles = {key: role for role in ['base', 'accent'] for key in palette['groups'][role]}
    destination = output/'toolheads'
    destination.mkdir(exist_ok=True)
    source = output/'SIBOOR_Trident_350.glb'
    data = subset_glb(source, HEAD_GROUP, roles)
    (destination/'sb_stock.glb').write_bytes(data)
    metadata = dict(id='sb_stock', source_file=source.name,
                    source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    geometry_operation='Select original head nodes and copy their geometry buffers unchanged',
                    parts=[dict(key=p['key'], name=p['name'], bounds_mm=p['bounds_mm'],
                                appearance_role=roles.get(p['key'])) for p in parts])
    (destination/'sb_stock.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf8')
    head = copy.deepcopy(catalog)
    head['schema'] = '3d-print-rig-toolheads-v1'
    head['gantries'] = [dict(id='siboor_awd', label='SIBOOR · 9 mm', belt_width_mm=9),
                        dict(id='trident_r2', label='VORON R2 · 6 mm', belt_width_mm=6)]
    head['base_assets'] = dict(stealthburner=dict(meta='toolheads/sb_stock.json', glb='toolheads/sb_stock.glb'),
                               xol=dict(meta='XOL_MOD.json', glb='Xol_SherpaMini_Rapido2UHF_AWD9.glb'))
    keys = {p['key'] for p in parts}
    for variant in head['variants']:
        variant['modules'] = [m for m in variant['modules'] if m['id'] != 'trident_r2_gantry_350']
        variant['removed_stock_keys'] = sorted(keys & set(variant['removed_stock_keys']))
        variant['notes'] = [n for n in variant['notes'] if 'CAN' in n or 'プローブ' in n or 'Cartographer' in n]
    used = {m['id'] for v in head['variants'] for m in v['modules']}
    head['assets'] = {k: v for k, v in head['assets'].items() if k in used}
    head['unique_head_combinations'] = len({(v['toolhead'], v['hotend'], v['extruder']) for v in head['variants']})
    (output/'TOOLHEAD_CONFIGURATIONS.json').write_text(json.dumps(head, ensure_ascii=False, indent=2), encoding='utf8')
    print(f'Stock head: {len(parts)} parts / {len(data):,} bytes; {head["unique_head_combinations"]} combinations, {len(head["gantries"])} carriage profiles.')


if __name__ == '__main__':
    main()
