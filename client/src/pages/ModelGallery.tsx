import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { babylonGl } from "@/components/Map/babylon";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import { crownOf, portalOf, type Family } from "../components/Map/interiors/architecture";
import { usePartyLook, HAIR_MALE, HAIR_FEMALE, BEARDS, hairStyleOf, beardOf, Figure, Furniture, stoolsOf, ShipModel, SpeederModel, BuildingModel, SettlementModel, Decor, Chest, NodeModel, RoomBlock, ArchPiece, Opening, DomeRoof, styleOf, bakedCount, hue, type GunAim } from "@/components/Map/models";
import { tokenOf, SIDE_COLORS } from "@/components/Map/sprites";
import { Atmosphere } from "@/components/Map/interiors/Atmosphere.tsx";
import { Stock } from "@/components/Map/interiors/Stock.tsx";
import { ItemModel, lookScale } from "@/components/Map/interiors/ItemModel";
import { ITEM_MODELS } from "@/components/Map/interiors/items";
import { CaveDressing, CaveMound, RockArch, RockWall } from "@/components/Map/interiors/CaveRoom";
import { moodOf } from "@/components/Map/interiors/atmosphere";
import { WEALTH, lookOf, wealthOf } from "@/components/Map/interiors/wealth";
import { CurtainWall, GardenGround, Scatter, StallModel, paletteOf, plantGarden, Decks, FishSchools, Sea, SEA_Y, SWIM_Y, UnderSea, type StallState } from "@/components/Map/siteAssets";
import { RoomShell } from "@/components/Map/LocalMap";
import { useModels } from "@/components/Map/interiors/assets";
import { packOf } from "@/components/Map/interiors/packs";
import { TONES, TONE_NAMES, type Tone } from "@/components/Map/interiors/tones";
import { KIT_MODELS, kitUrl } from "@/components/Map/interiors/kitbash";
import { floorOf } from "@/components/Map/sprites";
import { gearOf } from "@/lib/sw5e/characterCalculation";
import { GIVEN_NAMES, furnishRoom, createRandom, VEHICLE_MAKES, caveMask, deckSquares, type Area, type RoomAsset } from "@shared/logic";
import { seatState, motion, nowSeconds, beginSwing, personaOf, SABER_STYLES, SABER_KITS, type Motion, type SaberKit, type SaberStyle, type SeatState, type Shot } from "@/components/Map/interiors/limbs";
import { styleFor, comboOf, moveOf, moveSeconds, planDuel, DUEL_MODES, FLAVOUR, type DuelMode, type Fighter } from "@/components/Map/interiors/saberplay";
import { MotionContext } from "@/components/Map/models";
import { radiiOf as shapeRadii } from "@shared/logic/footprint";

// `rounds` shows the first round and oval rooms (2026-10-19): furnished by the planner (furnishRoom) on their curve.
const ROUNDS: [string, number, number, string, string][] = [["round", 9, 9, "cantina", "Main bar"], ["oval", 11, 7, "guardhouse", "Guard post"], ["round", 7, 7, "scrap dealer", "Back room"], ["round", 9, 9, "palace", "Audience chamber"], ["oval", 11, 7, "medcenter", "Ward"]];
// Caves (2026-10-30): a chamber and a tunnel in one sheet of rock each (walls to the roof, here without it so as to look in), a sloping
// passage between floors, and a cave's mouth seen from outside: a hill of rock with an arch. `?section=caves`
function Caves() {
  const way = (id: string, x: number, y: number, side: "n" | "s" | "e" | "w", kind: RoomAsset["kind"] = "door"): RoomAsset => ({ id, kind, name: kind === "exit" ? "Way out" : "Passage", x, y, w: 1, h: 1, side });
  const chamber = useMemo(() => caveMask(12, 9, [{ x: 0, y: 4, side: "w" }, { x: 11, y: 5, side: "e" }], "chamber", 5), []);
  const tunnel = useMemo(() => caveMask(11, 8, [{ x: 0, y: 2, side: "w" }, { x: 10, y: 6, side: "e" }], "tunnel", 9), []);
  const mouth = useMemo(() => caveMask(10, 8, [{ x: 0, y: 4, side: "w" }, { x: 9, y: 3, side: "e" }], "mouth", 3), []);
  return (
    <>
      <group position={[-14, 0, -4]}>
        <RoomShell width={12} height={9} plan={{ width: 12, height: 9, mask: chamber }} mood={{ buildingType: "cave", roomName: "Deep chamber", biome: "temperate" }} assets={[way("a", 0, 4, "w"), way("b", 11, 5, "e")]} floor="rock" wall="#555" fullWalls ceiling={!!new URLSearchParams(window.location.search).get("roof")} />
        <Label at={[6, 0.1, 10.5]} text="chamber (temperate)" />
      </group>
      <group position={[1, 0, -4]}>
        <RoomShell width={11} height={8} plan={{ width: 11, height: 8, mask: tunnel }} mood={{ buildingType: "cave", roomName: "Winding tunnel", biome: "ice" }} assets={[way("a", 0, 2, "w"), way("b", 10, 6, "e")]} floor="rock" wall="#555" fullWalls />
        <Label at={[5, 0.1, 9.5]} text="tunnel (ice)" />
      </group>
      <group position={[-14, 0, 10]}>
        <RoomShell width={14} height={3} plan={{ width: 14, height: 3, form: "stairs", climb: { toward: "w", levels: 1 } }} mood={{ buildingType: "cave", roomName: "Sloping passage down to Den", biome: "desert" }} assets={[way("a", 0, 1, "w"), way("b", 13, 1, "e")]} floor="rock" wall="#555" fullWalls />
        <Label at={[7, 0.1, 4.5]} text="sloping passage (desert)" />
      </group>
      <group position={[4, 0, 10]}>
        <CaveMound mask={mouth} exits={[{ x: 0, y: 4, side: "w" }]} w={10} h={8} biome="volcanic" tier="full" seed={10 * 31 + 8} />
        <group position={[0, 0, 4.5]} rotation={[0, Math.PI / 2, 0]}><RockArch biome="volcanic" tier="full" seed={4} dark /></group>
        <Label at={[5, 0.1, 9.5]} text="cave mouth from outside (volcanic)" />
      </group>
    </>
  );
}

// Water worlds (2026-10-30): a place on the sea (round towers on their gantries, catwalks between, the sea round them, a swimmer and a
// treader off the decking, the water craft), and beside it a place under the sea (domes, kelp, bubbles, fish). `?section=water`
function Water() {
  const boxes = { a: { x: 0, y: 0, width: 7, height: 7 }, b: { x: 14, y: 2, width: 6, height: 6 }, c: { x: 4, y: 14, width: 8, height: 8 } };
  const deck = useMemo(() => deckSquares({ boxes }, [{ x: 24, y: 10 }]), []);
  const swim = useMemo(() => ({ current: motion({ posture: 3 }) }), []);
  const ground = { x: -6, y: -6, w: 34, h: 34 };
  return (
    <>
      <group position={[-30, 0, -10]}>
        <Sea at={[11, SEA_Y, 11]} size={70} lite={false} />
        <Decks deck={deck} boxes={Object.values(boxes)} lite={false} />
        {Object.values(boxes).map((b, i) => (
          <group key={i} position={[b.x, 0, b.y]}><RoomBlock w={b.width} d={b.height} height={3.4 * (2 + i)} radii={shapeRadii("round", b.width, b.height)} wall="#e4e8ec" roof="#9aa6b2" parapet={false} band={false} /></group>
        ))}
        <FishSchools ground={ground} depth={SEA_Y - 0.45} count={3} lite={false} />
        {/* a swimmer going along, and one treading water */}
        <Walker at={[9, SWIM_Y, 11]} motionRef={swim} />
        <group position={[11, SWIM_Y, 9]}><MotionContext.Provider value={swim}><Figure kind="humanoid" ring={SIDE_COLORS.neutral} name="Treader" role="settler" species="Human" /></MotionContext.Provider></group>
        {["bongo", "aquadon", "hydro"].map((look, i) => (
          <group key={look} position={[22 + i * 3, SEA_Y - 0.1, 13]}><SpeederModel model={look === "hydro" ? "Speederbike" : "Landspeeder"} look={look} name={look} /></group>
        ))}
      </group>
      <group position={[18, 0, -10]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[11, 0.01, 11]}><planeGeometry args={[60, 60]} /><meshLambertMaterial color="#8fc0b4" /></mesh>
        <UnderSea boxes={Object.values(boxes)} ground={ground} lite={false} />
        {Object.values(boxes).map((b, i) => (
          <group key={i} position={[b.x, 0, b.y]}><RoomBlock w={b.width} d={b.height} height={3.4} radii={shapeRadii("round", b.width, b.height)} wall="#c9b48a" roof="#8a7a5a" parapet={false} band={false} /></group>
        ))}
        <FishSchools ground={ground} depth={2.6} count={5} lite={false} />
      </group>
    </>
  );
}
// A figure going round a small ring with its motion (for the swimmer)
function Walker({ at, motionRef }: { at: [number, number, number]; motionRef: { current: Motion } }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.35;
    if (!g.current) return;
    g.current.position.set(at[0] + Math.cos(t) * 2.5, at[1], at[2] + Math.sin(t) * 2.5);
    g.current.rotation.y = -t;
  });
  return <group ref={g}><MotionContext.Provider value={motionRef}><Figure kind="humanoid" ring={SIDE_COLORS.neutral} name="Swimmer" role="settler" species="Human" /></MotionContext.Provider></group>;
}

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
// `guns` (2026-11-05): the blasters of the weapon kit (tools/blender/build-weapons.py) held by people, the scopes on the rail
const GUNS: [string, number][] = [["Blaster pistol", 0], ["Hold-out blaster", 0], ["Blaster carbine", 0], ["Blaster rifle", 0], ["Heavy blaster rifle", 0], ["Sniper rifle", 0], ["Heavy repeater", 0], ["Blaster rifle", 2], ["Blaster rifle", 3], ["Blaster rifle", 4], ["Blaster rifle", 6]];
function Guns() {
  return (
    <Rows
      items={GUNS}
      per={6}
      gap={0.6}
      name={([n, z]) => (z ? `${n} ${z}x` : n)}
      draw={([n, z]) => {
        const gear = { ...gearOf({ equipment: [n], armor: { weapons: [n], body: null, shield: null }, abilityScores: {} }), ...(z ? { optic: z } : {}) };
        return <Figure kind="humanoid" ring={SIDE_COLORS.neutral} name={`Kel ${n} ${z}`} role="patron" species="Human" gear={gear} />;
      }}
    />
  );
}

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

// `moves` (2026-10-30): how people move and fight, a row for each thing held (nothing, a pistol, a rifle, a saber, a vibroblade, a pike)
// and a column for each thing done (standing, walking, running, crouched, prone, jumping, ready, firing or striking, a parry), then a row of
// a Jedi for each lightsaber style striking in turn. `?act=fire` (or another column) shows only that column, larger.
const MOVE_COLUMNS = ["stand", "walk", "run", "crouch", "prone", "jump", "ready", "attack", "block", "tread", "swim"] as const;
type MoveColumn = (typeof MOVE_COLUMNS)[number];
const MOVE_ROWS: { name: string; role: string; kind: string; species: string; wield?: "pistol" | "rifle" | "saber" | "vibro" | "pike" | "" }[] = [
  { name: "Tam", role: "settler", kind: "humanoid", species: "Human", wield: "" },
  { name: "Imperial officer", role: "officer", kind: "officer", species: "Human", wield: "pistol" },
  { name: "Stormtrooper", role: "trooper", kind: "trooper", species: "Human", wield: "rifle" },
  { name: "Jedi Knight", role: "jedi", kind: "force", species: "Human", wield: "saber" },
  { name: "Gang thug", role: "thug", kind: "humanoid", species: "Rodian", wield: "vibro" },
  { name: "Royal guard", role: "guard", kind: "humanoid", species: "Human", wield: "pike" },
];
function Acting({ act, speed = 0, style, index, children }: { act: MoveColumn | "forms"; speed?: number; style?: SaberStyle; index: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const m = useRef<Motion>(motion({ style }));
  const base = useRef<THREE.Vector3 | null>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + index * 0.37;
    const mo = m.current;
    const now = nowSeconds();
    mo.posture = act === "crouch" ? 1 : act === "prone" ? 2 : act === "tread" || act === "swim" ? 3 : 0;
    mo.ready = act === "ready" || act === "attack" || act === "block" || act === "forms" || act === "prone";
    mo.blocking = act === "block";
    mo.pitch = act === "ready" ? Math.sin(t * 0.8) * 0.3 : 0;
    mo.air = act === "jump" && t % 1.6 < 0.7;
    if ((act === "attack" || act === "forms") && now - Math.max(mo.firedAt, mo.swingAt) > (act === "forms" ? 1.1 : 0.9)) {
      mo.firedAt = now;
      beginSwing(mo, now);
      mo.kick = 0.5;
    }
    if (!g.current) return;
    base.current ??= g.current.position.clone();
    // walking and running go up and down the column; jumping goes up
    const k = speed ? Math.sin(t * speed * 0.5) : 0;
    g.current.position.set(base.current.x, base.current.y + (mo.air ? Math.sin(((t % 1.6) / 0.7) * Math.PI) * 0.45 : 0), base.current.z + k * 1.6);
    g.current.rotation.y = speed ? (Math.cos(t * speed * 0.5) >= 0 ? 0 : Math.PI) : 0;
  });
  return <group ref={g}><MotionContext.Provider value={m}>{children}</MotionContext.Provider></group>;
}
function Moves({ only }: { only?: string }) {
  const cols = MOVE_COLUMNS.filter((c) => !only || c === only);
  return (
    <>
      {MOVE_ROWS.map((r, i) =>
        cols.map((c, j) => (
          <group key={`${r.name}-${c}`} position={[(j - (cols.length - 1) / 2) * 1.7, 0, i * 2.4 - 6]}>
            <Acting act={c} index={i * 9 + j} speed={c === "walk" ? 1.4 : c === "run" ? 3.2 : c === "swim" ? 1.2 : 0}>
              <Figure kind={r.kind} ring={SIDE_COLORS.neutral} name={r.name} role={r.role} species={r.species} wield={r.wield} />
            </Acting>
            {i === 0 && <Label at={[0, 0.05, -1.4]} text={c} />}
          </group>
        )),
      )}
      {SABER_STYLES.map((st, j) => (
        <group key={st} position={[(j - (SABER_STYLES.length - 1) / 2) * 1.6, 0, MOVE_ROWS.length * 2.4 - 4]}>
          <Acting act="forms" style={st} index={j}>
            <Figure kind="force" ring={SIDE_COLORS.neutral} name={`${st} master`} role="jedi" species="Human" wield="saber" />
          </Acting>
          <Label at={[0, 0.05, 1.3]} text={st} />
        </group>
      ))}
    </>
  );
}

// `sabers` (2026-11-04, the user: "AAA style combos ... based on the lightsabre forms and the type of weapon"): a row for each kind of weapon (a single
// blade, a broadsaber, a crossguard, a double blade, two blades, a whip) and a column for each form, each figure fighting its combos one after another
// (the next move beginning as the last runs out; a pause, then the form's next combo). `?section=sabers&kit=staff` shows one row, larger;
// `&style=ataru` one figure; `&combo=1&move=2&u=0.6` holds it at 60% of the third move of its second combo (to look at one pose)
function Duelist({ kit, style, combo, move, u, index, named }: { kit: SaberKit; style: SaberStyle; combo?: number; move?: number; u?: number; index: number; named?: string }) {
  const m = useRef<Motion>(motion({ style, kit, ready: true }));
  const next = useRef(0);
  // (where a figure's combos begin is set by who it is: limbs.ts humanPose, from its persona)
  const seed = useMemo(() => Math.floor(personaOf(hue("Duelist")).phase * 3), []);
  useFrame(() => {
    const mo = m.current;
    const now = nowSeconds();
    const set = styleFor(kit, style);
    if (move !== undefined) {
      // (held: every frame the swing began `u` of the move ago)
      mo.combo = combo ?? 0;
      mo.chain = move;
      // (`&name=pirouette`: the first move of that name in the form's combos, wherever it is)
      if (named) {
        const at = set.combos.findIndex((cb) => cb.some((mm) => mm.name === named));
        if (at >= 0) { mo.combo = (((at - seed) % set.combos.length) + set.combos.length) % set.combos.length; mo.chain = set.combos[at].findIndex((mm) => mm.name === named); }
      }
      mo.swingAt = now - (u ?? 0.5) * moveSeconds(set, moveOf(set, mo, 0, seed));
      mo.prevAt = undefined;
      return;
    }
    if (now < next.current) return;
    beginSwing(mo, now);
    const c = comboOf(set, mo, seed);
    const dur = moveSeconds(set, moveOf(set, mo, 0, seed));
    const last = (mo.chain ?? 0) >= c.length - 1;
    // (the next move begins as this one runs out; after the combo's last, a pause longer than the gap that makes a combo)
    next.current = now + (last ? Math.max(dur + 0.8, 1.7) : dur * 0.8) + index * 0.0;
    mo.hitAt = now + 0.4;
  });
  return <MotionContext.Provider value={m}><Figure kind="force" ring={SIDE_COLORS.neutral} name="Duelist" role="jedi" species="Human" wield="saber" kit={kit} /></MotionContext.Provider>;
}
function Sabers({ only, one, combo, move, u, strip, named }: { only?: string; one?: string; combo?: number; move?: number; u?: number; strip?: number[]; named?: string }) {
  const kits = SABER_KITS.filter((k) => !only || k === only);
  const styles = SABER_STYLES.filter((st) => !one || st === one);
  const gap = only ? 2.2 : 1.7;
  // (`&us=0.1,0.3,0.5,...`: one move of one figure at each of those points of it, side by side: a film strip)
  if (strip) return <>{strip.map((x, i) => <group key={i} position={[(i - (strip.length - 1) / 2) * 1.6, 0, -4]}><Duelist kit={(only as SaberKit) ?? "single"} style={(one as SaberStyle) ?? "niman"} combo={combo ?? 0} move={move ?? 0} u={x} index={0} named={named} /><Label at={[0, 0.05, 1.2]} text={String(x)} />{i === 0 && <Label at={[0, 2.4, 0]} text={named ? named : (() => { const st = styleFor((only as SaberKit) ?? "single", (one as SaberStyle) ?? "niman"); const mm = { combo: combo ?? 0, chain: move ?? 0 }; return `${comboOf(st, mm, Math.floor(personaOf(hue("Duelist")).phase * 3)).map((v) => v.name).join(" > ")}  [${move ?? 0}]`; })()} />}</group>)}</>;
  return (
    <>
      {kits.map((kit, i) => styles.map((st, j) => (
        <group key={`${kit}-${st}`} position={[(j - (styles.length - 1) / 2) * gap, 0, i * (only ? 0 : 3.2) - 4]}>
          <Duelist kit={kit} style={st} combo={combo} move={move} u={u} index={i * 11 + j} />
          {i === 0 && <Label at={[0, 0.05, 1.2]} text={`${st} (${FLAVOUR[st]})`} />}
          {j === 0 && <Label at={[-1.1, 0.05, 0]} text={kit} />}
        </group>
      )))}
    </>
  );
}

// `saberCombo` (2026-11-04, the user: "a page with a dropdown for the attacker (weapon and form) and one for the defender, to display the aesthetic of each
// attack and defensive style"): two figures face to face. The attacker plays its combos, one blow after another; the defender answers as asked: parrying
// each blow with the guard moves of its own weapon and form, standing in its block, taking every blow, or trading combos with the attacker. The plan of
// who plays what, and when, is saberplay.ts `planDuel`; here it is looped, each figure told the move to play (`Motion.play`).
const KIT_LABELS: Record<SaberKit, string> = { single: "Lightsaber", broad: "Broadsaber", crossguard: "Crossguard saber (Kylo Ren)", staff: "Double-bladed staff (Darth Maul)", dual: "Two sabers (Ahsoka)", whip: "Lightwhip (Lumiya)" };
const FORM_LABELS: Record<SaberStyle, string> = { shiicho: "Shii-Cho (I)", makashi: "Makashi (II)", soresu: "Soresu (III)", ataru: "Ataru (IV)", shien: "Shien (Va)", djemso: "Djem So (Vb)", niman: "Niman (VI)", juyo: "Juyo / Vaapad (VII)", jarkai: "Jar'Kai", trakata: "Trakata", sokan: "Sokan" };
const MODE_LABELS: Record<DuelMode, string> = { parry: "Parries each blow with its own guard moves", guard: "Stands in its block", hit: "Takes every blow", trade: "Trades combos: each defends while the other attacks" };
interface DuelConfig { a: Fighter; d: Fighter; mode: DuelMode; pick: number | "all" }
const asKit = (v: string | null, fallback: SaberKit): SaberKit => (SABER_KITS.includes(v as SaberKit) ? (v as SaberKit) : fallback);
const asForm = (v: string | null, fallback: SaberStyle): SaberStyle => (SABER_STYLES.includes(v as SaberStyle) ? (v as SaberStyle) : fallback);
const duelFromQuery = (q: URLSearchParams): DuelConfig => ({
  a: { kit: asKit(q.get("a"), "single"), style: asForm(q.get("af"), "ataru") },
  d: { kit: asKit(q.get("d"), "single"), style: asForm(q.get("df"), "soresu") },
  mode: DUEL_MODES.includes(q.get("mode") as DuelMode) ? (q.get("mode") as DuelMode) : "parry",
  pick: q.get("combo") && q.get("combo") !== "all" ? Number(q.get("combo")) : "all",
});
function SaberDuel({ duel, caption }: { duel: DuelConfig; caption: { current: HTMLDivElement | null } }) {
  const plan = useMemo(() => planDuel(duel.a, duel.d, duel.mode, duel.pick === "all" ? undefined : duel.pick), [duel.a.kit, duel.a.style, duel.d.kit, duel.d.style, duel.mode, duel.pick]);
  const ma = useRef<Motion>(motion({ style: duel.a.style, kit: duel.a.kit, ready: true }));
  const md = useRef<Motion>(motion({ style: duel.d.style, kit: duel.d.kit, ready: true }));
  const began = useRef(nowSeconds());
  useEffect(() => { began.current = nowSeconds(); }, [plan]);
  useFrame(() => {
    const now = nowSeconds();
    const t = (now - began.current) % plan.length;
    const base = now - t;
    const lines: string[] = [];
    for (const who of ["a", "d"] as const) {
      const mo = (who === "a" ? ma : md).current;
      const side = who === "a" ? duel.a : duel.d;
      mo.style = side.style;
      mo.kit = side.kit;
      mo.ready = true;
      let cur: (typeof plan.events)[number] | undefined;
      for (const e of plan.events) if (e.who === who && e.at <= t) cur = e;
      mo.play = cur ? { move: cur.move, at: base + cur.at, prev: cur.prev && { move: cur.prev.move, at: base + cur.prev.at } } : undefined;
      mo.blocking = plan.holds.some((h) => h.who === who && t >= h.from && t < h.to);
      for (const f of plan.flinches) if (f.who === who && t >= f.at && t < f.at + 0.4) mo.hitAt = base + f.at;
      const doing = cur && t - cur.at < moveSeconds(styleFor(side.kit, side.style), cur.move) ? `${cur.move.name} (${cur.move.kind})` : mo.blocking ? "in its block" : "in its guard";
      lines.push(`${who === "a" ? "Attacker" : "Defender"}: ${doing}`);
    }
    if (caption.current) caption.current.textContent = lines.join("\n");
  });
  return (
    <>
      <group position={[0, 0, -1.0]}>
        <MotionContext.Provider value={ma}><Figure key={`a-${duel.a.kit}`} kind="force" ring={SIDE_COLORS.hostile} name="Dark Attacker" role="jedi" species="Human" wield="saber" kit={duel.a.kit} /></MotionContext.Provider>
        <Label at={[0, 2.4, 0]} text={`${KIT_LABELS[duel.a.kit].replace(/ \(.*/, "")}\n${FORM_LABELS[duel.a.style]}`} />
      </group>
      <group position={[0, 0, 1.0]} rotation={[0, Math.PI, 0]}>
        <MotionContext.Provider value={md}><Figure key={`d-${duel.d.kit}`} kind="force" ring={SIDE_COLORS.friendly} name="Jedi Defender" role="jedi" species="Human" wield="saber" kit={duel.d.kit} /></MotionContext.Provider>
        <group rotation={[0, Math.PI, 0]}><Label at={[0, 2.4, 0]} text={`${KIT_LABELS[duel.d.kit].replace(/ \(.*/, "")}\n${FORM_LABELS[duel.d.style]}`} /></group>
      </group>
    </>
  );
}
// The dropdowns: a weapon and a form for the attacker, the same for the defender, which combo the attacker plays and how the defender answers
function SaberComboPanel({ duel, set, caption }: { duel: DuelConfig; set: (d: DuelConfig) => void; caption: { current: HTMLDivElement | null } }) {
  const combos = styleFor(duel.a.kit, duel.a.style).combos;
  const field = { background: "#101826", color: "#e6edf6", border: "1px solid #3a4a63", borderRadius: 4, padding: "3px 6px", fontSize: 13, maxWidth: 360 } as const;
  const side = (title: string, f: Fighter, put: (f: Fighter) => void) => (
    <div style={{ display: "grid", gridTemplateColumns: "76px auto auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
      <b>{title}</b>
      <select aria-label={`${title} weapon`} style={field} value={f.kit} onChange={(e) => put({ ...f, kit: e.target.value as SaberKit })}>{SABER_KITS.map((k) => <option key={k} value={k}>{KIT_LABELS[k]}</option>)}</select>
      <select aria-label={`${title} form`} style={field} value={f.style} onChange={(e) => put({ ...f, style: e.target.value as SaberStyle })}>{SABER_STYLES.map((s) => <option key={s} value={s}>{FORM_LABELS[s]}</option>)}</select>
    </div>
  );
  // (the address is kept to the choices, so that a view can be sent)
  const change = (d: DuelConfig) => {
    set(d);
    const q = new URLSearchParams(window.location.search);
    q.set("section", "saberCombo");
    q.set("a", d.a.kit); q.set("af", d.a.style); q.set("d", d.d.kit); q.set("df", d.d.style); q.set("mode", d.mode); q.set("combo", String(d.pick));
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  };
  return (
    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, background: "rgba(10,14,22,0.88)", color: "#e6edf6", font: "13px system-ui, sans-serif", padding: 10, borderRadius: 8, maxWidth: "calc(100% - 16px)" }}>
      {side("Attacker", duel.a, (a) => change({ ...duel, a, pick: "all" }))}
      {side("Defender", duel.d, (d) => change({ ...duel, d }))}
      <div style={{ display: "grid", gridTemplateColumns: "76px auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <b>Combo</b>
        <select aria-label="Attacker's combo" style={field} value={String(duel.pick)} onChange={(e) => change({ ...duel, pick: e.target.value === "all" ? "all" : Number(e.target.value) })}>
          <option value="all">All of its combos, in turn</option>
          {combos.map((c, i) => <option key={i} value={i}>{`${i + 1}: ${c.length} strikes: ${c.map((m) => m.name).join(" > ")}`}</option>)}
        </select>
        <b>Defender</b>
        <select aria-label="How the defender answers" style={field} value={duel.mode} onChange={(e) => change({ ...duel, mode: e.target.value as DuelMode })}>{DUEL_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select>
      </div>
      <div ref={caption} style={{ whiteSpace: "pre", color: "#facc15", minHeight: 36 }} />
    </div>
  );
}

// A droideka (one model that folds onto its wheel: models.tsx Droideka) circling at a run, so it is rolled up, with another standing in a fight
// beside it, and one that walks to and fro in the middle, stopping at each end to unfold (`?section=droideka&cam=0,3,6&look=0,0.4,0`)
function Circler({ radius, speed, children }: { radius: number; speed: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const a = (clock.getElapsedTime() * speed) / radius;
    g.current.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    g.current.rotation.y = a + Math.PI / 2;
  });
  return <group ref={g}>{children}</group>;
}
function Droidekas() {
  return (
    <>
      <Circler radius={2.6} speed={3}><Figure kind="droid" ring={SIDE_COLORS.hostile} name="Destroyer Droid" creature="droid" /></Circler>
      <group position={[-0.9, 0, 0]}><Figure kind="droid" ring={SIDE_COLORS.hostile} name="Destroyer Droid" creature="droid" fighting /></group>
      <Pacer z={1.4} speed={0.5}><Figure kind="droid" ring={SIDE_COLORS.hostile} name="Destroyer Droid" creature="droid" /></Pacer>
    </>
  );
}

// The droids of the stat blocks side by side with a person at each end of a row (2026-11-04, the user: "a deep analysis of the scales of droids"), by the
// size the book gives them: the smallest in front, the Huge machines behind. `?section=scale&cam=0,6,26&look=0,1,6`
const SCALE_ROWS: { gap: number; z: number; droids: [string, string][] }[] = [
  { gap: 1.3, z: 0, droids: [["DRK-1 Tracker Droid", "Tiny"], ["Pistoeka sabotage droid", "Tiny"], ["BB Series Astromech Droid", "Small"], ["R2 Series Astromech Droid", "Small"], ["C1 Series Astromech Droid", "Small"], ["Gonk Droid", "Small"], ["DUM-Series PIT Droid", "Small"], ["GH-7 Medical Analysis Unit", "Small"]] },
  { gap: 1.3, z: 2.4, droids: [["3P0 Series", "Medium"], ["B1 Series, B1-A", "Medium"], ["BX Series, BX-A", "Medium"], ["T-Series Tactical Droid", "Medium"], ["B2 Series, B2-A", "Medium"], ["IG Series, Model 88", "Medium"], ["HK Series, HK-47", "Medium"], ["KX-Series Security Droid", "Medium"], ["Junk Droid", "Medium"]] },
  { gap: 2.2, z: 5.6, droids: [["Destroyer Droid", "Large"], ["DSD1 Dwarf Spider Droid", "Large"], ["JK-13 Security Droid", "Large"], ["Viper Probe Droid", "Large"]] },
  { gap: 4.2, z: 11, droids: [["Hyena-Class Bomber", "Huge"], ["Vulture-Class Droid", "Huge"], ["NR-N99 Persuader-Class Enforcer", "Huge"], ["IG-227 Hailfire-Class Droid", "Huge"], ["Junk Behemoth", "Huge"]] },
];
function Scale() {
  return (
    <>
      {SCALE_ROWS.map((row) => (
        <Rows key={row.z} z={row.z} items={[["Citizen", ""], ...row.droids]} per={row.droids.length + 1} gap={row.gap} name={([n]) => n.replace(/ Series| Droid|,.*$/g, "")} draw={([n, size]) => size
          ? <Figure kind="droid" ring={SIDE_COLORS.hostile} name={n} creature="droid" size={size} large={/large|huge/i.test(size)} />
          : <Figure kind="humanoid" ring={SIDE_COLORS.neutral} name={n} role="civilian" species="Human" />} />
      ))}
    </>
  );
}

// The war machines at the size of their stat blocks (2026-11-04; the user: "you missed the AAT, AT-AT, AT-ST and others"), a person beside the small ones,
// the walkers and the hailfire pacing on their own tracks: `?section=machines&cam=0,10,40&look=0,4,-8`
function Strider({ z, speed, span, children }: { z: number; speed: number; span: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    // (span 0: standing where it is, facing +x)
    const p = span ? (clock.getElapsedTime() * speed) % (4 * span) : 0;
    g.current.position.set(!span ? 0 : p < 2 * span ? -span + p : span - (p - 2 * span), 0, z);
    g.current.rotation.y = p < 2 * span ? Math.PI / 2 : -Math.PI / 2;
  });
  return <group ref={g}>{children}</group>;
}
const MACHINES: [string, string][] = [["Hidden Turret", "Medium"], ["Auto-Turret", "Medium"], ["Ax-108 Sentry Gun", "Medium"], ["B'omarr Brain Walker", "Medium"], ["1.4 FD P-Tower Turret", "Large"], ["LR1K Sonic Cannon", "Large"], ["DF.9 Anti-Infantry Turret", "Large"], ["74-Z Speeder Bike", "Large"]];
function Machines({ hold }: { hold?: boolean }) {
  const fig = (name: string, size: string) => <Figure kind="droid" ring={SIDE_COLORS.hostile} name={name} creature="construct" size={size} />;
  return (
    <>
      <Rows z={0} items={[["Citizen", ""], ...MACHINES]} per={9} gap={4} name={([n]) => n} draw={([n, size]) => size ? fig(n, size) : <Figure kind="humanoid" ring={SIDE_COLORS.neutral} name={n} role="civilian" species="Human" />} />
      <Strider z={6} speed={4} span={hold ? 0 : 9}><Figure kind="droid" ring={SIDE_COLORS.hostile} name="IG-227 Hailfire-Class Droid" creature="droid" size="Huge" /></Strider>
      <Strider z={-6} speed={2} span={hold ? 0 : 9}>{fig("AT-RT", "Large")}</Strider>
      <Strider z={-14} speed={3} span={hold ? 0 : 10}>{fig("AT-ST", "Huge")}</Strider>
      <Strider z={-30} speed={5} span={hold ? 0 : 16}>{fig("AAT", "Huge")}</Strider>
      <Strider z={-44} speed={4} span={hold ? 0 : 16}>{fig("TX-225 Occupier Tank", "Huge")}</Strider>
      <Strider z={-64} speed={5} span={hold ? 0 : 22}>{fig("AT-TE", "Gargantuan")}</Strider>
      <Strider z={-100} speed={5} span={hold ? 0 : 30}>{fig("AT-AT", "Gargantuan")}</Strider>
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
      {/* The gaits (2026-10-26): a BB unit rolls under its head, a droideka rolls up to run and unfolds at each end, a battle droid walks,
          a probe floats; a bantha and a tauntaun trot, an acklay goes on its legs in threes, a mynock beats its wings */}
      {([["droid", "BB Series Astromech Droid"], ["droid", "Destroyer Droid"], ["battledroid", "B1 Series Battle Droid"], ["droid", "Probe Droid"], ["beast", "Bantha"], ["beast", "Tauntaun"], ["beast", "Acklay"], ["beast", "Mynock"]] as const).map(([kind, name], i) => (
        <Pacer key={name} z={7.4 + i * 1.7} speed={0.8 + (i % 3) * 0.1}>
          <Figure kind={kind} ring={SIDE_COLORS.hostile} name={name} creature={kind === "beast" ? "beast" : "droid"} large={/bantha|acklay/i.test(name)} />
        </Pacer>
      ))}
      {/* The droid machines at their size (2026-11-04): a hailfire rolls on its two wheels, a vulture steps on its wings, a persuader glides on its
          treads, a probe floats (`?section=walk&cam=0,6,-24&look=0,1,-6`) */}
      {([["IG-227 Hailfire-Class Droid", "Huge"], ["Vulture-Class Droid", "Huge"], ["NR-N99 Persuader-Class Enforcer", "Huge"], ["Viper Probe Droid", "Large"]] as const).map(([name, size], i) => (
        <Pacer key={name} z={-5 - i * 4.5} speed={1.2 - i * 0.1}>
          <Figure kind="droid" ring={SIDE_COLORS.hostile} name={name} creature="droid" size={size} large />
        </Pacer>
      ))}
      {/* The undulating bodies (2026-11-04): serpents slither, a krayt dragon's six legs step, a lizard and a monkey-lizard crawl, a kaadu's tail
          lashes, a hutt talks with its hands (`?section=walk&cam=0,3,24&look=0,0,20`) */}
      {([["beast", "Opee Sea Killer"], ["beast", "Exogorth"], ["beast", "Krayt Dragon"], ["beast", "Snake"], ["beast", "Ysalamir"], ["beast", "Monkey-lizard"], ["beast", "Kaadu"], ["beast", "Dewback"], ["hutt", "Hutt"]] as const).map(([kind, name], i) => (
        <Pacer key={name} z={21 + i * 1.9} speed={0.7 + (i % 3) * 0.1}>
          <Figure kind={kind} ring={SIDE_COLORS.hostile} name={name} creature="beast" large={/krayt|exogorth|opee|hutt/i.test(name)} />
        </Pacer>
      ))}
    </>
  );
}

// A Sabacc table with the people who play at it (2026-10-27): the croupier deals, the players hold their cards and now and then draw, bet,
// think, call or fold, and one gets up and sits down again to show the standing and the sitting. `?section=table`; `?hold=1` freezes the gestures.
const PLAYERS: { name: string; role: string; species: string; shots: Shot[] }[] = [
  { name: "Vex the croupier", role: "croupier", species: "Human", shots: [] },
  { name: "Dax", role: "gambler", species: "Rodian", shots: ["draw", "bet", "think", "call"] },
  { name: "Mira", role: "smuggler", species: "Twi'lek", shots: ["think", "draw", "fold"] },
  { name: "Gor", role: "patron", species: "Wookiee", shots: ["bet", "draw", "call"] },
];
function Seated({ at, face, who, index, cycle }: { at: [number, number]; face: number; who: (typeof PLAYERS)[number]; index: number; cycle: boolean }) {
  const seat = useRef<SeatState>({ ...seatState(), sit: true, act: who.role === "croupier" ? "deal" : "hold", cards: who.role === "croupier" ? 0 : 2 });
  const key = useRef(0);
  useFrame(({ clock }) => {
    if (!cycle) return;
    const t = clock.elapsedTime + index * 1.7;
    // one gets up and sits down again, slowly, to show the standing (Gor)
    if (who.name === "Gor") seat.current.sit = Math.floor(t / 4) % 2 === 0;
    // a gesture every few seconds
    if (who.shots.length) {
      const n = Math.floor(t / 3.2);
      if (n !== key.current) { key.current = n; seat.current.shot = who.shots[n % who.shots.length]; seat.current.shotKey = n; }
    }
  });
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, face, 0]}>
      <Figure kind="humanoid" ring={SIDE_COLORS.neutral} name={who.name} role={who.role} species={who.species} seat={seat} />
    </group>
  );
}
function Table({ cycle }: { cycle: boolean }) {
  const stools = stoolsOf("Sabacc table", 2, 2);
  return (
    <group position={[0, 0, 4]}>
      <group position={[-1, 0, -1]}><Furniture name="Sabacc table" w={2} h={2} seed={3} /></group>
      {PLAYERS.map((who, i) => <Seated key={who.name} at={[stools[i].x - 1, stools[i].y - 1]} face={stools[i].face} who={who} index={i} cycle={cycle} />)}
    </group>
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
const WILD_PIECES = ["tree_broad", "tree_broad_m", "tree_broad_l", "tree_tall", "tree_tall_m", "tree_tall_l", "tree_conifer", "tree_conifer_m", "tree_conifer_l", "tree_conifer_xl", "tree_pine", "tree_pine_m", "tree_pine_l", "tree_pine_xl", "tree_birch", "cactus", "boulder", "rock", "rock_small", "log", "stump", "grass_tuft", "wildflowers", "fern", "reeds", "barrier", "crate_stack", "pylon", "banner", "grandstand"];
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
// The hair (?section=hair, 2026-11-04): each style of the men's list, each beard, and each style of the women's list, on a person whose name draws it (the style
// comes from the name's hash: models.tsx hairStyleOf), their faces to the front. Hair, brows and beards are cards (tools/blender/build-hair.py).
const SURNAMES = ["Vos", "Kel", "Dray", "Rook", "Tarn", "Orrin", "Venn", "Sael", "Mott", "Quill", "Brask", "Illis", "Corr", "Hale", "Nyx", "Pell", "Rane", "Soth", "Tavi", "Ulen", "Wren", "Yarl", "Zane", "Arvo", "Bex", "Cade", "Dorn", "Esk", "Fenn", "Garr"];
function Hairdos({ row }: { row?: number }) {
  const rows = useMemo(() => {
    const find = (gender: "male" | "female", ok: (seed: number) => boolean) => {
      for (const g of GIVEN_NAMES[gender]) for (const s of SURNAMES) if (ok(hue(`${g} ${s}`))) return `${g} ${s}`;
      return "";
    };
    const out: { name: string; label: string }[][] = [[], [], []];
    for (const style of new Set(HAIR_MALE)) out[0].push({ name: find("male", (s) => hairStyleOf(s, false) === style && !beardOf(s)), label: style || "bald" });
    for (const beard of new Set(BEARDS.filter(Boolean))) out[1].push({ name: find("male", (s) => beardOf(s) === beard), label: beard });
    for (const style of new Set(HAIR_FEMALE)) out[2].push({ name: find("female", (s) => hairStyleOf(s, true) === style), label: style });
    return out.map((r) => r.filter((x) => x.name));
  }, []);
  return (
    <>
      {rows.map((items, r) => (row === undefined || row === r) && (
        <Rows key={r} items={items} per={row === undefined ? 8 : 6} gap={row === undefined ? 0.95 : 0.5} z={row === undefined ? r * 3.2 : 0} name={(t) => t.label.replace("hair_", "").replace("beard_", "+ ")} draw={(t) => <Figure kind={tokenOf({ name: t.name, role: "patron" })} ring={SIDE_COLORS.neutral} name={t.name} role="patron" species="Human" />} />
      ))}
    </>
  );
}

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

// A make with every seat taken and a gun swinging round and up and down (models.tsx craftLayout; a gun lent where it has none), to see that
// the people sit in their seats and the gunner turns with the gun (?section=crews)
function CrewedMake({ m }: { m: (typeof VEHICLE_MAKES)[number] }) {
  const aims = useRef<GunAim[]>([{ yaw: 0, pitch: 0 }]);
  useFrame(({ clock }) => { aims.current[0] = { yaw: Math.sin(clock.elapsedTime * 0.6) * 2.2, pitch: 0.35 + Math.sin(clock.elapsedTime * 0.9) * 0.45 }; });
  const crew = useMemo(() => Array.from({ length: m.seats }, (_, i) => (i === 0 ? { kind: "player", player: true } : { kind: "person", name: `Crew ${m.name} ${i}`, role: i % 2 ? "mercenary" : "pilot" })), [m]);
  return <SpeederModel model={m.model} look={m.look} name={m.name} seats={m.seats} crew={crew} aims={aims} gunner />;
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
  const cam = triple(query.get("cam"), section === "saberCombo" ? [5.0, 1.8, 2.8] : section === "hair" ? [0, 2.0, 8.2] : section === "faces" ? [0, 0.95, 2.4] : section === "guns" ? [0, 0.85, 3.6] : [0, 9, 12]);
  const look = triple(query.get("look"), section === "saberCombo" ? [0, 0.95, 0] : section === "hair" ? [0, 0.8, 1.8] : section === "faces" || section === "guns" ? [0, 0.7, 0] : [0, 0, section === "places" ? 14 : 3]);
  const [duel, setDuel] = useState<DuelConfig>(() => duelFromQuery(query));
  const caption = useRef<HTMLDivElement>(null);
  const roleList = [...ROLES.map((r) => ({ name: `Dax ${r}`, role: r })), ...BLOCKS.map((b) => ({ name: b, role: "" }))];
  const person = (name: string, role = "", species?: string) => <Figure kind={tokenOf({ name, role })} ring={SIDE_COLORS.neutral} name={name} role={role} species={species} />;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f16" }}>
      <Canvas shadows dpr={1} camera={{ position: cam, fov: 45 }} gl={babylonGl}>
        <Stats />
        <color attach="background" args={["#1b2430"]} />
        <ambientLight intensity={0.6} />
        <hemisphereLight args={["#cfe0ff", "#3a3020", 0.5]} />
        <directionalLight position={[8, 14, 10]} intensity={0.95} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 6]} receiveShadow visible={section !== "water"}>
          <planeGeometry args={[80, 80]} />
          <meshLambertMaterial color="#39424e" />
        </mesh>
        {section === "people" && <Rows items={query.get("only") ? query.get("only")!.split(",").map((s) => SPECIES.find((x) => x.toLowerCase().startsWith(s.toLowerCase())) ?? s) : SPECIES} per={query.get("only") ? 6 : 8} gap={query.get("only") ? 0.6 : 1.4} name={(s) => s} draw={(s) => person(`Kel ${s}`, "patron", s)} />}
        {/* ?section=faces[&names=A B,C D][&species=Zabrak]: the same species under different names, to see the faces, brows and tattoos told apart (cam and look as for a close look) */}
        {section === "faces" && <Rows items={(query.get("names") ?? "Dax Vos,Mara Vos,Kel Orn,Tessa Rho,Brek Tal,Ila Venn").split(",")} per={6} gap={0.42} name={(s) => s} draw={(s) => <Figure kind={tokenOf({ name: s, role: "patron" })} ring={SIDE_COLORS.neutral} name={s} role="patron" species={query.get("species") ?? "Human"} />} />}
        {/* ?section=guns: each blaster of the weapon kit in a person's hands, and a rifle with each size of scope (what a gun looks like in use: hands on the grip and under the handguard) */}
        {section === "guns" && <Guns />}
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
            {/* the makes of speeder (shared/logic VEHICLE_MAKES) */}
            <Rows z={20} items={VEHICLE_MAKES.filter((m) => m.name !== m.model)} per={5} gap={4} name={(m) => m.name} draw={(m) => <SpeederModel model={m.model} look={m.look} name={m.name} />} />
          </>
        )}
        {section === "crews" && <Rows items={VEHICLE_MAKES.filter((m) => m.name !== m.model || m.name === "Landspeeder")} per={5} gap={4.5} name={(m) => `${m.name} (${m.seats})`} draw={(m) => <CrewedMake m={m} />} />}
        {/* ?section=architecture (2026-11-05): the seven families of building, each a block with the crown that stands on its roof and the frame round its way in (interiors/architecture.ts) */}
        {section === "architecture" && (
          <>
            {([["adobe", "#c9a56e"], ["domed", "#e4dccb"], ["deco", "#8a94a3"], ["polar", "#dfe7ee"], ["timber", "#8a6a47"], ["hull", "#b8c4cf"], ["bunker", "#6b5a55"]] as [Family, string][]).map(([family, wall], i) => {
              const st = styleOf(family === "adobe" ? "desert" : family === "deco" ? "urban" : family === "polar" ? "ice" : family === "hull" ? "station" : family === "bunker" ? "volcanic" : family === "timber" ? "forest" : "temperate");
              const c = st.corner;
              return (
                <group key={family} position={[(i % 4) * 9 - 14, 0, Math.floor(i / 4) * 9 - 2]}>
                  <RoomBlock w={5} d={4} height={2.6} radii={[c, c, c, c]} wall={wall} roof="#4a525c" parapet band={st.band} />
                  {[0, 1, 2].map((n) => { const k = crownOf(family, n, 4); return k ? <ArchPiece key={n} name={k.piece} wall={wall} thatch={family === "timber"} position={k.corner ? [n === 1 ? 1.2 : 3.8, 2.65, n === 1 ? 1.0 : 3.0] : [2.5, 2.65, 2]} scale={4 * k.fit} /> : null; })}
                  <group position={[2.5, 0, 4.0]}>
                    <Opening kind="door" color="#f59e0b" style={st} />
                    <ArchPiece name={portalOf(family)} wall={wall} thatch={family === "timber"} position={[0, 0, 0.13]} />
                  </group>
                  <group position={[1.0, 0, 4.0]}><Opening kind="window" color="#7dd3fc" style={st} /></group>
                  <Label at={[2.5, 0.1, 5.4]} text={family} />
                </group>
              );
            })}
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
        {section === "caves" && <Caves />}
        {section === "water" && <Water />}
        {section === "packs" && <Packs />}
        {section === "walk" && <Walk />}
        {section === "droideka" && <Droidekas />}
        {section === "scale" && <Scale />}
        {section === "machines" && <Machines hold={query.get("hold") === "1"} />}
        {section === "moves" && <Moves only={query.get("act") ?? undefined} />}
        {section === "sabers" && <Sabers only={query.get("kit") ?? undefined} one={query.get("style") ?? undefined} combo={query.get("combo") ? Number(query.get("combo")) : undefined} move={query.get("move") ? Number(query.get("move")) : undefined} u={query.get("u") ? Number(query.get("u")) : undefined} strip={query.get("us") ? query.get("us")!.split(",").map(Number) : undefined} named={query.get("name") ?? undefined} />}
        {section === "saberCombo" && <SaberDuel duel={duel} caption={caption} />}
        {section === "hair" && <Hairdos row={query.get("row") ? Number(query.get("row")) : undefined} />}
        {section === "table" && <Table cycle={query.get("hold") !== "1"} />}
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
      {section === "saberCombo" && <SaberComboPanel duel={duel} set={setDuel} caption={caption} />}
    </div>
  );
}
