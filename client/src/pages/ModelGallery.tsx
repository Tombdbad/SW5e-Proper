import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import { Figure, Furniture, ShipModel, SpeederModel, BuildingModel, SettlementModel, Decor, Chest, NodeModel, RoomBlock, Opening, DomeRoof, styleOf, bakedCount } from "@/components/Map/models";
import { tokenOf, SIDE_COLORS } from "@/components/Map/sprites";
import { CurtainWall, GardenGround, Scatter, StallModel, paletteOf, plantGarden, type StallState } from "@/components/Map/siteAssets";

// Every model of the 3D map laid out in rows, for looking them over (a developer's page, not
// linked from the game). ?section=people|roles|droids|beasts|furniture|ships|places|sites picks one.
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
        <OrbitControls target={look} />
      </Canvas>
    </div>
  );
}
