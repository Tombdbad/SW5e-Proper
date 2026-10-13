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
import { useCharacter } from "@/lib/stores/useCharacter";
import { useCampaign } from "@/lib/stores/useCampaign";
import { useCombat, rollDamage } from "@/lib/stores/useCombat";
import { useMap } from "@/lib/stores/useMap";
import GMReportManager from "@/components/Campaign/GMReportManager";
import { toast } from "sonner";
import { findEquipmentByName } from "@/lib/sw5e/equipment";
import { getClassById } from "@/lib/sw5e/classes";
import { castingStats, powerCost, powerEffect } from "@/lib/sw5e/rules";
import { getStarshipSize } from "@/lib/sw5e/starships";
import {
  exitsOf, trailOf, childrenOf, updateArea, advanceQuests, berthOf, hasPort, shipForTrip, passageFare,
  type World, type Area, type Exit, type LootCache, type PartyShip, type Quest, type Ship,
} from "@shared/logic";

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
  const { loadCampaign } = useCampaign();
  const { inCombat, initiateCombat, endCombat } = useCombat();
  const combatants = useCombat((s) => s.combatants);
  const { currentLocation, setCurrentLocation } = useMap();

  // Fetch campaign data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });
  // The page shows the fetched campaign; the store copy is for the GM tools
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
  useEffect(() => {
    const p = combatants.find((c) => c.isPlayer);
    if (!p || !character) return;
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
      loadCampaign(data as any);
      
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
  }, [data, isLoading, loadCampaign, setCurrentLocation, here?.id]);

  // Show combat UI when in combat
  useEffect(() => {
    setShowCombat(inCombat);
  }, [inCombat]);

  // Move to a campaign location and remember it
  const moveTo = (loc: any) => {
    setCurrentLocation({ coordinates: { x: 0, y: 0, z: 0 }, ...loc });
    fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentLocation: loc.name }),
    });
  };

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
    if (childrenOf(world, target.id).length === 0 && ["planet", "settlement", "building"].includes(target.kind)) {
      explore(target.id, changes);
    } else {
      saveCampaign(changes);
    }
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
    if (!abilityCheck("Search", 12 + here.danger, ["wisdom"], skilled("perception"))) return;
    if (hiddenPaths.length + hiddenLoot.length === 0) {
      toast.info("There is nothing hidden here.");
      return;
    }
    const next = updateArea(world, here.id, { loot: here.loot.map((c) => ({ ...c, hidden: undefined })) }).world;
    saveCampaign({ galaxyMap: { ...next, paths: next.paths.map((p) => (hiddenPaths.some((h) => h.id === p.id) ? { ...p, hidden: undefined } : p)) } });
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
    if (cache.locked && !abilityCheck("Lock", cache.locked, ["dexterity", "intelligence"], carries(/security kit|slicer's kit/i))) return;
    const gained = cache.items.flatMap((item) => Array.from({ length: item.quantity }, () => item.name));
    saveCharacter({ equipment: [...(character.equipment ?? []), ...gained], credits: (character.credits ?? 0) + cache.credits });
    const loot = here.loot.map((c) => (c.id === cache.id ? { ...c, items: [], credits: 0, locked: undefined, looted: true } : c));
    saveCampaign({ galaxyMap: updateArea(world, here.id, { loot }).world });
    toast.success(`Taken: ${[cache.credits && `${cache.credits} credits`, ...gained].filter(Boolean).join(", ") || "nothing"}`);
  };

  const level = Number(character?.level) || 1;
  const klass = getClassById(character?.class ?? "");
  const knownPowers: any[] = [...(character?.forcePowers ?? []), ...(character?.techPowers ?? [])];
  const dead = (character?.conditions ?? []).includes("Dead");

  // What the character fights with: the weapons carried (from the equipment data), a species'
  // natural weapon when unarmed, and the powers known with the caster's numbers for each
  const combatKit = () => {
    const owned = (character?.equipment ?? []).map((name: string) => findEquipmentByName(name)).filter((e: any) => e?.category === "Weapon" && e.damage);
    const melee = owned.find((e: any) => /vibroweapon|lightweapon/i.test(e.weaponClassification ?? ""));
    const ranged = owned.find((e: any) => /blaster/i.test(e.weaponClassification ?? ""));
    const natural = (character?.weapons ?? []).find((w: any) => w?.natural);
    const order = { attack: 0, save: 0, heal: 1, other: 2 };
    return {
      meleeDice: melee?.damage.split(" ")[0] ?? natural?.damage,
      meleeWeapon: melee?.name ?? natural?.name,
      rangedDice: ranged?.damage.split(" ")[0],
      rangedWeapon: ranged?.name,
      powerPoints: character?.currentForcePoints ?? 0,
      powers: knownPowers
        .map((power) => {
          const effect = powerEffect(power, level);
          return { name: power.name as string, level: power.level as number, cost: powerCost(power), ...effect, ...castingStats(character.abilityScores, level, power) };
        })
        .sort((a, b) => order[a.kind] - order[b.kind] || a.level - b.level),
    };
  };

  // Fight the hostile creatures in this area, with their own armor, hit points and attacks
  const fight = () => {
    if (!character || !here || character.currentHp <= 0) return;
    const enemies = hostiles.flatMap((o) =>
      Array.from({ length: o.count }, (_, i) => ({
        id: `${o.id}-${i}`,
        name: o.count > 1 ? `${o.name} ${i + 1}` : o.name,
        hp: o.hitPoints!,
        maxHp: o.hitPoints!,
        initiative: 0,
        armorClass: o.armorClass ?? 10,
        attackBonus: o.attack?.bonus ?? 2,
        damageDice: o.attack?.damage ?? "1d4",
        saves: o.saves,
      })),
    );
    fightArea.current = here.id;
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
    initiateCombat(character, enemies, combatKit());
  };

  // How a fight ended. Won: the fallen leave the area and their gear stays behind. Stable: the
  // character comes to hours later with 1 hit point, back where they came from. Dead: dead.
  const outcome = useCombat((state) => state.outcome);
  useEffect(() => {
    if (inCombat || !outcome || !character) return;
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
    toast.info("Long rest: hit points and power points restored, half your Hit Dice regained.");
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

  // GM Report Manager is imported at the top

  // A practice fight for campaigns without a world: a trooper and a junior officer, from their stat blocks
  const startTestCombat = async () => {
    if (!character || character.currentHp <= 0) return;
    const foes = await Promise.all(
      ["trooper", "officer-junior"].map((statBlock) =>
        fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock }) }).then((r) => r.json()),
      ),
    );
    const enemies = foes.map((o: any, i: number) => ({
      id: `enemy-${i}`,
      name: o.name,
      hp: o.hitPoints,
      maxHp: o.hitPoints,
      initiative: 0,
      armorClass: o.armorClass,
      attackBonus: o.attack?.bonus ?? 2,
      damageDice: o.attack?.damage ?? "1d4",
      saves: o.saves,
    }));
    lastSavedHp.current = character.currentHp;
    lastSavedPoints.current = character.currentForcePoints;
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
            <LocalMap />
          )}
        </Canvas>

        {/* UI Overlay */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <Card className="bg-gray-800 bg-opacity-80 text-white px-4 py-2">
            <div className="flex space-x-4">
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
          <div className="absolute top-0 right-0 h-screen w-80 bg-gray-800 bg-opacity-80 text-white p-4 overflow-y-auto">
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
                  <Button size="sm" variant="destructive" onClick={fight} disabled={inCombat || dead || character.currentHp <= 0}>
                    Fight
                  </Button>
                )}

                {here.loot.filter((c) => !c.hidden).map((cache) => (
                  <div key={cache.id} className="text-sm flex flex-wrap items-center gap-2" data-testid="play-loot">
                    <span>
                      {cache.name}
                      {cache.looted && <span className="text-gray-400"> (empty)</span>}
                    </span>
                    {!cache.looted && (
                      <Button size="sm" variant="outline" onClick={() => takeLoot(cache)} disabled={inCombat || dead || hostiles.length > 0}>
                        {cache.locked ? `Open (DC ${cache.locked})` : "Take"}
                      </Button>
                    )}
                  </div>
                ))}

                <div className="flex flex-col gap-1" data-testid="play-exits">
                  {exits.filter((exit) => !exit.hidden).map((exit) => {
                    // Enemies bar every way but the way back
                    const barred = hostiles.length > 0 && exit.to !== cameFrom;
                    return (
                      <Button
                        key={`${exit.via}-${exit.to}`}
                        size="sm"
                        variant="outline"
                        className="h-auto whitespace-normal justify-start text-left"
                        disabled={inCombat || dead || exploring || barred}
                        onClick={() => (exit.locked ? unlock(exit) : travel(exit))}
                      >
                        {exit.locked ? `Unlock (DC ${exit.locked}): ` : ""}{exit.label}{exit.via === "path" ? " to" : ""} {world.areas[exit.to].name}
                        {[exit.travel, tripNote(exit)].filter(Boolean).length > 0 && (
                          <span className="text-gray-400 ml-1">({[exit.travel, tripNote(exit)].filter(Boolean).join(", ")})</span>
                        )}
                      </Button>
                    );
                  })}
                  {hostiles.length > 0 && <p className="text-xs text-red-400">Enemies bar the way onward.</p>}
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
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Location</h3>
              <p>{currentLocation?.name || "Unknown"}</p>
              <p className="text-sm text-gray-400">{currentLocation?.description || ""}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(campaign.locations || []).map((l: any) => (
                  <Button
                    key={l.id}
                    size="sm"
                    variant={currentLocation?.id === l.id ? "default" : "outline"}
                    onClick={() => moveTo(l)}
                  >
                    {l.name}
                  </Button>
                ))}
              </div>
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
            <GMReportManager />
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
