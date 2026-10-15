import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlusCircle, Save } from "lucide-react";
import CharacterSheet from "@/components/CharacterManagement/CharacterSheet";
import Inventory from "@/components/CharacterManagement/Inventory";
import { useCharacter } from "@/lib/stores/useCharacter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCampaign } from "@/lib/stores/useCampaign";
import { getClassById } from "@/lib/sw5e/classes";
import { getSpeciesById } from "@/lib/sw5e/species";
import { feats } from "@/lib/sw5e/feats";
import { maneuvers as maneuverList } from "@/lib/sw5e/maneuvers";
import { fightingStyles } from "@/lib/sw5e/fightingStyles";
import {
  ABILITIES, applyLevelUp, archetypeOptions, calculateExperienceForNextLevel, characterFeatures, chooseArchetype,
  featAbilityOptions, featPrerequisiteUnmet, findArchetype, levelUpPlan, type LevelUpChoices,
  combatChoicesOf, combatChoiceSlots, superiorityDice,
} from "@/lib/sw5e/characterCalculation";

const selectClass = "w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm";

// The combat options a class gives to choose from: fighting styles and maneuvers. How many comes
// from the class's features and table; what they do in a fight is read from their text.
function CombatOptions({ character, onSave, saving }: { character: any; onSave: (changes: Record<string, any>) => void; saving: boolean }) {
  const slots = combatChoiceSlots(character);
  const saved = combatChoicesOf(character);
  const [styles, setStyles] = useState<string[]>(saved.styles);
  const [known, setKnown] = useState<string[]>(saved.maneuvers);
  const [kind, setKind] = useState<string>("All");
  useEffect(() => {
    setStyles(saved.styles);
    setKnown(saved.maneuvers);
  }, [JSON.stringify(saved), character.level]);
  if (slots.styles === 0 && slots.maneuvers === 0) return null;
  const dice = superiorityDice({ ...character, fighterManeuvers: { styles, maneuvers: known } });
  const proficient = (character.skillProficiencies ?? []).map((s: string) => s.toLowerCase());
  // A maneuver may need the one it improves, or a skill; what cannot be checked is left to the player
  const unmet = (m: (typeof maneuverList)[number]) => {
    const need = m.prerequisite ?? "";
    const base = need.match(/^(.+?) maneuver$/i)?.[1];
    if (base && !known.includes(base)) return `needs ${base}`;
    const skill = need.match(/^Proficiency in (\w[\w ]*)$/i)?.[1];
    if (skill && !proficient.includes(skill.toLowerCase())) return `needs proficiency in ${skill}`;
    return null;
  };
  const stylesOver = styles.length > slots.styles;
  const dirty = JSON.stringify([styles, known]) !== JSON.stringify([saved.styles, saved.maneuvers]);
  return (
    <Card className="bg-gray-800 border-gray-700 mb-6" data-testid="combat-options">
      <CardHeader className="pb-2">
        <CardTitle className="text-yellow-400 text-lg">Combat options</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4 text-sm">
        {slots.styles > 0 && (
          <div className="space-y-1">
            <p className="font-semibold">Fighting style ({styles.length} of {slots.styles})</p>
            <select
              aria-label="Fighting style"
              className={selectClass}
              value=""
              disabled={styles.length >= slots.styles}
              onChange={(e) => e.target.value && setStyles([...styles, e.target.value])}
            >
              <option value="">{styles.length >= slots.styles ? "All chosen" : "Choose a fighting style"}</option>
              {fightingStyles.filter((f) => !styles.includes(f.name)).map((f) => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
            <div className="space-y-1">
              {styles.map((name) => (
                <details key={name} className="bg-gray-900 rounded p-2">
                  <summary className="cursor-pointer">
                    {name}{" "}
                    <button className="ml-2 text-xs text-red-300 underline" onClick={(e) => { e.preventDefault(); setStyles(styles.filter((n) => n !== name)); }}>remove</button>
                  </summary>
                  <p className="text-xs text-gray-300 whitespace-pre-line mt-1">{fightingStyles.find((f) => f.name === name)?.description}</p>
                </details>
              ))}
            </div>
          </div>
        )}
        {(slots.maneuvers > 0 || known.length > 0) && (
          <div className="space-y-1">
            <p className="font-semibold">
              Maneuvers ({known.length} of {slots.maneuvers}){dice ? `; ${dice.count} superiority ${dice.count === 1 ? "die" : "dice"}, d${dice.size}` : ""}
            </p>
            <div className="flex gap-1 flex-wrap">
              {["All", "Physical", "Mental", "General"].map((k) => (
                <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} className="h-6 px-2" onClick={() => setKind(k)}>{k}</Button>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1" data-testid="maneuver-list">
              {maneuverList.filter((m) => kind === "All" || m.type === kind).map((m) => {
                const on = known.includes(m.name);
                const blocked = !on && (known.length >= slots.maneuvers || !!unmet(m));
                return (
                  <label key={m.id} className={`block bg-gray-900 rounded p-2 ${blocked ? "opacity-50" : ""}`}>
                    <span className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={blocked}
                        onChange={() => setKnown(on ? known.filter((n) => n !== m.name) : [...known, m.name])}
                        aria-label={m.name}
                      />
                      <span>
                        <span className="font-medium">{m.name}</span>{" "}
                        <span className="text-xs text-gray-400">{m.type}{m.prerequisite ? `; ${m.prerequisite}` : ""}{unmet(m) && !on ? `; ${unmet(m)}` : ""}</span>
                        <span className="block text-xs text-gray-300">{m.description.slice(0, 220)}{m.description.length > 220 ? "…" : ""}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <Button disabled={saving || stylesOver || !dirty || known.length > slots.maneuvers} onClick={() => onSave({ fighterManeuvers: { styles, maneuvers: known } })}>
          Save combat options
        </Button>
      </CardContent>
    </Card>
  );
}


// Gaining a level when the experience is there, or taking an archetype that is due. What a level
// gives comes from the class table; the choices are the archetype (3rd level), an Ability Score
// Improvement or a feat, and new powers.
function Advancement({ character, onSave, saving }: { character: any; onSave: (changes: Record<string, any>) => void; saving: boolean }) {
  const plan = levelUpPlan(character);
  const [choices, setChoices] = useState<LevelUpChoices>({});
  const [useFeat, setUseFeat] = useState(false);
  const set = (changes: LevelUpChoices) => setChoices((current) => ({ ...current, ...changes }));
  // Start the choices over for each new level
  useEffect(() => {
    setChoices({});
    setUseFeat(false);
  }, [character.level, character.subclass]);

  const level = Number(character.level) || 1;
  const klass = getClassById(character.class);
  const due = plan ? plan.archetypes : archetypeOptions(character);
  const archetype = due.find((a) => a.id === choices.archetype);
  const picker = due.length > 0 && (
    <div className="space-y-1">
      <label className="text-sm font-semibold" htmlFor="archetype">Archetype</label>
      <select id="archetype" className={selectClass} value={choices.archetype ?? ""} onChange={(e) => set({ archetype: e.target.value || undefined })}>
        <option value="">Choose an archetype</option>
        {due.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      {archetype && <p className="text-xs text-gray-400">{archetype.description}</p>}
    </div>
  );

  if (!plan) {
    const needed = calculateExperienceForNextLevel(level, Number(character.experience) || 0);
    return (
      <Card className="bg-gray-800 border-gray-700 mb-6" data-testid="advancement">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-gray-300">
            {level >= 20 ? "Level 20: the highest level." : `${character.experience ?? 0} XP. ${needed} more for level ${level + 1}.`}
          </p>
          {picker}
          {due.length > 0 && (
            <Button disabled={!archetype || saving} onClick={() => archetype && onSave(chooseArchetype(character, archetype.id) ?? {})}>
              Take this archetype
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const taken: string[] = (character.feats ?? []).map((f: any) => f?.name ?? f);
  const points = choices.abilities ?? [];
  const result = applyLevelUp(character, { ...choices, ...(useFeat ? { abilities: undefined } : { feat: undefined, featAbility: undefined }) });
  const gained = [...plan.features, ...(archetype?.features ?? []).filter((f) => f.level <= plan.level).map((f) => ({ ...f, source: archetype!.name }))];
  const chosen = choices.powers ?? [];
  const featOptions = choices.feat ? featAbilityOptions(choices.feat) : [];

  return (
    <Card className="bg-gray-800 border-yellow-500 mb-6" data-testid="advancement">
      <CardHeader className="pb-2">
        <CardTitle className="text-yellow-400">Level up to {plan.level}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {gained.length > 0 && (
          <div className="text-sm space-y-1">
            <p className="font-semibold">You gain</p>
            {gained.map((feature) => (
              <details key={`${feature.source}-${feature.name}`}>
                <summary className="cursor-pointer">{feature.name} <span className="text-gray-400">({feature.source})</span></summary>
                <p className="text-xs text-gray-300 whitespace-pre-line mt-1">{feature.description}</p>
              </details>
            ))}
          </div>
        )}

        {picker}

        {plan.abilityScoreImprovement && (
          <div className="space-y-2 text-sm" data-testid="improvement">
            <p className="font-semibold">Ability Score Improvement</p>
            <div className="flex gap-2">
              <Button size="sm" variant={useFeat ? "outline" : "default"} onClick={() => setUseFeat(false)}>Two ability points</Button>
              <Button size="sm" variant={useFeat ? "default" : "outline"} onClick={() => setUseFeat(true)}>A feat</Button>
            </div>
            {!useFeat && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ABILITIES.map((ability) => {
                  const added = points.filter((a) => a === ability).length;
                  const score = character.abilityScores?.[ability] ?? 10;
                  return (
                    <div key={ability} className="flex items-center justify-between bg-gray-900 rounded px-2 py-1">
                      <span className="capitalize">{ability} {score}{added ? ` + ${added}` : ""}</span>
                      <span className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2" aria-label={`Lower ${ability}`} disabled={!added} onClick={() => set({ abilities: points.filter((a, i) => i !== points.indexOf(ability)) })}>-</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2" aria-label={`Raise ${ability}`} disabled={points.length >= 2 || score + added >= 20} onClick={() => set({ abilities: [...points, ability] })}>+</Button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {useFeat && (
              <div className="space-y-1">
                <select aria-label="Feat" className={selectClass} value={choices.feat ?? ""} onChange={(e) => set({ feat: e.target.value || undefined, featAbility: undefined })}>
                  <option value="">Choose a feat</option>
                  {feats.filter((feat) => !taken.includes(feat.name)).map((feat) => {
                    // Prerequisites the app can check close the option; the rest are shown for the player to honour
                    const unmet = featPrerequisiteUnmet(feat, { ...character, level: plan.level });
                    return (
                      <option key={feat.id} value={feat.name} disabled={!!unmet}>
                        {feat.name}{unmet ? ` (${unmet})` : feat.prerequisite ? ` (prerequisite: ${feat.prerequisite})` : ""}
                      </option>
                    );
                  })}
                </select>
                {featOptions.length > 1 && (
                  <select aria-label="Ability the feat raises" className={selectClass} value={choices.featAbility ?? ""} onChange={(e) => set({ featAbility: e.target.value || undefined })}>
                    <option value="">Choose the ability it raises</option>
                    {featOptions.map((ability) => (
                      <option key={ability} value={ability}>{ability}</option>
                    ))}
                  </select>
                )}
                {choices.feat && (
                  <p className="text-xs text-gray-300 whitespace-pre-line max-h-40 overflow-y-auto">{feats.find((feat) => feat.name === choices.feat)?.description}</p>
                )}
              </div>
            )}
          </div>
        )}

        {plan.powersToLearn > 0 && (
          <div className="space-y-1 text-sm" data-testid="new-powers">
            <p className="font-semibold">New powers: choose {plan.powersToLearn} ({chosen.length} chosen)</p>
            <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-700 rounded p-2">
              {plan.powerOptions.map((power) => (
                <label key={power.name} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={chosen.includes(power.name)}
                    disabled={!chosen.includes(power.name) && chosen.length >= plan.powersToLearn}
                    onChange={() => set({ powers: chosen.includes(power.name) ? chosen.filter((name) => name !== power.name) : [...chosen, power.name] })}
                  />
                  <span>
                    {power.name} <span className="text-gray-400">{power.level ? `level ${power.level}` : "at-will"}{power.prerequisite ? `, builds on ${power.prerequisite}` : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {result.problems.length > 0 ? (
          <ul className="text-sm text-yellow-300 list-disc list-inside">
            {result.problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-gray-300" data-testid="level-up-summary">
            Hit points {character.maxHp} to {result.changes!.maxHp}
            {result.changes!.maxForcePoints !== character.maxForcePoints ? `, power points ${character.maxForcePoints} to ${result.changes!.maxForcePoints}` : ""}
            {result.changes!.proficiencyBonus !== character.proficiencyBonus ? `, proficiency bonus +${result.changes!.proficiencyBonus}` : ""}
            {result.changes!.armorClass !== character.armorClass ? `, armor class ${result.changes!.armorClass}` : ""}.
          </p>
        )}
        <Button disabled={result.problems.length > 0 || saving} onClick={() => result.changes && onSave(result.changes)}>
          Level up to {plan.level}
        </Button>
        {klass && <p className="text-xs text-gray-500">Hit points use the average of the d{klass.hitDie} Hit Die.</p>}
      </CardContent>
    </Card>
  );
}

export default function CharacterManagement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { generateCampaign } = useCampaign();
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  // Fields changed on the sheet and not saved yet
  const [edits, setEdits] = useState<Record<string, any>>({});

  // Fetch character data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/characters/${id}`],
    enabled: !!id,
  });

  // Update character mutation
  const updateCharacter = useMutation({
    mutationFn: async (updatedData: any) => {
      return apiRequest("PUT", `/api/characters/${id}`, updatedData);
    },
    onSuccess: () => {
      toast.success("Character updated successfully");
      setEdits({});
      queryClient.invalidateQueries({ queryKey: [`/api/characters/${id}`] });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  const character: any = data ? { ...(data as any), ...edits } : data;

  // Generate campaign
  const handleGenerateCampaign = async () => {
    if (!character) return;
    
    setIsGeneratingCampaign(true);
    try {
      navigate(`/campaigns/create?characterId=${character.id}`);
    } catch (error) {
      console.error("Error generating campaign:", error);
      toast.error("Failed to generate campaign");
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  // Save character changes
  const handleSaveChanges = () => {
    if (!character || Object.keys(edits).length === 0) return;
    updateCharacter.mutate(edits);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl mb-4">Failed to load character</div>
        <Link to="/">
          <Button>Return to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-3 md:p-6 text-white">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-6 md:mb-8">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400">{character.name}</h1>
            <p className="text-gray-300">
              Level {character.level} {getSpeciesById(character.species)?.name ?? character.species} {getClassById(character.class)?.name ?? character.class}
              {findArchetype(character) ? ` (${findArchetype(character)!.name})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-4">
            <Button
              variant="outline"
              className="border-yellow-400 text-yellow-400"
              onClick={handleSaveChanges}
              disabled={updateCharacter.isPending}
            >
              {updateCharacter.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
            <Button 
              onClick={handleGenerateCampaign}
              disabled={isGeneratingCampaign}
            >
              {isGeneratingCampaign ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4 mr-2" />
              )}
              Generate Campaign
            </Button>
          </div>
        </header>

        <Advancement character={data} onSave={(changes) => updateCharacter.mutate(changes)} saving={updateCharacter.isPending} />
        <CombatOptions character={data} onSave={(changes) => updateCharacter.mutate(changes)} saving={updateCharacter.isPending} />

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-3 md:p-6">
            <Tabs defaultValue="character-sheet">
              <TabsList className="mb-6">
                <TabsTrigger value="character-sheet">Character Sheet</TabsTrigger>
                <TabsTrigger value="inventory">Inventory</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
              </TabsList>
              
              <TabsContent value="character-sheet">
                <CharacterSheet
                  character={character}
                  onUpdate={(changes) => setEdits((current) => ({ ...current, ...changes }))}
                />
              </TabsContent>
              
              <TabsContent value="inventory">
                <Inventory
                  character={character}
                  onUpdate={(changes) => setEdits((current) => ({ ...current, ...changes }))}
                />
              </TabsContent>

              <TabsContent value="features">
                <div className="space-y-2" data-testid="features">
                  {characterFeatures(character).map((feature) => (
                    <details key={`${feature.source}-${feature.name}-${feature.level ?? 0}`} className="bg-gray-900 rounded p-2">
                      <summary className="cursor-pointer">
                        {feature.name}{" "}
                        <span className="text-sm text-gray-400">
                          {feature.source}{feature.level ? `, level ${feature.level}` : ""}
                        </span>
                      </summary>
                      <p className="text-sm text-gray-300 whitespace-pre-line mt-2">{feature.description}</p>
                    </details>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
