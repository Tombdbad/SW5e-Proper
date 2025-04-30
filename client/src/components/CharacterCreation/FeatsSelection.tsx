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
import { FEATS } from "@/lib/sw5e/feats";

interface FeatsSelectionProps {
  availableFeats: number;
  characterClass: string;
}

export default function FeatsSelection({ availableFeats, characterClass }: FeatsSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedFeats = watch("feats") || [];

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
          Select up to {availableFeats} feats for your character.
        </p>

        <FormField
          control={control}
          name="feats"
          render={() => (
            <FormItem>
              <ScrollArea className="h-72 p-1">
                <div className="space-y-4">
                  {FEATS.map((feat) => (
                    <div key={feat.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={feat.id}
                        checked={selectedFeats.includes(feat.id)}
                        onCheckedChange={() => handleToggleFeat(feat.id)}
                        disabled={!selectedFeats.includes(feat.id) && selectedFeats.length >= availableFeats}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor={feat.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {feat.name}
                        </label>
                      </div>
                    </div>
                  ))}
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