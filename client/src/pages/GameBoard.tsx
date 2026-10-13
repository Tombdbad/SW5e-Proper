import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GalaxyMap from "@/components/Map/GalaxyMap";
import LocalMap from "@/components/Map/LocalMap";
import PlayCombat from "@/components/Combat/PlayCombat";
import RoomPlan from "@/components/Map/RoomPlan";
import { useCombat, rollDamage } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";
import GMReportManager from "@/components/Campaign/GMReportManager";
import { toast } from "sonner";
import { carriedWeapons } from "@/lib/sw5e/characterCalculation";
import { getClassById } from "@/lib/sw5e/classes";
import { calculateArmorClass, calculateExperienceForLevel, castingStats, powerCost, powerEffect } from "@/lib/sw5e/rules";
import { getStarshipSize } from "@/lib/sw5e/starships";
import {
  exitsOf, trailOf, childrenOf, updateArea, advanceQuests, berthOf, hasPort, shipForTrip, passageFare,
  planBuilding, arrivalAlert, setAlert, watchDC, watchersOf, clearAlarms, skirmishGround, ALERT, ALERT_LEVELS,
  type Occupant,
  type World, type Area, type Exit, type LootCache, type PartyShip, type Quest, type Ship,
} from "@shared/logic";

// What each level of the watch means for the party (house rule, see shared/logic)
const WATCH_NOTE = [
  "They have not noticed you. You can slip past, take things or strike first, each on a Stealth check.",
  "They heard something and are looking around. One more slip and they will find you.",
  "They have stopped you and want to know your business. Talk your way through, go back, or fight.",
  "Weapons are out: leave the way you came or it comes to a fight.",
  "They attack on sight.",
];

const d20 = () => Math.floor(Math.random() * 20) + 1;
const modifier = (score?: number) => Math.floor(((score ?? 10) - 10) / 2);

// Define control keys for the game
const controls = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "backward", keys: ["KeyS", "ArrowDown"] },
  { name: "leftward", keys: ["KeyA", "ArrowLeft"] },
  { name: "rightward", keys: ["KeyD", "ArrowRight"] },
  { name: "action", keys: ["KeyE", "Space"] },
  { name: "menu", keys: ["Escape", "Tab"] },
];

export default function GameBoard() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeMapTab, setActiveMapTab] = useState<"galaxy" | "local">("galaxy");
  const [showCombat, setShowCombat] = useState(false);
  const { inCombat, initiateCombat, endCombat } = useCombat();
  const combatants = useCombat((s) => s.combatants);
  const { currentLocation, setCurrentLocation } = useMap();

  // Fetch campaign data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });
  const campaign: any = data;

  // The character is the one the campaign belongs to
  const gameCharacterId = (data as any)?.characterId as number | undefined;
  const { data: character, isLoading: characterLoading } = useQuery<any>({
    queryKey: ["game-character", gameCharacterId],
    queryFn: async () => {
      const r = await fetch(`/api/characters/${gameCharacterId}`);
      if (!r.ok) throw new Error("Failed to load character");
      return r.json();
    },
    enabled: !!gameCharacterId,
  });

  // Write the player's hit points and power points back to the database whenever combat changes them
  const queryClient = useQueryClient();
  const lastSavedHp = useRef<number | null>(null);
  const lastSavedPoints = useRef<number | null>(null);
  // The fight store outlives this page. A fight left over from another visit (perhaps another
  // character's) is dropped, and only a fight begun here is written back or acted on.
  const fightBegun = useRef(false);
  useEffect(() => {
    if (useCombat.getState().inCombat || useCombat.getState().combatants.length) endCombat();
  }, []);
  useEffect(() => {
    const p = combatants.find((c) => c.isPlayer);
    if (!p || !character || !fightBegun.current || p.id !== character.id) return;
    if (lastSavedHp.current === null) lastSavedHp.current = character.currentHp;
    if (lastSavedPoints.current === null) lastSavedPoints.current = character.currentForcePoints;
    const changes: Record<string, number> = {};
    if (p.hp !== lastSavedHp.current) changes.currentHp = lastSavedHp.current = p.hp;
    if (p.powerPoints !== undefined && p.powerPoints !== lastSavedPoints.current) changes.currentForcePoints = lastSavedPoints.current = p.powerPoints;
    if (!Object.keys(changes).length) return;
    fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    }).then(() => queryClient.invalidateQueries({ queryKey: ["game-character"] }));
  }, [combatants, character?.id]);

  // The generated world, when the campaign has one, and where in it the party is
  const world: World | null = campaign?.galaxyMap ?? null;
  const hereId: string | null = world ? (world.areas[campaign.currentLocation] ? campaign.currentLocation : world.startId) : null;
  const here: Area | null = world && hereId ? world.areas[hereId] : null;
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const [exploring, setExploring] = useState(false);
  const fightArea = useRef<string | null>(null);

  // Load campaign data when available
  useEffect(() => {
    if (data && !isLoading) {
      // Set initial location if available
      if (here) {
        setCurrentLocation({ id: here.id, name: here.name, type: here.type, description: here.description, coordinates: here.position });
        return;
      }
      const startName = (data as any).currentLocation || (data as any).startingLocation;
      const startLoc = ((data as any).locations || []).find((l: any) => l.name === startName);
      if (startLoc) {
        setCurrentLocation({ coordinates: { x: 0, y: 0, z: 0 }, ...startLoc });
      }
    }
  }, [data, isLoading, setCurrentLocation, here?.id]);

  // Show combat UI when in combat
  useEffect(() => {
    setShowCombat(inCombat);
  }, [inCombat]);

  // Save campaign fields; the page shows them at once
  const saveCampaign = async (changes: Record<string, any>) => {
    queryClient.setQueryData([`/api/campaigns/${campaignId}`], (old: any) => ({ ...old, ...changes }));
    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) toast.error("Could not save the campaign");
  };
  const saveCharacter = async (changes: Record<string, any>) => {
    queryClient.setQueryData(["game-character", gameCharacterId], (old: any) => ({ ...old, ...changes }));
    await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    queryClient.invalidateQueries({ queryKey: ["game-character"] });
  };

  // An ability check against a DC: d20 + the better of the given abilities (+ proficiency if trained)
  const proficiency = Math.ceil(1 + (Number(character?.level) || 1) / 4);
  const abilityCheck = (what: string, dc: number, abilities: string[], trained: boolean) => {
    const roll = d20();
    const bonus = Math.max(...abilities.map((a) => modifier(character.abilityScores?.[a]))) + (trained ? proficiency : 0);
    const success = roll + bonus >= dc;
    toast[success ? "success" : "error"](`${what}: ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${roll + bonus} against DC ${dc}. ${success ? "Success." : "Failed."}`);
    return success;
  };
  const carries = (pattern: RegExp) => (character?.equipment ?? []).some((name: string) => pattern.test(name));
  const skilled = (skill: string) => (character?.skillProficiencies ?? []).some((s: string) => s.toLowerCase() === skill);

  const hostiles = (here?.occupants ?? []).filter((o) => o.disposition === "hostile" && o.hitPoints);

  // A building from before rooms had floor plans gets its plan the first time the party is in it
  const planned = useRef<string | null>(null);
  useEffect(() => {
    if (!world || !here || here.kind !== "room" || here.layout || !here.parentId || planned.current === here.parentId) return;
    planned.current = here.parentId;
    const next: World = JSON.parse(JSON.stringify(world));
    planBuilding(next, here.parentId);
    saveCampaign({ galaxyMap: next });
  }, [here?.id, !!here?.layout]);

  // The watch (house rule): how far the hostile creatures here have noticed the party. Where
  // nothing was recorded (an older save, enemies the game master added) they stand ready.
  const [sneaking, setSneaking] = useState(false);
  const alert = hostiles.length ? here?.alert ?? ALERT.confronting : ALERT.unaware;
  const allowed = hostiles.length > 0 && !!here?.allowed;
  const setWatch = (level: number, pass = false) => world && here && saveCampaign({ galaxyMap: setAlert(world, here.id, level, pass) });
  const stealthRoll = () => {
    const roll = d20();
    const bonus = modifier(character.abilityScores?.dexterity) + (skilled("stealth") ? proficiency : 0);
    return { roll, bonus, total: roll + bonus };
  };
  // Doing something under their noses: Dexterity (Stealth) against their passive Perception.
  // A miss puts them one step further on.
  const unseen = (what: string) => {
    if (!world || !here) return false;
    const dc = watchDC(world, here.id);
    const { roll, bonus, total } = stealthRoll();
    const made = total >= dc;
    toast[made ? "success" : "error"](`${what} (Stealth): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against their passive Perception ${dc}. ${made ? "Unnoticed." : "Noticed."}`);
    if (!made) setWatch(alert + 1);
    return made;
  };
  // Talking to those who stopped you: Charisma against 10 + their Wisdom + how dangerous the
  // place is; threats work on those already facing you down, but are harder
  const talk = (skill: "deception" | "persuasion" | "intimidation") => {
    if (!here) return;
    const dc = 10 + Math.max(0, ...watchersOf(here).map((o) => o.saves?.wisdom ?? 0)) + here.danger + (alert >= ALERT.confronting ? 5 : 0);
    if (abilityCheck(skill.charAt(0).toUpperCase() + skill.slice(1), dc, ["charisma"], skilled(skill))) {
      setWatch(ALERT.suspicious, true);
      toast.info("They let you pass, and keep an eye on you.");
    } else setWatch(alert + 1);
  };
  const exits: Exit[] = world && here ? exitsOf(world, here.id) : [];

  // The party's ships, and how a trip that needs one is made: in a ship of their own berthed
  // here (it burns fuel), or as a passenger (the fare is a house rule, see passageFare)
  const ships: PartyShip[] = Array.isArray(campaign?.starships) ? campaign.starships : [];
  const passageRate = getStarshipSize("Medium")?.fuelCost ?? 100;
  const tripBy = (exit: Exit) => {
    const { ship, reason } = here ? shipForTrip(ships, here.id, exit) : { ship: undefined, reason: "" };
    return { ship, reason, fare: ship ? 0 : passageFare(exit, passageRate) };
  };

  // Walk, drive or fly along an exit. A place nobody has been to is built on arrival.
  const travel = (exit: Exit) => {
    if (!here || !world) return;
    const changes: Record<string, any> = { currentLocation: exit.to };
    if (exit.needsShip) {
      const { ship, fare } = tripBy(exit);
      if (ship) {
        changes.starships = ships.map((s) => (s.id === ship.id ? { ...s, fuel: s.fuel - (exit.fuel ?? 0), areaId: exit.to } : s));
      } else if (fare > (character.credits ?? 0)) {
        toast.error(`Passage costs ${fare} credits and you have ${character.credits ?? 0}.`);
        return;
      } else if (fare) {
        saveCharacter({ credits: character.credits - fare });
        toast.info(`Passage paid: ${fare} credits.`);
      }
    }
    setCameFrom(here.id);
    const target = world.areas[exit.to];
    if (childrenOf(world, target.id).length === 0 && ["system", "planet", "settlement", "building"].includes(target.kind)) {
      explore(target.id, changes);
    } else {
      // Whoever is hostile there notices the party, or not, by how it comes in
      if (watchersOf(target).length) {
        const approach = exit.secret ? "secret" : sneaking ? "sneak" : "open";
        const { roll, bonus, total } = approach === "sneak" ? stealthRoll() : { roll: 0, bonus: 0, total: 0 };
        const level = arrivalAlert(world, target.id, approach, total);
        changes.galaxyMap = setAlert(world, target.id, level);
        const how = approach === "secret" ? `Through the ${target.secretEntry?.name.toLowerCase() ?? "secret way"}` : approach === "sneak" ? `Sneaking in (Stealth ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against ${watchDC(world, target.id)})` : "Walking in openly";
        toast[level <= ALERT.suspicious ? "success" : "error"](`${how}: ${WATCH_NOTE[level]}`);
      }
      saveCampaign(changes);
    }
  };

  // Take an exit, as the watch allows: those who have stopped the party bar every way but the
  // way back; past those who have not, it takes a Stealth check
  const leaveBy = (exit: Exit) => {
    if (hostiles.length > 0 && !allowed && exit.to !== cameFrom) {
      if (alert >= ALERT.questioning) {
        toast.error("Enemies bar the way onward.");
        return;
      }
      if (!unseen("Slipping past")) return;
    }
    if (exit.locked) unlock(exit);
    else travel(exit);
  };

  // A place tapped on the local map: go there when an exit leads to it
  const travelTo = (areaId: string) => {
    const exit = exits.find((e) => e.to === areaId && !e.hidden);
    if (!exit || inCombat || dead || exploring) return;
    leaveBy(exit);
  };

  // A ship standing here becomes the party's: bought at its value, or taken as a prize when it
  // belonged to the enemy and nobody is left to stop it. It comes fuelled.
  const acquireShip = (ship: Ship, price: number) => {
    if (!world || !here) return;
    if (price > (character.credits ?? 0)) {
      toast.error(`${ship.name} costs ${price.toLocaleString()} credits and you have ${(character.credits ?? 0).toLocaleString()}.`);
      return;
    }
    if (price) saveCharacter({ credits: character.credits - price });
    const mine: PartyShip = { ...ship, owner: character.name, fuel: getStarshipSize(ship.size)?.fuelCapacity ?? 5, areaId: berthOf(world, here.id) };
    saveCampaign({
      galaxyMap: updateArea(world, here.id, { ships: here.ships.filter((s) => s.id !== ship.id) }).world,
      starships: [...ships, mine],
    });
    toast.success(`${ship.name} is yours${price ? ` for ${price.toLocaleString()} credits` : ""}.`);
  };

  // Fill a ship's tanks at a port, as far as the credits go
  const refuel = (ship: PartyShip) => {
    const size = getStarshipSize(ship.size);
    const price = size?.fuelCost ?? passageRate;
    const units = Math.min((size?.fuelCapacity ?? ship.fuel) - ship.fuel, Math.floor((character.credits ?? 0) / price));
    if (units <= 0) {
      toast.error(`Fuel is ${price} credits a unit here and you have ${character.credits ?? 0}.`);
      return;
    }
    saveCharacter({ credits: character.credits - units * price });
    saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, fuel: s.fuel + units } : s)) });
    toast.success(`${ship.name}: ${units} units of fuel for ${units * price} credits.`);
  };

  // A campaign from before the world generator gets a world of its own: the party starts at its
  // starting place, and the quests read off the world join the ones the campaign had
  const generateWorld = async () => {
    setExploring(true);
    try {
      const response = await fetch("/api/world/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: { partyLevel: level } }),
      });
      if (!response.ok) throw new Error("The server could not generate a world");
      const generated = await response.json();
      await saveCampaign({ galaxyMap: generated.world, currentLocation: generated.world.startId, quests: [...quests, ...(generated.quests ?? [])] });
      toast.success("The campaign has a world now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setExploring(false);
    }
  };

  // Pick or slice a lock: Dexterity or Intelligence, trained with a security or slicer's kit
  const unlock = (exit: Exit) => {
    if (!world || !exit.pathId || !abilityCheck("Lock", exit.locked ?? 10, ["dexterity", "intelligence"], carries(/security kit|slicer's kit/i))) return;
    const paths = world.paths.map((p) => (p.id === exit.pathId ? { ...p, locked: undefined } : p));
    saveCampaign({ galaxyMap: { ...world, paths } });
  };

  // Look for hidden ways and caches: Wisdom (Perception)
  const search = () => {
    if (!world || !here) return;
    const hiddenPaths = world.paths.filter((p) => p.hidden && (p.from === here.id || p.to === here.id));
    const hiddenLoot = here.loot.filter((c) => c.hidden);
    // Secret ways: out of this room, or into the rooms of the building the party stands before
    const secretRooms = [here, ...childrenOf(world, here.id)].filter((a) => a.secretEntry && !a.secretEntry.found);
    if (!abilityCheck("Search", 12 + here.danger, ["wisdom"], skilled("perception"))) return;
    if (hiddenPaths.length + hiddenLoot.length + secretRooms.length === 0) {
      toast.info("There is nothing hidden here.");
      return;
    }
    const next = updateArea(world, here.id, { loot: here.loot.map((c) => ({ ...c, hidden: undefined })) }).world;
    const areas = { ...next.areas };
    for (const room of secretRooms) areas[room.id] = { ...areas[room.id], secretEntry: { ...room.secretEntry!, found: true } };
    if (secretRooms.length) toast.success(`Found: ${secretRooms.map((room) => `a ${room.secretEntry!.name.toLowerCase()}${room.id === here.id ? "" : ` into ${room.name}`}`).join(", ")}.`);
    saveCampaign({ galaxyMap: { ...next, areas, paths: next.paths.map((p) => (hiddenPaths.some((h) => h.id === p.id) ? { ...p, hidden: undefined } : p)) } });
  };

  // Go into a place nobody has mapped yet: the server builds what is inside
  const explore = async (areaId?: string, alsoSave: Record<string, any> = {}) => {
    if (!world || !here) return;
    setExploring(true);
    try {
      const response = await fetch("/api/world/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world, areaId: areaId ?? here.id }),
      });
      if (!response.ok) throw new Error("The server could not build this place");
      await saveCampaign({ galaxyMap: (await response.json()).world, ...alsoSave });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setExploring(false);
    }
  };

  // Open a cache (its lock first, if it has one) and take what is in it
  const takeLoot = (cache: LootCache) => {
    if (!world || !here) return;
    if (hostiles.length > 0 && !unseen("Taking it")) return;
    if (cache.locked && !abilityCheck("Lock", cache.locked, ["dexterity", "intelligence"], carries(/security kit|slicer's kit/i))) return;
    const gained = cache.items.flatMap((item) => Array.from({ length: item.quantity }, () => item.name));
    saveCharacter({ equipment: [...(character.equipment ?? []), ...gained], credits: (character.credits ?? 0) + cache.credits });
    const loot = here.loot.map((c) => (c.id === cache.id ? { ...c, items: [], credits: 0, locked: undefined, looted: true } : c));
    saveCampaign({ galaxyMap: updateArea(world, here.id, { loot }).world });
    toast.success(`Taken: ${[cache.credits && `${cache.credits} credits`, ...gained].filter(Boolean).join(", ") || "nothing"}`);
  };

  const level = Number(character?.level) || 1;
  const klass = getClassById(character?.class ?? "");
  const knownPowers: any[] = [...(character?.forcePowers ?? []), ...(character?.techPowers ?? [])].filter((power) => power?.name);
  const dead = (character?.conditions ?? []).includes("Dead");

  // What the character fights with: the weapons carried (see carriedWeapons), a species' natural
  // weapon when unarmed, and the powers known with the caster's numbers for each
  // A saved power has its name, level and text; its range, duration and concentration are looked up
  const { data: powerRows } = useQuery<any>({
    queryKey: ["power-facts"],
    queryFn: () => fetch("/api/sw5e/powers?fields=name,range,duration,concentration&limit=1000").then((r) => r.json()),
    enabled: knownPowers.length > 0,
    staleTime: Infinity,
  });
  const powerFacts = (name: string) => (Array.isArray(powerRows) ? powerRows : powerRows?.items ?? []).find((p: any) => p.name === name);
  // "60 feet" is 60, "Touch" 5, "Self" 0, "Self (15-foot cone)" 15; anything else has no limit here
  const rangeFeet = (text = ""): number | undefined => {
    const feet = text.match(/(\d+)[- ]f(?:ee|oo)t/i);
    return feet ? Number(feet[1]) : /^touch/i.test(text) ? 5 : /^self/i.test(text) ? 0 : undefined;
  };

  const combatKit = () => {
    // Of the weapons carried, the one with the best attack for each kind; unarmed otherwise
    const weapons = carriedWeapons(character).sort((a, b) => Number(!!a.natural) - Number(!!b.natural) || b.attackBonus - a.attackBonus);
    const melee = weapons.find((w) => !w.ranged);
    const ranged = weapons.find((w) => w.ranged);
    const order = { attack: 0, save: 0, condition: 1, heal: 1, other: 2 };
    return {
      meleeDice: melee?.dice,
      meleeWeapon: melee?.name,
      meleeAttack: melee?.attackBonus,
      meleeDamage: melee?.damageBonus,
      rangedDice: ranged?.dice,
      rangedWeapon: ranged?.name,
      rangedAttack: ranged?.attackBonus,
      rangedDamage: ranged?.damageBonus,
      reach: melee?.reach ?? 5,
      range: ranged?.range,
      // For the token: a lightsaber for those who use the Force
      role: (character?.forcePowers ?? []).length ? "force" : "player",
      // Armor picked up since the sheet was last worked out counts too
      armorClass: Math.max(character.armorClass, calculateArmorClass(character.abilityScores, character.equipment ?? [])),
      powerPoints: character?.currentForcePoints ?? 0,
      powers: knownPowers
        .map((power) => {
          const facts = powerFacts(power.name) ?? {};
          const effect = powerEffect({ duration: facts.duration, concentration: facts.concentration, ...power }, level);
          return { name: power.name as string, level: power.level as number, cost: powerCost(power), range: rangeFeet(power.range ?? facts.range), ...effect, ...castingStats(character.abilityScores, level, power) };
        })
        .sort((a, b) => order[a.kind] - order[b.kind] || a.level - b.level),
    };
  };

  // A hostile occupant as someone to fight: its stat block's armor, hit points, attack, speed and reach
  const foe = (o: Occupant, id: string, name: string) => ({
    id,
    name,
    hp: o.hitPoints!,
    maxHp: o.hitPoints!,
    initiative: 0,
    armorClass: o.armorClass ?? 10,
    attackBonus: o.attack?.bonus ?? 2,
    damageDice: o.attack?.damage ?? "1d4",
    rangedAttacker: o.attack?.ranged ?? true,
    saves: o.saves,
    speed: o.speed || 30,
    reach: o.attack?.ranged ? 5 : o.attack?.range ?? 5,
    range: o.attack?.ranged ? ([o.attack.range ?? 80, o.attack.long ?? (o.attack.range ?? 80) * 4] as [number, number]) : undefined,
    size: o.size,
    creature: o.creature,
    role: o.role,
  });

  // Fight the hostile creatures in this area, with their own armor, hit points and attacks
  const fight = () => {
    if (!character || !here || character.currentHp <= 0) return;
    // Those who never noticed the party lose the first round; any other fight raises the alarm
    autoFought.current = here.id;
    const surprise = alert === ALERT.unaware;
    if (!surprise && here.alert !== ALERT.attacking) setWatch(ALERT.attacking);
    // The ground: the room as planned, or open ground with what cover there is. The party
    // stands where it came in; the enemy where the plan has them.
    const ground = here.layout ?? skirmishGround(here);
    const ways = ground.assets.filter((a) => a.side && a.kind !== "window");
    const cameIn = ways.find((a) => a.to === cameFrom) ?? ways.find((a) => a.kind === "exit") ?? ways[0];
    const enemies = hostiles.flatMap((o) => {
      const spots = ground.assets.filter((a) => a.kind === "npc" && a.ref === o.id);
      return Array.from({ length: o.count }, (_, i) => ({ ...foe(o, `${o.id}-${i}`, o.count > 1 ? `${o.name} ${i + 1}` : o.name), ...(spots[i] ? { x: spots[i].x, y: spots[i].y } : {}) }));
    });
    // Two of a kind are told apart by a letter
    const twins = (name: string) => enemies.filter((e) => e.name === name);
    for (const enemy of [...enemies]) {
      const same = twins(enemy.name);
      if (same.length > 1) same.forEach((e, i) => (e.name = `${e.name} ${String.fromCharCode(65 + i)}`));
    }
    fightArea.current = here.id;
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
    fightBegun.current = true;
    initiateCombat(
      character, enemies, combatKit(), surprise,
      { width: ground.width, height: ground.height, assets: ground.assets.filter((a) => a.kind !== "npc" && (a.kind !== "loot" || here.loot.some((c) => c.id === a.ref && !c.hidden))), floor: world?.areas[here.parentId ?? ""]?.type },
      cameIn ? { x: cameIn.x, y: cameIn.y } : undefined,
    );
  };

  // Once they attack, the fight begins by itself (once for each time the party walks into it)
  const autoFought = useRef<string | null>(null);
  useEffect(() => {
    if (autoFought.current && autoFought.current !== here?.id) autoFought.current = null;
    if (!here || !character || alert !== ALERT.attacking || !hostiles.length || inCombat || dead || character.currentHp <= 0 || autoFought.current === here.id) return;
    autoFought.current = here.id;
    toast.error("They attack!");
    fight();
  }, [here?.id, alert, hostiles.length, !!character]);

  // How a fight ended. Won: the fallen leave the area and their gear stays behind. Stable: the
  // character comes to hours later with 1 hit point, back where they came from. Dead: dead.
  const outcome = useCombat((state) => state.outcome);
  useEffect(() => {
    if (inCombat || !outcome || !character || !fightBegun.current) return;
    fightBegun.current = false;
    const areaId = fightArea.current;
    fightArea.current = null;
    if (outcome === "dead") {
      saveCharacter({ currentHp: 0, conditions: ["Dead"] });
      toast.error(`${character.name} has died.`);
    } else if (outcome === "stable") {
      lastSavedHp.current = 1;
      saveCharacter({ currentHp: 1 });
      if (world && cameFrom && world.areas[cameFrom]) saveCampaign({ currentLocation: cameFrom });
      toast.info("Left for dead, you come to hours later with 1 hit point" + (cameFrom ? ", back the way you came." : "."));
    } else if (outcome === "victory" && areaId && world?.areas[areaId]) {
      const area = world.areas[areaId];
      const fallen = area.occupants.filter((o) => o.disposition === "hostile" && o.hitPoints);
      const gear = fallen.flatMap((o) => o.loadout.map((name) => ({ name, quantity: o.count, source: "equipment" as const })));
      const loot = gear.length ? [...area.loot, { id: `l-${Date.now().toString(36)}`, name: "Gear of the fallen", kind: "remains", credits: 0, items: gear }] : area.loot;
      saveCampaign({ galaxyMap: updateArea(world, areaId, { occupants: area.occupants.filter((o) => !fallen.includes(o)), loot }).world });
      const xp = fallen.reduce((sum, o) => sum + (o.xp ?? 0) * o.count, 0);
      if (xp) saveCharacter({ experience: (character.experience ?? 0) + xp });
      toast.success(`Victory${xp ? `: ${xp} XP` : ""}`);
    }
  }, [inCombat, outcome]);

  // Quests keep score of the world: objectives tick off as their targets are met, and a finished
  // quest pays its reward
  const quests: Quest[] = Array.isArray(campaign?.quests) ? campaign.quests : [];
  const payQuests = (finished: Quest[]) => {
    const credits = finished.reduce((sum, q) => sum + (q.reward?.credits ?? 0), 0);
    const experience = finished.reduce((sum, q) => sum + (q.reward?.experience ?? 0), 0);
    const items = finished.flatMap((q) => q.reward?.items ?? []);
    saveCharacter({
      ...(credits ? { credits: (character.credits ?? 0) + credits } : {}),
      ...(experience ? { experience: (character.experience ?? 0) + experience } : {}),
      ...(items.length ? { equipment: [...(character.equipment ?? []), ...items] } : {}),
    });
    for (const quest of finished) {
      const reward = [quest.reward?.credits && `${quest.reward.credits} credits`, quest.reward?.experience && `${quest.reward.experience} XP`, ...(quest.reward?.items ?? [])].filter(Boolean);
      toast.success(`Quest complete: ${quest.title}.${reward.length ? ` Reward: ${reward.join(", ")}.` : ""}`);
    }
  };
  useEffect(() => {
    if (!world || !hereId || !character || inCombat) return;
    const result = advanceQuests(world, quests, hereId);
    if (!result.changed) return;
    saveCampaign({ quests: result.quests });
    if (result.finished.length) payQuests(result.finished);
  }, [world, hereId, campaign?.quests, character?.id, inCombat]);

  // An objective the world cannot check (free text) is ticked by hand
  const tickObjective = (questId: string, index: number) => {
    const next = quests.map((quest) => {
      if (quest.id !== questId) return quest;
      const objectives = quest.objectives.map((o, i) => (i === index ? { ...o, completed: true } : o));
      return { ...quest, objectives, status: objectives.every((o) => o.completed) ? ("completed" as const) : quest.status };
    });
    saveCampaign({ quests: next });
    const done = next.find((quest) => quest.id === questId);
    if (done?.status === "completed") payQuests([done]);
  };

  // Rests, by the Player's Handbook. Short: spend a Hit Die (the class die + Constitution) to heal;
  // tech points come back. Long: all hit points and power points, and half the Hit Dice, come back.
  const hitDie = klass?.hitDie ?? 8;
  const hitDiceLeft = Math.max(0, level - (character?.hitDiceUsed ?? 0));
  const shortRest = () => {
    if (!character || inCombat) return;
    const changes: Record<string, number> = {};
    const notes: string[] = [];
    if (klass?.casterType === "Tech" && character.currentForcePoints < character.maxForcePoints) {
      changes.currentForcePoints = character.maxForcePoints;
      notes.push("tech points restored");
    }
    if (hitDiceLeft > 0 && character.currentHp < character.maxHp) {
      const healed = Math.max(0, rollDamage(`1d${hitDie}`, false) + modifier(character.abilityScores?.constitution));
      changes.currentHp = lastSavedHp.current = Math.min(character.maxHp, character.currentHp + healed);
      changes.hitDiceUsed = (character.hitDiceUsed ?? 0) + 1;
      notes.push(`a Hit Die (d${hitDie}) restores ${healed} hit points`);
    }
    if (Object.keys(changes).length) saveCharacter(changes);
    toast.info(`Short rest: ${notes.join("; ") || (hitDiceLeft ? "nothing to recover" : "no Hit Dice left")}.`);
  };
  const rest = async () => {
    if (!character || inCombat) return;
    if (character.currentHp < 1) {
      toast.error("A long rest needs at least 1 hit point to begin with.");
      return;
    }
    lastSavedHp.current = character.maxHp;
    lastSavedPoints.current = character.maxForcePoints;
    await saveCharacter({
      currentHp: character.maxHp,
      currentForcePoints: character.maxForcePoints,
      hitDiceUsed: Math.max(0, (character.hitDiceUsed ?? 0) - Math.max(1, Math.floor(level / 2))),
    });
    if (world && Object.values(world.areas).some((a) => a.alarm)) saveCampaign({ galaxyMap: clearAlarms(world) });
    toast.info("Long rest: hit points and power points restored, half your Hit Dice regained. Alarms have died down.");
  };

  // House rule, not in the books: a dead character can be brought back so the campaign can go on
  const revive = () => {
    lastSavedHp.current = 1;
    saveCharacter({ currentHp: 1, conditions: [] });
    toast.info("House rule: revived with 1 hit point.");
  };

  // Healing powers can be cast outside a fight
  const healingPowers = knownPowers.filter((power) => powerEffect(power, level).kind === "heal");
  const castHealing = (power: any) => {
    const cost = powerCost(power);
    if (!character || (character.currentForcePoints ?? 0) < cost) return;
    const healed = Math.max(1, rollDamage(powerEffect(power, level).dice!, false) + castingStats(character.abilityScores, level, power).modifier);
    lastSavedHp.current = Math.min(character.maxHp, character.currentHp + healed);
    lastSavedPoints.current = character.currentForcePoints - cost;
    saveCharacter({ currentHp: lastSavedHp.current, currentForcePoints: lastSavedPoints.current });
    toast.success(`${power.name}: ${healed} hit points regained.`);
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  // A practice fight for campaigns without a world: a trooper and a junior officer, from their stat blocks
  const startTestCombat = async () => {
    if (!character || character.currentHp <= 0) return;
    const foes = await Promise.all(
      ["trooper", "officer-junior"].map((statBlock) =>
        fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock }) }).then((r) => r.json()),
      ),
    );
    const enemies = foes.map((o: Occupant, i: number) => foe(o, `enemy-${i}`, o.name));
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
    fightBegun.current = true;
    initiateCombat(character, enemies, combatKit());
  };

  // How a trip that needs a ship will be made, for the exit's label
  const tripNote = (exit: Exit) => {
    if (!exit.needsShip) return "";
    const { ship, reason, fare } = tripBy(exit);
    if (ship) return `${ship.name}, ${exit.fuel} fuel`;
    return [fare ? `passage ${fare} cr` : "by shuttle", ships.length ? reason : ""].filter(Boolean).join("; ");
  };

  const pointsName = klass?.casterType === "Tech" ? "Tech Points" : "Force Points";
  const restButtons = character && (
    <div className="flex flex-wrap gap-2" data-testid="play-rest">
      <Button size="sm" variant="outline" onClick={shortRest} disabled={inCombat || dead || hostiles.length > 0}>
        Short rest
      </Button>
      <Button size="sm" variant="outline" onClick={rest} disabled={inCombat || dead || hostiles.length > 0}>
        Long rest
      </Button>
      {healingPowers.map((power) => (
        <Button
          key={power.name}
          size="sm"
          variant="outline"
          onClick={() => castHealing(power)}
          disabled={inCombat || dead || character.currentHp >= character.maxHp || character.currentForcePoints < powerCost(power)}
        >
          {power.name} ({powerCost(power)} pts)
        </Button>
      ))}
    </div>
  );

  if (isLoading || characterLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  if (error || !campaign || !character) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl mb-4">Failed to load game</div>
        <Link to="/">
          <Button>Return to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <KeyboardControls map={controls}>
        {/* 3D Map Canvas */}
        <Canvas
          shadows
          camera={{
            position: [0, 15, 15],
            fov: 75,
            near: 0.1,
            far: 1000
          }}
          gl={{
            antialias: true,
            powerPreference: "default"
          }}
        >
          <color attach="background" args={["#000000"]} />
          
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1} 
            castShadow 
            shadow-mapSize-width={2048} 
            shadow-mapSize-height={2048} 
          />
          
          {/* Maps */}
          {activeMapTab === "galaxy" ? (
            <GalaxyMap world={world} hereId={hereId} />
          ) : (
            <LocalMap world={world} hereId={hereId} onSelect={travelTo} />
          )}
        </Canvas>

        {/* UI Overlay */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 w-max max-w-[96vw]">
          <Card className="bg-gray-800 bg-opacity-80 text-white px-4 py-2">
            <div className="flex flex-wrap justify-center gap-2">
              <Button 
                variant={activeMapTab === "galaxy" ? "default" : "outline"} 
                onClick={() => setActiveMapTab("galaxy")}
              >
                Galaxy Map
              </Button>
              <Button 
                variant={activeMapTab === "local" ? "default" : "outline"} 
                onClick={() => setActiveMapTab("local")}
              >
                Local Map
              </Button>
              <Button variant="outline" onClick={toggleSidebar}>
                {showSidebar ? "Hide HUD" : "Show HUD"}
              </Button>
              {!inCombat && !world && (
                <Button variant="destructive" onClick={startTestCombat} disabled={character.currentHp <= 0 || dead}>
                  Test Combat
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Character HUD */}
        {showSidebar && (
          <div className="absolute top-0 right-0 h-screen w-80 bg-gray-800 bg-opacity-80 text-white p-4 pb-24 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">{character.name}</h2>
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span>HP</span>
                <span>{character.currentHp}/{character.maxHp}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-red-600 h-2.5 rounded-full" 
                  style={{ width: `${(character.currentHp / character.maxHp) * 100}%` }}
                ></div>
              </div>
            </div>

            {dead && (
              <div className="mb-4 p-2 rounded bg-red-900/50 text-sm" data-testid="play-dead">
                <p className="font-semibold">{character.name} is dead.</p>
                <p className="text-gray-300">By the rules this character's story is over. As a house rule you can bring them back.</p>
                <Button size="sm" variant="outline" className="mt-1" onClick={revive}>
                  Revive (house rule)
                </Button>
              </div>
            )}
            <p className="text-sm text-gray-300 mb-4" data-testid="play-hit-dice">
              Level {level} · Hit Dice {hitDiceLeft}/{level} (d{hitDie}) · {character.experience ?? 0} XP
              {level < 20 && (character.experience ?? 0) >= calculateExperienceForLevel(level + 1) && !inCombat && (
                <Link to={`/characters/${character.id}`} className="block text-yellow-400 underline" data-testid="play-level-up">
                  Level up available: open the character sheet
                </Link>
              )}
            </p>

            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span>{pointsName}</span>
                <span>{character.currentForcePoints}/{character.maxForcePoints}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${character.maxForcePoints ? (character.currentForcePoints / character.maxForcePoints) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {world && here ? (
              <div className="mb-4 space-y-2" data-testid="play-location">
                <h3 className="font-semibold">Location</h3>
                <p className="text-xs text-gray-400" data-testid="play-trail">
                  {trailOf(world, here.id).slice(2, -1).map((a) => a.name).join(" \u203a ")}
                </p>
                <p data-testid="play-here">
                  <span className="font-semibold">{here.name}</span>{" "}
                  <span className="text-sm text-gray-400">
                    ({here.kind}{here.kind !== "room" && here.type !== here.kind ? `, ${here.type}` : ""})
                  </span>
                </p>
                {here.description && <p className="text-sm text-gray-400">{here.description}</p>}

                {here.occupants.length + here.ships.length > 0 && (
                  <ul className="text-sm space-y-1" data-testid="play-occupants">
                    {here.occupants.map((o) => (
                      <li key={o.id} className={o.disposition === "hostile" ? "text-red-400" : o.disposition === "friendly" ? "text-green-300" : ""}>
                        {o.count > 1 ? `${o.count} x ` : ""}{o.name}
                        <span className="text-gray-400">
                          {" "}{[o.species, o.role, o.disposition, o.cr && `CR ${o.cr}`].filter(Boolean).join(", ")}
                        </span>
                      </li>
                    ))}
                    {here.ships.map((ship) => {
                      // The enemy's ship is a prize once nobody is left to guard it; any other is for sale
                      const prize = ship.owner === world.antagonist;
                      return (
                        <li key={ship.id} data-testid="play-ship">
                          {ship.name} <span className="text-gray-400">{ship.size} {ship.role.toLowerCase()}, {ship.status}, {ship.owner}</span>
                          {ship.status !== "wrecked" && ship.status !== "orbiting" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2 h-6 px-2"
                              disabled={inCombat || dead || hostiles.length > 0}
                              onClick={() => acquireShip(ship, prize ? 0 : ship.value)}
                            >
                              {prize ? "Take as a prize" : `Buy (${ship.value.toLocaleString()} cr)`}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {hostiles.length > 0 && (
                  <div className="space-y-1 rounded bg-red-950/40 p-2 text-sm" data-testid="play-watch">
                    <p>
                      <span className="font-semibold text-red-300">
                        Watch: {allowed ? "letting you pass" : ALERT_LEVELS[alert]}
                      </span>{" "}
                      <span className="text-gray-300">{allowed ? "They let you through, and watch what you do." : WATCH_NOTE[alert]}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!allowed && (alert === ALERT.questioning || alert === ALERT.confronting) && (
                        <>
                          {alert === ALERT.questioning && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => talk("deception")} disabled={inCombat || dead}>
                                Bluff
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => talk("persuasion")} disabled={inCombat || dead}>
                                Persuade
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" onClick={() => talk("intimidation")} disabled={inCombat || dead}>
                            Intimidate
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="destructive" onClick={fight} disabled={inCombat || dead || character.currentHp <= 0}>
                        {alert === ALERT.unaware ? "Ambush" : "Fight"}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">House rule: how enemies notice you is not in the books.</p>
                  </div>
                )}
                {here.layout && <RoomPlan world={world} here={here} onSelect={travelTo} />}

                {here.loot.filter((c) => !c.hidden).map((cache) => (
                  <div key={cache.id} className="text-sm flex flex-wrap items-center gap-2" data-testid="play-loot">
                    <span>
                      {cache.name}
                      {cache.looted && <span className="text-gray-400"> (empty)</span>}
                    </span>
                    {!cache.looted && (
                      <Button size="sm" variant="outline" onClick={() => takeLoot(cache)} disabled={inCombat || dead || (hostiles.length > 0 && (allowed || alert >= ALERT.questioning))}>
                        {cache.locked ? `Open (DC ${cache.locked})` : "Take"}
                      </Button>
                    )}
                  </div>
                ))}

                <div className="flex flex-col gap-1" data-testid="play-exits">
                  {exits.filter((exit) => !exit.hidden).map((exit) => {
                    // Enemies who have stopped the party bar every way but the way back
                    const barred = hostiles.length > 0 && exit.to !== cameFrom && !allowed && alert >= ALERT.questioning;
                    return (
                      <Button
                        key={`${exit.via}-${exit.to}`}
                        size="sm"
                        variant="outline"
                        className="h-auto whitespace-normal justify-start text-left"
                        disabled={inCombat || dead || exploring || barred}
                        onClick={() => leaveBy(exit)}
                      >
                        {exit.locked ? `Unlock (DC ${exit.locked}): ` : ""}{exit.label}{exit.via === "path" ? " to" : ""} {world.areas[exit.to].name}
                        {[exit.travel, tripNote(exit)].filter(Boolean).length > 0 && (
                          <span className="text-gray-400 ml-1">({[exit.travel, tripNote(exit)].filter(Boolean).join(", ")})</span>
                        )}
                      </Button>
                    );
                  })}
                  {hostiles.length > 0 && !allowed && alert >= ALERT.questioning && <p className="text-xs text-red-400">Enemies bar the way onward.</p>}
                  <label className="flex items-center gap-2 text-sm" data-testid="play-sneak">
                    <input type="checkbox" checked={sneaking} onChange={(e) => setSneaking(e.target.checked)} />
                    Move quietly (Stealth against whoever is watching)
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={search} disabled={inCombat || dead || hostiles.length > 0}>
                    Search
                  </Button>
                  {childrenOf(world, here.id).length === 0 && ["system", "planet", "settlement", "building"].includes(here.kind) && (
                    <Button size="sm" variant="outline" onClick={() => explore()} disabled={exploring || inCombat || dead}>
                      {exploring ? "Exploring..." : "Explore"}
                    </Button>
                  )}
                </div>
                {restButtons}

                {ships.length > 0 && (
                  <div className="text-sm space-y-1" data-testid="play-ships">
                    <h3 className="font-semibold">Your ships</h3>
                    {ships.map((ship) => (
                      <div key={ship.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {ship.name}{" "}
                          <span className="text-gray-400">
                            {ship.size} {ship.role.toLowerCase()}, fuel {ship.fuel}/{getStarshipSize(ship.size)?.fuelCapacity ?? "?"}
                            {ship.hyperdriveClass ? `, hyperdrive class ${ship.hyperdriveClass}` : ", no hyperdrive"}
                            {ship.areaId === here.id ? ", here" : `, at ${world.areas[ship.areaId]?.name ?? "an unknown berth"}`}
                          </span>
                        </span>
                        {ship.areaId === here.id && hasPort(world, here.id) && ship.fuel < (getStarshipSize(ship.size)?.fuelCapacity ?? 0) && (
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => refuel(ship)}>
                            Refuel ({getStarshipSize(ship.size)?.fuelCost} cr a unit)
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <div className="mb-4" data-testid="play-no-world">
              <h3 className="font-semibold mb-2">Location</h3>
              <p>{currentLocation?.name || campaign.currentLocation || "Unknown"}</p>
              <p className="text-sm text-gray-400 mt-1">
                This campaign has no world yet, so there is nowhere to travel, nobody to meet and nothing to find.
                Generating one adds star systems, planets, settlements and rooms with people, enemies, ships and loot, and quests to follow.
              </p>
              <Button size="sm" className="mt-2" onClick={generateWorld} disabled={exploring || inCombat || dead}>
                {exploring ? "Generating..." : "Generate a world"}
              </Button>
              <div className="mt-2">{restButtons}</div>
            </div>
            )}

              <Tabs defaultValue="quests">
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="quests">Quests</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="gm">GM Interface</TabsTrigger>
                </TabsList>
              
              <TabsContent value="quests">
                <h3 className="font-semibold mb-2">Active Quests</h3>
                <div className="space-y-2" data-testid="play-quests">
                  {quests.filter((q) => q.status === "active").map((quest) => (
                    <div key={quest.id} className="bg-gray-700 p-2 rounded">
                      <div className="font-semibold">{quest.title}</div>
                      <div className="text-sm mt-1">{quest.description}</div>
                      <ul className="text-sm mt-1 space-y-1">
                        {(quest.objectives ?? []).map((objective, index) => (
                          <li key={index} className={objective.completed ? "text-green-300" : ""}>
                            {objective.completed ? "\u2713" : "\u25cb"} {objective.description}
                            {!objective.completed && !objective.target && (
                              <Button size="sm" variant="outline" className="ml-2 h-6 px-2" disabled={inCombat || dead} onClick={() => tickObjective(quest.id, index)}>
                                Done
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {quest.reward && (quest.reward.credits > 0 || quest.reward.experience > 0) && (
                        <div className="text-xs text-gray-400 mt-1">
                          Reward: {[quest.reward.credits > 0 && `${quest.reward.credits} credits`, quest.reward.experience > 0 && `${quest.reward.experience} XP`, ...(quest.reward.items ?? [])].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                  {quests.some((q) => q.status === "completed") && (
                    <p className="text-sm text-green-300">Completed: {quests.filter((q) => q.status === "completed").map((q) => q.title).join("; ")}</p>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="inventory">
                <h3 className="font-semibold mb-2">Inventory</h3>
                <div className="space-y-1">
                  {character.equipment?.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item}</span>
                    </div>
                  ))}
            </div>
          </TabsContent>

          <TabsContent value="gm">
            <GMReportManager
              character={character}
              campaign={campaign}
              world={world}
              here={here}
              exits={exits}
              saveCharacter={saveCharacter}
              saveCampaign={saveCampaign}
              disabled={inCombat || dead}
            />
          </TabsContent>
        </Tabs>
      </div>
        )}

        {/* Combat UI */}
        {showCombat && <PlayCombat />}
      </KeyboardControls>
    </div>
  );
}
