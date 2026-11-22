# The bridge between Mule Create (the 3D sketching program in C:\Users\Admin\Desktop\SW5E\MuleCreate; skill `.claude/skills/mule`) and the game's
# Blender pipeline (2026-11-22; the user: "wire it as necessary to Blender/Mixar/and our other tools"). Headless Blender 5.3 (or Mixar):
#   blender -b --factory-startup --python tools/blender/mule.py -- refs <out dir>
#       writes sw5e_scale.usda: what to sketch against in Mule (Ctrl+I): a person 1.702 m tall (1.21 units, models.tsx UNITS_PER_M), a doorway
#       1.0 x 1.42 units (models.tsx DOOR_W/DOOR_H), a storey 3.4 units (LocalMap.tsx LEVEL_H) and one map unit square, all in metres
#   blender -b --factory-startup --python tools/blender/mule.py -- refs <out dir> <model.glb> [--units]
#       also writes <model>.usda from a game model, to sketch over it (--units: the model is in map units, as the architecture kit is; else metres)
#   blender -b --factory-startup --python tools/blender/mule.py -- blend <brief dir> <out.blend>
#       the sketch (the brief's scene.usd) as a .blend, Z up, to build against in Blender or Mixar
#   blender -b --factory-startup --python tools/blender/mule.py -- compare <brief dir> <model.glb> <out dir> [--units]
#       renders the built model from each hero camera of the brief (brief.json `cameras`) at the size of Mule's own hero picture, alone
#       (hero_<name>_build.png, to set beside views/hero_<name>.png) and with the sketch drawn over it in orange (hero_<name>_both.png)
# Mule is Y up in metres; Blender is Z up: a Mule point (x, y, z) is Blender (x, -z, y). Paths must be absolute, as with every script here.
import bpy, json, math, os, struct, sys
from mathutils import Matrix, Vector

UNITS_PER_M = 1.21 / 1.702
M_PER_UNIT = 1 / UNITS_PER_M
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
flags = {a for a in args if a.startswith("--")}
args = [a for a in args if not a.startswith("--")]


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, size, at, col):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.color = col
    bpy.ops.object.transform_apply(scale=True)
    return o


def mannequin():
    # 1.702 m: legs to 0.83, torso to 1.42, head 0.23 (a plain figure for scale, not the game's body kit)
    parts = [box("legs", (0.30, 0.20, 0.83), (0, 0, 0.415), (0.6, 0.6, 0.65, 1)),
             box("torso", (0.42, 0.24, 0.59), (0, 0, 1.125), (0.6, 0.6, 0.65, 1))]
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, location=(0, 0, 1.587), segments=16, ring_count=8)
    parts.append(bpy.context.object)
    parts[-1].name = "head"
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = "person_1.702m"


def scale_refs(out):
    fresh()
    mannequin()
    w, h, post = 1.0 * M_PER_UNIT, 1.42 * M_PER_UNIT, 0.08
    for i, x in enumerate((-w / 2 - post / 2, w / 2 + post / 2)):
        box(f"door_post{i}", (post, post, h), (1.5 + x, 0, h / 2), (0.45, 0.5, 0.6, 1))
    box("door_head", (w + 2 * post, post, post), (1.5, 0, h + post / 2), (0.45, 0.5, 0.6, 1))
    s = 3.4 * M_PER_UNIT
    box("storey_3.4u", (0.05, 0.05, s), (3.0, 0, s / 2), (0.8, 0.5, 0.2, 1))
    box("unit_square", (M_PER_UNIT, M_PER_UNIT, 0.01), (-1.6, 0, 0.005), (0.3, 0.4, 0.3, 1))
    path = os.path.join(out, "sw5e_scale.usda")
    bpy.ops.wm.usd_export(filepath=path, selected_objects_only=False, export_materials=False)
    print("wrote", path)


def glb_ref(out, glb, units):
    fresh()
    bpy.ops.import_scene.gltf(filepath=glb)
    if units:
        for o in bpy.context.scene.objects:
            if o.parent is None:
                o.scale = tuple(v * M_PER_UNIT for v in o.scale)
    path = os.path.join(out, os.path.splitext(os.path.basename(glb))[0] + ".usda")
    bpy.ops.wm.usd_export(filepath=path, selected_objects_only=False, export_materials=False)
    print("wrote", path, len(bpy.context.scene.objects), "objects")


def sketch(brief):
    usd = os.path.join(brief, "scene.usd")
    if not os.path.exists(usd):
        raise SystemExit(f"no scene.usd in {brief}")
    before = set(bpy.data.objects)
    bpy.ops.wm.usd_import(filepath=usd)
    return [o for o in bpy.data.objects if o not in before]


def png_size(path):
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24]) if head[:8] == b"\x89PNG\r\n\x1a\n" else None


def z_up(p):
    return Vector((p[0], -p[2], p[1]))


def camera(c):
    cam = bpy.data.cameras.new(c.get("name", "hero"))
    ob = bpy.data.objects.new("cam_" + cam.name, cam)
    bpy.context.scene.collection.objects.link(ob)
    eye, target = z_up(c["eye"]), z_up(c["target"])
    up = z_up(c.get("up", (0, 1, 0)))
    fwd = (target - eye).normalized()
    right = fwd.cross(up).normalized()
    up = right.cross(fwd)
    ob.matrix_world = Matrix.Translation(eye) @ Matrix((right, up, -fwd)).transposed().to_4x4()
    cam.sensor_fit = "VERTICAL"
    if c.get("orthographic_height"):
        cam.type = "ORTHO"
        cam.ortho_scale = c["orthographic_height"]  # the view's full height (sensor fit vertical)
    else:
        cam.angle_y = math.radians(c.get("fov_vertical_deg", 40))
    cam.clip_start, cam.clip_end = 0.01, 5000
    return ob


def compare(brief, glb, out, units):
    fresh()
    sk = sketch(brief)
    orange = (1.0, 0.45, 0.05, 1)
    for o in sk:
        o.color = orange
        if o.type == "MESH":
            o.modifiers.new("wire", "WIREFRAME").thickness = 0.01
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    built = [o for o in bpy.data.objects if o not in before]
    for o in built:
        o.color = (0.78, 0.78, 0.8, 1)
        if units and o.parent is None:
            o.scale = tuple(v * M_PER_UNIT for v in o.scale)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "OBJECT"
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = False
    cams = json.load(open(os.path.join(brief, "brief.json"), encoding="utf-8")).get("cameras", [])
    if not cams:
        raise SystemExit("brief.json has no cameras")
    os.makedirs(out, exist_ok=True)
    for c in cams:
        ob = camera(c)
        sc.camera = ob
        name = c.get("name", "hero")
        size = png_size(os.path.join(brief, "views", f"hero_{name}.png"))
        aspect = c.get("aspect", 4 / 3)
        sc.render.resolution_x, sc.render.resolution_y = size or (1024, round(1024 / aspect))
        for tag, shown in (("build", built), ("both", built + sk)):
            for o in built + sk:
                o.hide_render = o not in shown
            sc.render.filepath = os.path.join(out, f"hero_{name}_{tag}.png")
            bpy.ops.render.render(write_still=True)
            print("rendered", sc.render.filepath)
    lo = Vector((min(v[i] for o in built if o.type == "MESH" for v in ((o.matrix_world @ Vector(b)) for b in o.bound_box)) for i in range(3)))
    hi = Vector((max(v[i] for o in built if o.type == "MESH" for v in ((o.matrix_world @ Vector(b)) for b in o.bound_box)) for i in range(3)))
    print("build size (Mule axes x, y up, z) m:", round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3))


mode = args[0] if args else ""
if mode == "refs" and len(args) >= 2:
    os.makedirs(args[1], exist_ok=True)
    scale_refs(args[1])
    for g in args[2:]:
        glb_ref(args[1], g, "--units" in flags)
elif mode == "blend" and len(args) == 3:
    fresh()
    print(len(sketch(args[1])), "sketch objects")
    bpy.ops.wm.save_as_mainfile(filepath=args[2])
elif mode == "compare" and len(args) == 4:
    compare(args[1], args[2], args[3], "--units" in flags)
else:
    raise SystemExit("usage: see the head of tools/blender/mule.py")
