# The terrain kit (2026-11-11; the user: "Blender-made kit pieces, including overhangs and ledges snapped to steep cells, cave mouths, scree and farm pieces").
# A height field cannot hold an overhang, a cave mouth or a scattering of loose rock; these pieces stand on it where its slope says they can
# (shared/logic/terrain.ts `kitRules`, drawn by client/src/components/Map/terrain.tsx `TerrainKit`). Original shapes, CC0.
#   blender --background --python tools/blender/build-terrain-kit.py -- <out-dir> [--preview <png>]
# writes <out-dir>/terrain-kit.glb. Meshes (the code's axes: y up, +z the front, the way a piece faces; every origin is on the ground at the middle of its
# back, so a piece is stood on a point of the land and turned to face downhill):
#   boulder_a/b/c   a rock 1.6-2.4 m across, its bottom flat and meant to be sunk a third into the ground
#   scree           eleven small rocks in a 3 m disc: the loose rock under a cliff
#   ledge_a/b       an overhang: a slab that comes out of a steep slope 3.2 m and hangs over what is under it (its back is buried in the slope)
#   mouth           a cave mouth: a tunnel 3 m wide and 3 m high, 3 m deep, dark inside, framed by a rough arch of rock; stood in a cliff face
# Each vertex has a colour (rock, by noise) times its ambient occlusion (rays against the piece itself); a piece is under 700 triangles.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise, bvhtree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shape import P

def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
PREVIEW = arg("--preview")

def fbm(p, octaves=3, seed=0.0):
    t, amp, f = 0.0, 1.0, 1.0
    for _ in range(octaves):
        t += amp * noise.noise(Vector((p[0] * f + seed, p[1] * f, p[2] * f - seed)))
        amp *= 0.5
        f *= 2.1
    return t

class Piece:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()

    def finish(self, tone, dark_from=None):
        """smooth, make the object, colour: the rock's tone by noise times the ambient occlusion"""
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.update()
        verts = [v.co.copy() for v in me.vertices]
        tree = bvhtree.BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons])
        rnd = random.Random(11)
        dirs = []
        while len(dirs) < 28:
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.01 < d.length_squared <= 1:
                dirs.append(d.normalized())
        col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        data = []
        for v in me.vertices:
            n = v.normal
            hit = tot = 0
            for d in dirs:
                if d.dot(n) < 0:
                    d = -d
                if d.dot(n) < 0.1:
                    continue
                tot += 1
                loc, nor, idx, dist = tree.ray_cast(v.co + n * 0.01, d, 1.6)
                if loc is not None and dist > 0.02:
                    hit += 1 - dist / 1.6
            ao = 1.0 - 0.75 * (hit / tot if tot else 0)
            k = 0.78 + 0.34 * fbm(v.co * 0.9, 3, 5.0)
            strata = 0.93 + 0.07 * math.sin(v.co.z * 11.0)
            c = [t * k * strata * ao for t in tone]
            if dark_from is not None and dark_from(v.co):
                c = [x * 0.07 for x in c]
            data.extend([c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1.0])
        col.data.foreach_set("color", data)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob

def rock(bm, centre, radius, squash, seed, subdiv=2, rough=0.3):
    """a noisy ico-sphere added to bm at `centre` (Blender axes), squashed in z"""
    g = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in g["verts"]:
        d = v.co.normalized()
        r = radius * (1.0 + rough * fbm(d * 1.4, 3, seed))
        v.co = Vector((d.x * r, d.y * r * 0.9, d.z * r * squash)) + centre
        # strata: faint shelves
        v.co.z += 0.02 * radius * math.sin(v.co.z * 13.0 / max(radius, 0.1))
    return g["verts"]

def boulder(name, seed, size, squash):
    p = Piece(name)
    verts = rock(p.bm, Vector((0, 0, 0)), size, squash, seed, 3, 0.28)
    low = -0.32 * size * squash
    for v in verts:
        if v.co.z < low:
            v.co.z = low + (v.co.z - low) * 0.12  # the flat bottom
    lift = -min(v.co.z for v in verts)
    for v in verts:
        v.co.z += lift
    # origin: the middle of the bottom, so a boulder is sunk by moving it down
    return p.finish((0.46, 0.43, 0.39))

def scree():
    p = Piece("scree")
    rnd = random.Random(3)
    for k in range(11):
        a = rnd.uniform(0, math.tau)
        r = 1.5 * math.sqrt(rnd.random())
        s = rnd.uniform(0.18, 0.46)
        rock(p.bm, Vector((r * math.cos(a), r * math.sin(a), s * 0.25)), s, rnd.uniform(0.45, 0.8), 20 + k, 1, 0.35)
    for v in p.bm.verts:
        v.co.z = max(v.co.z, 0.0) * 1.0
    return p.finish((0.5, 0.46, 0.41))

def slab(name, seed, wide, thick, out):
    """an overhang: a block that comes out of the slope (the code's +z, Blender's -y) `out` metres and hangs over what is under it; its back is in the slope"""
    p = Piece(name)
    bm = p.bm
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z  # -0.5 .. 0.5
        front = -y + 0.5  # 0 at the back, 1 at the front
        v.co.x = x * wide * (1.0 - 0.18 * front)
        v.co.y = (y - 0.5) * out  # the back at 0, the front at -out
        v.co.z = z * thick
        # the underside climbs toward the back, the top falls away toward the front: a lip that hangs
        if z < 0:
            v.co.z -= 0.25 * thick * front
        else:
            v.co.z -= 0.45 * thick * front * front
        n = fbm(Vector((v.co.x * 0.6, v.co.y * 0.6, v.co.z * 0.8)), 3, seed)
        v.co += Vector((n * 0.22, n * 0.2, n * 0.18))
    # the slab hangs 1.2 m over the ground at its back
    for v in bm.verts:
        v.co.z += thick * 0.5 + 1.2
    return p.finish((0.5, 0.45, 0.4))

def mouth():
    p = Piece("mouth")
    bm = p.bm
    rnd = random.Random(9)
    # the frame: rough blocks along an arch (outer radius 2.4, the opening 1.5 radius), and a lintel course above
    N = 8
    for k in range(N):
        a = math.pi * (k + 0.5) / N
        r = 1.5 + 0.55
        cx, cz = r * math.cos(a), r * math.sin(a) + 1.5
        rock(bm, Vector((cx, -0.4, cz)), rnd.uniform(0.78, 0.95), rnd.uniform(0.9, 1.1), 40 + k, 2, 0.25)
    # the jambs: two stacks of blocks either side
    for side in (-1, 1):
        for j in range(2):
            rock(bm, Vector((side * 2.05, -0.3, 0.55 + j * 0.8)), rnd.uniform(0.78, 0.92), 0.95, 60 + j + (side + 1) * 3, 2, 0.25)
    # the rock above and beside, a rough mass that the frame is set in (the cliff the mouth is in comes behind it)
    for k in range(4):
        a = math.pi * (k + 0.6) / 5
        r = 2.55 + 0.3 * rnd.random()
        rock(bm, Vector((r * math.cos(a), -0.9, r * math.sin(a) + 1.5)), rnd.uniform(1.0, 1.25), 1.0, 80 + k, 2, 0.3)
    # the tunnel: a half cylinder of radius 1.5 from the opening inward (-y of Blender is the front; it runs to +y, deep into the cliff), its inside facing in
    tun = bmesh.ops.create_cone(bm, cap_ends=False, segments=14, radius1=1.5, radius2=1.4, depth=3.2, matrix=Matrix.Rotation(math.pi / 2, 4, "X"))
    for v in tun["verts"]:
        v.co += Vector((0, 1.6, 1.5))
        n = fbm(Vector((v.co.x, v.co.y, v.co.z)) * 0.8, 2, 2.0)
        v.co.x *= 1.0 + 0.06 * n
        if v.co.z < 0.0:
            v.co.z = 0.0
    # (the floor of the opening: a flat slab so that nothing shows below)
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=1.5, matrix=Matrix.Translation((0, 1.0, 0.02)))
    ob = p.finish((0.5, 0.45, 0.4), dark_from=lambda co: co.y > 0.55 and abs(co.x) < 1.55 and co.z < 3.2)
    return ob

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = [boulder("boulder_a", 1.0, 1.0, 0.72), boulder("boulder_b", 6.0, 0.8, 0.9), boulder("boulder_c", 11.0, 1.15, 0.6), scree(), slab("ledge_a", 2.0, 4.0, 1.1, 3.2), slab("ledge_b", 9.0, 3.2, 1.4, 2.6), mouth()]
    for ob in kit:
        print(ob.name, len(ob.data.polygons), "faces", tuple(round(d, 2) for d in ob.dimensions))
        assert len(ob.data.polygons) <= (1500 if ob.name == "mouth" else 700), ob.name
    # a line-up: x spread 7 m
    for i, ob in enumerate(kit):
        ob.location = Vector((i * 7.0, 0, 0))
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    # the glb has the pieces at the origin: undo the line-up for the export
    for ob in kit:
        ob.location = Vector((0, 0, 0))
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "terrain-kit.glb"), export_format="GLB", use_selection=True, export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True, export_materials="NONE", export_apply=True)
    print("wrote", os.path.join(OUT, "terrain-kit.glb"))
    if PREVIEW:
        for i, ob in enumerate(kit):
            ob.location = Vector((i * 7.0, 0, 0))
        sc = bpy.context.scene
        mat = bpy.data.materials.new("rock")
        nt = mat.node_tree
        attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "Col"
        nt.links.new(attr.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
        nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
        for ob in kit:
            ob.data.materials.append(mat)
        ground = bpy.data.objects.new("ground", bpy.data.meshes.new("ground"))
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=60); bm.to_mesh(ground.data); bm.free()
        ground.location = Vector((21, 0, -0.02)); sc.collection.objects.link(ground)
        gm = bpy.data.materials.new("g"); gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.28, 0.18, 1); ground.data.materials.append(gm)
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(55), 0, math.radians(35)); sc.collection.objects.link(sun)
        sc.world = bpy.data.worlds.new("w"); sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.65, 0.8, 1)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 30
        cam.location = Vector((21, -34, 8)); cam.rotation_euler = (math.radians(76), 0, 0); sc.collection.objects.link(cam); sc.camera = cam
        sc.render.engine = "CYCLES"; sc.cycles.samples = 32; sc.cycles.device = "CPU"
        sc.render.resolution_x, sc.render.resolution_y = 1400, 520
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        print("preview", PREVIEW)

main()
