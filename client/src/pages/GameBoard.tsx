import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GalaxyMap from "@/components/Map/GalaxyMap";
import { type MapAction } from "@/components/Map/GalaxyMap";
import LocalMap, { FightScene, viewOf, usePartySpot, whereNow, useClock } from "@/components/Map/LocalMap";
import PlayCombat from "@/components/Combat/PlayCombat";
import { useCombat, rollDamage } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";
import GMReportManager from "@/components/Campaign/GMReportManager";
import { toast } from "sonner";
import { carriedWeapons, characterFeatures, hagglingEdge } from "@/lib/sw5e/characterCalculation";
import { getSpeciesById } from "@/lib/sw5e/species";
import { getClassById } from "@/lib/sw5e/classes";
import { calculateArmorClass, calculateExperienceForLevel, castingStats, powerCost, powerEffect } from "@/lib/sw5e/rules";
import { getStarshipSize } from "@/lib/sw5e/starships";
import {
  exitsOf, trailOf, childrenOf, findPath, updateArea, advanceQuests, berthOf, hasPort, shipForTrip, passageFare,
  planBuilding, arrivalAlert, setAlert, watchDC, watchersOf, clearAlarms, skirmishGround, ALERT, ALERT_LEVELS, LIFE,
  START_TIME, DAY, hourOf, dayOf, clockText, partOfDay, tripMinutes, eraOf, eraById, lawAt, lawText,
  withPresence,
  waresOf, stockOf, offerFor, attitudeOf, attitudeName, marketAt, haggleDC, isOpen, openingHours, addRenown, emptyStanding, ledgerFor, factionAt,
  type Standing, type Ledger, type Customer, type TradeLine,
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

// The time, to the minute, with what follows it on the line; on its own so that the clock does
// not redraw the page every minute
function ClockLine({ after }: { after: string }) {
  const minutes = useClock((c) => c.minutes);
  return (
    <p className="text-xs text-amber-200" data-testid="play-clock">
      {clockText(minutes)}, {partOfDay(minutes)} · {after}
    </p>
  );
}

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

  // Time passes on the map
  const clockRunning = !!campaign?.galaxyMap && !inCombat && (character?.currentHp ?? 0) > 0;
  useEffect(() => {
    if (!clockRunning) return;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = useClock.getState().minutes + 1;
      useClock.getState().set(now);
      if (now % 60 === 0) saveClock(now);
    }, 1000);
    const hidden = () => document.visibilityState === "hidden" && saveClock();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", hidden);
      saveClock();
    };
  }, [clockRunning, campaignId]);

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

  // The campaign clock (shared/logic "Time"): read once when the campaign opens, then one game
  // minute passes every real second on the map (not in a fight, not while the tab is hidden).
  // It is saved every game hour, when the tab is hidden, and with anything that takes time.
  // The page and the map follow the clock in steps of five minutes (each step redraws them); the
  // clock line in the HUD shows every minute (ClockLine)
  const clock = useClock((c) => Math.floor(c.minutes / 5) * 5);
  const clockFor = useRef<string | null>(null);
  const clockValue = (total: number) => ({ total, days: dayOf(total) - 1, hours: Math.floor(hourOf(total)), minutes: Math.floor(total % 60) });
  const saveClock = (total = useClock.getState().minutes) =>
    fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeElapsed: clockValue(total) }), keepalive: true }).catch(() => {});
  useEffect(() => {
    if (!campaign || clockFor.current === String(campaignId)) return;
    clockFor.current = String(campaignId);
    useClock.getState().set(Number(campaign.timeElapsed?.total) || START_TIME);
  }, [campaign, campaignId]);
  // The world as it is just now: people where their routines put them, ships where their voyages
  // do (shared/logic "Routines"). Shown on the map and in the HUD; edits go to `world`.
  const scene = useMemo(() => (world ? withPresence(world, clock) : null), [world, clock]);
  const hereNow: Area | null = scene && hereId ? scene.areas[hereId] ?? null : null;

  // Let time pass: the clock moves on and the new time goes with the next save
  const pass = (minutes: number) => {
    const total = Math.round(useClock.getState().minutes + minutes);
    useClock.getState().set(total);
    return { timeElapsed: clockValue(total) };
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

  // A world from before the people in it had lives of their own is brought up to date once, on
  // the server (it needs the rules data): crowds become people, cantinas get a band
  const livened = useRef(false);
  useEffect(() => {
    if (!world || (world.life ?? 0) >= LIFE || livened.current) return;
    livened.current = true;
    const sent = world;
    fetch("/api/world/liven", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ world }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("The server could not update this world"))))
      .then((body) => {
        // Something changed the world meanwhile: try again from the new one
        if ((queryClient.getQueryData([`/api/campaigns/${campaignId}`]) as any)?.galaxyMap !== sent) livened.current = false;
        else saveCampaign({ galaxyMap: body.world });
      })
      .catch((error) => console.error(error));
  }, [world]);

  // A building from before rooms had floor plans gets its plan the first time the party is in
  // it or in front of it
  const planned = useRef<string | null>(null);
  const buildingId = here?.kind === "room" ? here.parentId : here?.kind === "building" ? here.id : null;
  const unplanned = !!world && !!buildingId && childrenOf(world, buildingId).some((a) => a.kind === "room" && !a.layout);
  useEffect(() => {
    if (!world || (world.life ?? 0) < LIFE || !buildingId || !unplanned || planned.current === buildingId) return;
    planned.current = buildingId;
    const next: World = JSON.parse(JSON.stringify(world));
    planBuilding(next, buildingId);
    saveCampaign({ galaxyMap: next });
  }, [buildingId, unplanned, world?.life]);

  // The 3D map: the place being looked at (the party's own, unless another was opened), and
  // whatever was last picked out on it
  const [viewId, setViewId] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ kind: "area" | "occupant" | "ship"; id: string } | null>(null);
  useEffect(() => {
    setViewId(null);
    setPicked(null);
  }, [hereId]);

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
    const { ship: flying } = exit.needsShip ? tripBy(exit) : { ship: undefined };
    const took = tripMinutes(exit, Number(flying?.hyperdriveClass) || 1);
    Object.assign(changes, pass(took));
    if (took >= 60) toast.info(`${Math.round(took / 6) / 10} hours on the way${exit.needsShip && !exit.travel ? " (house rule: an hour between the surface and orbit)" : ""}: it is ${clockText(useClock.getState().minutes)}.`);
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

  // A door, a way out or a secret way walked up to on the map: go through it
  const travelTo = (areaId: string, secret = false) => {
    const ways = exits.filter((e) => e.to === areaId && !e.hidden);
    const exit = ways.find((e) => !!e.secret === secret) ?? ways[0];
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
    const mine: PartyShip = { ...ship, voyage: undefined, owner: character.name, fuel: getStarshipSize(ship.size)?.fuelCapacity ?? 5, areaId: berthOf(world, here.id) };
    saveCampaign({
      // Taken from wherever the ship belongs (a ship on a voyage is kept at its home berth)
      galaxyMap: (() => {
        const base = Object.values(world.areas).find((a) => a.ships.some((s) => s.id === ship.id)) ?? here;
        return updateArea(world, base.id, { ships: base.ships.filter((s) => s.id !== ship.id) }).world;
      })(),
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
        body: JSON.stringify({ options: { partyLevel: level, era: eraById(campaign?.setting?.era).id } }),
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
    // stands where it stood on the map (else where it came in); the enemy where the plan has them.
    const ground = here.layout ?? skirmishGround(here);
    const ways = ground.assets.filter((a) => a.side && a.kind !== "window");
    const spot = usePartySpot.getState();
    const cameIn = here.layout && spot.areaId === here.id
      ? { x: spot.x - here.layout.x, y: spot.y - here.layout.y }
      : ways.find((a) => a.to === cameFrom) ?? ways.find((a) => a.kind === "exit") ?? ways[0];
    // Where they are drawn just now, else (not drawn, or caught in passing on someone else's square) where the plan has them
    const taken = new Set(cameIn ? [`${cameIn.x},${cameIn.y}`] : []);
    const spotOf = (a: { id: string; x: number; y: number }) => {
      const now = whereNow(a.id);
      const spot = now && !taken.has(`${now.x},${now.y}`) ? now : a;
      taken.add(`${spot.x},${spot.y}`);
      return spot;
    };
    const enemies = hostiles.flatMap((o) => {
      const spots = ground.assets.filter((a) => a.kind === "npc" && a.ref === o.id).map(spotOf);
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
      {
        width: ground.width,
        height: ground.height,
        assets: ground.assets.filter((a) => a.kind !== "npc" && (a.kind !== "secret" || here.secretEntry?.found) && (a.kind !== "loot" || here.loot.some((c) => c.id === a.ref && !c.hidden))),
        floor: world?.areas[here.parentId ?? ""]?.type,
        open: !here.layout,
      },
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
      // Renown: a fight costs standing with the side that lost it; the beasts of the wild have none
      if (fallen.some((o) => !["wildlife", "horror"].includes(o.role))) {
        const losers = world.areas[area.parentId ?? ""]?.faction ?? world.antagonist;
        const holder = factionAt(world, areaId);
        let renown = addRenown(standing, losers, -1);
        if (holder && holder !== losers) renown = addRenown(renown, holder, 1);
        saveCampaign({ factionInfluence: renown });
      }
      toast.success(`Victory${xp ? `: ${xp} XP` : ""}`);
    }
  }, [inCombat, outcome]);

  // Trade (shared/logic "Trade"): the equipment data with prices and descriptions, who the party
  // is to a trader, its renown and dealings (factionInfluence) and today's purchases and sales
  // (availableResources)
  const { data: equipmentData = [] } = useQuery<any[]>({
    queryKey: ["equipment-for-trade"],
    queryFn: async () => (await fetch("/api/sw5e/equipment?fields=name,cost,equipmentCategory,weaponClassification,armorClassification,description")).json(),
    staleTime: Infinity,
  });
  const today = dayOf(clock);
  const standing: Standing = campaign?.factionInfluence?.renown ? campaign.factionInfluence : emptyStanding();
  const ledger: Ledger = ledgerFor(campaign?.availableResources, today);
  const speciesFacts = getSpeciesById(character?.species ?? "");
  const customer: Customer = { species: speciesFacts?.name ?? character?.species, homeworld: (speciesFacts as any)?.homeworld, alignment: character?.alignment, standing };
  const haggling = useMemo(() => (character ? hagglingEdge(characterFeatures(character)) : {}), [character?.species, character?.feats]);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [itemShown, setItemShown] = useState<string | null>(null);
  const traderLedger = (id: string) => ledger.traders[id] ?? { bought: {}, sold: {} };
  const recordDeal = (traderId: string, change: (entry: Ledger["traders"][string]) => Ledger["traders"][string], dealt = true) =>
    saveCampaign({
      availableResources: { ...ledger, traders: { ...ledger.traders, [traderId]: change(traderLedger(traderId)) } },
      ...(dealt ? { factionInfluence: { ...standing, dealings: { ...standing.dealings, [traderId]: (standing.dealings[traderId] ?? 0) + 1 } } } : {}),
    });
  const buy = (trader: Occupant, line: TradeLine) => {
    if (line.price > (character.credits ?? 0)) {
      toast.error(`${line.name} costs ${line.price} credits and you have ${character.credits ?? 0}.`);
      return;
    }
    saveCharacter({ credits: character.credits - line.price, equipment: [...(character.equipment ?? []), line.name] });
    recordDeal(trader.id, (e) => ({ ...e, bought: { ...e.bought, [line.name]: (e.bought[line.name] ?? 0) + 1 } }));
    toast.success(`Bought ${line.name} for ${line.price} credits.${line.contraband ? " Contraband here (house rule): keep it out of sight." : ""}`);
  };
  const sell = (trader: Occupant, name: string, offer: number) => {
    const at = (character.equipment ?? []).indexOf(name);
    if (at < 0 || offer <= 0) return;
    saveCharacter({ credits: (character.credits ?? 0) + offer, equipment: (character.equipment ?? []).filter((_: string, i: number) => i !== at) });
    recordDeal(trader.id, (e) => ({ ...e, sold: { ...e.sold, [name]: (e.sold[name] ?? 0) + 1 } }));
    toast.success(`Sold ${name} for ${offer} credits.`);
  };
  // Haggling (house rule for the DC): Charisma (Persuasion), with what the character's features
  // give for it; once a day with each trader. Made, prices are 10% better today; missed by 5 or
  // more, a little worse.
  const haggle = (trader: Occupant, placeId: string) => {
    const attitude = attitudeOf(world!, trader, placeId, customer).score;
    const dc = haggleDC(trader, attitude);
    const first = d20();
    const roll = haggling.advantage ? Math.max(first, d20()) : first;
    const bonus = modifier(character.abilityScores?.charisma) + (haggling.expertise ? 2 * proficiency : skilled("persuasion") ? proficiency : 0);
    const won = roll + bonus >= dc;
    const how = [haggling.advantage && `advantage from ${haggling.advantage}`, haggling.expertise && `expertise from ${haggling.expertise}`].filter(Boolean).join(", ");
    toast[won ? "success" : "error"](`Haggling (Persuasion${how ? `, ${how}` : ""}): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${roll + bonus} against DC ${dc}. ${won ? "Prices 10% better today." : roll + bonus <= dc - 5 ? "They take offence: prices a little worse today." : "They will not budge."}`);
    recordDeal(trader.id, (e) => ({ ...e, haggle: won ? "won" : roll + bonus <= dc - 5 ? "lost" : "tried" }), false);
  };

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
    // Renown (Wretched Hives): those who hold the place are glad of it; the enemy is not
    const holder = world && hereId ? factionAt(world, hereId) : undefined;
    let renown = standing;
    for (const _ of finished) {
      if (holder && holder !== world?.antagonist) renown = addRenown(renown, holder, 2);
      renown = addRenown(renown, world?.antagonist, -1);
    }
    if (renown !== standing) saveCampaign({ factionInfluence: renown });
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
    saveCampaign(pass(60));
    toast.info(`Short rest (1 hour): ${notes.join("; ") || (hitDiceLeft ? "nothing to recover" : "no Hit Dice left")}.`);
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
    saveCampaign({ ...pass(8 * 60), ...(world && Object.values(world.areas).some((a) => a.alarm) ? { galaxyMap: clearAlarms(world) } : {}) });
    toast.info("Long rest (8 hours): hit points and power points restored, half your Hit Dice regained. Alarms have died down.");
  };

  // Wait: an hour, or until the next morning (07:00) or evening (18:00)
  const waitFor = (minutes: number, what: string) => {
    saveCampaign(pass(minutes));
    toast.info(`${what}: it is ${clockText(useClock.getState().minutes)}.`);
  };
  const until = (hour: number) => {
    const now = useClock.getState().minutes;
    const today = now - (now % DAY) + hour * 60;
    return (today > now ? today : today + DAY) - now;
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

  // Caches are out of reach while those who stopped the party, or let it pass, are watching
  const lootWatched = hostiles.length > 0 && (allowed || alert >= ALERT.questioning);
  const OPENS = ["system", "planet", "settlement", "building"];

  // What was asked for on the 3D map
  const act = (action: MapAction) => {
    if (!world || !here) return;
    if (action.type === "select") setPicked({ kind: "area", id: action.areaId });
    else if (action.type === "open") {
      const place = world.areas[action.areaId];
      // A building one move away is walked to, so that its surroundings can be walked in
      const exit = place?.kind === "building" && !trailOf(world, here.id).some((a) => a.id === place.id) ? exits.find((e) => e.to === place.id && !e.hidden && !e.needsShip && !e.locked) : undefined;
      setPicked(null);
      if (exit && !inCombat && !dead && !exploring) leaveBy(exit);
      else if (place && OPENS.includes(place.kind)) setViewId(place.id);
    } else if (action.type === "note") toast.info(action.text);
    else if (action.type === "near") {
      // Passive Wisdom (Perception), by the Player's Handbook: 10 + the modifier, noticed without searching
      const room = world.areas[action.areaId];
      const passive = 10 + modifier(character.abilityScores?.wisdom) + (skilled("perception") ? proficiency : 0);
      if (!room?.secretEntry || room.secretEntry.found || passive < room.secretEntry.dc) return;
      toast.success(`You notice a ${room.secretEntry.name.toLowerCase()}${room.id === here.id ? "" : ` into ${room.name}`} (passive Perception ${passive} against DC ${room.secretEntry.dc}).`);
      saveCampaign({ galaxyMap: { ...world, areas: { ...world.areas, [room.id]: { ...room, secretEntry: { ...room.secretEntry, found: true } } } } });
    }
    else if (inCombat || dead || exploring) return;
    else if (action.type === "go") travelTo(action.areaId, action.secret);
    else if (action.type === "exit") leaveBy(action.exit);
    else if (action.type === "occupant" || action.type === "ship") setPicked({ kind: action.type, id: action.id });
    else if (action.type === "loot") {
      const cache = here.loot.find((c) => c.id === action.id);
      if (!cache) return;
      if (cache.looted) toast.info(`${cache.name} is empty.`);
      else if (lootWatched) toast.error("They are watching you: that cannot be taken now.");
      else takeLoot(cache);
    } else if (action.type === "look") {
      // House rule: a look through a window shows who is in the room, without a check
      const room = (scene ?? world).areas[action.areaId];
      const seen = [...room.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ""}${o.name} (${o.disposition})`), ...room.ships.map((ship) => ship.name)];
      toast.info(`Through the window of ${room.name}: ${seen.join(", ") || "nobody"}. (House rule: looking in needs no check.)`);
    }
  };

  // The buttons for dealing with whoever is watching: talk, threaten, fight
  const watchButtons = character && (
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
  );
  // The enemy's ship is a prize once nobody is left to guard it; any other is for sale
  const shipButton = (ship: Ship) =>
    ship.status !== "wrecked" && ship.status !== "orbiting" && (
      <Button
        size="sm"
        variant="outline"
        className="ml-2 h-6 px-2"
        disabled={inCombat || dead || hostiles.length > 0}
        onClick={() => acquireShip(ship, ship.owner === world?.antagonist ? 0 : ship.value)}
      >
        {ship.owner === world?.antagonist ? "Take as a prize" : `Buy (${ship.value.toLocaleString()} cr)`}
      </Button>
    );

  // What is being looked at, and the way down to it from the galaxy
  const view: Area | null = world && hereId ? world.areas[viewId ?? ""] ?? world.areas[viewOf(world, hereId)] : null;
  const viewTrail = world && view ? trailOf(world, view.id).filter((a) => a.kind !== "region") : [];
  const onFoot = !!view && !!here && view.kind === "building" && (view.id === here.id || view.id === here.parentId);

  // The card for what was picked out on the map: a place, someone, or a ship
  // A trader's counter: today's stock at today's prices, what they would give for what the party
  // carries, how they take to the party and why, and a haggle
  const tradePanel = (trader: Occupant, placeId: string) => {
    if (!world) return null;
    const wares = waresOf(trader)!;
    const [from, to] = openingHours(world, trader, placeId);
    if (!isOpen(world, trader, placeId, clock)) {
      return <p className="mt-1 text-xs text-amber-300" data-testid="trade-closed">{wares.label}: closed. Open {String(from % 24).padStart(2, "0")}:00 to {String(to % 24).padStart(2, "0")}:00 (house rule).</p>;
    }
    const attitude = attitudeOf(world, trader, placeId, customer);
    const market = marketAt(world, placeId);
    const lines = equipmentData.length ? stockOf(world, trader, placeId, equipmentData, today, customer, ledger) : [];
    const mine: string[] = Array.from(new Set((character.equipment ?? []).filter((x: any) => typeof x === "string")));
    const offers = mine
      .map((name) => ({ name, item: equipmentData.find((e) => e.name === name) }))
      .filter((x) => x.item)
      .map((x) => ({ name: x.name, offer: offerFor(world, trader, placeId, x.item, today, customer, ledger) }))
      .filter((x) => x.offer > 0);
    const haggled = traderLedger(trader.id).haggle;
    return (
      <div className="mt-2 border-t border-gray-600 pt-2" data-testid="trade">
        <p className="text-xs">
          <span className="font-semibold text-amber-200">{wares.label}</span> · {attitudeName(attitude.score)}
          {attitude.reasons.length > 0 && <span className="text-gray-400">: {attitude.reasons.join(", ")}</span>}
        </p>
        <p className="text-xs text-gray-400">
          {[lawText(market.law), ...market.notes].join("; ")}. Credits: {character.credits ?? 0}.
        </p>
        <div className="mt-1 flex gap-1">
          <Button size="sm" variant={tradeTab === "buy" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTradeTab("buy")}>Buy</Button>
          <Button size="sm" variant={tradeTab === "sell" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTradeTab("sell")}>Sell</Button>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={!!haggled || inCombat || dead} onClick={() => haggle(trader, placeId)}>
            {haggled === "won" ? "Haggled: -10%" : haggled === "lost" ? "Offended" : haggled ? "Haggled" : "Haggle"}
          </Button>
        </div>
        <ul className="mt-1 max-h-48 overflow-y-auto space-y-0.5 text-xs" data-testid={tradeTab === "buy" ? "trade-stock" : "trade-offers"}>
          {tradeTab === "buy" &&
            (lines.length ? lines.map((line) => (
              <li key={line.name}>
                <div className="flex items-center gap-1">
                  <button className="flex-1 text-left" onClick={() => setItemShown(itemShown === line.name ? null : line.name)}>
                    {line.name} <span className="text-gray-400">x{line.quantity}</span>
                    {line.contraband && <span className="ml-1 text-red-300">contraband</span>}
                  </button>
                  <span className="text-amber-200">{line.price} cr</span>
                  <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || line.price > (character.credits ?? 0)} onClick={() => buy(trader, line)}>Buy</Button>
                </div>
                {itemShown === line.name && line.description && <p className="text-gray-400">{line.description}</p>}
              </li>
            )) : <li className="text-gray-400">{equipmentData.length ? "Nothing for sale today." : "Loading..."}</li>)}
          {tradeTab === "sell" &&
            (offers.length ? offers.map((x) => (
              <li key={x.name} className="flex items-center gap-1">
                <span className="flex-1">{x.name}</span>
                <span className="text-amber-200">{x.offer} cr</span>
                <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead} onClick={() => sell(trader, x.name, x.offer)}>Sell</Button>
              </li>
            )) : <li className="text-gray-400">They want nothing you carry.</li>)}
        </ul>
      </div>
    );
  };

  const pickedCard = () => {
    if (!picked || !world || !here || inCombat) return null;
    const close = (
      <Button size="sm" variant="ghost" className="h-6 px-2 float-right" onClick={() => setPicked(null)} aria-label="Close">
        {"\u2715"}
      </Button>
    );
    if (picked.kind === "area") {
      const place = world.areas[picked.id];
      if (!place) return null;
      const exit = exits.find((e) => e.to === place.id && !e.hidden);
      const barred = hostiles.length > 0 && exit?.to !== cameFrom && !allowed && alert >= ALERT.questioning;
      const way = !exit && place.id !== here.id && !trailOf(world, here.id).some((a) => a.id === place.id) ? findPath(world, here.id, place.id) : null;
      const unmapped = childrenOf(world, place.id).length === 0 && OPENS.includes(place.kind);
      return (
        <>
          {close}
          <p className="font-semibold">
            {place.name} <span className="text-sm font-normal text-gray-400">({place.kind}{place.type && place.type !== place.kind ? `, ${place.type}` : ""})</span>
          </p>
          {place.description && <p className="text-xs text-gray-300">{place.description}</p>}
          {trailOf(world, here.id).some((a) => a.id === place.id) && <p className="text-xs text-yellow-300">You are {place.id === here.id ? "here" : "in here"}.</p>}
          {unmapped && <p className="text-xs text-gray-400">Nobody has mapped it yet.</p>}
          {way && way.length > 2 && <p className="text-xs text-gray-400">Way there: {way.slice(1).map((id) => world.areas[id].name).join(" \u203a ")}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {OPENS.includes(place.kind) && place.id !== view?.id && (
              <Button size="sm" variant="outline" onClick={() => { setViewId(place.id); setPicked(null); }} data-testid="map-open">
                Look inside
              </Button>
            )}
            {exit && (
              <Button size="sm" className="h-auto whitespace-normal text-left" disabled={inCombat || dead || exploring || barred} onClick={() => leaveBy(exit)} data-testid="map-travel">
                {exit.locked ? `Unlock (DC ${exit.locked}): ` : ""}{exit.label}{exit.via === "path" ? " to" : ""} {place.name}
                {[exit.travel, tripNote(exit)].filter(Boolean).length > 0 && ` (${[exit.travel, tripNote(exit)].filter(Boolean).join(", ")})`}
              </Button>
            )}
            {place.id === here.id && unmapped && (
              <Button size="sm" onClick={() => explore()} disabled={exploring || inCombat || dead}>
                {exploring ? "Exploring..." : "Explore"}
              </Button>
            )}
          </div>
        </>
      );
    }
    if (picked.kind === "occupant") {
      // Someone here, or a sentry standing out in front of the building the party is outside
      const o = (hereNow ?? here).occupants.find((x) => x.id === picked.id);
      const gate = !o && here.kind === "building" && world ? childrenOf(world, here.id).find((room) => room.occupants.some((x) => x.id === picked.id)) : undefined;
      if (gate) {
        const sentry = gate.occupants.find((x) => x.id === picked.id)!;
        return (
          <>
            {close}
            <p className={`font-semibold ${sentry.disposition === "hostile" ? "text-red-400" : ""}`}>{sentry.name}</p>
            <p className="text-xs text-gray-300">{[sentry.species, sentry.role, sentry.disposition, sentry.cr && `CR ${sentry.cr}`].filter(Boolean).join(", ")}</p>
            <p className="text-xs text-gray-400">{sentry.disposition === "hostile" ? `They keep the way in to ${gate.name}. Walk in and they will stop you; a secret way in is not watched.` : `They keep the way in to ${gate.name}.`}</p>
          </>
        );
      }
      if (!o) return null;
      const hostile = o.disposition === "hostile" && !!o.hitPoints;
      return (
        <>
          {close}
          <p className={`font-semibold ${o.disposition === "hostile" ? "text-red-400" : o.disposition === "friendly" ? "text-green-300" : ""}`}>
            {o.count > 1 ? `${o.count} x ` : ""}{o.name}
          </p>
          <p className="text-xs text-gray-300">{[o.species, o.role, o.disposition, o.cr && `CR ${o.cr}`, o.armorClass && `AC ${o.armorClass}`, o.hitPoints && `${o.hitPoints} hit points`].filter(Boolean).join(", ")}</p>
          {o.loadout.length > 0 && <p className="text-xs text-gray-400">Carrying: {o.loadout.join(", ")}</p>}
          {hostile ? (
            <div className="mt-1 space-y-1">
              <p className="text-xs">
                <span className="font-semibold text-red-300">Watch: {allowed ? "letting you pass" : ALERT_LEVELS[alert]}.</span> {allowed ? "They let you through, and watch what you do." : WATCH_NOTE[alert]}
              </p>
              {watchButtons}
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400">To talk with them, say what you do on the GM Interface tab.</p>
              {waresOf(o) && tradePanel(o, here.id)}
            </>
          )}
        </>
      );
    }
    const ship = (hereNow ?? here).ships.find((x) => x.id === picked.id);
    if (!ship) return null;
    return (
      <>
        {close}
        <p className="font-semibold">{ship.name}</p>
        <p className="text-xs text-gray-300">
          {ship.size} {ship.role.toLowerCase()}, tier {ship.tier}, {ship.status}, {ship.owner}{ship.hyperdriveClass ? `, hyperdrive class ${ship.hyperdriveClass}` : ", no hyperdrive"}
        </p>
        {ship.equipment.length > 0 && <p className="text-xs text-gray-400">Fitted: {ship.equipment.join(", ")}</p>}
        <div className="mt-1">{shipButton(ship)}</div>
      </>
    );
  };
  const card = pickedCard();

  const pointsName = klass?.casterType === "Tech" ? "Tech Points" : "Force Points";
  const restButtons = character && (
    <div className="flex flex-wrap gap-2" data-testid="play-rest">
      <Button size="sm" variant="outline" onClick={shortRest} disabled={inCombat || dead || hostiles.length > 0}>
        Short rest
      </Button>
      <Button size="sm" variant="outline" onClick={rest} disabled={inCombat || dead || hostiles.length > 0}>
        Long rest
      </Button>
      <Button size="sm" variant="outline" onClick={() => waitFor(60, "Waited an hour")} disabled={inCombat || dead || hostiles.length > 0}>
        Wait 1 h
      </Button>
      <Button size="sm" variant="outline" onClick={() => waitFor(until(18), "Waited until evening")} disabled={inCombat || dead || hostiles.length > 0}>
        Until evening
      </Button>
      <Button size="sm" variant="outline" onClick={() => waitFor(until(7), "Waited until morning")} disabled={inCombat || dead || hostiles.length > 0}>
        Until morning
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
    <div className="relative h-[100dvh] w-screen bg-black overflow-hidden">
      <KeyboardControls map={controls}>
        {/* The 3D map. On a phone it has the top of the screen and the HUD the rest */}
        <div className={`absolute inset-x-0 top-0 md:h-full ${showSidebar ? "md:right-80" : ""} ${showSidebar || showCombat ? "h-[46dvh]" : "h-full"}`} data-testid="map-3d">
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
          />
          
          {/* A fight is shown on the floor it is fought on; otherwise the place being looked at */}
          {inCombat ? (
            <FightScene areaId={here?.layout ? here.id : null} origin={here?.layout} />
          ) : world ? (
            <LocalMap world={scene} hereId={hereId} viewId={viewId} selectedId={picked?.kind === "area" ? picked.id : null} onAct={act} locked={dead || exploring} />
          ) : activeMapTab === "galaxy" ? (
            <GalaxyMap />
          ) : (
            <LocalMap />
          )}
        </Canvas>

        {/* Where the map is looking: the way down from the galaxy, each step a tap away. Only the
            buttons take taps; the rest of the strip lets them through to the map. */}
        {!inCombat && (
          <div className="pointer-events-none absolute inset-x-1 top-1 z-10">
            <div className="flex items-center gap-1">
              {world && view ? (
                <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" data-testid="map-trail">
                  {viewTrail.map((area, index) => (
                    <Button
                      key={area.id}
                      size="sm"
                      variant={area.id === view.id ? "default" : "outline"}
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => { setViewId(area.id); setPicked(null); }}
                    >
                      {index === 0 ? "Galaxy" : area.name.replace(/ System$/, "")}
                    </Button>
                  ))}
                  {view.id !== viewOf(world, here!.id) && (
                    <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs border-yellow-400 text-yellow-400" onClick={() => { setViewId(null); setPicked(null); }} data-testid="map-party">
                      Back to the party
                    </Button>
                  )}
                </div>
              ) : (
                <div className="pointer-events-auto flex flex-1 flex-wrap items-center gap-1">
                  <Button size="sm" className="h-6 px-2 text-xs" variant={activeMapTab === "galaxy" ? "default" : "outline"} onClick={() => setActiveMapTab("galaxy")}>
                    Galaxy Map
                  </Button>
                  <Button size="sm" className="h-6 px-2 text-xs" variant={activeMapTab === "local" ? "default" : "outline"} onClick={() => setActiveMapTab("local")}>
                    Local Map
                  </Button>
                  <Button size="sm" className="h-6 px-2 text-xs" variant="destructive" onClick={startTestCombat} disabled={character.currentHp <= 0 || dead}>
                    Test Combat
                  </Button>
                </div>
              )}
              <Button size="sm" variant="outline" className="pointer-events-auto h-6 shrink-0 px-2 text-xs" onClick={toggleSidebar}>
                {showSidebar ? "Hide HUD" : "Show HUD"}
              </Button>
            </div>
            {world && view && (
              <p className="mt-0.5 text-[11px] leading-tight text-gray-300 drop-shadow" data-testid="map-hint">
                {onFoot
                  ? "Tap the ground to walk; tap a door, sign, crate, person or ship to go up to it."
                  : `Tap a place to pick it out, double tap to ${view.kind === "settlement" ? "go to it or look at it" : "open it"}.`}
              </p>
            )}
          </div>
        )}

        {card && (
          <Card className="absolute bottom-2 left-2 z-10 w-[min(22rem,calc(100%-1rem))] bg-gray-800 bg-opacity-90 text-white p-3 text-sm" data-testid="map-card">
            {card}
          </Card>
        )}
        </div>

        {/* Character HUD */}
        {showSidebar && (
          <div className="absolute inset-x-0 bottom-0 h-[54dvh] bg-gray-800 text-white p-4 overflow-y-auto md:inset-x-auto md:right-0 md:top-0 md:h-full md:w-80">
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
                <ClockLine after={`${eraOf(world).name} · ${lawText(lawAt(world, here.id))}`} />
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

                {(hereNow ?? here).occupants.length + (hereNow ?? here).ships.length > 0 && (
                  <ul className="text-sm space-y-1" data-testid="play-occupants">
                    {(hereNow ?? here).occupants.map((o) => (
                      <li key={o.id} className={o.disposition === "hostile" ? "text-red-400" : o.disposition === "friendly" ? "text-green-300" : ""}>
                        {o.count > 1 ? `${o.count} x ` : ""}{o.name}
                        <span className="text-gray-400">
                          {" "}{[o.species, o.role, o.disposition, o.cr && `CR ${o.cr}`].filter(Boolean).join(", ")}
                        </span>
                      </li>
                    ))}
                    {(hereNow ?? here).ships.map((ship) => (
                      <li key={ship.id} data-testid="play-ship">
                        {ship.name} <span className="text-gray-400">{ship.size} {ship.role.toLowerCase()}, {ship.status}, {ship.owner}</span>
                        {shipButton(ship)}
                      </li>
                    ))}
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
                    {watchButtons}
                    <p className="text-xs text-gray-400">House rule: how enemies notice you is not in the books.</p>
                  </div>
                )}
                {here.loot.filter((c) => !c.hidden).map((cache) => (
                  <div key={cache.id} className="text-sm flex flex-wrap items-center gap-2" data-testid="play-loot">
                    <span>
                      {cache.name}
                      {cache.looted && <span className="text-gray-400"> (empty)</span>}
                    </span>
                    {!cache.looted && (
                      <Button size="sm" variant="outline" onClick={() => takeLoot(cache)} disabled={inCombat || dead || lootWatched}>
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
                <h3 className="font-semibold mt-3 mb-1">Standing</h3>
                <div className="text-sm space-y-0.5" data-testid="play-standing">
                  {Object.entries(standing.renown).filter(([, n]) => n).length ? (
                    Object.entries(standing.renown).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([faction, n]) => (
                      <p key={faction} className={n > 0 ? "text-green-300" : "text-red-300"}>{faction}: renown {n > 0 ? "+" : ""}{n}</p>
                    ))
                  ) : (
                    <p className="text-gray-400">No renown yet. Fights and quests win or lose it with the factions involved; traders take it into account.</p>
                  )}
                  {world && here && factionAt(world, here.id) && <p className="text-xs text-gray-400">This place is held by {factionAt(world, here.id)}.</p>}
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
