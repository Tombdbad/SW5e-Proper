import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { classes } from "@/lib/sw5e/classes";

export default function ClassSelection({ form }: { form: any }) {
  const handleClassChange = (value: string) => {
    form.setValue("class", value);
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium">Choose your character's class:</div>
      
      <FormField
        control={form.control}
        name="class"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={handleClassChange}
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
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor={classOption.id}
                      className="cursor-pointer"
                    >
                      <Card className="border-2 hover:border-yellow-400 peer-data-[state=checked]:border-yellow-400 transition-all">
                        <CardHeader>
                          <CardTitle>{classOption.name}</CardTitle>
                          <CardDescription>
                            {classOption.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-2">
                            <span className="font-semibold">Hit Die: </span>
                            d{classOption.hitDie}
                          </div>
                          <div className="mb-2">
                            <span className="font-semibold">Saving Throws: </span>
                            {classOption.savingThrows.join(", ")}
                          </div>
                          <div className="mb-4">
                            <span className="font-semibold">Primary Ability: </span>
                            {classOption.primaryAbility}
                          </div>
                          
                          <div>
                            <span className="font-semibold">Class Skills:</span>
                            <div className="grid grid-cols-2 mt-1">
                              {classOption.skills.map((skill) => (
                                <div key={skill} className="flex items-center space-x-2">
                                  <Checkbox id={`${classOption.id}-${skill}`} />
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
