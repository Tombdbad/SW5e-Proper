
import React, { useState } from "react";
import PersonalityTraitForm from "./PersonalityTraitForm";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { backgrounds, BACKGROUNDS, backgroundLanguages, backgroundTools } from "@/lib/sw5e/backgrounds";
import { getSpeciesById } from "@/lib/sw5e/species";
import { equipment } from "@/lib/sw5e/equipment";
import { LANGUAGES } from "@/lib/sw5e/constants";

// Tools, kits, gaming sets and instruments, from the equipment data, with the book's own category
export const TOOLS = equipment.filter((e) => e.category === "Tool").map((e) => ({ name: e.name, category: e.kind }));

interface BackgroundSelectionProps {
  onSelect: () => void;
}

export default function BackgroundSelection({ onSelect }: BackgroundSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedBackground = watch("background");

  const backgroundInfo = backgrounds.find(b => b.id === selectedBackground);

  // Tools and languages the background (and the species) leave to the player
  const tools = backgroundTools(backgroundInfo, TOOLS);
  const pickedTools: string[] = watch("backgroundTools") || [];
  const speciesLanguages = getSpeciesById(watch("species"))?.languages ?? [];
  const languageCount = backgroundLanguages(backgroundInfo).choices + speciesLanguages.filter((l) => /of your choice/i.test(l)).length;
  const pickedLanguages: string[] = watch("extraLanguages") || [];
  // Personality traits, ideals, bonds, flaws and a backstory, with the background's tables to pick from
  const [showPersonality, setShowPersonality] = useState(false);
  const personality = watch("personality") || {};
  const personalityCount = ["traits", "ideals", "bonds", "flaws"].reduce((sum, key) => sum + (personality[key]?.length ?? 0), 0);
  const toggle = (field: string, picked: string[], name: string, limit: number) => {
    if (picked.includes(name)) setValue(field, picked.filter((n) => n !== name));
    else if (picked.length < limit) setValue(field, [...picked, name]);
  };

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="background"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Background</FormLabel>
            <FormControl>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select background" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-72">
                    {BACKGROUNDS.map((background) => (
                      <SelectItem key={background.id} value={background.id}>
                        {background.name}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {backgroundInfo && (
        <div className="bg-gray-800 bg-opacity-50 rounded-md p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">{backgroundInfo.name}</h3>
          <p className="text-gray-300 mb-2">{backgroundInfo.summary}</p>
          
          <div className="mt-4">
            <h4 className="text-yellow-400 text-sm font-medium mb-1">Feature: {backgroundInfo.feature}</h4>
            <p className="text-sm text-gray-300">{backgroundInfo.featureDescription}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">
                Skill Proficiencies (choose {backgroundInfo.numSkillChoices} in the Skills step)
              </h4>
              <ul className="list-disc pl-5 text-sm">
                {backgroundInfo.skillProficiencies.map((skill, index) => (
                  <li key={index}>{skill}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Tool Proficiencies</h4>
              <ul className="list-disc pl-5 text-sm">
                {backgroundInfo.toolProficiencies.length > 0 ? (
                  backgroundInfo.toolProficiencies.map((tool, index) => (
                    <li key={index}>{tool}</li>
                  ))
                ) : (
                  <li>None</li>
                )}
              </ul>
            </div>
          </div>

          {tools.choices > 0 && (
            <div className="mt-4" data-testid="background-tools">
              <h4 className="text-yellow-400 text-sm font-medium mb-1">
                Choose {tools.choices === 1 ? "your tool" : `${tools.choices} tools`} ({pickedTools.length}/{tools.choices})
              </h4>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {tools.options.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant={pickedTools.includes(name) ? "default" : "outline"}
                    className="h-7 px-2"
                    disabled={!pickedTools.includes(name) && pickedTools.length >= tools.choices}
                    onClick={() => toggle("backgroundTools", pickedTools, name, tools.choices)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {languageCount > 0 && (
            <div className="mt-4" data-testid="background-languages">
              <h4 className="text-yellow-400 text-sm font-medium mb-1">
                Choose {languageCount === 1 ? "a language" : `${languageCount} languages`} ({pickedLanguages.length}/{languageCount})
              </h4>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {LANGUAGES.filter((language) => !speciesLanguages.includes(language)).map((language) => (
                  <Button
                    key={language}
                    type="button"
                    size="sm"
                    variant={pickedLanguages.includes(language) ? "default" : "outline"}
                    className="h-7 px-2"
                    disabled={!pickedLanguages.includes(language) && pickedLanguages.length >= languageCount}
                    onClick={() => toggle("extraLanguages", pickedLanguages, language, languageCount)}
                  >
                    {language}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-4" data-testid="background-personality">
            <h4 className="text-yellow-400 text-sm font-medium mb-1">Personality and backstory (optional)</h4>
            <p className="text-sm text-gray-300 mb-2">
              {personalityCount || personality.backstory
                ? `${personalityCount} chosen${personality.backstory ? ", with a backstory" : ""}.`
                : "Traits, an ideal, a bond and a flaw, from this background's tables or your own."}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowPersonality(true)}>
              {personalityCount || personality.backstory ? "Edit personality" : "Choose personality"}
            </Button>
          </div>
          {showPersonality && (
            <PersonalityTraitForm
              background={backgroundInfo}
              initialData={personality}
              onSave={(data) => setValue("personality", data)}
              onClose={() => setShowPersonality(false)}
            />
          )}

          <Button type="button" onClick={onSelect} className="mt-4">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
