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
ONLY = arg("--only")                   # (a few heads, for a look: --only m,f2)
FAST = "--fast" in sys.argv             # (the high head with a quarter of the points: a look at the shapes, not a bake)
SIZE = 1024
# The atlas of the faces, 2048 x 2048 (u, v from the bottom left; each cell u0, v0, du, dv): four people's heads in 768 cells on the top left (a masculine and a
# feminine face of two kinds each: TYPES), the heads with a snout in 512 cells under them and to their right
CELLS = {"m": (0.0, 0.625, 0.375, 0.375), "m2": (0.375, 0.625, 0.375, 0.375), "f": (0.0, 0.25, 0.375, 0.375), "f2": (0.375, 0.25, 0.375, 0.375),
         "muzzle": (0.0, 0.0, 0.25, 0.25), "long": (0.25, 0.0, 0.25, 0.25), "short": (0.5, 0.0, 0.25, 0.25), "pig": (0.75, 0.75, 0.25, 0.25), "flat": (0.75, 0.5, 0.25, 0.25)}

# Face types (2026-11-05, the user: "the lips and eyebrows look weird: we may need a few variations to retain originality between characters"): what tells one face from another.
# fem 0 or 1 (a softer brow, a smaller jaw and nose, fuller lips); nose_w the nose's width, nose_h how far it stands out, nose_y where its tip is (metres, + up); lip_u and
# lip_l the fullness of the upper and the lower lip, mouth_w the width of the mouth; brow the ridge over the eyes, chin, cheek; tint how red the lips are painted
TYPES = {
    "m": dict(fem=0.0, nose_w=1.0, nose_h=1.22, nose_y=0.0, lip_u=1.0, lip_l=1.0, mouth_w=1.0, brow=1.0, chin=1.0, cheek=1.0, tint=0.5),
    "m2": dict(fem=0.0, nose_w=1.18, nose_h=1.34, nose_y=-0.002, lip_u=0.74, lip_l=0.86, mouth_w=1.08, brow=1.3, chin=1.14, cheek=0.85, tint=0.4),
    "f": dict(fem=1.0, nose_w=0.96, nose_h=1.18, nose_y=0.0, lip_u=1.0, lip_l=1.0, mouth_w=1.0, brow=1.0, chin=1.0, cheek=1.0, tint=0.75),
    "f2": dict(fem=1.0, nose_w=0.86, nose_h=1.10, nose_y=0.002, lip_u=1.3, lip_l=1.2, mouth_w=0.94, brow=0.75, chin=0.9, cheek=1.22, tint=0.85),
}

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

def coarse(x, y, fem, ft=None):
    """the shapes the low head can carry: eye sockets, brow, nose, cheeks, lips, chin (metres, outward)"""
    T = ft or TYPES["m"]
    nw, nh, ny, mw = T["nose_w"], T["nose_h"], T["nose_y"], T["mouth_w"]
    d = -0.0115 * g2(x, y, 0.040, 0.016, 0.026, 0.018)
    d += (0.0082 - 0.0040 * fem) * T["brow"] * l2(x, y, [(0.014, 0.036), (0.030, 0.043), (0.048, 0.046), (0.068, 0.040), (0.082, 0.034)], 0.0075)
    d += (0.003 - 0.001 * fem) * gauss(x, y, 0.0, 0.034, 0.014, 0.012)
    # the nose: a bridge widening to the tip, the tip's bulb, the wings, and the nostrils just above the base of the nose, where the lip begins (2026-11-05: they were
    # at -0.029, under the nose, on the lip)
    ns = (1.0 - 0.1 * fem) * nh
    base = -0.019 + ny
    t = max(0.0, min(1.0, (0.030 - y) / (0.030 - base)))
    ridge = (0.004 + 0.0105 * t ** 1.1) * math.exp(-0.5 * (x / ((0.0085 + 0.007 * t) * nw)) ** 2)
    if y < base:
        ridge *= math.exp(-(((y - base) / 0.0085) ** 2))
    elif y > 0.030:
        ridge *= math.exp(-(((y - 0.030) / 0.007) ** 2))   # (the bridge begins at the brow: it does not run up the forehead)
    d += ridge * ns
    d += 0.0045 * ns * gauss(x, y, 0.0, -0.0180 + ny, 0.010 * nw, 0.0075)
    d += 0.0050 * ns * g2(x, y, 0.0150 * nw, -0.0225 + ny, 0.0075, 0.0065)
    d += -0.0055 * g2(x, y, 0.0078 * nw, -0.0245 + ny, 0.0045, 0.0034)
    d += (0.0060 + 0.0010 * fem) * T["cheek"] * g2(x, y, 0.066, -0.012, 0.026, 0.022)
    d += -0.0026 * g2(x, y, 0.062, -0.052, 0.022, 0.022)
    d += -0.0030 * g2(x, y, 0.088, 0.040, 0.020, 0.028)
    # the lips and the chin
    lu, ll = T["lip_u"], T["lip_l"]
    d += (0.0085 + 0.0020 * fem) * lu * gauss(x, y, 0.0, -0.046 - 0.0006 * (lu - 1), 0.020 * mw, 0.0055 * (0.75 + 0.25 * lu))
    d += (0.0095 + 0.0030 * fem) * ll * gauss(x, y, 0.0, -0.0585 + 0.0006 * (ll - 1), 0.019 * mw, 0.0068 * (0.75 + 0.25 * ll))
    d += -0.0035 * line(x, y, [(-0.026 * mw, -0.0507), (-0.012 * mw, -0.0516), (0.0, -0.0512), (0.012 * mw, -0.0516), (0.026 * mw, -0.0507)], 0.0016)   # (level: a mouth that turns up is a smile, one that turns down a frown)
    # (2026-11-05, the user: "the chin needs to protrude a bit more, with more refined separation between the mouth and the chin, and more definition
    # between the chin and the neck"): the fold under the lower lip (the mentolabial sulcus) deeper and crisper, the chin's pad fuller and lower, and
    # the jaw's lower edge a soft ridge from the chin back to the angle of the jaw, so that the underside turns away to the neck at a line
    d += -0.0068 * gauss(x, y, 0.0, -0.0715, 0.020, 0.0068)
    d += (0.0130 - 0.0022 * fem) * T["chin"] * gauss(x, y, 0.0, -0.0915, 0.019 * (0.9 + 0.1 * T["chin"]), 0.0145)
    d += 0.0016 * g2(x, y, 0.010, -0.093, 0.009, 0.008)                                                       # the chin's two soft corners
    d += (0.0030 - 0.0008 * fem) * l2(x, y, [(0.012, -0.102), (0.035, -0.096), (0.058, -0.080), (0.074, -0.058)], 0.0055)   # the jaw's edge
    return d

def fine(x, y, fem, ft=None):
    """what only the high head has: lids and their creases, the folds beside the nose and mouth, the groove above the lip, the cupid's bow"""
    T = ft or TYPES["m"]
    nw, ny, mw = T["nose_w"], T["nose_y"], T["mouth_w"]
    d = -0.0011 * l2(x, y, [(0.025, 0.022), (0.034, 0.0295), (0.046, 0.030), (0.057, 0.0245)], 0.0022)   # the fold of the upper lid
    d += 0.0025 * g2(x, y, 0.041, 0.022, 0.017, 0.006)                                                  # the lid itself
    d += -0.0011 * l2(x, y, [(0.027, 0.006), (0.040, 0.0035), (0.054, 0.008)], 0.0020)                   # the lower lid's line
    d += 0.0015 * g2(x, y, 0.040, -0.004, 0.016, 0.004)                                                 # a slight bag under it
    d += -0.0005 * l2(x, y, [(0.030, 0.0), (0.045, -0.008), (0.060, -0.012)], 0.0030)                    # the tear trough
    d += 0.0020 * g2(x, y, 0.0255, 0.011, 0.003, 0.003)                                                 # the inner corner of the eye
    d += -(0.0012 - 0.0003 * fem) * l2(x, y, [(0.0225 * nw, -0.0215 + ny), (0.0265, -0.032), (0.030, -0.044), (0.031 * mw, -0.0515)], 0.0032)  # nose to mouth
    d += -0.0013 * l2(x, y, [(0.0115 * nw, -0.0125 + ny), (0.0190 * nw, -0.0185 + ny), (0.0225 * nw, -0.0250 + ny)], 0.0018)  # the crease of the wing of the nose
    d += 0.0010 * l2(x, y, [(0.0045, -0.032), (0.0055, -0.0425)], 0.0016)                                # the ridges of the philtrum
    d += -0.0006 * gauss(x, y, 0.0, -0.037, 0.0025, 0.005)                                              # and its groove
    d += 0.0020 * g2(x, y, 0.006, -0.0435, 0.004, 0.0022)                                               # the cupid's bow
    d += -0.0006 * g2(x, y, 0.0275 * mw, -0.0505, 0.004, 0.0035)                                         # the corners of the mouth (a dimple there is a smirk)
    d += -0.0008 * line(x, y, [(-0.018 * mw, -0.0445), (-0.006, -0.0408), (0.0, -0.0432), (0.006, -0.0408), (0.018 * mw, -0.0445)], 0.0012)   # the edge of the upper lip's red
    d += -0.0004 * line(x, y, [(-0.052, 0.062), (0.0, 0.066), (0.052, 0.062)], 0.0026)                   # one line across the forehead
    d += -0.0004 * line(x, y, [(0.0, 0.026), (0.0, 0.036)], 0.0020)                                      # between the brows (a groove there is a frown)
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

def surface(dx, dy, dz, fem, level, variant=None, ft=None):
    """the head at a unit direction: the skull ellipsoid, the tapering jaw, then the features along the normal"""
    x, y, z = dx * BX, dy * BY, dz * BZ
    front = smooth(0.0, 0.8, dz)
    low = smooth(-0.05, -0.95, dy)
    x *= 1.0 - (0.24 + 0.06 * fem) * low
    z += (0.012 - 0.003 * fem) * low * smooth(0.2, 0.9, dz)
    y -= 0.012 * low
    # (the chin brought forward, and the underside of the jaw tucked back toward the neck, so the chin stands off the throat at a clear angle)
    # (2026-11-05, second pass, the user: "the chin needs to protrude a bit more ... more definition between the chin and the neck": the chin's point brought to about
    # 4 mm behind the lower lip, and the underside of the jaw lifted into a flatter shelf from the chin back to the throat, the angle under the chin sharper)
    z += (0.0150 - 0.0030 * fem) * math.exp(-0.5 * ((dx / 0.24) ** 2 + ((dy + 0.69) / 0.085) ** 2)) * smooth(0.3, 0.9, dz)
    y += (0.0055 - 0.0010 * fem) * smooth(-0.74, -0.84, dy) * (1.0 - smooth(-0.92, -0.99, dy)) * smooth(0.15, 0.5, dz)
    z -= 0.010 * smooth(-0.86, -0.97, dy) * smooth(-0.2, 0.6, dz)
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
            d = coarse(x, y, fem, ft)
            if level:
                d += fine(x, y, fem, ft)
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

def head_mesh(name, fem, rows, segs, level, dense=False, variant=None, ft=None):
    verts, uvs, faces = [], [], []
    index = {}
    def add(i, j, pole=None):
        th = warp_theta(math.pi * i / rows, dense)
        ph = warp_phi(-math.pi + 2 * math.pi * (j if pole is None else j + 0.5) / segs, dense)
        dx, dy, dz = math.sin(th) * math.sin(ph), math.cos(th), math.sin(th) * math.cos(ph)
        x, y, z = surface(dx, dy, dz, fem, level, variant, ft)
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
def paint(fem, path, variant=None, SIZE=SIZE, ft=None):
    """a pale colour map for the low head's texture coordinates: the vertex colour (the skin) multiplies it, so what it holds is the
    difference from the skin: redder, darker lips, shaded lids and nostrils, a little warmth in the cheeks"""
    import numpy as np
    T = ft or TYPES["m"]
    nw, ny, mw = T["nose_w"], T["nose_y"], T["mouth_w"]
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
    def edge(w):
        """0 to 1 across a soft edge, w the distance from it in metres (positive inside)"""
        k = np.clip(w / 0.0009 + 0.5, 0, 1)
        return k * k * (3 - 2 * k)
    sn = SNOUTS.get(variant) if variant else None
    # the lips (2026-11-05: they were one oval of red over the nose-to-mouth gap, 3 cm tall): the red between the line of the mouth and an upper edge with a cupid's bow, and
    # a lower edge, narrowing to the corners; the line itself a thin dark stroke
    wm = 0.0275 * mw
    e = np.clip(1.0 - (x / wm) ** 2, 0, 1) ** 0.7
    mline = -0.0512 + 0.0008 * np.clip((x / wm) ** 2, 0, 1)
    hu = 0.0098 * (0.7 + 0.3 * T["lip_u"]) * e
    hl = 0.0128 * (0.7 + 0.3 * T["lip_l"]) * e
    bow = 1.0 - 0.22 * np.exp(-((x / 0.0032) ** 2)) + 0.10 * np.exp(-(((np.abs(x) - 0.0058) / 0.0028) ** 2))
    upper = edge(y - mline) * edge(mline + hu * bow - y) * edge(wm - np.abs(x)) * front
    lower = edge(mline - y) * edge(y - (mline - hl)) * edge(wm - np.abs(x)) * front
    mouth = np.exp(-0.5 * ((y - mline) / 0.0009) ** 2) * (np.abs(x) < wm * 0.96) * front
    if variant:
        ty = (sn[3] + 0.014) if sn else -0.02
        pad = np.clip(G(0, ty, (sn[1] * 0.6) if sn else 0.012, 0.012), 0, 1) * front
        nost = np.clip(G2(0.011, ty - 0.003, 0.0042, 0.0036), 0, 1) * front
        mline_s = np.exp(-0.5 * ((y - ((sn[3] - 0.022) if sn else -0.054)) / 0.0014) ** 2) * (np.abs(x) < 0.032) * front
    lid = np.clip(G2(0.041, 0.022, 0.018, 0.008), 0, 1) * front
    bag = np.clip(G2(0.040, -0.006, 0.016, 0.006), 0, 1) * front
    nostril = np.clip(G2(0.0078 * nw, -0.0245 + ny, 0.0030, 0.0019), 0, 1) * front
    cheek = np.clip(G2(0.062, -0.020, 0.026, 0.020) * T["cheek"], 0, 1) * front
    rgb = np.ones((n, n, 3), dtype=np.float32) * 0.93
    def tint(mask, col, k):
        for c in range(3):
            rgb[:, :, c] *= 1.0 + mask * k * (col[c] - 1.0)
    if not variant:
        tint(upper, (1.0, 0.66, 0.64), T["tint"] * 1.08 + 0.08 * fem)
        tint(lower, (1.0, 0.70, 0.67), T["tint"] + 0.08 * fem)
    tint(lid, (0.95, 0.84, 0.88), 0.7)
    tint(bag, (0.96, 0.88, 0.9), 0.6)
    tint(cheek, (1.0, 0.92, 0.91), 0.45 + 0.2 * fem)
    if variant:
        pig = variant == "pig"
        tint(pad, (1.0, 0.8, 0.78) if pig else (0.42, 0.34, 0.34), 0.8)
        tint(nost, (0.35, 0.28, 0.28), 0.9)
        tint(mline_s, (0.5, 0.4, 0.4), 0.7)
    else:
        tint(nostril, (0.55, 0.45, 0.45), 0.42)
        tint(mouth, (0.62, 0.5, 0.5), 0.5)
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

def main(reset=True):
    """`reset` False: built in the open Mixar session (export_live), in the collection made active for it, not on an empty scene"""
    if reset:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    rows, segs = (30, 40) if HI else (18, 26)
    exported = []
    plan = [(k, T["fem"], None, 768, T) for k, T in TYPES.items()] + [(k, 0.0, k, 512, None) for k in ("muzzle", "long", "short", "pig", "flat")]
    atlas = {}
    if ONLY:
        plan = [p for p in plan if p[0] in ONLY.split(",")]
    for variant, fem, snout, size, ft in plan:
        low = head_mesh(f"head_{variant}", fem, rows, segs, 0, False, snout, ft)
        weld_normals(low)
        # (the high head only where there is something to bake or to look at)
        high = head_mesh(f"high_{variant}", fem, 120 if FAST else 240, 160 if FAST else 320, 1, True, snout, ft) if (PREVIEW or (MAPS and HI)) else None
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
            paint(fem, os.path.join(MAPS, f"head_{variant}_color.png"), snout, size, ft)
            for o in exported:
                o.hide_render = False
            atlas[variant] = {"cell": CELLS[variant], "size": size}
        if high:
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

# ---- From the open Mixar session (2026-11-05) ----------------------------------------------------------------------------------------------------
# `import builtins; builtins.HEAD_EXPORT=True; p=r"...\tools\blender\build-head.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})`
# builds head.glb and head.lo.glb (the low heads, the snouted heads, the machine head, masks and head-tails; NOT a bake: the maps stay as they are,
# which is right while a change is to the coarse shapes both heads share) and hair.glb and hair.lo.glb, into client/public/figures, in a collection of
# their own that is removed afterwards. `builtins.HEAD_REVIEW=True` instead renders the two people's heads with their atlas and a few hair styles
# to tools/refs/cache/head-review-*.png.
def _fresh(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(os.path.dirname(os.path.abspath(__file__)), file))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod       # (main() hands gear its own module by name)
    spec.loader.exec_module(mod)
    return mod

def _scoped(fn, coll_name):
    coll = bpy.data.collections.new(coll_name)
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
    try:
        return fn()
    finally:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FIGURES = os.path.join(REPO, "client", "public", "figures")

def export_live():
    import shape as _shape
    keep = list(sys.argv)
    names = set()
    try:
        for lo in (False, True):
            sys.argv = ["mixar", "--", FIGURES] + (["--lo"] if lo else [])
            importlib.reload(_shape)
            hd = _fresh("build_head_export", "build-head.py")
            hr = _fresh("build_hair_export", "build-hair.py")
            # (objects of the scene with the names the files use step aside, so that the exported meshes are named exactly what the game looks for)
            for ob in list(bpy.data.objects):
                if ob.name.startswith(("head_", "hair_", "beard_", "brows", "tattoo_", "machine_head", "mask_", "lekku", "montral_")) and not ob.name.endswith("_review"):
                    ob.name = ob.name + "_review"
            _scoped(lambda: hd.main(reset=False), "claude_head_export")
            _scoped(lambda: hr.main(reset=False), "claude_hair_export")
    finally:
        sys.argv = keep
        importlib.reload(_shape)
    print("HEAD EXPORT done")

def review_live():
    """the people's heads with the atlas (textures/figure/head) and hair styles, rendered close beside each other"""
    scn = bpy.context.scene
    keep = (scn.render.engine, scn.camera, scn.render.resolution_x, scn.render.resolution_y, scn.render.filepath)
    coll = bpy.data.collections.get("claude_head_review")
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new("claude_head_review")
        scn.collection.children.link(coll)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
    hr = _fresh("build_hair_review", "build-hair.py")
    tex = os.path.join(REPO, "client", "public", "textures", "figure")
    def img(path, colour=False):
        im = bpy.data.images.load(path, check_existing=True)
        im.reload()
        im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        return im
    def head_material(skin):
        m = bpy.data.materials.new("review_head")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        d = nt.nodes.new("ShaderNodeTexImage"); d.image = img(os.path.join(tex, "head", "diffuse.jpg"), True)
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img(os.path.join(tex, "head", "normal.jpg"))
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = (*skin, 1)
        nt.links.new(d.outputs[0], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs[0], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], b.inputs["Normal"])
        b.inputs["Roughness"].default_value = 0.5
        return m
    def hair_material(colour):
        m = bpy.data.materials.new("review_hair")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(os.path.join(tex, "hair", "strands.webp"), True)
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = (*colour, 1)
        nt.links.new(t.outputs[0], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        nt.links.new(t.outputs[1], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.45
        try:
            m.surface_render_method = "DITHERED"
        except Exception:
            pass
        return m
    base = Vector((0, -30, 0))
    sets = [("m", "hair_short", (0.55, 0.36, 0.25), (0.12, 0.08, 0.05)), ("f", "hair_long", (0.75, 0.55, 0.42), (0.35, 0.2, 0.1)),
            ("m2", "hair_messy", (0.35, 0.22, 0.14), (0.05, 0.04, 0.03)), ("f2", "hair_bob", (0.62, 0.45, 0.33), (0.6, 0.45, 0.2)),
            ("m", "hair_quiff", (0.55, 0.36, 0.25), (0.25, 0.15, 0.08)), ("f", "hair_curls", (0.45, 0.3, 0.2), (0.08, 0.06, 0.05))]
    shots = []
    for i, (kind, style, skin, hair) in enumerate(sets):
        at = base + Vector((i * 1.5, 0, 0))
        T = TYPES[kind]
        low = head_mesh(f"review_head_{i}", T["fem"], 30, 40, 0, False, None, T)
        weld_normals(low)
        u0, v0, du, dv = CELLS[kind]
        for d in low.data.uv_layers.active.data:
            d.uv = (u0 + d.uv[0] * du, v0 + d.uv[1] * dv)
        low.location = at
        low.data.materials.append(head_material(skin))
        if style in hr.STYLES:
            hob = hr.build(hr.STYLES[style]())
            hob.name = f"review_{style}_{i}"
            hob.location = at
            hob.data.materials.append(hair_material(hair))
        for tag, yaw in (("34", 0.6), ("side", 1.5708), ("back", 2.6)):
            shots.append((f"head-review-{i}-{kind}-{style}-{tag}", at, at + Vector((0.72 * math.sin(yaw), -0.72 * math.cos(yaw), 0.0))))
    for nm, loc, en in (("rv_key", (4.0, -32.0, 1.5), 140), ("rv_fill", (-1.5, -31.5, 0.3), 40), ("rv_rim", (4.0, -27.5, 1.2), 70)):
        l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
        coll.objects.link(l)
        l.location = loc
        l.data.energy = en
        l.data.size = 3.0
        l.rotation_euler = (Vector((3.75, -30, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.new("rv_cam", bpy.data.cameras.new("rv_cam"))
    coll.objects.link(cam)
    cam.data.lens = 85
    scn.camera = cam
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scn.render.resolution_x = scn.render.resolution_y = 560
    hidden = [o for o in scn.objects if o.name not in coll.objects and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    try:
        for name, look, frm in shots:
            cam.location = frm
            cam.rotation_euler = (look + Vector((0, 0, -0.02)) - frm).to_track_quat("-Z", "Y").to_euler()
            scn.render.filepath = os.path.join(REPO, "tools", "refs", "cache", name + ".png")
            bpy.ops.render.render(write_still=True)
    finally:
        for o in hidden:
            o.hide_render = False
        scn.render.engine, scn.camera, scn.render.resolution_x, scn.render.resolution_y, scn.render.filepath = keep
    print("HEAD REVIEW", len(shots), "shots")

if __name__ == "__main__":
    import builtins as _b
    if bpy.app.background:
        main()
    elif getattr(_b, "HEAD_EXPORT", False):
        _b.HEAD_EXPORT = False
        export_live()
    elif getattr(_b, "HEAD_REVIEW", False):
        _b.HEAD_REVIEW = False
        review_live()
    else:
        print("build-head.py: set builtins.HEAD_EXPORT or builtins.HEAD_REVIEW first (a plain run here would reset the scene)")
