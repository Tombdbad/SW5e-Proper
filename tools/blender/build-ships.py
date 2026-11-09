# The starship kit (2026-11-09; the task: "the game's starship assets are very basic and their exterior scale is wrong ... modular starship assets
# in Mixar, so ships share one look per manufacturer or faction"). Seven kits of parts, one per maker or faction (tools/refs/ships.md):
#   imperial (Sienar, Kuat), rebel (Incom, Corellian military), republic (Kuat, Rendili), separatist (Hoersch-Kessel, Haor Chall),
#   mandalorian (MandalMotors), criminal (Hutt, Black Sun, pirates) and civilian (Corellian Engineering and the freighter yards),
# and a ship of each faction for each starship size, assembled from its kit AT REAL SIZE IN METRES (the game multiplies by UNITS_PER_M).
#   mixar.exe|blender --background --python tools/blender/build-ships.py -- <out-dir> [--lo] [--kit <dir>] [--only a,b]
# writes <out-dir>/ships.glb (meshes `ship_<faction>_<size>[_<role>]`) and shared/art/shipKit.json (each ship's faction, size, role, box in
# metres, triangles); --kit <dir> also writes <dir>/ships_kit.glb, every kit part on its own (`kit_<faction>_<part>`) for review in Mixar
# (not used by the game). `_REGION` per vertex:
#   0 hull (the faction's paint), 1 panel (darker plates, trenches), 2 glow (engines, lamps), 3 glass (canopies, viewports),
#   4 livery (stripes, the faction's accent), 5 metal (gunmetal: guns, struts, greebles)
# and `_AO` per vertex. The code's axes (y up; the bow is +x; +z starboard); the origin is the middle of the ship on the ground under it (for a
# ship that never lands, under its lowest point). Original shapes after the references (inspiration only): CC0.
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix, Euler, bvhtree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HULL, PANEL, GLOW, GLASS, LIVERY, METAL = 0, 1, 2, 3, 4, 5
# --lo (a phone's file, ships.lo.glb): rounds of fewer sides, half the scattered detail, and a coarser angle for smooth shading
HI = "--lo" not in sys.argv
SEGF = 1.0 if HI else 0.6
SMOOTH = math.radians(40 if HI else 62)

def few(n, least=1):
    """a count of scattered detail: all of it, or half in the phone's file"""
    return n if HI else max(least, n // 2)

# ---- The mesh builder: primitives in the code's axes under a stack of transforms ------------------------------------------------------------

class Hull:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.rl = self.bm.verts.layers.float.new("_REGION")
        # (decals: flat quads laid on the hull, kept out of the normals' recalculation, which cannot tell a lone quad's outside)
        self.dl = self.bm.faces.layers.int.new("decal")
        self.stack = [Matrix.Identity(4)]
        self.tree, self.tree_at = None, None

    # `with h.at(pos, rot, scale):` places what is built inside it
    def at(self, pos=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        s = (scale,) * 3 if isinstance(scale, (int, float)) else scale
        m = Matrix.Translation(Vector(pos)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        self.stack.append(self.stack[-1] @ m)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.stack.pop()

    def pair(self, fn):
        """fn(side) on the starboard side (+z) and mirrored to port"""
        for s in (1, -1):
            with self.at(scale=(1, 1, s)):
                fn(s)

    def v(self, p, r):
        c = self.stack[-1] @ Vector(p)
        vert = self.bm.verts.new(P(c.x, c.y, c.z))
        vert[self.rl] = float(r)
        return vert

    def face(self, vs):
        try:
            self.bm.faces.new(vs)
        except ValueError:
            pass

    # ---- Laying things on what is built: rays against the hull so far (in the ship's own axes; the stack of transforms is not used)
    def tree_now(self):
        bm = self.bm
        key = (len(bm.verts), len(bm.faces))
        if self.tree_at != key:
            bm.verts.index_update()
            cos = [v.co for v in bm.verts]
            self.tree = bvhtree.BVHTree.FromPolygons(cos, [[v.index for v in f.verts] for f in bm.faces])
            lo = [min(c[i] for c in cos) for i in range(3)]
            hi = [max(c[i] for c in cos) for i in range(3)]
            self.extent = max(hi[i] - lo[i] for i in range(3))
            self.tree_at = key
        return self.tree

    def cast(self, o, d):
        """the first point of the hull a ray from o along d meets, and the surface's normal facing the ray (Blender's axes), or None"""
        tree = self.tree_now()
        db = Vector(P(*d)).normalized()
        loc, nor, idx, dist = tree.ray_cast(Vector(P(*o)), db)
        if loc is None:
            return None
        n = Vector(nor).normalized()
        return loc, (-n if n.dot(db) > 0 else n)

    def far(self):
        self.tree_now()
        return self.extent * 2.0

    def top(self, x, z, default=0.0, below=None):
        """the height of the hull's top at (x, z) (a ray from above, or from `below` downwards)"""
        hit = self.cast((x, self.far() if below is None else below, z), (0, -1, 0))
        return default if hit is None else hit[0].z

    def sticks(self, items):
        """decals: for each (origin, direction, w, hgt, region[, up]) a flat quad w by hgt laid where the ray first meets the hull (or a decal laid
        before), lifted off it a little; it takes the surface's slant, and `up` (default the bow) turns it: w runs square to `up`, hgt along it"""
        bm = self.bm
        tree = self.tree_now()
        lift = max(0.003, self.extent * 0.0005)
        hits = []
        for it in items:
            o, d, w, hgt, region = it[:5]
            hit = self.cast(o, d)
            if not hit:
                continue
            loc, n = hit
            up = Vector(P(*(it[5] if len(it) > 5 else (1, 0, 0))))
            r = up.cross(n)
            if r.length < 1e-4:
                r = Vector((0, 0, 1)).cross(n)
            r.normalize()
            u = n.cross(r)
            # (only where the whole quad lies on the surface: each corner looked at from in front must meet it about where the middle did, so
            # that a plate does not stick out over a step, an edge or a curve)
            back = w + hgt
            tol = 0.04 * max(w, hgt) + lift
            fits = True
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c = loc + r * (sx * w / 2) + u * (sy * hgt / 2)
                got = tree.ray_cast(c + n * back, -n, back * 2)
                if got[0] is None or abs((got[0] - loc).dot(n)) > tol:
                    fits = False
                    break
            if fits:
                hits.append((loc, n, r, u, w, hgt, region))
        for loc, n, r, u, w, hgt, region in hits:
            c = loc + n * lift
            vs = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                vert = bm.verts.new(c + r * (sx * w / 2) + u * (sy * hgt / 2))
                vert[self.rl] = float(region)
                vs.append(vert)
            try:
                bm.faces.new(vs)[self.dl] = 1
            except ValueError:
                pass
        return len(hits)

    # rings along a line: sections (centre, u, v, ru, rv, n) in local space; n = 2 a circle, larger squarer
    def loft(self, sections, seg, regions, caps=True):
        seg = max(4, int(round(seg * SEGF)))
        rings = []
        for (c, u, w, ru, rv, n), g in zip(sections, regions):
            e = 2.0 / n
            ring = []
            for i in range(seg):
                a = 2 * math.pi * (i + 0.5) / seg
                ca, sa = math.cos(a), math.sin(a)
                ring.append(self.v(Vector(c) + Vector(u) * (ru * math.copysign(abs(ca) ** e, ca)) + Vector(w) * (rv * math.copysign(abs(sa) ** e, sa)), g))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                self.face([a[i], a[j], b[j], b[i]])
        if caps:
            self.face(rings[0][::-1])
            self.face(rings[-1])
        return rings

    def loft_x(self, st, seg=10, region=HULL, caps=True):
        """stations (x, y, z, ry, rz, n[, region]) along x"""
        secs = [((s[0], s[1], s[2]), (0, 1, 0), (0, 0, 1), max(1e-3, s[3]), max(1e-3, s[4]), s[5]) for s in st]
        regs = [s[6] if len(s) > 6 else region for s in st]
        return self.loft(secs, seg, regs, caps)

    def sphere(self, c, r, region=HULL, seg=12, rings=7, squash=(1, 1, 1)):
        st = []
        rings = max(3, int(round(rings * SEGF)))
        for i in range(rings + 1):
            t = math.pi * i / rings
            st.append((c[0] - r * squash[0] * math.cos(t), c[1], c[2], r * squash[1] * math.sin(t), r * squash[2] * math.sin(t), 2))
        self.loft_x(st, seg, region)

    def box(self, c, size, region=HULL, top=None, front=None):
        """a box about c; `top` (sx, sz) narrows its top (a frustum), `front` (sy, sz) its +x face (a wedge nose)"""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        tx, tz = (sx, sz) if top is None else (top[0] / 2, top[1] / 2)
        fy, fz = (1.0, 1.0) if front is None else (front[0] / size[1], front[1] / size[2])
        pts = {}
        for dx in (-1, 1):
            for dy in (-1, 1):
                for dz in (-1, 1):
                    kx, kz = (sx, sz) if dy < 0 else (tx, tz)
                    yy, zz = dy * sy, dz * kz
                    if dx > 0:
                        yy, zz = yy * fy, zz * fz
                    pts[(dx, dy, dz)] = self.v((c[0] + dx * kx, c[1] + yy, c[2] + zz), region)
        for q in (((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)), ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
                  ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)),
                  ((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)), ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))):
            self.face([pts[k] for k in q])

    def prism(self, outline, y0, y1, region=HULL, inset=0.0):
        """a plan outline [(x, z)] pushed up from y0 to y1; `inset` (0..1) draws the top in towards its middle (a bevel, a stepped deck)"""
        cx = sum(p[0] for p in outline) / len(outline)
        cz = sum(p[1] for p in outline) / len(outline)
        lo = [self.v((x, y0, z), region) for x, z in outline]
        hi = [self.v((x + (cx - x) * inset, y1, z + (cz - z) * inset), region) for x, z in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.face([lo[i], lo[j], hi[j], hi[i]])
        self.face(lo[::-1])
        self.face(hi)

    def plate(self, outline, z0, z1, region=HULL):
        """a side outline [(x, y)] pushed across from z0 to z1 (a fin, a wing seen edge on, a panel)"""
        a = [self.v((x, y, z0), region) for x, y in outline]
        b = [self.v((x, y, z1), region) for x, y in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.face([a[i], a[j], b[j], b[i]])
        self.face(a[::-1])
        self.face(b)

    def cyl(self, c, axis, r, length, region=HULL, seg=10, r2=None):
        """a cylinder (a cone to r2) along 'x', 'y' or 'z' about c"""
        r2 = r if r2 is None else r2
        rot = {"x": (0, 0, 0), "y": (0, 0, math.pi / 2), "z": (0, -math.pi / 2, 0)}[axis]
        with self.at(c, rot):
            self.loft_x([(-length / 2, 0, 0, r, r, 2), (length / 2, 0, 0, r2, r2, 2)], seg, region)

    def rod(self, a, b, r, region=METAL, seg=6, r2=None):
        a, b = Vector(a), Vector(b)
        d = b - a
        if d.length < 1e-6:
            return
        q = Vector((1, 0, 0)).rotation_difference(d.normalized())
        m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        self.stack.append(self.stack[-1] @ m)
        self.loft_x([(-d.length / 2, 0, 0, r, r, 2), (d.length / 2, 0, 0, r if r2 is None else r2, r if r2 is None else r2, 2)], seg, region)
        self.stack.pop()

    def torus(self, c, R, r, region=HULL, seg=24, seg2=6, a0=0.0, a1=2 * math.pi, squash=1.0):
        """a ring about the y axis through c, from angle a0 to a1 (an arc is closed at its ends); `squash` flattens its tube"""
        full = abs(a1 - a0 - 2 * math.pi) < 1e-6
        seg = max(6, int(round(seg * SEGF)))
        n = seg if full else seg + 1
        rings = []
        for i in range(n):
            t = a0 + (a1 - a0) * i / seg
            ring = []
            for k in range(seg2):
                b = 2 * math.pi * k / seg2
                rr = R + r * math.cos(b)
                ring.append(self.v((c[0] + rr * math.cos(t), c[1] + r * squash * math.sin(b), c[2] + rr * math.sin(t)), region))
            rings.append(ring)
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if full else [])
        for a, b in pairs:
            for k in range(seg2):
                j = (k + 1) % seg2
                self.face([a[k], a[j], b[j], b[k]])
        if not full:
            self.face(rings[0][::-1])
            self.face(rings[-1])

    def finish(self, reach):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f[self.dl]])
        # Smooth shading where neighbouring faces meet at less than SMOOTH (a round hull reads round), a hard edge elsewhere (and at every
        # decal's rim); the exporter splits the vertices only along the hard edges, which also keeps the file smaller than all-flat faces
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(math.pi) < SMOOTH
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        me.attributes.remove(me.attributes["decal"])
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        ao = me.attributes.new("_AO", "FLOAT", "POINT")
        for i, val in enumerate(occlusion(ob, reach)):
            ao.data[i].value = val
        return ob

def occlusion(ob, reach, rays=14):
    """vertex AO from rays cast against the ship itself; `reach` in metres (a ship's own scale: a fighter's gaps are not a cruiser's)"""
    me = ob.data
    verts = [v.co.copy() for v in me.vertices]
    tree = bvhtree.BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons])
    rnd = random.Random(7)
    dirs = []
    while len(dirs) < rays:
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.01 < d.length_squared <= 1:
            dirs.append(d.normalized())
    out = []
    for v in me.vertices:
        n = v.normal
        hits, tot = 0.0, 0
        for d in dirs:
            if d.dot(n) < 0:
                d = -d
            if d.dot(n) < 0.08:
                continue
            tot += 1
            loc, nor, idx, dist = tree.ray_cast(v.co + n * (reach * 0.01), d, reach)
            if loc is not None and dist > reach * 0.02:
                hits += 1.0 - dist / reach
        out.append(1.0 - 0.65 * (hits / max(1, tot)))
    return out

# ---- Common parts (every kit draws on these) -----------------------------------------------------------------------------------------------

def nozzle(h, x, y, z, r, length, seg=10):
    """an engine bell pointing aft (-x) from x: a gunmetal housing, a rim and the glow inside"""
    h.loft_x([(x - length, y, z, r * 1.05, r * 1.05, 2, METAL), (x - length * 0.85, y, z, r, r, 2, PANEL), (x, y, z, r * 0.85, r * 0.85, 2, METAL)], seg, METAL)
    h.cyl((x - length - 0.002 * max(1, r), y, z), "x", r * 0.8, max(0.02, r * 0.04), GLOW, seg)

def cannon(h, x, y, z, length, r, seg=6):
    h.cyl((x + length / 2, y, z), "x", r, length, METAL, seg)
    h.cyl((x + length * 0.15, y, z), "x", r * 1.8, length * 0.3, METAL, seg)

def gear(h, pts, top, r):
    """landing struts from the hull (y = top) to pads on the ground at (x, z)"""
    for x, z in pts:
        h.rod((x, top, z), (x, r * 0.6, z), r, METAL, 6)
        h.cyl((x, r * 0.3, z), "y", r * 2.6, r * 0.6, METAL, 8)

def canopy(h, x, y, z, length, width, height, seg=10):
    """a canopy: a half-buried lens of glass with a frame"""
    h.loft_x([(x - length / 2, y, z, height * 0.2, width * 0.3, 2.4, GLASS), (x - length * 0.15, y, z, height, width / 2, 2.4, GLASS),
              (x + length * 0.3, y, z, height * 0.75, width * 0.42, 2.4, GLASS), (x + length / 2, y, z, height * 0.1, width * 0.12, 2, GLASS)], seg, GLASS)

def dish(h, c, r, tilt=0.6):
    with h.at(c, (0, 0, tilt)):
        h.loft_x([(0, 0, 0, r * 0.15, r * 0.15, 2, METAL), (r * 0.25, 0, 0, r, r, 2, PANEL), (r * 0.3, 0, 0, r * 0.95, r * 0.95, 2, PANEL)], 12, PANEL)
        h.rod((0.3 * r, 0, 0), (0.9 * r, 0, 0), r * 0.05, METAL, 4)

def turret(h, c, r, barrels=2, aim=0.0, seg=10):
    h.sphere((c[0], c[1], c[2]), r, PANEL, seg, seg // 2, (1, 0.6, 1))
    with h.at(c, (0, aim, 0)):
        for k in range(barrels):
            dz = (k - (barrels - 1) / 2) * r * 0.5
            cannon(h, r * 0.5, r * 0.2, dz, r * 2.2, r * 0.09, 6 if seg > 8 else 4)

def greebles(h, x0, x1, z0, z1, y, n, seed, size, region=METAL):
    """small boxes scattered on a deck (pipes, hatches, vents)"""
    rnd = random.Random(seed)
    for _ in range(few(n)):
        w, d, t = rnd.uniform(0.3, 1) * size, rnd.uniform(0.3, 1) * size, rnd.uniform(0.15, 0.6) * size
        x, z = rnd.uniform(x0 + w / 2, x1 - w / 2), rnd.uniform(z0 + d / 2, z1 - d / 2)
        h.box((x, y + t / 2, z), (w, t, d), region if rnd.random() < 0.7 else PANEL)

def stripe(h, x0, x1, y, z, w, t, region=LIVERY):
    h.box(((x0 + x1) / 2, y, z), (x1 - x0, t, w), region)

def wedge(h, length, beam, y0, y1, nose=0.0, inset=0.0, region=HULL, x=0.0):
    """a dagger in plan: a point (or a blunt nose `nose` wide) at the bow, the full beam astern"""
    L2 = length / 2
    out = [(x + L2, -nose / 2), (x - L2, -beam / 2), (x - L2, beam / 2), (x + L2, nose / 2)] if nose else [(x + L2, 0), (x - L2, -beam / 2), (x - L2, beam / 2)]
    h.prism(out, y0, y1, region, inset)

# ---- The dressing of a big ship (2026-11-09, second pass: "the capital ships are simple, blocky shapes"): decals laid on what is built by rays
# (Hull.sticks: a quad of two triangles each), and guns, masts and fins stood on the hull where a ray finds its top. They follow whatever shape
# the hull has, so one set serves every kit. Both flanks always (they are not to be called inside h.pair).

def ports(h, x0, x1, ys, n, w, hgt, region=GLOW, skip=0.0, seed=0, dark=GLASS):
    """rows of ports along both flanks: at each height in ys, n of them from x0 to x1, where a ray from abeam meets the hull; `skip` the share
    that are dark glass rather than lit"""
    rnd = random.Random(seed)
    far = h.far()
    n2 = few(n)
    w2 = w * n / n2
    items = []
    for y in ys:
        for k in range(n2):
            x = x0 + (x1 - x0) * (k + 0.5) / n2
            g = dark if rnd.random() < skip else region
            for s in (1, -1):
                items.append(((x, y, s * far), (0, 0, -s), w2 * 0.7, hgt, g))
    h.sticks(items)

def facade(h, x, z, ys, n, span, w, hgt, axis="x", region=GLOW, skip=0.3, seed=0):
    """windows on the faces of a tower or block standing at (x, z): rows at each height, n across `span`, looked at along `axis` from both ends"""
    rnd = random.Random(seed)
    far = h.far()
    items = []
    for y in ys:
        for k in range(few(n)):
            t = -span / 2 + span * (k + 0.5) / few(n)
            g = GLASS if rnd.random() < skip else region
            for s in (1, -1):
                if axis == "x":
                    items.append(((x + s * far, y, z + t), (-s, 0, 0), w, hgt, g, (0, 1, 0)))
                else:
                    items.append(((x + t, y, z + s * far), (0, 0, -s), w, hgt, g, (0, 1, 0)))
    h.sticks(items)

def plates(h, x0, x1, zmax, cell, seed, p=0.2, region=PANEL, below=False):
    """panels of plating on the deck (or, `below`, the keel), the same on both sides of the centre line: a grid of cells `cell` long and 0.7 of
    that wide, a share p of them plated (a few two cells long), where a plate lies flat"""
    rnd = random.Random(seed)
    far = h.far()
    cw = cell * 0.7
    items = []
    nx, nz = int((x1 - x0) / cell), max(1, int(zmax / cw))
    for i in range(nx):
        for j in range(nz):
            if rnd.random() > (p if HI else p * 0.5):
                continue
            span = 2 if rnd.random() < 0.3 and i < nx - 1 else 1
            x, z = x0 + cell * (i + span / 2), cw * (j + 0.5)
            for s in (1, -1):
                items.append(((x, -far if below else far, s * z), (0, 1 if below else -1, 0), cw * 0.86, cell * (span - 0.12), region))
    h.sticks(items)

def lines(h, x0, x1, zmax, n, w, region=PANEL, dashes=8, below=False):
    """panel lines across the deck: n of them from x0 to x1, each a row of dashes across the beam (they break where the deck steps)"""
    far = h.far()
    items = []
    for k in range(few(n, 2)):
        x = x0 + (x1 - x0) * (k + 0.5) / few(n, 2)
        for j in range(dashes):
            z = -zmax + 2 * zmax * (j + 0.5) / dashes
            items.append(((x, -far if below else far, z), (0, 1 if below else -1, 0), 2 * zmax / dashes * 0.92, w, region))
    h.sticks(items)

def spine_lines(h, x0, x1, zs, n, w, region=PANEL):
    """panel lines along the deck at each z in zs (both sides), in n dashes from x0 to x1"""
    far = h.far()
    items = []
    for z in zs:
        for j in range(few(n, 2)):
            x = x0 + (x1 - x0) * (j + 0.5) / few(n, 2)
            for s in ((1, -1) if z else (1,)):
                items.append(((x, far, s * z), (0, -1, 0), w, (x1 - x0) / few(n, 2) * 0.9, region))
    h.sticks(items)

def bay(h, o, d, w, hgt, up=(0, 1, 0)):
    """a hangar mouth: a dark opening in a lit rim, where the ray from o along d meets the hull"""
    h.sticks([(o, d, w, hgt, GLOW, up)])
    h.sticks([(o, d, w * 0.94, hgt * 0.86, GLASS, up)])

def on_top(h, x, z, below=None):
    return h.top(x, z, None, below)

def guns(h, pts, r, barrels=2, aim=0.0):
    """turrets stood on the hull's top at each (x, z), both sides of the centre line"""
    for x, z in pts[::1 if HI else 2]:
        for s in ((1, -1) if z else (1,)):
            y = on_top(h, x, s * z)
            if y is not None:
                turret(h, (x, y, s * z), r, barrels, aim, 8)

def mast(h, x, z, r, hgt, arms=2, lamp=True):
    """an antenna mast stood on the hull at (x, z): a rod with cross-arms and a lamp at its tip"""
    y = on_top(h, x, z)
    if y is None:
        return
    h.rod((x, y, z), (x, y + hgt, z), r, METAL, 5, r * 0.5)
    for k in range(arms):
        yy = y + hgt * (0.45 + 0.2 * k)
        h.rod((x, yy, z - hgt * 0.12), (x, yy, z + hgt * 0.12), r * 0.4, METAL, 4)
    if lamp:
        h.sphere((x, y + hgt, z), r * 1.4, GLOW, 6, 3)

def domes(h, pts, r, region=PANEL):
    """shield and sensor domes half sunk into the hull's top at each (x, z) (both sides)"""
    for x, z in pts:
        for s in ((1, -1) if z else (1,)):
            y = on_top(h, x, s * z)
            if y is not None:
                h.sphere((x, y, s * z), r, region, 12, 6, (1, 0.55, 1))

def blocks(h, x0, x1, zmax, n, seed, size, hgt, region=HULL):
    """superstructure: small stepped blocks stood on the deck (both sides), each with its lit band"""
    rnd = random.Random(seed)
    for _ in range(few(n)):
        x, z = rnd.uniform(x0, x1), rnd.uniform(0, zmax)
        w, d, t = rnd.uniform(0.5, 1) * size, rnd.uniform(0.4, 1) * size, rnd.uniform(0.4, 1) * hgt
        for s in ((1, -1) if z > d else (1,)):
            y = on_top(h, x, s * z)
            if y is None:
                continue
            h.box((x, y + t / 2 - t * 0.05, s * z), (w, t, d), region, top=(w * 0.8, d * 0.8))
            h.box((x, y + t * 0.7, s * z), (w * 0.92, t * 0.08, d * 1.01), GLASS)

def dagger_dress(h, length, beam, height, tiers=2, x=0.0, y=0.0, seed=1, rows=2, n=40, guns_n=0, gun_r=1.0, deck=1.0, plate=PANEL):
    """the dressing of an imp_dagger of the same measures: rows of ports along the lower hull's flank and each tier's, plating and panel lines on
    the decks and keel, and guns_n turrets a side along the top deck's shoulders"""
    lower = height * 0.42
    L2 = length / 2
    unit = length * 0.006
    ports(h, x - L2 * 0.93, x + L2 * 0.75, [y + lower * 0.55 * (k + 1) / (rows + 1) for k in range(rows)], n, unit * 1.2, lower * 0.035 + unit * 0.05, skip=0.2, seed=seed)
    yy = y + lower
    for k in range(tiers):
        f = 0.82 - 0.22 * k
        th = (height - lower) * 0.6 / tiers
        xc = x - length * (1 - f) / 2
        ports(h, xc - length * f / 2 * 0.92, xc + length * f / 2 * 0.55, [yy + th * 0.45], int(n * f * 0.8), unit * 1.2, th * 0.1, skip=0.3, seed=seed + k + 1)
        yy += th
    plates(h, x - L2 * 0.97, x + L2 * 0.85, beam * 0.48, length * 0.03 / deck, seed, 0.16, region=plate)
    lines(h, x - L2 * 0.97, x + L2 * 0.7, beam * 0.5, int(22 * deck), unit * 0.25, dashes=10)
    spine_lines(h, x - L2 * 0.9, x + L2 * 0.8, [0, beam * 0.12, beam * 0.26], 14, unit * 0.3)
    if guns_n:
        pts = []
        for k in range(guns_n):
            xx = x - L2 * 0.75 + length * 0.75 * (k + 0.5) / guns_n
            half = beam / 2 * (x + L2 - xx) / length
            pts.append((xx, half * 0.72))
        guns(h, pts, gun_r)

# ---- IMPERIAL (Sienar, Kuat): ball cockpits, hexagonal solar wings on pylons, layered daggers with a stepped tower, grey with dark panels, blue-white engines

def imp_ball(h, c, r):
    """the ball cockpit: a sphere with an octagonal window framed by spokes, a hatch ring on top"""
    h.sphere(c, r, HULL, 14, 8)
    h.cyl((c[0] + r * 0.93, c[1], c[2]), "x", r * 0.48, r * 0.12, GLASS, 8)
    for k in range(8):
        a = k * math.pi / 4
        h.rod((c[0] + r * 0.99, c[1], c[2]), (c[0] + r * 0.99, c[1] + math.sin(a) * r * 0.5, c[2] + math.cos(a) * r * 0.5), r * 0.035, PANEL, 4)
    h.cyl((c[0] + r * 0.98, c[1], c[2]), "x", r * 0.5, r * 0.06, PANEL, 8)
    h.cyl((c[0], c[1] + r * 0.97, c[2]), "y", r * 0.35, r * 0.1, PANEL, 10)
    nozzle(h, c[0] - r * 0.85, c[1], c[2], r * 0.3, r * 0.2, 8)

def imp_pylon(h, c, r, reach):
    """the wing pylon out to +z with its collar and the rib it carries"""
    with h.at(c, (0, -math.pi / 2, 0)):
        h.loft_x([(0, 0, 0, r, r * 1.2, 2.4, HULL), (reach * 0.8, 0, 0, r * 0.7, r * 0.8, 2.4, HULL), (reach, 0, 0, r * 0.9, r * 1.4, 3, PANEL)], 8, HULL)

def imp_wing(h, z, height, width, kind="hex", t=0.18):
    """a solar wing in the x-y plane at z: 'hex' (a fighter's six sides), 'dagger' (an interceptor's bent blades), 'square'"""
    hw, hh = width / 2, height / 2
    if kind == "hex":
        out = [(hw * math.cos(a), hh * math.sin(a)) for a in [k * math.pi / 3 + math.pi / 6 for k in range(6)]]
        out = [(x * 1.0, y) for x, y in out]
    elif kind == "dagger":
        out = [(hw * 0.95, hh), (-hw * 0.55, hh * 0.9), (-hw * 0.45, 0), (-hw * 0.55, -hh * 0.9), (hw * 0.95, -hh), (hw * 0.15, 0)]
    else:
        out = [(hw, hh), (-hw, hh), (-hw, -hh), (hw, -hh)]
    h.plate(out, z - t / 2, z + t / 2, PANEL)
    # the frame round it and its spars: a lighter rib through the middle and out to each corner
    for (x, y) in out:
        h.rod((0, 0, z + t * 0.6), (x, y, z + t * 0.6), t * 0.25, HULL, 4)
    n = len(out)
    for i in range(n):
        a, b = out[i], out[(i + 1) % n]
        h.rod((a[0], a[1], z + t * 0.55), (b[0], b[1], z + t * 0.55), t * 0.22, HULL, 4)
    h.cyl((0, 0, z + t), "z", height * 0.07, t * 1.2, HULL, 8)

def imp_dagger(h, length, beam, height, tiers=2, x=0.0, y=0.0):
    """the layered dagger: a lower hull and stepped upper decks narrowing upward, each with a dark trench along its edge"""
    lower = height * 0.42
    with h.at((x, y, 0)):
        wedge(h, length, beam, 0, lower * 0.55, nose=0, inset=0.0, region=HULL)
        wedge(h, length * 0.98, beam * 0.98, lower * 0.55, lower * 0.62, region=PANEL)
        wedge(h, length * 0.97, beam * 0.97, lower * 0.62, lower, inset=0.08, region=HULL)
        yy = lower
        for k in range(tiers):
            f = 0.82 - 0.22 * k
            th = (height - lower) * 0.6 / tiers
            wedge(h, length * f, beam * f * 0.92, yy, yy + th, inset=0.06, region=HULL, x=-length * (1 - f) / 2)
            wedge(h, length * f * 0.96, beam * f * 0.06, yy + th, yy + th * 1.04, region=PANEL, x=-length * (1 - f) / 2)
            yy += th
    return y + yy

def imp_tower(h, x, y, w, hgt):
    """the command tower: a stepped neck, the T of the bridge and two shield domes on stalks"""
    # (a plinth of two steps, the neck, the bridge's T with its window band, the domes and a mast between them)
    h.box((x - w * 0.1, y + hgt * 0.04, 0), (w * 1.5, hgt * 0.1, w * 1.2), HULL, top=(w * 1.35, w * 1.05))
    h.box((x - w * 0.05, y + hgt * 0.12, 0), (w * 1.2, hgt * 0.08, w * 0.95), PANEL, top=(w * 1.1, w * 0.85))
    h.box((x, y + hgt * 0.38, 0), (w * 0.9, hgt * 0.5, w * 0.7), HULL, top=(w * 0.6, w * 0.5))
    h.box((x - w * 0.42, y + hgt * 0.3, 0), (w * 0.16, hgt * 0.5, w * 0.5), PANEL, top=(w * 0.1, w * 0.35))
    h.box((x, y + hgt * 0.68, 0), (w * 0.55, hgt * 0.2, w * 1.5), HULL, top=(w * 0.5, w * 1.46))
    h.box((x + w * 0.05, y + hgt * 0.7, 0), (w * 0.5, hgt * 0.04, w * 1.52), GLASS)
    h.box((x, y + hgt * 0.62, 0), (w * 0.5, hgt * 0.03, w * 1.4), PANEL)
    h.box((x - w * 0.05, y + hgt * 0.8, 0), (w * 0.35, hgt * 0.04, w * 0.5), PANEL)
    h.rod((x - w * 0.1, y + hgt * 0.8, 0), (x - w * 0.1, y + hgt * 1.08, 0), w * 0.025, METAL, 5, w * 0.01)
    h.pair(lambda s: (h.rod((x, y + hgt * 0.78, w * 0.4), (x, y + hgt * 0.9, w * 0.45), w * 0.05, METAL, 6),
                      h.sphere((x, y + hgt * 0.96, w * 0.45), w * 0.14, PANEL, 12, 7)))

def imp_engines(h, x, y, rs, zs):
    for r, (yy, z) in zip(rs, zs):
        nozzle(h, x, y + yy, z, r, r * 0.8, 12)

def ship_imperial_tiny(h):
    # a TIE drone: a cockpitless ball with two square panels (the unmanned picket of the swarm), 3.4 m
    imp_ball(h, (0, 2.0, 0), 0.75)
    def side(s):
        imp_pylon(h, (0, 2.0, 0.6), 0.22, 0.8)
        with h.at((0, 2.0, 0)):
            imp_wing(h, 1.55, 3.6, 2.6, "square", 0.12)
    h.pair(side)

def ship_imperial_small(h):
    # the line fighter: ball between two hexagonal wings, standing on the wings' lower edges; 6.3 x 6.4 x 7.5 m
    imp_ball(h, (0, 3.75, 0), 1.55)
    def side(s):
        imp_pylon(h, (0, 3.75, 1.3), 0.45, 1.6)
        with h.at((0, 3.75, 0)):
            imp_wing(h, 3.0, 7.5, 6.3, "hex", 0.2)
    h.pair(side)
    cannon(h, 1.2, 3.2, 0.35, 0.6, 0.06)
    cannon(h, 1.2, 3.2, -0.35, 0.6, 0.06)

def ship_imperial_small_shuttle(h):
    # a shuttle: a boxy cockpit at the bow, a tall dorsal fin and two wings folded down for landing; 14 x 11 x 7 m
    h.loft_x([(-6.5, 2.6, 0, 1.2, 1.6, 3), (-5, 2.6, 0, 1.6, 2.0, 4), (3, 2.6, 0, 1.5, 1.9, 4), (5.5, 2.4, 0, 1.0, 1.3, 3), (7.2, 2.2, 0, 0.35, 0.5, 2.5)], 10, HULL)
    h.box((4.6, 3.3, 0), (2.4, 0.8, 2.4), GLASS, top=(1.6, 1.8))
    h.plate([(-6, 4.0), (-1.5, 4.0), (-3.0, 7.0), (-5.2, 7.0)], -0.12, 0.12, HULL)
    stripe(h, -4.6, -2.6, 6.5, 0, 0.26, 0.6, PANEL)
    def wing(s):
        with h.at((-1.5, 2.2, 1.7), (math.radians(68), 0, 0)):
            h.plate([(2.0, 0), (-3.4, 0), (-2.4, 4.0), (0.6, 4.0)], -0.12, 0.12, HULL)
            stripe(h, -2.6, 0.6, 3.6, 0, 0.26, 0.2, PANEL)
            cannon(h, 0.4, 3.9, 0, 1.2, 0.07)
    h.pair(wing)
    imp_engines(h, -6.5, 2.6, [0.55, 0.55], [(0, 0.8), (0, -0.8)])
    gear(h, [(-4.5, 1.2), (-4.5, -1.2), (4.0, 0)], 1.2, 0.12)

def ship_imperial_medium(h):
    # a transport: a long hull with a ball bridge and a dark keel of clamps (the Gozanti's line); 34 x 14 x 9 m
    h.loft_x([(-16, 4.2, 0, 2.8, 4.0, 3), (-10, 4.4, 0, 3.4, 5.0, 3.5), (6, 4.4, 0, 3.2, 4.6, 3.5), (13, 4.0, 0, 2.2, 2.6, 3), (16.5, 3.6, 0, 0.7, 0.9, 2.5)], 12, HULL)
    imp_dagger(h, 20, 9, 2.2, 1, x=-1, y=7.4)
    imp_ball(h, (12.5, 5.4, 0), 1.6)
    h.box((-2, 1.3, 0), (22, 0.9, 3.0), PANEL)
    for x in (-9, -2, 5):
        h.pair(lambda s, x=x: h.box((x, 1.6, 2.6), (2.0, 1.8, 0.5), METAL))
    h.pair(lambda s: h.box((-11, 4.2, 5.2), (8, 2.0, 2.4), HULL, top=(6, 1.8)))
    imp_engines(h, -16, 4.2, [1.0, 1.0, 0.8, 0.8], [(0.8, 1.6), (0.8, -1.6), (-1.0, 1.0), (-1.0, -1.0)])
    h.pair(lambda s: nozzle(h, -15, 4.2, 5.2, 0.8, 0.8))
    turret(h, (4, 7.8, 0), 0.8)
    gear(h, [(-10, 3.0), (-10, -3.0), (10, 2.0), (10, -2.0)], 1.5, 0.25)

def ship_imperial_large(h):
    # a corvette: the dagger in little, a squat tower aft and a cluster of engines; 100 x 36 x 22 m
    top = imp_dagger(h, 100, 36, 14, 2, y=3.0)
    imp_tower(h, -32, top, 10, 8)
    greebles(h, -20, 30, -6, 6, top - 1.0, 18, 3, 1.6)
    imp_engines(h, -50, 9, [3.4, 3.4, 2.4], [(0, 7), (0, -7), (2.5, 0)])
    h.pair(lambda s: (h.box((-47, 6.0, 12), (6, 4, 6), HULL, top=(5, 4)), nozzle(h, -50, 6.0, 12, 1.5, 1.6)))
    dagger_dress(h, 100, 36, 14, 2, y=3.0, seed=4, rows=2, n=34, guns_n=4, gun_r=1.1, plate=LIVERY)
    blocks(h, -24, 18, 7, 8, 5, 3.5, 1.6)
    domes(h, [(8, 0), (-6, 4)], 1.2)
    mast(h, -38, 0, 0.12, 7)
    mast(h, -26, 2.5, 0.08, 4, 1)
    bay(h, (5, -50, 0), (0, 1, 0), 9, 5, (1, 0, 0))
    h.pair(lambda s: bay(h, (-5, 5.0, s * 60), (0, 0, -s), 7, 1.8))
    gear(h, [(-30, 9), (-30, -9), (25, 0)], 3.0, 0.6)

def ship_imperial_huge(h):
    # the star destroyer: a dagger over a lower dagger, stepped decks, the tower astern with its domes; 1200 x 640 x 300 m
    with h.at((0, 0, 0)):  # (the keel: a dagger under the waterline)
        wedge(h, 1150, 600, -110, 0, region=HULL)
        wedge(h, 900, 300, -150, -110, region=PANEL)
    top = imp_dagger(h, 1200, 640, 170, 3, y=0)
    imp_tower(h, -470, top, 70, 120)
    greebles(h, -300, 300, -60, 60, top - 6, 40, 11, 18)
    imp_engines(h, -600, 40, [55, 55, 55, 22, 22, 22, 22], [(0, 110), (0, -110), (10, 0), (60, 200), (60, -200), (-20, 200), (-20, -200)])
    h.box((0, -150, 0), (40, 10, 30), PANEL)
    # (the dressing: ports along the hull, the keel's and each deck's, plating, the trenches across the decks, batteries on the shoulders,
    # a field of superstructure about the tower, the ventral bay)
    dagger_dress(h, 1200, 640, 170, 3, seed=11, rows=3, n=70, guns_n=9, gun_r=11, deck=1.3, plate=LIVERY)
    ports(h, -520, 470, [-30, -75], 50, 8, 4, skip=0.3, seed=12)
    plates(h, -500, 450, 260, 40, 13, 0.15, region=LIVERY, below=True)
    blocks(h, -420, 150, 110, 28, 14, 40, 18)
    domes(h, [(-120, 0), (60, 40)], 16)
    facade(h, -470, 0, [top + 50, top + 64, top + 86], 10, 60, 3, 2.4, axis="x", seed=15)
    bay(h, (60, -400, 0), (0, 1, 0), 110, 40, (1, 0, 0))
    h.pair(lambda s: (h.box((-560, 15, 270), (60, 30, 30), PANEL), mast(h, -360, 120, 1.2, 40)))

def ship_imperial_gargantuan(h):
    # the dreadnought: a long narrow dagger, a city of decks along its spine, a tall tower and a wall of engines; 3300 x 900 x 300 m
    with h.at((0, 0, 0)):  # (the keel: a dagger under the waterline)
        wedge(h, 3200, 860, -60, 0, region=HULL)
    top = imp_dagger(h, 3300, 900, 160, 2, y=0)
    for k, x in enumerate((-900, -450, 0, 450)):
        h.box((x, top + 20, 0), (260 - k * 30, 40, 220 - k * 40), HULL, top=(200 - k * 30, 150 - k * 40))
    greebles(h, -1200, 700, -120, 120, top, 60, 13, 40)
    imp_tower(h, -1380, top + 40, 120, 220)
    imp_engines(h, -1650, 50, [60] * 5 + [35] * 6, [(0, z) for z in (-260, -130, 0, 130, 260)] + [(70, z) for z in (-325, -195, -65, 65, 195, 325)])
    # (the dressing: the city of decks lit, plating and trenches, batteries all along both shoulders, a trench of a bay under each flank)
    dagger_dress(h, 3300, 900, 160, 2, seed=21, rows=3, n=110, guns_n=10, gun_r=18, deck=1.6, plate=LIVERY)
    ports(h, -1500, 1300, [-25], 70, 14, 8, skip=0.3, seed=22)
    for k, x in enumerate((-900, -450, 0, 450)):
        facade(h, x, 0, [top + 14, top + 28], 12, 200 - k * 40, 7, 4, axis="z", seed=23 + k)
    blocks(h, -1250, 900, 200, 36, 24, 70, 30)
    domes(h, [(-700, 0), (200, 0), (900, 0)], 30)
    h.pair(lambda s: bay(h, (300, 20, s * 2000), (0, 0, -s), 260, 18))
    bay(h, (600, -900, 0), (0, 1, 0), 240, 60, (1, 0, 0))
    for x in (-1100, -300, 600):
        mast(h, x, 0, 3, 70)

# ---- REBEL (Incom, Corellian military, Mon Calamari): needle fuselages, split S-foils with tip cannons, round nacelles with intake rings,
# bubble canopies and astromech domes; hammerhead bows and banks of round engines; off-white with red-orange stripes, orange engine glow

def reb_fuselage(h, x0, x1, y, r, nose=0.18):
    L = x1 - x0
    h.loft_x([(x0, y, 0, r * 0.95, r * 1.1, 3.2), (x0 + L * 0.35, y, 0, r, r * 1.1, 3.2), (x0 + L * 0.7, y - r * 0.1, 0, r * 0.62, r * 0.7, 3),
              (x1, y - r * 0.3, 0, r * nose, r * nose, 2.5)], 10, HULL)
    stripe(h, x0 + L * 0.72, x0 + L * 0.82, y + r * 0.5, 0, r * 1.25, r * 0.1)

def reb_nacelle(h, x, y, z, r, length):
    h.loft_x([(x - length, y, z, r * 0.9, r * 0.9, 2, HULL), (x - length * 0.8, y, z, r, r, 2), (x - 0.1 * length, y, z, r, r, 2),
              (x, y, z, r * 1.08, r * 1.08, 2, METAL)], 10, HULL)
    h.cyl((x + 0.02 * length, y, z), "x", r * 0.75, 0.04 * length, PANEL, 10)
    h.cyl((x - length - 0.02 * length, y, z), "x", r * 0.7, 0.03 * length, GLOW, 10)
    stripe(h, x - length * 0.45, x - length * 0.3, y + r * 0.85, z, r * 0.6, r * 0.2)

def reb_sfoil(h, root, span, chord, angle, tip_gun=True, livery=True):
    """an S-foil out to +z from `root`, opened `angle` from flat: a thin tapering plate with its stripe and the cannon at its tip"""
    with h.at(root, (angle, 0, 0)):
        h.prism([(chord * 0.5, 0), (-chord * 0.5, 0), (-chord * 0.42, span), (chord * 0.05, span)], -0.06 * chord, 0.06 * chord, HULL)
        if livery:
            h.prism([(chord * 0.1, span * 0.45), (-chord * 0.45, span * 0.45), (-chord * 0.44, span * 0.62), (chord * 0.08, span * 0.62)], 0.06 * chord, 0.075 * chord, LIVERY)
        if tip_gun:
            cannon(h, -chord * 0.3, 0, span, chord * 1.6, chord * 0.04)
            h.cyl((-chord * 0.2, 0, span), "x", chord * 0.07, chord * 0.5, METAL, 6)

def reb_astro(h, x, y, z, r=0.32):
    h.cyl((x, y, z), "y", r, r * 1.2, PANEL, 10)
    h.sphere((x, y + r * 0.6, z), r * 0.98, METAL, 10, 5, (1, 0.8, 1))
    h.cyl((x + r * 0.7, y + r * 0.9, z), "x", r * 0.15, r * 0.2, GLOW, 6)

def reb_hammer(h, x, y, w, hgt, d):
    """the hammerhead bow: a broad rounded block, its viewports a dark band, a red stripe round it"""
    h.loft_x([(x - d / 2, y, 0, hgt * 0.42, w * 0.38, 3), (x - d * 0.3, y, 0, hgt / 2, w / 2, 3.5), (x + d * 0.35, y, 0, hgt / 2, w / 2, 3.5),
              (x + d / 2, y - hgt * 0.05, 0, hgt * 0.38, w * 0.4, 3)], 14, HULL)
    h.box((x + d * 0.42, y + hgt * 0.12, 0), (d * 0.12, hgt * 0.09, w * 0.66), GLASS)
    # (the red band round the hammerhead: a ring of its own section a little proud of it)
    h.loft_x([(x - d * 0.2, y, 0, hgt / 2 * 1.012, w / 2 * 1.012, 3.5, LIVERY), (x + d * 0.05, y, 0, hgt / 2 * 1.012, w / 2 * 1.012, 3.5, LIVERY)], 14, LIVERY)
    h.pair(lambda s: h.box((x - d * 0.08, y, w * 0.5), (d * 0.25, hgt * 0.5, w * 0.03), LIVERY))

def reb_bank(h, x, y, rows, cols, r, gap):
    """a block of round engines: rows x cols bells in a housing"""
    W, H = cols * (2 * r + gap), rows * (2 * r + gap)
    h.box((x + r * 1.5, y, 0), (r * 3, H + gap, W + gap), HULL, front=(H * 0.7, W * 0.8))
    for i in range(rows):
        for j in range(cols):
            nozzle(h, x, y + (i - (rows - 1) / 2) * (2 * r + gap), (j - (cols - 1) / 2) * (2 * r + gap), r, r * 0.6, 10)

def mon_cal(h, length, beam, height, pods=4, seed=1):
    """a Mon Calamari hull: a smooth lofted body swollen here and there, pods along its flanks, rows of lit ports"""
    L = length
    rnd = random.Random(seed)
    st = []
    for k in range(9):
        t = k / 8
        swell = 1 + 0.12 * math.sin(t * 9 + seed)
        prof = math.sin(math.pi * min(1, 0.12 + t * 0.95)) ** 0.6
        st.append((-L / 2 + L * t, height / 2, 0, height / 2 * prof * swell + 1e-3, beam / 2 * prof * swell * 0.8 + 1e-3, 2.2))
    h.loft_x(st, 14, HULL)
    for k in range(pods):
        x = -L * 0.35 + L * 0.6 * k / max(1, pods - 1)
        r = height * rnd.uniform(0.14, 0.22)
        h.pair(lambda s, x=x, r=r: h.sphere((x, height * 0.45, beam * 0.38), r, HULL, 10, 5, (2.2, 1, 1)))
    # (lobes along the back and under the belly, the swellings that make it grown rather than built; the ports are laid on by mon_cal_dress)
    for k in range(pods + 1):
        x = -L * 0.38 + L * 0.7 * k / max(1, pods)
        r = height * rnd.uniform(0.16, 0.26)
        h.sphere((x, height * rnd.uniform(0.72, 0.8), 0), r, HULL, 12, 6, (2.6, 0.8, 1.3))
        if k % 2:
            h.sphere((x, height * 0.22, 0), r * 0.8, HULL, 10, 5, (2.4, 0.7, 1.2))
    nozzle(h, -L / 2 + L * 0.02, height / 2, 0, height * 0.18, height * 0.2, 12)
    h.pair(lambda s: nozzle(h, -L / 2 + L * 0.05, height * 0.45, beam * 0.2, height * 0.12, height * 0.15, 10))

def ship_rebel_tiny(h):
    # a droid courier: a short needle with two stub foils, a droid's dome for a cockpit and twin nacelles; 4.2 x 3 x 1.6 m
    reb_fuselage(h, -2.0, 2.2, 0.8, 0.35)
    reb_astro(h, -0.2, 1.05, 0, 0.24)
    h.pair(lambda s: (reb_sfoil(h, (-1.2, 0.8, 0.3), 1.2, 1.0, 0.0), reb_nacelle(h, -0.6, 0.8, 0.55, 0.22, 1.4)))

def ship_rebel_small(h):
    # the strike fighter: a needle fuselage, four S-foils opened into an X with a cannon at each tip, four nacelles, a bubble canopy and an astromech;
    # 12.5 x 11 x 3.4 m on its gear
    y = 1.7
    reb_fuselage(h, -5.0, 7.5, y, 0.75)
    canopy(h, 0.6, y + 0.6, 0, 2.6, 1.0, 0.55)
    reb_astro(h, -1.6, y + 0.55, 0, 0.3)
    for up in (1, -1):
        h.pair(lambda s, up=up: (reb_sfoil(h, (-3.0, y + up * 0.18, 0.6), 4.6, 2.4, up * 0.2),
                                 reb_nacelle(h, -1.0, y + up * 0.42, 0.95, 0.38, 3.8)))
    gear(h, [(-3.2, 0.5), (-3.2, -0.5), (4.5, 0)], y - 0.4, 0.1)

def ship_rebel_medium(h):
    # a troop transport: a squared fuselage with a long nose, side doors, two wings swept forward at the stern and big engines at their roots; 24 x 18 x 5 m
    y = 2.6
    h.loft_x([(-9, y, 0, 1.6, 1.9, 4), (-6, y, 0, 1.9, 2.2, 4.5), (4, y, 0, 1.8, 2.0, 4.5), (8.5, y - 0.2, 0, 1.0, 1.0, 3), (12, y - 0.5, 0, 0.3, 0.35, 2.5)], 12, HULL)
    canopy(h, 9.0, y + 0.55, 0, 3.0, 1.4, 0.6)
    h.pair(lambda s: h.box((0, y, 2.15), (4.5, 2.4, 0.12), PANEL))
    stripe(h, 6, 7.5, y + 1.85, 0, 2.5, 0.12)
    def wing(s):
        with h.at((-6.5, y + 0.6, 1.6)):
            h.prism([(1.0, 0), (-2.4, 0), (1.8, 7.2), (3.2, 7.2)], -0.1, 0.1, HULL)
            h.prism([(1.5, 3.5), (0.0, 3.5), (2.1, 5.4), (3.0, 5.4)], 0.1, 0.14, LIVERY)
            cannon(h, 2.8, 0, 7.2, 2.2, 0.08)
        reb_nacelle(h, -5.0, y + 0.3, 2.9, 0.95, 5.0)
    h.pair(wing)
    gear(h, [(-6, 1.4), (-6, -1.4), (7, 0)], y - 1.6, 0.18)

def ship_rebel_large(h):
    # the corvette: the hammerhead bow, a long ribbed neck, the turrets and a dish, and a wide bank of engines astern; 110 x 30 x 26 m
    y = 12
    reb_hammer(h, 38, y, 24, 16, 30)
    h.loft_x([(-30, y, 0, 6, 6.5, 3), (0, y + 0.5, 0, 4.5, 5.5, 3), (24, y, 0, 6, 8, 3)], 12, HULL)
    for x in (-24, -16, -8, 0, 8, 16):
        h.cyl((x, y, 0), "x", 6.4, 1.2, PANEL, 12)
    h.box((-40, y, 0), (22, 18, 28), HULL, front=(12, 16))
    stripe(h, -48, -32, y + 9.1, 0, 26, 0.5)
    reb_bank(h, -51, y, 2, 5, 2.2, 0.7)
    h.pair(lambda s: nozzle(h, -51, y, 13, 2.0, 2.2))
    turret(h, (10, y + 6, 0), 1.6)
    with h.at((10, y - 6, 0), (math.pi, 0, 0)):
        turret(h, (0, 0, 0), 1.6)
    dish(h, (-30, y + 9.5, 7), 3.0, 1.1)
    # (the dressing: the bridge's ports round the hammerhead, the escape pods' hatches along the neck, the engine block's plating, side guns)
    ports(h, 25, 52, [y + 3.5, y - 1.5], 14, 0.9, 0.6, skip=0.25, seed=31)
    ports(h, -50, -31, [y + 4, y - 4], 10, 0.8, 0.5, skip=0.3, seed=32)
    ports(h, -29, 22, [y + 1.5], 10, 1.4, 1.4, region=PANEL)
    plates(h, -50, -30, 13, 3.5, 33, 0.3)
    spine_lines(h, 24, 52, [0, 6], 6, 0.25)
    guns(h, [(30, 7), (-38, 9)], 1.0)
    mast(h, -44, 0, 0.15, 6)
    gear(h, [(-38, 7), (-38, -7), (34, 0)], y - 6, 0.8)

def mon_cal_dress(h, x0, x1, yc, height, n, seed):
    """the ports of a Mon Calamari hull from x0 to x1 about the height yc: rows that come and go (dark glass among the lit), the bays on
    its flanks and seams along its back"""
    ports(h, x0, x1, [yc + height * f for f in (-0.28, -0.16, -0.05, 0.06, 0.17, 0.28)], n, (x1 - x0) / n * 0.5, height * 0.018, skip=0.5, seed=seed)
    for k in range(3):
        x = x0 + (x1 - x0) * (0.25 + 0.22 * k)
        bay(h, (x, yc - height * 0.1, h.far()), (0, 0, -1), (x1 - x0) * 0.06, height * 0.08)
        bay(h, (x, yc - height * 0.1, -h.far()), (0, 0, 1), (x1 - x0) * 0.06, height * 0.08)
    spine_lines(h, x0, x1, [0, height * 0.12], 16, height * 0.01)

def ship_rebel_huge(h):
    # a Mon Calamari star cruiser: a swollen, lobed hull with pods and ports, built by a people not a yard; 1200 x 320 x 260 m
    mon_cal(h, 1200, 320, 260, 5, 2)
    # (the bridge: a low dome forward on the back, a fin behind it)
    h.sphere((380, 230, 0), 40, GLASS, 12, 6, (1.6, 0.5, 1))
    h.plate([(260, 200), (360, 200), (330, 262), (280, 262)], -6, 6, HULL)
    mon_cal_dress(h, -520, 520, 130, 260, 70, 41)

def ship_rebel_gargantuan(h):
    # a heavy cruiser of the fleet's line: two lobed hulls one over the other, a fin of a bridge; 3200 x 700 x 500 m
    mon_cal(h, 3200, 700, 380, 6, 5)
    with h.at((-200, 300, 0)):
        mon_cal(h, 1800, 260, 200, 3, 9)
    h.plate([(-1000, 380), (400, 380), (-200, 640), (-800, 640)], -15, 15, HULL)
    h.sphere((-450, 640, 0), 70, GLASS, 12, 6, (2.0, 0.5, 1))
    mon_cal_dress(h, -1400, 1400, 190, 380, 90, 51)
    ports(h, -1000, 600, [360, 420, 470], 40, 14, 4, skip=0.5, seed=52)
    ports(h, -950, 350, [500, 560], 16, 18, 5, skip=0.3, seed=53)

# ---- REPUBLIC (Kuat, Rendili, Clone Wars; the Old Republic's hammerheads): arrowheads with a flight deck, twin towers, delta wings, white with
# Republic red bands, blue engines

def rep_arrow(h, length, beam, height, deck=True, y=0.0):
    """the arrowhead: a dagger with a raised spine and red bands along its flanks; `deck` cuts a dark flight deck into the bow"""
    top = imp_dagger(h, length, beam, height, 1, y=y)
    h.pair(lambda s: h.prism([(length * 0.45, 0.02 * beam), (-length * 0.4, beam * 0.43), (-length * 0.45, beam * 0.45), (length * 0.42, 0.03 * beam)],
                             y + height * 0.3, y + height * 0.36, LIVERY))
    if deck:
        h.prism([(length * 0.38, 0), (-length * 0.1, -beam * 0.08), (-length * 0.1, beam * 0.08)], top - height * 0.02, top + height * 0.005, PANEL)
    return top

def rep_twin_towers(h, x, y, w, hgt):
    for z in (-w * 0.55, w * 0.55):
        with h.at((0, 0, z)):
            h.box((x, y + hgt * 0.35, 0), (w * 0.7, hgt * 0.7, w * 0.35), HULL, top=(w * 0.5, w * 0.3))
            h.box((x, y + hgt * 0.75, 0), (w * 0.5, hgt * 0.16, w * 0.6), HULL)
            h.box((x + w * 0.05, y + hgt * 0.77, 0), (w * 0.44, hgt * 0.04, w * 0.62), GLASS)
            h.rod((x, y + hgt * 0.83, 0), (x, y + hgt * 1.05, 0), w * 0.02, METAL, 4)

def rep_delta(h, x, y, length, beam, thick):
    """a delta wing with a raised ridge down its middle and red panels at its trailing corners"""
    h.prism([(x + length / 2, 0), (x - length / 2, -beam / 2), (x - length * 0.4, 0), (x - length / 2, beam / 2)], y, y + thick, HULL, inset=0.1)
    h.prism([(x + length * 0.35, 0), (x - length * 0.35, -beam * 0.06), (x - length * 0.35, beam * 0.06)], y + thick, y + thick * 1.8, HULL, inset=0.2)
    h.pair(lambda s: h.prism([(x - length * 0.28, beam * 0.3), (x - length * 0.48, beam * 0.46), (x - length * 0.43, beam * 0.3)], y + thick * 0.95, y + thick * 1.05, LIVERY))

def ship_republic_tiny(h):
    # a remote: a dart of a delta with a single engine and a sensor nose; 4 x 2.6 x 1.2 m
    rep_delta(h, 0, 0.6, 4.0, 2.6, 0.25)
    nozzle(h, -1.6, 0.85, 0, 0.28, 0.4)
    h.cyl((2.1, 0.75, 0), "x", 0.08, 0.6, GLOW, 6)
    h.cyl((-0.5, 0.25, 0), "y", 0.08, 0.5, METAL, 6)

def ship_republic_small(h):
    # a light interceptor: a delta with a ridge, the canopy off to port, an astromech to starboard, red at the wing roots; 8 x 4.4 x 2.4 m
    y = 0.9
    rep_delta(h, 0, y, 8.0, 4.4, 0.42)
    canopy(h, 0.4, y + 0.75, -0.55, 1.8, 0.8, 0.45)
    reb_astro(h, -0.2, y + 0.65, 0.65, 0.22)
    h.pair(lambda s: nozzle(h, -3.6, y + 0.3, 0.9, 0.3, 0.5))
    cannon(h, 3.0, y + 0.2, 0.25, 1.2, 0.05)
    cannon(h, 3.0, y + 0.2, -0.25, 1.2, 0.05)
    gear(h, [(-2.0, 0.8), (-2.0, -0.8), (2.0, 0)], y, 0.08)

def ship_republic_small_shuttle(h):
    # an attack shuttle: a rounded body, a long cockpit nose, wings folded down to land and a fin; 14 x 10 x 6 m
    y = 2.3
    h.loft_x([(-6, y, 0, 1.4, 1.5, 3), (-3, y + 0.1, 0, 1.8, 1.9, 3.5), (3, y, 0, 1.6, 1.7, 3.5), (6.5, y - 0.3, 0, 0.8, 0.9, 2.5), (7.8, y - 0.4, 0, 0.2, 0.2, 2)], 12, HULL)
    canopy(h, 5.2, y + 0.55, 0, 2.6, 1.3, 0.55)
    stripe(h, 2.0, 3.5, y + 1.65, 0, 2.6, 0.1)
    h.plate([(-6, y + 1.2), (-2.5, y + 1.2), (-4.0, y + 3.8), (-5.6, y + 3.8)], -0.1, 0.1, HULL)
    h.plate([(-5.0, y + 3.4), (-4.2, y + 3.4), (-4.1, y + 3.7), (-5.2, y + 3.7)], -0.12, 0.12, LIVERY)
    def wing(s):
        with h.at((-1.5, y + 0.2, 1.6), (math.radians(-35), 0, 0)):
            h.prism([(2.0, 0), (-2.5, 0), (-1.6, 3.6), (0.8, 3.6)], -0.1, 0.1, HULL)
            h.prism([(1.2, 2.6), (-1.8, 2.6), (-1.6, 3.6), (0.8, 3.6)], 0.1, 0.13, LIVERY)
    h.pair(wing)
    h.pair(lambda s: nozzle(h, -6, y, 0.8, 0.55, 0.7))
    gear(h, [(-4, 1.0), (-4, -1.0), (4.5, 0)], y - 1.2, 0.12)

def ship_republic_medium(h):
    # a gunship: a boxy troop bay with sliding doors, the glazed nose of two cockpits, ball turrets on its flanks, short wings with missile pods,
    # its engines on the tail; 18 x 17 x 6 m
    y = 2.4
    h.box((0, y + 0.3, 0), (12, 3.0, 3.6), HULL, top=(11, 3.0), front=(2.4, 3.0))
    h.loft_x([(5.5, y + 0.4, 0, 1.4, 1.6, 3), (8, y + 0.2, 0, 1.0, 1.2, 2.6), (9.6, y, 0, 0.3, 0.3, 2)], 10, HULL)
    canopy(h, 7.6, y + 1.1, 0, 2.0, 1.6, 0.5)
    canopy(h, 8.6, y + 0.1, 0, 1.4, 1.2, 0.35)
    h.pair(lambda s: (h.box((0, y + 0.1, 1.82), (5.2, 2.2, 0.06), PANEL), h.sphere((-2.6, y + 1.2, 2.0), 0.6, GLASS, 10, 6),
                      stripe(h, 1.8, 4.5, y + 1.6, 1.82, 0.1, 0.3)))
    def wing(s):
        with h.at((-1.5, y + 1.6, 1.8)):
            h.prism([(1.6, 0), (-1.8, 0), (-1.5, 6.6), (0.4, 6.6)], -0.12, 0.12, HULL)
            h.prism([(0.6, 5.0), (-1.4, 5.0), (-1.45, 6.6), (0.4, 6.6)], 0.12, 0.16, LIVERY)
            h.cyl((0.2, -0.4, 4.0), "x", 0.35, 2.2, METAL, 8)
            h.sphere((0.6, 0.45, 2.4), 0.45, GLASS, 8, 5)
    h.pair(wing)
    h.box((-7.5, y + 0.8, 0), (3.5, 1.6, 2.2), HULL, top=(2.5, 1.6))
    h.pair(lambda s: nozzle(h, -9.0, y + 1.0, 0.7, 0.55, 0.8))
    h.plate([(-9, y + 1.6), (-6, y + 1.6), (-7.5, y + 3.6), (-8.8, y + 3.6)], -0.1, 0.1, HULL)
    gear(h, [(-4, 1.2), (-4, -1.2), (4, 1.2), (4, -1.2)], y - 1.2, 0.15)

def ship_republic_large(h):
    # a diplomatic cruiser: a separable hammerhead salon at the bow painted the Republic's red, a long body and a tall engine block; 110 x 34 x 24 m
    y = 11
    with h.at((40, y, 0)):
        h.loft_x([(-14, 0, 0, 6, 10, 3, LIVERY), (-6, 0, 0, 8, 16, 3.5, LIVERY), (10, 0, 0, 7, 15, 3.5, LIVERY), (15, -0.5, 0, 4.5, 9, 3, LIVERY)], 14, LIVERY)
        h.box((13.5, 1.8, 0), (2.0, 1.2, 14), GLASS)
    h.loft_x([(-48, y, 0, 8, 11, 3.5), (-20, y, 0, 7, 9, 3.5), (26, y, 0, 6, 8, 3)], 12, HULL)
    h.box((-44, y + 1.5, 0), (14, 20, 26), HULL, top=(10, 18))
    stripe(h, -40, -10, y + 7.5, 0, 14, 0.4)
    for k in range(3):
        nozzle(h, -51, y + 4 - k * 4, 0, 3.0, 2.4)
    h.pair(lambda s: nozzle(h, -51, y, 9, 2.4, 2.0))
    h.pair(lambda s: h.plate([(-48, y + 8), (-36, y + 8), (-42, y + 12.5), (-48, y + 12.5)], 12, 13, HULL))
    # (the dressing: the salon's ports, the body's, plating on the engine block, the guns and a mast)
    ports(h, 28, 54, [y + 3, y - 2.5], 14, 1.0, 0.6, skip=0.2, seed=61)
    ports(h, -40, 24, [y + 2, y - 2], 18, 1.0, 0.5, skip=0.35, seed=62)
    plates(h, -50, -36, 9, 3.0, 63, 0.3)
    spine_lines(h, -46, 24, [0, 4], 10, 0.25)
    guns(h, [(10, 4), (-25, 0)], 1.0)
    mast(h, -40, 4, 0.12, 5)
    gear(h, [(-30, 7), (-30, -7), (30, 0)], y - 6, 0.8)

def ship_republic_huge(h):
    # the attack cruiser: the arrowhead with its flight deck, twin bridge towers astern, red bands; 1137 x 548 x 268 m
    with h.at((0, 0, 0)):  # (the keel: a dagger under the waterline)
        wedge(h, 1100, 520, -80, 0, region=HULL)
    top = rep_arrow(h, 1137, 548, 160)
    rep_twin_towers(h, -400, top, 60, 110)
    greebles(h, -350, 100, -70, 70, top - 4, 30, 21, 16)
    imp_engines(h, -568, 40, [48, 48, 48, 20, 20, 20, 20], [(10, 90), (10, -90), (10, 0), (60, 170), (60, -170), (-30, 170), (-30, -170)])
    # (the dressing: ports along the hull and keel, plating and trenches, the flight deck's runway lights, windows in the towers, batteries)
    dagger_dress(h, 1137, 548, 160, 1, seed=64, rows=3, n=66, guns_n=6, gun_r=10)
    ports(h, -500, 450, [-25, -55], 46, 8, 4, skip=0.3, seed=65)
    spine_lines(h, -100, 420, [0, 22], 14, 3, region=GLOW)
    for z in (33, -33):
        facade(h, -400, z, [top + 45, top + 60, top + 84], 5, 30, 3, 2.4, axis="x", seed=66)
    blocks(h, -360, 60, 120, 16, 67, 30, 14)
    bay(h, (0, -400, 0), (0, 1, 0), 100, 36, (1, 0, 0))

def ship_republic_gargantuan(h):
    # a siege dreadnought: a long, narrow arrowhead with a keel, a tower amidships and heavy guns along its spine; 3200 x 800 x 260 m
    with h.at((0, 0, 0)):  # (the keel: a dagger under the waterline)
        wedge(h, 3000, 700, -90, 0, region=HULL)
    top = rep_arrow(h, 3200, 800, 150, deck=False)
    for x in (-500, -100, 300, 700):
        turret(h, (x, top, 0), 40)
    rep_twin_towers(h, -1200, top, 140, 220)
    imp_engines(h, -1600, 40, [60] * 5, [(0, z) for z in (-240, -120, 0, 120, 240)])
    dagger_dress(h, 3200, 800, 150, 1, seed=71, rows=3, n=100, guns_n=9, gun_r=16, deck=1.5)
    ports(h, -1400, 1300, [-30, -60], 70, 14, 7, skip=0.3, seed=72)
    for z in (77, -77):
        facade(h, -1200, z, [top + 90, top + 120, top + 168], 6, 70, 6, 5, axis="x", seed=73)
    blocks(h, -1100, 1000, 180, 30, 74, 70, 30)
    for x in (-800, 0, 900):
        mast(h, x, 0, 3, 60)

# ---- SEPARATIST (Hoersch-Kessel, Haor Chall, Colla, Feethan Ottraw): insect and fish shapes, crescents and rings, ribbed spines, droid eyes;
# tan and bronze with blue-grey, the engines blue, the eyes red

def sep_head(h, x, y, length, r, eyes=True):
    """the insect head: an elongated, faceted pod with a pair of eyes and a mandible slit"""
    h.loft_x([(x - length / 2, y, 0, r * 0.6, r * 0.7, 2.2), (x - length * 0.1, y, 0, r, r * 1.05, 2.4), (x + length * 0.3, y - r * 0.1, 0, r * 0.75, r * 0.7, 2.2),
              (x + length / 2, y - r * 0.3, 0, r * 0.15, r * 0.25, 2)], 10, HULL)
    if eyes:
        h.pair(lambda s: h.sphere((x + length * 0.3, y + r * 0.25, r * 0.45), r * 0.18, LIVERY, 8, 4))
    h.box((x + length * 0.38, y - r * 0.4, 0), (length * 0.2, r * 0.08, r * 0.6), PANEL)

def sep_spine(h, x0, x1, y, r, ribs, rib_r):
    h.loft_x([(x0, y, 0, r, r, 2), (x1, y, 0, r * 0.7, r * 0.7, 2)], 10, METAL)
    for k in range(ribs):
        x = x0 + (x1 - x0) * (k + 0.5) / ribs
        h.cyl((x, y, 0), "x", rib_r, (x1 - x0) / ribs * 0.18, PANEL, 10)

def sep_crescent(h, c, R, r, a0, a1, region=HULL, squash=0.35):
    h.torus(c, R, r, region, 20, 6, a0, a1, squash)

def sep_leg(h, root, length, angle, width):
    """a folded wing-leg: two flat segments with a knee, the vulture's walk"""
    with h.at(root, (0, angle, 0)):
        h.box((length * 0.25, 0, 0), (length * 0.5, width * 0.15, width), HULL, front=(width * 0.1, width * 0.6))
        h.rod((length * 0.5, 0, 0), (length * 0.85, -root[1] + 0.1, 0), width * 0.12, METAL, 6)
        cannon(h, length * 0.1, width * 0.1, width * 0.45, length * 0.5, width * 0.04)

def ship_separatist_tiny(h):
    # a droid fighter in its walking stance: a long head with its eye, four wing-legs folded down; 3.5 x 6 x 2 m
    sep_head(h, 0.4, 1.6, 3.4, 0.45)
    h.box((-1.2, 1.6, 0), (0.9, 0.6, 1.2), HULL, top=(0.6, 1.0))
    nozzle(h, -1.6, 1.6, 0, 0.3, 0.3)
    for ang in (0.5, 2.4):
        h.pair(lambda s, ang=ang: sep_leg(h, (-0.6, 1.5, 0.45), 2.5, -ang, 0.55))

def ship_separatist_small(h):
    # a heavy fighter: a pointed fuselage with a domed canopy, two long engine pods on outriggers; 12 x 7 x 3 m
    y = 1.5
    h.loft_x([(-5.5, y, 0, 0.8, 1.2, 2.4), (-1, y + 0.1, 0, 1.0, 1.3, 2.6), (3.5, y, 0, 0.6, 0.7, 2.2), (6.5, y - 0.2, 0, 0.1, 0.1, 2)], 10, HULL)
    h.sphere((0.6, y + 0.9, 0), 0.75, GLASS, 10, 5, (1.4, 0.7, 0.9))
    def pod(s):
        h.prism([(1.0, 0.6), (-3.0, 0.8), (-3.4, 2.8), (-1.6, 2.8)], y - 0.08, y + 0.08, HULL)
        h.loft_x([(-5.8, y, 3.1, 0.55, 0.55, 2, HULL), (2.8, y, 3.1, 0.55, 0.55, 2), (4.0, y, 3.1, 0.15, 0.15, 2, METAL)], 10, HULL)
        stripe(h, -1.5, 0.5, y + 0.5, 3.1, 0.6, 0.1, PANEL)
        h.cyl((-5.85, y, 3.1), "x", 0.42, 0.04, GLOW, 10)
    h.pair(pod)
    gear(h, [(-3, 0.6), (-3, -0.6), (3, 0)], y - 0.6, 0.08)

def ship_separatist_medium(h):
    # an insect shuttle: a segmented, curving body with an eyed head, swept antennae and four arching legs to land on; 24 x 12 x 7 m
    y = 3.6
    sep_head(h, 8.5, y + 0.2, 7.0, 1.6)
    h.loft_x([(-12, y + 0.8, 0, 1.0, 1.4, 2.2), (-9, y + 0.4, 0, 2.2, 2.8, 2.4), (-3, y, 0, 2.4, 3.0, 2.4), (2, y + 0.1, 0, 2.0, 2.4, 2.4), (5.5, y + 0.2, 0, 1.4, 1.6, 2.2)], 12, HULL)
    for x in (-8, -5, -2, 1):
        h.cyl((x, y, 0), "x", 2.55, 0.35, PANEL, 12)
    h.pair(lambda s: sep_crescent(h, (-3, y + 1.4, 0), 4.6, 0.45, 0.12 * math.pi, 0.42 * math.pi, HULL, 0.3))
    h.pair(lambda s: (h.rod((-6, y - 1, 1.8), (-7, 0.2, 4.5), 0.25, METAL), h.rod((3, y - 1, 1.6), (4, 0.2, 4.2), 0.25, METAL)))
    nozzle(h, -12, y + 0.8, 0, 0.9, 0.8)
    h.pair(lambda s: h.rod((10.5, y + 1.2, 0.6), (13.5, y + 2.6, 2.0), 0.06, METAL, 4))

def ship_separatist_large(h):
    # a frigate in little: a long spine with a tall bow of comm arrays, a bulbous hull under it and engines aft; 110 x 30 x 28 m
    y = 12
    sep_spine(h, -50, 40, y, 4, 9, 5.2)
    h.loft_x([(-35, y - 3, 0, 4, 9, 2.2), (-5, y - 4, 0, 6, 13, 2.4), (25, y - 3, 0, 4, 8, 2.2)], 12, HULL)
    h.box((44, y + 2, 0), (12, 26, 7), HULL, top=(6, 4), front=(18, 5))
    for k in range(4):
        h.pair(lambda s, k=k: h.cyl((47, y - 6 + k * 5, 3.5), "z", 1.2 - 0.2 * k, 1.0, PANEL, 8))
    sep_head(h, 50, y - 8, 10, 2.5, eyes=True)
    for z in (-6, 0, 6):
        nozzle(h, -50, y, z, 2.6, 2.4)
    h.pair(lambda s: sep_crescent(h, (-20, y, 0), 13, 1.0, 0.15 * math.pi, 0.4 * math.pi))
    # (the dressing: ports along the hull under the spine, windows up the bow's tower, guns on the spine, a mast of arrays at the bow)
    ports(h, -36, 26, [y - 6, y - 2.5], 20, 1.0, 0.6, skip=0.3, seed=81)
    facade(h, 44, 0, [y + 6, y + 10], 3, 5, 0.9, 0.6, axis="z", seed=82)
    guns(h, [(-34, 0), (-8, 0), (18, 0)], 1.1)
    mast(h, 43, 0, 0.15, 4.5, 3)
    gear(h, [(-30, 6), (-30, -6), (30, 0)], y - 7, 0.8)

def ship_separatist_huge(h):
    # a light destroyer: a long ribbed spine forking at the bow, a tall dorsal fin of batteries and a hull of bronze ribs; 1187 x 240 x 300 m
    y = 120
    sep_spine(h, -560, 300, y, 40, 12, 70)
    h.loft_x([(-500, y - 30, 0, 50, 90, 2.4), (-100, y - 40, 0, 70, 110, 2.4), (250, y - 30, 0, 40, 70, 2.2)], 12, HULL)
    h.pair(lambda s: h.prism([(300, 10), (590, 40), (590, 60), (300, 50)], y - 30, y + 20, HULL))
    h.plate([(-400, y + 40), (200, y + 40), (100, y + 170), (-300, y + 170)], -10, 10, HULL)
    for k in range(5):
        turret(h, (-300 + k * 120, y + 50, 0), 14)
    for z in (-50, 0, 50):
        nozzle(h, -560, y, z, 32, 30)
    # (the dressing: ports along the hull, the windows of the dorsal fin's batteries, bays under the flanks, guns on the shoulders, arrays at the bow)
    ports(h, -470, 230, [y - 70, y - 50, y - 30], 50, 8, 5, skip=0.35, seed=83)
    ports(h, -380, 170, [y + 70, y + 105, y + 140], 30, 9, 5, skip=0.3, seed=84)
    for x in (-300, -120, 60):
        bay(h, (x, y - 60, h.far()), (0, 0, -1), 60, 22)
        bay(h, (x, y - 60, -h.far()), (0, 0, 1), 60, 22)
    guns(h, [(-420, 60), (-200, 80), (40, 60)], 9)
    for z in (35, -35):
        mast(h, 520, z, 2, 50, 3)
    spine_lines(h, -480, 240, [0, 50], 14, 4)

def ship_separatist_gargantuan(h):
    # the core ship: a great ring open at the bow, a sphere at its heart and the docking arms between; 3170 m across, 900 m high
    y = 450
    h.torus((0, y, 0), 1300, 280, HULL, 32, 8, 0.12 * math.pi, 1.88 * math.pi, 1.6)
    h.sphere((0, y, 0), 700, HULL, 18, 10, (1, 0.9, 1))
    for k in range(6):
        a = 0.3 * math.pi + k * math.pi * 1.4 / 5
        h.rod((math.cos(a) * 650, y, math.sin(a) * 650), (math.cos(a) * 1050, y, math.sin(a) * 1050), 70, PANEL, 8)
    h.torus((0, y + 350, 0), 1350, 30, PANEL, 32, 4, 0.14 * math.pi, 1.86 * math.pi)
    h.pair(lambda s: h.box((1150, y, 1050), (280, 260, 200), PANEL))
    for k in range(5):
        nozzle(h, -1550, y + (k - 2) * 110, 0, 50, 40)
    # (the dressing: rows of ports round the ring's rim, plating on its back, batteries along it and the bays inside the ring, facing the core)
    far = h.far()
    items, tops, bays = [], [], []
    for k in range(few(64)):
        t = 0.16 * math.pi + 1.68 * math.pi * (k + 0.5) / few(64)
        c, sn = math.cos(t), math.sin(t)
        for dy in (-220, -120, -20, 80, 180):
            items.append(((c * far, y + dy, sn * far), (-c, 0, -sn), 26 * 64 / few(64), 10, GLOW if (k + dy // 100) % 3 else GLASS, (0, 1, 0)))
        for rr in (1180, 1300, 1420):
            tops.append(((c * rr, far, sn * rr), (0, -1, 0), 60, 90, PANEL if (k + rr // 120) % 2 else METAL, (-sn, 0, c)))
        if k % 8 == 4:
            bays.append((t, c, sn))
    h.sticks(items)
    h.sticks(tops)
    for t, c, sn in bays:
        bay(h, (c * 900, y, sn * 900), (c, 0, sn), 160, 70)
    pts = [(math.cos(t) * 1300, math.sin(t) * 1300) for t in [math.pi * (0.25 + 0.12 * k) for k in range(6)]]
    guns(h, pts, 34)

# ---- MANDALORIAN (MandalMotors, Kuat Systems for Mandalore): angular slabs, the T of a visor at every cockpit, blade wings that turn to land,
# dark steel with blue and the clan's orange, white engine glow

def man_visor(h, x, y, w, hgt):
    """a T-visor front: an angled plate with a dark T cut into it"""
    h.box((x, y, 0), (hgt * 0.3, hgt, w), HULL, front=(hgt * 0.8, w * 0.9))
    h.box((x + hgt * 0.16, y + hgt * 0.25, 0), (0.02 + hgt * 0.03, hgt * 0.15, w * 0.8), GLASS)
    h.box((x + hgt * 0.16, y - hgt * 0.05, 0), (0.02 + hgt * 0.03, hgt * 0.5, w * 0.16), GLASS)

def man_slab(h, x0, x1, y0, y1, w, nose=0.4):
    """a chamfered slab: flat flanks, the top and bottom bevelled, a wedge of a nose"""
    L = x1 - x0
    h.box(((x0 + x1) / 2, (y0 + y1) / 2, 0), (L, y1 - y0, w), HULL, top=(L * 0.94, w * 0.7), front=((y1 - y0) * nose, w * 0.8))

def man_blade(h, root, span, chord, angle, region=HULL):
    """a blade wing out to +z: a long, tapering trapezoid swept back with a band of the clan's colour"""
    with h.at(root, (angle, 0, 0)):
        h.prism([(chord * 0.5, 0), (-chord * 0.5, 0), (-chord * 0.15, span), (chord * 0.35, span * 0.92)], -0.05 * chord, 0.05 * chord, region)
        h.prism([(chord * 0.48, span * 0.35), (-chord * 0.4, span * 0.35), (-chord * 0.35, span * 0.5), (chord * 0.44, span * 0.5)], 0.05 * chord, 0.065 * chord, LIVERY)

def ship_mandalorian_tiny(h):
    # a seeker: a small slab with a T-visor and two blade fins; 4 x 3 x 1.8 m
    man_slab(h, -1.8, 1.6, 0.6, 1.5, 1.2)
    man_visor(h, 1.75, 1.05, 1.0, 0.8)
    h.pair(lambda s: man_blade(h, (-0.6, 1.1, 0.5), 1.0, 1.4, -0.35))
    nozzle(h, -1.8, 1.05, 0, 0.3, 0.3)

def ship_mandalorian_small(h):
    # a fang fighter: a narrow fuselage with a pilot's pod, two crescent-blade wings standing up at the stern; 10 x 7 x 4 m
    y = 1.4
    h.loft_x([(-4.5, y, 0, 0.55, 0.6, 3), (0, y, 0, 0.6, 0.65, 3.2), (3.8, y - 0.1, 0, 0.35, 0.35, 2.6), (5.5, y - 0.2, 0, 0.08, 0.08, 2)], 8, HULL)
    h.sphere((-2.0, y + 0.3, 0), 0.9, HULL, 10, 6, (1.3, 0.9, 0.9))
    man_visor(h, -0.95, y + 0.35, 0.9, 0.7)
    def wing(s):
        with h.at((-2.5, y, 0.9)):
            h.plate([(1.5, -0.6), (-1.6, -0.9), (-2.4, 0.6), (-1.0, 2.4), (0.8, 1.8)], -0.06, 0.06, HULL)
            h.plate([(0.9, 0.9), (-1.6, 0.6), (-1.4, 1.3), (0.6, 1.6)], 0.06, 0.08, LIVERY)
            h.plate([(-0.3, -0.5), (-1.8, -0.7), (-2.0, 0.3), (-0.4, 0.3)], -0.12, 0.12, METAL)
            cannon(h, 0.8, 1.9, 0, 1.6, 0.05)
        nozzle(h, -4.2, y - 0.2, 1.3, 0.3, 0.4)
    h.pair(wing)
    gear(h, [(-3.5, 0.5), (-3.5, -0.5), (3, 0)], y - 0.5, 0.08)

def ship_mandalorian_medium(h):
    # a gauntlet: an upright central slab, the T-visor at its bow, two great blade wings turned up for landing, engines at the wing roots; 30 x 18 x 10 m
    y = 4.8
    man_slab(h, -13, 10, y - 2.6, y + 2.6, 4.2, 0.5)
    man_visor(h, 10.5, y + 0.6, 3.6, 3.4)
    h.box((-2, y + 3.2, 0), (14, 1.2, 1.8), PANEL, top=(12, 1.2))
    stripe(h, 2, 7, y + 2.65, 0, 3.0, 0.1)
    def wing(s):
        man_blade(h, (-6, y, 2.0), 8.0, 10, -math.radians(38))
        nozzle(h, -9.5, y - 0.4, 2.8, 1.2, 1.6)
        with h.at((-6, y, 2.0), (-math.radians(38), 0, 0)):
            cannon(h, 2.5, 0, 7.8, 4, 0.12)
    h.pair(wing)
    nozzle(h, -13, y, 0, 1.4, 1.6)
    gear(h, [(-8, 1.4), (-8, -1.4), (6, 1.2), (6, -1.2)], y - 2.6, 0.22)

def ship_mandalorian_large(h):
    # an assault cruiser: stacked slabs stepping back from an angular prow, the T bridge on top, blade fins and a broad stern; 100 x 40 x 26 m
    y = 9
    man_slab(h, -48, 40, 3, 15, 28, 0.35)
    man_slab(h, -44, 22, 15, 21, 20, 0.5)
    man_slab(h, -40, -10, 21, 25, 12, 0.6)
    man_visor(h, -9.5, 23, 10, 4)
    h.pair(lambda s: (man_blade(h, (-30, 12, 13), 9, 18, -0.15), stripe(h, -40, 30, 15.05, 9.5, 2.5, 0.2)))
    for z in (-9, -3, 3, 9):
        nozzle(h, -48, 9, z, 2.6, 2.4)
    for x in (25, 0, -20):
        turret(h, (x, 21 if x < 22 else 15, 0), 1.6)
    # (the dressing: ports along the hull's flanks and the upper slab's, plating and panel lines on the decks, a mast)
    ports(h, -45, 34, [6, 9.5, 12.5], 26, 1.0, 0.55, skip=0.3, seed=91)
    ports(h, -40, 18, [18], 16, 1.0, 0.5, skip=0.3, seed=92)
    plates(h, -46, 36, 13, 3.5, 93, 0.2)
    lines(h, -46, 36, 14, 12, 0.2, dashes=8)
    blocks(h, -36, 14, 8, 6, 94, 3.5, 1.4)
    mast(h, -16, 3, 0.12, 6)
    gear(h, [(-30, 9), (-30, -9), (25, 7), (25, -7)], 3, 0.8)

def ship_mandalorian_huge(h):
    # a dreadnought: a long slab with a blade prow, ranks of fins, the T bridge aft; 900 x 260 x 220 m
    y = 0
    man_slab(h, -450, 450, 0, 110, 220, 0.3)
    man_slab(h, -400, 200, 110, 170, 140, 0.5)
    man_visor(h, -300, 190, 60, 50)
    for x in (-200, -50, 100):
        h.pair(lambda s, x=x: man_blade(h, (x, 60, 105), 60, 90, -0.4))
    for z in (-70, 0, 70):
        nozzle(h, -450, 55, z, 40, 35)
    # (the dressing: a step of superstructure, smaller engines round the great ones, ports in rows, plating, trenches, batteries, bays, masts)
    man_slab(h, -220, 60, 170, 196, 80, 0.6)
    for y0, z in ((20, 0), (95, 0), (20, 92), (20, -92), (95, 92), (95, -92)):
        nozzle(h, -450, y0, z, 16, 16)
    ports(h, -430, 380, [18, 40, 62, 84], 60, 7, 4, skip=0.3, seed=95)
    ports(h, -380, 180, [128, 150], 36, 7, 4, skip=0.3, seed=96)
    plates(h, -440, 420, 110, 40, 97, 0.2)
    lines(h, -440, 420, 110, 16, 3, dashes=10)
    guns(h, [(x, 85) for x in (-250, -100, 50, 200, 330)], 10)
    blocks(h, -360, 160, 60, 10, 98, 30, 14)
    for x in (-300, 0, 250):
        bay(h, (x, 40, h.far()), (0, 0, -1), 70, 28)
        bay(h, (x, 40, -h.far()), (0, 0, 1), 70, 28)
    for x in (-330, -250):
        mast(h, x, 0, 1.6, 45)

def ship_mandalorian_gargantuan(h):
    # a war city: three dreadnought slabs side by side under one deck, a tower of a bridge; 3100 x 900 x 400 m
    for z in (-300, 0, 300):
        with h.at((0 if z == 0 else -200, 0, z)):
            man_slab(h, -1400, 1500 if z == 0 else 1100, 0, 220, 260, 0.3)
    h.box((-300, 260, 0), (2000, 80, 860), HULL, top=(1800, 700))
    man_slab(h, -900, -300, 300, 520, 200, 0.4)
    man_visor(h, -290, 430, 160, 120)
    for z in (-300, 0, 300):
        nozzle(h, -1400 if z == 0 else -1600, 110, z, 80, 60)
    # (the dressing: the three hulls' ports, the deck's and the tower's, plating, trenches, blocks of the city on deck, batteries, bays)
    ports(h, -1700, 1150, [30, 80, 130, 180], 80, 20, 9, skip=0.3, seed=101)
    ports(h, -1250, 640, [240, 280], 60, 18, 8, skip=0.3, seed=102)
    ports(h, -880, -320, [340, 380, 420, 470], 20, 14, 8, skip=0.25, seed=103)
    plates(h, -1250, 650, 420, 70, 104, 0.18)
    lines(h, -1250, 650, 420, 20, 6, dashes=12)
    blocks(h, -250, 600, 380, 18, 105, 90, 40)
    guns(h, [(x, 330) for x in (-1000, -400, 200)], 22)
    for x in (-1200, 0, 900):
        bay(h, (x, 60, h.far()), (0, 0, -1), 160, 60)
        bay(h, (x, 60, -h.far()), (0, 0, 1), 160, 60)
    for x in (-760, -440):
        mast(h, x, 0, 4, 120)

# ---- CRIMINAL (Hutt, Black Sun, pirates; Ubrikkian and the yards that ask no questions): swollen yachts with gold bands and swept ornamental fins,
# vipers with blade wings, patched hulls of salvaged plates; ochre and gold on maroon, the engines a hot pink-orange

def crim_yacht(h, x0, x1, y, r, swell=1.0):
    L = x1 - x0
    h.loft_x([(x0, y, 0, r * 0.7, r * 0.8, 2.2), (x0 + L * 0.25, y + r * 0.1, 0, r * swell, r * 1.15 * swell, 2.3), (x0 + L * 0.6, y, 0, r * 0.85, r * 0.95, 2.3),
              (x0 + L * 0.85, y - r * 0.15, 0, r * 0.45, r * 0.5, 2.1), (x1, y - r * 0.3, 0, r * 0.06, r * 0.06, 2)], 12, HULL)
    h.cyl((x0 + L * 0.42, y + r * 0.1, 0), "x", r * 1.05 * swell, L * 0.04, LIVERY, 12)
    h.cyl((x0 + L * 0.47, y + r * 0.1, 0), "x", r * 1.03 * swell, L * 0.012, LIVERY, 12)

def crim_fin(h, x, y, z, length, hgt, sweep=0.5, region=LIVERY):
    """an ornamental fin, swept back and curling up at its tip"""
    with h.at((x, y, z)):
        h.plate([(0, 0), (-length, 0), (-length * (1 + sweep * 0.3), hgt), (-length * (0.6 + sweep * 0.2), hgt * 1.1), (-length * 0.2, hgt * 0.3)],
                -length * 0.02, length * 0.02, region)

def crim_plates(h, x0, x1, y0, y1, z, n, seed):
    """salvaged plates welded on a flank, each a different shade"""
    rnd = random.Random(seed)
    for _ in range(n):
        w, t = rnd.uniform(0.15, 0.3) * (x1 - x0), rnd.uniform(0.25, 0.5) * (y1 - y0)
        x, y = rnd.uniform(x0 + w / 2, x1 - w / 2), rnd.uniform(y0 + t / 2, y1 - t / 2)
        h.box((x, y, z), (w, t, (x1 - x0) * 0.01 + 0.02), rnd.choice((PANEL, METAL, HULL, LIVERY)))

def ship_criminal_tiny(h):
    # a scrap drone: a box hull patched with plates, a ram spike at the bow and one big engine; 4.5 x 2 x 1.6 m
    h.box((0, 0.9, 0), (3.0, 1.0, 1.4), HULL, top=(2.6, 1.0))
    h.pair(lambda s: crim_plates(h, -1.4, 1.4, 0.45, 1.35, 0.72, 4, 3))
    h.cyl((2.1, 0.9, 0), "x", 0.35, 1.4, METAL, 6, 0.02)
    nozzle(h, -1.5, 0.95, 0, 0.45, 0.4)
    h.box((0.3, 1.5, 0), (0.6, 0.25, 0.4), GLOW)

def ship_criminal_small(h):
    # a viper: a needle with a swollen cockpit, four blade wings swept back to the stern (two up, two down) with engines at their roots; 12 x 8 x 4 m
    y = 2.0
    crim_yacht(h, -5, 7, y, 0.75)
    h.sphere((1.2, y + 0.55, 0), 0.6, GLASS, 10, 5, (1.6, 0.7, 0.8))
    for up in (1, -1):
        h.pair(lambda s, up=up: man_blade(h, (-2.5, y + up * 0.2, 0.4), 3.6, 3.4, up * 0.45, HULL))
    h.pair(lambda s: nozzle(h, -4.5, y, 0.7, 0.4, 0.6))
    crim_fin(h, -2.0, y + 0.6, 0, 2.2, 1.0)
    gear(h, [(-3, 0.7), (-3, -0.7), (4, 0)], y - 0.6, 0.1)

def ship_criminal_medium(h):
    # a luxury yacht: a long swollen hull with a gold band, a glazed lounge, swept fins and three engines; 36 x 16 x 9 m
    y = 4.2
    crim_yacht(h, -16, 20, y, 3.2)
    h.box((6, y + 2.6, 0), (9, 1.4, 3.6), GLASS, top=(7, 2.6))
    h.loft_x([(10, y + 2.0, 0, 0.6, 1.6, 2.2, GLASS), (14, y + 1.4, 0, 0.4, 1.0, 2, GLASS)], 8, GLASS)
    crim_fin(h, -10, y + 2.4, 0, 7, 2.2)
    h.pair(lambda s: (crim_fin(h, -9, y, 3.2, 6, 4.5, 0.8, HULL), nozzle(h, -15, y - 0.5, 2.0, 1.1, 1.2)))
    nozzle(h, -16, y + 0.4, 0, 1.4, 1.4)
    gear(h, [(-9, 1.8), (-9, -1.8), (12, 0)], y - 2.4, 0.22)

def ship_criminal_large(h):
    # a Hutt cruiser: a great bulb of a hull with a throne dome on top, golden fins and a swollen stern of engines; 100 x 44 x 28 m
    y = 12
    crim_yacht(h, -46, 54, y, 10, 1.1)
    h.sphere((5, y + 10.5, 0), 5, GLASS, 12, 6, (1.4, 0.7, 1.2))
    h.cyl((5, y + 10, 0), "y", 6.5, 1.0, LIVERY, 14)
    h.pair(lambda s: (crim_fin(h, -20, y + 2, 11, 20, 11, 0.6), crim_fin(h, 20, y - 4, 10, 12, 6, 0.4, HULL)))
    crim_fin(h, -24, y + 9, 0, 18, 6)
    for z in (-5, 5):
        nozzle(h, -45, y, z, 3.6, 3)
    h.pair(lambda s: crim_plates(h, -30, 30, y - 6, y + 4, 12.4, 6, 8))
    # (the dressing: the saloons' ports, lit bands along the flanks, a mast with its lamps)
    ports(h, -38, 42, [y + 4, y + 0.5], 26, 1.2, 0.7, skip=0.2, seed=111)
    ports(h, -35, 40, [y - 4], 12, 2.0, 0.3, region=LIVERY)
    guns(h, [(-8, 6), (30, 0)], 1.1)
    mast(h, 25, 0, 0.12, 5)
    gear(h, [(-30, 8), (-30, -8), (30, 0)], y - 8, 0.9)

def ship_criminal_huge(h):
    # a pleasure barge of a crime lord: a yacht hull swollen to a carrier, with pods slung either side and fins like sails; 850 x 400 x 260 m
    y = 120
    crim_yacht(h, -400, 450, y, 110, 1.2)
    h.pair(lambda s: (h.rod((0, y, 80), (0, y - 20, 160), 18, PANEL), crim_yacht(h, -300, 200, y - 20, 55)))
    crim_fin(h, -150, y + 110, 0, 220, 140)
    h.sphere((80, y + 110, 0), 45, GLASS, 12, 6, (1.6, 0.6, 1))
    for z in (-40, 40):
        nozzle(h, -395, y, z, 40, 30)
    # (the dressing: rows of saloon ports on the hull and the pods, gold bands, guns, bays, masts with lamps)
    ports(h, -340, 380, [y + 40, y + 65, y + 90], 50, 9, 5, skip=0.25, seed=112)
    ports(h, -260, 170, [y - 40, y - 15], 30, 8, 4, skip=0.3, seed=113)
    for x in (-250, -100, 100, 300):
        h.cyl((x, y, 0), "x", 112 * (1 - abs(x - 25) / 520) + 4, 6, LIVERY, 14)
    guns(h, [(-200, 50), (150, 50)], 10)
    for x in (-100, 200):
        bay(h, (x, y - 70, h.far()), (0, 0, -1), 60, 24)
        bay(h, (x, y - 70, -h.far()), (0, 0, 1), 60, 24)
    mast(h, -250, 0, 1.6, 50)

def ship_criminal_gargantuan(h):
    # a pirate city-ship: hulls of every make welded together round a long spine of containers, scaffolds and lights; 3000 x 1000 x 600 m
    y = 300
    h.box((0, y, 0), (2800, 160, 200), PANEL)
    rnd = random.Random(31)
    for k in range(10):
        x = -1300 + k * 280
        z = rnd.choice((-1, 1)) * rnd.uniform(150, 380)
        with h.at((x, y + rnd.uniform(-120, 120), z), (0, rnd.uniform(-0.3, 0.3), 0)):
            if k % 3 == 0:
                crim_yacht(h, -150, 150, 0, 70)
            elif k % 3 == 1:
                man_slab(h, -140, 140, -60, 60, 120)
            else:
                h.sphere((0, 0, 0), 90, HULL, 10, 6, (1.5, 1, 1))
        h.rod((x, y, 0), (x, y, z * 0.9), 20, METAL)
    crim_yacht(h, 1200, 1700, y + 40, 160)
    h.pair(lambda s: crim_plates(h, -1300, 1300, y - 80, y + 80, 101, 14, 4))
    for z in (-60, 60):
        nozzle(h, -1400, y, z, 70, 50)
    # (the dressing: lights all over the welded hulls, plating on the spine, guns, masts)
    ports(h, -1350, 1350, [y - 60, y - 20, y + 20, y + 60], 80, 18, 8, skip=0.45, seed=114)
    ports(h, -1350, 1700, [y - 140, y + 140], 50, 20, 9, skip=0.5, seed=115)
    plates(h, -1350, 1350, 100, 70, 116, 0.25)
    guns(h, [(-900, 60), (-200, 60), (500, 60)], 24)
    for x in (-1100, -300, 700):
        mast(h, x, 0, 4, 140)

# ---- CIVILIAN (Corellian Engineering, Ghtroc, Kuat's freight yards): saucers with mandibles and a cockpit tube out to one side, quad jets,
# container spines, wedge couriers; faded cream and grey with a stripe of the owner's, rust; blue-white engines

def civ_saucer(h, x, y, R, hgt):
    # (a disc: turned about the y axis)
    prof = [(0.02, -hgt / 2), (R * 0.9, -hgt / 2), (R, -hgt * 0.2), (R, hgt * 0.1), (R * 0.75, hgt * 0.4), (R * 0.3, hgt / 2), (0.02, hgt / 2)]
    with h.at((x, y, 0), (0, 0, math.pi / 2)):
        h.loft_x([(py, 0, 0, pr, pr, 2) for pr, py in prof], 28, HULL)
    h.torus((x, y - hgt * 0.05, 0), R * 0.98, hgt * 0.1, PANEL, 28, 4)
    h.torus((x, y + hgt * 0.38, 0), R * 0.55, hgt * 0.05, PANEL, 24, 4)

def civ_mandibles(h, x, y, R, length, w, gap, hgt):
    def prong(s):
        h.box((x + R * 0.7 + length / 2, y, gap / 2 + w / 2), (length, hgt, w), HULL, top=(length * 0.95, w * 0.85), front=(hgt * 0.8, w * 0.7))
        greebles(h, x + R * 0.8, x + R * 0.7 + length * 0.9, gap / 2 + w * 0.1, gap / 2 + w * 0.9, y + hgt / 2, 4, 5, w * 0.35)
    h.pair(prong)

def civ_cockpit(h, x, y, z, length, r):
    """the cockpit on a tube out to starboard, its glass nose ringed"""
    h.rod((x - length, y, z * 0.55), (x, y, z), r, HULL, 10)
    h.sphere((x + r * 0.4, y, z), r * 1.15, HULL, 10, 6)
    h.cyl((x + r * 1.3, y, z), "x", r * 0.75, r * 0.3, GLASS, 10)
    for k in range(3):
        h.cyl((x + r * (1.0 + 0.25 * k), y, z), "x", r * (0.95 - 0.1 * k), r * 0.06, PANEL, 10)

def civ_container(h, x, y, z, length, w, hgt, seed):
    rnd = random.Random(seed)
    h.box((x, y, z), (length, hgt, w), rnd.choice((HULL, PANEL, LIVERY)))
    for k in range(3):
        h.box((x - length / 2 + length * (k + 0.5) / 3, y, z), (length * 0.02, hgt * 1.04, w * 1.04), METAL)

def ship_civilian_tiny(h):
    # a cargo loader: a flat box with four lifting jets and a crane arm; 5 x 3 x 1.6 m
    h.box((0, 0.8, 0), (4.0, 0.8, 2.6), HULL, top=(3.8, 2.4))
    h.box((1.5, 1.35, 0), (0.8, 0.4, 1.0), GLASS, top=(0.6, 0.8))
    for x in (-1.6, 1.6):
        h.pair(lambda s, x=x: (h.cyl((x, 0.6, 1.45), "y", 0.35, 0.4, METAL, 8), h.cyl((x, 0.38, 1.45), "y", 0.28, 0.04, GLOW, 8)))
    h.rod((-1.0, 1.3, 0), (1.8, 1.6, 0), 0.08, METAL)
    h.rod((1.8, 1.6, 0), (2.4, 0.9, 0), 0.06, METAL)
    stripe(h, -1.8, 1.0, 1.21, 0, 2.5, 0.02)

def ship_civilian_small(h):
    # a courier: a wedge hull with the cockpit in its middle, engines at its broad stern and a dorsal turret; 14 x 11 x 4 m
    y = 1.4
    h.prism([(7, 0), (3, -2.2), (-6, -5.2), (-7, -4.6), (-7, 4.6), (-6, 5.2), (3, 2.2)], y, y + 1.6, HULL, inset=0.12)
    h.prism([(6, 0), (-5, -1.6), (-5, 1.6)], y + 1.6, y + 1.75, LIVERY)
    canopy(h, 3.5, y + 1.55, 0, 3.2, 1.4, 0.6)
    turret(h, (-2, y + 1.75, 0), 0.5)
    h.pair(lambda s: nozzle(h, -7, y + 0.8, 3.0, 0.6, 0.8))
    nozzle(h, -7, y + 0.8, 0, 0.5, 0.6)
    gear(h, [(-4, 2.5), (-4, -2.5), (4, 0)], y, 0.12)

def ship_civilian_medium(h):
    # a light freighter: the saucer, two mandibles forward, the cockpit on its tube to starboard, a dish on top, a band of engine glow round the
    # stern and quad guns above and below; 34 x 26 x 8 m
    y = 3.6
    R = 12.8
    civ_saucer(h, -3, y, R, 4.6)
    civ_mandibles(h, -3, y - 0.2, R, 9.5, 3.6, 3.2, 2.6)
    civ_cockpit(h, 10.5, y - 0.2, 12.2, 6.0, 1.3)
    h.torus((-3, y + 0.1, 0), R + 0.05, 0.55, GLOW, 28, 4, math.pi * 0.72, math.pi * 1.28)
    dish(h, (0, y + 2.6, -5.5), 2.0, 1.2)
    turret(h, (-3, y + 2.3, 0), 1.0)
    with h.at((-3, y - 2.3, 0), (math.pi, 0, 0)):
        turret(h, (0, 0, 0), 1.0)
    stripe(h, -9, 2, y + 2.33, 3, 1.4, 0.06)
    greebles(h, -10, 4, -8, 8, y + 2.1, 16, 9, 0.9)
    gear(h, [(-10, 6), (-10, -6), (4, 6), (4, -6), (-3, 0)], y - 2.3, 0.3)

def ship_civilian_large(h):
    # a bulk freighter: a long spine carrying container stacks, a bridge block at the bow and an engine block astern; 105 x 22 x 22 m
    y = 9
    h.box((0, y, 0), (100, 3, 4), PANEL)
    h.box((44, y + 3, 0), (14, 12, 12), HULL, top=(10, 9), front=(8, 8))
    h.box((50.5, y + 6, 0), (1.0, 2.0, 9), GLASS)
    h.box((-44, y + 2, 0), (14, 14, 18), HULL, top=(12, 14))
    for z in (-5, 5):
        for k in range(2):
            nozzle(h, -51, y + 2 + (k - 0.5) * 7, z, 2.8, 2.4)
    for k in range(6):
        for z, yy in ((-5.4, y + 4), (5.4, y + 4), (-5.4, y - 4), (5.4, y - 4)):
            civ_container(h, -30 + k * 11, yy, z, 10, 5, 6, k * 7 + int(z) + int(yy))
    stripe(h, 38, 51, y + 9.05, 0, 9.5, 0.2)
    # (the dressing: the bridge's windows, the engine block's ports and plating, radiators and masts)
    ports(h, 38, 50, [y + 6, y + 3.5], 8, 1.0, 0.6, skip=0.15, seed=121)
    ports(h, -50, -38, [y + 6, y - 2], 6, 1.0, 0.5, skip=0.3, seed=122)
    plates(h, -50, -38, 8, 2.5, 123, 0.3)
    h.pair(lambda s: h.box((-40, y + 4, 9.6), (8, 7, 0.4), METAL))
    mast(h, 42, 0, 0.12, 5)
    mast(h, -46, 4, 0.1, 4, 1)
    gear(h, [(-40, 6), (-40, -6), (40, 4), (40, -4)], y - 4, 0.7)

def ship_civilian_huge(h):
    # a colony hauler: a kilometre of spine carrying rows of habitat and cargo drums, a bow of a bridge and a ring of engines; 950 x 300 x 260 m
    y = 130
    h.cyl((0, y, 0), "x", 30, 900, PANEL, 10)
    h.box((440, y + 20, 0), (90, 120, 140), HULL, top=(70, 100), front=(80, 100))
    for k in range(7):
        x = -340 + k * 100
        for a in range(4):
            t = a * math.pi / 2 + math.pi / 4
            h.cyl((x, y + math.sin(t) * 85, math.cos(t) * 85), "x", 45, 85, HULL if (a + k) % 3 else LIVERY, 10)
    h.torus((-430, y, 0), 110, 20, METAL, 20, 5)
    for a in range(6):
        t = a * math.pi / 3
        nozzle(h, -440, y + math.sin(t) * 90, math.cos(t) * 90, 26, 24)
    # (the dressing: frames between the drums, the habitat drums' rows of windows, the bridge's, solar vanes on masts)
    for k in range(8):
        with h.at((-390 + k * 100, y, 0), (0, 0, math.pi / 2)):
            h.torus((0, 0, 0), 128, 5, METAL, 20, 4)
    ports(h, -380, 360, [y + 80, y + 60, y + 40, y - 40, y - 60, y - 80], 56, 6, 4, skip=0.4, seed=124)
    ports(h, 400, 480, [y + 40, y + 60], 10, 6, 4, skip=0.1, seed=125)
    for x in (-200, 100):
        mast(h, x, 0, 1.6, 60, 0)
        for s in (1, -1):
            h.box((x, h.top(x, 0) - 25, s * 60), (40, 2, 90), PANEL)

def ship_civilian_gargantuan(h):
    # a mobile metropolis: a broad plate of a city with towers, a dome and docks, carried on a hull of engines; 3400 x 1600 x 900 m
    y = 260
    h.loft_x([(-1700, y, 0, 200, 700, 3), (-1200, y, 0, 260, 800, 3.5), (1100, y, 0, 240, 780, 3.5), (1700, y - 40, 0, 120, 420, 2.6)], 16, HULL)
    rnd = random.Random(17)
    for k in range(26):
        x, z = rnd.uniform(-1200, 1200), rnd.uniform(-560, 560)
        hh = rnd.uniform(80, 360)
        h.box((x, y + 240 + hh / 2, z), (rnd.uniform(60, 140), hh, rnd.uniform(60, 140)), HULL if k % 4 else PANEL, top=(rnd.uniform(30, 60), rnd.uniform(30, 60)))
    h.sphere((200, y + 240, 0), 300, GLASS, 16, 8, (1, 0.6, 1))
    for z in (-500, -250, 0, 250, 500):
        nozzle(h, -1700, y, z, 90, 70)
    h.pair(lambda s: h.box((0, y + 60, 790), (2200, 30, 40), GLOW))
    # (the dressing: the towers' windows, seen from abeam and from fore and aft, plating and streets on the city's deck, the hull's ports)
    ports(h, -1250, 1250, [y + 280, y + 330, y + 400, y + 480, y + 560], 90, 16, 10, skip=0.4, seed=131)
    facade(h, 0, 0, [y + 280, y + 330, y + 400, y + 480], 50, 1100, 16, 10, axis="x", skip=0.4, seed=132)
    plates(h, -1300, 1300, 600, 80, 133, 0.15)
    spine_lines(h, -1300, 1300, [0, 200, 400], 24, 10, region=GLOW)
    ports(h, -1500, 1500, [y - 60, y + 40, y + 140], 70, 18, 8, skip=0.4, seed=134)

# ---- The ships, by faction and size (and a role where a faction has two of one size) --------------------------------------------------------

FACTIONS = ["imperial", "rebel", "republic", "separatist", "mandalorian", "criminal", "civilian"]
SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"]
SHIPS = []
for f in FACTIONS:
    for s in SIZES:
        SHIPS.append((f, s, "", globals()[f"ship_{f}_{s}"]))
SHIPS.append(("imperial", "small", "shuttle", ship_imperial_small_shuttle))
SHIPS.append(("republic", "small", "shuttle", ship_republic_small_shuttle))

# The kit parts on their own, for review in Mixar (each at a size typical of its use)
KIT = {
    "common": [("nozzle", lambda h: nozzle(h, 0.5, 1, 0, 0.6, 1.0)), ("cannon", lambda h: cannon(h, -1, 0.2, 0, 2.0, 0.06)), ("gear", lambda h: gear(h, [(0, 0)], 1.5, 0.12)),
               ("canopy", lambda h: canopy(h, 0, 0.3, 0, 2.6, 1.0, 0.55)), ("dish", lambda h: dish(h, (0, 1, 0), 1.2)), ("turret", lambda h: turret(h, (0, 0.6, 0), 0.8)),
               ("greebles", lambda h: greebles(h, -2, 2, -1, 1, 0, 14, 3, 0.5))],
    "imperial": [("ball_cockpit", lambda h: imp_ball(h, (0, 1.6, 0), 1.55)), ("pylon", lambda h: imp_pylon(h, (0, 1, 0), 0.45, 1.6)),
                 ("wing_hex", lambda h: imp_wing(h, 0, 7.5, 6.3, "hex", 0.2)), ("wing_dagger", lambda h: imp_wing(h, 0, 7.5, 6.3, "dagger", 0.2)),
                 ("wing_square", lambda h: imp_wing(h, 0, 3.6, 2.6, "square", 0.12)), ("dagger_hull", lambda h: imp_dagger(h, 30, 12, 6, 2)),
                 ("command_tower", lambda h: imp_tower(h, 0, 0, 6, 6)), ("engine_cluster", lambda h: imp_engines(h, 0, 2, [1.2, 1.2, 0.8], [(0, 1.5), (0, -1.5), (1.2, 0)]))],
    "rebel": [("needle_fuselage", lambda h: reb_fuselage(h, -5, 7.5, 1, 0.75)), ("s_foil", lambda h: reb_sfoil(h, (0, 0.5, 0), 4.6, 2.4, 0.2)),
              ("nacelle", lambda h: reb_nacelle(h, 2, 0.6, 0, 0.38, 3.8)), ("astromech_dome", lambda h: reb_astro(h, 0, 0.3, 0)),
              ("hammerhead_bow", lambda h: reb_hammer(h, 0, 4, 12, 8, 15)), ("engine_bank", lambda h: reb_bank(h, 0, 3, 2, 4, 1.0, 0.3)),
              ("mon_cal_hull", lambda h: mon_cal(h, 60, 16, 13, 3, 2))],
    "republic": [("arrowhead_hull", lambda h: rep_arrow(h, 30, 14, 5)), ("twin_towers", lambda h: rep_twin_towers(h, 0, 0, 5, 6)),
                 ("delta_wing", lambda h: rep_delta(h, 0, 0.3, 8, 4.4, 0.42))],
    "separatist": [("insect_head", lambda h: sep_head(h, 0, 1.6, 7, 1.6)), ("ribbed_spine", lambda h: sep_spine(h, -8, 8, 2, 0.6, 6, 1.0)),
                   ("crescent", lambda h: sep_crescent(h, (0, 1, 0), 5, 0.5, 0.15 * math.pi, 0.85 * math.pi)), ("wing_leg", lambda h: sep_leg(h, (0, 1.5, 0), 2.5, 0, 0.55))],
    "mandalorian": [("t_visor", lambda h: man_visor(h, 0, 1.8, 3.6, 3.4)), ("slab_hull", lambda h: man_slab(h, -8, 8, 0, 4, 4.2)),
                    ("blade_wing", lambda h: man_blade(h, (0, 0.5, 0), 8, 10, 0.3))],
    "criminal": [("yacht_hull", lambda h: crim_yacht(h, -10, 10, 3, 2.2)), ("ornament_fin", lambda h: crim_fin(h, 2, 0, 0, 5, 3)),
                 ("salvage_plates", lambda h: crim_plates(h, -3, 3, 0, 2, 0, 8, 2))],
    "civilian": [("saucer", lambda h: civ_saucer(h, 0, 2.5, 12.8, 4.6)), ("mandibles", lambda h: civ_mandibles(h, -12, 2.5, 12.8, 9.5, 3.6, 3.2, 2.6)),
                 ("side_cockpit", lambda h: civ_cockpit(h, 0, 1.5, 4, 5, 1.3)), ("container", lambda h: civ_container(h, 0, 3, 0, 10, 5, 6, 1))],
}

def code_box(ob):
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    # (Blender's (x, y, z) are the code's (x, -z, y))
    return [round(v, 3) for v in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])]

def build(name, fn):
    h = Hull(name)
    fn(h)
    # (the AO's reach is a ship's own scale)
    lo = [min((v.co[i] for v in h.bm.verts), default=0) for i in range(3)]
    hi = [max((v.co[i] for v in h.bm.verts), default=0) for i in range(3)]
    size = max(hi[i] - lo[i] for i in range(3))
    return h.finish(max(0.25, size * 0.06))

def export(objs, path):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=False, export_materials="NONE", export_yup=True, export_apply=True)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    only = arg("--only")
    made, data = [], {}
    for f, s, role, fn in SHIPS:
        name = f"ship_{f}_{s}" + (f"_{role}" if role else "")
        if only and name not in only.split(","):
            continue
        ob = build(name, fn)
        made.append(ob)
        box = code_box(ob)
        data[name] = {"faction": f, "size": s.capitalize(), "role": role, "box": box, "length": round(box[3] - box[0], 2), "beam": round(box[5] - box[2], 2),
                      "height": round(box[4] - box[1], 2), "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons)}
        print("SHIP", name, data[name]["length"], data[name]["beam"], data[name]["height"], data[name]["tris"])
    os.makedirs(OUT, exist_ok=True)
    export(made, os.path.join(OUT, "ships.glb" if HI else "ships.lo.glb"))
    # (the measures are the full build's: the phone's, of fewer sides, come out no larger, at most about 6 per cent smaller)
    if not only and HI:
        with open(os.path.join(ROOT, "shared", "art", "shipKit.json"), "w") as fh:
            json.dump({"units": "metres; x the bow, y up, z starboard; box [x0, y0, z0, x1, y1, z1]", "ships": data}, fh, indent=1)
    kit_dir = arg("--kit")
    if kit_dir:
        parts = []
        for f, items in KIT.items():
            for pname, fn in items:
                parts.append(build(f"kit_{f}_{pname}", fn))
        os.makedirs(kit_dir, exist_ok=True)
        export(parts, os.path.join(kit_dir, "ships_kit.glb"))
        print("KIT", len(parts), "parts")
    print("SHIPS", len(made), "tris", sum(d["tris"] for d in data.values()))

if __name__ == "__main__":
    main()
