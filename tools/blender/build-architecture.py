# The architecture kit of the local map (2026-11-05; the user: "the buildings and rooms we have in game are all very similar in shape and appearance ... kit pieces in Mixar").
# A building the player walks round was one rounded footprint pushed up into a box with a slab roof (models.tsx RoomBlock) whose look came from five values (`styleOf`):
# the silhouette was the same on every world. These are what stands on the roof (crowns), what frames a way in (portals) and what stands against a wall (reliefs), for
# seven families of building (tools/refs/architecture.md): adobe (Tatooine), domed (Naboo, Jedha), deco (Coruscant), polar (Hoth), timber (Endor, Kashyyyk), hull
# (Kamino, Bespin, stations) and bunker (Mustafar, Utapau, the barren worlds).
#   blender --background --python tools/blender/build-architecture.py -- <out-dir> [--only a,b] [--preview <dir>]
# writes <out-dir>/architecture.glb and shared/art/architectureKit.json (a full run). Meshes `crown_<family>`, `portal_<family>`, `relief_<name>`, `_REGION` per vertex:
#   0 body (takes the wall's colour and texture), 1 trim (darker: bands, rings, frames, metal), 2 glow (lit strips, lamps), 3 dark (glass, slits, the void of an opening), 4 timber and thatch
# and `_AO` per vertex. The code's axes (y up, +z the front); a crown's origin is the middle of its base, a portal's the middle of its sill on the wall's outside face
# (the wall's thickness runs along -z, the way in is 1.0 wide and 1.42 high, as models.tsx DOOR_W and DOOR_H). Original shapes: CC0.
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P, occlusion

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
PREVIEW = arg("--preview")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DOOR_W, DOOR_H = 1.0, 1.42

class Piece:
    """a mesh of lathes, boxes, cylinders and frames, each vertex with its region; normals are made to face out when it is finished"""
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.region = self.bm.verts.layers.float.new("_REGION")

    def v(self, p, region):
        v = self.bm.verts.new(P(*p))
        v[self.region] = float(region)
        return v

    def face(self, vs):
        try:
            self.bm.faces.new(vs)
        except ValueError:
            pass

    def lathe(self, profile, seg=24, region=0, at=(0, 0, 0), scale=(1, 1), cap=True):
        """a turned shape: (radius, height) pairs from the foot up, about the y axis through `at`; the ends are closed on the axis"""
        rings = []
        for r, y in profile:
            rings.append([self.v((at[0] + math.cos(2 * math.pi * i / seg) * r * scale[0], at[1] + y, at[2] + math.sin(2 * math.pi * i / seg) * r * scale[1]), region) for i in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                self.face([a[i], a[j], b[j], b[i]])
        if cap:
            for ring, (r, y) in ((rings[0], profile[0]), (rings[-1], profile[-1])):
                c = self.v((at[0], at[1] + y, at[2]), region)
                for i in range(seg):
                    self.face([ring[i], ring[(i + 1) % seg], c])

    def box(self, c, size, region=0, top=None):
        """a box about c; `top` = (sx, sz) makes the top that size (a frustum: a buttress, a tier)"""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        tx, tz = (sx, sz) if top is None else (top[0] / 2, top[1] / 2)
        pts = {}
        for dx in (-1, 1):
            for dy in (-1, 1):
                for dz in (-1, 1):
                    kx, kz = (sx, sz) if dy < 0 else (tx, tz)
                    pts[(dx, dy, dz)] = self.v((c[0] + dx * kx, c[1] + dy * sy, c[2] + dz * kz), region)
        for quad in (((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)),
                     ((-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)), ((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)),
                     ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1))):
            self.face([pts[q] for q in quad])

    def cyl(self, c, axis, r, h, region=0, seg=10, r2=None):
        """a cylinder (a cone to `r2`) along 'x', 'y' or 'z' about c, h long"""
        r2 = r if r2 is None else r2
        def at(t, a):
            q = r + (r2 - r) * (t + 0.5)
            u, w = math.cos(a) * q, math.sin(a) * q
            return {"x": (c[0] + t * h, c[1] + u, c[2] + w), "y": (c[0] + u, c[1] + t * h, c[2] + w), "z": (c[0] + u, c[1] + w, c[2] + t * h)}[axis]
        ra = [self.v(at(-0.5, 2 * math.pi * i / seg), region) for i in range(seg)]
        rb = [self.v(at(0.5, 2 * math.pi * i / seg), region) for i in range(seg)]
        ext = {"x": (0.5 * h, 0, 0), "y": (0, 0.5 * h, 0), "z": (0, 0, 0.5 * h)}[axis]
        ca, cb = self.v((c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]), region), self.v((c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]), region)
        for i in range(seg):
            j = (i + 1) % seg
            self.face([ra[i], ra[j], rb[j], rb[i]])
            self.face([ra[j], ra[i], ca])
            self.face([rb[i], rb[j], cb])

    def strip(self, outer, inner, z0, z1, region=0):
        """a frame: two open outlines (the same number of points, from the left foot over the top to the right foot) pushed from z0 to z1: its two faces, its edge and its reveal"""
        n = len(outer)
        of = [self.v((x, y, z1), region) for x, y in outer]
        ob = [self.v((x, y, z0), region) for x, y in outer]
        inf = [self.v((x, y, z1), region) for x, y in inner]
        inb = [self.v((x, y, z0), region) for x, y in inner]
        for i in range(n - 1):
            self.face([of[i], of[i + 1], inf[i + 1], inf[i]])      # front
            self.face([ob[i + 1], ob[i], inb[i], inb[i + 1]])      # back
            self.face([ob[i], ob[i + 1], of[i + 1], of[i]])        # outer edge
            self.face([inf[i], inf[i + 1], inb[i + 1], inb[i]])    # reveal
        # the feet: close the two ends so that the frame is a solid
        self.face([ob[0], of[0], inf[0], inb[0]])
        self.face([of[-1], ob[-1], inb[-1], inf[-1]])

    # ---- Lean pieces (2026-11-05, second pass: the same look for about a third of the triangles). Faces are wound to face a given way (`toward`) so that
    # open surfaces (a band against a wall, a deck with nothing under its ends, a post with no caps) need no hidden faces; `finish` recomputes normals only
    # for closed solids. Curves are fewer-sided and smooth-shaded (`smooth`: edges sharper than that angle stay hard), which the exported normals carry
    # into the game (models.tsx Kit.add keeps a part's normals).
    def toward(self, vs, want):
        """a face of vs, wound so that its normal points along `want` (the code's axes)"""
        n = Vector((0.0, 0.0, 0.0))
        for i, a in enumerate(vs):
            b = vs[(i + 1) % len(vs)]
            n.x += (a.co.y - b.co.y) * (a.co.z + b.co.z)
            n.y += (a.co.z - b.co.z) * (a.co.x + b.co.x)
            n.z += (a.co.x - b.co.x) * (a.co.y + b.co.y)
        self.face(vs if n.dot(P(*want)) >= 0 else list(reversed(vs)))

    def ring_profile(self, profile, seg, region=0, a0=0.0, a1=2 * math.pi):
        """an open profile of (radius, height) points swept round the y axis from a0 to a1; each stretch faces the right-hand side of the way it runs
        (list a solid's outline from its foot up its outside: walls face out, undersides down, tops up). No ends, no caps"""
        full = abs((a1 - a0) - 2 * math.pi) < 1e-6
        n = seg if full else seg + 1
        rings = [[self.v((r * math.cos(a0 + (a1 - a0) * i / seg), y, r * math.sin(a0 + (a1 - a0) * i / seg)), region) for i in range(n)] for r, y in profile]
        for k in range(len(profile) - 1):
            (ra, ya), (rb, yb) = profile[k], profile[k + 1]
            nr, ny = yb - ya, -(rb - ra)
            for i in range(seg):
                j = (i + 1) % n
                a = a0 + (a1 - a0) * (i + 0.5) / seg
                self.toward([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], (nr * math.cos(a), ny, nr * math.sin(a)))

    def lathe_runs(self, pts, seg, a0=0.0, a1=2 * math.pi):
        """ring_profile with a region for each stretch (the stretch from point k to k+1 takes pts[k]'s region); where the region changes the outline is
        started again a hair apart, so the two colours do not share vertices"""
        run, reg = [pts[0][:2]], pts[0][2]
        for k in range(1, len(pts)):
            r, y, g = pts[k]
            run.append((r, y))
            if k == len(pts) - 1 or g != reg:
                self.ring_profile(run, seg, reg, a0, a1)
                run, reg = [(r, y + 3e-4)], g

    def hexa(self, c8, region=0, skip=""):
        """a solid of eight corners: the foot's four in order round, then the top's four in the same order. `skip` leaves faces out:
        'b' the foot, 't' the top, '0'..'3' the sides (side i runs from corner i to corner i+1)"""
        vs = [self.v(p, region) for p in c8]
        mid = Vector([sum(p[i] for p in c8) / 8 for i in range(3)])
        def put(face, name):
            if name in skip:
                return
            c = Vector([sum(Vector(c8[q])[i] for q in face) / len(face) for i in range(3)])
            self.toward([vs[q] for q in face], tuple(c - mid))
        put([0, 1, 2, 3], "b")
        put([4, 5, 6, 7], "t")
        for i in range(4):
            j = (i + 1) % 4
            put([i, j, j + 4, i + 4], str(i))

    def bx(self, c, size, region=0, skip=""):
        """a box about c (x, y, z sizes); `skip` as hexa: 'b' foot, 't' top, '0' the -z face, '1' the +x, '2' the +z, '3' the -x"""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        foot = [(c[0] - sx, c[1] - sy, c[2] - sz), (c[0] + sx, c[1] - sy, c[2] - sz), (c[0] + sx, c[1] - sy, c[2] + sz), (c[0] - sx, c[1] - sy, c[2] + sz)]
        self.hexa(foot + [(x, y + 2 * sy, z) for x, y, z in foot], region, skip)

    def rbox(self, a, r0, r1, y0, y1, w, region=0, r1_top=None, w_top=None, skip=""):
        """a block standing on a curve: at angle a, from radius r0 out to r1 (r1_top at its top: a batter), w wide along the curve.
        `skip`: 'b' foot, 't' top, '1' the outer face, '3' the back (against the wall), '0' and '2' the sides"""
        c, s = math.cos(a), math.sin(a)
        def at(r, t, y):
            return (r * c - t * s, y, r * s + t * c)
        rt = r1 if r1_top is None else r1_top
        wt = w if w_top is None else w_top
        self.hexa([at(r0, -w / 2, y0), at(r1, -w / 2, y0), at(r1, w / 2, y0), at(r0, w / 2, y0),
                   at(r0, -wt / 2, y1), at(rt, -wt / 2, y1), at(rt, wt / 2, y1), at(r0, wt / 2, y1)], region, skip)

    def rod(self, a, b, r, region=0, seg=4, caps=False, r2=None):
        """a bar from the point a to the point b: seg sides (3 or 4 for a post, a rail, a strut; 6 for a round limb), open ends unless `caps`;
        `r2` tapers it to that radius at b"""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = d.cross(u)
        dirs = [u * math.cos(2 * math.pi * (i + 0.5) / seg) + w * math.sin(2 * math.pi * (i + 0.5) / seg) for i in range(seg)]
        ra = [self.v(tuple(a + q * r), region) for q in dirs]
        rb = [self.v(tuple(b + q * (r if r2 is None else r2)), region) for q in dirs]
        for i in range(seg):
            j = (i + 1) % seg
            self.toward([ra[i], ra[j], rb[j], rb[i]], tuple(dirs[i] + dirs[j]))
        if caps:
            self.toward(ra, tuple(-d))
            self.toward(rb, tuple(d))

    def quad(self, pts, region=0, want=(0, 0, 1)):
        self.toward([self.v(p, region) for p in pts], want)

    def bend(self, R):
        """wraps what is built so far round a wall of radius R: x along the wall becomes an angle, z stays the distance out from it
        (the origin stays on the wall's outer face; the wall's centre is at z = -R)"""
        for v in self.bm.verts:
            x, z = v.co.x, -v.co.y                       # back to the code's x and z (shape.P)
            t = x / R
            v.co.x = (R + z) * math.sin(t)
            v.co.y = -((R + z) * math.cos(t) - R)

    def shear(self, length, rise):
        """lifts what is built so far by `rise` over `length` along +z (a ramp); uprights stay upright"""
        for v in self.bm.verts:
            v.co.z += rise * (-v.co.y) / length

    def wall_panel(self, R, a_mid, width, y0, y1, hole=None, notch=None, cols=4, thick=0.2, region=0, reveal=1, off=None):
        """a piece of round wall (radius R, centred at angle a_mid, `width` along the curve, from y0 to y1, `thick` deep inward) with its opening CUT
        OUT: `hole` a closed outline (a window) or `notch` an open one from its left foot on the floor over to its right foot (a door), in the wall's
        own x (along it, about its middle) and y. Front and back faces and the opening's reveal; the panel's own edges meet the next panel, the floor
        and the roof, so they are left open"""
        from mathutils.geometry import tessellate_polygon
        L = width / 2
        def edge(a, b, n):
            return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
        bl, br, tr, tl = (-L, y0), (L, y0), (L, y1), (-L, y1)
        if notch:
            loop = edge(bl, (notch[0][0], y0), 1) + list(notch[:-1]) + edge((notch[-1][0], y0), br, 1) + edge(br, tr, 2) + edge(tr, tl, cols) + edge(tl, bl, 2)
            loops = [loop]
        else:
            loops = [edge(bl, br, cols) + edge(br, tr, 2) + edge(tr, tl, cols) + edge(tl, bl, 2)] + ([list(hole)] if hole else [])
        flat = [p for l in loops for p in l]
        tris = tessellate_polygon([[(x, y, 0.0) for x, y in l] for l in loops])
        def at(x, y, z):
            a = a_mid - x / R
            r = R + z + (off(y) if off else 0.0)
            return (r * math.cos(a), y, r * math.sin(a))
        for z, side in ((0.0, 1), (-thick, -1)):
            vs = [self.v(at(x, y, z), region) for x, y in flat]
            for t in tris:
                xm = sum(flat[i][0] for i in t) / 3
                a = a_mid - xm / R
                self.toward([vs[i] for i in t], (side * math.cos(a), 0, side * math.sin(a)))
        rim = notch if notch else hole
        if rim:
            cx = sum(p[0] for p in rim) / len(rim)
            cy = sum(p[1] for p in rim) / len(rim)
            pairs = zip(rim, rim[1:]) if notch else zip(rim, rim[1:] + rim[:1])
            for (xa, ya), (xb, yb) in pairs:
                mx, my = (xa + xb) / 2, (ya + yb) / 2
                f = [self.v(at(xa, ya, 0.0), reveal), self.v(at(xb, yb, 0.0), reveal), self.v(at(xb, yb, -thick), reveal), self.v(at(xa, ya, -thick), reveal)]
                a = a_mid - mx / R
                # (toward the middle of the opening, along the wall: its x runs the other way to the angle)
                tx, ty = cx - mx, cy - my
                self.toward(f, (tx * math.sin(a), ty, -tx * math.cos(a)))

    def recentre(self, R):
        """moves what `bend` built so that the circle's centre is the origin (the wall's face is then at z = R, the front)"""
        for v in self.bm.verts:
            v.co.y -= R

    def finish(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        # (normals are made to face out on each closed solid; an open surface keeps the way it was wound)
        seen = set()
        for f in bm.faces:
            if f in seen:
                continue
            island, stack = [], [f]
            seen.add(f)
            while stack:
                g = stack.pop()
                island.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h not in seen:
                            seen.add(h)
                            stack.append(h)
            if all(len(e.link_faces) == 2 for g in island for e in g.edges):
                bmesh.ops.recalc_face_normals(bm, faces=island)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        smooth = getattr(self, "smooth", None)
        for poly in me.polygons:
            poly.use_smooth = bool(smooth)
        if smooth:
            try:
                me.set_sharp_from_angle(angle=math.radians(smooth))
            except Exception as e:
                print("smooth", self.name, e)
        ao = me.attributes.new("_AO", "FLOAT", "POINT")
        res = occlusion([(ob, Matrix.Identity(4))], 24)
        for i, val in enumerate(next(iter(res.values()))):
            ao.data[i].value = val
        return ob

# ---- Outlines of a way in: from the left foot over the top to the right foot -------------------------------------------------------------------------
def outline(w, h, kind):
    """the open outline of a door or a frame w wide and h high: round, horseshoe, pointed, square or deco. A kind always has the same number of points,
    so that an outer and an inner outline of one kind pair up point for point"""
    if kind == "square":
        return [(-w / 2, 0.0), (-w / 2, h), (w / 2, h), (w / 2, 0.0)]
    if kind == "deco":
        k = 0.2 * w
        return [(-w / 2, 0.0), (-w / 2, h - k), (-w / 2 + k, h), (w / 2 - k, h), (w / 2, h - k), (w / 2, 0.0)]
    if kind == "pointed":
        # two arcs of radius 0.92 w meeting at the apex
        R = w * 0.92
        cx = -w / 2 + R
        t_apex = math.acos(-cx / R)
        spring = h - R * math.sin(t_apex)
        left = [(cx - R * 0 + R * math.cos(t), spring + R * math.sin(t)) for t in [math.pi + (t_apex - math.pi) * i / 7 for i in range(0, 8)]]
        right = [(-x, y) for x, y in reversed(left[:-1])]
        return [(-w / 2, 0.0)] + left + right + [(w / 2, 0.0)]
    # round and a horseshoe: a circle over the springing (the horseshoe goes on a little below it)
    r = w / 2 * (1.12 if kind == "horseshoe" else 1.0)
    s = math.sqrt(max(0.0, r * r - (w / 2) ** 2))
    gamma = math.atan2(s, w / 2)
    spring = h - r
    t0, t1 = math.pi + gamma, -gamma
    curve = [(r * math.cos(t0 + (t1 - t0) * i / 14), spring + r * math.sin(t0 + (t1 - t0) * i / 14)) for i in range(0, 15)]
    return [(-w / 2, 0.0)] + curve + [(w / 2, 0.0)]

# ---- Crowns: what stands on a roof ----------------------------------------------------------------------------------------------------------------
def crown_adobe():
    p = Piece("crown_adobe")
    p.smooth = 45
    # a low dome of sun-dried brick with an oculus lantern, the beam ends (vigas) standing out round its foot, a parapet lip
    p.lathe([(1.05, 0), (1.05, 0.1), (1.0, 0.13), (0.97, 0.14), (0.9, 0.3), (0.72, 0.46), (0.45, 0.56), (0.2, 0.6), (0.0, 0.6)], 16, 0)
    p.lathe([(1.07, 0.1), (1.07, 0.16), (1.0, 0.16)], 16, 1, cap=False)
    for i in range(10):
        a = 2 * math.pi * i / 10
        beam = ((math.cos(a) * 1.04, 0.07, math.sin(a) * 1.04))
        p.box(beam, (0.1 if abs(math.cos(a)) > 0.5 else 0.06, 0.06, 0.1 if abs(math.sin(a)) > 0.5 else 0.06), 4)
    p.cyl((0, 0.66, 0), "y", 0.17, 0.12, 1, 8)
    p.cyl((0, 0.7, 0), "y", 0.1, 0.06, 3, 8)
    return p

def crown_domed():
    p = Piece("crown_domed")
    p.smooth = 40
    # a drum, an onion dome with a collar, a finial with a crescent
    p.lathe([(0.9, 0), (0.9, 0.34)], 16, 0)
    p.lathe([(0.96, 0.32), (0.96, 0.4), (0.9, 0.4)], 16, 1, cap=False)
    p.lathe([(0.92, 0.4), (1.04, 0.52), (1.08, 0.72), (0.98, 0.96), (0.72, 1.2), (0.42, 1.44), (0.18, 1.7), (0.07, 1.95), (0.0, 2.05)], 16, 0)
    for i in range(8):
        a = 2 * math.pi * i / 8
        p.box((math.cos(a) * 0.95, 0.62, math.sin(a) * 0.95), (0.07, 0.44, 0.07), 1)
    p.lathe([(0.1, 2.0), (0.1, 2.06), (0.05, 2.1), (0.0, 2.7)], 6, 1)
    p.lathe([(0.0, 2.2), (0.16, 2.3), (0.0, 2.4)], 8, 1, at=(0, 0.0, 0), scale=(1, 0.18))
    return p

def crown_minaret():
    p = Piece("crown_minaret")
    p.smooth = 40
    p.box((0, 0.2, 0), (0.7, 0.4, 0.7), 0, top=(0.5, 0.5))
    p.lathe([(0.22, 0.4), (0.2, 1.4), (0.17, 2.5)], 10, 0)
    for y in (1.75, 2.35):
        p.lathe([(0.34, y), (0.34, y + 0.07), (0.2, y + 0.07)], 10, 1, cap=False)
        for i in range(8):
            a = 2 * math.pi * i / 8
            p.rod((math.cos(a) * 0.32, y + 0.07, math.sin(a) * 0.32), (math.cos(a) * 0.32, y + 0.2, math.sin(a) * 0.32), 0.014, 1, 3)
        p.lathe([(0.34, y + 0.2), (0.34, y + 0.22)], 10, 1, cap=False)
    p.lathe([(0.24, 2.5), (0.22, 2.58), (0.17, 2.7), (0.0, 3.35)], 10, 1)
    p.lathe([(0.04, 3.3), (0.04, 3.6)], 5, 1)
    return p

def crown_deco():
    p = Piece("crown_deco")
    # a stepped crown: three setbacks with lit bands, vertical fins at the corners, a spire
    p.box((0, 0.25, 0), (1.7, 0.5, 1.7), 0)
    p.box((0, 0.76, 0), (1.2, 0.52, 1.2), 0)
    p.box((0, 1.34, 0), (0.7, 0.64, 0.7), 0)
    for y, w in ((0.5, 1.74), (1.02, 1.24)):
        p.box((0, y, 0), (w, 0.05, w), 2)
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.box((sx * 0.84, 0.45, sz * 0.84), (0.08, 0.9, 0.08), 1, top=(0.04, 0.04))
            p.box((sx * 0.32, 1.3, sz * 0.32), (0.07, 0.8, 0.07), 1, top=(0.03, 0.03))
    p.lathe([(0.1, 1.66), (0.07, 2.0), (0.03, 2.8), (0.0, 2.9)], 8, 1)
    p.box((0, 2.2, 0), (0.22, 0.05, 0.22), 1)
    p.box((0, 2.45, 0), (0.16, 0.04, 0.16), 1)
    return p

def crown_polar():
    p = Piece("crown_polar")
    # a drift of snow over a sloped roof, an insulated hatch with a flat lid, an antenna with a dish
    p.lathe([(1.1, 0), (1.05, 0.1), (0.85, 0.24), (0.55, 0.32), (0.0, 0.34)], 28, 0, scale=(1, 0.85))
    p.cyl((0.35, 0.5, 0.1), "y", 0.28, 0.34, 1, 14)
    p.cyl((0.35, 0.68, 0.1), "y", 0.31, 0.05, 1, 14)
    p.box((0.35, 0.57, 0.38), (0.2, 0.12, 0.04), 3)
    p.cyl((-0.45, 0.8, -0.2), "y", 0.025, 1.0, 1, 6)
    p.lathe([(0.0, 0.0), (0.16, 0.06), (0.2, 0.12)], 14, 1, at=(-0.45, 1.2, -0.2), cap=False)
    p.cyl((-0.45, 1.32, -0.2), "y", 0.012, 0.18, 1, 5)
    return p

def crown_timber():
    p = Piece("crown_timber")
    # a steep thatched cone with overhanging eaves, lashed in rings, a ridge pole through its tip
    p.lathe([(1.3, 0), (1.28, 0.06), (1.0, 0.3), (0.62, 0.62), (0.28, 0.92), (0.1, 1.12), (0.0, 1.16)], 20, 4)
    for y, r in ((0.2, 1.1), (0.46, 0.8), (0.74, 0.46)):
        p.lathe([(r, y), (r + 0.04, y + 0.03), (r, y + 0.06)], 20, 1, cap=False)
    p.cyl((0, 1.38, 0), "y", 0.035, 0.52, 4, 6)
    p.cyl((0, 1.5, 0), "x", 0.02, 0.4, 4, 6)
    return p

def crown_hull():
    p = Piece("crown_hull")
    p.smooth = 40
    # a smooth pressure blister with an equator ring, a sensor eye and a fin
    p.lathe([(1.05, 0), (1.06, 0.1), (0.98, 0.34), (0.74, 0.58), (0.4, 0.72), (0.0, 0.76)], 18, 0)
    p.lathe([(1.08, 0.12), (1.1, 0.18), (1.08, 0.24), (1.02, 0.24), (1.0, 0.12)], 18, 1, cap=False)
    p.cyl((0.0, 0.6, 0.55), "z", 0.12, 0.1, 2, 10)
    p.cyl((0.0, 0.6, 0.6), "z", 0.07, 0.04, 3, 8)
    p.box((0, 0.98, -0.1), (0.04, 0.5, 0.7), 1, top=(0.04, 0.2))
    return p

def crown_bunker():
    p = Piece("crown_bunker")
    # a ribbed slab with two vent stacks and a gun block with its slit
    p.box((0, 0.12, 0), (1.9, 0.24, 1.5), 0)
    for i in range(5):
        p.box((-0.72 + i * 0.36, 0.28, 0), (0.12, 0.1, 1.5), 1)
    for x in (-0.55, 0.62):
        p.cyl((x, 0.5, -0.4), "y", 0.15, 0.52, 1, 12)
        p.cyl((x, 0.8, -0.4), "y", 0.19, 0.06, 1, 12, r2=0.15)
    p.box((0.1, 0.42, 0.35), (0.7, 0.34, 0.5), 0, top=(0.56, 0.38))
    p.box((0.1, 0.46, 0.6), (0.44, 0.07, 0.04), 3)
    return p

# ---- Portals: what frames a way in. Outer sizes are about 1.6 x 2.1 round the 1.0 x 1.42 way ------------------------------------------------------------
def portal(name, kind, outer_w, outer_h, depth, region=0):
    p = Piece(name)
    inner = outline(DOOR_W + 0.02, DOOR_H + 0.04 if kind in ("round", "horseshoe", "pointed") else DOOR_H, kind)
    outer = outline(outer_w, outer_h, kind)
    p.strip(outer, inner, -depth, 0.0, region)
    return p

def portal_adobe():
    p = portal("portal_adobe", "horseshoe", 1.55, 1.98, 0.3)
    # three beam ends over the lintel
    for x in (-0.42, 0, 0.42):
        p.cyl((x, 2.02, -0.1), "z", 0.04, 0.34, 4, 6)
    p.box((0, 0.025, -0.1), (1.1, 0.05, 0.36), 1)
    return p

def portal_domed():
    p = portal("portal_domed", "pointed", 1.7, 2.3, 0.24)
    for x in (-0.72, 0.72):
        p.cyl((x, 0.7, 0.04), "y", 0.07, 1.4, 1, 10)
        p.lathe([(0.09, 1.4), (0.11, 1.44), (0.09, 1.48)], 10, 1, at=(x, 0, 0.04), cap=True)
        p.cyl((x, 0.04, 0.04), "y", 0.1, 0.08, 1, 10)
    p.box((0, 2.32, 0.02), (0.1, 0.12, 0.16), 1)
    p.box((0, 0.03, 0.04), (1.2, 0.06, 0.3), 1)
    return p

def portal_deco():
    p = portal("portal_deco", "deco", 1.7, 2.1, 0.28)
    p.strip(outline(1.46, 1.8, "deco"), outline(1.04, 1.45, "deco"), -0.2, 0.1, 1)
    p.box((0, 2.02, 0.12), (1.9, 0.08, 0.5), 1)
    p.box((0, 1.95, 0.12), (1.5, 0.03, 0.4), 2)
    return p

def portal_polar():
    p = portal("portal_polar", "square", 1.4, 1.72, 0.32, 1)
    for i in range(6):
        for sx in (-1, 1):
            p.cyl((sx * 0.62, 0.15 + i * 0.27, 0.02), "z", 0.03, 0.05, 1, 6)
    p.box((0, 1.8, 0.0), (0.3, 0.1, 0.12), 2)
    p.box((0, 0.02, 0.0), (1.3, 0.04, 0.4), 0)
    return p

def portal_timber():
    p = Piece("portal_timber")
    for x in (-0.62, 0.62):
        p.box((x, 0.78, -0.05), (0.14, 1.56, 0.16), 4)
    p.box((0, 1.6, -0.05), (1.5, 0.14, 0.18), 4)
    p.box((0, 1.82, 0.0), (1.9, 0.07, 0.8), 4, top=(1.9, 0.5))
    for x in (-0.62, 0.62):
        p.cyl((x, 1.6, 0.06), "z", 0.05, 0.05, 1, 6)
    return p

def portal_hull():
    p = portal("portal_hull", "round", 1.5, 1.9, 0.26, 1)
    for i in range(8):
        a = math.pi * (i + 0.5) / 8
        p.cyl((math.cos(a) * 0.66, 1.18 + math.sin(a) * 0.66, 0.01), "z", 0.026, 0.04, 1, 6)
    p.cyl((0, 1.94, 0.0), "z", 0.06, 0.08, 2, 10)
    return p

# ---- Reliefs: what stands against a wall (unit height or length; the code scales them) -----------------------------------------------------------------
def relief_buttress():
    p = Piece("relief_buttress")
    p.box((0, 0.5, 0), (0.34, 1.0, 0.5), 0, top=(0.2, 0.18))
    p.box((0, 1.02, 0), (0.28, 0.05, 0.26), 1)
    return p

def relief_fin():
    p = Piece("relief_fin")
    p.box((0, 0.5, 0), (0.14, 1.0, 0.16), 1, top=(0.06, 0.06))
    return p

def relief_beams():
    p = Piece("relief_beams")
    for i in range(5):
        p.cyl((-0.4 + i * 0.2, 0.0, 0.1), "z", 0.04, 0.3, 4, 6)
    return p

# ---- Round massing, gantries and bridges (2026-11-05; the user: "much of star wars architecture is circular ... a central hub in a wheel and spoke pattern
# with exterior walkways/catwalks/gantries joining relevant buildings and rooms at a variety of levels"). Built for a round room of radius 4 (eight squares
# across); the planner's other radii get their own copies (`_r3`, `_r5`) once the sizes are settled: scaling a curve would also scale a deck's width (GANTRY 2).
# A storey is 3.4 (LocalMap LEVEL_H). Origins: a drum's and a gantry arc's at the circle's centre at floor (deck) level, a curved portal's at the middle of its
# sill on the wall's outer face, a span's at the middle of its near end at deck level, a pylon's at its foot.
R4 = 4.0
STOREY = 3.4
# a gate in a gantry's rail: half its width at the outer edge (a bridge is two squares wide); a ramp round a room is six segments of 22.5 degrees a storey
GATE_HALF = 1.1
RAMP_SEG = math.pi / 8
RAMP_STEPS = 6

def drum_adobe_r4():
    """a battered sun-dried drum (Tatooine): the wall leans in as it rises, a rounded lip, the beam ends of the roof standing out under it, deep small windows"""
    p = Piece("drum_adobe_r4")
    p.smooth = 50
    p.ring_profile([(R4 + 0.32, 0), (R4 + 0.32, 0.08), (R4 + 0.16, 1.2), (R4 + 0.02, 2.6), (R4 - 0.02, 3.0), (R4 + 0.04, 3.06), (R4 + 0.04, 3.22), (R4 - 0.28, 3.24), (0.0, 3.24)], 20, 0)
    for i in range(16):
        p.rbox(2 * math.pi * (i + 0.5) / 16, R4 - 0.05, R4 + 0.36, 2.7, 2.84, 0.12, 4, skip="3")
    # (no windows painted on: an opening is cut through a wall, never laid over it)
    return p

def tiers_r4():
    """a stepped tower of setbacks over a round room (Theed's and Coruscant's towers): three drums, each smaller, trimmed and lit at the steps, fins on the first.
    One outline from the foot to the tip, its trims and lit bands cut into it rather than laid over it"""
    p = Piece("tiers_r4")
    p.smooth = 40
    p.lathe_runs([(R4, 0, 0), (R4, 2.5, 1), (R4 + 0.17, 2.5, 1), (R4 + 0.17, 2.82, 0), (3.2, 2.82, 0), (3.2, 3.6, 2), (3.2, 3.76, 0), (3.2, 4.72, 1),
                  (3.34, 4.72, 1), (3.34, 4.97, 0), (2.4, 4.97, 0), (2.4, 5.6, 2), (2.4, 5.74, 0), (2.4, 6.42, 1), (2.52, 6.42, 1), (2.52, 6.62, 0),
                  (1.6, 6.62, 0), (1.4, 7.1, 0), (0.9, 7.4, 0), (0.0, 7.55, 0)], 20)
    for i in range(8):
        p.rbox(2 * math.pi * (i + 0.5) / 8, R4, R4 + 0.26, 0.0, 2.5, 0.12, 1, r1_top=R4 + 0.05, skip="b3")
    return p

def portal_curved_r4():
    """the hull family's hatch ring bent to a round wall of radius 4, so a round building's way in has a frame too (the flat portals stood off the curve);
    origin at the circle's centre like the bays, its frame round the door bay's hole"""
    p = portal("portal_curved_r4", "round", 1.36, 1.9, 0.26, 1)
    p.bx((0, 1.94, 0.0), (0.16, 0.1, 0.08), 2, skip="0")
    p.bx((0, 0.025, -0.05), (1.2, 0.05, 0.42), 1, skip="b")
    p.bend(R4)
    p.recentre(R4)
    return p

def span(name, length, rise, bays):
    """a bridge deck two squares wide along +z, `length` long, rising `rise` over it: rails on posts, fascias with a lit strip, a truss under it.
    Its ends are open (they meet a gantry, a roof or the next span)"""
    p = Piece(name)
    h = length / 2
    p.bx((0, -0.09, h), (1.84, 0.18, length), 0, skip="0123")
    for sx in (-1, 1):
        side = "3" if sx > 0 else "1"
        p.bx((sx * 0.96, -0.13, h), (0.08, 0.38, length), 1, skip="02")
        p.quad([(sx * 1.001, -0.31, 0), (sx * 1.001, -0.31, length), (sx * 1.001, -0.25, length), (sx * 1.001, -0.25, 0)], 2, (sx, 0, 0))
        p.bx((sx * 0.92, 0.99, h), (0.06, 0.05, length), 1, skip="b02")
        p.bx((sx * 0.7, -0.5, h), (0.12, 0.12, length), 1, skip="02")
        for i in range(bays):
            z0, z1 = i * length / bays, (i + 1) * length / bays
            p.rod((sx * 0.92, 0.06, (z0 + z1) / 2), (sx * 0.92, 0.965, (z0 + z1) / 2), 0.035, 1)
            top, foot = (-0.18, -0.44) if i % 2 == 0 else (-0.44, -0.18)
            p.rod((sx * 0.7, top, z0), (sx * 0.7, foot, z1), 0.035, 1)
    if rise:
        p.shear(length, rise)
    return p

def bridge_span():
    """a skybridge of four squares between two gantries or roofs at one height"""
    return span("bridge_span", 4.0, 0.0, 2)

def bridge_ramp():
    """a ramp of ten squares rising one storey (about 1 in 3), for a bridge between floors of different heights or a gantry down to the street"""
    return span("bridge_ramp", 10.0, STOREY, 5)

def pylon():
    """the column under a bridge's end, its head a crosshead with braces, standing to just under the truss of a deck one storey up"""
    p = Piece("pylon")
    p.smooth = 50
    p.ring_profile([(0.62, 0), (0.62, 0.12), (0.42, 0.3), (0.32, 0.6), (0.28, 2.45), (0.34, 2.62), (0.34, 2.7)], 10, 0)
    p.ring_profile([(0.3, 1.9), (0.3, 2.0)], 10, 2)
    p.bx((0, 2.77, 0), (2.2, 0.14, 0.5), 1)
    for sx in (-1, 1):
        p.rod((sx * 0.3, 2.35, 0), (sx * 1.0, 2.7, 0), 0.05, 1)
    return p

def tube_walk():
    """an enclosed walkway of four squares (hostile air: Kamino's storms, Hoth, Mustafar): a deck under an arch of ribs and dark glazing, a lit spine.
    The glazing is a skin inside and out (it is seen from both); the ends are open"""
    p = Piece("tube_walk")
    L, rx, ry, n = 4.0, 1.08, 2.15, 6
    p.bx((0, -0.09, L / 2), (2.0, 0.18, L), 0, skip="02")
    for sx in (-1, 1):
        p.bx((sx * 1.08, -0.1, L / 2), (0.1, 0.34, L), 1, skip="02")
    arch = [(rx * math.cos(math.pi * k / n), ry * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for i in range(5):
        z = i * L / 4
        for (xa, ya), (xb, yb) in zip(arch, arch[1:]):
            p.rod((xa, ya, z), (xb, yb, z), 0.055, 1, 3)
    for i in range(4):
        z0, z1 = i * L / 4 + 0.05, (i + 1) * L / 4 - 0.05
        for (xa, ya), (xb, yb) in zip(arch, arch[1:]):
            out = ((xa + xb) / 2, (ya + yb) / 2, 0)
            p.quad([(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)], 3, out)
            k = 0.98
            p.quad([(xa * k, ya * k, z0), (xb * k, yb * k, z0), (xb * k, yb * k, z1), (xa * k, ya * k, z1)], 3, (-out[0], -out[1], 0))
    p.bx((0, ry + 0.01, L / 2), (0.14, 0.06, L), 2, skip="b02")
    return p

# A round room's wall, bay by bay (2026-11-05, third pass; the user: "ALL doorways and windows MUST remove the wall mesh/texture within the door/window frame").
# Sixteen bays of 22.5 degrees make a storey of a room of radius 4; each is centred at the front (angle pi/2) with its origin at the circle's centre on the
# floor, so a bay at angle a is the piece turned by pi/2 - a. A bay is its piece of wall (the wall's colour and texture, 0.2 thick) with the opening cut
# out of it, and its dress: a rib on its left edge, the cornice, the lit band, the plinth. A door bay's hole is the curved portal's opening exactly.
BAY = 2 * math.pi / 16
BAY_W = R4 * BAY
DOOR_HOLE = outline(DOOR_W + 0.02, DOOR_H + 0.04, "round")
SLIT = [(-0.12, 1.45), (0.12, 1.45), (0.12, 2.55), (-0.12, 2.55)]

def _bay(name, kind):
    p = Piece(name)
    p.smooth = 40
    mid = math.pi / 2
    a0, a1 = mid - BAY / 2, mid + BAY / 2
    if kind == "door":
        p.wall_panel(R4, mid, BAY_W, 0.0, STOREY, notch=DOOR_HOLE)
    elif kind == "window":
        p.wall_panel(R4, mid, BAY_W, 0.0, STOREY, hole=SLIT)
        # the glass, set back in the reveal, seen from both sides
        def at(x, y, z):
            a = mid - x / R4
            return ((R4 + z) * math.cos(a), y, (R4 + z) * math.sin(a))
        g = [at(x, y, -0.1) for x, y in SLIT]
        p.quad(g, 3, (0, 0, 1))
        p.quad([at(x, y, -0.11) for x, y in SLIT], 3, (0, 0, -1))
    else:
        p.wall_panel(R4, mid, BAY_W, 0.0, STOREY)
    if kind != "door":
        p.ring_profile([(R4 + 0.16, 0.0), (R4 + 0.16, 0.35), (R4, 0.35)], 2, 1, a0, a1)
    p.ring_profile([(R4, 3.05), (R4 + 0.25, 3.05), (R4 + 0.25, 3.32), (R4, 3.32)], 2, 1, a0, a1)
    p.ring_profile([(R4 + 0.03, 2.9), (R4 + 0.03, 2.98)], 2, 2, a0, a1)
    p.rbox(a1, R4, R4 + 0.16, 0.0 if kind == "door" else 0.352, 3.048, 0.16, 1, r1_top=R4 + 0.07, skip="bt3")
    return p

def drum_bay_r4():
    """a bay with a slit window cut through it (glass set back in the reveal)"""
    return _bay("drum_bay_r4", "window")

def drum_bay_blank_r4():
    """a bay of plain wall"""
    return _bay("drum_bay_blank_r4", "blank")

def drum_bay_door_r4():
    """a bay with the doorway cut through it to the portal's opening; the plinth stops at it"""
    return _bay("drum_bay_door_r4", "door")

# ---- Tree cities (Endor's Bright Tree Village, Kashyyyk's Kachirho): a great tree carries the town. Its trunk takes platforms ringed round it at each
# level (the gantry ring in timber: planks, rope, poles), rope bridges join the trees, a stair winds up the trunk, and rustic round huts with ragged thatch
# stand on the wide platforms. Regions: 4 timber (bark, planks, poles), 5 leaf (the canopy: the game's leaf finish, cut out), 6 thatch, 0 the hut's walls,
# 3 the dark inside an opening. Built lean for a weak GPU: a canopy of a few big lumps the leaf texture breaks up, not hundreds of small balls.
import random as _random
TRUNK_R = 1.2          # the trunk's radius over its middle: the platforms' inner edge
GREAT_H = 15.0

def _noise(a, y, seed):
    return 0.07 * math.sin(5 * a + 0.7 * y + seed) + 0.04 * math.sin(11 * a + 2.3 + 1.3 * y + seed * 2)

def tree_great():
    """a great tree: a ridged trunk with buttress roots, nearly straight over the levels of the town, then tapering into the canopy"""
    p = Piece("tree_great")
    p.smooth = 60
    seg = 12
    rs = [2.1, 1.55, 1.3, TRUNK_R + 0.05, TRUNK_R, TRUNK_R - 0.05, 1.0, 0.75, 0.45]
    hs = [0.0, 0.6, 1.6, 3.5, 7.0, 10.5, 12.5, 14.0, GREAT_H]
    rings = []
    for r, y in zip(rs, hs):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            q = r * (1 + _noise(a, y, 1.3))
            ring.append(p.v((q * math.cos(a), y, q * math.sin(a)), 4))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            a = 2 * math.pi * (i + 0.5) / seg
            p.toward([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], (math.cos(a), 0.15, math.sin(a)))
    # buttress roots: six round roots, each bending out from the trunk and down into the ground, tapering
    for i in range(6):
        a = 2 * math.pi * (i + 0.3) / 6
        c, s_ = math.cos(a), math.sin(a)
        p.rod((1.0 * c, 1.9, 1.0 * s_), (1.85 * c, 0.6, 1.85 * s_), 0.42, 4, 6, r2=0.3)
        p.rod((1.85 * c, 0.6, 1.85 * s_), (3.1 * c, -0.1, 3.1 * s_), 0.3, 4, 6, r2=0.1)
    # the great limbs that hold the canopy, round and tapering, each with a bend
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.4
        c, s_ = math.cos(a), math.sin(a)
        p.rod((0.3 * c, 12.0 + 0.4 * i, 0.3 * s_), (2.2 * c, 13.9 + 0.3 * (i % 2), 2.2 * s_), 0.26, 4, 6, r2=0.17)
        p.rod((2.2 * c, 13.9 + 0.3 * (i % 2), 2.2 * s_), (4.2 * c, 14.8 + 0.3 * (i % 2), 4.2 * s_), 0.17, 4, 6, r2=0.08)
    return p

def tree_great_canopy():
    """the great tree's canopy: nine big rough lumps on its limbs and crown (leaf region, cut out in the game), about a tenth of a large tree's crown"""
    p = Piece("tree_great_canopy")
    p.smooth = 70
    rnd = _random.Random(5)
    spots = [(0, 16.6, 0, 3.2)] + [(math.cos(2 * math.pi * i / 5 + 0.4) * 4.2, 15.2 + 0.3 * (i % 2), math.sin(2 * math.pi * i / 5 + 0.4) * 4.2, 2.4) for i in range(5)] + \
            [(math.cos(2 * math.pi * i / 3 + 1.1) * 2.2, 17.6, math.sin(2 * math.pi * i / 3 + 1.1) * 2.2, 2.0) for i in range(3)]
    for (x, y, z, r) in spots:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        vs = {}
        for v in bm.verts:
            n = v.co.normalized()
            k = 1 + 0.22 * math.sin(3 * n.x + 5 * n.y + x) * math.cos(4 * n.z + y) + rnd.uniform(-0.06, 0.06)
            vs[v] = p.v((x + n.x * r * k, y + n.z * r * k * 0.72, z + n.y * r * k), 5)
        for f in bm.faces:
            c = sum((v.co for v in f.verts), Vector()) / 3
            p.toward([vs[v] for v in f.verts], (c.x, c.z, c.y))
        bm.free()
    return p

def platform_ring():
    """a platform ringed round the trunk at one level: rough planks two squares wide, poles with a rope rail, braces down to the trunk"""
    p = Piece("platform_ring")
    rnd = _random.Random(11)
    r0, r1 = TRUNK_R + 0.04, TRUNK_R + 2.0
    n = 22
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.02, 0.02)
        w = 2 * math.pi * r1 / n * 0.92
        out = r1 + rnd.uniform(-0.12, 0.1)
        p.rbox(a, r0, out, -0.12 + rnd.uniform(-0.02, 0.02), 0.0 + rnd.uniform(-0.015, 0.015), w * r0 / r1, 4, w_top=w * r0 / r1, skip="3")
        # (the planks fan out: a second, wider block for their outer half)
        p.rbox(a, (r0 + out) / 2, out, -0.12, 0.0, w, 4, skip="3b")
    posts = 11
    tops = []
    for i in range(posts):
        a = 2 * math.pi * i / posts
        c, s_ = math.cos(a), math.sin(a)
        lean = rnd.uniform(-0.05, 0.05)
        top = ((r1 - 0.15 + lean) * c, 1.05 + rnd.uniform(-0.06, 0.06), (r1 - 0.15 + lean) * s_)
        p.rod(((r1 - 0.15) * c, -0.1, (r1 - 0.15) * s_), top, 0.05, 4, 4)
        tops.append(top)
        if i % 2 == 0:
            p.rod((TRUNK_R * 0.98 * c, -1.6, TRUNK_R * 0.98 * s_), ((r1 - 0.4) * c, -0.12, (r1 - 0.4) * s_), 0.07, 4, 4)
    for i in range(posts):
        a, b = Vector(tops[i]), Vector(tops[(i + 1) % posts])
        mid = (a + b) / 2 - Vector((0, 0.12, 0))
        p.rod(tuple(a - Vector((0, 0.06, 0))), tuple(mid), 0.025, 6, 3)
        p.rod(tuple(mid), tuple(b - Vector((0, 0.06, 0))), 0.025, 6, 3)
    return p

def platform_wide():
    """a wide platform round the trunk for a hut to stand on: planks out to three squares and a half, no rail on the hut's side"""
    p = Piece("platform_wide")
    rnd = _random.Random(17)
    r0, r1 = TRUNK_R + 0.04, TRUNK_R + 3.6
    n = 28
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.015, 0.015)
        w = 2 * math.pi * r1 / n * 0.93
        out = r1 + rnd.uniform(-0.15, 0.12)
        p.rbox(a, r0, (r0 + out) / 2, -0.14, 0.0, w * 0.55, 4, skip="3")
        p.rbox(a, (r0 + out) / 2, out, -0.14, 0.0, w, 4, skip="3")
    for i in range(10):
        a = 2 * math.pi * i / 10
        c, s_ = math.cos(a), math.sin(a)
        p.rod((TRUNK_R * c, -2.4, TRUNK_R * s_), ((r1 - 0.6) * c, -0.14, (r1 - 0.6) * s_), 0.09, 4, 4)
    return p

def rope_bridge():
    """a sagging bridge of planks on ropes, 5.5 long between two platforms at one height (the gap between two rings 12 apart)"""
    p = Piece("rope_bridge")
    rnd = _random.Random(23)
    L, sag, n = 5.5, 0.45, 18
    def y(z):
        return -sag * 4 * (z / L) * (1 - z / L)
    for i in range(n):
        z = (i + 0.5) * L / n
        p.bx((rnd.uniform(-0.03, 0.03), y(z) - 0.03, z), (1.3 + rnd.uniform(-0.12, 0.08), 0.06, L / n * 0.78), 4, skip="b")
    for sx in (-1, 1):
        pts = [(sx * 0.62, y(L * k / 6) - 0.05, L * k / 6) for k in range(7)]
        hand = [(sx * 0.72, 1.0 + y(L * k / 6) * 0.6, L * k / 6) for k in range(7)]
        for a, b in zip(pts, pts[1:]):
            p.rod(a, b, 0.03, 6, 3)
        for a, b in zip(hand, hand[1:]):
            p.rod(a, b, 0.03, 6, 3)
        for k in range(1, 6):
            p.rod(pts[k], hand[k], 0.015, 6, 3)
    return p

def trunk_stair():
    """a stair of planks winding a quarter and a half round the trunk, up one storey (3.4), with a rope rail on poles"""
    p = Piece("trunk_stair")
    rnd = _random.Random(29)
    steps, turn = 16, 1.5 * math.pi
    r0, r1 = TRUNK_R + 0.02, TRUNK_R + 1.1
    for i in range(steps):
        a = turn * (i + 0.5) / steps
        yy = STOREY * (i + 1) / steps
        p.rbox(a, r0, r1 + rnd.uniform(-0.08, 0.05), yy - 0.08, yy, 0.42, 4, w_top=0.42, skip="3")
        if i % 3 == 1:
            c, s_ = math.cos(a), math.sin(a)
            p.rod((r0 * c, yy - 0.9, r0 * s_), ((r1 - 0.2) * c, yy - 0.08, (r1 - 0.2) * s_), 0.05, 4, 4)
    rail = []
    for i in range(0, steps + 1, 3):
        a = turn * i / steps
        yy = STOREY * i / steps
        c, s_ = math.cos(a), math.sin(a)
        p.rod(((r1 - 0.08) * c, yy, (r1 - 0.08) * s_), ((r1 - 0.08) * c, yy + 1.0, (r1 - 0.08) * s_), 0.04, 4, 4)
        rail.append(((r1 - 0.08) * c, yy + 0.95, (r1 - 0.08) * s_))
    for a, b in zip(rail, rail[1:]):
        p.rod(a, b, 0.022, 6, 3)
    return p

def hut_rustic():
    """a round hut of daub over poles, radius 1.4: a doorway and a window cut through its wall with rough timber frames, and a ragged roof of thatch in two
    layers that droops past the wall, a knot of poles at the top (the Ewoks' and the Wookiees' outlying huts)"""
    p = Piece("hut_rustic")
    p.smooth = 45
    rnd = _random.Random(31)
    R, H = 1.4, 1.9
    n = 8
    w = 2 * math.pi * R / n
    door = outline(0.8, 1.35, "round")
    win = [(-0.18, 1.0), (0.18, 1.0), (0.18, 1.38), (-0.18, 1.38)]
    for i in range(n):
        a = math.pi / 2 + 2 * math.pi * i / n
        if i == 0:
            p.wall_panel(R, a, w, 0.0, H, notch=door, cols=2, thick=0.12, region=0, reveal=4)
        elif i == 3:
            p.wall_panel(R, a, w, 0.0, H, hole=win, cols=2, thick=0.12, region=0, reveal=4)
        else:
            p.wall_panel(R, a, w, 0.0, H, cols=2, thick=0.12, region=0)
        # a pole standing proud at each joint of the daub
        c, s_ = math.cos(a + math.pi / n), math.sin(a + math.pi / n)
        p.rod(((R + 0.05) * c, -0.05, (R + 0.05) * s_), ((R + 0.04) * c, H + 0.15, (R + 0.04) * s_), 0.055, 4, 4)
    # the door's frame: two posts and a lintel of rough timber; the window's sill
    a = math.pi / 2
    for x in (-0.47, 0.47):
        t = a - x / R
        p.rod(((R + 0.06) * math.cos(t), 0.0, (R + 0.06) * math.sin(t)), ((R + 0.06) * math.cos(t), 1.45, (R + 0.06) * math.sin(t)), 0.06, 4, 4)
    t0, t1 = a + 0.6 / R, a - 0.6 / R
    p.rod(((R + 0.08) * math.cos(t0), 1.45, (R + 0.08) * math.sin(t0)), ((R + 0.08) * math.cos(t1), 1.5, (R + 0.08) * math.sin(t1)), 0.07, 4, 4)
    a = math.pi / 2 + 3 * 2 * math.pi / n
    t0, t1 = a + 0.3 / R, a - 0.3 / R
    p.rod(((R + 0.06) * math.cos(t0), 0.97, (R + 0.06) * math.sin(t0)), ((R + 0.06) * math.cos(t1), 0.97, (R + 0.06) * math.sin(t1)), 0.04, 4, 4)
    # thatch: two ragged cones, each eave a shaggy fringe (every other point hangs lower and further out)
    seg = 14
    for (rb, yb, rt, yt, ytop) in ((R + 0.55, H - 0.25, 0.9, H + 0.85, None), (1.15, H + 0.6, 0.0, H + 1.9, H + 1.9)):
        eave = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            hang = 0.16 if i % 2 else 0.0
            r = rb + rnd.uniform(-0.06, 0.08) + hang * 0.5
            eave.append(p.v((r * math.cos(a), yb - hang - rnd.uniform(0, 0.06), r * math.sin(a)), 6))
        top = [p.v(((rt + rnd.uniform(-0.03, 0.03)) * math.cos(2 * math.pi * i / seg + 0.1), yt + rnd.uniform(-0.04, 0.04), (rt + rnd.uniform(-0.03, 0.03)) * math.sin(2 * math.pi * i / seg + 0.1)), 6) for i in range(seg)] if rt > 0 else None
        tip = p.v((0, ytop, 0), 6) if ytop else None
        under = [p.v(((R - 0.02) * math.cos(2 * math.pi * i / seg), yb + 0.18, (R - 0.02) * math.sin(2 * math.pi * i / seg)), 6) for i in range(seg)] if top else None
        for i in range(seg):
            j = (i + 1) % seg
            a = 2 * math.pi * (i + 0.5) / seg
            if top:
                p.toward([eave[i], eave[j], top[j], top[i]], (math.cos(a), 0.8, math.sin(a)))
                p.toward([eave[i], eave[j], under[j], under[i]], (0, -1, 0))
            else:
                p.toward([eave[i], eave[j], tip], (math.cos(a), 0.6, math.sin(a)))
    # a knot of poles through the top, and a lashing band
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.3
        p.rod((math.cos(a) * 0.25, H + 1.4, math.sin(a) * 0.25), (-math.cos(a) * 0.35, H + 2.45, -math.sin(a) * 0.35), 0.035, 4, 4)
    p.ring_profile([(0.62, H + 1.38), (0.6, H + 1.46)], 8, 4)
    # its floor
    p.ring_profile([(R + 0.02, 0.02), (0.0, 0.02)], 8, 4)
    return p

def _gantry(name, gate=False):
    """an eighth of a gantry ring round a round room of radius 4, one storey up: a deck two squares wide, a fascia with a lit strip and a kick-lip, a rail
    on posts, struts back to the wall. Eight make the ring; the posts at the far end are the next arc's. A gate arc has its rail and lip cut away across
    the middle (two squares and a hand's breadth at the outer edge) for a bridge, a tube or a neighbour's gantry to join it"""
    p = Piece(name)
    a0, a1 = math.pi / 2 - math.pi / 8, math.pi / 2 + math.pi / 8
    mid = math.pi / 2
    out = R4 + 2.0
    g = GATE_HALF / out
    S = 4
    p.ring_profile([(out - 0.04, 0.0), (R4, 0.0)], S, 0, a0, a1)
    p.ring_profile([(R4, -0.18), (out - 0.04, -0.18)], S, 0, a0, a1)
    p.ring_profile([(out - 0.04, -0.18), (out - 0.04, -0.32), (out + 0.06, -0.32), (out + 0.06, 0.0), (out - 0.04, 0.0)], S, 1, a0, a1)
    p.ring_profile([(out + 0.065, -0.28), (out + 0.065, -0.22)], S, 2, a0, a1)
    spans = [(a0, mid - g), (mid + g, a1)] if gate else [(a0, a1)]
    for b0, b1 in spans:
        n = max(1, round(S * (b1 - b0) / (a1 - a0)))
        p.ring_profile([(out + 0.06, 0.0), (out + 0.06, 0.06), (out - 0.04, 0.06), (out - 0.04, 0.0)], n, 1, b0, b1)
        p.ring_profile([(out - 0.06, 0.96), (out - 0.06, 1.02), (out - 0.14, 1.02), (out - 0.14, 0.96)], n, 1, b0, b1)
    posts = [a0, mid - g, mid + g] if gate else [a0 + (a1 - a0) * k / 3 for k in range(3)]
    for a in posts:
        c, s_ = math.cos(a), math.sin(a)
        p.rod((c * (out - 0.1), 0.06, s_ * (out - 0.1)), (c * (out - 0.1), 0.96, s_ * (out - 0.1)), 0.035, 1)
    for a in (a0 + (a1 - a0) / 4, a1 - (a1 - a0) / 4):
        c, s_ = math.cos(a), math.sin(a)
        p.rod((c * (R4 + 0.1), -1.3, s_ * (R4 + 0.1)), (c * (out - 0.5), -0.18, s_ * (out - 0.5)), 0.06, 1)
        p.rbox(a, R4, R4 + 0.14, -1.6, -1.2, 0.24, 1, skip="3")
    return p

def gantry_arc_r4():
    return _gantry("gantry_arc_r4")

def gantry_arc_gate_r4():
    return _gantry("gantry_arc_gate_r4", gate=True)

def gantry_end_r4():
    """a rail across the open end of a gantry where it stops over a drop (over the lower run of a ramp under it): at the start edge of an arc piece
    (angle 3 pi / 8 as built), from the wall to the outer rail"""
    p = Piece("gantry_end_r4")
    a = math.pi / 2 - math.pi / 8
    c, s_ = math.cos(a), math.sin(a)
    pts = [R4 + 0.25, R4 + 1.0, R4 + 1.9]
    for r in pts:
        p.rod((c * r, 0.0, s_ * r), (c * r, 0.98, s_ * r), 0.035, 1)
    for y in (0.5, 0.99):
        p.rod((c * (R4 + 0.05), y, s_ * (R4 + 0.05)), (c * (R4 + 1.95), y, s_ * (R4 + 1.95)), 0.03 if y < 0.9 else 0.04, 1)
    return p

def _arc_slab(p, r0, r1, a0, a1, y0, y1, n, region, top=True, under=True, r0_at=None):
    """the walking surface of a ramp round a curve: from angle a0 at height y0 to a1 at y1, radii r0 (or r0_at(y): a wall that leans) to r1"""
    rows = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        y = y0 + (y1 - y0) * i / n
        ri = r0_at(y) if r0_at else r0
        rows.append((a, y, ri))
    for (aa, ya, ra), (ab, yb, rb) in zip(rows, rows[1:]):
        if top:
            p.quad([(ra * math.cos(aa), ya, ra * math.sin(aa)), (r1 * math.cos(aa), ya, r1 * math.sin(aa)), (r1 * math.cos(ab), yb, r1 * math.sin(ab)), (rb * math.cos(ab), yb, rb * math.sin(ab))], region, (0, 1, 0))
        if under:
            d = 0.16
            p.quad([(ra * math.cos(aa), ya - d, ra * math.sin(aa)), (r1 * math.cos(aa), ya - d, r1 * math.sin(aa)), (r1 * math.cos(ab), yb - d, r1 * math.sin(ab)), (rb * math.cos(ab), yb - d, rb * math.sin(ab))], region, (0, -1, 0))
    return rows

def ramp_arc_r4():
    """a segment of a metal ramp wound round a round room of radius 4 under its gantry: 22.5 degrees of the gantry's band (the wall to two squares out),
    rising a sixth of a storey; six make a ramp from the floor to the gantry deck (about 1 in 3.5 at its middle). Its inner edge is against the wall (no
    rail); a fascia and a lit strip on its outer edge, a rail on posts, a strut to the wall. Built rising toward the larger angle; a ramp the other way is
    the piece mirrored (architecture.ts rampPlan)"""
    p = Piece("ramp_arc_r4")
    a0, a1 = math.pi / 2 - RAMP_SEG / 2, math.pi / 2 + RAMP_SEG / 2
    r0, r1 = R4 + 0.02, R4 + 1.95
    rise = STOREY / RAMP_STEPS
    n = 3
    rows = _arc_slab(p, r0, r1, a0, a1, 0.0, rise, n, 0)
    for (aa, ya, _), (ab, yb, _) in zip(rows, rows[1:]):
        ca, sa, cb, sb = math.cos(aa), math.sin(aa), math.cos(ab), math.sin(ab)
        p.quad([((r1 + 0.05) * ca, ya - 0.34, (r1 + 0.05) * sa), ((r1 + 0.05) * cb, yb - 0.34, (r1 + 0.05) * sb), ((r1 + 0.05) * cb, yb + 0.05, (r1 + 0.05) * sb), ((r1 + 0.05) * ca, ya + 0.05, (r1 + 0.05) * sa)], 1, ((ca + cb) / 2, 0, (sa + sb) / 2))
        p.quad([((r1 + 0.055) * ca, ya - 0.3, (r1 + 0.055) * sa), ((r1 + 0.055) * cb, yb - 0.3, (r1 + 0.055) * sb), ((r1 + 0.055) * cb, yb - 0.25, (r1 + 0.055) * sb), ((r1 + 0.055) * ca, ya - 0.25, (r1 + 0.055) * sa)], 2, ((ca + cb) / 2, 0, (sa + sb) / 2))
        p.quad([((r1 + 0.05) * ca, ya + 0.05, (r1 + 0.05) * sa), ((r1 + 0.05) * cb, yb + 0.05, (r1 + 0.05) * sb), (r1 * cb, yb, r1 * sb), (r1 * ca, ya, r1 * sa)], 1, (0, 1, 0))
    for a, y in ((a0, 0.0), ((a0 + a1) / 2, rise / 2)):
        c, s_ = math.cos(a), math.sin(a)
        p.rod((c * (r1 - 0.08), y + 0.05, s_ * (r1 - 0.08)), (c * (r1 - 0.08), y + 0.98, s_ * (r1 - 0.08)), 0.035, 1)
    top = [((r1 - 0.08) * math.cos(a), y + 0.98, (r1 - 0.08) * math.sin(a)) for a, y, _ in rows]
    for a, b in zip(top, top[1:]):
        p.rod(a, b, 0.035, 1)
    am = (a0 + a1) / 2
    c, s_ = math.cos(am), math.sin(am)
    p.rod((c * (R4 + 0.08), rise / 2 - 1.2, s_ * (R4 + 0.08)), (c * (r1 - 0.4), rise / 2 - 0.16, s_ * (r1 - 0.4)), 0.05, 1)
    return p

# ---- Stone ramps and adobe bays (Tatooine and the worlds like it): a ramp of plastered stone built against a wall, solid to the ground, a low rounded
# parapet on its open side; curved round an adobe drum or straight along a flat wall. An adobe drum is built in bays too, so that its openings are cut
# through its wall and its parapet can be cut where a ramp comes up onto its roof.
def adobe_off(y):
    """how far an adobe wall stands out from radius 4 at height y: it leans in as it rises (0.32 at its foot to 0.02 at its top)"""
    return 0.32 - 0.3 * min(1.0, max(0.0, y / STOREY))

ADOBE_DOOR = outline(DOOR_W + 0.06, DOOR_H + 0.1, "horseshoe")
ADOBE_WIN = [(-0.17, 1.55), (0.17, 1.55), (0.17, 1.95), (-0.17, 1.95)]

def _adobe_bay(name, kind):
    p = Piece(name)
    p.smooth = 50
    mid = math.pi / 2
    top = STOREY - 0.05
    if kind == "door":
        p.wall_panel(R4, mid, BAY_W, 0.0, top, notch=ADOBE_DOOR, cols=3, thick=0.35, region=0, reveal=0, off=adobe_off)
    elif kind == "window":
        p.wall_panel(R4, mid, BAY_W, 0.0, top, hole=ADOBE_WIN, cols=3, thick=0.35, region=0, reveal=0, off=adobe_off)
    else:
        p.wall_panel(R4, mid, BAY_W, 0.0, top, cols=3, thick=0.35, region=0, off=adobe_off)
    return p

def adobe_bay_r4():
    return _adobe_bay("adobe_bay_r4", "blank")

def adobe_bay_window_r4():
    """a small deep window cut through the adobe (no glass: the dark beyond)"""
    return _adobe_bay("adobe_bay_window_r4", "window")

def adobe_bay_door_r4():
    """a horseshoe doorway cut through the adobe"""
    return _adobe_bay("adobe_bay_door_r4", "door")

def adobe_lip_r4():
    """a bay's length of the adobe drum's rounded parapet, with beam ends under it; left out over the bay where a ramp comes up onto the roof"""
    p = Piece("adobe_lip_r4")
    p.smooth = 50
    a0, a1 = math.pi / 2 - BAY / 2, math.pi / 2 + BAY / 2
    R = R4 + 0.02
    p.ring_profile([(R - 0.02, STOREY - 0.06), (R + 0.05, STOREY), (R + 0.05, STOREY + 0.2), (R - 0.1, STOREY + 0.26), (R - 0.3, STOREY + 0.2), (R - 0.3, STOREY)], 3, 0, a0, a1)
    p.rbox(math.pi / 2, R4 - 0.1, R4 + 0.4, STOREY - 0.42, STOREY - 0.28, 0.12, 4, skip="3")
    return p

def portal_adobe_curved_r4():
    """the adobe family's horseshoe frame with its beam ends, bent to the drum (its door height leans out about a quarter); origin at the circle's centre"""
    p = portal("portal_adobe_curved_r4", "horseshoe", 1.4, 1.98, 0.34)
    for x in (-0.38, 0, 0.38):
        p.cyl((x, 2.02, -0.1), "z", 0.04, 0.34, 4, 6)
    p.bend(R4 + 0.24)
    p.recentre(R4 + 0.24)
    return p

def ramp_stone_arc_r4():
    """a segment of a stone ramp wound round an adobe drum of radius 4: 22.5 degrees, rising a sixth of a storey; built against the wall (its inner edge
    follows the wall's lean), solid down to the ground, a low rounded parapet on its open side. Six make a ramp up onto the roof"""
    p = Piece("ramp_stone_arc_r4")
    p.smooth = 45
    a0, a1 = math.pi / 2 - RAMP_SEG / 2, math.pi / 2 + RAMP_SEG / 2
    rise = STOREY / RAMP_STEPS
    r1 = R4 + 0.32 + 1.5
    n = 3
    inner = lambda y: R4 + adobe_off(y) - 0.04
    rows = _arc_slab(p, 0, r1 - 0.28, a0, a1, 0.0, rise, n, 1, under=False, r0_at=inner)
    for (aa, ya, _), (ab, yb, _) in zip(rows, rows[1:]):
        ca, sa, cb, sb = math.cos(aa), math.sin(aa), math.cos(ab), math.sin(ab)
        w = ((ca + cb) / 2, 0, (sa + sb) / 2)
        # the outer face, down to the ground (a little batter), and the parapet: outer face up, rounded top, inner face down to the walk
        rf = r1 + 0.06
        p.quad([(rf * ca, 0.0, rf * sa), (rf * cb, 0.0, rf * sb), (r1 * cb, yb + 0.72, r1 * sb), (r1 * ca, ya + 0.72, r1 * sa)], 0, w)
        p.quad([(r1 * ca, ya + 0.72, r1 * sa), (r1 * cb, yb + 0.72, r1 * sb), ((r1 - 0.14) * cb, yb + 0.8, (r1 - 0.14) * sb), ((r1 - 0.14) * ca, ya + 0.8, (r1 - 0.14) * sa)], 0, (w[0], 1.5, w[2]))
        p.quad([((r1 - 0.14) * ca, ya + 0.8, (r1 - 0.14) * sa), ((r1 - 0.14) * cb, yb + 0.8, (r1 - 0.14) * sb), ((r1 - 0.28) * cb, yb + 0.7, (r1 - 0.28) * sb), ((r1 - 0.28) * ca, ya + 0.7, (r1 - 0.28) * sa)], 0, (-w[0], 1.5, -w[2]))
        p.quad([((r1 - 0.28) * ca, ya + 0.7, (r1 - 0.28) * sa), ((r1 - 0.28) * cb, yb + 0.7, (r1 - 0.28) * sb), ((r1 - 0.28) * cb, yb, (r1 - 0.28) * sb), ((r1 - 0.28) * ca, ya, (r1 - 0.28) * sa)], 0, (-w[0], 0, -w[2]))
    return p

def ramp_stone_straight():
    """a straight stone ramp along a flat wall: its foot at the origin against the wall (the wall on its -x side), climbing along +z, eight long to a
    storey up and a landing of 1.2, a squared parapet with a rounded top on its open side, solid to the ground. A ramp on the wall's other hand is the
    piece mirrored"""
    p = Piece("ramp_stone_straight")
    L, W, land = 8.0, 1.5, 1.2
    def y(z):
        return min(STOREY, STOREY * z / L)
    zs = [0.0, L / 2, L, L + land]
    for za, zb in zip(zs, zs[1:]):
        p.quad([(0.0, y(za), za), (W - 0.28, y(za), za), (W - 0.28, y(zb), zb), (0.0, y(zb), zb)], 1, (0, 1, 0))
        p.quad([(W + 0.06, 0.0, za), (W + 0.06, 0.0, zb), (W, y(zb) + 0.72, zb), (W, y(za) + 0.72, za)], 0, (1, 0, 0))
        p.quad([(W, y(za) + 0.72, za), (W, y(zb) + 0.72, zb), (W - 0.14, y(zb) + 0.8, zb), (W - 0.14, y(za) + 0.8, za)], 0, (0.5, 1, 0))
        p.quad([(W - 0.14, y(za) + 0.8, za), (W - 0.14, y(zb) + 0.8, zb), (W - 0.28, y(zb) + 0.7, zb), (W - 0.28, y(za) + 0.7, za)], 0, (-0.5, 1, 0))
        p.quad([(W - 0.28, y(za) + 0.7, za), (W - 0.28, y(zb) + 0.7, zb), (W - 0.28, y(zb), zb), (W - 0.28, y(za), za)], 0, (-1, 0, 0))
    # the far end of the landing (its face to the open, down to the ground) and the parapet's end
    p.quad([(0.0, 0.0, L + land), (0.0, STOREY, L + land), (W + 0.06, STOREY, L + land), (W + 0.06, 0.0, L + land)], 0, (0, 0, 1))
    p.quad([(W - 0.28, STOREY, L + land), (W - 0.28, STOREY + 0.8, L + land), (W, STOREY + 0.8, L + land), (W, STOREY, L + land)], 0, (0, 0, 1))
    return p

# ---- Conifers for the tree villages: Endor's redwoods. A straight trunk, bare below the town's levels, whorls of round branches above them carrying
# cards of needles (the leaf region; in the game the needle finish), round buttress roots
def tree_great_conifer():
    """a great conifer: a straight ridged trunk of radius 1.2 through the town's levels to 24 high, round tapering roots, nine whorls of round branches
    from 10 up, drooping, longest at the foot"""
    p = Piece("tree_great_conifer")
    p.smooth = 60
    seg = 10
    rs = [2.0, 1.5, 1.28, TRUNK_R + 0.04, TRUNK_R, 1.05, 0.8, 0.45, 0.12]
    hs = [0.0, 0.6, 1.8, 4.0, 9.0, 13.0, 17.0, 21.0, 24.0]
    rings = []
    for r, y in zip(rs, hs):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            q = r * (1 + 0.8 * _noise(a, y, 4.1))
            ring.append(p.v((q * math.cos(a), y, q * math.sin(a)), 4))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            a = 2 * math.pi * (i + 0.5) / seg
            p.toward([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], (math.cos(a), 0.1, math.sin(a)))
    for i in range(5):
        a = 2 * math.pi * (i + 0.5) / 5
        c, s_ = math.cos(a), math.sin(a)
        p.rod((0.9 * c, 1.7, 0.9 * s_), (1.8 * c, 0.5, 1.8 * s_), 0.4, 4, 6, r2=0.28)
        p.rod((1.8 * c, 0.5, 1.8 * s_), (2.9 * c, -0.1, 2.9 * s_), 0.28, 4, 6, r2=0.1)
    for t in range(9):
        f = t / 8
        y = 10.0 + f * 12.5
        length = 5.0 * (1 - f * 0.78) + 0.6
        rt = 1.1 - 0.9 * f
        for j in range(6):
            a = 2 * math.pi * j / 6 + t * 0.55
            c, s_ = math.cos(a), math.sin(a)
            tip = ((rt + length) * c, y - length * (0.35 - 0.2 * f), (rt + length) * s_)
            p.rod((rt * 0.8 * c, y, rt * 0.8 * s_), tip, 0.14 * (1 - 0.6 * f), 4, 5, r2=0.03)
    return p

def tree_great_conifer_needles():
    """the needles of the great conifer: along each branch a spray of two wide cards rolled into a shallow V (as the game's pine sprays, `Kit.spray`),
    broad at the branch's middle and narrowing to its tip, each seen from both sides (the leaf region; in the game the needle finish, cut out)"""
    p = Piece("tree_great_conifer_needles")
    for t in range(9):
        f = t / 8
        y = 10.0 + f * 12.5
        length = 5.0 * (1 - f * 0.78) + 0.6
        rt = 1.1 - 0.9 * f
        for j in range(6):
            a = 2 * math.pi * j / 6 + t * 0.55
            c, s_ = math.cos(a), math.sin(a)
            base = Vector((rt * c, y, rt * s_))
            tip = Vector(((rt + length) * c, y - length * (0.35 - 0.2 * f), (rt + length) * s_))
            d = tip - base
            side = Vector((-s_, 0, c))
            up = d.cross(side).normalized()
            if up.y < 0:
                up = -up
            half = 0.32 * length + 0.25
            for roll in (0.45, -0.45):
                w = side * math.cos(roll) * (1 if roll > 0 else -1) + up * math.sin(abs(roll))
                q = [base + d * 0.05, base + d * 0.45 + w * half, tip + w * half * 0.25, tip]
                n = d.cross(w).normalized()
                if n.y < 0:
                    n = -n
                p.quad([tuple(v) for v in q], 5, tuple(n))
                p.quad([tuple(v - n * 0.004) for v in q], 5, tuple(-n))
    return p

LEAN_BUILDERS = [gantry_arc_gate_r4, gantry_end_r4, ramp_arc_r4, adobe_bay_r4, adobe_bay_window_r4, adobe_bay_door_r4, adobe_lip_r4, portal_adobe_curved_r4,
                 ramp_stone_arc_r4, ramp_stone_straight, tree_great_conifer, tree_great_conifer_needles]

FOREST_BUILDERS = [tree_great, tree_great_canopy, platform_ring, platform_wide, rope_bridge, trunk_stair, hut_rustic]

ROUND_BUILDERS = [drum_bay_r4, drum_bay_blank_r4, drum_bay_door_r4, drum_adobe_r4, tiers_r4, portal_curved_r4, gantry_arc_r4, bridge_span, bridge_ramp, pylon, tube_walk]

BUILDERS = [crown_adobe, crown_domed, crown_minaret, crown_deco, crown_polar, crown_timber, crown_hull, crown_bunker,
            portal_adobe, portal_domed, portal_deco, portal_polar, portal_timber, portal_hull, relief_buttress, relief_fin, relief_beams] + ROUND_BUILDERS + FOREST_BUILDERS + LEAN_BUILDERS

def main(reset=True, out=None):
    """the full build and export; `reset` False (an export from the open Mixar session: builtins.ARCH_EXPORT = True) builds into a collection of
    its own, exports it and removes it again, leaving the user's scene as it was"""
    global OUT
    if out:
        OUT = out
    coll = None
    if reset:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    else:
        coll = bpy.data.collections.new("claude_arch_export")
        bpy.context.scene.collection.children.link(coll)
        bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
    only = arg("--only")
    made, kit = [], {}
    if not reset:
        # (objects of the user's scene with a piece's name step aside, so that the exported meshes are named exactly what the game looks for)
        for fn in BUILDERS:
            ob = bpy.data.objects.get(fn.__name__)
            if ob:
                ob.name = fn.__name__ + "_review"
    for fn in BUILDERS:
        name = fn.__name__
        if only and name not in only.split(","):
            continue
        ob = fn().finish()
        made.append(ob)
        lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
        # (Blender's (x, y, z) are the code's (x, z, y) with z = -y_code: back to the code's frame)
        kit[name] = {"box": [round(v, 3) for v in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])], "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons)}
    bad = [o.name for o in made if o.name not in kit]
    if bad:
        raise RuntimeError(f"architecture export: unexpected names {bad}")
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in made:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "architecture.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=False, export_materials="NONE", export_yup=True, export_apply=True)
    if not only:
        with open(os.path.join(ROOT, "shared", "art", "architectureKit.json"), "w") as fh:
            json.dump(kit, fh, indent=1)
    print("ARCH", path, {k: v["tris"] for k, v in kit.items()})
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    return kit

# ---- Live review in the user's open Mixar (or Blender) session (2026-11-05) ----------------------------------------------------------------------------
# Run inside the GUI (Scripting workspace, Python console):
#   p=r"C:\Users\Admin\Desktop\SW5E\SW5e-Proper\tools\blender\build-architecture.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})
# (optionally first: import builtins; builtins.ARCH_ONLY = "gantry_arc_r4,tiers_r4"). It never resets the scene and never exports: it rebuilds the pieces
# in a collection `claude_arch` (emptied first), lays them out in a row clear of everything else in the scene, puts a hub-and-gantry vignette beside them,
# colours them by region (a `Col` colour attribute, the viewport set to show it), checks that nothing overlaps (the mixar skill's rule 6) and frames them.
REGION_RGB = {0: (0.78, 0.69, 0.53), 1: (0.45, 0.4, 0.33), 2: (1.0, 0.85, 0.54), 3: (0.06, 0.08, 0.1), 4: (0.43, 0.3, 0.18), 5: (0.2, 0.34, 0.14), 6: (0.66, 0.55, 0.32)}

def _colour(ob):
    me = ob.data
    if "Col" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["Col"])
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    reg, ao = me.attributes["_REGION"].data, me.attributes["_AO"].data
    for i in range(len(me.vertices)):
        r, g, b = REGION_RGB.get(int(round(reg[i].value)), (1, 0, 1))
        k = 1.0 if int(round(reg[i].value)) == 2 else 0.45 + 0.55 * ao[i].value
        col.data[i].color = (r * k, g * k, b * k, 1.0)
    me.color_attributes.active_color = col

def _world_box(objs):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                lo[i], hi[i] = min(lo[i], w[i]), max(hi[i], w[i])
    return lo, hi

def live():
    import builtins
    only = getattr(builtins, "ARCH_ONLY", None)
    scene = bpy.context.scene
    coll = bpy.data.collections.get("claude_arch")
    if coll is None:
        coll = bpy.data.collections.new("claude_arch")
        scene.collection.children.link(coll)
    for ob in [o for o in coll.objects if o.name.startswith("claude_")]:
        me = ob.data
        bpy.data.objects.remove(ob)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    def find(lc):
        if lc.collection == coll:
            return lc
        for ch in lc.children:
            f = find(ch)
            if f:
                return f
    bpy.context.view_layer.active_layer_collection = find(bpy.context.view_layer.layer_collection)
    others = [o for o in scene.objects if o.type == "MESH" and o.name not in coll.objects]
    start = (_world_box(others)[1][0] + 8.0) if others else 0.0
    built = {}
    for fn in BUILDERS:
        if only and fn.__name__ not in only.split(","):
            continue
        ob = fn().finish()
        ob.name = "claude_" + fn.__name__
        _colour(ob)
        built[fn.__name__] = ob
    # a row of the pieces in front of the vignette (Blender -Y is the code's front), 1.5 apart
    x = start
    row = []
    for name, ob in built.items():
        lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
        ob.location = (x - lo[0], -16.0 - hi[1], -lo[2] if lo[2] < 0 else 0.0)
        x += hi[0] - lo[0] + 1.5
        row.append(ob)
    # ---- The layout rules of interiors/architecture.ts (storeyPlan, rampPlan, gantryPlan, parapetPlan), as the game will place the pieces
    TAU = 2 * math.pi
    nrm = lambda a: a % TAU
    ARC = TAU / 8
    arc_at = lambda a: round((nrm(a) - math.pi / 2) / ARC) % 8
    arc_centre = lambda i: math.pi / 2 + i * ARC
    arc_edge = lambda a: math.pi / 2 + ARC / 2 + round((nrm(a) - math.pi / 2 - ARC / 2) / ARC) * ARC
    bay_edge = lambda a: BAY / 2 + round((nrm(a) - BAY / 2) / BAY) * BAY
    bay_at = lambda a: round(nrm(a) / BAY) % 16
    def ramp_plan(top, d, base=0.0, piece="ramp_arc_r4"):
        t = bay_edge(top) if "stone" in piece else arc_edge(top)
        return [(piece, nrm(t - d * (RAMP_STEPS - k - 0.5) * RAMP_SEG), base + k * STOREY / RAMP_STEPS, d < 0) for k in range(RAMP_STEPS)]
    def gantry_plan(gates, ramps, level=STOREY):
        gone, ends = set(), []
        for (top, d) in ramps:
            run = ramp_plan(top, d)
            low = -1
            for k, (_, a, y, _) in enumerate(run):
                if level - 0.32 - (y + STOREY / RAMP_STEPS) >= 2.2:
                    continue
                low = k if low < 0 else min(low, k)
                gone.add(arc_at(a))
            if low >= 0:
                i = arc_at(run[low][1])
                ends.append((nrm(arc_centre(i) - d * ARC / 2), d))
        gate_arcs = {arc_at(g) for g in gates}
        out = [("gantry_arc_gate_r4" if i in gate_arcs else "gantry_arc_r4", nrm(arc_centre(i)), level, False) for i in range(8) if i not in gone]
        out += [("gantry_end_r4", nrm(e + ARC / 2), level, False) for e, d in ends if arc_at(e - d * ARC / 2) not in gone]
        return out
    def storey_plan(doors, y=0.0, family="drum"):
        db = {bay_at(a) for a in doors}
        out = []
        for k in range(16):
            if family == "adobe":
                n = "adobe_bay_door_r4" if k in db else ("adobe_bay_window_r4" if k % 4 == 2 else "adobe_bay_r4")
            else:
                n = "drum_bay_door_r4" if k in db else ("drum_bay_r4" if k % 2 else "drum_bay_blank_r4")
            out.append((n, k * BAY, y, False))
            if k in db:
                out.append(("portal_adobe_curved_r4" if family == "adobe" else "portal_curved_r4", k * BAY, y, False))
        return out
    def parapet_plan(ramps, y=0.0):
        cut = {bay_at(ramp_plan(t, d, piece="ramp_stone_arc_r4")[-1][1]) for t, d in ramps}
        return [("adobe_lip_r4", k * BAY, y, False) for k in range(16) if k not in cut]

    vig, vig2, vig3 = [], [], []
    ox = start + 14.0
    def put(name, at, turn=0.0, scale=1.0, key="", into=None, mirror=False):
        src = built.get(name)
        if not src:
            return
        o = bpy.data.objects.new("claude_vig_" + name + key, src.data)
        coll.objects.link(o)
        o.location = P(ox + at[0], at[1], at[2])
        o.rotation_euler = (0, 0, turn)
        o.scale = (-scale if mirror else scale, scale, scale)
        (vig if into is None else into).append(o)
    def place(plan, cx, cz, key, into=None, dy=0.0):
        for n, (piece, a, y, mir) in enumerate(plan):
            put(piece, (cx, y + dy, cz), math.pi / 2 - a, key=f"{key}{n}", into=into, mirror=mir)
    def disc(cx, cz, y, r, key, into, region=0):
        q = Piece("vig_roof" + key)
        q.ring_profile([(r, y), (0.0, y)], 24, region)
        o = q.finish()
        o.name = "claude_vig_roof" + key
        _colour(o)
        o.location = P(ox + cx, 0, cz)
        into.append(o)
    def block(c, size, key, into, region=0):
        q = Piece("vig_block" + key)
        q.bx(c, size, region, skip="b")
        o = q.finish()
        o.name = "claude_vig_block" + key
        _colour(o)
        o.location = P(ox, 0, 0)
        into.append(o)

    # the hub: a door at the street, doors onto the gantry east (the bridge) and west (the tube); its gantry gated there, a ramp wound up to it from the
    # north-west, the deck over the ramp's upper run cut away and a rail where it stops; a pod of bays west at the tube's end
    if built.get("drum_bay_r4"):
        place(storey_plan([math.pi / 2]), 0, 0, "h0_")
        place(storey_plan([0.0, math.pi], STOREY), 0, 0, "h1_")
        disc(0, 0, 2 * STOREY, R4, "h", vig)
        W = -(R4 + 6.0 + R4)
        place(storey_plan([math.pi / 2]), W, 0, "w0_")
        place(storey_plan([0.0], STOREY), W, 0, "w1_")
        disc(W, 0, 2 * STOREY, R4, "w", vig)
        hub_ramp = (math.radians(337.5), 1)
        place(gantry_plan([0.0, math.pi], [hub_ramp]), 0, 0, "g")
        place(ramp_plan(*hub_ramp), 0, 0, "r")
    put("crown_domed", (0, 2 * STOREY, 0), scale=2.6)
    put("crown_hull", (-(R4 + 6.0 + R4), 2 * STOREY, 0), scale=2.6)
    put("bridge_span", (R4 + 2.0, STOREY, 0), math.pi / 2)
    put("pylon", (R4 + 5.6, 0, 0), math.pi / 2, key="e")
    put("bridge_ramp", (R4 + 16.0, 0, 0), -math.pi / 2)
    put("tube_walk", (-(R4 + 2.0), STOREY, 0), -math.pi / 2)
    put("pylon", (-(R4 + 4.6), 0, 0), math.pi / 2, key="w")

    # Tatooine: an adobe drum of bays (its door toward the hub) with a stone ramp wound up its back onto the roof, the parapet cut where it arrives; a flat
    # adobe block beside it with a straight stone ramp up its face to a landing, its parapet cut over the landing
    AX, AZ = 0.0, -(R4 + 6.0 + R4 + 2.0)
    if built.get("adobe_bay_r4"):
        place(storey_plan([math.pi / 2], 0.0, "adobe"), AX, AZ, "a0_", into=vig3)
        stone = (math.radians(191.25), -1)
        place(ramp_plan(*stone, piece="ramp_stone_arc_r4"), AX, AZ, "as", into=vig3)
        place(parapet_plan([stone]), AX, AZ, "al", into=vig3)
        disc(AX, AZ, STOREY, R4 - 0.28, "a", vig3)
        put("crown_adobe", (AX, STOREY, AZ), scale=1.6, key="a", into=vig3)
        # the block: 12 by 6, its south face at z = AZ + 3; the ramp along that face climbing east, its wall on its north side (the piece mirrored)
        bx0, bx1, bz0, bz1 = 9.0, 21.0, AZ - 3.0, AZ + 3.0
        block(((bx0 + bx1) / 2, STOREY / 2, (bz0 + bz1) / 2), (bx1 - bx0, STOREY, bz1 - bz0), "b", vig3)
        put("ramp_stone_straight", (bx0, 0, bz1), math.pi / 2, key="b", into=vig3, mirror=True)
        land0, land1 = bx0 + 8.0, bx0 + 9.2
        for (x0, x1, z0, z1, k) in ((bx0, land0, bz1 - 0.3, bz1, "s1"), (land1, bx1, bz1 - 0.3, bz1, "s2"), (bx0, bx1, bz0, bz0 + 0.3, "n"),
                                    (bx0, bx0 + 0.3, bz0 + 0.3, bz1 - 0.3, "w"), (bx1 - 0.3, bx1, bz0 + 0.3, bz1 - 0.3, "e")):
            block(((x0 + x1) / 2, STOREY + 0.35, (z0 + z1) / 2), (x1 - x0, 0.7, z1 - z0), "p" + k, vig3)

    # the tree village: a broadleaf great tree and two great conifers; ring platforms at one level joined by rope bridges, a stair up the first trunk,
    # a stair on the second from its ring to a wide platform with two huts, a wide platform on the third with a hut
    ta, tb, lv = 40.0, 52.0, 4.2
    tcz = -(TRUNK_R + 2.0 + 5.5 + TRUNK_R + 3.6)
    put("tree_great", (ta, 0, 0), key="a", into=vig2)
    put("tree_great_canopy", (ta, 0, 0), key="a", into=vig2)
    for k, (x, z) in (("b", (tb, 0.0)), ("c", (tb, tcz))):
        put("tree_great_conifer", (x, 0, z), 0.7 if k == "c" else 0.0, key=k, into=vig2)
        put("tree_great_conifer_needles", (x, 0, z), 0.7 if k == "c" else 0.0, key=k, into=vig2)
    put("platform_ring", (ta, lv, 0), key="a", into=vig2)
    put("platform_ring", (tb, lv, 0), key="b", into=vig2)
    put("trunk_stair", (ta, lv - STOREY, 0), 0.6, key="a", into=vig2)
    put("rope_bridge", (ta + TRUNK_R + 2.05, lv, 0), math.pi / 2, into=vig2)
    put("trunk_stair", (tb, lv, 0), 2.4, key="b", into=vig2)
    put("platform_wide", (tb, lv + STOREY, 0), into=vig2)
    put("hut_rustic", (tb, lv + STOREY, TRUNK_R + 2.1), into=vig2)
    put("hut_rustic", (tb - 2.6, lv + STOREY, -2.2), 4.0, key="2", into=vig2)
    put("rope_bridge", (tb, lv, -(TRUNK_R + 2.05)), math.pi, key="c", into=vig2)
    put("platform_wide", (tb, lv, tcz), 0.3, key="c", into=vig2)
    put("hut_rustic", (tb + 3.3, lv, tcz - 0.4), -0.1, key="3", into=vig2)
    bpy.context.view_layer.update()
    # nothing may overlap: each row piece against the others and the vignette (as one), and all of it against what was in the scene
    boxes = [(o.name, _world_box([o])) for o in row] + ([("claude_vignette", _world_box(vig))] if vig else []) + ([("claude_village", _world_box(vig2))] if vig2 else []) + ([("claude_desert", _world_box(vig3))] if vig3 else []) + [(o.name, _world_box([o])) for o in others]
    hit = lambda a, b: all(a[0][i] < b[1][i] and b[0][i] < a[1][i] for i in range(3))
    clash = [(boxes[i][0], boxes[j][0]) for i in range(len(boxes)) for j in range(i + 1, len(boxes)) if hit(boxes[i][1], boxes[j][1]) and (boxes[i][0].startswith("claude_") or boxes[j][0].startswith("claude_"))]
    tris = {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in built.items()}
    print("overlaps", clash)
    print("ARCH LIVE", tris)
    try:
        os.makedirs(os.path.join(ROOT, "tools", "refs", "cache"), exist_ok=True)
        with open(os.path.join(ROOT, "tools", "refs", "cache", "arch-live.log"), "w") as fh:
            fh.write(json.dumps({"overlaps": clash, "tris": tris, "vignette_at": list(P(ox, 0, 0))}, indent=1))
    except Exception as e:
        print("log", e)
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            sh = area.spaces.active.shading
            sh.type, sh.color_type = "SOLID", "VERTEX"
            for o in bpy.context.selected_objects:
                o.select_set(False)
            for o in row + vig + vig2 + vig3:
                o.select_set(True)
            region = next((r for r in area.regions if r.type == "WINDOW"), None)
            if region:
                try:
                    with bpy.context.temp_override(area=area, region=region):
                        bpy.ops.view3d.view_selected()
                except Exception as e:
                    print("frame", e)
    # views to render after the build (builtins.ARCH_SHOTS: [(file name, object to look at, offset from it, distance, (tilt, turn) in degrees)]),
    # written to tools/refs/cache/<name>.png for a session that cannot see the screen
    shots = getattr(builtins, "ARCH_SHOTS", None)
    area = next((a for a in (bpy.context.screen.areas if bpy.context.screen else []) if a.type == "VIEW_3D"), None)
    if shots and area:
        space = area.spaces.active
        r3d = space.region_3d
        region = next(r for r in area.regions if r.type == "WINDOW")
        scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
        space.overlay.show_overlays = False
        for o in bpy.context.selected_objects:
            o.select_set(False)
        with bpy.context.temp_override(area=area, region=region):
            for name, target, offset, dist, (tilt, turn) in shots:
                ob = bpy.data.objects.get(target)
                if not ob:
                    print("shot", name, "no object", target)
                    continue
                r3d.view_perspective = "PERSP"
                r3d.view_location = ob.location + Vector(offset)
                r3d.view_distance = dist
                r3d.view_rotation = Euler((math.radians(tilt), 0, math.radians(turn))).to_quaternion()
                scene.render.filepath = os.path.join(ROOT, "tools", "refs", "cache", name + ".png")
                bpy.ops.render.opengl(write_still=True, view_context=True)
        space.overlay.show_overlays = True
    return built

if __name__ == "__main__":
    import builtins
    if bpy.app.background:
        main()
    elif getattr(builtins, "ARCH_EXPORT", False):
        builtins.ARCH_EXPORT = False
        kit = main(reset=False, out=os.path.join(ROOT, "client", "public", "figures"))
        with open(os.path.join(ROOT, "tools", "refs", "cache", "arch-export.log"), "w") as fh:
            json.dump({k: v["tris"] for k, v in kit.items()}, fh)
    else:
        live()
