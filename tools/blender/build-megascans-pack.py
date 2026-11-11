# The Megascans packs (2026-11-11; the user: "Build the pack"): the low tier of the free Quixel Megascans pieces they downloaded (tools/megascans.json says which
# and from where), made small enough for a phone: one mesh a piece (the lowest LOD that looks right, decimated to its budget, every variant a piece of its own),
# its origin on the ground at the middle of its foot, rocks with ambient occlusion in vertex colour, maps cut to 256-512 px, a plant's colour and opacity in one
# RGBA image (alpha-clipped), one material a piece, WebP maps, one GLB a biome.
#   blender --background --python tools/blender/build-megascans-pack.py -- [--only forest,desert] [--preview <dir>]
# reads tools/refs/megascans/ and writes client/public/megascans/<biome>.glb. BOTH ARE GIT-IGNORED: the Fab Standard License does not allow the files, or what is
# made from them, to be redistributed, and the repository is public. The game runs without the packs (client/src/components/Map/terrain.tsx `useMegascans`).
# Piece names in a GLB: <piece>__<variant>, a variant A, B or C (a rock one only). Origins in metres, y up.
import bpy, bmesh, json, math, os, sys, glob, random, tempfile, struct, zlib
import numpy as np
from mathutils import Vector, Matrix, bvhtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REF = os.path.join(ROOT, "tools", "refs", "megascans")
OUT = os.path.join(ROOT, "client", "public", "megascans")
MAN = json.load(open(os.path.join(ROOT, "tools", "megascans.json")))

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
ONLY = arg("--only").split(",") if arg("--only") else None
PREVIEW = arg("--preview")

def tris(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)

def shrink(arr, size):
    h = arr.shape[0]
    if h > size and h % size == 0:
        f = h // size
        return arr.reshape(size, f, size, f, arr.shape[2]).mean(axis=(1, 3))
    return arr

def pixels(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)

TMP = tempfile.mkdtemp(prefix="megascans-")

def write_png(path, arr):
    """an RGBA PNG from a float array (rows bottom to top, as Blender holds them); written here, because a generated image saved from headless Blender came out blank"""
    a = (np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)[::-1]
    h, w = a.shape[0], a.shape[1]
    raw = b"".join(b"\x00" + a[y].tobytes() for y in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)

def new_image(name, arr, colour):
    path = os.path.join(TMP, name + ".png")
    write_png(path, arr)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    img.alpha_mode = "STRAIGHT"
    return img

def make_material(name, base, normal, opacity, size):
    """one material: the colour (with the opacity in its alpha, clipped), a normal map, a flat roughness"""
    b = shrink(pixels(base), size)
    if opacity is not None:
        o = shrink(pixels(opacity), size)
        if o.shape[:2] != b.shape[:2]:
            o = np.resize(o, b.shape)
        b = b.copy()
        b[:, :, 3] = o[:, :, 0]
    else:
        b = b.copy()
        b[:, :, 3] = 1.0
    ci = new_image(name + "_c", b, True)
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = ci
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if opacity is not None:
        rnd = nt.nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
        nt.links.new(rnd.outputs["Value"], bsdf.inputs["Alpha"])
        mat.use_backface_culling = False
    if normal is not None:
        n = shrink(pixels(normal), size)
        ni = new_image(name + "_n", n, False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nimg = nt.nodes.new("ShaderNodeTexImage")
        nimg.image = ni
        nt.links.new(nimg.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def tidy(objs, name, budget, ao):
    """one mesh from the imported ones: in world space, foot on the ground at the middle, decimated, with occlusion"""
    meshes = [o for o in objs if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=meshes[0], selected_editable_objects=meshes, selected_objects=meshes):
            bpy.ops.object.join()
    ob = meshes[0]
    for o in objs:
        if o is not ob and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    # (some FBX variants come in centimetres: a plant or rock over 40 m across is metres by a hundred)
    if max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) > 40:
        me.transform(Matrix.Scale(0.01, 4))
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    t = tris(ob)
    if t > budget:
        m = ob.modifiers.new("d", "DECIMATE")
        m.ratio = max(0.02, budget / t)
        m.use_collapse_triangulate = True
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        new = bpy.data.meshes.new_from_object(ev)
        ob.modifiers.clear()
        ob.data = new
    for p in ob.data.polygons:
        p.use_smooth = True
    if not ao:
        # (a plant carries no occlusion: the importer's colour attribute, if any, would multiply it)
        for attr in list(ob.data.color_attributes):
            ob.data.color_attributes.remove(attr)
    if ao:
        me = ob.data
        verts = [v.co.copy() for v in me.vertices]
        tree = bvhtree.BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons])
        rnd = random.Random(5)
        dirs = []
        while len(dirs) < 24:
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.0, 1)))
            if 0.01 < d.length_squared <= 1:
                dirs.append(d.normalized())
        col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        data = []
        reach = max(ob.dimensions) * 0.6
        for v in me.vertices:
            n = v.normal
            hit = tot = 0
            for d in dirs:
                if d.dot(n) < 0.1:
                    continue
                tot += 1
                loc, nor, idx, dist = tree.ray_cast(v.co + n * 0.01, d, reach)
                if loc is not None and dist > 0.01:
                    hit += 1 - dist / reach
            a = 1.0 - 0.55 * (hit / tot if tot else 0)
            a *= 0.7 + 0.3 * min(1.0, max(0.0, v.co.z / max(ob.dimensions.z, 0.01) + 0.4))  # darker at the foot
            data.extend([a, a, a, 1.0])
        col.data.foreach_set("color", data)
    ob.name = name
    ob.data.name = name
    return ob

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    built = {}   # piece -> [objects]
    for piece, spec in MAN["pieces"].items():
        if ONLY and not any(piece in MAN["packs"].get(p, []) for p in ONLY):
            continue
        before = set(bpy.data.objects)
        objs = []
        if spec["kind"] == "rock":
            f = os.path.join(REF, spec["glb"])
            bpy.ops.import_scene.gltf(filepath=f)
            new = [o for o in bpy.data.objects if o not in before]
            # the imported material's colour and normal maps: the first of each found among its nodes
            base = normal = None
            for o in new:
                for ms in getattr(o.data, "materials", []):
                    if ms and ms.node_tree:
                        for nd in ms.node_tree.nodes:
                            if nd.type == "BSDF_PRINCIPLED":
                                bc = nd.inputs["Base Color"].links
                                if bc and bc[0].from_node.type == "TEX_IMAGE":
                                    base = bc[0].from_node.image
                                nl = nd.inputs["Normal"].links
                                if nl and nl[0].from_node.type == "NORMAL_MAP":
                                    ci = nl[0].from_node.inputs["Color"].links
                                    if ci and ci[0].from_node.type == "TEX_IMAGE":
                                        normal = ci[0].from_node.image
            if base is None:
                print("NO BASE MAP", piece); continue
            mat = make_material(piece, base, normal, None, spec["size"])
            ob = tidy(new, piece + "__A", spec["budget"], True)
            ob.data.materials.clear(); ob.data.materials.append(mat)
            objs.append(ob)
        else:
            pass
        if spec["kind"] == "plant":
            d = os.path.join(REF, spec["dir"])
            def tex(suffix):
                hit = [p for p in glob.glob(os.path.join(d, spec["stem"] + "_1K_" + suffix + ".jpg"))]
                return bpy.data.images.load(hit[0]) if hit else None
            mat = make_material(piece, tex("BaseColor"), tex("Normal"), tex("Opacity"), spec["size"])
            for v in "ABC":
                fl = sorted(glob.glob(os.path.join(d, "*_Var%s_LOD%d.fbx" % (v, spec["lod"]))))
                if not fl:
                    continue
                b2 = set(bpy.data.objects)
                bpy.ops.wm.fbx_import(filepath=fl[0])
                new = [o for o in bpy.data.objects if o not in b2]
                ob = tidy(new, piece + "__" + v, spec["budget"], False)
                ob.data.materials.clear(); ob.data.materials.append(mat)
                objs.append(ob)
        built[piece] = objs
        print("%-34s %s" % (piece, ", ".join("%s %d tris %s" % (o.name.split("__")[1], tris(o), tuple(round(x, 2) for x in o.dimensions)) for o in objs)))
    return built

def export(built):
    os.makedirs(OUT, exist_ok=True)
    for pack, pieces in MAN["packs"].items():
        if ONLY and pack not in ONLY:
            continue
        objs = [o for p in pieces for o in built.get(p, [])]
        if not objs:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        f = os.path.join(OUT, pack + ".glb")
        bpy.ops.export_scene.gltf(filepath=f, export_format="GLB", use_selection=True, export_materials="EXPORT", export_image_format="WEBP", export_vertex_color="ACTIVE", export_apply=False, export_yup=True)
        print("wrote", pack, round(os.path.getsize(f) / 1024), "KB,", len(objs), "pieces,", sum(tris(o) for o in objs), "tris")

def preview(built):
    sc = bpy.context.scene
    objs = [o for p in built.values() for o in p]
    for i, o in enumerate(objs):
        o.location = Vector((i * 3.2, 0, 0))
    gm = bpy.data.meshes.new("g"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=200); bm.to_mesh(gm); bm.free()
    g = bpy.data.objects.new("g", gm); g.location = Vector((len(objs) * 1.6, 0, -0.01)); sc.collection.objects.link(g)
    gmt = bpy.data.materials.new("g"); gmt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.26, 0.2, 1); g.data.materials.append(gmt)
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(55), 0, math.radians(30)); sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new("w"); sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.65, 0.8, 1)
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); cam.data.lens = 32
    mid = len(objs) * 1.6
    cam.location = Vector((mid, -len(objs) * 1.7, 5.5)); cam.rotation_euler = (math.radians(78), 0, 0); sc.collection.objects.link(cam); sc.camera = cam
    sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 1800, 480
    sc.render.filepath = os.path.join(PREVIEW, "megascans-preview.png")
    bpy.ops.render.render(write_still=True)

built = build()
export(built)
if PREVIEW:
    preview(built)
