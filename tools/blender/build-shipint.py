# The starship interior kit (2026-11-09; the task: "build modular asset packs (pertinent to faction) for ship interiors"). One kit per maker or faction, as the exteriors
# (build-ships.py): imperial, rebel, republic, separatist, mandalorian, criminal, civilian. Each faction has the same nine pieces in its own shape language and colours:
#   wall, wall_detail, wall_port      tiles of a bulkhead (1 long, 1 high, 0.3 deep, the front towards +z): drawn in runs (interiors/Walls.tsx), the door and window
#                                     frames and the openings are the map's own
#   seat                              the pilot's, co-pilot's and gunnery seats and the command chair
#   console, console_bank             a desk console, a bank of three
#   bunk, locker, reactor             a crew bunk (2 by 1 squares), a bank of lockers, the engine room's core (2 by 2)
# written to <out-dir>/<faction>_<piece>.glb (client/public/assets/mixar-ship/), vertex-coloured in the faction's paint (the room is not toned again), in the units of the
# map (a square is 1; a person stands 1.2), built lying along x with the back to -z and the front to +z, the floor at y 0, and shared/art/shipIntKit.json (what each is).
#   mixar.exe|blender --background --python tools/blender/build-shipint.py -- <out-dir> [--only imperial,rebel] [--sheet <png>]
# Regions (as the exteriors): 0 hull, 1 panel, 2 glow, 3 glass, 4 livery (the faction's accent), 5 metal, 6 fabric. Original shapes after the references on the moodboard
# (inspiration only; tools/refs/ships.md): CC0.
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Euler
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HULL, PANEL, GLOW, GLASS, LIVERY, METAL, FABRIC = range(7)

# hull, panel, glow, glass, livery, metal, fabric (sRGB), after the exteriors' paint (models.tsx SHIP_PAINT) and the pictures
PAINT = {
    "imperial": ["#454b53", "#1f2328", "#a9dcff", "#14202c", "#8f2233", "#72777e", "#2b2e34"],
    "rebel": ["#d3cebf", "#8b8d8c", "#ff9a4d", "#1b2a38", "#b8473e", "#5a5e63", "#72694f"],
    "republic": ["#e6e6e0", "#a2a8b0", "#9fd4ff", "#1b2a38", "#a3322b", "#555a60", "#8a3d38"],
    "separatist": ["#a68f66", "#5c6672", "#8fc8ff", "#2a2a30", "#c0392b", "#4d4a45", "#3a3f48"],
    "mandalorian": ["#66727d", "#2e353c", "#e8f4ff", "#101418", "#36679e", "#43484e", "#2b2f36"],
    "criminal": ["#8e4254", "#4a2c37", "#ff7a5c", "#2a1f2a", "#c9a24a", "#5e5349", "#5e2c3e"],
    "civilian": ["#cbc3b1", "#8f8a80", "#c8e6ff", "#1b2a38", "#b0623a", "#625f5a", "#6c5c49"],
}
def linear(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c]

class Piece:
    def __init__(self, name, paint):
        self.name, self.paint = name, paint
        self.bm = bmesh.new()
        self.rl = self.bm.verts.layers.float.new("_REGION")
        self.stack = [Matrix.Identity(4)]

    def at(self, pos=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        s = (scale,) * 3 if isinstance(scale, (int, float)) else scale
        m = Matrix.Translation(Vector(pos)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        self.stack.append(self.stack[-1] @ m)
        return self
    def __enter__(self): return self
    def __exit__(self, *a): self.stack.pop()

    def v(self, p, r):
        c = self.stack[-1] @ Vector(p)
        vert = self.bm.verts.new(P(c.x, c.y, c.z))
        vert[self.rl] = float(r)
        return vert
    def face(self, vs):
        try: self.bm.faces.new(vs)
        except ValueError: pass

    def box(self, c, size, region=HULL, top=None):
        """a box about c (x, y, z); `top` (sx, sz) narrows its top"""
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        tx, tz = (sx, sz) if top is None else (top[0] / 2, top[1] / 2)
        pts = {}
        for dx in (-1, 1):
            for dy in (-1, 1):
                for dz in (-1, 1):
                    kx, kz = (sx, sz) if dy < 0 else (tx, tz)
                    pts[(dx, dy, dz)] = self.v((c[0] + dx * kx, c[1] + dy * sy, c[2] + dz * kz), region)
        for q in (((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)), ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
                  ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)),
                  ((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)), ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))):
            self.face([pts[k] for k in q])

    def prism(self, outline, y0, y1, region=HULL, inset=0.0):
        """a plan outline [(x, z)] pushed up from y0 to y1; `inset` draws the top in towards its middle"""
        cx = sum(p[0] for p in outline) / len(outline)
        cz = sum(p[1] for p in outline) / len(outline)
        lo = [self.v((x, y0, z), region) for x, z in outline]
        hi = [self.v((x + (cx - x) * inset, y1, z + (cz - z) * inset), region) for x, z in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.face([lo[i], lo[j], hi[j], hi[i]])
        self.face(lo[::-1]); self.face(hi)

    def plate(self, outline, z0, z1, region=HULL):
        """a side outline [(x, y)] pushed across from z0 to z1"""
        a = [self.v((x, y, z0), region) for x, y in outline]
        b = [self.v((x, y, z1), region) for x, y in outline]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.face([a[i], a[j], b[j], b[i]])
        self.face(a[::-1]); self.face(b)

    def cyl(self, c, axis, r, length, region=HULL, seg=12, r2=None):
        r2 = r if r2 is None else r2
        rot = {"x": (0, 0, 0), "y": (0, 0, math.pi / 2), "z": (0, -math.pi / 2, 0)}[axis]
        with self.at(c, rot):
            rings = []
            for x, rr in ((-length / 2, r), (length / 2, r2)):
                rings.append([self.v((x, rr * math.cos(2 * math.pi * (i + 0.5) / seg), rr * math.sin(2 * math.pi * (i + 0.5) / seg)), region) for i in range(seg)])
            for i in range(seg):
                j = (i + 1) % seg
                self.face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]])
            self.face(rings[0][::-1]); self.face(rings[1])

    def ring(self, c, axis, R, r, region=METAL, seg=20, seg2=5):
        """a torus about `axis` through c"""
        rot = {"x": (0, math.pi / 2, 0), "y": (math.pi / 2, 0, 0), "z": (0, 0, 0)}[axis]
        with self.at(c, rot):
            rings = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                rings.append([self.v(((R + r * math.cos(2 * math.pi * k / seg2)) * math.cos(a), (R + r * math.cos(2 * math.pi * k / seg2)) * math.sin(a), r * math.sin(2 * math.pi * k / seg2)), region) for k in range(seg2)])
            for i in range(seg):
                for k in range(seg2):
                    self.face([rings[i][k], rings[(i + 1) % seg][k], rings[(i + 1) % seg][(k + 1) % seg2], rings[i][(k + 1) % seg2]])

    def finish(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(math.pi) < math.radians(35)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        # (the region of each vertex, as its colour in the faction's paint)
        col = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        reg = me.attributes["_REGION"]
        for i, v in enumerate(me.vertices):
            c = linear(self.paint[int(round(reg.data[i].value))])
            col.data[i].color = (c[0], c[1], c[2], 1.0)
        me.attributes.remove(reg)
        return ob

# ---- The pieces -----------------------------------------------------------------------------------------------------------------------------
# The tiles are drawn in a unit cube that the map stretches (the wall's length across, its height up, its depth through), so the heights below are
# fractions of a wall (about 3 squares) and the depths fractions of 0.3: a skirting of 0.07 is a hand's breadth.

def slab(p, hull=HULL, skirt=0.07, skirt_region=PANEL):
    p.box((0, 0.5, 0), (1.0, 1.0, 0.3), hull)
    p.box((0, skirt / 2, 0.02), (1.0, skirt, 0.3), skirt_region)

def wall(p, f):
    if f == "imperial":
        slab(p, HULL, 0.08, PANEL)
        p.box((0, 0.86, 0.17), (0.96, 0.10, 0.04), PANEL)                       # the recessed band under the ceiling
        p.box((0, 0.15, 0.17), (0.96, 0.012, 0.04), GLOW)                       # a light strip low on the wall
        for x in (-0.49, 0.49): p.box((x, 0.5, 0.16), (0.02, 0.84, 0.03), METAL)
    elif f == "rebel":
        slab(p, HULL, 0.06, METAL)
        for x in (-0.4, -0.13, 0.13, 0.4): p.box((x, 0.5, 0.17), (0.05, 0.82, 0.035), PANEL)   # ribs
        p.box((0, 0.92, 0.17), (1.0, 0.05, 0.04), METAL)
    elif f == "republic":
        slab(p, HULL, 0.06, PANEL)
        p.box((0, 0.72, 0.16), (1.0, 0.07, 0.03), LIVERY)                       # the red band
        p.box((0, 0.5, 0.16), (0.9, 0.012, 0.03), PANEL)
    elif f == "separatist":
        slab(p, HULL, 0.07, METAL)
        p.box((-0.33, 0.55, 0.17), (0.07, 0.9, 0.035), PANEL); p.box((0.33, 0.55, 0.17), (0.07, 0.9, 0.035), PANEL)   # tall narrow ribs
        p.box((0, 0.93, 0.17), (1.0, 0.04, 0.035), METAL)
    elif f == "mandalorian":
        slab(p, HULL, 0.10, PANEL)
        p.box((0, 0.6, 0.17), (0.94, 0.5, 0.035), PANEL)                        # a heavy plate
        p.box((0, 0.88, 0.17), (1.0, 0.035, 0.04), LIVERY)                      # the clan's band
        for x in (-0.4, 0.4):
            for y in (0.4, 0.8): p.cyl((x, y, 0.2), "z", 0.025, 0.03, METAL, 6)   # rivets
    elif f == "criminal":
        slab(p, HULL, 0.09, LIVERY)
        p.box((0, 0.5, 0.165), (0.8, 0.7, 0.03), PANEL)                         # a panel in a gold frame
        for dy in (-0.36, 0.36): p.box((0, 0.5 + dy, 0.18), (0.84, 0.02, 0.03), LIVERY)
        for dx in (-0.41, 0.41): p.box((dx, 0.5, 0.18), (0.02, 0.74, 0.03), LIVERY)
    else:  # civilian: the Falcon's tan panels in chamfered frames
        slab(p, HULL, 0.07, METAL)
        p.prism([(-0.4, 0.15), (0.4, 0.15), (0.45, 0.17), (0.45, 0.19), (-0.45, 0.19), (-0.45, 0.17)], 0.1, 0.9, PANEL, 0.0)
        p.box((0, 0.5, 0.2), (0.7, 0.7, 0.02), HULL)

def wall_detail(p, f):
    wall(p, f)
    # a lit panel of controls (small, at about waist height: the tile is stretched about three times upward, so these are fractions)
    for i in range(3):
        p.box((-0.25 + i * 0.25, 0.42, 0.2), (0.16, 0.12, 0.02), GLASS)
        p.box((-0.25 + i * 0.25, 0.42, 0.212), (0.12, 0.08, 0.004), GLOW if (i + len(f)) % 2 else LIVERY)
    p.box((0, 0.3, 0.2), (0.7, 0.04, 0.02), PANEL)

def wall_port(p, f):
    # the slab round a window of glass set back a little, in the faction's frame: a trapezoid, a ring, an arch, a slit
    slab(p, HULL, 0.07, PANEL)
    hole = {"imperial": "trap", "rebel": "round", "republic": "arch", "separatist": "slit", "mandalorian": "visor", "criminal": "round", "civilian": "round"}[f]
    cy = 0.58
    if hole == "round":
        p.cyl((0, cy, 0.17), "z", 0.3, 0.04, METAL, 16)
        p.cyl((0, cy, 0.19), "z", 0.25, 0.04, GLASS, 16)
        p.ring((0, cy, 0.2), "z", 0.28, 0.025, LIVERY if f == "criminal" else METAL, 16, 4)
        if f == "civilian": p.ring((0, cy, 0.2), "z", 0.18, 0.012, GLOW, 12, 4)
    elif hole == "trap":
        p.prism([(-0.34, 0.15), (0.34, 0.15), (0.26, 0.23), (-0.26, 0.23)], 0.35, 0.8, METAL, 0.0)
        p.prism([(-0.3, 0.17), (0.3, 0.17), (0.22, 0.205), (-0.22, 0.205)], 0.4, 0.75, GLASS, 0.0)
    elif hole == "arch":
        p.box((0, cy - 0.05, 0.17), (0.64, 0.5, 0.04), METAL)
        p.box((0, cy - 0.05, 0.195), (0.56, 0.42, 0.03), GLASS)
        p.cyl((0, cy + 0.2, 0.18), "z", 0.28, 0.05, METAL, 14)
        p.cyl((0, cy + 0.2, 0.205), "z", 0.24, 0.03, GLASS, 14)
    elif hole == "slit":
        p.box((0, cy, 0.17), (0.7, 0.2, 0.04), METAL)
        p.box((0, cy, 0.195), (0.62, 0.14, 0.03), GLASS)
        p.box((0, cy, 0.2), (0.62, 0.012, 0.03), GLOW)
    else:  # a T-shaped visor, as the helmets
        p.box((0, 0.7, 0.17), (0.7, 0.16, 0.04), METAL); p.box((0, 0.52, 0.17), (0.18, 0.32, 0.04), METAL)
        p.box((0, 0.7, 0.195), (0.62, 0.11, 0.03), GLASS); p.box((0, 0.52, 0.195), (0.12, 0.3, 0.03), GLASS)

def seat(p, f):
    """a bucket seat on a swivel, its back to -z (the person faces +z), the controls before it"""
    fab = FABRIC
    p.cyl((0, 0.04, 0), "y", 0.24, 0.08, METAL, 12)
    p.cyl((0, 0.18, 0), "y", 0.06, 0.28, METAL, 8)
    p.box((0, 0.36, 0.02), (0.5, 0.1, 0.5), fab)                                  # the cushion
    back = {"imperial": (0.5, 0.75, 0.1), "rebel": (0.46, 0.6, 0.12), "republic": (0.5, 0.65, 0.12), "separatist": (0.36, 0.8, 0.08),
            "mandalorian": (0.56, 0.62, 0.14), "criminal": (0.6, 0.78, 0.16), "civilian": (0.5, 0.68, 0.14)}[f]
    p.box((0, 0.36 + back[1] / 2, -0.22), back, fab)
    p.box((0, 0.36 + back[1] + 0.06, -0.22), (back[0] * 0.55, 0.12, back[2] + 0.02), HULL if f != "criminal" else LIVERY)  # the headrest
    for s in (-1, 1):
        p.box((s * 0.3, 0.52, 0.0), (0.06, 0.06, 0.4), METAL)                    # arm rests
        p.box((s * 0.3, 0.44, 0.0), (0.04, 0.16, 0.04), METAL)
    # the station's controls in front: a stick between the knees, or a console with a screen
    p.box((0, 0.3, 0.44), (0.46, 0.5, 0.2), PANEL, top=(0.4, 0.14))
    p.box((0, 0.58, 0.4), (0.38, 0.12, 0.012), GLASS)
    p.box((0, 0.585, 0.41), (0.32, 0.08, 0.004), GLOW)
    p.cyl((0, 0.55, 0.3), "y", 0.018, 0.2, METAL, 6)
    p.box((0, 0.66, 0.3), (0.06, 0.05, 0.06), LIVERY)

def console(p, f):
    """a desk console 1.6 long: a body, a sloped lit top, a screen"""
    h, tilt = {"imperial": (0.92, 0.55), "rebel": (0.9, 0.35), "republic": (0.88, 0.3), "separatist": (0.96, 0.5), "mandalorian": (0.9, 0.2), "criminal": (0.86, 0.25), "civilian": (0.9, 0.4)}[f]
    p.box((0, h * 0.4, -0.08), (1.56, h * 0.8, 0.5), HULL, top=(1.46, 0.42))
    p.box((0, 0.03, 0.0), (1.5, 0.06, 0.56), PANEL)
    p.box((0, h * 0.82, 0.0), (1.5, 0.05, 0.44), PANEL)
    # the sloped panel of keys and lights
    p.prism([(-0.7, -0.1), (0.7, -0.1), (0.7, 0.2), (-0.7, 0.2)], h * 0.82, h * 0.82 + 0.05, PANEL, 0.0)
    for i in range(6):
        p.box((-0.55 + i * 0.22, h * 0.82 + 0.06, 0.1), (0.1, 0.02, 0.07), GLOW if (i + len(f)) % 3 else LIVERY)
    # the screen standing up behind it
    p.box((0, h + 0.18, -0.2), (1.1, 0.34, 0.05), METAL)
    p.box((0, h + 0.18, -0.17), (1.0, 0.26, 0.012), GLASS)
    p.box((0, h + 0.18, -0.162), (0.92, 0.2, 0.004), GLOW)
    p.box((0, h + 0.18 + 0.2 * (tilt - 0.4), -0.24), (0.1, 0.08, 0.08), METAL)

def console_bank(p, f):
    """three screens over a long low body: the bridge's banks and the server racks"""
    p.box((0, 0.45, -0.05), (3.0, 0.9, 0.6), HULL)
    p.box((0, 0.03, 0.0), (3.0, 0.06, 0.64), PANEL)
    for i in range(3):
        x = -1.0 + i
        p.box((x, 1.1, -0.1), (0.9, 0.5, 0.06), METAL, top=(0.9, 0.04))
        p.box((x, 1.1, -0.065), (0.8, 0.4, 0.012), GLASS)
        p.box((x, 1.1, -0.055), (0.72, 0.32, 0.004), GLOW if (i + len(f)) % 2 else LIVERY)
        for k in range(5): p.box((x - 0.32 + k * 0.16, 0.92, 0.26), (0.1, 0.02, 0.08), GLOW if (k + i) % 2 else METAL)
    p.box((0, 0.92, 0.1), (3.0, 0.04, 0.4), PANEL)

def bunk(p, f):
    """a bunk 2 long by 1 across: a frame, a mattress, a pillow, a blanket"""
    p.box((0, 0.16, 0), (2.0, 0.08, 1.0), METAL)
    for x in (-0.95, 0.95):
        for z in (-0.45, 0.45): p.box((x, 0.08, z), (0.06, 0.16, 0.06), METAL)
    p.box((0, 0.3, 0), (1.9, 0.22, 0.92), FABRIC)
    p.box((-0.72, 0.45, 0), (0.4, 0.1, 0.5), HULL)                               # the pillow
    p.box((0.3, 0.435, 0), (1.2, 0.04, 0.94), LIVERY if f not in ("mandalorian", "imperial") else PANEL)   # the blanket
    p.box((1.0, 0.45, 0), (0.06, 0.5, 0.96), HULL if f != "criminal" else LIVERY)  # the foot of it

def locker(p, f):
    """a bank of four lockers, 2 long, 1.7 high, 0.6 deep"""
    p.box((0, 0.85, 0), (2.0, 1.7, 0.6), HULL)
    p.box((0, 0.04, 0.05), (2.0, 0.08, 0.64), PANEL)
    p.box((0, 1.72, 0), (2.04, 0.05, 0.64), METAL)
    for i in range(4):
        x = -0.75 + i * 0.5
        p.box((x, 0.88, 0.31), (0.44, 1.5, 0.03), PANEL if f != "criminal" else LIVERY)
        p.box((x, 1.45, 0.335), (0.34, 0.12, 0.012), METAL)                        # a vent
        p.box((x + 0.15, 0.9, 0.345), (0.03, 0.2, 0.03), METAL)                    # a handle
        p.box((x, 1.6, 0.335), (0.06, 0.03, 0.012), GLOW if (i + len(f)) % 2 else LIVERY)

def reactor(p, f):
    """a reactor core 2 by 2: a base, the lit core in its cage, pipes"""
    p.cyl((0, 0.1, 0), "y", 0.95, 0.2, PANEL, 16)
    p.cyl((0, 0.5, 0), "y", 0.62, 0.8, METAL, 16)
    p.cyl((0, 1.0, 0), "y", 0.46, 1.0, GLOW, 16)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p.box((0.54 * math.cos(a), 1.0, 0.54 * math.sin(a)), (0.08, 1.3, 0.08), METAL)
    for y in (0.5, 1.0, 1.5): p.ring((0, y, 0), "y", 0.58, 0.03, PANEL, 16, 4)
    p.cyl((0, 1.78, 0), "y", 0.6, 0.12, HULL, 16)
    p.cyl((0, 1.95, 0), "y", 0.3, 0.2, PANEL, 12)
    if f in ("rebel", "civilian", "criminal"):
        for s in (-1, 1): p.cyl((s * 0.85, 0.8, 0.0), "y", 0.1, 1.2, METAL, 8); p.box((s * 0.85, 1.45, 0.0), (0.16, 0.16, 0.16), LIVERY)
    else:
        for s in (-1, 1): p.box((0, 0.6, s * 0.9), (1.0, 0.5, 0.14), HULL); p.box((0, 0.6, s * 0.97), (0.8, 0.3, 0.012), LIVERY)

PIECES = [("wall", wall), ("wall_detail", wall_detail), ("wall_port", wall_port), ("seat", seat), ("console", console), ("console_bank", console_bank),
          ("bunk", bunk), ("locker", locker), ("reactor", reactor)]

def export(ob, path):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_normals=True, export_texcoords=False, export_materials="NONE", export_yup=True, export_apply=True)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="ACTIVE", **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=True, **kw)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    only = arg("--only")
    os.makedirs(OUT, exist_ok=True)
    data = {}
    for f, paint in PAINT.items():
        if only and f not in only.split(","):
            continue
        for name, fn in PIECES:
            p = Piece(f"{f}_{name}", paint)
            fn(p, f)
            ob = p.finish()
            lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
            hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
            # (Blender's (x, y, z) are the code's (x, z, -y))
            size = [round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)]
            export(ob, os.path.join(OUT, f"{f}_{name}.glb"))
            data[f"{f}_{name}"] = {"faction": f, "piece": name, "size": size, "tris": sum(len(q.vertices) - 2 for q in ob.data.polygons)}
            print("PIECE", f, name, size, data[f"{f}_{name}"]["tris"])
    if not only:
        with open(os.path.join(ROOT, "shared", "art", "shipIntKit.json"), "w") as fh:
            json.dump({"units": "squares of the map; x along, y up, z the front; each file under /assets/mixar-ship", "pieces": data}, fh, indent=1)
    print("PIECES", len(data), "tris", sum(d["tris"] for d in data.values()))

if __name__ == "__main__":
    main()
