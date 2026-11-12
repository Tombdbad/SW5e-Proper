# The doors of the Megascans pack (2026-11-12; the user: "search the megascans library for doors ... to replace those we have"): the low tier of three free Quixel Megascans
# door scans, each one mesh with its base colour and normal maps, set up so that the game can hang it in a doorway: width along x from the hinge edge (x 0) to the far edge,
# height up from the floor, thickness centred on the wall's plane, the face to +z; maps cut to 512 px. Writes client/public/megascans/doors.glb (GIT-IGNORED: the Fab Standard
# License does not allow the files, or what is made from them, to be redistributed, and the repository is public; the game runs without it, models.tsx `useDoorPack`).
#   blender --background --python tools/blender/build-megascans-doors.py
import bpy, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REF = os.path.join(ROOT, "tools", "refs", "megascans")
OUT = os.path.join(ROOT, "client", "public", "megascans", "doors.glb")
DOORS = [
    ("door_plank", "historic_miscellaneous_door_wood_old_01", "Historic_Miscellaneous_Door_Wood_Old_01_ulxqbjmaw_Low"),
    ("door_barn", "historic_miscellaneous_door_wood_old_02", "Historic_Miscellaneous_Door_Wood_Old_02_ulxqbfxaw_Low"),
    ("door_glazed", "painted_wooden_door", "Painted_Wooden_Door_vmqifgedw_Low"),
]
bpy.ops.wm.read_factory_settings(use_empty=True)
made = []
for name, folder, stem in DOORS:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(REF, folder, stem + ".fbx"))
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in new:
        o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = name
    # the scan's own size, in metres, whatever the FBX's unit (a scan may be in centimetres)
    xs = [v.co for v in ob.data.vertices]
    dims = Vector((max(c.x for c in xs) - min(c.x for c in xs), max(c.y for c in xs) - min(c.y for c in xs), max(c.z for c in xs) - min(c.z for c in xs)))
    if max(dims) > 20:
        ob.data.transform(__import__("mathutils").Matrix.Scale(0.01, 4))
        dims *= 0.01
    # the tallest axis is up, the thinnest the thickness
    order = sorted(range(3), key=lambda i: dims[i])
    thick, wide, tall = order[0], order[1], order[2]
    perm = [0, 0, 0]
    perm[wide], perm[thick], perm[tall] = 0, 2, 1  # Blender (x, y, z) -> (width, up, thickness): glTF is y up, so Blender z is up
    # build in Blender axes: x width, y thickness, z up
    me = ob.data
    lo = [min(v.co[i] for v in me.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
    for v in me.vertices:
        c = v.co
        w, t, h = c[wide] - lo[wide], c[thick] - (lo[thick] + hi[thick]) / 2, c[tall] - lo[tall]
        v.co = (w, t, h)
    me.update()
    # the material: base colour and normal at 512
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    def image(kind):
        path = os.path.join(REF, folder, f"{stem}_1K_{kind}.jpg")
        if not os.path.exists(path):
            return None
        im = bpy.data.images.load(path)
        if im.size[0] > 512:
            im.scale(512, 512)
        return im
    base = image("BaseColor")
    if base:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = base
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    nrm = image("Normal")
    if nrm:
        nrm.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = nrm
        n = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], n.inputs["Color"])
        nt.links.new(n.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.85
    me.materials.clear()
    me.materials.append(mat)
    ob.location = (0, 0, 0)
    made.append(ob)
    print(name, "w", round(max(v.co[0] for v in me.vertices), 3), "t", round(max(v.co[1] for v in me.vertices) - min(v.co[1] for v in me.vertices), 3), "h", round(max(v.co[2] for v in me.vertices), 3), "tris", len(me.polygons))
bpy.ops.object.select_all(action="DESELECT")
for o in made:
    o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_image_format="JPEG", export_apply=True, export_yup=True)
print("wrote", OUT, os.path.getsize(OUT))
