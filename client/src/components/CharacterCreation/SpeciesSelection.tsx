import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { species } from "@/lib/sw5e/species";

export default function SpeciesSelection({ form }: { form: any }) {
  const handleSpeciesChange = (value: string) => {
    console.log('Species change triggered:', value);
    form.setValue("species", value);
    
    // Find the species data
    const selectedSpecies = species.find(s => s.id === value);
    
    // Apply ability score bonuses
    if (selectedSpecies?.abilityScoreAdjustments) {
      const currentScores = form.getValues("abilityScores");
      const newScores = { ...currentScores };
      
      Object.entries(selectedSpecies.abilityScoreAdjustments).forEach(([ability, adjustment]) => {
        if (newScores[ability.toLowerCase()]) {
          newScores[ability.toLowerCase()] += adjustment;
        }
      });
      
      form.setValue("abilityScores", newScores);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium">Choose your character's species:</div>
      
      <FormField
        control={form.control}
        name="species"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={handleSpeciesChange}
                value={field.value}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {species.map((speciesOption) => (
                  <FormItem key={speciesOption.id}>
                    <FormControl>
                      <RadioGroupItem
                        value={speciesOption.id}
                        id={speciesOption.id}
                        className="peer sr-only"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor={speciesOption.id}
                      className="cursor-pointer block w-full"
                      onClick={() => handleSpeciesChange(speciesOption.id)}
                    >
                      <Card className="border-2 hover:border-yellow-400 peer-data-[state=checked]:border-yellow-400 peer-data-[state=checked]:bg-yellow-50 transition-all">
                        <CardHeader>
                          <CardTitle>{speciesOption.name}</CardTitle>
                          <CardDescription>
                            {speciesOption.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-2">
                            <span className="font-semibold">Ability Scores: </span>
                            {Object.entries(speciesOption.abilityScoreAdjustments).map(([ability, adjustment], index, arr) => (
                              <span key={ability}>
                                {ability} {adjustment >= 0 ? "+" : ""}{adjustment}
                                {index < arr.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                          <div className="mb-2">
                            <span className="font-semibold">Size: </span>
                            {speciesOption.size}
                          </div>
                          <div>
                            <span className="font-semibold">Speed: </span>
                            {speciesOption.speed} ft.
                          </div>
                        </CardContent>
                        <div className="p-4 pt-0">
                          <button
                            type="button"
                            onClick={() => handleSpeciesChange(speciesOption.id)}
                            className="w-full px-4 py-2 text-sm font-semibold rounded-md bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
                          >
                            Select {speciesOption.name}
                          </button>
                        </div>
                      </Card>
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Your character's species determines various traits and abilities.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
