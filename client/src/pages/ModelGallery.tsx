import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import { usePartyLook, Figure, Furniture, ShipModel, SpeederModel, BuildingModel, SettlementModel, Decor, Chest, NodeModel, RoomBlock, Opening, DomeRoof, styleOf, bakedCount } from "@/components/Map/models";
import { tokenOf, SIDE_COLORS } from "@/components/Map/sprites";
import { Atmosphere } from "@/components/Map/interiors/Atmosphere.tsx";
import { Stock } from "@/components/Map/interiors/Stock.tsx";
import { ItemModel, lookScale } from "@/components/Map/interiors/ItemModel";
import { ITEM_MODELS } from "@/components/Map/interiors/items";
import { CaveDressing, RockWall } from "@/components/Map/interiors/CaveRoom";
import { moodOf } from "@/components/Map/interiors/atmosphere";
import { WEALTH, lookOf, wealthOf } from "@/components/Map/interiors/wealth";
import { CurtainWall, GardenGround, Scatter, StallModel, paletteOf, plantGarden, type StallState } from "@/components/Map/siteAssets";
import { RoomShell } from "@/components/Map/LocalMap";
import { useModels } from "@/components/Map/interiors/assets";
import { packOf } from "@/components/Map/interiors/packs";
import { TONES, TONE_NAMES, type Tone } from "@/components/Map/interiors/tones";
import { KIT_MODELS, kitUrl } from "@/components/Map/interiors/kitbash";
import { floorOf } from "@/components/Map/sprites";
import { gearOf } from "@/lib/sw5e/characterCalculation";
import { furnishRoom, createRandom, type Area } from "@shared/logic";
import { radiiOf as shapeRadii } from "@shared/logic/footprint";

// `rounds` shows the first round and oval rooms (2026-10-19): furnished by the planner (furnishRoom) on their curve.
const ROUNDS: [string, number, number, string, string][] = [["round", 9, 9, "cantina", "Main bar"], ["oval", 11, 7, "guardhouse", "Guard post"], ["round", 7, 7, "scrap dealer", "Back room"], ["round", 9, 9, "palace", "Audience chamber"], ["oval", 11, 7, "medcenter", "Ward"]];
function Rounds() {
  return (
    <>
      {ROUNDS.map(([shape, w, h, type, name], i) => {
        const room = { id: `gallery-round-${i}`, kind: "room", name, parentId: null, type, description: "", tags: [], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], layout: { x: 0, y: 0, width: w, height: h, assets: [], shape: shape as "round" | "oval" } } as unknown as Area;
        furnishRoom(room, createRandom(7 + i), type);
        const l = room.layout!;
        return (
          <group key={room.id} position={[(i % 3) * 13 - 13, 0, Math.floor(i / 3) * 13]}>
            <RoomShell width={w} height={h} assets={l.assets} floor={floorOf(type)} wall="#b9ad96" style={styleOf("desert", type)} corners={shapeRadii(l.shape!, w, h)} mood={{ buildingType: type, roomName: name, biome: "desert" }} />
            <Label at={[w / 2, 0.1, h + 1]} text={`${shape}: ${name} (${w}x${h})`} />
          </group>
        );
      })}
    </>
  );
}

// `packs` (2026-10-19) shows what the downloaded kits do for a place: the same pieces in every palette of shared/art/tones.json
// (the top row is the kits as made), then a room for each style the planner furnishes from a kit, with the kit's walls.
const PACK_PIECES: [string, string][] = [
  ["/assets/kenney-station/bed-single.glb", "bed"],
  ["/assets/kenney-station/chair-armrest-headrest.glb", "chair"],
  ["/assets/kenney-station/table-large.glb", "table"],
  ["/assets/kenney-station/container-tall.glb", "locker"],
  ["/assets/kenney-station/wall-window.glb", "wall"],
  ["/assets/kenney-space/desk_computer.glb", "console"],
  ["/assets/kenney-space/machine_generator.glb", "generator"],
  ["/assets/kenney-space/barrels.glb", "barrels"],
  ["/assets/kenney-space/rock_crystalsLargeA.glb", "crystals"],
];
const PACK_ROOMS: [string, string, string][] = [
  ["palace", "Guest rooms", "desert"], ["residences", "Servants' quarters", "desert"], ["workshop", "Workfloor", "urban"], ["garrison", "Barracks", "temperate"],
  ["medcenter", "Ward", "urban"], ["starship", "Command bridge", "barren"], ["hideout", "Den", "volcanic"], ["armsmith", "Sales floor", "desert"],
];
function PackRooms() {
  return (
    <>
      {PACK_ROOMS.map(([type, name, biome], i) => {
        const room = { id: `gallery-pack-${i}`, kind: "room", name, parentId: null, type: name, description: "", tags: [], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], layout: { x: 0, y: 0, width: 8, height: 6, assets: [] } } as unknown as Area;
        furnishRoom(room, createRandom(11 + i), type);
        return (
          <group key={room.id} position={[(i % 4) * 10 - 15, 0, 9 + Math.floor(i / 4) * 9]}>
            <RoomShell width={8} height={6} assets={room.layout!.assets} floor={floorOf(type)} wall="#b9ad96" style={styleOf(biome, type)} mood={{ buildingType: type, roomName: name, biome }} />
            <Label at={[4, 0.1, 7.2]} text={`${type}: ${name} (${packOf(name, type) ?? "no kit"})`} />
          </group>
        );
      })}
    </>
  );
}

function PackRow({ tone, z }: { tone?: Tone; z: number }) {
  const got = useModels(PACK_PIECES.map(([url]) => url), "base", tone);
  return (
    <group position={[0, 0, z]}>
      {PACK_PIECES.map(([url, name], i) => (
        <group key={url} position={[i * 2 - 8, 0, 0]}>
          {got[url] && <mesh geometry={got[url]!} scale={url.includes("wall") ? [1.4, 1.4, 1.4] : 1.8} castShadow><meshLambertMaterial vertexColors /></mesh>}
          {!tone && <Label at={[0, 0.02, 1.2]} text={name} />}
        </group>
      ))}
      <Label at={[-10.5, 0.4, 0]} text={tone?.id ?? "as made"} />
    </group>
  );
}

// The models built from pieces of the kits (tools/kitbash.mjs), as made and in three palettes
const KIT_NAMES = Object.keys(KIT_MODELS);
function KitRow({ tone, z }: { tone?: Tone; z: number }) {
  const urls = KIT_NAMES.map((n) => kitUrl(n));
  const got = useModels(urls, "base", tone);
  return (
    <group position={[0, 0, z]}>
      {KIT_NAMES.map((n, i) => (
        <group key={n} position={[(i % 12) * 1.5 - 8, 0, Math.floor(i / 12) * 2]}>
          {got[kitUrl(n)] && <mesh geometry={got[kitUrl(n)]!} castShadow><meshLambertMaterial vertexColors /></mesh>}
          {!tone && <Label at={[0, 0.02, 0.8]} text={n} />}
        </group>
      ))}
      <Label at={[-10, 0.4, 0]} text={tone?.id ?? "as made"} />
    </group>
  );
}

// `walk` (2026-10-19): people and a droid pacing to and fro, their legs and arms swinging by their own speed (interiors/limbs.ts)
function Pacer({ z, speed, children }: { z: number; speed: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    // A triangle wave: out, a pause at each end, and back
    const t = (clock.getElapsedTime() * speed) % 8;
    const x = t < 3 ? -4.5 + t * 3 : t < 4 ? 4.5 : t < 7 ? 4.5 - (t - 4) * 3 : -4.5;
    g.current.position.set(x, 0, z);
    g.current.rotation.y = t < 3 ? Math.PI / 2 : t < 4 ? Math.PI / 2 : t < 7 ? -Math.PI / 2 : -Math.PI / 2;
  });
  return <group ref={g}>{children}</group>;
}
// `gear` (2026-10-19): what people hold, wear and carry, baked into their figures (interiors/gear.ts): NPCs by their outfit and work, and the
// player's by what the character has chosen (?loadout=heavy|light|medic|cyber)
const LOADOUTS: Record<string, { equipment: string[]; armor: { weapons: string[]; body: string | null; shield: string | null } }> = {
  heavy: { equipment: ["Vibroblade", "Battle armor", "Heavy physical shield", "Medpac"], armor: { weapons: ["Vibroblade"], body: "Battle armor", shield: "Heavy physical shield" } },
  light: { equipment: ["Blaster rifle", "Combat suit", "Mechanic's kit", "Bandolier"], armor: { weapons: ["Blaster rifle"], body: "Combat suit", shield: null } },
  medic: { equipment: ["Blaster pistol", "Composite armor", "Medpac", "Traumakit", "Tinker's implements"], armor: { weapons: ["Blaster pistol"], body: "Composite armor", shield: null } },
  cyber: { equipment: ["Vibroaxe", "Arm prosthesis", "Leg prosthesis", "Medium shield generator"], armor: { weapons: ["Vibroaxe"], body: null, shield: "Medium shield generator" } },
  // The item models worn: a saber, a holster, a pack, a buckle, a pauldron, a wristpad (the `worn` section puts it on every species)
  worn: { equipment: ["Lightsaber", "Holster", "Backpack", "Power belt", "Wristpad", "Ammo Pouch", "Pauldron of Retribution"], armor: { weapons: ["Lightsaber"], body: null, shield: null } },
  hunter: { equipment: ["Bowcaster", "Quiver", "Smugglepack", "Stealth field generator", "Light physical shield"], armor: { weapons: ["Bowcaster"], body: "Combat suit", shield: "Light physical shield" } },
};
function Gear({ loadout }: { loadout: string }) {
  useEffect(() => {
    const l = LOADOUTS[loadout] ?? LOADOUTS.heavy;
    usePartyLook.getState().set({ species: "Human", name: "Mira", force: false, gear: gearOf({ ...l, abilityScores: {} }) });
    return () => usePartyLook.getState().set({ gear: undefined });
  }, [loadout]);
  const npcs: [string, string, string][] = [["Navy Trooper", "trooper", "Human"], ["Gamorrean Guard", "guard", "Gamorrean"], ["Mechanic Pell", "mechanic", "Human"], ["Medic Senn", "medic", "Twi'lek"], ["Scout Kel", "scout", "Human"], ["Death Trooper", "trooper", "Human"], ["Trandoshan Hunter", "hunter", "Trandoshan"]];
  return (
    <Rows items={[["player", "Mira (player)", "Human"], ...npcs]} per={8} gap={1.5} name={([, n]) => n} draw={([kind, name, species]) => <Figure kind={kind === "player" ? "player" : "humanoid"} ring={SIDE_COLORS.neutral} name={name} role={kind} species={species} />} />
  );
}

// `worn` (2026-10-20): one loadout on a figure of each species, to see where the hips, back, belt, shoulder and wrist land on every body
// (interiors/anchors.ts): bulk, a hunched torso (Abyssin, Anx, Baragwin), wings (Diathim, Geonosian, Rishii, Toydarian), a long neck (Kaminoan...). ?loadout=worn|hunter|heavy|light
const WORN_SPECIES = ["Human", "Wookiee", "Jawa", "Abyssin", "Anx", "Baragwin", "Diathim", "Geonosian", "Rishii", "Toydarian", "Kaminoan", "Quermian", "Tiss'shar", "Xexto", "Barabel", "Bothan", "Twi'lek", "Gamorrean", "Rodian", "Zabrak", "Mon Calamari", "Bith", "Ewok", "Trandoshan"];
function Worn({ loadout }: { loadout: string }) {
  const l = LOADOUTS[loadout] ?? LOADOUTS.worn;
  const gear = useMemo(() => gearOf({ ...l, abilityScores: {} }), [loadout]);
  return <Rows items={WORN_SPECIES} per={8} gap={1.5} name={(s) => s} draw={(s) => <Figure kind="humanoid" ring={SIDE_COLORS.neutral} name={`Kel ${s}`} role="patron" species={s} gear={gear} />} />;
}

// `hands` (2026-10-20): what people hold: a band with an instrument each (picked by name), and Force users with a saber of their own colour
const HANDS: [string, string, string, string][] = [
  ["humanoid", "Figrin", "musician", "Bith"], ["humanoid", "Doikk", "musician", "Human"], ["humanoid", "Tech", "musician", "Twi'lek"], ["humanoid", "Nalan", "musician", "Rodian"],
  ["humanoid", "Ickabel", "musician", "Human"], ["humanoid", "Tedn", "musician", "Zabrak"], ["humanoid", "Lirin", "musician", "Bith"], ["humanoid", "Sari", "musician", "Human"],
  ["force", "Jedi Knight Aro", "jedi", "Human"], ["force", "Jedi Padawan Vee", "jedi", "Twi'lek"], ["force", "Sith Lord Karn", "sith", "Zabrak"], ["force", "Inquisitor Seven", "inquisitor", "Human"],
  ["humanoid", "Navy Trooper", "trooper", "Human"], ["humanoid", "Mechanic Pell", "mechanic", "Human"], ["humanoid", "Medic Senn", "medic", "Twi'lek"], ["humanoid", "Gamorrean Guard", "guard", "Gamorrean"],
];
function Hands() {
  return <Rows items={HANDS} per={8} gap={1.5} name={([, n]) => n} draw={([kind, name, role, species]) => <Figure kind={kind} ring={SIDE_COLORS.neutral} name={name} role={role} species={species} />} />;
}

// `items` (2026-10-20): every model of the item catalogue by pack, each enlarged to about half a square so that the small ones can be seen;
// ?pack=sw5e-sabers shows one pack, and the label says the model and the scale it is shown at
function Items({ pack }: { pack: string | null }) {
  const packs = [...new Set(Object.values(ITEM_MODELS).map((m) => m.pack))].filter((p) => !pack || p === pack);
  let row = 0;
  return (
    <>
      {packs.map((p) => {
        const names = Object.keys(ITEM_MODELS).filter((n) => ITEM_MODELS[n].pack === p).sort();
        const z = row * 1.1;
        row += Math.ceil(names.length / 12) + 1.4;
        return (
          <group key={p} position={[0, 0, z]}>
            <Label at={[-7.2, 0.4, -0.2]} text={p} />
            <Rows items={names} per={12} gap={1.1} name={(n) => n.replace(/^(droid|mod|saber|blade|grenade|mine)-/, "$1·")} draw={(n) => <ItemModel model={n} scale={lookScale(n)} />} />
          </group>
        );
      })}
    </>
  );
}

function Walk() {
  const people: [string, string, string][] = [["Navy Trooper", "trooper", "Human"], ["Zara", "merchant", "Twi'lek"], ["Kel", "scout", "Wookiee"], ["Mira", "player", "Human"]];
  return (
    <>
      {people.map(([name, role, species], i) => (
        <Pacer key={name} z={i * 1.6 - 2.4} speed={1}>
          <Figure kind={role === "player" ? "player" : "humanoid"} ring={SIDE_COLORS.neutral} name={name} role={role} species={species} />
        </Pacer>
      ))}
      <Pacer z={4.2} speed={1}><Figure kind="droid" ring={SIDE_COLORS.hostile} name="R2 Series Astromech Droid" /></Pacer>
      <Pacer z={5.8} speed={1}><Figure kind="beast" ring={SIDE_COLORS.hostile} name="Dewback, Adult" creature="beast" /></Pacer>
    </>
  );
}

function Packs() {
  return (
    <>
      {[undefined, TONES.gunmetal, TONES.medical, TONES.industrial].map((tone, i) => <KitRow key={tone?.id ?? "made"} tone={tone} z={-30 - i * 5} />)}
      {[undefined, ...TONE_NAMES.filter((n) => n !== "gunmetal").map((n) => TONES[n])].map((tone, i) => <PackRow key={tone?.id ?? "made"} tone={tone} z={-2 - i * 2.4} />)}
      <PackRooms />
    </>
  );
}

// Every model of the 3D map laid out in rows, for looking them over (a developer's page, not
// linked from the game). ?section=people|roles|droids|beasts|furniture|ships|places|sites|interiors picks one.
// `interiors` shows the overhaul of 2026-10-19: the stock of racks, shelves and cases by kind of place, the furniture
// in the six wealths, a cave room (rock walls, formations, light) and the mood of each kind of room.
// `sites` shows the asset library of the sites: a garden planted for each kind of world, the stalls of a
// market open, being packed and packed, a curtain wall, the pieces a shop shows, and the wild ground and
// racing pieces (trees, rocks, ground cover, barriers, a grandstand) in a temperate and a desert world.
const WILD_PIECES = ["tree_tall", "tree_pine", "tree_birch", "cactus", "boulder", "rock", "rock_small", "log", "stump", "grass_tuft", "wildflowers", "fern", "reeds", "barrier", "crate_stack", "pylon", "banner", "grandstand"];
const SHOP_PIECES: [string, number, number][] = [["Sales counter", 4, 1], ["Display shelf", 3, 1], ["Goods shelf", 3, 1], ["Curio shelf", 2, 1], ["Droid parts shelf", 3, 1], ["Herb rack", 2, 1], ["Instrument rack", 2, 1], ["Wares rack", 1, 1], ["Produce bin", 1, 1], ["Cloth bolts", 2, 1], ["Display case", 2, 1], ["Clothing rack", 2, 1], ["Armor stand", 1, 1], ["Holo display", 1, 1], ["Statuette plinth", 1, 1], ["Starship part", 2, 1], ["Weapon rack", 2, 1], ["Medical cabinet", 2, 1]];
const BIOMES = ["temperate", "forest", "jungle", "desert", "ice", "volcanic", "swamp", "urban"];

const SPECIES = ["Human", "Twi'lek", "Togruta", "Zabrak", "Rodian", "Wookiee", "Trandoshan", "Mon Calamari", "Duros", "Ithorian", "Bith", "Gamorrean", "Jawa", "Tusken", "Kel Dor", "Nautolan", "Chiss", "Cathar", "Gungan", "Weequay", "Devaronian", "Ewok", "Sullustan", "Toydarian", "Cerean", "Sith Pureblood", "Quarren", "Besalisk", "Kaminoan", "Iktotchi", "Gran", "Bothan"];
const ROLES = ["bartender", "merchant", "mechanic", "medic", "pilot for hire", "smuggler", "bounty hunter", "guard", "officer", "dockmaster", "noble", "captive", "musician", "scholar", "patron", "resident"];
const BLOCKS = ["Trooper", "Trooper, Scout", "Death Trooper", "Navy Pilot", "Navy Trooper", "Imperial Royal Guard", "Inquisitor, Knight", "Jawa Scrapper", "Tusken Raider", "Gamorrean Guard", "Wookiee Berserker", "Trandoshan Hunter", "Officer, Senior", "Grand Admiral", "Purge Trooper", "Kolkpravis Warrior"];
const DROIDS = ["R2 Series Astromech Droid", "C1 Series Astromech Droid", "BB Series Astromech Droid", "3P0 Series", "B1 Series, B1-A", "B2 Series, B2-A", "BX Series, BX-A", "T-Series Tactical Droid", "Destroyer Droid", "Viper Probe Droid", "Gonk Droid", "Mouse droid", "DUM-Series PIT Droid", "GH-7 Medical Analysis Unit", "IG Series, Model 88", "HK Series, HK-47", "KX-Series Security Droid", "DSD1 Dwarf Spider Droid", "Junk Droid", "Service droid", "AT-ST", "AT-RT", "AT-AT", "AT-TE", "AAT", "Auto-Turret", "74-Z Speeder Bike", "B'omarr Brain Walker", "IG-227 Hailfire-Class Droid", "Vulture-Class Droid"];
const BEASTS = ["Bantha, Adult", "Dewback, Adult", "Reek, Adult", "Ronto", "Eopie", "Nerf", "Forest Nexu, Adult", "Kath Hound", "Boar-wolf", "Rancor, Adult", "Snow Wampa", "Gundark, Adult", "Terentatek", "Tauntaun", "Kaadu", "Varactyl, Adult", "Krayt Dragon, Juvenile", "Exogorth, Adolescent", "Opee Sea Killer", "Mynock", "Porg", "Condor Dragon", "Hawk-bat", "Convor bird", "Acklay, Adult", "Knobby White Spider", "Dianoga, Adult", "Rathtar", "Sarlacc, Adult", "Womp Rat", "Worrt", "Ysalamir", "Jakrab", "Monkey-Lizard", "Nuna", "Mott", "K'lor'slug", "Dark Side Spirit", "Tree", "Shrub", "Vines", "Carnivorous Plant", "Hutt Crime Lord", "Swarm of Mynocks", "Lylek"];
const FURNITURE: [string, number, number][] = [["Bar counter", 5, 1], ["Bandstand", 3, 2], ["Table", 1, 1], ["Mess table", 2, 1], ["Booth", 2, 1], ["Drink dispenser", 1, 1], ["Sabacc table", 2, 2], ["Market stall", 2, 1], ["Crate", 1, 1], ["Awning post", 1, 1], ["Medical bed", 2, 1], ["Bacta tank", 1, 1], ["Instrument cart", 1, 1], ["Supply cabinet", 2, 1], ["Reactor core", 2, 2], ["Coolant tank", 1, 1], ["Monitoring console", 2, 1], ["Pipe run", 3, 1], ["Workbench", 3, 1], ["Tool rack", 2, 1], ["Parts bin", 1, 1], ["Power coupling", 1, 1], ["Crate stack", 2, 2], ["Shelving", 3, 1], ["Lifter droid dock", 1, 1], ["Holo-table", 2, 2], ["Console", 2, 1], ["Sensor mast", 1, 1], ["Command chair", 1, 1], ["Desk", 2, 1], ["Locker", 1, 1], ["Barricade", 2, 1], ["Alarm panel", 1, 1], ["Couch", 2, 1], ["Low table", 1, 1], ["Cabinet", 1, 1], ["Bed", 2, 1], ["Vent stack", 1, 1], ["Water tank", 2, 2], ["Antenna mast", 1, 1], ["Equipment crate", 2, 1], ["Cooling unit", 2, 1], ["Sarcophagus", 1, 2], ["Broken pillar", 1, 1], ["Altar", 2, 1], ["Rubble", 2, 1], ["Boulder", 1, 1], ["Rock pillar", 1, 1], ["Campfire ring", 1, 1], ["Pillar", 1, 1], ["Bench", 2, 1], ["Dais", 3, 1], ["Information terminal", 1, 1], ["Info kiosk", 1, 1], ["Terminal", 1, 1], ["Holding cell", 2, 2], ["Guard console", 2, 1], ["Restraint rack", 1, 1], ["Access panel", 1, 1], ["Security camera", 1, 1], ["Bunk", 2, 1], ["Footlocker", 1, 1], ["Weapon rack", 2, 1], ["Fuel pump", 1, 1], ["Cargo pallet", 2, 2], ["Tool cart", 1, 1], ["Loading crane", 2, 1], ["Pilot's seat", 1, 1], ["Gunnery seat", 1, 1], ["Boarding ramp", 1, 1], ["Pit trap", 1, 1]];

function Label({ at, text }: { at: [number, number, number]; text: string }) {
  return (
    <Billboard position={at}>
      <Text fontSize={0.22} color="#facc15" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000">{text}</Text>
    </Billboard>
  );
}

// Lays things out in rows of `per`, `gap` apart, each with its name under it
function Rows<T>({ items, per, gap, name, draw, z = 0 }: { items: T[]; per: number; gap: number; name: (t: T) => string; draw: (t: T) => JSX.Element; z?: number }) {
  return (
    <group position={[-(Math.min(per, items.length) - 1) * gap * 0.5, 0, z]}>
      {items.map((t, i) => (
        <group key={i} position={[(i % per) * gap, 0, Math.floor(i / per) * gap]}>
          {draw(t)}
          <Label at={[0, 0.08, 0.75]} text={name(t)} />
        </group>
      ))}
    </group>
  );
}

// The character's own figure, as Play would set it for a species, with or without the Force
function PlayerFigure({ force, species }: { force: boolean; species: string }) {
  return (
    <Figure kind={force ? "force" : "player"} ring={SIDE_COLORS.player} name="Hero" species={species} marker player={false} role={force ? "jedi" : "smuggler"} />
  );
}

function Stats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    (window as any).__gallery = { info: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, baked: bakedCount() }) };
  }, [gl]);
  return null;
}

export default function ModelGallery() {
  const query = new URLSearchParams(window.location.search);
  const section = query.get("section") ?? "people";
  // ?cam=x,y,z&look=x,y,z frame a close look
  const triple = (text: string | null, fallback: [number, number, number]) => (text ? (text.split(",").map(Number) as [number, number, number]) : fallback);
  const cam = triple(query.get("cam"), [0, 9, 12]);
  const look = triple(query.get("look"), [0, 0, section === "places" ? 14 : 3]);
  const roleList = [...ROLES.map((r) => ({ name: `Dax ${r}`, role: r })), ...BLOCKS.map((b) => ({ name: b, role: "" }))];
  const person = (name: string, role = "", species?: string) => <Figure kind={tokenOf({ name, role })} ring={SIDE_COLORS.neutral} name={name} role={role} species={species} />;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f16" }}>
      <Canvas shadows dpr={1} camera={{ position: cam, fov: 45 }}>
        <Stats />
        <color attach="background" args={["#1b2430"]} />
        <ambientLight intensity={0.6} />
        <hemisphereLight args={["#cfe0ff", "#3a3020", 0.5]} />
        <directionalLight position={[8, 14, 10]} intensity={0.95} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 6]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshLambertMaterial color="#39424e" />
        </mesh>
        {section === "people" && <Rows items={SPECIES} per={8} gap={1.4} name={(s) => s} draw={(s) => person(`Kel ${s}`, "patron", s)} />}
        {section === "roles" && <Rows items={roleList} per={8} gap={1.4} name={(r) => r.role || r.name} draw={(r) => person(r.name, r.role)} />}
        {section === "player" && (
          <Rows items={["Human", "Zabrak", "Twi'lek", "Togruta", "Wookiee", "Chiss"].flatMap((s) => [`force:${s}`, `blaster:${s}`])} per={6} gap={1.4} name={(s) => s} draw={(s) => <PlayerFigure force={s.startsWith("force")} species={s.split(":")[1]} />} />
        )}
        {section === "droids" && <Rows items={DROIDS} per={8} gap={1.6} name={(s) => s.replace(/ Series| Droid|,.*$/g, "")} draw={(s) => <Figure kind={tokenOf({ name: s, creature: /^(AT|AAT|Auto|74|B'omarr|IG-227|Vulture)/.test(s) ? "construct" : "droid" })} ring={SIDE_COLORS.hostile} name={s} />} />}
        {section === "beasts" && <Rows items={BEASTS} per={8} gap={1.8} name={(s) => s.replace(/,.*$/, "")} draw={(s) => <Figure kind={/swarm/i.test(s) ? "swarm" : /hutt/i.test(s) ? "hutt" : /spirit/i.test(s) ? "horror" : "beast"} ring={SIDE_COLORS.hostile} name={s} creature={/tree|shrub|vines|plant/i.test(s) ? "plant" : "beast"} large={/rancor|bantha|krayt|acklay|reek|ronto|dianoga|rathtar|sarlacc|exogorth|opee|hutt/i.test(s)} />} />}
        {section === "furniture" && <Rows items={FURNITURE} per={9} gap={3.4} name={([n]) => n} draw={([n, w, h]) => <group position={[-w / 2, 0, -h / 2]}><Furniture name={n} w={w} h={h} seed={n.length} /></group>} />}
        {section === "ships" && (
          <>
            <Rows items={["fighter", "shuttle", "light freighter", "corvette"].flatMap((role) => [{ role, owner: "Rebel Alliance" }, { role, owner: "Galactic Empire" }])} per={4} gap={7} name={(s) => `${s.role} (${s.owner.split(" ")[1]})`} draw={(s) => <group position={[-3, 0, -2]}><ShipModel ship={{ size: s.role === "fighter" ? "Tiny" : s.role === "shuttle" ? "Small" : s.role === "corvette" ? "Large" : "Medium", role: s.role, status: "landed", owner: s.owner, name: s.role }} w={6} h={4} /></group>} />
            <Rows z={14} items={["Speederbike", "Landspeeder", "Airspeeder", "Landspeeder wreck"]} per={4} gap={3} name={(s) => s} draw={(s) => <SpeederModel model={s} wrecked={/wreck/.test(s)} />} />
          </>
        )}
        {section === "places" && (
          <>
            <Rows items={["cantina", "spaceport", "docking bay", "market", "garrison", "gate", "medcenter", "workshop", "residences", "palace", "warehouse", "archive", "hideout", "camp", "cave", "ruin", "wreck", "trailhead"]} per={6} gap={6} name={(s) => s} draw={(s) => <BuildingModel type={s} wall="#c9a56e" />} />
            <Rows z={20} items={["city", "town", "outpost", "station", "crash site"]} per={5} gap={6} name={(s) => s} draw={(s) => <SettlementModel type={s} wall="#c9a56e" />} />
            <Rows z={28} items={["tree", "lamp", "mast", "kiosk", "camera", "crate", "ice", "rock"]} per={8} gap={1.6} name={(s) => s} draw={(s) => <group position={[-0.5, 0, -0.5]}><Decor kind={s} seed={s.length} /></group>} />
            <Rows z={31} items={["desert", "urban", "station", "volcanic"]} per={4} gap={7} name={(s) => s} draw={(biome) => {
              const st = styleOf(biome);
              const c = st.corner;
              return (
                <group position={[-2.5, 0, -2]}>
                  <RoomBlock w={5} d={4} height={2} radii={[c, c, c, c]} wall={biome === "desert" ? "#c9a56e" : biome === "urban" ? "#8a94a3" : biome === "station" ? "#7b8794" : "#6b5a55"} roof="#4a525c" parapet band={st.band} />
                  <group position={[2.5, 0, 4.0]}><Opening kind="door" color="#f59e0b" style={st} /></group>
                  <group position={[1.0, 0, 4.0]}><Opening kind="window" color="#7dd3fc" style={st} /></group>
                  {st.dome && <group position={[2.5, 2.1, 2]}><DomeRoof r={1.1} color="#c9a56e" /></group>}
                </group>
              );
            }} />
            <Rows z={38} items={["closed", "looted", "plant", "crystal", "ore", "salvage", "hide"]} per={7} gap={1.6} name={(s) => s} draw={(s) => <group position={[-0.5, 0, -0.5]}>{s === "closed" || s === "looted" ? <Chest looted={s === "looted"} /> : <NodeModel node={{ family: s === "ore" ? "ore" : s, tier: 2 }} />}</group>} />
          </>
        )}
        {section === "sites" && (
          <>
            {BIOMES.map((biome, i) => (
              <group key={biome} position={[(i % 4) * 15 - 22, 0, Math.floor(i / 4) * 15 - 4]}>
                <GardenGround rects={[{ x: 0, y: 0, width: 12, height: 12 }]} biome={biome} />
                <Scatter placed={plantGarden({ x: 0, y: 0, width: 12, height: 12 }, `gallery|${biome}`, biome, "full")} biome={biome} />
                <Label at={[6, 0.1, 13]} text={biome} />
              </group>
            ))}
            <Rows z={28} items={["general", "arms", "tech", "medical", "outfit", "leisure", "black"].flatMap((trade) => (["open", "packing", "packed"] as StallState[]).map((state) => ({ trade, state })))} per={9} gap={4} name={(s) => `${s.trade} ${s.state}`} draw={(s) => <StallModel trade={s.trade} state={s.state} canvas={paletteOf("temperate").canvas[s.trade.length % 4]} seed={s.trade.length} />} />
            <Rows z={40} items={SHOP_PIECES} per={9} gap={4} name={([n]) => n} draw={([n, w, h]) => <group position={[-w / 2, 0, -h / 2]}><Furniture name={n} w={w} h={h} seed={n.length} /></group>} />
            <group position={[-12, 0, 48]}><CurtainWall wall={{ x: 0, y: 0, width: 28, height: 12, gates: [{ side: "s", at: 12, width: 4 }] }} biome="temperate" /></group>
            {["temperate", "desert"].map((biome, b) => (
              <Rows key={biome} z={66 + b * 8} items={WILD_PIECES} per={9} gap={4} name={(key) => `${key} (${biome})`} draw={(key) => <Scatter placed={[{ key, x: 0, y: 0, rot: 0, scale: 1, v: 1 }]} biome={biome} />} />
            ))}
          </>
        )}
        {section === "rounds" && <Rounds />}
        {section === "packs" && <Packs />}
        {section === "walk" && <Walk />}
        {section === "gear" && <Gear loadout={query.get("loadout") ?? "heavy"} />}
        {section === "worn" && <Worn loadout={query.get("loadout") ?? "worn"} />}
        {section === "hands" && <Hands />}
        {section === "items" && <Items pack={query.get("pack")} />}
        {section === "interiors" && (
          <>
            {/* The stock of a rack by the place: an armsmith, a garrison armory, a palace guard post, a hideout */}
            {[["armsmith", "Sales floor"], ["garrison", "Armory"], ["palace", "Guard post"], ["hideout", "Common room"]].map(([b, r], i) => (
              <group key={b} position={[i * 4.5 - 7, 0, 0]}>
                <Furniture name="Weapon rack" w={3} h={1} seed={3} look={lookOf(wealthOf(b, r))} />
                <Stock name="Weapon rack" w={3} h={1} seed={3} buildingType={b} roomName={r} />
                <Label at={[1.5, 0.08, 1.7]} text={`${b} (${r})`} />
              </group>
            ))}
            <group position={[-7, 0, 4]}>
              <Furniture name="Display shelf" w={3} h={1} seed={1} look={lookOf("comfortable")} />
              <Stock name="Display shelf" w={3} h={1} seed={1} buildingType="armsmith" roomName="Sales floor" />
              <Label at={[1.5, 0.08, 1.7]} text="display shelf" />
            </group>
            <group position={[-2.5, 0, 4]}>
              <Furniture name="Display table" w={3} h={1} seed={1} look={lookOf("comfortable")} />
              <Stock name="Display table" w={3} h={1} seed={1} buildingType="armsmith" roomName="Sales floor" />
              <Label at={[1.5, 0.08, 1.7]} text="display case" />
            </group>
            <group position={[2, 0, 4]}>
              <Furniture name="Crate stack" w={3} h={1} seed={1} look={lookOf("modest")} />
              <Stock name="Shelving" w={3} h={1} seed={1} buildingType="garrison" roomName="Armory" />
              <Label at={[1.5, 0.08, 1.7]} text="armory crates" />
            </group>
            {/* The stock of the shops (2026-10-19): armour on stands, kits, medicine, prostheses and tools, and the melee weapons built from the kits */}
            {([["Armor stand", 1, "armsmith", "Sales floor"], ["Armor stand", 1, "outfitter", "Sales floor"], ["Armor stand", 1, "palace", "Guard post"], ["Armor stand", 1, "garrison", "Armory"], ["Armor stand", 1, "curio shop", "Sales floor"],
              ["Droid parts shelf", 3, "tech shop", "Sales floor"], ["Display shelf", 3, "outfitter", "Sales floor"], ["Medical cabinet", 3, "apothecary", "Sales floor"], ["Supply cabinet", 3, "medcenter", "Ward"],
              ["Display case", 3, "tech shop", "Sales floor"], ["Display case", 3, "medcenter", "Ward"], ["Workbench", 3, "workshop", "Workfloor"], ["Weapon rack", 3, "criminal", "Common room"],
              // The item models on their shelves (2026-10-20)
              ["Goods shelf", 3, "general store", "Sales floor"], ["Instrument rack", 3, "curio shop", "Sales floor"], ["Herb rack", 3, "apothecary", "Sales floor"], ["Clothing rack", 3, "outfitter", "Sales floor"],
              ["Bar counter", 5, "cantina", "Main bar"], ["Display table", 3, "tech shop", "Sales floor"], ["Droid parts shelf", 3, "droid dealer", "Showroom"], ["Display shelf", 3, "armsmith", "Sales floor"],
              ["Armor stand", 1, "spaceport", "Docking bay"], ["Armor stand", 1, "general store", "Sales floor"]] as const).map(([n, w, b, r], i) => (
              <group key={`${n}${b}${i}`} position={[(i % 6) * 4.5 - 11, 0, -7 - Math.floor(i / 6) * 3.5]}>
                <Furniture name={n} w={w} h={1} seed={i + 1} look={lookOf(wealthOf(b, r))} bare />
                <Stock name={n} w={w} h={1} seed={i + 1} buildingType={b === "criminal" ? "hideout" : b} roomName={r} />
                <Label at={[w / 2, 0.08, 1.4]} text={`${n.toLowerCase()} (${b})`} />
              </group>
            ))}
            {/* The same furniture in the six wealths */}
            {["Bed", "Couch", "Table", "Cabinet"].map((name, row) =>
              WEALTH.map((w, col) => (
                <group key={`${name}${w}`} position={[col * 3.2 - 8, 0, 10 + row * 3]}>
                  <Furniture name={name} w={2} h={1} seed={2} look={lookOf(w)} />
                  {row === 0 && <Label at={[1, 0.08, -0.9]} text={w} />}
                </group>
              )),
            )}
            {/* A cave room of 12 by 9 squares: rock walls on three sides, its rim, and its light */}
            <group position={[-14, 0, 26]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6, 0.01, 4.5]} receiveShadow><planeGeometry args={[12, 9]} /><meshLambertMaterial color="#3a3835" /></mesh>
              <RockWall side="n" a={0} b={12} w={12} h={9} height={1.1} seed={3} biome="temperate" tier="full" />
              <RockWall side="w" a={0} b={9} w={12} h={9} height={1.1} seed={4} biome="temperate" tier="full" />
              <RockWall side="e" a={0} b={9} w={12} h={9} height={1.1} seed={5} biome="temperate" tier="full" />
              <RockWall side="s" a={0} b={5} w={12} h={9} height={1.1} seed={6} biome="temperate" tier="full" />
              <RockWall side="s" a={7} b={12} w={12} h={9} height={1.1} seed={7} biome="temperate" tier="full" />
              <CaveDressing w={12} h={9} seed={12 * 31 + 9} biome="temperate" tier="full" takenKey="5,8;6,8" />
              <Atmosphere mood={moodOf("cave", "Deep chamber", "squalid", "temperate")} look={lookOf("squalid")} w={12} h={9} tier="full" />
              <Label at={[6, 0.1, 10.5]} text="cave: Deep chamber" />
            </group>
            {/* Ice, volcanic */}
            {["ice", "volcanic"].map((biome, i) => (
              <group key={biome} position={[2 + i * 14, 0, 26]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, 0.01, 4]} receiveShadow><planeGeometry args={[10, 8]} /><meshLambertMaterial color="#3a3835" /></mesh>
                <RockWall side="n" a={0} b={10} w={10} h={8} height={1.1} seed={3} biome={biome} tier="full" />
                <RockWall side="w" a={0} b={8} w={10} h={8} height={1.1} seed={4} biome={biome} tier="full" />
                <RockWall side="e" a={0} b={8} w={10} h={8} height={1.1} seed={5} biome={biome} tier="full" />
                <CaveDressing w={10} h={8} seed={10 * 31 + 8} biome={biome} tier="full" takenKey="" />
                <Atmosphere mood={moodOf("cave", "Den", "squalid", biome)} look={lookOf("squalid", biome)} w={10} h={8} tier="full" />
                <Label at={[5, 0.1, 9.5]} text={`cave: ${biome}`} />
              </group>
            ))}
            {/* The mood of each kind of room: a floor, a couch and a table under its light */}
            {[["cantina", "Main bar"], ["palace", "Audience chamber"], ["medcenter", "Ward"], ["garrison", "Barracks"], ["tenements", "Apartments"], ["engineering", "Reactor room"], ["spaceport", "Docking bay"], ["armsmith", "Sales floor"], ["ruin", "Inner sanctum"], ["garrison", "Detention block"]].map(([b, r], i) => {
              const wealth = wealthOf(b, r);
              return (
                <group key={`${b}${r}`} position={[(i % 5) * 9 - 14, 0, 42 + Math.floor(i / 5) * 8]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.5, 0.01, 2.5]} receiveShadow><planeGeometry args={[7, 5]} /><meshLambertMaterial color="#3a3a40" /></mesh>
                  <group position={[0.5, 0, 0.5]}><Furniture name="Couch" w={2} h={1} look={lookOf(wealth)} /></group>
                  <group position={[3.5, 0, 2]}><Furniture name="Table" w={1} h={1} look={lookOf(wealth)} /></group>
                  <Atmosphere mood={moodOf(b, r, wealth)} look={lookOf(wealth)} w={7} h={5} tier="full" />
                  <Label at={[3.5, 0.1, 5.8]} text={`${b}: ${r} (${wealth})`} />
                </group>
              );
            })}
          </>
        )}
        <OrbitControls target={look} />
      </Canvas>
    </div>
  );
}
