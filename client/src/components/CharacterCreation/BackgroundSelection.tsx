import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { backgrounds } from "@/lib/sw5e/backgrounds";

export default function BackgroundSelection({ form }: { form: any }) {
  const handleBackgroundChange = (value: string) => {
    form.setValue("background", value);
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium">Choose your character's background:</div>
      
      <FormField
        control={form.control}
        name="background"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={handleBackgroundChange}
                value={field.value}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {backgrounds.map((backgroundOption) => (
                  <FormItem key={backgroundOption.id}>
                    <FormControl>
                      <RadioGroupItem
                        value={backgroundOption.id}
                        id={backgroundOption.id}
                        className="peer sr-only"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor={backgroundOption.id}
                      className="cursor-pointer"
                    >
                      <Card className="border-2 hover:border-yellow-400 peer-data-[state=checked]:border-yellow-400 transition-all">
                        <CardHeader>
                          <CardTitle>{backgroundOption.name}</CardTitle>
                          <CardDescription>
                            {backgroundOption.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-2">
                            <span className="font-semibold">Feature: </span>
                            {backgroundOption.feature}
                          </div>
                          
                          <div className="mb-4">
                            <span className="font-semibold">Skill Proficiencies: </span>
                            {backgroundOption.skillProficiencies.join(", ")}
                          </div>
                          
                          <div>
                            <span className="font-semibold">Suggested Characteristics:</span>
                            <ul className="list-disc list-inside mt-1 text-sm">
                              {backgroundOption.suggestedCharacteristics.map((trait, index) => (
                                <li key={index}>{trait}</li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            <FormDescription>
              Your character's background represents their life before adventuring.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
