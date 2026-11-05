# The blasters of the game, built as whole guns (2026-11-05; the user: "weapon models need to be refactored so that characters handle them correctly, and that weapon
# components are assembled properly without floating parts ... scopes of various zoom levels as attachments for relevant weapons").
# The Blaster Kit's models (assets/kenney-blaster) are kit-bashed shells that sink into each other and carry no sockets, so a figure held every blaster "a third of the
# way along", often off the grip. These are built from one anatomy (a receiver on a grip, a barrel through its shroud, a stock into the receiver's rear, a power cell,
# a rail on top, sights), each piece sunk into its neighbour, with the sockets a hand and a scope need, and four scopes that sit on the rail.
#   blender --background --python tools/blender/build-weapons.py -- <out-dir> [--lo] [--preview <dir>]
# writes <out-dir>/weapons.glb (weapons.lo.glb) and shared/art/weaponKit.json: the meshes `gun_<design>` and `scope_<name>`, each with `_REGION` per vertex
#   guns:   0 frame (gunmetal), 1 polymer (grip, stock, handguard), 2 steel (barrel, rail, sights), 3 glow (the power cell's window, the emitter), 4 dark glass
#   scopes: 0 body, 1 rings and mounts, 2 turrets, 3 glow (a reticle dot), 4 lenses
# and `_AO` per vertex. The code's axes (y up, +z the way the muzzle points); a gun's origin is the middle of its box. Original shapes: CC0.
import bpy, bmesh, math, os, sys, json, importlib.util
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P, HI, OUT, occlusion

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
PREVIEW = arg("--preview")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

_spec = importlib.util.spec_from_file_location("build_gear", os.path.join(HERE, "build-gear.py"))
gear = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gear)

class Gun(gear.Build):
    """gear.Build with a chamfered box, a box turned about x, and the finish that welds, takes the box of the whole and makes the origin its middle"""
    def rb(self, c, size, region=0, chamfer=None, tilt=0.0):
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        ch = min(hx, hy, hz) * 0.35 if chamfer is None else min(chamfer, min(hx, hy, hz) * 0.9)
        h = (hx, hy, hz)
        cos, sin = math.cos(tilt), math.sin(tilt)
        def place(local):
            x, y, z = local
            # (turned about x through the box's centre: positive tips the bottom backward)
            return (c[0] + x, c[1] + y * cos - z * sin, c[2] + y * sin + z * cos)
        if not HI:
            # (for a phone: a plain box)
            v = {(i, j, k): self._vert(place((i * hx, j * hy, k * hz)), region) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)}
            for quad in (((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)), ((-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)),
                         ((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)), ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1))):
                self._face([v[q] for q in quad], outward=c)
            return
        cache = {}
        def vert(axis, sign, signs):
            key = (axis, sign, tuple(sorted(signs.items())))
            if key not in cache:
                v = [0.0, 0.0, 0.0]
                v[axis] = sign * h[axis]
                for a, s in signs.items():
                    v[a] = s * (h[a] - ch)
                cache[key] = self._vert(place(v), region)
            return cache[key]
        outward = c
        others = lambda a: [b for b in range(3) if b != a]
        for a in range(3):
            b, d = others(a)
            for s in (-1, 1):
                self._face([vert(a, s, {b: -1, d: -1}), vert(a, s, {b: 1, d: -1}), vert(a, s, {b: 1, d: 1}), vert(a, s, {b: -1, d: 1})], outward=outward)
        # (the strips along the edges)
        for a in range(3):
            for b in range(a + 1, 3):
                d = 3 - a - b
                for s in (-1, 1):
                    for t in (-1, 1):
                        self._face([vert(a, s, {b: t, d: -1}), vert(a, s, {b: t, d: 1}), vert(b, t, {a: s, d: 1}), vert(b, t, {a: s, d: -1})], outward=outward)
        # (the corners)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    self._face([vert(0, sx, {1: sy, 2: sz}), vert(1, sy, {0: sx, 2: sz}), vert(2, sz, {0: sx, 1: sy})], outward=outward)

    def cyl(self, c, axis, r, h, region=0, seg=10, r2=None):
        super().cyl(c, axis, r, h, region, seg if HI else max(6, seg * 2 // 3), r2)

    def finish(self):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        # (every piece a closed solid, every face turned outward: a face wound the wrong way is a hole when the model is drawn one-sided)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        # the middle of the box is the origin (sockets are given in this frame)
        lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
        hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
        self.centre = (lo + hi) / 2
        self.centre.x = 0.0       # (a gun is the same on both sides: the middle is x = 0)
        for v in me.vertices:
            v.co -= self.centre
        for poly in me.polygons:
            poly.use_smooth = False
        ao = me.attributes.new("_AO", "FLOAT", "POINT")
        res = occlusion([(ob, Matrix.Identity(4))], 36 if HI else 18)
        for i, val in enumerate(next(iter(res.values()))):
            ao.data[i].value = val
        return ob

    def at(self, p):
        """a point in the design's frame in the model's frame (the origin the middle of its box), and in the code's axes"""
        c = self.centre
        # (Blender's (x, y, z) is the code's (x, z, -y): the code's point p is Blender's (p.x, -p.z, p.y))
        return [round(p[0] - c.x, 4), round(p[1] - c.z, 4), round(p[2] + c.y, 4)]

# ---- A blaster: one anatomy, by parameters ----------------------------------------------------------------------------------------------------
# The origin of the design is the centre of the pistol grip. y up, +z the muzzle.
def blaster(name, d):
    g = Gun(name)
    rl, rh, rw = d["rl"], d["rh"], d["rw"]                 # the receiver: length, height, width
    rear = d.get("rear", 0.075)                            # how far it reaches behind the grip's centre
    z0, z1 = -rear, -rear + rl
    ry = 0.0 + rh / 2 + 0.003                              # its centre height (it sits on the grip's top)
    by = 0.003 + rh * 0.60                                 # the barrel's axis
    ch = min(0.004, rw * 0.14)
    # the grip, leaning back
    gw = d.get("gw", 0.030)
    g.rb((0, -0.044, -0.004), (gw, 0.108, 0.036), 1, 0.003, tilt=d.get("ga", 0.28))
    # the receiver and the cover over it
    g.rb((0, ry, (z0 + z1) / 2), (rw, rh, rl), 0, ch)
    g.rb((0, ry + rh / 2 + 0.002, (z0 + z1) / 2 + 0.01), (rw * 0.62, 0.008, rl * 0.78), 2, 0.0015)
    # the trigger guard and the trigger, forward of the grip
    g.tube([(0, 0.004, 0.015), (0, -0.026, 0.026), (0, -0.032, 0.052), (0, -0.012, 0.070), (0, 0.004, 0.072)], 0.0036, 0, 5)
    g.rb((0, -0.012, 0.030), (0.006, 0.026, 0.010), 2, 0.001, tilt=-0.2)
    # the power cell: in the grip (a glow slit on each side), or ahead of it, or a drum
    mag = d.get("mag", "grip")
    if mag == "grip":
        for s in (-1, 1):
            g.rb((s * (gw / 2 + 0.0004), -0.052, -0.012), (0.002, 0.060, 0.016), 3, 0.0005, tilt=d.get("ga", 0.28))
    elif mag == "ahead":
        g.rb((0, -0.060, 0.058), (rw * 0.9, 0.100, 0.046), 0, 0.003)
        for s in (-1, 1):
            g.rb((s * (rw * 0.45 + 0.0004), -0.062, 0.058), (0.002, 0.070, 0.022), 3, 0.0005)
        g.rb((0, -0.113, 0.058), (rw * 0.95, 0.008, 0.050), 1, 0.002)
    elif mag == "drum":
        g.cyl((0, -0.050, 0.060), "x", 0.046, rw * 0.95, 0, 14)
        g.cyl((0, -0.050, 0.060), "x", 0.030, rw * 1.1, 1, 12)
        for s in (-1, 1):
            g.cyl((s * (rw * 1.1 / 2 + 0.0003), -0.050, 0.060), "x", 0.012, 0.002, 3, 8)
    # the barrel, through its shroud and out of the receiver's front
    bl, br = d["bl"], d["br"]
    zb = z1 - 0.01 + bl / 2
    hg_len = min(d.get("hg", 0.0), bl)
    g.cyl((0, by, zb), "z", br, bl + 0.01, 2, 12)
    shroud = d.get("shroud")
    hg = hg_len
    shroud_len = 0.0
    if shroud or hg:
        sl = min(d.get("sl", max(hg, bl * 0.55)), bl)
        shroud_len = sl
        sr = br * 1.9 if shroud != "fins" else br * 1.7
        g.rb((0, by, z1 - 0.01 + sl / 2), (sr * 2, sr * 2, sl), 1 if hg else 0, 0.004)
        if shroud == "ribbed" and HI:
            for i in range(6):
                g.cyl((0, by, z1 + 0.03 + i * (sl - 0.04) / 6), "z", sr * 1.12, 0.006, 2, 12)
        if shroud == "fins":
            for i in range(9 if HI else 4):
                g.rb((0, by, z1 + 0.02 + i * (sl - 0.03) / 9), (sr * 2.9, sr * 2.9, 0.005), 2, 0.001)
        if (shroud == "vents" or hg) and HI:
            for i in range(5):
                zz = z1 + 0.03 + i * (sl - 0.05) / 5
                for s in (-1, 1):
                    g.rb((s * (sr + 0.0003), by, zz), (0.002, sr * 0.9, 0.012), 3, 0.0004)
    # the muzzle: a ring, a brake or a cone, and the glow of the emitter
    zm = z1 - 0.01 + bl + 0.005
    brake = d.get("brake", "ring")
    if brake == "ring":
        g.cyl((0, by, zm), "z", br * 1.45, 0.018, 2, 12)
    elif brake == "brake":
        g.rb((0, by, zm), (br * 3.2, br * 2.6, 0.03), 2, 0.0025)
        for i in range(3):
            g.rb((0, by + br * 1.4, zm - 0.008 + i * 0.009), (br * 1.2, 0.003, 0.004), 1, 0.0008)
    else:
        g.cyl((0, by, zm), "z", br * 1.1, 0.03, 2, 12, r2=br * 2.1)
    g.cyl((0, by, zm + 0.010), "z", br * 0.55, 0.004, 3, 8)
    # the stock into the receiver's rear
    stock = d.get("stock")
    stl = d.get("stl", 0.17)
    if stock in ("fixed", "folding", "thumb"):
        sy = by - 0.004
        g.rb((0, sy - 0.006, z0 - stl / 2 + 0.012), (0.026 if stock != "thumb" else 0.030, 0.046, stl), 1, 0.003, tilt=-0.06)
        g.rb((0, sy - 0.020, z0 - stl + 0.004), (0.028, 0.080, 0.018), 1, 0.002, tilt=-0.06)
        if stock == "folding":
            g.rb((0, sy - 0.002, z0 - stl / 2 + 0.01), (0.010, 0.060, stl * 0.9), 2, 0.001, tilt=-0.06)
        if stock == "thumb":
            # a thumbhole stock: a cheek riser on top and a spur down to the grip's rear
            g.rb((0, sy + 0.020, z0 - stl * 0.45), (0.022, 0.016, stl * 0.5), 1, 0.002)
            g.rb((0, -0.030, z0 - 0.020), (0.026, 0.070, 0.030), 1, 0.003, tilt=0.12)
    elif stock == "bullpup":
        g.rb((0, ry - 0.004, z0 - 0.05), (rw * 0.9, rh * 0.95, 0.15), 0, 0.003)
        g.rb((0, ry - 0.012, z0 - 0.14), (0.026, 0.062, 0.03), 1, 0.003)
    # the rail on top, with a notch every centimetre, and the sights
    rail = d.get("rail", 0.0)
    rtop = ry + rh / 2 + 0.006 + 0.004
    rz = d.get("railz", (z0 + z1) / 2 + 0.01)
    if rail:
        g.rb((0, rtop - 0.002, rz), (0.014, 0.006, rail), 2, 0.0012)
        n = int(rail / 0.012) if HI else 0
        for i in range(n):
            g.rb((0, rtop + 0.0022, rz - rail / 2 + 0.006 + i * (rail - 0.01) / max(1, n - 1)), (0.016, 0.0016, 0.005), 1, 0.0004)
    sight = d.get("sight", "iron")
    top = ry + rh / 2 + 0.006                       # (the receiver's cover)
    if sight == "iron":
        # the rear sight's two posts on the cover; the front post on the barrel's shroud, or the barrel
        for s in (-1, 1):
            # (from inside the receiver up past the cover: it may stand behind the cover's rear edge)
            g.rb((s * 0.007, (ry + rh / 2 - 0.003 + top + 0.012) / 2, z0 + 0.030), (0.004, top + 0.012 - (ry + rh / 2 - 0.003), 0.006), 2, 0.0008)
        zs = z1 - 0.01 + (shroud_len * 0.8 if shroud_len else bl * 0.75)
        ts = by + (br * 1.9 if shroud_len and shroud != "fins" else br * 1.7 if shroud_len else br)
        g.rb((0, ts + 0.004, zs), (0.004, 0.016, 0.006), 2, 0.0008)
    elif sight == "carry":
        g.tube([(0, rtop - 0.002, z0 + 0.05), (0, rtop + 0.040, z0 + 0.075), (0, rtop + 0.042, (z0 + z1) / 2), (0, rtop + 0.040, z1 - 0.06), (0, rtop - 0.002, z1 - 0.03)], 0.006, 1, 6)
    # a foregrip under the handguard
    fore = d.get("fore")
    if fore:
        zf = z1 + (hg or 0.10) * 0.55
        g.rb((0, by - br * 1.9 - 0.036, zf), (0.026, 0.080, 0.032), 1, 0.003, tilt=0.18 if fore == "angled" else 0.0)
    # a bipod, folded under the barrel
    if d.get("bipod"):
        for s in (-1, 1):
            g.tube([(s * 0.012, by - br * 1.9 + 0.001, z1 + 0.10), (s * 0.019, by - br * 1.9 - 0.006, z1 + 0.20), (s * 0.021, by - br * 1.9 - 0.006, z1 + 0.30)], 0.0035, 2, 5)
        g.rb((0, by - br * 1.9 - 0.002, z1 + 0.10), (0.034, 0.012, 0.030), 1, 0.002)
    ob = g.finish()
    sockets = {
        "grip": g.at((0, -0.040, -0.004)),
        "muzzle": g.at((0, by, zm + 0.012)),
        "rail": g.at((0, rtop + 0.0042, rz)),
        # the eye: along the gun's axis, a hand behind the rail's rear end, a little above the sights
        "eye": g.at((0, rtop + 0.035, rz - 0.06)),
    }
    if not name.startswith("gun_pistol") and (d.get("hg") or d.get("fore") or d.get("sl")):
        zf = z1 + (hg or min(d.get("sl", 0.1), bl)) * 0.5
        sockets["off_hand"] = g.at((0, by - br * 1.9 - 0.002, zf))
    else:
        sockets["off_hand"] = g.at((0, -0.040, -0.004))
    return ob, sockets, {"rail_len": rail, "barrel": bl}

DESIGNS = {
    # sidearms
    "pistol_a": dict(rl=0.150, rh=0.040, rw=0.030, rear=0.062, bl=0.050, br=0.0085, mag="grip", stock=None, rail=0.060, sight="iron", brake="ring", ga=0.30),
    "pistol_b": dict(rl=0.185, rh=0.050, rw=0.036, rear=0.070, bl=0.090, br=0.0105, mag="grip", stock=None, rail=0.080, sight="iron", brake="brake", shroud="vents", sl=0.075, gw=0.034, ga=0.26),
    # carbines
    "carbine_a": dict(rl=0.230, rh=0.056, rw=0.036, rear=0.085, bl=0.150, br=0.0085, mag="ahead", stock="folding", stl=0.17, hg=0.150, fore="vertical", rail=0.150, sight="iron", brake="brake"),
    "carbine_b": dict(rl=0.300, rh=0.062, rw=0.040, rear=0.130, bl=0.110, br=0.0095, mag="ahead", stock="bullpup", hg=0.0, shroud="ribbed", sl=0.14, rail=0.170, sight="iron", brake="ring"),
    # rifles
    "rifle_a": dict(rl=0.250, rh=0.058, rw=0.038, rear=0.090, bl=0.330, br=0.0090, mag="ahead", stock="fixed", stl=0.20, hg=0.210, rail=0.190, sight="iron", brake="brake", shroud="vents"),
    "rifle_b": dict(rl=0.280, rh=0.062, rw=0.040, rear=0.100, bl=0.380, br=0.0095, mag="ahead", stock="thumb", stl=0.22, hg=0.230, fore="angled", rail=0.210, sight="iron", brake="cone"),
    # a sniper rifle, a heavy repeater
    "sniper": dict(rl=0.300, rh=0.060, rw=0.040, rear=0.100, bl=0.520, br=0.0100, mag="ahead", stock="thumb", stl=0.24, hg=0.260, rail=0.300, railz=0.040, sight="none", brake="brake", bipod=True, shroud="ribbed", sl=0.30),
    "heavy": dict(rl=0.300, rh=0.080, rw=0.056, rear=0.110, bl=0.380, br=0.0170, mag="drum", stock="fixed", stl=0.18, hg=0.0, shroud="fins", sl=0.30, rail=0.160, sight="carry", brake="cone", fore="vertical", gw=0.034),
}

# ---- Scopes: a tube in two rings on a plate that sits on the rail, an objective bell at the front, an eyepiece at the back ---------------------------------
# The origin is the middle of the underside of the plate (the point that goes on the rail's top); the tube lies along z, the objective at +z.
SCOPES = {
    # name: (zoom, tube length, tube radius, objective radius, eyepiece radius)
    "2x": (2.0, 0.095, 0.0125, 0.019, 0.0150),
    "3x": (3.0, 0.125, 0.0135, 0.023, 0.0155),
    "4x": (4.0, 0.155, 0.0145, 0.027, 0.0165),
    "6x": (6.0, 0.195, 0.0155, 0.033, 0.0175),
}
def scope(name):
    zoom, L, r, ro, re = SCOPES[name]
    g = Gun(f"scope_{name}")
    seg = 14 if HI else 8
    if name == "reflex":
        # a housing with an open window and a dot of light
        g.rb((0, 0.003, 0), (0.024, 0.006, 0.050), 1, 0.0015)
        g.rb((0, 0.016, -0.012), (0.024, 0.026, 0.020), 0, 0.0025)
        for s in (-1, 1):
            g.rb((s * 0.0105, 0.024, 0.010), (0.003, 0.030, 0.030), 0, 0.0008)
        g.rb((0, 0.034, 0.002), (0.024, 0.004, 0.046), 0, 0.001)
        g.rb((0, 0.023, 0.020), (0.018, 0.020, 0.0012), 4, 0.0003)
        g.cyl((0, 0.023, 0.0185), "z", 0.0016, 0.0016, 3, 6)
        ob = g.finish()
        return ob, {"mount": g.at((0, 0, 0)), "eye": g.at((0, 0.023, -0.05))}, zoom
    ay = max(0.006 + r + 0.004, ro + 0.006)   # the tube's axis above the plate (high enough for the objective bell to clear the rail)
    g.rb((0, 0.003, 0), (0.020, 0.006, L * 0.70), 1, 0.0015)
    for z in (-L * 0.28, L * 0.28):
        g.rb((0, 0.003 + (ay - 0.003) / 2, z), (0.015, ay - 0.003 + 0.004, 0.014), 1, 0.0015)
        g.cyl((0, ay, z), "z", r * 1.28, 0.014, 1, seg)
    g.cyl((0, ay, 0), "z", r, L, 0, seg)
    # the objective bell widens from the tube, the eyepiece swells a little
    g.cyl((0, ay, L / 2 + 0.014), "z", r, 0.028, 0, seg, r2=ro)
    g.cyl((0, ay, L / 2 + 0.034), "z", ro, 0.012, 0, seg)
    g.cyl((0, ay, L / 2 + 0.0405), "z", ro * 0.86, 0.001, 4, seg)
    g.cyl((0, ay, -L / 2 - 0.010), "z", re, 0.022, 0, seg, r2=r)
    g.cyl((0, ay, -L / 2 - 0.022), "z", re, 0.012, 1, seg)
    g.cyl((0, ay, -L / 2 - 0.0285), "z", re * 0.78, 0.001, 4, seg)
    # the turrets (elevation on top, windage on the side) and a ring where the zoom turns
    g.cyl((0, ay + r + 0.004, -L * 0.04), "y", 0.0058, 0.012, 2, 8)
    g.cyl((r + 0.004, ay, -L * 0.04), "x", 0.0058, 0.012, 2, 8)
    g.cyl((0, ay, -L * 0.30), "z", r * 1.22, 0.016, 2, seg)
    ob = g.finish()
    return ob, {"mount": g.at((0, 0, 0)), "eye": g.at((0, ay, -L / 2 - 0.03))}, zoom

# ---- A look at it ------------------------------------------------------------------------------------------------------------------------------
def preview(ob, path, view):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.render.resolution_x, scn.render.resolution_y = 900, 420
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "SINGLE"
    scn.display.shading.single_color = (0.62, 0.66, 0.7)
    scn.display.shading.show_cavity = True
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if "cam" not in bpy.context.scene.objects:
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.4 * max(ob.dimensions) + 0.05
    # (Blender's y is the code's -z: the muzzle points along -y; the side view looks along x)
    if view == "side":
        cam.location = Vector((2.0, 0, 0))
        cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    else:
        cam.location = Vector((1.2, 1.4, 0.9))
        cam.rotation_euler = (math.radians(65), 0, math.radians(140))
    scn.camera = cam
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o is not ob
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    made, kit = [], {}
    only = arg("--only")
    for name, d in DESIGNS.items():
        if only and name not in only.split(","):
            continue
        ob, sockets, extra = blaster(f"gun_{name}", d)
        made.append(ob)
        kit[f"gun_{name}"] = {"sockets": sockets, "box": [round(c, 4) for c in (*[-x / 2 for x in (ob.dimensions.x, ob.dimensions.z, ob.dimensions.y)], *[x / 2 for x in (ob.dimensions.x, ob.dimensions.z, ob.dimensions.y)])], "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons), **extra}
    for name in SCOPES:
        if only and f"scope_{name}" not in only.split(","):
            continue
        ob, sockets, zoom = scope(name)
        made.append(ob)
        kit[f"scope_{name}"] = {"sockets": sockets, "zoom": zoom, "box": [round(c, 4) for c in (*[-x / 2 for x in (ob.dimensions.x, ob.dimensions.z, ob.dimensions.y)], *[x / 2 for x in (ob.dimensions.x, ob.dimensions.z, ob.dimensions.y)])], "tris": sum(len(p.vertices) - 2 for p in ob.data.polygons)}
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        for ob in made:
            for view in ("side", "three"):
                preview(ob, os.path.join(PREVIEW, f"{ob.name}_{view}.png"), view)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in made:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "weapons.glb" if HI else "weapons.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=False, export_materials="NONE", export_yup=True, export_apply=False)
    if HI and not only:
        with open(os.path.join(ROOT, "shared", "art", "weaponKit.json"), "w") as fh:
            json.dump(kit, fh, indent=1)
    print("WEAPONS", path, {k: v["tris"] for k, v in kit.items()})

if __name__ == "__main__":
    main()
