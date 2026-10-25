import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls, PerformanceMonitor } from "@react-three/drei";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import GalaxyMap from "@/components/Map/GalaxyMap";
import { type MapAction } from "@/components/Map/GalaxyMap";
import { useQuality } from "@/components/Map/siteAssets";
import { useView, VIEW_LABEL } from "@/components/Map/interiors/aim";
import LocalMap, { FightScene, SpaceScene, viewOf, usePartySpot, whereNow, useClock, noEncounters } from "@/components/Map/LocalMap";
import { usePartyLook } from "@/components/Map/models";
import { NotesPanel, TranslatorPanel } from "@/components/Play/GearPanels";
import { TestMenu, type TestCategory, type TestItem } from "@/components/Play/TestMenu";
import { Compass, CompassRig } from "@/components/Map/Compass";
import PlayCombat, { ShipCombatPanel, type CombatItemOption } from "@/components/Combat/PlayCombat";
import { useCombat, useShipFight, rollDamage, onPartySide } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";
import GMReportManager from "@/components/Campaign/GMReportManager";
import { toast } from "sonner";
import { gearOf as figureGearOf, carriedWeapons, characterFeatures, combatFeatures, hagglingEdge, derivedStats, equippedNow, equippedOf, itemKind, withItemEffects, isAttuned, type Equipped } from "@/lib/sw5e/characterCalculation";
import { getSpeciesById, species as speciesList } from "@/lib/sw5e/species";
import { getClassById, getClassLevelValue } from "@/lib/sw5e/classes";
import { calculateArmorClass, calculateExperienceForLevel, castingStats, powerCost, powerEffect, powerMotion, motionFeet, motionSummary } from "@/lib/sw5e/rules";
import { getStarshipSize } from "@/lib/sw5e/starships";
import { SKILLS } from "@/lib/sw5e/constants";
import CheckDialog, { autoChecks, type CheckOption, type CheckRequest, type CheckRoller } from "@/components/Play/CheckDialog";
import { PartsCounter, ShipSystems, partLabel } from "@/components/Play/ShipWorks";
import { useDisplay } from "@/components/Map/interiors/display";
import { itemRef } from "@/components/Map/interiors/items";
import { feats } from "@/lib/sw5e/feats";
import lookupData from "@shared/data/sw5e/lookups.json";
import { MinigamePage, type Minigame, type MinigameResult } from "@/components/Map/FlightScene";
import { dogfightPayout } from "@shared/logic/dogfightSim";
import { SCENARIOS, scenarioAdvice, classOf, type ScenarioId } from "@shared/logic/dogfight";
import type { ShipSheet } from "@shared/logic";
import PitArena, { type PitSummary } from "@/components/Map/PitArena";
import monsterData from "@shared/data/sw5e/monsters.json";
import type { Sw5eMonster } from "@shared/data";
import { rollOnTable } from "@/lib/stores/useDice";
import type { TableDie } from "@/lib/sw5e/dice";
import {
  exitsOf, trailOf, childrenOf, findPath, updateArea, advanceQuests, berthOf, hasPort, shipForTrip, passageFare, isLowFuel, fuelAfter, LIMP_FACTOR, tankerCall,
  planBuilding, afterFight, safeHarbour, arrivalAlert, setAlert, watchDC, watchersOf, clearAlarms, skirmishGround, ALERT, ALERT_LEVELS, LIFE,
  reportCrime, pursuitAt, lieLow, lieLowDC, CRIME_NAMES, type Crime,
  advanceSearch, retireSquad, noteArrival, interceptCall, grantShelter, shelterExits, shelterOwner, blockedExit, blockadeAt, calmedAt, leaveSight,
  heatAt, heatLevel, kindLabel, settlementOf, useKindOf, camerasIn, seatsOf, crewOf, type CrewMember, droidStock, droidOffer, droidRepairPrice, droidPrice, type DroidStat, rollIncident, advanceIncidents, closeIncident, incidentReward, liftsBetween, INCIDENT_WORDS, type Incident,
  lawmenAt, lawWatchDC, turnLawmen, engageOfficers, passageOffers, passageCheckDC, stowawayFine, SMUGGLER_SHARE, type PassageOffer,
  boardShip, moveShipInterior, rampLeadsTo, helmExits, deckIdOf, flightPayout, raceResult, pilotMinutes, routeCount, pitOpponent, statBlockOccupant, type FlightMode,
  startHeist, heistStep, heistDC, bribeCost, HEIST_MINUTES, HEIST_COUNTDOWN, takeShip, type Heist, type HeistHow,
  districtAt, rollEncounter, encounterResult, deliveredResult, ambushEncounter, ambushIn, gangPurse, gangSpots, ENCOUNTER_GAP, optionsOf, tollOf, pathToTeach, leaningOf, forceAlignOf, type Encounter, type Learner,
  watchersAt, exposedRooms, districtArena, districtFront, openAir, trapsIn, levelsArena, PIT_CLIMB_DC,
  setPane, climbable, PANE_LATCH_DC, PANE_BREAK_DC, PANE_SENSOR_DC, PANE_SENSOR_SEEN, PATIO_SENSOR_DC, type Pane, climbWay, climbGearOf, outsideClimbs,
  hidingPlaces, hidingRoom, lawSearch, searchedAt,
  START_TIME, DAY, hourOf, dayOf, clockText, partOfDay, tripMinutes, eraOf, eraById, lawAt, lawText,
  withPresence, withPartyShips, bulkOf, shoveAsset, moveRoomAssets,
  gearUse, toolFor, toolTrained, boonOf, gambleMode, gambleResult, GAMBLE_ROUNDS, GAMBLE_HOUSE_DC, GAMBLE_STAKE, GAMBLE_COMPLICATION, GAMBLE_COMPLICATIONS,
  companionFrom, hireFee, wageFor, canHire, COMPANION_LIMIT, crOf, gentleDC, gentleLimit, isDroid, reprogramDC, FREEING, hitDieOfSize,
  groundRides, kmOf, hasRidesForHire, SEATS, EXPLOSIVE_CONDITION_ROUNDS,
  type GearUse, type ToolFacts, type Boon, type GambleApproach, type Companion, type CompanionKind, type PartyVehicle, type Vehicle, type Transport, type Ride,
  waresOf, stockOf, offerFor, attitudeOf, attitudeName, marketAt, haggleDC, isOpen, openingHours, addRenown, emptyStanding, ledgerFor, factionAt,
  hangarsOf, hangarOpen, sellsFuelAt, repairPrice, outfitterStock, fitting, scriptsFor, afterHoursLock, hoursOfBuilding, type RoleScript, type Hangar,
  type Standing, type Ledger, type Customer, type TradeLine,
  DOWNTIME, WORKWEEK, downtimeActivity, activitySpec, checkModifier, resultRow, outcomeOf, failureOf, complicationChance, complicationTable, complicationEffect, enhancedValue, priceFactor, foundRarity,
  trainingOptions, ingredientRarity, emptyDowntime, shipSheet, refitPlan,
  type DowntimeActivityData, type ActivitySpec, type DowntimeOutcome, type DowntimeState, type TrainingOption,
  type Occupant,
  attunementLimit, augmentationLimit, augmentPlan, partsFree, sideEffectsOf, describeEffects, PROSTHESES, ITEM_ABILITIES, type ItemFacts,
  modKindOf, augmentSlots, MOD_BASE_SLOTS, rarityRank, INSTALL_DC, SIZE_TIME, crystalModifier, crystalFor, crystalsUpTo, DROID_MOTOR_COST, DROID_BASE_SLOTS, droidPlan,
  readOutcome, blueprintRarity, readCredits, RARITY_ORDER, type Fitted,
  FAMILIES, MATERIALS, REFINE_UNITS, tierOfCr, makeRemains, haulOf, withCacheAsset, familiesForTool, familiesForEnhanced, ALL_FAMILIES, type MaterialFamily, crNumber, RARITY_TIERS, NODE_RESPAWN, HARVEST_MINUTES, harvestDc, harvestKit, kitAlias, notesAllowed, addNote, addRecording, languageBarrier, OWN_TONGUE_ONLY, translatorSlots, setLanguages, tracedCalls, callOverheard, RECORD_MINUTES, RECORD_LIMIT, type Note, type Recording, harvestYield, materialsOf, materialsWorth, spendMaterials, nodeAt, type ResourceNode,
  partsPlaceAt, partsStock, fitShipPart, wreckParts, droidPartsStock, droidDisplay, droidListed, surgeonStock, modStock, MOD_TRADES, WARES, baseNameOf, modFee, modFitProblem, MOD_FIT_HOURS, blueprintPool, type SurgeonLine, type ModLine,
  ammoFamilyOf, ammoItemFamily, ammoRider, accessoryOf, reloadOf, GENERATOR_SHOTS, waterSpeed, armorTraits, stealthMode, rigidDex, type AmmoRider,
  passDays, FORAGE_DC, HOT_LANDS, liquidOf, foodOf, GEAR, type Supplies,
  hazardsAt, exposure, HAZARD_HOUR, suitOf, airOf, breathRule, type Protections, type EnvHazard,
  loadOf, containerOf, weightOf, isContraband, shipModNamed, shipModEffects, modCost, modDays, crewModPlan, crewEquipmentPlan, tierUpgrade, yardWorkforce, equipmentCost, equipmentDays, equipmentWorkforce,
  roleShip, enhancedShipPart, type ShipPart, type PartLine, type ShipModInstance,
  type World, type Area, type Exit, type LootCache, type PartyShip, type Quest, type Ship, type Rect,
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
  substance?: { name: string; ability?: string; pool?: "tech" | "force"; phase: "high" | "low"; ends: number; lowMinutes: number; boost: number; reduce: number; temp?: string; wisdomDc: number; constitutionDc: number; die?: number };
  addiction?: number;
  lastSubstance?: number;
  protectedUntil?: number;
  // Credits owed to the gaming tables
  debt?: number;
  // A comm jammer's hour: alarms are not raised before this minute of the clock
  jammerUntil?: number;
  // The settlement's cameras are looped until this minute of the clock (they record nothing)
  loopUntil?: number;
  // Ships a homing beacon was left on
  tracked?: { id: string; name: string }[];
  // Uses spent before the next rest of each class, archetype and species feature that has them
  // (keyed as the feature's pool: "Source:Name"), and of the focus points
  featureUses?: Record<string, number>;
  // Enhanced items: the names attuned to, the ability each side effect falls on (by item name),
  // the stimpac, adrenal, barrier and collimator in force, and the augmentations installed (the
  // body parts each takes; prostheses are listed too)
  attuned?: string[];
  sides?: Record<string, string>;
  buffs?: { name: string; kind: string; effects: any; weapon?: string; fight?: boolean; until?: number }[];
  augments?: { name: string; parts: string[]; prosthesis?: boolean }[];
  // Modifications fitted in plain items (by item name), with the item's rarity (a chassis raises
  // it) and the color crystal of a lightweapon; the minute before which a failed fitting waits
  fitted?: Record<string, Fitted & { crystalMax?: string }>;
  tinkerUntil?: number;
  // The day each allied contact was last called
  called?: Record<string, number>;
  // Ship parts in the hold (see shipyard.ts): bought, salvaged or taken out of the ship
  shipParts?: ShipPart[];
  // What each ranged weapon has in it (2026-10-21): shots left, and the special round loaded (none: the plain one). A weapon never
  // fired comes loaded with its plain round (house rule)
  loads?: Record<string, { left: number; round?: string }>;
  // A tripod set up (a minute, out of a fight) under the two-handed blaster: braced in the next fight
  tripodSet?: boolean;
  // Food and water by the day (shared/logic gear.ts `passDays`) and the lifestyle paid in settlements
  supplies?: Supplies;
  // Gear put on (2026-10-21): sealed suits, clothes, a respirator or mask, sunshades, belts and packs worn; and the minutes of air left
  // in each suit or respirator (by name; a full one is its capacity)
  wearing?: string[];
  air?: Record<string, number>;
  // Powered gear running (by item name: until a minute of the clock), and the minutes of charge left in each (a full one is its rating)
  running?: Record<string, number>;
  charge?: Record<string, number>;
  // Time spent in the place's hazards: since when, the hours already dealt with, and the hazards (to see a change)
  exposure?: { areaId: string; kinds: string; since: number; last: number; hours: number };
  // The Variant: Encumbrance (on unless switched off; off, armor's Strength requirement counts instead, as the book says), and what is
  // hidden in a smugglepack's compartment or clandestine clothes' pockets (item name: count)
  encumbrance?: "variant" | "basic";
  hidden?: Record<string, number>;
  // Mines paired with a remote detonator (item names; the book: a minute to pair up to two within 10 feet)
  paired?: string[];
  // A blueprint missed: the minute before the next try (the book: wait 24 hours)
  blueprintUntil?: number;
  // Notes written on a datapad, wristpad or stylus pen, recordings made with a holorecorder, and the languages set on a translator or a
  // vocoder mask (item name: languages); see shared/logic comms.ts
  notes?: Note[];
  recordings?: Recording[];
  translators?: Record<string, string[]>;
  // From a long rest aboard a ship with an armory, a recreation room and the like: advantage on the first attack roll, and on the first
  // ability check (of the skills named, or any)
  firstAttack?: boolean;
  firstCheck?: string[] | "any";
}

// What each level of the watch means for the party (house rule, see shared/logic)
const WATCH_NOTE = [
  "They have not noticed you. You can slip past, take things or strike first, each on a Stealth check.",
  "They heard something and are looking around. One more slip and they will find you.",
  "They have stopped you and want to know your business. Talk your way through, go back, or fight.",
  "Weapons are out: leave the way you came or it comes to a fight.",
  "They attack on sight.",
];

interface CheckPlan { what: string; dc: number; abilities: string[]; skills?: string[]; tool?: string; extra?: number }
interface CheckResult { success: boolean; total: number; roll: number; bonus: number }
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

type HudTab = "here" | "party" | "trade" | "quests" | "pack" | "downtime" | "gm" | "test";
// A test copy is built with VITE_TEST_MENU=1 (deploy/test-plain.sh) and has a god-mode menu; the build the game is played on never does
const TEST_MENU = import.meta.env.VITE_TEST_MENU === "1";

export default function GameBoard() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [showSidebar, setShowSidebar] = useState(true);
  // Which part of the HUD is open (the HUD is in tabs: what is here, the party, a trader's wares, quests, the pack, downtime, the GM, and on a test copy a test menu)
  const [hudTab, setHudTab] = useState<HudTab>("here");
  // (whether what is picked out on the map is somebody who deals with the party: set where the HUD is drawn, read when the pick changes)
  const dealerRef = useRef(false);
  const [activeMapTab, setActiveMapTab] = useState<"galaxy" | "local">("galaxy");
  const [showCombat, setShowCombat] = useState(false);
  // The pit arena (a dedicated page): open, and the credits and equipment the party had when it opened
  const [pitOpen, setPitOpen] = useState(false);
  const pitBase = useRef<{ credits: number; equipment: string[] }>({ credits: 0, equipment: [] });
  const { data: pitEnhanced = [] } = useQuery<any[]>({
    queryKey: ["enhanced-names"],
    queryFn: async () => (await fetch("/api/sw5e/enhancedItems?fields=id,name,type,searchableRarity,subtype")).json(),
    staleTime: Infinity,
  });
  const { inCombat, initiateCombat, endCombat } = useCombat();
  const fightArena = useCombat((s) => s.arena);
  // The map's render scale: full on a device that keeps up, lower on one that does not. It is
  // remembered, so that a reload starts where the device settled and not with a full-size first frame
  const [sharpness, setSharpness] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("sw5e.sharpness"));
      return saved >= 0.5 && saved <= 1.5 ? saved : 1.5;
    } catch {
      return 1.5;
    }
  });
  useEffect(() => {
    try { localStorage.setItem("sw5e.sharpness", String(sharpness)); } catch {}
  }, [sharpness]);
  const detailFixed = useQuality((q) => q.fixed);
  const viewMode = useView((v) => v.mode);
  // V cycles the view on foot (overhead, over the shoulder, first person); the mode only matters where the party walks
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code !== "KeyV" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "")) return;
      useView.getState().next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const detailTier = useQuality((q) => q.tier);
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
  const { data: rawCharacter, isLoading: characterLoading } = useQuery<any>({
    queryKey: ["game-character", gameCharacterId],
    queryFn: async () => {
      const r = await fetch(`/api/characters/${gameCharacterId}`);
      if (!r.ok) throw new Error("Failed to load character");
      return r.json();
    },
    enabled: !!gameCharacterId,
  });
  // What the carried enhanced items do (read from their texts on the server), and the character as
  // Play sees it with them applied: ability scores, armor class, weapons. The sheet is untouched
  // (`rawCharacter`); saves send only what they change.
  const { data: itemFacts } = useQuery<Record<string, ItemFacts>>({
    queryKey: ["item-facts"],
    queryFn: async () => (await fetch("/api/sw5e/itemFacts")).json(),
    staleTime: Infinity,
  });
  const itemClock = useClock((c) => Math.floor(c.minutes / 5) * 5);
  const character = useMemo(() => withItemEffects(rawCharacter, itemFacts, itemClock), [rawCharacter, itemFacts, itemClock]);

  // Write the player's hit points and power points back to the database whenever combat changes them
  const queryClient = useQueryClient();
  const lastSavedHp = useRef<number | null>(null);
  const lastSavedPoints = useRef<number | null>(null);
  const lastSavedUses = useRef<string | null>(null);
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
    const changes: Record<string, any> = {};
    if (p.hp !== lastSavedHp.current) changes.currentHp = lastSavedHp.current = p.hp;
    if (p.powerPoints !== undefined && p.powerPoints !== lastSavedPoints.current) changes.currentForcePoints = lastSavedPoints.current = p.powerPoints;
    // Uses of features and focus points spent stay spent until a rest
    const focusMax = getClassLevelValue(character.class, Number(character.level) || 1, "Focus Points");
    const usedNow = { ...(p.uses ?? {}), ...(focusMax ? { focus: focusMax - (p.focus ?? focusMax) } : {}) };
    const usedJson = JSON.stringify(usedNow);
    if (lastSavedUses.current !== null && usedJson !== lastSavedUses.current) {
      lastSavedUses.current = usedJson;
      changes.playState = { ...(character.playState ?? {}), featureUses: usedNow };
    }
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
  const fightAreas = useRef<string[]>([]);
  // The encounter whose gang is being fought (it is not in the area's own people: see startGangFight)
  const gangFight = useRef<Encounter | null>(null);

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
  // Change a few fields of the play state as it stands now (not as this render saw it)
  const patchPlay = (changes: Record<string, any>) => {
    const current = (queryClient.getQueryData<any>(["game-character", gameCharacterId])?.playState ?? {}) as Record<string, any>;
    return saveCharacter({ playState: { ...current, ...changes } });
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
    // The party's own ships stand in the berths they have left empty
    const present = withPartyShips(withPresence(world, clock), Array.isArray(campaign?.starships) ? campaign.starships : []);
    return Object.assign(present, { party: character?.companionData?.party ?? [], parked: campaign?.vehicles ?? [] });
  }, [world, clock, character?.companionData, campaign?.vehicles, campaign?.starships]);
  const hereNow: Area | null = scene && hereId ? scene.areas[hereId] ?? null : null;

  // Let time pass: the clock moves on and the new time goes with the next save
  const pass = (minutes: number) => {
    const total = Math.round(useClock.getState().minutes + minutes);
    useClock.getState().set(total);
    return { timeElapsed: clockValue(total) };
  };

  // An ability check against a DC: d20 + the better of the given abilities (+ proficiency if trained)
  const proficiency = Math.ceil(1 + (Number(character?.level) || 1) / 4);
  // ---- Checks: the player picks who makes it (the character or a companion with a stat block) and
  // against which of the skills that bear on it. The bonus is shown for each choice.
  const [checkAsk, setCheckAsk] = useState<{ request: CheckRequest; plan: CheckPlan; resolve: (r: CheckResult | null) => void } | null>(null);
  const cancelledCheck = useRef(false);
  const { data: monsterSheets = [] } = useQuery<any[]>({
    queryKey: ["monster-sheets"],
    queryFn: async () => (await fetch("/api/sw5e/monsters?fields=id,name,strengthModifier,dexterityModifier,constitutionModifier,intelligenceModifier,wisdomModifier,charismaModifier,skills")).json(),
    staleTime: Infinity,
  });
  const skillAbility = (skill: string) => SKILLS.find((x) => x.name.toLowerCase() === skill)?.ability ?? "intelligence";
  const optionsFor = (rollerId: string, plan: CheckPlan): CheckOption[] => {
    const skills = plan.skills?.length ? plan.skills : SKILLS.filter((x) => plan.abilities.includes(x.ability)).map((x) => x.name.toLowerCase());
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    if (rollerId === "me") {
      const mod = (ab: string) => modifier(character.abilityScores?.[ab]);
      const best = plan.abilities.reduce((a, b) => (mod(b) > mod(a) ? b : a), plan.abilities[0]);
      const toolProf = plan.tool && trainedWith(plan.tool) ? proficiency : 0;
      const rows: CheckOption[] = [{ skill: null, label: "No skill", ability: best, bonus: mod(best) + toolProf, note: toolProf ? plan.tool! : "", edge: false }];
      // Clothes worn (house rules): fine clothes or a dress uniform help Persuasion where officials and the well-to-do are, a costume Deception
      const dressed = (re: RegExp) => wearingNow.some((n) => re.test(n));
      const genteel = !!(world && here && trailOf(world, here.id).some((a) => a.kind === "building" && /^(palace|estates|manor house|garrison|archive|operations center|command post)$/.test(a.type)));
      for (const sk of skills) {
        const ab = skillAbility(sk);
        const dt = dtState;
        const clothesEdge = (sk === "persuasion" && genteel && dressed(/clothes, fine|dress uniform/i)) || (sk === "deception" && dressed(/clothes, costume/i));
        const prof = dt.expertise.includes(sk) ? 2 * proficiency : skilled(sk) ? proficiency : dt.trained.includes(sk) ? Math.floor(proficiency / 2) : 0;
        const note = dt.expertise.includes(sk) ? "expertise" : skilled(sk) ? "trained" : dt.trained.includes(sk) ? "half proficiency" : "untrained";
        rows.push({ skill: sk, label: cap(sk), ability: ab, bonus: mod(ab) + Math.max(prof, toolProf), note: `${toolProf && toolProf >= prof ? `${note}, ${plan.tool}` : note}${clothesEdge ? ", dressed for it" : ""}`, edge: (!!toolProf && skilled(sk)) || clothesEdge });
      }
      return rows;
    }
    const mate = (character.companionData?.party ?? []).find((c: Companion) => c.id === rollerId);
    const sheet = monsterSheets.find((m) => m.id === mate?.statBlock);
    if (!sheet) return [{ skill: null, label: "No skill", ability: plan.abilities[0], bonus: 0, note: "", edge: false }];
    const mod = (ab: string) => Number(sheet[`${ab}Modifier`]) || 0;
    const best = plan.abilities.reduce((a, b) => (mod(b) > mod(a) ? b : a), plan.abilities[0]);
    const listed: Record<string, number> = {};
    for (const t of sheet.skills ?? []) { const m = String(t).match(/^(.*?)\s*([+-]\d+)/); if (m) listed[m[1].trim().toLowerCase()] = Number(m[2]); }
    const rows: CheckOption[] = [{ skill: null, label: "No skill", ability: best, bonus: mod(best), note: "", edge: false }];
    for (const sk of skills) rows.push({ skill: sk, label: cap(sk), ability: skillAbility(sk), bonus: sk in listed ? listed[sk] : mod(skillAbility(sk)), note: sk in listed ? "trained" : "untrained", edge: false });
    return rows;
  };
  const askCheck = (plan: CheckPlan): Promise<CheckResult | null> => {
    const rollers: CheckRoller[] = [{ id: "me", name: character?.name ?? "You", options: optionsFor("me", plan) }];
    if (!autoChecks()) {
      for (const c of (character?.companionData?.party ?? []) as Companion[]) {
        if (c.hp > 0 && monsterSheets.some((m) => m.id === c.statBlock)) rollers.push({ id: c.id, name: c.name, options: optionsFor(c.id, plan) });
      }
    }
    let best = { roller: "me", skill: null as string | null, bonus: -99 };
    for (const r of rollers) for (const o of r.options) if (o.bonus > best.bonus) best = { roller: r.id, skill: o.skill, bonus: o.bonus };
    const meBest = [...rollers[0].options].sort((a, b) => b.bonus - a.bonus)[0];
    if (autoChecks()) return Promise.resolve(performCheck(plan, "me", meBest.skill));
    return new Promise((resolve) => setCheckAsk({ request: { what: plan.what, dc: plan.dc, rollers, best: { roller: best.roller, skill: best.skill } }, plan, resolve }));
  };
  // Roll it: d20 (two, the higher, with advantage) + the chosen bonus (+ the substance's d3 for the character)
  const performCheck = async (plan: CheckPlan, rollerId: string, skill: string | null): Promise<CheckResult> => {
    const option = optionsFor(rollerId, plan).find((o) => o.skill === skill) ?? optionsFor(rollerId, plan)[0];
    const mine = rollerId === "me";
    // A long rest aboard a ship with a recreation room, laboratory or investigation suite: advantage on the first check (of those skills)
    const rested = mine && !!play.firstCheck && (play.firstCheck === "any" || (!!option.skill && play.firstCheck.includes(option.skill)) || (!!plan.tool && play.firstCheck.includes("tool")));
    if (rested) setTimeout(() => patchPlay({ firstCheck: undefined }), 0);
    // Heavily encumbered: disadvantage on Strength, Dexterity and Constitution checks (the variant)
    const burdened = mine && loadNow().disadvantage && ["strength", "dexterity", "constitution"].includes(option.ability);
    const up = option.edge || rested;
    // The d20s (two with advantage or disadvantage) and the substance's die are thrown on the table, and read from it
    const twice = (up && !burdened) || (burdened && !up);
    const subDie = mine && play.substance?.ability === option.ability ? play.substance.die ?? 3 : 0;
    const thrown = await rollOnTable(plan.what, [...(twice ? (["d20", "d20"] as TableDie[]) : (["d20"] as TableDie[])), ...(subDie ? [`d${subDie}` as TableDie] : [])]);
    const first = thrown[0];
    const roll = up && !burdened ? Math.max(first, thrown[1]) : burdened && !up ? Math.min(first, thrown[1]) : first;
    const s = mine ? (play.substance?.ability === option.ability ? (play.substance.phase === "high" ? 1 : -1) : 0) * (subDie ? thrown[twice ? 2 : 1] : 0) : 0;
    if (s > 0) setTimeout(() => endHigh("used on a check"), 0);
    const bonus = option.bonus + s + (plan.extra ?? 0);
    const total = roll + bonus;
    const success = total >= plan.dc;
    const who = mine ? "" : `${(character.companionData?.party ?? []).find((c: Companion) => c.id === rollerId)?.name}: `;
    toast[success ? "success" : "error"](`${who}${plan.what}${option.skill ? ` (${option.label}${option.edge ? ", advantage" : ""})` : ""}: ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against DC ${plan.dc}. ${success ? "Success." : "Failed."}`);
    return { success, total, roll, bonus };
  };
  const finishCheck = async (rollerId: string | null, skill: string | null) => {
    if (!checkAsk) return;
    const { plan, resolve } = checkAsk;
    setCheckAsk(null);
    resolve(rollerId === null ? null : await performCheck(plan, rollerId, skill));
  };
  // An ability check against a DC: asks who rolls and with which skill; false if it is called off
  const abilityCheck = async (what: string, dc: number, abilities: string[], _trained?: boolean, more: Partial<CheckPlan> = {}): Promise<boolean> => {
    cancelledCheck.current = false;
    const r = await askCheck({ what, dc, abilities, ...more });
    if (!r) cancelledCheck.current = true;
    return !!r?.success;
  };
  const carries = (pattern: RegExp) => (character?.equipment ?? []).some((name: string) => pattern.test(name));
  const skilled = (skill: string) => (character?.skillProficiencies ?? []).some((s: string) => s.toLowerCase() === skill);

  // Hostile creatures here; in the open of a district also those on the roofs and catwalks in sight
  const hostiles = world && here ? watchersAt(world, here.id) : (here?.occupants ?? []).filter((o) => o.disposition === "hostile" && o.hitPoints);

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
  const [picked, setPickedNow] = useState<{ kind: "area" | "occupant" | "ship" | "vehicle" | "companion" | "asset" | "window"; id: string; name?: string } | null>(null);
  // The card for what was picked lets taps through for a moment: it comes up over the lower part
  // of the map, where the second tap of a double tap would otherwise land on it. (Closed in the
  // same step as the pick, so that not even the next tap in the queue finds it open.)
  const [cardOpen, setCardOpen] = useState(true);
  const setPicked = (next: { kind: "area" | "occupant" | "ship" | "vehicle" | "companion" | "asset" | "window"; id: string; name?: string } | null) => {
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
  // Picking out someone who deals with the party opens their wares and dealings in the HUD, not over the map
  useEffect(() => {
    if (picked?.kind !== "occupant" || !dealerRef.current) return;
    setShowSidebar(true);
    setHudTab("trade");
  }, [picked?.id, picked?.kind]);
  // For test scripts: pick someone or something out as a tap on the map would (e2e/works.mjs, when a moving person is hard to hit)
  useEffect(() => {
    (window as any).__play = { pick: (kind: "occupant" | "asset" | "ship", id: string) => setPicked({ kind, id }) };
    return () => { delete (window as any).__play; };
  }, []);

  // The watch (house rule): how far the hostile creatures here have noticed the party. Where
  // nothing was recorded (an older save, enemies the game master added) they stand ready.
  const [sneaking, setSneaking] = useState(false);
  // The law's search for the party (see reportCrime in shared logic): shown on the map, and lied low from
  const clockMinutes = useClock((c) => c.minutes);
  // (The watch calms down once the party has been out of its sight for WATCH_COOLDOWN minutes: see leaveSight)
  const alert = hostiles.length && !(here && calmedAt(here, clockMinutes)) ? here?.alert ?? ALERT.confronting : ALERT.unaware;
  const allowed = hostiles.length > 0 && !!here?.allowed;
  const heat = world && here ? heatLevel(heatAt(world, settlementOf(world, here.id), clockMinutes)) : 0;
  const pursuit = world ? pursuitAt(world, clockMinutes, here?.id) : null;
  const setWatch = (level: number, pass = false) => {
    if (!world || !here) return;
    let next = setAlert(world, here.id, level, pass);
    // A comm jammer keeps the alarm from going up through the building (it cannot call out)
    const parent = here.parentId;
    if (level === ALERT.attacking && parent && !world.areas[parent]?.alarm && (character?.playState?.jammerUntil ?? 0) > useClock.getState().minutes) next = updateArea(next, parent, { alarm: undefined }).world;
    saveCampaign({ galaxyMap: next });
  };
  // What the armour worn and the shield wielded do besides their class (shared/logic gear.ts armorTraits: the Strength requirement and
  // Cumbersome cost speed, Bulky, Obtrusive and Silent steer Stealth, Absorptive, Regulated, Reactive, Avoidant, Insulated and Imbalanced
  // are played in a fight, Rigid halves the Dexterity bonus to Dexterity saves)
  const wornTraits = () => {
    const worn = equippedNow(character);
    const rows: { name: string; properties?: string[]; stealthDisadvantage?: boolean; shieldBonus?: number; absorb?: number }[] = [worn.body, worn.shield].filter(Boolean).map((n) => {
      const name = n as string;
      const row: any = factsOf(name) ?? factsOf(name.replace(/\s*\([^)]*\)\s*$/, ""));
      return { name, properties: row?.properties, stealthDisadvantage: !!row?.stealthDisadvantage, shieldBonus: row?.armorClassification === "Shield" ? Number(String(row?.ac ?? "").match(/\d+/)?.[0] ?? 0) : 0 };
    });
    // An enhanced shield's or armor's "damage you take is reduced by N"
    if ((character as any)?.itemAbsorb) rows.push({ name: "enhanced item", absorb: (character as any).itemAbsorb });
    return armorTraits(rows, Number(character?.abilityScores?.strength) || 10);
  };
  const stealthRoll = () => {
    // A stealth field generator running: advantage on Stealth that relies on sight (its text); armor that is bulky or flagged, a shield that
    // is obtrusive: disadvantage; silent armor: advantage; a mix cancels (the book's armor properties)
    const field = ((character.equipment ?? []) as string[]).some((n) => /stealth field generator/i.test(n) && running(n));
    const traits = wornTraits();
    const mode = stealthMode({ stealthDisadvantage: traits.stealthDisadvantage, stealthAdvantage: traits.stealthAdvantage || field });
    const a = d20();
    const roll = mode > 0 ? Math.max(a, d20()) : mode < 0 ? Math.min(a, d20()) : a;
    const bonus = modifier(character.abilityScores?.dexterity) + (skilled("stealth") ? proficiency : 0);
    return { roll, bonus, total: roll + bonus };
  };
  // Lying low takes ten minutes; the officers search the district and the party is caught or it is called off
  const lieLowNow = () => {
    if (!world || !pursuit) return;
    const dc = lieLowDC(pursuit.pursuit);
    const check = stealthRoll();
    const result = lieLow(world, check.total);
    const time = pass(10);
    toast[result.caught ? "error" : "success"](`Lying low (Stealth ${check.roll} ${check.bonus >= 0 ? "+" : "-"} ${Math.abs(check.bonus)} = ${check.total} against DC ${dc}): ${result.caught ? `the officers find you and fine you ${result.fine} credits.` : "the search is called off."}`);
    saveCampaign({ galaxyMap: result.world, ...time });
    if (result.caught) saveCharacter({ credits: Math.max(0, (character.credits ?? 0) - result.fine) });
  };
  // Crimes by the people of the settlement and the constables' search for them (see rollIncident in
  // shared logic): the hours that have passed are rolled for, the squads walk on, and what they do
  // is told. The party can turn a culprit in for the reward.
  const turnIn = (incident: Incident) => {
    if (!world) return;
    const reward = incidentReward(world, incident);
    saveCampaign({ galaxyMap: closeIncident(world, incident.id, "turned in", `${incident.name} was turned in by the party.`) });
    saveCharacter({ credits: (character.credits ?? 0) + reward });
    toast.success(`${incident.name} is handed over to the law: ${reward} credits.${incident.vehicle ? ` The ${incident.vehicle.name} goes back to its owner.` : ""}`);
  };
  useEffect(() => {
    if (!world || !here || inCombat) return;
    const settlement = settlementOf(world, here.id);
    if (world.areas[settlement]?.kind !== "settlement") return;
    const now = clockNow();
    const hour = Math.floor(now / 60);
    const last = world.incidentClock?.[settlement];
    let next: World = world;
    if (last === undefined || hour > last) {
      for (let h = (last ?? hour) + 1; h <= Math.min(hour, (last ?? hour) + 6); h++) next = rollIncident(next, settlement, h, h * 60);
      next = { ...next, incidentClock: { ...(next.incidentClock ?? {}), [settlement]: hour } };
    }
    for (const fresh of (next.incidents ?? []).filter((i) => !(world.incidents ?? []).some((x) => x.id === i.id))) toast.warning(fresh.note);
    const step = advanceIncidents(next, now);
    for (const note of step.notes) toast.info(note);
    next = step.world;
    if (next !== world) saveCampaign({ galaxyMap: next });
  }, [clockMinutes, here?.id]);

  // A search on the district: the calls to security put through from this place, a friendly owner
  // here who can open a hidden or locked back room for the party, and the rooms they could open
  const callsHere = pursuit?.here ? (pursuit.pursuit.reports ?? []).filter((r) => r.area === here?.id && r.at > clockMinutes) : [];
  const shelterOwnerHere = world && here && pursuit?.here ? (hereNow ?? here).occupants.find(shelterOwner) : undefined;
  const hideouts = world && here && pursuit?.here && shelterOwnerHere ? shelterExits(world, here.id) : [];
  // Persuading the owner: Charisma against 12 + the law here; the way is opened for the search
  const askShelter = async (exit: Exit) => {
    if (!world || !here || !shelterOwnerHere) return;
    if (!await abilityCheck(`Ask ${shelterOwnerHere.name} for shelter`, 12 + 2 * lawAt(world, here.id) + (shelterOwnerHere.disposition === "friendly" ? 0 : 2), ["charisma"], skilled("persuasion"))) return;
    saveCampaign({ galaxyMap: grantShelter(world, here.id, exit) });
    toast.success(`${shelterOwnerHere.name} opens the ${world.areas[exit.to].name} for the party.`);
  };
  // A caller is talked down (Intimidate against 10 + their Wisdom): the call does not go through
  const talkDown = async (who: string) => {
    if (!world || !here) return;
    const caller = (hereNow ?? here).occupants.find((o) => o.name === who);
    if (await abilityCheck(`Intimidate ${who}`, 10 + (caller?.saves?.wisdom ?? 0), ["charisma"], skilled("intimidation"))) {
      saveCampaign({ galaxyMap: interceptCall(world, here.id, who) });
      toast.info(`${who} drops the line.`);
    }
  };
  // Or they are silenced by force: the caller turns on the party, the call is cut and the fight begins
  const silence = (who: string) => {
    if (!world || !here) return;
    const occupants = here.occupants.map((o) => (o.name === who ? { ...o, disposition: "hostile" as const, routine: undefined } : o));
    saveCampaign({ galaxyMap: setAlert(interceptCall(updateArea(world, here.id, { occupants }).world, here.id, who), here.id, ALERT.attacking) });
    toast.error(`${who} is silenced by force.`);
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
  // The law in person (see "The law in person" in shared logic): a stat block for lawmen who have
  // none, the lawmen turning on the party, and the Stealth check that keeps them from seeing a crime
  const lawBlock = async (id: "trooper" | "officer-junior"): Promise<Occupant | undefined> => {
    try {
      const response = await fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock: id }) });
      return response.ok ? ((await response.json()) as Occupant) : undefined;
    } catch {
      return undefined;
    }
  };
  const latestWorld = (): World | undefined => ((queryClient.getQueryData([`/api/campaigns/${campaignId}`]) as any)?.galaxyMap as World | undefined) ?? world ?? undefined;
  const callTheLaw = async (areaId: string, crime: Crime) => {
    const current = latestWorld();
    if (!current) return;
    const block = await lawBlock(lawAt(current, areaId) >= 3 ? "trooper" : "officer-junior");
    const base = latestWorld() ?? current;
    saveCampaign({ galaxyMap: reportCrime(turnLawmen(base, areaId, block), areaId, crime, clockNow()) });
  };
  const lawUnseen = (what: string, crime: Crime): boolean => {
    // A camera sees it too, in a place of the law, unless the cameras are looped: the crime is reported
    // (a moment later, so that whatever is saved for the act itself is not written over)
    if (world && here && camerasIn(here) && here.danger === 0 && lawAt(world, here.id) >= 2 && (character?.playState?.loopUntil ?? 0) <= clockNow()) {
      toast.warning(`${what}: a security camera records it.`);
      const areaId = here.id;
      setTimeout(() => {
        const latest = latestWorld();
        if (latest) saveCampaign({ galaxyMap: reportCrime(latest, areaId, crime, clockNow()) });
      }, 60);
    }
    if (!world || !here || !lawmenAt(world, here.id).length) return true;
    const dc = lawWatchDC(world, here.id);
    const { roll, bonus, total } = stealthRoll();
    const made = total >= dc;
    toast[made ? "success" : "error"](`${what} (Stealth): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${total} against the guards' passive Perception ${dc}. ${made ? "Unnoticed." : "Seen! They turn on you."}`);
    if (!made) void callTheLaw(here.id, crime);
    return made;
  };
  // Talking to those who stopped you: Charisma against 10 + their Wisdom + how dangerous the
  // place is; threats work on those already facing you down, but are harder
  const talk = async (skill: "deception" | "persuasion" | "intimidation") => {
    if (!here) return;
    const dc = 10 + Math.max(0, ...watchersOf(here).map((o) => o.saves?.wisdom ?? 0)) + here.danger + (alert >= ALERT.confronting ? 5 : 0);
    const passed = await abilityCheck(skill.charAt(0).toUpperCase() + skill.slice(1), dc, ["charisma"], skilled(skill));
    if (cancelledCheck.current) return;
    if (passed) {
      setWatch(ALERT.suspicious, true);
      toast.info("They let you pass, and keep an eye on you.");
    } else setWatch(alert + 1);
  };
  const exits: Exit[] = world && here ? exitsOf(world, here.id) : [];
  // Shops the party has picked the lock of tonight, and when (they stay open to it until morning)
  const afterHours = useRef(new Map<string, number>());

  // The party's ships, and how a trip that needs one is made: in a ship of their own berthed
  // here (it burns fuel), or as a passenger (the fare is a house rule, see passageFare)
  const ships: PartyShip[] = Array.isArray(campaign?.starships) ? campaign.starships : [];
  const passageRate = getStarshipSize("Medium")?.fuelCost ?? 100;
  const tripBy = (exit: Exit) => {
    const { ship, reason } = here ? shipForTrip(ships, here.id, exit) : { ship: undefined, reason: "" };
    return { ship, reason, fare: ship ? 0 : passageFare(exit, passageRate) };
  };

  // Walk, drive or fly along an exit. A place nobody has been to is built on arrival.
  // A pilot's route being flown, between two settlements (see travel)
  const [pilot, setPilot] = useState<{ exit: Exit; ride: Ride; mode: FlightMode; seed: number } | null>(null);
  const travel = (exit: Exit, chosen?: Ride) => {
    if (!here || !world) return;
    // A place that kills without protection (no air, the crushing deep) is not walked into (the book: a few rounds)
    const deadly = deadlyAt(exit.to);
    if (deadly) return void toast.error(`${deadly.why}: ${HAZARD_HOUR[deadly.hazard].text}`);
    if (chosen?.pilot) {
      const vehicle = vehicles.find((v) => v.id === chosen.vehicleId);
      return void setPilot({ exit, ride: chosen, mode: /air/i.test(String(vehicle?.model ?? "")) ? "airspeeder" : "speeder", seed: Math.floor(Math.random() * 1e9) + 1 });
    }
    const changes: Record<string, any> = { currentLocation: exit.to };
    const { ship: flying } = exit.needsShip ? tripBy(exit) : { ship: undefined };
    // A route over the ground goes by the ride chosen (on foot, a mount, a speeder, a hired ride)
    const rides = exit.needsShip ? [] : ridesFor(exit);
    const ride = chosen ?? defaultRide(rides);
    if (ride?.blocked) return void toast.error(`${ride.label}: ${ride.blocked}.`);
    // Over the carrying capacity the speed is 5 feet (pushing and dragging): no journey on foot
    if (!exit.needsShip && (!ride || /foot/i.test(ride.label)) && exit.via === "path" && loadNow().level === 3) return void toast.error(`You carry ${loadNow().weight} lb, more than your ${loadNow().capacity} lb: leave something, or get a hovercart or a beast of burden.`);
    if (ride?.fare) {
      if (ride.fare > (character.credits ?? 0)) return void toast.error(`A ride costs ${ride.fare} credits and you have ${character.credits ?? 0}.`);
      saveCharacter({ credits: character.credits - ride.fare });
      toast.info(`Ride paid: ${ride.fare} credits (house rule: the books price no fares).`);
    }
    if (ride?.vehicleId) changes.vehicles = vehicles.map((v) => (v.id === ride.vehicleId ? { ...v, areaId: exit.to } : v));
    const took = ride ? ride.minutes : tripMinutes(exit, Number(flying?.hyperdriveClass) || 1) * (flying && isLowFuel(flying) ? LIMP_FACTOR : 1);
    Object.assign(changes, pass(took));
    if (ride) toast.info(`${ride.label}: ${rideText(took)} to ${world.areas[exit.to]?.name}; it is ${clockText(useClock.getState().minutes)}.`);
    else if (took >= 60) toast.info(`${Math.round(took / 6) / 10} hours on the way${exit.needsShip && !exit.travel ? " (house rule: an hour between the surface and orbit)" : ""}: it is ${clockText(useClock.getState().minutes)}.`);
    if (exit.needsShip) {
      const { ship, fare } = tripBy(exit);
      if (ship) {
        changes.starships = ships.map((s) => (s.id === ship.id ? { ...s, fuel: fuelAfter(s, exit.fuel ?? 0), areaId: exit.to, hangar: undefined } : s));
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
    // Searched going through customs or a checkpoint (any law), and on landing at a port where the law is policed or strict
    if (!exit.secret && ((searchedAt(target) && lawAt(world, target.id) >= 1) || (exit.needsShip && target.kind === "settlement" && lawAt(world, target.id) >= 2))) {
      setTimeout(() => searchParty(target.id, searchedAt(target) ? target.name : `Customs at ${target.name}`), 150);
    }
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
      // Out of the sight of those who watched this place, their watch calms down (WATCH_COOLDOWN);
      // a search the party is in is seen by whoever is there, and called by those with a comm
      let next: World = (changes.galaxyMap as World | undefined) ?? world;
      next = leaveSight(next, here.id, exit.to, clockNow());
      next = noteArrival(next, exit.to, clockNow(), (character?.playState?.jammerUntil ?? 0) > clockNow());
      if (next !== world) changes.galaxyMap = next;
      saveCampaign(changes);
    }
  };

  // Take an exit, as the watch allows: those who have stopped the party bar every way but the
  // way back; past those who have not, it takes a Stealth check
  const leaveBy = async (exit: Exit, ride?: Ride) => {
    const blocked = world && here ? blockedExit(world, here.id, exit, clockMinutes) : undefined;
    if (blocked) return void toast.error(`Blockade: ${blocked}.`);
    // Only those who can see the party (see SIGHT_SQUARES) get a say: a Stealth check to slip past.
    // A miss puts their watch up a step and the party may still go; it stops them only where they
    // attack, and then the fight begins where they stand.
    if (hostiles.length > 0 && !allowed && exit.to !== cameFrom) {
      const spotted = !unseen("Slipping past");
      if (spotted && alert + 1 >= ALERT.attacking) return;
    }
    if (exit.locked) return unlock(exit);
    // A shop that is shut for the night is locked (shared logic afterHoursLock)
    const door = exit.via === "enter" ? world?.areas[exit.to] : undefined;
    const shutDC = door?.kind === "room" && world ? afterHoursLock(world, door.parentId ?? "", clockNow()) : undefined;
    const picked = door ? afterHours.current.get(door.parentId ?? "") : undefined;
    if (shutDC !== undefined && door && !(picked !== undefined && clockNow() - picked < 780)) return breakIn(door.parentId!, shutDC);
    if (exit.scale && exit.scale.how !== "none") {
      // Up or down the outside of a building (shared/logic outsideClimbs): seen from the street where the law is about; a grappling
      // hook's line is climbed with Strength (Athletics), a minute a try (house rule); flying or friction grips need no check
      if (exit.via === "enter" && here?.danger === 0 && !lawUnseen("Climbing up the outside of a building", "trespass")) return;
      if (exit.scale.how === "hook") {
        const ok = await abilityCheck(`${exit.via === "enter" ? "Up" : "Down"} the grappling hook's line (house rule)`, exit.scale.dc ?? 10, ["strength"], skilled("athletics"));
        if (cancelledCheck.current) return;
        if (!ok) {
          toast.error(exit.via === "enter" ? "The hook will not hold, or you slip back down: a minute gone." : "You lose your grip and climb back up: a minute gone.");
          return void saveCampaign(pass(1));
        }
      } else toast.info(`${exit.scale.by}: ${exit.via === "enter" ? "up" : "down"} without a check.`);
    }
    if (exit.climb) {
      // Out of a pit: Athletics, or Dexterity, a minute for each try. Friction-grip gear worn gives a climbing speed: no check (the
      // book); a grappling hook or fibercord line makes it a DC 5 easier climb (house rule)
      const grips = wearingNow.some((n) => /friction-grip/i.test(n));
      const line = carries(/^grappling hook|^fibercord/i);
      if (grips) toast.info("Friction-grip gear: you climb out without a check.");
      else {
        const ok = await abilityCheck(`Climbing out${line ? " (a line helps: DC -5, house rule)" : ""}`, Math.max(5, exit.climb - (line ? 5 : 0)), ["strength", "dexterity"], skilled("athletics"));
        if (cancelledCheck.current) return;
        if (!ok) return void saveCampaign(pass(1));
      }
    }
    // A sensor on the way (patio doors, house rule): slipped past (Intelligence, a security or slicer's kit helps), else the alarm
    // goes up through the building; either way the party goes through
    if (exit.alarmed && exit.pathId) {
      const kit = lockKit();
      const ok = await abilityCheck("Slip past the sensor", PATIO_SENSOR_DC, ["intelligence"], !!kit && trainedWith(kit));
      if (cancelledCheck.current) return;
      const pathId = exit.pathId;
      const buildingOf = here?.kind === "room" ? here.parentId : undefined;
      travel(exit, ride);
      setTimeout(() => {
        const latest = latestWorld();
        if (!latest) return;
        let next: World = { ...latest, paths: latest.paths.map((p) => (p.id === pathId ? { ...p, alarmed: ok ? undefined : p.alarmed } : p)) };
        if (!ok && buildingOf) next = updateArea(next, buildingOf, { alarm: true }).world;
        saveCampaign({ galaxyMap: next });
        toast[ok ? "success" : "error"](ok ? "The sensor is slipped past: it will not trip now." : "The sensor trips: the alarm goes up through the building (house rule).");
      }, 80);
      return;
    }
    travel(exit, ride);
  };

  // A door, a way out or a secret way walked up to on the map: go through it
  const travelTo = (areaId: string, secret = false, squares = 0) => {
    const ways = exits.filter((e) => e.to === areaId && !e.hidden);
    let exit = ways.find((e) => !!e.secret === secret) ?? ways[0];
    // From the street of a district, the way in to another of its buildings is walked to across
    // the district (a minute for about fifty squares, at the pace of a street)
    if (!exit && world && here && here.kind === "building") {
      const target = world.areas[areaId];
      const there = trailOf(world, areaId).find((a) => a.kind === "building");
      const sameDistrict = !!there && districtAt(world, there.id)?.id === districtAt(world, here.id)?.id;
      if (target?.kind === "room" && sameDistrict && (secret ? target.secretEntry?.found : target.gateway)) {
        exit = { to: areaId, via: "enter", label: secret ? "Slip in through the way to" : "Walk to", travel: `${Math.max(10, Math.round(squares * 1.5))} m`, ...(secret ? { secret: true } : {}) };
      }
    }
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

  // Taking a ship that is not the party's (shared logic "Taking a ship"): a side quest of stages, each
  // a choice with its own check. The clock runs on whatever is done; the ship lifts off without them
  // when the countdown runs out.
  const heistOf = world?.heist;
  const beginHeist = (ship: Ship) => {
    if (!world || !here) return;
    const at = Object.values(world.areas).find((a) => a.ships.some((s) => s.id === ship.id));
    const heist = at ? startHeist(world, ship.id, at.id) : null;
    if (!heist) return void toast.error(`${ship.name} cannot be taken.`);
    saveCampaign({ galaxyMap: { ...world, heist } });
    toast.info(`You are going for ${ship.name}. Bribe, slice, bluff or fight your way to it.`);
  };
  const runHeist = (how: HeistHow, success: boolean, cost = 0) => {
    if (!world || !heistOf || !here) return;
    const time = pass(HEIST_MINUTES[heistOf.stage]);
    const minute = useClock.getState().minutes;
    const result = heistStep(heistOf, how, success, minute);
    let galaxyMap: World = { ...world, heist: result.heist };
    if (result.crime) galaxyMap = reportCrime(galaxyMap, heistOf.areaId, result.crime, minute);
    let starships: PartyShip[] | undefined;
    if (result.ended === "stolen") {
      const took = takeShip(galaxyMap, heistOf.shipId);
      if (took.ship) starships = [...ships, { ...took.ship, voyage: undefined, owner: character.name, fuel: getStarshipSize(took.ship.size)?.fuelCapacity ?? 5, areaId: berthOf(took.world, took.at ?? heistOf.areaId) }];
      galaxyMap = took.world;
    } else if (result.ended === "lifted") {
      galaxyMap = takeShip(galaxyMap, heistOf.shipId).world;
    }
    galaxyMap = { ...galaxyMap, heist: result.heist };
    if (cost) saveCharacter({ credits: (character.credits ?? 0) - cost });
    saveCampaign({ galaxyMap, ...time, ...(starships ? { starships } : {}) });
    const end = {
      stolen: `${heistOf.shipName} is yours. Get off world before the officers reach the port.`,
      lifted: `${heistOf.shipName} lifted off without you, and the port is roused.`,
      caught: `The guards have you. ${heistOf.shipName} stays where it is.`,
      abandoned: "",
    } as Record<string, string>;
    if (result.ended) toast[result.ended === "stolen" ? "success" : "error"](end[result.ended]);
    else toast[success ? "success" : "error"](`${success ? "It works." : "It does not work, and the alarm is raised."} ${result.heist?.takeoffAt && !heistOf.takeoffAt ? `Take-off in ${HEIST_COUNTDOWN} minutes.` : ""}`.trim());
  };
  const abandonHeist = () => {
    if (!world) return;
    saveCampaign({ galaxyMap: { ...world, heist: undefined } });
    toast.info("You give up on the ship.");
  };

  // A fight between starships (shared/logic "Starship combat"): the party's ship against the
  // hostile ships in orbit where it is. What came of it is written back when the fight ends.
  const shipFight = useShipFight((s) => s.fight);
  const { data: shipRows = [] } = useQuery<any[]>({
    queryKey: ["starship-equipment"],
    queryFn: async () => (await fetch("/api/sw5e/starshipEquipment")).json(),
    staleTime: Infinity,
  });
  // The enhanced ship armor, shields and weapons (with their text, for the bonus they give)
  const { data: enhancedShipRows = [] } = useQuery<any[]>({
    queryKey: ["enhanced-ship-parts"],
    queryFn: async () => ((await (await fetch("/api/sw5e/enhancedItems?search=Ship&fields=id,name,type,searchableRarity,text")).json()) as any[]).filter((e) => /^Ship(Armor|Shield|Weapon)$/.test(e.type)),
    staleTime: Infinity,
  });
  // A ship's fuel capacity: its size's, half again with an extra fuel tank
  const fuelCap = (ship: Pick<PartyShip, "size" | "mods" | "fuel">) => Math.floor((getStarshipSize(ship.size)?.fuelCapacity ?? ship.fuel) * (shipRows.length ? shipSheet({ ...(ship as any), name: "", role: "", tier: 0, equipment: [] }, shipRows).fuelFactor ?? 1 : 1));
  // Work under way at a yard or by the crew keeps a ship on the ground
  const shipBusy = (ship: Pick<PartyShip, "work">) => (ship.work && ship.work.ready > useClock.getState().minutes ? ship.work : undefined);
  // The party as a ship's crew: the character, and every companion that is not a beast
  const crewMembers = (): CrewMember[] => [{ id: "self", hp: character?.currentHp ?? 0 }, ...party.map((c) => ({ id: c.id, hp: c.hp, kind: c.kind }))];
  const engage = () => {
    if (!world || !here || !character) return;
    const mine = ships.find((s) => s.areaId === here.id) ?? ships.find((s) => s.areaId === berthOf(world, here.id));
    const foes = here.ships.filter((s) => s.status === "orbiting" && !s.disabled && s.owner === world.antagonist);
    if (!mine) return void toast.error("You have no ship here to fight from.");
    if (!foes.length) return void toast.info("There is nobody hostile to fight.");
    if (!shipRows.length) return void toast.info("The ship data is still loading.");
    const prof = Math.ceil(1 + level / 4);
    // The party members seated at the stations of the ship's deck are its crew (a ship never boarded: the companions in order)
    const seats = seatsOf(world.areas[deckIdOf(mine.id)]?.layout);
    const crewing = crewOf(seats.length ? seats : [{ id: "g1", name: "Gunnery seat", station: "guns" }, { id: "g2", name: "Gunnery seat", station: "guns" }, { id: "g3", name: "Gunnery seat", station: "guns" }, { id: "g4", name: "Gunnery seat", station: "guns" }], seats.length ? mine.crew : undefined, crewMembers());
    useShipFight.getState().start(
      { id: mine.id, ref: mine.id, sheet: shipSheet(mine, shipRows, prof), crew: crewing.crew, gunners: crewing.gunners, hull: mine.hull },
      foes.map((f) => ({ id: f.id, ref: f.id, sheet: shipSheet(f, shipRows, Math.max(2, (f.tier ?? 0) + 1)) })),
      here.id,
    );
  };
  const finishShipFight = (outcome: string | null | undefined) => {
    const state = useShipFight.getState();
    const fight = state.fight;
    if (!fight || !world || !state.areaId) return state.leave();
    const area = world.areas[state.areaId];
    const mineNow = fight.ships.find((s) => s.id === state.partyShipId);
    const foesNow = fight.ships.filter((s) => s.side === "foe");
    // The party's ship keeps the damage it took; a lost ship is gone
    const starships = ships
      .map((s) => (s.id === state.partyShipId ? (mineNow?.destroyed ? null : { ...s, hull: Math.max(1, mineNow?.hull ?? s.hull ?? 1), fuel: outcome === "fled" ? Math.max(0, s.fuel - 1) : s.fuel }) : s))
      .filter(Boolean);
    // The enemy: destroyed ships are wrecks, disabled ones can be taken, those that jumped away are gone
    const areaShips = (area?.ships ?? [])
      .filter((s) => !foesNow.some((f) => f.id === s.id && f.fled))
      .map((s) => {
        const f = foesNow.find((x) => x.id === s.id);
        if (!f) return s;
        return f.destroyed ? { ...s, status: "wrecked" as const } : f.disabled ? { ...s, disabled: true } : s;
      });
    const beaten = foesNow.filter((f) => f.destroyed || f.disabled);
    // House rule: experience for the hull of each ship beaten, and the salvage a tenth of its value
    const xp = beaten.reduce((sum, f) => sum + Math.round(f.sheet.hullMax / 2), 0);
    const salvage = foesNow.filter((f) => f.destroyed).reduce((sum, f) => sum + Math.round(((area?.ships ?? []).find((s) => s.id === f.id)?.value ?? 0) / 10), 0);
    saveCampaign({
      starships,
      galaxyMap: updateArea(world, state.areaId, { ships: areaShips }).world,
      ...(beaten.length ? { factionInfluence: addRenown(standing, world.antagonist, -1) } : {}),
      ...pass(Math.max(1, Math.round(fight.round / 10))),
    });
    const changes: Record<string, any> = {};
    if (xp) changes.experience = (character.experience ?? 0) + xp;
    if (salvage) changes.credits = (character.credits ?? 0) + salvage;
    // House rule: the hull is stripped for parts as well, worth a twentieth of the ship's value, in salvage and ore
    const parts = haulOf(salvage / 2, ["salvage", "ore"]);
    if (Object.keys(parts).length) {
      const stock = materialsOf(character);
      for (const [id, n] of Object.entries(parts)) stock[id] = (stock[id] ?? 0) + n;
      changes.playState = { ...(character.playState ?? {}), materials: stock };
    }
    // A lost ship: the crew gets away in a pod with 1 hit point (house rule); with escape pods or an ejection pod fitted, whole
    if (mineNow?.destroyed && !mineNow.sheet.escape) {
      changes.currentHp = 1;
      lastSavedHp.current = 1;
    }
    // A wreck may give up a piece of its equipment, salvaged, into the hold
    const pulled = foesNow.filter((f) => f.destroyed).flatMap((f) => {
      const wreck = (area?.ships ?? []).find((s) => s.id === f.id);
      return wreck ? wreckParts(wreck, shipRows) : [];
    });
    if (pulled.length) {
      changes.playState = { ...(changes.playState ?? character.playState ?? {}), shipParts: [...shipParts, ...pulled] };
      setTimeout(() => toast.info(`Salvaged from the wreck: ${pulled.map((x) => x.name).join(", ")} (in your hold).`), 400);
    }
    if (Object.keys(changes).length) saveCharacter(changes);
    toast[outcome === "victory" || outcome === "fled" ? "success" : "error"](
      outcome === "victory"
        ? `The enemy is beaten${xp ? `: ${xp} XP` : ""}${salvage ? `, ${salvage} credits of salvage` : ""}${Object.keys(parts).length ? ` and parts (${Object.entries(parts).map(([id, n]) => `${n} x ${MATERIALS[id].name}`).join(", ")})` : ""}.`
        : outcome === "fled"
          ? "You jump away from the fight."
          : outcome === "destroyed"
            ? mineNow?.sheet.escape ? "Your ship is lost; you get away in its escape pod, unhurt." : "Your ship is lost; you get away in an escape pod with 1 hit point (house rule)."
            : "Your ship is disabled and drifts; it will need repairs.",
    );
    state.leave();
  };

  // Fill a ship's tanks at a port, as far as the credits go
  const refuel = (ship: PartyShip) => {
    const size = getStarshipSize(ship.size);
    const price = size?.fuelCost ?? passageRate;
    const units = Math.min(fuelCap(ship) - ship.fuel, Math.floor((character.credits ?? 0) / price));
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
  const openLock = (exit: Exit, extra: Record<string, any> = {}, alarm = false, crime?: Crime) => {
    if (!world || !exit.pathId) return;
    const paths = world.paths.map((p) => (p.id === exit.pathId ? { ...p, locked: undefined } : p));
    let galaxyMap: World = { ...world, paths };
    // A blast sets off the alarm of the building the party stands in
    const buildingId = here?.kind === "room" ? here.parentId : here?.kind === "building" ? here.id : null;
    if (alarm && buildingId) galaxyMap = updateArea(galaxyMap, buildingId, { alarm: true }).world;
    if (crime && here) galaxyMap = reportCrime(galaxyMap, here.id, crime, clockNow());
    saveCampaign({ galaxyMap, ...extra });
  };
  // A shop that is shut: its lock is picked like any other (Dexterity or Intelligence, the better of the two, with a
  // security kit), and the trespass is a crime where the law sees it
  const breakIn = async (buildingId: string, dc: number) => {
    if (!world || !here) return;
    const b = world.areas[buildingId];
    const [from, to] = hoursOfBuilding(b?.type ?? "") ?? [8, 20];
    toast.info(`${b?.name ?? "It"} is shut: open ${String(from % 24).padStart(2, "0")}:00 to ${String(to % 24).padStart(2, "0")}:00 (house rule). The door is locked.`);
    const kit = lockKit();
    if (here.danger === 0 && !lawUnseen("Picking the lock", "trespass")) return;
    const ok = await abilityCheck("Lock (after hours)", dc, ["dexterity", "intelligence"], !!kit && trainedWith(kit));
    if (cancelledCheck.current || !ok) return;
    afterHours.current.set(buildingId, clockNow());
    const latest = latestWorld();
    if (latest) saveCampaign({ galaxyMap: reportCrime(latest, here.id, "trespass", clockNow()) });
    toast.success("The lock gives. Tap the door again to go in.");
  };
  const unlock = async (exit: Exit) => {
    if (!world || !exit.pathId) return;
    const kit = lockKit();
    const dc = exit.locked ?? 10;
    // A code cylinder holds its bearer's clearance: it opens a lock of DC 15 or less (house rule)
    if (dc <= 15 && carries(/^code cylinder$/i)) {
      toast.success("The code cylinder is accepted: the lock opens.");
      return void openLock(exit, {}, false);
    }
    if (here?.danger === 0 && !lawUnseen("Picking the lock", "trespass")) return;
    let ok = await abilityCheck("Lock", dc, ["dexterity", "intelligence"], !!kit && trainedWith(kit));
    if (!ok && kit) {
      const spike = (character.equipment ?? []).find((n: string) => { const g = gearOf(n); return g?.kind === "spike" && g.tool.toLowerCase() === kit.toLowerCase(); });
      if (spike) {
        saveCharacter({ equipment: consume(spike).equipment });
        toast.info(`${spike} spent: reroll.`);
        ok = await abilityCheck("Lock (rerolled)", dc, ["dexterity", "intelligence"], trainedWith(kit));
      }
    }
    if (ok) openLock(exit, {}, false, "trespass");
  };
  // Forcing a door instead (house rule: DC 5 over the lock's for a Strength check; a ram gives +4 and
  // advantage with a helper (Ram, portable); a fusion cutter takes ten minutes for each 5 of the DC
  // and no check; a charge, mine or grenade simply opens it). Noise brings the watch down on the room.
  const forceDoor = async (exit: Exit, how: "strength" | "ram" | "cutter" | "blast") => {
    if (!world || !here || !exit.pathId) return;
    if (here.danger === 0 && lawmenAt(world, here.id).length) {
      toast.error("Forcing a door under the guards' eyes: they see it, and turn on you.");
      return void callTheLaw(here.id, how === "blast" ? "heinous" : "trespass");
    }
    const dc = (exit.locked ?? 10) + 5;
    const noise = () => {
      if (hostiles.length) setWatch(ALERT.attacking);
    };
    if (how === "cutter") {
      const minutes = 10 * Math.ceil((exit.locked ?? 10) / 5);
      openLock(exit, pass(minutes), false, "trespass");
      return void toast.success(`The fusion cutter takes ${minutes} minutes, and the way is open.`);
    }
    if (how === "blast") {
      // The cheapest of what is carried
      const bomb = ((character.equipment ?? []) as string[]).filter((n) => gearOf(n)?.kind === "explosive").sort((a, b) => (factsOf(a)?.cost ?? 0) - (factsOf(b)?.cost ?? 0))[0];
      if (!bomb) return;
      saveCharacter({ equipment: consume(bomb).equipment });
      openLock(exit, {}, true, "heinous");
      noise();
      return void toast.success(`${bomb} blows the lock. Everyone nearby heard it.`);
    }
    const ram = how === "ram";
    const helper = party.some((c) => c.hp > 0 && c.kind !== "beast");
    const [first, second] = await rollOnTable("Force the door (Strength)", (ram && helper ? ["d20", "d20"] : ["d20"]) as TableDie[]);
    const roll = ram && helper ? Math.max(first, second) : first;
    const bonus = modifier(character.abilityScores?.strength) + (ram ? 4 : 0) + (substanceFor("strength") || 0);
    const ok = roll + bonus >= dc;
    toast[ok ? "success" : "error"](`${ram ? "Portable ram" : "Shoulder it"} (Strength${ram && helper ? ", helped: advantage" : ""}): ${roll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} = ${roll + bonus} against DC ${dc}. ${ok ? "It gives." : "It holds."} Noisy.`);
    noise();
    if (ok) openLock(exit, {}, false, "trespass");
  };


  // Look for hidden ways and caches: Wisdom (Perception)
  const search = async () => {
    if (!world || !here) return;
    const hiddenPaths = world.paths.filter((p) => p.hidden && !p.climb && (p.from === here.id || p.to === here.id));
    const hiddenLoot = here.loot.filter((c) => c.hidden);
    const loose = trapsIn(here, false);
    // Secret ways: out of this room, or into the rooms of the building the party stands before
    const secretRooms = [here, ...childrenOf(world, here.id)].filter((a) => a.secretEntry && !a.secretEntry.found);
    if (!await abilityCheck("Search", 12 + here.danger, ["wisdom"], skilled("perception"))) return;
    if (hiddenPaths.length + hiddenLoot.length + secretRooms.length + loose.length === 0) {
      toast.info("There is nothing hidden here.");
      return;
    }
    if (loose.length) toast.success("Found: a loose flagstone over a pit.");
    const next = updateArea(world, here.id, {
      loot: here.loot.map((c) => ({ ...c, hidden: undefined })),
      ...(loose.length && here.layout ? { layout: { ...here.layout, assets: here.layout.assets.map((a) => (loose.some((l) => l.id === a.id) ? { ...a, name: "Pit trap" } : a)) } } : {}),
    }).world;
    const areas = { ...next.areas };
    for (const room of secretRooms) areas[room.id] = { ...areas[room.id], secretEntry: { ...room.secretEntry!, found: true } };
    if (secretRooms.length) toast.success(`Found: ${secretRooms.map((room) => `a ${room.secretEntry!.name.toLowerCase()}${room.id === here.id ? "" : ` into ${room.name}`}`).join(", ")}.`);
    saveCampaign({ galaxyMap: { ...next, areas, paths: next.paths.map((p) => (hiddenPaths.some((h) => h.id === p.id) ? { ...p, hidden: undefined } : p)) } });
  };

  // Go into a place nobody has mapped yet: the server builds what is inside
  const explore = async (areaId?: string, alsoSave: Record<string, any> = {}, then?: (built: World) => World) => {
    if (!world || !here) return;
    setExploring(true);
    try {
      const response = await fetch("/api/world/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world, areaId: areaId ?? here.id }),
      });
      if (!response.ok) throw new Error("The server could not build this place");
      const built: World = (await response.json()).world;
      await saveCampaign({ galaxyMap: then ? then(built) : built, ...alsoSave });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setExploring(false);
    }
  };

  // Open a cache (its lock first, if it has one) and take what is in it
  const takeLoot = async (cache: LootCache) => {
    if (!world || !here) return;
    if (hostiles.length > 0 && !unseen("Taking it")) return;
    // Spoils of a place the enemy holds are nobody's property: only what is kept in a place of the law is theft
    if (hostiles.length === 0 && here.danger === 0 && !lawUnseen("Taking it", "theft")) return;
    if (cache.locked && !await abilityCheck("Lock", cache.locked, ["dexterity", "intelligence"], carries(/security kit|slicer's kit/i))) return;
    const gained = cache.items.flatMap((item) => Array.from({ length: item.quantity }, () => item.name));
    saveCharacter({ equipment: [...(character.equipment ?? []), ...gained], credits: (character.credits ?? 0) + cache.credits });
    const loot = here.loot.map((c) => (c.id === cache.id ? { ...c, items: [], credits: 0, locked: undefined, looted: true } : c));
    saveCampaign({ galaxyMap: updateArea(world, here.id, { loot }).world });
    toast.success(`Taken: ${[cache.credits && `${cache.credits} credits`, ...gained].filter(Boolean).join(", ") || "nothing"}`);
  };

  // Work a resource node (house rule, see "Gathering and materials" in shared logic): a check with
  // the family's kit, 10 minutes, a few units into the character's stacks
  const harvest = async (cache: LootCache) => {
    if (!world || !here || !cache.node) return;
    if (hostiles.length > 0 && !unseen("Working it")) return;
    const now = useClock.getState().minutes;
    const node = nodeAt(cache.node, now);
    if (node.charges <= 0 && node.once) return void toast.info(`${cache.name} is picked clean.`);
    if (node.charges <= 0) {
      const days = Math.max(1, Math.ceil((NODE_RESPAWN - (now - (node.emptiedAt ?? now))) / 1440));
      return void toast.info(`${cache.name} is worked out; it recovers in about ${days} day${days > 1 ? "s" : ""}. (House rule.)`);
    }
    const family = FAMILIES[node.family];
    const kit: string | undefined = harvestKit(node.family, node.tier, (character.equipment ?? []) as string[]);
    if (!kit && node.tier > 0) return void toast.error(`It takes ${family.kitNames} to work this ${RARITY_TIERS[node.tier].toLowerCase()} find. (House rule: bare hands only manage the lowest tier.)`);
    const dc = harvestDc(node.tier) + (kit ? 0 : 5);
    const r = await toolRoll(kit ?? "bare hands", dc, `${family.verb[0].toUpperCase()}${family.verb.slice(1)} ${cache.name} (${family.skill})`, family.ability);
    if ((r as any).cancelled) return;
    const total = pass(HARVEST_MINUTES);
    const after = useClock.getState().minutes;
    const ruined = !r.success && r.roll === 1;
    const used = r.success || ruined;
    const gained = r.success ? harvestYield(r.total, dc, !!kit && trainedWith(kit)) : 0;
    if (ruined) toast.error(`A natural 1: you spoil part of ${cache.name}.`);
    const next: ResourceNode = used ? { ...node, charges: node.charges - 1, ...(node.charges - 1 <= 0 ? { emptiedAt: after } : {}) } : node;
    const loot = here.loot.map((c) => (c.id === cache.id ? { ...c, node: next } : c));
    if (gained) {
      const stock = materialsOf(character);
      stock[node.material] = (stock[node.material] ?? 0) + gained;
      saveCharacter({ playState: { ...(character.playState ?? {}), materials: stock } });
      toast.success(`Gathered ${gained} x ${MATERIALS[node.material].name} (${next.charges} of ${node.max} harvests left here).`);
    }
    saveCampaign({ galaxyMap: updateArea(world, here.id, { loot }).world, ...total });
  };

  const level = Number(character?.level) || 1;
  const klass = getClassById(character?.class ?? "");
  const knownPowers: any[] = [...(character?.forcePowers ?? []), ...(character?.techPowers ?? [])].filter((power) => power?.name);
  const dead = (character?.conditions ?? []).includes("Dead");

  // The people of the district the party is in (shared logic "The people in a district"): an
  // encounter now and then, and a master who teaches the path of powers the character lacks
  const districtHere = world && hereId ? districtAt(world, hereId) : undefined;
  const learner: Learner = {
    level,
    credits: character?.credits ?? 0,
    force: (character?.forcePowers ?? []).length > 0 || klass?.casterType === "Force",
    tech: (character?.techPowers ?? []).length > 0 || klass?.casterType === "Tech",
    forceAlign: forceAlignOf(character?.forceAlignment) !== "None" ? forceAlignOf(character?.forceAlignment) : /good/i.test(character?.alignment ?? "") ? "Light" : /evil/i.test(character?.alignment ?? "") ? "Dark" : "None",
    leaning: leaningOf(character?.forceAlignment, character?.skillProficiencies ?? [], character?.abilityScores ?? {}),
    known: knownPowers.map((p) => p.name),
  };
  // The character's figure on the map: their species, and a lit blade for one who uses the Force
  // (red on the dark side)
  useEffect(() => {
    usePartyLook.getState().set({ species: character?.species, name: character?.name, force: learner.force, blade: learner.forceAlign === "Dark" ? "#ff4040" : (character?.name?.length ?? 0) % 2 ? "#6ef08a" : "#7fe3ff", gear: character ? figureGearOf(character) : undefined });
  }, [character?.species, character?.name, learner.force, learner.forceAlign, JSON.stringify(character?.equipment ?? []), JSON.stringify(character?.armor ?? null)]);
  const encounterHere = world?.encounter && districtHere?.id === world.encounter.districtId ? world.encounter : null;
  // A gang is on the party once it has them surrounded (or has had time enough to: it is never left out of reach)
  const gangReady = encounterHere?.kind === "robbery" && (encounterHere.phase === "surround" || (encounterHere.phase === "ambush" && clockMinutes - encounterHere.begun >= 12));
  const gangHolds = encounterHere?.kind === "robbery" && (encounterHere.phase === "ambush" || encounterHere.phase === "surround");
  useEffect(() => {
    if (!world || !character || inCombat || dead || exploring) return;
    const open = world.encounter;
    // Walking out of the district leaves the encounter behind (and one from before encounters were people on the map has no phase)
    if (open && (!open.phase || districtHere?.id !== open.districtId)) return void saveCampaign({ galaxyMap: { ...world, encounter: undefined } });
    if (open || !districtHere || !hereId || noEncounters()) return;
    // Someone comes up to the party only on the street (not indoors), and a few hours after the last had its say
    if (world.areas[hereId]?.kind !== "building" || clockMinutes < (world.encounterNext ?? 0)) return;
    const hour = Math.floor(hourOf(clockMinutes));
    const faction = factionAt(world, districtHere.settlementId) ?? "";
    const building = trailOf(world, hereId).find((a) => a.kind === "building");
    const rolled = rollEncounter(world, districtHere, dayOf(clockMinutes), hour, learner, standing.renown[faction] ?? 0, building?.id ?? "");
    if (rolled && rolled.id !== world.encounterSeen) {
      saveCampaign({ galaxyMap: { ...world, encounter: { ...rolled, begun: clockMinutes }, encounterSeen: rolled.id } });
      toast.info(rolled.kind === "master" ? "Someone is making their way through the street toward you." : "A figure is coming up the street toward you.");
    }
  }, [hereId, here?.kind, Math.floor(hourOf(clockMinutes)), world?.encounter?.id, inCombat, dead, exploring, character?.credits]);

  // An encounter is over: it is cleared, and the next waits some hours
  const closeEncounter = (w: World): World => ({ ...w, encounter: undefined, encounterSeen: w.encounter?.id ?? w.encounterSeen, encounterNext: clockNow() + ENCOUNTER_GAP * 60 });

  // The party has walked into an alley: in a lawless place a gang may be waiting in it (see ambushIn). It starts
  // at the ends of the alley; the map brings it to the party, bars the ways out and has it stand round them.
  const ambush = async (alley: Rect) => {
    if (!world || !districtHere || !character || world.encounter || inCombat || dead || noEncounters()) return;
    if (clockMinutes < (world.encounterNext ?? 0)) return;
    const day = dayOf(clockMinutes);
    const hour = Math.floor(hourOf(clockMinutes));
    if (!ambushIn(world, districtHere, alley, day, hour)) return;
    try {
      const response = await fetch("/api/world/gang", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level, seed: `${day}-${hour}-${alley.x}-${alley.y}` }) });
      if (!response.ok) return;
      const gang = (await response.json()) as Occupant[];
      const current = latestWorld() ?? world;
      if (current.encounter || !gang.length) return;
      const encounter = ambushEncounter(current, districtHere, alley, gang, day, hour, clockNow());
      saveCampaign({ galaxyMap: { ...current, encounter, encounterSeen: encounter.id } });
      toast.warning("A gang closes in from both ends of the alley!");
    } catch {
      /* no gang this time */
    }
  };

  // A person in need has been taken where they had to go
  const deliverEncounter = () => {
    const open = world?.encounter;
    if (!world || !character || !open || open.kind !== "help" || open.phase !== "follow") return;
    const result = deliveredResult(open, learner, open.target ? world.areas[open.target]?.name : undefined);
    if (result.credits) saveCharacter({ credits: (character.credits ?? 0) + result.credits });
    saveCampaign({ galaxyMap: closeEncounter(world), ...(result.renown && open.faction ? { factionInfluence: addRenown(standing, open.faction, result.renown) } : {}), ...pass(5) });
    toast.success(result.message);
  };

  // Deal with the encounter: pay what is asked, and take what comes of it (a gang is fought on the map, or paid)
  const answerEncounter = async (index: number) => {
    const open = world?.encounter;
    if (!world || !open || !character || !hereId) return;
    const path = pathToTeach(learner);
    const option = optionsOf(open, level, path, character.credits ?? 0)[index];
    if (!option) return;
    if (option.cost && option.cost > (character.credits ?? 0)) return void toast.error(`That costs ${option.cost} credits and you have ${character.credits ?? 0}.`);
    if (open.kind === "robbery" && index === 0) return void startGangFight(open);
    const success = true;
    const castMod = Math.max(...(path === "tech" ? ["intelligence"] : ["wisdom", "charisma"]).map((a) => modifier(character.abilityScores?.[a])));
    const result = encounterResult(open, index, success, learner, open.target ? world.areas[open.target]?.name : undefined, castMod);
    let galaxyMap: World = result.next ? { ...world, encounter: { ...open, ...result.next } as Encounter } : closeEncounter(world);
    if (result.crime) galaxyMap = reportCrime(galaxyMap, hereId, "brawl", clockNow());
    const characterChanges: Record<string, any> = {};
    const credits = (character.credits ?? 0) - (option.cost ?? 0) + (result.credits ?? 0);
    if (credits !== (character.credits ?? 0)) characterChanges.credits = Math.max(0, credits);
    if (result.damage) {
      characterChanges.currentHp = Math.max(0, (character.currentHp ?? 0) - result.damage);
      lastSavedHp.current = characterChanges.currentHp;
    }
    const campaignChanges: Record<string, any> = {};
    if (result.quest) campaignChanges.quests = [...quests, result.quest];
    if (result.renown && open.faction) campaignChanges.factionInfluence = addRenown(standing, open.faction, result.renown);
    if (result.teaching) {
      // The path is taken up: its first powers, and a pool of points to cast them with (the same
      // pool a caster's points are in)
      const asPower = (row: any) => ({
        id: row.id, name: row.name, level: row.level, castingTime: row.castingPeriodText ?? row.castingPeriod ?? "", range: row.range ?? "", duration: row.duration ?? "",
        concentration: !!row.concentration, ...(result.teaching!.path === "force" ? { forceAlignment: row.forceAlignment } : {}), description: row.description ?? "",
        higherLevelDescription: row.higherLevelDescription, source: row.contentSource,
      });
      const key = result.teaching.path === "force" ? "forcePowers" : "techPowers";
      characterChanges[key] = [...(character[key] ?? []), ...result.teaching.powers.map(asPower)];
      characterChanges.maxForcePoints = (character.maxForcePoints ?? 0) + result.teaching.points;
      characterChanges.currentForcePoints = (character.currentForcePoints ?? 0) + result.teaching.points;
      lastSavedPoints.current = characterChanges.currentForcePoints;
      galaxyMap.mastersTaught = [...(world.mastersTaught ?? []), open.settlementId];
    }
    const time = result.next ? {} : pass(open.kind === "master" ? 2 * 1440 : 10);
    if (Object.keys(characterChanges).length) saveCharacter(characterChanges);
    saveCampaign({ galaxyMap, ...campaignChanges, ...time });
    toast[result.teaching || success ? "success" : "error"](result.message);
  };

  // What the character fights with: the weapons carried (see carriedWeapons), a species' natural
  // weapon when unarmed, and the powers known with the caster's numbers for each
  // A saved power has its name, level and text; its range, duration and concentration are looked up
  const { data: powerRows } = useQuery<any>({
    queryKey: ["power-facts"],
    queryFn: () => fetch("/api/sw5e/powers?fields=name,range,duration,concentration,castingPeriodText&limit=1000").then((r) => r.json()),
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
    const kind = itemKind(name, character);
    const lower = name.toLowerCase();
    const next: Equipped = {
      weapons: kind === "weapon" ? (on ? Array.from(new Set([...now.weapons, name])) : now.weapons.filter((n) => n.toLowerCase() !== lower)) : now.weapons,
      body: kind === "armor" ? (on ? name : null) : now.body,
      shield: kind === "shield" ? (on ? name : null) : now.shield,
    };
    const change = derivedStats({ ...character, armor: next }).armorClass - derivedStats(character).armorClass;
    saveCharacter({ armor: next, armorClass: Math.max(0, (rawCharacter.armorClass ?? 10) + change) });
    toast.success(`${name}: ${on ? (kind === "weapon" ? "in hand" : "on") : kind === "weapon" ? "put away" : "taken off"}${change ? `; armor class ${change > 0 ? "+" : ""}${change}` : ""}.`);
  };

  // The ranged weapon's ammunition (shared/logic gear.ts): what feeds it, the rounds carried, what each does, the shots left in it, and
  // whether an ammo pouch, power belt, bandolier, quiver or feed belt reloads it for free
  const PLAIN_ROUND: Record<string, string> = { cell: "Power cell", cartridge: "Slug cartridge", arrow: "Arrow", bolt: "Bolt", wrist: "Dart", generator: "Power generator", rocket: "Rocket, fragmentation", torpedo: "Torpedo, fragmentation", mag: "Flechette mag, fragmentation", tank: "Projector tank, incendiary" };
  const ammoKit = (w?: { name: string; properties: string[] }) => {
    if (!w) return undefined;
    const family = ammoFamilyOf({ name: w.name, properties: w.properties });
    if (!family) return undefined;
    const carried = ((character.equipment ?? []) as string[]).filter((n) => ammoItemFamily(n) === family && factsOf(n)?.equipmentCategory === "Ammunition");
    const reserves: Record<string, number> = {};
    for (const n of carried) reserves[n] = (reserves[n] ?? 0) + 1;
    const plain = PLAIN_ROUND[family] ?? carried[0];
    const max = family === "generator" ? GENERATOR_SHOTS : reloadOf({ properties: w.properties });
    const saved = play.loads?.[w.name];
    const riders: Record<string, AmmoRider> = {};
    const shotsPer: Record<string, number> = {};
    for (const n of new Set([plain, ...carried])) {
      const f = factsOf(n);
      riders[n] = f ? ammoRider({ name: n, description: f.description }) : {};
      shotsPer[n] = riders[n].area ? 3 : 1;
    }
    const free = ((character.equipment ?? []) as string[]).some((n) => factsOf(n)?.equipmentCategory === "WeaponOrArmorAccessory" && accessoryOf({ name: n, description: factsOf(n)?.description }).reload?.families.includes(family));
    return { weapon: w.name, family, max, left: max > 0 ? Math.min(max, saved ? saved.left : max) : 0, round: saved?.round, plain, riders, reserves, free, shotsPer };
  };
  // After a fight: the rounds fired come out of the pack, and the weapon keeps what is left in it
  const settleAmmo = (after: { weapon: string; left: number; round?: string; spent: Record<string, number> } | null | undefined) => {
    if (!after) return;
    setTimeout(() => {
      const current = queryClient.getQueryData<any>(["game-character", gameCharacterId]);
      if (!current) return;
      const equipment = [...((current.equipment ?? []) as string[])];
      for (const [name, n] of Object.entries(after.spent)) for (let i = 0; i < n; i++) {
        const at = equipment.indexOf(name);
        if (at >= 0) equipment.splice(at, 1);
      }
      saveCharacter({ equipment, playState: { ...(current.playState ?? {}), loads: { ...(current.playState?.loads ?? {}), [after.weapon]: { left: after.left, round: after.round } } } });
    }, 2500);
  };
  // The character as a fight takes them: in the dark without a light or darkvision, effectively blinded (Player's Handbook, Vision and
  // Light); a sealed suit's speed, resistances and immunities (Expanded Content, Environmental Suits)
  const fighterNow = () => {
    const dark = exposures.find((e) => e.hazard === "dark" && !e.safe);
    return dark ? { ...character, conditions: Array.from(new Set([...(character.conditions ?? []), "Blinded"])) } : character;
  };
  const combatKit = () => {
    // Of the weapons carried, the one with the best attack for each kind; unarmed otherwise
    const weapons = carriedWeapons(character).sort((a, b) => Number(!!a.natural) - Number(!!b.natural) || b.attackBonus - a.attackBonus);
    const melee = weapons.find((w) => !w.ranged);
    const ranged = weapons.find((w) => w.ranged);
    const order = { attack: 0, save: 0, condition: 1, heal: 1, other: 2 };
    const isLight = (w?: { properties: string[] }) => !!w?.properties.some((p) => /^light/i.test(p));
    // A second light weapon in the other hand (Two-Weapon Fighting)
    const other = isLight(melee) ? weapons.find((w) => !w.ranged && !w.natural && w !== melee && isLight(w)) : undefined;
    const natural = weapons.find((w) => w.natural);
    const proficiency = Math.ceil(1 + level / 4);
    const scoreMod = (a: string) => modifier(character.abilityScores?.[a]);
    const savedAbilities = (character.savingThrowProficiencies ?? []).map((a: string) => String(a).toLowerCase());
    // The class table's focus points, and what has been spent of them since the last rest
    const focusMax = getClassLevelValue(character.class, level, "Focus Points");
    const uses = play.featureUses ?? {};
    const ammo = ammoKit(ranged);
    const armorNow = wornTraits();
    const kit = {
      ammo,
      // Stealth to hide with this armour and a stealth field running (see stealthRoll)
      hideMode: stealthMode({ stealthDisadvantage: armorNow.stealthDisadvantage, stealthAdvantage: armorNow.stealthAdvantage || ((character.equipment ?? []) as string[]).some((n) => /stealth field generator/i.test(n) && running(n)) }),
      // What the armour and shield do in the fight (see wornTraits)
      armorProps: { absorb: armorNow.absorb, regulated: armorNow.regulated || undefined, reactive: armorNow.reactive || undefined, avoidant: armorNow.avoidant || undefined, insulated: armorNow.insulated || undefined, imbalanced: armorNow.imbalanced || undefined, shield: armorNow.shield || undefined },
      // A bipod for a two-handed blaster; a tripod deployed beforehand (it takes a minute: house reading) counts as braced from the start
      bipod: (character.equipment ?? []).includes("Bipod") && !!ranged?.properties.some((p) => /two-handed/i.test(p)),
      braced: (character.equipment ?? []).includes("Tripod") && !!ranged?.properties.some((p) => /two-handed/i.test(p)) && !!play.tripodSet,
      meleeDice: melee?.dice,
      meleeWeapon: melee?.name,
      meleeAttack: melee?.attackBonus,
      meleeDamage: melee?.damageBonus,
      meleeProps: melee?.properties,
      meleeType: melee?.damageType,
      meleeAbility: melee?.ability,
      rangedDice: ranged?.dice,
      rangedWeapon: ranged?.name,
      rangedAttack: ranged?.attackBonus,
      rangedDamage: ranged?.damageBonus,
      rangedProps: ranged?.properties,
      rangedType: ranged?.damageType,
      offhand: other ? { name: other.name, dice: other.dice, attack: other.attackBonus, damage: other.damageBonus, type: other.damageType, props: other.properties } : undefined,
      unarmed: natural
        ? { name: natural.name, dice: natural.dice, attack: natural.attackBonus, damage: natural.damageBonus, type: natural.damageType }
        : { name: "Unarmed strike", dice: "1", attack: scoreMod("strength") + proficiency + (character.itemUnarmed?.attack ?? 0), damage: scoreMod("strength") + (character.itemUnarmed?.damage ?? 0), type: "kinetic" },
      // A barrier's hit points, taken before real ones; the body's side effects of augmentation
      tempHp: character.itemTempHp || undefined,
      // Advantage on the first attack after a long rest aboard a ship with an armory
      helped: play.firstAttack || undefined,
      // Encumbered: less speed, and heavily, disadvantage on Strength, Dexterity and Constitution (attacks and saves); over capacity, 5 feet
      ...(() => {
        const load = loadNow();
        const base = Number(character.speed) || 30;
        return load.level ? { speed: load.level === 3 ? 5 : Math.max(5, base + load.speed), burden: load.disadvantage } : {};
      })(),
      // Powered flight running (a jetpack, rocket boots, a rocketpack: their flying speed), a repulsor pack's slowed fall
      ...(() => {
        const flyer = ((character.equipment ?? []) as string[]).find((n) => running(n) && accessoryOf({ name: n, description: factsOf(n)?.description }).fly);
        const fly = flyer ? accessoryOf({ name: flyer, description: factsOf(flyer)?.description }).fly : undefined;
        const slowFall = ((character.equipment ?? []) as string[]).some((n) => /repulsor pack/i.test(n) && running(n));
        return { ...(fly ? { fly, speed: Math.max(Number(character.speed) || 30, fly) } : {}), ...(slowFall ? { slowFall } : {}) };
      })(),
      // A holster worn (a weapon drawn from it takes no action), a remote detonator carried and the mines paired with it
      ...(() => {
        const accessoryFor = (n: string) => accessoryOf({ name: n, description: factsOf(n)?.description });
        const holster = wearingNow.some((n) => accessoryFor(n).draw);
        const det = ((character.equipment ?? []) as string[]).map(accessoryFor).find((a) => a.detonator)?.detonator;
        return { ...(holster ? { holster: { ready: true } } : {}), ...(det ? { detonator: { range: det.range, paired: [...(play.paired ?? [])] } } : {}) };
      })(),
      // Shock gloves worn: unarmed strikes deal their lightning too (the item's text)
      ...(() => {
        const gloves = wearingNow.find((n) => accessoryOf({ name: n, description: factsOf(n)?.description }).unarmed);
        const u = gloves ? accessoryOf({ name: gloves, description: factsOf(gloves)?.description }).unarmed! : undefined;
        if (!u) return {};
        const base = natural ? { name: natural.name, dice: natural.dice, attack: natural.attackBonus, damage: natural.damageBonus, type: natural.damageType } : { name: "Unarmed strike", dice: "1", attack: scoreMod("strength") + proficiency, damage: scoreMod("strength"), type: "kinetic" };
        return { unarmed: { ...base, name: `${base.name} (${gloves})`, extra: { dice: u.dice, type: u.type } } };
      })(),
      // Sealed suits worn: their resistances and condition immunities, and 15 feet less speed
      ...(() => {
        const suits = wearingNow.map((n) => suitFacts(n)).filter(Boolean);
        if (!suits.length) return {};
        return { resist: [...new Set(suits.flatMap((x) => x!.resist))], conditionImmune: [...new Set(suits.flatMap((x) => x!.immune))], speed: Math.max(5, (Number(character.speed) || 30) + Math.min(...suits.map((x) => x!.speed))) };
      })(),
      // In water (Player's Handbook, Swimming): each foot costs an extra foot unless the creature has a swimming speed (a propulsion
      // pack running gives its own: the item's text)
      ...(() => {
        if (!exposures.some((e) => e.hazard === "underwater")) return {};
        const pack = ((character.equipment ?? []) as string[]).find((n) => running(n) && accessoryOf({ name: n, description: factsOf(n)?.description }).swim);
        const swim = pack ? accessoryOf({ name: pack, description: factsOf(pack)?.description }).swim! : 0;
        return { speed: waterSpeed(Number(character.speed) || 30, swim) };
      })(),
      vulnerable: (play.augments?.length ?? 0) >= 4 ? ["ion"] : undefined,
      // Saving throws: the ability modifier, and the proficiency bonus where the class is proficient
      saves: Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((a) => [a, (a === "dexterity" && armorNow.rigid ? rigidDex(scoreMod(a)) : scoreMod(a)) + (savedAbilities.includes(a) ? proficiency : 0)])),
      stealth: scoreMod("dexterity") + (skilled("stealth") ? proficiency : 0),
      // What the class, archetype and species features can do, their uses spent since the last rest, and the focus left
      features: combatFeatures(character),
      uses,
      focus: Math.max(0, focusMax - (uses.focus ?? 0)),
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
      high: play.substance?.ability || play.substance?.temp ? { name: play.substance.name, ability: play.substance.ability, rounds: addictionLevel >= 2 ? 5 : 10, temp: play.substance.temp, low: play.substance.phase === "low", die: play.substance.die } : undefined,
      // Armor picked up since the sheet was last worked out counts too
      // (once armor has been put on or taken off by choice, the sheet's class is what counts)
      armorClass: equippedOf(character) ? character.armorClass : Math.max(character.armorClass, calculateArmorClass(character.abilityScores, character.equipment ?? [])),
      powerPoints: character?.currentForcePoints ?? 0,
      powers: knownPowers
        .map((power) => {
          const facts = powerFacts(power.name) ?? {};
          const effect = powerEffect({ duration: facts.duration, concentration: facts.concentration, ...power }, level);
          const time = String(facts.castingPeriodText ?? "1 action").toLowerCase();
          const castTime: "bonus" | "reaction" | "action" | "long" = /bonus action/.test(time) ? "bonus" : /reaction/.test(time) ? "reaction" : /^1 action/.test(time) ? "action" : "long";
          // A power that moves a creature or an object (Force Push/Pull, Force Throw, Telekinesis, the push of Force Repulse)
          const motion = powerMotion({ level: power.level, description: power.description ?? facts.description, range: power.range ?? facts.range }, level);
          // A machinist's catalyzer taken for the fight: tech powers gain its bonuses (a tech power is one with no Force alignment)
          const stats = castingStats(character.abilityScores, level, power);
          const cat = !("forceAlignment" in power) ? (play.buffs ?? []).find((b) => b.kind === "catalyzer")?.effects : undefined;
          return {
            name: power.name as string, level: power.level as number, cost: powerCost(power), range: rangeFeet(power.range ?? facts.range), castTime, ...effect, motion, ...(motion && !motion.rider ? { summary: motionSummary(motion) } : {}),
            ...stats, ...(cat ? { attack: stats.attack + (cat.techAttack ?? 0), dc: stats.dc + (cat.techDc ?? 0), bonus: cat.techDamage ?? 0 } : {}),
          };
        })
        .sort((a, b) => order[a.kind] - order[b.kind] || a.level - b.level),
    };
    // A Strength requirement not met, Cumbersome armour: speed lost (a speed already changed by load, a suit or water counts from there)
    return armorNow.speed ? { ...kit, speed: Math.max(5, ((kit as any).speed ?? (Number(character.speed) || 30)) + armorNow.speed) } : kit;
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
    profile: o.profile,
    speed: o.speed || 30,
    reach: o.attack?.ranged ? 5 : o.attack?.range ?? 5,
    range: o.attack?.ranged ? ([o.attack.range ?? 80, o.attack.long ?? (o.attack.range ?? 80) * 4] as [number, number]) : undefined,
    size: o.size,
    creature: o.creature,
    role: o.role,
    species: o.species,
  });

  // Fight the hostile creatures in this area, with their own armor, hit points and attacks
  // A bout of the pit arena: a creature of the rules fights the party on the arena, by the combat engine
  const launchBout = (monster: Sw5eMonster, bout: number) => {
    if (!character) return;
    const occupant = statBlockOccupant(monster, equipmentData as any, `pit-${bout}`, 1, "creature", "hostile");
    const enemies = [{ ...foe(occupant, `pit-${bout}-0`, occupant.name), x: 8, y: 4, z: 0 }];
    initiateCombat(character, enemies as any, combatKit(), false, { width: 12, height: 9, assets: [] } as any, { x: 3, y: 4 }, []);
  };
  const keepPitHp = (hp: number) => {
    lastSavedHp.current = hp;
    saveCharacter({ currentHp: hp });
  };
  // What the party has won in the pit, on top of what it had when the pit opened
  const bankPit = (total: { credits: number; items: string[] }) => saveCharacter({ credits: pitBase.current.credits + total.credits, equipment: [...pitBase.current.equipment, ...total.items] });
  const openPit = () => {
    if (!character || character.currentHp <= 0) return;
    pitBase.current = { credits: Number(character.credits) || 0, equipment: [...(character.equipment ?? [])] };
    setPitOpen(true);
  };
  const exitPit = (summary: PitSummary) => {
    setPitOpen(false);
    if (!summary.bouts) return;
    commitDowntime({
      character: {}, downtime: {}, days: 1,
      log: [`Pit arena: ${summary.bouts} bout${summary.bouts === 1 ? "" : "s"} won, ${summary.credits.toLocaleString()} cr${summary.items.length ? `, ${summary.items.join(", ")}` : ""}${summary.knockedOut ? "; knocked out in the last bout" : ""}.`],
    });
  };

  // The gang of an alley that has the party surrounded is fought on the district's own map, in the alley: the
  // members stand where the map has them round the party, and when their leader falls the rest run (see breakGang
  // in useCombat). They are not among the people of the area, so what is written back after the fight is the
  // encounter's alone.
  const startGangFight = (open: Encounter) => {
    if (!character || !world || !open.gang?.length || !open.alley || !districtHere || character.currentHp <= 0) return;
    const field = districtArena(world, districtHere.id);
    if (!field) return;
    const spot = usePartySpot.getState();
    const start = { x: spot.x, y: spot.y, z: 0 };
    const spots = gangSpots(open.alley, start, open.gang.length);
    const enemies = open.gang.map((o, i) => ({ ...foe(o, o.id, o.name), x: (spots[i] ?? start).x, y: (spots[i] ?? start).y, z: 0, gang: open.id, leader: i === 0 }));
    fightArea.current = null;
    fightAreas.current = [];
    gangFight.current = open;
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
    lastSavedUses.current = JSON.stringify(play.featureUses ?? {});
    fightBegun.current = true;
    initiateCombat(
      fighterNow(), enemies as any, combatKit(), false,
      { width: field.width, height: field.height, assets: field.assets, platforms: field.platforms, links: field.links, district: field.district, open: true, floor: world.areas[here?.parentId ?? ""]?.type },
      start,
      party.filter((c) => c.hp > 0).map(allyOf),
    );
  };

  const fight = () => {
    if (!character || !here || character.currentHp <= 0) return;
    // Those who never noticed the party lose the first round; any other fight raises the alarm
    autoFought.current = here.id;
    const surprise = alert === ALERT.unaware;
    // (Enemies are not the law's concern: fighting them is no crime; see "The law in person")
    if (!surprise && here.alert !== ALERT.attacking) setWatch(ALERT.attacking);
    // In the open of a district (its street, a roof, a catwalk) the fight is on the district's own
    // map: the street, the buildings as blocks, the roofs and catwalks as raised floors, and
    // everyone who can see the party, the sentries on the roofs and catwalks as well
    const inTheOpen = here.kind === "building" || openAir(here);
    const field = world && inTheOpen && districtHere ? districtArena(world, districtHere.id) : undefined;
    if (field && world) {
      const front = here.kind === "building" ? districtFront(world, here.id) : undefined;
      const spot = usePartySpot.getState();
      const level = here.layout?.level ?? 0;
      const start = spot.areaId === here.id ? { x: spot.x, y: spot.y, z: level } : front ? { x: front.x, y: front.y, z: 0 } : { x: Math.floor(field.width / 2), y: Math.floor(field.height / 2), z: 0 };
      const sources = [here as Area, ...exposedRooms(world, here.id)].filter((a) => watchersOf(a).length);
      const occupied = new Set<string>([`${start.x},${start.y},${start.z}`]);
      const enemies = sources.flatMap((src) =>
        watchersOf(src).flatMap((o) => {
          const lay = src.layout;
          const z = lay?.level ?? 0;
          const posts = (lay?.assets ?? []).filter((a) => a.kind === "npc" && a.ref === o.id);
          return Array.from({ length: o.count }, (_, i) => {
            const a = posts[i];
            // Where it stands on the plan; a creature outside a building, near the way in
            let at = a && lay ? { x: lay.x + a.x, y: lay.y + a.y, z } : front ? { x: front.x + front.outward.x * 4, y: front.y + front.outward.y * 4 + i, z: 0 } : { x: start.x + 4 + i, y: start.y, z: 0 };
            while (occupied.has(`${at.x},${at.y},${at.z}`)) at = { ...at, x: at.x + 1 };
            occupied.add(`${at.x},${at.y},${at.z}`);
            return { ...foe(o, `${o.id}-${i}`, o.count > 1 ? `${o.name} ${i + 1}` : o.name), ...at };
          });
        }),
      );
      const twins = (name: string) => enemies.filter((e) => e.name === name);
      for (const enemy of [...enemies]) {
        const same = twins(enemy.name);
        if (same.length > 1) same.forEach((e, i) => (e.name = `${e.name} ${String.fromCharCode(65 + i)}`));
      }
      fightArea.current = here.id;
      fightAreas.current = sources.map((a) => a.id);
      lastSavedHp.current = character.currentHp;
      lastSavedPoints.current = character.currentForcePoints;
      lastSavedUses.current = JSON.stringify(play.featureUses ?? {});
      fightBegun.current = true;
      initiateCombat(
        fighterNow(), enemies, combatKit(), surprise,
        { width: field.width, height: field.height, assets: field.assets, platforms: field.platforms, links: field.links, district: field.district, open: true, floor: world.areas[here.parentId ?? ""]?.type },
        start,
        party.filter((c) => c.hp > 0).map(allyOf),
      );
      return;
    }
    // A room with a gallery over part of it: the gallery is a raised floor of the same fight, with
    // whoever stands on it, and the stairs are the way up
    const tiers = world && !inTheOpen && here.layout ? levelsArena(world, here.id) : undefined;
    if (tiers && world && tiers.host.layout) {
      const base = tiers.host.layout;
      const spot = usePartySpot.getState();
      const onGallery = here.id === tiers.gallery.id;
      const z = onGallery ? (tiers.gallery.layout!.level ?? 0) - (base.level ?? 0) : 0;
      const stood = spot.areaId === here.id ? { x: spot.x - base.x, y: spot.y - base.y } : undefined;
      const ways = base.assets.filter((a) => a.side && a.kind !== "window");
      const doorway = ways.find((a) => a.to === cameFrom) ?? ways.find((a) => a.kind === "exit") ?? ways[0];
      const start = stood ? { ...stood, z } : doorway ? { x: doorway.x, y: doorway.y, z: 0 } : { x: 1, y: 1, z: 0 };
      const sources = [tiers.host, tiers.gallery].filter((a) => watchersOf(a).length);
      const occupied = new Set<string>([`${start.x},${start.y},${start.z}`]);
      const enemies = sources.flatMap((src) => {
        const lay = src.layout!;
        const zz = (lay.level ?? 0) - (base.level ?? 0);
        return watchersOf(src).flatMap((o) => {
          const posts = lay.assets.filter((a) => a.kind === "npc" && a.ref === o.id);
          return Array.from({ length: o.count }, (_, i) => {
            const a = posts[i];
            let at = a ? { x: lay.x - base.x + a.x, y: lay.y - base.y + a.y, z: zz } : { x: base.width - 2, y: Math.floor(base.height / 2) + i, z: 0 };
            while (occupied.has(`${at.x},${at.y},${at.z}`)) at = { ...at, x: at.x - 1 };
            occupied.add(`${at.x},${at.y},${at.z}`);
            return { ...foe(o, `${o.id}-${i}`, o.count > 1 ? `${o.name} ${i + 1}` : o.name), ...at };
          });
        });
      });
      const twins = (name: string) => enemies.filter((e) => e.name === name);
      for (const enemy of [...enemies]) {
        const same = twins(enemy.name);
        if (same.length > 1) same.forEach((e, i) => (e.name = `${e.name} ${String.fromCharCode(65 + i)}`));
      }
      fightArea.current = here.id;
      fightAreas.current = sources.map((a) => a.id);
      lastSavedHp.current = character.currentHp;
      lastSavedPoints.current = character.currentForcePoints;
      lastSavedUses.current = JSON.stringify(play.featureUses ?? {});
      fightBegun.current = true;
      initiateCombat(
        fighterNow(), enemies, combatKit(), surprise,
        {
          width: base.width,
          height: base.height,
          assets: [...base.assets.filter((a) => a.kind !== "npc" && (a.kind !== "secret" || tiers.host.secretEntry?.found) && (a.kind !== "loot" || tiers.host.loot.some((c) => c.id === a.ref && !c.hidden)) && a.name !== "Loose flagstone"), ...tiers.assets],
          platforms: tiers.platforms,
          links: tiers.links,
          floor: world.areas[tiers.host.parentId ?? ""]?.type,
        },
        start,
        party.filter((c) => c.hp > 0).map(allyOf),
      );
      return;
    }
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
    fightAreas.current = [here.id];
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
    lastSavedUses.current = JSON.stringify(play.featureUses ?? {});
    fightBegun.current = true;
    initiateCombat(
      fighterNow(), enemies, combatKit(), surprise,
      {
        width: ground.width,
        height: ground.height,
        assets: ground.assets.filter((a) => a.kind !== "npc" && a.name !== "Loose flagstone" && (a.kind !== "secret" || here.secretEntry?.found) && (a.kind !== "loot" || here.loot.some((c) => c.id === a.ref && !c.hidden))),
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

  // The search walks the district (see advanceSearch in shared logic): its squads move a room every
  // couple of minutes, question the people they pass, and where one walks in on the party it rolls to
  // stay hidden. Found, the squad stands there hostile and the fight begins by itself.
  const searching = useRef(false);
  useEffect(() => {
    if (!world || !here || !pursuit?.pursuit.squads?.length || inCombat || dead || searching.current || !character || character.currentHp <= 0) return;
    searching.current = true;
    const jammed = (character.playState?.jammerUntil ?? 0) > clockNow();
    const run = async () => {
      let current: World = world;
      for (let i = 0; i < 20; i++) {
        const step = advanceSearch(current, clockNow(), { area: here.id, jammed });
        if (step.world !== current) {
          current = step.world;
          saveCampaign({ galaxyMap: current });
        }
        if (!step.sighted) break;
        const { squad, area, dc } = step.sighted;
        const check = stealthRoll();
        if (check.total >= dc) {
          toast.success(`${squad.count} ${squad.heavy ? "troopers" : "constables"} walk in (Stealth ${check.total} against ${dc}): you keep out of their sight.`);
          continue;
        }
        const block = await lawBlock(squad.heavy || pursuit.pursuit.cartel ? "trooper" : "officer-junior");
        if (!block) break;
        toast.error(`${squad.count} ${squad.heavy ? "troopers" : "constables"} spot you (Stealth ${check.total} against ${dc}): they close in.`);
        current = engageOfficers(retireSquad(current, squad.id), area, block, clockNow(), squad.count);
        saveCampaign({ galaxyMap: current });
        break;
      }
    };
    run().finally(() => {
      searching.current = false;
    });
  }, [clockMinutes, here?.id, pursuit?.pursuit.squads?.length, inCombat, !!character]);

  // How a fight ended, whichever way it did. The fallen leave the area and their gear stays
  // behind; those still standing keep the hit points they have, so that leaving, being knocked
  // out or dying does not give the enemy their strength back. Won: the room is clear. Stable: the
  // character comes to hours later with 1 hit point, back where they came from. Dead: dead.
  const outcome = useCombat((state) => state.outcome);
  useEffect(() => {
    if (inCombat || !outcome || !character || !fightBegun.current) return;
    fightBegun.current = false;
    // The first attack's advantage from a rest aboard is spent with the fight
    if (play.firstAttack) setTimeout(() => patchPlay({ firstAttack: undefined }), 1500);
    // The rounds fired are gone from the pack; the weapon keeps its load
    {
      const fighters = useCombat.getState();
      const me = fighters.combatants.find((c) => c.isPlayer);
      settleAmmo(me?.ammo ? { weapon: me.ammo.weapon, left: me.ammo.left, round: me.ammo.round, spent: me.spentAmmo ?? {} } : fighters.ammoAfter);
    }
    // Mines not set off are picked up again (house rule), the paired ones still paired
    {
      const left = useCombat.getState().mines;
      if (left.length) {
        setTimeout(() => {
          const current = queryClient.getQueryData<any>(["game-character", gameCharacterId]);
          if (!current) return;
          saveCharacter({
            equipment: [...((current.equipment ?? []) as string[]), ...left.map((m) => m.label)],
            playState: { ...(current.playState ?? {}), paired: [...(current.playState?.paired ?? []), ...left.filter((m) => m.paired).map((m) => m.label)] },
          });
          toast.info(`You pick up the ${left.map((m) => m.label.toLowerCase()).join(" and ")} that did not go off.`);
        }, 3000);
        useCombat.setState({ mines: [] });
      }
    }
    const areaId = fightArea.current;
    const areaIds = fightAreas.current.length ? [...fightAreas.current] : areaId ? [areaId] : [];
    fightArea.current = null;
    fightAreas.current = [];
    let slain = 0;
    let xp = 0;
    let fallenKind = false;
    const fightNow = useCombat.getState();
    // A gang fought in an alley: those struck down are worth their experience; their boss's purse is the party's, and the
    // alley is open again. Left alone (the fight left), the gang is still there; left for dead, the gang takes its toll.
    const gang = gangFight.current;
    gangFight.current = null;
    if (gang?.gang) {
      const down = fightNow.combatants.filter((c) => c.gang === gang.id && c.hp <= 0 && !c.fled);
      xp += down.reduce((sum, c) => sum + (gang.gang!.find((o) => o.id === String(c.id))?.xp ?? 0), 0);
      const current = latestWorld();
      if (outcome === "victory" && current) {
        saveCharacter({ credits: (character.credits ?? 0) + gangPurse(level) });
        saveCampaign({ galaxyMap: closeEncounter(current) });
        toast.success(`The gang is broken. The boss's purse is yours: ${gangPurse(level)} credits.`);
      } else if (outcome === "stable" && current) {
        saveCharacter({ credits: Math.max(0, (character.credits ?? 0) - tollOf(character.credits ?? 0)) });
        saveCampaign({ galaxyMap: closeEncounter(current) });
      }
    }
    if (areaId && world?.areas[areaId]) {
      const area = world.areas[areaId];
      const fight = useCombat.getState();
      const remaining = fight.combatants.length ? fight.combatants.filter((c) => !onPartySide(c)).map((c) => ({ id: c.id, hp: c.hp })) : fight.remains;
      // Each area whose hostiles joined the fight is written back (the street's and the roofs')
      let galaxyMap: World = world;
      for (const id of areaIds) {
        const part = galaxyMap.areas[id];
        if (!part) continue;
        const { occupants, gear, remains, kept, slain: down, xp: earned, people, changed } = afterFight(part, remaining);
        slain += down;
        xp += earned;
        fallenKind ||= people;
        if (!changed) continue;
        const carcasses = remains.map((r, i) => makeRemains(`n-${Date.now().toString(36)}-${id}-${i}`, r.name, r.cr, r.count));
        const loot = [...(gear.length ? [...part.loot, { id: `l-${Date.now().toString(36)}-${id}`, name: "Gear of the fallen", kind: "remains", credits: 0, items: gear }] : part.loot), ...carcasses];
        // Their places on the plan: one for each still standing
        const layout = part.layout && {
          ...part.layout,
          assets: part.layout.assets.filter((a) => {
            if (a.kind !== "npc" || !kept.has(a.ref ?? "")) return true;
            const left = kept.get(a.ref!)!;
            kept.set(a.ref!, left - 1);
            return left > 0;
          }),
        };
        const placed = layout && carcasses.reduce((l, c) => withCacheAsset({ id, layout: l }, c) ?? l, layout);
        galaxyMap = updateArea(galaxyMap, id, { occupants, loot, ...(placed ? { layout: placed } : {}) }).world;
      }
      // Furniture a power moved in the fight stays where it was put
      for (const id of areaIds) {
        const part = galaxyMap.areas[id];
        if (!part?.layout) continue;
        const moves: Record<string, { x: number; y: number }> = {};
        for (const a of fightNow.arena.assets) {
          const was = part.layout.assets.find((x) => x.id === a.id);
          if (was?.kind === "furniture" && (was.x !== a.x || was.y !== a.y)) moves[a.id] = { x: a.x, y: a.y };
        }
        if (Object.keys(moves).length) galaxyMap = moveRoomAssets(galaxyMap, id, moves);
      }
      if (galaxyMap !== world) saveCampaign({ galaxyMap });
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
    // Rare ingredients (Crafting): a creature of a rarity's Challenge Rating, one time in three, leaves one
    if (areaId && world?.areas[areaId] && outcome === "victory") {
      const rare = { ...dtState.rare };
      let found = false;
      for (const o of world.areas[areaId].occupants) {
        if (o.disposition !== "hostile" || !o.cr) continue;
        const rarity = ingredientRarity(crOf(o));
        if (!rarity || Math.random() > 1 / 3) continue;
        rare[rarity] = (rare[rarity] ?? 0) + 1;
        found = true;
      }
      if (found) {
        setTimeout(() => saveCharacter({ playState: { ...((character.playState as any) ?? {}), downtime: { ...dtState, rare } } }), 120);
        toast.info("A rare ingredient is taken from what was fought (for crafting enhanced items).");
      }
    }
    // What was used up: prepared dice and poison
    const spent = fightNow.spent;
    const state: PlayState = { ...play };
    const me = fightNow.combatants.find((c) => c.isPlayer);
    if (me?.uses) {
      const focusMax = getClassLevelValue(character.class, level, "Focus Points");
      state.featureUses = { ...me.uses, ...(focusMax ? { focus: focusMax - (me.focus ?? focusMax) } : {}) };
    }
    if (spent.length) {
      if (play.boon && spent.includes(play.boon.kind as any)) state.boon = undefined;
      if (spent.includes("poison")) state.poison = undefined;
    }
    if (party.length || spent.length || me?.uses) saveCharacter({ playState: state, ...(party.length ? { companionData: { ...(character.companionData ?? {}), party: survivors } } : {}) });
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
  // The user's other characters, who can be brought along as companions
  const { data: roster = [] } = useQuery<any[]>({
    queryKey: ["characters-roster"],
    queryFn: async () => (await fetch("/api/characters")).json(),
    staleTime: 60000,
  });
  const { data: monsterNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["monster-names"],
    queryFn: async () => (await fetch("/api/sw5e/monsters?fields=id,name")).json(),
    staleTime: Infinity,
  });
  // The droid stat blocks of the rules data: what a droid dealer has to sell, by experience points
  const { data: droidStats = [] } = useQuery<DroidStat[]>({
    queryKey: ["droid-stats"],
    queryFn: async () => {
      const rows: any[] = await (await fetch("/api/sw5e/monsters?fields=id,name,types,experiencePoints,challengeRating,hitPoints,size")).json();
      return rows.filter((m) => /droid/i.test(String(m.types)) && !/swarm/i.test(String(m.types))).map((m) => ({ id: m.id, name: m.name, experiencePoints: Number(m.experiencePoints) || 0, challengeRating: m.challengeRating, hitPoints: m.hitPoints, size: m.size }));
    },
    staleTime: Infinity,
  });
  // The beast stat blocks, for the test menu's list of beasts to give (a test copy only; the live build never asks)
  const { data: beastStats = [] } = useQuery<{ id: string; name: string; challengeRating?: string }[]>({
    queryKey: ["beast-stats"],
    enabled: TEST_MENU,
    queryFn: async () => {
      const rows: any[] = await (await fetch("/api/sw5e/monsters?fields=id,name,types,challengeRating")).json();
      return rows.filter((m) => /beast/i.test(String(m.types)) && !/swarm/i.test(String(m.types))).map((m) => ({ id: m.id, name: m.name, challengeRating: m.challengeRating }));
    },
    staleTime: Infinity,
  });
  const today = dayOf(clock);
  const standing: Standing = campaign?.factionInfluence?.renown ? campaign.factionInfluence : emptyStanding();
  const ledger: Ledger = ledgerFor(campaign?.availableResources, today);
  const speciesFacts = getSpeciesById(character?.species ?? "");
  const dtState: DowntimeState = { ...emptyDowntime(), ...((character?.playState as any)?.downtime ?? {}) };
  const tradeSettlement = world && hereId ? [...trailOf(world, hereId)].reverse().find((a) => a.kind === "settlement")?.id : undefined;
  const customer: Customer = {
    species: speciesFacts?.name ?? character?.species,
    homeworld: (speciesFacts as any)?.homeworld,
    alignment: character?.alignment,
    standing,
    contacts: tradeSettlement
      ? {
          allied: dtState.contacts.filter((c) => c.kind === "allied" && c.where === tradeSettlement).length,
          hostile: dtState.contacts.filter((c) => c.kind === "hostile" && c.where === tradeSettlement).length + dtState.rivals.filter((r) => r.where === tradeSettlement).length,
        }
      : undefined,
  };
  const haggling = useMemo(() => (character ? hagglingEdge(characterFeatures(character)) : {}), [character?.species, character?.feats]);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  // A ticket agent's passage to one of the party's ships: whether the ship list is open
  const [shipPick, setShipPick] = useState(false);
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
  // The languages a translator carried or a vocoder mask worn gives (house rule: comms.ts)
  const translatedNow = (): string[] => ((character?.equipment ?? []) as string[]).filter((n) => translatorSlots(n) > 0 && (!/^vocoder/i.test(n) || (play.wearing ?? []).includes(n))).flatMap((n) => play.translators?.[n] ?? []);
  // Whether someone who speaks only their own people's tongue can be understood by the party
  const languageBarrierWith = (o: { species?: string }) => {
    const row = o.species ? speciesList.find((s) => s.name.toLowerCase() === o.species!.toLowerCase()) : undefined;
    const native = row?.languages.find((l) => OWN_TONGUE_ONLY.includes(l));
    return languageBarrier(native, (character?.languages ?? []) as string[], translatedNow());
  };
  const haggle = async (trader: Occupant, placeId: string) => {
    const attitude = attitudeOf(world!, trader, placeId, customer).score;
    const dc = haggleDC(trader, attitude);
    // No common language: disadvantage (cancelling an advantage), unless a translator or vocoder covers it
    const barrier = languageBarrierWith(trader);
    const twice = (haggling.advantage && !barrier) || (!haggling.advantage && barrier);
    const [first, second] = await rollOnTable("Haggling (Persuasion)", (twice ? ["d20", "d20"] : ["d20"]) as TableDie[]);
    const roll = haggling.advantage && !barrier ? Math.max(first, second) : !haggling.advantage && barrier ? Math.min(first, second) : first;
    const bonus = modifier(character.abilityScores?.charisma) + (haggling.expertise ? 2 * proficiency : skilled("persuasion") ? proficiency : 0);
    const won = roll + bonus >= dc;
    const how = [haggling.advantage && `advantage from ${haggling.advantage}`, haggling.expertise && `expertise from ${haggling.expertise}`, barrier && "no common language: a translator would help (house rule)"].filter(Boolean).join(", ");
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
  const restParty = (long: boolean, work: Awaited<ReturnType<typeof workTool>>): { party: Companion[]; notes: string[] } => {
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
  // Uses of features a rest gives back: a short rest those that come back on one (and the focus
  // points), a long rest all of them
  const restoredUses = (kind: "short" | "long"): Record<string, number> => {
    const used = { ...(play.featureUses ?? {}) };
    if (kind === "long") return {};
    for (const f of combatFeatures(character)) if (f.uses?.recharge === "short") delete used[f.pool];
    delete used.focus;
    return used;
  };
  const shortRest = async () => {
    if (!character || inCombat) return;
    const changes: Record<string, any> = {};
    const notes: string[] = [];
    if (klass?.casterType === "Tech" && character.currentForcePoints < character.maxForcePoints) {
      changes.currentForcePoints = character.maxForcePoints;
      notes.push("tech points restored");
    }
    const work = await workTool("short");
    let spentDie = false;
    if (hitDiceLeft > 0 && character.currentHp < character.maxHp) {
      const healed = Math.max(0, rollDamage(`1d${hitDie}`, false) + modifier(character.abilityScores?.constitution)) + (work?.mealHp ?? 0);
      changes.currentHp = lastSavedHp.current = Math.min(character.maxHp, character.currentHp + healed);
      changes.hitDiceUsed = (character.hitDiceUsed ?? 0) + 1;
      spentDie = true;
      notes.push(`a Hit Die (d${hitDie}) restores ${healed} hit points`);
    }
    // Resting clears what was prepared before, and a coat of poison dries
    let state: PlayState = { ...play, boon: undefined, poison: undefined, featureUses: restoredUses("short") };
    if (work) {
      if (work.boon) state.boon = work.boon;
      if (work.food) Object.assign(changes, { equipment: consume(work.food).equipment });
      if (work.herbal && (character.conditions ?? []).some((c: string) => /poison|disease/i.test(c))) changes.conditions = (character.conditions ?? []).filter((c: string) => !/poison|disease/i.test(c));
      notes.push(work.note);
    }
    // Features that give points back at the end of a short rest (Force Recovery), each used once for its pool
    for (const f of combatFeatures(character)) {
      if (!f.onRest || (f.uses && (state.featureUses?.[f.pool] ?? 0) >= f.uses.max)) continue;
      const max = character.maxForcePoints ?? 0;
      const have = changes.currentForcePoints ?? character.currentForcePoints ?? 0;
      if (have >= max) continue;
      const amount = Math.max(1, (f.onRest.points.dice ? rollDamage(f.onRest.points.dice, false) : 0) + f.onRest.points.flat);
      changes.currentForcePoints = lastSavedPoints.current = Math.min(max, have + amount);
      state.featureUses = { ...(state.featureUses ?? {}), [f.pool]: (state.featureUses?.[f.pool] ?? 0) + 1 };
      notes.push(`${f.name}: ${changes.currentForcePoints - have} ${f.onRest.kind} points back`);
    }
    const healed = restParty(false, work);
    notes.push(...healed.notes);
    if (spentDie || Object.keys(changes).length || party.length || state.boon !== play.boon || play.poison || JSON.stringify(state.featureUses) !== JSON.stringify(play.featureUses ?? {})) {
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
    const work = await workTool("long");
    const state: PlayState = { ...play, boon: undefined, poison: undefined, featureUses: {} };
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
    // Sleeping in the wild (house rules; the books leave camping to the GM): without a bedroll, a tent or a shelter only a quarter of
    // the spent Hit Dice come back (as the book's Resting in Armor variant); on an ice world the night's cold calls for a DC 10
    // Constitution save or a level of exhaustion (the DMG's extreme cold, once a rest), unless a tent or shelter, a heat generator with a
    // cell to run it, or resistance to cold keeps it off (a blanket gives advantage)
    const camp = dayPlace().where === "wild";
    const gear = (pattern: RegExp) => ((character.equipment ?? []) as string[]).some((n) => pattern.test(n));
    const sheltered = gear(/^tent|^emergency shelter/i);
    const bedded = sheltered || gear(/^bedroll/i);
    const land = world && here ? trailOf(world, here.id).find((a) => a.kind === "planet")?.type : undefined;
    let coldLevel = 0;
    const campNotes: string[] = [];
    if (camp && !bedded) campNotes.push("Sleeping rough (no bedroll, tent or shelter): a quarter of the Hit Dice back (house rule)");
    if (camp && land === "ice" && !sheltered && !gear(/^heat generator/i) && !(play.wearing ?? []).some((n) => /diving suit/i.test(n))) {
      const twice = gear(/^blanket/i) || wearingNow.some((n) => /traveler/i.test(n));
      const [a, b] = await rollOnTable("The cold of the night (Constitution)", (twice ? ["d20", "d20"] : ["d20"]) as TableDie[]);
      const roll = twice ? Math.max(a, b) : a;
      const total = roll + modifier(character.abilityScores?.constitution);
      if (total < 10) {
        coldLevel = 1;
        campNotes.push(`The cold of the night: Constitution ${total} against DC 10, a level of exhaustion`);
      } else campNotes.push(`The cold of the night: Constitution ${total} against DC 10, you keep warm`);
    }
    // Aboard the party's ship, its suites give the rest more (Starships of the Galaxy, suite systems; see shipyard.ts SuiteRest)
    const suites = aboardShip ? (aboardShip.mods ?? []).map((m) => shipModNamed(m.name)).filter(Boolean).map((row) => ({ name: row!.name, rest: shipModEffects(row!).rest })).filter((x) => x.rest) : [];
    const allDice = suites.some((x) => x.rest!.hitDice === "all");
    const moreDice = suites.reduce((n, x) => n + (typeof x.rest!.hitDice === "number" ? x.rest!.hitDice : 0), 0);
    const lessTired = Math.max(1, ...suites.map((x) => x.rest!.exhaustion ?? (x.rest!.biobed ? 4 : 1)));
    if (suites.some((x) => x.rest!.firstAttack)) state.firstAttack = true;
    const firstCheck = suites.map((x) => x.rest!.firstCheck).filter(Boolean) as (string[] | "any")[];
    if (firstCheck.length) state.firstCheck = firstCheck.includes("any") ? "any" : [...new Set(firstCheck.flat() as string[])];
    const forceUser = (character.forcePowers ?? []).length > 0;
    const topLevel = Math.max(0, ...knownPowers.map((p: any) => Number(p.level) || 0));
    const tempPoints = suites.some((x) => (forceUser ? x.rest!.tempForce : x.rest!.tempTech)) && knownPowers.length
      ? Math.max(1, topLevel + (forceUser ? Math.max(modifier(character.abilityScores?.wisdom), modifier(character.abilityScores?.charisma)) : modifier(character.abilityScores?.intelligence)))
      : 0;
    const roughDice = camp && !bedded ? Math.max(1, Math.floor(level / 4)) : regained;
    // Exhaustion from hunger and thirst stays until the character has eaten and drunk (the book)
    const floorTired = Math.max(0, play.supplies?.lack ?? 0);
    await saveCharacter({
      currentHp: character.maxHp,
      currentForcePoints: character.maxForcePoints + tempPoints,
      hitDiceUsed: allDice ? 0 : Math.max(0, (character.hitDiceUsed ?? 0) - roughDice - moreDice),
      ...((character.exhaustionLevel ?? 0) > 0 || coldLevel ? { exhaustionLevel: Math.max(floorTired, Math.min(floorTired > 0 ? character.exhaustionLevel ?? 0 : 6, (character.exhaustionLevel ?? 0) - lessTired + coldLevel)) } : {}),
      playState: state,
      ...(party.length ? { companionData: { ...(character.companionData ?? {}), party: healed.party } } : {}),
      ...extra,
    });
    saveCampaign({ ...pass(8 * 60), ...(world && Object.values(world.areas).some((a) => a.alarm) ? { galaxyMap: clearAlarms(world) } : {}) });
    toast.info(`Long rest (8 hours): hit points and power points restored, ${allDice ? "all" : roughDice + moreDice} Hit Dice regained.${work?.note ? ` ${work.note}.` : ""}${party.length ? " Your companions are back to full." : ""} Alarms have died down.${suites.length ? ` Aboard: ${suites.map((x) => x.name).join(", ")}${tempPoints ? ` (${tempPoints} temporary points)` : ""}.` : ""}${campNotes.length ? ` ${campNotes.join(". ")}.` : ""}${floorTired ? " Hunger and thirst keep their exhaustion until you eat and drink." : ""}`);
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
  // A graded piece of adventuring gear (binders, a camtono, a jetpack "(Fine)") is its plain item with the grade's text, so that all that reads
  // an item's rules (accessories, containers, suits, weight, the law's search) reads it the same
  const gradedAsPlain = (name: string) => {
    const f = itemFacts?.[name.toLowerCase()];
    if (f?.type !== "AdventuringGear" || !f.use) return undefined;
    const base = equipmentData.find((e) => e.name.toLowerCase() === baseNameOf(name).toLowerCase());
    return base ? { ...base, name, description: f.text } : undefined;
  };
  const factsOf = (name: string) => equipmentData.find((e) => e.name === name) ?? gradedAsPlain(name);
  // What an item does: a plain item's from its description; an enhanced consumable's as the plain item it is a grade of
  const gearOf = (name: string): GearUse | undefined => itemFacts?.[name.toLowerCase()]?.use ?? (factsOf(name) ? gearUse({ name, equipmentCategory: factsOf(name)?.equipmentCategory, description: factsOf(name)?.description }) : undefined);
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
  const healFor = (who: "self" | Companion, max = false, dice = 1) => {
    const sides = who === "self" ? hitDieOfCharacter : hitDieOfSize(who.size);
    const bonus = who === "self" ? modifier(character.abilityScores?.constitution) : who.saves?.constitution ?? 0;
    // An enhanced medpac or repair kit rolls more dice (its text: "rolls four dice equal to the size of their Hit Die")
    let rolled = 0;
    for (let i = 0; i < Math.max(1, dice); i++) rolled += max ? sides : die(sides);
    return Math.max(1, rolled + bonus);
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
      const amount = healFor(companion ?? "self", maxed, use.dice ?? 1);
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
    } else if (use.kind === "vitapac") {
      // A vitapac: spent Hit Dice back (an enhanced consumable's text)
      if (companion) return speed("A vitapac gives back Hit Dice: the character's own.");
      if (!(character.hitDiceUsed ?? 0)) return speed("You have spent no Hit Dice.");
      saveCharacter({ ...changes, hitDiceUsed: Math.max(0, (character.hitDiceUsed ?? 0) - use.hitDice), playState: state });
      note = `${Math.min(use.hitDice, character.hitDiceUsed ?? 0)} Hit Dice back`;
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
    const kitUses = "uses" in use ? use.uses : undefined;
    const left = kitUses && kitUses > 1 ? (spent.equipment.filter((n) => n === name).length < (character.equipment ?? []).filter((n: string) => n === name).length ? 0 : kitUses - (spent.charges[name] ?? 0)) : undefined;
    toast.success(`${name}${left !== undefined ? ` (${left} uses left in this kit)` : ""}: ${note}.`);
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
    // A graded spice's die and hours (its text: "an additional d12 ... For the next hour ... a low that lasts 8 hours")
    const graded = (use.lowMinutes ?? 10) * (addiction >= 3 ? 4 : addiction >= 1 ? 2 : 1) + carriedLow;
    const high = { name, ability: use.ability, pool: use.pool, phase: "high" as const, ends: now + (use.highMinutes ?? 10), lowMinutes: use.lowMinutes ? graded : lowMinutes, boost, reduce, temp: use.temp, wisdomDc: use.wisdomDc, constitutionDc: use.constitutionDc, die: use.die ?? 3 };
    if (boost) {
      // Current and maximum tech or force points rise together
      changes.maxForcePoints = (character.maxForcePoints ?? 0) + boost;
      changes.currentForcePoints = (character.currentForcePoints ?? 0) + boost;
      lastSavedPoints.current = changes.currentForcePoints;
    }
    note += `a high${use.ability ? ` (+d${use.die ?? 3} on ${use.ability} checks, attacks and saves)` : ""}${boost ? ` (+${boost} points)` : ""}${use.temp ? ` (${use.temp} temporary hit points each turn in a fight)` : ""}, until your next check or fight`;
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
    return s.phase === "high" ? die(s.die ?? 3) : -die(s.die ?? 3);
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
  const toolsCarried: string[] = Array.from(new Set<string>((character?.equipment ?? []).filter((n: string) => ["Kit", "Tool", "GamingSet", "MusicalInstrument"].includes(factsOf(n)?.equipmentCategory ?? "") || kitAlias(n) !== n)));
  const setsCarried = toolsCarried.filter((n) => factsOf(n)?.equipmentCategory === "GamingSet");
  const instrumentsCarried = toolsCarried.filter((n) => factsOf(n)?.equipmentCategory === "MusicalInstrument");
  // A check with a tool: the ability (Intelligence unless said), with proficiency when trained with
  // the tool and advantage when also trained in a skill the tool is for (house rule: the book
  // leaves it to the GM, "consider allowing the character to make the check with advantage")
  const toolRoll = async (name: string, dc: number, what: string, ability = "intelligence", extra = 0): Promise<{ success: boolean; total: number; roll: number; bonus: number; cancelled?: boolean }> => {
    const info = toolInfo(name);
    const skills = (info?.skills ?? []).flatMap((x) => x.skill.map((y) => y.toLowerCase())).filter((y) => SKILLS.some((x) => x.name.toLowerCase() === y));
    cancelledCheck.current = false;
    const r = await askCheck({ what: `${what} (${name})`, dc, abilities: [ability], skills, tool: name, extra });
    if (!r) cancelledCheck.current = true;
    return r ?? { success: false, total: 0, roll: 0, bonus: 0, cancelled: true };
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
  const workTool = async (rest: "short" | "long") => {
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
    const check = await toolRoll(restTool, 15, `${boon.feature}`);
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
  const perform = async (instrument: string) => {
    if (!here || !world || inCombat || dead) return;
    const audience = Math.min(12, (hereNow ?? here).occupants.filter((o) => o.disposition !== "hostile" && !o.disabled && !o.captive).reduce((n, o) => n + (o.count ?? 1), 0));
    if (hostiles.length) return speed("Not with armed enemies in the room.");
    if (!audience) return speed("There is nobody here to play to.");
    const dc = /cantina|bar|booth/i.test(here.name) ? 12 : 15;
    const trained = trainedWith(instrument);
    // The d20, and the tool's prepared die on the check when it has one, are thrown on the table
    const tuning = play.boon?.kind === "check" ? play.boon.die || 2 : 0;
    const [roll, tunedRoll] = await rollOnTable("Play for the room (Performance)", (tuning ? ["d20", `d${tuning}`] : ["d20"]) as TableDie[]);
    const tuned = tuning ? tunedRoll : 0;
    const bonus = modifier(character.abilityScores?.charisma) + (skilled("performance") ? proficiency : 0) + (trained ? proficiency : 0) + tuned + substanceFor("charisma");
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
    if (world && here) saveCampaign({ galaxyMap: updateArea(world, here.id, { occupants: [...here.occupants, { id: newId("o"), name: c.name, role: c.kind === "hireling" ? c.role : c.kind === "droid" ? "utility droid" : c.kind === "beast" ? "wildlife" : "local", disposition: "neutral", count: 1, species: c.species, statBlock: c.statBlock, cr: c.cr, xp: c.xp, armorClass: c.armorClass, hitPoints: c.maxHp, attack: c.attack, profile: c.profile, speed: c.speed, size: c.size, creature: c.creature, saves: c.saves, loadout: c.loadout, wounds: c.hp < c.maxHp ? [c.hp] : undefined }] }).world });
    toast.info(`${c.name} stays behind.`);
  };

  // Another of the user's characters, brought along as a companion: they fight as they are on
  // their sheet (armor class, hit points and their best weapon) and do not level or rest apart
  // (house rule); the sheet itself is left as it was
  const recruitCharacter = (other: any) => {
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    const weapons = carriedWeapons(other).sort((a, b) => Number(!!a.natural) - Number(!!b.natural) || b.attackBonus - a.attackBonus);
    const best = weapons.find((w) => !w.natural) ?? weapons[0];
    const companion: Companion = {
      id: newId("c"),
      name: other.name,
      kind: "character",
      species: other.species,
      role: other.class,
      size: "Medium",
      creature: "humanoid",
      armorClass: other.armorClass ?? 10,
      maxHp: other.maxHp,
      hp: (other.currentHp ?? 0) > 0 ? Math.min(other.maxHp, other.currentHp) : other.maxHp,
      attack: best ? { name: best.name, bonus: best.attackBonus, damage: `${best.dice}${best.damageBonus ? (best.damageBonus > 0 ? "+" : "") + best.damageBonus : ""}`, damageType: best.damageType, ranged: best.ranged, range: best.range?.[0] ?? best.reach, long: best.range?.[1] } : { name: "Unarmed strike", bonus: 2, damage: "1d4", ranged: false, range: 5 },
      speed: Number(other.speed) || 30,
      saves: Object.fromEntries(Object.entries(other.abilityScores ?? {}).map(([a, v]) => [a, modifier(Number(v))])),
      loadout: [],
      wage: 0,
      joined: clockNow(),
      how: "a character of yours",
    };
    saveParty([...party, companion]);
    toast.success(`${other.name} joins you (${companion.attack?.name}, AC ${companion.armorClass}, ${companion.hp}/${companion.maxHp} hit points).`);
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

  // Food and water as the days pass (Player's Handbook, Food and Water; lifestyle expenses): where the party is decides how it is fed
  const WILD_TYPES = ["cave system", "ruins", "crash site", "raider camp", "sewer system"];
  const dayPlace = () => {
    const settlement = world && here ? trailOf(world, here.id).find((a) => a.kind === "settlement") : undefined;
    const planet = world && here ? trailOf(world, here.id).find((a) => a.kind === "planet") : undefined;
    const land = planet?.type ?? "";
    const capacity = ((character?.equipment ?? []) as string[]).reduce((n, name) => n + (factsOf(name)?.equipmentCategory === "Storage" ? liquidOf({ name, description: factsOf(name)?.description }) : 0), 0);
    const where: "settlement" | "ship" | "wild" = aboardShip ? (settlement && hasPort(world!, settlement.id) ? "settlement" : "ship") : settlement && !WILD_TYPES.includes(settlement.type) ? "settlement" : "wild";
    const survival = modifier(character?.abilityScores?.wisdom) + (skilled("survival") ? proficiency : 0);
    return { where, hot: HOT_LANDS.includes(land), capacity, conMod: modifier(character?.abilityScores?.constitution), survival, forageDc: planet ? FORAGE_DC[land] ?? 15 : 99, garden: !!aboardShip?.mods?.some((m) => /hydroponics/i.test(m.name)) };
  };
  const supplies: Supplies = play.supplies ?? { day: today, hungry: 0, water: 0, lack: 0, lifestyle: "Modest" };
  useEffect(() => {
    if (!character || !world || inCombat || dead) return;
    if (!play.supplies) return void patchPlay({ supplies: { ...supplies, water: dayPlace().capacity } });
    if (today <= supplies.day) return;
    const place = dayPlace();
    const rations = ((character.equipment ?? []) as string[]).filter((n) => !!foodOf({ name: n, description: factsOf(n)?.description }));
    const r = passDays(supplies, today, place, character.credits ?? 0, rations, Math.random);
    const equipment = [...((character.equipment ?? []) as string[])];
    for (const n of r.eaten) equipment.splice(equipment.indexOf(n), 1);
    const exhausted = Math.min(6, (character.exhaustionLevel ?? 0) + r.exhaustion);
    saveCharacter({
      credits: (character.credits ?? 0) - r.cost,
      ...(r.eaten.length ? { equipment } : {}),
      ...(r.exhaustion ? { exhaustionLevel: exhausted, ...(exhausted >= 6 ? { conditions: Array.from(new Set([...(character.conditions ?? []), "Dead"])) } : {}) } : {}),
      playState: { ...((queryClient.getQueryData<any>(["game-character", gameCharacterId])?.playState ?? play) as PlayState), supplies: r.supplies },
    });
    const days = today - supplies.day;
    const said = [
      r.cost ? `${r.supplies.lifestyle ?? "Modest"} lifestyle: ${r.cost} credits for ${days} day${days > 1 ? "s" : ""}` : "",
      r.eaten.length ? `${r.eaten.length} day${r.eaten.length > 1 ? "s'" : "'s"} rations eaten` : "",
      ...r.notes.slice(-3),
      exhausted >= 6 ? "Six levels of exhaustion: death (the book)." : r.exhaustion ? `Exhaustion ${exhausted}.` : "",
    ].filter(Boolean).join(" ");
    if (said) (r.exhaustion ? toast.warning : toast.info)(said);
  }, [today, inCombat, !!world, !!character]);

  // ---- The hazards of the place (2026-10-21; shared/logic hazardsAt, gear.ts exposure and HAZARD_HOUR): what the party wears, its
  // species and its lights answer them; an hour unprotected costs a save; air runs down while breathed; a place that kills is refused
  const speciesTraits: { name: string; description: string }[] = ((speciesFacts as any)?.traits ?? []) as any[];
  const wearingNow: string[] = (play.wearing ?? []).filter((n) => ((character?.equipment ?? []) as string[]).includes(n));
  const suitFacts = (n: string) => suitOf({ name: n, description: factsOf(n)?.description });
  const airCapacity = (n: string) => {
    const suit = suitFacts(n);
    if (suit?.air) return suit.air * 60;
    const a = airOf({ name: n, description: factsOf(n)?.description });
    return a && !a.refill ? a.hours * 60 : 0;
  };
  const breather = () => wearingNow.filter((n) => airCapacity(n) > 0).sort((a, b) => (play.air?.[b] ?? airCapacity(b)) - (play.air?.[a] ?? airCapacity(a)))[0];
  const running = (n: string) => (play.running?.[n] ?? 0) > clockNow();
  // Up the outside of a building and down again with climbing gear (shared/logic outsideClimbs): added to the ways from here (the
  // list is only read by the handlers and the panels below, which run after this)
  const climbGear = climbGearOf(((character?.equipment ?? []) as string[]).map((n) => ({ name: n, ...(factsOf(n) ?? {}) })), wearingNow, running);
  if (world && here) exits.push(...outsideClimbs(world, here.id, climbGear));
  // Hidden from the law's search (shared/logic lawSearch): a smugglepack's compartment carried, clandestine pockets worn; what is in
  // them (play.hidden, never more than is carried), and the room left
  const carriedNames = (character?.equipment ?? []) as string[];
  const hiding = hidingPlaces(carriedNames.map((n) => ({ name: n, ...(factsOf(n) ?? {}) })), wearingNow);
  const hiddenNow: Record<string, number> = Object.fromEntries(Object.entries(play.hidden ?? {}).map(([n, c]) => [n, Math.min(c, carriedNames.filter((x) => x === n).length)] as const).filter(([, c]) => c > 0));
  const pounds = (n: string) => weightOf(factsOf(n)?.weight);
  const hideRoom = hidingRoom(hiding, hiddenNow, pounds);
  const hide = (name: string, into: boolean) => {
    patchPlay({ hidden: { ...hiddenNow, [name]: Math.max(0, (hiddenNow[name] ?? 0) + (into ? 1 : -1)) } });
    toast.info(into ? `${name} hidden in your ${hiding.map((h) => h.item.toLowerCase()).join(" and ")} (found only with an Investigation check against DC ${Math.max(...hiding.map((h) => h.dc))}).` : `${name} taken out of hiding.`);
  };
  // Searched by the law at a customs post or checkpoint, or landing at a port where it is policed (house rule): contraband carried
  // openly is seized, what is hidden only if the searcher's Investigation finds it
  const searchParty = (areaId: string, why: string) => {
    const latest = latestWorld() ?? world;
    // (the character as it is now, after the trip was saved)
    const now = queryClient.getQueryData<any>(["game-character", gameCharacterId]) ?? character;
    if (!latest || !now) return;
    const law = lawAt(latest, areaId);
    const names = (now.equipment ?? []) as string[];
    const state = (now.playState ?? {}) as PlayState;
    const places = hidingPlaces(names.map((n) => ({ name: n, ...(factsOf(n) ?? {}) })), (state.wearing ?? []).filter((n) => names.includes(n)));
    const tucked: Record<string, number> = Object.fromEntries(Object.entries(state.hidden ?? {}).map(([n, c]) => [n, Math.min(c, names.filter((x) => x === n).length)] as const).filter(([, c]) => c > 0));
    const carried = names.map((n) => {
      const row = factsOf(n);
      // (a smugglepack or clandestine clothes look like any other: not seized for what they are)
      return { name: n, contraband: !!row && isContraband(row, law) && !places.some((p) => p.item === n) };
    });
    const result = lawSearch(carried, tucked, places, law, 1 + Math.floor(Math.random() * 20));
    const kept = places.length > 0 && Object.values(tucked).reduce((n, c) => n + c, 0) > 0;
    const note = kept ? ` The searcher's Investigation ${result.total} against your hiding place's DC ${result.dc}: ${result.found ? "found" : "it holds"}.` : "";
    if (!result.seized.length) return void toast.info(`${why}: the law searches you and finds nothing it seizes (house rule).${note}`);
    const equipment = [...names];
    const hidden = { ...tucked };
    for (const name of result.seized) {
      equipment.splice(equipment.indexOf(name), 1);
      if (result.found && hidden[name]) hidden[name]--;
    }
    saveCharacter({ equipment, playState: { ...state, hidden } });
    toast.error(`${why}: the law searches you and seizes ${result.seized.join(", ")} as contraband here (house rule).${note}`);
  };
  const protections = (): Protections => ({
    wearing: wearingNow,
    carried: (character?.equipment ?? []) as string[],
    resist: [...wearingNow.flatMap((n) => suitFacts(n)?.resist ?? []), ...speciesTraits.flatMap((t) => Array.from(String(t.description ?? "").matchAll(/resistance to (\w+) damage/gi)).map((m) => m[1].toLowerCase()))],
    darkvision: speciesTraits.some((t) => /^darkvision/i.test(t.name)),
    light: ((character?.equipment ?? []) as string[]).some((n) => /^glowrod/i.test(n) && running(n)) || (character ? carriedWeapons(character).some((w) => w.properties.some((p) => /^(luminous|bright)/i.test(p))) : false),
    generators: ((character?.equipment ?? []) as string[]).filter((n) => running(n)).map((n) => (/heat generator/i.test(n) ? "cold" : /gravity generator/i.test(n) ? "gravity" : "")).filter(Boolean) as EnvHazard[],
    water: supplies.water > 0,
    air: (() => { const b = breather(); return b ? play.air?.[b] ?? airCapacity(b) : 0; })(),
    gills: speciesTraits.some((t) => /breathe air and water|can breathe water|breathe underwater/i.test(String(t.description ?? ""))),
    suits: Object.fromEntries(wearingNow.map((n) => [n, suitFacts(n)?.protects ?? []])),
  });
  // ---- What the character carries (Player's Handbook, Lifting and Carrying; the Variant: Encumbrance on by default): the party's other
  // carriers take what they can (a hovercart 2,000 lb, a beast of burden its carrying capacity, a companion Strength x 15: house rule)
  const variantOn = play.encumbrance !== "basic";
  const otherCarriers = () => {
    let n = ((character?.equipment ?? []) as string[]).filter((x) => /^hovercart$/i.test(x)).length * (containerOf({ name: "Hovercart", description: factsOf("Hovercart")?.description })?.lb ?? 2000);
    for (const c of party) {
      if (c.mount) n += Number((transport?.mounts ?? []).find((m) => m.name.toLowerCase() === c.name.toLowerCase())?.capacity ?? 0) || 300;
      else if (c.kind !== "beast" && c.hp > 0) n += 150;
    }
    return n;
  };
  const loadNow = () => {
    const names = ((character?.equipment ?? []) as string[]).filter((n) => !/^hovercart$/i.test(n));
    const items = names.map((n) => {
      const f = factsOf(n);
      return { name: n, weight: f?.weight, containerLb: f?.equipmentCategory === "Storage" ? containerOf({ name: n, description: f?.description })?.lb : undefined };
    });
    const vest = names.some((n) => /tracker utility vest/i.test(n)) ? { items: 10, each: 1 } : undefined;
    return loadOf(items, { strength: Number(character?.abilityScores?.strength) || 10, size: (speciesFacts as any)?.size, variant: variantOn, others: otherCarriers(), freeItems: vest });
  };
  const hazardsHere = world && here ? hazardsAt(world, here.id, clockMinutes) : [];
  const exposures = hazardsHere.map((h) => ({ why: h.why, ...exposure(h.hazard, protections()) }));
  const deadlyAt = (areaId: string) => (world ? hazardsAt(world, areaId, clockNow()).map((h) => ({ why: h.why, ...exposure(h.hazard, protections()) })).find((e) => e.deadly && e.hazard !== "underwater") : undefined);
  useEffect(() => {
    if (!character || !world || !here || inCombat || dead) return;
    const now = clockMinutes;
    const live = exposures.filter((e) => !e.safe || e.breathing);
    const kinds = live.map((e) => e.hazard).join(",");
    const ex = play.exposure;
    if (!kinds) {
      if (ex) patchPlay({ exposure: undefined });
      return;
    }
    if (!ex || ex.areaId !== here.id || ex.kinds !== kinds) {
      patchPlay({ exposure: { areaId: here.id, kinds, since: now, last: now, hours: 0 } });
      const bad = live.filter((e) => !e.safe);
      if (bad.length) toast.warning(`${bad.map((e) => `${e.why}: ${HAZARD_HOUR[e.hazard].text}`).join(" ")}`);
      return;
    }
    const minutes = now - ex.last;
    if (minutes < 5) return;
    const changes: Record<string, any> = {};
    const air = { ...(play.air ?? {}) };
    // Breathing from a suit or respirator
    const b = breather();
    if (b && live.some((e) => e.breathing)) {
      const left = Math.max(0, (air[b] ?? airCapacity(b)) - minutes);
      air[b] = left;
      if (left <= 0) toast.error(`${b}: out of air. Get out, or refill it from an oxygen tank.`);
      else if (left <= 30 && (play.air?.[b] ?? airCapacity(b)) > 30) toast.warning(`${b}: ${left} minutes of air left.`);
    }
    // Under water with nothing to breathe: the breath runs out (Player's Handbook, Suffocating), then the character drops
    const drowning = live.find((e) => e.hazard === "underwater" && !e.safe);
    if (drowning) {
      const breath = breathRule(modifier(character.abilityScores?.constitution)).minutes;
      if (now - ex.since >= breath && character.currentHp > 0) {
        changes.currentHp = 0;
        toast.error(`You run out of breath under the water and go down (Player's Handbook, Suffocating): at 0 hit points, dying.`);
      } else if (!ex.hours && now - ex.since < breath) toast.warning(`Holding your breath: ${Math.max(0, Math.round(breath - (now - ex.since)))} minutes left.`);
    }
    // Each full hour unprotected: the hazard's save
    const hours = Math.floor((now - ex.since) / 60);
    let hp = changes.currentHp ?? character.currentHp;
    let tired = character.exhaustionLevel ?? 0;
    const conditions = new Set<string>(character.conditions ?? []);
    const notes: string[] = [];
    for (let h = ex.hours + 1; h <= hours; h++) {
      for (const e of live.filter((x) => !x.safe && x.hazard !== "underwater")) {
        const rule = HAZARD_HOUR[e.hazard];
        let failed = !rule.save;
        if (rule.save) {
          const armorHeavy = e.hazard === "heat" && /medium|heavy/i.test(String(equippedNow(character).body ? factsOf(equippedNow(character).body!)?.armorClassification ?? "" : ""));
          const a = d20();
          const roll = armorHeavy ? Math.min(a, d20()) : a;
          const save = roll + modifier(character.abilityScores?.[rule.save]) + ((character.savingThrowProficiencies ?? []).map((x: string) => x.toLowerCase()).includes(rule.save) ? proficiency : 0);
          const dc = (rule.dc ?? 10) + (e.hazard === "heat" ? h - 1 : 0);
          failed = save < dc;
          notes.push(`${e.why}, hour ${h}: ${rule.save.slice(0, 3)} save ${save} against DC ${dc}, ${failed ? "failed" : "made"}`);
        }
        if (!failed) continue;
        if (rule.exhaustion) tired = Math.min(6, tired + 1);
        if (rule.damage) {
          const resisted = protections().resist.includes(rule.type ?? "");
          const amount = Math.max(1, Math.floor(rollDamage(rule.damage, false) / (resisted ? 2 : 1)));
          hp = Math.max(1, hp - amount);
          notes.push(`${amount} ${rule.type}`);
        }
        if (rule.condition) conditions.add(rule.condition);
      }
    }
    if (hours > ex.hours) {
      if (hp !== character.currentHp) changes.currentHp = hp;
      if (tired !== (character.exhaustionLevel ?? 0)) changes.exhaustionLevel = tired;
      if (conditions.size !== (character.conditions ?? []).length) changes.conditions = [...conditions];
      if (notes.length) toast.warning(notes.join("; ") + ". (House rules where the books give none; the DMG's for cold and heat.)");
    }
    if (Object.keys(changes).length) saveCharacter(changes);
    patchPlay({ exposure: { ...ex, last: now, hours }, air });
  }, [clockMinutes, here?.id, inCombat]);

  // Freeing those held in bonds: the lock or the collar's circuit (Security kit, Slicer's kit),
  // or the strength to break chains (Binders: DC 20 Strength). Each try takes ten minutes.
  const freeCaptive = async (o: Occupant, how: "kit" | "break") => {
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
      result = await toolRoll(name, dc, spec.label, spec.ability.includes("dexterity") && modifier(character.abilityScores?.dexterity) > modifier(character.abilityScores?.intelligence) ? "dexterity" : "intelligence");
      // A spike rerolls a failed check
      if (!result.success && spike) {
        const spent = consume(spike);
        saveCharacter({ equipment: spent.equipment });
        toast.info(`${spike}: reroll.`);
        result = await toolRoll(name, dc, `${spec.label} (rerolled)`, "intelligence");
      }
    } else {
      const [face] = await rollOnTable("Break the chains (Strength)", ["d20"]);
      const roll = face + modifier(character.abilityScores?.strength) + substanceFor("strength");
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
  const mendDroid = async (o: Occupant, how: "battery" | "check" | "kit") => {
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
      const check = await toolRoll(toolsCarried.find((n) => /astrotech|mechanic|tinker/i.test(kitAlias(n))) ?? "Toolkit", 10, `Stabilize ${unit.name}`, "intelligence", 0);
      if (!check.success) return void saveCampaign(pass(10));
      hp = Math.max(1, hp);
    }
    saveCampaign({ galaxyMap: updateArea(world, area.id, { occupants: list.map((x) => (x.id === unit.id ? { ...x, wounds: [hp] } : x)) }).world, ...pass(how === "kit" ? 1 : 10) });
    if (Object.keys(changes).length) saveCharacter(changes);
  };
  // Strip a powered-down droid for parts (house rule): a check with a kit, 20 minutes; the droid is gone
  const stripDroid = async (o: Occupant) => {
    if (!world) return;
    const area = baseOf(o.id);
    if (!area) return;
    const tier = tierOfCr(crNumber(o.cr));
    const family = FAMILIES.salvage;
    const kit: string | undefined = harvestKit("salvage", tier, (character.equipment ?? []) as string[]);
    if (!kit && tier > 0) return void toast.error(`It takes ${family.kitNames} to strip this ${RARITY_TIERS[tier].toLowerCase()} droid. (House rule.)`);
    const dc = harvestDc(tier) + (kit ? 0 : 5);
    const r = await toolRoll(kit ?? "bare hands", dc, `Strip ${o.name} for parts`, "intelligence");
    if (r.cancelled) return;
    const time = pass(2 * HARVEST_MINUTES);
    if (!r.success) return void saveCampaign(time);
    const gained = harvestYield(r.total, dc, !!kit && trainedWith(kit)) + 1;
    const stock = materialsOf(character);
    const material = `salvage-${tier}`;
    stock[material] = (stock[material] ?? 0) + gained;
    saveCharacter({ playState: { ...(character.playState ?? {}), materials: stock } });
    const occupants = area.occupants.flatMap((x) => (x.id !== o.id ? [x] : x.count > 1 ? [{ ...x, count: x.count - 1, wounds: x.wounds?.slice(1) }] : []));
    let dropped = false;
    const layout = area.layout && { ...area.layout, assets: area.layout.assets.filter((a) => { if (!dropped && a.kind === "npc" && a.ref === o.id) { dropped = true; return false; } return true; }) };
    saveCampaign({ galaxyMap: updateArea(world, area.id, { occupants, ...(layout ? { layout } : {}) }).world, ...time });
    toast.success(`Stripped ${o.name}: ${gained} x ${MATERIALS[material].name}.`);
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
    // The droid keeps the hit points it has (one of a group leaves it)
    recruit({ ...o, wounds: [unitOf(o)] }, "droid", `under a ${boltName.toLowerCase()}`, { bolt: boltName }, { equipment: spent.equipment }, time);
  };
  const reprogramDroid = async (o: Occupant) => {
    if (!world) return;
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    if (unitOf(o) < 1) return toast.error("It has to be stabilized first.");
    const kit = toolsCarried.find((n) => /^slicer's kit$/i.test(n));
    if (!kit) return toast.error("You need a slicer's kit to rewrite its routines.");
    const dc = reprogramDC(o);
    const check = await toolRoll(kit, dc, `Reprogram ${o.name}`, "intelligence");
    const time = pass(10);
    if (check.success) return recruit({ ...o, wounds: [unitOf(o)] }, "droid", "reprogrammed", { bolt: "reprogrammed" }, {}, time);
    saveCampaign(time);
    if (check.total <= dc - 5) wakeHostile(o, `The reprogramming goes badly: ${o.name} comes online, hostile.`);
  };

  // Gentling a wild creature (house rule for the DC): Wisdom (Animal Handling); rations in hand
  // give advantage; it takes an hour; a failure by 5 or more is an attack
  const gentle = async (o: Occupant) => {
    if (!world || !here || inCombat) return;
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    if (crOf(o) > gentleLimit(level)) return toast.error(`${o.name} (CR ${o.cr}) is too fierce for a character of level ${level} to gentle (house rule: up to CR ${gentleLimit(level)}).`);
    const hurt = (o.wounds?.[0] ?? o.hitPoints ?? 0) < (o.hitPoints ?? 0);
    const dc = gentleDC(o, hurt);
    const food = (character.equipment ?? []).find((n: string) => /rations/i.test(n));
    const [first, second] = await rollOnTable("Gentle the beast (Animal Handling)", (food ? ["d20", "d20"] : ["d20"]) as TableDie[]);
    const roll = food ? Math.max(first, second) : first;
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
  // A route's length without the generator's old "(N h by speeder)", which the rides replace
  const travelText = (exit: Exit) => (kmOf(exit.travel) && !exit.needsShip ? exit.travel.replace(/\s*\([^)]*by speeder\)/i, "") : exit.travel);
  // The rides for a route: on foot, riding a companion, a speeder of the party's parked here, a hired ride
  const ridesFor = (exit: Exit): Ride[] => {
    const km = kmOf(exit.travel);
    if (!km || !transport || !world || !here || exit.needsShip || exit.via !== "path") return [];
    const settlement = world.areas[berthOf(world, here.id)];
    const riders = 1 + party.filter((c) => c.kind !== "beast").length;
    const rides = groundRides({ km, vehicles: parkedHere, companions: party, riders, transport, hire: settlement ? hasRidesForHire(world, settlement.id) : false, transit: exit.label === "Transit line" });
    // The party's own vehicle can be flown by its pilot, in 3D, for the route (house rule)
    for (const ride of rides.filter((r) => r.vehicleId && !r.blocked)) rides.push({ ...ride, id: `pilot-${ride.id}`, label: `Fly it yourself (${ride.label})`, pilot: true });
    // Lifts: someone going where the party is going offers a seat (they leave when they leave)
    if (settlement) {
      for (const lift of liftsBetween(world, settlement.id, exit.to, clockNow())) {
        rides.push({ id: lift.id, label: `A lift with ${lift.who} (${lift.vehicle}, leaves ${clockText(lift.departs)})`, minutes: lift.minutes, fare: lift.fare });
      }
    }
    // A blockade stops vehicles and hired rides until the search is called off (on foot is still open)
    if (blockadeAt(world, settlementOf(world, here.id), clockNow())) return rides.map((r) => (r.id === "foot" ? r : { ...r, blocked: "blockade: no vehicles until the search is called off" }));
    return rides;
  };
  // The ride a trip takes when none was chosen (a tap on the map): the quickest that costs nothing
  const defaultRide = (rides: Ride[]) => [...rides].filter((r) => !r.blocked && !r.fare && !r.pilot).sort((a, b) => a.minutes - b.minutes)[0];
  const rideText = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 6) / 10} h` : `${Math.floor(minutes / 1440)} d ${Math.round((minutes % 1440) / 60)} h`);

  // A speeder taken from a base, or mended where it stands (Mechanic's kit: "Restoring power to a
  // damaged vehicle", DC 15)
  // A ride that belongs to the settlement's people is not a prize: hotwiring it (Dexterity or
  // Intelligence against 12 + the law, a security or slicer's kit if trained) is theft. Seen by a
  // lawman, or botched, the law is called; done quietly, nobody knows.
  const stealVehicle = async (building: Area, vehicle: Vehicle) => {
    if (!world || !here) return;
    if (vehicle.status === "wrecked") return toast.error("It is a wreck: it needs mending first (a mechanic's kit).");
    if (!lawUnseen("Hotwiring it", "theft")) return;
    const kit = lockKit();
    const wired = await abilityCheck(`Hotwiring ${vehicle.name}`, 12 + lawAt(world, here.id), ["dexterity", "intelligence"], !!kit && trainedWith(kit));
    if (cancelledCheck.current) return;
    if (!wired) {
      toast.error("The alarm sounds: its owner will call the law.");
      return void saveCampaign({ galaxyMap: reportCrime(world, here.id, "theft", clockNow()) });
    }
    const mine: PartyVehicle = { ...vehicle, civil: undefined, owner: character.name, areaId: berthOf(world, here.id) };
    saveCampaign({
      galaxyMap: updateArea(world, building.id, { vehicles: (building.vehicles ?? []).filter((v) => v.id !== vehicle.id) }).world,
      vehicles: [...vehicles, mine],
    });
    toast.success(`${vehicle.name} is yours, and nobody saw.`);
  };
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
  const mendVehicle = async (building: Area | null, vehicle: Vehicle) => {
    if (!world) return;
    const kit = toolsCarried.find((n) => /^mechanic's kit$/i.test(kitAlias(n)));
    if (!kit) return toast.error("You need a mechanic's kit (or a hydrospanner).");
    const check = await toolRoll(kit, 15, `Restore power to ${vehicle.name}`, "intelligence");
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
    profile: c.profile,
    speed: c.speed || 30,
    reach: c.attack?.ranged ? 5 : c.attack?.range ?? 5,
    range: c.attack?.ranged ? ([c.attack.range ?? 80, c.attack.long ?? (c.attack.range ?? 80) * 4] as [number, number]) : undefined,
    size: c.size,
    creature: c.creature,
    species: c.species,
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
            const amount = healFor(ally ?? "self", maxed, "dice" in use ? use.dice ?? 1 : 1);
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
      } else if (use.kind === "explosive" && use.form === "mine") {
        // A mine: as an action, set where the character stands; arms at the start of their next turn (the book). Paired with the
        // remote detonator beforehand (a minute, from the detonator's card), it goes off only to it.
        const paired = (play.paired ?? []).includes(name);
        out.push({
          key: name,
          label: `${label}${paired ? " (paired)" : ""}`,
          hint: `set here, arms next turn; ${use.radius} ft., DC ${use.dc} ${use.save}${use.damage.length ? `, ${use.damage.map((d) => `${d.dice} ${d.type}`).join(" + ")}` : ""}${use.conditions.length ? `, ${use.conditions.join("/").toLowerCase()}` : ""}${use.lingers ? ", sets the ground ablaze" : ""}`,
          target: "none",
          use: () => {
            const ok = useCombat.getState().itemEffect({
              kind: "mine", label: name, radius: use.radius, dc: use.dc, save: use.save, damage: use.damage, conditions: use.conditions, conditionRounds: EXPLOSIVE_CONDITION_ROUNDS, lingers: use.lingers, paired,
            });
            if (!ok) return false;
            const spent = consume(name);
            const pairs = [...(play.paired ?? [])];
            if (paired) pairs.splice(pairs.indexOf(name), 1);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, paired: pairs } });
            return true;
          },
        });
      } else if (use.kind === "teleport") {
        // A portable teleporter: step through to the enemy picked out, or away from the fight
        for (const mode of ["toward", "away"] as const) out.push({
          key: `${name}:${mode}`,
          label: `${label}: ${mode === "toward" ? "to the enemy picked out" : "away from the enemy"}`,
          hint: `a free square in sight within ${use.feet} ft.; no opportunity attacks`,
          target: mode === "toward" ? "foe" : "none",
          use: (id) => {
            if (mode === "toward" && id === undefined) return !!speed("There is nobody to step to.");
            if (!useCombat.getState().itemEffect({ kind: "teleport", label: name, feet: use.feet, mode, targetId: id })) return false;
            saveCharacter({ equipment: consume(name).equipment });
            return true;
          },
        });
      } else if (use.kind === "extinguisher") {
        out.push({
          key: name,
          label,
          hint: `${use.cone}-ft. cone toward the enemy picked out: puts out fires; DC ${use.dc} Constitution or blinded`,
          target: "foe",
          use: (id) => {
            if (id === undefined) return !!speed("There is nobody to spray toward.");
            if (!useCombat.getState().itemEffect({ kind: "extinguish", label: name, targetId: id, cone: use.cone, dc: use.dc })) return false;
            const spent = consume(name, use.uses);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
            return true;
          },
        });
      } else if (use.kind === "calibrator") {
        // A calibrator (vibroweapons, handwraps) or collimator (lightweapons): as an action, +1 damage and its property for the fight
        const fits = carriedWeapons(character).some((w) => !w.ranged && w.type.toLowerCase().includes(use.weapon));
        if (!fits) continue;
        out.push({
          key: name,
          label,
          hint: `+${use.damage} damage${use.property ? `, ${use.property}` : ""} on your ${use.weapon}`,
          target: "none",
          use: () => {
            if (!useCombat.getState().itemEffect({ kind: "calibrate", label: name, damage: use.damage, property: use.property })) return false;
            saveCharacter({ equipment: consume(name).equipment });
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
    initiateCombat(fighterNow(), enemies, combatKit());
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
    return [fare ? `a pilot for hire flies you: ${fare} cr` : "by shuttle", ships.length ? reason : ""].filter(Boolean).join("; ");
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
    else if (action.type === "alley") void ambush(action.alley);
    else if (action.type === "encounter") {
      const open = world?.encounter;
      if (!world || !open) return;
      if (action.step === "met" && open.phase === "approach") saveCampaign({ galaxyMap: { ...world, encounter: { ...open, phase: "talk" } } });
      else if (action.step === "delivered") deliverEncounter();
      else if (action.step === "surrounded" && open.phase === "ambush") saveCampaign({ galaxyMap: { ...world, encounter: { ...open, phase: "surround" } } });
      else if (action.step === "talk") toast.info(open.text);
    } else if (action.type === "near") {
      // Passive Wisdom (Perception), by the Player's Handbook: 10 + the modifier, noticed without searching
      const room = world.areas[action.areaId];
      const passive = 10 + modifier(character.abilityScores?.wisdom) + (skilled("perception") ? proficiency : 0);
      // A loose flagstone over a pit (DC 12, more where it is more dangerous)
      const loose = room ? trapsIn(room, false) : [];
      if (room?.layout && loose.length && passive >= 12 + room.danger) {
        toast.success(`You notice a loose flagstone that sounds hollow (passive Perception ${passive} against DC ${12 + room.danger}).`);
        saveCampaign({ galaxyMap: updateArea(world, room.id, { layout: { ...room.layout, assets: room.layout.assets.map((a) => (loose.some((l) => l.id === a.id) ? { ...a, name: "Pit trap" } : a)) } }).world });
        return;
      }
      if (!room?.secretEntry || room.secretEntry.found || passive < room.secretEntry.dc) return;
      toast.success(`You notice a ${room.secretEntry.name.toLowerCase()}${room.id === here.id ? "" : ` into ${room.name}`} (passive Perception ${passive} against DC ${room.secretEntry.dc}).`);
      saveCampaign({ galaxyMap: { ...world, areas: { ...world.areas, [room.id]: { ...room, secretEntry: { ...room.secretEntry, found: true } } } } });
    }
    else if (inCombat || dead || exploring) return;
    else if (action.type === "trap") {
      // The flagstone gives way: a fall of a level (1d6, never to the last hit point outside a fight)
      const room = world.areas[action.areaId];
      const trap = room?.layout?.assets.find((a) => a.id === action.id);
      const pit = trap?.ref ? world.areas[trap.ref] : undefined;
      if (!room?.layout || !trap || !pit) return;
      // A repulsor pack running slows the fall: no damage (its text: descent slowed to 60 feet a round)
      const slowed = ((character.equipment ?? []) as string[]).some((n) => /repulsor pack/i.test(n) && running(n));
      const fall = slowed ? 0 : die(6);
      const hp = Math.max(1, (character.currentHp ?? 0) - fall);
      const galaxyMap: World = {
        ...world,
        // The way out of the pit is now known (it was hidden from above)
        paths: world.paths.map((p) => ((p.from === pit.id || p.to === pit.id) && p.hidden ? { ...p, hidden: undefined } : p)),
        areas: { ...world.areas, [room.id]: { ...room, layout: { ...room.layout, assets: room.layout.assets.map((a) => (a.id === trap.id ? { ...a, name: "Pit trap" } : a)) } } },
      };
      lastSavedHp.current = hp;
      saveCharacter({ currentHp: hp });
      saveCampaign({ galaxyMap, currentLocation: pit.id, ...pass(1) });
      setCameFrom(room.id);
      toast.error(`The flagstone gives way and you fall into a pit: ${slowed ? "your repulsor pack sets you down gently" : `${fall} damage`}. Climb out (Athletics or Dexterity, DC ${PIT_CLIMB_DC}).`);
    }
    else if (action.type === "go") {
      if (gangHolds) toast.warning("The gang has you. There is no slipping through a door with them on you.");
      else travelTo(action.areaId, action.secret, action.squares);
    }
    else if (action.type === "exit") leaveBy(action.exit);
    else if (action.type === "use") {
      // A droid on a dealer's plinth: the dealer comes to the counter
      const room = (scene ?? world)?.areas[action.areaId];
      const dealer = /droid plinth/i.test(action.name ?? "") ? room?.occupants.find((o) => o.trade === "droids") : undefined;
      if (dealer) {
        const shown = useDisplay.getState().droids[action.id];
        if (shown) toast.info(`${shown.name}: ${shown.price.toLocaleString("en-GB")} credits. ${dealer.name} comes over.`);
        setPicked({ kind: "occupant", id: dealer.id });
      } else setPicked({ kind: "asset", id: `${action.areaId}|${action.id}`, name: action.name });
    }
    else if (action.type === "window") setPicked({ kind: "window", id: `${action.areaId}|${action.id}`, name: action.outside ? "outside" : "inside" });
    else if (action.type === "station") {
      if (action.id === "helm") setHelmOpen(true);
      else if (action.id === "ramp") disembarkNow();
      else toast.info(stationNote[action.id] ?? action.id);
    } else if (action.type === "occupant" || action.type === "ship" || action.type === "vehicle" || action.type === "companion") setPicked({ kind: action.type, id: action.id });
    else if (action.type === "loot") {
      const cache = here.loot.find((c) => c.id === action.id);
      if (!cache) return;
      if (cache.node) harvest(cache);
      else if (cache.looted) toast.info(`${cache.name} is empty.`);
      else if (lootWatched) toast.error("They are watching you: that cannot be taken now.");
      else takeLoot(cache);
    } else if (action.type === "look") {
      // House rule: a look through a window shows who is in the room, without a check
      const room = (scene ?? world).areas[action.areaId];
      const seen = [...room.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ""}${o.name} (${o.disposition})`), ...room.ships.map((ship) => ship.name)];
      toast.info(`Through the window of ${room.name}: ${seen.join(", ") || "nobody"}. (House rule: looking in needs no check.)`);
    }
  };

  // Moving a piece of furniture with the Force, out of a fight (shared/logic "Moving things with
  // the Force"): the powers the character knows that can move it, each with Push and Pull. It
  // goes away from the character or towards them, a square at a time, stopping before walls,
  // furniture and people, and never where it would block a way in or out.
  // (a render function, not a component: the page redraws every few seconds and a component made
  // here would be a new one each time, taking the buttons away from under a finger)
  const forceMoves = (areaId: string, assetId: string) => {
    const room = world?.areas[areaId];
    const l = room?.layout;
    const asset = l?.assets.find((a) => a.id === assetId);
    if (!world || !room || !l || !asset) return null;
    const bulk = bulkOf(asset);
    const movers = knownPowers
      .map((power) => {
        const facts = powerFacts(power.name) ?? {};
        return { power, motion: powerMotion({ level: power.level, description: power.description ?? facts.description, range: power.range ?? facts.range }, level), range: rangeFeet(power.range ?? facts.range), cost: powerCost(power) };
      })
      .filter((m) => m.motion && !m.motion.rider && m.motion.objects);
    const spot = usePartySpot.getState();
    const me = { x: spot.x - l.x, y: spot.y - l.y };
    const far = Math.max(0, asset.x - me.x, me.x - (asset.x + asset.w - 1), asset.y - me.y, me.y - (asset.y + asset.h - 1));
    const points = character?.currentForcePoints ?? 0;
    const move = (m: (typeof movers)[number], feet: number, mode: "away" | "toward") => {
      // Where the people of the room stand just now: a piece stops before them
      const people = new Set<string>();
      for (const o of (scene ?? world).areas[areaId]?.occupants ?? []) {
        const keys = [...l.assets.filter((a) => a.kind === "npc" && a.ref === o.id).map((a) => a.id), `v-${o.id}`];
        for (const k of keys) {
          const at = whereNow(k) ?? l.assets.find((a) => a.id === k);
          if (at) people.add(`${at.x},${at.y}`);
        }
      }
      const from = { x: asset.x + (asset.w - 1) / 2, y: asset.y + (asset.h - 1) / 2 };
      const dir = mode === "toward" ? { x: me.x - from.x, y: me.y - from.y } : { x: from.x - me.x, y: from.y - me.y };
      const res = shoveAsset(l, asset.id, dir, Math.floor(feet / 5), {
        creatureAt: (x, y) => (people.has(`${x},${y}`) ? { id: "someone", name: "someone" } : undefined),
        soft: (x, y) => x === me.x && y === me.y,
      });
      const name = asset.name.toLowerCase();
      if (!res.squares) {
        toast.info(`The ${name} will not move that way${res.blocked ? ": it would block the way" : res.struck ? (res.struck.what === "wall" ? ": a wall is in the way" : res.struck.what === "creature" ? ": someone is in the way" : `: the ${(res.struck.name ?? "").toLowerCase()} is in the way`) : ""}.`);
        return;
      }
      if (m.cost) {
        lastSavedPoints.current = points - m.cost;
        saveCharacter({ currentForcePoints: points - m.cost });
      }
      saveCampaign({ galaxyMap: moveRoomAssets(world, room.id, { [asset.id]: { x: res.x, y: res.y } }) });
      toast.success(`${m.power.name}: the ${name} ${mode === "toward" ? "slides towards you" : "is shoved away"} ${res.squares * 5} feet${res.blocked ? " and stops before it would block the way" : res.struck ? (res.struck.what === "wall" ? " and hits the wall" : res.struck.what === "creature" ? ", stopping short of someone" : ` up against the ${(res.struck.name ?? "").toLowerCase()}`) : ""}.`);
      setPicked(null);
    };
    return (
      <div className="mt-1 space-y-1" data-testid="force-moves">
        <p className="text-xs text-gray-300">
          {bulk.fixed ? "Built in: it cannot be moved." : `A ${bulk.size.toLowerCase()} object, about ${bulk.pounds.toLocaleString()} lb (house rule: judged from its size).`}
        </p>
        {!bulk.fixed && movers.map((m) => {
          const feet = m.motion!.maxPounds !== undefined && bulk.pounds > m.motion!.maxPounds ? 0 : motionFeet(m.motion!, bulk.size, true);
          const outOfRange = m.range !== undefined && far * 5 > Math.max(5, m.range);
          const short = m.cost > points;
          const why = !feet ? "too big or heavy for it" : outOfRange ? "out of range" : short ? "not enough force points" : "";
          return (
            <div key={m.power.name} className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-sky-200">{m.power.name} ({m.cost ? `${m.cost} pts` : "at will"}{feet ? `, ${feet} ft` : ""}{why ? `; ${why}` : ""}):</span>
              <Button size="sm" disabled={!!why || inCombat || dead} onClick={() => move(m, feet, "away")} data-testid="force-push">Push</Button>
              <Button size="sm" variant="outline" disabled={!!why || inCombat || dead} onClick={() => move(m, feet, "toward")} data-testid="force-pull">Pull</Button>
            </div>
          );
        })}
      </div>
    );
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
  // Aboard the party's own ship (see "Ships in the round" in shared logic): its deck is a room of a
  // building that stands where the ship does. The pilot's seat opens the helm, which lists every
  // take-off, landing and jump from there; the ramp leads out.
  const aboardId = here?.type === "deck" ? here.tags.find((t) => t.startsWith("ship:"))?.slice(5) : undefined;
  const aboardShip = aboardId ? ships.find((s) => s.id === aboardId) : undefined;
  const [helmOpen, setHelmOpen] = useState(false);
  const boardNow = (ship: PartyShip) => {
    if (!world || !here) return;
    const out = boardShip(world, ship, ship.areaId, here.kind === "room" ? here.id : undefined);
    setCameFrom(here.id);
    saveCampaign({ galaxyMap: out.world, currentLocation: out.deckId });
    toast.info(`You board ${ship.name}. Tap the pilot's seat to take the helm, the ramp to leave.`);
  };
  const disembarkNow = () => {
    if (!world || !aboardShip) return;
    const to = rampLeadsTo(world, aboardShip.id, aboardShip.hangar);
    if (!to) return void toast.error(`${aboardShip.name} is in space: land first.`);
    // At a port with hangars the ship has to be put down in one
    if (!aboardShip.hangar && hangarsOf(world, aboardShip.areaId).length) return void toast.error("Choose a hangar to put down in first (under the helm).");
    setHelmOpen(false);
    saveCampaign({ currentLocation: to });
    toast.info(`You step off ${aboardShip.name} into ${world.areas[to]?.name}.`);
  };
  // A tanker from the nearest depot, called to a ship that has run dry (house rule, see tankerCall): it sells the ship TANKER.units of
  // fuel at the size's price, and the call-out is the same again
  const callTanker = (ship: PartyShip) => {
    if (!world) return;
    const price = getStarshipSize(ship.size)?.fuelCost ?? passageRate;
    const { fee, units, minutes } = tankerCall(price, fuelCap(ship));
    if (fee > (character.credits ?? 0)) return void toast.error(`A tanker costs ${fee} credits (house rule) and you have ${character.credits ?? 0}.`);
    saveCharacter({ credits: character.credits - fee });
    saveCampaign({ ...pass(minutes), starships: ships.map((s) => (s.id === ship.id ? { ...s, fuel: s.fuel + units } : s)) });
    toast.success(`A tanker reaches ${ship.name} in ${minutes / 60} hours and sells ${units} units of fuel for ${fee} credits (house rule).`);
  };
  const flyShip = (exit: Exit) => {
    if (!world || !aboardShip || inCombat || dead || exploring) return;
    const ship = aboardShip;
    const busy = shipBusy(ship);
    if (busy) return void toast.error(`${ship.name} cannot fly: ${busy.what} is under way, ready ${clockText(busy.ready)}.`);
    if (ship.fuel < (exit.fuel ?? 0) && !isLowFuel(ship)) return void toast.error(`${ship.name} needs ${exit.fuel} fuel and has ${ship.fuel}.`);
    if (exit.jump && !ship.hyperdriveClass) return void toast.error(`${ship.name} has no hyperdrive.`);
    const took = tripMinutes(exit, Number(ship.hyperdriveClass) || 1) * (isLowFuel(ship) ? LIMP_FACTOR : 1);
    const changes = { ...pass(took), starships: ships.map((s) => (s.id === ship.id ? { ...s, fuel: fuelAfter(s, exit.fuel ?? 0), areaId: exit.to, hangar: undefined } : s)) };
    const target = world.areas[exit.to];
    toast.info(`${ship.name}: ${exit.label} ${target?.name}, ${Math.round(took / 6) / 10} h${isLowFuel(ship) ? " (LOW FUEL: limping, house rule)" : ""}; it is ${clockText(useClock.getState().minutes)}.`);
    const land = (w: World) => moveShipInterior(w, ship.id, exit.to);
    if (target && childrenOf(world, target.id).length === 0 && ["system", "planet", "settlement", "building"].includes(target.kind)) explore(target.id, changes, land);
    else saveCampaign({ ...changes, galaxyMap: land(world) });
  };
  const stationNote: Record<string, string> = {
    nav: "Navigation console: the courses open from here are listed at the helm.",
    guns: "Gunnery seat: the guns are manned in a ship fight.",
    engines: aboardShip ? `Engines: fuel ${aboardShip.fuel}/${getStarshipSize(aboardShip.size)?.fuelCapacity ?? "?"}${aboardShip.hyperdriveClass ? `, hyperdrive class ${aboardShip.hyperdriveClass}` : ", no hyperdrive"}.` : "Engines.",
    copilot: "Co-pilot's seat.",
  };

  // Seating a party member at a station of the deck; a member sits in one seat at a time
  const seatMember = (ship: PartyShip, seatId: string, memberId: string) => {
    const was = ship.crew ?? {};
    const next: Record<string, string> = {};
    for (const [seat, who] of Object.entries(was)) if (who !== memberId && seat !== seatId) next[seat] = who;
    if (memberId) next[seatId] = memberId;
    saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, crew: next } : s)) });
  };
  const crewPanel = (ship: PartyShip) => {
    const seats = seatsOf(world?.areas[deckIdOf(ship.id)]?.layout);
    if (!seats.length) return null;
    const members = crewMembers();
    const crewing = crewOf(seats, ship.crew, members);
    const label = (id: string) => (id === "self" ? `${character.name} (you)` : party.find((c) => c.id === id)?.name ?? "?");
    return (
      <div className="space-y-1" data-testid="crew">
        <p className="font-semibold text-sky-200">Stations</p>
        <p className="text-gray-400">In a ship fight: you fly it, and each other party member seated at a station gives it another action ({crewing.crew} now, {crewing.gunners} of them at the guns). House rule.</p>
        {seats.map((seat) => (
          <div key={seat.id} className="flex items-center justify-between gap-2">
            <span>{seat.name}{seat.station === "guns" ? " (guns)" : ""}</span>
            <select
              className="max-w-[55%] rounded border border-gray-600 bg-gray-900 px-1 py-0.5 text-xs"
              value={crewing.seated[seat.id] ?? (seat.station === "helm" && !ship.crew ? "self" : "")}
              disabled={inCombat || dead}
              onChange={(e) => seatMember(ship, seat.id, e.target.value)}
              data-testid={`seat-${seat.station}`}
            >
              <option value="">Empty</option>
              {members.filter((m) => m.kind !== "beast" && m.hp > 0).map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  };

  // The enemy's ship is a prize once nobody is left to guard it; any other is for sale
  const shipButton = (ship: Ship) =>
    ships.some((mine) => mine.id === ship.id) ? (
      <>
        <span className="ml-2 text-xs text-green-300">Yours, in its berth{(ships.find((mine) => mine.id === ship.id)?.fuel ?? 0) > 0 ? ` (fuel ${ships.find((mine) => mine.id === ship.id)!.fuel})` : ""}</span>
        <Button size="sm" variant="outline" className="ml-2 h-6 px-2" disabled={inCombat || dead || hostiles.length > 0 || !!shipFight} onClick={() => boardNow(ships.find((mine) => mine.id === ship.id)!)} data-testid="ship-board">
          Board
        </Button>
      </>
    ) : ship.status === "orbiting" && ship.owner === world?.antagonist && !ship.disabled ? (
      <Button size="sm" variant="destructive" className="ml-2 h-6 px-2" disabled={inCombat || dead || !!shipFight} onClick={engage} data-testid="ship-engage">
        Engage
      </Button>
    ) : (ship.status !== "wrecked" && ship.status !== "orbiting") || ship.disabled ? (
      <>
        <Button
          size="sm"
          variant="outline"
          className="ml-2 h-6 px-2"
          disabled={inCombat || dead || hostiles.length > 0 || !!shipFight}
          onClick={() => acquireShip(ship, ship.owner === world?.antagonist ? 0 : ship.value)}
        >
          {ship.owner === world?.antagonist ? "Take as a prize" : `Buy (${ship.value.toLocaleString()} cr)`}
        </Button>
        {ship.owner !== world?.antagonist && (
          <Button size="sm" variant="outline" className="ml-2 h-6 px-2 border-red-400 text-red-300" disabled={inCombat || dead || !!heistOf || !!shipFight} onClick={() => beginHeist(ship)} data-testid="ship-steal">
            Steal
          </Button>
        )}
      </>
    ) : null;

  // What is being looked at, and the way down to it from the galaxy
  const view: Area | null = world && hereId ? world.areas[viewId ?? ""] ?? world.areas[viewOf(world, hereId)] : null;
  const viewTrail = world && view ? trailOf(world, view.id).filter((a) => a.kind !== "region") : [];
  const onFoot = !!view && !!here && view.kind === "building" && (view.id === here.id || view.id === here.parentId);

  // The card for what was picked out on the map: a place, someone, or a ship
  // A trader's counter: today's stock at today's prices, what they would give for what the party
  // carries, how they take to the party and why, and a haggle
  // A droid dealer: droids for sale, the party's droids bought back, mended and fitted (see droidStock)
  const buyDroid = async (trader: Occupant, d: { id: string; name: string; price: number }) => {
    if (!world || inCombat || dead) return;
    if (d.price > (character.credits ?? 0)) return toast.error(`${d.name} costs ${d.price.toLocaleString()} credits and you have ${(character.credits ?? 0).toLocaleString()}.`);
    if (partyFull) return toast.error(`You can lead ${COMPANION_LIMIT} companions at most (house rule).`);
    const response = await fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock: d.id }) });
    if (!response.ok) return toast.error("Could not load that droid.");
    const o: Occupant = { ...(await response.json()), disposition: "neutral", role: "droid" };
    const companion = companionFrom(o, "droid", clockNow(), newId("c"), { how: "bought", name: d.name });
    saveCharacter({ credits: character.credits - d.price });
    saveParty([...party, companion]);
    recordDeal(trader.id, (e) => ({ ...e, bought: { ...e.bought, [`droid:${d.id}`]: (e.bought[`droid:${d.id}`] ?? 0) + 1 } }));
    toast.success(`${d.name} bought for ${d.price.toLocaleString()} credits: it follows you.`);
  };
  const sellDroid = (trader: Occupant, c: Companion, offer: number) => {
    saveParty(party.filter((x) => x.id !== c.id), { credits: (character.credits ?? 0) + offer });
    recordDeal(trader.id, (e) => ({ ...e, sold: { ...e.sold, [`droid:${c.name}`]: (e.sold[`droid:${c.name}`] ?? 0) + 1 } }), false);
    toast.success(`${c.name} sold for ${offer.toLocaleString()} credits.`);
  };
  const repairDroidAt = (c: Companion, cost: number) => {
    if (cost > (character.credits ?? 0)) return toast.error(`The repair costs ${cost.toLocaleString()} credits.`);
    saveParty(party.map((x) => (x.id === c.id ? { ...x, hp: x.maxHp } : x)), { credits: character.credits - cost });
    saveCampaign(pass(30));
    toast.success(`${c.name} is mended for ${cost.toLocaleString()} credits (half an hour).`);
  };
  // The dealer's technician fits a customization the party carries: the surgeon's fee, no check, no kit
  const fitAtDealer = (c: Companion, item: string) => {
    const f = factsOfItem(item);
    if (!f?.droid || inCombat || dead) return;
    const slots = c.motor ?? DROID_BASE_SLOTS;
    if ((c.custom ?? []).length >= slots) return speed(`${c.name}'s motor supports ${slots} customizations: upgrade it first.`);
    if ((c.custom ?? []).includes(f.name)) return speed("It already has that.");
    const plan = droidPlan(f.rarity, c.size ?? "medium");
    if (plan.cost > (character.credits ?? 0)) return speed(`The fitting costs ${money(plan.cost)}.`);
    const stock = c.stock ?? { armorClass: c.armorClass, speed: c.speed };
    const spent = consume(item);
    saveParty(party.map((x) => (x.id === c.id ? droidWith({ ...x, stock, custom: [...(x.custom ?? []), f.name] }) : x)), { equipment: spent.equipment, credits: character.credits - plan.cost, playState: { ...play, charges: spent.charges } });
    saveCampaign(pass(plan.hours * 60));
    toast.success(`${f.name} fitted to ${c.name} by the dealer's technician (${money(plan.cost)}, ${plan.hours} hours).`);
  };
  // The droid customizations a dealer (or a scrapyard) sells today; bought, one is carried as an item, to fit later or at once
  // Every enhanced item's name, type, rarity and subtype: what the droid dealers, surgeons and technicians draw their stock from
  const { data: enhancedRows = [] } = useQuery<any[]>({
    queryKey: ["enhanced-rows-all"],
    queryFn: async () => (await (await fetch("/api/sw5e/enhancedItems?fields=id,name,type,searchableRarity,subtype")).json()) as any[],
    staleTime: Infinity,
  });
  const droidPartRows = useMemo(() => enhancedRows.filter((e) => e.type === "DroidCustomization"), [enhancedRows]);
  // What the shop the party is in shows today: the droids of the day on its plinths, the customizations it sells on its shelves
  const showroomKey = `${here?.id}|${today}|${droidStats.length}|${droidPartRows.length}|${enhancedRows.length}|${JSON.stringify(here?.occupants.map((o) => traderLedger(o.id).bought) ?? [])}`;
  useEffect(() => {
    const room = world && here?.kind === "room" ? world.areas[here.id] : undefined;
    if (!world || !room) {
      useDisplay.getState().set({ droids: {}, shelves: {} });
      return;
    }
    const trader = room.occupants.find((o) => o.trade === "droids");
    let droids: Record<string, { name: string; price: number }> = {};
    let shelves: Record<string, string[]> = {};
    if (trader && droidStats.length) {
      const bought = traderLedger(trader.id).bought;
      droids = Object.fromEntries(droidDisplay(world, room.id, today, droidStats, bought).map(({ plinth, line }) => [plinth, { name: line.name, price: line.price }]));
      const parts = droidPartsStock(world, trader, room.id, today, droidPartRows, bought).map((l) => itemRef(l.name)?.model).filter((m): m is string => !!m);
      shelves = Object.fromEntries((room.layout?.assets ?? []).filter((a) => /droid parts shelf|display case/i.test(a.name)).map((a) => [a.id, parts]));
    }
    // The parts bins show the models of the modifications the room's seller has today
    const seller = room.occupants.map((o) => modStock(world, o, room.id, today, enhancedRows, traderLedger(o.id).bought)).find((lines) => lines.length);
    const mods = (seller ?? []).map((l) => itemRef(l.name)?.model).filter((m): m is string => !!m);
    if (mods.length) for (const a of room.layout?.assets ?? []) if (/parts bin/i.test(a.name) && !shelves[a.id]) shelves[a.id] = mods;
    useDisplay.getState().set({ droids, shelves });
  }, [showroomKey]);
  const buyDroidPart = (trader: Occupant, line: { name: string; price: number }, fitTo?: Companion) => {
    if (!world || inCombat || dead) return;
    const fee = fitTo ? droidPlan(factsOfItem(line.name)?.rarity ?? "Standard", fitTo.size ?? "medium").cost : 0;
    const total = line.price + fee;
    if (total > (character.credits ?? 0)) return toast.error(`That comes to ${total.toLocaleString()} credits.`);
    recordDeal(trader.id, (e) => ({ ...e, bought: { ...e.bought, [line.name]: (e.bought[line.name] ?? 0) + 1 } }));
    if (fitTo) {
      const f = factsOfItem(line.name);
      if (!f?.droid) return toast.error("The facts of that part are still loading.");
      if ((fitTo.custom ?? []).length >= (fitTo.motor ?? DROID_BASE_SLOTS)) return toast.error(`${fitTo.name}'s motor is full: upgrade it first.`);
      const plan = droidPlan(f.rarity, fitTo.size ?? "medium");
      const stock = fitTo.stock ?? { armorClass: fitTo.armorClass, speed: fitTo.speed };
      saveParty(party.map((x) => (x.id === fitTo.id ? droidWith({ ...x, stock, custom: [...(x.custom ?? []), f.name] }) : x)), { credits: character.credits - total });
      saveCampaign(pass(plan.hours * 60));
      return toast.success(`${line.name} bought and fitted to ${fitTo.name} by the dealer's technician (${total.toLocaleString()} credits, ${plan.hours} hours).`);
    }
    saveCharacter({ credits: character.credits - line.price, equipment: [...(character.equipment ?? []), line.name] });
    toast.success(`${line.name} bought for ${line.price.toLocaleString()} credits; fit it from your droid's card or here.`);
  };
  const droidPartsPanel = (trader: Occupant, placeId: string) => {
    if (!world) return null;
    const lines = droidPartsStock(world, trader, placeId, today, droidPartRows, traderLedger(trader.id).bought);
    const droids = party.filter((c) => c.kind === "droid");
    if (!lines.length) return null;
    return (
      <div className="space-y-0.5" data-testid="droid-parts">
        <p className="font-semibold text-gray-300">{trader.trade === "salvage" ? "Salvaged droid parts" : "Customizations for sale"}</p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {lines.map((l) => (
            <li key={l.name} className="flex flex-wrap items-center gap-1" data-testid="droid-part-line">
              <span className="flex-1">{l.name} <span className="text-gray-400">{l.rarity}</span></span>
              <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || l.price > (character.credits ?? 0)} onClick={() => buyDroidPart(trader, l)} data-testid="droid-part-buy">Buy {l.price.toLocaleString("en-GB")} cr</Button>
              {trader.trade === "droids" && droids.map((c) => (
                <Button key={c.id} size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead} onClick={() => buyDroidPart(trader, l, c)} data-testid="droid-part-fit">and fit to {c.name}</Button>
              ))}
            </li>
          ))}
        </ul>
        <p className="text-gray-500">House rule: customizations are sold over the counter here (Wretched Hives has them found or made), at their value; fitting them yourself takes astrotech's implements and a check by whoever does it, the technician does it for a fee with no check.</p>
      </div>
    );
  };
  const droidShop = (trader: Occupant, placeId: string, label: string) => {
    if (!world) return null;
    const traded = traderLedger(trader.id);
    const stock = droidStock(world, trader, placeId, today, droidStats, traded.bought);
    const droids = party.filter((c) => c.kind === "droid");
    const carried: string[] = Array.from(new Set<string>(character.equipment ?? []));
    const fits = carried.filter((n) => factsOfItem(n)?.droid);
    return (
      <div className="mt-2 space-y-1 border-t border-gray-600 pt-2 text-xs" data-testid="droid-shop">
        <p><span className="font-semibold text-amber-200">{label}</span> <span className="text-gray-400">Credits: {character.credits ?? 0}. Prices from the Expanded Content's droid table; droids it does not list on a curve through it (house rule).</span></p>
        <p className="font-semibold text-gray-300">For sale</p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {stock.map((d) => (
            <li key={d.id} className="flex items-center gap-1">
              <span className="flex-1">{d.name} <span className="text-gray-400">CR {d.cr}{d.combat ? ", built for war" : ""}{droidListed(d.name) ? ", the book's price" : ""}</span></span>
              <span className="text-amber-200">{d.price} cr</span>
              <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || d.price > (character.credits ?? 0) || partyFull} onClick={() => buyDroid(trader, d)} data-testid={`droid-buy-${d.id}`}>Buy</Button>
            </li>
          ))}
          {!stock.length && <li className="text-gray-400">{droidStats.length ? "No droid on the floor today." : "Loading..."}</li>}
        </ul>
        {droids.length > 0 && <p className="font-semibold text-gray-300">Your droids</p>}
        {droids.map((c) => {
          const offer = droidOffer(c.xp ?? 50, c.hp, c.maxHp, c.name);
          const mend = droidRepairPrice(c.cr, c.maxHp - c.hp);
          return (
            <div key={c.id} className="space-y-0.5" data-testid={`droid-mine-${c.id}`}>
              <div className="flex items-center gap-1">
                <span className="flex-1">{c.name} <span className="text-gray-400">{c.hp}/{c.maxHp} hp, {(c.custom ?? []).length}/{c.motor ?? DROID_BASE_SLOTS} customizations</span></span>
                {mend > 0 && <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || mend > (character.credits ?? 0)} onClick={() => repairDroidAt(c, mend)} data-testid={`droid-repair-${c.id}`}>Repair ({mend} cr)</Button>}
                <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead} onClick={() => sellDroid(trader, c, offer)} data-testid={`droid-sell-${c.id}`}>Sell ({offer} cr)</Button>
              </div>
              {fits.filter((n) => !(c.custom ?? []).includes(factsOfItem(n)!.name)).map((n) => {
                const fee = droidPlan(factsOfItem(n)!.rarity, c.size ?? "medium").cost;
                return (
                  <div key={n} className="flex items-center gap-1 pl-3">
                    <span className="flex-1 text-gray-300">Fit {n}</span>
                    <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || fee > (character.credits ?? 0)} onClick={() => fitAtDealer(c, n)} data-testid={`droid-fit-${c.id}`}>Fit ({fee} cr)</Button>
                  </div>
                );
              })}
              {(c.motor ?? DROID_BASE_SLOTS) < 6 && (
                <div className="pl-3">
                  <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead} onClick={() => upgradeMotor(c)}>Upgrade the motor to {(c.motor ?? DROID_BASE_SLOTS) + 1} slots ({money(DROID_MOTOR_COST[(c.motor ?? DROID_BASE_SLOTS) + 1] * (SIZE_TIME[(c.size ?? "medium").toLowerCase()] ?? 1))})</Button>
                </div>
              )}
            </div>
          );
        })}
        {!droids.length && <p className="text-gray-400">You have no droids to sell, mend or fit. A disabled droid is mended and bolted from its card.</p>}
        {droidPartsPanel(trader, placeId)}
        <p className="text-gray-500">The dealer pays two fifths of a droid's price for yours.</p>
      </div>
    );
  };
  // Hangars: the ship puts down in one of the port's (shared logic "Hangars"); whoever works there sells fuel,
  // mends the hull or fits upgrades; a few others do something for the party for a check (SCRIPTS)
  const chooseHangar = (ship: PartyShip, h: Hangar) => {
    if (!world) return;
    const gate = hangarOpen(world, h, standing);
    if (!gate.open) return void toast.error(gate.reason);
    const moved = !!ship.hangar && ship.hangar !== h.buildingId;
    saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, hangar: h.buildingId } : s)), ...(moved ? pass(10) : {}) });
    toast.info(`${ship.name} puts down in ${h.name}${moved ? " (ten minutes)" : ""}. ${h.note}`);
  };
  // ---- Ship parts and the work on a ship (2026-10-21; shipyard.ts): bought from a scrapyard or a shipyard, carried in the hold
  // (playState.shipParts), fitted by a shipyard (its fee, no check) or by the crew (the material cost already paid, a workforce, days of
  // the clock and an Intelligence (Mechanic's Kit) check by whoever leads)
  const shipParts: ShipPart[] = play.shipParts ?? [];
  const [yardWeapon, setYardWeapon] = useState<Record<string, string>>({});
  const saveParts = (next: ShipPart[], extra: Record<string, any> = {}) => saveCharacter({ playState: { ...play, shipParts: next }, ...extra });
  const shipsAt = (settlementId?: string) => ships.filter((x) => x.areaId === settlementId);
  const partSize = (settlementId?: string) => shipsAt(settlementId)[0]?.size ?? ships[0]?.size ?? "Small";
  const partRow = (part: Pick<ShipPart, "kind" | "name">) => (part.kind === "mod" ? shipModNamed(part.name) : undefined);
  const enhancedValueOf = (e: any) => enhancedValue({ id: e.id, name: e.name, searchableRarity: e.searchableRarity, type: e.type });
  // A part needs a weapon chosen when it is a weapon system for one weapon, or an enhanced ship weapon
  const needsWeapon = (part: Pick<ShipPart, "kind" | "name" | "type">) => {
    const row = partRow(part);
    return (!!row && row.type === "Weapon" && !/^Hardpoint$/i.test(row.name) && !shipModEffects(row).weapon?.allPrimary) || (part.kind === "enhanced" && part.type === "ShipWeapon");
  };
  // The yard's fee and days for fitting a part the party brings: the installation half of the book's cost; for an enhanced part,
  // house rule: a tenth of its worth and a day
  const yardFee = (ship: PartyShip, part: ShipPart): { fee: number; days: number } => {
    const row = partRow(part);
    if (row) return { fee: modCost(row, ship.size).installed - modCost(row, ship.size).material, days: modDays(row, ship.size, yardWorkforce(ship.size, "mod")) };
    const eq = shipRows.find((r: any) => r.name === part.name);
    if (eq) return { fee: equipmentCost(eq, ship.size).installed - equipmentCost(eq, ship.size).material, days: equipmentDays(eq, ship.size, 2 * equipmentWorkforce(ship.size)) };
    return { fee: Math.round(part.worth / 10), days: 1 };
  };
  const workUntil = (days: number) => clockNow() + Math.round(days * DAY);
  const buyPart = (holderId: string, line: PartLine, install: boolean, shipId?: string) => {
    const credits = character.credits ?? 0;
    const cost = install ? line.installed ?? line.price : line.price;
    if (cost > credits) return void toast.error(`That costs ${cost} credits; you have ${credits}.`);
    const part: ShipPart = { ...line.part, id: newId("part") };
    if (install && shipId) {
      const ship = ships.find((x) => x.id === shipId);
      if (!ship) return;
      const fit = fitShipPart(ship, part, shipRows);
      if (fit.error) return void toast.error(fit.error);
      const days = line.days ?? 1;
      saveParts([...shipParts, ...fit.returned], { credits: credits - cost });
      saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? { ...fit.ship, work: { what: `fitting ${part.name}`, ready: workUntil(days), by: "yard" } } : x)) });
      toast.success(`The yard fits ${part.name} to ${ship.name} for ${cost} credits: ${days} days of work.${fit.returned.length ? ` ${fit.returned.map((x) => x.name).join(", ")} goes to your hold.` : ""}`);
      return;
    }
    saveParts([...shipParts, part], { credits: credits - cost });
    toast.success(`${part.name} bought for ${cost} credits; it is in your hold.`);
  };
  const sellPart = (part: ShipPart, offer: number) => {
    saveParts(shipParts.filter((x) => x.id !== part.id), { credits: (character.credits ?? 0) + offer });
    toast.success(`${part.name} sold for ${offer} credits.`);
  };
  // The yard fits a part from the hold
  const yardInstall = (ship: PartyShip, part: ShipPart, weapon?: string) => {
    const { fee, days } = yardFee(ship, part);
    const credits = character.credits ?? 0;
    if (fee > credits) return void toast.error(`The yard asks ${fee} credits; you have ${credits}.`);
    const fit = fitShipPart(ship, part, shipRows, weapon);
    if (fit.error) return void toast.error(fit.error);
    saveParts([...shipParts.filter((x) => x.id !== part.id), ...fit.returned], { credits: credits - fee });
    saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? { ...fit.ship, work: { what: `fitting ${part.name}`, ready: workUntil(days), by: "yard" } } : x)) });
    toast.success(`The yard fits ${part.name} for ${fee} credits: ready in ${days} days.`);
  };
  const yardTier = (ship: PartyShip) => {
    const to = (ship.tier ?? 0) + 1;
    const plan = tierUpgrade(ship.size, to, yardWorkforce(ship.size, "tier"));
    const credits = character.credits ?? 0;
    if (plan.cost > credits) return void toast.error(`Tier ${to} costs ${plan.cost} credits; you have ${credits}.`);
    saveCharacter({ credits: credits - plan.cost });
    saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? { ...x, tier: to, work: { what: `the upgrade to tier ${to}`, ready: workUntil(plan.days), by: "yard" } } : x)) });
    toast.success(`${ship.name} goes up to tier ${to} for ${plan.cost} credits: ${plan.days} days in the yard.`);
  };
  // The crew's own work: the workers chosen, a check by whoever leads (the dialog asks who and with what), days on the clock
  const mechanicsKit = () => (character.equipment ?? []).find((n: string) => /^mechanic's kit$/i.test(kitAlias(n)));
  const crewInstall = async (ship: PartyShip, part: ShipPart, workers: string[], weapon?: string, hands = 0) => {
    if (!world || inCombat || dead) return;
    const kit = mechanicsKit();
    if (!kit) return void toast.error("Installing needs a mechanic's kit.");
    const atPort = hasPort(world, ship.areaId);
    const row = partRow(part);
    const eq = shipRows.find((r: any) => r.name === part.name);
    const force = workers.length + hands;
    const plan = row ? crewModPlan(ship, row, force, atPort) : eq ? crewEquipmentPlan(ship, eq, force, atPort) : { days: 1, dc: 10 + (atPort ? 0 : 5), workforce: 1, enough: force > 0, reason: force ? "" : "Pick who works." };
    if (!plan.enough) return void toast.error(plan.reason);
    // Hired hands are paid by the day (Player's Handbook, Services: skilled 20 cr), whatever comes of the check
    const wages = hands * 20 * Math.ceil(plan.days);
    if (wages > (character.credits ?? 0)) return void toast.error(`The hands' wages come to ${wages} credits.`);
    // A mechanic's shop suite aboard: its integrated tools add the proficiency bonus (the book: proficiency, or double it)
    const shop = (ship.mods ?? []).some((m) => /^Mechanic's Shop$/i.test(m.name));
    const r = await toolRoll(kit, plan.dc, `Installing ${part.name}`, "intelligence", shop ? proficiency : 0);
    if (r.cancelled) return;
    if (r.success) {
      const fit = fitShipPart(ship, part, shipRows, weapon);
      if (fit.error) return void toast.error(fit.error);
      saveParts([...shipParts.filter((x) => x.id !== part.id), ...fit.returned], wages ? { credits: (character.credits ?? 0) - wages } : {});
      saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? fit.ship : x)), ...pass(Math.round(plan.days * DAY)) });
      toast.success(`${part.name} is installed in ${ship.name} after ${plan.days} days of work${wages ? ` (${wages} credits of wages)` : ""}.`);
    } else {
      // The book: on a failure half the time and cost is incurred and it is not installed
      const lost = Math.min((character.credits ?? 0) - Math.round(wages / 2), Math.round(part.worth / 2));
      saveCharacter({ credits: (character.credits ?? 0) - lost - Math.round(wages / 2) });
      saveCampaign({ ...pass(Math.round((plan.days / 2) * DAY)) });
      toast.error(`The installation fails: ${plan.days / 2} days lost and ${lost} credits of spoiled components. The part is still in the hold.`);
    }
  };
  const crewTier = (ship: PartyShip, workers: string[], hands = 0) => {
    const to = (ship.tier ?? 0) + 1;
    const plan = tierUpgrade(ship.size, to, workers.length + hands);
    const credits = character.credits ?? 0;
    const wages = hands * 20 * Math.ceil(plan.days);
    if (workers.length + hands < plan.workforce) return void toast.error(`A ${ship.size} ship needs a workforce of ${plan.workforce} for a tier.`);
    if (plan.own + wages > credits) return void toast.error(`The materials and wages cost ${plan.own + wages} credits; you have ${credits}.`);
    saveCharacter({ credits: credits - plan.own - wages });
    saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? { ...x, tier: to } : x)), ...pass(Math.round(plan.days * DAY)) });
    toast.success(`${ship.name} is tier ${to} after ${plan.days} days of your own work, for ${plan.own} credits of materials.`);
  };
  // Taking a modification out (the book: half the cost and half the time); house rule: the crew gets the part back, salvaged
  const removeShipMod = (ship: PartyShip, mod: ShipModInstance, index: number) => {
    const row = shipModNamed(mod.name);
    if (!row) return;
    const cost = Math.round(modCost(row, ship.size).material / 2);
    const days = modDays(row, ship.size, Math.max(1, 1 + party.filter((c) => c.kind !== "beast").length)) / 2;
    if (cost > (character.credits ?? 0)) return void toast.error(`Removing it costs ${cost} credits.`);
    const part: ShipPart = { id: newId("part"), kind: "mod", name: row.name, size: ship.size, grade: row.grade, type: row.type, worth: Math.round(modCost(row, ship.size).material / 2), salvaged: true };
    saveParts([...shipParts, part], { credits: (character.credits ?? 0) - cost });
    saveCampaign({ starships: ships.map((x) => (x.id === ship.id ? { ...x, mods: (x.mods ?? []).filter((_, i) => i !== index) } : x)), ...pass(Math.round(days * DAY)) });
    toast.info(`${row.name} comes out of ${ship.name} in ${days} days, for ${cost} credits; the part is in the hold (salvaged).`);
  };
  // The parts counter of a scrapyard's dealer or a shipyard's outfitter
  const partsCounter = (o: Occupant, holderId: string) => {
    if (!world) return null;
    const place = partsPlaceAt(world, o, holderId, today);
    if (!place) return null;
    const settlement = trailOf(world, holderId).find((a) => a.kind === "settlement");
    const building = trailOf(world, holderId).find((a) => a.kind === "building");
    const size = partSize(settlement?.id);
    const lines = shipRows.length ? partsStock(place, size, shipRows, enhancedShipRows.map((e) => ({ ...e, value: enhancedValueOf(e) }))) : [];
    const inYard = place.kind === "yard" ? shipsAt(settlement?.id).find((x) => x.hangar === building?.id) : undefined;
    return (
      <PartsCounter
        kind={place.kind}
        lines={lines}
        owned={shipParts}
        credits={character.credits ?? 0}
        disabled={inCombat || dead}
        size={size}
        shipHere={inYard?.name}
        installBlocked={(line) => (!inYard ? "Put your ship down in this shipyard's hangar first." : inYard.size !== size ? "Priced for another size." : needsWeapon(line.part) ? "Buy it, then have the mechanic fit it to a weapon." : shipBusy(inYard) ? "The yard is busy with your ship." : "")}
        onBuy={(line, install) => buyPart(holderId, line, install, inYard?.id)}
        onSell={sellPart}
      />
    );
  };

  // What a shipyard's mechanics do for the party's ship in their hangar: the next tier (the book's cost with the yard's workforce) and
  // fitting the parts the party brings (the installation half of the cost; no check)
  const yardWork = (ship: PartyShip) => {
    const weaponFor = yardWeapon;
    const setWeaponFor = setYardWeapon;
    const sheet = shipSheet(ship, shipRows, proficiency);
    const busy = shipBusy(ship);
    const credits = character.credits ?? 0;
    const to = (ship.tier ?? 0) + 1;
    const tier = to <= 5 ? tierUpgrade(ship.size, to, yardWorkforce(ship.size, "tier")) : undefined;
    const damaged = ship.hull !== undefined && ship.hull < sheet.hullMax;
    return (
      <div className="space-y-1" data-testid="yard-work">
        {busy && <p className="text-amber-300">The yard is at work: {busy.what}, ready {clockText(busy.ready)}.</p>}
        {tier && (
          <div className="flex items-center gap-1">
            <span className="flex-1">Upgrade to tier {to}: {tier.cost.toLocaleString("en-GB")} cr, {tier.days} days (the book's cost and time)</span>
            <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || !!busy || damaged || tier.cost > credits} title={damaged ? "Mend the hull first" : ""} onClick={() => yardTier(ship)} data-testid="yard-tier">Upgrade</Button>
          </div>
        )}
        {shipParts.map((part) => {
          const { fee, days } = yardFee(ship, part);
          const weapons = sheet.weapons.map((w) => w.name);
          const weapon = weaponFor[part.id] ?? weapons[0];
          const wrongSize = part.size && part.size !== ship.size && part.type !== "Weapon" && part.kind !== "enhanced";
          return (
            <div key={part.id} className="flex items-center gap-1" data-testid="yard-fit">
              <span className="flex-1">{part.name} <span className="text-gray-400">{partLabel(part)}</span></span>
              {needsWeapon(part) && weapons.length > 0 && (
                <select className="bg-gray-800 text-xs" value={weapon} onChange={(e) => setWeaponFor((m) => ({ ...m, [part.id]: e.target.value }))}>
                  {weapons.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              )}
              <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || !!busy || !!wrongSize || fee > credits} title={wrongSize ? `Assembled for a ${part.size} ship` : ""} onClick={() => yardInstall(ship, part, needsWeapon(part) ? weapon : undefined)} data-testid="yard-fit-part">
                Fit ({fee.toLocaleString("en-GB")} cr, {days} days)
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  // Where a ship is: its hangar's settlement, or the settlement it sits in, or the planet it is in orbit over
  const shipPlace = (sh: PartyShip) => {
    if (!world) return "";
    const at = sh.hangar ?? sh.areaId;
    const settlement = [...trailOf(world, at)].reverse().find((a) => a.kind === "settlement");
    if (settlement) return `berthed at ${settlement.name}`;
    const planet = [...trailOf(world, at)].reverse().find((a) => a.kind === "planet");
    return planet ? `in orbit over ${planet.name}` : "berthed at a port";
  };
  // Passage to a ship of the party in this settlement (house rule: the books give no fare for a shuttle): the fare and the walk to its berth
  const PASSAGE_FARE = 25;
  const passageTo = (sh: PartyShip) => {
    if (!world || !here) return;
    const settlement = berthOf(world, here.id);
    if (!trailOf(world, sh.areaId).some((a) => a.id === settlement)) return void toast.error(`${sh.name} is ${shipPlace(sh)}: fly there.`);
    if ((character.credits ?? 0) < PASSAGE_FARE) return void toast.error(`Passage costs ${PASSAGE_FARE} credits (house rule) and you have ${character.credits ?? 0}.`);
    const destination = sh.hangar ?? sh.areaId;
    saveCharacter({ credits: character.credits - PASSAGE_FARE });
    saveCampaign({ ...pass(20), currentLocation: destination });
    setShipPick(false);
    toast.info(`A shuttle takes you to ${sh.name} (${PASSAGE_FARE} credits, house rule).`);
  };
  const shipServices = (o: Occupant, holderId: string) => {
    if (!world) return null;
    const building = trailOf(world, holderId).find((a) => a.kind === "building");
    const settlement = building ? trailOf(world, building.id).find((a) => a.kind === "settlement") : undefined;
    const hangar = building && settlement ? hangarsOf(world, settlement.id).find((h) => h.buildingId === building.id) : undefined;
    if (!building || !settlement || !hangar) return null;
    const refuels = hangar.services.includes("refuel") && ["fuel attendant", "mechanic", "dockmaster"].includes(o.role);
    const repairs = hangar.services.includes("repair") && o.role === "mechanic";
    const upgrades = hangar.services.includes("upgrade") && o.role === "starship outfitter";
    if (!refuels && !repairs && !upgrades) return null;
    const mine = ships.filter((s) => s.areaId === settlement.id && s.hangar === building.id);
    if (!mine.length) return <p className="mt-1 text-xs text-gray-400" data-testid="ship-service-none">Your ship is not in this hangar. Put it down here first: take the helm and choose the hangar.</p>;
    const prof = Math.ceil(1 + level / 4);
    const credits = character.credits ?? 0;
    return (
      <div className="mt-1 space-y-2 border-t border-gray-600 pt-1 text-xs" data-testid="ship-services">
        {mine.map((ship) => {
          const cap = fuelCap(ship);
          const price = getStarshipSize(ship.size)?.fuelCost ?? passageRate;
          const sheet = shipRows.length ? shipSheet(ship, shipRows, prof) : undefined;
          const missing = sheet ? Math.max(0, sheet.hullMax - (ship.hull ?? sheet.hullMax)) : 0;
          const mend = repairPrice(missing, ship.size);
          return (
            <div key={ship.id} className="space-y-1">
              <p className="font-semibold text-amber-200">{ship.name}: fuel {ship.fuel}/{cap}{sheet ? `, hull ${ship.hull ?? sheet.hullMax}/${sheet.hullMax}` : ""}</p>
              {refuels && (
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || ship.fuel >= cap} onClick={() => refuel(ship)} data-testid="service-refuel">
                  Refuel ({price} cr a unit, {Math.max(0, cap - ship.fuel)} to fill)
                </Button>
              )}
              {repairs && (
                <Button
                  size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || missing <= 0 || mend > credits} data-testid="service-repair"
                  onClick={() => {
                    saveCharacter({ credits: credits - mend });
                    saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, hull: undefined } : s)), ...pass(Math.max(30, missing * 6)) });
                    toast.success(`${ship.name}: ${missing} hull points mended for ${mend} credits.`);
                  }}
                >
                  {missing > 0 ? `Mend the hull (${missing} points, ${mend} cr)` : "The hull is sound"}
                </Button>
              )}
              {repairs && sheet && yardWork(ship)}
              {upgrades && shipRows.length > 0 && (
                <div className="space-y-0.5" data-testid="service-upgrades">
                  {outfitterStock(shipRows, o.id).map((item) => {
                    const fit = fitting(ship.equipment, item, shipRows);
                    return (
                      <div key={item.name} className="flex items-center gap-1">
                        <span className="flex-1">{item.name} <span className="text-gray-400">{item.type}</span></span>
                        <Button
                          size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || !!fit.error || fit.price > credits} title={fit.error}
                          onClick={() => {
                            saveCharacter({ credits: credits - fit.price });
                            saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, equipment: fit.equipment } : s)), ...pass(60) });
                            toast.success(`${item.name} fitted to ${ship.name} for ${fit.price} credits.`);
                          }}
                        >
                          {fit.error ? "Fitted" : `Fit (${fit.price} cr)`}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-gray-500">Prices for repairs and fittings are house rules (the books price none); a part replaces the one of its kind, taken in part exchange for half its cost.</p>
      </div>
    );
  };
  const runScript = async (script: RoleScript, buildingId: string | undefined) => {
    if (!world || !here || !buildingId || inCombat || dead) return;
    const faction = factionAt(world, buildingId);
    if (script.cost && script.cost > (character.credits ?? 0)) return void toast.error(`${script.label}: it takes ${script.cost} credits and you have ${character.credits ?? 0}.`);
    if (script.needs === "audience" && (world.audiences?.[buildingId] ?? 0) <= clockNow() && (faction ? standing.renown[faction] ?? 0 : 0) < 3) {
      return void toast.error("The dignitary receives no one without a slip from the chamberlain (or renown of 3 or more with the court). House rule.");
    }
    toast.info(script.text);
    const ok = await abilityCheck(script.label, script.dc, script.abilities, script.skill ? skilled(script.skill) : false);
    if (cancelledCheck.current) return;
    if (script.cost) saveCharacter({ credits: (character.credits ?? 0) - script.cost });
    const changes: Record<string, any> = pass(script.minutes + (!ok && script.effect === "cleared" ? 60 : 0));
    if (ok && script.effect === "audience") changes.galaxyMap = { ...world, audiences: { ...(world.audiences ?? {}), [buildingId]: clockNow() + 12 * 60 } };
    if (ok && script.effect === "renown" && faction) changes.factionInfluence = addRenown(standing, faction, 1);
    saveCampaign(changes);
    toast[ok ? "success" : "error"](ok ? script.win : script.lose);
  };
  const scriptPanel = (o: Occupant, holderId: string) => {
    const list = scriptsFor(o.role);
    if (!list.length || !world) return null;
    const buildingId = trailOf(world, holderId).find((a) => a.kind === "building")?.id;
    return (
      <div className="mt-1 space-y-1 border-t border-gray-600 pt-1" data-testid="scripts">
        {list.map((sc) => (
          <div key={sc.id} className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => runScript(sc, buildingId)} data-testid={`script-${sc.id}`}>{sc.label}</Button>
            <span className="text-gray-400">DC {sc.dc}{sc.needs ? ", by slip or renown" : ""}</span>
          </div>
        ))}
        <p className="text-xs text-gray-500">A few things they will do for you; the checks and what they bring are house rules.</p>
      </div>
    );
  };
  const tradePanel = (trader: Occupant, placeId: string) => {
    if (!world) return null;
    const wares = waresOf(trader)!;
    const [from, to] = openingHours(world, trader, placeId);
    if (!isOpen(world, trader, placeId, clock)) {
      return <p className="mt-1 text-xs text-amber-300" data-testid="trade-closed">{wares.label}: closed. Open {String(from % 24).padStart(2, "0")}:00 to {String(to % 24).padStart(2, "0")}:00 (house rule).</p>;
    }
    if (trader.trade === "droids") return droidShop(trader, placeId, wares.label);
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
        {shipServices(trader, placeId)}
        {trader.role === "ticket agent" && ships.length > 0 && (
          <div className="mt-1" data-testid="passage-options">
            <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setShipPick((v) => !v)} data-testid="passage-to-ship">Passage to your ship</Button>
            {shipPick && (
              <div className="mt-1 space-y-1 text-xs" data-testid="select-ship">
                <p className="text-gray-400">Select which ship (a shuttle fare of {PASSAGE_FARE} credits, house rule):</p>
                {ships.map((sh) => (
                  <div key={sh.id} className="flex items-center justify-between gap-2">
                    <span>{sh.name} <span className="text-gray-400">({shipPlace(sh)})</span></span>
                    <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => passageTo(sh)} data-testid={`passage-${sh.id}`}>Go</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-1 flex gap-1">
          <Button size="sm" variant={tradeTab === "buy" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTradeTab("buy")}>Buy</Button>
          <Button size="sm" variant={tradeTab === "sell" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTradeTab("sell")}>Sell</Button>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={!!haggled || inCombat || dead} onClick={() => haggle(trader, placeId)}>
            {haggled === "won" ? "Haggled: -10%" : haggled === "lost" ? "Offended" : haggled ? "Haggled" : "Haggle"}
          </Button>
        </div>
        <ul className="mt-1 max-h-72 overflow-y-auto space-y-0.5 text-xs" data-testid={tradeTab === "buy" ? "trade-stock" : "trade-offers"}>
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
          <Button size="sm" variant="outline" disabled={inCombat || dead || watched} onClick={() => stripDroid(o)} data-testid="droid-strip">
            Strip for parts (DC {harvestDc(tierOfCr(crNumber(o.cr)))})
          </Button>
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
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={async () => await toolRoll(name, a.dc!, a.activity)}>
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
  // Which kind of thing the Inventory tab lists
  const [invTab, setInvTab] = useState<"all" | "weapons" | "armor" | "gear" | "ships" | "speeders">("all");
  // The plain item whose modification slots are open, and the droid companion being customized
  const [modding, setModding] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState<string | null>(null);
  // Loading a ranged weapon out of a fight (a minute): a cell or generator fills it (a partly spent cell is swapped out and lost);
  // cartridges, bolts, darts and the like go in one a shot, and those of another kind come back out to the pack
  const loadWeapon = (weapon: string, round: string) => {
    const w = carriedWeapons(character).find((x) => x.name === weapon);
    const kit = ammoKit(w);
    if (!kit || kit.max <= 0) return;
    const equipment = [...((character.equipment ?? []) as string[])];
    const fills = ["cell", "generator"].includes(kit.family);
    const have = equipment.filter((n) => n === round).length;
    if (!have) return void toast.error(`You carry no ${round.toLowerCase()}.`);
    const per = kit.shotsPer[round] ?? 1;
    const take = fills ? 1 : Math.min(have, Math.ceil(kit.max / per));
    const old = kit.round ?? kit.plain;
    if (!fills && kit.left > 0 && old !== round) for (let i = 0; i < Math.ceil(kit.left / (kit.shotsPer[old] ?? 1)); i++) equipment.push(old);
    for (let i = 0; i < take; i++) equipment.splice(equipment.indexOf(round), 1);
    const shots = fills ? kit.max : Math.min(kit.max, take * per) + (old === round ? kit.left : 0);
    saveCharacter({ equipment, playState: { ...play, loads: { ...(play.loads ?? {}), [weapon]: { left: Math.min(kit.max, shots), round: round === kit.plain ? undefined : round } } } });
    saveCampaign(pass(1));
    toast.success(`${weapon} loaded with ${round.toLowerCase()}: ${Math.min(kit.max, shots)} shots.`);
  };
  // What a round, an accessory or a piece of gear does, in words, for the item's panel
  const riderText = (r: AmmoRider) => [
    r.base && `${r.base.dice} ${r.base.type} a hit`,
    r.becomes && `the damage becomes ${r.becomes}`,
    r.save && `a DC ${r.dc} ${r.save} save${r.dice ? ` against ${r.dice} ${r.type}` : ""}${r.condition ? `, or ${r.condition}` : ""}`,
    r.burst && `explodes ${r.burst.hitOrMiss ? "hit or miss " : ""}(${r.burst.radius} ft., DC ${r.burst.dc} ${r.burst.save}, ${r.burst.dice} ${r.burst.type})`,
    r.area && `a ${r.area.length}-foot ${r.area.shape} (DC ${r.area.dc} ${r.area.save}, ${r.area.dice} ${r.area.type}), three shots`,
    r.fire && `sets the ground ablaze (${r.fire.dice} fire a turn)`,
    r.finish && (r.finish.what === "frozen" ? "freezes the fallen in carbonite" : `disintegrates the fallen (DC ${r.finish.dc})`),
    r.restrains && `restrains until freed (DC ${r.restrains.dc})`,
  ].filter(Boolean).join("; ");
  // ---- Gear put on and powered gear (2026-10-21). Suits, clothes, masks and belts are put on (a few minutes, house rule); powered
  // gear runs on its charge (a glowrod 10 hours, a belt generator 10 minutes, a jetpack a minute a power cell ...: the item's text) and
  // is charged again by fitting a power cell, or free at a power source (a settlement or the party's ship, an hour: house rule)
  const POWERED: [RegExp, number][] = [[/^glowrod/i, 600], [/heat generator|gravity generator/i, 10], [/jetpack|propulsion pack|repulsor pack/i, 10], [/rocket boots|stealth field generator/i, 1], [/rocketpack/i, 5], [/underwater respirator/i, 120], [/^commlink/i, 600]];
  const rating = (name: string) => POWERED.find(([re]) => re.test(name))?.[1] ?? 0;
  const perCell = (name: string) => {
    const a = accessoryOf({ name, description: factsOf(name)?.description });
    return a.perCell ? a.minutes ?? 1 : /underwater respirator/i.test(name) ? 60 : rating(name);
  };
  const chargeOf = (name: string) => (running(name) ? Math.max(0, (play.running![name] ?? 0) - clockNow()) : play.charge?.[name] ?? rating(name));
  const atPowerSource = () => dayPlace().where !== "wild";
  const switchOn = (name: string) => {
    const left = chargeOf(name);
    if (left <= 0) return void toast.error(`${name} is out of charge: fit a power cell${atPowerSource() ? " or recharge it here" : ""}.`);
    patchPlay({ running: { ...(play.running ?? {}), [name]: clockNow() + left }, charge: { ...(play.charge ?? {}), [name]: 0 } });
    toast.success(`${name} on: ${left >= 60 ? `${Math.round(left / 6) / 10} hours` : `${left} minute${left === 1 ? "" : "s"}`} of charge.`);
  };
  const switchOff = (name: string) => {
    patchPlay({ running: { ...(play.running ?? {}), [name]: 0 }, charge: { ...(play.charge ?? {}), [name]: chargeOf(name) } });
  };
  const recharge = (name: string, withCell: boolean) => {
    const max = rating(name);
    if (withCell) {
      const equipment = [...((character.equipment ?? []) as string[])];
      const at = equipment.indexOf("Power cell");
      if (at < 0) return void toast.error("You carry no power cell.");
      equipment.splice(at, 1);
      saveCharacter({ equipment, playState: { ...play, charge: { ...(play.charge ?? {}), [name]: Math.min(max, chargeOf(name) + perCell(name)) } } });
    } else {
      patchPlay({ charge: { ...(play.charge ?? {}), [name]: max } });
      saveCampaign(pass(60));
    }
    toast.success(`${name} charged${withCell ? " with a power cell" : " at a power source (an hour)"}.`);
  };
  const putOn = (name: string, on: boolean) => {
    const wearing = new Set(play.wearing ?? []);
    if (on) wearing.add(name);
    else wearing.delete(name);
    patchPlay({ wearing: [...wearing] });
    saveCampaign(pass(/suit$/i.test(name) ? 5 : 1));
    toast.info(`${name} ${on ? "put on" : "taken off"}.`);
  };
  const powerRow = (name: string) => rating(name) > 0 && (
    <div className="flex flex-wrap items-center gap-1" data-testid="power-row">
      <span className="text-gray-300">{running(name) ? `On: ${chargeOf(name)} minutes left` : `Charge: ${chargeOf(name)} of ${rating(name)} minutes`}</span>
      <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => (running(name) ? switchOff(name) : switchOn(name))} data-testid="power-toggle">{running(name) ? "Switch off" : "Switch on"}</Button>
      <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !(character.equipment ?? []).includes("Power cell") || chargeOf(name) >= rating(name)} onClick={() => recharge(name, true)}>Fit a power cell</Button>
      {atPowerSource() && <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || chargeOf(name) >= rating(name)} onClick={() => recharge(name, false)}>Recharge here (1 h)</Button>}
    </div>
  );
  const wearRow = (name: string, what = "Put on") => {
    const on = wearingNow.includes(name);
    return <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => putOn(name, !on)} data-testid="wear-toggle">{on ? "Take off" : what}</Button>;
  };
  const gearPanel = (name: string, use: GearUse) => {
    const text = facts(name);
    const box = (children: ReactNode) => <div className="mt-1 space-y-1 text-xs" data-testid="gear-panel">{text && <p className="text-gray-400">{text}</p>}{children}</div>;
    switch (use.kind) {
      case "suit": {
        const air = airCapacity(name);
        return box(<>
          <p className="text-gray-300">Resists {use.suit.resist.join(", ") || "nothing"}{use.suit.immune.length ? `; immune to ${use.suit.immune.join(", ")}` : ""}{use.suit.protects.length ? `; keeps off ${use.suit.protects.join(", ")}` : ""}{use.suit.speed ? `; speed ${use.suit.speed} ft.` : ""}{use.suit.advantage.length ? `; advantage against ${use.suit.advantage.join(", ")}` : ""}.</p>
          {air > 0 && <p className="text-gray-300">Air: {play.air?.[name] ?? air} of {air} minutes.</p>}
          {wearRow(name)}
        </>);
      }
      case "air": {
        if (use.refill) {
          const targets = wearingNow.filter((n) => airCapacity(n) > 0 && (play.air?.[n] ?? airCapacity(n)) < airCapacity(n));
          return box(<>
            <p className="text-gray-300">Refills a suit or respirator: an hour's air for each ten minutes connected, {use.hours} hours in the tank.</p>
            {targets.map((n) => (
              <Button key={n} size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => {
                const tank = play.air?.[name] ?? use.hours * 60;
                const want = airCapacity(n) - (play.air?.[n] ?? airCapacity(n));
                const give = Math.min(tank, want);
                if (give <= 0) return void toast.error("The tank is empty.");
                patchPlay({ air: { ...(play.air ?? {}), [n]: (play.air?.[n] ?? airCapacity(n)) + give, [name]: tank - give } });
                saveCampaign(pass(Math.ceil(give / 6)));
                toast.success(`${n}: ${give} minutes of air from the tank (${Math.ceil(give / 6)} minutes connected).`);
              }} data-testid="air-refill">Refill {n}</Button>
            ))}
            {!targets.length && <p className="text-gray-500">Nothing you wear needs air.</p>}
          </>);
        }
        return box(<>
          <p className="text-gray-300">{use.underwater ? "Breathe underwater" : "Breathe in any air"}: {use.hours} hour{use.hours > 1 ? "s" : ""} {use.perCell ? "a power cell" : "of oxygen"}. Air left: {play.air?.[name] ?? airCapacity(name)} minutes.</p>
          {wearRow(name)}
        </>);
      }
      case "food":
        return box(<>
          <p className="text-gray-300">A day's food. In the wild one is eaten each day (with a gallon of water from what you carry); in a settlement your lifestyle feeds you.</p>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || supplies.hungry === 0} onClick={() => {
            const equipment = [...((character.equipment ?? []) as string[])];
            equipment.splice(equipment.indexOf(name), 1);
            saveCharacter({ equipment, playState: { ...play, supplies: { ...supplies, hungry: 0, lack: supplies.water > 0 ? 0 : supplies.lack } } });
            toast.success("You eat: the days without food start again from nought.");
          }} data-testid="eat">Eat it now</Button>
        </>);
      case "camp":
        return box(<p className="text-gray-300">{use.what === "shelter" ? "Six sleep sheltered from the elements, hot or cold (the book), for a week of its generator." : use.what === "tent" ? "Two sleep under cover: the cold of the night is kept off, and a long rest in the wild gives all its Hit Dice (house rule)." : use.what === "bedroll" ? "A long rest in the wild without one gives only a quarter of the Hit Dice back (house rule)." : use.what === "blanket" ? "Advantage on the night's Constitution save against the cold of an ice world (house rule)." : "Carries up to four across water: on an ocean world the party can go on foot between places (house rule)."}</p>);
      case "clothing":
        return box(<>
          <p className="text-gray-300">{use.style === "fine" || use.style === "uniform" ? "Worn: advantage on Persuasion with officials and the well-to-do, and the palace's checkpoint lets you by more readily (house rule)." : use.style === "costume" ? "Worn: advantage on Deception to pass as someone else (house rule)." : use.style === "clandestine" ? `Two hidden pockets (${use.pockets?.lb ?? 2} lb in all): what is in them is found only with a DC ${use.pockets?.dc ?? 15} Investigation check.` : use.style === "sunshades" ? "Worn: no disadvantage from direct sunlight; disadvantage in dim light (the book)." : use.style === "traveler" ? "Worn: advantage on the night's Constitution save against the cold (house rule)." : "Everyday clothes."}</p>
          {wearRow(name, "Wear")}
        </>);
      case "light":
        return box(<><p className="text-gray-300">Bright light {use.bright} ft. and dim {use.dim} ft. beyond: darkness no longer blinds you.</p>{powerRow(name)}</>);
      case "generator":
        return box(<><p className="text-gray-300">{use.answers === "cold" ? "Adapted to the cold while it runs." : "Standard gravity while it runs."}</p>{powerRow(name)}</>);
      case "mirror": {
        const beyond = world ? exits.filter((x) => x.via === "path" && !x.hidden && !x.needsShip && scene?.areas[x.to]?.kind === "room") : [];
        const peek = (x: Exit) => {
          const room = scene?.areas[x.to];
          if (!room) return;
          const seen = [...room.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ""}${o.name} (${o.disposition})`), ...room.ships.map((ship) => ship.name)];
          toast.info(`In the mirror, round the doorway of ${room.name}: ${seen.join(", ") || "nobody"}. (House rule: no check, and they do not see you.)`);
        };
        return box(<>
          <p className="text-gray-300">Held round the edge of a doorway, it shows who is in the next room without your stepping in. The books give a mirror no rules: house rule, no check.</p>
          {beyond.length === 0 ? <p className="text-gray-400">No door here leads to another room.</p> : <div className="flex flex-wrap gap-1">{beyond.map((x) => <Button key={x.to} size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => peek(x)} data-testid="mirror-peek">Look into {world?.areas[x.to]?.name}</Button>)}</div>}
        </>);
      }
      case "clock": {
        const now = clockNow();
        const hour = hourOf(now);
        const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
        const toDawn = Math.round(((7 - hour + 24) % 24) * 60) || 1440;
        const toDusk = Math.round(((18 - hour + 24) % 24) * 60) || 1440;
        const search = world ? pursuitAt(world, now, here?.id) : null;
        const lines = [
          `It is ${clockText(now)}, day ${dayOf(now)}.`,
          toDawn < toDusk ? `Dawn (07:00) in ${hm(toDawn)}.` : `Dusk (18:00) in ${hm(toDusk)}.`,
          world?.heist?.takeoffAt ? `${world.heist.shipName} lifts off in ${hm(Math.max(0, world.heist.takeoffAt - now))}.` : "",
          search ? (search.phase === "coming" ? `The officers arrive in ${hm(search.minutes)}.` : `The search is called off in ${hm(search.minutes)}.`) : "",
        ].filter(Boolean);
        return box(<>
          <ul className="space-y-0.5 text-gray-200" data-testid="clock-report">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="text-gray-400">Keeps exact time and the timers running (house rule; the book: it measures and keeps linear time).</p>
        </>);
      }
      case "dig":
        return box(<p className="text-gray-300">Digs: it serves as the kit for ore and plant finds of the first two tiers (standard and premium), without proficiency. Work a vein or a patch from its card. House rule; the books give a shovel no rules.</p>);
      case "pad":
      case "stylus": {
        const allowed = notesAllowed(carriedNames);
        const notes = (play.notes ?? []) as Note[];
        return box(<NotesPanel notes={notes} allowed={allowed} where={here?.name} onAdd={(t) => { const r = addNote(notes, t, dayOf(clockNow()), here?.name, allowed); if (r.error) return void toast.error(r.error); patchPlay({ notes: r.notes }); }} onDelete={(i) => patchPlay({ notes: notes.filter((_, k) => k !== i) })} />);
      }
      case "record": {
        const recs = (play.recordings ?? []) as Recording[];
        const record = () => {
          if (!world || !here || inCombat || dead) return;
          if (hostiles.length > 0) return void toast.error("Not with hostile eyes on you.");
          const room = hereNow ?? here;
          const rec: Recording = { id: dtId("rec"), areaId: here.id, where: here.name, day: dayOf(clockNow()), people: room.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ""}${o.name}`) };
          const limit = Math.max(1, 1 + Math.floor(((character.abilityScores?.intelligence ?? 10) - 10) / 2));
          commitDowntime({
            character: { playState: { ...play, recordings: addRecording(recs, rec) } },
            downtime: { lore: [...downtime.lore.filter((l) => l.where !== here.id || !l.topic.startsWith("Recording of")), { id: dtId("l"), topic: `Recording of ${here.name}`, where: here.id, whereName: here.name }].slice(-limit) },
            days: 0,
            log: [`Recorded ${here.name} with a holorecorder: lore of the place.`],
          });
          saveCampaign(pass(RECORD_MINUTES));
          toast.success(`${here.name} recorded: lore of the place (see Downtime), and the scene is kept.`);
        };
        return box(<>
          <p className="text-gray-300">Record this room ({RECORD_MINUTES} minutes): the scene is kept (the last {RECORD_LIMIT} places) and counts as a piece of lore of the place, spent in Downtime to find what is hidden there. House rule.</p>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !here} onClick={record} data-testid="record-room">Record {here?.name ?? "here"}</Button>
          {recs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2" data-testid="recording">
              <span>{r.where} <span className="text-gray-400">day {r.day}</span></span>
              <Button size="sm" variant="outline" className="h-5 px-2" onClick={() => toast.info(`${r.where}, day ${r.day}: ${r.people.join(", ") || "nobody"}.`)}>Play</Button>
            </div>
          ))}
        </>);
      }
      case "access":
        return box(<p className="text-gray-300">Opens a lock of DC 15 or less at once, with no check (house rule: the book says only that it grants access to secure areas).</p>);
      case "trace": {
        const calls = world ? tracedCalls(world.pursuit?.reports, (id) => world.areas[id]?.name ?? id, clockNow()) : [];
        return box(<>
          <p className="text-gray-300">Follows a transmission back to where it was made. Calls to security from anywhere in the district are listed with where they come from and when they are put through: get there first to stop them. Without one you only know of the calls made in the room you stand in. House rule.</p>
          {calls.length ? calls.map((c) => <p key={`${c.area}-${c.who}`} className="text-red-300" data-testid="traced-call">{c.who}, in {c.where}: put through in {c.minutes} min.</p>) : <p className="text-gray-400">No call is being made.</p>}
        </>);
      }
      case "teleport":
        return box(<p className="text-gray-300">Used in a fight, from Items (an action): step through a pair of linked portals to a free square in sight within {use.feet} ft., out beside the enemy picked out or away from every enemy; nothing provokes. The book lets anyone pass through the portals until the start of your next turn: not played (no one follows).</p>);
      case "scramble":
        return box(<p className="text-gray-300">Encodes what your commlink sends. While the law is searching, a call to a contact is overheard and tells the search where you are; a scrambled one is not (house rule). A jammer still cuts every call.</p>);
      case "translate": {
        const device = translatorSlots(name);
        const chosen = (play.translators?.[name] ?? []) as string[];
        const protocol = party.some((c) => /protocol|3po|c-3po/i.test(`${c.name} ${c.statBlock ?? ""}`));
        return box(<TranslatorPanel name={name} slots={device || use.languages} chosen={chosen} languages={lookupData.languages as string[]} known={(character.languages ?? []) as string[]} canChange={atPowerSource() || protocol} onChange={(next) => patchPlay({ translators: { ...(play.translators ?? {}), [name]: setLanguages(name, next) } })} />);
      }
      case "extinguisher":
        return box(<p className="text-gray-300">Used in a fight, from Items: a {use.cone}-foot cone of misty air puts out unenhanced fires and blinds (DC {use.dc} Constitution) until the start of their next turn those who fail; one who saves is immune to the mist. {usesLeft(name, use.uses)} of {use.uses} uses left.</p>);
      case "accessory":
        return box(<>
          <p className="text-gray-300">{accessoryText(use.facts)}</p>
          {rating(name) > 0 && powerRow(name)}
          {use.facts.brace?.minutes ? <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => { patchPlay({ tripodSet: !play.tripodSet }); saveCampaign(pass(1)); }}>{play.tripodSet ? "Fold the tripod" : "Set up the tripod (a minute)"}</Button> : null}
          {use.facts.detonator && (() => {
            const det = use.facts.detonator!;
            const pairs = play.paired ?? [];
            const mineNames = Array.from(new Set(carriedNames.filter((n) => { const u = gearOf(n); return u?.kind === "explosive" && u.form === "mine"; })));
            return (
              <div className="space-y-1" data-testid="detonator-pairs">
                <p className="text-gray-300">Paired: {pairs.length ? pairs.join(", ") : "none"} ({pairs.length} of {det.mines}). Pairing takes a minute (the book); a paired mine goes off only to the detonator, within {det.range} ft.</p>
                {mineNames.map((mine) => {
                  const have = carriedNames.filter((n) => n === mine).length;
                  const pairedN = pairs.filter((n) => n === mine).length;
                  return (
                    <div key={mine} className="flex flex-wrap gap-1">
                      {pairedN < have && <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || pairs.length >= det.mines} data-testid={`pair-${mine}`} onClick={() => { patchPlay({ paired: [...pairs, mine] }); saveCampaign(pass(1)); }}>Pair {mine} (a minute)</Button>}
                      {pairedN > 0 && <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`unpair-${mine}`} onClick={() => { const rest = [...pairs]; rest.splice(rest.indexOf(mine), 1); patchPlay({ paired: rest }); }}>Unpair {mine}</Button>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {(use.facts.carryFree || use.facts.climb || use.facts.fly || /holster|bandolier|belt|pouch|quiver|vest/i.test(name)) && wearRow(name, "Wear")}
        </>);
      default:
        return null;
    }
  };
  const facts = (name: string) => factsOf(name)?.description || GEAR.texts[name] || "";
  const accessoryText = (a: ReturnType<typeof accessoryOf>) => [
    a.reload && `reloads ${a.reload.families.join(", ")} without an action once a turn`,
    a.draw && "draws the weapon in it without an action",
    a.fly && `a flying speed of ${a.fly} ft.`,
    a.swim && `a swimming speed of ${a.swim} ft.`,
    a.descent && `falls slowed to ${a.descent} ft. a round: no falling damage`,
    a.minutes && `${a.minutes} minute${a.minutes > 1 ? "s" : ""}${a.perCell ? ` a power cell, ${a.maxMinutes} at most` : ""}`,
    a.climb && "a climbing speed equal to your walking speed",
    a.unarmed && `unarmed strikes deal ${a.unarmed.dice} ${a.unarmed.type} more`,
    a.stealth && "advantage on Stealth that relies on sight while it runs",
    a.carryFree && `${a.carryFree.items} light items (up to ${a.carryFree.each} lb) carried without counting toward encumbrance`,
    a.brace && `braces a two-handed blaster: its Strength requirement does not apply${a.brace.prone ? " (prone)" : ""}, speed 0`,
    a.detonator && `sets off up to ${a.detonator.mines} mines paired with it, within ${a.detonator.range} ft.`,
    a.launcher && `fires rockets (${a.launcher.normal}/${a.launcher.long} ft.)`,
  ].filter(Boolean).join("; ") + ".";
  const usePanel = (name: string) => {
    const use = gearOf(name);
    const facts = factsOf(name);
    if (!use) return null;
    const panel = gearPanel(name, use);
    if (panel) return panel;
    if (use.kind === "ammo") {
      const weapons = carriedWeapons(character).filter((w) => !w.natural && ammoKit(w)?.family === use.family && (ammoKit(w)?.max ?? 0) > 0);
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="ammo-panel">
          <p className="text-gray-300">{riderText(use.rider) || "Plain rounds."} {facts?.description ? "" : ""}</p>
          {weapons.map((w) => {
            const kit = ammoKit(w)!;
            return (
              <div key={w.name} className="flex items-center gap-1">
                <span className="flex-1">{w.name}: {kit.left}/{kit.max} ({(kit.round ?? kit.plain).toLowerCase()})</span>
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => loadWeapon(w.name, name)} data-testid="ammo-load">Load it (a minute)</Button>
              </div>
            );
          })}
          {!weapons.length && <p className="text-gray-400">{use.family === "arrow" ? "A bow draws these one at a time in a fight." : "No weapon you carry takes these."}</p>}
          <p className="text-gray-500">In a fight each shot spends a round; reloading is an action or a bonus action (free with an ammo pouch, power belt, bandolier, quiver or feed belt). A weapon never fired comes loaded (house rule).</p>
        </div>
      );
    }
    if (use.kind === "calibrator") {
      const fits = carriedWeapons(character).find((w) => !w.ranged && w.type.toLowerCase().includes(use.weapon));
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="calibrator-panel">
          <p className="text-gray-300">+{use.damage} damage{use.property ? ` and the ${use.property} property` : ""} on a {use.weapon}, for a minute (the next fight).</p>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !fits} onClick={() => {
            const spent = consume(name);
            saveCharacter({ equipment: spent.equipment, playState: { ...play, buffs: [...(play.buffs ?? []).filter((b) => b.kind !== "collimator"), { name, kind: "collimator", effects: { damage: use.damage, properties: use.property ? [use.property] : [] }, weapon: use.weapon, fight: true }] } });
            toast.success(`${name} applied to your ${fits!.name}: +${use.damage} damage${use.property ? `, ${use.property}` : ""} for the next fight.`);
          }} data-testid="calibrator-apply">{fits ? `Apply to ${fits.name}` : `Wield a ${use.weapon} first`}</Button>
        </div>
      );
    }
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
    if (use.kind === "heal" || use.kind === "repair" || use.kind === "stabilize" || use.kind === "antidote" || use.kind === "substance" || use.kind === "vitapac") {
      const droid = use.kind === "repair" || (use.kind === "stabilize" && use.target === "droid");
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="use-panel">
          {text}
          {use.kind === "substance" && <p className="text-yellow-300">A high waits for your next check or fight; a low follows (a Wisdom save), then a Constitution save against addiction. Addiction level {addictionLevel}.</p>}
          <div className="flex flex-wrap gap-1">
            {people.filter((p) => (use.kind === "substance" || use.kind === "antidote" || use.kind === "vitapac" ? p.id === "self" : droid ? p.id !== "self" : true)).map((p) => (
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
          <p className="text-gray-300">{use.form === "grenade" || use.form === "detonator" ? "Thrown in a fight (Items, in the combat panel)." : use.form === "mine" ? "Set where you stand in a fight (Items, in the combat panel): it arms at the start of your next turn and goes off for anyone but the party who comes within its radius, or to a remote detonator it was paired with. Also blows a locked door." : "Set against a locked door to blow it (Forcing a door)."} Radius {use.radius} ft., DC {use.dc} {use.save}{use.damage.length ? `, ${use.damage.map((d) => `${d.dice} ${d.type}`).join(" and ")}` : ""}.</p>
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
    if (use.kind === "jammer") {
      const on = (play.jammerUntil ?? 0) > clockNow();
      return (
        <div className="mt-1 space-y-1 text-xs">
          {text}
          <p className="text-gray-300">{on ? `Running for ${Math.round((play.jammerUntil! - clockNow()))} more minutes: no alarm goes up.` : "Switch it on for an hour (house rule): comms in this district are jammed, so no call reaches security or goes out, and no alarm goes up through the building."}</p>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={on || inCombat || dead} onClick={() => saveCharacter({ playState: { ...play, jammerUntil: clockNow() + 60 } })}>Switch it on</Button>
        </div>
      );
    }
    if (use.kind === "data") {
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="data-panel">
          {text}
          <p className="text-gray-300">
            {use.form === "chip" ? `Crack it (Intelligence, a slicer's kit, DC ${use.dc}; +5 without one): credits.` : use.form === "card" ? "Read it on a datapad, wristpad or holocomm (Intelligence, DC 12): lore of a place, a blueprint or credits." : use.form === "cron" ? `Crack it (Intelligence, DC ${use.dc}): lore, a blueprint or credits.` : use.form === "blueprint" ? `Learn it (Intelligence with the right tools, DC ${use.dc}, an hour): the blueprint of an item of ${(use.rarity ?? "standard").toLowerCase()} rarity; a miss waits 24 hours (the book).` : "Open it with the Force (Wisdom, DC 15): lore or a blueprint."}${use.form === "blueprint" ? "" : " Ten minutes; house rule."}
          </p>
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid="read-data" onClick={() => readData(name, use)}>{use.form === "chip" ? "Crack it" : "Read it"}</Button>
        </div>
      );
    }
    if (use.kind === "call") {
      const day = dayOf(useClock.getState().minutes);
      const allied = downtime.contacts.filter((c) => c.kind === "allied");
      return (
        <div className="mt-1 space-y-1 text-xs" data-testid="call-panel">
          {text}
          <p className="text-gray-300">Call an allied contact (30 miles; house rule): they tell you what is kept at a place near them, once a day each. Contacts are made in Downtime.{(play.jammerUntil ?? 0) > clockNow() ? " Your comm is jammed: no call goes out." : ""}</p>
          {allied.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span>{c.name} <span className="text-gray-400">{c.whereName}</span></span>
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || (play.called?.[c.id] ?? -1) === day || (play.jammerUntil ?? 0) > clockNow()} data-testid={`call-${c.id}`} onClick={() => callContact(c.id)}>Call</Button>
            </div>
          ))}
          {!allied.length && <p className="text-gray-400">No allied contacts yet.</p>}
        </div>
      );
    }
    if (use.kind === "beacon") return <div className="mt-1 space-y-1 text-xs">{text}<p className="text-gray-300">Left on a ship from its card on the map; where it flies is then listed under your companions.</p></div>;
    return <div className="mt-1 text-xs text-gray-300">{text}{use.kind === "bolt" ? <p>Fitted to a powered-down droid from its card.</p> : use.kind === "binders" ? <p>Restrains a Small or Medium creature (DC {use.dc} Strength or Dexterity save).</p> : use.kind === "spike" ? <p>Spent automatically to reroll a failed {use.tool.toLowerCase()} check on a lock.</p> : use.kind === "ram" ? <p>Forcing a locked door gives +{use.bonus}, and advantage with a helper.</p> : use.kind === "cutter" ? <p>Cuts a locked door open in ten minutes for each 5 of its DC.</p> : null}</div>;
  };

  // ---- Enhanced items (Wretched Hives, "Enhanced Items"): attunement, stimpacs and the like,
  // cybernetic augmentation. What an item does is read from its text on the server (itemFacts).
  const factsOfItem = (name: string): ItemFacts | undefined => itemFacts?.[name.toLowerCase()];
  const attuned: string[] = play.attuned ?? [];
  // A plain item with modifications fitted needs attunement too: one slot, two from advanced up
  const attuneCost = (name: string) => factsOfItem(name)?.attune ?? (rarityRank(play.fitted?.[name]?.rarity ?? "standard") >= 3 ? 2 : 1);
  const slotsUsed = attuned.reduce((n, a) => n + attuneCost(a), 0);
  const slotsMax = attunementLimit(level);
  // "One ability score (chosen by the GM) decreases by 1": house rule, one of the others at random,
  // chosen when the item is attuned or installed and kept
  const sideFor = (f: ItemFacts) => {
    const raised = Object.keys(f.effects.raiseScores ?? {});
    const others = ITEM_ABILITIES.filter((a) => !raised.includes(a));
    return others[Math.floor(Math.random() * others.length)];
  };
  const withSide = (f: ItemFacts) => (f.effects.falls ? { ...(play.sides ?? {}), [f.name]: sideFor(f) } : play.sides);
  const attune = (name: string) => {
    const f = factsOfItem(name);
    const cost = attuneCost(name);
    if ((!f && !play.fitted?.[name]?.mods?.length) || inCombat || dead || attuned.includes(name)) return;
    if (hostiles.length) return speed("Not with armed enemies in the room.");
    if (slotsUsed + cost > slotsMax) return speed(`Attunement is full (${slotsUsed} of ${slotsMax} slots): break one first.`);
    saveCharacter({ playState: { ...play, attuned: [...attuned, name], sides: f ? withSide(f) : play.sides } });
    saveCampaign(pass(60));
    toast.success(`Attuned to ${name} (an hour; house rule, the book says a short rest).${f?.effects.falls ? " It has a side effect: another ability score is lower by 1." : ""}`);
  };
  const unattune = (name: string) => {
    if (inCombat || dead) return;
    saveCharacter({ playState: { ...play, attuned: attuned.filter((n) => n !== name) } });
    saveCampaign(pass(60));
    toast.info(`No longer attuned to ${name}.`);
  };
  // A stimpac, adrenal, barrier or collimator: one of each kind at a time. Those that last a
  // minute or a fight (and a barrier, a house rule) wait for the next fight and end with it.
  const takeTimed = (name: string) => {
    const f = factsOfItem(name);
    const t = f?.timed;
    if (!f || !t || inCombat || dead) return;
    if (t.kind === "collimator" && !carriedWeapons(character).some((w) => !w.natural && w.type.toLowerCase().includes(t.weapon ?? "")))
      return speed(`Wield a ${t.weapon} to apply it to.`);
    const buff = { name: f.name, kind: t.kind, effects: t.effects, weapon: t.weapon, fight: t.kind === "barrier" || t.minutes <= 1, until: clockNow() + t.minutes };
    const spent = consume(name);
    saveCharacter({ equipment: spent.equipment, playState: { ...play, charges: spent.charges, buffs: [...(play.buffs ?? []).filter((b) => b.kind !== t.kind), buff] } });
    toast.success(`${f.name}: ${describeEffects(t.effects) || "applied"}${buff.fight ? ", for the next fight" : `, for ${t.minutes / 60} hour${t.minutes > 60 ? "s" : ""}`}.`);
  };
  // What waits for a fight ends with it
  const wasFighting = useRef(false);
  useEffect(() => {
    if (inCombat) wasFighting.current = true;
    else if (wasFighting.current) {
      wasFighting.current = false;
      if ((play.buffs ?? []).some((b) => b.fight)) saveCharacter({ playState: { ...play, buffs: (play.buffs ?? []).filter((b) => !b.fight) } });
    }
  }, [inCombat]);

  // Cybernetic augmentation at a medic (house rule: the surgeon's check is d20 + 5). The book's
  // time, cost and DC: 8 hours (by size) at 100 credits an hour, a check against the rarity's DC;
  // a failed enhancement is a level of exhaustion, a failed replacement a part lost for as long as
  // the work took (shown, not enforced); removal takes half, a failure destroys the augmentation.
  const SURGEON_BONUS = 5;
  const sizeOfPatient = "medium";
  const partsTaken = (play.augments ?? []).flatMap((a) => a.parts);
  // `price`: bought from the surgeon at that price and fitted at once (the part is not in the pack yet)
  const installAugment = (name: string, price = 0) => {
    if (inCombat || dead || !world) return false;
    const refuse = (what: string) => { speed(what); return false; };
    const f = factsOfItem(name);
    const prosthesis = PROSTHESES[name.toLowerCase()];
    const parts = f?.parts ?? prosthesis ?? [];
    const rarity = f?.rarity ?? "Standard";
    if (!f && !prosthesis) return false;
    const counted = (play.augments ?? []).filter((a) => !a.prosthesis).length;
    if (!prosthesis && counted >= augmentationLimit(level)) return refuse(`Your body supports ${augmentationLimit(level)} augmentations (your proficiency bonus; prostheses are extra).`);
    if (!partsFree(partsTaken, parts)) return refuse("That part of the body already has a replacement.");
    const plan = augmentPlan(rarity, sizeOfPatient);
    if ((character.credits ?? 0) < plan.cost + price) return refuse(`The surgeon wants ${money(plan.cost + price)} (${plan.hours} hours at 100 credits${price ? `, and ${money(price)} for the part` : ""}).`);
    const roll = die(20);
    const total = roll + SURGEON_BONUS;
    const ok = total >= plan.dc;
    const spent = price ? { equipment: [...((character.equipment ?? []) as string[])], charges: play.charges ?? {} } : consume(name);
    const changes: Record<string, any> = { credits: (character.credits ?? 0) - plan.cost - price };
    // (a part bought and not fitted by a failed operation is yours to try again with)
    if (!ok && price) changes.equipment = [...spent.equipment, name];
    if (ok) {
      changes.equipment = spent.equipment;
      changes.playState = { ...play, charges: spent.charges, augments: [...(play.augments ?? []), { name, parts, ...(prosthesis ? { prosthesis: true } : {}) }], sides: f ? withSide(f) : play.sides };
    } else if (f?.augment === "enhancement") changes.exhaustionLevel = Math.min(6, (character.exhaustionLevel ?? 0) + 1);
    saveCharacter(changes);
    saveCampaign(pass(plan.hours * 60));
    toast[ok ? "success" : "error"](
      ok
        ? `${name} fitted (surgeon ${roll} + ${SURGEON_BONUS} = ${total} against DC ${plan.dc}; ${plan.hours} hours, ${money(plan.cost)}).${f?.effects.falls ? " A side effect lowers another ability score by 1." : ""}`
        : `The work on ${name} failed (${roll} + ${SURGEON_BONUS} = ${total} against DC ${plan.dc}); the time and ${money(plan.cost)} are spent.${f?.augment === "enhancement" ? " A level of exhaustion." : f?.augment === "replacement" ? ` You are without that part for ${plan.hours} hours (house rule: shown, not enforced).` : ""}`,
    );
    return true;
  };
  const removeAugment = (index: number) => {
    if (inCombat || dead) return;
    const a = (play.augments ?? [])[index];
    if (!a) return;
    const f = factsOfItem(a.name);
    const plan = augmentPlan(f?.rarity ?? "Standard", sizeOfPatient, true);
    if ((character.credits ?? 0) < plan.cost) return speed(`The surgeon wants ${money(plan.cost)}.`);
    const roll = die(20);
    const ok = roll + SURGEON_BONUS >= plan.dc;
    const next = (play.augments ?? []).filter((_, i) => i !== index);
    const { [a.name]: _gone, ...sides } = play.sides ?? {};
    saveCharacter({ credits: (character.credits ?? 0) - plan.cost, ...(ok ? { equipment: [...(character.equipment ?? []), a.name] } : {}), playState: { ...play, augments: next, sides } });
    saveCampaign(pass(plan.hours * 60));
    toast[ok ? "success" : "error"](`${a.name} removed (${roll} + ${SURGEON_BONUS} against DC ${plan.dc}): ${ok ? "salvaged" : "destroyed in the removal"}. ${plan.hours} hours, ${money(plan.cost)}.`);
  };
  // Passage off world, sold by a ticket agent at the port, or by a smuggler who asks no questions, or
  // slipped into the hold of a freighter (see "Passage off world" in shared logic; house rule)
  const bookPassage = async (offer: PassageOffer, how: "ticket" | "smuggler" | "stowaway") => {
    if (!world || !here || inCombat || dead) return;
    const law = lawAt(world, here.id);
    const fare = how === "ticket" ? offer.fare : how === "smuggler" ? Math.ceil(offer.fare * SMUGGLER_SHARE) : 0;
    if (fare > (character.credits ?? 0)) return void toast.error(`Passage to ${offer.name} costs ${fare} credits and you have ${character.credits ?? 0}.`);
    if (how !== "ticket" && law > 0) {
      const dc = passageCheckDC(how, law);
      const ok = how === "smuggler" ? await abilityCheck("Fooling the customs scan", dc, ["charisma"], skilled("deception")) : await abilityCheck("Slipping aboard unseen", dc, ["dexterity"], skilled("stealth"));
      if (cancelledCheck.current) return;
      if (!ok) {
        const fine = how === "stowaway" ? Math.min(character.credits ?? 0, stowawayFine(law)) : 0;
        if (fine) saveCharacter({ credits: (character.credits ?? 0) - fine });
        saveCampaign({ galaxyMap: reportCrime(world, here.id, "trespass", clockNow()), ...pass(10) });
        return void toast.error(how === "smuggler" ? "The customs scan flags the hold, and the smuggler is gone. Nothing was paid; the port is roused." : `Caught in the hold${fine ? `: fined ${fine} credits` : ""}. The port is roused.`);
      }
    }
    if (fare) {
      saveCharacter({ credits: (character.credits ?? 0) - fare });
      toast.info(`${how === "smuggler" ? "Passage paid under the table" : "Ticket bought"}: ${fare} credits (house rule: the books price no fares).`);
    }
    const changes: Record<string, any> = { currentLocation: offer.to, ...pass(offer.minutes) };
    setCameFrom(here.id);
    toast.info(`${Math.round(offer.minutes / 6) / 10} hours to ${offer.name}: it is ${clockText(useClock.getState().minutes)}.`);
    if (childrenOf(world, offer.to).length === 0) explore(offer.to, changes);
    else saveCampaign(changes);
  };
  const passagePanel = (agent: Occupant) => {
    if (!world || !here) return null;
    const dealer = agent.role === "smuggler";
    const offers = passageOffers(world, berthOf(world, here.id), passageRate).slice(0, 6);
    if (!offers.length) return <p className="mt-1 text-xs text-gray-400">No lanes lead out of here that anyone sells passage on.</p>;
    const law = lawAt(world, here.id);
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid={`passage-${agent.id}`}>
        <p className="font-semibold text-gray-200">{dealer ? "Off world, no questions" : "Tickets off world"}</p>
        <p className="text-gray-400">
          {dealer
            ? `${Math.round(SMUGGLER_SHARE * 100)}% of the fare; ${law > 0 ? `Deception DC ${passageCheckDC("smuggler", law)} to fool the customs scan (a failure reports you), or Stealth DC ${passageCheckDC("stowaway", law)} to ride in the hold for free.` : "no customs here to fool."}`
            : "Berths on the liners, a half hour's wait to board. House rule: the books price no fares."}
        </p>
        {offers.map((offer) => {
          const fare = dealer ? Math.ceil(offer.fare * SMUGGLER_SHARE) : offer.fare;
          return (
            <div key={offer.to} className="flex flex-wrap items-center justify-between gap-1">
              <span>
                {offer.name} <span className="text-gray-400">({offer.system}, {rideText(offer.minutes)})</span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => bookPassage(offer, dealer ? "smuggler" : "ticket")} data-testid={`passage-buy-${offer.to}`}>
                  {fare} cr
                </Button>
                {dealer && (
                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => bookPassage(offer, "stowaway")}>
                    Stow away
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // What the surgeon sells today (the prostheses the place can afford, three to five augmentations by the wealth of the place); bought, the
  // part is carried, to be fitted now or later
  const buyOfSurgeon = (surgeon: Occupant, line: SurgeonLine, fit: boolean) => {
    if (inCombat || dead) return;
    if (line.price > (character.credits ?? 0)) return void toast.error(`${line.name} costs ${money(line.price)}.`);
    const sold = () => recordDeal(surgeon.id, (e) => ({ ...e, bought: { ...e.bought, [line.name]: (e.bought[line.name] ?? 0) + 1 } }));
    if (fit) return void (installAugment(line.name, line.price) && sold());
    sold();
    saveCharacter({ credits: character.credits - line.price, equipment: [...(character.equipment ?? []), line.name] });
    toast.success(`${line.name} bought for ${money(line.price)}; have it fitted here or later.`);
  };
  const augmentPanel = (surgeon: Occupant, placeId: string) => {
    const waiting = Array.from(new Set<string>((character.equipment ?? []).filter((n: string) => factsOfItem(n)?.type === "CyberneticAugmentation" || PROSTHESES[n.toLowerCase()])));
    const installed = play.augments ?? [];
    const sale = world ? surgeonStock(world, surgeon, placeId, today, enhancedRows, equipmentData as any, traderLedger(surgeon.id).bought) : [];
    if (!waiting.length && !installed.length && !sale.length) return null;
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid={`augment-${surgeon.id}`}>
        {sale.length > 0 && (
          <div className="space-y-0.5" data-testid="surgeon-stock">
            <p className="font-semibold text-gray-200">For sale</p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {sale.map((l) => {
                const plan = augmentPlan(l.rarity, sizeOfPatient);
                return (
                  <li key={l.name} className="flex flex-wrap items-center gap-1" data-testid="surgeon-line">
                    <span className="flex-1">{l.name} <span className="text-gray-400">{l.kind === "prosthesis" ? "prosthesis" : l.rarity}, surgery DC {plan.dc}</span></span>
                    <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || l.price > (character.credits ?? 0)} onClick={() => buyOfSurgeon(surgeon, l, false)} data-testid="surgeon-buy">Buy {l.price.toLocaleString("en-GB")} cr</Button>
                    <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || l.price + plan.cost > (character.credits ?? 0)} onClick={() => buyOfSurgeon(surgeon, l, true)} data-testid="surgeon-fit">and fit it (+{plan.cost.toLocaleString("en-GB")} cr)</Button>
                  </li>
                );
              })}
            </ul>
            <p className="text-gray-500">House rule: Wretched Hives has augmentations found, made or installed; here the surgeon sells them at their value, as many as the wealth of the place allows (never legendary or artifact).</p>
          </div>
        )}
        {(waiting.length > 0 || installed.length > 0) && <p className="font-semibold text-gray-200">Surgery</p>}
        <p className="text-gray-400">8 hours (a Medium patient) at 100 credits an hour, a check against the item's rarity (DC 10 to 30); the surgeon rolls d20 + {SURGEON_BONUS} (house rule). Your body supports {augmentationLimit(level)} augmentations; prostheses are extra.</p>
        {waiting.map((name) => {
          const f = factsOfItem(name);
          const plan = augmentPlan(f?.rarity ?? "Standard", sizeOfPatient);
          return (
            <div key={name} className="flex items-center justify-between gap-2">
              <span>{name} <span className="text-gray-400">DC {plan.dc}, {money(plan.cost)}</span></span>
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`install-${name}`} onClick={() => installAugment(name)}>Fit it</Button>
            </div>
          );
        })}
        {installed.map((a, i) => (
          <div key={`${a.name}-${i}`} className="flex items-center justify-between gap-2">
            <span>{a.name} <span className="text-gray-400">fitted</span></span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`remove-${a.name}`} onClick={() => removeAugment(i)}>Remove</Button>
          </div>
        ))}
      </div>
    );
  };

  // ---- Modifiable items (Wretched Hives, "Modifiable Items", with the "Common Modifications"
  // variant as the setting: every plain weapon, armor, shield, wristpad, focus generator and piece
  // of clothing is a standard chassis with four slots). A fitting takes an hour and a check with
  // the item's tool against the modification's DC; a failure waits a day. House rule: the book
  // wants proficiency with the tool; without it you may try with the tool at DC +5.
  const squashN = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
  const kitFor = (kind: string) => {
    const word = kind.toLowerCase();
    const t = toolData.find((x) => (x.worksOn ?? "").toLowerCase().includes(word));
    const owned = t ? ((character.equipment ?? []) as string[]).find((n) => squashN(n) === squashN(t.name)) : undefined;
    return { tool: t?.name, owned };
  };
  const fitOf = (name: string): Fitted & { crystalMax?: string } => play.fitted?.[name] ?? { rarity: "Standard", mods: [] };
  const writeFit = (name: string, fit: Fitted & { crystalMax?: string }, extra: Record<string, any> = {}) =>
    saveCharacter({ ...extra, playState: { ...((extra.playState as any) ?? play), fitted: { ...(play.fitted ?? {}), [name]: fit } } });
  const tinkerWait = () => (play.tinkerUntil ?? 0) > clockNow();
  // The check of a fitting: whoever does the work (the dialog asks who, and with what) rolls Intelligence with the tool
  const modCheck = async (what: string, rarity: string, tool: string) => {
    const trained = trainedWith(tool);
    const dc = (INSTALL_DC[rarity.toLowerCase()] ?? 10) + (trained ? 0 : 5);
    const r = await toolRoll(tool, dc, what);
    return { ok: !!r.success && !r.cancelled, dc };
  };
  const installMod = async (item: string, mod: string) => {
    const f = factsOfItem(mod);
    const base = factsOf(item);
    const kind = base ? modKindOf({ name: item, equipmentCategory: base.equipmentCategory, weaponClassification: (base as any).weaponClassification }) : undefined;
    if (!f?.modKind || !kind || inCombat || dead) return;
    const fit = fitOf(item);
    const augment = f.modKind === "augment";
    const problem = modFitProblem(f, kind, fit, factsOfItem);
    if (problem) return speed(problem);
    if (tinkerWait()) return speed("A failed fitting waits a day before the next try (the book).");
    const { tool, owned } = kitFor(augment ? "augment" : kind);
    if (!owned) return speed(`You need ${tool ?? "the right tools"} for this.`);
    const { ok, dc } = await modCheck(`Fit ${f.name}`, f.rarity, owned);
    if (cancelledCheck.current) return;
    const time = pass(60);
    if (!ok) {
      saveCharacter({ playState: { ...play, tinkerUntil: clockNow() + 24 * 60 } });
      return void saveCampaign(time);
    }
    const spent = consume(mod);
    writeFit(item, { ...fit, mods: [...fit.mods, f.name] }, { equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
    saveCampaign(time);
    toast.success(`${f.name} fitted in ${item} (DC ${dc}).${(play.attuned ?? []).includes(item) ? "" : " It works once the item is attuned."}`);
  };
  const removeMod = async (item: string, mod: string) => {
    const f = factsOfItem(mod);
    if (inCombat || dead) return;
    const fit = fitOf(item);
    const base = factsOf(item);
    const kind = base ? modKindOf({ name: item, equipmentCategory: base.equipmentCategory, weaponClassification: (base as any).weaponClassification }) : undefined;
    const { tool, owned } = kitFor(f?.modKind === "augment" ? "augment" : kind ?? "");
    if (!owned) return speed(`You need ${tool ?? "the right tools"} for this.`);
    const { ok } = await modCheck(`Remove ${mod}`, f?.rarity ?? "Standard", owned);
    if (cancelledCheck.current) return;
    const mods = fit.mods.filter((m, i) => !(m === mod && i === fit.mods.indexOf(mod)));
    writeFit(item, { ...fit, mods }, ok ? { equipment: [...(character.equipment ?? []), mod] } : {});
    saveCampaign(pass(60));
    toast[ok ? "success" : "error"](ok ? `${mod} removed and salvaged.` : `${mod} was destroyed in the removal.`);
  };
  // A chassis item upgrades a plain item's rarity, one step at a time (house rule: the chassis
  // itself is the rare material the book asks for). 8 hours; a failure waits a day and on a 1 a
  // modification is destroyed.
  const upgradeChassis = async (item: string, chassisName: string) => {
    const c = factsOfItem(chassisName);
    const fit = fitOf(item);
    if (!c?.chassis || inCombat || dead) return;
    if (rarityRank(c.rarity) !== rarityRank(fit.rarity) + 1) return speed(`One step at a time: this item is ${fit.rarity.toLowerCase()}, so it takes a ${RARITY_ORDER[rarityRank(fit.rarity) + 1] ?? "better"} chassis.`);
    if (tinkerWait()) return speed("A failed fitting waits a day before the next try (the book).");
    const { tool, owned } = kitFor(c.chassis);
    if (!owned) return speed(`You need ${tool ?? "the right tools"} for this.`);
    const { ok } = await modCheck(`Upgrade ${item} to ${c.rarity}`, c.rarity, owned);
    if (cancelledCheck.current) return;
    const time = pass(8 * 60);
    if (!ok) {
      const lost = die(20) === 1 && fit.mods.length ? fit.mods[Math.floor(Math.random() * fit.mods.length)] : undefined;
      if (lost) writeFit(item, { ...fit, mods: fit.mods.filter((m) => m !== lost) }, { playState: { ...play, tinkerUntil: clockNow() + 24 * 60 } });
      else saveCharacter({ playState: { ...play, tinkerUntil: clockNow() + 24 * 60 } });
      saveCampaign(time);
      return void toast.error(`The upgrade failed.${lost ? ` ${lost} was destroyed.` : ""}`);
    }
    const spent = consume(chassisName);
    writeFit(item, { ...fit, rarity: c.rarity }, { equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
    saveCampaign(time);
    toast.success(`${item} is now a ${c.rarity.toLowerCase()} chassis: ${MOD_BASE_SLOTS} slots${augmentSlots(c.rarity) ? ` and ${augmentSlots(c.rarity)} augment` : ""}.`);
  };
  // A color crystal for a lightweapon (Forcecasting Color Crystal Modifier): a universal
  // forcecasting check (the better of Wisdom and Charisma, with proficiency) gives the d100's
  // modifier; the crystal is the color rolled, or any lower in the table
  const findCrystal = (item: string) => {
    if (inCombat || dead) return;
    const roll = die(20);
    const bonus = Math.max(modifier(character.abilityScores?.wisdom), modifier(character.abilityScores?.charisma)) + proficiency;
    const mod = crystalModifier(roll + bonus);
    const d100 = die(100);
    const color = crystalFor(Math.max(1, d100 + mod));
    writeFit(item, { ...fitOf(item), crystal: color, crystalMax: color });
    saveCampaign(pass(60));
    toast.success(`Crystal for ${item}: check ${roll + bonus} (${mod >= 0 ? "+" : ""}${mod} to the d100), rolled ${d100}: ${color}. You may choose a lower one.`);
  };
  // A technician fits a modification for a fee (an hour, no check, no kit: house rule); `price` is what a part just bought costs
  const fitAtShop = (trader: Occupant | null, item: string, mod: string, price = 0) => {
    if (inCombat || dead) return;
    const f = factsOfItem(mod);
    const base = factsOf(item);
    const kind = base ? modKindOf({ name: item, equipmentCategory: base.equipmentCategory, weaponClassification: (base as any).weaponClassification }) : undefined;
    if (!f?.modKind) return void toast.error("The facts of that modification are still loading.");
    const fit = fitOf(item);
    const problem = modFitProblem(f, kind, fit, factsOfItem);
    if (problem) return speed(problem);
    const fee = modFee(f.rarity);
    if ((character.credits ?? 0) < fee + price) return speed(`That comes to ${money(fee + price)}.`);
    if (price && trader) recordDeal(trader.id, (e) => ({ ...e, bought: { ...e.bought, [mod]: (e.bought[mod] ?? 0) + 1 } }));
    const spent = price ? { equipment: [...((character.equipment ?? []) as string[])], charges: play.charges ?? {} } : consume(mod);
    writeFit(item, { ...fit, mods: [...fit.mods, f.name] }, { credits: (character.credits ?? 0) - fee - price, equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
    saveCampaign(pass(MOD_FIT_HOURS * 60));
    toast.success(`${f.name} fitted in ${item} by the technician (${money(fee + price)}, an hour, no check).${(play.attuned ?? []).includes(item) ? "" : " It works once the item is attuned."}`);
  };
  // What the party's items would take of a modification: those it fits (the kind, rarity and slots)
  const itemsFor = (mod: string, limit = 3): string[] => {
    const f = factsOfItem(mod);
    if (!f?.modKind) return [];
    return Array.from(new Set<string>((character.equipment ?? []) as string[])).filter((n) => {
      const base = factsOf(n);
      const kind = base ? modKindOf({ name: n, equipmentCategory: base.equipmentCategory, weaponClassification: (base as any).weaponClassification }) : undefined;
      return !!kind && !modFitProblem(f, kind, fitOf(n), factsOfItem);
    }).slice(0, limit);
  };
  const buyMod = (trader: Occupant, line: ModLine, fitTo?: string) => {
    if (inCombat || dead) return;
    if (line.price > (character.credits ?? 0)) return void toast.error(`${line.name} costs ${money(line.price)}.`);
    if (fitTo) return fitAtShop(trader, fitTo, line.name, line.price);
    recordDeal(trader.id, (e) => ({ ...e, bought: { ...e.bought, [line.name]: (e.bought[line.name] ?? 0) + 1 } }));
    saveCharacter({ credits: character.credits - line.price, equipment: [...(character.equipment ?? []), line.name] });
    toast.success(`${line.name} bought for ${money(line.price)}; fit it yourself with the right tools, or have a technician do it for a fee.`);
  };
  const modsPanel = (trader: Occupant, placeId: string) => {
    if (!world) return null;
    const lines = modStock(world, trader, placeId, today, enhancedRows, traderLedger(trader.id).bought);
    const carriedMods = Array.from(new Set<string>((character.equipment ?? []) as string[])).filter((n) => !!factsOfItem(n)?.modKind);
    if (!lines.length) return null;
    return (
      <div className="space-y-0.5" data-testid="mod-shop">
        <p className="font-semibold text-gray-300">{trader.trade === "salvage" ? "Used modifications" : "Modifications for sale"}</p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {lines.map((l) => (
            <li key={l.name} className="flex flex-wrap items-center gap-1" data-testid="mod-line">
              <span className="flex-1">{l.name} <span className="text-gray-400">{l.kind}, {l.rarity.toLowerCase()}</span></span>
              <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || l.price > (character.credits ?? 0)} onClick={() => buyMod(trader, l)} data-testid="mod-buy">Buy {l.price.toLocaleString("en-GB")} cr</Button>
              {itemsFor(l.name).map((item) => (
                <Button key={item} size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || l.price + modFee(l.rarity) > (character.credits ?? 0)} onClick={() => buyMod(trader, l, item)} data-testid="mod-buy-fit">and fit in {item} (+{modFee(l.rarity)} cr)</Button>
              ))}
            </li>
          ))}
        </ul>
        {carriedMods.length > 0 && <p className="font-semibold text-gray-300">Have the technician fit what you carry</p>}
        {carriedMods.map((mod) => itemsFor(mod, 2).map((item) => (
          <div key={`${mod}-${item}`} className="flex items-center gap-1 pl-2" data-testid="mod-fit-line">
            <span className="flex-1 text-gray-300">{mod} in {item}</span>
            <Button size="sm" variant="outline" className="h-5 px-2" disabled={inCombat || dead || modFee(factsOfItem(mod)!.rarity) > (character.credits ?? 0)} onClick={() => fitAtShop(trader, item, mod)} data-testid="mod-fit">Fit ({modFee(factsOfItem(mod)!.rarity)} cr)</Button>
          </div>
        )))}
        <p className="text-gray-500">House rule: modifications are sold over the counter here (Wretched Hives has them found or made), at their value; the technician fits one in an hour for a hundred credits a rarity step, with no check and no kit. A modified item needs attunement.</p>
      </div>
    );
  };
  const modPanel = (item: string) => {
    const base = factsOf(item);
    const kind = base ? modKindOf({ name: item, equipmentCategory: base.equipmentCategory, weaponClassification: (base as any).weaponClassification }) : undefined;
    if (!kind) return null;
    const fit = fitOf(item);
    const mods = fit.mods.map((m) => ({ name: m, facts: factsOfItem(m) }));
    const baseSlots = mods.filter((m) => m.facts?.modKind !== "augment").length;
    const augSlots = mods.filter((m) => m.facts?.modKind === "augment").length;
    const carried: string[] = Array.from(new Set<string>(character.equipment ?? []));
    const fits = carried.filter((n) => {
      const f = factsOfItem(n);
      return f?.modKind && (f.modKind === kind || (f.modKind === "augment" && augmentSlots(fit.rarity) > 0)) && rarityRank(f.rarity) <= rarityRank(fit.rarity);
    });
    const chassis = carried.filter((n) => factsOfItem(n)?.chassis === kind && rarityRank(factsOfItem(n)!.rarity) === rarityRank(fit.rarity) + 1);
    const { tool, owned } = kitFor(kind);
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid={`mod-panel-${item}`}>
        <p className="text-gray-300">
          {fit.rarity.toLowerCase()} chassis: {baseSlots}/{MOD_BASE_SLOTS} slots{augmentSlots(fit.rarity) ? `, ${augSlots}/${augmentSlots(fit.rarity)} augment` : ""}. Fitting takes an hour and a check with {tool ?? "the tools"} ({owned ? (trainedWith(owned) ? "trained" : "untrained: DC +5, house rule") : "not carried"}). A modified item needs attunement.
          {tinkerWait() ? " A failed fitting waits for the day to pass." : ""}
        </p>
        {mods.map((m, i) => (
          <div key={`${m.name}-${i}`} className="flex items-center justify-between gap-2">
            <span>{m.name} <span className="text-gray-400">{m.facts ? describeEffects(m.facts.effects) || (m.facts.properties ?? []).join(", ") || m.facts.text.slice(0, 80) : ""}</span></span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`unmod-${m.name}`} onClick={() => removeMod(item, m.name)}>Remove</Button>
          </div>
        ))}
        {fits.map((n) => (
          <div key={n} className="flex items-center justify-between gap-2">
            <span>{n} <span className="text-gray-400">DC {(INSTALL_DC[factsOfItem(n)!.rarity.toLowerCase()] ?? 10) + (owned && trainedWith(owned) ? 0 : 5)}</span></span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !owned} data-testid={`mod-${n}`} onClick={() => installMod(item, n)}>Fit</Button>
          </div>
        ))}
        {chassis.map((n) => (
          <div key={n} className="flex items-center justify-between gap-2">
            <span>{n}</span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !owned} data-testid={`chassis-${n}`} onClick={() => upgradeChassis(item, n)}>Upgrade the item (8 hours)</Button>
          </div>
        ))}
        {!fits.length && !chassis.length && <p className="text-gray-400">No {kind} modifications carried.</p>}
        {kind === "lightweapon" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="crystal">
            <span>Crystal: {fit.crystal ?? "none chosen"}</span>
            {!fit.crystal && (
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !(character.forcePowers ?? []).length} onClick={() => findCrystal(item)} data-testid="find-crystal">
                Find a crystal (forcecasting check)
              </Button>
            )}
            {fit.crystal && fit.crystalMax && crystalsUpTo(fit.crystalMax).length > 1 && (
              <select className="h-6 rounded bg-gray-700 px-1" value={fit.crystal} onChange={(e) => writeFit(item, { ...fit, crystal: e.target.value })}>
                {crystalsUpTo(fit.crystalMax).map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
            {!(character.forcePowers ?? []).length && !fit.crystal && <span className="text-gray-400">(only the Force-sensitive can tell a crystal's color)</span>}
          </div>
        )}
      </div>
    );
  };

  // ---- Information gear (house rules; the books give a datapad and a commlink no numbers): a
  // credit chip is cracked (DC 15 with a slicer's kit, the book's), a datacard is read on a datapad,
  // wristpad or holocomm, a datacron cracked like a chip, a holocron answers the Force-sensitive.
  // What they hold: credits, the lore of a place (kept in the downtime state; spend it there), or a
  // blueprint. A commlink calls an allied contact for a tip, once a day each.
  const randomPlace = () => {
    if (!world) return undefined;
    const rooms = Object.values(world.areas).filter((a) => a.kind === "room" && a.id !== here?.id);
    return rooms.length ? rooms[Math.floor(Math.random() * rooms.length)] : undefined;
  };
  const readData = async (name: string, use: Extract<GearUse, { kind: "data" }>) => {
    if (!world || inCombat || dead) return;
    if (use.form === "blueprint" && (play.blueprintUntil ?? 0) > clockNow()) return speed("A failed try waits 24 hours before the next (the book).");
    if (use.form === "card" && !carries(/^(datapad|wristpad|holocomm)/i)) return speed("A datacard is read on a datapad, a wristpad or a holocomm.");
    if (use.form === "holocron" && !(character.forcePowers ?? []).length) return speed("A holocron answers only to the Force.");
    const kit = (character.equipment ?? []).find((n: string) => /^slicer's kit$/i.test(n)) as string | undefined;
    const ability = use.form === "holocron" ? ["wisdom"] : ["intelligence"];
    const trained = use.form === "holocron" ? false : use.form === "card" ? !!kit && trainedWith(kit) : !!kit && trainedWith(kit);
    // A chip or a datacron is cracked with the kit; without one the attempt is at DC +5 (house rule)
    const dc = use.dc + (use.form === "chip" || use.form === "cron" ? (kit ? 0 : 5) : 0);
    const ok = await abilityCheck(`${name}`, dc, ability, trained);
    if (cancelledCheck.current) return;
    // A blueprint takes an hour (the book), the rest ten minutes; a blueprint missed waits a day before the next try
    const time = pass(use.form === "blueprint" ? 60 : 10);
    if (!ok) {
      if (use.form === "blueprint") patchPlay({ blueprintUntil: clockNow() + 24 * 60 });
      return void saveCampaign(time);
    }
    const what = readOutcome(use.form, die(100));
    const spent = consume(name);
    const changes: Record<string, any> = { equipment: spent.equipment };
    if (what === "credits") {
      const amount = readCredits(die(6) + die(6), level);
      changes.credits = (character.credits ?? 0) + amount;
      saveCharacter(changes);
      toast.success(`${name}: ${money(amount)} drawn.`);
    } else if (what === "lore") {
      const place = randomPlace();
      if (!place) return void saveCampaign(time);
      commitDowntime({ character: changes, downtime: { lore: [...downtime.lore, { id: dtId("l"), topic: `${name}: what is kept at ${place.name}`, where: place.id, whereName: place.name }].slice(-Math.max(1, 1 + Math.floor(((character.abilityScores?.intelligence ?? 10) - 10) / 2))) }, days: 0, log: [`${name} read: lore of ${place.name}.`] });
      toast.success(`${name}: you learn what is kept at ${place.name} (see Downtime, lore).`);
    } else {
      // (a blueprint item is of its own rarity; a find by the level's)
      const rarity = use.form === "blueprint" && use.rarity ? use.rarity.toLowerCase() : blueprintRarity(level, die(100));
      const pool = blueprintPool(Object.values(itemFacts ?? {}), rarity, downtime.blueprints);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick) return void saveCampaign(time);
      commitDowntime({ character: changes, downtime: { blueprints: [...downtime.blueprints, pick.name] }, days: 0, log: [`${name} read: the blueprint of ${pick.name}.`] });
      toast.success(`${name}: the blueprint of ${pick.name} (${rarity}).`);
    }
    saveCampaign(time);
  };
  const callContact = (id: string) => {
    const contact = downtime.contacts.find((c) => c.id === id);
    const day = dayOf(useClock.getState().minutes);
    if (!contact || !world || inCombat || dead) return;
    if ((play.called?.[id] ?? -1) === day) return speed(`${contact.name} has nothing new today.`);
    const rooms = Object.values(world.areas).filter((a) => a.kind === "room" && (a.id === contact.where || a.parentId === contact.where || world.areas[a.parentId ?? ""]?.parentId === contact.where));
    const place = rooms.length ? rooms[Math.floor(Math.random() * rooms.length)] : randomPlace();
    if (!place) return;
    commitDowntime({
      character: { playState: { ...play, called: { ...(play.called ?? {}), [id]: day } } },
      downtime: { lore: [...downtime.lore, { id: dtId("l"), topic: `${contact.name} on ${place.name}`, where: place.id, whereName: place.name }].slice(-Math.max(1, 1 + Math.floor(((character.abilityScores?.intelligence ?? 10) - 10) / 2))) },
      days: 0,
      log: [`${contact.name} (${contact.whereName}) tipped you off about ${place.name} over the commlink.`],
    });
    toast.success(`${contact.name} tells you what is kept at ${place.name}.`);
    // While the law searches the district a plain call is overheard and tells the search where the party is (house rule); a scrambled one is not
    const searching = !!world && !!here && pursuitAt(world, clockNow(), here.id)?.here && pursuitAt(world, clockNow(), here.id)?.phase === "searching";
    if (searching && world?.pursuit && callOverheard(true, (character.equipment ?? []) as string[])) {
      saveCampaign({ galaxyMap: { ...world, pursuit: { ...world.pursuit, known: here!.id } } });
      toast.warning("The call was overheard: the search knows where you are. A pocket scrambler would have kept it secret. (House rule.)");
    }
  };

  // ---- Droid customizations (Wretched Hives): a droid's motor supports two, upgraded to six; the
  // work needs astrotech's implements (house rule as for modifications) and takes 8 hours by size
  const customize = async (c: Companion, item: string) => {
    const f = factsOfItem(item);
    if (!f?.droid || inCombat || dead) return;
    const slots = c.motor ?? DROID_BASE_SLOTS;
    if ((c.custom ?? []).length >= slots) return speed(`${c.name}'s motor supports ${slots} customizations: upgrade it first.`);
    if ((c.custom ?? []).includes(f.name)) return speed("It already has that.");
    if (tinkerWait()) return speed("A failed fitting waits a day before the next try (the book).");
    const { tool, owned } = kitFor("droid");
    if (!owned) return speed(`You need ${tool ?? "astrotech's implements"} for this.`);
    const { ok, dc } = await modCheck(`Fit ${f.name} to ${c.name}`, f.rarity, owned);
    if (cancelledCheck.current) return;
    const plan = droidPlan(f.rarity, c.size ?? "medium");
    const time = pass(plan.hours * 60);
    if (!ok) {
      saveCharacter({ playState: { ...play, tinkerUntil: clockNow() + 24 * 60 } });
      return void saveCampaign(time);
    }
    const stock = c.stock ?? { armorClass: c.armorClass, speed: c.speed };
    const custom = [...(c.custom ?? []), f.name];
    const spent = consume(item);
    saveParty(party.map((x) => (x.id === c.id ? droidWith({ ...x, stock, custom }) : x)), { equipment: spent.equipment, playState: { ...play, charges: spent.charges } });
    saveCampaign(time);
    toast.success(`${f.name} fitted to ${c.name} (DC ${dc}, ${plan.hours} hours).`);
  };
  // The numbers a droid has with its customizations: plating sets a base, an unarmored formula
  // (13 + Dexterity) counts when better, and speed adds
  const droidWith = (c: Companion): Companion => {
    const stock = c.stock ?? { armorClass: c.armorClass, speed: c.speed };
    const list = (c.custom ?? []).map((n) => factsOfItem(n)).filter(Boolean) as ItemFacts[];
    let ac = stock.armorClass;
    for (const f of list) {
      if (f.effects.acSet) ac = Math.max(ac, f.effects.acSet);
      if (f.effects.acBase) ac = Math.max(ac, f.effects.acBase.base + (c.saves?.[f.effects.acBase.ability] ?? 0));
    }
    return { ...c, armorClass: ac, speed: stock.speed + list.reduce((n, f) => n + (f.effects.speed ?? 0), 0) };
  };
  const removeCustom = async (c: Companion, name: string) => {
    if (inCombat || dead) return;
    const f = factsOfItem(name);
    const { tool, owned } = kitFor("droid");
    if (!owned) return speed(`You need ${tool ?? "astrotech's implements"} for this.`);
    const { ok } = await modCheck(`Remove ${name}`, f?.rarity ?? "Standard", owned);
    if (cancelledCheck.current) return;
    const plan = droidPlan(f?.rarity ?? "Standard", c.size ?? "medium", true);
    saveParty(party.map((x) => (x.id === c.id ? droidWith({ ...x, custom: (x.custom ?? []).filter((n) => n !== name) }) : x)), ok ? { equipment: [...(character.equipment ?? []), name] } : {});
    saveCampaign(pass(plan.hours * 60));
    toast[ok ? "success" : "error"](ok ? `${name} removed and salvaged.` : `${name} was destroyed in the removal.`);
  };
  const upgradeMotor = (c: Companion) => {
    const to = (c.motor ?? DROID_BASE_SLOTS) + 1;
    const cost = (DROID_MOTOR_COST[to] ?? 0) * (SIZE_TIME[(c.size ?? "medium").toLowerCase()] ?? 1);
    if (!cost || inCombat || dead) return;
    if ((character.credits ?? 0) < cost) return speed(`The motor upgrade costs ${money(cost)}.`);
    saveParty(party.map((x) => (x.id === c.id ? { ...x, motor: to } : x)), { credits: (character.credits ?? 0) - cost });
    saveCampaign(pass(8 * 60 * (SIZE_TIME[(c.size ?? "medium").toLowerCase()] ?? 1)));
    toast.success(`${c.name}'s motor now supports ${to} customizations (${money(cost)}).`);
  };
  const droidPanel = (c: Companion) => {
    const slots = c.motor ?? DROID_BASE_SLOTS;
    const carried: string[] = Array.from(new Set<string>(character.equipment ?? []));
    const fits = carried.filter((n) => factsOfItem(n)?.droid);
    const next = slots + 1;
    const size = SIZE_TIME[(c.size ?? "medium").toLowerCase()] ?? 1;
    return (
      <div className="mt-1 space-y-1 text-xs" data-testid={`droid-panel-${c.id}`}>
        <p className="text-gray-300">Motor: {(c.custom ?? []).length}/{slots} customizations. Fitting takes 8 hours{size !== 1 ? ` (x${size} for its size)` : ""} and a check with astrotech's implements.</p>
        {(c.custom ?? []).map((n) => (
          <div key={n} className="flex items-center justify-between gap-2">
            <span>{n} <span className="text-gray-400">{describeEffects(factsOfItem(n)?.effects ?? {}) || (factsOfItem(n)?.text ?? "").slice(0, 80)}</span></span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => removeCustom(c, n)}>Remove</Button>
          </div>
        ))}
        {fits.filter((n) => !(c.custom ?? []).includes(factsOfItem(n)!.name)).map((n) => (
          <div key={n} className="flex items-center justify-between gap-2">
            <span>{n} <span className="text-gray-400">{factsOfItem(n)!.droid}, {factsOfItem(n)!.rarity.toLowerCase()}</span></span>
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`customize-${n}`} onClick={() => customize(c, n)}>Fit</Button>
          </div>
        ))}
        {!fits.length && <p className="text-gray-400">No droid customizations carried.</p>}
        {DROID_MOTOR_COST[next] && (
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`motor-${c.id}`} onClick={() => upgradeMotor(c)}>
            Upgrade the motor to {next} slots ({money(DROID_MOTOR_COST[next] * size)})
          </Button>
        )}
      </div>
    );
  };

  // A homing beacon left on someone's ship, and where that ship is now (from the map's present)
  const beacon = carriesAny((n) => gearOf(n)?.kind === "beacon") ? (character.equipment as string[]).find((n) => gearOf(n)?.kind === "beacon") : undefined;
  const plantBeacon = (ship: Ship) => {
    if (!beacon) return;
    saveCharacter({ equipment: consume(beacon).equipment, playState: { ...play, tracked: [...(play.tracked ?? []), { id: ship.id, name: ship.name }] } });
    toast.success(`A homing beacon is on ${ship.name}.`);
  };
  const shipWhere = (id: string): string => {
    if (!scene) return "unknown";
    const there = Object.values(scene.areas).find((a) => a.ships.some((s) => s.id === id));
    if (there) return `at ${there.name}`;
    const flying = scene.moving.find((m) => m.kind === "ship" && m.id === id);
    return flying ? `in flight from ${scene.areas[flying.from]?.name ?? "somewhere"} to ${scene.areas[flying.to]?.name ?? "somewhere"}` : "out of range";
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

  // Who was picked out on the map, and the building whose counter or stall they stand at (a stallholder of the market in the district stands at a
  // stall, not at the building the party is in front of); `gate` is a sentry keeping the way into a room
  const occupantPick = (id: string) => {
    if (!here) return { o: undefined, holderId: "", gate: undefined };
    const ownO = (hereNow ?? here).occupants.find((x) => x.id === id);
    const nearB = !ownO && here.kind === "building" && world ? (districtAt(world, here.id)?.buildingIds ?? []).map((bid) => (scene ?? world).areas[bid]).find((b) => b?.occupants.some((x) => x.id === id)) : undefined;
    const o = ownO ?? nearB?.occupants.find((x) => x.id === id);
    const holderId = nearB?.id ?? here.id;
    const gate = !o && here.kind === "building" && world ? childrenOf(world, here.id).find((room) => room.occupants.some((x) => x.id === id)) : undefined;
    return { o, holderId, gate };
  };
  // What a friendly person here does for the party: sells (their stock, and what they would pay for the party's), fits ships, parts, scripts,
  // modifications, passage, hires, plays. Shown in the HUD's Trade tab
  const dealings = (o: Occupant, holderId: string) => (
    <>
      {waresOf(o) && tradePanel(o, holderId)}
      {!waresOf(o) && shipServices(o, holderId)}
      {partsCounter(o, holderId)}
      {o.trade === "salvage" && droidPartsPanel(o, holderId)}
      {scriptPanel(o, holderId)}
      {o.role === "medic" && augmentPanel(o, holderId)}
      {(o.trade ? !!MOD_TRADES[o.trade] || !!WARES[o.trade]?.black : ["mechanic", "fence", "smuggler"].includes(o.role)) && modsPanel(o, holderId)}
      {(o.role === "ticket agent" || (o.role === "smuggler" && o.disposition !== "hostile")) && passagePanel(o)}
      {canHire(o) && hireSection(o, here?.id ?? holderId)}
      {!isDroid(o) && o.species && o.role !== "guard" && o.role !== "freed" && gamblePanel(o.id, o.name, o.role === "gambler" ? 4 : 2)}
    </>
  );
  const dealingNow = (() => {
    if (picked?.kind !== "occupant" || !world || !here) return null;
    const { o, holderId } = occupantPick(picked.id);
    if (!o || (o.disposition === "hostile" && !!o.hitPoints) || o.captive || o.disabled || o.role === "freed") return null;
    return { o, holderId };
  })();
  dealerRef.current = !!dealingNow;
  // The test menu (a test copy only: TEST_MENU, see TestMenu.tsx): what the game makes you earn, set directly
  const testMenu = () => {
    if (!TEST_MENU || !world || !character || !here) return null;
    const areas = Object.values(world.areas)
      .filter((a) => ["planet", "settlement", "building", "room"].includes(a.kind))
      .map((a) => ({ id: a.id, label: [...trailOf(world, a.id).slice(2).map((t) => t.name)].join(" \u203a ") }));
    // What each kind of thing is, to the game: items are carried by name, a ship stands at the berth, a ship part waits in the hold, a speeder is
    // parked, a droid or beast joins the party (as a bought one does, so the party's limit holds)
    const berth = berthOf(world, here.id);
    const give = async (category: TestCategory, item: TestItem) => {
      const said = (what: string) => toast.success(`Test menu: ${what}.`);
      if (category === "speederMods") return;
      if (category === "ships") {
        const [size, role] = item.id.split("|");
        const named = ships.filter((s) => s.name.startsWith(`Test ${role}`)).length;
        const ship = roleShip(size, role, shipRows, newId("s"), `Test ${role}${named ? ` ${named + 1}` : ""}`, getStarshipSize(size)?.stockCost ?? 0, Math.min(5, Math.floor(level / 4)));
        const mine: PartyShip = { ...ship, status: world.areas[berth]?.kind === "settlement" ? "landed" : "orbiting", owner: character.name, fuel: getStarshipSize(size)?.fuelCapacity ?? 5, areaId: berth };
        saveCampaign({ starships: [...ships, mine] });
        return said(`${mine.name} (${item.name}) stands at ${world.areas[berth]?.name ?? "the berth"}`);
      }
      if (category === "shipMods") {
        const kind = item.id.slice(0, item.id.indexOf("|"));
        const name = item.id.slice(item.id.indexOf("|") + 1);
        const size = partSize(berth);
        const mod = kind === "mod" ? shipModNamed(name) : undefined;
        const piece = kind === "equipment" ? shipRows.find((r: any) => r.name === name) : undefined;
        const enhanced = kind === "enhanced" ? enhancedShipRows.find((r: any) => r.name === name) : undefined;
        const part: ShipPart | undefined = mod
          ? { id: newId("part"), kind: "mod", name, size, grade: mod.grade, type: mod.type, worth: modCost(mod, size).material }
          : piece
            ? { id: newId("part"), kind: "equipment", name, size, type: piece.type, worth: equipmentCost(piece, size).material }
            : enhanced
              ? { id: newId("part"), kind: "enhanced", name, type: enhanced.type, rarity: enhanced.searchableRarity, bonus: enhancedShipPart(enhanced)?.bonus ?? 0, worth: enhancedValueOf(enhanced) }
              : undefined;
        if (!part) return void toast.error("Test menu: the ship data is still loading.");
        saveParts([...shipParts, part]);
        return said(`${name} is in the hold, to fit to a ship at a shipyard or by the crew`);
      }
      if (category === "speeders") {
        const model = transport?.vehicles.find((v) => v.name === item.id);
        if (!model) return;
        saveCampaign({ vehicles: [...vehicles, { id: newId("v"), name: model.name, model: model.name, mph: model.mph, value: model.cost, status: "parked", owner: character.name, seats: SEATS[model.name] ?? 2, areaId: berth } as PartyVehicle] });
        return said(`${model.name} is parked at ${world.areas[berth]?.name ?? "the settlement"}`);
      }
      if (category === "droids" || category === "beasts") {
        if (partyFull) return void toast.error(`Test menu: you already lead ${COMPANION_LIMIT} companions (the game's limit); dismiss one first.`);
        const response = await fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock: item.id }) });
        if (!response.ok) return void toast.error("Test menu: could not load that creature.");
        const o: Occupant = { ...(await response.json()), disposition: "neutral", role: category === "droids" ? "droid" : "wildlife" };
        saveParty([...party, companionFrom(o, category === "droids" ? "droid" : "beast", clockNow(), newId("c"), { how: "test menu", name: item.name }, mountsTable)]);
        return said(`${item.name} follows you`);
      }
      saveCharacter({ equipment: [...(character.equipment ?? []), item.name] });
      said(`${item.name} given`);
    };
    return (
      <TestMenu
        areas={areas}
        data={{ equipment: equipmentData, enhanced: enhancedRows, shipRows, enhancedShip: enhancedShipRows, vehicles: transport?.vehicles ?? [], droids: droidStats, beasts: beastStats }}
        here={here.id}
        credits={character.credits ?? 0}
        level={level}
        dead={dead}
        act={{
          heal: () => {
            lastSavedHp.current = character.maxHp;
            lastSavedPoints.current = character.maxForcePoints;
            saveCharacter({ currentHp: character.maxHp, currentForcePoints: character.maxForcePoints, hitDiceUsed: 0, conditions: [] });
            toast.success("Test menu: healed.");
          },
          revive,
          credits: (n) => saveCharacter({ credits: (character.credits ?? 0) + n }),
          nextLevel: () => saveCharacter({ experience: Math.max(character.experience ?? 0, calculateExperienceForLevel(Math.min(20, level + 1))) }),
          give,
          teleport: (id) => {
            const target = world.areas[id];
            if (!target) return;
            if (childrenOf(world, id).length === 0 && ["system", "planet", "settlement", "building"].includes(target.kind)) explore(id, { currentLocation: id });
            else saveCampaign({ currentLocation: id });
            toast.success(`Test menu: gone to ${target.name}.`);
          },
          clock: (when) => {
            const now = useClock.getState().minutes;
            const to = when === "+hour" ? now + 60 : when === "+8hours" ? now + 480 : Math.floor(now / 1440) * 1440 + when + (Math.floor(now / 1440) * 1440 + when < now ? 1440 : 0);
            saveCampaign(pass(to - now));
          },
        }}
      />
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
      const way = !exit && place.id !== here.id && !trailOf(world, here.id).some((a) => a.id === place.id) ? findPath(world, here.id, place.id) : null;
      const unmapped = childrenOf(world, place.id).length === 0 && OPENS.includes(place.kind);
      return (
        <>
          {close}
          <p className="font-semibold">
            {place.name} <span className="text-sm font-normal text-gray-400">({world ? kindLabel(world, place) : place.kind}{place.type && place.type !== place.kind ? `, ${place.type}` : ""})</span>
          </p>
          {place.description && <p className="text-xs text-gray-300">{place.description}</p>}
          {trailOf(world, here.id).some((a) => a.id === place.id) && <p className="text-xs text-yellow-300">You are {place.id === here.id ? "here" : "in here"}.</p>}
          {!exit && place.parentId === here.id && place.tags.includes("form:balcony") && (() => {
            const way = climbWay(place.layout?.level ?? 1, climbGear);
            return way.how === "none" ? <p className="text-xs text-gray-400" data-testid="climb-note">Out of reach: {way.why} (house rule).</p> : null;
          })()}
          {unmapped && <p className="text-xs text-gray-400">Nobody has mapped it yet.</p>}
          {way && way.length > 2 && <p className="text-xs text-gray-400">Way there: {way.slice(1).map((id) => world.areas[id].name).join(" \u203a ")}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {OPENS.includes(place.kind) && place.id !== view?.id && (
              <Button size="sm" variant="outline" onClick={() => { setViewId(place.id); setPicked(null); }} data-testid="map-open">
                Look inside
              </Button>
            )}
            {exit && (
              <Button size="sm" className="h-auto whitespace-normal text-left" disabled={inCombat || dead || exploring} onClick={() => leaveBy(exit)} data-testid="map-travel">
                {exit.locked ? `Unlock (DC ${exit.locked}): ` : ""}{exit.label}{exit.via === "path" ? " to" : ""} {place.name}
                {[travelText(exit), tripNote(exit)].filter(Boolean).length > 0 && ` (${[travelText(exit), tripNote(exit)].filter(Boolean).join(", ")})`}
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
    // A window walked up to (shared/logic "Windows", house rules): looked through, and a large one climbed through, its latch
    // jimmied, its lock picked or its glass broken, its alarm sensor disabled
    if (picked.kind === "window") {
      const [roomId, assetId] = picked.id.split("|");
      const outside = picked.name === "outside";
      const room = world.areas[roomId];
      const a = room?.layout?.assets.find((x) => x.id === assetId);
      const pane = a?.pane;
      const building = room ? world.areas[room.parentId ?? ""] : undefined;
      if (!room?.layout || !a || !building) return close;
      const passive = 10 + modifier(character.abilityScores?.wisdom) + (skilled("perception") ? proficiency : 0);
      const sensor = !!pane?.alarmed && passive >= PANE_SENSOR_SEEN;
      // (from inside any window opens without a check; one above the ground floor is climbed to from the street, or out of and down,
      // only with climbing gear: shared/logic climbWay)
      const scale = (room.layout.level ?? 0) > 0 ? climbWay(room.layout.level ?? 0, climbGear, !outside) : undefined;
      const reach = climbable(pane) && scale?.how !== "none";
      const open = !!pane && (!outside || pane.latch === "open" || !!pane.broken);
      const kit = lockKit();
      const trained = !!kit && trainedWith(kit);
      const busy = inCombat || dead || exploring;
      const save = (change: Partial<Pane>, minutes = 1, extra: (w: World) => World = (w) => w) => saveCampaign({ galaxyMap: extra(setPane(world, room.id, a.id, change)), ...pass(minutes) });
      // The alarm goes up through the building, and those in the room turn on whoever came in
      const trip = () => setTimeout(() => {
        const latest = latestWorld();
        if (!latest) return;
        let next = updateArea(latest, building.id, { alarm: true }).world;
        if (watchersAt(next, room.id).length) next = setAlert(next, room.id, ALERT.attacking);
        saveCampaign({ galaxyMap: next });
        toast.error("The window's sensor trips: the alarm goes up through the building (house rule).");
      }, 80);
      const climb = async () => {
        if (outside && here.danger === 0 && !lawUnseen("Climbing in through a window", "trespass")) return;
        if (scale?.how === "hook") {
          const ok = await abilityCheck(`${outside ? "Up" : "Down"} the grappling hook's line (house rule)`, scale.dc ?? 10, ["strength"], skilled("athletics"));
          if (cancelledCheck.current) return;
          if (!ok) {
            toast.error("The hook will not hold, or you slip: a minute gone.");
            return void saveCampaign(pass(1));
          }
        }
        setPicked(null);
        travel(outside ? { to: room.id, via: "enter", label: "Climb in through the window", travel: "", secret: true } : { to: building.id, via: "leave", label: "Climb out through the window", travel: "" });
        if (pane?.alarmed) trip();
      };
      const jimmy = async () => {
        if (here.danger === 0 && !lawUnseen("Jimmying a window", "trespass")) return;
        const ok = await abilityCheck("Jimmy the latch", PANE_LATCH_DC, ["dexterity"], skilled("sleight of hand"));
        if (cancelledCheck.current) return;
        save(ok ? { latch: "open" } : {});
        toast[ok ? "success" : "error"](ok ? "The latch slips: the window opens." : "The latch holds. A minute gone.");
      };
      const pick = async () => {
        if (here.danger === 0 && !lawUnseen("Picking a window's lock", "trespass")) return;
        const ok = await abilityCheck("Window lock", pane?.dc ?? 12, ["dexterity", "intelligence"], trained);
        if (cancelledCheck.current) return;
        save(ok ? { latch: "open" } : {});
        toast[ok ? "success" : "error"](ok ? "The lock turns: the window opens." : "The lock holds. A minute gone.");
      };
      const smash = async () => {
        const ok = await abilityCheck("Break the glass", PANE_BREAK_DC, ["strength"], skilled("athletics"));
        if (cancelledCheck.current) return;
        if (!ok) return void save({});
        // Noisy: whoever is in the room hears it, the sensor (if any) trips, and the law hears of it where it is about
        save({ broken: true }, 1, (w) => {
          let next = w;
          if (watchersAt(next, room.id).length) next = setAlert(next, room.id, ALERT.attacking);
          if (pane?.alarmed) next = updateArea(next, building.id, { alarm: true }).world;
          return here.danger === 0 ? reportCrime(next, here.id, "trespass", clockNow()) : next;
        });
        toast.warning(`The glass breaks: a way through, and everyone nearby heard it.${pane?.alarmed ? " The sensor trips: the alarm is up." : ""}`);
      };
      const disable = async () => {
        const ok = await abilityCheck("Disable the window's sensor", PANE_SENSOR_DC, ["intelligence"], trained);
        if (cancelledCheck.current) return;
        if (ok) {
          save({ alarmed: false });
          toast.success("The sensor is dead: the window can be used without tripping the alarm.");
        } else {
          setPicked(null);
          trip();
        }
      };
      const look = () => {
        const seen = [...room.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ""}${o.name} (${o.disposition})`), ...room.ships.map((ship) => ship.name)];
        toast.info(outside ? `Through the window of ${room.name}: ${seen.join(", ") || "nobody"}. (House rule: looking in needs no check.)` : `Outside the window: the street by ${building.name}.`);
      };
      const what = !pane ? "A window." : `${{ slit: "A slit, too narrow for anyone to get through", small: "A small window, too small to climb through", large: "A window big enough to climb through", wide: "A great window, easily climbed through" }[pane.size]}${pane.broken ? ", its glass broken" : pane.latch === "open" ? ", open" : pane.latch === "latched" ? ", latched from inside" : `, locked (DC ${pane.dc ?? 12})`}.${sensor ? ` A sensor on the frame: going through it trips the alarm (seen with passive Perception ${passive}).` : ""}${climbable(pane) && scale ? (scale.how === "none" ? ` ${scale.why}.` : ` ${outside ? "Up to it" : "Down from it"} by ${scale.by.toLowerCase()}${scale.dc ? ` (Strength (Athletics), DC ${scale.dc}: house rule)` : ""}.`) : ""}`;
      return (
        <>
          {close}
          <p className="font-semibold">{a.name}</p>
          <p className="text-xs text-gray-300">{what}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { look(); setPicked(null); }} data-testid="window-look">{outside ? "Look in" : "Look out"}</Button>
            {reach && open && <Button size="sm" disabled={busy} onClick={climb} data-testid="window-climb">{outside ? "Climb in" : "Climb out"}{pane?.alarmed ? (sensor ? " (trips the alarm)" : "") : ""}</Button>}
            {reach && outside && !open && pane?.latch === "latched" && <Button size="sm" disabled={busy} onClick={() => { jimmy(); }} data-testid="window-jimmy">Jimmy the latch (Dexterity, DC {PANE_LATCH_DC})</Button>}
            {reach && outside && !open && pane?.latch === "locked" && <Button size="sm" disabled={busy} onClick={() => { pick(); }} data-testid="window-pick">Pick the lock (DC {pane.dc ?? 12}{trained ? "" : "; a security kit helps"})</Button>}
            {reach && outside && !open && <Button size="sm" variant="outline" disabled={busy} onClick={() => { smash(); }} data-testid="window-break">Break the glass (Strength, DC {PANE_BREAK_DC}; noisy)</Button>}
            {reach && sensor && <Button size="sm" variant="outline" disabled={busy} onClick={() => { disable(); }} data-testid="window-sensor">Disable the sensor (Intelligence, DC {PANE_SENSOR_DC})</Button>}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">House rules: the books give none for windows.</p>
        </>
      );
    }
    if (picked.kind === "asset") {
      const [areaId, assetId] = picked.id.split("|");
      const name = picked.name ?? "";
      const kind = useKindOf(name);
      const room = world.areas[areaId];
      const dcBase = 12 + lawAt(world, here.id);
      const kit = lockKit();
      const trained = !!kit && trainedWith(kit);
      const building = room && (room.kind === "building" ? room : world.areas[room.parentId ?? ""]);
      const looped = (play.loopUntil ?? 0) > clockNow();
      const loop = async () => {
        const looped = await abilityCheck(`Loop the camera`, dcBase, ["intelligence", "dexterity"], trained);
        if (cancelledCheck.current) return;
        if (!looped) return void saveCampaign(pass(5));
        saveCharacter({ playState: { ...play, loopUntil: clockNow() + 60 } });
        saveCampaign(pass(5));
        toast.success("The cameras show an empty room for the next hour.");
      };
      const readNotices = () => {
        const lines: string[] = [];
        const open = (world.incidents ?? []).filter((i) => i.status === "open" || i.status === "fled");
        for (const i of open) lines.push(`${i.name} is wanted for ${INCIDENT_WORDS[i.kind].what}${i.vehicle ? ` (a ${i.vehicle.name} is missing)` : ""}; reward ${incidentReward(world, i)} cr.`);
        if (pursuit) lines.push(pursuit.phase === "coming" ? `Officers are on their way to ${world.areas[pursuit.pursuit.scene]?.name} after ${CRIME_NAMES[pursuit.pursuit.crime]}.` : `${pursuit.pursuit.squads?.length ?? 0} squad(s) are out searching for the offenders${pursuit.pursuit.identified ? " and they have a name and a face" : ""}.`);
        const level = heatLevel(heatAt(world, settlementOf(world, here.id), clockNow()));
        if (level) lines.push(["", "The watch here knows your face.", "You are wanted here.", "The officers will blockade the ways out in a search."][level]);
        saveCampaign(pass(5));
        toast.info(lines.length ? lines.join(" ") : "Nothing on the notices but the tariff and a curfew.");
      };
      const openDoors = async () => {
        if (!building) return;
        const ids = new Set([building.id, ...childrenOf(world, building.id).map((r) => r.id)]);
        const locked = world.paths.filter((pth) => pth.locked && (ids.has(pth.from) || ids.has(pth.to)));
        if (!locked.length) return void toast.info("Every door of this building is already open.");
        const opened = await abilityCheck("Open the doors from the panel", dcBase, ["intelligence"], trained);
        if (cancelledCheck.current) return;
        if (!opened) {
          toast.error("The panel locks up and a warning goes out.");
          return void saveCampaign({ galaxyMap: reportCrime(world, here.id, "trespass", clockNow()), ...pass(5) });
        }
        saveCampaign({ galaxyMap: { ...world, paths: world.paths.map((pth) => (locked.includes(pth) ? { ...pth, locked: undefined } : pth)) }, ...pass(5) });
        toast.success(`${locked.length} door${locked.length > 1 ? "s" : ""} unlocked.`);
      };
      const alarmUp = !!building?.alarm;
      return (
        <>
          {close}
          <p className="font-semibold">{name}</p>
          {kind === "camera" && (
            <>
              <p className="text-xs text-gray-300">{looped ? "The cameras here are looped: they record nothing for now." : lawAt(world, here.id) >= 2 ? "It records what is done in this room, and the law is called for a crime it sees." : "A camera, but nobody is watching it here."}</p>
              <Button size="sm" className="mt-1" disabled={inCombat || dead || looped} onClick={() => { loop(); setPicked(null); }} data-testid="camera-loop">Loop it for an hour (Intelligence or Dexterity, DC {dcBase})</Button>
            </>
          )}
          {kind === "alarm" && (
            <>
              <p className="text-xs text-gray-300">{alarmUp ? "The alarm is up in this building." : "The alarm is quiet."}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Button size="sm" disabled={inCombat || dead || !alarmUp || !building} onClick={() => { if (building) saveCampaign({ galaxyMap: updateArea(world, building.id, { alarm: undefined }).world, ...pass(1) }); toast.success("The alarm is silenced."); setPicked(null); }}>Silence it</Button>
                <Button size="sm" variant="outline" disabled={inCombat || dead || alarmUp || !building} onClick={() => { if (building) saveCampaign({ galaxyMap: updateArea(world, building.id, { alarm: true }).world, ...pass(1) }); toast.error("The alarm goes up through the building."); setPicked(null); }}>Trip it</Button>
              </div>
            </>
          )}
          {kind === "kiosk" && (
            <>
              <p className="text-xs text-gray-300">Notices, wanted lists, and what the law is doing in the settlement.</p>
              <Button size="sm" className="mt-1" disabled={inCombat || dead} onClick={() => { readNotices(); setPicked(null); }} data-testid="kiosk-read">Read the notices (5 min)</Button>
            </>
          )}
          {kind === "access" && (
            <>
              <p className="text-xs text-gray-300">A panel that opens the locked doors of the building.</p>
              <Button size="sm" className="mt-1" disabled={inCombat || dead} onClick={() => { openDoors(); setPicked(null); }} data-testid="access-open">Open the locked doors (Intelligence, DC {dcBase}{trained ? "" : "; a security or slicer's kit helps"})</Button>
            </>
          )}
          {!kind && forceMoves(areaId, assetId)}
        </>
      );
    }
    if (picked.kind === "occupant") {
      // Someone here, or a sentry standing out in front of the building the party is outside
      const { o, holderId, gate } = occupantPick(picked.id);
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
          {(() => {
            const wanted = o.wanted ? (world?.incidents ?? []).find((i) => i.id === o.wanted && (i.status === "open" || i.status === "fled")) : undefined;
            return wanted && world ? (
              <div className="mt-1 space-y-1 rounded border border-red-500/60 p-1 text-xs" data-testid="wanted">
                <p className="text-red-300">Wanted for {INCIDENT_WORDS[wanted.kind].what}. The constables are looking for them.</p>
                <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => turnIn(wanted)} data-testid="turn-in">
                  Turn them in ({incidentReward(world, wanted)} cr)
                </Button>
              </div>
            ) : null;
          })()}
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
              {/* Their wares and what else they do are in the HUD's Trade tab, not over the map (the card has no room for a stock list) */}
              {showSidebar ? (
                <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setHudTab("trade")} data-testid="open-trade">Wares and dealings: Trade tab</Button>
              ) : dealings(o, holderId)}
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
            {building && v.status === "parked" && <Button size="sm" disabled={inCombat || dead || hostiles.length > 0} onClick={() => { (v.civil ? stealVehicle : takeVehicle)(building.building, v); setPicked(null); }} data-testid="vehicle-take">{v.civil ? "Steal it (hotwire)" : "Take it"}</Button>}
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
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {shipButton(ship)}
          {beacon && !ships.some((mine) => mine.id === ship.id) && !(play.tracked ?? []).some((t) => t.id === ship.id) && (
            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => plantBeacon(ship)}>
              Plant a homing beacon
            </Button>
          )}
        </div>
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

  // ---- Downtime: the character's checks and what is kept (see DowntimePanel)
  const downtime: DowntimeState = { ...emptyDowntime(), ...((character?.playState as any)?.downtime ?? {}) };
  // The settlement the party is in: the nearest one up the tree from here
  const settlementHere = world && hereId ? [...trailOf(world, hereId)].reverse().find((a) => a.kind === "settlement") ?? null : null;
  // (worked out when the world or the settlement changes, not at every redraw)
  const settlementKey = settlementHere?.id;
  const downtimePeople = useMemo(() => {
    if (!world || !settlementKey) return [] as { name: string; cls: "lower" | "middle" | "upper" }[];
    const out: { name: string; cls: "lower" | "middle" | "upper" }[] = [];
    const inside = new Set<string>();
    for (const a of Object.values(world.areas)) {
      if (a.id === settlementKey || trailOf(world, a.id).some((t) => t.id === settlementKey)) inside.add(a.id);
    }
    for (const area of Object.values(world.areas)) {
      if (!area.occupants.length || !inside.has(area.id)) continue;
      for (const o of area.occupants) {
        if (o.disposition === "hostile" || /droid|beast|wildlife/i.test(o.role)) continue;
        const role = o.role.toLowerCase();
        out.push({ name: o.name, cls: /noble|official|diplomat|governor|senator|aristocrat|magistrate/.test(role) ? "upper" : /merchant|trader|shop|dock|medic|mechanic|barkeep|bartender|clerk|guild|banker|scholar|pilot/.test(role) ? "middle" : "lower" });
      }
    }
    return out;
  }, [world, settlementKey]);
  const downtimeBlocked = !character ? "no character" : dead ? "the character is dead" : inCombat ? "not in a fight" : hostiles.length ? "not with enemies about" : null;
  const checkFor = (c: { ability: string; using: string }) => {
    const using = c.using.toLowerCase();
    const level2 = level;
    const prof = Math.ceil(1 + level2 / 4);
    const skillRows = SKILLS.map((s) => s.name.toLowerCase());
    let bonus = modifier(character.abilityScores?.[c.ability]);
    let note = "";
    const proficientSkills: string[] = (character.skillProficiencies ?? []).map((s: string) => s.toLowerCase());
    const skillKnown = skillRows.includes(using);
    if (using === "attack roll") {
      const best = carriedWeapons(character).sort((a, b) => b.attackBonus - a.attackBonus)[0];
      bonus = best?.attackBonus ?? bonus;
      note = best ? best.name : "unarmed";
    } else if (skillKnown) {
      if (downtime.expertise.includes(using)) { bonus += 2 * prof; note = "expertise"; }
      else if (proficientSkills.includes(using)) { bonus += prof; note = "trained"; }
      else if (downtime.trained.includes(using)) { bonus += Math.floor(prof / 2); note = "half proficiency"; }
    } else {
      // A tool or kit, or a gaming set: the best the character is trained with that fits the name
      const names: string[] = [...(character.toolProficiencies ?? []), ...(character.equipment ?? [])];
      const hit = names.find((n) => n.toLowerCase().includes(using.replace(/ kit$| set$/, "")) || using.includes(n.toLowerCase()));
      const trained = (character.toolProficiencies ?? []).some((n: string) => n.toLowerCase().replace(/[^a-z]/g, "") === (hit ?? using).toLowerCase().replace(/[^a-z]/g, "")) || (using.includes("gaming") && (character.toolProficiencies ?? []).some((n: string) => /gaming|sabacc|dejarik|pazaak|chance/i.test(n)));
      if (trained) { bonus += downtime.expertise.includes(using) ? 2 * prof : prof; note = "trained"; }
      else if (downtime.trained.includes(using)) { bonus += Math.floor(prof / 2); note = "half proficiency"; }
      else note = "untrained";
    }
    // Exhaustion: disadvantage on ability checks
    const exhausted = (character.exhaustionLevel ?? 0) >= 1;
    const first = d20();
    const roll = exhausted ? Math.min(first, d20()) : first;
    return { roll, bonus, total: roll + bonus, note: `${note}${exhausted ? "; exhausted: disadvantage" : ""}`.replace(/^; /, "") };
  };
  const commitDowntime = (what: { character?: Record<string, any>; downtime: Partial<DowntimeState>; days: number; log?: string[]; renown?: number }) => {
    if (!character) return;
    const next: DowntimeState = { ...downtime, ...what.downtime };
    const today2 = dayOf(useClock.getState().minutes);
    next.log = [...downtime.log, ...(what.log ?? []).map((text) => ({ day: today2, text }))].slice(-40);
    const charChanges: Record<string, any> = { ...(what.character ?? {}) };
    const basePlay = (charChanges.playState ?? character.playState ?? {}) as any;
    charChanges.playState = { ...basePlay, downtime: next };
    saveCharacter(charChanges);
    const campaignChanges: Record<string, any> = {};
    // Rivals do not rest while the character does (Wretched Hives): in each workweek one of them may act
    if (what.days >= WORKWEEK && next.rivals.length) {
      const credits2 = Number(charChanges.credits ?? character.credits) || 0;
      for (const rival of next.rivals) {
        if (Math.random() > 0.35) continue;
        if (Math.random() < 0.5) {
          const lost = Math.min(Math.floor(credits2 * 0.15), (Math.floor(Math.random() * 6) + 1) * 100);
          if (lost > 0) {
            charChanges.credits = (Number(charChanges.credits ?? character.credits) || 0) - lost;
            next.log.push({ day: today2, text: `${rival.name} (${rival.whereName}) has your goods stolen: ${lost} cr.` });
          }
        } else {
          next.log.push({ day: today2, text: `${rival.name} (${rival.whereName}) spreads rumors about you; ${rival.motive.slice(0, 80)}` });
          if (settlementHere && rival.where === settlementHere.id) what.renown = (what.renown ?? 0) - 1;
        }
      }
      charChanges.playState = { ...(charChanges.playState as any), downtime: next };
      saveCharacter(charChanges);
    }
    if (what.days > 0) Object.assign(campaignChanges, pass(what.days * DAY));
    if (what.renown && settlementHere) {
      const holder = factionAt(world!, settlementHere.id);
      if (holder) campaignChanges.factionInfluence = addRenown(standing, holder, what.renown);
    }
    if (Object.keys(campaignChanges).length) saveCampaign(campaignChanges);
    if (what.log?.length) toast.info(what.log[0].slice(0, 160));
  };
  const spendBlackmail = (id: string) => {
    const item = downtime.blackmail.find((b) => b.id === id);
    if (!item || !world || !here) return;
    // The nearest locked way out of here opens, no check (the blackmailed see to it)
    const locked = exitsOf(world, here.id).find((e) => e.locked && e.pathId);
    if (!locked) return void toast.info("Nothing is locked here that blackmail would open.");
    openLock(locked, {}, false);
    commitDowntime({ downtime: { blackmail: downtime.blackmail.filter((b) => b.id !== id) }, days: 0, log: [`Blackmail on ${item.name} spent: ${locked.label} is opened for you.`] });
  };
  const spendLore = (id: string) => {
    const item = downtime.lore.find((l) => l.id === id);
    if (!item || !world || !here) return;
    // What is hidden in the room: ways, caches, secret entrances, without a check
    const hiddenPaths = world.paths.filter((p) => p.hidden && (p.from === here.id || p.to === here.id));
    const secretRooms = [here, ...childrenOf(world, here.id)].filter((a) => a.secretEntry && !a.secretEntry.found);
    const next = updateArea(world, here.id, { loot: here.loot.map((c) => ({ ...c, hidden: undefined })) }).world;
    const areas = { ...next.areas };
    for (const room of secretRooms) areas[room.id] = { ...areas[room.id], secretEntry: { ...room.secretEntry!, found: true } };
    saveCampaign({ galaxyMap: { ...next, areas, paths: next.paths.map((p) => (hiddenPaths.some((h) => h.id === p.id) ? { ...p, hidden: undefined } : p)) } });
    commitDowntime({ downtime: { lore: downtime.lore.filter((l) => l.id !== id) }, days: 0, log: [`Lore spent (${item.topic}): what is hidden here is found.`] });
  };

  const pointsName = klass?.casterType === "Tech" ? "Tech Points" : "Force Points";
  // Features that heal and have a use left can be used between fights, as they are in one (Second Wind)
  const parsedFeatures = useMemo(() => (character ? combatFeatures(character) : []), [character?.class, character?.level, character?.subclass, character?.species, character?.feats, character?.fighterManeuvers, character?.abilityScores]);
  const outsideFeatures = character && !inCombat && !dead
    ? parsedFeatures.filter((f) => f.heal && f.heal.target === "self" && (!f.uses || (play.featureUses?.[f.pool] ?? 0) < f.uses.max))
    : [];
  const useOutside = (f: ReturnType<typeof combatFeatures>[number]) => {
    if (!character || !f.heal || character.currentHp >= character.maxHp) return;
    const amount = Math.max(1, (f.heal.amount.dice ? rollDamage(f.heal.amount.dice, false) : 0) + f.heal.amount.flat);
    lastSavedHp.current = Math.min(character.maxHp, character.currentHp + amount);
    saveCharacter({
      currentHp: lastSavedHp.current,
      playState: { ...play, featureUses: { ...(play.featureUses ?? {}), [f.pool]: (play.featureUses?.[f.pool] ?? 0) + 1 } },
    });
    toast.success(`${f.name}: ${amount} hit points regained.`);
  };
  const restButtons = character && (
    <div className="flex flex-wrap gap-2" data-testid="play-rest">
      <div className="flex w-full flex-wrap items-center gap-1 text-xs" data-testid="supplies">
        <span className="text-gray-300">
          Food and water: {supplies.hungry ? `${supplies.hungry} day${supplies.hungry > 1 ? "s" : ""} without food, ` : ""}{supplies.water} pints carried
          {" "}({((character.equipment ?? []) as string[]).filter((n) => !!foodOf({ name: n, description: factsOf(n)?.description })).length} days' rations)
        </span>
        <label className="flex items-center gap-1">
          Lifestyle in settlements:
          <select className="h-6 rounded bg-gray-700 px-1" value={supplies.lifestyle ?? "Modest"} onChange={(e) => patchPlay({ supplies: { ...supplies, lifestyle: e.target.value } })} data-testid="lifestyle">
            {GEAR.lifestyle.map((l) => <option key={l.name} value={l.name}>{l.name} ({l.cost} cr/day)</option>)}
          </select>
        </label>
      </div>
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
      {outsideFeatures.map((f) => (
        <Button key={f.key} size="sm" variant="outline" onClick={() => useOutside(f)} disabled={character.currentHp >= character.maxHp} data-testid={`feature-${f.name}`}>
          {f.name}{f.uses ? ` (${f.uses.max - (play.featureUses?.[f.pool] ?? 0)} left)` : ""}
        </Button>
      ))}
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
      {checkAsk && <CheckDialog request={checkAsk.request} onRoll={(roller, skill) => finishCheck(roller, skill)} onCancel={() => finishCheck(null, null)} />}
      {pilot && (
        <MinigamePage
          game={{ kind: "run", title: `Route to ${world?.areas[pilot.exit.to]?.name ?? "the next settlement"}`, seed: pilot.seed, mode: pilot.mode, count: routeCount(kmOf(pilot.exit.travel) ?? 0), vehicle: String(vehicles.find((v) => v.id === pilot.ride.vehicleId)?.model ?? "Landspeeder") }}
          onExit={() => setPilot(null)}
          onDone={(r) => {
            setPilot(null);
            if (r.kind !== "run") return;
            travel(pilot.exit, { ...pilot.ride, pilot: false, minutes: pilotMinutes(pilot.ride.minutes, r.collected, r.course.rings.length) });
          }}
        />
      )}
      <KeyboardControls map={controls}>
        {/* The 3D map. On a phone it has the top of the screen and the HUD the rest */}
        <div className={`absolute inset-x-0 top-0 md:h-full ${showSidebar ? "md:right-80" : ""} ${showSidebar || showCombat ? "h-[46dvh]" : "h-full"}`} data-testid="map-3d">
        {/* Outside a fight the scene starts under the strip of map buttons and hint, not behind it */}
        <div className={`absolute inset-x-0 bottom-0 ${inCombat || shipFight ? "top-0" : "top-16 md:top-12"}`}>
        <Canvas
          shadows
          dpr={sharpness}
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
          <CompassRig />
          {/* A slow device draws fewer pixels: the render scale steps down while frames are below
              30 a second, and back up when there is room */}
          <PerformanceMonitor
            bounds={() => [30, 50]}
            onDecline={() => {
              setSharpness((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100));
              // (and once the render scale is down, fewer plants and no flowers in the gardens of a site)
              if (sharpness <= 0.75) useQuality.getState().lower();
            }}
            onIncline={() => {
              setSharpness((s) => Math.min(1.5, Math.round((s + 0.25) * 100) / 100));
              if (sharpness >= 1.25) useQuality.getState().raise();
            }}
          />
          
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1} 
          />
          
          {/* A fight is shown on the floor it is fought on; otherwise the place being looked at */}
          {shipFight ? (
            <SpaceScene />
          ) : inCombat && !fightArena.district ? (
            <FightScene areaId={here?.layout ? here.id : null} origin={here?.layout} />
          ) : world ? (
            <LocalMap world={scene} hereId={hereId} viewId={viewId} selectedId={picked?.kind === "area" ? picked.id : null} onAct={act} locked={dead || exploring} />
          ) : activeMapTab === "galaxy" ? (
            <GalaxyMap />
          ) : (
            <LocalMap />
          )}
        </Canvas>
        <Compass />
        </div>

        {/* Where the map is looking: the way down from the galaxy, each step a tap away. Only the
            buttons take taps; the rest of the strip lets them through to the map. */}
        {!inCombat && !shipFight && (
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
              <Button
                size="sm" variant="outline" className="pointer-events-auto h-6 shrink-0 px-2 text-xs" data-testid="detail-toggle"
                title={`How much the map draws: Auto follows the device (now ${detailTier}), Lite draws fewer plants (phones), Full everything`}
                onClick={() => useQuality.getState().fix(detailFixed === undefined ? "lite" : detailFixed === "lite" ? "full" : undefined)}
              >
                Detail: {detailFixed ? (detailFixed === "lite" ? "Lite" : "Full") : "Auto"}
              </Button>
              {onFoot && (
                <Button
                  size="sm" variant="outline" className="pointer-events-auto h-6 shrink-0 px-2 text-xs" data-testid="view-toggle"
                  title="Overhead, over the shoulder, or first person (V). Drag to look; W A S D or the stick to walk; E, Space or Use to act on what the crosshair is on"
                  onClick={() => useView.getState().next()}
                >
                  View: {VIEW_LABEL[viewMode]}
                </Button>
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
            {heistOf && here?.id === heistOf.areaId && heistOf.takeoffAt !== undefined && clockMinutes < heistOf.takeoffAt && (
              <p className="mt-0.5 text-[11px] leading-tight font-semibold text-yellow-300 drop-shadow" data-testid="heist-countdown">
                {heistOf.shipName} lifts off in {heistOf.takeoffAt - clockMinutes} min, with or without you.
              </p>
            )}
            {pursuit && (
              <p className="mt-0.5 text-[11px] leading-tight font-semibold text-red-300 drop-shadow" data-testid="pursuit">
                {pursuit.phase === "coming"
                  ? `${pursuit.pursuit.cartel ? "Enforcers" : "Security"} reach the scene in ${pursuit.minutes} min: ${pursuit.pursuit.officers} ${pursuit.pursuit.heavy ? "heavy troopers" : "officers"} after ${CRIME_NAMES[pursuit.pursuit.crime]}.`
                  : pursuit.here
                    ? `Officers are searching this district for the offenders: ${pursuit.minutes} min left. Lie low, or leave the district.`
                    : `Officers are still searching the district: ${pursuit.minutes} min left.`}
              </p>
            )}
            {pursuit && pursuit.phase === "searching" && (
              <p className="mt-0.5 text-[11px] leading-tight text-red-200 drop-shadow" data-testid="search-status">
                {pursuit.pursuit.squads?.length ? `${pursuit.pursuit.squads.length} squad${pursuit.pursuit.squads.length > 1 ? "s" : ""} on foot${pursuit.pursuit.identified ? ", and they know who you are" : ""}. ` : ""}
                {pursuit.pursuit.lastNote ?? ""}
              </p>
            )}
            {heat > 0 && (
              <p className="mt-0.5 text-[11px] leading-tight text-red-200 drop-shadow" data-testid="reputation">
                {["", "Known to the watch here", "Wanted here", "Marked: the ways out are blockaded during a search"][heat]}.
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

            {encounterHere && (["talk", "follow", "surround"].includes(encounterHere.phase) || gangReady) && (
              <div className="mb-4 space-y-2 rounded border border-yellow-500/60 p-2 text-xs" data-testid="encounter">
                <h3 className="font-semibold text-yellow-300">{encounterHere.title}</h3>
                <p className="text-gray-300">
                  {encounterHere.phase === "follow"
                    ? `${encounterHere.person} is following you. Take them to ${world?.areas[encounterHere.target ?? ""]?.name ?? "the place they named"}: walk to its front door with them.`
                    : encounterHere.text}
                </p>
                <div className="flex flex-wrap gap-1">
                  {optionsOf(encounterHere, level, pathToTeach(learner), character.credits ?? 0).map((option, index) => (
                    <Button key={option.label} size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={inCombat || dead || (option.cost ?? 0) > (character.credits ?? 0) || (encounterHere.kind === "robbery" && (!gangReady || here?.kind !== "building"))} onClick={() => answerEncounter(index)}>
                      {option.label}
                    </Button>
                  ))}
                </div>
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

            <div className="mb-3 flex flex-wrap gap-1" data-testid="hud-tabs">
              {(["here", "party", "trade", "quests", "pack", "downtime", "gm", ...(TEST_MENU ? ["test"] : [])] as HudTab[]).map((tab) => (
                <Button key={tab} role="tab" aria-selected={hudTab === tab} size="sm" variant={hudTab === tab ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setHudTab(tab)} data-testid={`hud-tab-${tab}`}>
                  {{ here: "Here", party: "Party", trade: "Trade", quests: "Quests", pack: "Inventory", downtime: "Downtime", gm: "GM Interface", test: "Test" }[tab]}
                  {tab === "trade" && dealingNow && hudTab !== "trade" && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />}
                </Button>
              ))}
            </div>
            <div className={hudTab === "here" ? "" : "hidden"} data-testid="hud-here">
            {aboardShip && world && (
              <div className="mb-4 space-y-2 rounded border border-sky-500/60 p-2 text-xs" data-testid="helm">
                <h3 className="font-semibold text-sky-300">Aboard {aboardShip.name}</h3>
                <p className="text-gray-300">
                  {aboardShip.size} {aboardShip.role.toLowerCase()}, fuel {aboardShip.fuel}/{fuelCap(aboardShip)}
                  {aboardShip.hyperdriveClass ? `, hyperdrive class ${aboardShip.hyperdriveClass}` : ", no hyperdrive"}; {world.areas[aboardShip.areaId]?.kind === "settlement" ? "landed at" : "in the space of"} {world.areas[aboardShip.areaId]?.name}.
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => setHelmOpen((open) => !open)} data-testid="helm-open">
                    {helmOpen ? "Leave the helm" : "Take the helm"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2" onClick={disembarkNow} disabled={inCombat || dead} data-testid="disembark">
                    Disembark
                  </Button>
                </div>
                {crewPanel(aboardShip)}
                {shipRows.length > 0 && (
                  <ShipSystems
                    ship={aboardShip}
                    sheet={shipSheet(aboardShip, shipRows, proficiency)}
                    parts={shipParts}
                    workers={[{ id: "self", name: character.name }, ...party.filter((c) => c.kind !== "beast" && c.hp > 0).map((c) => ({ id: c.id, name: c.name }))]}
                    hasKit={!!mechanicsKit()}
                    atPort={hasPort(world, aboardShip.areaId)}
                    credits={character.credits ?? 0}
                    disabled={inCombat || dead}
                    minutesNow={clockMinutes}
                    shipRows={shipRows}
                    onCrewInstall={(part, workers, weapon, hands) => crewInstall(aboardShip, part, workers, weapon, hands)}
                    onCrewTier={(workers, hands) => crewTier(aboardShip, workers, hands)}
                    onRemove={(m, i) => removeShipMod(aboardShip, m, i)}
                  />
                )}
                {world.areas[aboardShip.areaId]?.kind === "settlement" && hangarsOf(world, aboardShip.areaId).length > 0 && (
                  <div className="space-y-1" data-testid="hangars">
                    <p className="font-semibold">{aboardShip.hangar ? "Put down in" : "Choose a hangar to put down in"}</p>
                    {hangarsOf(world, aboardShip.areaId).map((h) => {
                      const gate = hangarOpen(world, h, standing);
                      const here = aboardShip.hangar === h.buildingId;
                      return (
                        <div key={h.buildingId} className="flex items-center justify-between gap-2">
                          <span>{h.name} <span className="text-gray-400">{gate.open ? h.note : gate.reason}</span></span>
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || !gate.open || here} onClick={() => chooseHangar(aboardShip, h)} data-testid={`hangar-${h.kind}`}>
                            {here ? "Here" : gate.open ? (aboardShip.hangar ? "Move (10 min)" : "Put down") : "By invitation"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {helmOpen && (
                  <div className="space-y-1" data-testid="helm-courses">
                    {isLowFuel(aboardShip) && (
                      <div className="flex items-center justify-between gap-2 rounded bg-amber-900/40 px-2 py-1" data-testid="low-fuel">
                        <span><b>LOW FUEL</b>: the ship limps at {LIMP_FACTOR} times the time and burns nothing (house rule). Call a tanker to fill it.</span>
                        <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || exploring} onClick={() => callTanker(aboardShip)} data-testid="call-tanker">Call a tanker</Button>
                      </div>
                    )}
                    {helmExits(world, aboardShip.areaId).map((exit, i) => {
                      const short = (!isLowFuel(aboardShip) && (exit.fuel ?? 0) > aboardShip.fuel) || (exit.jump && !aboardShip.hyperdriveClass) || !!shipBusy(aboardShip);
                      const minutes = tripMinutes(exit, Number(aboardShip.hyperdriveClass) || 1) * (isLowFuel(aboardShip) ? LIMP_FACTOR : 1);
                      return (
                        <div key={`${exit.to}-${i}`} className="flex items-center justify-between gap-2">
                          <span>
                            {exit.label} {world.areas[exit.to]?.name}
                            <span className="text-gray-400"> ({exit.jump ? "jump, " : ""}fuel {exit.fuel ?? 0}, {rideText(minutes)})</span>
                          </span>
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || exploring || !!short} onClick={() => flyShip(exit)} data-testid={`helm-go-${exit.to}`}>
                            {exit.via === "leave" ? "Take off" : exit.jump ? "Jump" : "Fly"}
                          </Button>
                        </div>
                      );
                    })}
                    {helmExits(world, aboardShip.areaId).length === 0 && <p className="text-gray-400">No course leads from here.</p>}
                  </div>
                )}
              </div>
            )}
            {heistOf && (
              <HeistPanel
                heist={heistOf}
                minute={clockMinutes}
                here={here?.id === heistOf.areaId}
                law={lawAt(world, heistOf.areaId)}
                credits={character.credits ?? 0}
                disabled={inCombat || dead}
                onCheck={async (how, abilities, trained, what) => {
                  const ok = await abilityCheck(what, heistDC(heistOf.stage, lawAt(world, heistOf.areaId)), abilities, trained);
                  if (cancelledCheck.current) return;
                  runHeist(how, ok);
                }}
                onBribe={(cost) => runHeist("bribe", true, cost)}
                onAbandon={abandonHeist}
                kitTrained={!!lockKit() && trainedWith(lockKit()!)}
                skilled={skilled}
              />
            )}

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
                    ({world ? kindLabel(world, here) : here.kind}{here.kind !== "room" && here.type !== here.kind ? `, ${here.type}` : ""})
                  </span>
                </p>
                {here.description && <p className="text-sm text-gray-400">{here.description}</p>}
                {exposures.length > 0 && (
                  <div className="space-y-0.5 text-xs" data-testid="play-hazards">
                    {exposures.map((e) => (
                      <p key={e.hazard} className={e.safe ? "text-emerald-300" : "text-amber-300"} data-testid={`hazard-${e.hazard}`}>
                        {e.why}: {e.safe ? `kept off by ${e.by}${e.breathing ? ` (${protections().air} minutes of air)` : ""}` : HAZARD_HOUR[e.hazard].text}
                      </p>
                    ))}
                  </div>
                )}

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
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || hostiles.length > 0} onClick={() => (vehicle.civil ? stealVehicle : takeVehicle)(building, vehicle)}>{vehicle.civil ? "Steal it (hotwire)" : "Take it"}</Button>
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
                {here.loot.filter((c) => !c.hidden && c.node).map((cache) => {
                  const node = nodeAt(cache.node!, useClock.getState().minutes);
                  const family = FAMILIES[node.family];
                  return (
                    <div key={cache.id} className="text-sm flex flex-wrap items-center gap-2" data-testid="play-node">
                      <span>
                        {cache.name} <span className="text-gray-400">({RARITY_TIERS[node.tier]} {family.label.toLowerCase()}, {node.charges} of {node.max} harvests)</span>
                      </span>
                      <Button size="sm" variant="outline" onClick={() => harvest(cache)} disabled={inCombat || dead || lootWatched || node.charges <= 0}>
                        {family.verb[0].toUpperCase()}{family.verb.slice(1)} (DC {harvestDc(node.tier)})
                      </Button>
                    </div>
                  );
                })}
                {here.loot.filter((c) => !c.hidden && !c.node).map((cache) => (
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
                    const rides = exit.locked ? [] : ridesFor(exit);
                    return (
                      <div key={`${exit.via}-${exit.to}`} className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-auto whitespace-normal justify-start text-left"
                          disabled={inCombat || dead || exploring}
                          onClick={() => leaveBy(exit)}
                        >
                          {exit.locked ? `Unlock (DC ${exit.locked}): ` : ""}{exit.label}{exit.via === "path" ? " to" : ""} {world.areas[exit.to].name}
                          {[travelText(exit), tripNote(exit)].filter(Boolean).length > 0 && (
                            <span className="text-gray-400 ml-1">({[travelText(exit), tripNote(exit)].filter(Boolean).join(", ")})</span>
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
                                disabled={inCombat || dead || exploring || !!ride.blocked || (ride.fare > (character.credits ?? 0))}
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
                  {hostiles.length > 0 && !allowed && <p className="text-xs text-red-400">Watching you: {alert >= ALERT.questioning ? "they can see you; slipping past takes a Stealth check." : "a Stealth check to slip past."}</p>}
                  {!!world && !!here && blockadeAt(world, settlementOf(world, here.id), clockMinutes) && <p className="text-xs text-red-400" data-testid="blockade">Blockade: the officers hold the ways out of the settlement and its vehicles until the search is called off.</p>}
                  <label className="flex items-center gap-2 text-sm" data-testid="play-sneak">
                    <input type="checkbox" checked={sneaking} onChange={(e) => setSneaking(e.target.checked)} />
                    Move quietly (Stealth against whoever is watching)
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={search} disabled={inCombat || dead || hostiles.length > 0}>
                    Search
                  </Button>
                  {pursuit?.here && pursuit.phase === "searching" && (
                    <Button size="sm" variant="destructive" onClick={lieLowNow} disabled={inCombat || dead} data-testid="lie-low">
                      Lie low (Stealth)
                    </Button>
                  )}
                  {pursuit?.here && pursuit.phase === "searching" && shelterOwnerHere && hideouts.map((exit) => (
                    <Button key={`shelter-${exit.to}`} size="sm" variant="outline" disabled={inCombat || dead} onClick={() => askShelter(exit)} data-testid="ask-shelter">
                      Ask {shelterOwnerHere.name} to open the {world.areas[exit.to].name}
                    </Button>
                  ))}
                  {callsHere.map((r) => (
                    <div key={`call-${r.who}`} className="flex w-full flex-wrap items-center gap-1 text-xs text-red-300" data-testid="call-to-security">
                      <span>{r.who} is calling security on the comm.</span>
                      <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} onClick={() => talkDown(r.who)} data-testid="talk-down">Talk them down (Intimidate)</Button>
                      <Button size="sm" variant="destructive" className="h-6 px-2" disabled={inCombat || dead} onClick={() => silence(r.who)} data-testid="silence">Silence them</Button>
                    </div>
                  ))}
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
                            {ship.size} {ship.role.toLowerCase()}, fuel {ship.fuel}/{fuelCap(ship)}
                            {ship.hyperdriveClass ? `, hyperdrive class ${ship.hyperdriveClass}` : ", no hyperdrive"}
                            {ship.areaId === here.id ? ", here" : `, at ${world.areas[ship.areaId]?.name ?? "an unknown berth"}`}
                          </span>
                        </span>
                        {(() => {
                          // A damaged ship is refitted at a port: the hull dice missing, by the size's cost and time
                          if (ship.areaId !== here.id || !hasPort(world, here.id) || ship.hull === undefined || !shipRows.length) return null;
                          const sheet = shipSheet(ship, shipRows);
                          const plan = refitPlan(sheet, ship.hull);
                          if (!plan) return null;
                          return (
                            <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead || (character.credits ?? 0) < plan.cost} data-testid="ship-refit" onClick={() => {
                              saveCharacter({ credits: character.credits - plan.cost });
                              saveCampaign({ starships: ships.map((s) => (s.id === ship.id ? { ...s, hull: undefined } : s)), ...pass(plan.hours * 60) });
                              toast.success(`${ship.name} is refitted: ${plan.dice} hull dice for ${plan.cost.toLocaleString()} credits and ${plan.hours >= 24 ? `${Math.round(plan.hours / 24)} days` : `${plan.hours} hours`}.`);
                            }}>
                              Refit ({plan.cost.toLocaleString()} cr)
                            </Button>
                          );
                        })()}
                        {ship.areaId === here.id && hasPort(world, here.id) && !sellsFuelAt(world, here.id) && ship.fuel < fuelCap(ship) && (
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
            </div>
            <div className={hudTab === "party" ? "" : "hidden"} data-testid="hud-party">
            {(party.length > 0 || roster.some((r: any) => r.id !== character.id)) && (
              <div className="mb-4 space-y-2" data-testid="play-party">
                <h3 className="font-semibold">Companions ({party.length}/{COMPANION_LIMIT})</h3>
                {party.map((c) => (
                  <div key={c.id} className="text-sm" data-testid="party-member">
                    <div className="flex justify-between">
                      <span>
                        {c.name}{" "}
                        <span className="text-xs text-gray-400">
                          {c.kind === "hireling" ? `hired, ${c.wage} cr/day` : c.kind === "droid" ? (c.bolt === "reprogrammed" ? "droid, reprogrammed" : "droid, restraining bolt") : c.kind === "beast" ? (c.mount ? "beast, mount" : "beast") : c.kind === "character" ? "your character" : "freed"}
                        </span>
                      </span>
                      <span>{c.hp > 0 ? `${c.hp}/${c.maxHp}` : c.kind === "droid" ? "powered down" : "down"}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-700">
                      <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%` }} />
                    </div>
                    <div className="mt-0.5 flex gap-1 text-xs text-gray-400">
                      <span>AC {c.armorClass}{c.attack ? `, ${c.attack.name} ${c.attack.bonus >= 0 ? "+" : ""}${c.attack.bonus} (${c.attack.damage})` : ""}</span>
                      {c.kind === "droid" && (
                        <Button size="sm" variant="ghost" className="ml-auto h-5 px-1 text-xs" data-testid={`customize-open-${c.id}`} onClick={() => setCustomizing(customizing === c.id ? null : c.id)}>Customize</Button>
                      )}
                      <Button size="sm" variant="ghost" className={`${c.kind === "droid" ? "" : "ml-auto "}h-5 px-1 text-xs`} disabled={inCombat} onClick={() => dismiss(c)}>Dismiss</Button>
                    </div>
                    {customizing === c.id && droidPanel(c)}
                  </div>
                ))}
                <p className="text-xs text-gray-500">{party.length ? "They fight at your side and heal on rests. Wages are paid each day (house rule)." : "No companions yet: hire someone, free a captive, mend a droid or gentle a beast."}</p>
                {!partyFull && roster.filter((r: any) => r.id !== character.id && !(r.conditions ?? []).includes("Dead") && !party.some((c) => c.name === r.name && c.kind === "character")).length > 0 && (
                  <label className="flex items-center gap-1 text-xs" data-testid="recruit-character">
                    Bring one of your characters:
                    <select
                      className="h-7 min-w-0 flex-1 rounded bg-gray-700 px-1"
                      value=""
                      disabled={inCombat}
                      onChange={(e) => {
                        const other = roster.find((r: any) => String(r.id) === e.target.value);
                        if (other) recruitCharacter(other);
                      }}
                    >
                      <option value="">choose</option>
                      {roster
                        .filter((r: any) => r.id !== character.id && !(r.conditions ?? []).includes("Dead") && !party.some((c) => c.name === r.name && c.kind === "character"))
                        .map((r: any) => (
                          <option key={r.id} value={r.id}>{r.name} (level {r.level} {r.class})</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {(play.tracked ?? []).length > 0 && (
              <div className="mb-4 text-xs" data-testid="play-tracked">
                <h3 className="text-sm font-semibold">Tracked by beacon</h3>
                {(play.tracked ?? []).map((t) => (
                  <p key={t.id} className="text-gray-300">{t.name}: {shipWhere(t.id)}</p>
                ))}
              </div>
            )}
            </div>
            <div className={hudTab === "trade" ? "" : "hidden"} data-testid="hud-trade">
              {dealingNow ? (
                <div className="space-y-1" data-testid="trade-hud">
                  <p className="font-semibold text-amber-200">{dealingNow.o.name}</p>
                  <p className="text-xs text-gray-300">{[dealingNow.o.species, dealingNow.o.role, dealingNow.o.disposition].filter(Boolean).join(", ")}</p>
                  {dealings(dealingNow.o, dealingNow.holderId)}
                </div>
              ) : (
                <p className="text-sm text-gray-400" data-testid="trade-none">Tap a trader, dealer or stallholder on the map and what they sell, buy and do comes up here.</p>
              )}
            </div>
            {hudTab === "quests" && (
              <div>
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
              </div>
            )}
            {hudTab === "pack" && (
              <div>
                <h3 className="font-semibold mb-1">Inventory</h3>
                <p className="text-sm text-yellow-300 mb-2" data-testid="inventory-credits">Credits: {(character.credits ?? 0).toLocaleString()}</p>
                {(attuned.length > 0 || Object.values(itemFacts ?? {}).length > 0) && (
                  <p className="text-xs text-gray-400 mb-1" data-testid="attunement-slots">Attunement: {slotsUsed} of {slotsMax} slots used (house rule: an hour, not a rest).</p>
                )}
                {(play.augments ?? []).length > 0 && (
                  <div className="text-xs text-gray-300 mb-2" data-testid="augmentations">
                    <p className="font-semibold">Augmentations ({(play.augments ?? []).length}; {(play.augments ?? []).filter((a) => !a.prosthesis).length} of {augmentationLimit(level)} supported, prostheses are extra)</p>
                    {(play.augments ?? []).map((a, i) => <p key={`${a.name}-${i}`}>{a.name}{itemFacts?.[a.name.toLowerCase()] ? `: ${describeEffects(itemFacts[a.name.toLowerCase()].effects) || itemFacts[a.name.toLowerCase()].text.slice(0, 120)}` : ""}</p>)}
                    {sideEffectsOf((play.augments ?? []).length).map((t) => <p key={t} className="text-amber-300">Body: {t}.</p>)}
                  </div>
                )}
                {(() => {
                  const load = loadNow();
                  return (
                    <div className="mb-2 space-y-0.5 text-xs" data-testid="inventory-load">
                      <p className={load.level ? "text-amber-300" : "text-gray-300"} data-testid="load-line" data-level={load.level}>
                        Carrying {load.weight} lb of {load.capacity} ({load.packed} lb in containers){load.level === 3 ? ": over capacity, speed 5 ft." : load.level === 2 ? ": heavily encumbered (speed -20 ft., disadvantage on Strength, Dexterity and Constitution)" : load.level === 1 ? ": encumbered (speed -10 ft.)" : ""}. {load.notes.join("; ")}
                      </p>
                      <label className="flex items-center gap-1 text-gray-400">
                        <input type="checkbox" checked={variantOn} onChange={(e) => patchPlay({ encumbrance: e.target.checked ? "variant" : "basic" })} data-testid="encumbrance-variant" />
                        Variant: Encumbrance (the book's; off, only the capacity counts and armor's Strength requirement applies)
                      </label>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-1 mb-2" data-testid="inventory-tabs">
                  {([["all", "All"], ["weapons", "Weapons"], ["armor", "Armor"], ["gear", "Gear"], ["ships", `Ships (${ships.length})`], ["speeders", `Speeders (${vehicles.length})`]] as const).map(([key, label]) => (
                    <Button key={key} size="sm" variant={invTab === key ? "default" : "outline"} className="h-6 px-2 text-xs" data-testid={`inventory-tab-${key}`} onClick={() => setInvTab(key)}>
                      {label}
                    </Button>
                  ))}
                </div>
                {invTab === "ships" && (
                  <div className="space-y-1 text-sm" data-testid="inventory-ships">
                    {ships.map((sh) => (
                      <p key={sh.id}>
                        {sh.name} <span className="text-xs text-gray-400">{sh.size} {sh.role}, hull {sh.hull ?? "undamaged"}, fuel {sh.fuel}, {world && here && sh.areaId === berthOf(world, here.id) ? "berthed here" : shipPlace(sh)}</span>
                      </p>
                    ))}
                    {ships.length === 0 && <p className="text-gray-400">No ships acquired yet.</p>}
                  </div>
                )}
                {invTab === "speeders" && (
                  <div className="space-y-1 text-sm" data-testid="inventory-speeders">
                    {vehicles.map((v) => (
                      <p key={v.id}>
                        {v.name} <span className="text-xs text-gray-400">{v.mph} mph, seats {v.seats}, {v.status === "wrecked" ? "wrecked" : world && here && v.areaId === berthOf(world, here.id) ? "parked here" : `parked at ${world?.areas[v.areaId]?.name ?? "a settlement"}`}</span>
                      </p>
                    ))}
                    {vehicles.length === 0 && <p className="text-gray-400">No speeders acquired yet.</p>}
                  </div>
                )}
                {invTab !== "ships" && invTab !== "speeders" && (() => {
                  const worn = equippedNow(character);
                  const counts = new Map<string, number>();
                  for (const item of character.equipment ?? []) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
                  const is = (list: (string | null)[], name: string) => list.some((n) => n && n.toLowerCase() === name.toLowerCase());
                  const rank = { weapon: 0, armor: 1, shield: 2, gear: 3 };
                  return (
                    <div className="space-y-1" data-testid="inventory-list">
                      {hiding.length > 0 && (
                        <p className="text-xs text-gray-400" data-testid="hiding-line">
                          Hiding places: {hiding.map((h) => `${h.item} (${h.lb} lb, DC ${h.dc})`).join(", ")}; {Math.max(0, Math.round(hideRoom * 10) / 10)} lb free. The law searches you at customs and checkpoints, and on landing where it is policed: what it finds of its contraband it seizes (house rule).
                        </p>
                      )}
                      {[...counts.entries()]
                        .filter(([name]) => {
                          const k = itemKind(name, character);
                          return invTab === "all" || (invTab === "weapons" ? k === "weapon" : invTab === "armor" ? k === "armor" || k === "shield" : k === "gear");
                        })
                        .sort(([a], [b]) => rank[itemKind(a, character)] - rank[itemKind(b, character)] || a.localeCompare(b))
                        .map(([name, count]) => {
                          const kind = itemKind(name, character);
                          const enhanced = factsOfItem(name);
                          const plain = factsOf(name);
                          const modKind = !enhanced && plain ? modKindOf({ name, equipmentCategory: plain.equipmentCategory, weaponClassification: (plain as any).weaponClassification }) : undefined;
                          const fitted = play.fitted?.[name];
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
                                  {hiddenNow[name] ? <span className="ml-1 text-xs text-amber-300">{hiddenNow[name]} hidden</span> : null}
                                  {kind !== "gear" && <span className="ml-1 text-xs text-gray-400">{kind === "weapon" ? "weapon" : kind === "shield" ? "shield" : "armor"}{on ? ", " + (kind === "weapon" ? "in hand" : "worn") : ""}</span>}
                                </span>
                                {kind !== "gear" && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`equip-${name}`} onClick={() => setEquipped(name, !on)}>
                                    {on ? (kind === "weapon" ? "Put away" : "Take off") : kind === "weapon" ? "Wield" : "Wear"}
                                  </Button>
                                )}
                                {modKind && (
                                  <Button size="sm" variant={modding === name ? "default" : "outline"} className="h-6 px-2" data-testid={`modify-${name}`} onClick={() => setModding(modding === name ? null : name)}>
                                    Modify
                                  </Button>
                                )}
                                {((enhanced && enhanced.attune > 0) || (!enhanced && (play.fitted?.[name]?.mods?.length ?? 0) > 0)) && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`attune-${name}`} onClick={() => (isAttuned(character, name) ? unattune(name) : attune(name))}>
                                    {isAttuned(character, name) ? "Break attunement" : "Attune"}
                                  </Button>
                                )}
                                {enhanced?.timed && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`take-${name}`} onClick={() => takeTimed(name)}>
                                    {enhanced.timed.kind === "collimator" ? "Apply" : "Use"}
                                  </Button>
                                )}
                                {hiding.length > 0 && !hiding.some((h) => h.item === name) && (hiddenNow[name] ?? 0) < count && pounds(name) <= hideRoom && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`hide-${name}`} onClick={() => hide(name, true)}>Hide</Button>
                                )}
                                {(hiddenNow[name] ?? 0) > 0 && (
                                  <Button size="sm" variant="outline" className="h-6 px-2" disabled={inCombat || dead} data-testid={`unhide-${name}`} onClick={() => hide(name, false)}>Take out</Button>
                                )}
                                {use && (
                                  <Button size="sm" variant={using === name ? "default" : "outline"} className="h-6 px-2" data-testid={`use-${name}`} onClick={() => setUsing(using === name ? null : name)}>
                                    {use.kind === "tool" ? "Tool" : use.kind === "game" ? "Game" : use.kind === "instrument" ? "Play" : "Use"}
                                  </Button>
                                )}
                              </div>
                              {enhanced && (
                                <p className="text-xs text-gray-400" data-testid={`item-effects-${name}`}>
                                  {enhanced.rarity.toLowerCase()}
                                  {enhanced.attune > 0 ? (isAttuned(character, name) ? ", attuned" : ", needs attunement: no enhanced effect until then") : ""}
                                  {describeEffects(enhanced.effects) ? ` · ${describeEffects(enhanced.effects)}` : ""}
                                  {enhanced.timed ? ` · ${enhanced.timed.kind}, ${enhanced.timed.minutes >= 60 ? `${enhanced.timed.minutes / 60} h` : "a minute"}${describeEffects(enhanced.timed.effects) ? `: ${describeEffects(enhanced.timed.effects)}` : ""}` : ""}
                                </p>
                              )}
                              {fitted && fitted.mods.length > 0 && (
                                <p className="text-xs text-gray-400" data-testid={`fitted-${name}`}>
                                  {fitted.rarity.toLowerCase()} chassis, {fitted.mods.length} modification{fitted.mods.length > 1 ? "s" : ""}: {fitted.mods.join(", ")}
                                  {isAttuned(character, name) ? "" : " (needs attunement)"}{fitted.crystal ? ` · ${fitted.crystal} crystal` : ""}
                                </p>
                              )}
                              {using === name && usePanel(name)}
                              {modding === name && modPanel(name)}
                            </div>
                          );
                        })}
                      {counts.size === 0 && <p className="text-sm text-gray-400">Nothing carried.</p>}
                    </div>
                  );
                })()}
              </div>
            )}
            {hudTab === "downtime" && (
              <div>
                {character && (
                  <DowntimePanel
                    character={character}
                    level={level}
                    day={dayOf(clock)}
                    settlement={settlementHere ? { id: settlementHere.id, name: settlementHere.name, type: String(settlementHere.type ?? ""), faction: factionAt(world!, settlementHere.id) } : null}
                    blocked={downtimeBlocked}
                    equipment={equipmentData}
                    tools={toolData}
                    people={downtimePeople}
                    hasVehicle={Array.isArray(campaign?.vehicles) && campaign.vehicles.length > 0}
                    hasShip={ships.length > 0}
                    vehicleModel={campaign?.vehicles?.[0]?.model}
                    shipSpec={ships[0] ? { size: ships[0].size, role: ships[0].role } : undefined}
                    partyShips={shipRows.length ? ships.map((sh) => ({ id: sh.id, name: sh.name, sheet: shipSheet(sh, shipRows, proficiency), owner: sh.owner, where: world?.areas[sh.areaId]?.name, busy: shipBusy(sh) ? `${shipBusy(sh)!.what} at the yard` : sh.status === "wrecked" ? "wrecked" : undefined })) : []}
                    shipRows={shipRows}
                    biome={world && hereId ? trailOf(world, hereId).find((a) => a.kind === "planet")?.type : undefined}
                    state={downtime}
                    check={checkFor}
                    ask={askCheck}
                    commit={commitDowntime}
                    spendBlackmail={spendBlackmail}
                    spendLore={spendLore}
                    openPit={openPit}
                  />
                )}
              </div>
            )}
            {hudTab === "gm" && (
              <div>
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
              </div>
            )}
            {TEST_MENU && hudTab === "test" && (
              <div>
              {testMenu()}
              </div>
            )}
      </div>
        )}

        {/* Combat UI */}
        {pitOpen && <PitArena enhanced={pitEnhanced} opponentFor={(bout) => pitOpponent(monsterData as unknown as Sw5eMonster[], bout, Math.random)} launch={launchBout} keepHp={keepPitHp} bank={bankPit} onExit={exitPit} />}
        {showCombat && !pitOpen && <PlayCombat items={combatItems} />}
        {shipFight && <ShipCombatPanel onFinish={finishShipFight} />}
      </KeyboardControls>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Downtime (Wretched Hives, Entertainment and Downtime; the engine is in shared/logic "Downtime").
// A workweek of an activity: the money is paid, up to three checks are made (each after the first
// five harder), the best one's roll modifier goes to a d100 and the result table is read. What a
// result gives is kept in the character's `playState.downtime`.
// ---------------------------------------------------------------------------------------------

interface DowntimeProps {
  character: any;
  level: number;
  day: number;
  // The settlement the party is in (downtime needs one), or why it cannot be done now
  settlement: { id: string; name: string; type: string; faction?: string } | null;
  blocked: string | null;
  equipment: any[];
  tools: ToolFacts[];
  // People of this settlement, for naming contacts and blackmail: their names and the social class their role suggests
  people: { name: string; cls: "lower" | "middle" | "upper" }[];
  hasVehicle: boolean;
  hasShip: boolean;
  // Opens the pit arena (a page of the game board)
  openPit: () => void;
  // The model of the party's first vehicle and the size and role of its first ship, for the flying games,
  // and the kind of world the settlement is on (the speeder race's ground and what grows on it)
  vehicleModel?: string;
  shipSpec?: { size: string; role: string };
  // The party's ships as sheets (for the dogfight: the pilot chooses which to fly), where each is berthed, whether it cannot fly (and why),
  // and the starship equipment they were made from
  partyShips?: DogfightShip[];
  shipRows?: any[];
  biome?: string;
  state: DowntimeState;
  // A check of the character: the roll and what is added to it
  check: (c: { ability: string; using: string }) => { roll: number; bonus: number; total: number; note: string };
  // The player picks who rolls and with which skill
  ask: (plan: CheckPlan) => Promise<CheckResult | null>;
  // Keeps the result: changes to the character, the downtime record, days that pass, a line for the log
  commit: (what: { character?: Record<string, any>; downtime: Partial<DowntimeState>; days: number; log?: string[]; renown?: number }) => void;
  // Unlocks nothing here; blackmail and lore are spent from the panel through these
  spendBlackmail: (id: string) => void;
  spendLore: (id: string) => void;
}

interface DogfightShip { id: string; name: string; sheet: ShipSheet; owner?: string; where?: string; busy?: string }
const CLASS_NAMES = { lower: "lower class", middle: "middle class", upper: "upper class" } as const;
const roll = (sides: number) => Math.floor(Math.random() * sides) + 1;
const rollExpr = (expr: string) => {
  const m = expr.match(/^(\d+)d(\d+)$/);
  return m ? Array.from({ length: Number(m[1]) }, () => roll(Number(m[2]))).reduce((a, b) => a + b, 0) : Number(expr) || 0;
};
const money = (n: number) => `${n.toLocaleString()} cr`;
const dtId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// The downtime menu's sub-categories (house rule: the book's activities, grouped; the flying games are new)
const DOWNTIME_GROUPS: [string, string[]][] = [
  ["Side quests", ["bounty-hunting", "espionage", "mercenary-contracting", "crime"]],
  ["Fighting games", ["pit-arena"]],
  ["Racing games", ["racing", "speeder-race"]],
  ["Flying games", ["taxi-run", "delivery-run", "dogfight"]],
  ["Everyday downtime", ["carousing", "buying-enhanced-items", "selling-enhanced-items", "crafting", "gambling", "research", "training", "work"]],
];
// The pit arena (house rules): a gladiatorial run of bouts on the combat engine; the book's Pit Fighting roll is not used
const ARENA = [{ id: "pit-arena", name: "Pit arena", intro: "Fight creatures of the rules in the pit, bout after bout: each win makes the next opponent harder and pays more, with an enhanced item of the bout's level. Quit after any bout." }];
// The flying games (house rules, shared/logic "Flying"): flown on the 3D map for a day. A run takes rings,
// a race is laps against rivals, a dogfight is against foes that fire back; each needs one of the party's
// vehicles or ships.
const FLYING: { id: string; name: string; kind: "run" | "race" | "dogfight"; mode: FlightMode; needs: "vehicle" | "ship"; intro: string }[] = [
  { id: "taxi-run", name: "Taxi run", kind: "run", mode: "speeder", needs: "vehicle", intro: "Fly your landspeeder through the rings of a course over the settlement's ground, for a fare." },
  { id: "speeder-race", name: "Speeder race", kind: "race", mode: "speeder", needs: "vehicle", intro: "Race your speeder over three laps of a long course against four rivals: gates to pass in order, jumps, shortcuts down a trail with a ravine to clear, mines and oil. Boost draws on a meter that refills; the hull bar is what you can still take. Paid by the place you finish." },
  { id: "delivery-run", name: "Delivery run", kind: "run", mode: "ship", needs: "ship", intro: "Fly your ship through the rings of a course in the space of its planet, against the clock." },
  { id: "dogfight", name: "Dogfight", kind: "dogfight", mode: "ship", needs: "ship", intro: "Fly your ship in the space of its planet against fighters, a cruiser, a carrier, a battleship, a dreadnought or a battle station. Guns, missiles and bombs (a few for a small ship, more for a large one); the largest ships are shielded by generators, and a station is destroyed from inside." },
];

function DowntimePanel(props: DowntimeProps) {
  const { character, state } = props;
  const [open, setOpen] = useState<string | null>(null);
  const credits = Number(character?.credits) || 0;
  const here = props.settlement;
  const specs = DOWNTIME.activities.map((a) => ({ a, spec: activitySpec(a) }));
  const city = !!here && /city|station|town/i.test(here.type);

  if (props.blocked) {
    return <p className="text-sm text-gray-300" data-testid="downtime-blocked">Downtime: {props.blocked}</p>;
  }
  if (!here) {
    return <p className="text-sm text-gray-300" data-testid="downtime-blocked">Downtime needs a settlement: a workweek of it is spent in a town, a city or a station.</p>;
  }
  const mine = specs.find((s) => s.a.id === open);
  const flying = FLYING.find((f) => f.id === open);
  const allied = state.contacts.filter((c) => c.kind === "allied");
  const hostile = state.contacts.filter((c) => c.kind === "hostile");
  return (
    <div className="space-y-3 text-sm" data-testid="downtime">
      <div className="bg-gray-700 rounded p-2 space-y-1" data-testid="downtime-state">
        <div>In {here.name} ({here.type}). {money(credits)}. Day {props.day}.{(character?.exhaustionLevel ?? 0) > 0 ? ` Exhaustion ${character.exhaustionLevel}.` : ""}</div>
        <div className="text-xs text-gray-300">
          Contacts: {allied.length} allied, {hostile.length} hostile · Blackmail: {state.blackmail.length} · Lore: {state.lore.length} · Rivals: {state.rivals.length} · Blueprints: {state.blueprints.length}
          {state.titles.length ? ` · ${state.titles.join(", ")}` : ""}
        </div>
        {state.blackmail.length + state.lore.length + allied.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {state.blackmail.map((b) => (
              <Button key={b.id} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => props.spendBlackmail(b.id)} title="Spend it: the nearest locked way opens without a check">
                Blackmail on {b.name}
              </Button>
            ))}
            {state.lore.map((l) => (
              <Button key={l.id} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => props.spendLore(l.id)} title="Spend it: what is hidden in the room you are in is found">
                Lore: {l.topic}
              </Button>
            ))}
          </div>
        )}
        {state.rivals.length > 0 && <div className="text-xs text-red-300">Rivals: {state.rivals.map((r) => `${r.name} (${r.whereName})`).join("; ")}</div>}
        {allied.length + hostile.length > 0 && (
          <div className="text-xs text-gray-300">
            {state.contacts.map((c) => `${c.name} (${c.kind}, ${CLASS_NAMES[c.cls]}, ${c.whereName})`).join("; ")}
          </div>
        )}
      </div>
      {!mine && !flying && (
        <div className="space-y-3" data-testid="downtime-menu">
          {DOWNTIME_GROUPS.map(([group, ids]) => {
            const items = [
              ...specs.filter(({ a }) => ids.includes(a.id)).map(({ a }) => ({ key: a.id, name: a.name, intro: a.intro, disabled: /enhanced items/i.test(a.name) && !city, reason: "", pick: () => setOpen(a.id), testId: `downtime-${a.id}` })),
              ...ARENA.filter((x) => ids.includes(x.id)).map((x) => ({ key: x.id, name: x.name, intro: x.intro, disabled: false, reason: "", pick: props.openPit, testId: `downtime-${x.id}` })),
              ...FLYING.filter((f) => ids.includes(f.id)).map((f) => ({ key: f.id, name: f.name, intro: f.intro, disabled: f.needs === "vehicle" ? !props.hasVehicle : !props.hasShip, reason: f.needs === "vehicle" ? (props.hasVehicle ? "" : " (needs a vehicle of your own)") : (props.hasShip ? "" : " (needs a ship of your own)"), pick: () => setOpen(f.id), testId: `downtime-${f.id}` })),
            ];
            if (!items.length) return null;
            return (
              <div key={group} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-300/80" data-testid={`downtime-group-${group.toLowerCase().replace(/\s+/g, "-")}`}>{group}</p>
                <div className="grid grid-cols-1 gap-1">
                  {items.map((item) => (
                    <Button key={item.key} size="sm" variant="outline" className="h-auto justify-start whitespace-normal text-left" disabled={item.disabled} onClick={item.pick} data-testid={item.testId}>
                      {item.name}{item.reason}
                      <span className="ml-1 text-xs text-gray-400">{item.intro.slice(0, 90)}{item.intro.length > 90 ? "…" : ""}</span>
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {flying && (
        <div className="space-y-2" data-testid={`downtime-${flying.id}-panel`}>
          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setOpen(null)}>← Activities</Button>
          <h3 className="text-base font-semibold text-yellow-300">{flying.name}</h3>
          <p className="text-xs text-gray-300">{flying.intro}</p>
          <FlightActivity {...props} flying={flying} />
        </div>
      )}
      {mine && (
        <div className="space-y-2">
          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setOpen(null)}>← Activities</Button>
          <h3 className="text-base font-semibold text-yellow-300">{mine.a.name}</h3>
          <p className="text-xs text-gray-300">{mine.a.intro}</p>
          <details className="text-xs text-gray-300">
            <summary className="cursor-pointer">The book's text</summary>
            <p className="mt-1">{mine.a.resourcesFull || mine.a.resources}</p>
            <p className="mt-1">{mine.a.resolution}</p>
          </details>
          {mine.a.id === "training" ? (
            <TrainingActivity {...props} />
          ) : mine.a.id === "buying-enhanced-items" ? (
            <EnhancedTrade {...props} mode="buy" />
          ) : mine.a.id === "selling-enhanced-items" ? (
            <EnhancedTrade {...props} mode="sell" />
          ) : mine.a.id === "crafting" ? (
            <CraftingActivity {...props} />
          ) : (
            <WeekActivity key={mine.a.id} {...props} activity={mine.a} spec={mine.spec} />
          )}
        </div>
      )}
      {state.log.length > 0 && (
        <div className="text-xs text-gray-400" data-testid="downtime-log">
          <p className="font-semibold text-gray-300">Recent downtime</p>
          {state.log.slice(-6).reverse().map((l, i) => (
            <p key={i}>Day {l.day}: {l.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// Contacts, blackmail and the like are made of the people of the place where they were made
function personFor(people: DowntimeProps["people"], cls: "lower" | "middle" | "upper", taken: string[]): string {
  const pool = people.filter((p) => p.cls === cls && !taken.includes(p.name));
  const any = people.filter((p) => !taken.includes(p.name));
  const pick = (pool.length ? pool : any)[Math.floor(Math.random() * (pool.length ? pool.length : any.length))];
  return pick?.name ?? `a ${CLASS_NAMES[cls]} local`;
}

// What a complication does that the game can apply (shared/logic complicationEffect): what is lost,
// a rival made, a spell in jail; the rest is kept in the log for the player to play out
function applyComplication(props: DowntimeProps, activity: DowntimeActivityData, cls: "lower" | "middle" | "upper" | undefined, shady: boolean, tries: number) {
  const chance = complicationChance(activity, tries, shady);
  if (roll(100) > chance) return null;
  const table = complicationTable(activity, cls);
  if (!table) return null;
  const row = table.rows.find((r) => r.roll === roll(table.die)) ?? table.rows[0];
  return { text: row.text, effect: complicationEffect(row.text, rollExpr), chance };
}

// A flying minigame of downtime, on its own page: a day's work, paid by what it takes
function FlightActivity(props: DowntimeProps & { flying: (typeof FLYING)[number] }) {
  const { character, commit, flying } = props;
  const [game, setGame] = useState<Minigame | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>("skirmish");
  // The ship the pilot flies in a dogfight: the one chosen, else the first that can fly
  const [shipId, setShipId] = useState<string | null>(null);
  const credits = Number(character?.credits) || 0;
  const pay = (result: MinigameResult) => {
    const won = result.kind === "run" ? flightPayout(result.course, result.collected, result.timeLeft) : result.kind === "race" ? raceResult(result.race) : dogfightPayout(result.state);
    commit({ character: { credits: credits + won.credits }, downtime: {}, days: 1, log: [`${flying.name}: ${won.note}.`] });
    setGame(null);
  };
  if (!game) {
    const fleet = props.partyShips ?? [];
    const flyable = fleet.filter((x) => !x.busy);
    const chosen = flyable.find((x) => x.id === shipId) ?? flyable[0];
    const sheet = chosen?.sheet;
    const cls = sheet ? classOf(sheet.size) : null;
    const loading = flying.kind === "dogfight" && !fleet.length;
    return (
      <div className="space-y-2">
        {flying.kind === "dogfight" && (
          <div className="space-y-1.5" data-testid="dogfight-setup">
            {fleet.length > 1 && (
              <div className="space-y-1" data-testid="dogfight-fleet">
                <p className="text-xs font-semibold text-sky-100">Which ship do you fly?</p>
                {fleet.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    disabled={!!x.busy}
                    data-testid={`dogfight-pick-${x.id}`}
                    aria-pressed={chosen?.id === x.id}
                    onClick={() => setShipId(x.id)}
                    className={`block w-full rounded border px-2 py-1 text-left text-xs disabled:opacity-50 ${chosen?.id === x.id ? "border-yellow-400 bg-yellow-400/10 text-yellow-100" : "border-gray-600 text-gray-200"}`}
                  >
                    <span className="font-semibold">{x.name}</span> <span className="text-gray-400">({x.sheet.size} {x.sheet.role}, tier {x.sheet.tier})</span>
                    <span className="block text-gray-400">
                      hull {x.sheet.hullMax}, {x.sheet.hasShield ? `shield ${x.sheet.shieldMax}` : "no shield (one is lent)"}{x.sheet.mods?.length ? ` · ${x.sheet.mods.length} upgrade${x.sheet.mods.length > 1 ? "s" : ""}` : ""}{x.where ? ` · at ${x.where}` : ""}{x.busy ? ` · cannot fly: ${x.busy}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {sheet && (
              <p className="text-xs text-sky-200" data-testid="dogfight-ship">
                You fly {sheet.name}: a {sheet.size} {sheet.role}, hull {sheet.hullMax}, {sheet.hasShield ? `shield ${sheet.shieldMax}` : "no shield fitted (a deflector is lent)"}, {sheet.weapons.length ? sheet.weapons.map((w) => w.name + (w.ammo ? " x" + w.ammo : "")).join(", ") : "no weapons fitted (a cannon is lent)"}.{sheet.mods?.length ? ` Upgrades fitted: ${sheet.mods.join(", ")}.` : ""}
              </p>
            )}
            {fleet.length > 0 && !chosen && <p className="text-xs text-amber-300" data-testid="dogfight-nofly">None of your ships can fly just now.</p>}
            <div className="grid grid-cols-1 gap-1">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  data-testid={`dogfight-scenario-${sc.id}`}
                  onClick={() => setScenario(sc.id)}
                  className={`rounded border px-2 py-1 text-left text-xs ${scenario === sc.id ? "border-yellow-400 bg-yellow-400/10 text-yellow-100" : "border-gray-600 text-gray-200"}`}
                >
                  <span className="font-semibold">{sc.name}</span> <span className="text-gray-400">({sc.tag})</span>
                  <span className="block text-gray-300">{sc.intro}</span>
                  {cls && scenario === sc.id && <span className="block text-sky-300">{scenarioAdvice(sc.id, cls)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <Button size="sm" variant="outline" disabled={loading || (flying.kind === "dogfight" && !chosen)} onClick={() => {
          const seed = Math.floor(Math.random() * 1e9) + 1;
          const vehicle = props.vehicleModel ?? "Landspeeder";
          if (flying.kind === "race") setGame({ kind: "race", title: flying.name, seed, vehicle, biome: props.biome });
          else if (flying.kind === "dogfight" && chosen) setGame({ kind: "dogfight", title: flying.name, seed, scenario, rows: props.shipRows ?? [], ship: { sheet: chosen.sheet, owner: chosen.owner } });
          else setGame({ kind: "run", title: flying.name, seed, mode: flying.mode, vehicle, ship: props.shipSpec });
        }} data-testid={`flight-start-${flying.id}`}>
          {loading ? "The ship data is loading..." : `Start the ${flying.kind === "dogfight" ? SCENARIOS.find((x) => x.id === scenario)!.name.toLowerCase() : flying.name.toLowerCase()} (a day)`}
        </Button>
      </div>
    );
  }
  return <MinigamePage game={game} onExit={() => setGame(null)} onDone={pay} />;
}

// Activities worked out in one workweek by checks and a d100: bounty hunting, carousing, crime,
// espionage, gambling, mercenary work, pit fighting, racing, research, work
function WeekActivity(props: DowntimeProps & { activity: DowntimeActivityData; spec: ActivitySpec }) {
  const { activity, spec, character, state, settlement } = props;
  const [cls, setCls] = useState<"lower" | "middle" | "upper">("lower");
  const [extra, setExtra] = useState(0);
  const [stake, setStake] = useState(spec.stake?.min ?? 0);
  const [rent, setRent] = useState(!props.hasVehicle);
  const [disguised, setDisguised] = useState(false);
  const [phase, setPhase] = useState<"setup" | "checks" | "done">("setup");
  const [attempts, setAttempts] = useState<{ label: string; total: number; roll: number; bonus: number; modifier: number; met: boolean; note: string }[]>([]);
  const [report, setReport] = useState<string[]>([]);
  const credits = Number(character?.credits) || 0;
  const tier = spec.tiers?.find((t) => t.cls === cls);
  const cost = tier ? tier.cost : spec.stake ? stake : (spec.entry ?? spec.cost) + extra + (spec.entry && rent ? spec.rent ?? 0 : 0);
  const checks = spec.checks.filter((c) => {
    if (activity.id === "carousing") return disguised ? c.using === "persuasion" ? false : true : c.using === "persuasion";
    return true;
  });
  const options = activity.id === "carousing" ? (disguised ? [{ ability: "charisma", using: "deception" }] : [{ ability: "charisma", using: "persuasion" }]) : checks;
  const maxChecks = spec.multi ? Math.min(3, options.length) : 1;
  const best = attempts.reduce((a, b) => (b.modifier > a ? b.modifier : a), 0);
  const anyMet = attempts.some((a) => a.met);
  const ready = attempts.length >= maxChecks || (attempts.length > 0 && anyMet) || (!spec.multi && attempts.length > 0);

  const begin = () => {
    if (credits < cost) return void toast.error(`Not enough credits: ${money(cost)} needed.`);
    setAttempts([]);
    setReport([]);
    setPhase("checks");
  };
  const tryCheck = (c: { ability: string; using: string }) => {
    const r = props.check(c);
    const total = r.total + (spec.spendBonus ? Math.max(0, Math.min(spec.spendBonus.max, Math.floor((extra) / spec.spendBonus.per))) : 0);
    const shift = attempts.length;
    const m = spec.multi ? checkModifier(total, shift) : checkModifier(total, 0);
    setAttempts([...attempts, { label: `${c.ability[0].toUpperCase()}${c.ability.slice(1)} (${c.using})`, total, roll: r.roll, bonus: r.bonus, modifier: m.bonus, met: m.met, note: r.note }]);
  };
  const resolve = () => {
    const d100 = roll(100);
    const lines: string[] = [];
    let paid = cost;
    let outcome: DowntimeOutcome;
    let text: string;
    let debt = 0;
    const failed = spec.multi && !anyMet;
    const failure = failed ? failureOf(activity) : null;
    if (failure) {
      outcome = failure.outcome;
      text = `No check met a DC: ${failure.text}`;
      if (failure.debt) debt = stake;
    } else {
      const total = d100 + (spec.multi ? best : best);
      const row = resultRow(activity, total);
      outcome = outcomeOf(row.text);
      text = `d100 ${d100} + ${best} = ${total}: ${row.text}`;
    }
    lines.push(text);
    let gained = outcome.credits;
    if (spec.stake) {
      const back = Math.round(stake * (outcome.stakeBack ?? 0));
      gained = back;
      paid = stake;
    }
    const downtime: Partial<DowntimeState> = {};
    const where = settlement!;
    const taken = state.contacts.map((c) => c.name);
    const contacts = [...state.contacts];
    for (let i = 0; i < outcome.allied; i++) contacts.push({ id: dtId("c"), kind: "allied", cls, where: where.id, whereName: where.name, name: personFor(props.people, cls, [...taken, ...contacts.map((c) => c.name)]) });
    for (let i = 0; i < outcome.hostile; i++) contacts.push({ id: dtId("c"), kind: "hostile", cls, where: where.id, whereName: where.name, name: personFor(props.people, cls, [...taken, ...contacts.map((c) => c.name)]) });
    // At most 1 + the Charisma modifier unspecified allied contacts are kept
    const limit = Math.max(1, 1 + Math.floor(((character.abilityScores?.charisma ?? 10) - 10) / 2));
    const alliedKept = contacts.filter((c) => c.kind === "allied");
    if (alliedKept.length > limit) {
      const drop = new Set(alliedKept.slice(0, alliedKept.length - limit).map((c) => c.id));
      downtime.contacts = contacts.filter((c) => !drop.has(c.id));
      lines.push(`Only ${limit} allied contacts can be kept: the oldest is forgotten.`);
    } else if (outcome.allied || outcome.hostile) downtime.contacts = contacts;
    if (outcome.allied) lines.push(`${outcome.allied} allied contact${outcome.allied > 1 ? "s" : ""} made in ${where.name}.`);
    if (outcome.hostile) lines.push(`${outcome.hostile} hostile contact${outcome.hostile > 1 ? "s" : ""} made in ${where.name}.`);
    if (outcome.blackmail) {
      downtime.blackmail = [...state.blackmail, ...Array.from({ length: outcome.blackmail }, () => ({ id: dtId("b"), cls, where: where.id, whereName: where.name, name: personFor(props.people, cls, state.blackmail.map((b) => b.name)) }))];
      lines.push(`Blackmail found on ${downtime.blackmail.slice(-outcome.blackmail).map((b) => b.name).join(", ")}.`);
    }
    if (outcome.lore) {
      const limitLore = Math.max(1, 1 + Math.floor(((character.abilityScores?.intelligence ?? 10) - 10) / 2));
      const added = Array.from({ length: outcome.lore }, (_, i) => ({ id: dtId("l"), topic: `${where.name}: lore ${state.lore.length + i + 1}`, where: where.id, whereName: where.name }));
      downtime.lore = [...state.lore, ...added].slice(-Math.max(limitLore, outcome.lore));
      lines.push(`${outcome.lore} piece${outcome.lore > 1 ? "s" : ""} of lore, to be spent where it helps.`);
    }
    let days = WORKWEEK;
    let renown = 0;
    const charChanges: Record<string, any> = {};
    let money2 = credits - paid + gained - (failure?.outcome.repairs ?? 0);
    if (failure?.outcome.repairs) lines.push(`${money(failure.outcome.repairs)} in repairs.`);
    if (debt) {
      if (money2 >= debt) {
        money2 -= debt;
        lines.push(`The debt of ${money(debt)} is paid at once.`);
      } else {
        charChanges.playState = { ...(character.playState ?? {}), debt: (character.playState?.debt ?? 0) + debt };
        lines.push(`A debt of ${money(debt)} is owed.`);
      }
    }
    if (outcome.jailed) {
      days += WORKWEEK;
      renown -= 1;
      lines.push("A week in jail follows, and your name is worse for it here.");
    }
    if (outcome.exhaustion) {
      charChanges.exhaustionLevel = Math.min(6, (character.exhaustionLevel ?? 0) + 1);
      lines.push("A level of exhaustion.");
    }
    if (outcome.title) {
      const title = activity.id === "pit-fighting" ? `Pit champion of ${where.name}` : activity.id === "racing" ? `Racer of ${where.name}` : activity.id === "bounty-hunting" ? "Bounty hunter of note" : `Known in ${where.name}`;
      if (!state.titles.includes(title)) downtime.titles = [...state.titles, title];
      lines.push(`A title: ${title}.`);
    }
    if (outcome.favor) lines.push("An employer or a patron owes you a favor (an allied contact is made).");
    if (outcome.favor && !outcome.allied) {
      const withFavor = downtime.contacts ?? state.contacts;
      downtime.contacts = [...withFavor, { id: dtId("c"), kind: "allied", cls, where: where.id, whereName: where.name, name: personFor(props.people, cls, withFavor.map((c) => c.name)) }];
    }
    if (outcome.loreItem) lines.push("The relative location of an item worth at least 5,000 cr: ask the GM tab where.");
    // A complication, by the activity's own chance
    const shady = false;
    const complication = applyComplication(props, activity, activity.complications.length > 1 ? cls : undefined, shady, attempts.length || 1);
    let rivals = state.rivals;
    if (complication) {
      lines.push(`Complication (${complication.chance}% chance): ${complication.text}`);
      if (complication.effect.credits) {
        money2 = Math.max(0, money2 - complication.effect.credits);
        lines.push(`It costs ${money(complication.effect.credits)}.`);
      }
      if (complication.effect.jailed && !outcome.jailed) {
        days += WORKWEEK;
        renown -= 1;
        lines.push("A week in jail follows.");
      }
      if (complication.effect.rival) {
        const name = personFor(props.people, cls, rivals.map((r) => r.name));
        rivals = [...rivals, { id: dtId("r"), name, motive: complication.text, where: where.id, whereName: where.name, since: props.day }];
        lines.push(`${name} is now a rival: ${complication.text}`);
      }
      if (complication.effect.scar) charChanges.notes = `${character.notes ? `${character.notes}\n` : ""}Day ${props.day}: a scar (${activity.name}).`;
    }
    if (rivals !== state.rivals) downtime.rivals = rivals;
    charChanges.credits = Math.max(0, money2);
    setReport(lines);
    setPhase("done");
    props.commit({ character: charChanges, downtime, days, log: [`${activity.name}: ${lines.join(" ")}`], renown });
  };

  const tierNote = spec.tiers ? `${CLASS_NAMES[cls]}: ${money(tier!.cost)}` : "";
  return (
    <div className="space-y-2" data-testid={`downtime-activity-${activity.id}`}>
      {phase === "setup" && (
        <div className="space-y-2">
          {spec.tiers && (
            <label className="flex items-center gap-2">
              Among the
              <select className="h-7 rounded bg-gray-700 px-1" value={cls} onChange={(e) => setCls(e.target.value as any)} data-testid="downtime-class">
                {spec.tiers.map((t) => (
                  <option key={t.cls} value={t.cls}>{CLASS_NAMES[t.cls]} ({money(t.cost)})</option>
                ))}
              </select>
            </label>
          )}
          {activity.id === "carousing" && cls === "upper" && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={disguised} onChange={(e) => setDisguised(e.target.checked)} /> Pass as a noble from afar (Deception, needs a disguise kit)
            </label>
          )}
          {spec.spendBonus && (
            <label className="flex items-center gap-2 text-xs">
              Spend more (+1 to the check for each {money(spec.spendBonus.per)})
              <input type="number" min={0} step={spec.spendBonus.per} className="h-7 w-24 rounded bg-gray-700 px-1" value={extra} onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} data-testid="downtime-extra" />
            </label>
          )}
          {spec.stake && (
            <label className="flex items-center gap-2 text-xs">
              Stake ({money(spec.stake.min)} to {money(spec.stake.max)})
              <input type="number" min={spec.stake.min} max={spec.stake.max} step={100} className="h-7 w-24 rounded bg-gray-700 px-1" value={stake} onChange={(e) => setStake(Math.max(spec.stake!.min, Math.min(spec.stake!.max, Number(e.target.value) || 0)))} data-testid="downtime-stake" />
            </label>
          )}
          {spec.entry && !props.hasVehicle && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={rent} onChange={(e) => setRent(e.target.checked)} /> Rent a vehicle ({money(spec.rent ?? 0)})
            </label>
          )}
          <p className="text-xs text-gray-300">{tierNote || `Costs ${money(cost)}`} · a workweek ({WORKWEEK} days). You have {money(credits)}.</p>
          <Button size="sm" onClick={begin} disabled={credits < cost} data-testid="downtime-begin">
            Begin the workweek ({money(cost)})
          </Button>
        </div>
      )}
      {phase === "checks" && (
        <div className="space-y-2" data-testid="downtime-checks">
          <p className="text-xs text-gray-300">
            {spec.multi ? `Make up to ${maxChecks} checks; each after the first has every DC raised by 5, and the best counts.` : "Make the check."}
          </p>
          <div className="flex flex-wrap gap-1">
            {options.map((c) => {
              const label = `${c.ability[0].toUpperCase()}${c.ability.slice(1)} (${c.using})`;
              const done = attempts.some((a) => a.label === label);
              return (
                <Button key={label} size="sm" variant="outline" disabled={done || attempts.length >= maxChecks} onClick={() => tryCheck(c)} data-testid={`downtime-check-${c.using}`}>
                  {label}
                </Button>
              );
            })}
          </div>
          {attempts.map((a, i) => (
            <p key={i} className="text-xs" data-testid="downtime-attempt">
              {a.label}: {a.roll} {a.bonus >= 0 ? "+" : "-"} {Math.abs(a.bonus)}{a.total !== a.roll + a.bonus ? ` + ${a.total - a.roll - a.bonus}` : ""} = {a.total}
              {a.met ? `, roll modifier +${a.modifier}` : ", no DC met"}
              {a.note ? ` (${a.note})` : ""}
            </p>
          ))}
          <Button size="sm" disabled={!ready} onClick={resolve} data-testid="downtime-resolve">
            {attempts.length && !anyMet && spec.multi && attempts.length >= maxChecks ? "See what comes of it" : `Roll the d100 (+${best})`}
          </Button>
          {attempts.length > 0 && !ready && <p className="text-xs text-amber-200">No DC met yet: make another check.</p>}
        </div>
      )}
      {phase === "done" && (
        <div className="space-y-1" data-testid="downtime-result">
          {report.map((l, i) => (
            <p key={i} className="text-sm">{l}</p>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setPhase("setup"); setAttempts([]); }}>Again</Button>
        </div>
      )}
    </div>
  );
}

// The heist on a ship the party is taking (shared logic "Taking a ship"): the stage it is on, what can
// be done at it, and the countdown once the terminal is sliced. Each choice is a check made in GameBoard.
function HeistPanel({ heist, minute, here, law, credits, disabled, onCheck, onBribe, onAbandon, kitTrained, skilled }: {
  heist: Heist;
  minute: number;
  here: boolean;
  law: number;
  credits: number;
  disabled: boolean;
  onCheck: (how: HeistHow, abilities: string[], trained: boolean, what: string) => void;
  onBribe: (cost: number) => void;
  onAbandon: () => void;
  kitTrained: boolean;
  skilled: (skill: string) => boolean;
}) {
  const dc = heistDC(heist.stage, law);
  const bribe = bribeCost(heist.value, law);
  const left = heist.takeoffAt !== undefined ? heist.takeoffAt - minute : null;
  const off = !here || disabled;
  const choices: { label: string; onClick: () => void; disabled?: boolean }[] =
    heist.stage === "customs"
      ? [
          { label: `Bribe the customs officer (${bribe.toLocaleString()} cr)`, onClick: () => onBribe(bribe), disabled: credits < bribe },
          { label: `Forge a clearance (Deception, DC ${dc})`, onClick: () => onCheck("forge", ["charisma"], skilled("deception"), "Forged clearance") },
        ]
      : heist.stage === "terminal"
        ? [{ label: `Slice the hangar terminal (Intelligence, DC ${dc})`, onClick: () => onCheck("slice", ["intelligence"], kitTrained, "Slicing the terminal") }]
        : heist.stage === "guards"
          ? [
              { label: `Intimidate the guards (Charisma, DC ${dc})`, onClick: () => onCheck("intimidate", ["charisma"], skilled("intimidation"), "Intimidating the guards") },
              { label: `Charm the guards (Charisma, DC ${dc})`, onClick: () => onCheck("charm", ["charisma"], skilled("persuasion"), "Charming the guards") },
              { label: `Fight the guards (Strength or Dexterity, DC ${dc})`, onClick: () => onCheck("fight", ["strength", "dexterity"], false, "Fighting the guards") },
            ]
          : [{ label: `Overcome the ship's lockout (Intelligence, DC ${dc})`, onClick: () => onCheck("unlock", ["intelligence"], kitTrained, "Overcoming the lockout") }];
  const text =
    heist.stage === "customs"
      ? "The customs officer at the lock wants paying, or a clearance that is not on file."
      : heist.stage === "terminal"
        ? "The hangar terminal holds the ship's lock. Slicing it starts the countdown to take-off."
        : heist.stage === "guards"
          ? "Security stands at the ship. Talk them down, frighten them off, or fight."
          : "The ship's own security is locked. Get past it before it lifts off.";
  return (
    <div className="mb-4 space-y-2 rounded border border-red-500/60 p-2 text-xs" data-testid="heist">
      <h3 className="font-semibold text-red-300">Taking the {heist.shipName}</h3>
      <p className="text-gray-300">{text}</p>
      {left !== null && (
        <p className="font-semibold text-yellow-300">{left > 0 ? `Take-off in ${left} min.` : "It is lifting off."}</p>
      )}
      {!here && <p className="text-gray-400">You are not at the ship. Go back to it, or give it up.</p>}
      {heist.fails > 0 && <p className="text-gray-400">Alarms raised: {heist.fails} of 4.</p>}
      <div className="flex flex-wrap gap-1">
        {choices.map((c) => (
          <Button key={c.label} size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={off || c.disabled} onClick={c.onClick}>
            {c.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onAbandon}>Give it up</Button>
      </div>
    </div>
  );
}

// Buying and selling enhanced items (Wretched Hives): a search of days and money for a seller or
// a buyer, a check, a d100 with the item's rarity as a modifier, and an offer to take or leave
function EnhancedTrade(props: DowntimeProps & { mode: "buy" | "sell" }) {
  const { character, state, mode, settlement } = props;
  const activity = downtimeActivity(mode === "buy" ? "buying-enhanced-items" : "selling-enhanced-items")!;
  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["enhanced-names"],
    queryFn: async () => (await fetch("/api/sw5e/enhancedItems?fields=id,name,type,searchableRarity,subtype")).json(),
    staleTime: Infinity,
  });
  const credits = Number(character?.credits) || 0;
  const [days, setDays] = useState(5);
  const [spend, setSpend] = useState(1000);
  const [want, setWant] = useState("");
  const [pick, setPick] = useState("");
  const [offer, setOffer] = useState<null | { item: any; value: number; plain: number; shady: number | null; text: string; line: string[]; favor: boolean; days: number }>(null);
  const [message, setMessage] = useState<string[]>([]);
  const owned: any[] = ((character?.equipment ?? []) as string[]).map((n) => items.find((i) => i.name === n)).filter((i) => i && i.searchableRarity !== "Artifact");
  const byName = (name: string) => items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());

  const search = () => {
    if (mode === "buy") {
      const cost = spend;
      if (credits < cost) return void toast.error(`${money(cost)} needed.`);
      const bonus = Math.min(10, Math.floor((days - 1) / 5) + Math.floor((spend - 1000) / 1000));
      const seek = want ? byName(want) : undefined;
      if (want && !seek) return void toast.error("No such enhanced item.");
      const once = () => props.check({ ability: "intelligence", using: "investigation" });
      let a = once();
      let total = a.total + bonus;
      let note = `Investigation ${a.roll} ${a.bonus >= 0 ? "+" : "-"} ${Math.abs(a.bonus)} + ${bonus} = ${total}`;
      if (seek) {
        const b = once();
        const second = b.total + bonus;
        note += `; second check ${second}`;
        total = Math.min(total, second);
        const dc = DOWNTIME.sellers[seek.searchableRarity]?.dc ?? 99;
        if (total < dc) {
          const sold = foundRarity(total);
          props.commit({ character: { credits: credits - cost }, downtime: {}, days, log: [`Buying enhanced items: no seller of ${seek.name} found (${note}).`] });
          return void setMessage([note, sold ? `No seller of ${seek.name} turns up, only ${sold.toLowerCase()} items.` : "No seller turns up."]);
        }
      }
      const rarity = seek ? seek.searchableRarity : foundRarity(total);
      if (!rarity || !DOWNTIME.sellers[rarity]) {
        props.commit({ character: { credits: credits - cost }, downtime: {}, days, log: [`Buying enhanced items: nobody sells (${note}).`] });
        return void setMessage([note, "No seller turns up: the days and the money are spent."]);
      }
      const d100 = roll(100);
      const modifier = DOWNTIME.sellers[rarity].modifier;
      const row = resultRow(activity, d100 + modifier);
      const factor = priceFactor(row.text);
      const pool = items.filter((i) => i.searchableRarity === rarity && i.type !== "ShipArmor" && i.type !== "ShipShield" && i.type !== "ShipWeapon");
      const item = seek ?? pool[Math.floor(Math.random() * pool.length)];
      if (!item) return void setMessage([note, "Nothing of that rarity is for sale."]);
      const value = enhancedValue(item);
      setMessage([note, `d100 ${d100} ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)} = ${d100 + modifier}: ${row.text}`]);
      props.commit({ character: { credits: credits - cost }, downtime: {}, days, log: [`Buying enhanced items: a ${rarity.toLowerCase()} seller (${note}).`] });
      setOffer({ item, value, plain: Math.round(value * factor.plain), shady: factor.shady === null ? null : Math.round(value * factor.shady), text: row.text, line: [], favor: factor.favor, days });
    } else {
      const item = byName(pick);
      if (!item) return;
      const rarity = item.searchableRarity;
      const maxDays = Number((DOWNTIME.buyers[rarity]?.days ?? "1d4").split("d")[1]) * Number((DOWNTIME.buyers[rarity]?.days ?? "1d4").split("d")[0]);
      const r = props.check({ ability: "intelligence", using: "investigation" });
      const found = r.total >= 20;
      const spent = found ? rollExpr(DOWNTIME.buyers[rarity].days) : maxDays;
      const cost = spent * 100;
      if (credits < cost) return void toast.error(`${money(cost)} needed for the search.`);
      const note = `Investigation ${r.roll} ${r.bonus >= 0 ? "+" : "-"} ${Math.abs(r.bonus)} = ${r.total} against DC 20`;
      if (!found) {
        props.commit({ character: { credits: credits - cost }, downtime: {}, days: spent, log: [`Selling ${item.name}: no buyer in ${spent} days (${note}).`] });
        return void setMessage([note, `No buyer after ${spent} days; ${money(cost)} spent.`]);
      }
      const d100 = roll(100);
      const modifier = DOWNTIME.buyers[rarity].modifier;
      const row = resultRow(activity, d100 + modifier);
      const factor = priceFactor(row.text);
      const value = enhancedValue(item);
      setMessage([note, `A buyer is found after ${spent} days (${money(cost)}).`, `d100 ${d100} ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)} = ${d100 + modifier}: ${row.text}`]);
      props.commit({ character: { credits: credits - cost }, downtime: {}, days: spent, log: [`Selling ${item.name}: a buyer after ${spent} days.`] });
      setOffer({ item, value, plain: Math.round(value * factor.plain), shady: factor.shady === null ? null : Math.round(value * factor.shady), text: row.text, line: [], favor: factor.favor, days: spent });
    }
  };
  const settle = (shady: boolean) => {
    if (!offer) return;
    const amount = shady ? offer.shady! : offer.plain;
    const lines: string[] = [];
    const complication = applyComplication(props, activity, undefined, shady, 1);
    let fake = false;
    let stolen = false;
    let rival = false;
    if (complication) {
      lines.push(`Complication (${complication.chance}%): ${complication.text}`);
      fake = /fake/i.test(complication.text);
      stolen = /stolen/i.test(complication.text);
      rival = complication.effect.rival;
    }
    const equipment = [...((character.equipment ?? []) as string[])];
    let creditsNow = credits;
    if (mode === "buy") {
      if (credits < amount) return void toast.error(`${money(amount)} needed.`);
      creditsNow -= amount;
      if (fake || stolen) lines.push(`${offer.item.name} is ${fake ? "a fake" : "stolen after the purchase"}: it is not yours to keep.`);
      else equipment.push(offer.item.name);
      lines.unshift(`Bought ${offer.item.name} for ${money(amount)}${shady ? " from a shady seller" : ""}.`);
    } else {
      const at = equipment.indexOf(offer.item.name);
      if (at >= 0) equipment.splice(at, 1);
      if (stolen) lines.push("The item is stolen before the sale: no credits.");
      else creditsNow += amount;
      lines.unshift(`Sold ${offer.item.name} for ${money(stolen ? 0 : amount)}${shady ? " to a shady buyer" : ""}.`);
    }
    const downtime: Partial<DowntimeState> = {};
    if (rival || offer.favor) {
      const where = settlement!;
      if (rival) downtime.rivals = [...state.rivals, { id: dtId("r"), name: personFor(props.people, "middle", state.rivals.map((r) => r.name)), motive: complication!.text, where: where.id, whereName: where.name, since: props.day }];
      if (offer.favor) {
        downtime.contacts = [...state.contacts, { id: dtId("c"), kind: "allied", cls: "upper", where: where.id, whereName: where.name, name: personFor(props.people, "upper", state.contacts.map((c) => c.name)) }];
        lines.push("They also want a favor: an allied contact owes you, and you owe them.");
      }
    }
    props.commit({ character: { credits: Math.max(0, creditsNow), equipment }, downtime, days: 0, log: lines });
    setMessage((m) => [...m, ...lines]);
    setOffer(null);
  };

  return (
    <div className="space-y-2" data-testid={`downtime-${mode}`}>
      {!offer && mode === "buy" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            Days
            <input type="number" min={5} step={5} className="h-7 w-16 rounded bg-gray-700 px-1" value={days} onChange={(e) => setDays(Math.max(5, Number(e.target.value) || 5))} />
            Spend
            <input type="number" min={1000} step={1000} className="h-7 w-24 rounded bg-gray-700 px-1" value={spend} onChange={(e) => setSpend(Math.max(1000, Number(e.target.value) || 1000))} />
          </label>
          <label className="flex items-center gap-2 text-xs">
            Looking for (a name, or leave blank)
            <input className="h-7 min-w-0 flex-1 rounded bg-gray-700 px-1" value={want} onChange={(e) => setWant(e.target.value)} list="enhanced-names" />
            <datalist id="enhanced-names">{items.slice(0, 400).map((i) => <option key={i.id} value={i.name} />)}</datalist>
          </label>
          <p className="text-xs text-gray-300">+1 to the check for each five days beyond the first and each 1,000 cr beyond the first 1,000 (up to +10). {money(spend)} · {days} days.</p>
          <Button size="sm" onClick={search} disabled={credits < spend || !items.length} data-testid="downtime-search">Look for a seller</Button>
        </div>
      )}
      {!offer && mode === "sell" && (
        <div className="space-y-2">
          <select className="h-8 w-full rounded bg-gray-700 px-1" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="downtime-sell-pick">
            <option value="">An enhanced item you carry</option>
            {owned.map((i, k) => (
              <option key={`${i.id}-${k}`} value={i.name}>{i.name} ({i.searchableRarity})</option>
            ))}
          </select>
          {owned.length === 0 && <p className="text-xs text-gray-400">You carry no enhanced items to sell.</p>}
          <p className="text-xs text-gray-300">A search costs 100 cr a day, up to the days the rarity allows; a DC 20 Intelligence (Investigation) check finds a buyer.</p>
          <Button size="sm" onClick={search} disabled={!pick} data-testid="downtime-search">Look for a buyer</Button>
        </div>
      )}
      {offer && (
        <div className="space-y-2 rounded bg-gray-700 p-2" data-testid="downtime-offer">
          <p>
            {offer.item.name} <span className="text-xs text-gray-400">({offer.item.searchableRarity}, worth about {money(offer.value)})</span>
          </p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => settle(false)} disabled={mode === "buy" && credits < offer.plain} data-testid="downtime-accept">
              {mode === "buy" ? "Buy" : "Sell"} for {money(offer.plain)}
            </Button>
            {offer.shady !== null && (
              <Button size="sm" variant="secondary" onClick={() => settle(true)} disabled={mode === "buy" && credits < offer.shady} data-testid="downtime-accept-shady">
                Shady {mode === "buy" ? "seller" : "buyer"}: {money(offer.shady)}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setOffer(null)}>Walk away</Button>
          </div>
        </div>
      )}
      {message.map((m, i) => (
        <p key={i} className="text-xs text-gray-200">{m}</p>
      ))}
    </div>
  );
}

// Crafting, and taking an enhanced item apart to learn its blueprint (Wretched Hives). Unenhanced
// gear needs the right tools and raw materials worth half its value, and a workweek's checks;
// enhanced items need their blueprint, and for the higher rarities a rare ingredient.
function CraftingActivity(props: DowntimeProps) {
  const { character, state, equipment, tools, settlement } = props;
  const activity = downtimeActivity("crafting")!;
  const credits = Number(character?.credits) || 0;
  const { data: enhanced = [] } = useQuery<any[]>({
    queryKey: ["enhanced-names"],
    queryFn: async () => (await fetch("/api/sw5e/enhancedItems?fields=id,name,type,searchableRarity,subtype")).json(),
    staleTime: Infinity,
  });
  const [mode, setMode] = useState<"craft" | "blueprint" | "reverse" | "refine">("craft");
  // Gathered materials count at their value toward the raw materials; a shortfall is paid in credits (house rule)
  const stock = materialsOf(character);
  // Only the families the tool works with count (house rule): ore and parts for a blaster, plants for medicine
  const usable = (families: MaterialFamily[]) => credits + materialsWorth(Object.fromEntries(Object.entries(stock).filter(([id]) => MATERIALS[id] && families.includes(MATERIALS[id].family))));
  const pay = (cost: number, families: MaterialFamily[]) => {
    const spent = spendMaterials(stock, cost, families);
    const note = spent.spent.length ? ` Materials used: ${spent.spent.map(([id, n]) => `${n} x ${MATERIALS[id].name}`).join(", ")}${spent.shortfall ? `; ${money(spent.shortfall)} paid in credits` : ""}.` : "";
    return { character: { credits: Math.max(0, credits - spent.shortfall), playState: { ...(character.playState ?? {}), materials: spent.stock } }, note };
  };
  const [pick, setPick] = useState("");
  const [find, setFind] = useState("");
  const [message, setMessage] = useState<string[]>([]);
  const carried: string[] = character?.equipment ?? [];
  const squash2 = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  // The tool a piece of equipment is made with: the Item Specific Tools table's "works on" words
  const toolOf = (item: any): ToolFacts | undefined => {
    const hay = squash2(`${item.name} ${item.equipmentCategory} ${item.weaponClassification ?? ""} ${item.armorClassification ?? ""}`);
    return tools.find((t) =>
      (t.worksOn ?? "")
        .split(/,|\band\b/)
        .map((w) => w.trim().toLowerCase().replace(/s$/, ""))
        .filter((w) => w.length > 3)
        .some((w) => hay.includes(squash2(w)) || (w === "armor" && item.equipmentCategory === "Armor") || (w === "shield" && item.armorClassification === "Shield") || (w === "explosive" && item.equipmentCategory === "Explosive") || (w === "ammunition" && item.equipmentCategory === "Ammunition")),
    );
  };
  const craftable = equipment.filter((e) => e.cost > 0 && !["Spice", "AlcoholicBeverage"].includes(e.equipmentCategory) && toolOf(e)).filter((e) => !find || e.name.toLowerCase().includes(find.toLowerCase()));
  const item = equipment.find((e) => e.name === pick);
  const tool = item ? toolOf(item) : undefined;
  const has = tool ? carried.some((n) => squash2(n) === squash2(tool.name)) : false;

  const craft = async () => {
    if (!item || !tool) return;
    const value = item.cost;
    const raw = Math.ceil(value / 2);
    const daysNeeded = Math.max(1, Math.ceil(value / 250));
    const families = familiesForTool(tool.name);
    if (usable(families) < raw * 2) return void toast.error(`Raw materials worth up to ${money(raw * 2)} may be needed (credits and gathered ${families.join(", ")}).`);
    if (!has) return void toast.error(`You need ${tool.name}.`);
    const r = await props.ask({ what: `Craft ${item.name}: a total of 10, 15, 20... adds to the d100`, dc: 10, abilities: ["intelligence"], skills: (tool.skills ?? []).flatMap((x) => x.skill.map((y) => y.toLowerCase())).filter((y) => SKILLS.some((x) => x.name.toLowerCase() === y)), tool: tool.name });
    if (!r) return;
    const m = checkModifier(r.total, 0);
    const d100 = roll(100);
    const row = resultRow(activity, d100 + m.bonus);
    const idx = activity.results.indexOf(row);
    const factor = [2, 1.5, 1, 0.5, 0.25][idx] ?? 1;
    const materials = Math.ceil(raw * factor);
    const lines = [
      `${tool.name} check ${r.roll} ${r.bonus >= 0 ? "+" : "-"} ${Math.abs(r.bonus)} = ${r.total}${m.met ? `, roll modifier +${m.bonus}` : ", no DC met"}`,
      `d100 ${d100} + ${m.bonus} = ${d100 + m.bonus}: ${row.text}`,
      `${item.name} made in ${daysNeeded} day${daysNeeded > 1 ? "s" : ""}, raw materials ${money(materials)}.`,
    ];
    const paid = pay(materials, families);
    lines[lines.length - 1] += paid.note;
    const comp = applyComplication(props, activity, undefined, false, 1);
    const downtime: Partial<DowntimeState> = {};
    if (comp) {
      lines.push(`Complication (${comp.chance}%): ${comp.text}`);
      if (comp.effect.rival) downtime.rivals = [...state.rivals, { id: dtId("r"), name: personFor(props.people, "middle", state.rivals.map((x) => x.name)), motive: comp.text, where: settlement!.id, whereName: settlement!.name, since: props.day }];
    }
    props.commit({ character: { ...paid.character, equipment: [...carried, item.name] }, downtime, days: daysNeeded, log: lines });
    setMessage(lines);
  };
  const reverse = async () => {
    const found = enhanced.find((i) => i.name === pick);
    if (!found) return;
    const dc = DOWNTIME.reverseDc[found.searchableRarity] ?? 30;
    const r = await props.ask({ what: `Take ${found.name} apart`, dc, abilities: ["intelligence"] });
    if (!r) return;
    const ok = r.total >= dc;
    const equipmentNow = [...carried];
    equipmentNow.splice(equipmentNow.indexOf(found.name), 1);
    const value = enhancedValue(found);
    const lines = [`Taking ${found.name} apart (1 hour): ${r.roll} ${r.bonus >= 0 ? "+" : "-"} ${Math.abs(r.bonus)} = ${r.total} against DC ${dc}.`];
    const downtime: Partial<DowntimeState> = {};
    let creditsNow = credits;
    if (ok) {
      downtime.blueprints = Array.from(new Set([...state.blueprints, found.name]));
      creditsNow += Math.round(value / 4);
      lines.push(`The blueprint is learned, and half the raw materials (${money(Math.round(value / 4))}) are recovered.`);
    } else lines.push("It comes apart for nothing: the item is destroyed and no blueprint is learned.");
    props.commit({ character: { credits: creditsNow, equipment: equipmentNow }, downtime, days: 0, log: lines });
    setMessage(lines);
  };
  const buildEnhanced = async () => {
    const found = enhanced.find((i) => i.name === pick);
    if (!found || !state.blueprints.includes(found.name)) return;
    const rarity = found.searchableRarity as string;
    const needsRare = !["Standard", "Premium"].includes(rarity);
    if (needsRare && !(state.rare[rarity] > 0)) return void toast.error(`A rare ingredient from a creature of challenge ${DOWNTIME.ingredients[rarity]?.cr.min}+ is needed.`);
    const value = enhancedValue(found);
    const raw = Math.ceil(value / 2);
    const families = familiesForEnhanced(found.type, found.subtype);
    if (usable(families) < raw * 2) return void toast.error(`Raw materials worth up to ${money(raw * 2)} may be needed (credits and gathered ${families.join(", ")}).`);
    const days = Math.max(1, Math.ceil(value / 250));
    const r = await props.ask({ what: `Make ${found.name}: a total of 10, 15, 20... adds to the d100`, dc: 10, abilities: ["intelligence"] });
    if (!r) return;
    const m = checkModifier(r.total, 0);
    const d100 = roll(100);
    const modifier = DOWNTIME.ingredients[rarity]?.modifier ?? 0;
    const row = resultRow(activity, d100 + m.bonus + modifier);
    const factor = [2, 1.5, 1, 0.5, 0.25][activity.results.indexOf(row)] ?? 1;
    const materials = Math.ceil(raw * factor);
    const lines = [
      `Check ${r.total}${m.met ? `, roll modifier +${m.bonus}` : ", no DC met"}; d100 ${d100} + ${m.bonus} ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)} = ${d100 + m.bonus + modifier}: ${row.text}`,
      `${found.name} made in ${days} day${days > 1 ? "s" : ""}; raw materials ${money(materials)}.`,
    ];
    const rare = { ...state.rare };
    if (needsRare) rare[rarity] = Math.max(0, (rare[rarity] ?? 0) - (activity.results.indexOf(row) >= 3 ? 0 : 1));
    const paid = pay(materials, families);
    lines[lines.length - 1] += paid.note;
    props.commit({ character: { ...paid.character, equipment: [...carried, found.name] }, downtime: { rare }, days, log: lines });
    setMessage(lines);
  };
  // Refining (house rule): 4 units of a material into one refined unit, with a kit of the family and a check at the tier's DC
  const refine = async () => {
    const raw = MATERIALS[pick];
    if (!raw || raw.refined || (stock[pick] ?? 0) < REFINE_UNITS) return;
    const family = FAMILIES[raw.family];
    const kit = carried.find((n) => family.refiners.test(n));
    if (!kit) return void toast.error(`Refining ${raw.family} needs a kit: ${family.refiners.source.replace(/\|/g, ", ")}.`);
    const dc = harvestDc(raw.tier);
    const r = await props.ask({ what: `Refine ${raw.name}`, dc, abilities: ["intelligence"], skills: Array.from(new Set([family.skill.toLowerCase(), "technology"])), tool: kit });
    if (!r) return;
    const ok = r.total >= dc;
    const next = { ...stock, [pick]: stock[pick] - (ok ? REFINE_UNITS : 1) };
    if (ok) next[`${pick}-r`] = (next[`${pick}-r`] ?? 0) + 1;
    const lines = [`Refining ${raw.name} (${kit}): ${r.roll} ${r.bonus >= 0 ? "+" : "-"} ${Math.abs(r.bonus)} = ${r.total} against DC ${dc}. ${ok ? `${REFINE_UNITS} units become one ${MATERIALS[`${pick}-r`].name.toLowerCase()}.` : "It comes to nothing and one unit is spoiled."}`];
    props.commit({ character: { playState: { ...(character.playState ?? {}), materials: next } }, downtime: {}, days: 0, log: lines });
    setMessage(lines);
  };
  const ownedEnhanced = carried.map((n) => enhanced.find((i) => i.name === n)).filter(Boolean) as any[];
  return (
    <div className="space-y-2" data-testid="downtime-crafting">
      <div className="flex gap-1">
        {(["craft", "blueprint", "reverse", "refine"] as const).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} className="h-7 px-2" onClick={() => { setMode(m); setPick(""); }}>
            {m === "craft" ? "Craft gear" : m === "blueprint" ? "From a blueprint" : m === "reverse" ? "Take apart" : "Refine"}
          </Button>
        ))}
      </div>
      {mode === "craft" && (
        <div className="space-y-2">
          <input className="h-7 w-full rounded bg-gray-700 px-1 text-xs" placeholder="Find an item" value={find} onChange={(e) => setFind(e.target.value)} />
          <select className="h-8 w-full rounded bg-gray-700 px-1" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="downtime-craft-pick">
            <option value="">An item to make</option>
            {craftable.slice(0, 120).map((e) => (
              <option key={e.name} value={e.name}>{e.name} ({money(e.cost)})</option>
            ))}
          </select>
          {item && tool && (
            <p className="text-xs text-gray-300">
              Needs {tool.name}{has ? "" : " (you do not carry it)"}, raw materials worth {money(Math.ceil(item.cost / 2))} (house rule: gathered {familiesForTool(tool.name).map((f) => FAMILIES[f].label.toLowerCase()).join(", ")} count; the rest in credits), {Math.max(1, Math.ceil(item.cost / 250))} day(s).
            </p>
          )}
          <Button size="sm" onClick={craft} disabled={!item || !has || usable(tool ? familiesForTool(tool.name) : ALL_FAMILIES) < Math.ceil((item?.cost ?? 0) / 2) * 2} data-testid="downtime-craft">Craft it</Button>
        </div>
      )}
      {mode === "blueprint" && (
        <div className="space-y-2">
          <select className="h-8 w-full rounded bg-gray-700 px-1" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">A blueprint you know</option>
            {state.blueprints.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <p className="text-xs text-gray-300">Rare ingredients held: {Object.entries(state.rare).filter(([, n]) => n > 0).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}. Standard and premium items waive them (the book suggests it).</p>
          {pick && enhanced.find((i) => i.name === pick) && (
            <p className="text-xs text-gray-300">House rule: gathered {familiesForEnhanced(enhanced.find((i) => i.name === pick).type, enhanced.find((i) => i.name === pick).subtype).map((f) => FAMILIES[f].label.toLowerCase()).join(", ")} count toward the raw materials.</p>
          )}
          <Button size="sm" onClick={buildEnhanced} disabled={!pick}>Make it</Button>
        </div>
      )}
      <p className="text-xs text-gray-300" data-testid="downtime-materials">
        Materials (house rule: they count at their value toward raw materials): {Object.entries(stock).filter(([id, n]) => n > 0 && MATERIALS[id]).map(([id, n]) => `${n} x ${MATERIALS[id].name}`).join(", ") || "none gathered yet"}.
      </p>
      {mode === "refine" && (
        <div className="space-y-2">
          <select className="h-8 w-full rounded bg-gray-700 px-1" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="downtime-refine-pick">
            <option value="">A material to refine ({REFINE_UNITS} units make one)</option>
            {Object.entries(stock).filter(([id, n]) => MATERIALS[id] && !MATERIALS[id].refined && n >= REFINE_UNITS).map(([id, n]) => (
              <option key={id} value={id}>{MATERIALS[id].name} ({n}, DC {harvestDc(MATERIALS[id].tier)})</option>
            ))}
          </select>
          <Button size="sm" onClick={refine} disabled={!pick} data-testid="downtime-refine">Refine it</Button>
        </div>
      )}
      {mode === "reverse" && (
        <div className="space-y-2">
          <select className="h-8 w-full rounded bg-gray-700 px-1" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="downtime-reverse-pick">
            <option value="">An enhanced item you carry</option>
            {ownedEnhanced.map((i, k) => (
              <option key={`${i.id}-${k}`} value={i.name}>{i.name} ({i.searchableRarity}, DC {DOWNTIME.reverseDc[i.searchableRarity]})</option>
            ))}
          </select>
          <Button size="sm" onClick={reverse} disabled={!pick} data-testid="downtime-reverse">Take it apart (1 hour)</Button>
        </div>
      )}
      {message.map((m, i) => (
        <p key={i} className="text-xs text-gray-200">{m}</p>
      ))}
    </div>
  );
}

// Training (Wretched Hives): so many workweeks and so much a workweek for a language, weapon,
// tool, skill, saving throw or feat; each workweek ends in a check and a d100 that advances it
function TrainingActivity(props: DowntimeProps) {
  const { character, state, equipment } = props;
  const activity = downtimeActivity("training")!;
  const credits = Number(character?.credits) || 0;
  const options = trainingOptions();
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState<string[]>([]);
  const option = options.find((o) => o.id === optionId);
  const topics: string[] = !option
    ? []
    : option.kind === "language"
      ? lookupData.languages
      : option.kind === "skill"
        ? SKILLS.map((s) => s.name)
        : option.kind === "save"
          ? ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]
          : option.kind === "tool"
            ? props.tools.map((t) => t.name)
            : option.kind === "weapon"
              ? Array.from(new Set(equipment.filter((e) => e.equipmentCategory === "Weapon").map((e) => String(e.weaponClassification ?? "").replace(/([a-z])([A-Z])/g, "$1 $2")).filter(Boolean)))
              : feats.map((f) => f.name);
  const weekly = (o: { perWeek: number | null }, t: string) => o.perWeek ?? Math.max(1, Math.round((equipment.find((e) => e.name.toLowerCase() === t.toLowerCase())?.cost ?? 100)));
  const start = () => {
    if (!option || !topic) return;
    const per = weekly(option, topic);
    const entry = { id: dtId("t"), option: option.id, label: `${option.label}: ${topic}`, topic, weeks: option.weeks, perWeek: per, done: 0 };
    props.commit({ downtime: { training: [...state.training, entry] }, days: 0, log: [`Training begun: ${entry.label}, ${entry.weeks} workweeks at ${money(per)} a workweek.`] });
    setMessage([`Training begun: ${entry.label}.`]);
  };
  const abilityFor = (t: { option: string; topic: string }) => {
    const kind = t.option.split("-")[0];
    if (kind === "skill") return SKILLS.find((s) => s.name === t.topic)?.ability?.toLowerCase() ?? "intelligence";
    if (kind === "save") return t.topic.toLowerCase();
    if (kind === "weapon") return "strength";
    return "intelligence";
  };
  const week = (t: DowntimeState["training"][number]) => {
    if (credits < t.perWeek) return void toast.error(`${money(t.perWeek)} needed for the workweek.`);
    const ability = abilityFor(t);
    const kind = t.option.split("-")[0];
    const r = props.check({ ability, using: kind === "skill" ? t.topic.toLowerCase() : kind === "tool" ? t.topic.toLowerCase() : "training" });
    const m = checkModifier(r.total, 0);
    const d100 = roll(100);
    const row = resultRow(activity, d100 + m.bonus);
    const out = outcomeOf(row.text);
    const advance = out.advance || 0.5;
    const done = t.done + advance;
    const lines = [`${t.label}: check ${r.total}${m.met ? ` (+${m.bonus})` : ", no DC met"}, d100 ${d100 + m.bonus}: ${row.text}`];
    let creditsNow = credits - t.perWeek;
    const downtime: Partial<DowntimeState> = {};
    const charChanges: Record<string, any> = {};
    let remaining = state.training.map((x) => (x.id === t.id ? { ...x, done } : x));
    if (done >= t.weeks) {
      remaining = remaining.filter((x) => x.id !== t.id);
      const level = t.option.split("-")[1] ?? "proficiency";
      const name = t.topic;
      if (kind === "language") charChanges.languages = Array.from(new Set([...(character.languages ?? []), name]));
      else if (kind === "weapon") charChanges.weaponProficiencies = Array.from(new Set([...(character.weaponProficiencies ?? []), name]));
      else if (kind === "feat") charChanges.feats = [...(character.feats ?? []), name];
      else if (level === "training") downtime.trained = Array.from(new Set([...state.trained, name.toLowerCase()]));
      else if (level === "expertise") downtime.expertise = Array.from(new Set([...state.expertise, name.toLowerCase()]));
      else if (kind === "skill") charChanges.skillProficiencies = Array.from(new Set([...(character.skillProficiencies ?? []), name]));
      else if (kind === "tool") charChanges.toolProficiencies = Array.from(new Set([...(character.toolProficiencies ?? []), name]));
      else if (kind === "save") charChanges.savingThrowProficiencies = Array.from(new Set([...(character.savingThrowProficiencies ?? []), name.toLowerCase()]));
      lines.push(`Training complete: ${t.label} (${level}).`);
    }
    downtime.training = remaining;
    // A complication for each failure at the checks (the book: or every five workweeks)
    if (!m.met || Math.floor(done / 5) > Math.floor(t.done / 5)) {
      const comp = applyComplication(props, activity, undefined, false, 1);
      if (comp) lines.push(`Complication: ${comp.text}`);
    }
    charChanges.credits = creditsNow;
    props.commit({ character: charChanges, downtime, days: WORKWEEK, log: lines });
    setMessage(lines);
  };
  return (
    <div className="space-y-2" data-testid="downtime-training">
      {state.training.length > 0 && (
        <div className="space-y-1">
          {state.training.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded bg-gray-700 p-2">
              <span>{t.label}: {t.done}/{t.weeks} workweeks</span>
              <Button size="sm" disabled={credits < t.perWeek} onClick={() => week(t)} data-testid="downtime-train-week">Train a workweek ({money(t.perWeek)})</Button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <select className="h-8 w-full rounded bg-gray-700 px-1" value={optionId} onChange={(e) => { setOptionId(e.target.value); setTopic(""); }} data-testid="downtime-train-option">
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label} ({o.weeks} workweeks, {o.perWeek ? money(o.perWeek) : "the tool's value"} each)</option>
          ))}
        </select>
        <select className="h-8 w-full rounded bg-gray-700 px-1" value={topic} onChange={(e) => setTopic(e.target.value)} data-testid="downtime-train-topic">
          <option value="">What to train in</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400">Training is half proficiency, proficiency or expertise as the book's three tiers; the half and expert tiers count in downtime checks.</p>
        <Button size="sm" disabled={!topic} onClick={start} data-testid="downtime-train-start">Find a teacher and begin</Button>
      </div>
      {message.map((m, i) => (
        <p key={i} className="text-xs text-gray-200">{m}</p>
      ))}
    </div>
  );
}
