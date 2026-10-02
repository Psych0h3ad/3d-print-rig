"""Extract open belt centerlines from the pinned, smooth native Monolith CAD.

Usage: CadQuery Python export_monolith_belt_routes.py NATIVE_OUTPUT DESTINATION
No hardware or curve radius is scaled. Size changes extend straight spans.
"""
import json
import math
import sys
from pathlib import Path
import cadquery as cq
from OCP.BRepTools import BRepTools_WireExplorer


def ordered(wire):
    explorer = BRepTools_WireExplorer(wire.wrapped)
    result = []
    while explorer.More():
        edge = cq.Edge(explorer.Current())
        start = cq.Vertex(explorer.CurrentVertex()).Center()
        result.append((edge, (edge.positionAt(0) - start).Length > 1e-6))
        explorer.Next()
    return result


def point(edge, reverse, t):
    return edge.positionAt(1 - t if reverse else t)


def extract(shape):
    face = max((f for f in shape.Faces() if f.BoundingBox().zlen < 1e-5), key=lambda f: f.Area())
    edges = ordered(face.outerWire())
    caps = [i for i, (e, _) in enumerate(edges) if e.geomType() == 'LINE' and abs(e.Length() - 1.38) < .001]
    assert len(caps) == 2
    a, b = caps
    left = edges[a+1:b]
    right = [(e, not reverse) for e, reverse in reversed(edges[b+1:] + edges[:a])]
    assert len(left) == len(right)
    segments = []
    for (e, reverse), (other, other_reverse) in zip(left, right):
        assert e.geomType() == other.geomType() and e.geomType() in ['LINE', 'CIRCLE']
        samples = [(point(e, reverse, t) + point(other, other_reverse, t)) * .5 for t in [0, .5, 1]]
        row = dict(kind=e.geomType().lower(), points=[[p.x, p.y] for p in samples])
        if e.geomType() == 'CIRCLE':
            center = e.arcCenter()
            assert (center - other.arcCenter()).Length < .00001
            row['center'] = [center.x, center.y]
            row['radius'] = (samples[0] - center).Length
            u, v = samples[0] - center, samples[1] - center
            row['turn'] = 1 if u.x * v.y - u.y * v.x > 0 else -1
            row['sweep'] = (e.Length() / e.radius() + other.Length() / other.radius()) * .5
        segments.append(row)
    box = shape.BoundingBox()
    return dict(segments=segments, z=(box.zmin+box.zmax)/2, width=box.zlen, thickness=1.38)


def main():
    source, destination = map(Path, sys.argv[1:3])
    jobs = json.loads((source/'ADDITIONAL_GANTRY_JOBS.json').read_text(encoding='utf8'))
    routes = {}
    for name, job in jobs.items():
        if job['kind'] != 'belt':
            continue
        folder = source/'received_additional'/job['id']
        rows = json.loads((folder/'inventory.json').read_text(encoding='utf8'))
        routes[job['id']] = [dict(source_key=row['key'], **extract(cq.Shape.importBrep(str(folder/(row['key']+'.brep'))))) for row in rows]
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(dict(schema='monolith-open-belt-routes-v1', source_size_mm=250, routes=routes), separators=(',', ':')), encoding='utf8')
    print(f'Extracted {sum(map(len,routes.values()))} native open belt routes in {len(routes)} modules')


if __name__ == '__main__':
    main()
