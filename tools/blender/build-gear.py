# What goes on or in place of a head (2026-11-04; the user: "lets deal with species with a muzzle, a mask or a machine head"): the head of a machine, and
# four masks. Imported by build-head.py, which puts them in head.glb beside the heads; each is a function returning a Blender object (the code's axes:
# y up, +z the way the face looks, the origin the middle of the skull) with `_REGION` (which colour the code dresses it in: see MASKS in models.tsx) and
# `_AO` per vertex (the code multiplies it into the colour, so a crease is dark).
#   machine_head   a droid's head with a person's proportions: a smooth shell, two sockets for the lit lenses, a mouth grille, discs for ears
#                  regions: 0 shell, 1 dark inserts (the sockets' rims, the grille, the ears)
#   mask_wraps     a Tusken Raider's head: wound in cloth (ridged, a wrap to a ridge), two round goggles, a mouth grille, and a wrap at the neck
#                  regions: 0 cloth, 1 the goggles' dark rims and lenses, 2 the grille's metal
#   mask_rebreather  a breathing mask over the nose and mouth with a filter at each cheek, tubes back to the ears and straps
#                  regions: 0 the mask's body, 1 filters, tubes and straps
#   mask_bone      a mask of bone from the brow to the lip with holes for the eyes and the nose, and teeth
#                  region: 0 bone
#   mask_goggles   a strap round the head with two lens cups
#                  regions: 0 the strap, 1 the cups' metal, 2 the lenses
# Original shapes: CC0.
import bpy, bmesh, math, os, sys, importlib.util
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P, smooth, HI, occlusion

def _head():
    spec = importlib.util.spec_from_file_location("build_head_for_gear", os.path.join(HERE, "build-head.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

V = lambda *a: Vector(a[0] if len(a) == 1 else a)
AROUND = 20 if HI else 12

class Build:
    """one mesh made of pieces, each with a region: lofts (rings along a line), boxes, cylinders, tubes and patches of the face"""
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.region = self.bm.verts.layers.float.new("_REGION")

    def _vert(self, p, region):
        v = self.bm.verts.new(P(p[0], p[1], p[2]))
        v[self.region] = float(region)
        return v

    def _face(self, verts, outward=None):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        if outward is not None:
            c = sum((v.co for v in verts), Vector((0, 0, 0))) / len(verts)
            if f.normal.dot(c - P(*outward)) < 0:
                f.normal_flip()
        return f

    def loft(self, sections, region=0, around=None, closed_top=True):
        """sections: (y, rx, rz, zc, n) each, a superellipse ring at height y centred (0, y, zc); smoothed (Catmull-Rom) through them"""
        around = around or AROUND
        pts = []
        n = len(sections)
        k = 2 if HI else 1
        for i in range(n - 1):
            a, b, c, d = sections[max(0, i - 1)], sections[i], sections[i + 1], sections[min(n - 1, i + 2)]
            for j in range(k):
                t = j / k
                def cr(m):
                    p0, p1, p2, p3 = a[m], b[m], c[m], d[m]
                    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
                pts.append(tuple(cr(m) for m in range(5)))
        pts.append(sections[-1])
        rings = []
        for (y, rx, rz, zc, nn) in pts:
            ring = []
            for i in range(around):
                a = 2 * math.pi * i / around
                e = 2.0 / nn
                ring.append(self._vert((rx * math.copysign(abs(math.sin(a)) ** e, math.sin(a)), y, zc + rz * math.copysign(abs(math.cos(a)) ** e, math.cos(a))), region))
            rings.append(ring)
        for ra, rb in zip(rings, rings[1:]):
            for i in range(around):
                j = (i + 1) % around
                self._face([ra[i], rb[i], rb[j], ra[j]], outward=(0, (pts[0][0] + pts[-1][0]) / 2, 0))
        for ring, y in ((rings[0], pts[0]), (rings[-1], pts[-1])):
            c = self._vert((0, y[0], y[3]), region)
            for i in range(around):
                self._face([ring[i], ring[(i + 1) % around], c], outward=(0, (pts[0][0] + pts[-1][0]) / 2, 0))
        return rings

    def box(self, c, size, region=0, round_=0.0):
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        v = [[self._vert((c[0] + dx * sx, c[1] + dy * sy, c[2] + dz * sz), region) for dz in (-1, 1)] for dx in (-1, 1) for dy in (-1, 1)]
        vs = [v[0][0], v[0][1], v[1][0], v[1][1], v[2][0], v[2][1], v[3][0], v[3][1]]   # index = (dx, dy, dz) bits
        idx = lambda dx, dy, dz: vs[(dx > 0) * 4 + (dy > 0) * 2 + (dz > 0)]
        for quad in (((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)),
                     ((-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)), ((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)),
                     ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1))):
            self._face([idx(*q) for q in quad], outward=c)

    def cyl(self, c, axis, r, h, region=0, seg=10, r2=None):
        """a cylinder (or a cone, `r2` the far radius) along `axis` ('x', 'y' or 'z') from its centre c, h long"""
        r2 = r if r2 is None else r2
        def at(t, a):
            q = (r + (r2 - r) * (t + 0.5))
            u, w = math.cos(a) * q, math.sin(a) * q
            if axis == "z":
                return (c[0] + u, c[1] + w, c[2] + t * h)
            if axis == "x":
                return (c[0] + t * h, c[1] + u, c[2] + w)
            return (c[0] + u, c[1] + t * h, c[2] + w)
        ra = [self._vert(at(-0.5, 2 * math.pi * i / seg), region) for i in range(seg)]
        rb = [self._vert(at(0.5, 2 * math.pi * i / seg), region) for i in range(seg)]
        for i in range(seg):
            j = (i + 1) % seg
            self._face([ra[i], ra[j], rb[j], rb[i]], outward=c)
        ext = {"x": (0.5 * h, 0, 0), "y": (0, 0.5 * h, 0), "z": (0, 0, 0.5 * h)}[axis]
        ca = self._vert((c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]), region)
        cb = self._vert((c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]), region)
        for i in range(seg):
            j = (i + 1) % seg
            self._face([ra[j], ra[i], ca], outward=c)
            self._face([rb[i], rb[j], cb], outward=c)

    def tube(self, points, r, region=1, seg=5, closed=False):
        """a round tube along a curve through `points` (Catmull-Rom), `r` or a function of the way along it"""
        pts = []
        n = len(points)
        for i in range(n - (0 if closed else 1)):
            a, b, c_, d = points[(i - 1) % n] if closed else points[max(0, i - 1)], points[i], points[(i + 1) % n], points[(i + 2) % n] if closed else points[min(n - 1, i + 2)]
            for j in range(3):
                t = j / 3
                pts.append(tuple(0.5 * ((2 * b[m]) + (-a[m] + c_[m]) * t + (2 * a[m] - 5 * b[m] + 4 * c_[m] - d[m]) * t * t + (-a[m] + 3 * b[m] - 3 * c_[m] + d[m]) * t ** 3) for m in range(3)))
        if not closed:
            pts.append(tuple(points[-1]))
        rings = []
        m = len(pts)
        for i, p in enumerate(pts):
            nxt = pts[(i + 1) % m] if closed else pts[min(i + 1, m - 1)]
            prv = pts[(i - 1) % m] if closed else pts[max(i - 1, 0)]
            T = (Vector(nxt) - Vector(prv)).normalized()
            up = Vector((0, 1, 0)) if abs(T.y) < 0.9 else Vector((1, 0, 0))
            N = T.cross(up).normalized()
            B = T.cross(N).normalized()
            rr = r(i / max(1, m - 1)) if callable(r) else r
            rings.append([self._vert(tuple(Vector(p) + N * (rr * math.cos(2 * math.pi * k / seg)) + B * (rr * math.sin(2 * math.pi * k / seg))), region) for k in range(seg)])
        last = m if closed else m - 1
        for i in range(last):
            ra, rb = rings[i], rings[(i + 1) % m]
            for k in range(seg):
                l = (k + 1) % seg
                self._face([ra[k], ra[l], rb[l], rb[k]], outward=pts[i])
        if not closed:
            for ring, p, q in ((rings[0], pts[0], pts[1]), (rings[-1], pts[-1], pts[-2])):
                c = self._vert(p, region)
                for k in range(seg):
                    self._face([ring[k], ring[(k + 1) % seg], c], outward=q)

    def patch(self, head, x0, x1, y0, y1, nx, ny, offset, region=0, skip=None):
        """a sheet over the face between the given x and y, `offset` above its surface, cells whose centre `skip` says yes left out"""
        grid = {}
        def vert(i, j):
            if (i, j) not in grid:
                x = x0 + (x1 - x0) * i / nx
                y = y0 + (y1 - y0) * j / ny
                dx, dy = x / head.BX, y / head.BY
                dz = math.sqrt(max(0.02, 1 - dx * dx - dy * dy))
                l = math.sqrt(dx * dx + dy * dy + dz * dz)
                p = V(head.surface(dx / l, dy / l, dz / l, 0.0, 0))
                n = V(p.x / head.BX ** 2, p.y / head.BY ** 2, p.z / head.BZ ** 2).normalized()
                q = p + n * offset
                grid[(i, j)] = (self._vert((q.x, q.y, q.z), region), q)
            return grid[(i, j)]
        for i in range(nx):
            for j in range(ny):
                cells = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)]
                centre = sum((c[1] for c in cells), V(0, 0, 0)) / 4
                if skip and skip(centre.x, centre.y):
                    continue
                self._face([c[0] for c in cells], outward=(0, 0, 0))

    def finish(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for poly in me.polygons:
            poly.use_smooth = True
        # (ambient occlusion by rays against the mesh itself)
        ao = me.attributes.new("_AO", "FLOAT", "POINT")
        res = occlusion([(ob, Matrix.Identity(4))], 36 if HI else 18)
        for i, val in enumerate(next(iter(res.values()))):
            ao.data[i].value = val
        return ob

# ---- The machine's head --------------------------------------------------------------------------------------------------------------------
def machine_head():
    b = Build("machine_head")
    b.loft([(-0.118, 0.040, 0.050, 0.010, 2.2), (-0.100, 0.062, 0.075, 0.012, 2.4), (-0.070, 0.088, 0.100, 0.006, 2.5), (-0.030, 0.104, 0.112, 0.000, 2.6),
            (0.020, 0.110, 0.116, -0.002, 2.6), (0.065, 0.104, 0.110, -0.006, 2.5), (0.100, 0.086, 0.094, -0.010, 2.4), (0.122, 0.052, 0.058, -0.014, 2.2), (0.130, 0.012, 0.014, -0.014, 2.0)], region=0)
    for s in (1, -1):
        # the sockets of the lenses: a dark rim round each (the code puts the lit lens in it) and the ear discs
        b.cyl((s * 0.042, 0.02, 0.112), "z", 0.031, 0.018, 1, 14, r2=0.027)
        b.cyl((s * 0.109, 0.0, -0.005), "x", 0.030, 0.014, 1, 12)
        b.cyl((s * 0.109, 0.0, -0.005), "x", 0.019, 0.018, 0, 10)
    # the brow: a band of plate over the sockets, and the mouth's grille: a dark slot with ribs
    b.box((0, 0.054, 0.108), (0.13, 0.010, 0.012), 0)
    b.box((0, -0.058, 0.108), (0.07, 0.034, 0.014), 1)
    for k in range(-2, 3):
        b.box((k * 0.012, -0.058, 0.115), (0.005, 0.03, 0.006), 0)
    return b.finish()

# ---- The Tusken's head ----------------------------------------------------------------------------------------------------------------------
def mask_wraps():
    b = Build("mask_wraps")
    base = [(-0.115, 0.050, 0.060, 0.008), (-0.09, 0.085, 0.098, 0.004), (-0.04, 0.108, 0.116, 0.0), (0.02, 0.116, 0.124, -0.004), (0.07, 0.112, 0.120, -0.008), (0.11, 0.090, 0.098, -0.012), (0.132, 0.050, 0.056, -0.016)]
    # (ridged: the sections go in and out, so that each wrap stands out from the next)
    sections = []
    steps = 22
    for i in range(steps + 1):
        y = -0.115 + (0.132 + 0.115) * i / steps
        # (the base profile at y by interpolation)
        for k in range(len(base) - 1):
            if base[k][0] <= y <= base[k + 1][0]:
                t = (y - base[k][0]) / (base[k + 1][0] - base[k][0])
                rx, rz, zc = [base[k][m] + (base[k + 1][m] - base[k][m]) * t for m in (1, 2, 3)]
                break
        bump = 1.0 + 0.022 * (1 if i % 2 else -0.4)
        tilt = 0.006 * math.sin(i * 1.3)
        sections.append((y, rx * bump, rz * bump, zc + tilt, 2.3))
    sections.append((0.142, 0.014, 0.016, -0.016, 2.0))
    b.loft(sections, region=0, around=16 if HI else 10)
    for s in (1, -1):
        b.cyl((s * 0.043, 0.026, 0.118), "z", 0.029, 0.026, 1, 14, r2=0.026)    # the goggles' dark cups
        b.cyl((s * 0.043, 0.026, 0.132), "z", 0.021, 0.004, 1, 12)               # and their lenses
    # the mouth's grille: a tube of metal with ribs
    b.cyl((0, -0.05, 0.122), "z", 0.014, 0.04, 2, 12)
    for k in range(4):
        b.cyl((0, -0.05, 0.112 + k * 0.01), "z", 0.0175, 0.004, 2, 12)
    # a wrap at the neck
    b.loft([(-0.128, 0.056, 0.062, 0.004, 2.2), (-0.108, 0.064, 0.070, 0.004, 2.2)], region=0)
    return b.finish()

# ---- A rebreather ----------------------------------------------------------------------------------------------------------------------------
def mask_rebreather(head):
    b = Build("mask_rebreather")
    b.patch(head, -0.050, 0.050, -0.078, -0.004, 18 if HI else 10, 14 if HI else 8, 0.0085, 0)
    for s in (1, -1):
        b.cyl((s * 0.056, -0.040, 0.092), "z", 0.019, 0.026, 1, 12)
        b.cyl((s * 0.056, -0.040, 0.108), "z", 0.012, 0.008, 1, 10)
        b.tube([(s * 0.060, -0.040, 0.082), (s * 0.085, -0.032, 0.060), (s * 0.104, -0.012, 0.020), (s * 0.108, 0.002, -0.020)], 0.0055, 1, 5)
        b.tube([(s * 0.050, -0.058, 0.080), (s * 0.082, -0.050, 0.052), (s * 0.104, -0.030, 0.010)], 0.0035, 1, 4)
    b.box((0, -0.060, 0.110), (0.05, 0.012, 0.012), 1)
    return b.finish()

# ---- A bone mask -----------------------------------------------------------------------------------------------------------------------------
def mask_bone(head):
    b = Build("mask_bone")
    def hole(x, y):
        ax = abs(x)
        return (math.hypot(ax - 0.040, y - 0.016) < 0.0185) or (abs(x) < 0.011 and -0.026 < y < 0.002 and abs(x) < (y + 0.026) * 0.45 + 0.002)
    b.patch(head, -0.074, 0.074, -0.060, 0.082, 34 if HI else 18, 28 if HI else 14, 0.0075, 0, skip=hole)
    # (a brow ridge and cheekbones in relief, and the teeth)
    b.box((0, 0.047, 0.1), (0.12, 0.012, 0.014), 0)
    for k in range(-4, 5):
        h = 0.010 if k % 2 == 0 else 0.008
        b.box((k * 0.0085, -0.062, 0.108), (0.0072, h, 0.006), 0)
    return b.finish()

# ---- Goggles ---------------------------------------------------------------------------------------------------------------------------------
def mask_goggles():
    b = Build("mask_goggles")
    b.loft([(0.008, 0.106, 0.1175, 0.0, 2.2), (0.032, 0.106, 0.1175, 0.0, 2.2)], region=0, around=24 if HI else 14)
    for s in (1, -1):
        b.cyl((s * 0.042, 0.02, 0.106), "z", 0.028, 0.024, 1, 14, r2=0.025)
        b.cyl((s * 0.042, 0.02, 0.119), "z", 0.0215, 0.004, 2, 12)
    b.box((0, 0.022, 0.108), (0.03, 0.012, 0.01), 1)     # the bridge
    return b.finish()

# ---- Head-tails: a Twi'lek's lekku and a Togruta's montrals ---------------------------------------------------------------------------------
def tail(name, points, radius, ridges=0.0, rings=36):
    b = Build(name)
    b.tube(points, lambda t: radius * (1 - 0.6 * t) * (1 + ridges * math.sin(t * rings)), 0, 8 if HI else 5)
    return b.finish()

def tails():
    # (the left one of a pair; the code mirrors it. The montral at the back is one, on the middle)
    return [
        tail("lekku", [(0.05, 0.01, -0.07), (0.07, -0.12, -0.14), (0.06, -0.30, -0.16), (0.05, -0.44, -0.13)], 0.045, 0.05),
        tail("montral_top", [(0.06, 0.07, 0.0), (0.10, 0.17, -0.02), (0.085, 0.27, -0.08)], 0.040, 0.03, 30),
        tail("montral_side", [(0.08, -0.02, 0.02), (0.11, -0.16, 0.06), (0.10, -0.30, 0.07)], 0.036, 0.03, 30),
        tail("montral_back", [(0.0, 0.0, -0.08), (0.0, -0.14, -0.15), (0.0, -0.30, -0.16)], 0.036, 0.03, 30),
    ]

def all_gear(head):
    return [machine_head(), mask_wraps(), mask_rebreather(head), mask_bone(head), mask_goggles()] + tails()
