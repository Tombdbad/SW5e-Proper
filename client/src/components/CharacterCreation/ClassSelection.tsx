
import React, { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CLASSES, getClassById, getClassFeaturesByLevel } from "@/lib/sw5e/classes";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import TranslucentPane from "@/components/ui/TranslucentPane";

interface ClassSelectionProps {
  form: any;
  allClasses: any[];
}

export default function ClassSelection({ form, allClasses }: ClassSelectionProps) {
  const { control, watch, setValue, formState: { isValid } } = useFormContext();
  const selectedClass = watch("class");
  const characterLevel = watch("level") || 1;
  
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [optionalFeatures, setOptionalFeatures] = useState<any[]>([]);
  
  const classInfo = getClassById(selectedClass);
  
  // When class or level changes, update the list of optional features
  useEffect(() => {
    if (!selectedClass) return;
    
    const classObject = getClassById(selectedClass);
    if (!classObject) return;
    
    // Get features for the character's level
    const features = getClassFeaturesByLevel(selectedClass, characterLevel);
    
    // Filter for optional features
    const optional = features.filter(feature => 
      feature.optional === true || feature.choices !== undefined
    );
    
    setOptionalFeatures(optional);
    
    // Pre-select mandatory features
    const mandatoryFeatures = features
      .filter(feature => !feature.optional && !feature.choices)
      .map(feature => feature.name);
    
    setValue("classFeatures", mandatoryFeatures);
    setSelectedFeatures(mandatoryFeatures);
    
  }, [selectedClass, characterLevel, setValue]);
  
  // Handle feature selection
  const toggleFeature = (featureName: string) => {
    const updated = selectedFeatures.includes(featureName)
      ? selectedFeatures.filter(f => f !== featureName)
      : [...selectedFeatures, featureName];
    
    setSelectedFeatures(updated);
    setValue("classFeatures", updated);
  };
  
  // Handle feature choice selection
  const selectFeatureChoice = (featureName: string, choiceName: string) => {
    // Remove any previous choice from this feature group
    const feature = optionalFeatures.find(f => f.name === featureName);
    if (!feature) return;
    
    const otherChoices = feature.choices
      .filter((choice: any) => choice.name !== choiceName)
      .map((choice: any) => choice.name);
    
    // Remove other choices from this feature
    const withoutOtherChoices = selectedFeatures.filter(f => !otherChoices.includes(f));
    
    // Add the new choice
    const updated = withoutOtherChoices.includes(choiceName)
      ? withoutOtherChoices.filter(f => f !== choiceName)
      : [...withoutOtherChoices, choiceName];
    
    setSelectedFeatures(updated);
    setValue("classFeatures", updated);
  };

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="class"
        rules={{ required: "Please select a class" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Class</FormLabel>
            <FormControl>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-72">
                    {allClasses.map((classOption) => (
                      <SelectItem key={classOption.id} value={classOption.id}>
                        {classOption.name}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
            {field.value && (
              <div className="mt-4 p-3 bg-black bg-opacity-30 rounded border border-yellow-500/20 text-sm">
                {allClasses.find(c => c.id === field.value)?.description || (
                  <span className="text-yellow-300/50 italic">Select a class to view its description</span>
                )}
              </div>
            )}
          </FormItem>
        )}
      />

      {classInfo && (
        <div className="bg-gray-800 bg-opacity-50 rounded-md p-4">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">{classInfo.name}</h3>
          <p className="text-gray-300 mb-4">{classInfo.summary}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-400">Primary Ability: {classInfo.primaryAbility.join(", ")}</p>
              <p className="text-sm text-gray-400">Hit Die: d{classInfo.hitDie}</p>
              <p className="text-sm text-gray-400">Saving Throws: {classInfo.savingThrows.join(", ")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Armor Proficiencies: {classInfo.armorProficiencies.join(", ")}</p>
              <p className="text-sm text-gray-400">Weapon Proficiencies: {classInfo.weaponProficiencies.join(", ")}</p>
              <p className="text-sm text-gray-400">Skill Choices: Choose {classInfo.numSkillChoices} from {classInfo.skillChoices.join(", ")}</p>
            </div>
          </div>
          
          {optionalFeatures.length > 0 && (
            <TranslucentPane className="p-4 mt-4">
              <h4 className="text-md font-semibold text-yellow-400 mb-2">Class Features</h4>
              <p className="text-sm text-gray-400 mb-3">Select optional features for your character:</p>
              
              {optionalFeatures.map(feature => (
                <div key={feature.name} className="mb-4">
                  <h5 className="text-sm font-medium mb-1">{feature.name}</h5>
                  <p className="text-xs text-gray-400 mb-2">{feature.description}</p>
                  
                  {feature.optional && !feature.choices && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id={`feature-${feature.name}`}
                        checked={selectedFeatures.includes(feature.name)}
                        onCheckedChange={() => toggleFeature(feature.name)}
                      />
                      <Label 
                        htmlFor={`feature-${feature.name}`}
                        className="text-sm cursor-pointer"
                      >
                        Select this feature
                      </Label>
                    </div>
                  )}
                  
                  {feature.choices && (
                    <div className="space-y-2 pl-2 border-l-2 border-gray-700 mt-2">
                      <p className="text-xs text-gray-400">Choose one:</p>
                      {feature.choices.map((choice: any) => (
                        <div key={choice.name} className="flex items-start space-x-2">
                          <Checkbox 
                            id={`choice-${choice.name}`}
                            checked={selectedFeatures.includes(choice.name)}
                            onCheckedChange={() => selectFeatureChoice(feature.name, choice.name)}
                          />
                          <div>
                            <Label 
                              htmlFor={`choice-${choice.name}`}
                              className="text-sm cursor-pointer"
                            >
                              {choice.name}
                            </Label>
                            <p className="text-xs text-gray-400">{choice.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <Separator className="my-3" />
                </div>
              ))}
            </TranslucentPane>
          )}
        </div>
      )}
    </div>
  );
}
