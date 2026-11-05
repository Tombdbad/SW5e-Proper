# The species heads' texture set (2026-11-05): client/public/textures/figure/species/{diffuse,normal}.jpg, 2048 x 2048, the atlas
# tools/blender/build-species.py lays out (a 512 cell a head: its CELLS, written to shared/art/speciesHeads.json). Made from what that script bakes
# into tools/refs/cache/species/ (species_<key>_{normal,ao,color}.png, from a live run in Mixar or a headless run with --maps):
#   python tools/build-species-textures.py [<maps-dir>]          (needs numpy and Pillow)
# normal: the baked tangent-space normals of the high head; diffuse: a PALE map (the vertex colour, the skin, multiplies it): the baked colour
# (mottling, the grooves between scales, darker lips, a paler throat) times the baked occlusion, mean about 0.88 like the other sets.
# A cell's v counts up from the bottom of the atlas (Blender's), so its rows in the picture start at (1 - v0 - dv) from the top.
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MAPS = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "refs", "cache", "species")
OUT = os.path.join(ROOT, "client", "public", "textures", "figure", "species")
A = 2048
heads = json.load(open(os.path.join(ROOT, "shared", "art", "speciesHeads.json")))
nor = np.zeros((A, A, 3), np.float32)
nor[:] = (128, 128, 255)
dif = np.full((A, A, 3), 230, np.float32)
for key, h in heads.items():
    u0, v0, du, dv = h["cell"]
    x0, y0, n = int(u0 * A), int((1 - v0 - dv) * A), int(du * A)
    N = np.asarray(Image.open(os.path.join(MAPS, f"species_{key}_normal.png")).convert("RGB").resize((n, n)), np.float32)
    C = np.asarray(Image.open(os.path.join(MAPS, f"species_{key}_color.png")).convert("L").resize((n, n)), np.float32) / 255
    AO = np.asarray(Image.open(os.path.join(MAPS, f"species_{key}_ao.png")).convert("L").resize((n, n)), np.float32) / 255
    nor[y0:y0 + n, x0:x0 + n] = N
    dif[y0:y0 + n, x0:x0 + n] = (np.clip(C * (0.35 + 0.65 * AO), 0, 1) * 255)[..., None]
os.makedirs(OUT, exist_ok=True)
Image.fromarray(nor.astype(np.uint8)).save(os.path.join(OUT, "normal.jpg"), quality=88)
Image.fromarray(dif.astype(np.uint8)).save(os.path.join(OUT, "diffuse.jpg"), quality=88)
print("species textures", OUT)
