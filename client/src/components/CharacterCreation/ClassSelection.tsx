import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { classes } from "@/lib/sw5e/classes";
import { useCharacter } from "@/lib/stores/useCharacter";

export default function ClassSelection({ onSelect }: { onSelect?: () => void }) {
  const { control, setValue, watch } = useFormContext();
  const updateCharacter = useCharacter(state => state.updateCharacter);
  
  const handleClassChange = (value: string) => {
    setValue("class", value, {
      shouldValidate: true,
      shouldDirty: true
    });
    
    const selectedClass = classes.find(cls => cls.id === value);
    
    // Update character store
    updateCharacter({ class: value });
    
    // Call onSelect to advance tabs if needed
    if (onSelect) onSelect();
  };

  // Get current class value
  const selectedClass = watch("class");

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium text-yellow-400">Choose your character's class:</div>

      <FormField
        control={control}
        name="class"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {classes.map((classOption) => (
                  <FormItem key={classOption.id}>
                    <FormControl>
                      <RadioGroupItem
                        value={classOption.id}
                        id={classOption.id}
                        className="peer sr-only"
                        aria-label={classOption.name}
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor={classOption.id}
                      className="cursor-pointer block w-full"
                    >
                      <Card 
                        className={`
                          transition-all border-2
                          ${field.value === classOption.id 
                            ? 'border-yellow-400 bg-yellow-900/20' 
                            : 'border-gray-700 hover:border-yellow-400/50'}
                        `}
                        onClick={() => handleClassChange(classOption.id)}
                      >
                        <CardHeader>
                          <CardTitle>{classOption.name}</CardTitle>
                          <CardDescription>
                            {classOption.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-2">
                            <span className="font-semibold text-yellow-400">Hit Die: </span>
                            d{classOption.hitDie}
                          </div>
                          <div className="mb-2">
                            <span className="font-semibold text-yellow-400">Saving Throws: </span>
                            {classOption.savingThrows.join(", ")}
                          </div>
                          <div className="mb-4">
                            <span className="font-semibold text-yellow-400">Primary Ability: </span>
                            {classOption.primaryAbility.join(", ")}
                          </div>

                          <div>
                            <span className="font-semibold text-yellow-400">Class Skills:</span>
                            <div className="grid grid-cols-2 mt-1">
                              {classOption.skillChoices.map((skill) => (
                                <div key={skill} className="flex items-center space-x-2">
                                  <Checkbox id={`${classOption.id}-${skill}`} disabled={field.value !== classOption.id} />
                                  <label
                                    htmlFor={`${classOption.id}-${skill}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {skill}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Your character's class determines their abilities, combat style, and role.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}