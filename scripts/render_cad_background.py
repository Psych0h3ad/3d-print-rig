"""Render actual catalog meshes as hidden-line drawings; run inside Blender.

blender --background --python-exit-code 1 --python scripts/render_cad_background.py -- \
  --assets /path/to/extracted/viewer-models --output /path/to/rendered-outlines

No geometry is synthesized. Transparent panels are hidden for legibility. Each
selection, source hash and projection is recorded beside its rendered image.
"""
import argparse
import gzip
import hashlib
import json
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

RECIPES = [
    ("v0", "VORON V0.2r1 / 120", "voron_v02r1_120", []),
    ("v24-head", "VORON V2.4 original toolhead assembly", "voron_v24_300_printed", ["V24_Toolhead"]),
    ("trident", "VORON Trident / 300", "voron_trident_300", []),
    ("v24", "VORON V2.4 / 300", "voron_v24_300_printed", []),
    ("v24-gantry", "VORON V2.4 XY gantry", "voron_v24_300_printed", ["V24_Gantry", "V24_X_Beam", "V24_Toolhead", "V24_Reference_Belts"]),
    ("micron", "Micron Plus R1 / 180", "micron_plus_r1_180", []),
]


def render(assets, output, recipe):
    key, label, machine, groups = recipe
    relative = f"machines/{machine}/model.glb.gz"
    compressed = (assets / relative).read_bytes()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with tempfile.TemporaryDirectory() as directory:
        glb = Path(directory) / "model.glb"
        glb.write_bytes(gzip.decompress(compressed))
        bpy.ops.import_scene.gltf(filepath=str(glb))

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 6
    scene.render.resolution_x = scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world = bpy.data.worlds.new("Paper")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    scene.view_settings.view_transform = "Standard"

    paper = bpy.data.materials.new("Paper")
    paper.use_nodes = True
    nodes = paper.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs[0].default_value = (1, 1, 1, 1)
    surface = nodes.new("ShaderNodeOutputMaterial")
    paper.node_tree.links.new(emission.outputs[0], surface.inputs["Surface"])

    meshes, selected_keys, excluded_keys = [], [], []
    for obj in list(scene.objects):
        if obj.type != "MESH":
            continue
        props = obj.data
        part_key = props.get("part_key", obj.name)
        alpha = min([material.diffuse_color[3] for material in props.materials if material] + [1])
        if (groups and props.get("group") not in groups) or alpha < .99 or props.get("appearance_role") in ("panel", "transparent_panel"):
            excluded_keys.append(part_key)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        props.materials.clear()
        props.materials.append(paper)
        meshes.append(obj)
        selected_keys.append(part_key)
    if not meshes:
        raise ValueError(f"No meshes selected for {key}")

    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    center = (lo + hi) * .5
    camera_data = bpy.data.cameras.new("Orthographic")
    camera = bpy.data.objects.new("Orthographic", camera_data)
    scene.collection.objects.link(camera)
    direction = Vector((4, -6, 3.2)).normalized()
    camera.location = center + direction * (hi - lo).length * 3
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.clip_end = 1000
    scene.camera = camera
    bpy.context.view_layer.update()
    inverse = camera.matrix_world.inverted()
    projected = [inverse @ corner for corner in corners]
    width = max(v.x for v in projected) - min(v.x for v in projected)
    height = max(v.y for v in projected) - min(v.y for v in projected)
    camera_data.ortho_scale = max(width, height) * 1.15

    scene.render.use_freestyle = True
    freestyle = bpy.context.view_layer.freestyle_settings
    freestyle.crease_angle = 2.3
    lines = freestyle.linesets[0]
    lines.linestyle = bpy.data.linestyles.new("Visible CAD edges")
    lines.select_silhouette = lines.select_crease = lines.select_border = True
    lines.select_external_contour = True
    lines.linestyle.color = (0, 0, 0)
    lines.linestyle.thickness = 1.2
    scene.render.filepath = str(output / f"{key}.png")
    bpy.ops.render.render(write_still=True)
    record = {
        "label": label, "asset": relative,
        "asset_sha256": hashlib.sha256(compressed).hexdigest(),
        "groups": groups or "all",
        "visible_part_keys": sorted(selected_keys),
        "hidden_part_keys": sorted(excluded_keys),
        "camera_direction_blender_z_up": list(direction),
        "projection": "orthographic", "transparent_panels": "hidden",
        "geometry_changes": "none", "renderer": bpy.app.version_string,
    }
    (output / f"{key}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {key}: {len(meshes)} actual catalog meshes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--only", choices=[r[0] for r in RECIPES], nargs="+")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.assets = args.assets.resolve()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    for recipe in RECIPES:
        if not args.only or recipe[0] in args.only:
            render(args.assets, args.output, recipe)
