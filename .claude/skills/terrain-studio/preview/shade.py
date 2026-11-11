import bpy, sys, json, math, numpy as np
argv = sys.argv[sys.argv.index("--") + 1:]
biome, detail, out = argv[0], argv[1] == "1", argv[2]
d = argv[3].rstrip("/") + "/"
meta = json.load(open(d + biome + ".json"))
n = meta["n"]
h = np.fromfile(d + biome + ".h.bin", dtype=np.float32).reshape(n, n)
c = np.fromfile(d + biome + ".c.bin", dtype=np.uint8).reshape(n, n, 3) / 255.0
bpy.ops.wm.read_factory_settings(use_empty=True)
xs = meta["x0"] + np.arange(n) * meta["cell"]
X, Y = np.meshgrid(xs, xs)  # X = world x (i), Y = world z (j)
verts = np.stack([X.ravel(), Y.ravel(), h.ravel()], 1).astype(np.float32)
faces = []
idx = np.arange(n * n).reshape(n, n)
a, b, cc, dd = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()
faces = np.stack([a, b, cc, dd], 1)
me = bpy.data.meshes.new("land")
me.from_pydata(verts.tolist(), [], faces.tolist())
me.update()
for p in me.polygons: p.use_smooth = True
ca = me.color_attributes.new("col", "FLOAT_COLOR", "POINT")
rgba = np.concatenate([np.power(c.reshape(-1, 3), 2.2), np.ones((n * n, 1))], 1).astype(np.float32)  # srgb -> linear
ca.data.foreach_set("color", rgba.ravel())
land = bpy.data.objects.new("land", me)
bpy.context.scene.collection.objects.link(land)
mat = bpy.data.materials.new("ground")
nt = mat.node_tree
for nd in list(nt.nodes):
    if nd.type != "OUTPUT_MATERIAL" and nd.type != "BSDF_PRINCIPLED": nt.nodes.remove(nd)
bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeColorAttribute") if hasattr(bpy.types, "ShaderNodeColorAttribute") else nt.nodes.new("ShaderNodeAttribute")
if attr.bl_idname == "ShaderNodeAttribute": attr.attribute_name = "col"
bsdf.inputs["Roughness"].default_value = 0.92
src = attr.outputs["Color"]
if detail:
    tc = nt.nodes.new("ShaderNodeTexCoord")
    def noise(scale, detail_, rough=0.55):
        nn = nt.nodes.new("ShaderNodeTexNoise"); nn.inputs["Scale"].default_value = scale; nn.inputs["Detail"].default_value = detail_; nn.inputs["Roughness"].default_value = rough
        wm = nt.nodes.new("ShaderNodeMapping")
        nt.links.new(tc.outputs["Object"], wm.inputs["Vector"]); nt.links.new(wm.outputs["Vector"], nn.inputs["Vector"])
        return nn
    macro, mid, micro = noise(0.012, 3), noise(0.15, 5), noise(2.2, 6, 0.7)
    mixc = nt.nodes.new("ShaderNodeMix"); mixc.data_type = "RGBA"; mixc.blend_type = "OVERLAY"; mixc.inputs["Factor"].default_value = 0.55
    nt.links.new(src, mixc.inputs["A"]); nt.links.new(macro.outputs["Fac"], mixc.inputs["B"])
    m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "OVERLAY"; m2.inputs["Factor"].default_value = 0.35
    nt.links.new(mixc.outputs["Result"], m2.inputs["A"]); nt.links.new(mid.outputs["Fac"], m2.inputs["B"])
    src = m2.outputs["Result"]
    bm = nt.nodes.new("ShaderNodeMath"); bm.operation = "ADD"; nt.links.new(mid.outputs["Fac"], bm.inputs[0]); nt.links.new(micro.outputs["Fac"], bm.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.6; bump.inputs["Distance"].default_value = 0.4
    nt.links.new(bm.outputs["Value"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
nt.links.new(src, bsdf.inputs["Base Color"])
me.materials.append(mat)
# trees and rocks as merged low-poly meshes
def merged(points, make, name, color):
    V, F = [], []
    rng = np.random.default_rng(4)
    for (x, z, y) in points:
        v, f = make(rng)
        f = np.array(f) + len(V)
        V.extend([(px + x, pz + z, py + y) for px, py, pz in v]); F.extend(f.tolist())
    m = bpy.data.meshes.new(name); m.from_pydata(V, [], F); m.update()
    ob = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(ob)
    mm = bpy.data.materials.new(name); mm.diffuse_color = color
    b = mm.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = color; b.inputs["Roughness"].default_value = 0.9
    m.materials.append(mm)
def tree(rng):
    s = rng.uniform(0.8, 1.7); hh = 9 * s; r = 2.6 * s
    v = [(0, 0, 0), (0, hh, 0)] + [(r * math.cos(k * math.pi / 3), 1.5 * s, r * math.sin(k * math.pi / 3)) for k in range(6)]
    f = [(0, 2 + k, 2 + (k + 1) % 6) for k in range(6)] + [(1, 2 + (k + 1) % 6, 2 + k) for k in range(6)]
    return v, f
def rock(rng):
    s = rng.uniform(0.7, 2.4); v = []
    for k in range(6):
        a = k * math.pi / 3 + rng.uniform(-0.3, 0.3)
        v.append((s * math.cos(a) * rng.uniform(0.8, 1.2), 0, s * math.sin(a) * rng.uniform(0.8, 1.2)))
    v.append((rng.uniform(-0.3, 0.3), s * rng.uniform(0.6, 1.1), rng.uniform(-0.3, 0.3)))
    f = [(6, k, (k + 1) % 6) for k in range(6)]
    return v, f
if meta["trees"]: merged(meta["trees"], tree, "trees", (0.05, 0.16, 0.06, 1) if biome != "desert" else (0.3, 0.3, 0.1, 1))
merged(meta["rocks"][:700], rock, "rocks", (0.30, 0.27, 0.24, 1) if biome != "desert" else (0.45, 0.30, 0.2, 1))
# sun and sky
sc = bpy.context.scene
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 4.0; sun.data.angle = 0.02
sun.rotation_euler = (math.radians(68), 0, math.radians(125)); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w
wn = w.node_tree; bg = wn.nodes["Background"]; bg.inputs["Color"].default_value = (0.55, 0.68, 0.88, 1); bg.inputs["Strength"].default_value = 0.9
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 28
cam.location = (-250, -80, float(h[n // 2, 8]) + 26); sc.collection.objects.link(cam); sc.camera = cam
tgt = np.array([60, 40, float(h[n // 2, n // 2]) + 10]); dirv = tgt - np.array(cam.location)
cam.rotation_euler = (math.atan2(math.hypot(dirv[0], dirv[1]), -dirv[2]) , 0, math.atan2(dirv[1], dirv[0]) - math.pi / 2)
cam.rotation_euler = (math.pi / 2 - math.atan2(dirv[2], math.hypot(dirv[0], dirv[1])), 0, math.atan2(dirv[1], dirv[0]) - math.pi / 2)
sc.render.engine = "CYCLES"; sc.cycles.samples = 40; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.view_settings.view_transform = "AgX" if "AgX" in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items.keys() else "Standard"
sc.render.filepath = out; sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("rendered", out, bpy.app.version_string)
