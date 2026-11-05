# Hair, brows and beards of a person (2026-11-04; the user: "lets start with humanoid heads and realistic looking hair styles").
#
# Run headless:  blender --background --python tools/blender/build-hair.py -- <out-dir> [--lo] [--preview <dir>]
# It writes <out-dir>/hair.glb (hair.lo.glb with --lo, about half the triangles): one mesh a style, each drawn as CARDS, the way a game draws hair:
# ribbons laid along guide curves, a little bowed, tapering to the tip, each carrying a strip of the strand map (textures/figure/hair/strands.webp:
# fine strands with an alpha that is cut out; tools/build-hair-textures.mjs). A guide is walked from a root on the scalp: it follows the style's flow
# on the skull, is pulled down by gravity more the further it goes, slides over the skull (it never goes into it) and falls free where the skull
# curves away, over the neck and the shoulders (an ellipsoid and a cylinder stand in for them). Roots are spread evenly over the scalp above a
# hairline, in layers (the inner a little above the skull, the outer more), so the cards overlap like locks.
#   hair_<style>   crop buzz short quiff slick messy curls long wavy bob tail knot braid mohawk
#   beard_<style> stubble moustache goatee short full           brows
# Every mesh is made for the head of build-head.py (the same landmarks, in the code's units and axes: y up, +z the way the face looks, the origin
# at the middle of the skull) and the code scales it with the skull. Per vertex: `_AO` (0.35 at the root to 1 at the tip, a little different for
# each card: the code multiplies it into the colour, so the roots are dark and the tips light, in streaks) and the texture coordinates (u across
# the card in one of four strips of the map, v from the root up the card). The normals are the head's: soft, so that a head of hair shades as
# one mass and not as a heap of ribbons. Original shapes: CC0.
import bpy, bmesh, math, sys, os, random, importlib.util
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P, smooth, OUT, HI

# (the head's own surface, for the beards and the brows that sit on the face)
_spec = importlib.util.spec_from_file_location("build_head", os.path.join(HERE, "build-head.py"))
head = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(head)

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
PREVIEW = arg("--preview")
DENSITY = 1.0 if HI else 0.6
CARDS = 0.72     # (the cap carries the mass; the cards are the edge and the locks)

BX, BY, BZ = head.BX, head.BY, head.BZ
DOWN = Vector((0, -1, 0))
def V(*a):
    return Vector(a[0] if len(a) == 1 else a)

# ---- The skull, the neck and the shoulders as things hair meets -----------------------------------------------------------------------
def inflated(p, m):
    return (p.x / (BX + m)) ** 2 + (p.y / (BY + m)) ** 2 + (p.z / (BZ + m)) ** 2

def skull_normal(p):
    return V((p.x / BX ** 2, p.y / BY ** 2, p.z / BZ ** 2)).normalized()

# (2026-11-05, the user: "some hair tufts seem to be floating above the scalp"): the roots and the collisions were on the skull's ELLIPSOID, but the
# head is not one: build-head.py `surface` pulls the back of the crown in by 6 mm, narrows the head below the temples toward the jaw and moves the
# forehead and the brow; a lock rooted on the ellipsoid there stood up to 6 mm off the scalp. Both now use the head's own surface, sampled in the
# direction of the point (the ellipsoid's coordinates, as `surface` takes them), with the ellipsoid kept only for the soft normals.
def surface_at(p, fem=0.0):
    """the head's own surface in the direction of p"""
    d = V((p.x / BX, p.y / BY, p.z / BZ))
    l = d.length or 1.0
    return V(head.surface(d.x / l, d.y / l, d.z / l, fem, 0))

def on_skull(phi, theta, m):
    d = V((math.sin(theta) * math.sin(phi), math.cos(theta), math.sin(theta) * math.cos(phi)))
    s = V(head.surface(d.x, d.y, d.z, 0.0, 0))
    return s + skull_normal(s) * m

SHOULDERS = (V((0, -0.33, -0.012)), (0.205, 0.235, 0.125))   # the upper chest and the shoulders: an ellipsoid whose top is at y -0.095
def push_out(p, m, steps=1):
    q = p.copy()
    # (out of the head itself: no nearer the middle than its surface, plus the layer's margin)
    if q.y > -0.14:
        s = surface_at(q)
        reach = s.length + m
        if q.length < reach:
            q = q * (reach / max(q.length, 1e-6))
    # the neck: a cylinder
    if -0.30 < q.y < -0.075:
        r = math.hypot(q.x, q.z)
        if r < 0.052 + m:
            k = (0.052 + m) / max(r, 1e-6)
            q.x *= k
            q.z *= k
    c, (rx, ry, rz) = SHOULDERS
    e = V(((q.x - c.x) / (rx + m), (q.y - c.y) / (ry + m), (q.z - c.z) / (rz + m)))
    if e.length < 1.0:
        e = e / max(e.length, 1e-6)
        q = V((c.x + e.x * (rx + m), c.y + e.y * (ry + m), c.z + e.z * (rz + m)))
    return q

def tangent(d, n):
    t = d - n * d.dot(n)
    return t.normalized() if t.length > 1e-6 else d

# ---- A guide ---------------------------------------------------------------------------------------------------------------------------
def walk(p0, d0, length, steps, m, gravity=0.5, stiff=0.5, lift=0.0, curl=0.0, curl_freq=2.0, phase=0.0, wave=0.0, rng=None, pull=None):
    """the points of a guide: from p0 along d0, its direction mixed toward gravity more and more as it goes, kept out of the skull, the neck
    and the shoulders; `lift` stands it off the skull at its root, `curl` winds it, `wave` swings it from side to side, `pull` is a point
    it is drawn toward (a tied tail's, a bun's)"""
    pts = [p0]
    p = p0.copy()
    d = d0.normalized()
    seg = length / steps
    free = False       # (the last step touched nothing: a lock in the air falls)
    for i in range(steps):
        s = (i + 1) / steps
        g = gravity * smooth(0.0, 1.0, s)
        if free:
            g = max(g, 0.85)
        target = (d * (1 - g) + DOWN * g)
        if pull is not None:
            target = target + (pull - p).normalized() * 0.9 * (1 - s)
        target = target.normalized()
        d = (d * stiff + target * (1 - stiff)).normalized()
        if lift:
            d = (d + skull_normal(p) * lift * (1 - s)).normalized()
        q = p + d * seg
        if curl or wave:
            side = d.cross(V((0, 1, 0)))
            if side.length < 1e-4:
                side = V((1, 0, 0))
            side = side.normalized()
            up = side.cross(d).normalized()
            a = curl_freq * 2 * math.pi * s + phase
            q = q + side * (wave * math.sin(a) + curl * math.cos(a)) * 0.35 + up * curl * math.sin(a) * 0.35
        pushed = push_out(q, m)
        free = (pushed - q).length < 1e-7
        q = pushed
        step = q - p
        if step.length > 1e-6:
            d = step.normalized()
        p = q
        pts.append(p)
    return pts

# ---- A card -----------------------------------------------------------------------------------------------------------------------------
NORMALS = []   # the soft normal of each vertex, in the order the cards made them
def card(bm, uvl, aol, pts, width, u0, rng, bow=0.2, taper=(1.0, 0.85, 0.4), shade=1.0, across=2, radial=0.65, facing=None):
    """a ribbon along `pts`: wide at the root, narrow at the tip, bowed out; two quads across (one in the low file)"""
    n = len(pts)
    rows = []
    for i, p in enumerate(pts):
        t = i / (n - 1)
        T = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        T = T.normalized() if T.length > 1e-6 else V((0, -1, 0))
        out = facing if facing is not None else (p - V((0, max(-0.06, min(0.06, p.y)) * 0.4, 0))).normalized()
        nrm = out - T * out.dot(T)
        nrm = nrm.normalized() if nrm.length > 1e-6 else V((0, 0, 1))
        W = T.cross(nrm).normalized()
        k = taper[0] + (taper[1] - taper[0]) * (t / 0.5) if t < 0.5 else taper[1] + (taper[2] - taper[1]) * ((t - 0.5) / 0.5)
        w = max(width * k, width * 0.25)
        cols = []
        for c in range(across + 1):
            f = c / across - 0.5
            # (bowed out along its length, but not at the root, where a bowed card stood off the scalp: 2026-11-05)
            q = p + W * (f * w) + nrm * (bow * w * (1 - (2 * f) ** 2) * smooth(0.0, 0.4, t))
            # the normal: the card's, softened toward the head's own so that the whole mass shades as one
            nm = (nrm * (1 - radial) + out * radial).normalized()
            cols.append((q, nm, u0 + 0.25 * (c / across), t))
        rows.append(cols)
    ao_card = 0.82 + 0.18 * rng.random()
    verts = []
    for cols in rows:
        row = []
        for (q, nm, u, t) in cols:
            v = bm.verts.new(P(q.x, q.y, q.z))
            NORMALS.append(P(nm.x, nm.y, nm.z))
            row.append((v, u, t, nm))
        verts.append(row)
    for a, b in zip(verts, verts[1:]):
        for c in range(across):
            quad = [a[c], a[c + 1], b[c + 1], b[c]]
            # wound so that the face looks outward (along the card's normal)
            e1 = quad[1][0].co - quad[0][0].co
            e2 = quad[3][0].co - quad[0][0].co
            fnorm = e1.cross(e2)
            want = P(quad[0][3].x, quad[0][3].y, quad[0][3].z)
            order = quad if fnorm.dot(want) >= 0 else quad[::-1]
            try:
                f = bm.faces.new([o[0] for o in order])
            except ValueError:
                continue
            for loop, o in zip(f.loops, order):
                loop[uvl].uv = (o[1], o[2])
                loop[aol] = (0.35 + 0.65 * smooth(0.0, 0.9, o[2])) * ao_card * shade
    return bm

# ---- Spreading roots over the scalp -------------------------------------------------------------------------------------------------------
HAIRLINE = [(0, 0.062), (30, 0.058), (60, 0.040), (85, 0.018), (105, -0.010), (140, -0.050), (180, -0.075)]
def hairline(phi, table=None):
    table = table or HAIRLINE
    a = abs(math.degrees(phi))
    a = a if a <= 180 else 360 - a
    for (a0, y0), (a1, y1) in zip(table, table[1:]):
        if a0 <= a <= a1:
            return y0 + (y1 - y0) * (a - a0) / (a1 - a0)
    return table[-1][1]

def roots(n, rng, table=None, region=None, top=0.0):
    """n points spread over the scalp (golden angle over the sphere), above the hairline, inside `region` (a function of the direction), not below `top`"""
    out = []
    n = max(4, int(n * CARDS))
    golden = math.pi * (3 - math.sqrt(5))
    count = 0
    guard = 0
    while len(out) < n and guard < n * 80:
        guard += 1
        k = count
        count += 1
        cz = 1 - 2 * ((k + 0.5) / (n * 4.2))
        if cz < -1:
            break
        theta = math.acos(max(-1, min(1, cz)))
        phi = (k * golden) % (2 * math.pi)
        if phi > math.pi:
            phi -= 2 * math.pi
        y = math.cos(theta) * BY
        if y < hairline(phi, table) or y < top:
            continue
        d = V((math.sin(theta) * math.sin(phi), math.cos(theta), math.sin(theta) * math.cos(phi)))
        if region and not region(d, phi, theta):
            continue
        out.append((phi + rng.uniform(-0.03, 0.03), theta + rng.uniform(-0.02, 0.02)))
    return out

# ---- The cap under the cards: an opaque skin of hair over the scalp (or the beard's ground) so that no bare skull shows between locks --------------------
CAP_U = 0.75   # the strip of the strand map that is opaque, where the cap takes its strands from
def cap(bm, uvl, aol, table, top=-0.1, m=0.0025, mask=None, fem=0.0, rows=18, segs=32, ao=0.55):
    """a skin over the scalp: a grid of the head's surface whose vertices below the hairline are drawn up onto it, so the edge is smooth"""
    rows = max(10, int(rows * (1.0 if HI else 0.65)))
    segs = max(16, int(segs * (1.0 if HI else 0.65)))
    verts = {}
    def vert(i, j):
        key = (i, 0) if i in (0, rows) else (i, j % segs)
        if key not in verts:
            th = math.pi * i / rows
            ph = -math.pi + 2 * math.pi * (j % segs) / segs
            dy = math.cos(th)
            clamped = False
            # (the head's surface, then the vertex drawn up to the hairline if it was below it)
            d = V(math.sin(th) * math.sin(ph), dy, math.sin(th) * math.cos(ph))
            p = V(head.surface(d.x, d.y, d.z, fem, 0))
            floor = max(hairline(ph, table), top)
            if p.y < floor:
                dy2 = max(-0.999, min(0.999, floor / BY))
                r = math.sqrt(1 - dy2 * dy2)
                d = V(r * math.sin(ph), dy2, r * math.cos(ph))
                p = V(head.surface(d.x, d.y, d.z, fem, 0))
                clamped = True
            n = skull_normal(p)
            q = p + n * m
            v = bm.verts.new(P(q.x, q.y, q.z))
            NORMALS.append(P(n.x, n.y, n.z))
            verts[key] = (v, q, n, clamped)
        return verts[key]
    for i in range(rows):
        for j in range(segs):
            corners = [vert(i, j), vert(i, j + 1), vert(i + 1, j + 1), vert(i + 1, j)]
            uniq = []
            for c in corners:
                if all(c[0] is not u[0] for u in uniq):
                    uniq.append(c)
            # (a quad with one corner above the hairline is kept too: its other corners are on the line, so it fills the notch that dropping it left, and
            # the cap's edge runs along the hairline instead of in steps of the grid, 2026-11-05)
            if len(uniq) < 3 or sum(1 for c in uniq if not c[3]) < 1:
                continue
            centre = sum((c[1] for c in uniq), V(0, 0, 0)) / len(uniq)
            if mask and not mask(centre):
                continue
            nrm = sum((c[2] for c in uniq), V(0, 0, 0)).normalized()
            e1 = uniq[1][0].co - uniq[0][0].co
            e2 = uniq[2][0].co - uniq[0][0].co
            order = uniq if e1.cross(e2).dot(P(nrm.x, nrm.y, nrm.z)) >= 0 else uniq[::-1]
            try:
                f = bm.faces.new([o[0] for o in order])
            except ValueError:
                continue
            for loop, o in zip(f.loops, order):
                q = o[1]
                # (the strands of the cap run from the crown down, as the hair falls: u round the head (eight strips of the map's opaque quarter,
                # mirrored so that there is no seam), v from the crown to the hairline. 2026-11-05: they were laid by x and y, which drew rings
                # like the grain of wood on the crown)
                ang = math.atan2(q.x / BX, q.z / BZ)
                band = (ang / math.pi + 1.0) * 4.0
                frac = band % 2.0
                tilt = math.acos(max(-1.0, min(1.0, q.y / (BY + 0.004))))
                loop[uvl].uv = (CAP_U + 0.25 * (frac if frac <= 1.0 else 2.0 - frac), 0.15 + 0.85 * max(0.0, min(1.0, tilt / 2.0)))
                loop[aol] = ao

# ---- The styles ---------------------------------------------------------------------------------------------------------------------------
class Style:
    def __init__(self, name, seed):
        self.name = name
        self.rng = random.Random(seed)
        self.cards = []     # (points, width, u0, extra)
        self.cap = None     # the opaque skin under them: keywords of cap()
    def add(self, pts, width, u0=None, **kw):
        self.cards.append((pts, width, self.rng.choice([0.0, 0.25, 0.5]) if u0 is None else u0, kw))
    def steps(self, length, per=0.034, lo=2, hi=9):
        k = max(lo, min(hi, round(length / per)))
        return k if HI else max(2, (k + 1) // 2)

def guide(st, phi, theta, m, d0, length, width, **kw):
    rng = st.rng
    # (rooted just under the cap's skin, 1.5 mm off the scalp, so that a lock grows out of the hair under it and is not a plate over it; its layer's
    # margin `m` keeps the rest of it out from the head as before)
    p0 = on_skull(phi, theta, min(m, 0.0015))
    n = skull_normal(p0)
    d = tangent(d0, n)
    length = length * (1 + rng.uniform(-0.12, 0.12))
    pts = walk(p0, d, length, st.steps(length), m, rng=rng, **kw)
    st.add(pts, width * (1 + rng.uniform(-0.15, 0.15)))
    return pts

SHORT_LINE = [(0, 0.060), (40, 0.052), (70, 0.030), (95, 0.008), (125, -0.010), (180, -0.030)]

def lerpv(a, b, t):
    return a + (b - a) * t

def style_crop(name, seed, length=0.042, n=84, lift=0.3, table=None, top=-0.03):
    st = Style(name, seed)
    table = table or [(0, 0.060), (40, 0.052), (70, 0.032), (95, 0.012), (130, -0.005), (180, -0.020)]
    st.cap = dict(table=table, top=top, m=0.0028)
    crown = V((0, BY, -0.03))
    for layer, m in enumerate((0.003, 0.007)):
        for phi, theta in roots(int(n * DENSITY / 2), st.rng, table, top=top):
            p0 = on_skull(phi, theta, m)
            d0 = p0 - crown
            L = length * (0.55 + 0.45 * smooth(0.0, 0.9, math.cos(theta)))
            guide(st, phi, theta, m, d0, L, 0.024, gravity=0.35, stiff=0.55, lift=lift)
    return st

def style_short(name, seed, side=1.0, length=0.07, n=96):
    """a side part: the hair falls away from a line a third of the way across, the front swept to the side"""
    st = Style(name, seed)
    st.cap = dict(table=SHORT_LINE, top=-0.04, m=0.0028)
    table = [(0, 0.060), (40, 0.054), (70, 0.034), (95, 0.012), (130, -0.01), (180, -0.03)]
    for layer, m in enumerate((0.003, 0.0075)):
        for phi, theta in roots(int(n * DENSITY / 2), st.rng, table, top=-0.04):
            p0 = on_skull(phi, theta, m)
            part = 0.03 * side
            away = 1.0 if p0.x > part else -1.0
            d0 = V((away * 1.0, 0.0, -0.15 + 0.5 * (1 if p0.z > 0.03 else 0)))
            if p0.z > 0.05 and p0.y > 0.03:      # the fringe: swept across the forehead to the side the part is
                d0 = V((side * 0.9, 0.2, -0.35))
            L = length * (0.75 + 0.25 * st.rng.random()) * (0.8 if p0.z < -0.05 else 1.0)
            guide(st, phi, theta, m, d0, L, 0.026, gravity=0.55, stiff=0.5, lift=0.18)
    return st

def style_quiff(name, seed, length=0.085, n=96):
    """the front brushed up and back, the sides short"""
    st = Style(name, seed)
    st.cap = dict(table=SHORT_LINE, top=-0.04, m=0.0028)
    table = [(0, 0.060), (40, 0.054), (70, 0.030), (95, 0.008), (130, -0.01), (180, -0.03)]
    for layer, m in enumerate((0.003, 0.008)):
        for phi, theta in roots(int(n * DENSITY / 2), st.rng, table, top=-0.04):
            p0 = on_skull(phi, theta, m)
            frontness = smooth(0.0, 0.08, p0.z) * smooth(0.02, 0.08, p0.y)
            d0 = lerpv(p0 - V((0, BY, -0.03)), V((0, 0.9, -0.45)), frontness)
            L = lerpv(0.042, length, frontness)
            guide(st, phi, theta, m, d0, L, 0.026, gravity=0.3 + 0.2 * (1 - frontness), stiff=0.6, lift=0.55 * frontness + 0.2)
    return st

def style_slick(name, seed, length=0.14, n=104):
    """all of it brushed back from the front hairline and down the back of the head"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.07)], m=0.0028)
    for layer, m in enumerate((0.003, 0.0075)):
        for phi, theta in roots(int(n * DENSITY / 2), st.rng, [(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.07)]):
            p0 = on_skull(phi, theta, m)
            d0 = V((p0.x * 0.4, 0.15, -1.0))
            guide(st, phi, theta, m, d0, length * (0.7 + 0.3 * st.rng.random()), 0.028, gravity=0.95, stiff=0.35, lift=0.0)
    return st

def style_messy(name, seed, length=0.095, n=110, wave=0.016):
    """ear length, tousled: waves, the fringe falling over the forehead"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.058), (35, 0.050), (65, 0.030), (90, 0.004), (120, -0.03), (180, -0.06)], top=-0.07, m=0.0035)
    for layer, m in enumerate((0.003, 0.008, 0.013)):
        for phi, theta in roots(int(n * DENSITY / 3), st.rng, [(0, 0.058), (35, 0.050), (65, 0.030), (90, 0.004), (120, -0.03), (180, -0.06)], top=-0.07):
            p0 = on_skull(phi, theta, m)
            d0 = (p0 - V((0, BY, -0.01))) + V(st.rng.uniform(-0.04, 0.04), 0, st.rng.uniform(-0.04, 0.04))
            L = length * (0.7 + 0.5 * st.rng.random())
            if p0.z > 0.05 and p0.y > 0.035:
                d0 = V(st.rng.uniform(-0.5, 0.5), -0.2, 0.7)       # the fringe falls forward
                L *= 0.7
            guide(st, phi, theta, m, d0, L, 0.028, gravity=0.75, stiff=0.42, lift=0.2, wave=wave, curl_freq=1.5, phase=st.rng.uniform(0, 6))
    return st

def style_curls(name, seed, n=120, volume=0.012):
    """tight curls standing off the head: short winding guides in layers, a rounded mass"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.064), (35, 0.058), (65, 0.038), (90, 0.014), (120, -0.015), (180, -0.045)], top=-0.06, m=0.010)
    for layer, m in enumerate((0.004, 0.012 + volume, 0.020 + volume * 2)):
        for phi, theta in roots(int(n * DENSITY / 3), st.rng, [(0, 0.064), (35, 0.058), (65, 0.038), (90, 0.014), (120, -0.015), (180, -0.045)], top=-0.06):
            p0 = on_skull(phi, theta, m)
            # (laid down the head's slope as much as off it: straight out along the normal, the cards stood off the head as flat tufts, 2026-11-05)
            nrm = skull_normal(p0)
            down = V(0, -1, 0) - nrm * (-nrm.y)
            d0 = nrm * 0.55 + (down.normalized() if down.length > 1e-6 else V(0, 0, -1)) + V(st.rng.uniform(-0.25, 0.25), st.rng.uniform(-0.1, 0.15), st.rng.uniform(-0.25, 0.25))
            guide(st, phi, theta, m, d0, 0.034 + 0.012 * layer, 0.024, gravity=0.5, stiff=0.45, lift=0.12, curl=0.010, curl_freq=2.2, phase=st.rng.uniform(0, 6))
    return st

def style_long(name, seed, length=0.46, n=120, wave=0.0, bangs=True, curl_freq=1.6):
    """parted in the middle, falling past the shoulders: over the ears or behind them, the back hanging down the spine"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.034), (90, 0.002), (115, -0.04), (140, -0.075), (180, -0.095)], top=-0.095, m=0.0035)
    for layer, m in enumerate((0.003, 0.008, 0.013)):
        for phi, theta in roots(int(n * DENSITY / 3), st.rng, [(0, 0.062), (35, 0.056), (65, 0.034), (90, 0.002), (115, -0.04), (140, -0.075), (180, -0.095)], top=-0.095):
            p0 = on_skull(phi, theta, m)
            away = 1.0 if p0.x >= 0 else -1.0
            back = smooth(0.0, -0.075, p0.z)      # 0 at the front and the top, 1 at the back: the back falls straight, the sides are swept back first
            d0 = lerpv(V(away * (0.5 + 0.6 * abs(p0.x) / BX), 0.05, -0.25), V(0, -1.0, -0.1), back)
            L = length * (0.55 + 0.45 * smooth(-0.04, -0.14, p0.z)) * (0.85 + 0.3 * st.rng.random())
            if bangs and p0.z > 0.05 and p0.y > 0.03:
                d0 = V(away * 0.9, 0.0, 0.2)
                L = 0.10
            # (the hair at the sides is swept back over the ear, then falls; the back of it simply falls)
            guide(st, phi, theta, m, d0, L, 0.030, gravity=0.8, stiff=0.5, lift=0.1, wave=wave, curl_freq=curl_freq, phase=st.rng.uniform(0, 6))
    return st

def style_bob(name, seed, length=0.22, n=108):
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.034), (90, 0.002), (115, -0.04), (140, -0.065), (180, -0.075)], top=-0.075, m=0.0035)
    for layer, m in enumerate((0.003, 0.009, 0.014)):
        for phi, theta in roots(int(n * DENSITY / 3), st.rng, [(0, 0.062), (35, 0.056), (65, 0.034), (90, 0.002), (115, -0.04), (140, -0.065), (180, -0.075)], top=-0.075):
            p0 = on_skull(phi, theta, m)
            away = 1.0 if p0.x >= 0 else -1.0
            back = smooth(0.0, -0.075, p0.z)
            d0 = lerpv(V(away * 0.7, 0.0, -0.2), V(0, -1.0, -0.1), back)
            L = length * (0.9 + 0.2 * st.rng.random())
            if p0.z > 0.05 and p0.y > 0.035:
                d0 = V(away * 0.5, -0.1, 0.8)
                L = 0.07
            guide(st, phi, theta, m, d0, L, 0.032, gravity=0.85, stiff=0.5, lift=0.12)
    return st

def tie_style(st, tie, scalp_n, tail_n, tail_length, tail_w, spread, rng_curl=0.0):
    """scalp hair drawn back to a point, and the tail hanging from it"""
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.05)], m=0.0028)
    for layer, m in enumerate((0.003, 0.008)):
        for phi, theta in roots(int(scalp_n * DENSITY / 2), st.rng, [(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.07)]):
            p0 = on_skull(phi, theta, m)
            d0 = tie - p0
            pts = walk(p0, tangent(d0, skull_normal(p0)), d0.length * 0.95, st.steps(d0.length * 0.95), m, gravity=0.1, stiff=0.5, pull=tie)
            st.add(pts, 0.026)
    for i in range(int(tail_n * DENSITY)):
        a = 2 * math.pi * i / max(1, int(tail_n * DENSITY)) + st.rng.uniform(-0.2, 0.2)
        off = V(math.cos(a) * spread, st.rng.uniform(-0.004, 0.004), math.sin(a) * spread)
        p0 = tie + off
        d0 = V(off.x * 3, -1.0, -0.35 + off.z * 3)
        L = tail_length * (0.85 + 0.3 * st.rng.random())
        pts = walk(p0, d0, L, st.steps(L, 0.04, 3, 7), 0.002, gravity=0.7, stiff=0.55, curl=rng_curl, curl_freq=1.4, phase=st.rng.uniform(0, 6))
        st.add(pts, tail_w)

def style_tail(name, seed, high=False, length=0.24):
    st = Style(name, seed)
    tie = V(0, 0.045 if high else -0.012, -0.128 if not high else -0.10)
    tie_style(st, tie, 100, 26, length, 0.03, 0.022, rng_curl=0.006)
    return st

def style_knot(name, seed):
    """drawn up to a bun on the crown: the scalp hair taken to it, and the bun a coil of cards round a knot"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.06)], m=0.0028)
    tie = V(0, 0.118, -0.030)
    for layer, m in enumerate((0.003, 0.008)):
        for phi, theta in roots(int(96 * DENSITY / 2), st.rng, [(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.06)]):
            p0 = on_skull(phi, theta, m)
            d0 = tie - p0
            pts = walk(p0, tangent(d0, skull_normal(p0)), d0.length * 0.95, st.steps(d0.length * 0.95), m, gravity=0.0, stiff=0.5, pull=tie)
            st.add(pts, 0.026)
    # (the bun: cards winding round a point above the tie)
    centre = V(0, 0.158, -0.034)
    for i in range(int(18 * DENSITY)):
        a0 = 2 * math.pi * i / max(1, int(18 * DENSITY))
        pts = []
        for j in range(7 if HI else 4):
            s = j / (6 if HI else 3)
            ang = a0 + s * 3.4
            r = 0.052 * (0.55 + 0.45 * math.sin(math.pi * s))
            h = (s - 0.5) * 0.06 + 0.012 * math.sin(ang * 2)
            pts.append(centre + V(math.cos(ang) * r, h + 0.022 * (1 - abs(2 * s - 1)), math.sin(ang) * r))
        st.add(pts, 0.034)
    return st

def style_braid(name, seed):
    """the hair drawn back to a tie at the nape and plaited: a rope of locks laid over the shoulder"""
    st = Style(name, seed)
    st.cap = dict(table=[(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.075)], m=0.0028)
    tie = V(0.0, -0.045, -0.115)
    for layer, m in enumerate((0.003, 0.008)):
        for phi, theta in roots(int(96 * DENSITY / 2), st.rng, [(0, 0.062), (35, 0.056), (65, 0.036), (90, 0.01), (115, -0.02), (180, -0.075)]):
            p0 = on_skull(phi, theta, m)
            d0 = tie - p0
            pts = walk(p0, tangent(d0, skull_normal(p0)), d0.length * 0.95, st.steps(d0.length * 0.95), m, gravity=0.15, stiff=0.5, pull=tie)
            st.add(pts, 0.026)
    # the plait: a hanging line with three strands woven about it, over the right shoulder
    line = walk(tie + V(0.012, 0.0, 0.0), V(0.25, -0.5, -0.4), 0.30, 12 if HI else 6, 0.003, gravity=0.8, stiff=0.5)
    for strand in range(3):
        pts = []
        for i, p in enumerate(line):
            s = i / (len(line) - 1)
            a = strand * 2 * math.pi / 3 + s * 9.0
            tang = (line[min(i + 1, len(line) - 1)] - line[max(i - 1, 0)]).normalized()
            side = tang.cross(V(0, 0, 1)).normalized()
            up = side.cross(tang).normalized()
            r = 0.014 * (1 - 0.55 * s)
            pts.append(p + side * math.cos(a) * r + up * math.sin(a) * r)
        st.add(pts, 0.030, 0.0)
    return st

def style_mohawk(name, seed):
    st = Style(name, seed)
    # a crest standing along the skull from the brow to the nape (two rows of cards), and a close crop either side
    st.cap = dict(table=SHORT_LINE, top=-0.03, m=0.0028)
    steps = max(10, int(34 * DENSITY))
    for i in range(steps):
        s_ = i / (steps - 1)
        a = math.radians(-50 + s_ * 205)       # round the x axis, from the front of the crown over the top to the back of the head
        base = V(0, (BY + 0.003) * math.sin(a), (BZ + 0.003) * math.cos(a))
        if base.y < -0.045:
            continue
        up = skull_normal(base)
        for dx in (-0.009, 0.009):
            p0 = base + V(dx, 0, 0)
            L = 0.065 * (0.7 + 0.3 * math.sin(math.pi * s_))
            pts = walk(p0, up + V(0, 0.2, -0.1), L, st.steps(L, 0.03), 0.003, gravity=0.35, stiff=0.7)
            st.add(pts, 0.032, facing=V(1.0 if dx > 0 else -1.0, 0, 0))
    for phi, theta in roots(int(44 * DENSITY), st.rng, [(0, 0.05), (60, 0.03), (100, 0.0), (180, -0.03)], region=lambda d, ph, th: abs(d.x) > 0.34, top=-0.02):
        guide(st, phi, theta, 0.003, on_skull(phi, theta, 0.003) - V(0, BY, 0), 0.016, 0.018, gravity=0.2, stiff=0.6, lift=0.4)
    return st

def style_buzz(name, seed):
    st = style_crop(name, seed, length=0.018, n=70, lift=0.3, top=-0.02)
    st.cap = dict(table=[(0, 0.060), (40, 0.050), (70, 0.026), (95, 0.004), (125, -0.014), (180, -0.034)], top=-0.03, m=0.0032)
    return st

# ---- Beards, a moustache and the brows, on the face --------------------------------------------------------------------------------------
def face_point(x, y, m, ft=None):
    """the face's surface at (x, y): a point on the head of build-head.py and its outward direction (the guide starts a little above it)"""
    dx = x / BX
    dy = y / BY
    dz = math.sqrt(max(0.02, 1 - dx * dx - dy * dy))
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    p = V(head.surface(dx / n, dy / n, dz / n, ft["fem"] if ft else 0.0, 0, None, ft))
    out = skull_normal(p)
    return p + out * m, out

def style_beard(name, seed, kind):
    st = Style(name, seed)
    rng = st.rng
    def grow(x, y, d0, L, width, m=0.002, **kw):
        p0, out = face_point(x, y, m)
        pts = walk(p0, tangent(d0 + out * 0.2, out), L, st.steps(L, 0.02, 2, 5), m, rng=rng, **kw)
        st.add(pts, width)
    if kind in ("short", "full", "goatee"):
        def ground(c):
            if c.z < 0.0:
                return False
            if kind == "goatee":
                return abs(c.x) < 0.024 and -0.100 < c.y < -0.062
            if -0.062 < c.y < -0.028 and abs(c.x) < 0.03:   # (the lips and the philtrum stay bare, the moustache is its own)
                return abs(c.x) > 0.024 or c.y > -0.040 and False
            return -0.100 < c.y < -0.028
        st.cap = dict(table=[(0, -2.0), (180, -2.0)], top=-0.2, m=0.0022, mask=ground, ao=0.62, rows=40, segs=68)
    if kind in ("moustache", "goatee", "full", "short"):
        # the moustache: from above the lip, out to the sides and down
        for x in [i * 0.0065 for i in range(-4, 5)]:
            y = -0.0385 + 0.003 * math.cos(x * 60)
            grow(x, y, V(x * 18, -0.5, 0.4), 0.032 if kind != "short" else 0.024, 0.012, gravity=0.55, stiff=0.5)
    if kind in ("goatee", "full", "short"):
        for x in [i * 0.0075 for i in range(-3, 4)]:
            grow(x, -0.078, V(0, -1.0, 0.2), 0.050 if kind == "goatee" else 0.034, 0.013, gravity=0.7)
            grow(x * 1.1, -0.092, V(0, -1.0, 0.15), 0.045 if kind == "goatee" else 0.030, 0.013, gravity=0.7)
    if kind in ("full", "short"):
        L = 0.036 if kind == "full" else 0.022
        for x in [0.030, 0.042, 0.054, 0.066, 0.076]:
            for sgn in (1, -1):
                for y in (-0.040, -0.058, -0.074):
                    if x > 0.07 and y > -0.05:
                        continue
                    grow(sgn * x, y, V(sgn * 0.15, -1.0, 0.25), L * (1.2 if y < -0.06 else 1.0), 0.013, gravity=0.75)
        # the sideburns up to the ears
        for sgn in (1, -1):
            for y in (-0.01, 0.015, 0.035):
                grow(sgn * 0.090, y, V(0, -1, 0.1), 0.026, 0.014, gravity=0.8)
    if kind == "stubble":
        for x in [i * 0.012 for i in range(-6, 7)]:
            for y in (-0.040, -0.058, -0.076, -0.092):
                grow(x, y, V(0, -1, 0.3), 0.010, 0.014, gravity=0.3)
    return st

# Brows (2026-11-05, the user: "the eyebrows look weird: a few variations to retain originality"): they were one band of broad cards (7.5 mm each) laid on the masculine head's
# surface (on the feminine head, whose brow ridge is lower, they stood off it). Now each head type has its own, in three kinds of finer hairs in two rows: the hairs near the nose
# grow up and out, the middle ones out, the last ones out and down, shorter and finer toward the tail
#   y the line's height, arch how far it rises, tail how far it falls at the end, gap where it begins (from the middle), reach how far it runs, thick the band's height,
#   len the hair's length, lift how steeply the first hairs rise, w a card's width, count hairs a row
BROWS = [
    dict(y=0.0395, arch=0.0055, tail=-0.0040, gap=0.019, reach=0.046, thick=0.0, len=0.013, lift=0.9, w=0.0050, count=15, rows=1),      # soft, arched
    dict(y=0.0385, arch=0.0025, tail=-0.0020, gap=0.015, reach=0.052, thick=0.0, len=0.014, lift=0.5, w=0.0062, count=15, rows=1),      # straight and thick
    dict(y=0.0415, arch=0.0090, tail=-0.0080, gap=0.025, reach=0.042, thick=0.0, len=0.010, lift=1.1, w=0.0038, count=12, rows=1),      # thin, high arch
]

def style_brows(name, seed, ft, spec):
    st = Style(name, seed)
    rng = st.rng
    n = max(5, int(spec["count"] * DENSITY))
    rows = spec["rows"]
    for sgn in (1, -1):
        for row in range(rows):
            for i in range(n):
                s = min(1.0, (i + 0.5 * row + 0.25) / n)
                x = sgn * (spec["gap"] + spec["reach"] * s)
                band = spec["thick"] * (1.0 - 0.65 * s) * ((row / (rows - 1) - 0.5) if rows > 1 else 0.0)
                y = spec["y"] + spec["arch"] * math.sin(math.pi * min(1.0, s * 1.1) ** 0.9) + spec["tail"] * s ** 3 + band
                p0, out = face_point(x, y, 0.0022, ft)
                d0 = V(sgn * 1.0, spec["lift"] * (1.0 - 2.3 * s) + rng.uniform(-0.15, 0.15), 0.0)
                length = spec["len"] * (1.15 - 0.5 * s) * rng.uniform(0.85, 1.1)
                pts = walk(p0, tangent(d0, out), length, 2, 0.0022, gravity=0.0, stiff=0.6)
                st.add(pts, spec["w"] * (1.0 - 0.35 * s), 0.0)
    return st

# Tattoos (2026-11-05, the user: Zabrak skin colourations; the species has "facial tattoos"): ink lines laid on the face, thin strips along the surface a hair's width above it, in
# three patterns (mirrored about the middle, the first points the left side's): each is (points in the face's x, y, width, mirrored). The code draws them in a dark ink.
TATTOOS = [
    # bands from the brow down the cheeks, a pair on the chin
    [([(0.008, 0.088), (0.010, 0.066)], 0.0055, 1), ([(0.022, 0.085), (0.027, 0.060)], 0.0055, 1), ([(0.036, 0.079), (0.045, 0.056)], 0.0055, 1), ([(0.050, 0.073), (0.062, 0.056)], 0.005, 1),
     ([(0.030, -0.004), (0.046, -0.032)], 0.0055, 1), ([(0.047, 0.006), (0.068, -0.020)], 0.005, 1), ([(0.012, -0.068), (0.013, -0.096)], 0.0055, 1), ([(0.026, -0.066), (0.031, -0.090)], 0.005, 1)],
    # chevrons across the forehead and a line under each eye to the temple
    [([(-0.045, 0.071), (0.0, 0.061), (0.045, 0.071)], 0.0045, 0), ([(-0.038, 0.082), (0.0, 0.073), (0.038, 0.082)], 0.0045, 0), ([(-0.030, 0.092), (0.0, 0.085), (0.030, 0.092)], 0.004, 0),
     ([(0.030, -0.010), (0.052, -0.006), (0.078, 0.004)], 0.0045, 1), ([(0.0, -0.066), (0.0, -0.098)], 0.006, 0)],
    # a stripe down the middle, bars along the cheekbones and from the temples to the jaw
    [([(0.0, 0.098), (0.0, 0.056)], 0.0065, 0), ([(0.062, 0.015), (0.080, -0.012)], 0.006, 1), ([(0.052, 0.004), (0.070, -0.026), (0.062, -0.052)], 0.0045, 1), ([(0.024, 0.080), (0.050, 0.070), (0.074, 0.050)], 0.0045, 1),
     ([(0.018, -0.066), (0.018, -0.094)], 0.0055, 1)],
]

def style_tattoo(name, seed, ft, pattern):
    st = Style(name, seed)
    for pts, width, mirrored in pattern:
        for sgn in ((1, -1) if mirrored else (1,)):
            dense = head._curve(tuple((p[0] * sgn, p[1]) for p in pts))
            line = [face_point(x, y, 0.0007, ft)[0] for x, y in dense]
            st.add(line, width, 0.0, bow=0.0, taper=(0.55, 1.0, 0.45), radial=1.0)
    return st

STYLES = {
    "hair_crop": lambda: style_crop("hair_crop", 11),
    "hair_buzz": lambda: style_buzz("hair_buzz", 12),
    "hair_short": lambda: style_short("hair_short", 13),
    "hair_quiff": lambda: style_quiff("hair_quiff", 14),
    "hair_slick": lambda: style_slick("hair_slick", 15),
    "hair_messy": lambda: style_messy("hair_messy", 16),
    "hair_curls": lambda: style_curls("hair_curls", 17),
    "hair_long": lambda: style_long("hair_long", 18),
    "hair_wavy": lambda: style_long("hair_wavy", 19, length=0.42, wave=0.018, curl_freq=2.6),
    "hair_bob": lambda: style_bob("hair_bob", 20),
    "hair_tail": lambda: style_tail("hair_tail", 21),
    "hair_knot": lambda: style_knot("hair_knot", 22),
    "hair_braid": lambda: style_braid("hair_braid", 23),
    "hair_mohawk": lambda: style_mohawk("hair_mohawk", 24),
    "beard_stubble": lambda: style_beard("beard_stubble", 31, "stubble"),
    "beard_moustache": lambda: style_beard("beard_moustache", 32, "moustache"),
    "beard_goatee": lambda: style_beard("beard_goatee", 33, "goatee"),
    "beard_short": lambda: style_beard("beard_short", 34, "short"),
    "beard_full": lambda: style_beard("beard_full", 35, "full"),
}
for _t, _ft in head.TYPES.items():
    for _k, _pattern in enumerate(TATTOOS):
        STYLES[f"tattoo_{_t}_{_k}"] = (lambda t=_t, ft=_ft, k=_k, pattern=_pattern: style_tattoo(f"tattoo_{t}_{k}", 51 + k, ft, pattern))
    for _k, _spec in enumerate(BROWS):
        STYLES[f"brows_{_t}_{_k}"] = (lambda t=_t, ft=_ft, k=_k, spec=_spec: style_brows(f"brows_{t}_{k}", 41 + k, ft, spec))

def build(style):
    me = bpy.data.meshes.new(style.name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    aol = bm.loops.layers.float.new("_AOL")
    across = 2 if HI else 1
    del NORMALS[:]
    if style.cap:
        cap(bm, uvl, aol, **style.cap)
    for pts, width, u0, kw in style.cards:
        card(bm, uvl, aol, pts, width, u0, style.rng, across=across, **kw)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(style.name, me)
    bpy.context.collection.objects.link(ob)
    # (_AO per vertex: the average of its loops')
    ao = me.attributes.new("_AO", "FLOAT", "POINT")
    sums = [0.0] * len(me.vertices)
    counts = [0] * len(me.vertices)
    layer = me.attributes.get("_AOL")
    for li, loop in enumerate(me.loops):
        sums[loop.vertex_index] += layer.data[li].value
        counts[loop.vertex_index] += 1
    for i in range(len(me.vertices)):
        ao.data[i].value = sums[i] / max(1, counts[i])
    me.attributes.remove(layer)
    me.attributes.new("_REGION", "FLOAT", "POINT")
    for poly in me.polygons:
        poly.use_smooth = True
    if len(NORMALS) == len(me.vertices):
        me.normals_split_custom_set_from_vertices([n.normalized() for n in NORMALS])
    return ob

def preview(obs, path, yaw, pitch=0.0, scale=0.7, centre=(0, 0, 0)):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.render.resolution_x = scn.render.resolution_y = 560
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "OBJECT"
    for o in obs:
        o.color = (0.86, 0.66, 0.54, 1) if o.name == "skull" else (0.22, 0.12, 0.06, 1)
    scn.display.shading.show_backface_culling = False
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if "cam" not in bpy.context.scene.objects:
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    r = 2.0
    cam.location = Vector((math.sin(yaw) * r + centre[0], -math.cos(yaw) * r + centre[1], centre[2]))
    cam.rotation_euler = (math.pi / 2, 0, yaw)
    scn.camera = cam
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o not in obs
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

def main(reset=True):
    """`reset` False: built in the open Mixar session (build-head.py export_live), in the collection made active for it"""
    if reset:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    only = arg("--only")
    names = [n for n in STYLES if not only or n in only.split(",")]
    made = []
    skull = None
    if PREVIEW:
        skull = head.head_mesh("skull", 0.0, 30, 40, 1)
        skull.data.materials.clear()
    for name in names:
        ob = build(STYLES[name]())
        made.append(ob)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            for yaw, tag in ((0.0, "front"), (math.radians(90), "side"), (math.radians(180), "back"), (math.radians(40), "three")):
                preview([ob, skull], os.path.join(PREVIEW, f"{name}_{tag}.png"), yaw, scale=0.75 if "long" in name or "wavy" in name or "braid" in name or "tail" in name else 0.5, centre=(0, 0, -0.04 if "long" in name or "wavy" in name or "braid" in name else 0.0))
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in made:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "hair.glb" if HI else "hair.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=True, export_materials="NONE", export_yup=True, export_apply=False)
    print("HAIR", path, {o.name: len(o.data.polygons) * 2 for o in made})

if __name__ == "__main__":
    if bpy.app.background:
        main()
    else:
        print("build-hair.py: run it headless, or through build-head.py's in-session export (builtins.HEAD_EXPORT), which builds the hair too")
