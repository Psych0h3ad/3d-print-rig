"""Repair Monolith mating datums from native CAD, exporting to a separate directory.

Requires CadQuery and the preparation workspace (modules/*.brep + module_cad.py).
Usage: python prepare_monolith_mount_assets.py --cad-root WORKSPACE --assets SITE --output NEW_DIR
The source workspace and deployed bundle are never modified.
"""
import argparse
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface


def bounds(s):
    b = s.BoundingBox()
    return [[b.xmin, b.ymin, b.zmin], [b.xmax, b.ymax, b.zmax]]


def holes(s, radius):
    result = []
    for f in s.Faces():
        if f.geomType() != 'CYLINDER':
            continue
        c = BRepAdaptor_Surface(f.wrapped).Cylinder()
        if abs(c.Radius() - radius) < 1e-5 and abs(c.Axis().Direction().Y()) > .99999:
            p = c.Location()
            value = [p.X(), p.Z()]
            if not any(math.dist(value, v) < 1e-5 for v in result):
                result.append(value)
    assert len(result) == 4, result
    return result


def common_volume(a, b):
    return sum(abs(s.Volume()) for s in a.intersect(b).Solids())


def contact(a, b):
    return {'gap_mm': a.distance(b), 'overlap_mm3': common_volume(a, b)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['cad-root', 'assets', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    src, assets, out = args.cad_root.resolve(), args.assets.resolve(), args.output.resolve()
    if out.exists() or out == src or out == assets or out.is_relative_to(src):
        raise ValueError('Use a new output directory outside the preparation workspace.')
    out.mkdir(parents=True)
    sys.path.insert(0, str(src / 'scripts'))
    import module_cad
    module_cad.O = out  # Module writes only into this separate export.
    read = lambda p: json.loads(p.read_text(encoding='utf8'))
    native = lambda ident, key: cq.Shape.importBrep(str(src / 'output/modules' / ident / (ident + '_' + str(key) + '.brep')))
    registry = read(assets / 'MACHINE_HEAD_REGISTRATIONS.json')
    records, hashes = [], {}
    blocks = {size: native('monolith_x_frame_' + str(size), 19) for size in [250, 350]}
    block = blocks[350]
    target_holes = holes(block, 1.2295)
    target_y = min(f.Center().y for f in block.Faces() if f.geomType() == 'PLANE' and f.normalAt().y < -.99999)
    target = [0, target_y, 0]
    source_datums = {}
    for width in [6, 9]:
        ident = 'changer_sc_core_monolith_' + str(width)
        meta = read(src / 'output/modules' / (ident + '.json'))
        if meta.get('keeper_pose_correction_mm'):
            raise ValueError('Source module is already corrected; use the unmodified preparation input.')
        assert meta['backplate_translation_mm'] == [0, -7.04, 0]
        body, keeper = native(ident, 'body'), native(ident, 'keeper_r')
        axes = holes(body, 1.7)
        center = [sum(v[i] for v in axes) / 4 for i in range(2)]
        # The split keeper was left in its original frame when the shuttle and
        # tool were translated forward. Apply the SAME rigid translation.
        keeper_delta = meta['backplate_translation_mm'][1]
        keeper = keeper.translate((0, keeper_delta, 0))
        # Upper/lower lands around the MGN screw holes, not the centre recess
        # or the shuttle's two overhanging lips (its misleading bbox maximum).
        lands = [f for f in keeper.Faces() if f.geomType() == 'PLANE' and f.normalAt().y > .99999 and f.Area() > 80
                 and any(f.BoundingBox().zmin < z < f.BoundingBox().zmax and f.BoundingBox().xmin < x < f.BoundingBox().xmax for x, z in axes)]
        assert len(lands) == 2
        source_y = sum(f.Center().y * f.Area() for f in lands) / sum(f.Area() for f in lands)
        origin = [center[0], source_y, center[1]]
        shift = [a - b for a, b in zip(target, origin)]
        old_shift = [a - b for a, b in zip(target, registry['sources']['stealthchanger_monolith']['origin_mm'])]
        old_mount_face = next(f for f in body.Faces() if f.geomType() == 'PLANE' and f.normalAt().y > .99999 and 250 < f.Area() < 270)
        old_gap = target_y - (old_mount_face.Center().y + old_shift[1])
        body_keeper = contact(body, keeper)
        assert body_keeper['gap_mm'] < 1e-4 and body_keeper['overlap_mm3'] < .001
        for size, b in blocks.items():
            bk = contact(keeper.translate(tuple(shift)), b)
            sb = contact(body.translate(tuple(shift)), b)
            axis_error = max(min(math.dist([x + shift[0], z + shift[2]], p) for p in target_holes) for x, z in axes)
            assert bk['gap_mm'] < 1e-4 and bk['overlap_mm3'] < .001 and sb['overlap_mm3'] < .001 and axis_error < .001
            # Contact has actual area on the block, not just tangent edges.
            placed_lands = cq.Compound.makeCompound([f.translate(tuple(shift)) for f in lands])
            contact_area = sum(f.Area() for f in placed_lands.intersect(b, tol=1e-5).Faces())
            assert contact_area > 140, contact_area  # ~148 mm² for this one half-keeper
            records.append(dict(kind='stealthchanger',width=width,size=size,axis_error_mm=axis_error,body_keeper=body_keeper,keeper_block=bk,body_block=sb,contact_area_mm2=contact_area,old_body_mount_face_gap_mm=old_gap))
        source_datums[ident] = dict(origin_mm=origin,axis_error_mm=axis_error,part_key=ident+'_keeper_r',compatible_belt_widths_mm=[width],datum='MGN screw lands on split keeper',geometry_revision='monolith-contact-v1')
        m = module_cad.Module(ident)
        reference_shift = source_y - bounds(native(ident, 23))[0][1]
        for row in meta['parts']:
            key = row['key'][len(ident)+1:]
            s = native(ident, key)
            if row['component'] == 'keeper':
                s = s.translate((0, keeper_delta, 0))
            elif row['component'] == 'rail_reference':
                s = s.translate((0, reference_shift, 0))
            extra = {k:v for k,v in row.items() if k not in ['key','name','file','color','appearance_role','motion','bounds_mm','valid','solids']}
            m.add(key,row['name'],s,row['appearance_role'],row['color'],row['motion'],**extra)
            original = src/'output/modules'/ident/(row['key']+'.brep')
            hashes[original.relative_to(src).as_posix()] = hashlib.sha256(original.read_bytes()).hexdigest()
        extra = {k:v for k,v in meta.items() if k not in ['id','parts','glb','step','valid','geometry_revision']}
        m.save(**extra,geometry_revision='monolith-contact-v1',mount_datum=source_datums[ident],keeper_pose_correction_mm=[0,keeper_delta,0],reference_pose_correction_mm=[0,reference_shift,0])
        exported=cq.importers.importStep(str(out/'modules'/(ident+'.step'))).val()
        assert exported.isValid() and len(exported.Solids())==sum(p['solids'] for p in m.rows)
        raw = out/'modules'/(ident+'.glb')
        (raw.with_suffix('.glb.gz')).write_bytes(gzip.compress(raw.read_bytes(),mtime=0))
    registry['sources']['stealthchanger_monolith'] = source_datums['changer_sc_core_monolith_6']
    registry['monolith_target'] = dict(origin_mm=target,axis_error_mm=max(r['axis_error_mm'] for r in records),part_key='monolith_x_frame_350_19')
    for ident in ['head_sphinx_monolith_tricorn','head_sphinx_monolith_rapido_x_uhf']:
        body = native(ident,6)
        axes = holes(body,1.75)
        plane = next(f for f in body.Faces() if f.geomType()=='PLANE' and f.normalAt().y>.99999 and f.Area()>1200)
        origin = [sum(p[0] for p in axes)/4,plane.Center().y,sum(p[1] for p in axes)/4]
        shift = [a-b for a,b in zip(target,origin)]
        # Author's upper/lower belt channels have 10.5 mm clear height. Both
        # actual Monolith 6 and 9 mm belt envelopes land on their backing plane.
        channels = [f for f in body.Faces() if f.geomType()=='PLANE' and f.normalAt().y>.99999 and abs(f.Center().y+9.74)<1e-5]
        assert len(channels)==4
        for f in channels:
            b=f.BoundingBox()
            assert b.zlen>=10.499 and abs(f.Center().y+shift[1]-(-1.74))<1e-5
            assert (b.zmin<=2 and b.zmax>=11) or (b.zmin<=-11 and b.zmax>=-2)
        for size,b in blocks.items():
            c=contact(body.translate(tuple(shift)),b)
            axis_error=max(min(math.dist([x+shift[0],z+shift[2]],p) for p in holes(b,1.2295)) for x,z in axes)
            area=sum(f.Area() for f in plane.translate(tuple(shift)).intersect(b,tol=1e-5).Faces())
            assert c['gap_mm']<1e-4 and c['overlap_mm3']<.001 and axis_error<.001 and area>300
            records.append(dict(kind='fixed_sphinx',asset=ident,size=size,axis_error_mm=axis_error,body_block=c,contact_area_mm2=area,belt_channel_height_mm=min(f.BoundingBox().zlen for f in channels),belt_widths_mm=[6,9]))
        entrance=bounds(body)
        # Verify the visible belt portion after stopping at the actual head
        # entrance. This is a preview cut, not a claim of internal clamp routing.
        void=cq.Solid.makeBox(entrance[1][0]-entrance[0][0],70,30,(entrance[0][0]+shift[0],-35,-15))
        for width in [6,9]:
            for band in [0,1]:
                belt=native(f'monolith_belts_vt_{width}_2wd_350',band)
                overlap=common_volume(belt.cut(void),body.translate(tuple(shift)))
                assert overlap<.001,overlap
                records.append(dict(kind='fixed_belt_preview',asset=ident,width=width,band=band,visible_body_overlap_mm3=overlap,internal_return_path_registered=False))
        registry['sources'][ident]=dict(origin_mm=origin,axis_error_mm=axis_error,part_key=ident+'_6',compatible_belt_widths_mm=[6,9],datum='Main-body MGN plane and four mounting axes',belt_preview_cut=dict(x_mm=[entrance[0][0]+shift[0],entrance[1][0]+shift[0]],y_mm=[-35,35]))
    (out/'MACHINE_HEAD_REGISTRATIONS.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    # Merge only these keys when integrating into a newer bundle. Never replace
    # unrelated machine registrations added concurrently (INDX, sizes, etc.).
    patch=dict(monolith_target=registry['monolith_target'],sources={k:registry['sources'][k] for k in ['stealthchanger_monolith','head_sphinx_monolith_tricorn','head_sphinx_monolith_rapido_x_uhf']})
    (out/'MONOLITH_MOUNT_REGISTRATIONS.json').write_text(json.dumps(patch,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    report=dict(records=records,source_sha256=hashes,passed=True,scope='Static native mating faces, keeper stack, four MGN axes, belt channel planes/heights. Full travel and belt tension are not verified.')
    (out/'MONOLITH_MOUNT_QA.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['records'],indent=2),flush=True)


if __name__=='__main__':
    main()
