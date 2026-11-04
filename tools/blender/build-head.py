# The head of a person (2026-11-04; the user: "lets start with humanoid heads and realistic looking hair styles").
#
# Run headless:  blender --background --python tools/blender/build-head.py -- <out-dir> [--lo] [--maps <dir>] [--preview <dir>]
# (2026-11-04, second pass: the heads of the species with a snout, each baked the same way into a smaller cell of the atlas (SNOUTS, CELLS), and the machine's
# head and four masks from build-gear.py, put in the same file.)
# It builds, for a masculine and a feminine face, a LOW head (about 2.3k triangles, 1k with --lo) and a HIGH one (about 55k) from the same
# description, bakes the high one's tangent-space normal map and ambient occlusion onto the low one's texture coordinates (Cycles), and writes
#   <out-dir>/head.glb (head.lo.glb)   the two low heads, `head_m` and `head_f`, and a pair of ears each (`_REGION` 0 the face, 3 the ears;
#                                      the texture coordinates of the faces already offset into one atlas: the masculine map on the left
#                                      half, the feminine on the right), their `_AO` per vertex
#   <maps>/head_{m,f}_{normal,ao}.png  the baked maps, 1024 x 1024 each (tools/build-head-textures.mjs makes client/public/textures/figure/head/)
# The face is a sphere pushed into a skull and then into features: each is a hump, a hollow or a crease along a line (`gauss`, `line`), which
# is what lets the HIGH head carry the fine ones (the lid folds, the nasolabial folds, the creases of the nose and the lips) that the LOW head
# has not the triangles for. The code's eyes (spheres), brows and hair sit on it where the old head's did: the features stand at the same
# landmarks (eyes at x +-0.040, y 0.015; the mouth at y -0.0515; the chin at y -0.088 ...), in the units and axes of the code (y up, +z the way
# the face looks). Original shapes: CC0.
import bpy, bmesh, math, sys, os, importlib.util
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shape import P, smooth, OUT, HI, join

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
MAPS = arg("--maps")
PREVIEW = arg("--preview")
SIZE = 1024
# The atlas of the faces, 2048 x 2048 (u, v from the bottom left; each cell u0, v0, du, dv): the masculine and the feminine head on the top half (1024 each), and under them
# in 512 cells the heads with a snout
CELLS = {"m": (0.0, 0.5, 0.5, 0.5), "f": (0.5, 0.5, 0.5, 0.5), "muzzle": (0.0, 0.25, 0.25, 0.25), "long": (0.25, 0.25, 0.25, 0.25), "short": (0.5, 0.25, 0.25, 0.25), "pig": (0.75, 0.25, 0.25, 0.25), "flat": (0.0, 0.0, 0.25, 0.25)}

# ---- Landmarks and features ---------------------------------------------------------------------------------------------------------
def gauss(x, y, cx, cy, rx, ry):
    return math.exp(-0.5 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2))

def _seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy or 1e-12
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

import functools

@functools.lru_cache(maxsize=None)
def _curve(pts):
    """a polyline made into a curve (Catmull-Rom through its points, six steps a gap), so that a crease bends and does not turn at corners"""
    out = []
    n = len(pts)
    for i in range(n - 1):
        a, b, c, d = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
        for k in range(6):
            t = k / 6.0
            out.append(tuple(0.5 * ((2 * b[m]) + (-a[m] + c[m]) * t + (2 * a[m] - 5 * b[m] + 4 * c[m] - d[m]) * t * t + (-a[m] + 3 * b[m] - 3 * c[m] + d[m]) * t ** 3) for m in (0, 1)))
    out.append(tuple(pts[-1]))
    return tuple(out)

def line(px, py, pts, w):
    """1 on a polyline (a curve through its points), falling off with the distance from it (a ridge if added, a crease if taken away)"""
    c = _curve(tuple(tuple(p) for p in pts))
    d = min(_seg(px, py, a[0], a[1], b[0], b[1]) for a, b in zip(c, c[1:]))
    return math.exp(-0.5 * (d / w) ** 2)

def g2(x, y, cx, cy, rx, ry):
    """the same hump on both sides of the face (a sum of two, so that it is smooth on the middle line)"""
    return gauss(x, y, cx, cy, rx, ry) + gauss(x, y, -cx, cy, rx, ry)

def l2(x, y, pts, w):
    return line(x, y, pts, w) + line(x, y, [(-a, b) for a, b in pts], w)

# fem: 0 masculine, 1 feminine (a softer brow, a smaller jaw and nose, fuller lips)
def coarse(x, y, fem):
    """the shapes the low head can carry: eye sockets, brow, nose, cheeks, lips, chin (metres, outward)"""
    d = -0.0135 * g2(x, y, 0.040, 0.016, 0.026, 0.018)
    d += (0.0095 - 0.0045 * fem) * l2(x, y, [(0.014, 0.036), (0.030, 0.043), (0.048, 0.046), (0.068, 0.040), (0.082, 0.034)], 0.0075)
    d += (0.003 - 0.001 * fem) * gauss(x, y, 0.0, 0.034, 0.014, 0.012)
    # the nose: a bridge widening to the tip, the tip's bulb, the wings, the nostrils
    ns = 1.0 - 0.1 * fem
    t = max(0.0, min(1.0, (0.030 - y) / 0.048))
    ridge = (0.004 + 0.0095 * t ** 1.1) * math.exp(-0.5 * (x / (0.0085 + 0.007 * t)) ** 2)
    if y < -0.020:
        ridge *= math.exp(-(((y + 0.020) / 0.008) ** 2))
    elif y > 0.030:
        ridge *= math.exp(-(((y - 0.030) / 0.007) ** 2))   # (the bridge begins at the brow: it does not run up the forehead)
    d += ridge * ns
    d += 0.0045 * ns * gauss(x, y, 0.0, -0.0185, 0.010, 0.0075)
    d += 0.0050 * ns * g2(x, y, 0.0155, -0.0235, 0.0075, 0.0065)
    d += -0.0050 * g2(x, y, 0.0075, -0.0290, 0.0045, 0.0036)
    d += (0.0060 + 0.0010 * fem) * g2(x, y, 0.066, -0.012, 0.026, 0.022)
    d += -0.0042 * g2(x, y, 0.062, -0.052, 0.022, 0.022)
    d += -0.0030 * g2(x, y, 0.088, 0.040, 0.020, 0.028)
    # the lips and the chin
    d += (0.0085 + 0.0020 * fem) * gauss(x, y, 0.0, -0.046, 0.020, 0.0055)
    d += (0.0095 + 0.0030 * fem) * gauss(x, y, 0.0, -0.0585, 0.019, 0.0068)
    d += -0.0035 * line(x, y, [(-0.026, -0.0500), (-0.012, -0.0518), (0.0, -0.0512), (0.012, -0.0518), (0.026, -0.0500)], 0.0016)
    d += -0.0030 * gauss(x, y, 0.0, -0.071, 0.018, 0.0035)
    d += (0.0070 - 0.0015 * fem) * gauss(x, y, 0.0, -0.088, 0.020, 0.016)
    return d

def fine(x, y, fem):
    """what only the high head has: lids and their creases, the folds beside the nose and mouth, the groove above the lip, the cupid's bow"""
    d = -0.0016 * l2(x, y, [(0.025, 0.022), (0.034, 0.0295), (0.046, 0.030), (0.057, 0.0245)], 0.0022)   # the fold of the upper lid
    d += 0.0025 * g2(x, y, 0.041, 0.022, 0.017, 0.006)                                                  # the lid itself
    d += -0.0011 * l2(x, y, [(0.027, 0.006), (0.040, 0.0035), (0.054, 0.008)], 0.0020)                   # the lower lid's line
    d += 0.0015 * g2(x, y, 0.040, -0.004, 0.016, 0.004)                                                 # a slight bag under it
    d += -0.0010 * l2(x, y, [(0.030, 0.0), (0.045, -0.008), (0.060, -0.012)], 0.0030)                    # the tear trough
    d += 0.0020 * g2(x, y, 0.0255, 0.011, 0.003, 0.003)                                                 # the inner corner of the eye
    d += -(0.0019 - 0.0004 * fem) * l2(x, y, [(0.0215, -0.0185), (0.0265, -0.032), (0.030, -0.044), (0.031, -0.0515)], 0.0032)  # nose to mouth
    d += -0.0013 * l2(x, y, [(0.0115, -0.0125), (0.0185, -0.0185), (0.0215, -0.0265)], 0.0018)           # the crease of the wing of the nose
    d += 0.0010 * l2(x, y, [(0.0045, -0.032), (0.0055, -0.0425)], 0.0016)                                # the ridges of the philtrum
    d += -0.0010 * gauss(x, y, 0.0, -0.037, 0.0025, 0.005)                                              # and its groove
    d += 0.0020 * g2(x, y, 0.006, -0.0435, 0.004, 0.0022)                                               # the cupid's bow
    d += -0.0020 * g2(x, y, 0.0275, -0.0505, 0.004, 0.0035)                                             # the corners of the mouth
    d += -0.0008 * line(x, y, [(-0.018, -0.0445), (0.0, -0.0425), (0.018, -0.0445)], 0.0012)            # the edge of the upper lip's red
    d += -0.0004 * line(x, y, [(-0.052, 0.062), (0.0, 0.066), (0.052, 0.062)], 0.0026)                   # one line across the forehead
    d += -0.0014 * line(x, y, [(0.0, 0.026), (0.0, 0.036)], 0.0020)                                      # between the brows
    return d

# What a species with a muzzle has in place of a nose and lips: how far the front of the face is pushed out, and its width, height and centre (as build-body.py's)
SNOUTS = {"muzzle": (0.045, 0.036, 0.034, -0.040), "long": (0.075, 0.030, 0.030, -0.040), "short": (0.022, 0.030, 0.028, -0.030), "pig": (0.034, 0.050, 0.032, -0.036), "flat": None}

def coarse_snout(x, y, v):
    """the face of a species with a snout: sockets, brow, cheeks, chin as a person's, then the pad of the nose and its nostrils, the whisker pads, the mouth's line"""
    sn = SNOUTS.get(v)
    d = -0.0135 * g2(x, y, 0.040, 0.016, 0.026, 0.018)
    d += 0.0095 * l2(x, y, [(0.014, 0.036), (0.030, 0.043), (0.048, 0.046), (0.068, 0.040), (0.082, 0.034)], 0.0075)
    d += 0.003 * gauss(x, y, 0.0, 0.034, 0.014, 0.012)
    d += 0.0060 * g2(x, y, 0.066, -0.012, 0.026, 0.022)
    d += -0.0042 * g2(x, y, 0.062, -0.052, 0.022, 0.022)
    d += 0.0040 * gauss(x, y, 0.0, -0.088, 0.020, 0.016)
    if sn:
        push, srx, sry, scy = sn
        ty = scy + 0.014
        d += 0.0045 * gauss(x, y, 0.0, ty, srx * 0.6, 0.012)
        d += -0.0045 * g2(x, y, 0.011, ty - 0.003, 0.0045, 0.0038)
        d += 0.0040 * g2(x, y, srx * 0.55, scy - 0.004, 0.012, 0.010)
        d += -0.0035 * line(x, y, [(-0.03, scy - 0.020), (-0.014, scy - 0.024), (0.0, scy - 0.022), (0.014, scy - 0.024), (0.03, scy - 0.020)], 0.0017)
        d += -0.0025 * line(x, y, [(0.0, ty - 0.012), (0.0, scy - 0.020)], 0.0015)
        for k in range(3):    # (the dots the whiskers grow from)
            for r in range(2):
                d += 0.0014 * g2(x, y, srx * 0.5 + 0.007 * k, scy - 0.002 - 0.007 * r, 0.0019, 0.0019)
    else:
        d += -0.0035 * g2(x, y, 0.008, -0.02, 0.0035, 0.0035)
        d += -0.0030 * line(x, y, [(-0.03, -0.052), (0.0, -0.054), (0.03, -0.052)], 0.0016)
    return d

BX, BY, BZ = 0.100, 0.118, 0.112

def surface(dx, dy, dz, fem, level, variant=None):
    """the head at a unit direction: the skull ellipsoid, the tapering jaw, then the features along the normal"""
    x, y, z = dx * BX, dy * BY, dz * BZ
    front = smooth(0.0, 0.8, dz)
    low = smooth(-0.05, -0.95, dy)
    x *= 1.0 - (0.24 + 0.06 * fem) * low
    z += (0.012 - 0.003 * fem) * low * smooth(0.2, 0.9, dz)
    y -= 0.012 * low
    z -= 0.006 * smooth(0.0, 0.9, dy) * (1 - front)
    sn = SNOUTS.get(variant) if variant else None
    if sn:
        push, srx, sry, scy = sn
        z += push * math.exp(-0.5 * ((x / srx) ** 2 + ((y - scy) / sry) ** 2)) * smooth(0.25, 0.9, dz)
    if dz > 0.05:
        nx, ny, nz = dx / BX, dy / BY, dz / BZ
        nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        nx, ny, nz = nx / nl, ny / nl, nz / nl
        if variant:
            d = coarse_snout(x, y, variant)
        else:
            d = coarse(x, y, fem)
            if level:
                d += fine(x, y, fem)
        d *= smooth(0.05, 0.35, dz)
        x += d * nx
        y += d * ny
        z += d * nz
    return x, y, z

# ---- The grid: more rows and columns where the face is -------------------------------------------------------------------------------
def warp_phi(t, dense=False):
    """t in -pi..pi, 0 the front: the columns crowd to the front (a spacing 0.55 of even there, 1.9 at the back)"""
    s = 1.0 if t >= 0 else -1.0
    a = abs(t) / math.pi
    k = 0.28 if dense else 0.55
    return s * math.pi * a * (k + (1.0 - k) * a * a)

def warp_theta(t, dense=False):
    """the rows crowd to the middle latitudes, where the eyes, nose and mouth are"""
    return t + (0.2 if dense else 0.12) * math.sin(2 * t)

def head_mesh(name, fem, rows, segs, level, dense=False, variant=None):
    verts, uvs, faces = [], [], []
    index = {}
    def add(i, j, pole=None):
        th = warp_theta(math.pi * i / rows, dense)
        ph = warp_phi(-math.pi + 2 * math.pi * (j if pole is None else j + 0.5) / segs, dense)
        dx, dy, dz = math.sin(th) * math.sin(ph), math.cos(th), math.sin(th) * math.cos(ph)
        x, y, z = surface(dx, dy, dz, fem, level, variant)
        verts.append(P(x, y, z))
        uvs.append(((j if pole is None else j + 0.5) / segs, 1.0 - i / rows))
        return len(verts) - 1
    grid = {}
    for i in range(1, rows):
        for j in range(segs + 1):
            grid[(i, j)] = add(i, j)
    top = [add(0, j, "top") for j in range(segs)]
    bottom = [add(rows, j, "bottom") for j in range(segs)]
    for j in range(segs):
        faces.append((top[j], grid[(1, j + 1)], grid[(1, j)]))
        faces.append((bottom[j], grid[(rows - 1, j)], grid[(rows - 1, j + 1)]))
    for i in range(1, rows - 1):
        for j in range(segs):
            faces.append((grid[(i, j)], grid[(i, j + 1)], grid[(i + 1, j + 1)], grid[(i + 1, j)]))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    # (wound so that the faces look outward)
    c = Vector((0, 0, 0))
    p = me.polygons[len(me.polygons) // 2]
    if p.normal.dot(p.center - c) < 0:
        for poly in me.polygons:
            pass
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    layer = me.uv_layers.new(name="UVMap")
    # (the loops' uv by their vertex's: a vertex is a corner of one coordinate pair here, as the seam and the poles are split)
    for poly in me.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    for poly in me.polygons:
        poly.use_smooth = True
    return ob

def weld_normals(ob):
    """smooth shading across the split seam and poles: each vertex's normal the mean of the faces at that place"""
    me = ob.data
    acc = {}
    for poly in me.polygons:
        for vi in poly.vertices:
            key = tuple(round(c, 6) for c in me.vertices[vi].co)
            acc[key] = acc.get(key, Vector((0, 0, 0))) + poly.normal * poly.area
    normals = [acc[tuple(round(c, 6) for c in v.co)].normalized() for v in me.vertices]
    me.normals_split_custom_set_from_vertices(normals)

# ---- Ears ---------------------------------------------------------------------------------------------------------------------------
def ears(fem):
    """an oval standing out from the skull on each side: a dish with the helix's rim, the hollow of the concha, the antihelix and the lobe"""
    out = []
    for s in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14 if HI else 8, v_segments=10 if HI else 6, radius=1.0)
        me = bpy.data.meshes.new("ear")
        bm.to_mesh(me)
        bm.free()
        for v in me.vertices:
            dx, dy, dz = v.co.x, v.co.z, -v.co.y
            o = dx * 0.011
            if dx > 0:
                rho = math.hypot(dy, dz * 1.15)
                g = 0.0035 * math.exp(-(((rho - 0.82) / 0.12) ** 2)) - 0.0060 * math.exp(-((rho / 0.45) ** 2)) + 0.0025 * math.exp(-(((rho - 0.5) / 0.1) ** 2)) * smooth(-0.1, 0.5, dy)
                o += g * smooth(0.0, 0.5, dx)
            # (a lobe: the bottom of the oval hangs a little lower and thicker)
            lobe = 0.004 * smooth(-0.3, -1.0, dy)
            v.co = P(s * (0.100 + o), dy * 0.032 * (1.0 + 0.1 * smooth(0.0, -1.0, dy)) - 0.012 - lobe, -(dz * 0.020 - 0.003 + 0.002 * dy))
        for poly in me.polygons:
            poly.use_smooth = True
        ob = bpy.data.objects.new("ear", me)
        bpy.context.collection.objects.link(ob)
        out.append(ob)
    return out

# ---- Baking -------------------------------------------------------------------------------------------------------------------------
def bake(low, high, kind, path, SIZE=SIZE):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 24 if kind == "AO" else 4
    img = bpy.data.images.new(f"bake_{kind}", SIZE, SIZE, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("bake")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(mat)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    b = scn.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion = 0.012
    b.max_ray_distance = 0.03
    b.margin = 12
    b.target = "IMAGE_TEXTURES"
    if kind == "NORMAL":
        b.normal_space = "TANGENT"
    bpy.ops.object.bake(type=kind)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

# ---- Colour: what is painted, not modelled (the lips, the lids, the mouth's line, the nostrils), laid out the way the maps are ---------------
def paint(fem, path, variant=None, SIZE=SIZE):
    """a pale colour map for the low head's texture coordinates: the vertex colour (the skin) multiplies it, so what it holds is the
    difference from the skin: redder, darker lips, shaded lids and nostrils, a little warmth in the cheeks"""
    import numpy as np
    n = SIZE
    u = (np.arange(n) + 0.5) / n
    v = (np.arange(n) + 0.5) / n
    U, V = np.meshgrid(u, v)                       # rows are v from the bottom of the image, as Blender's pixels are
    t = -np.pi + 2 * np.pi * U
    a = np.abs(t) / np.pi
    ph = np.sign(t) * np.pi * a * (0.55 + 0.45 * a * a)
    tt = np.pi * (1.0 - V)
    th = tt + 0.12 * np.sin(2 * tt)
    dx, dy, dz = np.sin(th) * np.sin(ph), np.cos(th), np.sin(th) * np.cos(ph)
    x, y = dx * BX, dy * BY
    low = np.clip((dy + 0.05) / -0.9, 0, 1)
    low = low * low * (3 - 2 * low)
    x = x * (1.0 - (0.24 + 0.06 * fem) * low)
    y = y - 0.012 * low
    front = np.clip(dz / 0.3, 0, 1)
    def G(cx, cy, rx, ry):
        return np.exp(-0.5 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2))
    def G2(cx, cy, rx, ry):
        return G(cx, cy, rx, ry) + G(-cx, cy, rx, ry)
    sn = SNOUTS.get(variant) if variant else None
    lips = np.clip((np.maximum(G(0, -0.0465, 0.021, 0.0062), G(0, -0.0585, 0.0195, 0.0075)) - 0.3) / 0.35, 0, 1) * front
    if variant:
        lips = lips * 0.0
        ty = (sn[3] + 0.014) if sn else -0.02
        pad = np.clip(G(0, ty, (sn[1] * 0.6) if sn else 0.012, 0.012), 0, 1) * front
        nost = np.clip(G2(0.011, ty - 0.003, 0.0042, 0.0036), 0, 1) * front
        mline = np.exp(-0.5 * ((y - ((sn[3] - 0.022) if sn else -0.054)) / 0.0014) ** 2) * (np.abs(x) < 0.032) * front
    lid = np.clip(G2(0.041, 0.022, 0.018, 0.008), 0, 1) * front
    bag = np.clip(G2(0.040, -0.006, 0.016, 0.006), 0, 1) * front
    nostril = np.clip(G2(0.0085, -0.0290, 0.0030, 0.0022), 0, 1) * front
    mouth = np.exp(-0.5 * ((y + 0.0512) / 0.0012) ** 2) * (np.abs(x) < 0.027) * front
    cheek = np.clip(G2(0.062, -0.020, 0.026, 0.020), 0, 1) * front
    rgb = np.ones((n, n, 3), dtype=np.float32) * 0.93
    def tint(mask, col, k):
        for c in range(3):
            rgb[:, :, c] *= 1.0 + mask * k * (col[c] - 1.0)
    tint(lips, (1.0, 0.66, 0.64), 0.85 + 0.1 * fem)  # (a snout has none: its lips are zero)
    tint(lid, (0.95, 0.84, 0.88), 0.7)
    tint(bag, (0.96, 0.88, 0.9), 0.6)
    tint(cheek, (1.0, 0.92, 0.91), 0.55 + 0.2 * fem)
    if variant:
        pig = variant == "pig"
        tint(pad, (1.0, 0.8, 0.78) if pig else (0.42, 0.34, 0.34), 0.8)
        tint(nost, (0.35, 0.28, 0.28), 0.9)
        tint(mline, (0.5, 0.4, 0.4), 0.7)
    else:
        tint(nostril, (0.55, 0.45, 0.45), 0.5)
        tint(mouth, (0.6, 0.48, 0.48), 0.6)
    px = np.ones((n, n, 4), dtype=np.float32)
    px[:, :, :3] = rgb
    img = bpy.data.images.new("color", n, n, alpha=False)
    img.colorspace_settings.name = "Non-Color"   # (the numbers are written as they are)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

# ---- A look at it ---------------------------------------------------------------------------------------------------------------------
def preview(obs, path, yaw):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.render.resolution_x = scn.render.resolution_y = 640
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "SINGLE"
    scn.display.shading.single_color = (0.85, 0.7, 0.6)
    scn.display.shading.show_cavity = True
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if "cam" not in bpy.context.scene.objects:
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 0.34
    # the face looks along Blender's -y (code +z): the camera stands in front, turned by `yaw`
    r = 1.0
    cam.location = Vector((math.sin(yaw) * r, -math.cos(yaw) * r, 0.0))
    cam.rotation_euler = (math.pi / 2, 0, yaw)
    scn.camera = cam
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o not in obs
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

def mark_of(x, y, variant):
    """a snout's darkening (the nose pad, the nostrils, the line of the mouth, an eyelid) and lightening (the muzzle, the chin), -1 to 1: the code's `mark`"""
    sn = SNOUTS.get(variant)
    ty = (sn[3] + 0.014) if sn else -0.02
    m = 0.9 * gauss(x, y, 0.0, ty, (sn[1] * 0.6) if sn else 0.012, 0.012) if True else 0.0
    m += 0.9 * (gauss(x, y, 0.011, ty - 0.003, 0.0042, 0.0036) + gauss(x, y, -0.011, ty - 0.003, 0.0042, 0.0036))
    m += 0.6 * math.exp(-0.5 * ((y - ((sn[3] - 0.022) if sn else -0.054)) / 0.0016) ** 2) * (1 if abs(x) < 0.032 else 0)
    m = min(1.0, m)
    pale = 0.5 * smooth(-0.03, -0.075, y) * smooth(0.0, 0.05, 0.075 - abs(x))     # the muzzle and the chin a little paler
    return m if m > 0.05 else -pale

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rows, segs = (30, 40) if HI else (18, 26)
    exported = []
    plan = [("m", 0.0, None, 1024), ("f", 1.0, None, 1024)] + [(k, 0.0, k, 512) for k in ("muzzle", "long", "short", "pig", "flat")]
    atlas = {}
    for variant, fem, snout, size in plan:
        low = head_mesh(f"head_{variant}", fem, rows, segs, 0, False, snout)
        weld_normals(low)
        high = head_mesh(f"high_{variant}", fem, 240, 320, 1, True, snout)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            for yaw, tag in ((0.0, "front"), (math.radians(60), "three")):
                preview([high], os.path.join(PREVIEW, f"high_{variant}_{tag}.png"), yaw)
                preview([low], os.path.join(PREVIEW, f"low_{variant}_{tag}.png"), yaw)
        if MAPS and HI:
            os.makedirs(MAPS, exist_ok=True)
            # (the other heads, if they are made, would be walls the occlusion rays hit)
            for o in exported:
                o.hide_render = True
            bake(low, high, "NORMAL", os.path.join(MAPS, f"head_{variant}_normal.png"), size)
            bake(low, high, "AO", os.path.join(MAPS, f"head_{variant}_ao.png"), size)
            paint(fem, os.path.join(MAPS, f"head_{variant}_color.png"), snout, size)
            for o in exported:
                o.hide_render = False
            atlas[variant] = {"cell": CELLS[variant], "size": size}
        bpy.data.objects.remove(high)
        # the atlas: this head's cell
        u0, v0, du, dv = CELLS[variant]
        layer = low.data.uv_layers.active
        for d in layer.data:
            d.uv = (u0 + d.uv[0] * du, v0 + d.uv[1] * dv)
        # the regions: the face 0, and the ears 3 (the ears are given a corner of no texture)
        low.data.attributes.new("_REGION", "FLOAT", "POINT")
        if snout:
            mk = low.data.attributes.new("_MARK", "FLOAT", "POINT")
            for v in low.data.vertices:
                mk.data[v.index].value = mark_of(v.co.x, v.co.z, snout)
        pair = ears(fem)
        for e in pair:
            e.data.attributes.new("_REGION", "FLOAT", "POINT")
            if snout:
                e.data.attributes.new("_MARK", "FLOAT", "POINT")
            for v in e.data.vertices:
                e.data.attributes["_REGION"].data[v.index].value = 3.0
            e.data.uv_layers.new(name="UVMap")
        low.data.materials.clear()
        joined = join([low] + pair, f"head_{variant}")
        # (a gentle ambient occlusion by vertex: the underside of the jaw and the ears darker)
        ao = joined.data.attributes.new("_AO", "FLOAT", "POINT")
        for v in joined.data.vertices:
            w = v.co
            y = w.z
            ao.data[v.index].value = 1.0 - 0.35 * smooth(-0.05, -0.12, y) - (0.25 if abs(w.x) > 0.103 else 0.0)
        exported.append(joined)
    # the machine's head and the masks
    spec = importlib.util.spec_from_file_location("build_gear", os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-gear.py"))
    gear = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gear)
    made = gear.all_gear(sys.modules[__name__])
    if PREVIEW:
        for ob in made:
            for yaw, tag in ((0.0, "front"), (math.radians(60), "three")):
                preview([ob, exported[0]], os.path.join(PREVIEW, f"{ob.name}_{tag}.png"), yaw)
    exported += made
    if MAPS and HI:
        import json
        with open(os.path.join(MAPS, "atlas.json"), "w") as fh:
            json.dump(atlas, fh)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in exported:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "head.glb" if HI else "head.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=True, export_materials="NONE", export_yup=True, export_apply=False)
    print("HEAD", path, {o.name: len(o.data.polygons) for o in exported})

if __name__ == "__main__":
    main()
