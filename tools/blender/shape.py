# Shared by the Blender scripts of the sculpted bodies (build-body.py, build-creature.py): the axes of the code, lofted parts, a Catmull-Rom
# densifier, joining, and vertex ambient occlusion by ray casts. Both read their arguments after `--`: <out-dir> [--lo]
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

