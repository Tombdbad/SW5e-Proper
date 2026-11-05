# The architecture mood board by planet (2026-11-05; the user: "conduct a web search and capture images to create a mood board (by planet)" - inspiration
# only). Run on the user's PC, where Python can reach the web: from Mixar's (or Blender's) Python console,
#   p=r"C:\Users\Admin\Desktop\SW5E\SW5e-Proper\tools\refs\moodboard.py"; exec(compile(open(p).read(),p,"exec"),{"__file__":p,"__name__":"__main__"})
# or `python tools/refs/moodboard.py`. Saves to tools/refs/moodboard/<planet>/ (gitignore it with tools/refs/cache: the images are Lucasfilm's and their
# photographers', kept for reference) and writes tools/refs/moodboard/moodboard.json: for each image, the planet, the game's family, the source page and a note.
# Sources: the Databank's own still for a place (starwars.com, its og:image), Wikipedia's lead image for a planet or a building, and Wikimedia Commons photographs
# of the real places that were filmed or copied (searched by the Commons API). A source that fails is skipped and listed.
import json, os, re, ssl, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "moodboard")
UA = {"User-Agent": "sw5e-moodboard/1.0 (personal game-design reference; Python urllib)"}

# planet: (family in interiors/architecture.ts, [(kind, what, note)])
PLANETS = {
    "tatooine": ("adobe", [
        ("databank", "mos-eisley-spaceport", "Mos Eisley: low domes over cubes, sunk against the heat"),
        ("databank", "mos-espa-city-hall", "Mos Espa: plaster over frames, buttressed domes"),
        ("databank", "lars-moisture-farm", "Lars homestead: sunken courtyard round an entry dome"),
        ("wiki", "Tatooine", "Tatooine"),
        ("commons", "Ksar Hadada", "Ksar Hadada (Tunisia): stacked vaulted granaries, Mos Espa's slave quarters"),
        ("commons", "Hotel Sidi Driss Matmata", "Matmata troglodyte courtyard: the Lars homestead's pit"),
        ("commons", "Ajim Djerba Star Wars", "Ajim, Djerba: whitewashed domes, Mos Eisley"),
    ]),
    "jedha": ("domed", [
        ("databank", "holy-city-of-jedha", "Jedha City: box-and-dome holy city"),
        ("wiki", "Laleli Mosque", "Laleli Mosque: the dome-on-box mass Jedha draws on"),
        ("commons", "Wadi Rum rock formations", "Wadi Rum: the rock Jedha City was shot in"),
    ]),
    "naboo": ("domed", [
        ("databank", "naboo", "Naboo: Theed's green domes, colonnades and waterfalls"),
        ("databank", "theed-royal-palace", "Theed Royal Palace: domes and minarets on a cliff"),
        ("databank", "otoh-gunga", "Otoh Gunga: bubble city, Art Nouveau metal"),
        ("wiki", "Naboo", "Naboo"),
        ("commons", "Reggia di Caserta", "Caserta Palace: the palace's vaulted halls"),
        ("commons", "Plaza de Espana Sevilla colonnade", "Plaza de Espana, Seville: Theed's colonnades"),
        ("commons", "Villa del Balbianello", "Villa del Balbianello, Lake Como: the lake retreat"),
    ]),
    "coruscant": ("deco", [
        ("databank", "coruscant", "Coruscant: setback towers, endless strata"),
        ("databank", "jedi-temple", "Jedi Temple: ziggurat with spires"),
        ("databank", "coruscant-senate-building", "Senate: a great dome"),
        ("wiki", "Coruscant", "Coruscant"),
        ("commons", "Chrysler Building spire", "Chrysler Building: deco spire and setbacks"),
        ("commons", "Prambanan temple", "Prambanan: the stepped spires of the Emperor's palace"),
    ]),
    "hoth": ("polar", [
        ("databank", "echo-base", "Echo Base: bored ice tunnels, hangar doors in the slope"),
        ("databank", "hoth", "Hoth"),
        ("wiki", "Hoth", "Hoth"),
        ("commons", "Hardangerjokulen Finse", "Finse, Norway: where Hoth was filmed"),
        ("commons", "Halley VI research station", "Halley VI: polar modules on legs"),
    ]),
    "endor-kashyyyk": ("timber", [
        ("databank", "bright-tree-village", "Bright Tree Village: huts and walkways in the trees"),
        ("databank", "kashyyyk", "Kashyyyk: Wookiee tree cities"),
        ("wiki", "Kashyyyk", "Kashyyyk"),
        ("commons", "Redwood National Park tall trees", "Redwoods: Endor's forest"),
        ("commons", "Korowai tree house", "Korowai tree houses: dwellings high in the canopy"),
    ]),
    "kamino": ("hull", [
        ("databank", "kamino", "Kamino: Tipoca City on stilts over the storm sea"),
        ("databank", "tipoca-city", "Tipoca City: smooth pods, landing platforms, gantries"),
        ("wiki", "Kamino", "Kamino"),
        ("commons", "Sealand platform", "A sea fort on legs: the Kamino stance"),
        ("commons", "Troll A platform", "Troll A: concrete legs out of the North Sea"),
    ]),
    "bespin": ("hull", [
        ("databank", "cloud-city", "Cloud City: a saucer of round towers, open walkways"),
        ("databank", "bespin", "Bespin"),
        ("wiki", "Cloud City", "Cloud City"),
        ("commons", "Seattle Space Needle", "Space Needle: the saucer on a stalk"),
    ]),
    "mustafar": ("bunker", [
        ("databank", "mustafar", "Mustafar: mining works over lava"),
        ("databank", "vader-s-castle", "Vader's castle: a black tuning fork over lava"),
        ("wiki", "Mustafar", "Mustafar"),
        ("commons", "Krafla geothermal power station", "Krafla: plant and pipes over a volcanic field"),
        ("commons", "Mount Etna lava flow", "Etna: lava, the footage under Mustafar"),
    ]),
    "utapau": ("bunker", [
        ("databank", "utapau", "Utapau: Pau City in the walls of sinkholes"),
        ("archivum", "Pau_City", "Pau City: bridges and balconies down a sinkhole"),
        ("wiki", "Utapau", "Utapau"),
        ("commons", "Ha Long Bay karst", "Ha Long Bay: the karst towers of Utapau's plates"),
        ("commons", "Dean's Blue Hole sinkhole", "A sinkhole: the city's shaft"),
    ]),
    "geonosis": ("bunker", [
        ("databank", "geonosis", "Geonosis: spired hive mounds"),
        ("archivum", "Petranaki_arena", "Petranaki Arena: a great open ring"),
        ("wiki", "Geonosis", "Geonosis"),
        ("commons", "Cathedral termite mound", "A termite mound: the hive spire"),
    ]),
    "scarif": ("hull", [
        ("databank", "scarif", "Scarif: industrial blocks on tropical atolls"),
        ("archivum", "Citadel_Tower", "Citadel Tower: a shaft ringed by its shield"),
        ("wiki", "Scarif", "Scarif"),
        ("commons", "Laamu Atoll Maldives", "Laamu Atoll: Scarif's beaches"),
    ]),
}

def get(url, binary=False):
    import time, urllib.error
    wm = "wikimedia.org" in url or "wikipedia.org" in url
    for attempt in range(4):
        if wm:
            time.sleep(1.5 + 4 * attempt)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise

def resolve(kind, what):
    """(image url, source page) or None"""
    if kind == "databank":
        page = "https://www.starwars.com/databank/" + what
        html = get(page)
        m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
        return (m.group(1), page) if m else None
    if kind == "archivum":
        page = "https://starwars.archivum.wiki/article/" + what
        html = get(page)
        m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
        return (m.group(1), page) if m else None
    if kind == "wiki":
        j = json.loads(get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(what.replace(" ", "_"))))
        img = (j.get("originalimage") or j.get("thumbnail") or {}).get("source")
        return (img, j.get("content_urls", {}).get("desktop", {}).get("page")) if img else None
    if kind == "commons":
        q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrsearch": what + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 3,
                                    "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1000})
        j = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))
        pages = sorted((j.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            if ii.get("thumburl"):
                return ii["thumburl"], ii.get("descriptionurl")
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    board, failed = [], []
    try:
        with open(os.path.join(OUT, "moodboard.json"), encoding="utf-8") as fh:
            kept = [b for b in json.load(fh)["images"] if os.path.exists(os.path.join(OUT, b["file"]))]
    except Exception:
        kept = []
    have = {(b["planet"], b["kind"], b.get("what", "")) for b in kept} | {(b["planet"], b["kind"], b["note"]) for b in kept}
    board += kept
    for planet, (family, items) in PLANETS.items():
        os.makedirs(os.path.join(OUT, planet), exist_ok=True)
        for n, (kind, what, note) in enumerate(items):
            if (planet, kind, what) in have or (planet, kind, note) in have:
                continue
            try:
                hit = resolve(kind, what)
                if not hit:
                    failed.append(f"{planet}: {kind} {what}: no image")
                    continue
                url, page = hit
                ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
                ext = ext if ext in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"
                name = f"{n:02d}-{kind}-{re.sub('[^a-z0-9]+', '-', what.lower()).strip('-')}{ext}"
                with open(os.path.join(OUT, planet, name), "wb") as fh:
                    fh.write(get(url, True))
                board.append({"planet": planet, "family": family, "file": f"{planet}/{name}", "kind": kind, "what": what, "note": note, "source": page, "image": url})
                print("ok", planet, name)
            except Exception as e:
                failed.append(f"{planet}: {kind} {what}: {type(e).__name__} {e}"[:200])
                print("fail", planet, kind, what, e)
    with open(os.path.join(OUT, "moodboard.json"), "w", encoding="utf-8") as fh:
        json.dump({"images": board, "failed": failed}, fh, indent=1)
    print("MOODBOARD", len(board), "saved,", len(failed), "failed")

if __name__ == "__main__":
    main()
