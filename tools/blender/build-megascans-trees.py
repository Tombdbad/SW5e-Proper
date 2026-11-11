# Trees and hedges from Megascans parts (2026-11-11; the user: "replace our existing trees ... build our own lightweight trees using a variety of megascans meshes and
# textures"). Fab has no whole tree outside Unreal, so each tree is assembled here from the low tier of what they downloaded (tools/megascans.json "trees"):
#   - trunks: an Alder or Birch Tree Trunk scan, stretched and tapered, decimated to ~200 triangles (a conifer's trunk is the alder's; a birch is the birch's)
#   - limbs (broadleaf): the Aspen Branch scan, decimated, set out from the trunk top
#   - needles: the Norway Spruce atlas (4K, cut here to six twigs in one 1024x512 map), a card a branch, in whorls
#   - leaves: the Bay Laurel atlas (the healthy leaves cut out one by one into one 1024x512 map, a solid cell for a hedge's core), a card a leaf
# Pieces (the model's height in metres in brackets): conifer (6), broadleaf (6, crown 4.4 across), hedge (0.85 high, 1 m long), each a variant A, B and C.
# A piece is a few parts, each a mesh of its own with ONE material (the game stands them together): <piece>__<variant>__<part>, part bark | limb | needle | leaf.
#   blender --background --factory-startup --python tools/blender/build-megascans-trees.py [-- --preview <dir>]
# reads tools/refs/megascans/ and writes client/public/megascans/trees.glb. BOTH ARE GIT-IGNORED (the Fab Standard License, a public repo); the game runs without it
# (client/src/components/Map/packs.ts, siteAssets.tsx `Group`: the old trees remain).
import bpy, bmesh, math, os, sys, glob, random, tempfile, struct, zlib
import numpy as np
from collections import deque
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REF = os.path.join(ROOT, "tools", "refs", "megascans")
OUT = os.path.join(ROOT, "client", "public", "megascans")
PREVIEW = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
TMP = tempfile.mkdtemp(prefix="megascans-trees-")

# ---------------------------------------------------------------------------------------------------------------- images
def pixels(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)

def write_png(path, arr):
    """an RGBA PNG from a float array (rows bottom to top, as Blender holds them); written here, because a generated image saved from headless Blender came out blank"""
    a = (np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)[::-1]
    h, w = a.shape[0], a.shape[1]
    raw = b"".join(b"\x00" + a[y].tobytes() for y in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))

def load_scaled(path, size):
    img = bpy.data.images.load(path)
    img.scale(size, size)
    return pixels(img)

def image_material(name, arr, clip):
    path = os.path.join(TMP, name + ".png")
    write_png(path, arr)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "sRGB"
    img.alpha_mode = "STRAIGHT"
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if clip:
        rnd = nt.nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
        nt.links.new(rnd.outputs["Value"], bsdf.inputs["Alpha"])
        mat.use_backface_culling = False
    return mat

# ---------------------------------------------------------------------------------------------------------------- cutting an atlas into pieces
def components(mask, min_area):
    """8-connected pieces of a boolean mask: [(area, x0, y0, x1, y1, pixel list)] (rows bottom to top)"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        q = deque([(y, x)]); seen[y, x] = True
        pts = []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) >= min_area:
            py = [p[0] for p in pts]; px = [p[1] for p in pts]
            out.append((len(pts), min(px), min(py), max(px) + 1, max(py) + 1, pts))
    return out

def cut_atlas(base, opacity, accept, cell_w, cell_h, cols, rows, solid_last):
    """the pieces `accept` likes, set one to a cell in a new atlas: their own pixels only (so a neighbour's edge never shows), the rest of the cell filled with their mean
    colour (so the filtering at an edge does not pull in black); returns the atlas and each piece's rectangle (u0, v0, u1, v1) and aspect"""
    mask = opacity[:, :, 0] > 0.5
    found = []
    for area, x0, y0, x1, y1, pts in components(mask, 400):
        rgb = np.array([base[y, x, :3] for y, x in pts[:: max(1, len(pts) // 400)]])
        mean = rgb.mean(axis=0)
        if accept(area, x1 - x0, y1 - y0, mean):
            found.append((area, x0, y0, x1, y1, pts, mean))
    found.sort(key=lambda f: (-f[4], f[1]))
    W, H = cols * cell_w, rows * cell_h
    atlas = np.zeros((H, W, 4), dtype=np.float32)
    rects = []
    cap = cols * rows - (1 if solid_last else 0)
    for i, (area, x0, y0, x1, y1, pts, mean) in enumerate(found[:cap]):
        cx, cy = i % cols, i // cols
        ox, oy = cx * cell_w, cy * cell_h
        w, h = x1 - x0, y1 - y0
        s = min(1.0, (cell_w - 4) / w, (cell_h - 4) / h)
        nw, nh = max(1, int(w * s)), max(1, int(h * s))
        atlas[oy:oy + cell_h, ox:ox + cell_w, :3] = mean
        left, bottom = ox + (cell_w - nw) // 2, oy + 2
        for y, x in pts:
            ty = bottom + min(nh - 1, int((y - y0) * s)); tx = left + min(nw - 1, int((x - x0) * s))
            atlas[ty, tx, :3] = base[y, x, :3]; atlas[ty, tx, 3] = 1.0
        # (a scaled-down piece leaves holes between its sampled pixels: close them from the left and below)
        if s < 1.0:
            blk = atlas[bottom:bottom + nh, left:left + nw]
            for _ in range(2):
                hole = blk[:, :, 3] < 0.5
                hole[:, 0] = False
                sh = np.roll(blk, 1, axis=1)
                ok = hole & (sh[:, :, 3] > 0.5)
                blk[ok] = sh[ok]
        rects.append(((left) / W, (bottom) / H, (left + nw) / W, (bottom + nh) / H, nw / nh))
    if solid_last:
        i = cap
        cx, cy = i % cols, i // cols
        mean = np.mean([f[6] for f in found[:cap]], axis=0) * 1.4
        atlas[cy * cell_h:(cy + 1) * cell_h, cx * cell_w:(cx + 1) * cell_w, :3] = mean
        atlas[cy * cell_h:(cy + 1) * cell_h, cx * cell_w:(cx + 1) * cell_w, 3] = 1.0
        rects.append(((cx * cell_w + 8) / W, (cy * cell_h + 8) / H, ((cx + 1) * cell_w - 8) / W, ((cy + 1) * cell_h - 8) / H, 1.0))
    return atlas, rects

def leaf_cutout(atlas, rects, size=1024, count=120, seed=77):
    """a tiling cut-out of the laurel's leaves, for the game's `leaf` finish (models.tsx MATERIALS.leaf: the small plants, moss and garden pieces, which are
    mapped with a texture instead of cards): leaves of the atlas turned and scattered over a wrapping 1024 picture, the clear between them clear; surfaces.tsx
    uses it in place of the plain one where it is there. Brightened (the scan's albedo is dark)."""
    H, W = atlas.shape[:2]
    rnd = random.Random(seed)
    crops = [atlas[int(v0 * H):int(v1 * H), int(u0 * W):int(u1 * W)] for (u0, v0, u1, v1, asp) in rects[:-1]]
    out = np.zeros((size, size, 4), dtype=np.float32)
    for _ in range(count):
        c = crops[rnd.randrange(len(crops))]
        h, w = c.shape[:2]
        s = rnd.uniform(1.0, 1.5); ang = rnd.uniform(0, 2 * math.pi)
        R = int(math.hypot(w, h) * s / 2) + 2
        ys, xs = np.mgrid[-R:R + 1, -R:R + 1]
        ca, sa = math.cos(ang), math.sin(ang)
        sx = (xs * ca + ys * sa) / s + w / 2; sy = (-xs * sa + ys * ca) / s + h / 2
        ok = (sx >= 0) & (sx < w - 1) & (sy >= 0) & (sy < h - 1)
        samp = c[np.clip(sy.astype(int), 0, h - 1), np.clip(sx.astype(int), 0, w - 1)]
        keep = ok & (samp[:, :, 3] > 0.5)
        cx, cy = rnd.randrange(size), rnd.randrange(size)
        Y = (ys + cy) % size; X = (xs + cx) % size
        out[Y[keep], X[keep]] = samp[keep]
    solid = out[:, :, 3] > 0.5
    mean = out[solid][:, :3].mean(axis=0) if solid.any() else np.array([0.1, 0.12, 0.03])
    out[:, :, :3] = np.where(solid[:, :, None], out[:, :, :3], mean)
    out[:, :, :3] = np.clip(out[:, :, :3] * 2.4, 0, 1)
    out[:, :, 3] = solid.astype(np.float32)
    path = os.path.join(ROOT, "client", "public", "textures", "leaves", "forest_leaves_02", "diffuse-cutout-megascans.png")
    write_png(path, out)
    print("wrote", path, "covered", round(float(solid.mean()), 2))

# ---------------------------------------------------------------------------------------------------------------- a part: loose quads
class Part:
    def __init__(self):
        self.v, self.f, self.uv, self.n = [], [], [], []
    def quad(self, p0, p1, p2, p3, uv, normal):
        """p0 p1 along the base, p2 p3 along the tip; uv = (u0, v0, u1, v1): p0 at (u0, v0), p1 at (u1, v0), p2 at (u1, v1), p3 at (u0, v1)"""
        i = len(self.v)
        self.v += [tuple(p0), tuple(p1), tuple(p2), tuple(p3)]
        self.f += [(i, i + 1, i + 2), (i, i + 2, i + 3)]
        u0, v0, u1, v1 = uv
        self.uv += [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        self.n += [tuple(normal)] * 4
    def object(self, name, material):
        me = bpy.data.meshes.new(name)
        # (nothing goes under the ground: a card that would is laid on it)
        self.v = [(x, y, max(z, 0.03)) for x, y, z in self.v]
        me.from_pydata(self.v, [], self.f)
        me.update()
        li = np.empty(len(me.loops), dtype=np.int32)
        me.loops.foreach_get("vertex_index", li)
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.array(self.uv, dtype=np.float32)[li].ravel())
        try:
            me.normals_split_custom_set(np.array(self.n, dtype=np.float32)[li].tolist())
        except Exception as e:
            print("custom normals not set:", e)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material)
        return ob

def unit(v):
    v = Vector(v)
    return v.normalized() if v.length > 1e-9 else Vector((0, 0, 1))

# ---------------------------------------------------------------------------------------------------------------- scanned meshes
def base_image(objs):
    for o in objs:
        for ms in getattr(o.data, "materials", []):
            if ms and ms.node_tree:
                for nd in ms.node_tree.nodes:
                    if nd.type == "BSDF_PRINCIPLED":
                        bc = nd.inputs["Base Color"].links
                        if bc and bc[0].from_node.type == "TEX_IMAGE":
                            return bc[0].from_node.image
    return None

def import_scan(path):
    """a GLB as one mesh in world space, with its base colour image"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    img = base_image(new)
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world = Matrix.Identity(4)
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=meshes[0], selected_editable_objects=meshes, selected_objects=meshes):
            bpy.ops.object.join()
    ob = meshes[0]
    for o in new:
        if o is not ob and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    for attr in list(ob.data.color_attributes):
        ob.data.color_attributes.remove(attr)
    return ob, img

def tri_count(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)

def decimate(ob, budget):
    t = tri_count(ob.data)
    if t > budget:
        m = ob.modifiers.new("d", "DECIMATE"); m.ratio = max(0.02, budget / t); m.use_collapse_triangulate = True
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        new = bpy.data.meshes.new_from_object(ev)
        ob.modifiers.clear(); ob.data = new
    for p in ob.data.polygons:
        p.use_smooth = True

def stand_up(me, long_axis):
    """turn a mesh so its long axis (0 x, 1 y, 2 z) is up and its thick end is at the origin, centred about the axis"""
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co[:, long_axis].min(), co[:, long_axis].max()
    span = hi - lo
    others = [a for a in range(3) if a != long_axis]
    def spread(mask):
        c = co[mask][:, others]
        return float(np.ptp(c, axis=0).sum()) if mask.any() else 0.0
    low_thick = spread(co[:, long_axis] < lo + span * 0.15) >= spread(co[:, long_axis] > hi - span * 0.15)
    # axis permutation to (x, y, z) = (others[0], others[1], long)
    M = Matrix(((0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 1)))
    M[0][others[0]] = 1; M[1][others[1]] = 1; M[2][long_axis] = 1
    if M.determinant() < 0:
        M[1][others[1]] = -1
    me.transform(M)
    co = np.array([v.co[:] for v in me.vertices])
    if not low_thick:
        me.transform(Matrix.Rotation(math.pi, 4, "X"))
        co = np.array([v.co[:] for v in me.vertices])
    # the axis: the mean of the foot's vertices
    foot = co[co[:, 2] < co[:, 2].min() + 0.1 * (co[:, 2].max() - co[:, 2].min())]
    me.transform(Matrix.Translation((-foot[:, 0].mean(), -foot[:, 1].mean(), -co[:, 2].min())))

def shape_trunk(me, height, girth, taper):
    """stretch a stood-up scan to `height`, its girth times `girth`, narrowing to (1 - taper) at the top"""
    co = np.array([v.co[:] for v in me.vertices])
    h0 = max(co[:, 2].max(), 1e-6)
    for v in me.vertices:
        t = v.co.z / h0
        k = girth * (1 - taper * t)
        v.co.x *= k; v.co.y *= k; v.co.z = t * height
    me.update()

def copy_object(src, name, material):
    ob = bpy.data.objects.new(name, src.data.copy())
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.clear(); ob.data.materials.append(material)
    return ob

def join(objs, name):
    if len(objs) == 1:
        objs[0].name = name; objs[0].data.name = name
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name; objs[0].data.name = name
    return objs[0]

# ---------------------------------------------------------------------------------------------------------------- the pieces
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # --- atlases
    sp = os.path.join(REF, "norway_spruce_atlas", "x")
    s_base = load_scaled(os.path.join(sp, "Norway_Spruce_qgpvu2_4K_BaseColor.jpg"), 1024)
    s_op = load_scaled(os.path.join(sp, "Norway_Spruce_qgpvu2_4K_Opacity.jpg"), 1024)
    twig_atlas, twigs = cut_atlas(s_base, s_op, lambda a, w, h, m: h >= 380 and h >= 3 * w and w <= 150, 128, 512, 8, 1, False)
    lp = os.path.join(REF, "bay_laurel", "x")
    l_base = load_scaled(os.path.join(lp, "Bay_Laurel_umjjbjzja_Low_1K_BaseColor.jpg"), 512)
    l_op = load_scaled(os.path.join(lp, "Bay_Laurel_umjjbjzja_Low_1K_Opacity.jpg"), 512)
    leaf_atlas, leaves = cut_atlas(l_base, l_op, lambda a, w, h, m: 1800 <= a <= 14000 and 1.3 <= h / w <= 3.5 and h >= 70 and m[0] <= m[1] * 1.05, 128, 256, 8, 2, True)
    print("twigs", len(twigs), "leaves", len(leaves) - 1)
    if len(twigs) < 3 or len(leaves) < 6:
        raise SystemExit("the atlases did not cut into enough pieces")
    m_needle = image_material("needle_spruce", twig_atlas, True)
    m_leaf = image_material("leaf_laurel", leaf_atlas, True)
    leaf_cutout(leaf_atlas, leaves)
    # --- scans
    alder, a_img = import_scan(os.path.join(REF, "alder_tree_trunk", "alder_tree_trunk_tkkobfdfa_low.glb"))
    birch, b_img = import_scan(os.path.join(REF, "birch_tree_trunk", "birch_tree_trunk_tkjpbivfa_low.glb"))
    aspen, p_img = import_scan(os.path.join(REF, "aspen_branch", "aspen_branch_thrrfblda_low.glb"))
    def bark(name, img):
        arr = pixels(img)
        if arr.shape[0] > 512:
            img.scale(512, 512); arr = pixels(img)
        arr = arr.copy(); arr[:, :, 3] = 1.0
        return image_material(name, arr, False)
    m_alder, m_birch, m_aspen = bark("bark_alder", a_img), bark("bark_birch", b_img), bark("bark_aspen", p_img)
    # trunks: stood up (long axis is already z in a glb), decimated to ~200
    for ob in (alder, birch):
        stand_up(ob.data, 2); decimate(ob, 160)
    stand_up(aspen.data, 0); decimate(aspen, 60)
    # the great trees' trunks and limbs are these scans blown up: a finer cut of them and the bark at its full 1024
    agr, g_img = import_scan(os.path.join(REF, "alder_tree_trunk", "alder_tree_trunk_tkkobfdfa_low.glb"))
    stand_up(agr.data, 2); decimate(agr, 480)
    asp_big, _pi = import_scan(os.path.join(REF, "aspen_branch", "aspen_branch_thrrfblda_low.glb"))
    stand_up(asp_big.data, 0); decimate(asp_big, 90)
    garr = pixels(g_img).copy(); garr[:, :, 3] = 1.0
    m_great = image_material("bark_great", garr, False)
    pieces = []  # [(object, ...)]
    parts = []   # every object that is exported

    def leaf_quad(part, rects, k, p, d, side, length, normal):
        u0, v0, u1, v1, asp = rects[k]
        w = length * asp
        a = Vector(p) - side * (w / 2)
        b = Vector(p) + side * (w / 2)
        part.quad(a, b, b + d * length, a + d * length, (u0, v0, u1, v1), normal)

    # ---- conifer
    def conifer(variant, seed):
        r = random.Random(seed)
        H = 6.0
        trunk = copy_object(alder, "conifer__%s__bark" % variant, m_alder)
        shape_trunk(trunk.data, H * (0.96 + 0.08 * r.random()), 0.52 + 0.08 * r.random(), 0.9)
        trunk.rotation_euler[2] = r.random() * 6.28; trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z"))
        part = Part()
        tiers = 12
        for t in range(tiers):
            f = t / (tiers - 1)
            z = H * (0.2 + 0.76 * f)
            L = 2.3 * (1 - 0.84 * f) + 0.35
            W = L * 0.5
            n = max(4, round(9.5 - 5 * f))
            for j in range(n):
                az = (j / n) * 6.2832 + t * 0.9 + r.uniform(-0.25, 0.25)
                droop = 0.5 - 0.34 * f + r.uniform(-0.1, 0.1)
                d = Vector((math.cos(az) * math.cos(droop), math.sin(az) * math.cos(droop), -math.sin(droop)))
                flat = Vector((-math.sin(az), math.cos(az), 0))
                up = d.cross(flat).normalized()
                for tilt in (0.0, 1.15):
                    side = (flat * math.cos(tilt) + up * math.sin(tilt)).normalized()
                    k = r.randrange(len(twigs))
                    u0, v0, u1, v1, asp = twigs[k]
                    w = L * asp * 1.9 if L * asp * 1.9 > W * 0.5 else W
                    w = min(w, W * 1.2)
                    P = Vector((0, 0, z)) + d * 0.1
                    nrm = unit(Vector((math.cos(az), math.sin(az), 0)) * 0.55 + Vector((0, 0, 0.85)))
                    part.quad(P - side * (w / 2), P + side * (w / 2), P + d * L + side * (w / 2), P + d * L - side * (w / 2), (u0, v0, u1, v1), nrm)
        # the leader: two crossed cards
        for az in (0.0, 1.5708):
            k = r.randrange(len(twigs)); u0, v0, u1, v1, asp = twigs[k]
            side = Vector((math.cos(az), math.sin(az), 0)); w = 0.5
            P = Vector((0, 0, H * 0.9)); top = Vector((0, 0, H * 1.02))
            part.quad(P - side * (w / 2), P + side * (w / 2), top + side * 0.03, top - side * 0.03, (u0, v0, u1, v1), (0, 0, 1))
        needles = part.object("conifer__%s__needle" % variant, m_needle)
        return [trunk, needles]

    # ---- broadleaf
    def broadleaf(variant, seed, trunk_src, trunk_mat):
        r = random.Random(seed)
        H = 6.0
        th = 2.3 + 0.3 * r.random()
        trunk = copy_object(trunk_src, "broadleaf__%s__bark" % variant, trunk_mat)
        shape_trunk(trunk.data, th, (0.95 if trunk_src is alder else 0.9) + 0.08 * r.random(), 0.5)
        trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z"))
        limbs = []
        leaf = Part()
        centre = Vector((0, 0, th + 1.25))
        n_limbs = 5
        L0 = 2.9
        for i in range(n_limbs):
            az = i * (6.2832 / n_limbs) + r.uniform(-0.3, 0.3)
            elev = math.radians(r.uniform(32, 55))
            Ls = L0 * r.uniform(0.85, 1.1)
            d = Vector((math.cos(az) * math.cos(elev), math.sin(az) * math.cos(elev), math.sin(elev)))
            limb = copy_object(aspen, "limb", m_aspen)
            me = limb.data
            k = Ls / 4.41
            me.transform(Matrix.Scale(k, 4) @ Matrix.Diagonal((0.85, 0.85, 1.0, 1.0)))
            # the limb stands on +z: lay it along d from the trunk, near the top
            rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
            me.transform(Matrix.Translation((0, 0, th * 0.9)) @ rot)
            limbs.append(limb)
            for q in range(72):
                t = r.uniform(0.3, 1.0)
                spread = 0.35 + 0.65 * t
                p = Vector((0, 0, th * 0.9)) + d * (Ls * t) + Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-0.7, 0.7))) * spread * 0.8
                out = unit(p - centre)
                dirv = unit(out * 0.8 + Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-0.2, 0.5))))
                side = unit(dirv.cross(Vector((r.uniform(-0.3, 0.3), r.uniform(-0.3, 0.3), 1))))
                leaf_quad(leaf, leaves, r.randrange(len(leaves) - 1), p - dirv * 0.12, dirv, side, r.uniform(0.42, 0.62), unit(out * 0.7 + Vector((0, 0, 0.7))))
        for q in range(130):
            a = r.uniform(0, 6.2832); rr = r.uniform(0.3, 2.1)
            p = centre + Vector((math.cos(a) * rr, math.sin(a) * rr, r.uniform(0.2, 1.5)))
            out = unit(p - centre + Vector((0, 0, 0.3)))
            dirv = unit(out * 0.6 + Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(0, 0.8))))
            side = unit(dirv.cross(Vector((r.uniform(-0.3, 0.3), r.uniform(-0.3, 0.3), 1))))
            leaf_quad(leaf, leaves, r.randrange(len(leaves) - 1), p, dirv, side, r.uniform(0.42, 0.62), unit(out * 0.6 + Vector((0, 0, 0.8))))
        limb_part = join(limbs, "broadleaf__%s__limb" % variant)
        for p_ in limb_part.data.polygons:
            p_.use_smooth = True
        return [trunk, limb_part, leaf.object("broadleaf__%s__leaf" % variant, m_leaf)]

    # ---- hedge
    def hedge(variant, seed):
        r = random.Random(seed)
        X, Y, Z = 0.62, 0.42, 0.55
        part = Part()
        solid = leaves[-1]
        # the core: a plain box a little inside the leaves (so no sky shows through)
        cx, cy, cz = 0.3, 0.2, 0.5
        c = [(-cx, -cy, 0), (cx, -cy, 0), (cx, cy, 0), (-cx, cy, 0), (-cx, -cy, cz), (cx, -cy, cz), (cx, cy, cz), (-cx, cy, cz)]
        for idx, nrm in (((4, 5, 6, 7), (0, 0, 1)), ((0, 1, 5, 4), (0, -1, 0)), ((1, 2, 6, 5), (1, 0, 0)), ((2, 3, 7, 6), (0, 1, 0)), ((3, 0, 4, 7), (-1, 0, 0))):
            part.quad(c[idx[0]], c[idx[1]], c[idx[2]], c[idx[3]], solid[:4], nrm)
        faces = [("top", X * Y), ("front", X * Z), ("back", X * Z), ("left", Y * Z), ("right", Y * Z)]
        total = sum(a for _, a in faces)
        for i in range(130):
            pick = r.random() * total; acc = 0
            for name, a in faces:
                acc += a
                if pick <= acc:
                    break
            u, v = r.uniform(-0.5, 0.5), r.random()
            if name == "top":
                p = Vector((u * X, (v - 0.5) * Y, Z)); nrm = Vector((0, 0, 1))
            elif name in ("front", "back"):
                s = -1 if name == "front" else 1
                p = Vector((u * X, s * Y / 2, v * Z)); nrm = Vector((0, s, 0.25))
            else:
                s = -1 if name == "left" else 1
                p = Vector((s * X / 2, (u) * Y, v * Z)); nrm = Vector((s, 0, 0.25))
            nrm = unit(nrm)
            tang = unit(Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))) - nrm * r.uniform(-0.2, 0.8))
            tang = unit(tang - nrm * tang.dot(nrm) * 0.9)
            side = unit(tang.cross(nrm))
            leaf_quad(part, leaves, r.randrange(len(leaves) - 1), p + nrm * 0.02, tang, side, r.uniform(0.26, 0.36), unit(nrm + Vector((0, 0, 0.4))))
        return [part.object("hedge__%s__leaf" % variant, m_leaf)]

    # ---- stumps: the three scans, each a variant, set on the ground at about 0.6 m a side and cut to ~250 triangles
    def stump(variant, path, width):
        ob, img = import_scan(path)
        me = ob.data
        co = np.array([v.co[:] for v in me.vertices])
        me.transform(Matrix.Translation((-(co[:, 0].min() + co[:, 0].max()) / 2, -(co[:, 1].min() + co[:, 1].max()) / 2, -co[:, 2].min())))
        s = width / max(np.ptp(co[:, 0]), np.ptp(co[:, 1]))
        me.transform(Matrix.Scale(s, 4))
        decimate(ob, 250)
        for p_ in me.polygons:
            p_.use_smooth = True
        ob.data.materials.clear(); ob.data.materials.append(bark("bark_stump_" + variant, img))
        ob.name = "stump__%s__bark" % variant; me.name = ob.name
        return [ob]

    # ---- palm and fern: the pieces the biome packs already hold (build-megascans-pack.py must have run first), set to a height of their own
    def from_pack(pack, src, piece, height):
        path = os.path.join(OUT, pack + ".glb")
        if not os.path.exists(path):
            print("no", path, "(run build-megascans-pack.py first): no", piece)
            return []
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        res = []
        for v in "ABC":
            found = [o for o in new if o.type == "MESH" and o.name.split(".")[0] == "%s__%s" % (src, v)]
            if not found:
                continue
            ob = found[0]
            mw = ob.matrix_world.copy(); ob.parent = None; ob.data.transform(mw); ob.matrix_world = Matrix.Identity(4)
            co = np.array([vv.co[:] for vv in ob.data.vertices])
            s = height / max(np.ptp(co[:, 2]), 1e-6)
            ob.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-(co[:, 0].min() + co[:, 0].max()) / 2, -(co[:, 1].min() + co[:, 1].max()) / 2, -co[:, 2].min())))
            ob.name = "%s__%s__leaf" % (piece, v); ob.data.name = ob.name
            res.append(ob)
        for o in new:
            if o not in res and o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        return res

    # ---- a leaf-card ball (topiary) or bush (shrub): cards on the shell of a squashed sphere, a plain core inside so no sky shows through
    def shell(part, centre, radii, count, length, r, solid):
        for i in range(count):
            z = 1 - 2 * ((i + 0.5) / count)
            if z < -0.25:
                z = -0.25 + (z + 0.25) * 0.2
            ring = math.sqrt(max(0.0, 1 - z * z)); a = i * 2.39996 + r.random() * 0.4
            nrm = unit(Vector((math.cos(a) * ring / radii[0], math.sin(a) * ring / radii[1], z / radii[2])))
            p = Vector(centre) + Vector((math.cos(a) * ring * radii[0], math.sin(a) * ring * radii[1], z * radii[2])) * r.uniform(0.9, 1.0)
            tang = unit(Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))) - nrm * r.uniform(0, 0.6))
            tang = unit(tang - nrm * tang.dot(nrm) * 0.85)
            side = unit(tang.cross(nrm))
            leaf_quad(part, leaves, r.randrange(len(leaves) - 1), p, tang, side, length * r.uniform(0.85, 1.15), unit(nrm + Vector((0, 0, 0.3))))
        # (the core: a coarse sphere just inside, in the solid cell: six sides and four rings)
        c = Vector(centre); k = 0.88; segs, rings = 6, 4
        def at(i, j):
            th = math.pi * j / rings; ph = 6.2832 * (i % segs) / segs
            return c + Vector((math.sin(th) * math.cos(ph) * radii[0] * k, math.sin(th) * math.sin(ph) * radii[1] * k, math.cos(th) * radii[2] * k * (1.0 if j <= rings / 2 else 0.6)))
        for j in range(rings):
            for i in range(segs):
                p00, p10, p11, p01 = at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)
                part.quad(p00, p10, p11, p01, solid[:4], unit((p00 + p11) / 2 - c))

    def shrub(variant, seed):
        r = random.Random(seed)
        part = Part()
        shell(part, (0, 0, 0.34), (0.5, 0.5, 0.4), 110, 0.3, r, leaves[-1])
        return [part.object("shrub__%s__leaf" % variant, m_leaf)]

    def topiary(variant, seed):
        r = random.Random(seed)
        bark_part, leaf_part = Part(), Part()
        # the pedestal and stem: two plain eight-sided columns on the alder's bark
        for (rad, z0, z1) in ((0.26, 0.0, 0.34), (0.05, 0.34, 0.9)):
            n = 8
            for i in range(n):
                a0, a1 = i / n * 6.2832, (i + 1) / n * 6.2832
                p0 = Vector((math.cos(a0) * rad, math.sin(a0) * rad, z0)); p1 = Vector((math.cos(a1) * rad, math.sin(a1) * rad, z0))
                bark_part.quad(p0, p1, p1 + Vector((0, 0, z1 - z0)), p0 + Vector((0, 0, z1 - z0)), (0.25 + 0.5 * i / n, 0.25, 0.25 + 0.5 * (i + 1) / n, 0.55), unit((p0 + p1) / 2))
        shell(leaf_part, (0, 0, 1.0), (0.4, 0.4, 0.4), 120, 0.17, r, leaves[-1])
        shell(leaf_part, (0, 0, 1.58), (0.27, 0.27, 0.27), 64, 0.14, r, leaves[-1])
        # (the pedestal's lid)
        n = 8
        for i in range(n):
            a0, a1 = i / n * 6.2832, (i + 1) / n * 6.2832
            bark_part.quad(Vector((0, 0, 0.34)), Vector((math.cos(a0) * 0.26, math.sin(a0) * 0.26, 0.34)), Vector((math.cos(a1) * 0.26, math.sin(a1) * 0.26, 0.34)), Vector((0, 0, 0.34)), (0.3, 0.3, 0.7, 0.5), (0, 0, 1))
        return [bark_part.object("topiary__%s__bark" % variant, m_alder), leaf_part.object("topiary__%s__leaf" % variant, m_leaf)]

    # ---- a dead tree: the alder's trunk and three bare aspen limbs
    def drytree(variant, seed):
        r = random.Random(seed)
        trunk = copy_object(alder, "drytree__%s__bark" % variant, m_alder)
        shape_trunk(trunk.data, 1.9 + 0.2 * r.random(), 0.4 + 0.05 * r.random(), 0.6)
        trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z"))
        limbs = []
        for i in range(4):
            az = i * 1.7 + r.uniform(-0.4, 0.4)
            elev = math.radians(r.uniform(35, 60))
            Ls = r.uniform(0.9, 1.3)
            d = Vector((math.cos(az) * math.cos(elev), math.sin(az) * math.cos(elev), math.sin(elev)))
            limb = copy_object(aspen, "limb", m_aspen)
            limb.data.transform(Matrix.Scale(Ls / 4.41, 4) @ Matrix.Diagonal((0.55, 0.55, 1.0, 1.0)))
            limb.data.transform(Matrix.Translation((0, 0, 1.2 + 0.15 * i)) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
            limbs.append(limb)
        limb_part = join(limbs, "drytree__%s__limb" % variant)
        return [trunk, limb_part]

    # ---- the tree villages' great trees (siteAssets.tsx `GreatTree`; kit pieces tree_great_canopy and tree_great_conifer_needles of tools/blender/build-architecture.py):
    # the same places in the kit's own units (metres, the great tree's foot at the origin), in cards: the kit's y-up (x, y, z) is (x, -z, y) here
    def kit(x, y, z):
        return (x, -z, y)

    def greatcrown(variant, seed):
        r = random.Random(seed)
        part = Part()
        lumps = [((0, 16.6, 0), 3.2)]
        lumps += [((math.cos(2 * math.pi * i / 5 + 0.4) * 4.2, 15.2 + 0.3 * (i % 2), math.sin(2 * math.pi * i / 5 + 0.4) * 4.2), 2.4) for i in range(5)]
        lumps += [((math.cos(2 * math.pi * i / 3 + 1.1) * 2.2, 17.6, math.sin(2 * math.pi * i / 3 + 1.1) * 2.2), 2.0) for i in range(3)]
        for (p, rad) in lumps:
            shell(part, kit(*p), (rad, rad, rad * 0.72), int(11 * rad * rad), 0.4 * rad + 0.1, r, leaves[-1])
        return [part.object("greatcrown__%s__leaf" % variant, m_leaf)]

    def greatneedles(variant, seed):
        r = random.Random(seed)
        part = Part()
        for t in range(9):
            f = t / 8
            y = 10.0 + f * 12.5
            length = 5.0 * (1 - f * 0.78) + 0.6
            rt = 1.1 - 0.9 * f
            for j in range(6):
                a = 2 * math.pi * j / 6 + t * 0.55
                c, s_ = math.cos(a), math.sin(a)
                base = Vector(kit(rt * c, y, rt * s_))
                tip = Vector(kit((rt + length) * c, y - length * (0.35 - 0.2 * f), (rt + length) * s_))
                d = tip - base
                side = unit(d.cross(Vector((0, 0, 1))))
                up = unit(d.cross(side))
                if up.z < 0:
                    up = -up
                w = min(length * 0.5, 2.4) + 0.3
                for tilt in (0.0, 0.9, -0.9):
                    sv = unit(side * math.cos(tilt) + up * math.sin(tilt))
                    u0, v0, u1, v1, asp = twigs[r.randrange(len(twigs))]
                    part.quad(base - sv * (w / 2), base + sv * (w / 2), tip + sv * (w * 0.12), tip - sv * (w * 0.12), (u0, v0, u1, v1), unit(Vector((c, -s_, 0)) * 0.5 + Vector((0, 0, 0.85))))
        return [part.object("greatneedles__%s__needle" % variant, m_needle)]

    # ---- the great trees' trunks (2026-11-11, the user: the tree village trunks from the Megascans pack, scaled to fit): the Alder trunk scan blown up to the kit's
    # girth (a radius of 1.2 m at the town's levels) and stretched to the kit's height (15 m; the conifer's 24), narrowing; limbs and buttress roots are the Aspen limb
    # scan. Kit units, the foot at the origin. Replace the kit's `tree_great` (limbs and roots with it) and `tree_great_conifer` (its branches are bare under the
    # needle cards and left out)
    def limb_on(src, base, elev_deg, az, length, thick, name="limb"):
        limb = copy_object(src, name, m_aspen)
        k = length / 4.41
        limb.data.transform(Matrix.Scale(k, 4) @ Matrix.Diagonal((thick, thick, 1.0, 1.0)))
        el = math.radians(elev_deg)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        limb.data.transform(Matrix.Translation(base) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
        return limb

    def greattrunk(variant, seed):
        r = random.Random(seed)
        trunk = copy_object(agr, "greattrunk__%s__bark" % variant, m_great)
        shape_trunk(trunk.data, 15.0, 4.0 + 0.2 * r.random(), 0.5)
        trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z"))
        limbs = []
        for i in range(5):
            az = 2 * math.pi * i / 5 + 0.4
            limbs.append(limb_on(asp_big, Vector((0.3 * math.cos(az), 0.3 * math.sin(az), 12.0 + 0.4 * i)), 33 + 3 * (i % 2), az, 5.0 + 0.4 * r.random(), 0.9))
        for i in range(6):
            az = 2 * math.pi * (i + 0.3) / 6
            limbs.append(limb_on(asp_big, Vector((0.9 * math.cos(az), 0.9 * math.sin(az), 1.9)), -42, az, 3.6, 1.0))
        return [trunk, join(limbs, "greattrunk__%s__limb" % variant)]

    def greatconifer(variant, seed):
        r = random.Random(seed)
        trunk = copy_object(agr, "greatconifer__%s__bark" % variant, m_great)
        shape_trunk(trunk.data, 24.0, 4.4 + 0.2 * r.random(), 0.85)
        trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z"))
        roots = [limb_on(asp_big, Vector((0.9 * math.cos(2 * math.pi * (i + 0.5) / 5), 0.9 * math.sin(2 * math.pi * (i + 0.5) / 5), 1.7)), -40, 2 * math.pi * (i + 0.5) / 5, 3.2, 0.9) for i in range(5)]
        return [trunk, join(roots, "greatconifer__%s__limb" % variant)]

    # the post under a hut's deck (siteAssets.tsx `CanopyDeck`: `<Cyl>` of the village's tree): one unit high, one unit in radius at its middle, centred; the game scales it
    def deckpost(variant, seed):
        r = random.Random(seed)
        trunk = copy_object(agr, "deckpost__%s__bark" % variant, m_great)
        shape_trunk(trunk.data, 1.0, 2.9, 0.16)
        trunk.data.transform(Matrix.Rotation(r.random() * 6.28, 4, "Z") @ Matrix.Translation((0, 0, -0.5)))
        return [trunk]

    out = []
    for v, seed in (("A", 41), ("B", 42), ("C", 43)):
        out += greatcrown(v, seed)
        out += greatneedles(v, seed + 10)
        out += greattrunk(v, seed + 20)
        out += greatconifer(v, seed + 30)
        out += deckpost(v, seed + 40)
    out += from_pack("jungle", "tropical_palm", "palm", 1.8)
    out += from_pack("forest", "bracken_fern", "fern", 0.6)
    for v, seed in (("A", 5), ("B", 6), ("C", 7)):
        out += shrub(v, seed)
        out += topiary(v, seed + 10)
        out += drytree(v, seed + 20)
    out += stump("A", os.path.join(REF, "pine_tree_stump", "pine_tree_stump_rfxaw_low.glb"), 0.7)
    out += stump("B", os.path.join(REF, "broken_stump", "broken_stump_rkswd_low.glb"), 1.0)
    out += stump("C", os.path.join(REF, "tree_stump", "tree_stump_qegv0_low.glb"), 0.95)
    for v, seed, src, mat in (("A", 11, alder, m_alder), ("B", 23, birch, m_birch), ("C", 37, alder, m_alder)):
        out += conifer(v, seed + 1)
        out += broadleaf(v, seed + 2, src, mat)
        out += hedge(v, seed + 3)
    # the originals are not exported
    for o in (alder, birch, aspen, agr, asp_big):
        bpy.data.objects.remove(o, do_unlink=True)
    return out

def report(objs):
    by = {}
    for o in objs:
        pc = "__".join(o.name.split("__")[:2])
        by.setdefault(pc, []).append(o)
    for pc, os_ in sorted(by.items()):
        lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
        for o in os_:
            for v in o.data.vertices:
                for i in range(3):
                    lo[i] = min(lo[i], v.co[i]); hi[i] = max(hi[i], v.co[i])
        print("%-14s %5d tris  %s z %.2f..%.2f  (%s)" % (pc, sum(tri_count(o.data) for o in os_), tuple(round(hi[i] - lo[i], 2) for i in range(3)), lo[2], hi[2], ", ".join(o.name.split("__")[2] + " " + str(tri_count(o.data)) for o in os_)))

def export(objs):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    f = os.path.join(OUT, "trees.glb")
    bpy.ops.export_scene.gltf(filepath=f, export_format="GLB", use_selection=True, export_materials="EXPORT", export_image_format="WEBP", export_vertex_color="NONE", export_apply=False, export_yup=True)
    print("wrote trees.glb", round(os.path.getsize(f) / 1024), "KB,", len(objs), "meshes,", sum(tri_count(o.data) for o in objs), "tris")

def preview(objs):
    sc = bpy.context.scene
    by = {}
    for o in objs:
        by.setdefault("__".join(o.name.split("__")[:2]), []).append(o)
    keys = sorted(by)
    for i, k in enumerate(keys):
        for o in by[k]:
            o.location = Vector(((i % 3) * 6.5, (i // 3) * 6.5, 0))
    gm = bpy.data.meshes.new("g"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=60); bm.to_mesh(gm); bm.free()
    g = bpy.data.objects.new("g", gm); g.location = Vector((6.5, 12, -0.01)); sc.collection.objects.link(g)
    gmt = bpy.data.materials.new("g"); gmt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.26, 0.2, 1); g.data.materials.append(gmt)
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 4.0; sun.rotation_euler = (math.radians(55), 0, math.radians(30)); sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new("w"); sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.65, 0.8, 1)
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); cam.data.lens = 40
    cam.location = Vector((6.5, -22, 13)); cam.rotation_euler = (math.radians(68), 0, 0); sc.collection.objects.link(cam); sc.camera = cam
    sc.render.engine = "CYCLES"; sc.cycles.samples = 16; sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    sc.render.filepath = os.path.join(PREVIEW, "trees-preview.png")
    bpy.ops.render.render(write_still=True)

objs = build()
report(objs)
export(objs)
if PREVIEW:
    preview(objs)
