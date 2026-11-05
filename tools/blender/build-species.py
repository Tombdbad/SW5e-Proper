# The heads of the species that are not a person's face with something added (2026-11-05; the user: "use these images as inspiration to update the
# head meshes and textures, normal maps etc. using the full scope of Mixar tools"; the references are tools/refs/species/<slug>/, fetched by
# tools/refs/species.py). Until now these species were drawn on a person's head (a Mon Calamari had a human face with goggle eyes stuck on its
# sides, a Trandoshan and a Besalisk a human face), or out of the code's primitives (a Zabrak's crown of five cones, a Nautolan's six tubes).
#
# Run headless:  blender --background --python tools/blender/build-species.py -- <out-dir> [--lo] [--maps <dir>] [--only moncal,rodian]
# Or live, from the open Mixar session's Python console (builds them into a `claude_species` collection beside their reference stills, bakes their
# maps into tools/refs/cache/species/, and renders tools/refs/cache/species-*.png; never resets the scene, never exports):
#   p=r"C:\Users\Admin\Desktop\SW5E\SW5e-Proper\tools\blender\build-species.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})
#
# It writes
#   <out-dir>/species.glb   a LOW head for each species of HEADS (`sphead_<key>`, _REGION 0 skin, 1 horn and bone, 2 lips and the inside of the mouth;
#                           _AO per vertex; texture coordinates already in its cell of the species atlas), and the parts that grow out of a head
#                           (PARTS: `horns_crown`, `horns_curl`, `horns_sweep`, `head_tentacles`)
#   <maps>/species_{normal,ao,color}.png   the atlas, 2048 x 2048, a 512 cell a head (CELLS): the tangent-space normal map and the occlusion baked from the
#                           HIGH head (about 60k quads) onto the LOW one (about 3k triangles), and a colour map that the skin's colour multiplies
#                           (mottling, the grooves between scales, the paler throat, the darker lips)
#   <out-dir>/species.json  for each head: its cell, where its eyes are and how big (the code draws the eyes), and which of the code's own additions
#                           (ears, snout, crest, horns) the head already has
# The method is build-head.py's: a sphere pushed into a skull and then into features (humps, hollows and creases along lines), the coarse ones on
# both heads, the fine ones (wrinkles, scales, lumps) on the high one only, so that they reach the low head through its normal map.
# Axes and units are the code's (y up, +z the way the face looks, metres; the middle of the skull the origin). Original shapes: CC0.
import bpy, bmesh, math, os, sys, json, importlib.util, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shape
from shape import P, smooth, HI, join, occlusion

def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

H = _load("build_head_for_species", "build-head.py")
G = _load("build_gear_for_species", "build-gear.py")
gauss, g2, line, l2 = H.gauss, H.g2, H.line, H.l2

LIVE = "bpy" in sys.modules and not bpy.app.background
def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MAPS = arg("--maps") or (os.path.join(REPO, "tools", "refs", "cache", "species") if LIVE else None)
ONLY = arg("--only") or (getattr(__import__("builtins"), "SPECIES_ONLY", None) if LIVE else None)
CELL = 512
ATLAS = 2048
FAST = "--fast" in sys.argv or bool(getattr(__import__("builtins"), "SPECIES_FAST", False))

# ---- Fine detail: lumps and scales ------------------------------------------------------------------------------------------------------
def _hash(i, j, k, s):
    h = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (s * 2654435761)) & 0xFFFFFFFF
    h = ((h ^ (h >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    h = ((h ^ (h >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    h ^= h >> 16
    return (h & 1023) / 1023.0, ((h >> 10) & 1023) / 1023.0, ((h >> 20) & 1023) / 1023.0

def cells(x, y, z, size, seed=1):
    """the distances to the nearest and the next nearest of a jittered lattice of points (Worley): F2 - F1 is small on the line between two
    cells, which is the groove between two scales; F1 small is the middle of a lump"""
    px, py, pz = x / size, y / size, z / size
    ix, iy, iz = math.floor(px), math.floor(py), math.floor(pz)
    f1 = f2 = 9.0
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for c in (-1, 0, 1):
                hx, hy, hz = _hash(ix + a, iy + b, iz + c, seed)
                dx, dy, dz = ix + a + hx - px, iy + b + hy - py, iz + c + hz - pz
                d = math.sqrt(dx * dx + dy * dy + dz * dz)
                if d < f1:
                    f1, f2 = d, f1
                elif d < f2:
                    f2 = d
    return f1, f2

def scales(x, y, z, size, depth, seed=1):
    """scales: each cell domed, the borders sunk; (displacement, groove 0..1)"""
    f1, f2 = cells(x, y, z, size, seed)
    groove = math.exp(-(((f2 - f1) / 0.12) ** 2))
    return depth * (0.55 * (1 - f1) - groove), groove

def lumps(x, y, z, size, depth, seed=2):
    f1, _ = cells(x, y, z, size, seed)
    return depth * math.exp(-((f1 / 0.55) ** 2))

def folds(y, x, y0, y1, n, depth, w, half):
    """n horizontal creases between y0 and y1, each bowed a little, fading out beyond |x| > half"""
    d = 0.0
    for i in range(n):
        yy = y0 + (y1 - y0) * (i + 0.5) / n + 0.004 * (x / max(half, 1e-3)) ** 2
        d -= depth * math.exp(-0.5 * ((y - yy) / w) ** 2)
    return d * math.exp(-((x / half) ** 4))

# ---- The heads ---------------------------------------------------------------------------------------------------------------------------
# Each is a function of a unit direction (dx, dy, dz) and the level (0 the low head, 1 the high one) giving the point and, on the high head, a colour
# multiplier (the skin's colour multiplies it in the game: 1 is the skin itself). `front` is how much the direction faces forward.
def skull(dx, dy, dz, bx, by, bz, jaw=0.24, chin=0.012):
    x, y, z = dx * bx, dy * by, dz * bz
    low = smooth(-0.05, -0.95, dy)
    x *= 1.0 - jaw * low
    z += chin * low * smooth(0.2, 0.9, dz)
    y -= 0.012 * low
    return x, y, z

def along_normal(x, y, z, bx, by, bz, d):
    nx, ny, nz = x / bx ** 2, y / by ** 2, z / bz ** 2
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return x + d * nx / l, y + d * ny / l, z + d * nz / l

def socket(x, y, z, e, rim=0.010, hollow=0.024):
    """a raised lid round an eye the code draws (centre e[0..2], radius e[3]), and the hollow it sits in"""
    d = 0.0
    for s in (1, -1):
        ex, ey, ez, r = s * e[0], e[1], e[2], e[3]
        dist = math.sqrt((x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2)
        d += rim * math.exp(-(((dist - r * 1.08) / (r * 0.28)) ** 2)) - hollow * math.exp(-((dist / (r * 0.85)) ** 2))
    return d

EYES = {
    # where the code draws the eyes (models.tsx: "side", "big", the person's) and how big; the head's sockets are made for them
    "side": (0.088, 0.030, 0.050, 0.042),
    "big": (0.052, 0.018, 0.085, 0.036),
    "small": (0.040, 0.015, 0.092, 0.017),
}

def moncal(dx, dy, dz, lv):
    """Mon Calamari (Ackbar): a tall dome leaning back, goggle eyes far out at the sides, no chin, a wide fish mouth with a heavy lower lip, lumpy,
    mottled skin"""
    bx, by, bz = 0.097, 0.150, 0.104
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.08, chin=0.0)
    up = smooth(0.0, 1.0, dy)
    z -= 0.050 * up * up
    x *= 1.0 - 0.16 * up
    low = smooth(-0.2, -1.0, dy)
    z += 0.032 * low * smooth(0.1, 0.9, dz)   # (the mouth stands out; the chin does not)
    front = smooth(0.05, 0.35, dz)
    d = socket(x, y, z, EYES["side"], 0.012, 0.03)
    d += front * (0.009 * gauss(x, y, 0.0, -0.010, 0.018, 0.040)                       # a low ridge where a nose would be
                  - 0.005 * g2(x, y, 0.011, -0.050, 0.003, 0.007)                     # two slits for nostrils
                  + 0.026 * gauss(x, y, 0.0, -0.066, 0.058, 0.016)                     # the upper lip's mass
                  + 0.036 * gauss(x, y, 0.0, -0.100, 0.052, 0.018)                     # the heavy lower lip
                  - 0.020 * line(x, y, [(-0.072, -0.100), (-0.040, -0.086), (0.0, -0.082), (0.040, -0.086), (0.072, -0.100)], 0.0034)
                  - 0.006 * l2(x, y, [(0.030, 0.012), (0.048, -0.030), (0.066, -0.080)], 0.006)    # the fold from eye to mouth
                  - 0.004 * l2(x, y, [(0.020, 0.060), (0.045, 0.075), (0.070, 0.070)], 0.006))     # and over the eye
    col = 1.0
    if lv:
        d += lumps(x, y, z, 0.010, 0.0018) + lumps(x, y, z, 0.004, 0.0006, 5)
        d += front * folds(y, x, 0.045, 0.110, 5, 0.0009, 0.0028, 0.05)
        mott = cells(x, y, z, 0.018, 9)[0]
        col = 0.80 + 0.22 * smooth(0.25, 0.75, mott)
        col *= 1.0 - 0.18 * front * line(x, y, [(-0.06, -0.093), (0.0, -0.087), (0.06, -0.093)], 0.006)
        col *= 1.0 + 0.10 * smooth(-0.6, -1.0, dy)
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

def rodian(dx, dy, dz, lv):
    """Rodian (Greedo): a narrow skull falling away to a long, down-turned tube of a snout with a small round mouth at its tip; big round eyes;
    a ridge of spines over the crown; fine scales"""
    bx, by, bz = 0.090, 0.120, 0.104
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.46, chin=0.0)
    front = smooth(0.05, 0.35, dz)
    # the snout: pushed forward and down from under the eyes, round in section
    sn = math.exp(-0.5 * ((x / 0.019) ** 2 + ((y + 0.046) / 0.030) ** 2)) * smooth(0.25, 0.9, dz)
    z += 0.105 * sn
    y -= 0.034 * sn
    d = socket(x, y, z, EYES["big"], 0.010, 0.026)
    tip = math.exp(-0.5 * ((x / 0.010) ** 2 + ((y + 0.082) / 0.008) ** 2)) * front
    d += -0.010 * tip + 0.004 * math.exp(-0.5 * ((x / 0.018) ** 2 + ((y + 0.076) / 0.012) ** 2)) * front   # the mouth at the tip, and its lips
    d += 0.0080 * sum(math.exp(-(((x - c) / 0.0045) ** 2)) for c in (-0.018, 0.0, 0.018)) * smooth(0.35, 0.75, dy) * smooth(-0.5, 0.2, dz)
    col = 1.0
    if lv:
        s, groove = scales(x, y, z, 0.0042, 0.0007)
        d += s
        col = 0.86 + 0.12 * (1 - groove) - 0.10 * smooth(0.3, 0.9, dy)
        col *= 1.0 + 0.10 * sn
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

def trandoshan(dx, dy, dz, lv):
    """Trandoshan (Bossk): a wide reptile's head, a heavy ridge over small sunk eyes, a broad snout with the nostrils on top, a lipless mouth wide
    to the cheeks, ridges down the cheeks; big plates on the crown, smaller scales on the face"""
    bx, by, bz = 0.102, 0.112, 0.112
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.12, chin=0.004)
    front = smooth(0.05, 0.35, dz)
    sn = math.exp(-0.5 * ((x / 0.040) ** 2 + ((y + 0.045) / 0.034) ** 2)) * smooth(0.2, 0.9, dz)
    z += 0.085 * sn
    d = socket(x, y, z, EYES["small"], 0.004, 0.012)
    d += front * (0.030 * l2(x, y, [(0.012, 0.036), (0.030, 0.046), (0.050, 0.044), (0.072, 0.030)], 0.009)   # the brow
                  - 0.006 * g2(x, y, 0.040, 0.012, 0.022, 0.012)
                  + 0.010 * l2(x, y, [(0.055, 0.000), (0.070, -0.030), (0.078, -0.060)], 0.006)           # cheek ridges
                  - 0.0045 * g2(x, y, 0.013, -0.010, 0.0035, 0.0028)                                       # nostrils
                  - 0.016 * line(x, y, [(-0.080, -0.050), (-0.045, -0.066), (0.0, -0.070), (0.045, -0.066), (0.080, -0.050)], 0.0030)
                  + 0.004 * gauss(x, y, 0.0, -0.088, 0.03, 0.012))
    col = 1.0
    if lv:
        top = smooth(0.0, 0.6, dy) + (1 - front) * 0.5
        size = 0.0055 + 0.0075 * min(1.0, top)
        s, groove = scales(x, y, z, size, 0.0014 + 0.0012 * min(1.0, top), 3)
        d += s
        col = 0.82 + 0.16 * (1 - groove)
        col *= 1.0 + 0.12 * smooth(-0.55, -1.0, dy) * front
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

def besalisk(dx, dy, dz, lv):
    """Besalisk (Dexter Jettster): a broad head with a tall bony crest from the brow over the crown, a wide down-turned mouth under a flat nose,
    small eyes, and the wattle (a throat sack) hanging under the jaw, wrinkled when it is empty"""
    bx, by, bz = 0.112, 0.108, 0.108
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.06, chin=0.0)
    front = smooth(0.05, 0.35, dz)
    # the crest: a blade along the middle line, highest over the crown, from the brow to the back of the head
    crest = math.exp(-((x / 0.013) ** 2)) * smooth(0.15, 0.6, dy) * (0.6 + 0.4 * smooth(-0.6, 0.4, dz))
    y += 0.060 * crest * smooth(0.3, 0.9, dy)
    z += 0.020 * crest * smooth(0.5, 1.0, dz)
    # the wattle: a sack under the chin
    w = math.exp(-(((x / 0.060) ** 2) + ((dz - 0.55) / 0.55) ** 2)) * smooth(-0.55, -0.95, dy)
    y -= 0.080 * w
    z += 0.040 * w
    x *= 1.0 + 0.40 * w
    d = socket(x, y, z, EYES["small"], 0.005, 0.012)
    d += front * (0.008 * l2(x, y, [(0.015, 0.034), (0.035, 0.040), (0.060, 0.034)], 0.007)
                  + 0.016 * gauss(x, y, 0.0, -0.022, 0.026, 0.015)                       # the flat nose
                  - 0.004 * g2(x, y, 0.012, -0.030, 0.004, 0.003)
                  + 0.010 * gauss(x, y, 0.0, -0.052, 0.058, 0.014)
                  - 0.011 * line(x, y, [(-0.075, -0.080), (-0.04, -0.064), (0.0, -0.060), (0.04, -0.064), (0.075, -0.080)], 0.0030)
                  + 0.006 * gauss(x, y, 0.0, -0.078, 0.05, 0.010))
    col = 1.0
    if lv:
        d += lumps(x, y, z, 0.008, 0.0012)
        # the crest's flutes, and the folds of the wattle
        d += 0.0016 * crest * math.sin(y * 900.0) * smooth(0.3, 0.7, dy)
        d += -0.0012 * w * (0.5 + 0.5 * math.sin(y * 420.0))
        d += front * folds(y, x, 0.050, 0.095, 4, 0.0008, 0.0026, 0.06)
        col = 0.84 + 0.14 * smooth(0.0, 1.0, crest) + 0.06 * w
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

def sullustan(dx, dy, dz, lv):
    """Sullustan (Nien Nunb): a round head, big dark eyes, a forehead of soft folds, and the jowls: two flaps from the cheeks curving down and in
    round a small mouth"""
    bx, by, bz = 0.104, 0.114, 0.106
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.18, chin=0.0)
    front = smooth(0.05, 0.35, dz)
    d = socket(x, y, z, EYES["big"], 0.008, 0.022)
    jowl = g2(x, y, 0.040, -0.058, 0.020, 0.030)
    d += front * (0.042 * jowl
                  - 0.018 * l2(x, y, [(0.016, -0.018), (0.020, -0.050), (0.028, -0.085)], 0.0040)    # their inner edges
                  - 0.008 * l2(x, y, [(0.062, -0.030), (0.064, -0.070), (0.050, -0.098)], 0.0050)    # and outer
                  - 0.006 * l2(x, y, [(0.022, 0.050), (0.042, 0.062), (0.066, 0.052)], 0.005)         # a fold over each eye
                  + 0.005 * gauss(x, y, 0.0, -0.015, 0.012, 0.010)                                   # a button of a nose
                  - 0.004 * line(x, y, [(-0.012, -0.066), (0.0, -0.068), (0.012, -0.066)], 0.0022))
    if front > 0:
        z -= 0.016 * gauss(x, y, 0.0, -0.075, 0.016, 0.02) * front   # (the mouth sits back between the jowls)
    col = 1.0
    if lv:
        d += front * folds(y, x, 0.045, 0.100, 4, 0.0011, 0.003, 0.055)
        d += lumps(x, y, z, 0.006, 0.0004)
        col = 0.92 - 0.12 * front * l2(x, y, [(0.016, -0.018), (0.020, -0.050), (0.028, -0.085)], 0.006)
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

def toydarian(dx, dy, dz, lv):
    """Toydarian (Watto): a small, round, jowly head, a short trunk hanging from between the eyes over the mouth, wrinkled hide"""
    bx, by, bz = 0.100, 0.106, 0.106
    x, y, z = skull(dx, dy, dz, bx, by, bz, jaw=0.10, chin=0.0)
    front = smooth(0.05, 0.35, dz)
    tr = math.exp(-0.5 * ((x / 0.017) ** 2 + ((y + 0.035) / 0.045) ** 2)) * smooth(0.25, 0.9, dz)
    z += 0.080 * tr
    y -= 0.045 * tr * smooth(-0.01, -0.07, y)
    d = socket(x, y, z, EYES["small"], 0.006, 0.012)
    d += front * (0.020 * g2(x, y, 0.052, -0.045, 0.026, 0.030)                       # the jowls
                  - 0.005 * gauss(x, y, 0.0, -0.068, 0.006, 0.004)                      # the trunk's tip
                  - 0.004 * line(x, y, [(-0.04, -0.075), (0.0, -0.082), (0.04, -0.075)], 0.0024))
    col = 1.0
    if lv:
        d += front * folds(y, x, -0.065, 0.000, 6, 0.0009 * (1 + tr), 0.0022, 0.03) * tr
        d += lumps(x, y, z, 0.006, 0.0007) + front * folds(y, x, 0.04, 0.09, 4, 0.0008, 0.0026, 0.05)
        col = 0.90 + 0.08 * tr
    x, y, z = along_normal(x, y, z, bx, by, bz, d)
    return (x, y, z), col

# key: (builder, eyes, what the code should no longer add itself, reference still)
HEADS = {
    "moncal": (moncal, "side", ["nose", "mouth"], "mon-calamari"),
    "rodian": (rodian, "big", ["nose", "mouth", "snout"], "rodian"),
    "trandoshan": (trandoshan, "small", ["nose", "mouth", "ears"], "trandoshan"),
    "besalisk": (besalisk, "small", ["nose", "mouth", "crest"], "besalisk"),
    "sullustan": (sullustan, "big", ["nose", "mouth"], "sullustan"),
    "toydarian": (toydarian, "small", ["nose", "mouth", "snout"], "toydarian"),
}
CELLS = {k: ((i % 4) * 0.25, 0.75 - (i // 4) * 0.25, 0.25, 0.25) for i, k in enumerate(HEADS)}

def sp_mesh(name, fn, rows, segs, level, dense):
    """build-head.py's grid (rows crowded to the middle, columns to the front) through `fn`; colour per vertex on the high one"""
    verts, uvs, cols = [], [], []
    def add(i, j, pole=None):
        th = H.warp_theta(math.pi * i / rows, dense)
        ph = H.warp_phi(-math.pi + 2 * math.pi * (j if pole is None else j + 0.5) / segs, dense)
        p, c = fn(math.sin(th) * math.sin(ph), math.cos(th), math.sin(th) * math.cos(ph), level)
        verts.append(P(*p))
        cols.append(c)
        uvs.append(((j if pole is None else j + 0.5) / segs, 1.0 - i / rows))
        return len(verts) - 1
    grid = {}
    faces = []
    for i in range(1, rows):
        for j in range(segs + 1):
            grid[(i, j)] = add(i, j)
    top = [add(0, j, "top") for j in range(segs)]
    bottom = [add(rows, j, "bottom") for j in range(segs)]
    for j in range(segs):
        faces.append((top[j], grid[(1, j + 1)], grid[(1, j)]))
        faces.append((bottom[j], grid[(rows - 1, j)], grid[(rows - 1, j + 1)]))
    for i in range(1, rows - 1):
        for j in range(segs):
            faces.append((grid[(i, j)], grid[(i, j + 1)], grid[(i + 1, j + 1)], grid[(i + 1, j)]))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    p = me.polygons[len(me.polygons) // 2]
    if p.normal.dot(p.center) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    layer = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[me.loops[li].vertex_index]
    if level:
        ca = me.color_attributes.new("col", "FLOAT_COLOR", "POINT")
        for i, c in enumerate(cols):
            v = max(0.0, min(1.0, c))
            ca.data[i].color = (v, v, v, 1.0)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def bake_color(low, high, path, size):
    """the high head's vertex colour onto the low head's coordinates (an emission bake)"""
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 1
    m = bpy.data.materials.new("sp_vcol")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = "col"
    e = nt.nodes.new("ShaderNodeEmission")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(a.outputs["Color"], e.inputs["Color"])
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    high.data.materials.clear()
    high.data.materials.append(m)
    img = bpy.data.images.new("bake_col", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    bm_ = bpy.data.materials.new("bake")
    bm_.use_nodes = True
    node = bm_.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    bm_.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(bm_)
    for o_ in bpy.context.selected_objects:
        o_.select_set(False)
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    b = scn.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion = 0.02
    b.max_ray_distance = 0.05
    b.margin = 12
    b.target = "IMAGE_TEXTURES"
    bpy.ops.object.bake(type="EMIT")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)

def bake_all(low, high, key):
    """normal, occlusion, colour (build-head.py's bake); the occlusion's reach a head's, so nothing else in the scene darkens it"""
    os.makedirs(MAPS, exist_ok=True)
    scn = bpy.context.scene
    w = scn.world
    reach = w.light_settings.distance if w else None
    if w:
        w.light_settings.distance = 0.08
    H.bake(low, high, "NORMAL", os.path.join(MAPS, f"species_{key}_normal.png"), CELL)
    H.bake(low, high, "AO", os.path.join(MAPS, f"species_{key}_ao.png"), CELL)
    bake_color(low, high, os.path.join(MAPS, f"species_{key}_color.png"), CELL)
    if w:
        w.light_settings.distance = reach

def atlas():
    """the cells into one 2048 map of each kind (the empty cells flat: normal (0.5, 0.5, 1), occlusion and colour white)"""
    import numpy as np
    for kind, empty in (("normal", (0.5, 0.5, 1.0)), ("ao", (1.0, 1.0, 1.0)), ("color", (0.93, 0.93, 0.93))):
        px = np.ones((ATLAS, ATLAS, 4), dtype=np.float32)
        px[:, :, :3] = empty
        for key, (u0, v0, du, dv) in CELLS.items():
            path = os.path.join(MAPS, f"species_{key}_{kind}.png")
            if not os.path.exists(path):
                continue
            im = bpy.data.images.load(path, check_existing=False)
            a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], im.channels)
            x0, y0 = int(u0 * ATLAS), int(v0 * ATLAS)
            px[y0:y0 + CELL, x0:x0 + CELL, :3] = a[:, :, :3]
            bpy.data.images.remove(im)
        out = bpy.data.images.new(f"species_{kind}", ATLAS, ATLAS, alpha=False)
        out.colorspace_settings.name = "Non-Color"
        out.pixels.foreach_set(px.ravel())
        out.filepath_raw = os.path.join(MAPS, f"species_{kind}.png")
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)

def make_head(key, at=None):
    fn, eyes, drops, ref = HEADS[key]
    rows, segs = (34, 48) if HI else (20, 28)
    low = sp_mesh(f"sphead_{key}", fn, rows, segs, 0, False)
    H.weld_normals(low)
    if at is not None:
        low.location = at
    high = None
    if MAPS and HI:
        high = sp_mesh(f"sphigh_{key}", fn, 110 if FAST else 220, 150 if FAST else 300, 1, True)
        if at is not None:
            high.location = at
        bake_all(low, high, key)
        bpy.data.objects.remove(high)
    u0, v0, du, dv = CELLS[key]
    for d in low.data.uv_layers.active.data:
        d.uv = (u0 + d.uv[0] * du, v0 + d.uv[1] * dv)
    reg = low.data.attributes.new("_REGION", "FLOAT", "POINT")
    ao = low.data.attributes.new("_AO", "FLOAT", "POINT")
    for v in low.data.vertices:
        ao.data[v.index].value = 1.0 - 0.3 * smooth(-0.06, -0.13, v.co.z)
    low.data.materials.clear()
    return low

# ---- What grows out of a head -------------------------------------------------------------------------------------------------------------
def on_skull(dx, dy, dz, out=0.0):
    """a point on the person's skull (build-head.py's) in direction (dx, dy, dz), `out` beyond it"""
    l = math.sqrt(dx * dx + dy * dy + dz * dz)
    x, y, z = H.surface(dx / l, dy / l, dz / l, 0.0, 0)
    n = Vector((x / H.BX ** 2, y / H.BY ** 2, z / H.BZ ** 2)).normalized()
    return Vector((x, y, z)) + n * out, n

def horn(b, root, n, length, r, bend=Vector((0, 0, -1)), curl=0.4, rings=6, seg=None):
    """a tapering horn from `root` out along `n`, curving toward `bend`, ringed with growth ridges"""
    seg = seg or (7 if HI else 5)
    pts = []
    d = Vector(n).normalized()
    p = Vector(root) - d * 0.004
    k = 6
    for i in range(k + 1):
        pts.append(tuple(p))
        d = (d + Vector(bend).normalized() * (curl / k)).normalized()
        p = p + d * (length / k)
    b.tube(pts, lambda t: r * (1 - 0.92 * t) * (1 + 0.07 * math.sin(t * rings * 2 * math.pi) * (1 - t)), 1, seg)

def horns_crown():
    """a Zabrak's crown: nine short horns in two rings over the brow and crown (Maul), the front ones the shorter"""
    b = G.Build("horns_crown")
    spots = [(0.0, 0.80, 0.55, 0.020), (0.33, 0.76, 0.52, 0.024), (-0.33, 0.76, 0.52, 0.024), (0.62, 0.66, 0.40, 0.026), (-0.62, 0.66, 0.40, 0.026),
             (0.20, 0.95, 0.15, 0.030), (-0.20, 0.95, 0.15, 0.030), (0.55, 0.82, -0.05, 0.028), (-0.55, 0.82, -0.05, 0.028)]
    for dx, dy, dz, ln in spots:
        root, n = on_skull(dx, dy, dz)
        horn(b, root, n * 1.6 + Vector((0, 0.5, 0.0)), ln * 0.8, 0.008 + 0.10 * ln, Vector((0, 0.3, -1)), 0.25, 3)
    return b.finish()

def horns_curl():
    """a Devaronian's pair (the left one; the code mirrors it): thick, ridged, from the top of the forehead out and up, the tip turned back"""
    b = G.Build("horns_curl")
    root, n = on_skull(0.45, 0.80, 0.40)
    horn(b, root, Vector((0.75, 0.9, 0.35)), 0.12, 0.024, Vector((0.35, 0.0, -1.0)), 1.9, 10, 9 if HI else 6)
    return b.finish()

def horns_sweep():
    """an Iktotchi's pair (the left one): from the top of the head out over the temple, down beside the face, and forward under the jaw"""
    b = G.Build("horns_sweep")
    root, n = on_skull(0.40, 0.88, 0.10)
    pts = [tuple(root), (0.090, 0.100, 0.015), (0.128, 0.050, 0.020), (0.135, -0.040, 0.035), (0.118, -0.110, 0.070), (0.090, -0.140, 0.105)]
    b.tube(pts, lambda t: 0.030 * (1 - 0.80 * t) * (1 + 0.04 * math.sin(t * 50)), 1, 9 if HI else 6)
    return b.finish()

def head_tentacles():
    """a Nautolan's head-tails: ten thick tentacles from the back and top of the skull, the upper ones lifting and curling out, the lower ones
    hanging to the shoulders, each banded and tapering"""
    b = G.Build("head_tentacles")
    rnd = random.Random(4)
    roots = [(0.30, 0.90, -0.25), (-0.30, 0.90, -0.25), (0.75, 0.55, -0.35), (-0.75, 0.55, -0.35), (0.0, 0.65, -0.75), (0.50, 0.25, -0.80),
             (-0.50, 0.25, -0.80), (0.92, 0.10, -0.30), (-0.92, 0.10, -0.30), (0.0, 0.10, -1.0)]
    for i, (dx, dy, dz) in enumerate(roots):
        root, n = on_skull(dx, dy, dz, -0.004)
        side = 1 if dx >= 0 else -1
        lift = 0.5 if dy > 0.5 else 0.0
        length = 0.24 + 0.10 * (1 - lift) + rnd.uniform(-0.03, 0.03)
        p = Vector(root)
        d = (n * 0.6 + Vector((0, 0.15 * lift, -0.4))).normalized()
        pts = [tuple(p)]
        for k in range(7):
            # (out from the skull, then falling, the upper ones curling out and down to the sides)
            d = (d + Vector((side * 0.12 * (abs(dx) + 0.25), -0.50 + 0.20 * lift * (k < 2), -0.04))).normalized()
            p = p + d * (length / 7)
            pts.append(tuple(p))
        r0 = 0.027 if i < 9 else 0.022
        b.tube(pts, lambda t, r0=r0: r0 * (1 - 0.8 * t) * (1 + 0.06 * math.sin(t * 38)), 0, 7 if HI else 5)
    return b.finish()

PARTS = {"horns_crown": horns_crown, "horns_curl": horns_curl, "horns_sweep": horns_sweep, "head_tentacles": head_tentacles}

def manifest():
    return {k: {"cell": CELLS[k], "eyes": list(EYES[v[1]]), "drops": v[2]} for k, v in HEADS.items()}

# ---- Headless ------------------------------------------------------------------------------------------------------------------------------
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys = [k for k in HEADS if not ONLY or k in ONLY.split(",")]
    made = [make_head(k) for k in keys]
    if MAPS and HI:
        atlas()
    made += [PARTS[p]() for p in PARTS if not ONLY or p in ONLY.split(",")]
    os.makedirs(shape.OUT, exist_ok=True)
    with open(os.path.join(shape.OUT, "species.json"), "w") as fh:
        json.dump(manifest(), fh, indent=1)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in made:
        o.select_set(True)
    path = os.path.join(shape.OUT, "species.glb" if HI else "species.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=True,
                              export_materials="NONE", export_yup=True, export_apply=False)
    print("SPECIES", path, {o.name: len(o.data.polygons) for o in made})

# ---- Live, in the open Mixar session ---------------------------------------------------------------------------------------------------------
SKIN = {"moncal": (0.62, 0.30, 0.20), "rodian": (0.36, 0.52, 0.30), "trandoshan": (0.42, 0.44, 0.22), "besalisk": (0.52, 0.42, 0.30),
        "sullustan": (0.55, 0.50, 0.47), "toydarian": (0.38, 0.48, 0.52)}
EYECOL = {"moncal": (0.9, 0.55, 0.1), "rodian": (0.05, 0.12, 0.5), "trandoshan": (0.9, 0.55, 0.05), "besalisk": (0.8, 0.7, 0.1),
          "sullustan": (0.01, 0.01, 0.01), "toydarian": (0.02, 0.02, 0.02)}

def preview_material(key, skin):
    m = bpy.data.materials.get(f"sp_prev_{key}") or bpy.data.materials.new(f"sp_prev_{key}")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.55
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    def tex(kind):
        p = os.path.join(MAPS, f"species_{key}_{kind}.png")
        if not os.path.exists(p):
            return None
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(p, check_existing=True)
        t.image.reload()
        t.image.colorspace_settings.name = "Non-Color"
        return t
    col, ao, nor = tex("color"), tex("ao"), tex("normal")
    rgb = nt.nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = (*skin, 1.0)
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    nt.links.new(rgb.outputs[0], mul.inputs[6])
    if col:
        nt.links.new(col.outputs[0], mul.inputs[7])
    last = mul.outputs[2]
    if ao:
        mul2 = nt.nodes.new("ShaderNodeMix")
        mul2.data_type = "RGBA"
        mul2.blend_type = "MULTIPLY"
        mul2.inputs[0].default_value = 1.0
        nt.links.new(last, mul2.inputs[6])
        nt.links.new(ao.outputs[0], mul2.inputs[7])
        last = mul2.outputs[2]
    nt.links.new(last, bsdf.inputs["Base Color"])
    if nor:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nor.outputs[0], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    return m

def flat_material(name, rgb, rough=0.4, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m

def ref_plane(slug, at, coll):
    path = os.path.join(REPO, "tools", "refs", "species", slug, "databank.jpeg")
    if not os.path.exists(path):
        return
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=at, rotation=(math.pi / 2, 0, 0))
    pl = bpy.context.active_object
    pl.name = f"sp_ref_{slug}"
    pl.scale = (0.36 * w / h, 0.36, 1)
    for c in pl.users_collection:
        c.objects.unlink(pl)
    coll.objects.link(pl)
    m = bpy.data.materials.new(f"sp_ref_{slug}")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    e = nt.nodes.new("ShaderNodeEmission")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(t.outputs[0], e.inputs[0])
    nt.links.new(e.outputs[0], o.inputs[0])
    pl.data.materials.append(m)

HIDDEN = []

def live():
    import builtins
    scn = bpy.context.scene
    keep = (scn.render.engine, scn.camera, scn.render.resolution_x, scn.render.resolution_y, scn.render.filepath)
    coll = bpy.data.collections.get("claude_species")
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new("claude_species")
        scn.collection.children.link(coll)
    layer = bpy.context.view_layer.layer_collection.children[coll.name]
    bpy.context.view_layer.active_layer_collection = layer
    keys = [k for k in HEADS if not ONLY or k in ONLY.split(",")]
    base = Vector((0, 30, 0))           # (well away from the architecture row)
    hidden = [o for o in scn.objects if o.name not in coll.objects and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    HIDDEN[:] = hidden
    log = {}
    for i, key in enumerate(keys):
        at = base + Vector((i * 2.0, 0, 0))
        low = make_head(key, at)
        log[key] = sum(len(p.vertices) - 2 for p in low.data.polygons)
        low.data.materials.append(preview_material(key, SKIN[key]))
        ex, ey, ez, r = EYES[HEADS[key][1]]
        for s in (1, -1):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=at + P(s * ex, ey, ez), segments=16, ring_count=10)
            e = bpy.context.active_object
            e.name = f"sp_eye_{key}_{s}"
            e.data.materials.append(flat_material(f"sp_eye_{key}", EYECOL[key], 0.08))
            bpy.ops.object.shade_smooth()
        ref_plane(HEADS[key][3], at + Vector((0.0, 0.3, -0.9)), coll)   # (below the head, out of its shots)
    parts = {}
    for i, (name, fn) in enumerate(PARTS.items()):
        ob = fn()
        parts[name] = len(ob.data.polygons)
        at = base + Vector((i * 2.0, 2.5, 0))
        ob.location = at
        ob.data.materials.append(flat_material({"horns_crown": "sp_horn", "horns_curl": "sp_horn_dark", "horns_sweep": "sp_horn"}.get(name, "sp_tent"),
                                               {"horns_crown": (0.75, 0.68, 0.55), "horns_curl": (0.16, 0.13, 0.11), "horns_sweep": (0.55, 0.42, 0.32)}.get(name, (0.25, 0.45, 0.30)), 0.5))
        # (on a person's head, for scale)
        hd = H.head_mesh(f"sp_base_{name}", 0.0, 30, 40, 0)
        hd.location = at
        hd.data.materials.clear()
        hd.data.materials.append(flat_material("sp_skin_base", (0.55, 0.20, 0.15) if name == "horns_crown" else (0.65, 0.45, 0.40) if name != "head_tentacles" else (0.30, 0.55, 0.35), 0.6))
        if name in ("horns_curl", "horns_sweep"):
            m = bpy.data.objects.new(name + "_r", ob.data)
            coll.objects.link(m)
            m.location = at
            m.scale = (-1, 1, 1)
    # a light and a camera of its own for the look
    span = (len(keys) - 1) * 2.0
    for nm, loc, en in (("sp_key", (span / 2 + 1.2, 28.4, 1.4), 120), ("sp_fill", (-1.2, 28.8, 0.3), 35), ("sp_rim", (span / 2, 31.5, 1.0), 60)):
        l = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
        if nm not in coll.objects:
            coll.objects.link(l)
        l.location = loc
        l.data.energy = en
        l.data.size = 1.5
        l.data.size = 3.0
        l.rotation_euler = (Vector((span / 2, 30, -0.3)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    shots = []
    for i, key in enumerate(keys):
        at = base + Vector((i * 2.0, 0, 0))
        # (a three-quarter view from its right and a profile, each close)
        for tag, yaw in (("34", 0.70), ("side", 1.5708)):
            shots.append((f"species-{key}-{tag}", at + Vector((0, 0, -0.005)), at + Vector((0.78 * math.sin(yaw), -0.78 * math.cos(yaw), 0.08)), 0))
    for i, name in enumerate(PARTS):
        at = base + Vector((i * 2.0, 2.5, 0))
        shots.append((f"species-{name}", at + Vector((0, 0.02, 0.0)), at + Vector((0.72 * math.sin(0.75), -0.72 * math.cos(0.75), 0.16)), 0))
    cam = bpy.data.objects.get("sp_cam") or bpy.data.objects.new("sp_cam", bpy.data.cameras.new("sp_cam"))
    if cam.name not in coll.objects:
        coll.objects.link(cam)
    scn.camera = cam
    cam.data.lens = 85
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scn.render.resolution_x, scn.render.resolution_y = 640, 640
    outdir = os.path.join(REPO, "tools", "refs", "cache")
    for name, look_at, from_, ortho in shots:
        cam.location = from_
        cam.rotation_euler = (look_at - from_).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.join(outdir, name + ".png")
        bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    scn.render.engine, scn.camera, scn.render.resolution_x, scn.render.resolution_y, scn.render.filepath = keep
    with open(os.path.join(outdir, "species-live.log"), "w") as fh:
        fh.write(json.dumps({"heads": log, "parts": parts}) + "\n")
    print("SPECIES LIVE", log, parts)

def export_live():
    """the export from the open Mixar session (builtins.SPECIES_EXPORT = True): the low heads (no bake: the maps baked by the live runs are in
    tools/refs/cache/species and tools/build-species-textures.py lays them out) and the parts, built in a collection of their own at the origin,
    written to client/public/figures/species.glb with shared/art/speciesHeads.json, and removed again"""
    global MAPS
    keep_maps, MAPS = MAPS, None
    coll = bpy.data.collections.new("claude_species_export")
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
    # (the live review's objects keep these names: they step aside, so that the exported meshes are named exactly what the game looks for)
    for name in [f"sphead_{k}" for k in HEADS] + list(PARTS):
        ob = bpy.data.objects.get(name)
        if ob:
            ob.name = name + "_review"
    try:
        made = [make_head(k) for k in HEADS] + [fn() for fn in PARTS.values()]
        bad = [o.name for o in made if o.name not in [f"sphead_{k}" for k in HEADS] + list(PARTS)]
        if bad:
            raise RuntimeError(f"species export: unexpected names {bad}")
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for o in made:
            o.select_set(True)
        path = os.path.join(REPO, "client", "public", "figures", "species.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_normals=True, export_texcoords=True,
                                  export_materials="NONE", export_yup=True, export_apply=False)
        with open(os.path.join(REPO, "shared", "art", "speciesHeads.json"), "w") as fh:
            json.dump(manifest(), fh, indent=1)
        tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made}
        with open(os.path.join(REPO, "tools", "refs", "cache", "species-export.log"), "w") as fh:
            json.dump(tris, fh)
        print("SPECIES EXPORT", path, tris)
    finally:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
        MAPS = keep_maps

if __name__ == "__main__":
    import builtins as _b
    if LIVE and getattr(_b, "SPECIES_EXPORT", False):
        _b.SPECIES_EXPORT = False
        export_live()
    elif LIVE:
        try:
            live()
        finally:
            # (whatever happens, the rest of the scene is shown again)
            for o in HIDDEN:
                try:
                    o.hide_render = False
                except ReferenceError:
                    pass
    else:
        main()
