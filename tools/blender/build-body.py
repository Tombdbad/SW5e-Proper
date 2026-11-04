# The sculpted body of a person (2026-11-04; the user: "a more AAA graphical feel to the NPCs/characters/beasts and their animations",
# "you have blender available to refine the models").
#
# Run headless:  blender --background --python tools/blender/build-body.py -- <out-dir> [--lo]
# It builds the parts models.tsx `buildHumanoid` draws a person from and writes <out-dir>/body.glb (body.lo.glb with --lo, fewer faces):
#   torso (hips, waist, chest, shoulders, neck), arm (shoulder to elbow), fore (elbow to wrist, then the hand), thigh, shin (knee to
#   ankle, then the boot) and head (skull, brow, nose, lips, chin, ears; the eyes stay the code's).
# Every part is in the units and axes of the code (y up, +z the way the figure faces, +x its left) with its origin at its own joint,
# the limbs hanging along -y; client/src/components/Map/interiors/body.ts fits them to each pose.
# Per vertex: `_AO` (ambient occlusion from the whole figure standing, multiplied into the colour the part is dressed in) and
# `_REGION` (which dressed colour: see REGIONS in body.ts). Original shapes, built from lofted sections and displaced spheres: CC0.
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix, bvhtree

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
HI = "--lo" not in sys.argv

# three's axes (x, y up, z front) -> Blender's (x, -z, y), so the glTF exporter (y up) gives the same numbers back
def P(x, y, z):
    return Vector((x, -z, y))

def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)

def spow(v, n):
    return math.copysign(abs(v) ** n, v)

def dense(sections, regions, k):
    """Catmull-Rom through the sections (centre, u, v, ru, rv, n): k rings for each gap, so the silhouette is a curve, not facets"""
    if not HI:
        k = max(1, k // 2)
    out, reg = [], []
    n = len(sections)
    def pick(i):
        return sections[max(0, min(n - 1, i))]
    for i in range(n - 1):
        a, b, c, d = pick(i - 1), pick(i), pick(i + 1), pick(i + 2)
        for j in range(k):
            t = j / k
            def cr(f):
                p0, p1, p2, p3 = f(a), f(b), f(c), f(d)
                return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            centre = Vector((cr(lambda s_: s_[0].x), cr(lambda s_: s_[0].y), cr(lambda s_: s_[0].z)))
            out.append((centre, b[1], b[2], max(1e-4, cr(lambda s_: s_[3])), max(1e-4, cr(lambda s_: s_[4])), cr(lambda s_: s_[5])))
            reg.append(regions[i] if t < 0.5 else regions[i + 1])
    out.append(sections[-1])
    reg.append(regions[-1])
    return out, reg

X, Y, Z = P(1, 0, 0), P(0, 1, 0), P(0, 0, 1)  # three's axes in Blender's
AROUND = 10 if HI else 7

# ---- Lofts: a part is rings (superellipses) along a line, with a region number on each ring ---------------------------------------------

class Part:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.region = self.bm.verts.layers.float.new("_REGION")

    def loft(self, sections, around, regions, cap_start=True, cap_end=True):
        """sections: (centre, u axis, v axis, ru, rv, n) each; regions: one number per section"""
        rings = []
        for (c, u, v, ru, rv, n), g in zip(sections, regions):
            ring = []
            for i in range(around):
                a = 2 * math.pi * i / around
                e = 2.0 / n
                vert = self.bm.verts.new(c + u * (ru * spow(math.cos(a), e)) + v * (rv * spow(math.sin(a), e)))
                vert[self.region] = float(g)
                ring.append(vert)
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(around):
                j = (i + 1) % around
                self.bm.faces.new((a[i], a[j], b[j], b[i]))
        for end, ring, sec, g in ((cap_start, rings[0], sections[0], regions[0]), (cap_end, rings[-1], sections[-1], regions[-1])):
            if not end:
                continue
            c = self.bm.verts.new(sec[0])
            c[self.region] = float(g)
            for i in range(around):
                j = (i + 1) % around
                self.bm.faces.new((ring[i], ring[j], c) if ring is rings[0] else (ring[j], ring[i], c))
        return rings

    def object(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for poly in me.polygons:
            poly.use_smooth = True
        return ob

def rounded(sections, regions, depth, steps=3):
    """a quarter-round cap beyond the last section (a joint's ball, a fingertip)"""
    c, u, v, ru, rv, n = sections[-1]
    axis = (c - sections[-2][0]).normalized()
    out, reg = list(sections), list(regions)
    for i in range(1, steps + 1):
        a = (i / steps) * math.pi / 2
        out.append((c + axis * (depth * math.sin(a)), u, v, ru * math.cos(a) + 1e-4, rv * math.cos(a) + 1e-4, n))
        reg.append(regions[-1])
    return out, reg

def join(obs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    obs[0].name = name
    obs[0].data.name = name
    return obs[0]

# ---- The pieces -----------------------------------------------------------------------------------------------------------------------

def torso():
    p = Part("torso")
    # (y, rx, rz, centre z, n): hips and seat, waist, ribs, chest and shoulders, the slope of the trapezius, the neck. Kept inside the
    # lathe the garments wrap (models.tsx `upper`), by a few per cent. Region: 1 the hips, 0 the trunk, 2 the neck
    spec = [
        (-0.105, 0.112, 0.078, -0.004, 2.4, 1),
        (-0.070, 0.148, 0.094, -0.010, 2.3, 1),
        (-0.020, 0.152, 0.092, -0.010, 2.3, 1),
        (0.040, 0.138, 0.084, -0.004, 2.3, 0),
        (0.110, 0.122, 0.078, 0.000, 2.2, 0),
        (0.170, 0.138, 0.090, 0.002, 2.2, 0),
        (0.230, 0.168, 0.104, 0.004, 2.3, 0),
        (0.290, 0.182, 0.109, 0.004, 2.4, 0),
        (0.335, 0.178, 0.100, 0.000, 2.6, 0),
        (0.375, 0.135, 0.083, -0.004, 2.5, 0),
        (0.405, 0.080, 0.062, -0.004, 2.2, 2),
        (0.425, 0.052, 0.050, 0.004, 2.0, 2),
        (0.470, 0.043, 0.046, 0.006, 2.0, 2),
    ]
    sec = [(P(0, y, cz), X, Z, rx, rz, n) for (y, rx, rz, cz, n, _) in spec]
    sec, reg = dense(sec, [s[5] for s in spec], 2)
    p.loft(sec, 16 if HI else 10, reg)
    ob = p.object()
    # the pectorals and the blades of the shoulders, the glutes and the groove of the spine: small displacements along the normal
    for v in ob.data.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        d = 0.0
        if z > 0.02 and 0.22 < y < 0.34:
            d += 0.0045 * math.exp(-((abs(x) - 0.075) ** 2 / 0.00045 + (y - 0.285) ** 2 / 0.0006))
        if z < -0.02:
            d += 0.004 * math.exp(-((abs(x) - 0.08) ** 2 / 0.0008 + (y - 0.30) ** 2 / 0.0012))
            d -= 0.0035 * math.exp(-(x * x / 0.00006)) * smooth(0.0, 0.1, y) * (1 - smooth(0.3, 0.38, y))
            d += 0.006 * math.exp(-((abs(x) - 0.065) ** 2 / 0.0007 + (y + 0.04) ** 2 / 0.0005))
        if d:
            n = v.normal
            v.co += Vector((n.x * d, n.y * d, 0.0)) * 1.0 + Vector((0, 0, n.z * d)) * 0.0
    return ob

def arm_up():
    p = Part("arm")
    L = 0.225  # shoulder to elbow
    spec = [(0.0, 0.050, 0.048), (0.12, 0.054, 0.053), (0.35, 0.049, 0.051), (0.55, 0.046, 0.053), (0.80, 0.039, 0.042), (0.95, 0.036, 0.038)]
    sec = [(P(0.0, -t * L, 0.0), X, Z, rx, rz, 2.1) for (t, rx, rz) in spec]
    sec, reg = dense(sec, [0] * len(sec), 2)
    sec, reg = rounded(sec, reg, 0.038, 3)
    p.loft(sec, AROUND, reg)
    return p.object()

def fore():
    p = Part("fore")
    # elbow to the hand's centre (0.19 below the elbow): the forearm, the wrist at 0.15, the palm (thin across, wide front to back),
    # the fingers narrower and curling a little forward and in, the hand ending 0.04 past the centre
    spec = [
        (0.000, 0.037, 0.039, 2.1, 0.0, 0.0, 0),
        (0.030, 0.041, 0.043, 2.1, 0.0, 0.0, 0),
        (0.080, 0.037, 0.040, 2.1, 0.0, 0.0, 0),
        (0.125, 0.029, 0.031, 2.1, 0.0, 0.0, 0),
        (0.150, 0.023, 0.026, 2.2, 0.0, 0.0, 0),
        (0.165, 0.021, 0.029, 2.4, 0.0, 0.002, 1),
        (0.185, 0.020, 0.037, 2.8, 0.0, 0.003, 1),
        (0.205, 0.019, 0.036, 2.8, -0.002, 0.005, 1),
        (0.225, 0.017, 0.031, 2.6, -0.004, 0.009, 1),
        (0.240, 0.013, 0.024, 2.4, -0.006, 0.013, 1),
    ]
    sec = [(P(du, -t, dv), X, Z, ru, rv, n) for (t, ru, rv, n, du, dv, _) in spec]
    sec, reg = dense(sec, [s[6] for s in spec], 2)
    sec, reg = rounded(sec, reg, 0.012, 3)
    p.loft(sec, AROUND, reg)
    ob = p.object()
    # the thumb: a tapered tube from the base of the palm, forward and down
    t = Part("thumb")
    pts = [(-0.012, -0.172, 0.027, 0.0105), (-0.016, -0.192, 0.042, 0.0095), (-0.016, -0.212, 0.052, 0.0085), (-0.014, -0.226, 0.056, 0.007)]
    ts = [(P(x, y, z), X, Z, r, r, 2.0) for (x, y, z, r) in pts]
    ts, treg = rounded(ts, [1] * len(ts), 0.007, 2)
    t.loft(ts, 8, treg)
    return join([ob, t.object()], "fore")

def thigh():
    p = Part("thigh")
    L = 0.25  # hip to knee
    spec = [(0.0, 0.066, 0.068, 0.0), (0.18, 0.068, 0.072, 0.003), (0.45, 0.062, 0.067, 0.004), (0.75, 0.052, 0.056, 0.003), (0.95, 0.047, 0.050, 0.002)]
    sec = [(P(0.0, -t * L, dz), X, Z, rx, rz, 2.1) for (t, rx, rz, dz) in spec]
    sec, reg = dense(sec, [0] * len(sec), 2)
    sec, reg = rounded(sec, reg, 0.046, 3)
    p.loft(sec, AROUND, reg)
    return p.object()

def shin():
    p = Part("shin")
    # the knee down to the ankle (0.23), the calf bulging behind
    spec = [(0.000, 0.047, 0.050, 0.0), (0.040, 0.050, 0.055, -0.004), (0.095, 0.048, 0.055, -0.009), (0.160, 0.037, 0.041, -0.004), (0.205, 0.029, 0.032, 0.0), (0.230, 0.028, 0.030, 0.0)]
    sec = [(P(0.0, -t, dz), X, Z, rx, rz, 2.1) for (t, rx, rz, dz) in spec]
    sec, reg = dense(sec, [0] * len(sec), 2)
    p.loft(sec, AROUND, reg, cap_start=True, cap_end=False)
    ob = p.object()
    # the boot: along +z, ankle-high, the heel behind the shin, the toe box low and round; its sole 0.08 below the ankle
    f = Part("foot")
    fy = -0.230
    fs = [(-0.058, 0.036, 0.044, -0.045, 2.2), (-0.030, 0.038, 0.052, -0.040, 2.3), (0.020, 0.041, 0.040, -0.043, 2.5), (0.075, 0.044, 0.032, -0.050, 2.6), (0.120, 0.040, 0.026, -0.057, 2.5), (0.152, 0.030, 0.018, -0.063, 2.3)]
    sec = [(P(0, fy + cy, z), X, Y, rx, ry, n) for (z, rx, ry, cy, n) in fs]
    sec, reg = dense(sec, [1] * len(sec), 2)
    sec, reg = rounded(sec, reg, 0.016, 3)
    f.loft(sec, AROUND, reg)
    return join([ob, f.object()], "shin")

# ---- The head -------------------------------------------------------------------------------------------------------------------------

def head():
    # a dense sphere pushed into a skull: the ellipsoid, the jaw, then the features each as a small bump or hollow along the surface
    segs, rings = (72, 56) if HI else (32, 24)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    layer = bm.verts.layers.float.new("_REGION")
    me = bpy.data.meshes.new("head")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("head", me)
    bpy.context.collection.objects.link(ob)
    FEATURE = 1.45
    BX, BY, BZ = 0.100, 0.118, 0.112
    for v in me.vertices:
        dx, dy, dz = v.co.x, v.co.z, -v.co.y  # the unit direction in three's axes
        x, y, z = dx * BX, dy * BY, dz * BZ
        front = smooth(0.0, 0.8, dz)
        low = smooth(-0.05, -0.95, dy)  # the jaw tapers, the chin comes forward and down
        x *= 1.0 - 0.24 * low
        z += 0.012 * low * smooth(0.2, 0.9, dz)
        y -= 0.012 * low
        z -= 0.006 * smooth(0.0, 0.9, dy) * (1 - front)
        nx, ny, nz = dx / BX, dy / BY, dz / BZ
        nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        nx, ny, nz = nx / nl, ny / nl, nz / nl
        if dz > 0.05:
            def bump(cx, cy, cz, rx, ry, rz, h):
                nonlocal x, y, z
                d2 = ((abs(x) - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
                g = math.exp(-0.5 * d2) * h * FEATURE
                x += g * nx
                y += g * ny
                z += g * nz
            bump(0.040, 0.016, 0.098, 0.024, 0.016, 0.03, -0.009)   # the eye sockets
            bump(0.042, 0.040, 0.100, 0.034, 0.011, 0.03, 0.0065)   # the brow ridge
            bump(0.0, 0.032, 0.106, 0.018, 0.014, 0.03, 0.002)      # between the brows
            bump(0.0, 0.0, 0.108, 0.010, 0.026, 0.03, 0.009)        # the bridge of the nose
            bump(0.0, -0.018, 0.112, 0.014, 0.013, 0.03, 0.0125)    # its tip
            bump(0.016, -0.023, 0.106, 0.009, 0.008, 0.03, 0.004)   # the wings
            bump(0.070, -0.012, 0.075, 0.024, 0.024, 0.04, 0.005)   # the cheekbones
            bump(0.062, -0.052, 0.07, 0.022, 0.022, 0.04, -0.004)   # the hollow below
            bump(0.0, -0.046, 0.108, 0.022, 0.0055, 0.03, 0.005)    # the upper lip
            bump(0.0, -0.058, 0.106, 0.021, 0.0065, 0.03, 0.0055)   # the lower lip
            bump(0.0, -0.0515, 0.11, 0.026, 0.004, 0.03, -0.0022)  # the line of the mouth
            bump(0.0, -0.088, 0.100, 0.020, 0.016, 0.04, 0.007)     # the chin
            bump(0.0, -0.072, 0.104, 0.011, 0.007, 0.03, -0.0035)   # under the lip
        v.co = Vector((x, -z, y))
    # the ears: a flattened oval on each side, a hollow in its outer face
    ears = []
    for s in (1, -1):
        e_bm = bmesh.new()
        bmesh.ops.create_uvsphere(e_bm, u_segments=16 if HI else 8, v_segments=12 if HI else 6, radius=1.0)
        e_me = bpy.data.meshes.new("ear")
        e_bm.to_mesh(e_me)
        e_bm.free()
        for v in e_me.vertices:
            dx, dy, dz = v.co.x, v.co.z, -v.co.y
            out = dx * 0.010
            if dx > 0.1:
                out -= 0.006 * math.exp(-((dy * 1.3) ** 2 + (dz * 1.4) ** 2))
            v.co = Vector((s * (0.101 + out), -(dz * 0.020 * (1.0 + 0.2 * dy) - 0.012 + 0.004 * dy), dy * 0.030 - 0.003))
        e_ob = bpy.data.objects.new("ear", e_me)
        bpy.context.collection.objects.link(e_ob)
        e_ob.data.attributes.new("_REGION", "FLOAT", "POINT")
        for v in e_ob.data.vertices:
            e_ob.data.attributes["_REGION"].data[v.index].value = 3.0
        ears.append(e_ob)
    for o in [ob] + ears:
        for poly in o.data.polygons:
            poly.use_smooth = True
    joined = join([ob] + ears, "head")
    # (the dense sphere carries the features; collapse it to a budget, the vertex colours and their regions kept)
    bpy.context.view_layer.objects.active = joined
    joined.select_set(True)
    mod = joined.modifiers.new("budget", "DECIMATE")
    mod.ratio = 0.2 if HI else 0.1
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="budget")
    for poly in joined.data.polygons:
        poly.use_smooth = True
    return joined

# ---- Ambient occlusion from the whole figure standing ------------------------------------------------------------------------------------

def occlusion(placed, rays):
    """vertex AO from rays cast against every part in its standing place (one BVH over them all)"""
    verts, polys = [], []
    for ob, mat in placed:
        base = len(verts)
        verts += [mat @ v.co for v in ob.data.vertices]
        polys += [tuple(base + i for i in poly.vertices) for poly in ob.data.polygons]
    tree = bvhtree.BVHTree.FromPolygons(verts, polys)
    rnd = random.Random(7)
    dirs = []
    while len(dirs) < rays:
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.01 < d.length_squared <= 1:
            dirs.append(d.normalized())
    reach = 0.07
    out = {}
    for ob, mat in placed:
        nm = mat.to_3x3()
        ao = []
        for v in ob.data.vertices:
            w = mat @ v.co
            n = (nm @ v.normal).normalized()
            hits, tot = 0.0, 0
            for d in dirs:
                if d.dot(n) < 0:
                    d = -d
                if d.dot(n) < 0.08:
                    continue
                tot += 1
                loc, nor, idx, dist = tree.ray_cast(w + n * 0.002, d, reach)
                if loc is not None and dist > 0.01:
                    hits += 1.0 - dist / reach
            ao.append(1.0 - 0.7 * (hits / max(1, tot)))
        out[(ob.name, id(mat))] = ao
    return out

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = {"torso": torso(), "arm": arm_up(), "fore": fore(), "thigh": thigh(), "shin": shin(), "head": head()}
    # a figure standing in the code's frame (hips at y 0.56), the arms by the sides and the legs straight: for the occlusion only. Both
    # sides are placed so each shades the trunk and the other
    def at(x, y, z):
        return Matrix.Translation(P(x, y, z))
    flip = Matrix.Scale(-1, 4, Vector((1, 0, 0)))
    one = [
        (parts["arm"], at(0.19, 0.56 + 0.34, 0)),
        (parts["fore"], at(0.215, 0.56 + 0.12, -0.01)),
        (parts["thigh"], at(0.085, 0.56, 0)),
        (parts["shin"], at(0.0892, 0.31, 0.025)),
    ]
    placed = [(parts["torso"], at(0, 0.56, 0)), (parts["head"], at(0, 0.56 + 0.525, 0.005))] + one + [(ob, flip @ m) for ob, m in one]
    ao = occlusion(placed, 40 if HI else 20)
    for name, ob in parts.items():
        a = ob.data.attributes.new("_AO", "FLOAT", "POINT")
        # (the limbs are placed twice: the left one's values stand for both)
        key = [k for k in ao if k[0] == ob.name][0]
        for i, val in enumerate(ao[key]):
            a.data[i].value = val
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in parts.values():
        ob.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "body.glb" if HI else "body.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_materials="NONE", export_yup=True, export_apply=False)
    print("BODY", path, {n: len(ob.data.polygons) for n, ob in parts.items()})

main()
