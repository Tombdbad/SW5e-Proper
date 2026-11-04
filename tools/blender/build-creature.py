# The sculpted heads and bodies of beasts (2026-11-04; the user: "lets focus on the old primitives, species and beast types that have not been
# touched yet", after the sculpted people).
#
# Run headless:  blender --background --python tools/blender/build-creature.py -- <out-dir> [--lo]
# Writes <out-dir>/creature.glb (creature.lo.glb with --lo): one mesh a part, in the units and axes of the code (y up, +z the way the beast
# faces) and at the scale models.tsx `quadHead`, `brute` and `runner` draw them (a quadruped's head for a body 0.3 thick), each origin where the
# code puts the part's joint. Every part carries per vertex `_AO` (occlusion, multiplied into the colour), `_REGION` (0 hide, 1 the bone, horn or
# tooth colour) and `_MARK` (-1 .. 1: toward paler for a muzzle, a chin or a belly, toward dark for a nostril, a lip line or an eyelid), and
# custom properties the code reads back: `eyes` (x, y, z, radius: where the code puts an eye on the right side; the left is the mirror),
# `ear` (where an ear's base stands, x y z) and `jaw` (the joint a lower jaw opens about).
# Original shapes: CC0. Lofted sections (shape.py), smoothed and pushed in with small displacements along the normal, then thinned.
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, bvhtree
sys.dont_write_bytecode = True  # (no __pycache__ beside the script)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shape import *  # noqa: F401,F403
from shape import OUT, HI

ARND = 14 if HI else 8
FEATURE = 1.5

def sections_of(spec):
    """(z, half width, half height, centre y, squareness) along the head's length"""
    return [(P(0, row[3], row[0]), X, Y, row[1], row[2], row[4] if len(row) > 4 else 2.2) for row in spec]

def subdivide(ob, levels):
    """smooth a coarse loft into a dense mesh the small features can be pushed into"""
    mod = ob.modifiers.new("sub", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier="sub")
    ob.select_set(False)

def budget(ob, ratio):
    """collapse a dense mesh to what is drawn (the vertex attributes are kept)"""
    mod = ob.modifiers.new("budget", "DECIMATE")
    mod.ratio = ratio if HI else 0.3
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier="budget")
    ob.select_set(False)
    for poly in ob.data.polygons:
        poly.use_smooth = True

def head_loft(name, spec, tip=0.02, regions=None, dens=3):
    p = Part(name)
    sec = sections_of(spec)
    reg = list(regions) if regions else [0] * len(sec)
    sec, reg = dense(sec, reg, dens)
    if tip:
        sec, reg = rounded(sec, reg, tip, 4)
    p.loft(sec, ARND, reg)
    ob = p.object()
    subdivide(ob, 2 if HI else 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def displace(ob, bumps=(), marks=(), bone=()):
    """small shapes pushed along the normal (cx, cy, cz, rx, ry, rz, height: x is mirrored), marks painted in the same way (the last number
    -1 .. 1: paler to darker) and `bone` spheres (x, y, z, r) that take region 1"""
    me = ob.data
    region = me.attributes["_REGION"].data
    mark = me.attributes["_MARK"].data
    out = []
    for v in me.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        n = v.normal
        nx, ny, nz = n.x, n.z, -n.y
        dx = dy = dz = 0.0
        for (cx, cy, cz, rx, ry, rz, h) in bumps:
            d2 = ((abs(x) - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
            g = math.exp(-0.5 * d2) * h * FEATURE
            dx += g * nx
            dy += g * ny
            dz += g * nz
        out.append(P(x + dx, y + dy, z + dz))
        m = mark[v.index].value
        for (cx, cy, cz, rx, ry, rz, h) in marks:
            d2 = ((abs(x) - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
            m += math.exp(-0.5 * d2) * h
        mark[v.index].value = max(-1.0, min(1.0, m))
        for (cx, cy, cz, r) in bone:
            if (abs(x) - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r:
                region[v.index].value = 1.0
    for v, co in zip(me.vertices, out):
        v.co = co

def pitch(ob, angle, about=(0.0, 0.0, 0.0)):
    """turn about the x axis (three's) so the nose goes down for a positive angle, around a point"""
    c, s = math.cos(angle), math.sin(angle)
    ay, az = about[1], about[2]
    for v in ob.data.vertices:
        y, z = v.co.z - ay, -v.co.y - az
        v.co = P(v.co.x, y * c - z * s + ay, y * s + z * c + az)

def move(ob, dx=0.0, dy=0.0, dz=0.0):
    for v in ob.data.vertices:
        v.co = v.co + P(dx, dy, dz)

def tag(ob, **props):
    for k, v in props.items():
        ob[k] = v

# ---- Marks used on most faces -----------------------------------------------------------------------------------------------------------

def mouth(y, z0, z1, w, strength=0.8):
    """the line of the lips: a thin dark band along both sides of the muzzle at height y from z0 to z1"""
    return (0.0, y, (z0 + z1) / 2, w, 0.0035, (z1 - z0) / 2.4, strength)

def eyelids(x, y, z, r=0.03, strength=0.55):
    return (x, y, z, r, r * 0.9, r * 0.8, strength)

# ---- Ears (a flattened cone from its base up: x across, z front to back) -----------------------------------------------------------------

def ear(name, height, base_w, base_t, lean=0.0, hollow=0.0, bend=0.0, round_tip=False):
    p = Part(name)
    rows = [(0.0, 1.0), (0.18, 1.0), (0.5, 0.76), (0.8, 0.46), (0.96, 0.2 if round_tip else 0.12), (1.0, 0.0)]
    sec = [(P(lean * (t ** 2), height * t, bend * t * t), X, Z, max(base_w * w, 0.002), max(base_t * (0.5 + 0.5 * w), 0.002), 2.1) for t, w in rows]
    sec, reg = dense(sec, [0] * len(sec), 3)
    p.loft(sec, ARND, reg)
    ob = p.object()
    subdivide(ob, 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    if hollow:
        displace(ob, [(0.0, height * 0.42, base_t, base_w * 0.55, height * 0.3, base_t * 1.2, -hollow)], marks=[(0.0, height * 0.4, base_t, base_w * 0.6, height * 0.35, base_t * 2, 0.5)])
    return ob

# ---- The heads of four-legged beasts ----------------------------------------------------------------------------------------------------

def cat():
    ob = head_loft("cat", [(-0.15, .035, .035, 0, 2), (-0.13, .08, .075, 0), (-0.08, .125, .115, 0), (-0.01, .145, .125, 0), (0.05, .13, .113, -.005),
                           (0.10, .095, .088, -.018, 2.3), (0.14, .06, .06, -.03, 2.4), (0.17, .04, .042, -.038, 2.4)], tip=0.02)
    displace(ob, [
        (0.062, 0.075, 0.085, 0.034, 0.014, 0.04, 0.010),   # the brow
        (0.065, 0.040, 0.100, 0.024, 0.02, 0.025, 0.007),   # the orbit
        (0.0, 0.015, 0.145, 0.012, 0.04, 0.04, 0.006),      # the bridge of the nose
        (0.036, -0.050, 0.12, 0.026, 0.018, 0.03, 0.012),   # the whisker pads
        (0.0, -0.088, 0.105, 0.022, 0.013, 0.04, 0.005),    # the chin
        (0.014, -0.044, 0.19, 0.006, 0.005, 0.01, -0.004),  # the nostrils
    ], marks=[
        (0.0, -0.040, 0.19, 0.016, 0.012, 0.012, 0.9), (0.014, -0.046, 0.192, 0.008, 0.006, 0.01, 0.8),
        mouth(-0.066, 0.06, 0.18, 0.08), eyelids(0.065, 0.04, 0.115),
        (0.0, -0.06, 0.12, 0.07, 0.05, 0.07, -0.35), (0.0, -0.12, 0.0, 0.14, 0.06, 0.2, -0.35),
    ])
    tag(ob, eyes=[0.065, 0.04, 0.12, 0.028], ear=[0.09, 0.14, -0.01], jaw=[0.0, -0.05, -0.02])
    return ob

def dog():
    ob = head_loft("dog", [(-0.145, .03, .03, 0, 2), (-0.125, .075, .07, 0), (-0.08, .115, .105, 0), (-0.01, .13, .115, 0), (0.045, .105, .1, -.005),
                           (0.09, .065, .07, -.025, 2.3), (0.14, .052, .052, -.037, 2.4), (0.20, .048, .045, -.043, 2.5), (0.26, .044, .04, -.047, 2.5), (0.285, .038, .034, -.05, 2.4)], tip=0.015)
    displace(ob, [
        (0.062, 0.075, 0.075, 0.03, 0.014, 0.04, 0.009),
        (0.066, 0.045, 0.10, 0.022, 0.02, 0.025, 0.008),
        (0.0, 0.0, 0.10, 0.02, 0.03, 0.03, -0.004),          # the stop between brow and muzzle
        (0.0, -0.02, 0.2, 0.012, 0.03, 0.08, 0.004),         # the ridge of the muzzle
        (0.04, -0.062, 0.22, 0.012, 0.01, 0.07, 0.006),      # the lips
        (0.0, -0.095, 0.15, 0.022, 0.012, 0.05, 0.004),
        (0.013, -0.040, 0.296, 0.005, 0.005, 0.01, -0.004),
    ], marks=[
        (0.0, -0.044, 0.298, 0.02, 0.016, 0.014, 0.95), mouth(-0.065, 0.1, 0.29, 0.07), eyelids(0.064, 0.048, 0.105),
        (0.0, -0.045, 0.2, 0.06, 0.05, 0.1, -0.3), (0.0, -0.13, 0.05, 0.14, 0.06, 0.25, -0.35),
    ])
    tag(ob, eyes=[0.06, 0.05, 0.11, 0.024], ear=[0.08, 0.14, -0.02], jaw=[0.0, -0.05, -0.04])
    return ob

def long_head():
    ob = head_loft("long", [(-0.12, .04, .04, 0, 2), (-0.10, .07, .08, 0), (-0.04, .105, .115, 0), (0.03, .10, .11, 0), (0.10, .085, .095, -.005), (0.17, .07, .08, -.01),
                            (0.23, .062, .066, -.012), (0.27, .06, .062, -.012)], tip=0.02)
    displace(ob, [
        (0.092, 0.075, 0.05, 0.02, 0.02, 0.03, 0.008),
        (0.0, 0.03, 0.15, 0.012, 0.03, 0.09, 0.005),
        (0.052, -0.02, 0.27, 0.014, 0.016, 0.02, 0.006),      # the flare of the nostrils
        (0.03, -0.03, 0.292, 0.006, 0.006, 0.01, -0.004),
        (0.0, -0.075, 0.2, 0.03, 0.014, 0.05, 0.004),
    ], marks=[
        (0.032, -0.03, 0.29, 0.012, 0.01, 0.014, 0.95), mouth(-0.045, 0.1, 0.28, 0.07), eyelids(0.09, 0.05, 0.055),
        (0.0, -0.02, 0.24, 0.07, 0.07, 0.08, -0.3), (0.0, -0.1, 0.1, 0.1, 0.05, 0.2, -0.3),
    ])
    pitch(ob, 0.5)
    move(ob, 0, -0.01, 0.045)
    tag(ob, eyes=[0.09, 0.05, 0.06, 0.022], ear=[0.07, 0.14, -0.02], jaw=[0.0, -0.05, -0.03])
    return ob

def blunt():
    ob = head_loft("blunt", [(-0.19, .04, .04, 0, 2), (-0.165, .10, .10, 0), (-0.10, .17, .165, 0), (-0.02, .195, .185, 0), (0.07, .185, .175, -.01),
                             (0.14, .15, .14, -.03), (0.20, .115, .105, -.055, 2.6), (0.25, .10, .088, -.07, 2.8)], tip=0.015)
    displace(ob, [
        (0.115, 0.08, 0.12, 0.04, 0.025, 0.04, 0.016),        # the brow
        (0.0, 0.1, 0.0, 0.07, 0.03, 0.12, 0.01),              # the crown
        (0.05, -0.1, 0.22, 0.03, 0.02, 0.03, 0.01),
        (0.04, -0.075, 0.262, 0.012, 0.01, 0.012, -0.006),    # the nostrils
        (0.0, -0.135, 0.17, 0.05, 0.025, 0.07, 0.008),        # the chin
    ], marks=[
        (0.04, -0.075, 0.262, 0.02, 0.015, 0.015, 0.95), mouth(-0.105, 0.1, 0.25, 0.1), eyelids(0.12, 0.05, 0.14, 0.04),
        (0.0, -0.08, 0.2, 0.1, 0.06, 0.07, -0.3), (0.0, -0.15, 0.05, 0.2, 0.06, 0.25, -0.3),
    ])
    tag(ob, eyes=[0.12, 0.05, 0.14, 0.03], ear=[0.1, 0.1, -0.06], jaw=[0.0, -0.08, -0.05])
    return ob

def reptile():
    ob = head_loft("reptile", [(-0.04, .04, .03, 0, 2), (0.0, .09, .07, 0), (0.06, .115, .08, .005, 2.5), (0.14, .095, .066, 0, 2.6), (0.22, .077, .054, -.003, 2.7),
                               (0.30, .066, .045, -.005, 2.7), (0.37, .055, .036, -.008, 2.6)], tip=0.02)
    displace(ob, [
        (0.092, 0.07, 0.07, 0.035, 0.02, 0.04, 0.012),         # the bony brow
        (0.0, 0.045, 0.09, 0.02, 0.012, 0.1, 0.008),           # the ridge down the snout
        (0.05, 0.0, 0.39, 0.007, 0.007, 0.012, -0.004),        # the nostrils
        (0.0, -0.028, 0.2, 0.09, 0.004, 0.16, -0.0045),        # the line of the jaw
        (0.065, -0.02, 0.0, 0.025, 0.02, 0.03, 0.01),          # the cheeks
    ], marks=[
        (0.045, 0.012, 0.388, 0.014, 0.012, 0.016, 0.95), mouth(-0.026, 0.02, 0.38, 0.09, 0.9), eyelids(0.1, 0.06, 0.075, 0.034, 0.7),
        (0.0, -0.04, 0.2, 0.1, 0.04, 0.2, -0.4),
    ])
    tag(ob, eyes=[0.1, 0.06, 0.08, 0.026], jaw=[0.0, -0.03, 0.0])
    return ob

def rhino():
    ob = head_loft("rhino", [(-0.14, .05, .06, 0, 2), (-0.10, .11, .12, 0), (-0.03, .18, .165, 0), (0.06, .20, .155, -.01), (0.15, .17, .125, -.03), (0.24, .125, .095, -.045, 2.5),
                             (0.30, .095, .075, -.05, 2.6)], tip=0.02)
    displace(ob, [
        (0.14, 0.085, 0.1, 0.04, 0.025, 0.04, 0.012),
        (0.0, 0.04, 0.3, 0.05, 0.03, 0.04, 0.012),             # the boss the horn stands on
        (0.05, -0.06, 0.3, 0.014, 0.01, 0.014, -0.005),
        (0.0, -0.12, 0.2, 0.06, 0.03, 0.08, 0.006),
        (0.0, 0.1, -0.06, 0.12, 0.03, 0.05, 0.008),
    ], marks=[
        (0.05, -0.06, 0.3, 0.02, 0.016, 0.016, 0.9), mouth(-0.095, 0.1, 0.28, 0.1), eyelids(0.14, 0.06, 0.115, 0.034, 0.6),
        (0.0, -0.1, 0.22, 0.1, 0.06, 0.1, -0.25),
    ])
    tag(ob, eyes=[0.14, 0.06, 0.12, 0.026], ear=[0.1, 0.12, -0.08], jaw=[0.0, -0.08, -0.04])
    return ob

def boar():
    ob = head_loft("boar", [(-0.15, .04, .045, 0, 2), (-0.12, .10, .11, 0), (-0.06, .15, .145, 0), (0.03, .155, .14, -.01), (0.11, .115, .105, -.03), (0.17, .082, .078, -.04, 2.5),
                            (0.21, .08, .075, -.04, 3.0)], tip=0.0)
    displace(ob, [
        (0.1, 0.07, 0.09, 0.035, 0.02, 0.04, 0.012),
        (0.026, -0.035, 0.212, 0.01, 0.01, 0.01, -0.005),      # the nostrils in the flat of the snout
        (0.0, -0.1, 0.12, 0.05, 0.025, 0.06, 0.006),
        (0.0, -0.04, 0.2, 0.07, 0.07, 0.02, 0.012),            # the rim of the disc
    ], marks=[
        (0.026, -0.035, 0.213, 0.014, 0.012, 0.012, 1.0), (0.0, -0.04, 0.21, 0.07, 0.065, 0.02, -0.25), mouth(-0.078, 0.08, 0.2, 0.09), eyelids(0.1, 0.06, 0.095),
        (0.0, -0.13, 0.05, 0.15, 0.06, 0.2, -0.3),
    ])
    tag(ob, eyes=[0.1, 0.06, 0.1, 0.024], ear=[0.1, 0.12, -0.04], jaw=[0.0, -0.06, -0.04])
    return ob

# ---- The heads of brutes (made for the brute's head group: the origin at the neck's top) -----------------------------------------------------

def rancor():
    ob = head_loft("rancor", [(-0.19, .06, .05, 0, 2), (-0.16, .12, .11, 0), (-0.08, .19, .16, 0), (0.02, .2, .165, 0), (0.10, .17, .14, -.02), (0.17, .14, .10, -.05, 2.4), (0.21, .13, .085, -.06, 2.6)], tip=0.012)
    displace(ob, [
        (0.1, 0.09, 0.09, 0.04, 0.03, 0.05, 0.018),            # the heavy brow
        (0.0, 0.1, 0.0, 0.06, 0.04, 0.12, 0.012),
        (0.05, -0.03, 0.22, 0.012, 0.01, 0.012, -0.005),
        (0.0, -0.062, 0.12, 0.13, 0.004, 0.1, -0.004),          # the lip
    ], marks=[eyelids(0.08, 0.06, 0.14, 0.04, 0.65), (0.05, -0.03, 0.22, 0.02, 0.015, 0.015, 0.9), (0.0, -0.1, 0.1, 0.15, 0.05, 0.12, -0.2)])
    tag(ob, eyes=[0.08, 0.06, 0.14, 0.022], jaw=[0.0, -0.1, -0.04])
    return ob

def rancor_jaw():
    ob = head_loft("rancor_jaw", [(-0.05, .05, .035, -.12, 2), (-0.01, .11, .05, -.12), (0.06, .15, .055, -.12), (0.16, .14, .05, -.115), (0.24, .105, .042, -.11, 2.4), (0.27, .08, .036, -.108)], tip=0.012)
    displace(ob, [(0.0, -0.15, 0.2, 0.08, 0.02, 0.06, 0.01)], marks=[(0.0, -0.1, 0.2, 0.12, 0.03, 0.08, -0.25), (0.0, -0.1, 0.26, 0.06, 0.02, 0.02, 0.4)])
    return ob

def wampa():
    ob = head_loft("wampa", [(-0.14, .05, .05, 0, 2), (-0.11, .11, .11, 0), (-0.04, .14, .14, 0), (0.04, .135, .135, 0), (0.10, .11, .10, -.015), (0.15, .07, .065, -.04)], tip=0.02)
    displace(ob, [
        (0.07, 0.07, 0.08, 0.035, 0.025, 0.04, 0.012),
        (0.0, -0.035, 0.17, 0.05, 0.03, 0.03, 0.01),
        (0.02, -0.04, 0.165, 0.008, 0.007, 0.01, -0.004),
        (0.0, -0.075, 0.12, 0.05, 0.003, 0.05, -0.003),
    ], marks=[eyelids(0.05, 0.03, 0.12, 0.03, 0.6), (0.0, -0.04, 0.17, 0.035, 0.022, 0.02, 0.85), (0.0, -0.075, 0.12, 0.06, 0.004, 0.05, 0.6)])
    tag(ob, eyes=[0.05, 0.03, 0.12, 0.018], ear=[0.1, 0.08, 0.0])
    return ob

def ape():
    ob = head_loft("ape", [(-0.13, .05, .05, 0, 2), (-0.1, .10, .10, 0), (-0.03, .13, .13, 0), (0.04, .125, .12, 0), (0.10, .10, .09, -.02), (0.15, .075, .065, -.045)], tip=0.02)
    displace(ob, [
        (0.06, 0.06, 0.09, 0.04, 0.03, 0.04, 0.016),           # the brow of a gundark
        (0.0, -0.045, 0.14, 0.045, 0.03, 0.03, 0.006),
        (0.015, -0.035, 0.158, 0.006, 0.006, 0.008, -0.004),
        (0.0, -0.075, 0.12, 0.05, 0.003, 0.05, -0.003),
    ], marks=[eyelids(0.05, 0.03, 0.105, 0.03, 0.7), (0.015, -0.035, 0.158, 0.014, 0.01, 0.01, 0.9), (0.0, -0.075, 0.12, 0.06, 0.004, 0.05, 0.6), (0.0, -0.06, 0.14, 0.05, 0.04, 0.04, -0.25)])
    tag(ob, eyes=[0.05, 0.03, 0.11, 0.02], ear=[0.13, 0.04, -0.02])
    return ob

def horned():
    ob = head_loft("horned", [(-0.13, .05, .05, 0, 2), (-0.1, .10, .10, 0), (-0.03, .125, .125, 0), (0.04, .12, .115, 0), (0.09, .09, .085, -.02), (0.13, .06, .055, -.04)], tip=0.02)
    displace(ob, [
        (0.05, 0.06, 0.09, 0.04, 0.025, 0.04, 0.012),
        (0.0, -0.035, 0.14, 0.04, 0.025, 0.025, 0.006),
        (0.0, -0.075, 0.1, 0.04, 0.003, 0.05, -0.003),
    ], marks=[eyelids(0.05, 0.02, 0.105, 0.03, 0.7), (0.0, -0.075, 0.11, 0.05, 0.004, 0.05, 0.7)])
    tag(ob, eyes=[0.05, 0.02, 0.11, 0.022])
    return ob

# ---- The heads of runners ---------------------------------------------------------------------------------------------------------------

def bird():
    ob = head_loft("bird", [(-0.09, .035, .04, 0, 2), (-0.07, .07, .075, 0), (-0.02, .09, .09, 0), (0.04, .085, .085, 0), (0.085, .055, .055, -.01)], tip=0.02)
    displace(ob, [(0.075, 0.05, 0.05, 0.02, 0.02, 0.03, 0.006)], marks=[eyelids(0.075, 0.04, 0.045, 0.026, 0.6), (0.0, -0.06, 0.06, 0.07, 0.05, 0.09, -0.3)])
    tag(ob, eyes=[0.075, 0.04, 0.045, 0.016])
    return ob

def beak():
    """the beak of a bird or a kaadu: bone coloured, hooked at the tip"""
    p = Part("beak")
    sec = [(P(0, 0.0, 0.06), X, Y, 0.038, 0.022, 2.4), (P(0, -0.002, 0.11), X, Y, 0.03, 0.02, 2.4), (P(0, -0.008, 0.16), X, Y, 0.018, 0.016, 2.3), (P(0, -0.022, 0.19), X, Y, 0.006, 0.01, 2.2)]
    sec, reg = dense(sec, [1] * 4, 3)
    p.loft(sec, ARND, reg)
    ob = p.object()
    subdivide(ob, 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    displace(ob, [(0.0, -0.016, 0.1, 0.05, 0.002, 0.08, -0.002)], marks=[(0.0, -0.012, 0.1, 0.05, 0.003, 0.09, 0.5)])
    return ob

def tauntaun():
    ob = head_loft("tauntaun", [(-0.07, .03, .03, 0, 2), (-0.05, .065, .07, 0), (0.0, .075, .085, 0), (0.06, .07, .075, -.01), (0.12, .058, .06, -.02), (0.17, .045, .045, -.025)], tip=0.015)
    displace(ob, [
        (0.06, 0.06, 0.02, 0.025, 0.02, 0.03, 0.007),
        (0.02, -0.01, 0.17, 0.006, 0.006, 0.01, -0.004),
    ], marks=[eyelids(0.06, 0.035, 0.03, 0.025, 0.6), (0.02, -0.01, 0.17, 0.012, 0.01, 0.01, 0.9), mouth(-0.04, 0.0, 0.16, 0.06, 0.7), (0.0, -0.05, 0.1, 0.06, 0.04, 0.1, -0.3)])
    pitch(ob, 0.3)
    tag(ob, eyes=[0.058, 0.04, 0.04, 0.02], ear=[0.06, 0.04, -0.02])
    return ob

def lizard():
    ob = head_loft("lizard", [(-0.02, .04, .03, 0, 2), (0.0, .065, .05, 0), (0.06, .065, .048, 0), (0.12, .055, .04, 0), (0.17, .045, .032, -.003)], tip=0.02)
    displace(ob, [(0.06, 0.04, 0.03, 0.02, 0.02, 0.03, 0.007), (0.0, 0.03, 0.1, 0.014, 0.01, 0.08, 0.004)], marks=[eyelids(0.06, 0.04, 0.03, 0.026, 0.6), mouth(-0.012, 0.0, 0.17, 0.05, 0.8), (0.0, -0.03, 0.1, 0.06, 0.03, 0.1, -0.3)])
    tag(ob, eyes=[0.06, 0.035, 0.03, 0.02], jaw=[0.0, -0.01, 0.0])
    return ob

# ---- The body and legs of four-legged beasts -------------------------------------------------------------------------------------------

def quad_body():
    """the barrel of a four-legged beast, centred on its middle: 1.2 long (z, the rump behind, the neck's base ahead), 0.3 the radius of the barrel
    (the code scales it by the beast's girth over 0.3 and its length over 1.2)"""
    ob = head_loft("quad_body", [(-0.60, .04, .04, .03, 2), (-0.55, .16, .17, .03), (-0.40, .27, .28, .02), (-0.20, .29, .28, 0), (0.0, .285, .285, -.01),
                                 (0.20, .30, .31, -.01), (0.38, .28, .30, 0.0), (0.52, .19, .22, .03), (0.60, .09, .11, .05)], tip=0.012)
    displace(ob, [
        (0.23, 0.08, 0.30, 0.08, 0.10, 0.12, 0.014),     # the shoulder blades
        (0.25, 0.02, -0.38, 0.09, 0.12, 0.12, 0.016),    # the haunches
        (0.0, 0.29, 0.05, 0.03, 0.03, 0.5, 0.006),       # the spine
        (0.17, -0.1, 0.1, 0.1, 0.12, 0.16, 0.008),       # the ribs
    ], marks=[(0.0, -0.3, 0.0, 0.28, 0.12, 0.55, -0.45), (0.0, 0.29, 0.0, 0.3, 0.1, 0.6, 0.12)])
    # (the underside takes the belly's colour: region 2)
    region = ob.data.attributes["_REGION"].data
    for v in ob.data.vertices:
        if v.co.z < -0.19:
            region[v.index].value = 2.0
    return ob

def hanging(name, rows, regions=None, tip=0.0, around=None, sub=1):
    """a limb part hanging from its joint along -y: rows (down, half width, half depth, forward, squareness)"""
    p = Part(name)
    sec = [(P(0, -r[0], r[3]), X, Z, r[1], r[2], r[4] if len(r) > 4 else 2.1) for r in rows]
    reg = list(regions) if regions else [0] * len(sec)
    sec, reg = dense(sec, reg, 3)
    if tip:
        sec, reg = rounded(sec, reg, tip, 3)
    p.loft(sec, around or ARND, reg)
    ob = p.object()
    if HI and sub:
        subdivide(ob, sub)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def quad_thigh():
    """hip to knee (0.25 long) and the knee's ball past it: for a fore or a hind leg"""
    ob = hanging("quad_thigh", [(0.0, .10, .12, 0), (0.05, .115, .13, .005), (0.12, .10, .12, .01), (0.19, .075, .085, .01), (0.25, .06, .065, .005)], tip=0.05)
    displace(ob, [(0.075, -0.1, 0.0, 0.06, 0.08, 0.1, 0.008)])
    return ob

def quad_shin(kind):
    """knee to ankle (0.23 long) and the foot past it: a hoof, a padded paw or a splayed reptile's foot (region 1)"""
    if kind == "hoof":
        rows = [(0.0, .058, .062, 0), (0.06, .05, .054, -.004), (0.14, .04, .043, 0), (0.20, .036, .04, .002), (0.23, .044, .05, .004), (0.25, .05, .056, .01), (0.26, .056, .066, .012), (0.30, .062, .082, .016, 2.4), (0.31, .058, .078, .016, 2.6)]
        reg = [0, 0, 0, 0, 0, 0, 1, 1, 1]
    elif kind == "paw":
        rows = [(0.0, .058, .062, 0), (0.08, .045, .05, -.004), (0.17, .038, .042, 0), (0.22, .04, .046, .01), (0.25, .05, .07, .025), (0.28, .06, .085, .04, 2.3), (0.31, .058, .09, .045, 2.5)]
        reg = [0, 0, 0, 0, 1, 1, 1]
    else:
        rows = [(0.0, .06, .06, 0), (0.10, .05, .052, 0), (0.20, .044, .05, .004), (0.23, .05, .06, .01), (0.26, .075, .11, .04, 2.4), (0.30, .09, .14, .06, 2.6), (0.31, .085, .13, .06, 2.8)]
        reg = [0, 0, 0, 0, 1, 1, 1]
    ob = hanging("quad_" + kind, rows, regions=reg)
    return ob

# ---- Brutes: trunk, arms with hands and claws, legs with feet (made at a bulk of 1; the code scales the width and depth by the bulk) ---------

def claw(base, tip, r, sides=5):
    """a claw or a tooth from `base` to `tip` (three's coordinates): a base ring, a body that has narrowed, the point; region 1"""
    b, t = Vector(base), Vector(tip)
    L = (t - b).length
    a = (t - b).normalized()
    up = Vector((0, 1, 0)) if abs(a.y) < 0.9 else Vector((1, 0, 0))
    u = a.cross(up).normalized()
    v = a.cross(u).normalized()
    p = Part("claw")
    sec = [(P(*(b + a * (L * k))), P(*u), P(*v), r * f, r * f, 2.0) for k, f in ((0.0, 1.0), (0.5, 0.6), (0.98, 0.08))]
    p.loft(sec, sides, [1] * 3)
    ob = p.object()
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def column(name, rows, regions=None, tip=0.0, sub=2):
    """a part standing up from its origin along +y: rows (y, half width, half depth, centre z, squareness)"""
    p = Part(name)
    sec = [(P(0, r[0], r[3]), X, Z, r[1], r[2], r[4] if len(r) > 4 else 2.2) for r in rows]
    reg = list(regions) if regions else [0] * len(sec)
    sec, reg = dense(sec, reg, 3)
    if tip:
        sec, reg = rounded(sec, reg, tip, 3)
    p.loft(sec, ARND, reg)
    ob = p.object()
    subdivide(ob, sub if HI else 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def join_all(ob, extra, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    objs = [ob] + extra
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    ob.name = name
    ob.data.name = name
    ob.select_set(False)
    return ob

def brute_torso():
    """hips at the origin, up to the base of the neck at 0.62: a barrel chest, wide shoulders, a gut (the code scales the width and depth by the bulk)"""
    ob = column("brute_torso", [(-0.02, .14, .11, 0), (0.0, .19, .15, 0), (0.1, .23, .18, 0), (0.22, .28, .22, .01), (0.34, .33, .25, .02), (0.44, .36, .24, 0),
                                (0.52, .28, .2, -.02), (0.58, .15, .13, -.01), (0.64, .08, .08, 0)])
    displace(ob, [
        (0.12, 0.42, 0.22, 0.1, 0.07, 0.07, 0.016),     # the pectorals
        (0.30, 0.46, 0.0, 0.1, 0.1, 0.12, 0.02),        # the shoulders
        (0.0, 0.12, 0.2, 0.12, 0.1, 0.08, 0.016),       # the gut
        (0.0, 0.5, -0.12, 0.05, 0.14, 0.03, 0.014),     # the hump of the neck and the back
        (0.11, 0.1, -0.15, 0.08, 0.08, 0.06, 0.012),
    ], marks=[(0.0, 0.1, 0.25, 0.2, 0.2, 0.1, -0.25), (0.0, 0.3, -0.2, 0.3, 0.2, 0.1, 0.1)])
    return ob

def brute_upper():
    """shoulder to elbow (0.26 long), the shoulder's mass above and the elbow's ball past it"""
    ob = hanging("brute_upper", [(-0.03, .08, .085, 0), (0.0, .095, .1, 0), (0.06, .1, .105, 0), (0.14, .085, .09, 0), (0.21, .07, .072, 0), (0.26, .06, .062, 0)], tip=0.05, sub=2)
    displace(ob, [(0.0, -0.06, 0.05, 0.07, 0.07, 0.06, 0.012)])
    return ob

def brute_fore():
    """elbow to wrist (0.26 long) and the hand past it: a broad palm, thick fingers and claws"""
    ob = hanging("brute_fore", [(0.0, .062, .064, 0), (0.06, .072, .075, 0), (0.15, .06, .06, 0), (0.24, .048, .05, 0), (0.28, .052, .05, 0.01), (0.33, .075, .045, 0.03, 2.5), (0.39, .078, .04, 0.045, 2.6),
                                  (0.43, .07, .036, 0.055, 2.6)], sub=2)
    displace(ob, [(0.0, -0.1, -0.03, 0.06, 0.1, 0.06, 0.008)])
    claws = []
    for i, x in enumerate((-0.05, -0.017, 0.017, 0.05)):
        claws.append(claw((x, -0.4, 0.055), (x * 1.1, -0.5, 0.1), 0.014))
    return join_all(ob, claws, "brute_fore")

def brute_leg():
    """knee to ankle (0.23 long), then a broad foot pointing forward with three claws: the thigh is quad_thigh"""
    ob = hanging("brute_leg", [(0.0, .06, .065, 0), (0.08, .052, .056, -0.004), (0.18, .046, .05, 0), (0.23, .056, .06, 0.006)], sub=2)
    f = Part("foot")
    fy = -0.255
    fs = [(-0.05, .04, .04, 0), (0.0, .06, .035, 0), (0.08, .072, .03, 0.0), (0.15, .07, .026, -0.002), (0.19, .06, .02, -0.004)]
    sec = [(P(0, fy + cy, z), X, Y, hw, hh, 2.4) for (z, hw, hh, cy) in fs]
    sec, reg = dense(sec, [0] * len(sec), 3)
    sec, reg = rounded(sec, reg, 0.02, 3)
    f.loft(sec, ARND, reg)
    fo = f.object()
    subdivide(fo, 1)
    fo.data.attributes.new("_MARK", "FLOAT", "POINT")
    claws = [claw((x, -0.28, 0.2), (x * 1.2, -0.285, 0.26), 0.014) for x in (-0.04, 0.0, 0.04)]
    return join_all(ob, [fo] + claws, "brute_leg")

# ---- Runners: a bird's leg in three bones ----------------------------------------------------------------------------------------------------

def bird_bone():
    ob = hanging("bird_bone", [(0.0, .04, .042, 0), (0.04, .046, .048, 0), (0.1, .032, .034, 0), (0.2, .027, .028, 0)], tip=0.03, sub=1)
    return ob

def bird_foot():
    """the hock down to the ankle (0.12 long), then three toes forward and one back, each ending in a claw"""
    ob = hanging("bird_foot", [(0.0, .03, .03, 0), (0.06, .024, .026, 0), (0.12, .03, .032, 0.004)], sub=1)
    toes = []
    for ang in (-0.35, 0.0, 0.35):
        t = Part("toe")
        dx, dz = math.sin(ang), math.cos(ang)
        sec = [(P(dx * d, -0.14 + (0.0 if d < 0.05 else -0.012 * (d - 0.05) / 0.1), 0.01 + dz * d), X, Y, 0.012 * (1 - 0.4 * d / 0.12), 0.011, 2.0) for d in (0.0, 0.04, 0.08, 0.12)]
        sec, reg = rounded(sec, [0] * len(sec), 0.012, 2)
        t.loft(sec, 6, reg)
        o = t.object()
        o.data.attributes.new("_MARK", "FLOAT", "POINT")
        toes.append(o)
        toes.append(claw((dx * 0.14, -0.152, 0.01 + dz * 0.14), (dx * 0.17, -0.158, 0.01 + dz * 0.17), 0.008, 4))
    toes.append(claw((0.0, -0.14, 0.0), (0.0, -0.15, -0.05), 0.01, 4))
    return join_all(ob, toes, "bird_foot")

# ---- Serpents' heads (made for a body 0.16 thick: the code scales them by its thickness over 0.16) ---------------------------------------------

def serpent_dragon():
    ob = head_loft("serpent_dragon", [(-0.12, .06, .05, 0.02, 2), (-0.08, .13, .1, 0.02), (0.0, .16, .115, 0.02), (0.1, .14, .1, 0.0), (0.2, .11, .075, -0.02, 2.4),
                                      (0.3, .09, .06, -0.03, 2.5), (0.38, .08, .05, -0.035, 2.6)], tip=0.02)
    displace(ob, [
        (0.1, 0.1, 0.1, 0.05, 0.03, 0.04, 0.02),               # the heavy brow
        (0.0, 0.07, 0.3, 0.03, 0.02, 0.1, 0.01),               # the ridge down the snout
        (0.04, 0.0, 0.37, 0.01, 0.01, 0.014, -0.005),
        (0.0, -0.06, 0.2, 0.12, 0.004, 0.16, -0.005),          # the line of the jaw
    ], marks=[eyelids(0.09, 0.08, 0.14, 0.04, 0.7), (0.04, 0.0, 0.37, 0.015, 0.012, 0.014, 0.95), mouth(-0.058, 0.0, 0.36, 0.12, 0.9), (0.0, -0.1, 0.2, 0.12, 0.05, 0.2, -0.4)])
    tag(ob, eyes=[0.09, 0.08, 0.16, 0.024])
    return ob

def serpent_maw():
    """a round mouth: a thick lip and a pit going in"""
    p = Part("serpent_maw")
    rows = [(-0.12, .1, 0.0), (-0.06, .19, 0.0), (0.03, .22, 0.0), (0.09, .19, 0.0), (0.09, .15, 0.0), (0.03, .12, 0.0), (-0.03, .07, 0.0), (-0.05, .02, 0.0)]
    sec = [(P(0, 0, z), X, Y, r, r, 2.0) for (z, r, _) in rows]
    sec, reg = dense(sec, [0] * len(sec), 3)
    p.loft(sec, ARND + 4, reg)
    ob = p.object()
    subdivide(ob, 2 if HI else 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    displace(ob, [(0.0, 0.0, 0.09, 0.2, 0.2, 0.01, 0.006)], marks=[(0.0, 0.0, 0.0, 0.1, 0.1, 0.06, 0.8), (0.0, 0.0, 0.1, 0.17, 0.17, 0.01, -0.25)])
    return ob

def serpent_fish():
    ob = head_loft("serpent_fish", [(-0.2, .04, .05, 0, 2), (-0.16, .12, .14, 0), (-0.05, .17, .18, 0), (0.06, .16, .17, -0.01), (0.15, .12, .12, -0.03), (0.23, .08, .08, -0.04), (0.27, .06, .06, -0.045)], tip=0.02)
    displace(ob, [(0.1, 0.07, 0.14, 0.04, 0.03, 0.04, 0.012), (0.0, -0.07, 0.2, 0.09, 0.004, 0.1, -0.005), (0.0, -0.12, 0.12, 0.08, 0.03, 0.08, 0.008)],
             marks=[eyelids(0.1, 0.06, 0.13, 0.036, 0.6), mouth(-0.07, 0.05, 0.26, 0.1, 0.9), (0.0, -0.12, 0.1, 0.14, 0.06, 0.2, -0.4)])
    tag(ob, eyes=[0.1, 0.06, 0.14, 0.03])
    return ob

def serpent_snake():
    ob = head_loft("serpent_snake", [(-0.06, .03, .03, 0, 2), (-0.03, .07, .05, 0), (0.03, .085, .055, 0), (0.09, .06, .045, -0.005), (0.15, .04, .033, -0.01), (0.19, .03, .026, -0.012)], tip=0.012)
    displace(ob, [(0.06, 0.03, 0.08, 0.025, 0.02, 0.03, 0.007), (0.0, -0.024, 0.1, 0.07, 0.003, 0.1, -0.003)],
             marks=[eyelids(0.055, 0.032, 0.1, 0.02, 0.6), mouth(-0.024, 0.0, 0.19, 0.07, 0.9), (0.0, -0.04, 0.1, 0.1, 0.03, 0.2, -0.4)])
    tag(ob, eyes=[0.052, 0.034, 0.105, 0.017])
    return ob

# ---- A hutt ----------------------------------------------------------------------------------------------------------------------------------

def path_loft(name, pts, around=None):
    """a body along a path: pts (x, y, z, half width, half height), the height axis turned with the path"""
    p = Part(name)
    secs = []
    n = len(pts)
    for i, (x, y, z, hw, hh) in enumerate(pts):
        a = Vector(pts[min(i + 1, n - 1)][:3]) - Vector(pts[max(i - 1, 0)][:3])
        a.normalize()
        v = Vector((1, 0, 0)).cross(a).normalized()
        secs.append((P(x, y, z), X, P(*v), hw, hh, 2.2))
    sec, reg = dense(secs, [0] * n, 3)
    p.loft(sec, around or ARND + 4, reg)
    ob = p.object()
    subdivide(ob, 2 if HI else 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def hutt():
    ob = path_loft("hutt", [(0.42, 0.04, -1.08, .025, .025), (0.30, 0.05, -0.98, .07, .06), (0.16, 0.07, -0.84, .14, .11), (0.05, 0.12, -0.6, .28, .2), (0.0, 0.22, -0.35, .45, .32),
                            (0.0, 0.3, -0.08, .5, .36), (0.0, 0.5, 0.0, .44, .4), (0.0, 0.72, 0.04, .32, .3), (0.0, 0.84, 0.07, .37, .31), (0.0, 0.94, 0.1, .36, .25), (0.0, 1.01, 0.1, .26, .15), (0.0, 1.06, 0.1, .1, .06)])
    folds = [(0.0, y, 0.0, 10.0, 0.02, 10.0, 0.012) for y in (0.3, 0.42, 0.54, 0.66)]
    displace(ob, folds + [
        (0.1, 0.99, 0.3, 0.06, 0.03, 0.05, 0.03),             # the brow
        (0.0, 0.9, 0.34, 0.16, 0.05, 0.06, 0.016),             # the upper lip
        (0.0, 0.8, 0.34, 0.14, 0.05, 0.08, 0.014),               # the jowls
        (0.1, 0.9, 0.35, 0.07, 0.04, 0.05, 0.012),
        (0.03, 0.935, 0.36, 0.012, 0.012, 0.012, -0.008),       # the nostrils
        (0.0, 0.84, 0.37, 0.2, 0.01, 0.06, -0.02),           # the mouth
        (0.33, 0.55, 0.12, 0.1, 0.14, 0.1, 0.02),              # the shoulders the arms hang from
    ], marks=[mouth(0.84, 0.25, 0.42, 0.2, 1.0), eyelids(0.1, 0.98, 0.3, 0.04, 0.8), (0.03, 0.935, 0.36, 0.02, 0.02, 0.02, 0.9),
              (0.0, 0.4, 0.3, 0.3, 0.3, 0.2, -0.4), (0.0, 0.06, 0.0, 0.3, 0.05, 1.0, -0.3)])
    tag(ob, eyes=[0.1, 0.98, 0.3, 0.028])
    return ob

def finger(x, y0, length, r, curl=0.5, lean=0.0):
    """a stubby finger hanging from the palm at (x, -y0), curling forward (+z) over three joints"""
    p = Part("finger")
    sec = []
    for k in (0.0, 0.3, 0.65, 1.0):
        d = length * k
        sec.append((P(x + lean * d, -(y0 + d), 0.004 + curl * d * d / length), X, Z, r * (1.0 - 0.3 * k), r * (1.0 - 0.3 * k), 2.0))
    sec, reg = rounded(sec, [0] * len(sec), r * 0.9, 2)
    p.loft(sec, 6, reg)
    ob = p.object()
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    return ob

def hutt_upper():
    """a hutt's arm from the shoulder to the elbow (0.2 long): short and thick, the shoulder's mass above and the elbow's ball past it"""
    ob = hanging("hutt_upper", [(-0.04, .075, .08, 0), (0.0, .092, .095, 0), (0.06, .092, .095, 0), (0.14, .075, .078, 0), (0.2, .062, .064, 0)], tip=0.05, sub=2)
    displace(ob, [(0.0, -0.17, 0.02, 0.06, 0.05, 0.06, 0.008)])
    return ob

def hutt_fore():
    """elbow to wrist (0.2 long) and the hand past it: a broad palm, four stubby fingers curled forward and a thumb"""
    ob = hanging("hutt_fore", [(0.0, .06, .062, 0), (0.07, .066, .068, 0), (0.15, .052, .054, 0), (0.2, .046, .048, 0), (0.24, .07, .036, 0.004, 2.4), (0.29, .078, .032, 0.01, 2.5),
                               (0.33, .072, .03, 0.014, 2.5)], sub=2)
    fingers = [finger(x, 0.33, 0.1, 0.017, 0.5) for x in (-0.05, -0.017, 0.017, 0.05)]
    thumb = finger(0.075, 0.27, 0.07, 0.02, 0.4, lean=0.5)
    return join_all(ob, fingers + [thumb], "hutt_fore")

# ---- Wings (from the shoulder out along +x, made for a span of 0.9: the code scales them) ---------------------------------------------------------

def wing(name, L, le, te, thick, droop, notches, depth, ribs, rib_amp, wave=0.0):
    """sections along x, each a thin flat ellipse running front to back; the back edge notched (feathers, the membrane between fingers) and ridged"""
    p = Part(name)
    sec = []
    for i in range(9):
        t = i / 8
        zl, zt = le(t), te(t)
        sec.append((P(L * t, -droop * t * t, (zl + zt) / 2), Z, Y, max((zl - zt) / 2, 0.004), thick(t), 2.6))
    sec, reg = dense(sec, [0] * len(sec), 4)
    p.loft(sec, ARND + 6, reg)
    ob = p.object()
    subdivide(ob, 2 if HI else 1)
    ob.data.attributes.new("_MARK", "FLOAT", "POINT")
    me = ob.data
    mark = me.attributes["_MARK"].data
    out = []
    for v in me.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        t = max(0.0, min(1.0, x / L))
        zl, zt = le(t), te(t)
        half = max((zl - zt) / 2, 0.004)
        s = ((zl + zt) / 2 - z) / half          # -1 the front edge, 1 the back edge
        w = smooth(0.0, 1.0, s)
        notch = depth * (0.5 - 0.5 * math.cos(2 * math.pi * notches * t)) * w ** 1.5
        z += notch
        y += rib_amp * math.cos(2 * math.pi * ribs * t) * (0.4 + 0.6 * w) + wave * math.sin(2 * math.pi * 1.3 * t) * smooth(0.0, 0.5, t)
        mark[v.index].value = max(-1.0, min(1.0, 0.5 * (0.5 + 0.5 * math.cos(2 * math.pi * ribs * t)) * (0.3 + w) - 0.1 + 0.6 * (1 - smooth(0.0, 0.12, t))))
        out.append(P(x, y, z))
    for v, co in zip(me.vertices, out):
        v.co = co
    return ob

# ---- Bugs and spiders: a ringed thorax and abdomen, a head, and legs in two jointed pieces -------------------------------------------------------

def bug_thorax():
    ob = head_loft("bug_thorax", [(-0.22, .04, .03, 0, 2), (-0.18, .12, .10, 0), (-0.08, .16, .13, .01), (0.05, .15, .12, .01), (0.15, .11, .09, 0), (0.21, .05, .04, 0)], tip=0.01)
    bands = [(0.0, 0.0, z, 10.0, 10.0, 0.012, -0.005) for z in (-0.1, 0.0, 0.1)]
    displace(ob, bands + [(0.0, 0.12, 0.0, 0.03, 0.03, 0.3, 0.012)], marks=[(0.0, 0.0, z, 10.0, 10.0, 0.012, 0.35) for z in (-0.1, 0.0, 0.1)] + [(0.0, -0.1, 0.0, 0.2, 0.06, 0.3, -0.3)])
    return ob

def bug_abdomen():
    ob = head_loft("bug_abdomen", [(-0.28, .05, .05, 0, 2), (-0.22, .16, .15, 0), (-0.1, .2, .18, .01), (0.05, .19, .17, .005), (0.17, .12, .11, 0), (0.26, .05, .05, 0)], tip=0.01)
    zs = [-0.2 + i * 0.06 for i in range(8)]
    displace(ob, [(0.0, 0.0, z, 10.0, 10.0, 0.012, -0.007) for z in zs], marks=[(0.0, 0.0, z, 10.0, 10.0, 0.012, 0.4) for z in zs] + [(0.0, -0.15, 0.0, 0.25, 0.08, 0.35, -0.3)])
    return ob

def bug_head():
    ob = head_loft("bug_head", [(-0.06, .03, .03, 0, 2), (-0.03, .075, .065, 0), (0.03, .08, .07, 0), (0.07, .05, .045, -.005), (0.09, .025, .02, -.01)], tip=0.012)
    displace(ob, [(0.04, 0.03, 0.04, 0.025, 0.02, 0.03, 0.01)], marks=[(0.0, -0.02, 0.09, 0.03, 0.02, 0.02, 0.6)])
    return ob

def bug_leg_a():
    """the upper joint of an insect's leg, hip to knee (0.25 long), the knee a ball"""
    ob = hanging("bug_leg_a", [(0.0, .022, .022, 0), (0.1, .024, .024, 0), (0.2, .019, .019, 0), (0.25, .022, .022, 0)], tip=0.02, sub=1)
    displace(ob, [(0.0, -0.12, 0.0, 0.03, 0.02, 0.03, 0.004)])
    return ob

def bug_leg_b():
    """the lower joint, knee to foot (0.35 long), fine, with a few spines and a hooked tip"""
    ob = hanging("bug_leg_b", [(0.0, .019, .019, 0), (0.1, .016, .016, 0), (0.25, .011, .011, 0), (0.33, .006, .006, 0.003), (0.35, .002, .002, 0.01)], sub=1)
    displace(ob, [(0.0, -z, 0.0, 0.03, 0.015, 0.03, 0.004) for z in (0.1, 0.18, 0.26)], marks=[(0.0, -0.3, 0.0, 0.05, 0.05, 0.05, 0.4)])
    return ob

# What share of a dense part is kept (the rest by name: heads 0.15, ears and the barrel 0.12, limbs 0.45)
RATIO = {"hutt": 0.1, "hutt_upper": 0.12, "hutt_fore": 0.2,"brute_torso": 0.15, "wing_bird": 0.07, "wing_bat": 0.07, "wing_manta": 0.07, "serpent_maw": 0.12, "serpent_dragon": 0.15, "serpent_fish": 0.15, "serpent_snake": 0.15,
         "brute_upper": 0.1, "brute_fore": 0.12, "brute_leg": 0.12, "quad_thigh": 0.3, "bug_thorax": 0.15, "bug_abdomen": 0.15, "bug_head": 0.15, "bug_leg_a": 0.3, "bug_leg_b": 0.3, "bird_bone": 0.3, "bird_foot": 0.3}

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    heads = [cat(), dog(), long_head(), blunt(), reptile(), rhino(), boar(), rancor(), wampa(), ape(), horned(), bird(), tauntaun(), lizard()]
    extras = [rancor_jaw(), beak(), quad_body(), quad_thigh(), quad_shin("hoof"), quad_shin("paw"), quad_shin("foot"), brute_torso(), brute_upper(), brute_fore(), brute_leg(), bird_bone(), bird_foot(),
              serpent_dragon(), serpent_maw(), serpent_fish(), serpent_snake(), hutt(), hutt_upper(), hutt_fore(),
              wing("wing_bird", .5, lambda t: .09 - .07 * t * t, lambda t: -.12 + .06 * t, lambda t: .012 - .006 * t, .06, 7, .04, 14, .004),
              wing("wing_bat", .5, lambda t: .08 - .05 * t ** 1.5, lambda t: -.16 + .14 * t, lambda t: .008 - .003 * t, .04, 3, .09, 3, .012),
              bug_thorax(), bug_abdomen(), bug_head(), bug_leg_a(), bug_leg_b(),
              wing("wing_manta", .5, lambda t: .12 - .1 * t, lambda t: -.25 + .2 * t, lambda t: .035 - .028 * t, 0.0, 0, 0.0, 0, 0.0, .03)]
    ears = [ear("ear_cat", 0.10, 0.042, 0.016, hollow=0.007), ear("ear_dog", 0.12, 0.044, 0.018, lean=0.02, hollow=0.006), ear("ear_long", 0.17, 0.032, 0.014, hollow=0.005),
            ear("ear_round", 0.10, 0.05, 0.012, round_tip=True, hollow=0.006)]
    big = {o.name for o in heads}
    parts = heads + extras + ears
    for ob in parts:
        budget(ob, RATIO.get(ob.name, 0.15 if ob.name in big or ob.name in ("rancor_jaw", "beak") else 0.12 if ob.name.startswith("ear") or ob.name == "quad_body" else 0.45))
    # the eyes sit on the skull: each is moved along z to where the surface is (a ray from in front), set in a little (0.3 of its radius)
    for ob in parts:
        if "eyes" not in ob.keys():
            continue
        tree = bvhtree.BVHTree.FromPolygons([v.co.copy() for v in ob.data.vertices], [tuple(p.vertices) for p in ob.data.polygons])
        x, y, z, r = list(ob["eyes"])
        loc, nor, idx, dist = tree.ray_cast(P(abs(x), y, 2.0), P(0, 0, -1))
        if loc is not None:
            ob["eyes"] = [x, y, -loc.y - 0.3 * r, r]
    for ob in parts:
        ao = occlusion([(ob, Matrix.Identity(4))], 40 if HI else 20)
        a = ob.data.attributes.new("_AO", "FLOAT", "POINT")
        for i, val in enumerate(next(iter(ao.values()))):
            a.data[i].value = val
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in parts:
        ob.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "creature.glb" if HI else "creature.lo.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_attributes=True, export_extras=True, export_normals=True, export_materials="NONE", export_yup=True, export_apply=False)
    print("CREATURE", path, {ob.name: len(ob.data.polygons) for ob in parts})

main()
