import { useEffect } from 'react';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { species } from "@/lib/sw5e/species";
import { useCharacter } from "@/lib/stores/useCharacter";

interface SpeciesSelectionProps {
  form: any; // Replace with your form type
  onSelect?: (category: string, value: string) => void;
}

export default function SpeciesSelection({ form, onSelect }: SpeciesSelectionProps) {
  const character = useCharacter(state => state.character);
  const updateCharacter = useCharacter(state => state.updateCharacter);

  // Initialize form with stored species on mount
  useEffect(() => {
    if (character?.species && !form.getValues("species")) {
      form.setValue("species", character.species, { 
        shouldValidate: true,
        shouldDirty: true 
      });
    }
  }, [character, form]);

  const handleSpeciesChange = (speciesId: string) => {
    // Update form
    form.setValue("species", speciesId, {
      shouldValidate: true,
      shouldDirty: true
    });

    // Update Zustand store
    updateCharacter({ species: speciesId });

    // If this affects other stats (like ability scores), update those too
    const selectedSpecies = species.find(s => s.id === speciesId);
    if (selectedSpecies?.abilityScoreAdjustments) {
      const currentScores = form.getValues("abilityScores") || {};
      const newScores = { ...currentScores };

      // Reset previous adjustments first
      Object.keys(newScores).forEach(ability => {
        newScores[ability] = newScores[ability] || 10;
      });

      // Apply new adjustments
      Object.entries(selectedSpecies.abilityScoreAdjustments).forEach(([ability, bonus]) => {
        const abilityKey = ability.toLowerCase();
        if (abilityKey !== 'any' && newScores[abilityKey]) {
          newScores[abilityKey] += bonus;
        }
      });

      form.setValue("abilityScores", newScores, {
        shouldValidate: true,
        shouldDirty: true
      });
    }

    // Notify parent if needed
    onSelect?.("species", speciesId);
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium text-yellow-400">Choose your character's species:</div>

      <FormField
        control={form.control}
        name="species"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {species.map((speciesOption) => (
                  <FormLabel
                    key={speciesOption.id}
                    className="cursor-pointer block w-full"
                  >
                    <Card 
                      className={`
                        transition-all border-2
                        ${field.value === speciesOption.id 
                          ? 'border-yellow-400 bg-yellow-900/20' 
                          : 'border-gray-700 hover:border-yellow-400/50'}
                      `}
                      onClick={() => handleSpeciesChange(speciesOption.id)}
                    >
                      <CardHeader>
                        <CardTitle>{speciesOption.name}</CardTitle>
                        <CardDescription>{speciesOption.description}</CardDescription>
                      </CardHeader>

                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-semibold text-yellow-400">Ability Adjustments:</span>{' '}
                            {Object.entries(speciesOption.abilityScoreIncrease ?? {})
                              .map(([ability, bonus]) => (
                                `${ability} ${bonus >= 0 ? '+' : ''}${bonus}`
                              ))
                              .join(', ')}
                          </div>
                          <div>
                            <span className="font-semibold text-yellow-400">Size:</span>{' '}
                            {speciesOption.size}
                          </div>
                          <div>
                            <span className="font-semibold text-yellow-400">Speed:</span>{' '}
                            {Object.entries(speciesOption.speed)
                              .map(([type, value]) => `${type} ${value} ft.`)
                              .join(', ')}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </FormLabel>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}