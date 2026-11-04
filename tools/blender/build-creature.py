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
from mathutils import Vector, Matrix
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

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    heads = [cat(), dog(), long_head(), blunt(), reptile(), rhino(), boar(), rancor(), wampa(), ape(), horned(), bird(), tauntaun(), lizard()]
    extras = [rancor_jaw(), beak(), quad_body(), quad_thigh(), quad_shin("hoof"), quad_shin("paw"), quad_shin("foot")]
    ears = [ear("ear_cat", 0.10, 0.042, 0.016, hollow=0.007), ear("ear_dog", 0.12, 0.044, 0.018, lean=0.02, hollow=0.006), ear("ear_long", 0.17, 0.032, 0.014, hollow=0.005),
            ear("ear_round", 0.10, 0.05, 0.012, round_tip=True, hollow=0.006)]
    big = {o.name for o in heads}
    parts = heads + extras + ears
    for ob in parts:
        budget(ob, 0.15 if ob.name in big or ob.name in ("rancor_jaw", "beak") else 0.12 if ob.name.startswith("ear") or ob.name == "quad_body" else 0.45)
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
