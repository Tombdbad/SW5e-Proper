import React from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TECH_POWERS } from "@/lib/sw5e/techPowers";

interface TechPowersSelectionProps {
  availablePowers: number;
  maxPowerLevel: number;
}

export default function TechPowersSelection({
  availablePowers,
  maxPowerLevel,
}: TechPowersSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedPowers = watch("techPowers") || [];

  const handleTogglePower = (powerId: string) => {
    if (selectedPowers.includes(powerId)) {
      setValue("techPowers", selectedPowers.filter((id: string) => id !== powerId));
    } else {
      if (selectedPowers.length < availablePowers) {
        setValue("techPowers", [...selectedPowers, powerId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <FormLabel>Tech Powers ({selectedPowers.length}/{availablePowers})</FormLabel>
        <p className="text-sm text-gray-400 mb-4">
          Select up to {availablePowers} tech powers for your character.
          Your maximum power level is {maxPowerLevel}.
        </p>

        <FormField
          control={control}
          name="techPowers"
          render={() => (
            <FormItem>
              <ScrollArea className="h-72 p-1">
                <div className="space-y-4">
                  {TECH_POWERS.map((power) => (
                    <div key={power.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={power.id}
                        checked={selectedPowers.includes(power.id)}
                        onCheckedChange={() => handleTogglePower(power.id)}
                        disabled={!selectedPowers.includes(power.id) && selectedPowers.length >= availablePowers}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor={power.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {power.name}
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