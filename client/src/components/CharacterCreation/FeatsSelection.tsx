import React, { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { feats } from "@/lib/sw5e/feats";
import { featAbilityOptions, featPrerequisiteUnmet } from "@/lib/sw5e/characterCalculation";

interface FeatsSelectionProps {
  availableFeats: number;
  characterClass: string;
  // Feat names on offer (a background's feat list); all feats when left out
  options?: string[];
  // The character so far (class, level, powers, ability scores), to judge prerequisites against
  character?: Record<string, any>;
}

export default function FeatsSelection({ availableFeats, characterClass, options, character }: FeatsSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedFeats = watch("feats") || [];
  // The ability each feat raises, where the feat offers a choice: { feat name: ability }
  const featAbilities: Record<string, string> = watch("featAbilities") || {};
  const offered = options ? feats.filter((feat) => options.includes(feat.name)) : feats;

  const handleToggleFeat = (featId: string) => {
    if (selectedFeats.includes(featId)) {
      setValue("feats", selectedFeats.filter((id: string) => id !== featId));
    } else {
      if (selectedFeats.length < availableFeats) {
        setValue("feats", [...selectedFeats, featId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <FormLabel>Feats ({selectedFeats.length}/{availableFeats})</FormLabel>
        <p className="text-sm text-gray-400 mb-4">
          {options
            ? availableFeats > 0
              ? "Your background grants one of these feats."
              : "Choose a background first: it grants your starting feat."
            : `Select up to ${availableFeats} feats for your character.`}
        </p>

        <FormField
          control={control}
          name="feats"
          render={() => (
            <FormItem>
              <ScrollArea className="h-72 p-1">
                <div className="space-y-4">
                  {offered.map((feat) => {
                    const unmet = character ? featPrerequisiteUnmet(feat, character) : null;
                    return (
                    <div key={feat.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={feat.id}
                        checked={selectedFeats.includes(feat.name)}
                        onCheckedChange={() => handleToggleFeat(feat.name)}
                        disabled={!selectedFeats.includes(feat.name) && (selectedFeats.length >= availableFeats || !!unmet)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor={feat.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {feat.name}
                        </label>
                        {feat.prerequisite && (
                          <p className={`text-xs ${unmet ? "text-yellow-400" : "text-gray-400"}`}>
                            Prerequisite: {feat.prerequisite}{unmet ? " (not met)" : ""}
                          </p>
                        )}
                        {featAbilityOptions(feat.name).length === 1 && (
                          <p className="text-xs text-gray-400 capitalize">+1 {featAbilityOptions(feat.name)[0]}</p>
                        )}
                        {featAbilityOptions(feat.name).length > 1 && selectedFeats.includes(feat.name) && (
                          <div className="flex flex-wrap items-center gap-1 text-xs" data-feat-ability={feat.name}>
                            <span className="text-gray-400">+1 to one of:</span>
                            {featAbilityOptions(feat.name).map((ability) => (
                              <Button
                                key={ability}
                                type="button"
                                size="sm"
                                variant={featAbilities[feat.name] === ability ? "default" : "outline"}
                                className="h-6 px-2 capitalize"
                                onClick={() => setValue("featAbilities", { ...featAbilities, [feat.name]: ability })}
                              >
                                {ability}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}