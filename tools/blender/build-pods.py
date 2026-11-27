# The podracers (2026-11-27; the user: "a pod racing minigame inspired by the pod race in Episode I ... real pod racer models", original
# designs). Five makes, each two engines and an open cockpit built apart, so the race can draw the engines bucking on their own and the
# cockpit swinging on its cables (FlightScene.tsx PodRacer); the cables and the energy binder between the engines are drawn there too.
#   arrow  Arrowhead: long needle engines with a spike in each intake, a slim dart of a cockpit
#   brute  Bruiser: two great armoured engines with grille intakes and side plates, a wide tub
#   ring   Ringjet: engines inside big intake rings on struts, a round capsule
#   sting  Stinger: tapered engines with swept fins and split air brakes, a sharp wedge
#   scrap  Scrapper: salvage, one engine long and thin, the other short and fat, patches and an open-frame tub
#   mixar.exe|blender --background --python tools/blender/build-pods.py -- <out-dir> [--lo]
# writes <out-dir>/pods.glb (meshes `pod_<make>_engine_l`, `pod_<make>_engine_r`, `pod_<make>_cockpit`) and, from the full build,
# shared/art/podKit.json (each make's layout in metres: where the engines and the cockpit sit, the engines' length and radius, where the
# cables are tied and the binder's emitters stand, the exhausts). Built AT REAL SIZE IN METRES with the ship kit's builder (build-ships.py:
# Hull, the regions, AO, export): `_REGION` 0 hull (the pilot's paint), 1 panel, 2 glow (exhausts, lamps, emitters), 3 glass (canopies,
# the dark of the intakes), 4 livery (the pilot's stripe), 5 metal; `_AO` per vertex. The code's axes: y up, the nose +x, +z starboard;
# each part's origin is its own middle. Original shapes (the film's look in general, no make of the film copied): CC0.
import bpy, math, os, sys, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location("ship_kit", os.path.join(HERE, "build-ships.py"))
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)
Hull, export, HI = kit.Hull, kit.export, kit.HI
HULL, PANEL, GLOW, GLASS, LIVERY, METAL = kit.HULL, kit.PANEL, kit.GLOW, kit.GLASS, kit.LIVERY, kit.METAL
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SEG = 22 if HI else 12

# ---- Parts every make draws on (in a part's own axes: x along it, the front +x)

def intake(h, x, r, depth, spike=0.0):
    """the mouth of an engine at x facing +x: a metal lip, the dark inside, the compressor's face, and a spike standing out of it if asked"""
    h.loft_x([(x - depth, 0, 0, r * 0.82, r * 0.82, 2, GLASS), (x - 0.05, 0, 0, r * 0.86, r * 0.86, 2, GLASS), (x, 0, 0, r * 0.96, r * 0.96, 2, METAL), (x + 0.04, 0, 0, r * 0.9, r * 0.9, 2, METAL)], SEG, METAL, caps=False)
    h.cyl((x - depth, 0, 0), "x", r * 0.8, 0.05, METAL, SEG)
    # (the fan's blades, in the dark)
    for k in range(10 if HI else 6):
        a = 2 * math.pi * k / (10 if HI else 6)
        h.rod((x - depth + 0.04, 0, 0), (x - depth + 0.02, math.sin(a) * r * 0.76, math.cos(a) * r * 0.76), 0.035, PANEL, 4)
    if spike:
        h.loft_x([(x - depth, 0, 0, r * 0.32, r * 0.32, 2, METAL), (x + spike * 0.55, 0, 0, r * 0.22, r * 0.22, 2, METAL), (x + spike, 0, 0, 0.02, 0.02, 2, METAL)], 10, METAL)

def exhaust(h, x, r, length=0.7):
    """the engine's tail at x facing -x: a gunmetal bell and the glow inside it"""
    h.loft_x([(x - length, 0, 0, r * 1.04, r * 1.04, 2, METAL), (x - length * 0.6, 0, 0, r * 0.95, r * 0.95, 2, PANEL), (x, 0, 0, r * 0.86, r * 0.86, 2, METAL)], SEG, METAL, caps=False)
    h.cyl((x - length * 0.55, 0, 0), "x", r * 0.82, 0.04, GLOW, SEG)

def bands(h, x0, x1, r_at, n, w=0.06):
    """raised panel bands round a body between x0 and x1 (r_at(x): its radius there)"""
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        r = r_at(x)
        h.cyl((x, 0, 0), "x", r * 1.025, w, PANEL, SEG)

def emitter(h, x, side, r):
    """the binder's emitter on the engine's inner flank: a stub and its glowing tip (the beam between the two is drawn by the race)"""
    z = side * r
    h.rod((x, 0, z * 0.85), (x, 0, z + side * 0.32), 0.07, METAL, 6)
    h.sphere((x, 0, z + side * 0.36), 0.09, GLOW, 8, 4)

def hook(h, x, r):
    """the cable's eye on the engine's back: a bracket under it"""
    h.box((x, -r * 0.95, 0), (0.35, 0.18, 0.16), METAL)
    h.torus((x, -r * 1.05, 0), 0.09, 0.03, METAL, 10, 4)

def lamp(h, x, y, z, r=0.05):
    h.sphere((x, y, z), r, GLOW, 6, 3)

def machinery(h, x0, x1, r):
    """a band where the engine's skin is off: the core, a stack of cooling fins, and pipes running past them"""
    h.cyl(((x0 + x1) / 2, 0, 0), "x", r * 0.6, x1 - x0, METAL, SEG)
    n = max(3, int((x1 - x0) / (0.17 if HI else 0.3)))
    for k in range(n):
        h.cyl((x0 + (k + 0.5) * (x1 - x0) / n, 0, 0), "x", r * 0.9, 0.05, PANEL if k % 2 else METAL, SEG)
    for k in range(5 if HI else 3):
        a = 0.4 + k * 2 * math.pi / (5 if HI else 3)
        h.rod((x0 - 0.1, math.sin(a) * r * 0.8, math.cos(a) * r * 0.8), (x1 + 0.1, math.sin(a) * r * 0.8, math.cos(a) * r * 0.8), 0.06, METAL, 6)

def nacelle(h, L, r, n=2.0, cowl=0.36, core=0.2, taper=0.84, tail=0.7, region=HULL):
    """an engine's body along x from its front (+L/2): the front cowl, the bare machinery, the rear cowl tapering to the exhaust; returns the
    exhaust's x and radius"""
    xf, xc0 = L / 2, L / 2 - cowl * L
    xc1, xr = xc0 - core * L, -L / 2 + tail
    h.loft_x([(xf, 0, 0, r * 0.92, r * 0.92, n, region), (xf - 0.45, 0, 0, r, r, n, region), (xc0 + 0.2, 0, 0, r, r, n, region), (xc0 + 0.06, 0, 0, r * 1.04, r * 1.04, n, PANEL), (xc0, 0, 0, r * 0.9, r * 0.9, n, PANEL)], SEG, region, caps=False)
    machinery(h, xc1, xc0, r)
    h.loft_x([(xc1, 0, 0, r * 0.9, r * 0.9, n, PANEL), (xc1 - 0.06, 0, 0, r * 1.04, r * 1.04, n, PANEL), (xc1 - 0.2, 0, 0, r, r, n, region), (xr + 0.5, 0, 0, r * taper, r * taper, n, region), (xr, 0, 0, r * taper * 0.96, r * taper * 0.96, n, region)], SEG, region, caps=False)
    return xr, r * taper * 0.96

def vanes(h, x, r, k=4, a0=0.0):
    """splitter vanes across an intake's mouth at x, standing a little proud of it"""
    for i in range(k):
        a = a0 + i * math.pi / k
        with h.at((x - 0.3, 0, 0), (a, 0, 0)):
            h.box((0, 0, 0), (0.75, r * 1.8, 0.05), METAL)

def flaps(h, x, r, half_open=0.35):
    """air brakes at the tail: a pair of plates above and below, hinged at their front and opened a little"""
    for s in (1, -1):
        with h.at((x, s * r * 0.95, 0), (0, 0, -s * half_open)):
            h.box((-0.45, s * 0.04, 0), (0.9, 0.05, r * 1.1), PANEL)

# ---- The makes. Each returns its engines' (left, right) builders, its cockpit's, and the layout: the engines' length, radius and
# middle (x, half the gap between them), the cockpit's length and middle x, where the cables tie on (x on the engine's part, x on the
# cockpit's) and where the binder's emitters stand (x on the engine, measured from its middle)

def arrow_engine(h, side):
    L, r = 8.0, 0.55
    xr, re = nacelle(h, L, r, cowl=0.3, core=0.22)
    intake(h, L / 2 + 0.02, r * 0.9, 0.9, spike=0.7)
    exhaust(h, xr, re, 1.0)
    flaps(h, xr + 0.9, re)
    bands(h, -L / 2 + 1.2, L / 2 - 0.9 - 0.52 * L, lambda x: r * 0.9, 2)
    # (a livery stripe along its back, a ventral keel, small canards by the intake)
    h.box((0.3, r * 0.98, 0), (L * 0.6, 0.05, 0.16), LIVERY)
    h.plate([(-L / 2 + 0.9, -r * 0.7), (L / 2 - 2.4, -r * 0.7), (L / 2 - 3.2, -r - 0.32), (-L / 2 + 1.6, -r - 0.24)], -0.04, 0.04, PANEL)
    for s in (1, -1):
        h.box((L / 2 - 1.3, 0, s * (r + 0.18)), (0.6, 0.04, 0.4), METAL)
    emitter(h, L / 2 - 1.8, -side, r)
    hook(h, -L / 2 + 0.9, r)
    lamp(h, L / 2 - 0.4, r * 0.95, 0)

def arrow_cockpit(h):
    L = 3.2
    h.loft_x([(L / 2, 0.1, 0, 0.05, 0.05, 2, HULL), (L / 2 - 0.7, 0.1, 0, 0.32, 0.28, 2.4, HULL), (0, 0.05, 0, 0.46, 0.42, 2.6, HULL), (-L / 2 + 0.4, 0, 0, 0.4, 0.4, 2.6, HULL), (-L / 2, 0, 0, 0.3, 0.32, 2.4, PANEL)], SEG, HULL)
    h.sphere((0.15, 0.42, 0), 0.42, GLASS, 14, 7, (1.4, 0.55, 0.85))
    h.box((-0.55, 0.35, 0), (0.5, 0.12, 0.62), PANEL)
    h.box((0.4, 0.02, 0), (L * 0.55, 0.04, 0.95), LIVERY)
    # (the steering bars: two levers a pilot works, one to each engine)
    for s in (1, -1):
        h.rod((0.55, 0.3, s * 0.18), (0.75, 0.62, s * 0.2), 0.03, METAL, 5)
        h.box((-L / 2 + 0.2, -0.05, s * 0.36), (0.5, 0.18, 0.08), METAL)
    lamp(h, -L / 2 + 0.05, 0.1, 0.26)
    lamp(h, -L / 2 + 0.05, 0.1, -0.26)

def brute_engine(h, side):
    L, r = 7.0, 0.95
    xr, re = nacelle(h, L, r, n=3.2, cowl=0.34, core=0.16, taper=0.86, tail=0.6)
    # (a squared mouth behind a grille of horizontal vanes)
    h.loft_x([(L / 2 - 0.8, 0, 0, r * 0.84, r * 0.78, 3.2, GLASS), (L / 2 + 0.02, 0, 0, r * 0.88, r * 0.82, 3.2, GLASS), (L / 2 + 0.06, 0, 0, r * 0.96, r * 0.9, 3.2, METAL)], SEG, METAL, caps=False)
    h.box((L / 2 - 0.8, 0, 0), (0.04, r * 1.6, r * 1.7), GLASS)
    for k in range(5):
        y = -r * 0.62 + k * r * 0.31
        h.box((L / 2 - 0.05, y, 0), (0.18, 0.07, r * 1.7), METAL)
    exhaust(h, xr, re, 0.9)
    flaps(h, xr + 0.8, re, 0.25)
    # (armour plates bolted along its flanks, a dorsal spine, intake scoops)
    for s in (1, -1):
        h.plate([(-L / 2 + 1.0, -r * 0.55), (L / 2 - 1.1, -r * 0.55), (L / 2 - 0.9, r * 0.5), (-L / 2 + 1.4, r * 0.45)], s * r * 1.0, s * (r * 1.0 + 0.1), PANEL)
        for x in (-1.6, -0.2, 1.2):
            h.cyl((x, 0, s * (r + 0.12)), "z", 0.07, 0.06, METAL, 6)
    h.box((0, r * 0.98, 0), (L * 0.7, 0.16, 0.42), PANEL, top=(L * 0.66, 0.26))
    h.box((0, r * 1.08, 0), (L * 0.5, 0.03, 0.2), LIVERY)
    emitter(h, L / 2 - 1.6, -side, r)
    hook(h, -L / 2 + 1.0, r)
    lamp(h, L / 2 - 0.5, r * 1.0, side * r * 0.6)

def brute_cockpit(h):
    L = 3.4
    h.loft_x([(L / 2, 0.15, 0, 0.3, 0.35, 3, HULL), (L / 2 - 0.5, 0.1, 0, 0.62, 0.55, 3.2, HULL), (-0.4, 0.05, 0, 0.8, 0.6, 3.4, HULL), (-L / 2 + 0.3, 0, 0, 0.72, 0.56, 3.2, HULL), (-L / 2, 0, 0, 0.55, 0.46, 3, PANEL)], SEG, HULL)
    h.sphere((0.25, 0.6, 0), 0.55, GLASS, 14, 7, (1.0, 0.45, 1.1))
    h.box((-0.7, 0.62, 0), (0.6, 0.2, 1.1), PANEL)
    for s in (1, -1):
        h.box((0, -0.1, s * 0.82), (L * 0.7, 0.42, 0.12), PANEL)
        h.box((0, 0.25, s * 0.88), (L * 0.5, 0.06, 0.06), LIVERY)
        h.rod((0.7, 0.45, s * 0.25), (0.9, 0.82, s * 0.26), 0.04, METAL, 5)
    lamp(h, -L / 2 + 0.05, 0.2, 0.4)
    lamp(h, -L / 2 + 0.05, 0.2, -0.4)

def ring_engine(h, side):
    L, r = 6.8, 0.72
    with h.at((-0.3, 0, 0)):
        xr, re = nacelle(h, L - 0.6, r, cowl=0.3, core=0.24)
    xr -= 0.3
    intake(h, L / 2 - 0.58, r * 0.88, 0.6)
    vanes(h, L / 2 - 0.55, r * 0.85, 3, 0.3)
    # (the great intake ring ahead of the body, held on four struts)
    R = r * 1.7
    with h.at((L / 2 - 0.15, 0, 0), (0, 0, math.pi / 2)):
        h.torus((0, 0, 0), R, 0.13, HULL, 28 if HI else 16, 8 if HI else 5, squash=2.2)
    h.cyl((L / 2 - 0.15, 0, 0), "x", R + 0.1, 0.06, LIVERY, SEG)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        h.rod((L / 2 - 0.95, math.sin(a) * r * 0.9, math.cos(a) * r * 0.9), (L / 2 - 0.15, math.sin(a) * (R - 0.08), math.cos(a) * (R - 0.08)), 0.06, METAL, 6)
    exhaust(h, xr, re, 0.8)
    flaps(h, xr + 0.75, re)
    emitter(h, L / 2 - 1.5, -side, r)
    hook(h, -L / 2 + 0.9, r)

def ring_cockpit(h):
    L = 3.0
    h.loft_x([(L / 2, 0.05, 0, 0.18, 0.18, 2, HULL), (L / 2 - 0.5, 0.05, 0, 0.5, 0.48, 2.2, HULL), (-0.2, 0.05, 0, 0.62, 0.55, 2.2, HULL), (-L / 2 + 0.3, 0, 0, 0.5, 0.46, 2.2, HULL), (-L / 2, 0, 0, 0.3, 0.3, 2, PANEL)], SEG, HULL)
    h.sphere((0.1, 0.5, 0), 0.48, GLASS, 14, 7, (1.2, 0.5, 0.9))
    with h.at((-0.1, 0.05, 0), (0, 0, math.pi / 2)):
        h.torus((0, 0, 0), 0.66, 0.05, LIVERY, 24 if HI else 14, 5)
    for s in (1, -1):
        h.rod((0.5, 0.35, s * 0.2), (0.7, 0.68, s * 0.22), 0.03, METAL, 5)
        h.box((-L / 2 + 0.5, -0.25, s * 0.42), (0.7, 0.16, 0.16), METAL)
    lamp(h, -L / 2 + 0.05, 0.05, 0)

def sting_engine(h, side):
    L, r = 7.2, 0.6
    xr, re = nacelle(h, L, r, n=2.2, cowl=0.28, core=0.2, taper=0.68, tail=0.55)
    intake(h, L / 2 + 0.02, r * 0.86, 0.7)
    vanes(h, L / 2 + 0.02, r * 0.8, 2, math.pi / 2)
    exhaust(h, xr, re, 0.7)
    # (a tall swept fin on top, a lower one outboard, and the air brakes: two plates either side of the tail, half open)
    h.plate([(-L / 2 + 0.6, r * 0.6), (L / 2 - 2.6, r * 0.8), (-L / 2 + 1.3, r + 1.15), (-L / 2 + 0.4, r + 1.1)], -0.04, 0.04, HULL)
    h.plate([(-L / 2 + 0.9, r + 0.8), (-L / 2 + 0.55, r + 1.08), (-L / 2 + 0.35, r + 1.06)], -0.05, 0.05, LIVERY)
    with h.at((0, 0, side * r * 0.6), (math.radians(-35) * side, 0, 0)):
        h.plate([(-L / 2 + 0.7, 0), (L / 2 - 3.0, 0), (-L / 2 + 1.2, -0.85), (-L / 2 + 0.5, -0.8)], -0.035, 0.035, HULL)
    for s in (1, -1):
        with h.at((-L / 2 + 1.4, 0, s * r * 0.9), (0, s * math.radians(28), 0)):
            h.box((0, 0, s * 0.2), (0.9, 0.5, 0.04), PANEL)
    h.box((0.5, r * 0.6, 0), (L * 0.5, 0.05, 0.12), LIVERY)
    emitter(h, L / 2 - 1.6, -side, r)
    hook(h, -L / 2 + 1.0, r)

def sting_cockpit(h):
    L = 3.0
    h.loft_x([(L / 2, 0.0, 0, 0.04, 0.04, 2, HULL), (L / 2 - 0.9, 0.05, 0, 0.32, 0.5, 2.2, HULL), (-0.3, 0.05, 0, 0.42, 0.62, 2.4, HULL), (-L / 2, 0, 0, 0.36, 0.5, 2.4, PANEL)], SEG, HULL)
    h.sphere((0.0, 0.36, 0), 0.4, GLASS, 14, 7, (1.6, 0.5, 0.8))
    for s in (1, -1):
        h.plate([(-L / 2 + 0.2, 0), (0.2, 0), (-L / 2 + 0.1, 0.7)], s * 0.5, s * 0.54, HULL)
        h.box((0.2, -0.02, s * 0.6), (1.6, 0.04, 0.06), LIVERY)
        h.rod((0.4, 0.3, s * 0.16), (0.6, 0.6, s * 0.18), 0.03, METAL, 5)
    lamp(h, -L / 2 + 0.05, 0.1, 0.3)
    lamp(h, -L / 2 + 0.05, 0.1, -0.3)

def scrap_engine(h, side):
    # (the left is long and thin, the right short and fat: two engines out of two wrecks)
    L, r = (7.6, 0.66) if side < 0 else (6.0, 0.86)
    xr, re = nacelle(h, L, r, n=2.3 if side < 0 else 2.0, cowl=0.3 if side < 0 else 0.4, core=0.25 if side < 0 else 0.16, tail=0.55)
    intake(h, L / 2 + 0.02, r * 0.92, 0.8)
    if side > 0:
        vanes(h, L / 2 + 0.02, r * 0.88, 2)
    exhaust(h, xr, re, 0.75)
    flaps(h, xr + 0.7, re, 0.5 if side < 0 else 0.15)
    # (patch plates riveted on at odd angles, an exposed pipe run, a bolted-on scoop)
    for k, (x, a, w) in enumerate(((-1.6, 0.4, 1.1), (0.2, 2.0, 0.9), (1.4, 4.2, 0.8), (-0.4, 5.3, 1.3))):
        with h.at((x, math.sin(a) * r, math.cos(a) * r), (a, 0, 0)):
            h.box((0, 0, 0), (w, 0.05, 0.55), PANEL if k % 2 else LIVERY)
    h.rod((-L / 2 + 0.9, r * 0.7, -r * 0.7), (L / 2 - 1.0, r * 0.75, -r * 0.6), 0.08, METAL, 6)
    h.rod((-L / 2 + 1.2, r * 0.82, -r * 0.4), (L / 2 - 1.4, r * 0.86, -r * 0.35), 0.06, METAL, 6)
    h.box((L / 2 - 1.4, -r * 0.95, 0), (1.2, 0.3, 0.5), PANEL, top=(0.8, 0.4))
    emitter(h, L / 2 - 1.5, -side, r)
    hook(h, -L / 2 + 0.9, r)

def scrap_cockpit(h):
    L = 3.3
    h.box((0, 0, 0), (L, 0.7, 1.2), HULL, top=(L - 0.5, 1.0))
    h.box((L / 2 - 0.25, 0.1, 0), (0.6, 0.55, 1.0), HULL, front=(0.4, 0.7))
    h.box((0.2, 0.55, 0), (1.0, 0.4, 0.9), GLASS, top=(0.6, 0.7))
    # (the open frame: a roll bar and bars along the sides)
    with h.at((-0.5, 0.35, 0), (0, 0, math.pi / 2)):
        h.torus((0, 0, 0), 0.62, 0.04, METAL, 16 if HI else 10, 5, a0=0, a1=math.pi)
    for s in (1, -1):
        h.rod((-L / 2 + 0.1, 0.4, s * 0.62), (L / 2 - 0.2, 0.3, s * 0.62), 0.04, METAL, 5)
        h.box((-0.3, -0.05, s * 0.64), (1.4, 0.3, 0.04), LIVERY)
        h.rod((0.5, 0.3, s * 0.2), (0.7, 0.62, s * 0.22), 0.03, METAL, 5)
    lamp(h, -L / 2 + 0.05, 0.1, 0.4)

# Layout: engines (length left, length right, radius left, radius right), the gap between their middles, the cockpit's length; the engines'
# fronts stand at x = +9 and the cockpit's tail at x = -9 (the race's box: SPEEDER_BODY.pod, half length 9)
MAKES = {
    "arrow": (arrow_engine, arrow_cockpit, (8.0, 8.0, 0.55, 0.55), 4.2, 3.2),
    "brute": (brute_engine, brute_cockpit, (7.0, 7.0, 0.95, 0.95), 5.2, 3.4),
    "ring": (ring_engine, ring_cockpit, (6.8, 6.8, 0.72, 0.72), 4.8, 3.0),
    "sting": (sting_engine, sting_cockpit, (7.2, 7.2, 0.6, 0.6), 4.4, 3.0),
    "scrap": (scrap_engine, scrap_cockpit, (7.6, 6.0, 0.66, 0.86), 4.6, 3.3),
}
FRONT, TAIL = 9.0, -9.0

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    made, layout = [], {}
    for make, (engine, cockpit, (ll, lr, rl, rr), gap, cl) in MAKES.items():
        parts = {}
        for side, name, L in ((-1, "l", ll), (1, "r", lr)):
            h = Hull(f"pod_{make}_engine_{name}")
            engine(h, side)
            parts[name] = h.finish(0.6)
            made.append(parts[name])
        h = Hull(f"pod_{make}_cockpit")
        cockpit(h)
        made.append(h.finish(0.5))
        # (where each engine's binder emitter and cable eye are: the same offsets as the builders above, from each engine's middle)
        emit = {"arrow": 8.0 / 2 - 1.8, "brute": 7.0 / 2 - 1.6, "ring": 6.8 / 2 - 2.0, "sting": 7.2 / 2 - 1.6, "scrap": None}[make]
        def eng(L, r, side):
            x = FRONT - L / 2
            e = emit if emit is not None else L / 2 - 1.5
            hook = -L / 2 + (0.9 if make in ("arrow", "ring", "scrap") else 1.0)
            return {"x": round(x, 3), "z": round(side * gap / 2, 3), "length": L, "radius": r, "emitter": [round(x + e, 3), 0, round(side * (gap / 2 - r - 0.36), 3)],
                    "eye": [round(x + hook, 3), round(-r * 1.05, 3), round(side * gap / 2, 3)], "exhaust": [round(x - L / 2, 3), 0, round(side * gap / 2, 3)]}
        layout[make] = {"left": eng(ll, rl, -1), "right": eng(lr, rr, 1),
                        "cockpit": {"x": round(TAIL + cl / 2, 3), "length": cl, "front": round(TAIL + cl, 3)}}
        print("POD", make, "tris", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made[-3:]))
    os.makedirs(OUT, exist_ok=True)
    export(made, os.path.join(OUT, "pods.glb" if HI else "pods.lo.glb"))
    if HI:
        with open(os.path.join(ROOT, "shared", "art", "podKit.json"), "w", newline="\n") as fh:
            json.dump({"units": "metres in the pod's frame: x the nose (the engines' fronts at +9, the cockpit's tail at -9), y up, z starboard; each part's mesh has its own middle as origin", "makes": layout}, fh, indent=1)
            fh.write("\n")
    print("PODS", len(made), "meshes")

if __name__ == "__main__":
    main()
