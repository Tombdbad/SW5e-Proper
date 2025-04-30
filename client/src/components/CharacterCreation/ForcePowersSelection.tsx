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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info as InfoIcon } from "lucide-react";
import { FORCE_POWERS } from "@/lib/sw5e/forcePowers";

interface ForcePowersSelectionProps {
  availablePowers: number;
  maxPowerLevel: number;
  alignment: "Light" | "Dark" | "Neutral";
}

export default function ForcePowersSelection({
  availablePowers,
  maxPowerLevel,
  alignment,
}: ForcePowersSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const selectedPowers = watch("forcePowers") || [];

  // Use the imported force powers directly from the SW5E library
  const forcePowers = FORCE_POWERS;

  const filteredPowers = forcePowers.filter(power => {
    if (alignment === "Light" && power.alignment === "dark") return false;
    if (alignment === "Dark" && power.alignment === "light") return false;
    return true;
  });

  const handleTogglePower = (powerId: string) => {
    if (selectedPowers.includes(powerId)) {
      setValue("forcePowers", selectedPowers.filter((id: string) => id !== powerId));
    } else {
      if (selectedPowers.length < availablePowers) {
        setValue("forcePowers", [...selectedPowers, powerId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <FormLabel>Force Powers ({selectedPowers.length}/{availablePowers})</FormLabel>
        <p className="text-sm text-gray-400 mb-4">
          Select up to {availablePowers} force powers for your character.
          Your maximum power level is {maxPowerLevel}.
        </p>

        <FormField
          control={control}
          name="forcePowers"
          render={() => (
            <FormItem>
              <ScrollArea className="h-72 p-1">
                <div className="space-y-4">
                  {filteredPowers.map((power) => (
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
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="ml-2 cursor-help">
                                  <InfoIcon className="h-4 w-4 text-yellow-400/60" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <div className="space-y-2">
                                  <div className="font-medium">{power.name}</div>
                                  <div className="text-xs">
                                    <span className="text-yellow-300">Level:</span> {power.powerLevel}
                                  </div>
                                  <div className="text-xs">
                                    <span className="text-yellow-300">Casting Time:</span> {power.castingPeriod}
                                  </div>
                                  <div className="text-xs">
                                    <span className="text-yellow-300">Range:</span> {power.range}
                                  </div>
                                  <div className="text-xs">
                                    <span className="text-yellow-300">Duration:</span> {power.duration}
                                  </div>
                                  <div className="text-xs mt-2">{power.description}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className={`ml-2 text-xs ${
                            power.alignment === "light" ? "text-blue-400" :
                              power.alignment === "dark" ? "text-red-400" :
                                "text-yellow-400"
                          }`}>
                            ({power.alignment})
                          </span>
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