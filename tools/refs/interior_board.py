import bpy
sc = bpy.context.scene
ROWS = [["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__00_Imperial_Star_Destroyer_bridge.jpg","Imperial Star Destroyer bridge","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__01_Kylo_Ren_s_Star_Destroyer.jpg","Kylo Ren's Star Destroyer","virtual background (sequel films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__02_Snoke_s_Star_Destroyer.jpg","Snoke's Star Destroyer","virtual background (sequel films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__03_Death_Star_control_room.jpg","Death Star control room","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__04_TIE_fighter_cockpit.jpg","TIE fighter cockpit","virtual background","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__05_Scarif_Imperial_vault.jpg","Scarif Imperial vault","virtual background (Rogue One)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__06_Eye_of_Sion_cockpit.jpg","Eye of Sion cockpit","virtual background (Rise of Skywalker)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__07_Rebel_base.jpg","Rebel base","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__08_Rebel_base.jpg","Rebel base","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__09_Rebel_base.jpg","Rebel base","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__10_Resistance_base.jpg","Resistance base","virtual background (sequel films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__11_Resistance_base.jpg","Resistance base","virtual background (sequel films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__12_Millennium_Falcon.jpg","Millennium Falcon","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__13_Millennium_Falcon.jpg","Millennium Falcon","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__14_Millennium_Falcon.jpg","Millennium Falcon","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__15_Millennium_Falcon.jpg","Millennium Falcon","virtual background (films)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__16_Looking_out_of_a_ship.jpg","Looking out of a ship","virtual background (The Mandalorian)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["civilian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/civilian__17_Interior_of_a_vehicle.jpg","Interior of a vehicle","virtual background (The Mandalorian and Grogu)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["criminal","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/criminal__18_Onyx_Cinder.jpg","Onyx Cinder","virtual background (Skeleton Crew)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["criminal","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/criminal__19_Captain_s_lair_on_Lanupa.jpg","Captain's lair on Lanupa","virtual background (Skeleton Crew)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__20_Mandalore_throne_room.jpg","Mandalore throne room","virtual background (Mandalorian)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__21_Mandalorian_covert.jpg","Mandalorian covert","virtual background (The Mandalorian)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__22_A_hangar.jpg","A hangar","virtual background (The Mandalorian and Grogu)","StarWars.com (Lucasfilm)","https://www.starwars.com/news/star-wars-backgrounds","(c) Lucasfilm; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__23_The_Ghost_interior_with_Hera.jpg","The Ghost, interior with Hera","HasLab Ghost (toy of an animated set)","StarWars.com news (Hasbro HasLab)","https://www.starwars.com/news/haslab-ghost-interview","(c) Lucasfilm/Hasbro; reference only"],["rebel","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/rebel__24_The_Ghost_interior_with_Hera_piloting.jpg","The Ghost, interior with Hera piloting","HasLab Ghost (toy of an animated set)","StarWars.com news (Hasbro HasLab)","https://www.starwars.com/news/haslab-ghost-interview","(c) Lucasfilm/Hasbro; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__25_Razor_Crest_inside.jpg","Razor Crest, inside","HasLab Razor Crest (toy)","StarWars.com news (Hasbro HasLab)","https://www.starwars.com/news/haslab-hasbro-razor-crest-interview","(c) Lucasfilm/Hasbro; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__26_Razor_Crest_inside.jpg","Razor Crest, inside","HasLab Razor Crest (toy)","StarWars.com news (Hasbro HasLab)","https://www.starwars.com/news/haslab-hasbro-razor-crest-interview","(c) Lucasfilm/Hasbro; reference only"],["mandalorian","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/mandalorian__27_Razor_Crest_cockpit.jpg","Razor Crest, cockpit","HasLab Razor Crest (toy)","StarWars.com news (Hasbro HasLab)","https://www.starwars.com/news/haslab-hasbro-razor-crest-interview","(c) Lucasfilm/Hasbro; reference only"],["imperial","C:/Users/Admin/AppData/Local/Temp/sw5e-shiprefs/interiors/board/imperial__28_Avenger_bridge_Star_Destroyer_history_ga.jpg","Avenger bridge (Star Destroyer history gallery)","films (The Empire Strikes Back)","StarWars.com (Lucasfilm)","https://www.starwars.com/imperial-star-destroyer-history-gallery","(c) Lucasfilm; reference only"]]
NOTES = {"imperial":"INTERIORS - Imperial: gunmetal and black, glossy dark decks, angular rooms with trapezoid ports in rounded frames; banks of lit consoles with a seat each, long central walkways; light strips low on the walls. Panels in grey and white; accent red.","rebel":"INTERIORS - Rebel: off-white and pale grey panelling worn to bare metal; ribbed ceilings, round hatches, cable runs; mixed salvaged consoles with orange and red accents; cramped crew spaces, a big hangar and a briefing room.","republic":"INTERIORS - Republic: white and red, curved clean walls, round-edged bulkheads, bright light panels; clone barracks in rows, a war room with a holo-table. (No official interior picture found: guided by the exterior kit and the gunship and cruiser pages.)","separatist":"INTERIORS - Separatist: tan and bronze with blue-grey panels, tall narrow arches, spindly rails, droid racks in rows; ribbed insect-like ceilings. (No official interior picture found: guided by the exterior kit.)","mandalorian":"INTERIORS - Mandalorian: bare steel with blue clan colour, heavy riveted plates, weapon racks on every wall, a forge or armory in the heart of the ship, long benches; the Razor Crest's locker, ramp and cockpit.","criminal":"INTERIORS - Criminal (Hutt, Black Sun, pirates): maroon, gold and brass, round frames and arches, twin seats with a round dash, salvaged panels, thrones, cells and vaults.","civilian":"INTERIORS - Civilian (the Falcon and its kind): cream and tan panels in octagonal ribbed bulkheads, a ring corridor, round glowing portholes, a cramped cockpit with two seats, a lounge with a holo-table and gunwells."}
NAMES = {'imperial':'Imperial / Sienar / Kuat','rebel':'Rebel / Incom / Corellian military','republic':'Republic / Kuat / Rendili','separatist':'Separatist / Hoersch-Kessel / Haor Chall','mandalorian':'Mandalorian / MandalMotors','criminal':'Hutt and criminal','civilian':'Civilian freighters / Corellian Engineering'}
ORDER = ['imperial','rebel','republic','separatist','mandalorian','criminal','civilian']
for coll in (sc.mixie_moodboard_images, sc.mixie_moodboard_textboxes):
    for i in range(len(coll) - 1, -1, -1):
        it = coll[i]
        if getattr(it, 'moodboard_item_id', '').startswith('sw5ei_') or it.name.startswith('sw5ei_'):
            coll.remove(i)
for i in range(len(sc.mixie_moodboard_frames) - 1, -1, -1):
    if sc.mixie_moodboard_frames[i].frame_id.startswith('sw5ei_'):
        sc.mixie_moodboard_frames.remove(i)
BASE = 700.0
CARD, GAP, COLS, NOTE = 420.0, 40.0, 3, 120.0
FW = COLS * CARD + (COLS + 1) * GAP
x0 = 7 * (FW + 120.0) + 300.0
z = 1000
made = 0
for fi, fac in enumerate(ORDER):
    items = [r for r in ROWS if r[0] == fac]
    fid = 'sw5ei_frame_' + fac
    top = 0.0
    y = top - 420.0
    hdr = sc.mixie_moodboard_textboxes.add()
    hdr.name = 'sw5ei_hdr_' + fac
    hdr.frame_id = fid
    hdr.text = 'INTERIORS - ' + NAMES[fac] + '  (' + str(len(items)) + ' references; inspiration only, not shipped)'
    hdr.position_x, hdr.position_y, hdr.width, hdr.height = x0 + GAP, top - 150.0, FW - 2 * GAP, 110.0
    hdr.font_size = 40
    hdr.bold = True
    note = sc.mixie_moodboard_textboxes.add()
    note.name = 'sw5ei_note_' + fac
    note.frame_id = fid
    note.text = NOTES[fac]
    note.position_x, note.position_y, note.width, note.height = x0 + GAP, top - 400.0, FW - 2 * GAP, 220.0
    note.font_size = 22
    for r0 in range(0, len(items), COLS):
        row = items[r0:r0 + COLS]
        hs = []
        for c, (f, path, title, medium, source, page, lic) in enumerate(row):
            img = bpy.data.images.load(path, check_existing=True)
            img.name = 'iref_' + path.split('/')[-1].rsplit('.', 1)[0]
            if img.packed_file is None:
                img.pack()
            hs.append(BASE * (img.size[1] / max(1, img.size[0])) * (CARD / BASE))
        rowh = max(hs)
        for c, (f, path, title, medium, source, page, lic) in enumerate(row):
            img = bpy.data.images['iref_' + path.split('/')[-1].rsplit('.', 1)[0]]
            it = sc.mixie_moodboard_images.add()
            it.name = img.name
            it.image = img
            it.moodboard_item_id = 'sw5ei_' + img.name
            it.scale = CARD / BASE
            cx = x0 + GAP + c * (CARD + GAP)
            it.position_x, it.position_y = cx, y - rowh
            it.frame_id = fid
            z += 1
            it.z_order = z
            tb = sc.mixie_moodboard_textboxes.add()
            tb.name = 'sw5ei_src_' + img.name
            tb.frame_id = fid
            tb.text = title + ' - ' + medium + chr(10) + source + ' (' + lic + ')' + chr(10) + page
            tb.position_x, tb.position_y, tb.width, tb.height = cx, y - rowh - NOTE - 5.0, CARD, NOTE
            tb.font_size = 13
            made += 1
        y -= rowh + NOTE + GAP
    fr = sc.mixie_moodboard_frames.add()
    fr.frame_id = fid
    fr.name = 'Interiors: ' + NAMES[fac]
    fr.position_x, fr.position_y, fr.width, fr.height = x0, y, FW, top - y
    fr.palette_index = fi % 8
    x0 += FW + 120.0
print('cards', made, 'frames', len(sc.mixie_moodboard_frames), 'texts', len(sc.mixie_moodboard_textboxes))
