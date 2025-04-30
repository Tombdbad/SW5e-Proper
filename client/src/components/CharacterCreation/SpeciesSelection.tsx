
import React, { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { species, getSpeciesById } from "@/lib/sw5e/species";
// Ensure species list is fully imported

interface SpeciesSelectionProps {
  onSelect: () => void;
}

export default function SpeciesSelection({ onSelect }: SpeciesSelectionProps) {
  const { control, watch, setValue } = useFormContext();
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>("");
  
  const selectedSpecies = watch("species");
  const handleSpeciesSelect = (speciesId: string) => {
    setValue("species", speciesId);
    setSelectedSpeciesId(speciesId);
  };

  const speciesDetails = selectedSpeciesId ? getSpeciesById(selectedSpeciesId) : null;

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="species"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Species</FormLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <FormControl>
                      <div className="space-y-2">
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleSpeciesSelect(value);
                          }}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select species" />
                          </SelectTrigger>
                          <SelectContent>
                            <input 
                              className="px-3 py-2 w-full border-b border-gray-600 mb-2 bg-gray-800 text-white"
                              placeholder="Search species..."
                              onChange={(e) => {
                                // This adds a search feature but would need state management
                                const searchField = e.target;
                                const allOptions = searchField.parentElement?.querySelectorAll('[data-species-option]');
                                allOptions?.forEach(option => {
                                  const text = option.textContent?.toLowerCase() || '';
                                  const matchesSearch = text.includes(e.target.value.toLowerCase());
                                  (option as HTMLElement).style.display = matchesSearch ? 'block' : 'none';
                                });
                              }}
                            />
                            <ScrollArea className="h-72">
                              {species.map((speciesOption) => (
                                <SelectItem 
                                  key={speciesOption.id} 
                                  value={speciesOption.id}
                                  data-species-option="true"
                                >
                                  {speciesOption.name}
                                </SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-gray-400">
                          {species.length} species available
                        </div>
                      </div>
                    </FormControl>
                <FormMessage />
              </div>

              <div>
                {speciesDetails && (
                  <RadioGroup
                    onValueChange={(value) => {
                      // If subspecies implementation is needed
                    }}
                    className="space-y-2"
                  >
                    {/* For subspecies if needed */}
                  </RadioGroup>
                )}
              </div>
            </div>
          </FormItem>
        )}
      />

      {speciesDetails && (
        <div className="bg-gray-800 bg-opacity-50 rounded-md p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">{speciesDetails.name}</h3>
          <p className="text-gray-300 mb-4">{speciesDetails.summary}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Ability Score Increases</h4>
              <ul className="list-disc pl-5 text-sm">
                {Object.entries(speciesDetails.abilityScoreIncrease).map(([ability, value]) => (
                  <li key={ability}>
                    {ability}: +{value}
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Traits</h4>
              <ul className="list-disc pl-5 text-sm">
                {speciesDetails.traits.map((trait, index) => (
                  <li key={index}>{trait.name}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Size and Speed</h4>
              <p className="text-sm">Size: {speciesDetails.size}</p>
              <p className="text-sm">Speed: {speciesDetails.speed.walk} ft.</p>
            </div>
            
            <div>
              <h4 className="text-yellow-400 text-sm font-medium mb-1">Languages</h4>
              <ul className="list-disc pl-5 text-sm">
                {speciesDetails.languages.map((language, index) => (
                  <li key={index}>{language}</li>
                ))}
              </ul>
            </div>
          </div>
          
          <Button onClick={onSelect} className="mt-4">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
