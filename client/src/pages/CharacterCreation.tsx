import React, { useState, useEffect } from "react";
import { Tab } from "@headlessui/react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Import SW5E data and utilities
import { SPECIES } from "../lib/sw5e/species";
import { CLASSES } from "../lib/sw5e/classes";
import { BACKGROUNDS } from "../lib/sw5e/backgrounds";
import { FEATS } from "../lib/sw5e/feats";
import { EQUIPMENT } from "../lib/sw5e/equipment";
import { FORCE_POWERS } from "../lib/sw5e/forcePowers";
import { TECH_POWERS } from "../lib/sw5e/techPowers";
import {
  SKILLS,
  LANGUAGES,
  BACKGROUND_OPTIONS,
  ALIGNMENTS,
} from "../lib/sw5e/constants";
import {
  calculateModifier,
  calculateProficiencyBonus,
  calculateMaxPowerPoints,
  calculateMaxPowerLevel,
  calculateHitPoints,
  calculateArmorClass,
  calculateInitiative,
  getAbilityModifiers,
  MAX_POINT_BUY_POINTS,
} from "../lib/sw5e/rules";

// Import Components
import SpeciesSelection from "../components/CharacterCreation/SpeciesSelection";
import ClassSelection from "../components/CharacterCreation/ClassSelection";
import AbilityScores from "../components/CharacterCreation/AbilityScores";
import BackgroundSelection from "../components/CharacterCreation/BackgroundSelection";
import EquipmentSelection from "../components/CharacterCreation/EquipmentSelection";
import SkillsSelection from "../components/CharacterCreation/SkillsSelection";
import FeatsSelection from "../components/CharacterCreation/FeatsSelection";
import PowersSelection from "../components/CharacterCreation/PowersSelection";
import ForcePowersSelection from"../components/CharacterCreation/ForcePowersSelection";
import TechPowersSelection from "../components/CharacterCreation/TechPowersSelection";
import CharacterDetails from "../components/CharacterCreation/CharacterDetails";
import { CharacterPreview } from "../components/CharacterManagement/CharacterSheet";
import TranslucentPane from "../components/ui/TranslucentPane";
import Alert from "../components/ui/Alert";

// Import the unified character schema
    import { CharacterSchema } from "@shared/unifiedSchema";

    // Use the imported character schema from unified schema
    const characterSchema = CharacterSchema;

      // Character-specific features
  traits: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        source: z.string(),
      }),
    )
    .default([]),

  // Meta info
  experiencePoints, z.number().min(0).default(0);
});

export type CharacterData = z.infer<typeof characterSchema>;

export default function CharacterCreation() {
  const [currentTab, setCurrentTab] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form setup with validation
  const methods = useForm<CharacterData>({
    resolver: zodResolver(characterSchema),
    defaultValues: {
      name: "",
      alignment: "Neutral",
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
    },
  });

  const { handleSubmit, formState, watch, setValue, reset } = methods;
  const { errors, isValid, isDirty } = formState;

  // Watch for changes to calculate derived stats
  const watchSpecies = watch("species");
  const watchClass = watch("class");
  const watchLevel = watch("level");
  const watchAbilities = watch("abilities");

  const navigate = useNavigate();

  // Effect to update traits when species changes
  useEffect(() => {
    if (watchSpecies) {
      const selectedSpecies = SPECIES.find((s) => s.id === watchSpecies);
      if (selectedSpecies) {
        // Update traits from species
        setValue("traits", selectedSpecies.traits || []);

        // Update languages
        setValue("languages", [
          "Basic",
          ...(selectedSpecies.languages?.filter((l) => l !== "Basic") || []),
        ]);

        // Update speed
        setValue("speed", selectedSpecies.speed || 30);

        // Apply ability score adjustments
        if (selectedSpecies.abilityScoreAdjustments) {
          const currentAbilities = { ...watchAbilities };
          const adjustments = selectedSpecies.abilityScoreAdjustments;

          Object.entries(adjustments).forEach(([ability, adjustment]) => {
            if (
              currentAbilities[ability as keyof typeof currentAbilities] !==
              undefined
            ) {
              currentAbilities[ability as keyof typeof currentAbilities] +=
                adjustment;
            }
          });

          setValue("abilities", currentAbilities);
        }
      }
    }
  }, [watchSpecies, setValue]);

  // Effect to update class-related features
  useEffect(() => {
    if (watchClass) {
      const selectedClass = CLASSES.find((c) => c.id === watchClass);
      if (selectedClass) {
        // Get class features for level 1
        const levelOneFeatures = selectedClass.features?.[1] || [];

        // Add class features to traits
        setValue("traits", [...watch("traits"), ...levelOneFeatures]);

        // Update hit points
        const constitutionMod = calculateModifier(watchAbilities.constitution);
        const hitPoints = calculateHitPoints(
          watchLevel,
          selectedClass.hitDie,
          constitutionMod,
        );
        setValue("hitPoints", hitPoints);

        // Update power points and max level if class has spellcasting
        if (selectedClass.spellcasting) {
          const castingAbility = selectedClass.spellcasting.ability;
          const abilityModifier = calculateModifier(
            watchAbilities[castingAbility as keyof typeof watchAbilities],
          );

          const powerPoints = calculateMaxPowerPoints(
            watchLevel,
            abilityModifier,
          );
          const maxPowerLevel = calculateMaxPowerLevel(watchLevel);

          setValue("powerPoints", powerPoints);
          setValue("maxPowerLevel", maxPowerLevel);
        }
      }
    }
  }, [watchClass, watchLevel, watchAbilities, setValue]);

  // Effect to update derived stats when abilities change
  useEffect(() => {
    if (watchAbilities) {
      const dexMod = calculateModifier(watchAbilities.dexterity);

      // Update AC (basic calculation, will be overridden by equipment)
      setValue("armorClass", 10 + dexMod);

      // Update initiative
      setValue("initiative", dexMod);

      // Update proficiency bonus based on level
      setValue("proficiencyBonus", calculateProficiencyBonus(watchLevel));

      // Recalculate hit points if class is selected
      if (watchClass) {
        const selectedClass = CLASSES.find((c) => c.id === watchClass);
        if (selectedClass) {
          const conMod = calculateModifier(watchAbilities.constitution);
          const hitPoints = calculateHitPoints(
            watchLevel,
            selectedClass.hitDie,
            conMod,
          );
          setValue("hitPoints", hitPoints);
        }
      }

      // Recalculate power points if applicable
      if (watchClass) {
        const selectedClass = CLASSES.find((c) => c.id === watchClass);
        if (selectedClass?.spellcasting) {
          const castingAbility = selectedClass.spellcasting.ability;
          const abilityMod = calculateModifier(
            watchAbilities[castingAbility as keyof typeof watchAbilities],
          );

          setValue(
            "powerPoints",
            calculateMaxPowerPoints(watchLevel, abilityMod),
          );
        }
      }
    }
  }, [watchAbilities, watchLevel, watchClass, setValue]);

  const onSubmit = async (data: CharacterData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Ensure all derived values are calculated before submission
      const abilities = data.abilities;
      const abilityModifiers = getAbilityModifiers(abilities);

      // Get selected class for final calculations
      const selectedClass = CLASSES.find((c) => c.id === data.class);
      if (!selectedClass) throw new Error("Invalid class selection");

      // Final hit point calculation
      const conMod = abilityModifiers.constitution;
      const hitPoints = calculateHitPoints(
        data.level,
        selectedClass.hitDie,
        conMod,
      );

      // Submit the character
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          hitPoints,
          proficiencyBonus: calculateProficiencyBonus(data.level),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create character");
      }

      const character = await response.json();

      // Navigate to campaign creator with new character or character sheet
      navigate(`/campaign/create?characterId=${character.id}`);
    } catch (error) {
      console.error("Error creating character:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Define tabs for the character creation process
  const tabs = [
    {
      name: "Details",
      component: <CharacterDetails form={methods} />,
    },
    {
      name: "Species",
      component: <SpeciesSelection form={methods} allSpecies={SPECIES} />,
    },
    {
      name: "Class",
      component: <ClassSelection form={methods} allClasses={CLASSES} />,
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
        <BackgroundSelection
          form={methods}
          allBackgrounds={BACKGROUNDS}
          backgroundOptions={BACKGROUND_OPTIONS}
        />
      ),
    },
    {
      name: "Skills",
      component: (
        <SkillsSelection
          form={methods}
          allSkills={SKILLS}
          getSelectedClass={() => CLASSES.find((c) => c.id === watch("class"))}
        />
      ),
    },
    {
      name: "Powers",
      component: (
        <PowersSelection
          form={methods}
          forcePowers={FORCE_POWERS}
          techPowers={TECH_POWERS}
          getSelectedClass={() => CLASSES.find((c) => c.id === watch("class"))}
        />
      ),
    },
    {
      name: "Feats",
      component: (
        <FeatsSelection
          form={methods}
          allFeats={FEATS}
          level={watch("level")}
          species={watch("species")}
        />
      ),
    },
    {
      name: "Equipment",
      component: (
        <EquipmentSelection
          form={methods}
          allEquipment={EQUIPMENT}
          getSelectedClass={() => CLASSES.find((c) => c.id === watch("class"))}
        />
      ),
    },
    {
      name: "Preview",
      component: (
        <CharacterPreview
          form={methods}
          abilities={watch("abilities")}
        />
      ),
    },
  ];

  // Handler for saving character as draft
  const handleSaveDraft = async () => {
    try {
      const currentFormData = methods.getValues();

      const response = await fetch("/api/characters/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentFormData,
          isDraft: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to save draft");

      // Show success message or notification
      alert("Character draft saved successfully!");
    } catch (error) {
      console.error("Error saving draft:", error);
      setError(error instanceof Error ? error.message : "Failed to save draft");
    }
  };

  // Handler for loading a draft character
  const handleLoadDraft = async () => {
    try {
      const response = await fetch("/api/characters/drafts");
      if (!response.ok) throw new Error("Failed to fetch drafts");

      const drafts = await response.json();

      // For simplicity, just load the first draft
      // In a real app, you'd show a modal to select which draft to load
      if (drafts.length > 0) {
        reset(drafts[0]);
        alert("Draft loaded successfully!");
      } else {
        alert("No drafts found");
      }
    } catch (error) {
      console.error("Error loading draft:", error);
      setError(error instanceof Error ? error.message : "Failed to load draft");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black bg-opacity-30">
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-6xl">
          <TranslucentPane className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-yellow-400">
                Character Creation
              </h1>

              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handleLoadDraft}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Load Draft
                </button>
              </div>
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

              {currentTab === tabs.length - 1 ? (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:bg-gray-600 disabled:text-gray-400"
                >
                  {isSubmitting ? "Creating..." : "Create Character"}
                </button>
              ) : (
                <button
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