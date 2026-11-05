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
from mathutils import Vector, Matrix

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

    def finish(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for poly in me.polygons:
            poly.use_smooth = False
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
    # a low dome of sun-dried brick with an oculus lantern, the beam ends (vigas) standing out round its foot, a parapet lip
    p.lathe([(1.05, 0), (1.05, 0.1), (1.0, 0.13), (0.97, 0.14), (0.9, 0.3), (0.72, 0.46), (0.45, 0.56), (0.2, 0.6), (0.0, 0.6)], 28, 0)
    p.lathe([(1.07, 0.1), (1.07, 0.16), (1.0, 0.16)], 28, 1, cap=False)
    for i in range(14):
        a = 2 * math.pi * i / 14
        p.cyl((math.cos(a) * 1.12, 0.07, math.sin(a) * 1.12), "x" if False else "y", 0.03, 0.04, 4, 6)
        beam = ((math.cos(a) * 1.04, 0.07, math.sin(a) * 1.04))
        p.box(beam, (0.1 if abs(math.cos(a)) > 0.5 else 0.06, 0.06, 0.1 if abs(math.sin(a)) > 0.5 else 0.06), 4)
    p.cyl((0, 0.66, 0), "y", 0.17, 0.12, 1, 14)
    p.cyl((0, 0.7, 0), "y", 0.1, 0.06, 3, 12)
    return p

def crown_domed():
    p = Piece("crown_domed")
    # a drum, an onion dome with a collar, a finial with a crescent
    p.lathe([(0.9, 0), (0.9, 0.34)], 32, 0)
    p.lathe([(0.96, 0.32), (0.96, 0.4), (0.9, 0.4)], 32, 1, cap=False)
    p.lathe([(0.92, 0.4), (1.04, 0.52), (1.08, 0.72), (0.98, 0.96), (0.72, 1.2), (0.42, 1.44), (0.18, 1.7), (0.07, 1.95), (0.0, 2.05)], 32, 0)
    for i in range(8):
        a = 2 * math.pi * i / 8
        p.box((math.cos(a) * 0.95, 0.62, math.sin(a) * 0.95), (0.07, 0.44, 0.07), 1)
    p.lathe([(0.1, 2.0), (0.1, 2.06), (0.05, 2.1), (0.0, 2.7)], 10, 1)
    p.lathe([(0.0, 2.2), (0.16, 2.3), (0.0, 2.4)], 12, 1, at=(0, 0.0, 0), scale=(1, 0.18))
    return p

def crown_minaret():
    p = Piece("crown_minaret")
    p.box((0, 0.2, 0), (0.7, 0.4, 0.7), 0, top=(0.5, 0.5))
    p.lathe([(0.22, 0.4), (0.2, 1.4), (0.17, 2.5)], 20, 0)
    for y in (1.75, 2.35):
        p.lathe([(0.34, y), (0.34, y + 0.07), (0.2, y + 0.07)], 20, 1, cap=False)
        for i in range(10):
            a = 2 * math.pi * i / 10
            p.cyl((math.cos(a) * 0.32, y + 0.14, math.sin(a) * 0.32), "y", 0.012, 0.14, 1, 5)
        p.lathe([(0.34, y + 0.2), (0.34, y + 0.22)], 20, 1, cap=False)
    p.lathe([(0.24, 2.5), (0.22, 2.58), (0.17, 2.7), (0.0, 3.35)], 20, 1)
    p.lathe([(0.04, 3.3), (0.04, 3.6)], 8, 1)
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
    # a smooth pressure blister with an equator ring, a sensor eye and a fin
    p.lathe([(1.05, 0), (1.06, 0.1), (0.98, 0.34), (0.74, 0.58), (0.4, 0.72), (0.0, 0.76)], 32, 0)
    p.lathe([(1.08, 0.12), (1.1, 0.18), (1.08, 0.24), (1.02, 0.24), (1.0, 0.12)], 32, 1, cap=False)
    p.cyl((0.0, 0.6, 0.55), "z", 0.12, 0.1, 2, 14)
    p.cyl((0.0, 0.6, 0.6), "z", 0.07, 0.04, 3, 12)
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

BUILDERS = [crown_adobe, crown_domed, crown_minaret, crown_deco, crown_polar, crown_timber, crown_hull, crown_bunker,
            portal_adobe, portal_domed, portal_deco, portal_polar, portal_timber, portal_hull, relief_buttress, relief_fin, relief_beams]

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    only = arg("--only")
    made, kit = [], {}
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

if __name__ == "__main__":
    main()
