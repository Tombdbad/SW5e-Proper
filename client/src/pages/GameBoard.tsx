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
import PlayCombat, { type CombatItemOption } from "@/components/Combat/PlayCombat";
import { useCombat, rollDamage, onPartySide } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";
import GMReportManager from "@/components/Campaign/GMReportManager";
import { toast } from "sonner";
import { carriedWeapons, characterFeatures, hagglingEdge, derivedStats, equippedNow, equippedOf, itemKind, type Equipped } from "@/lib/sw5e/characterCalculation";
import { getSpeciesById } from "@/lib/sw5e/species";
import { getClassById } from "@/lib/sw5e/classes";
import { calculateArmorClass, calculateExperienceForLevel, castingStats, powerCost, powerEffect } from "@/lib/sw5e/rules";
import { getStarshipSize } from "@/lib/sw5e/starships";
import {
  exitsOf, trailOf, childrenOf, findPath, updateArea, advanceQuests, berthOf, hasPort, shipForTrip, passageFare,
  planBuilding, afterFight, safeHarbour, arrivalAlert, setAlert, watchDC, watchersOf, clearAlarms, skirmishGround, ALERT, ALERT_LEVELS, LIFE,
  START_TIME, DAY, hourOf, dayOf, clockText, partOfDay, tripMinutes, eraOf, eraById, lawAt, lawText,
  withPresence,
  gearUse, toolFor, toolTrained, boonOf, gambleMode, gambleResult, GAMBLE_ROUNDS, GAMBLE_HOUSE_DC, GAMBLE_STAKE, GAMBLE_COMPLICATION, GAMBLE_COMPLICATIONS,
  companionFrom, hireFee, wageFor, canHire, COMPANION_LIMIT, crOf, gentleDC, gentleLimit, isDroid, reprogramDC, FREEING, hitDieOfSize,
  groundRides, kmOf, hasRidesForHire, SEATS, EXPLOSIVE_CONDITION_ROUNDS,
  type GearUse, type ToolFacts, type Boon, type GambleApproach, type Companion, type CompanionKind, type PartyVehicle, type Vehicle, type Transport, type Ride,
  waresOf, stockOf, offerFor, attitudeOf, attitudeName, marketAt, haggleDC, isOpen, openingHours, addRenown, emptyStanding, ledgerFor, factionAt,
  type Standing, type Ledger, type Customer, type TradeLine,
  type Occupant,
  type World, type Area, type Exit, type LootCache, type PartyShip, type Quest, type Ship,
} from "@shared/logic";

// What the character is in the middle of, kept with the character (`playState`)
interface PlayState {
  // Uses of the kit that is open, by item name
  charges?: Record<string, number>;
  // The tool's special use prepared at the last rest, for one thing before the next
  boon?: Boon;
  // A dose of poison on the weapon
  poison?: { dice: string; dc: number };
  // A substance in the blood: a high until `ends` (clock minutes) or until it is used, then a low
  substance?: { name: string; ability?: string; pool?: "tech" | "force"; phase: "high" | "low"; ends: number; lowMinutes: number; boost: number; reduce: number; temp?: string; wisdomDc: number; constitutionDc: number };
  addiction?: number;
  lastSubstance?: number;
  protectedUntil?: number;
  // Credits owed to the gaming tables
  debt?: number;
}

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
  // (with the party's companions and speeders, which the map draws with it)
  const scene = useMemo(() => {
    if (!world) return null;
    const present = withPresence(world, clock);
    return Object.assign(present, { party: character?.companionData?.party ?? [], parked: campaign?.vehicles ?? [] });
  }, [world, clock, character?.companionData, campaign?.vehicles]);
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
    const best = abilities.reduce((a, b) => (modifier(character.abilityScores?.[b]) > modifier(character.abilityScores?.[a]) ? b : a), abilities[0]);
    // A substance's extra d3 (a high) or d3 less (a low) for this ability; a high ends with its use
    const s = (play.substance?.ability === best ? (play.substance.phase === "high" ? 1 : -1) : 0) * (die(3));
    if (s > 0) setTimeout(() => endHigh("used on a check"), 0);
    const bonus = modifier(character.abilityScores?.[best]) + (trained ? proficiency : 0) + s;
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
  const [picked, setPickedNow] = useState<{ kind: "area" | "occupant" | "ship" | "vehicle" | "companion"; id: string } | null>(null);
  // The card for what was picked lets taps through for a moment: it comes up over the lower part
  // of the map, where the second tap of a double tap would otherwise land on it. (Closed in the
  // same step as the pick, so that not even the next tap in the queue finds it open.)
  const [cardOpen, setCardOpen] = useState(true);
  const setPicked = (next: { kind: "area" | "occupant" | "ship" | "vehicle" | "companion"; id: string } | null) => {
    setPickedNow(next);
    setCardOpen(false);
  };
  useEffect(() => {
    if (cardOpen) return;
    const timer = setTimeout(() => setCardOpen(true), 450);
    return () => clearTimeout(timer);
  }, [cardOpen, picked?.id, picked?.kind]);
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
  const travel = (exit: Exit, chosen?: Ride) => {
    if (!here || !world) return;
    const changes: Record<string, any> = { currentLocation: exit.to };
    const { ship: flying } = exit.needsShip ? tripBy(exit) : { ship: undefined };
    // A route over the ground goes by the ride chosen (on foot, a mount, a speeder, a hired ride)
    const rides = exit.needsShip ? [] : ridesFor(exit);
    const ride = chosen ?? defaultRide(rides);
    if (ride?.blocked) return void toast.error(`${ride.label}: ${ride.blocked}.`);
    if (ride?.fare) {
      if (ride.fare > (character.credits ?? 0)) return void toast.error(`A ride costs ${ride.fare} credits and you have ${character.credits ?? 0}.`);
      saveCharacter({ credits: character.credits - ride.fare });
      toast.info(`Ride paid: ${ride.fare} credits (house rule: the books price no fares).`);
    }
    if (ride?.vehicleId) changes.vehicles = vehicles.map((v) => (v.id === ride.vehicleId ? { ...v, areaId: exit.to } : v));
    const took = ride ? ride.minutes : tripMinutes(exit, Number(flying?.hyperdriveClass) || 1);
    Object.assign(changes, pass(took));
    if (ride) toast.info(`${ride.label}: ${rideText(took)} to ${world.areas[exit.to]?.name}; it is ${clockText(useClock.getState().minutes)}.`);
    else if (took >= 60) toast.info(`${Math.round(took / 6) / 10} hours on the way${exit.needsShip && !exit.travel ? " (house rule: an hour between the surface and orbit)" : ""}: it is ${clockText(useClock.getState().minutes)}.`);
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
  const leaveBy = (exit: Exit, ride?: Ride) => {
    if (hostiles.length > 0 && !allowed && exit.to !== cameFrom) {
      if (alert >= ALERT.questioning) {
        toast.error("Enemies bar the way onward.");
        return;
      }
      if (!unseen("Slipping past")) return;
    }
    if (exit.locked) unlock(exit);
    else travel(exit, ride);
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

  // Pick or slice a lock: Dexterity or Intelligence, with a security or slicer's kit (proficiency
  // when trained with it); a spike for that kit rerolls a failed check (Security spike, Computer spike)
  const lockKit = () => (character.equipment ?? []).find((n: string) => /^(security kit|slicer's kit)$/i.test(n)) as string | undefined;
  const openLock = (exit: Exit, extra: Record<string, any> = {}, alarm = false) => {
    if (!world || !exit.pathId) return;
    const paths = world.paths.map((p) => (p.id === exit.pathId ? { ...p, locked: undefined } : p));
    let galaxyMap: World = { ...world, paths };
    // A blast sets off the alarm of the building the party stands in
    const buildingId = here?.kind === "room" ? here.parentId : here?.kind === "building" ? here.id : null;
    if (alarm && buildingId) galaxyMap = updateArea(galaxyMap, buildingId, { alarm: true }).world;
    saveCampaign({ galaxyMap, ...extra });
  };
  const unlock = (exit: Exit) => {
    if (!world || !exit.pathId) return;
    const kit = lockKit();
    const dc = exit.locked ?? 10;
    let ok = abilityCheck("Lock", dc, ["dexterity", "intelligence"], !!kit && trainedWith(kit));
    if (!ok && kit) {
      const spike = (character.equipment ?? []).find((n: string) => { const g = gearOf(n); return g?.kind === "spike" && g.tool.toLowerCase() === kit.toLowerCase(); });
      if (spike) {
        saveCharacter({ equipment: consume(spike).equipment });
        toast.info(`${spike} spent: reroll.`);
        ok = abilityCheck("Lock (rerolled)", dc, ["dexterity", "intelligence"], trainedWith(kit));
      }
    }
    if (ok) openLock(exit);
  };
  // Forcing a door instead (house rule: DC 5 over the lock's for a Strength check; a ram gives +4 and
  // advantage with a helper (Ram, portable); a fusion cutter takes ten minutes for each 5 of the DC
  // and no check; a charge, mine or grenade simply opens it). Noise brings the watch down on the room.
  const forceDoor = (exit: Exit, how: "strength" | "ram" | "cutter" | "blast") => {
    if (!world || !here || !exit.pathId) return;
    const dc = (exit.locked ?? 10) + 5;
    const noise = () => {
      if (hostiles.length) setWatch(ALERT.attacking);
    };
    if (how === "cutter") {
      const minutes = 10 * Math.ceil((exit.locked ?? 10) / 5);
      openLock(exit, pass(minutes));
      return void toast.success(`The fusion cutter takes ${minutes} minutes, and the way is open.`);
    }
    if (how === "blast") {
      const bomb = (character.equipment ?? []).find((n: string) => gearOf(n)?.kind === "explosive");
      if (!bomb) return;
      saveCharacter({ equipment: consume(bomb).equipment });
      openLock(exit, {}, true);
      noise();
      return void toast.success(`${bomb} blows the lock. Everyone nearby heard it.`);
    }
    const ram = how === "ram";
    const helper = party.some((c) => c.hp > 0 && c.kind !== "beast");
    const first = d20();
    const roll = ram && helper ? Math.max(first, d20()) : first;
    const bonus = modifier(character.abilityScores?.strength) + (ram ? 4 : 0) + (substanceFor("strength") || 0);
    const ok = roll + bonus >= dc;
    toast[ok ? "success" : "error"](`${ram ? "Portable ram" : "Shoulder it"} (Strength${ram && helper ? ", helped: advantage" : ""}): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${roll + bonus} against DC ${dc}. ${ok ? "It gives." : "It holds."} Noisy.`);
    noise();
    if (ok) openLock(exit);
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

  // Wield or put away a weapon, put on or take off armor or a shield, from the inventory. The
  // armor class on the sheet moves by what the change makes of it (edits made on the sheet stay).
  const setEquipped = (name: string, on: boolean) => {
    if (!character) return;
    const now = equippedNow(character);
    const kind = itemKind(name);
    const lower = name.toLowerCase();
    const next: Equipped = {
      weapons: kind === "weapon" ? (on ? Array.from(new Set([...now.weapons, name])) : now.weapons.filter((n) => n.toLowerCase() !== lower)) : now.weapons,
      body: kind === "armor" ? (on ? name : null) : now.body,
      shield: kind === "shield" ? (on ? name : null) : now.shield,
    };
    const change = derivedStats({ ...character, armor: next }).armorClass - derivedStats(character).armorClass;
    saveCharacter({ armor: next, armorClass: Math.max(0, (character.armorClass ?? 10) + change) });
    toast.success(`${name}: ${on ? (kind === "weapon" ? "in hand" : "on") : kind === "weapon" ? "put away" : "taken off"}${change ? `; armor class ${change > 0 ? "+" : ""}${change}` : ""}.`);
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
      // What a tool prepared at the last rest gives, a dose of poison on the weapon, and a substance
      boons: {
        attack: play.boon?.kind === "attack" && weaponFits(play.boon) ? play.boon.die : undefined,
        damage: play.boon?.kind === "damage" && play.boon.die && weaponFits(play.boon) ? play.boon.die : undefined,
        damageFlat: play.boon?.kind === "damage" && !play.boon.die && weaponFits(play.boon) ? Math.max(0, modifier(character.abilityScores?.intelligence)) : undefined,
        ac: play.boon?.kind === "ac" ? play.boon.die : undefined,
        poison: play.poison,
      },
      high: play.substance?.ability || play.substance?.temp ? { name: play.substance.name, ability: play.substance.ability, rounds: addictionLevel >= 2 ? 5 : 10, temp: play.substance.temp, low: play.substance.phase === "low" } : undefined,
      // Armor picked up since the sheet was last worked out counts too
      // (once armor has been put on or taken off by choice, the sheet's class is what counts)
      armorClass: equippedOf(character) ? character.armorClass : Math.max(character.armorClass, calculateArmorClass(character.abilityScores, character.equipment ?? [])),
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
    // Those hurt in a fight the party did not finish are still hurt
    hp: Math.max(1, Math.min(o.hitPoints!, o.wounds?.[Number(id.split("-").pop())] ?? o.hitPoints!)),
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
      party.filter((c) => c.hp > 0).map(allyOf),
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

  // How a fight ended, whichever way it did. The fallen leave the area and their gear stays
  // behind; those still standing keep the hit points they have, so that leaving, being knocked
  // out or dying does not give the enemy their strength back. Won: the room is clear. Stable: the
  // character comes to hours later with 1 hit point, back where they came from. Dead: dead.
  const outcome = useCombat((state) => state.outcome);
  useEffect(() => {
    if (inCombat || !outcome || !character || !fightBegun.current) return;
    fightBegun.current = false;
    const areaId = fightArea.current;
    fightArea.current = null;
    let slain = 0;
    let xp = 0;
    let fallenKind = false;
    const fightNow = useCombat.getState();
    if (areaId && world?.areas[areaId]) {
      const area = world.areas[areaId];
      const fight = useCombat.getState();
      const remaining = fight.combatants.length ? fight.combatants.filter((c) => !onPartySide(c)).map((c) => ({ id: c.id, hp: c.hp })) : fight.remains;
      const { occupants, gear, kept, slain: down, xp: earned, people, changed } = afterFight(area, remaining);
      slain = down;
      xp = earned;
      fallenKind = people;
      if (changed) {
        const loot = gear.length ? [...area.loot, { id: `l-${Date.now().toString(36)}`, name: "Gear of the fallen", kind: "remains", credits: 0, items: gear }] : area.loot;
        // Their places on the plan: one for each still standing
        const layout = area.layout && {
          ...area.layout,
          assets: area.layout.assets.filter((a) => {
            if (a.kind !== "npc" || !kept.has(a.ref ?? "")) return true;
            const left = kept.get(a.ref!)!;
            kept.set(a.ref!, left - 1);
            return left > 0;
          }),
        };
        saveCampaign({ galaxyMap: updateArea(world, areaId, { occupants, loot, ...(layout ? { layout } : {}) }).world });
      }
      // Renown: a fight costs standing with the side that lost it; the beasts of the wild have none
      if (slain && fallenKind && outcome !== "dead") {
        const losers = world.areas[area.parentId ?? ""]?.faction ?? world.antagonist;
        const holder = factionAt(world, areaId);
        let renown = addRenown(standing, losers, -1);
        if (holder && holder !== losers) renown = addRenown(renown, holder, 1);
        saveCampaign({ factionInfluence: renown });
      }
    }
    // Companions keep the hit points they ended with; those of flesh and blood who fell make death
    // saving throws at once (a droid is only powered down; a traumakit or medpac in the fight saved them)
    const survivors: Companion[] = [];
    const allyNow = fightNow.combatants.length ? fightNow.combatants.filter((c) => c.ally).map((c) => ({ id: String(c.id), hp: c.hp })) : fightNow.allyRemains.map((a) => ({ id: String(a.id), hp: a.hp }));
    for (const c of party) {
      const now = allyNow.find((a) => a.id === c.id);
      let hp = now ? now.hp : c.hp;
      if (hp <= 0 && isOrganic(c) && c.hp > 0) {
        let good = 0;
        let bad = 0;
        while (good < 3 && bad < 3) {
          const d = die(20);
          if (d === 20) { good = 3; hp = 1; break; }
          if (d >= 10) good++; else bad += d === 1 ? 2 : 1;
        }
        if (bad >= 3) {
          toast.error(`${c.name} did not make it.`);
          continue;
        }
        toast.info(`${c.name} fell and is stable, at ${hp} hit point${hp === 1 ? "" : "s"}.`);
      }
      survivors.push({ ...c, hp: Math.max(0, hp) });
    }
    // What was used up: prepared dice and poison
    const spent = fightNow.spent;
    const state: PlayState = { ...play };
    if (spent.length) {
      if (play.boon && spent.includes(play.boon.kind as any)) state.boon = undefined;
      if (spent.includes("poison")) state.poison = undefined;
    }
    if (party.length || spent.length) saveCharacter({ playState: state, ...(party.length ? { companionData: { ...(character.companionData ?? {}), party: survivors } } : {}) });
    // A fight is a minute at least (house rule: ten rounds a minute)
    saveCampaign(pass(Math.max(1, Math.ceil(fightNow.round / 10))));
    // A high used in the fight is over with it
    if (play.substance?.phase === "high") setTimeout(() => endHigh("the fight is over"), 50);
    if (outcome === "dead") {
      saveCharacter({ currentHp: 0, conditions: ["Dead"] });
      toast.error(`${character.name} has died.`);
    } else {
      if (xp) saveCharacter({ experience: (character.experience ?? 0) + xp });
      if (outcome === "stable") {
        lastSavedHp.current = 1;
        saveCharacter({ currentHp: 1 });
        // Not into the same fight again: in the nearest room with nobody hostile in it
        const refuge = (world && areaId && safeHarbour(world, areaId)) || cameFrom;
        if (world && refuge && world.areas[refuge]) saveCampaign({ currentLocation: refuge });
        toast.info(`Left for dead, you come to hours later with 1 hit point${refuge && world?.areas[refuge] ? `, in ${world.areas[refuge].name}.` : "."}`);
      } else if (outcome === "victory") {
        const me = fightNow.combatants.find((c) => c.isPlayer);
        if (me && me.hp <= 0) {
          lastSavedHp.current = 1;
          saveCharacter({ currentHp: 1 });
          toast.info("Your companions pull you through: 1 hit point.");
        }
        toast.success(`Victory${xp ? `: ${xp} XP` : ""}`);
      }
      else if (slain) toast.info(`${slain} of them fell before you left; the rest are as hurt as you left them.`);
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
  const { data: toolData = [] } = useQuery<ToolFacts[]>({
    queryKey: ["tools-data"],
    queryFn: async () => (await fetch("/api/sw5e/tools")).json(),
    staleTime: Infinity,
  });
  const { data: transport } = useQuery<Transport>({
    queryKey: ["transport-data"],
    queryFn: async () => (await fetch("/api/sw5e/transport")).json(),
    staleTime: Infinity,
  });
  const { data: monsterNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["monster-names"],
    queryFn: async () => (await fetch("/api/sw5e/monsters?fields=id,name")).json(),
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
    if (line.category === "Vehicle" || line.category === "Mount") return void buyTransport(trader, line);
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
  // What a rest does for the companions: each spends a Hit Die on a short rest (the fallen are
  // brought round with 1 hit point), all hit points back on a long one; a meal adds to a short
  // rest's healing, and droids mended by astrotech's implements get a die more
  const restParty = (long: boolean, work: ReturnType<typeof workTool>): { party: Companion[]; notes: string[] } => {
    const notes: string[] = [];
    const next = party.map((c) => {
      if (long) return { ...c, hp: c.maxHp };
      if (c.hp >= c.maxHp && c.hp > 0) return c;
      const base = Math.max(1, die(hitDieOfSize(c.size)) + (c.saves?.constitution ?? 0));
      const extra = (work?.mealHp ?? 0) + (work?.repairDie && !isOrganic(c) ? die(work.repairDie) : 0);
      return { ...c, hp: Math.min(c.maxHp, Math.max(c.hp, 0) + base + extra) };
    });
    if (party.length) notes.push(long ? "companions back to full" : "companions tended");
    return { party: next, notes };
  };
  const shortRest = () => {
    if (!character || inCombat) return;
    const changes: Record<string, any> = {};
    const notes: string[] = [];
    if (klass?.casterType === "Tech" && character.currentForcePoints < character.maxForcePoints) {
      changes.currentForcePoints = character.maxForcePoints;
      notes.push("tech points restored");
    }
    const work = workTool("short");
    let spentDie = false;
    if (hitDiceLeft > 0 && character.currentHp < character.maxHp) {
      const healed = Math.max(0, rollDamage(`1d${hitDie}`, false) + modifier(character.abilityScores?.constitution)) + (work?.mealHp ?? 0);
      changes.currentHp = lastSavedHp.current = Math.min(character.maxHp, character.currentHp + healed);
      changes.hitDiceUsed = (character.hitDiceUsed ?? 0) + 1;
      spentDie = true;
      notes.push(`a Hit Die (d${hitDie}) restores ${healed} hit points`);
    }
    // Resting clears what was prepared before, and a coat of poison dries
    let state: PlayState = { ...play, boon: undefined, poison: undefined };
    if (work) {
      if (work.boon) state.boon = work.boon;
      if (work.food) Object.assign(changes, { equipment: consume(work.food).equipment });
      if (work.herbal && (character.conditions ?? []).some((c: string) => /poison|disease/i.test(c))) changes.conditions = (character.conditions ?? []).filter((c: string) => !/poison|disease/i.test(c));
      notes.push(work.note);
    }
    const healed = restParty(false, work);
    notes.push(...healed.notes);
    if (spentDie || Object.keys(changes).length || party.length || state.boon !== play.boon || play.poison) {
      saveCharacter({ ...changes, playState: state, ...(party.length ? { companionData: { ...(character.companionData ?? {}), party: healed.party } } : {}) });
    }
    saveCampaign(pass(60));
    toast.info(`Short rest (1 hour): ${notes.filter(Boolean).join("; ") || (hitDiceLeft ? "nothing to recover" : "no Hit Dice left")}.`);
  };
  const rest = async () => {
    if (!character || inCombat) return;
    if (character.currentHp < 1) {
      toast.error("A long rest needs at least 1 hit point to begin with.");
      return;
    }
    lastSavedHp.current = character.maxHp;
    lastSavedPoints.current = character.maxForcePoints;
    const work = workTool("long");
    const state: PlayState = { ...play, boon: undefined, poison: undefined };
    if (work?.boon) state.boon = work.boon;
    const regained = Math.max(1, Math.floor(level / 2)) + (work?.mealDice ?? 0);
    const extra: Record<string, any> = {};
    if (work?.food) extra.equipment = consume(work.food).equipment;
    const poisoned = work?.herbal && (character.conditions ?? []).some((c: string) => /poison|disease/i.test(c));
    if (poisoned) extra.conditions = (character.conditions ?? []).filter((c: string) => !/poison|disease/i.test(c));
    // A day without a substance, and a long rest, may lower an addiction
    const clean = detox();
    if (clean.playState) state.addiction = clean.playState.addiction;
    const healed = restParty(true, work);
    await saveCharacter({
      currentHp: character.maxHp,
      currentForcePoints: character.maxForcePoints,
      hitDiceUsed: Math.max(0, (character.hitDiceUsed ?? 0) - regained),
      playState: state,
      ...(party.length ? { companionData: { ...(character.companionData ?? {}), party: healed.party } } : {}),
      ...extra,
    });
    saveCampaign({ ...pass(8 * 60), ...(world && Object.values(world.areas).some((a) => a.alarm) ? { galaxyMap: clearAlarms(world) } : {}) });
    toast.info(`Long rest (8 hours): hit points and power points restored, ${regained} Hit Dice regained.${work?.note ? ` ${work.note}.` : ""}${party.length ? " Your companions are back to full." : ""} Alarms have died down.`);
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

  // ---------------------------------------------------------------------------------------------
  // Gear, tools, companions and vehicles (shared/logic "Gear, tools, companions and ground
  // transport"). What an item does is read from its description; what the books leave open is a
  // house rule and says so where it is used.
  // ---------------------------------------------------------------------------------------------
  const play: PlayState = (character?.playState ?? {}) as PlayState;
  const party: Companion[] = Array.isArray(character?.companionData?.party) ? character.companionData.party : [];
  const factsOf = (name: string) => equipmentData.find((e) => e.name === name);
  const gearOf = (name: string): GearUse | undefined => gearUse({ name, equipmentCategory: factsOf(name)?.equipmentCategory, description: factsOf(name)?.description });
  const die = (sides: number) => Math.floor(Math.random() * sides) + 1;
  const clockNow = () => useClock.getState().minutes;
  const speed = (what: string) => toast.info(what);

  // One of an item gone, or a use of the kit that is open
  const consume = (name: string, uses?: number): { equipment: string[]; charges: Record<string, number> } => {
    const equipment: string[] = [...(character.equipment ?? [])];
    const charges = { ...(play.charges ?? {}) };
    const at = equipment.indexOf(name);
    if (at < 0) return { equipment, charges };
    if (uses && uses > 1) {
      const used = (charges[name] ?? 0) + 1;
      if (used >= uses) {
        equipment.splice(at, 1);
        charges[name] = 0;
      } else charges[name] = used;
    } else equipment.splice(at, 1);
    return { equipment, charges };
  };
  const usesLeft = (name: string, uses?: number) => (uses && uses > 1 ? uses - (play.charges?.[name] ?? 0) : undefined);

  const saveParty = (next: Companion[], extra: Record<string, any> = {}) =>
    saveCharacter({ companionData: { ...(character.companionData ?? {}), party: next }, ...extra });
  const isOrganic = (c: { creature?: string }) => !/droid|construct/i.test(c.creature ?? "");

  // What the character can do for a creature with an item: whom, and how much a die gives
  const hitDieOfCharacter = hitDie;
  const healFor = (who: "self" | Companion, max = false) => {
    const sides = who === "self" ? hitDieOfCharacter : hitDieOfSize(who.size);
    const bonus = who === "self" ? modifier(character.abilityScores?.constitution) : who.saves?.constitution ?? 0;
    return Math.max(1, (max ? sides : die(sides)) + bonus);
  };

  // A boon is for one thing and ends with the next rest
  const clearBoon = (state: PlayState = play): PlayState => ({ ...state, boon: undefined });

  // Use an item on the character or a companion, away from a fight
  const useOn = (name: string, who: "self" | string) => {
    if (!character || inCombat) return;
    const use = gearOf(name);
    if (!use) return;
    const companion = who === "self" ? undefined : party.find((c) => c.id === who);
    const spent = consume(name, "uses" in use ? use.uses : undefined);
    const state: PlayState = { ...play, charges: spent.charges };
    const changes: Record<string, any> = { equipment: spent.equipment };
    let note = "";
    if (use.kind === "heal" || use.kind === "repair") {
      const droidTarget = companion ? !isOrganic(companion) : false;
      if (use.kind === "heal" && droidTarget) return speed("A medpac works on beasts and humanoids, not on droids or constructs.");
      if (use.kind === "repair" && !droidTarget) return speed("A repair kit is for droids and constructs.");
      const maxed = use.kind === "heal" && play.boon?.kind === "medpac";
      const amount = healFor(companion ?? "self", maxed);
      if (maxed) changes.playState = { ...state, boon: undefined };
      if (companion) {
        saveParty(party.map((c) => (c.id === companion.id ? { ...c, hp: Math.min(c.maxHp, c.hp + amount) } : c)), changes);
        note = `${companion.name} regains ${amount} hit points${companion.hp <= 0 ? " and is back on their feet" : ""}`;
      } else {
        if (use.kind === "repair") return speed("You are not a droid.");
        lastSavedHp.current = Math.min(character.maxHp, character.currentHp + amount);
        saveCharacter({ ...changes, currentHp: lastSavedHp.current, playState: changes.playState ?? state });
        note = `${amount} hit points regained${maxed ? " (the prepared medpac gives the most it can)" : ""}`;
      }
    } else if (use.kind === "stabilize") {
      if (!companion) return speed("That is for someone who has fallen: use it on a companion.");
      if ((use.target === "droid") === isOrganic(companion)) return speed(use.target === "droid" ? "An emergency battery is for droids." : "A traumakit is for beasts and people, not droids.");
      if (companion.hp > 0) return speed(`${companion.name} is on their feet.`);
      saveParty(party.map((c) => (c.id === companion.id ? { ...c, hp: 1 } : c)), { ...changes, playState: state });
      note = `${companion.name} is stable, with 1 hit point`;
    } else if (use.kind === "antidote") {
      const conditions: string[] = character.conditions ?? [];
      const cured = conditions.includes("Poisoned");
      saveCharacter({ ...changes, playState: { ...state, protectedUntil: clockNow() + 60 }, ...(cured ? { conditions: conditions.filter((c) => c !== "Poisoned") } : {}) });
      note = cured ? "the poison is neutralized" : "advantage on saving throws against poison for an hour";
    } else if (use.kind === "substance") {
      const next = takeSubstance(name, use, state);
      saveCharacter({ ...changes, ...next.changes, playState: next.state });
      note = next.note;
    } else return;
    toast.success(`${name}${usesLeft(name, "uses" in use ? use.uses : undefined) !== undefined ? ` (${usesLeft(name, "uses" in use ? use.uses : undefined)! > 0 && spent.equipment.includes(name) ? usesLeft(name, "uses" in use ? use.uses : undefined) : 0} uses left)` : ""}: ${note}.`);
  };

  // Substances (Wretched Hives, "Substances"): a high for a minute, then a Wisdom save against a
  // low of ten minutes, then a Constitution save against addiction. House rule: out of a fight the
  // high waits for the next ability check, and ends with it (the map clock would run it out unused).
  const addictionLevel = play.addiction ?? 0;
  const takeSubstance = (name: string, use: Extract<GearUse, { kind: "substance" }>, state: PlayState) => {
    const now = clockNow();
    const changes: Record<string, any> = {};
    let note = "";
    let addiction = addictionLevel;
    // Taking another while high or low: a saving throw against addiction first
    const busy = state.substance;
    if (busy) {
      const roll = die(20) + modifier(character.abilityScores?.constitution);
      if (roll < use.constitutionDc) {
        addiction = Math.min(6, addiction + 1);
        note += `Addiction save failed (${roll} against ${use.constitutionDc}): level ${addiction}. `;
      }
    }
    const carriedLow = busy?.phase === "low" ? Math.max(0, busy.ends - now) : 0;
    const lowMinutes = 10 * (addiction >= 3 ? 4 : addiction >= 1 ? 2 : 1) + carriedLow;
    const boost = use.poolDice ? Math.max(1, rollDamage(use.poolDice, false) >> (addiction >= 4 ? 1 : 0)) : 0;
    const reduce = use.lowDice ? rollDamage(use.lowDice, false) : 0;
    const high = { name, ability: use.ability, pool: use.pool, phase: "high" as const, ends: now + 10, lowMinutes, boost, reduce, temp: use.temp, wisdomDc: use.wisdomDc, constitutionDc: use.constitutionDc };
    if (boost) {
      // Current and maximum tech or force points rise together
      changes.maxForcePoints = (character.maxForcePoints ?? 0) + boost;
      changes.currentForcePoints = (character.currentForcePoints ?? 0) + boost;
      lastSavedPoints.current = changes.currentForcePoints;
    }
    note += `a high${use.ability ? ` (+d3 on ${use.ability} checks, attacks and saves)` : ""}${boost ? ` (+${boost} points)` : ""}${use.temp ? ` (${use.temp} temporary hit points each turn in a fight)` : ""}, until your next check or fight`;
    return { state: { ...state, addiction, substance: high, lastSubstance: now }, changes, note };
  };

  // The high ends (it was used, or ten minutes went by): a Wisdom saving throw against the low
  const endHigh = (reason: string) => {
    const s = play.substance;
    if (!character || !s || s.phase !== "high") return;
    const changes: Record<string, any> = {};
    if (s.boost) {
      changes.maxForcePoints = Math.max(0, (character.maxForcePoints ?? 0) - s.boost);
      changes.currentForcePoints = Math.max(0, Math.min(changes.maxForcePoints, (character.currentForcePoints ?? 0) - s.boost));
      lastSavedPoints.current = changes.currentForcePoints;
    }
    const roll = die(20) + modifier(character.abilityScores?.wisdom);
    const saved = roll >= s.wisdomDc;
    if (saved) {
      saveCharacter({ ...changes, playState: { ...play, substance: undefined } });
      toast.info(`${s.name}: the high ends (${reason}). Wisdom save ${roll} against ${s.wisdomDc}: no low.`);
      return;
    }
    // The low reverses the high
    if (s.boost) {
      changes.maxForcePoints = Math.max(0, changes.maxForcePoints - s.boost);
      changes.currentForcePoints = Math.max(0, Math.min(changes.maxForcePoints, changes.currentForcePoints - s.boost));
    }
    if (s.reduce) {
      changes.maxHp = Math.max(1, character.maxHp - s.reduce);
      changes.currentHp = lastSavedHp.current = Math.max(1, Math.min(changes.maxHp, character.currentHp - s.reduce));
    }
    saveCharacter({ ...changes, playState: { ...play, substance: { ...s, phase: "low", ends: clockNow() + s.lowMinutes } } });
    toast.error(`${s.name}: the high ends (${reason}). Wisdom save ${roll} against ${s.wisdomDc}: a low for ${s.lowMinutes} minutes (-d3 with ${s.ability ?? "its ability"})${s.reduce ? `, ${s.reduce} fewer hit points` : ""}.`);
  };
  // The low ends: a Constitution saving throw against addiction
  const endLow = () => {
    const s = play.substance;
    if (!character || !s || s.phase !== "low") return;
    const changes: Record<string, any> = {};
    if (s.boost) {
      changes.maxForcePoints = (character.maxForcePoints ?? 0) + s.boost;
    }
    if (s.reduce) changes.maxHp = character.maxHp + s.reduce;
    const roll = die(20) + modifier(character.abilityScores?.constitution);
    const hooked = roll < s.constitutionDc;
    const addiction = Math.min(6, addictionLevel + (hooked ? 1 : 0));
    saveCharacter({ ...changes, playState: { ...play, substance: undefined, addiction } });
    toast[hooked ? "error" : "info"](`${s.name}: the low ends. Constitution save ${roll} against ${s.constitutionDc}: ${hooked ? `you are hooked (addiction level ${addiction})` : "no addiction"}.`);
  };
  // Time moves a substance along; ten minutes of waiting ends a high nobody used
  useEffect(() => {
    const s = play.substance;
    if (!character || !s || inCombat) return;
    if (s.phase === "high" && clock >= s.ends) endHigh("ten minutes went by");
    else if (s.phase === "low" && clock >= s.ends) endLow();
  }, [clock, play.substance?.phase, play.substance?.ends, inCombat]);
  // What a high or a low adds to a check with an ability: +d3 on a high (which then ends), -d3 on a low
  const substanceFor = (ability: string): number => {
    const s = play.substance;
    if (!s || s.ability !== ability) return 0;
    return s.phase === "high" ? die(3) : -die(3);
  };

  // Abstaining for a day and a long rest: a Wisdom save to lower the level of addiction (see rest)
  const detox = (): Record<string, any> => {
    if (!addictionLevel || play.substance) return {};
    const last = play.lastSubstance ?? -Infinity;
    if (clockNow() - last < DAY) return {};
    const roll = die(20) + modifier(character.abilityScores?.wisdom);
    const dc = 10 + addictionLevel;
    if (roll >= dc) {
      toast.success(`A day without: Wisdom save ${roll} against ${dc}. Addiction falls to level ${addictionLevel - 1}.`);
      return { playState: { ...play, addiction: addictionLevel - 1 } };
    }
    toast.info(`A day without: Wisdom save ${roll} against ${dc}. The craving holds.`);
    return {};
  };

  // Poison on a weapon (see Medical: Poison): a dose lasts the fight it is used in
  const coatWeapon = (name: string) => {
    const use = gearOf(name);
    if (use?.kind !== "poison") return;
    const wielded = carriedWeapons(character).find((w) => /vibro|launcher|knife|blade|sword/i.test(`${w.type} ${w.name}`) && !w.ranged) ?? carriedWeapons(character).find((w) => /launcher/i.test(w.name));
    if (!wielded) return speed("Poison goes on a vibroweapon, a slug cartridge or a wrist launcher dart: you carry none in hand.");
    const spent = consume(name);
    saveCharacter({ equipment: spent.equipment, playState: { ...play, poison: { dice: use.dice, dc: use.dc } } });
    toast.success(`${wielded.name} is coated: the next hit adds ${use.dice} poison damage (Constitution save DC ${use.dc} for half).`);
  };

  // ---- Tools (Wretched Hives, "Tool Proficiencies")
  const toolInfo = (name: string) => toolFor(name, factsOf(name)?.equipmentCategory, toolData);
  const trainedWith = (name: string) => toolTrained(character, name, factsOf(name)?.equipmentCategory);
  const toolsCarried: string[] = Array.from(new Set<string>((character?.equipment ?? []).filter((n: string) => ["Kit", "Tool", "GamingSet", "MusicalInstrument"].includes(factsOf(n)?.equipmentCategory ?? ""))));
  const setsCarried = toolsCarried.filter((n) => factsOf(n)?.equipmentCategory === "GamingSet");
  const instrumentsCarried = toolsCarried.filter((n) => factsOf(n)?.equipmentCategory === "MusicalInstrument");
  // A check with a tool: the ability (Intelligence unless said), with proficiency when trained with
  // the tool and advantage when also trained in a skill the tool is for (house rule: the book
  // leaves it to the GM, "consider allowing the character to make the check with advantage")
  const toolRoll = (name: string, dc: number, what: string, ability = "intelligence", extra = 0) => {
    const info = toolInfo(name);
    const trained = trainedWith(name);
    const skillNames = (info?.skills ?? []).flatMap((s) => s.skill.map((x) => x.toLowerCase()));
    const edge = trained && skillNames.some((sk) => skilled(sk));
    const first = die(20);
    const roll = edge ? Math.max(first, die(20)) : first;
    const high = substanceFor(ability);
    if (high > 0 && play.substance?.phase === "high") setTimeout(() => endHigh("used on a check"), 0);
    const bonus = modifier(character.abilityScores?.[ability]) + (trained ? proficiency : 0) + high + extra;
    const total = roll + bonus;
    const success = total >= dc;
    toast[success ? "success" : "error"](`${what} (${name}${trained ? "" : ", untrained"}${edge ? ", advantage" : ""}): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against DC ${dc}. ${success ? "Success." : "Failed."}`);
    return { success, total, roll };
  };

  // A tool's special use is worked at a rest, once. The tool chosen for the coming rest:
  const [restTool, setRestTool] = useState("");
  const workableTools = toolsCarried.filter((n) => {
    const info = toolInfo(n);
    return !!info?.feature && trainedWith(n) && !!boonOf(info, proficiency);
  });
  const weaponFits = (boon: Boon) => {
    if (!boon.weapon) return true;
    const kinds = carriedWeapons(character).map((w) => `${w.type} ${w.name}`.toLowerCase());
    const wanted = boon.weapon === "blaster or vibroweapon" ? /blaster|vibro/ : boon.weapon === "lightweapon" ? /light/ : /vibro/;
    return kinds.some((k) => wanted.test(k));
  };
  // What the chosen tool does for this rest: the check (DC 15) and what it gives. Returns what the
  // rest should add: a prepared boon for the next fight, extra healing from a meal, a cure.
  const workTool = (rest: "short" | "long") => {
    if (!restTool || !toolsCarried.includes(restTool)) return null;
    const info = toolInfo(restTool);
    const boon = info ? boonOf(info, proficiency) : undefined;
    if (!info || !boon) return null;
    const result: { boon?: Boon; mealHp?: number; mealDice?: number; herbal?: boolean; repairDie?: number; credit?: number; note: string; food?: string } = { note: "" };
    if (boon.kind === "meal") {
      const food = (character.equipment ?? []).find((n: string) => /rations/i.test(n));
      if (!food) {
        toast.error("A meal needs food: you carry no rations.");
        return null;
      }
      result.food = food;
    }
    const check = toolRoll(restTool, 15, `${boon.feature}`);
    if (!check.success) return { note: `${boon.feature} failed.` } as typeof result;
    if (boon.kind === "meal") {
      if (rest === "short") result.mealHp = 1;
      else result.mealDice = 2;
      result.note = rest === "short" ? "a meal: one extra hit point for each Hit Die spent, you and up to five companions" : "a meal: two more Hit Dice regained, and advantage on Constitution saves against disease for a day";
    } else if (boon.kind === "herbal") {
      result.herbal = true;
      result.note = "herbal remedies cure one poison or disease";
    } else if (boon.kind === "repair") {
      result.repairDie = boon.die;
      result.note = `droids regain d${boon.die} extra for each Hit Die they spend`;
    } else if (!weaponFits(boon) && boon.kind !== "check" && boon.kind !== "medpac" && boon.kind !== "poison" && boon.kind !== "note" && boon.kind !== "ac") {
      result.note = `${boon.feature} worked, but you carry nothing to use it on (${boon.weapon})`;
    } else {
      result.boon = boon;
      result.note = boon.die ? `${boon.feature}: a d${boon.die} for ${boon.kind === "ac" ? "armor class against one attack" : boon.kind === "check" ? "one check" : boon.kind === "medpac" ? "the next medpac (the most it can give)" : `one ${boon.kind}`}, until your next rest` : `${boon.feature} ready until your next rest`;
    }
    return result;
  };

  // ---- Games (Wretched Hives, "Gambling (Uptime)"): five checks, stake 20 to 2,000 credits
  type Gamble = { against: string; label: string; set: string; stake: number; round: number; wins: number; log: string[]; opponentBonus: number; house: boolean; result?: { change: number; debt: number; text: string; complications: string[] } };
  const [gamble, setGamble] = useState<Gamble | null>(null);
  const [stake, setStake] = useState(100);
  const approaches: { id: GambleApproach; label: string; ability: string; needsTraining: boolean }[] = [
    { id: "game", label: "Play the game (Intelligence)", ability: "intelligence", needsTraining: false },
    { id: "deception", label: "Bluff (Charisma, Deception)", ability: "charisma", needsTraining: true },
    { id: "insight", label: "Read them (Wisdom, Insight)", ability: "wisdom", needsTraining: true },
  ];
  const startGamble = (against: string, label: string, set: string, opponentBonus: number, house = false) => {
    if (stake < GAMBLE_STAKE[0] || stake > Math.min(GAMBLE_STAKE[1], character.credits ?? 0)) {
      toast.error(`The stake is ${GAMBLE_STAKE[0]} to ${GAMBLE_STAKE[1].toLocaleString()} credits, and no more than you have (${character.credits ?? 0}).`);
      return;
    }
    setGamble({ against, label, set, stake, round: 0, wins: 0, log: [], opponentBonus, house });
  };
  const gambleRound = (approach: GambleApproach) => {
    if (!gamble || gamble.result) return;
    const trained = trainedWith(gamble.set);
    const choice = approaches.find((a) => a.id === approach)!;
    const rival: GambleApproach = (["game", "deception", "insight"] as GambleApproach[])[die(3) - 1];
    const mode = gamble.house ? 0 : gambleMode(approach, rival);
    const twice = (m: number) => {
      const a = die(20);
      const b = die(20);
      return m > 0 ? Math.max(a, b) : m < 0 ? Math.min(a, b) : a;
    };
    const skillBonus = approach === "game" ? (trained ? proficiency : 0) : skilled(approach === "deception" ? "deception" : "insight") ? proficiency : 0;
    const high = substanceFor(choice.ability);
    if (high > 0 && play.substance?.phase === "high") setTimeout(() => endHigh("used at the table"), 0);
    const bonus = modifier(character.abilityScores?.[choice.ability]) + skillBonus + high;
    let mine = twice(mode) + bonus;
    let line: string;
    let won: boolean;
    if (gamble.house) {
      won = mine >= GAMBLE_HOUSE_DC;
      line = `Round ${gamble.round + 1}: ${mine} against the house's DC ${GAMBLE_HOUSE_DC}: ${won ? "a win" : "a loss"}.`;
    } else {
      let theirs = twice(-mode) + gamble.opponentBonus;
      // A tie is played again
      while (theirs === mine) {
        mine = twice(mode) + bonus;
        theirs = twice(-mode) + gamble.opponentBonus;
      }
      won = mine > theirs;
      line = `Round ${gamble.round + 1}: you ${approach === "game" ? "play" : approach === "deception" ? "bluff" : "read them"}, they ${rival === "game" ? "play" : rival === "deception" ? "bluff" : "read you"}${mode ? ` (${mode > 0 ? "advantage" : "disadvantage"})` : ""}: ${mine} to ${theirs}: ${won ? "a win" : "a loss"}.`;
    }
    const wins = gamble.wins + (won ? 1 : 0);
    const round = gamble.round + 1;
    if (round < GAMBLE_ROUNDS) return setGamble({ ...gamble, round, wins, log: [...gamble.log, line] });
    const result = gambleResult(wins, gamble.stake);
    // Each win has a one in ten chance of drawing the wrong kind of attention
    const complications = Array.from({ length: wins }, () => (Math.random() < GAMBLE_COMPLICATION ? GAMBLE_COMPLICATIONS[die(6) - 1] : "")).filter(Boolean);
    saveCharacter({ credits: Math.max(0, (character.credits ?? 0) + result.change), ...(result.debt ? { playState: { ...play, debt: (play.debt ?? 0) + result.debt } } : {}) });
    setGamble({ ...gamble, round, wins, log: [...gamble.log, line], result: { ...result, complications } });
  };

  // ---- Playing an instrument for a room (house rule: Musical Instruments give Performance and
  // the book's sample DCs, tune 10 / manipulate the audience 15 / improvise 20; it prices no tips)
  const perform = (instrument: string) => {
    if (!here || !world || inCombat || dead) return;
    const audience = Math.min(12, (hereNow ?? here).occupants.filter((o) => o.disposition !== "hostile" && !o.disabled && !o.captive).reduce((n, o) => n + (o.count ?? 1), 0));
    if (hostiles.length) return speed("Not with armed enemies in the room.");
    if (!audience) return speed("There is nobody here to play to.");
    const dc = /cantina|bar|booth/i.test(here.name) ? 12 : 15;
    const trained = trainedWith(instrument);
    const tuned = play.boon?.kind === "check" ? die(play.boon.die || 2) : 0;
    const bonus = modifier(character.abilityScores?.charisma) + (skilled("performance") ? proficiency : 0) + (trained ? proficiency : 0) + tuned + substanceFor("charisma");
    const roll = die(20);
    const total = roll + bonus;
    const margin = total - dc;
    const tips = margin >= 0 ? Array.from({ length: audience }, () => die(4)).reduce((a, b) => a + b, 0) * (1 + (margin >= 5 ? 1 : 0) + (margin >= 10 ? 1 : 0)) : 0;
    const changes: Record<string, any> = { ...(tuned ? { playState: clearBoon() } : {}) };
    if (tips) changes.credits = (character.credits ?? 0) + tips;
    if (Object.keys(changes).length) saveCharacter(changes);
    const holder = factionAt(world, here.id);
    if (margin >= 10 && holder) saveCampaign({ factionInfluence: addRenown(standing, holder, 1), ...pass(60) });
    else saveCampaign(pass(60));
    toast[margin >= 0 ? "success" : "error"](`${instrument} for ${audience} listener${audience === 1 ? "" : "s"} (Performance${trained ? "" : ", untrained"}): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against DC ${dc}. ${margin >= 0 ? `They are generous: ${tips} credits${margin >= 10 && holder ? `, and word reaches ${holder}` : ""}.` : "A cold room, and nothing in the hat."} An hour passes. (House rule: the books price no tips.)`);
  };

  // ---- Companions: hiring, freeing, mending droids, gentling beasts
  const baseOf = (id: string): Area | undefined => (world ? Object.values(world.areas).find((a) => a.occupants.some((o) => o.id === id)) : undefined);
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const partyFull = party.length >= COMPANION_LIMIT;
  const mountsTable = transport?.mounts ?? [];
  // Edit the occupants of the area an occupant belongs to
  const editBase = (occupantId: string, change: (list: Occupant[]) => Occupant[], extra: Record<string, any> = {}) => {
    const area = baseOf(occupantId);
    if (!area || !world) return;
    saveCampaign({ galaxyMap: updateArea(world, area.id, { occupants: change(area.occupants) }).world, ...extra });
  };
  // One of a group takes up with the party (the rest of the group stays)
  const recruit = (o: Occupant, kind: CompanionKind, how: string, extra: Partial<Companion> = {}, changes: Record<string, any> = {}, campaign: Record<string, any> = {}) => {
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    const companion = companionFrom(o, kind, clockNow(), newId("c"), { how, ...extra }, mountsTable);
    editBase(
      o.id,
      (list) => list.flatMap((x) => (x.id !== o.id ? [x] : x.count > 1 ? [{ ...x, count: x.count - 1, wounds: x.wounds?.slice(1) }] : [])),
      campaign,
    );
    saveParty([...party, companion], changes);
    toast.success(`${companion.name} ${kind === "hireling" ? "joins you for hire" : kind === "droid" ? "is yours now" : kind === "beast" ? "follows you" : "comes with you"}${companion.mount ? " (it can be ridden)" : ""}.`);
  };
  const dismiss = (c: Companion) => {
    saveParty(party.filter((x) => x.id !== c.id));
    // They stay where the party is (a droid or beast waits; a hireling goes about their business)
    if (world && here) saveCampaign({ galaxyMap: updateArea(world, here.id, { occupants: [...here.occupants, { id: newId("o"), name: c.name, role: c.kind === "hireling" ? c.role : c.kind === "droid" ? "utility droid" : c.kind === "beast" ? "wildlife" : "local", disposition: "neutral", count: 1, species: c.species, statBlock: c.statBlock, cr: c.cr, xp: c.xp, armorClass: c.armorClass, hitPoints: c.maxHp, attack: c.attack, speed: c.speed, size: c.size, creature: c.creature, saves: c.saves, loadout: c.loadout, wounds: c.hp < c.maxHp ? [c.hp] : undefined }] }).world });
    toast.info(`${c.name} stays behind.`);
  };

  // Hiring (house rule): a signing fee of five days' wages, then the wage each day
  const hire = (o: Occupant, placeId: string) => {
    if (!world || !character) return;
    const attitude = attitudeOf(world, o, placeId, customer).score;
    const fee = hireFee(o.xp, attitude);
    if (fee > (character.credits ?? 0)) return toast.error(`${o.name} wants ${fee} credits to sign on and you have ${character.credits ?? 0}.`);
    recruit(o, "hireling", "hired", { wage: wageFor(o.xp) }, { credits: (character.credits ?? 0) - fee }, { factionInfluence: { ...standing, dealings: { ...standing.dealings, [o.id]: (standing.dealings[o.id] ?? 0) + 1 } } });
  };

  // Wages come due as the days pass; a hireling not paid leaves
  const paidThrough: number = character?.companionData?.paidThrough ?? today;
  useEffect(() => {
    if (!character || !party.length || today <= paidThrough || inCombat) return;
    const wage = party.reduce((sum, c) => sum + c.wage, 0);
    const owed = wage * (today - paidThrough);
    if (!wage) return void saveCharacter({ companionData: { ...(character.companionData ?? {}), paidThrough: today } });
    if ((character.credits ?? 0) >= owed) {
      saveCharacter({ credits: character.credits - owed, companionData: { ...(character.companionData ?? {}), paidThrough: today } });
      toast.info(`Wages: ${owed} credits for ${today - paidThrough} day${today - paidThrough === 1 ? "" : "s"}.`);
    } else {
      const gone = party.filter((c) => c.wage > 0);
      saveCharacter({ companionData: { ...(character.companionData ?? {}), party: party.filter((c) => c.wage === 0), paidThrough: today } });
      toast.error(`You cannot pay ${owed} credits: ${gone.map((c) => c.name).join(", ")} ${gone.length > 1 ? "leave" : "leaves"} (house rule).`);
    }
  }, [today, party.length, inCombat]);

  // Freeing those held in bonds: the lock or the collar's circuit (Security kit, Slicer's kit),
  // or the strength to break chains (Binders: DC 20 Strength). Each try takes ten minutes.
  const freeCaptive = (o: Occupant, how: "kit" | "break") => {
    if (!o.captive || !world) return;
    // Their guards see what is done under their noses
    if (hostiles.length > 0 && !unseen("Working at the lock")) return;
    const { restraint, dc } = o.captive;
    const spec = FREEING[restraint];
    const kit = spec.tools.find((t) => carries(new RegExp(`^${t.replace(/[^a-z]/gi, ".")}$`, "i")));
    let result: { success: boolean };
    if (how === "kit") {
      if (!kit) return toast.error(`You need a ${spec.tools[0].toLowerCase()}.`);
      const name = (character.equipment ?? []).find((n: string) => n.toLowerCase() === kit.toLowerCase())!;
      const spike = (character.equipment ?? []).find((n: string) => gearOf(n)?.kind === "spike" && (gearOf(n) as any).tool.toLowerCase() === kit.toLowerCase());
      result = toolRoll(name, dc, spec.label, spec.ability.includes("dexterity") && modifier(character.abilityScores?.dexterity) > modifier(character.abilityScores?.intelligence) ? "dexterity" : "intelligence");
      // A spike rerolls a failed check
      if (!result.success && spike) {
        const spent = consume(spike);
        saveCharacter({ equipment: spent.equipment });
        toast.info(`${spike}: reroll.`);
        result = toolRoll(name, dc, `${spec.label} (rerolled)`, "intelligence");
      }
    } else {
      const roll = die(20) + modifier(character.abilityScores?.strength) + substanceFor("strength");
      result = { success: roll >= 20 };
      toast[result.success ? "success" : "error"](`Break the ${restraint === "collar" ? "collar" : "chains"} (Strength): ${roll} against DC 20. ${result.success ? "It gives." : "It holds."} (Binders: Breaking them requires a DC 20 Strength check.)`);
    }
    const time = pass(10);
    if (!result.success) return void saveCampaign(time);
    editBase(o.id, (list) => list.map((x) => (x.id === o.id ? { ...x, captive: undefined, role: "freed", disposition: "friendly" as const } : x)), time);
    toast.success(`${o.name} is free.`);
  };
  // Freed, they can come along, or be sent home: a deed worth experience (house rule: 25 x your level)
  const sendHome = (o: Occupant) => {
    if (!world || !here) return;
    const xp = 25 * level;
    const holder = factionAt(world, here.id);
    editBase(o.id, (list) => list.flatMap((x) => (x.id !== o.id ? [x] : x.count > 1 ? [{ ...x, count: x.count - 1 }] : [])), holder ? { factionInfluence: addRenown(standing, holder, -1) } : {});
    saveCharacter({ experience: (character.experience ?? 0) + xp });
    toast.success(`${o.name} goes home, with thanks. ${xp} XP (house rule).${holder ? ` ${holder} will not like it.` : ""}`);
  };

  // Droids powered down by a fight (disabled): stabilize, mend, then a restraining bolt or reprogramming
  const unitOf = (o: Occupant) => o.wounds?.[0] ?? 0;
  // One droid of a group, as an occupant of its own
  const splitOne = (o: Occupant, list: Occupant[]): { list: Occupant[]; unit: Occupant } => {
    if (o.count <= 1) return { list, unit: o };
    const unit: Occupant = { ...o, id: newId("o"), count: 1, wounds: [o.wounds?.[0] ?? 0] };
    return { list: list.flatMap((x) => (x.id === o.id ? [{ ...x, count: x.count - 1, wounds: x.wounds?.slice(1) }, unit] : [x])), unit };
  };
  const mendDroid = (o: Occupant, how: "battery" | "check" | "kit") => {
    if (!world) return;
    const area = baseOf(o.id);
    if (!area) return;
    const { list, unit } = splitOne(o, area.occupants);
    let hp = unit.wounds?.[0] ?? 0;
    const changes: Record<string, any> = {};
    if (how === "kit") {
      const kit = (character.equipment ?? []).find((n: string) => gearOf(n)?.kind === "repair");
      if (!kit) return toast.error("You need a repair kit.");
      const use = gearOf(kit) as Extract<GearUse, { kind: "repair" }>;
      const spent = consume(kit, use.uses);
      const amount = Math.max(1, die(hitDieOfSize(unit.size)) + (unit.saves?.constitution ?? 0) + (play.boon?.kind === "repair" ? die(play.boon.die) : 0));
      hp = Math.min(unit.hitPoints ?? 1, hp + amount);
      Object.assign(changes, { equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
      toast.success(`Repair kit: ${unit.name} regains ${amount} hit points (${hp}/${unit.hitPoints}).`);
    } else if (how === "battery") {
      const battery = (character.equipment ?? []).find((n: string) => gearOf(n)?.kind === "stabilize" && (gearOf(n) as any).target === "droid");
      if (!battery) return toast.error("You need an emergency battery.");
      const use = gearOf(battery) as Extract<GearUse, { kind: "stabilize" }>;
      const spent = consume(battery, use.uses);
      hp = Math.max(1, hp);
      Object.assign(changes, { equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
      toast.success(`Emergency battery: ${unit.name} is stable, with ${hp} hit point${hp === 1 ? "" : "s"}.`);
    } else {
      const check = toolRoll(toolsCarried.find((n) => /astrotech|mechanic|tinker/i.test(n)) ?? "Toolkit", 10, `Stabilize ${unit.name}`, "intelligence", 0);
      if (!check.success) return void saveCampaign(pass(10));
      hp = Math.max(1, hp);
    }
    saveCampaign({ galaxyMap: updateArea(world, area.id, { occupants: list.map((x) => (x.id === unit.id ? { ...x, wounds: [hp] } : x)) }).world, ...pass(how === "kit" ? 1 : 10) });
    if (Object.keys(changes).length) saveCharacter(changes);
  };
  // The droid comes online hostile
  const wakeHostile = (o: Occupant, why: string) => {
    if (!world) return;
    const area = baseOf(o.id);
    if (!area) return;
    const { list, unit } = splitOne(o, area.occupants);
    const next = list.map((x) => (x.id === unit.id ? { ...x, disabled: undefined, disposition: "hostile" as const, role: "guard", wounds: [Math.max(1, unitOf(unit))] } : x));
    saveCampaign({ galaxyMap: setAlert(updateArea(world, area.id, { occupants: next }).world, area.id, ALERT.attacking) });
    toast.error(why);
  };
  const boltDroid = (o: Occupant) => {
    if (!world || partyFull) return partyFull ? toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`) : undefined;
    if (unitOf(o) < 1) return toast.error("It has to be stabilized first: a restraining bolt answers to a droid that is running.");
    const boltName = (character.equipment ?? []).find((n: string) => gearOf(n)?.kind === "bolt");
    if (!boltName) return toast.error("You need a restraining bolt.");
    const use = gearOf(boltName) as Extract<GearUse, { kind: "bolt" }>;
    const spent = consume(boltName);
    // The droid saves against the bolt (a hostile droid with advantage, the book says); a save overloads it
    const a = die(20);
    const roll = Math.max(a, die(20)) + (o.saves?.constitution ?? 0);
    const resisted = roll >= use.dc;
    const time = pass(1);
    if (resisted) {
      saveCharacter({ equipment: spent.equipment });
      saveCampaign(time);
      return wakeHostile(o, `${o.name} saves (${roll} against DC ${use.dc}): the bolt overloads, and its optics flare.`);
    }
    const area = baseOf(o.id);
    if (!area) return;
    const { unit } = splitOne(o, area.occupants);
    // The droid keeps the hit points it has
    recruit({ ...unit, wounds: [unitOf(unit)] }, "droid", `under a ${boltName.toLowerCase()}`, { bolt: boltName }, { equipment: spent.equipment }, time);
  };
  const reprogramDroid = (o: Occupant) => {
    if (!world) return;
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    if (unitOf(o) < 1) return toast.error("It has to be stabilized first.");
    const kit = toolsCarried.find((n) => /^slicer's kit$/i.test(n));
    if (!kit) return toast.error("You need a slicer's kit to rewrite its routines.");
    const dc = reprogramDC(o);
    const check = toolRoll(kit, dc, `Reprogram ${o.name}`, "intelligence");
    const time = pass(10);
    if (check.success) {
      const area = baseOf(o.id);
      if (!area) return;
      const { unit } = splitOne(o, area.occupants);
      return recruit({ ...unit, wounds: [unitOf(unit)] }, "droid", "reprogrammed", { bolt: "reprogrammed" }, {}, time);
    }
    saveCampaign(time);
    if (check.total <= dc - 5) wakeHostile(o, `The reprogramming goes badly: ${o.name} comes online, hostile.`);
  };

  // Gentling a wild creature (house rule for the DC): Wisdom (Animal Handling); rations in hand
  // give advantage; it takes an hour; a failure by 5 or more is an attack
  const gentle = (o: Occupant) => {
    if (!world || !here || inCombat) return;
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    if (crOf(o) > gentleLimit(level)) return toast.error(`${o.name} (CR ${o.cr}) is too fierce for a character of level ${level} to gentle (house rule: up to CR ${gentleLimit(level)}).`);
    const hurt = (o.wounds?.[0] ?? o.hitPoints ?? 0) < (o.hitPoints ?? 0);
    const dc = gentleDC(o, hurt);
    const food = (character.equipment ?? []).find((n: string) => /rations/i.test(n));
    const first = die(20);
    const roll = food ? Math.max(first, die(20)) : first;
    const bonus = modifier(character.abilityScores?.wisdom) + (skilled("animal handling") ? proficiency : 0) + substanceFor("wisdom");
    const total = roll + bonus;
    const success = total >= dc;
    const spent = food ? consume(food) : null;
    toast[success ? "success" : "error"](`Animal Handling on ${o.name}${food ? ` (${food} in hand: advantage)` : ""}: ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against DC ${dc}. ${success ? "It settles." : total <= dc - 5 ? "It bares its teeth." : "It shies away; try again."}`);
    const time = pass(60);
    const changes: Record<string, any> = spent ? { equipment: spent.equipment } : {};
    if (success) return recruit({ ...o, wounds: [o.wounds?.[0] ?? o.hitPoints ?? 1] }, "beast", "gentled", {}, changes, time);
    if (Object.keys(changes).length) saveCharacter(changes);
    saveCampaign({ ...time, ...(total <= dc - 5 ? { galaxyMap: setAlert(world, here.id, ALERT.attacking) } : {}) });
  };

  // ---- Vehicles and the ground routes between settlements
  const vehicles: PartyVehicle[] = Array.isArray(campaign?.vehicles) ? campaign.vehicles : [];
  const inBuildingsHere: { building: Area; vehicle: Vehicle }[] = world && here
    ? [here, ...trailOf(world, here.id), ...childrenOf(world, here.id)].filter((a, i, all) => a.kind === "building" && all.indexOf(a) === i).flatMap((b) => (b.vehicles ?? []).map((v) => ({ building: b, vehicle: v })))
    : [];
  const parkedHere = world && here ? vehicles.filter((v) => v.areaId === berthOf(world, here.id)) : [];
  // The rides for a route: on foot, riding a companion, a speeder of the party's parked here, a hired ride
  const ridesFor = (exit: Exit): Ride[] => {
    const km = kmOf(exit.travel);
    if (!km || !transport || !world || !here || exit.needsShip || exit.via !== "path") return [];
    const settlement = world.areas[berthOf(world, here.id)];
    const riders = 1 + party.filter((c) => c.kind !== "beast").length;
    return groundRides({ km, vehicles: parkedHere, companions: party, riders, transport, hire: settlement?.id === here.id && hasRidesForHire(world, here.id) });
  };
  // The ride a trip takes when none was chosen (a tap on the map): the quickest that costs nothing
  const defaultRide = (rides: Ride[]) => [...rides].filter((r) => !r.blocked && !r.fare).sort((a, b) => a.minutes - b.minutes)[0];
  const rideText = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 6) / 10} h` : `${Math.floor(minutes / 1440)} d ${Math.round((minutes % 1440) / 60)} h`);

  // A speeder taken from a base, or mended where it stands (Mechanic's kit: "Restoring power to a
  // damaged vehicle", DC 15)
  const takeVehicle = (building: Area, vehicle: Vehicle) => {
    if (!world || !here) return;
    if (building.occupants.some((o) => o.disposition === "hostile" && o.hitPoints) || childrenOf(world, building.id).some((r) => r.occupants.some((o) => o.disposition === "hostile" && o.hitPoints && r.gateway))) {
      return toast.error("Someone is guarding it.");
    }
    if (vehicle.status === "wrecked") return toast.error("It is a wreck: it needs mending first (a mechanic's kit).");
    const mine: PartyVehicle = { ...vehicle, owner: character.name, areaId: berthOf(world, here.id) };
    saveCampaign({
      galaxyMap: updateArea(world, building.id, { vehicles: (building.vehicles ?? []).filter((v) => v.id !== vehicle.id) }).world,
      vehicles: [...vehicles, mine],
    });
    toast.success(`${vehicle.name} is yours.`);
  };
  const mendVehicle = (building: Area | null, vehicle: Vehicle) => {
    if (!world) return;
    const kit = toolsCarried.find((n) => /^mechanic's kit$/i.test(n));
    if (!kit) return toast.error("You need a mechanic's kit.");
    const check = toolRoll(kit, 15, `Restore power to ${vehicle.name}`, "intelligence");
    const time = pass(60);
    if (!check.success) return void saveCampaign(time);
    if (building) saveCampaign({ galaxyMap: updateArea(world, building.id, { vehicles: (building.vehicles ?? []).map((v) => (v.id === vehicle.id ? { ...v, status: "parked" as const } : v)) }).world, ...time });
    else saveCampaign({ vehicles: vehicles.map((v) => (v.id === vehicle.id ? { ...v, status: "parked" as const } : v)), ...time });
    toast.success(`${vehicle.name} runs again.`);
  };

  // Buying a speeder or a mount: they are not equipment, so they do not go in the pack
  const buyTransport = async (trader: Occupant, line: TradeLine) => {
    if (!world || !here || !transport) return;
    if (line.price > (character.credits ?? 0)) return toast.error(`${line.name} costs ${line.price.toLocaleString()} credits and you have ${(character.credits ?? 0).toLocaleString()}.`);
    if (line.category === "Vehicle") {
      const model = transport.vehicles.find((v) => v.name === line.name);
      if (!model) return;
      const mine: PartyVehicle = { id: newId("v"), name: model.name, model: model.name, mph: model.mph, value: line.price, status: "parked", owner: character.name, seats: SEATS[model.name] ?? 2, areaId: berthOf(world, here.id) };
      saveCharacter({ credits: character.credits - line.price });
      saveCampaign({ vehicles: [...vehicles, mine], availableResources: { ...ledger, traders: { ...ledger.traders, [trader.id]: { ...traderLedger(trader.id), bought: { ...traderLedger(trader.id).bought, [line.name]: (traderLedger(trader.id).bought[line.name] ?? 0) + 1 } } } } });
      return void toast.success(`${model.name} bought for ${line.price.toLocaleString()} credits. It is parked at ${world.areas[mine.areaId]?.name ?? "the settlement"}; ${model.mph} mph.`);
    }
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    const stat = mountStat(line.name);
    if (!stat) return toast.error("That mount is not in the rules data.");
    const response = await fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock: stat.id }) });
    if (!response.ok) return toast.error("Could not load that creature.");
    const o: Occupant = { ...(await response.json()), disposition: "neutral", role: "wildlife" };
    const companion = companionFrom(o, "beast", clockNow(), newId("c"), { how: "bought", name: line.name }, mountsTable);
    saveCharacter({ credits: character.credits - line.price });
    saveParty([...party, { ...companion, mount: true }]);
    saveCampaign({ availableResources: { ...ledger, traders: { ...ledger.traders, [trader.id]: { ...traderLedger(trader.id), bought: { ...traderLedger(trader.id).bought, [line.name]: (traderLedger(trader.id).bought[line.name] ?? 0) + 1 } } } } });
    toast.success(`${line.name} bought for ${line.price.toLocaleString()} credits: a mount that follows you (${companion.speed} ft. a round).`);
  };
  // The stat block of a mount in the rules data: "Dewback" is "Dewback, Adult"
  const mountStat = (name: string) => {
    const wanted = name.toLowerCase();
    const options = monsterNames.filter((m) => m.name.toLowerCase().startsWith(wanted));
    return options.find((m) => /adult|juvenile/i.test(m.name)) ?? options[0];
  };

  // ---- Fighting with companions and items
  // A companion as a combatant on the character's side
  const allyOf = (c: Companion) => ({
    id: c.id,
    name: c.name,
    hp: c.hp,
    maxHp: c.maxHp,
    initiative: 0,
    armorClass: c.armorClass,
    attackBonus: c.attack?.bonus ?? 2,
    damageDice: c.attack?.damage ?? "1d4",
    rangedAttacker: c.attack?.ranged ?? false,
    saves: c.saves,
    speed: c.speed || 30,
    reach: c.attack?.ranged ? 5 : c.attack?.range ?? 5,
    range: c.attack?.ranged ? ([c.attack.range ?? 80, c.attack.long ?? (c.attack.range ?? 80) * 4] as [number, number]) : undefined,
    size: c.size,
    creature: c.creature,
    role: c.kind === "droid" ? "droid" : c.kind === "beast" ? "wildlife" : "ally",
  });

  // What the character can use in a fight: healing and mending, stabilizing a fallen companion,
  // grenades, a dose of poison on the weapon, and a substance
  const combatItems: CombatItemOption[] = (() => {
    if (!character) return [];
    const out: CombatItemOption[] = [];
    const strength = modifier(character.abilityScores?.strength);
    for (const name of Array.from(new Set<string>(character.equipment ?? []))) {
      const use = gearOf(name);
      if (!use) continue;
      const left = usesLeft(name, "uses" in use ? use.uses : undefined);
      const label = `${name}${left !== undefined ? ` (${left} left)` : ""}`;
      const companionOf = (id?: number | string) => party.find((c) => c.id === String(id));
      if (use.kind === "heal" || use.kind === "repair") {
        out.push({
          key: name,
          label,
          hint: use.kind === "heal" ? "heals a person or beast" : "mends a droid",
          target: "ally",
          use: (id) => {
            const ally = companionOf(id);
            const droid = ally ? !isOrganic(ally) : false;
            if (use.kind === "heal" && droid) return !!speed("A medpac works on beasts and humanoids, not on droids.");
            if (use.kind === "repair" && !droid) return !!speed("A repair kit is for droids and constructs.");
            const maxed = use.kind === "heal" && play.boon?.kind === "medpac";
            const amount = healFor(ally ?? "self", maxed);
            if (!useCombat.getState().itemEffect({ kind: "heal", label: name, targetId: id ?? character.id, amount })) return false;
            const spent = consume(name, use.uses);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, charges: spent.charges, ...(maxed ? { boon: undefined } : {}) } });
            return true;
          },
        });
      } else if (use.kind === "stabilize") {
        out.push({
          key: name,
          label,
          hint: use.target === "droid" ? "gets a downed droid up" : "stabilizes the fallen",
          target: "ally",
          use: (id) => {
            const ally = companionOf(id);
            if (!ally) return !!speed("Use it on a companion who has fallen.");
            if ((use.target === "droid") === isOrganic(ally)) return !!speed(use.target === "droid" ? "An emergency battery is for droids." : "A traumakit is for beasts and people.");
            if (!useCombat.getState().itemEffect({ kind: "stabilize", label: name, targetId: ally.id, to: 1 })) return false;
            const spent = consume(name, use.uses);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
            return true;
          },
        });
      } else if (use.kind === "explosive" && (use.form === "grenade" || use.form === "detonator")) {
        out.push({
          key: name,
          label,
          hint: `${use.radius} ft., DC ${use.dc} ${use.save}${use.damage.length ? `, ${use.damage.map((d) => `${d.dice} ${d.type}`).join(" + ")}` : ""}${use.conditions.length ? `, ${use.conditions.join("/").toLowerCase()}` : ""}`,
          target: "foe",
          use: (id) => {
            if (id === undefined) return !!speed("There is nobody to throw it at.");
            const ok = useCombat.getState().itemEffect({
              kind: "explosive", label: name, targetId: id, radius: use.radius, maxFeet: 30 + strength * 5, dc: use.dc, save: use.save, damage: use.damage, conditions: use.conditions, conditionRounds: EXPLOSIVE_CONDITION_ROUNDS,
            });
            if (!ok) return false;
            const spent = consume(name);
            saveCharacter({ equipment: spent.equipment });
            return true;
          },
        });
      } else if (use.kind === "substance") {
        out.push({
          key: name,
          label,
          hint: `a high${use.ability ? ` on ${use.ability}` : ""}${use.temp ? `, ${use.temp} temporary hit points a turn` : ""}; a low follows`,
          target: "none",
          use: () => {
            const taken = takeSubstance(name, use, { ...play, charges: consume(name).charges });
            useCombat.getState().itemEffect({ kind: "substance", label: name, ability: use.ability, temp: use.temp, rounds: addictionLevel >= 2 ? 5 : 10 });
            saveCharacter({ equipment: consume(name).equipment, ...taken.changes, playState: taken.state });
            return true;
          },
        });
      } else if (use.kind === "poison") {
        out.push({
          key: name,
          label,
          hint: `+${use.dice} poison on the next hit, DC ${use.dc}`,
          target: "none",
          use: () => {
            useCombat.getState().itemEffect({ kind: "poison", label: name, dice: use.dice, dc: use.dc });
            saveCharacter({ equipment: consume(name).equipment, playState: { ...play, poison: { dice: use.dice, dc: use.dc } } });
            return true;
          },
        });
      } else if (use.kind === "antidote") {
        out.push({
          key: name,
          label,
          hint: "cures a poison",
          target: "none",
          use: () => {
            const cured = (character.conditions ?? []).includes("Poisoned");
            useCombat.setState((s) => ({
              combatants: s.combatants.map((c) => (c.isPlayer ? { ...c, conditions: (c.conditions ?? []).filter((x) => x.name !== "Poisoned") } : c)),
              combatLog: [...s.combatLog, `${character.name} uses ${name}${cured || s.combatants.find((c) => c.isPlayer)?.conditions?.some((x) => x.name === "Poisoned") ? " and the poison is neutralized" : ": advantage against poison for an hour"}.`],
            }));
            const spent = consume(name, use.uses);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, charges: spent.charges, protectedUntil: clockNow() + 60 }, ...(cured ? { conditions: (character.conditions ?? []).filter((c: string) => c !== "Poisoned") } : {}) });
            return true;
          },
        });
      }
    }
    return out;
  })();

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
    if (!exit.needsShip) {
      // A route over the ground: how it would be made now
      const ride = defaultRide(exit.locked ? [] : ridesFor(exit));
      return ride ? `${ride.label} ${rideText(ride.minutes)}` : "";
    }
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
    else if (action.type === "occupant" || action.type === "ship" || action.type === "vehicle" || action.type === "companion") setPicked({ kind: action.type, id: action.id });
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
    // Speeders and mounts are for sale beside the equipment (they come from the transport set)
    const stockPool = [
      ...equipmentData,
      ...(transport?.vehicles ?? []).map((v) => ({ name: v.name, cost: v.cost, equipmentCategory: "Vehicle", description: `${v.mph} mph; seats ${SEATS[v.name] ?? 2} (house rule).` })),
      ...(transport?.mounts ?? []).filter((m) => !!mountStat(m.name)).map((m) => ({ name: m.name, cost: m.cost, equipmentCategory: "Mount", description: `${m.speed} ft. a round; carries ${m.capacity} lb.` })),
    ];
    const lines = equipmentData.length ? stockOf(world, trader, placeId, stockPool, today, customer, ledger) : [];
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

  // ---- Cards and panels for companions, droids, captives, beasts, games and tools
  const watched = hostiles.length > 0;
  const carriesAny = (test: (name: string) => boolean) => (character?.equipment ?? []).some((n: string) => test(n));
  const captiveSection = (o: Occupant) => {
    const c = o.captive!;
    const spec = FREEING[c.restraint];
    const kit = spec.tools.find((t) => carriesAny((n) => n.toLowerCase() === t.toLowerCase()));
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid="captive">
        <p className="text-amber-200">
          Held in {c.restraint === "collar" ? "a slave collar" : c.restraint === "cell" ? "a locked cell" : "shackles"} (DC {c.dc}).
          {watched ? " Their guards are watching: free them quietly, or deal with the guards first." : ""}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-auto whitespace-normal text-left" disabled={!kit || inCombat || dead} onClick={() => freeCaptive(o, "kit")} data-testid="free-kit">
            {spec.label} {kit ? `(${kit})` : `(needs a ${spec.tools[0].toLowerCase()})`}
          </Button>
          {c.restraint === "shackles" && (
            <Button size="sm" variant="outline" disabled={inCombat || dead} onClick={() => freeCaptive(o, "break")} data-testid="free-break">
              Break the chains (Strength, DC 20)
            </Button>
          )}
        </div>
      </div>
    );
  };
  const freedSection = (o: Occupant) => (
    <div className="mt-1 space-y-1 text-xs" data-testid="freed">
      <p className="text-green-300">Free, and grateful.</p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" disabled={partyFull || inCombat || dead} onClick={() => recruit(o, "freed", "freed from bonds")} data-testid="freed-join">
          Ask them to come with you {partyFull ? `(${COMPANION_LIMIT} companions at most)` : ""}
        </Button>
        <Button size="sm" variant="outline" disabled={inCombat || dead} onClick={() => sendHome(o)} data-testid="freed-home">
          Send them home ({25 * level} XP)
        </Button>
      </div>
    </div>
  );
  const droidSection = (o: Occupant) => {
    const hp = o.wounds?.[0] ?? 0;
    const battery = carriesAny((n) => { const g = gearOf(n); return g?.kind === "stabilize" && g.target === "droid"; });
    const kit = carriesAny((n) => gearOf(n)?.kind === "repair");
    const bolt = carriesAny((n) => gearOf(n)?.kind === "bolt");
    const slicer = carriesAny((n) => /^slicer's kit$/i.test(n));
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid="disabled-droid">
        <p className="text-amber-200">
          Powered down: {hp}/{o.hitPoints} hit points{o.count > 1 ? `, ${o.count} of them` : ""}. Droids are powered down, not destroyed: stabilize it, mend it, then put a restraining bolt on it or rewrite its routines.
        </p>
        <div className="flex flex-wrap gap-1">
          {hp < 1 && (
            <Button size="sm" variant="outline" disabled={inCombat || dead || watched} onClick={() => mendDroid(o, battery ? "battery" : "check")} data-testid="droid-stabilize">
              Stabilize ({battery ? "emergency battery" : "Technology DC 10"})
            </Button>
          )}
          {hp < (o.hitPoints ?? 0) && (
            <Button size="sm" variant="outline" disabled={!kit || inCombat || dead || watched} onClick={() => mendDroid(o, "kit")} data-testid="droid-mend">
              Mend {kit ? "(repair kit)" : "(needs a repair kit)"}
            </Button>
          )}
          {hp >= 1 && (
            <>
              <Button size="sm" disabled={!bolt || partyFull || inCombat || dead || watched} onClick={() => boltDroid(o)} data-testid="droid-bolt">
                Fit a restraining bolt {bolt ? "" : "(you have none)"}
              </Button>
              <Button size="sm" variant="outline" disabled={!slicer || partyFull || inCombat || dead || watched} onClick={() => reprogramDroid(o)} data-testid="droid-reprogram">
                Reprogram (slicer's kit, DC {reprogramDC(o)})
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };
  const gentleSection = (o: Occupant) => {
    const tooFierce = crOf(o) > gentleLimit(level);
    const hurt = (o.wounds?.[0] ?? o.hitPoints ?? 0) < (o.hitPoints ?? 0);
    const food = carriesAny((n) => /rations/i.test(n));
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid="gentle">
        <p className="text-gray-300">
          {tooFierce ? `Too fierce for a character of level ${level} to gentle (CR ${o.cr}).` : `Gentle it: Wisdom (Animal Handling) against DC ${gentleDC(o, hurt)}, an hour${food ? "; rations in hand give advantage" : "; rations would give advantage"}. A miss by 5 or more and it attacks. (House rule.)`}
        </p>
        {!tooFierce && (
          <Button size="sm" variant="outline" disabled={partyFull || inCombat || dead} onClick={() => gentle(o)} data-testid="gentle-beast">
            Gentle it {partyFull ? `(${COMPANION_LIMIT} companions at most)` : ""}
          </Button>
        )}
      </div>
    );
  };
  const hireSection = (o: Occupant, placeId: string) => {
    if (!world) return null;
    const attitude = attitudeOf(world, o, placeId, customer).score;
    const fee = hireFee(o.xp, attitude);
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid="hire">
        <p className="text-gray-300">
          For hire: {fee.toLocaleString()} credits to sign on (five days' wages), then {wageFor(o.xp)} credits a day. CR {o.cr}, AC {o.armorClass}, {o.hitPoints} hit points. (House rule: the books give no wages.)
        </p>
        <Button size="sm" disabled={partyFull || inCombat || dead || fee > (character.credits ?? 0)} onClick={() => hire(o, placeId)} data-testid="hire-button">
          Hire {partyFull ? `(${COMPANION_LIMIT} companions at most)` : fee > (character.credits ?? 0) ? "(not enough credits)" : ""}
        </Button>
      </div>
    );
  };

  // A game of chance, five rounds (Wretched Hives, "Gambling (Uptime)"), against the house or a person
  const gamblePanel = (against: string, label: string, opponentBonus: number, house = false) => {
    if (!setsCarried.length) return null;
    const mine = gamble?.against === against ? gamble : null;
    const set = mine?.set ?? setsCarried[0];
    return (
      <div className="mt-2 border-t border-gray-600 pt-2 text-xs" data-testid="gamble">
        {!mine && (
          <>
            <p className="font-semibold text-amber-200">{house ? "Play against the house" : `A game with ${label}`}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <select className="h-7 rounded bg-gray-700 px-1" value={gambleSet || setsCarried[0]} onChange={(e) => setGambleSet(e.target.value)} aria-label="Gaming set">
                {setsCarried.map((n) => <option key={n} value={n}>{n}{trainedWith(n) ? "" : " (untrained)"}</option>)}
              </select>
              <input type="number" className="h-7 w-20 rounded bg-gray-700 px-1" min={GAMBLE_STAKE[0]} max={Math.min(GAMBLE_STAKE[1], character.credits ?? 0)} value={stake} onChange={(e) => setStake(Number(e.target.value))} aria-label="Stake" data-testid="gamble-stake" />
              <Button size="sm" disabled={inCombat || dead || watched} onClick={() => startGamble(against, label, gambleSet || setsCarried[0], opponentBonus, house)} data-testid="gamble-start">
                Play for {stake} cr
              </Button>
            </div>
            <p className="text-gray-400">Five checks; {house ? `the house wants ${GAMBLE_HOUSE_DC}` : "a contest: bluffing beats the game, the game beats reading, reading beats bluffing"}. Stake {GAMBLE_STAKE[0]} to {GAMBLE_STAKE[1].toLocaleString()}.</p>
          </>
        )}
        {mine && (
          <>
            <p className="font-semibold text-amber-200">{mine.set} against {house ? "the house" : label}: round {Math.min(GAMBLE_ROUNDS, mine.round + (mine.result ? 0 : 1))} of {GAMBLE_ROUNDS}, {mine.wins} won, stake {mine.stake}</p>
            <ul className="text-gray-300">{mine.log.map((line, i) => <li key={i}>{line}</li>)}</ul>
            {!mine.result && (
              <div className="mt-1 flex flex-wrap gap-1">
                {approaches.filter((a) => !(house && a.id !== "game") && !(a.needsTraining && !trainedWith(mine.set))).map((a) => (
                  <Button key={a.id} size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => gambleRound(a.id)} data-testid={`gamble-${a.id}`}>
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
            {mine.result && (
              <div data-testid="gamble-result">
                <p className={mine.result.change > 0 ? "text-green-300" : mine.result.change < 0 ? "text-red-300" : ""}>{mine.result.text} ({mine.result.change > 0 ? "+" : ""}{mine.result.change} credits{mine.result.debt ? `, debt ${mine.result.debt}` : ""})</p>
                {mine.result.complications.map((text) => <p key={text} className="text-yellow-300">Trouble: {text}</p>)}
                <Button size="sm" variant="outline" className="mt-1" onClick={() => setGamble(null)}>Leave the table</Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };
  const [gambleSet, setGambleSet] = useState("");

  // A tool taken out: what it is for and the sample activities with their DCs
  const toolPanel = (name: string) => {
    const info = toolInfo(name);
    const trained = trainedWith(name);
    return (
      <div className="mt-1 space-y-1 rounded bg-gray-700/60 p-2 text-xs" data-testid="tool-panel">
        <p>{trained ? "You are trained with it (proficiency on its checks)." : "You are not trained with it: no proficiency on its checks."}</p>
        {info?.summary && <p className="text-gray-300">{info.summary}</p>}
        {(info?.skills ?? []).map((s) => (
          <p key={s.skill.join()} className="text-gray-400"><span className="text-gray-200">{s.skill.join(" / ")}:</span> {s.text}</p>
        ))}
        {info?.feature && <p className="text-gray-300"><span className="font-semibold">{info.feature.name}.</span> {info.feature.text} {trained ? "Choose it for a rest (under the rest buttons)." : "(Needs training.)"}</p>}
        {(info?.activities ?? []).map((a) => (
          <div key={a.activity} className="flex items-center gap-1">
            <span className="flex-1">{a.activity}{a.dc ? ` (DC ${a.dc})` : ""}</span>
            {a.dc && (
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => toolRoll(name, a.dc!, a.activity)}>
                Try
              </Button>
            )}
          </div>
        ))}
        {!info?.feature && !(info?.activities ?? []).length && !info?.skills?.length && <p className="text-gray-400">The book gives this tool no further uses.</p>}
      </div>
    );
  };

  // What an item can do, under its row in the inventory
  const [using, setUsing] = useState<string | null>(null);
  const usePanel = (name: string) => {
    const use = gearOf(name);
    const facts = factsOf(name);
    if (!use) return null;
    const people: { id: string; label: string }[] = [{ id: "self", label: "you" }, ...party.map((c) => ({ id: c.id, label: c.name }))];
    const text = facts?.description ? <p className="text-gray-400">{facts.description}</p> : null;
    if (use.kind === "tool") return <>{toolPanel(name)}{text}</>;
    if (use.kind === "game") return <div className="mt-1 text-xs text-gray-300">Gaming set: open someone at a table and choose Play, or sit at the house table in a cantina.</div>;
    if (use.kind === "instrument") {
      return (
        <div className="mt-1 space-y-1 text-xs">
          <p className="text-gray-300">{trainedWith(name) ? "You are trained with it." : "You are not trained with it."} Play it for the room: Charisma (Performance) against DC 12 in a cantina, 15 elsewhere; the audience tips. (House rule.)</p>
          <Button size="sm" variant="outline" disabled={inCombat || dead} onClick={() => perform(name)} data-testid="perform">Play for the room (1 hour)</Button>
        </div>
      );
    }
    if (use.kind === "heal" || use.kind === "repair" || use.kind === "stabilize" || use.kind === "antidote" || use.kind === "substance") {
      const droid = use.kind === "repair" || (use.kind === "stabilize" && use.target === "droid");
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="use-panel">
          {text}
          {use.kind === "substance" && <p className="text-yellow-300">A high waits for your next check or fight; a low follows (a Wisdom save), then a Constitution save against addiction. Addiction level {addictionLevel}.</p>}
          <div className="flex flex-wrap gap-1">
            {people.filter((p) => (use.kind === "substance" || use.kind === "antidote" ? p.id === "self" : droid ? p.id !== "self" : true)).map((p) => (
              <Button key={p.id} size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => useOn(name, p.id)} data-testid={`use-on-${p.id}`}>
                {p.id === "self" ? "Use on yourself" : `Use on ${p.label}`}
              </Button>
            ))}
            {people.length === 1 && droid && <span className="text-gray-400">It is for a droid or construct companion.</span>}
          </div>
        </div>
      );
    }
    if (use.kind === "poison") return <div className="mt-1 text-xs space-y-1">{text}<Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => coatWeapon(name)}>Coat your weapon</Button></div>;
    if (use.kind === "explosive") {
      return (
        <div className="mt-1 text-xs space-y-1">
          {text}
          <p className="text-gray-300">{use.form === "grenade" || use.form === "detonator" ? "Thrown in a fight (Items, in the combat panel)." : "Set against a locked door to blow it (Forcing a door)."} Radius {use.radius} ft., DC {use.dc} {use.save}{use.damage.length ? `, ${use.damage.map((d) => `${d.dice} ${d.type}`).join(" and ")}` : ""}.</p>
        </div>
      );
    }
    if (use.kind === "scout") {
      return (
        <div className="mt-1 text-xs space-y-1">
          {text}
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !world || !here} onClick={() => scout()} data-testid="scout">Scout the buildings in sight</Button>
        </div>
      );
    }
    return <div className="mt-1 text-xs text-gray-300">{text}{use.kind === "bolt" ? <p>Fitted to a powered-down droid from its card.</p> : use.kind === "binders" ? <p>Restrains a Small or Medium creature (DC {use.dc} Strength or Dexterity save).</p> : use.kind === "spike" ? <p>Spent automatically to reroll a failed {use.tool.toLowerCase()} check on a lock.</p> : use.kind === "ram" ? <p>Forcing a locked door gives +{use.bonus}, and advantage with a helper.</p> : use.kind === "cutter" ? <p>Cuts a locked door open in ten minutes for each 5 of its DC.</p> : null}</div>;
  };

  // Macrobinoculars: who is on watch at the buildings round about, from where the party stands
  const scout = () => {
    if (!world || !here) return;
    const settlement = world.areas[berthOf(world, here.id)];
    const buildings = settlement ? childrenOf(world, settlement.id).filter((a) => a.kind === "building") : [];
    const lines = buildings.map((b) => {
      const rooms = childrenOf(world, b.id).filter((r) => r.kind === "room");
      if (!rooms.length) return `${b.name}: nobody has been inside; you see only its walls`;
      const armed = rooms.flatMap((r) => r.occupants).filter((o) => o.disposition === "hostile" && o.hitPoints).reduce((n, o) => n + o.count, 0);
      const gate = rooms.find((r) => r.gateway)?.occupants.filter((o) => o.role === "guard").reduce((n, o) => n + o.count, 0) ?? 0;
      return `${b.name}: ${gate ? `${gate} on the door` : "nobody on the door"}${armed ? `, ${armed} armed and hostile inside` : ""}`;
    });
    toast.info(`Through the macrobinoculars: ${lines.join("; ") || "nothing of interest"}.`);
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
              {o.role === "wildlife" && o.creature === "beast" && gentleSection(o)}
            </div>
          ) : o.captive ? (
            captiveSection(o)
          ) : o.disabled ? (
            droidSection(o)
          ) : o.role === "freed" ? (
            freedSection(o)
          ) : (
            <>
              <p className="text-xs text-gray-400">To talk with them, say what you do on the GM Interface tab.</p>
              {waresOf(o) && tradePanel(o, here.id)}
              {canHire(o) && hireSection(o, here.id)}
              {!isDroid(o) && o.species && o.role !== "guard" && o.role !== "freed" && gamblePanel(o.id, o.name, o.role === "gambler" ? 4 : 2)}
            </>
          )}
        </>
      );
    }
    if (picked.kind === "vehicle") {
      const building = inBuildingsHere.find((x) => x.vehicle.id === picked.id);
      const mineHere = vehicles.find((v) => v.id === picked.id);
      const v: Vehicle | undefined = building?.vehicle ?? mineHere;
      if (!v) return null;
      return (
        <>
          {close}
          <p className="font-semibold">{v.name}</p>
          <p className="text-xs text-gray-300">{v.model}, {v.mph} mph, seats {v.seats}, {v.status}{mineHere ? ", yours" : `, ${v.owner}`}.</p>
          <p className="text-xs text-gray-400">{mineHere ? "It carries the party over the ground between settlements: pick it on the route's exits." : v.status === "wrecked" ? "A wreck. A mechanic's kit can restore its power (DC 15)." : hostiles.length ? "Someone is guarding it." : "Nobody is left to stop you taking it."}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {building && v.status === "parked" && <Button size="sm" disabled={inCombat || dead || hostiles.length > 0} onClick={() => { takeVehicle(building.building, v); setPicked(null); }} data-testid="vehicle-take">Take it</Button>}
            {v.status === "wrecked" && <Button size="sm" variant="outline" disabled={inCombat || dead || hostiles.length > 0} onClick={() => mendVehicle(building?.building ?? null, v)} data-testid="vehicle-mend">Mend it (mechanic's kit, DC 15)</Button>}
          </div>
        </>
      );
    }
    if (picked.kind === "companion") {
      const c = party.find((x) => x.id === picked.id);
      if (!c) return null;
      return (
        <>
          {close}
          <p className="font-semibold text-green-300">{c.name}</p>
          <p className="text-xs text-gray-300">{[c.species, c.role, c.kind === "hireling" ? `hired, ${c.wage} cr/day` : c.kind, c.cr && `CR ${c.cr}`, `AC ${c.armorClass}`, `${c.hp}/${c.maxHp} hit points`, c.mount && "can be ridden"].filter(Boolean).join(", ")}</p>
          {c.attack && <p className="text-xs text-gray-400">{c.attack.name} {c.attack.bonus >= 0 ? "+" : ""}{c.attack.bonus}, {c.attack.damage}</p>}
          {c.how && <p className="text-xs text-gray-400">Joined: {c.how}.</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={inCombat} onClick={() => { dismiss(c); setPicked(null); }}>Dismiss</Button>
          </div>
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
  // The card goes to the top of the map when what was picked is in its lower half, so as not to
  // cover it (the second tap of a double tap, a look at the place)
  const cardAtTop = (() => {
    if (!card || picked?.kind !== "area" || typeof document === "undefined") return false;
    const at = (window as any).__map3d?.at?.(`area:${picked.id}`);
    const box = document.querySelector("canvas")?.getBoundingClientRect();
    return !!at && !!box && at.y - box.top > box.height * 0.45;
  })();

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
      {workableTools.length > 0 && (
        <label className="flex w-full items-center gap-1 text-xs" data-testid="rest-tool">
          Tool work at the next rest:
          <select className="h-7 flex-1 rounded bg-gray-700 px-1" value={restTool} onChange={(e) => setRestTool(e.target.value)}>
            <option value="">none</option>
            {workableTools.map((n) => (
              <option key={n} value={n}>{n}: {toolInfo(n)?.feature?.name}</option>
            ))}
          </select>
        </label>
      )}
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
          <Card className={`absolute ${cardAtTop ? "top-12" : "bottom-2"} left-2 z-10 w-[min(22rem,calc(100%-1rem))] bg-gray-800 bg-opacity-90 text-white p-3 text-sm ${cardOpen ? "" : "pointer-events-none"}`} data-testid="map-card">
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

            <p className="text-sm text-gray-300 mb-4" data-testid="play-credits">
              Credits: {(character.credits ?? 0).toLocaleString()} · AC {character.armorClass}
              {play.debt ? <span className="ml-1 text-red-300">· owes {play.debt.toLocaleString()}</span> : null}
            </p>

            {(play.boon || play.poison || play.substance || addictionLevel > 0) && (
              <div className="mb-4 space-y-0.5 text-xs" data-testid="play-status">
                {play.boon && <p className="text-cyan-200">Prepared: {play.boon.tool}, {play.boon.feature}{play.boon.die ? ` (d${play.boon.die})` : ""} until your next rest.</p>}
                {play.poison && <p className="text-green-300">Poison on the weapon: {play.poison.dice}, DC {play.poison.dc}.</p>}
                {play.substance && <p className={play.substance.phase === "high" ? "text-yellow-200" : "text-red-300"}>{play.substance.name}: {play.substance.phase === "high" ? "a high, waiting for your next check or fight" : `a low for ${Math.max(0, play.substance.ends - clock)} more minutes`}.</p>}
                {addictionLevel > 0 && <p className="text-red-300">Addiction level {addictionLevel}: lows last longer{addictionLevel >= 2 ? ", highs are shorter" : ""}.</p>}
              </div>
            )}

            {party.length > 0 && (
              <div className="mb-4 space-y-2" data-testid="play-party">
                <h3 className="font-semibold">Companions ({party.length}/{COMPANION_LIMIT})</h3>
                {party.map((c) => (
                  <div key={c.id} className="text-sm" data-testid="party-member">
                    <div className="flex justify-between">
                      <span>
                        {c.name}{" "}
                        <span className="text-xs text-gray-400">
                          {c.kind === "hireling" ? `hired, ${c.wage} cr/day` : c.kind === "droid" ? (c.bolt === "reprogrammed" ? "droid, reprogrammed" : "droid, restraining bolt") : c.kind === "beast" ? (c.mount ? "beast, mount" : "beast") : "freed"}
                        </span>
                      </span>
                      <span>{c.hp > 0 ? `${c.hp}/${c.maxHp}` : c.kind === "droid" ? "powered down" : "down"}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-700">
                      <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%` }} />
                    </div>
                    <div className="mt-0.5 flex gap-1 text-xs text-gray-400">
                      <span>AC {c.armorClass}{c.attack ? `, ${c.attack.name} ${c.attack.bonus >= 0 ? "+" : ""}${c.attack.bonus} (${c.attack.damage})` : ""}</span>
                      <Button size="sm" variant="ghost" className="ml-auto h-5 px-1 text-xs" disabled={inCombat} onClick={() => dismiss(c)}>Dismiss</Button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500">They fight at your side and heal on rests. Wages are paid each day (house rule).</p>
              </div>
            )}

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
                {(vehicles.length > 0 || inBuildingsHere.length > 0) && (
                  <div className="space-y-1 text-sm" data-testid="play-vehicles">
                    <h3 className="font-semibold">Speeders</h3>
                    {vehicles.map((v) => (
                      <div key={v.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {v.name} <span className="text-gray-400">{v.mph} mph, seats {v.seats}, {v.status === "wrecked" ? "wrecked" : v.areaId === berthOf(world, here.id) ? "parked here" : `parked at ${world.areas[v.areaId]?.name ?? "a settlement"}`}</span>
                        </span>
                        {v.status === "wrecked" && v.areaId === berthOf(world, here.id) && (
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => mendVehicle(null, v)}>Mend (mechanic's kit, DC 15)</Button>
                        )}
                      </div>
                    ))}
                    {inBuildingsHere.map(({ building, vehicle }) => (
                      <div key={vehicle.id} className="flex flex-wrap items-center gap-2" data-testid="building-vehicle">
                        <span>
                          {vehicle.name} <span className="text-gray-400">{vehicle.mph} mph, {vehicle.status}, at {building.name}</span>
                        </span>
                        {vehicle.status === "wrecked" ? (
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || hostiles.length > 0} onClick={() => mendVehicle(building, vehicle)}>Mend (mechanic's kit, DC 15)</Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || hostiles.length > 0} onClick={() => takeVehicle(building, vehicle)}>Take it</Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(hereNow ?? here).occupants.some((o) => o.disposition !== "hostile" && o.hitPoints) && instrumentsCarried.length > 0 && !hostiles.length && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="play-perform">
                    {instrumentsCarried.map((n) => (
                      <Button key={n} size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => perform(n)}>
                        Play the {n.toLowerCase()} for the room
                      </Button>
                    ))}
                  </div>
                )}
                {setsCarried.length > 0 && /bar|cantina|booth|common|back room|casino|lounge/i.test(here.name) && !hostiles.length && gamblePanel("house", here.name, 0, true)}
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
                    const rides = exit.locked ? [] : ridesFor(exit);
                    return (
                      <div key={`${exit.via}-${exit.to}`} className="flex flex-col gap-1">
                        <Button
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
                        {rides.length > 1 && (
                          <div className="flex flex-wrap gap-1 pl-2" data-testid="rides">
                            {rides.map((ride) => (
                              <Button
                                key={ride.id}
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                disabled={inCombat || dead || exploring || barred || !!ride.blocked || (ride.fare > (character.credits ?? 0))}
                                title={ride.blocked}
                                onClick={() => leaveBy(exit, ride)}
                                data-testid={`ride-${ride.id}`}
                              >
                                {ride.label}: {rideText(ride.minutes)}{ride.fare ? `, ${ride.fare} cr` : ""}{ride.blocked ? ` (${ride.blocked})` : ""}
                              </Button>
                            ))}
                          </div>
                        )}
                        {exit.locked && (
                          <div className="flex flex-wrap gap-1 pl-2" data-testid="force-door">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={inCombat || dead} onClick={() => forceDoor(exit, "strength")}>Force it (Strength DC {exit.locked + 5})</Button>
                            {carriesAny((n) => gearOf(n)?.kind === "ram") && <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={inCombat || dead} onClick={() => forceDoor(exit, "ram")}>Ram it (+4)</Button>}
                            {carriesAny((n) => gearOf(n)?.kind === "cutter") && <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={inCombat || dead} onClick={() => forceDoor(exit, "cutter")}>Cut it ({10 * Math.ceil(exit.locked / 5)} min)</Button>}
                            {carriesAny((n) => gearOf(n)?.kind === "explosive") && <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={inCombat || dead} onClick={() => forceDoor(exit, "blast")}>Blow it</Button>}
                          </div>
                        )}
                      </div>
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
                <h3 className="font-semibold mb-1">Inventory</h3>
                <p className="text-sm text-yellow-300 mb-2" data-testid="inventory-credits">Credits: {(character.credits ?? 0).toLocaleString()}</p>
                {(() => {
                  const worn = equippedNow(character);
                  const counts = new Map<string, number>();
                  for (const item of character.equipment ?? []) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
                  const is = (list: (string | null)[], name: string) => list.some((n) => n && n.toLowerCase() === name.toLowerCase());
                  const rank = { weapon: 0, armor: 1, shield: 2, gear: 3 };
                  return (
                    <div className="space-y-1" data-testid="inventory-list">
                      {[...counts.entries()]
                        .sort(([a], [b]) => rank[itemKind(a)] - rank[itemKind(b)] || a.localeCompare(b))
                        .map(([name, count]) => {
                          const kind = itemKind(name);
                          const on = kind === "weapon" ? is(worn.weapons, name) : kind === "armor" ? is([worn.body], name) : kind === "shield" ? is([worn.shield], name) : false;
                          const use = kind === "gear" ? gearOf(name) : undefined;
                          const left = use && "uses" in use ? usesLeft(name, use.uses) : undefined;
                          return (
                            <div key={name} data-testid={`inventory-item-${name}`}>
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span>
                                  {name}
                                  {count > 1 ? ` ×${count}` : ""}
                                  {left !== undefined && <span className="ml-1 text-xs text-gray-400">{left} uses left</span>}
                                  {kind !== "gear" && <span className="ml-1 text-xs text-gray-400">{kind === "weapon" ? "weapon" : kind === "shield" ? "shield" : "armor"}{on ? ", " + (kind === "weapon" ? "in hand" : "worn") : ""}</span>}
                                </span>
                                {kind !== "gear" && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`equip-${name}`} onClick={() => setEquipped(name, !on)}>
                                    {on ? (kind === "weapon" ? "Put away" : "Take off") : kind === "weapon" ? "Wield" : "Wear"}
                                  </Button>
                                )}
                                {use && (
                                  <Button size="sm" variant={using === name ? "default" : "outline"} className="h-6 px-2" data-testid={`use-${name}`} onClick={() => setUsing(using === name ? null : name)}>
                                    {use.kind === "tool" ? "Tool" : use.kind === "game" ? "Game" : use.kind === "instrument" ? "Play" : "Use"}
                                  </Button>
                                )}
                              </div>
                              {using === name && usePanel(name)}
                            </div>
                          );
                        })}
                      {counts.size === 0 && <p className="text-sm text-gray-400">Nothing carried.</p>}
                    </div>
                  );
                })()}
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
        {showCombat && <PlayCombat items={combatItems} />}
      </KeyboardControls>
    </div>
  );
}
