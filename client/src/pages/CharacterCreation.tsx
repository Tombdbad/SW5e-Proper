import React, { useState, useEffect } from "react";
import { Tab } from "@headlessui/react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm, FormProvider, FormField, FormItem, FormLabel } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import PersonalityTraitForm from "../components/CharacterCreation/PersonalityTraitForm";
// Import SW5E data and utilities
import { getSpeciesById, increaseChoices } from "../lib/sw5e/species";
import { classes, getClassById } from "../lib/sw5e/classes";
import { getBackgroundById } from "../lib/sw5e/backgrounds";
import { SKILLS } from "../lib/sw5e/constants";
import {
  calculateModifier,
  calculateProficiencyBonus,
  calculatePowerPoints,
  calculateStartingCredits,
  MAX_POINT_BUY_POINTS,
} from "../lib/sw5e/rules";
import { derivedStats, featAbilityOptions } from "../lib/sw5e/characterCalculation";

// Import Components
import SpeciesSelection from "../components/CharacterCreation/SpeciesSelection";
import ClassSelection from "../components/CharacterCreation/ClassSelection";
import AbilityScores from "../components/CharacterCreation/AbilityScores";
import BackgroundSelection from "../components/CharacterCreation/BackgroundSelection";
import EquipmentSelection from "../components/CharacterCreation/EquipmentSelection";
import SkillsSelection from "../components/CharacterCreation/SkillsSelection";
import FeatsSelection from "../components/CharacterCreation/FeatsSelection";
import PowersSelection from "../components/CharacterCreation/PowersSelection";
import ForcePowersSelection from "../components/CharacterCreation/ForcePowersSelection";
import TechPowersSelection from "../components/CharacterCreation/TechPowersSelection";
import CharacterDetails from "../components/CharacterCreation/CharacterDetails";
import { CharacterPreview } from "../components/CharacterManagement/CharacterSheet";
import TranslucentPane from "../components/ui/TranslucentPane";
import Alert from "../components/ui/Alert";

// Import Character API service
import { CharacterAPI } from "../lib/api/character";

// The form schema covers only what the form itself collects. Final stats come from deriveStats()
// and the server validates the saved payload (insertCharacterSchema in shared/schema.ts).
const characterSchema = z
  .object({
    name: z.string().trim().min(2, "Character name must be at least 2 characters"),
    species: z.string().min(1, "Choose a species"),
    class: z.string().min(1, "Choose a class"),
    background: z.string().min(1, "Choose a background"),
    alignment: z.string().min(1, "Choose an alignment"),
    level: z.number({ invalid_type_error: "Level must be a number from 1 to 20" }).int().min(1).max(20),
    abilityScores: z
      .record(z.number({ invalid_type_error: "Ability scores must be numbers from 3 to 20" }).min(3).max(20))
      .optional(),
  })
  .passthrough();

export type CharacterData = Record<string, any>;

// SKILLS has no ids; the skills step and the class data both go by skill name
const SKILL_OPTIONS = SKILLS.map((skill) => ({ ...skill, id: skill.name }));

// The species ability increases with the player's picks filled in, or what is still missing.
// `data.speciesAbilityOption` is the chosen alternative, `data.speciesAbilityChoices[i]` the
// abilities picked for increase i of that alternative.
function speciesIncreases(data: CharacterData): { bonus: Record<string, number>; missing: boolean } {
  const sp = getSpeciesById(data.species);
  const set = sp?.abilityScoreOptions[Number(data.speciesAbilityOption) || 0] ?? [];
  const bonus: Record<string, number> = {};
  let missing = false;
  set.forEach((increase, i) => {
    const { abilities, count } = increaseChoices(increase);
    const picked: string[] = abilities.length === 1 ? abilities : (data.speciesAbilityChoices?.[i] ?? []).filter((a: string) => abilities.includes(a));
    if (picked.length !== count) missing = true;
    for (const ability of picked) bonus[ability] = (bonus[ability] ?? 0) + increase.amount;
  });
  return { bonus, missing };
}

// The ability each chosen feat raises by 1: the only one it names, or the one picked in the Feats
// step (`data.featAbilities[feat name]`). `missing` names a feat still waiting for its pick.
function featIncreases(data: CharacterData): { abilities: string[]; missing?: string } {
  const abilities: string[] = [];
  let missing: string | undefined;
  for (const feat of data.feats ?? []) {
    const name = feat?.name ?? feat;
    const offered = featAbilityOptions(name);
    const ability = offered.length === 1 ? offered[0] : data.featAbilities?.[name];
    if (ability && offered.includes(ability)) abilities.push(ability);
    else if (offered.length) missing = name;
  }
  return { abilities, missing };
}

// Final stats from the choices made in the form, by the Player's Handbook: species and feat
// increases, class hit die, saving throws and power points from the class table, armor actually
// bought, and what the species traits, class features and feats add (see characterCalculation)
function deriveStats(data: CharacterData) {
  const cls = getClassById(data.class);
  const sp = getSpeciesById(data.species);
  const level = Number(data.level) || 1;
  const abilityScores: Record<string, number> = { ...(data.abilityScores ?? data.abilities) };
  for (const [ability, bonus] of Object.entries(speciesIncreases(data).bonus)) {
    if (ability in abilityScores) abilityScores[ability] = Math.min(20, abilityScores[ability] + bonus);
  }
  for (const ability of featIncreases(data).abilities) {
    if (ability in abilityScores) abilityScores[ability] = Math.min(20, abilityScores[ability] + 1);
  }
  const mod = (ability: string) => calculateModifier(abilityScores[ability]);
  const hitDie = cls?.hitDie ?? 8;
  const perLevel = hitDie / 2 + 1 + mod("constitution");
  const carried: string[] = (data.equipment ?? []).map((e: any) => e?.name ?? e);
  const derived = derivedStats({ species: data.species, class: data.class, level, feats: data.feats, abilityScores, equipment: carried });
  const all = (...lists: string[][]) => Array.from(new Set(lists.flat()));

  return {
    abilityScores,
    hitPoints: Math.max(1, hitDie + mod("constitution") + (level - 1) * perLevel) + derived.hitPointBonus,
    armorClass: derived.armorClass,
    initiative: mod("dexterity"),
    speed: (sp?.speed?.walk ?? 30) + derived.speedBonus,
    languages: sp?.languages ?? data.languages,
    savingThrowProficiencies: all((cls?.savingThrows ?? []).map((s) => s.toLowerCase()), derived.effects.saves),
    skillProficiencies: all(data.skillProficiencies ?? [], data.backgroundSkills ?? [], derived.effects.skills),
    weapons: derived.naturalWeapons,
    powerPoints: calculatePowerPoints(data.class, level, abilityScores as any),
    proficiencyBonus: calculateProficiencyBonus(level),
  };
}

export default function CharacterCreation() {
  const [currentTab, setCurrentTab] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingMulticlass, setIsAddingMulticlass] = useState(false);
  const [validationSteps, setValidationSteps] = useState<any[]>([]);

  // Form setup with validation
  const methods = useForm<CharacterData>({
    resolver: zodResolver(characterSchema),
    defaultValues: {
      name: "",
      alignment: "Neutral Balanced",
      gender: "",
      age: 25,
      species: "",
      class: "",
      level: 1,
      background: "",
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      skillProficiencies: [],
      toolProficiencies: [],
      languages: ["Basic"],
      hitPoints: 0,
      armorClass: 10,
      initiative: 0,
      speed: 30,
      proficiencyBonus: 2,
      equipment: [],
      credits: 500,
      feats: [],
      forcePowers: [],
      techPowers: [],
      powerPoints: 0,
      maxPowerLevel: 0,
      traits: [],
      experiencePoints: 0,
      multiclass: [],
      personality: {
        traits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        appearance: "",
        backstory: ""
      },
    },
  });

  const { handleSubmit, formState, watch, setValue, control } = methods;
  const { errors, isValid, isDirty } = formState;

  // Watch for changes to calculate derived stats
  const watchSpecies = watch("species");
  const watchClass = watch("class");
  const watchLevel = watch("level");
  const watchAbilities = watch("abilities");

  const navigate = useNavigate();

  // Choices that depend on an earlier choice start over when that choice changes
  useEffect(() => {
    setValue("speciesAbilityOption", 0);
    setValue("speciesAbilityChoices", []);
  }, [watchSpecies, setValue]);

  useEffect(() => {
    setValue("skillProficiencies", []);
    setValue("forcePowers", []);
    setValue("techPowers", []);
    setValue("equipment", []);
    // Starting wealth by class: the average of the class's roll
    setValue("credits", calculateStartingCredits(watchClass) || 500);
  }, [watchClass, setValue]);

  const watchBackground = watch("background");
  useEffect(() => {
    setValue("backgroundSkills", []);
    setValue("feats", []);
    setValue("featAbilities", {});
  }, [watchBackground, setValue]);

  const onSubmit = async (data: CharacterData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (!getClassById(data.class)) throw new Error("Invalid class selection");
      if (speciesIncreases(data).missing) throw new Error("Choose your species ability score increases (Species step)");
      const waiting = featIncreases(data).missing;
      if (waiting) throw new Error(`Choose the ability ${waiting} raises (Feats step)`);

      // Prepare final character data
      const characterData = { ...data, ...deriveStats(data) };

      // Validate character data using our new validation service
      const validationResult = await CharacterAPI.validateCharacter(characterData);

      if (!validationResult.valid) {
        // Show validation errors
        const errorMessage = validationResult.errors
          .map((err) => err.message)
          .join(", ");
        throw new Error(errorMessage);
      }

      // Submit the character
      const character = await CharacterAPI.saveCharacter(characterData);

      // Set the persisted character ID for the personality form
      setPersistedCharacterId(character.id);

      // Navigate to campaign creator with new character or character sheet
      navigate(`/campaigns/create?characterId=${character.id}`);
    } catch (error) {
      console.error("Error creating character:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Say what is missing instead of doing nothing when the form is incomplete
  const onInvalid = (formErrors: any) => {
    const messages: string[] = [];
    const collect = (e: any) => {
      if (!e || typeof e !== "object") return;
      if (typeof e.message === "string") messages.push(e.message);
      else Object.values(e).forEach(collect);
    };
    collect(formErrors);
    setError(messages.length ? Array.from(new Set(messages)).join(". ") : "Please complete the earlier steps");
  };

  // Persist the temporary character ID when the form has enough data
  useEffect(() => {
    const currentData = methods.getValues();
    const hasBasicInfo = currentData.name && currentData.species && currentData.class;

    if (hasBasicInfo && !persistedCharacterId) {
      // Create a temporary character ID for tracking
      const tempId = "temp-" + Date.now().toString();
      setPersistedCharacterId(tempId);

      // Save basic data to the store
      // This would normally be done through your character store's createCharacter action
      // For now, we're just setting the ID for the personality form
    }
  }, [methods.watch('name'), methods.watch('species'), methods.watch('class')]);

  const [showPersonalityForm, setShowPersonalityForm] = useState(false);
  const [persistedCharacterId, setPersistedCharacterId] = useState<string | null>(null);

  // Define tabs for the character creation process
  const tabs = [
    {
      name: "Details",
      component: <CharacterDetails form={methods} />,
    },
    {
      name: "Species",
      component: <SpeciesSelection onSelect={() => setCurrentTab(2)} />,
    },
    {
      name: "Class",
      component: <ClassSelection form={methods} allClasses={classes} />,
    },
    {
      name: "Abilities",
      component: (
        <AbilityScores
          form={methods}
          maxPoints={MAX_POINT_BUY_POINTS}
          calculateModifier={calculateModifier}
        />
      ),
    },
    {
      name: "Background",
      component: (
        <BackgroundSelection onSelect={() => setCurrentTab(5)} />
      ),
    },
    {
      name: "Skills",
      component: (
        <SkillsSelection
          form={methods}
          allSkills={SKILL_OPTIONS}
          getSelectedClass={() => getClassById(watch("class"))}
          background={getBackgroundById(watch("background"))}
        />
      ),
    },
    {
      name: "Powers",
      component: (
        <PowersSelection onContinue={() => setCurrentTab(7)} />
      ),
    },
    {
      name: "Feats",
      component: (
        <FeatsSelection
          availableFeats={getBackgroundById(watch("background")) ? 1 : 0}
          characterClass={watch("class")}
          options={getBackgroundById(watch("background"))?.featOptions}
        />
      ),
    },
    {
      name: "Equipment",
      component: (
        <EquipmentSelection
          form={methods}
          getSelectedClass={() => getClassById(watch("class"))}
        />
      ),
    },
    {
      name: "Preview",
      component: <PreviewPanel data={watch()} />,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black bg-opacity-30">
      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          onKeyDown={(e) => {
            // Enter in a text field must not create the character early
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
          }}
          className="w-full max-w-6xl"
        >
          <TranslucentPane className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-yellow-400">
                Character Creation
              </h1>
            </div>

            {error && (
              <Alert type="error" className="mb-4">
                {error}
              </Alert>
            )}

            <Tab.Group selectedIndex={currentTab} onChange={setCurrentTab}>
              <Tab.List className="flex space-x-1 bg-gray-800 bg-opacity-50 p-1 rounded-lg overflow-x-auto">
                {tabs.map((tab) => (
                  <Tab
                    key={tab.name}
                    className={({ selected }) =>
                      `px-3 py-2 text-sm font-medium rounded-md focus:outline-none whitespace-nowrap ${
                        selected
                          ? "bg-yellow-600 text-white"
                          : "text-yellow-400 hover:bg-gray-700"
                      }`
                    }
                  >
                    {tab.name}
                  </Tab>
                ))}
              </Tab.List>

              <Tab.Panels className="mt-4">
                {tabs.map((tab, idx) => (
                  <Tab.Panel key={idx}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <TranslucentPane className="p-4">
                        {tab.component}
                      </TranslucentPane>
                    </motion.div>
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentTab(Math.max(0, currentTab - 1))}
                disabled={currentTab === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:bg-gray-600 disabled:text-gray-400"
              >
                Previous
              </button>

              {/* Distinct keys: otherwise React turns the clicked Next button into the submit
                  button mid-click and the form is submitted on arriving at the last step */}
              {currentTab === tabs.length - 1 ? (
                <button
                  key="create"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:bg-gray-600 disabled:text-gray-400"
                >
                  {isSubmitting ? "Creating..." : "Create Character"}
                </button>
              ) : (
                <button
                  key="next"
                  type="button"
                  onClick={() =>
                    setCurrentTab(Math.min(tabs.length - 1, currentTab + 1))
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Next
                </button>
              )}
            </div>
          </TranslucentPane>
        </form>
      </FormProvider>
    </div>
  );
}

// Last step: what will be saved
function PreviewPanel({ data }: { data: CharacterData }) {
  const stats = deriveStats(data);
  const names = (xs: any) => (Array.isArray(xs) && xs.length ? xs.map((x) => x?.name ?? x).join(", ") : "None");

  return (
    <div className="space-y-4">
      <CharacterPreview character={data} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 text-sm">
        <div>Hit Points: {stats.hitPoints}</div>
        <div>Armor Class: {stats.armorClass}</div>
        <div>Speed: {stats.speed} ft.</div>
        <div>Power Points: {stats.powerPoints}</div>
        {Object.entries(stats.abilityScores).map(([ability, score]) => (
          <div key={ability} className="capitalize">
            {ability}: {score}
          </div>
        ))}
      </div>
      <div className="px-4 text-sm space-y-1">
        <div>Background: {getBackgroundById(data.background)?.name || "Not chosen"}</div>
        <div>Saving Throws: {names(stats.savingThrowProficiencies)}</div>
        <div>Skills: {names(stats.skillProficiencies)}</div>
        <div>Feats: {names(data.feats)}</div>
        {stats.weapons.length > 0 && <div>Natural weapons: {stats.weapons.map((w) => `${w.name} ${w.damage}`).join(", ")}</div>}
        <div>Equipment: {names(data.equipment)}</div>
      </div>
    </div>
  );
}
