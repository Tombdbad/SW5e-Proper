# Reference pictures of the species, for the heads (2026-11-05; the user: "web search for images of star wars humanoid species (including but NOT
# limited to: droids, Mandalorians, Zabrak, Besalisk, Toidarian, storm troopers, Mon Calamari) ... a mood board for our FULL variety of different
# character species" - inspiration only, then "use these images as inspiration to update the head meshes and textures, normal maps").
# Run on the user's PC, where Python can reach the web: from Mixar's (or Blender's) Python console,
#   p=r"C:\Users\Admin\Desktop\SW5E\SW5e-Proper\tools\refs\species.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})
# (it runs in a thread so that Mixar stays usable; progress in tools/refs/species/species.log) or `python tools/refs/species.py`.
# Every species of shared/data/sw5e/species.json, plus the armour people are known by (Mandalorians, troopers). For each: Wookieepedia's lead image
# (through the starwars.archivum.wiki mirror, its og:image: Fandom refuses scripts) and the Databank's (starwars.com). Saves tools/refs/species/<slug>/ and tools/refs/species/species.json; resumes,
# skipping what it has. Keep it out of git with tools/refs/moodboard: the pictures are Lucasfilm's.
import json, os, re, ssl, sys, threading, time, urllib.parse, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "species")
DATA = os.path.join(HERE, "..", "..", "shared", "data", "sw5e", "species.json")
UA = {"User-Agent": "sw5e-species-refs/1.0 (personal game-design reference)", "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"}

# rules name -> the page's name where it differs (None: no picture to look for)
RENAME = {"Droid, Class I": "Protocol droid", "Droid, Class II": "Astromech droid", "Droid, Class III": "Medical droid", "Droid, Class IV": "Battle droid",
          "Droid, Class V": "Labor droid", "Dowutin, Young": "Dowutin", "Hutt, Adolescent": "Hutt", "Half-human": None, "Tusken": "Tusken", "Flesh Raider": "Flesh Raider"}
# Databank slugs that are not the name's
DATABANK = {"Twi'lek": "twi-lek", "Mon Calamari": "mon-calamari", "Kel Dor": "kel-dor", "Protocol droid": "c-3po", "Astromech droid": "r2-d2",
            "Battle droid": "battle-droid", "Medical droid": "2-1b-droid", "Hutt": "jabba-the-hutt", "Tusken": "tusken-raiders", "Sith Pureblood": "sith-species"}
EXTRA = ["Mandalorian", "Stormtrooper", "Clone trooper", "Death trooper", "Scout trooper", "Snowtrooper", "Super battle droid", "Droideka", "Imperial probe droid", "Gonk droid"]

def get(url, binary=False):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == 3:
                raise
            time.sleep(3 + 5 * attempt)

def og(html):
    m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
    return m.group(1).replace("&amp;", "&") if m else None

def fandom(name):
    page = "https://starwars.fandom.com/wiki/" + urllib.parse.quote(name.replace(" ", "_"))
    img = og(get(page))
    if img and "Site-logo" not in img and "wiki.png" not in img:
        # (the full picture, not the scaled one)
        img = re.sub(r"/revision/latest/(scale-to-width-down|smart|thumbnail)[^?]*", "/revision/latest", img)
        return img, page
    return None

ARCH = {}
def archivum_page(name):
    """the pictures of the Archivum's copy of the Wookieepedia article (no og:image there: the images are plain links to Wookieepedia's image server)"""
    if name not in ARCH:
        page = "https://starwars.archivum.wiki/article/" + urllib.parse.quote(name.replace(" ", "_"))
        html = get(page)
        urls = []
        for m in re.finditer(r'(https://static\.wikia\.nocookie\.net/starwars/images/[0-9a-f]/[0-9a-f]{2}/[^"\'\s?<>/]+\.(?:png|jpe?g|webp))', html, re.I):
            u = m.group(1)
            if u not in urls and not re.search(r"logo|icon|symbol|map|skeleton|galaxy", u, re.I):
                urls.append(u)
        ARCH[name] = (urls, page)
    return ARCH[name]

def archivum_n(k):
    def fn(name):
        urls, page = archivum_page(name)
        return (urls[k], page) if len(urls) > k else None
    return fn

def databank(name):
    slug = DATABANK.get(name) or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    page = "https://www.starwars.com/databank/" + slug
    img = og(get(page))
    return (img, page) if img and "default" not in img.lower() else None

def slug_of(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

LOG = None
def log(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    if LOG:
        LOG.write(s + "\n")
        LOG.flush()

def main():
    global LOG
    os.makedirs(OUT, exist_ok=True)
    LOG = open(os.path.join(OUT, "species.log"), "a", encoding="utf-8")
    with open(DATA, encoding="utf-8") as fh:
        rows = json.load(fh)
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    people = []
    for r in rows:
        page = RENAME.get(r["name"], r["name"])
        if page:
            people.append((r["name"], page, (r.get("distinctions") or "")[:300]))
    people += [(n, n, "armour / machine") for n in EXTRA]
    index_path = os.path.join(OUT, "species.json")
    try:
        with open(index_path, encoding="utf-8") as fh:
            kept = [b for b in json.load(fh)["images"] if os.path.exists(os.path.join(OUT, b["file"]))]
    except Exception:
        kept = []
    have = {(b["species"], b["kind"]) for b in kept}
    board, failed = list(kept), []
    for name, page, note in people:
        sl = slug_of(name)
        os.makedirs(os.path.join(OUT, sl), exist_ok=True)
        seen = {b["image"] for b in board if b["species"] == name}
        for kind, fn in (("archivum1", archivum_n(0)), ("archivum2", archivum_n(1)), ("archivum3", archivum_n(2)), ("databank", databank)):
            if (name, kind) in have:
                continue
            try:
                hit = fn(page)
                if not hit or hit[0] in seen:
                    failed.append(f"{name}: {kind}: no image")
                    continue
                url, src = hit
                ext = os.path.splitext(urllib.parse.urlparse(url.split("/revision/")[0]).path)[1].lower()
                ext = ext if ext in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"
                fname = f"{kind}{ext}"
                with open(os.path.join(OUT, sl, fname), "wb") as fh:
                    fh.write(get(url, True))
                seen.add(url)
                board.append({"species": name, "slug": sl, "file": f"{sl}/{fname}", "kind": kind, "source": src, "image": url, "note": note})
                log("ok", name, kind)
                time.sleep(0.4)
            except Exception as e:
                failed.append(f"{name}: {kind}: {type(e).__name__} {e}"[:200])
                log("fail", name, kind, e)
        with open(index_path, "w", encoding="utf-8") as fh:
            json.dump({"images": board, "failed": failed}, fh, indent=1)
    log("SPECIES", len(board), "saved,", len(failed), "failed")
    LOG.close()

if __name__ == "__main__":
    if "bpy" in sys.modules:
        threading.Thread(target=main, daemon=True).start()
        print("species.py: fetching in the background; see tools/refs/species/species.log")
    else:
        main()
