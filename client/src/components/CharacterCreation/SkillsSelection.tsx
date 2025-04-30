
import React, { useState, useEffect } from "react";
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
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredSkills, setFilteredSkills] = useState(allSkills);
  const [error, setError] = useState<string | null>(null);

  const selectedClass = getSelectedClass();
  const maxSkills = selectedClass?.numSkillChoices || 0;
  const skillChoices = selectedClass?.skillChoices || [];
  const selectedSkills = form.watch("skillProficiencies") || [];
  
  // Filter skills based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredSkills(allSkills);
      return;
    }
    
    const filtered = allSkills.filter(skill => 
      skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skill.ability.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredSkills(filtered);
  }, [searchTerm, allSkills]);

  // Validate selection when class changes
  useEffect(() => {
    if (!selectedClass) return;
    
    // Filter out skills not available for the new class
    const validSkills = selectedSkills.filter(skill => 
      skillChoices.includes(skill)
    );
    
    // Update the form if the skills have changed
    if (validSkills.length !== selectedSkills.length) {
      form.setValue("skillProficiencies", validSkills);
      setError("Some skills were removed because they aren't available for your class.");
      
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  }, [selectedClass, form]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}
      
      <div className="bg-gray-800 bg-opacity-50 p-4 rounded-md border border-gray-700 mb-4">
        <h3 className="text-lg font-medium text-yellow-400 mb-2">
          Skill Selection
        </h3>
        <p className="text-gray-300 mb-4">
          Your {selectedClass?.name || "class"} allows you to choose {maxSkills} skills from the list below.
        </p>
        <p className="text-sm text-gray-400">
          Selected: {selectedSkills.length}/{maxSkills}
        </p>
      </div>
      
      <div className="mb-4">
        <Label htmlFor="search-skills">Search Skills</Label>
        <Input
          id="search-skills"
          type="text"
          placeholder="Search by name or ability..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 border-gray-700"
        />
      </div>

      <FormField
        control={form.control}
        name="skillProficiencies"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSkills.map((skill) => {
                    const isAvailable = skillChoices.includes(skill.name);
                    const isSelected = field.value?.includes(skill.name);
                    
                    return (
                      <Card
                        key={skill.name}
                        className={`transition-colors ${
                          !isAvailable 
                            ? "opacity-50" 
                            : isSelected 
                              ? "border-yellow-500 bg-gray-700/50" 
                              : "border-gray-700 hover:bg-gray-700/30"
                        } ${isAvailable ? "cursor-pointer" : ""}`}
                        onClick={() => {
                          if (!isAvailable) return;
                          
                          const currentSkills = [...(field.value || [])];
                          
                          if (isSelected) {
                            // Remove skill
                            field.onChange(
                              currentSkills.filter(s => s !== skill.name)
                            );
                          } else if (currentSkills.length < maxSkills) {
                            // Add skill if under the limit
                            field.onChange([...currentSkills, skill.name]);
                          }
                        }}
                      >
                        <CardHeader className="p-3">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="flex items-center space-x-2">
                              <Checkbox
                                checked={isSelected}
                                disabled={
                                  !isAvailable ||
                                  (field.value?.length >= maxSkills && !isSelected)
                                }
                                onCheckedChange={() => {
                                  if (!isAvailable) return;
                                  
                                  const currentSkills = [...(field.value || [])];
                                  
                                  if (isSelected) {
                                    // Remove skill
                                    field.onChange(
                                      currentSkills.filter(s => s !== skill.name)
                                    );
                                  } else if (currentSkills.length < maxSkills) {
                                    // Add skill if under the limit
                                    field.onChange([...currentSkills, skill.name]);
                                  }
                                }}
                              />
                              <span>{skill.name}</span>
                            </span>
                            <Badge variant="outline">{skill.ability}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-xs text-gray-400">{skill.description}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                  
                  {filteredSkills.length === 0 && (
                    <div className="col-span-2 text-center p-4 text-gray-500">
                      No skills match your search.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </FormControl>
            <FormDescription className="mt-4">
              Select skills based on your class proficiencies.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
