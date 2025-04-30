import React from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "../ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { SKILLS } from "../../lib/sw5e/constants";

interface SkillsSelectionProps {
  form: any;
  allSkills: typeof SKILLS;
  getSelectedClass: () => any;
}

export default function SkillsSelection({
  form,
  allSkills,
  getSelectedClass,
}: SkillsSelectionProps) {
  const selectedClass = getSelectedClass();
  const maxSkills = selectedClass?.numSkillProficiencies || 0;
  const skillChoices = selectedClass?.skillChoices || [];

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="skillProficiencies"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-lg">
              Choose your skills ({maxSkills} available)
            </FormLabel>
            <FormControl>
              <div className="grid grid-cols-2 gap-4">
                {allSkills.map((skill) => {
                  const isAvailable = skillChoices.includes(skill.name);
                  return (
                    <Card
                      key={skill.name}
                      className={!isAvailable ? "opacity-50" : ""}
                    >
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm flex items-center space-x-2">
                          <Checkbox
                            checked={field.value?.includes(skill.name)}
                            onCheckedChange={(checked) => {
                              const currentSkills = field.value || [];
                              if (checked) {
                                if (currentSkills.length < maxSkills) {
                                  field.onChange([
                                    ...currentSkills,
                                    skill.name,
                                  ]);
                                }
                              } else {
                                field.onChange(
                                  currentSkills.filter(
                                    (s: string) => s !== skill.name,
                                  ),
                                );
                              }
                            }}
                            disabled={
                              !isAvailable ||
                              (field.value?.length >= maxSkills &&
                                !field.value?.includes(skill.name))
                            }
                          />
                          <span>
                            {skill.name} ({skill.ability})
                          </span>
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </FormControl>
            <FormDescription>
              Select skills based on your class proficiencies.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
